import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { REQUEST_HELPER, TestBroker, TestRequestError, brokerEnvironment, failingTestLocations, parseTestRequest,
  testBrokerSettings, testEnvArguments } from './test-broker.mjs';
import { autonomousPrompt, autonomousSettings, repairPrompt, sandboxSettings } from './listener.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const auth = 'tests/e2e/auth.spec.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'bb-broker-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const taskDir = path.join(base, 'issue-7');
  await mkdir(path.join(taskDir, 'repo'), { recursive: true });
  return { base, taskDir, runsRoot: path.join(base, 'runs') };
}

function fakeSpawn({ code = 0, summary = '# FAILED summary', result, hold = false } = {}) {
  const calls = [];
  const spawnProcess = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = undefined;
    child.exitCode = null;
    child.signalCode = null;
    calls.push({ command, args, options, child });
    const artifacts = args[args.indexOf('--artifacts') + 1];
    child.finish = async (exit = code) => {
      await mkdir(artifacts, { recursive: true });
      if (summary) await writeFile(path.join(artifacts, 'summary.md'), summary);
      if (result) await writeFile(path.join(artifacts, 'result.json'), JSON.stringify(result));
      child.stdout.emit('data', 'runner output\n');
      child.exitCode = exit;
      child.emit('close', exit, null);
    };
    if (!hold) setImmediate(() => { void child.finish(); });
    return child;
  };
  return { spawnProcess, calls };
}

const broker = (paths, options = {}) => new TestBroker({ taskDir: paths.taskDir, issue: 7, runsRoot: paths.runsRoot,
  pollMs: 10, log: process.env.DEBUG_BROKER ? console.error : undefined, environment: { PATH: '/usr/bin', HOME: '/Users/owner', GITHUB_TOKEN: 'secret', DOCKER_HOST: 'x' },
  ...options });

async function request(paths, id, value) {
  await writeFile(path.join(paths.taskDir, 'test-requests', `${id}.json`),
    typeof value === 'string' ? value : JSON.stringify(value));
}

const result = async (paths, id) =>
  JSON.parse(await readFile(path.join(paths.taskDir, 'test-results', `${id}.json`), 'utf8'));

