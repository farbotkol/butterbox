import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod, symlink, realpath, mkdir, unlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  OWNER_ID, BRANCH, LABEL, parseTask, originalOwnerTask, GitHub, StateStore, Controller,
  ControllerError, execFile, safeEnvironment, approvedFiles, copilotArguments, codingHome, taskPrompt,
} from './listener.mjs';

const body = '/butterbox run\n\n```json\n{"workstream":"roadmap","task":"Synthetic owner task"}\n```';
const issue = (overrides = {}) => ({
  number: 42, state: 'open', user: { login: 'farbotkol', id: OWNER_ID, type: 'User' },
  labels: [{ name: LABEL }], body, ...overrides,
});
const node = (overrides = {}) => ({
  number: 42, state: 'OPEN', body, lastEditedAt: null,
  author: { login: 'farbotkol', databaseId: OWNER_ID },
  labels: { nodes: [{ name: LABEL }], pageInfo: { hasNextPage: false } }, ...overrides,
});
const rejects = (operation, code) => assert.rejects(operation, error => error.code === code);

async function fixture(t, settings = {}) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'controller-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new StateStore(path.join(directory, 'state'));
  await store.init();
  const cwd = path.join(directory, 'checkout');
  await mkdir(cwd);
  await writeFile(path.join(cwd, 'AGENTS.md'), 'Synthetic instructions only.');
  const config = { profiles: { roadmap: { cwd, branch: BRANCH } } };
  const comments = [];
  const executions = [];
  let taskCalls = 0;
  const github = {
    identity: async () => {},
    issues: async () => [issue()],
    task: async () => { taskCalls++; return parseTask(issue()); },
    comment: async (number, message) => { comments.push({ number, message }); },
    ...settings.github,
  };
  const exec = async (command, args, options) => {
    if (command === 'git') {
      if (args.join(' ') === 'remote get-url origin') return 'https://github.com/farbotkol/butterbox.git';
      if (args.join(' ') === 'rev-parse --show-toplevel') return cwd;
      if (args.join(' ') === 'branch --show-current') return BRANCH;
      if (args.join(' ') === 'rev-parse HEAD') return 'a'.repeat(40);
      return '';
    }
    executions.push({ command, args, options });
    return '';
  };
  const controller = new Controller({
    ...settings, store, config, github, exec: settings.exec ?? exec,
    mode: settings.mode ?? 'synthetic', enabled: settings.enabled ?? true,
  });
  return { directory, store, cwd, config, github, exec, controller, comments, executions,
    taskCalls: () => taskCalls };
}

