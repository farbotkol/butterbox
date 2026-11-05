// Controller-side test broker: services test requests from sandboxed autonomous agents by running the trusted,
// allowlisted scripts/test-env.mjs suites in the isolated container runner. Agents never get Docker, localhost,
// databases or a shell outside their sandbox; they only drop small JSON requests and read the results.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, chmod, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_FILE, LOCAL_RUNS_ROOT, SUITES } from '../../scripts/test-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TEST_ENV_SCRIPT = path.join(root, 'scripts', 'test-env.mjs');
export const REQUEST_HELPER = path.join(root, 'tools', 'agent-controller', 'request-tests.mjs');
export const BROKER_SUITES = Object.freeze(Object.keys(SUITES));
const requestName = /^([a-z0-9][a-z0-9-]{0,39})\.json$/;
const testLocation = new RegExp(`^${AUTH_FILE.replaceAll('.', '\\.')}:[1-9]\\d{0,5}$`);
const MAX_REQUEST_BYTES = 4096;
const FINAL = new Set(['passed', 'failed', 'error', 'timeout', 'interrupted', 'rejected', 'cancelled']);
const exitStatus = { 0: 'passed', 1: 'failed', 2: 'rejected', 3: 'error', 124: 'timeout', 130: 'interrupted' };

export class TestRequestError extends Error {}

export function testBrokerSettings(value) {
  if (value === undefined) return { enabled: false, maxRuns: 6 };
  const record = value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!record || Object.keys(value).some(key => !['enabled', 'maxRuns'].includes(key))) {
    throw new TestRequestError('invalid_test_broker_config');
  }
  const settings = { enabled: value.enabled ?? false, maxRuns: value.maxRuns ?? 6 };
  if (typeof settings.enabled !== 'boolean' || !Number.isInteger(settings.maxRuns) || settings.maxRuns < 1 ||
    settings.maxRuns > 20) throw new TestRequestError('invalid_test_broker_config');
  return settings;
}

// Validates an agent's request (untrusted) into test-env arguments; nothing reaches a shell.
export function parseTestRequest(text) {
  let request;
  try { request = JSON.parse(text); } catch { throw new TestRequestError('request is not valid JSON'); }
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new TestRequestError('request must be a JSON object');
  }
  const unknown = Object.keys(request).filter(key => !['suite', 'grep', 'tests', 'repeat'].includes(key));
  if (unknown.length) throw new TestRequestError(`unknown fields: ${unknown.join(', ')}`);
  const { suite, grep, tests = [], repeat } = request;
  if (!BROKER_SUITES.includes(suite)) throw new TestRequestError(`suite must be one of ${BROKER_SUITES.join(', ')}`);
  const focused = suite === 'auth-focused';
  if (grep !== undefined && (!focused || typeof grep !== 'string' || !grep.trim() || grep.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(grep))) {
    throw new TestRequestError('grep must be a single-line pattern of at most 200 characters (auth-focused only)');
  }
  if (!Array.isArray(tests) || tests.length > 20 || (tests.length && !focused) ||
    tests.some(test => typeof test !== 'string' || !testLocation.test(test))) {
    throw new TestRequestError(`tests must list up to 20 ${AUTH_FILE}:<line> locations (auth-focused only)`);
  }
  if (repeat !== undefined && (!focused || !Number.isInteger(repeat) || repeat < 1 || repeat > 10)) {
    throw new TestRequestError('repeat must be a whole number from 1 to 10 (auth-focused only)');
  }
  if (focused && grep === undefined && !tests.length) {
    throw new TestRequestError('auth-focused needs grep and/or tests');
  }
  return { suite, ...(grep !== undefined ? { grep } : {}), ...(tests.length ? { tests: [...new Set(tests)] } : {}),
    ...(repeat !== undefined ? { repeat } : {}) };
}

export function testEnvArguments(request, source, artifacts) {
  return ['run', request.suite,
    ...(request.grep !== undefined ? ['--grep', request.grep] : []),
    ...(request.tests ?? []).flatMap(test => ['--test', test]),
    ...(request.repeat !== undefined ? ['--repeat', String(request.repeat)] : []),
    '--runner', 'container', '--source', source, '--artifacts', artifacts];
}

// Playwright locations from CI logs, offered to repair agents as focused reruns.
export function failingTestLocations(log) {
  const found = new Set();
  const patterns = [/✘\s+\d+\s+(?:\[[^\]]+\]\s+›\s+)?(tests\/e2e\/[\w./-]+\.spec\.mjs):(\d+)/g,
    /(?:^|\s)\d+\)\s+(?:\[[^\]]+\]\s+›\s+)?(tests\/e2e\/[\w./-]+\.spec\.mjs):(\d+)/gm];
  for (const pattern of patterns) {
    for (const match of String(log ?? '').matchAll(pattern)) {
      const location = `${match[1]}:${match[2]}`;
      if (testLocation.test(location)) found.add(location);
    }
  }
  return [...found].slice(0, 20);
}

export function brokerEnvironment(environment = process.env) {
  const kept = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'BUTTERBOX_TEST_SUPABASE_CLI'];
  const env = Object.fromEntries(kept.filter(name => environment[name] !== undefined)
    .map(name => [name, environment[name]]));
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  env.PATH = [...new Set([path.dirname(process.execPath), ...(env.PATH ?? '').split(':').filter(Boolean), ...extra])]
    .join(':');
  return env;
}

async function atomicJson(file, value) {
  const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, file);
}