async function until(check, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { const value = await check(); if (value) return value; } catch { /* not yet */ }
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('test broker settings are opt-in and bounded', () => {
  assert.deepEqual(testBrokerSettings(undefined), { enabled: false, maxRuns: 6 });
  assert.deepEqual(testBrokerSettings({ enabled: true, maxRuns: 3 }), { enabled: true, maxRuns: 3 });
  for (const bad of [null, [], { enabled: 'yes' }, { maxRuns: 0 }, { maxRuns: 21 }, { maxRuns: 1.5 },
    { enabled: true, command: 'sh' }]) {
    assert.throws(() => testBrokerSettings(bad), TestRequestError);
  }
  const taskRoot = '/Users/Shared/t';
  const config = { autonomous: { taskRoot, testBroker: { enabled: true, maxRuns: 4 } } };
  assert.deepEqual(autonomousSettings(config).testBroker, { enabled: true, maxRuns: 4 });
  assert.deepEqual(autonomousSettings({ autonomous: { taskRoot } }).testBroker, { enabled: false, maxRuns: 6 });
  assert.throws(() => autonomousSettings({ autonomous: { taskRoot, testBroker: { enabled: 1 } } }),
    { message: 'invalid_autonomous_config' });
});

test('test requests are validated into an allowlisted argument list', () => {
  assert.deepEqual(parseTestRequest(JSON.stringify({ suite: 'auth-focused', tests: [`${auth}:12`, `${auth}:12`],
    grep: 'venue geofences', repeat: 3 })), { suite: 'auth-focused', grep: 'venue geofences', tests: [`${auth}:12`],
    repeat: 3 });
  assert.deepEqual(parseTestRequest('{"suite":"database"}'), { suite: 'database' });
  const rejected = ['nope', '[]', 'null', '{"suite":"sh"}', '{"suite":"auth-focused"}',
    '{"suite":"auth","grep":"x"}', '{"suite":"db","tests":["tests/e2e/auth.spec.mjs:1"]}',
    '{"suite":"auth-focused","tests":["../../etc/passwd:1"]}', '{"suite":"auth-focused","tests":["tests/e2e/auth.spec.mjs:0"]}',
    '{"suite":"auth-focused","tests":["tests/e2e/auth.spec.mjs:1; rm -rf /"]}',
    '{"suite":"auth-focused","grep":"a\\nb"}', `{"suite":"auth-focused","grep":"${'a'.repeat(201)}"}`,
    '{"suite":"auth-focused","grep":"x","repeat":11}', '{"suite":"auth-focused","grep":"x","repeat":"2"}',
    '{"suite":"db","runner":"host"}', '{"suite":"db","source":"/"}',
    JSON.stringify({ suite: 'auth-focused', tests: Array.from({ length: 21 }, (_, i) => `${auth}:${i + 1}`) })];
  for (const text of rejected) assert.throws(() => parseTestRequest(text), TestRequestError, text);
  assert.deepEqual(testEnvArguments({ suite: 'auth-focused', grep: '--runner host', tests: [`${auth}:5`], repeat: 2 },
    '/t/repo', '/runs/agent/x'), ['run', 'auth-focused', '--grep', '--runner host', '--test', `${auth}:5`,
    '--repeat', '2', '--runner', 'container', '--source', '/t/repo', '--artifacts', '/runs/agent/x']);
});

test('failing Playwright locations are extracted from CI logs', () => {
  const log = [
    '2026-11-04T10:00:00Z   ✘  12 [chromium] › tests/e2e/auth.spec.mjs:4482:1 › owners configure venue (20.1s)',
    '2026-11-04T10:00:00Z   ✘  13 tests/e2e/auth.spec.mjs:7137:1 › draft shifts (3s)',
    '2026-11-04T10:00:01Z   1) [chromium] › tests/e2e/auth.spec.mjs:11547:1 › core pages pass WCAG',
    '  2) [chromium] › tests/e2e/auth.spec.mjs:4482:1 › owners configure venue',
    '  ✓  14 [chromium] › tests/e2e/auth.spec.mjs:20:1 › passes',
    '  ✘  15 [chromium] › tests/e2e/../../secret.spec.mjs:1:1 › ignored',
  ].join('\n');
  assert.deepEqual(failingTestLocations(log), [`${auth}:4482`, `${auth}:7137`, `${auth}:11547`]);
  assert.deepEqual(failingTestLocations(undefined), []);
});

test('the broker environment drops credentials and Docker access', () => {
  const env = brokerEnvironment({ PATH: '/usr/bin', HOME: '/h', GITHUB_TOKEN: 't', GH_TOKEN: 't',
    COPILOT_GITHUB_TOKEN: 't', DOCKER_HOST: 'tcp://x', SUPABASE_ACCESS_TOKEN: 't', NODE_OPTIONS: '--require x',
    BUTTERBOX_TEST_SUPABASE_CLI: '/cli' });
  assert.deepEqual(Object.keys(env).sort(), ['BUTTERBOX_TEST_SUPABASE_CLI', 'HOME', 'PATH']);
  assert.ok(env.PATH.split(':').includes(path.dirname(process.execPath)));
});

test('sandbox and prompts expose only the broker request channel', () => {
  const plain = sandboxSettings('/Users/Shared/t/issue-1', '/Users/owner');
  assert.ok(!JSON.stringify(plain).includes('test-requests'));
  const settings = sandboxSettings('/Users/Shared/t/issue-1', '/Users/owner', undefined, true);
  const fs = settings.sandbox.userPolicy.filesystem;
  assert.ok(fs.readwritePaths.includes('/Users/Shared/t/issue-1/test-requests'));
  assert.ok(!fs.readwritePaths.some(entry => /test-results|\/bin$/.test(entry)));
  assert.ok(fs.readonlyPaths.includes('/Users/Shared/t/issue-1/test-results'));
  assert.ok(fs.readonlyPaths.includes('/Users/Shared/t/issue-1/bin'));
  assert.deepEqual(settings.sandbox.userPolicy.network, plain.sandbox.userPolicy.network);
  const task = { issue: 7, title: 'x', body: 'y', branch: 'b', profile: 'roadmap' };
  assert.match(autonomousPrompt(task, 'rules'), /services are unavailable here/);
  const helper = '/Users/Shared/t/issue-7/bin/request-tests.mjs';
  assert.match(autonomousPrompt(task, 'rules', helper), /node \/Users\/Shared\/t\/issue-7\/bin\/request-tests\.mjs auth-focused/);
  const repair = repairPrompt(task, 'rules', 1, 3, [{ check: 'database', focusedTests: [`${auth}:7137`] }], helper);
  assert.match(repair, /reproduce each failing browser or database test locally/);
  assert.match(repair, /tests\/e2e\/auth\.spec\.mjs:7137/);
  assert.doesNotMatch(repairPrompt(task, 'rules', 1, 3, []), /request-tests/);
});

test('the broker runs a valid request in the container runner and publishes the result', async t => {
  const paths = await fixture(t);
  const { spawnProcess, calls } = fakeSpawn({ code: 1, result: { failures: [{ title: 'a', location: `${auth}:9` }],
    playwright: { passed: 1, failed: 1 } } });
  const subject = broker(paths, { spawnProcess });
  await subject.prepare();
  const helper = await stat(path.join(paths.taskDir, 'bin', 'request-tests.mjs'));
  assert.equal(helper.mode & 0o777, 0o444);
  await request(paths, 'r1', { suite: 'auth-focused', tests: [`${auth}:9`] });
  subject.start();
  const final = await until(async () => { const value = await result(paths, 'r1'); return value.finishedAt && value; });
  assert.equal(final.status, 'failed');
  assert.equal(final.summary, '# FAILED summary');
  assert.deepEqual(final.failures, [{ title: 'a', location: `${auth}:9` }]);
  assert.ok(final.artifacts.startsWith(path.join(paths.runsRoot, 'agent', '')));
  assert.match(path.basename(final.artifacts), /-issue-7-r1$/);
  assert.equal(calls.length, 1);
  const [{ command, args, options }] = calls;
  assert.equal(command, process.execPath);
  assert.ok(args[0].endsWith(path.join('scripts', 'test-env.mjs')));
  assert.deepEqual(args.slice(1, 4), ['run', 'auth-focused', '--test']);
  assert.deepEqual(args.slice(args.indexOf('--runner'), args.indexOf('--runner') + 4),
    ['--runner', 'container', '--source', path.join(paths.taskDir, 'repo')]);
  assert.equal(options.shell, undefined);
  assert.equal(options.env.GITHUB_TOKEN, undefined);
  assert.equal(options.env.DOCKER_HOST, undefined);
  await rm(path.join(paths.taskDir, 'test-requests', 'r1.json'), { force: true });
  assert.deepEqual(await subject.stop(), [{ id: 'r1', suite: 'auth-focused', status: 'failed' }]);
});

test('the broker rejects unsafe or excess requests without running them', async t => {
  const paths = await fixture(t);
  const { spawnProcess, calls } = fakeSpawn({ hold: true });
  const subject = broker(paths, { spawnProcess, maxRuns: 2 });
  await subject.prepare();
  const requests = path.join(paths.taskDir, 'test-requests');
  await request(paths, 'bad-json', '{');
  await request(paths, 'bad-suite', { suite: 'sh', command: 'id' });
  await request(paths, 'large', { suite: 'auth-focused', grep: 'x'.repeat(5000) });
  await writeFile(path.join(paths.base, 'outside.json'), '{"suite":"db"}');
  await symlink(path.join(paths.base, 'outside.json'), path.join(requests, 'linked.json'));
  await mkdir(path.join(requests, 'folder.json'));
  await writeFile(path.join(requests, 'Upper Case.json'), '{"suite":"db"}');
  await request(paths, 'ok1', { suite: 'db' });
  await request(paths, 'ok2', { suite: 'tenant' });
  await request(paths, 'ok3', { suite: 'db' });
  await subject.poll();
  for (const [id, reason] of [['bad-json', /valid JSON/], ['bad-suite', /unknown fields/], ['large', /4 KB/],
    ['linked', /regular file/], ['folder', /regular file/], ['ok3', /run limit of 2/]]) {
    const value = await result(paths, id);
    assert.equal(value.status, 'rejected', id);
    assert.match(value.reason, reason, id);
  }
  assert.equal((await result(paths, 'ok2')).status, 'queued');
  await until(() => calls.length === 1);
  assert.equal((await result(paths, 'ok1')).status, 'running');
  await assert.rejects(stat(path.join(requests, 'Upper Case.json')));
  assert.equal((await readFile(path.join(paths.base, 'outside.json'), 'utf8')), '{"suite":"db"}');
  // A replayed request id is ignored rather than run twice.
  await request(paths, 'ok1', { suite: 'db' });
  await subject.poll();
  await assert.rejects(stat(path.join(requests, 'ok1.json')));
  await calls[0].child.finish(0);
  await until(async () => { await subject.poll(); return calls.length === 2; });
  await calls[1].child.finish(0);
  await until(async () => (await result(paths, 'ok2')).status === 'passed');
  const history = await subject.stop();
  assert.deepEqual(history.filter(entry => entry.status !== 'rejected').map(entry => entry.id), ['ok1', 'ok2']);
  assert.equal(calls.length, 2);
});

test('stopping the broker cancels queued requests and interrupts the running suite', async t => {
  const paths = await fixture(t);
  const { spawnProcess, calls } = fakeSpawn({ hold: true });
  const subject = broker(paths, { spawnProcess, stopGraceMs: 50 });
  await subject.prepare();
  await request(paths, 'first', { suite: 'database' });
  await request(paths, 'second', { suite: 'db' });
  await subject.poll();
  await until(() => calls.length === 1);
  const stopping = subject.stop();
  await calls[0].child.finish(143);
  const history = await stopping;
  assert.equal((await result(paths, 'second')).status, 'cancelled');
  assert.equal((await result(paths, 'first')).status, 'interrupted');
  assert.deepEqual(history.map(entry => `${entry.id}:${entry.status}`).sort(), ['first:interrupted', 'second:cancelled']);
  await request(paths, 'late', { suite: 'db' });
  await subject.poll();
  assert.equal(calls.length, 1);
});

test('preparing the broker clears stale requests and replaces a tampered helper', async t => {
  const paths = await fixture(t);
  const requests = path.join(paths.taskDir, 'test-requests');
  await mkdir(requests, { recursive: true });
  await mkdir(path.join(paths.taskDir, 'bin'), { recursive: true });
  await writeFile(path.join(requests, 'old.json'), '{"suite":"database"}');
  await writeFile(path.join(paths.taskDir, 'bin', 'request-tests.mjs'), 'process.exit(0)');
  const { spawnProcess, calls } = fakeSpawn();
  const subject = broker(paths, { spawnProcess });
  await subject.prepare();
  await subject.poll();
  assert.equal(calls.length, 0);
  assert.equal(await readFile(path.join(paths.taskDir, 'bin', 'request-tests.mjs'), 'utf8'),
    await readFile(REQUEST_HELPER, 'utf8'));
  await subject.stop();
});

test('the agent helper submits a request and reports the final result', async t => {
  const paths = await fixture(t);
  const { spawnProcess } = fakeSpawn({ code: 0, summary: '# PASSED helper summary' });
  const subject = broker(paths, { spawnProcess });
  await subject.prepare();
  subject.start();
  t.after(() => subject.stop());
  const helper = path.join(paths.taskDir, 'bin', 'request-tests.mjs');
  const invalid = spawnSync(process.execPath, [helper, 'auth-focused', '--test'], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /--test needs a value/);
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helper, 'auth-focused', '--grep', 'geofence', '--repeat', '2'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, text }));
  });
  assert.equal(output.code, 0, output.text);
  assert.match(output.text, /submitted: \{"suite":"auth-focused","grep":"geofence","repeat":2\}/);
  assert.match(output.text, /PASSED helper summary/);
  assert.match(output.text, /Artifacts .*issue-7-/);
});

test('the agent helper is self-contained', async () => {
  const source = await readFile(path.join(here, 'request-tests.mjs'), 'utf8');
  for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) assert.match(specifier, /^node:/);
});