test('strict owner command binds immutable task fingerprint and accepts both workstreams', () => {
  const task = parseTask(issue());
  assert.equal(task.number, 42);
  assert.match(task.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(task, parseTask(issue({ user: { login: 'FARBOTKOL', id: OWNER_ID, type: 'User' } })));
  assert.equal(parseTask(issue({ body: body.replace('"roadmap"', '"award-central"') })).workstream, 'award-central');
  assert.notEqual(parseTask(issue({ body: body.replace('Synthetic owner task', 'Other task') })).digest, task.digest);
});

test('normal conversation, quotes, bots and malformed task data cannot authorise execution', () => {
  const values = [
    issue({ user: { login: 'attacker', id: OWNER_ID, type: 'User' } }),
    issue({ user: { login: 'farbotkol', id: 1, type: 'User' } }),
    issue({ user: { login: 'farbotkol', id: OWNER_ID, type: 'Bot' } }),
    issue({ user: { login: 'github-actions[bot]' } }),
    issue({ labels: [] }), issue({ state: 'closed' }), issue({ pull_request: {} }),
    issue({ number: '../42' }), issue({ body: null }), issue({ body: 'Please build a feature.' }),
    issue({ body: `Here is an example, not authorisation:\n${body}` }),
    issue({ body: `\`\`\`text\n${body}\n\`\`\`` }),
    issue({ body: `${body}\nMore discussion` }), issue({ body: `${body}\n${body}` }),
    issue({ body: body.replace('"roadmap"', '"unknown"') }),
    issue({ body: body.replace('"roadmap"', '{"toString":0}') }),
    issue({ body: body.replace('"Synthetic owner task"', '""') }),
    issue({ body: body.replace('"Synthetic owner task"', JSON.stringify('x'.repeat(4001))) }),
    issue({ body: body.replace('"Synthetic owner task"', '"test","shell":"echo injected"') }),
  ];
  for (const value of values) assert.equal(parseTask(value), null);
});

test('API provenance rejects every edited body, including non-owner edits of owner issues', () => {
  assert.deepEqual(originalOwnerTask(issue(), node()), parseTask(issue()));
  for (const value of [
    node({ lastEditedAt: '2026-11-04T00:00:00Z' }),
    node({ lastEditedAt: undefined }), node({ body: `${body} ` }),
    node({ author: { login: 'attacker', databaseId: OWNER_ID } }),
    node({ author: { login: 'farbotkol', databaseId: 1 } }),
    node({ author: { login: null } }), node({ state: 'CLOSED' }),
    node({ labels: { nodes: [{ name: LABEL }], pageInfo: { hasNextPage: true } } }),
  ]) assert.equal(originalOwnerTask(issue(), value), null);
});

test('GitHub client pins api.github.com identity and validates REST/GraphQL provenance', async () => {
  const calls = [];
  const github = new GitHub(async (command, args) => {
    calls.push({ command, args });
    const endpoint = args[3];
    if (endpoint === 'user') return JSON.stringify(issue().user);
    if (endpoint === 'graphql') return JSON.stringify({ data: { repository: { issue: node() } } });
    return JSON.stringify(issue());
  });
  await github.identity();
  assert.equal((await github.task(42)).number, 42);
  assert.ok(calls.every(call => call.command === 'gh' &&
    call.args.slice(0, 3).join(' ') === 'api --hostname github.com'));
  await rejects(new GitHub(async () => '{"login":"attacker"}').identity(), 'github_identity_not_owner');
  await rejects(new GitHub(async () => 'not json').identity(), 'invalid_github_response');
});

test('GitHub polling paginates without executing a truncated queue', async () => {
  let calls = 0;
  const github = new GitHub(async () => { calls++; return JSON.stringify(Array(100).fill(issue())); });
  await rejects(github.issues(), 'issue_queue_page_limit');
  assert.equal(calls, 10);
});

test('private ledger is durable, contains no prompt and cannot be replayed after a crash', async t => {
  const { store } = await fixture(t);
  const value = await store.reserve(parseTask(issue()), 'synthetic');
  assert.equal((await store.read(42)).status, 'reserved');
  assert.ok(!(await readFile(store.filename(42), 'utf8')).includes('Synthetic owner task'));
  await rejects(store.recoverRuns(), 'run_requires_local_review');
  assert.equal((await store.read(42)).status, 'interrupted');
  await store.acknowledge(42);
  await store.recoverRuns();
  await assert.rejects(store.reserve(parseTask(issue()), 'synthetic'), { code: 'EEXIST' });
  value.status = 'invalid';
  await store.save(value);
  await rejects(store.read(42), 'invalid_run_ledger');
});

test('global controller lock prevents concurrent processes and cannot steal a live lock', async t => {
  const { store } = await fixture(t);
  const release = await store.acquire();
  await rejects(store.acquire(), 'listener_lock_exists');
  await rejects(store.recoverLock(), 'listener_process_still_running');
  await release();
  const releaseAgain = await store.acquire();
  await releaseAgain();
});

test('state rejects public permissions, symlinks and corrupt JSON', async t => {
  const { store, directory } = await fixture(t);
  await store.reserve(parseTask(issue()), 'synthetic');
  await chmod(store.filename(42), 0o644);
  await rejects(store.read(42), 'insecure_controller_state_permissions');
  await chmod(store.filename(42), 0o600);
  await writeFile(store.filename(42), '{bad');
  await rejects(store.read(42), 'corrupt_controller_state');
  const link = path.join(directory, 'link');
  await symlink(store.directory, link);
  await rejects(new StateStore(link).init(), 'insecure_controller_state_permissions');
});

test('dry-run checks authorisation but never reserves or dispatches a task', async t => {
  const { controller, store, executions } = await fixture(t, { mode: 'dry-run', enabled: false });
  assert.deepEqual(await controller.tick(), { eligible: 1, executed: 0 });
  assert.equal(await store.read(42), null);
  assert.equal(executions.length, 0);
});

test('synthetic task reports queue, progress and completion then never repeats', async t => {
  const { controller, store, executions, comments } = await fixture(t);
  assert.deepEqual(await controller.tick(), { eligible: 1, executed: 1 });
  assert.equal((await store.read(42)).status, 'succeeded');
  assert.equal((await store.read(42)).exitCode, 0);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].command, process.execPath);
  assert.equal(comments.length, 3);
  assert.ok(comments.some(item => item.message.includes('queued')));
  assert.ok(comments.some(item => item.message.includes('running')));
  assert.ok(comments.some(item => item.message.includes('succeeded')));
  assert.ok(comments.every(item => !item.message.includes('Synthetic owner task')));
  assert.deepEqual(await controller.tick(), { eligible: 0, executed: 0 });
});