export class TestBroker {
  constructor({ taskDir, issue, maxRuns = 6, script = TEST_ENV_SCRIPT, helper = REQUEST_HELPER,
    runsRoot = LOCAL_RUNS_ROOT, environment = process.env, spawnProcess = spawn, pollMs = 2_000,
    stopGraceMs = 90_000, log = () => {} }) {
    Object.assign(this, { taskDir, issue, maxRuns, script, helper, runsRoot, environment, spawnProcess, pollMs,
      stopGraceMs, log });
    this.requests = path.join(taskDir, 'test-requests');
    this.results = path.join(taskDir, 'test-results');
    this.bin = path.join(taskDir, 'bin');
    this.queue = [];
    this.seen = new Set();
    this.history = [];
    this.runs = 0;
    this.stopped = false;
  }
  get helperPath() { return path.join(this.bin, 'request-tests.mjs'); }
  async prepare() {
    for (const directory of [this.requests, this.results, this.bin]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
    }
    // The helper is controller-owned and read-only in the sandbox; agents cannot alter what it sends.
    await rm(this.helperPath, { force: true });
    await copyFile(this.helper, this.helperPath);
    await chmod(this.helperPath, 0o444);
    // Requests from an earlier agent invocation are stale.
    for (const name of await readdir(this.requests)) await rm(path.join(this.requests, name), { force: true });
  }
  start() {
    this.timer = setInterval(() => { void this.poll(); }, this.pollMs);
    this.timer.unref?.();
  }
  async poll() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      await this.collect();
      if (!this.current && this.queue.length) this.current = this.execute(this.queue.shift())
        .finally(() => { this.current = undefined; });
    } catch (error) {
      this.log(`test broker poll failed: ${error.message}`);
    } finally {
      this.polling = false;
    }
  }
  async collect() {
    let names;
    try { names = (await readdir(this.requests)).sort(); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const name of names) {
      const id = requestName.exec(name)?.[1];
      const file = path.join(this.requests, name);
      if (!id) {
        if (!name.endsWith('.tmp')) await rm(file, { force: true, recursive: true });
        continue;
      }
      if (this.seen.has(id)) {
        await rm(file, { force: true, recursive: true });
        continue;
      }
      this.seen.add(id);
      let request;
      try {
        const stat = await lstat(file);
        if (!stat.isFile()) throw new TestRequestError('request must be a regular file');
        if (stat.size > MAX_REQUEST_BYTES) throw new TestRequestError('request exceeds 4 KB');
        request = parseTestRequest(await readFile(file, 'utf8'));
        if (this.runs + this.queue.length >= this.maxRuns) {
          throw new TestRequestError(`run limit of ${this.maxRuns} test runs for this agent invocation reached`);
        }
      } catch (error) {
        const reason = error instanceof TestRequestError ? error.message : 'request could not be read';
        await this.publish(id, { status: 'rejected', reason });
        this.history.push({ id, status: 'rejected' });
        continue;
      } finally {
        await rm(file, { force: true, recursive: true });
      }
      this.queue.push({ id, request });
      await this.publish(id, { status: 'queued', request, position: this.queue.length });
    }
  }
  async publish(id, value) {
    await atomicJson(path.join(this.results, `${id}.json`), { id, updatedAt: new Date().toISOString(), ...value });
  }
  async execute({ id, request }) {
    this.runs += 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const artifacts = path.join(this.runsRoot, 'agent', `${stamp}-issue-${this.issue}-${id}`);
    const startedAt = new Date().toISOString();
    await this.publish(id, { status: 'running', request, startedAt, artifacts });
    this.log(`issue #${this.issue}: running ${request.suite} test request ${id}`);
    let tail = '';
    const keep = chunk => { tail = (tail + chunk).slice(-8_000); };
    const outcome = await new Promise(resolve => {
      let child;
      try {
        child = this.spawnProcess(process.execPath, [this.script, ...testEnvArguments(request,
          path.join(this.taskDir, 'repo'), artifacts)], { cwd: path.dirname(path.dirname(this.script)),
          env: brokerEnvironment(this.environment), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        resolve({ code: 3, error: error.message });
        return;
      }
      this.child = child;
      child.stdout?.on('data', keep);
      child.stderr?.on('data', keep);
      child.on('error', error => resolve({ code: 3, error: error.message }));
      child.on('close', (code, signal) => resolve({ code: code ?? (signal ? 130 : 3) }));
    });
    this.child = undefined;
    let summary;
    let result;
    try { summary = (await readFile(path.join(artifacts, 'summary.md'), 'utf8')).slice(0, 30_000); } catch { /**/ }
    try { result = JSON.parse(await readFile(path.join(artifacts, 'result.json'), 'utf8')); } catch { /**/ }
    const status = this.stopped && outcome.code !== 0 ? 'interrupted'
      : exitStatus[outcome.code] ?? 'error';
    const final = { status, exitCode: outcome.code, request, startedAt, finishedAt: new Date().toISOString(),
      artifacts, ...(summary ? { summary } : { output: tail.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '') }),
      ...(result?.failures?.length ? { failures: result.failures.slice(0, 20) } : {}),
      ...(result?.playwright ? { playwright: result.playwright } : {}),
      ...(outcome.error ? { reason: outcome.error } : {}) };
    await this.publish(id, final);
    this.history.push({ id, suite: request.suite, status });
    this.log(`issue #${this.issue}: test request ${id} finished: ${status}`);
  }
  // Stops polling, cancels queued requests and stops a running suite (test-env cleans up on SIGTERM).
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const { id, request } of this.queue.splice(0)) {
      await this.publish(id, { status: 'cancelled', request, reason: 'the agent invocation ended' }).catch(() => {});
      this.history.push({ id, suite: request.suite, status: 'cancelled' });
    }
    const child = this.child;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
      const deadline = Date.now() + this.stopGraceMs;
      while (this.child && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
      if (this.child) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }
    }
    await this.current?.catch(() => {});
    return this.history;
  }
}

export const finalStatus = status => FINAL.has(status);