test('unauthorised tasks and unavailable GitHub API never reserve or execute', async t => {
  const value = await fixture(t, { github: {
    identity: async () => { throw new ControllerError('github_identity_not_owner'); },
  } });
  await rejects(value.controller.tick(), 'github_identity_not_owner');
  assert.equal(await value.store.read(42), null);
  assert.equal(value.executions.length, 0);
});

test('non-owner tasks are ignored and original-body provenance failure blocks execution', async t => {
  const value = await fixture(t, { github: { issues: async () => [issue({ user: { login: 'attacker' } })] } });
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(value.taskCalls(), 0);
  value.github.issues = async () => [issue()];
  value.github.task = async () => { throw new ControllerError('issue_not_original_owner_command'); };
  await rejects(value.controller.tick(), 'issue_not_original_owner_command');
  assert.equal(value.executions.length, 0);
});

test('revocation or task edits immediately before dispatch cannot execute', async t => {
  const value = await fixture(t);
  let calls = 0;
  value.github.task = async () => {
    calls++;
    return parseTask(issue({ body: calls > 1 ? body.replace('Synthetic owner task', 'Edited task') : body }));
  };
  await rejects(value.controller.tick(), 'task_changed_before_execution');
  assert.equal(value.executions.length, 0);
  assert.equal((await value.store.read(42)).status, 'failed');
  await rejects(value.controller.tick(), 'run_requires_local_review');
});

test('dirty tree, wrong branch, malicious origin and unavailable profile fail before reservation', async t => {
  for (const [target, response, code] of [
    ['status --porcelain --untracked-files=all', ' M file', 'dirty_worktree'],
    ['branch --show-current', 'main', 'wrong_workstream_branch'],
    ['remote get-url origin', 'https://attacker.example/farbotkol/butterbox.git', 'unexpected_git_origin'],
  ]) {
    const value = await fixture(t);
    value.controller.exec = async (command, args, opts) =>
      command === 'git' && args.join(' ') === target ? response : value.exec(command, args, opts);
    await rejects(value.controller.tick(), code);
    assert.equal(await value.store.read(42), null);
  }
});

test('report failure before execution is recorded and stops all future tasks until local review', async t => {
  const value = await fixture(t, { github: {
    comment: async () => { throw new ControllerError('github_unavailable'); },
  } });
  await rejects(value.controller.tick(), 'github_unavailable');
  const saved = await value.store.read(42);
  assert.equal(saved.reportingError, 'github_status_report_failed');
  assert.equal(value.executions.length, 0);
  await rejects(value.store.recoverRuns(), 'run_requires_local_review');
});

test('shutdown cancels an executing task, persists interruption and reports without prompt content', async t => {
  const abort = new AbortController();
  const value = await fixture(t, { signal: abort.signal });
  value.controller.exec = async (command, args, opts) => {
    if (command === 'git') return value.exec(command, args, opts);
    abort.abort();
    throw new ControllerError('operation_cancelled');
  };
  await rejects(value.controller.tick(), 'operation_cancelled');
  assert.equal((await value.store.read(42)).status, 'interrupted');
  assert.ok(value.comments.at(-1).message.includes('interrupted'));
});

test('coding cannot be enabled without a separately verified permission gate', async t => {
  const value = await fixture(t);
  assert.throws(() => new Controller({ ...value, mode: 'coding', enabled: true }),
    error => error.code === 'coding_permissions_not_verified');
  assert.throws(() => new Controller({ ...value, mode: 'synthetic', enabled: false }),
    error => error.code === 'execution_not_enabled');
});

test('agent environment and static arguments deny shell, privilege flags and token inheritance', () => {
  const env = safeEnvironment({
    HOME: '/synthetic', PATH: '/usr/bin', GH_TOKEN: 'synthetic-not-a-credential',
    COPILOT_ALLOW_ALL: 'true', BASH_ENV: '/injected', SUPABASE_KEY: 'synthetic',
  }, true);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.COPILOT_ALLOW_ALL, undefined);
  assert.equal(env.BASH_ENV, undefined);
  assert.equal(env.SUPABASE_KEY, undefined);
  const args = copilotArguments('task text $(not executed)', '/synthetic/checkout', ['src/demo.ts']);
  assert.ok(args.includes('--deny-tool=shell'));
  assert.ok(args.includes('--available-tools=view,glob,grep,create,edit'));
  assert.ok(args.includes('--allow-tool=write(/synthetic/checkout/src/demo.ts)'));
  assert.ok(!args.some(arg => ['--allow-all', '--allow-all-tools', '--yolo', '--resume'].includes(arg)));
  for (const files of [['../outside'], ['.env'], ['AGENTS.md'], ['package.json'],
    ['tools/agent-controller/listener.mjs'], ['src/file;echo'], ['src/a', 'src/a']]) {
    assert.throws(() => approvedFiles(files), error => error.code === 'unsafe_approved_file');
  }
});

test('coding home rejects inherited hooks or global permission modes', async t => {
  const { directory } = await fixture(t);
  const home = path.join(directory, 'cli-home');
  await mkdir(home, { mode: 0o700 });
  await writeFile(path.join(home, 'settings.json'), JSON.stringify({
    defaultPermissionMode: 'manual', disableAllHooks: true,
  }), { mode: 0o600 });
  assert.equal(await codingHome(home), home);
  await writeFile(path.join(home, 'mcp-config.json'), '{}', { mode: 0o600 });
  await rejects(codingHome(home), 'unsafe_copilot_home_contents');
});

test('bounded child process uses literal arguments, has deadlines and responds to cancellation', async () => {
  const output = await execFile(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', '$(echo not-run)']);
  assert.equal(output, '$(echo not-run)');
  await rejects(execFile(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 40 }), 'command_timeout');
  await rejects(execFile(process.execPath, ['-e', 'process.stdout.write("x".repeat(1000))'],
    { maxBytes: 10 }), 'command_output_limit');
  const abort = new AbortController();
  const operation = execFile(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { signal: abort.signal });
  abort.abort();
  await rejects(operation, 'operation_cancelled');
  await rejects(execFile('/no/such/synthetic-executable', []), 'command_unavailable');
});

test('edited reserved issues are reported once even if edited content is no longer a command', async t => {
  const value = await fixture(t);
  await value.controller.tick();
  value.github.issues = async () => [issue({ body: 'A revised normal conversation, not an execution command.' })];
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.ok(value.comments.at(-1).message.includes('ignored edited reserved issue'));
  const count = value.comments.length;
  await value.controller.tick();
  assert.equal(value.comments.length, count);
  assert.equal(value.executions.length, 1);
  assert.equal((await value.store.read(42)).status, 'succeeded');
});

test('periodic progress remains content-free and actual failed exit status is retained', async t => {
  const value = await fixture(t, { heartbeatMs: 5 });
  value.controller.exec = async (command, args, opts) => {
    if (command === 'git') return value.exec(command, args, opts);
    await new Promise(resolve => setTimeout(resolve, 30));
    throw new ControllerError('command_exit_7');
  };
  await rejects(value.controller.tick(), 'command_exit_7');
  assert.equal((await value.store.read(42)).exitCode, 7);
  assert.ok(value.comments.some(item => item.message.includes('elapsed=')));
  assert.ok(value.comments.every(item => !item.message.includes('Synthetic owner task')));
});

async function codingFixture(t) {
  const value = await fixture(t);
  for (const name of ['docs/DECISION_LOG.md', 'docs/agent-handoffs/2026-11-04-owner-decisions.md',
    'IMPLEMENTATION_PROGRESS.md']) {
    await mkdir(path.dirname(path.join(value.cwd, name)), { recursive: true });
    await writeFile(path.join(value.cwd, name), 'Synthetic context only.');
  }
  const cli = path.join(value.directory, 'fake-copilot');
  await writeFile(cli, '#!/usr/bin/env node\n', { mode: 0o700 });
  const home = path.join(value.directory, 'cli-home');
  await mkdir(home, { mode: 0o700 });
  await writeFile(path.join(home, 'settings.json'), JSON.stringify({
    defaultPermissionMode: 'manual', disableAllHooks: true,
  }), { mode: 0o600 });
  value.config.copilotPath = cli;
  value.config.copilotHome = home;
  const calls = [];
  const exec = async (command, args, opts) => {
    if (command === 'git') return value.exec(command, args, opts);
    if (args.includes('--version') || args.includes('--help')) assert.ok(args.includes('--no-auto-update'));
    if (args.includes('--version')) return 'GitHub Copilot CLI synthetic-test-version';
    if (args.includes('--help')) return copilotArguments('test', value.cwd, ['src/demo.ts']).join(' ') +
      ' --prompt --allow-tool --deny-tool';
    calls.push({ command, args, opts });
    return 'SYNTHETIC_OUTPUT_MUST_NOT_APPEAR_IN_REPORTS';
  };
  const controller = new Controller({
    github: value.github, store: value.store, config: value.config, exec,
    mode: 'coding', enabled: true, codingVerified: true,
  });
  return { ...value, controller, calls, home, cli, exec };
}

test('coding dispatch requires exact local approval and uses only static restricted arguments', async t => {
  const value = await codingFixture(t);
  await assert.rejects(value.controller.tick(), { code: 'ENOENT' });
  assert.equal(await value.store.read(42), null);
  await value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']);
  await value.controller.tick();
  assert.equal(value.calls.length, 1);
  assert.equal(value.calls[0].opts.env.COPILOT_HOME, value.home);
  assert.ok(value.calls[0].args.includes('--deny-tool=shell'));
  assert.ok(value.calls[0].args.at(-1).includes('Synthetic instructions only.'));
  assert.ok(value.comments.every(comment => !comment.message.includes('SYNTHETIC_OUTPUT')));
  assert.equal((await value.store.read(42)).status, 'succeeded');
});

test('changed CLI, commit or task cannot use an old approval', async t => {
  const value = await codingFixture(t);
  await value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']);
  await writeFile(value.cli, '#!/usr/bin/env node\n// changed binary\n', { mode: 0o700 });
  await rejects(value.controller.tick(), 'copilot_changed_since_approval');
  assert.equal(value.calls.length, 0);
  await rejects(value.controller.approve(42, '0'.repeat(64), ['src/demo.ts']), 'task_digest_changed');
  await writeFile(value.cli, '#!/usr/bin/env node\n', { mode: 0o700 });
  value.controller.exec = async (command, args, opts) =>
    command === 'git' && args.join(' ') === 'rev-parse HEAD' ? 'b'.repeat(40) : value.exec(command, args, opts);
  await rejects(value.controller.tick(), 'local_approval_mismatch');
});

test('coding approval rejects missing executable, ignored secrets and symlink paths', async t => {
  const value = await codingFixture(t);
  value.config.copilotPath = '/no/such/installed/copilot';
  await rejects(value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']), 'copilot_not_installed');
  value.config.copilotPath = value.cli;
  value.controller.exec = async (command, args, opts) =>
    args.includes('--ignored') ? '.env.local' : value.exec(command, args, opts);
  await rejects(value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']),
    'coding_checkout_contains_ignored_files_or_symlinks');
  value.controller.exec = value.exec;
  await symlink(value.directory, path.join(value.cwd, 'src'));
  await rejects(value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']),
    'approved_path_is_symlink');
});

test('crash recovery can acknowledge a reservation without replay and stale lock recovery is explicit', async t => {
  const value = await fixture(t);
  await value.store.reserve(parseTask(issue()), 'synthetic');
  await value.store.acknowledge(42);
  await value.store.recoverRuns();
  assert.equal((await value.store.read(42)).status, 'interrupted');
  const release = await value.store.acquire();
  await writeFile(path.join(value.store.lock, 'owner.json'), JSON.stringify({ pid: 2147483647 }), { mode: 0o600 });
  await value.store.recoverLock();
  await assert.rejects(release(), { code: 'ENOENT' });
  const next = await value.store.acquire();
  await next();
});

test('child deadline terminates descendants, not only the process leader', async t => {
  const value = await fixture(t);
  const filename = path.join(value.directory, 'descendant.pid');
  const source = 'const {spawn}=require("node:child_process"); const fs=require("node:fs");' +
    'const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});' +
    'fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);';
  await rejects(execFile(process.execPath, ['-e', source, filename], { timeoutMs: 300 }), 'command_timeout');
  const pid = Number(await readFile(filename, 'utf8'));
  for (let attempt = 0; attempt < 30; attempt++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  process.kill(pid, 'SIGKILL');
  assert.fail('Descendant remained alive after process-group cancellation.');
});

test('minimal CLI home refuses permissive settings and unknown authentication configuration', async t => {
  const value = await codingFixture(t);
  await writeFile(path.join(value.home, 'config.json'), '{"defaultPermissionMode":"allow-all"}', { mode: 0o600 });
  await rejects(codingHome(value.home), 'unsafe_copilot_auth_config');
  await unlink(path.join(value.home, 'config.json'));
  await writeFile(path.join(value.home, 'settings.json'), '{"defaultPermissionMode":"allow-all","disableAllHooks":true}');
  await rejects(codingHome(value.home), 'unsafe_copilot_settings');
});

test('ChatGPT Action uses owner OAuth, consequential submission and a fixed read-only status query', async () => {
  const spec = JSON.parse(await readFile(new URL('./chatgpt-action.openapi.json', import.meta.url), 'utf8'));
  assert.equal(spec.servers[0].url, 'https://api.github.com');
  assert.equal(spec.paths['/repos/farbotkol/butterbox/issues'].post['x-openai-isConsequential'], true);
  assert.equal(spec.components.securitySchemes.githubOwnerOAuth.type, 'oauth2');
  const query = spec.paths['/graphql'].post.requestBody.content['application/json'].schema.properties.query.enum[0];
  assert.ok(query.startsWith('query('));
  assert.ok(!query.includes('mutation'));
  assert.ok(query.includes('lastEditedAt'));
  assert.deepEqual(Object.keys(spec.paths), ['/user', '/repos/farbotkol/butterbox/issues', '/graphql']);
});

test('Award Central dispatch preserves its branch and project context without switching sessions', async t => {
  const value = await fixture(t);
  const awardIssue = issue({ body: body.replace('"roadmap"', '"award-central"') });
  value.github.issues = async () => [awardIssue];
  value.github.task = async () => parseTask(awardIssue);
  value.config.profiles = { 'award-central': { cwd: value.cwd, branch: 'feature/award-central-foundation' } };
  value.controller.exec = async (command, args, opts) =>
    command === 'git' && args.join(' ') === 'branch --show-current'
      ? 'feature/award-central-foundation' : value.exec(command, args, opts);
  await value.controller.tick();
  assert.equal((await value.store.read(42)).workstream, 'award-central');
  assert.ok(taskPrompt(parseTask(awardIssue), 'Instructions').includes('docs/award-central/IMPLEMENTATION_PROGRESS.md'));
  assert.ok(value.comments[0].message.includes('award-central'));
});

test('continuous listener exits promptly on SIGINT and releases its account-wide lock', async t => {
  const { directory } = await fixture(t);
  const bin = path.join(directory, 'bin');
  const home = path.join(directory, 'home');
  await mkdir(bin); await mkdir(home);
  const listener = fileURLToPath(new URL('./listener.mjs', import.meta.url));
  const checkout = path.resolve(path.dirname(listener), '../..');
  await writeFile(path.join(bin, 'gh'), `#!${process.execPath}\n` +
    `process.stdout.write(JSON.stringify(process.argv[5]==="user"?${JSON.stringify(issue().user)}:[]));\n`,
  { mode: 0o700 });
  await writeFile(path.join(bin, 'git'), `#!${process.execPath}\n` +
    `const args=process.argv.slice(2).join(" ");const values=${JSON.stringify({
      'remote get-url origin': 'https://github.com/farbotkol/butterbox.git',
      'branch --show-current': BRANCH, 'rev-parse --show-toplevel': checkout, 'rev-parse HEAD': 'a'.repeat(40),
    })};process.stdout.write(values[args]||"");\n`, { mode: 0o700 });
  const child = spawn(process.execPath, [listener], {
    env: { PATH: bin, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', data => {
      output += data;
      if (output.includes('Poll complete:')) resolve();
    });
    child.on('exit', code => { if (!output.includes('Poll complete:')) reject(new Error(`Premature exit ${code}`)); });
  });
  await Promise.race([ready, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Listener did not reach a safe poll')), 5000);
    timer.unref();
  })]);
  const exited = new Promise(resolve => child.once('close', resolve));
  child.kill('SIGINT');
  assert.equal(await Promise.race([exited, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Listener failed to shut down')), 5000);
    timer.unref();
  })]), 130);
  await assert.rejects(readFile(path.join(home, '.butterbox-agent-controller/listener.lock/owner.json')), { code: 'ENOENT' });
});

test('CLI rejects duplicate options and conflicting administrative actions before GitHub access', () => {
  const listener = fileURLToPath(new URL('./listener.mjs', import.meta.url));
  for (const [args, code] of [
    [['--once', '--once'], 'duplicate_listener_option'],
    [['--mode', 'synthetic', '--mode', 'coding'], 'duplicate_listener_option'],
    [['--approve', '42', '--acknowledge', '42'], 'conflicting_listener_options'],
    [['--recover-lock', '--acknowledge', '42'], 'conflicting_listener_options'],
    [['--digest', '0'.repeat(64)], 'conflicting_listener_options'],
    [['--file', 'src/demo.ts'], 'conflicting_listener_options'],
  ]) {
    const result = spawnSync(process.execPath, [listener, ...args], {
      env: {}, encoding: 'utf8', timeout: 5000, shell: false,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), code);
  }
});

test('atomic write failure preserves the previous record and removes its private temporary', async t => {
  const { store } = await fixture(t);
  const filename = path.join(store.directory, 'snapshot.json');
  await store.atomic(filename, { safe: 'previous' });
  await assert.rejects(store.atomic(filename, { invalid: 1n }), TypeError);
  assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), { safe: 'previous' });
  assert.ok((await readdir(store.directory)).every(name => !name.startsWith('.write-')));
});

test('checkout changes during running status reporting block dispatch and require local review', async t => {
  const value = await fixture(t);
  let changed = false;
  value.github.comment = async (number, message) => {
    value.comments.push({ number, message });
    if (message.includes('controller: running')) changed = true;
  };
  value.controller.exec = async (command, args, opts) =>
    command === 'git' && args.join(' ') === 'rev-parse HEAD' && changed
      ? 'b'.repeat(40) : value.exec(command, args, opts);
  await rejects(value.controller.tick(), 'checkout_changed_before_execution');
  assert.equal(value.executions.length, 0);
  assert.equal((await value.store.read(42)).status, 'failed');
  await rejects(value.controller.tick(), 'run_requires_local_review');
});
