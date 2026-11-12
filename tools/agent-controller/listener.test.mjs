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
  autonomousSettings, autonomousArguments, autonomousEnvironment, sandboxSettings, taskBranch,
  classifyCommandFailure, redactDiagnostics,
} from './listener.mjs';

const body = '/butterbox run\n\n```json\n{"workstream":"roadmap","task":"Synthetic owner task"}\n```';
const issue = (overrides = {}) => ({
  number: 42, state: 'open', user: { login: 'farbotkol', id: OWNER_ID, type: 'User' },
  assignees: [{ login: 'Copilot' }], labels: [{ name: LABEL }], body, ...overrides,
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
  const closures = [];
  const executions = [];
  let taskCalls = 0;
  const github = {
    identity: async () => {},
    issues: async () => [issue()],
    task: async () => { taskCalls++; return parseTask(issue()); },
    comment: async (number, message) => { comments.push({ number, message }); },
    closeCompleted: async (number) => { closures.push(number); },
    dependencyMerged: async () => true,
    assertNoOpenConflicts: async () => {},
    reservationState: async (lease, local) => local?.pushed || local?.pullRequest
      ? { verified: true, branchExists: true } : { verified: true, safeCancellation: true },
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
  return { directory, store, cwd, config, github, exec, controller, comments, closures, executions,
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

test('pre-dispatch PR scan rejects an overlapping direct PR and permits a disjoint area', async () => {
  let changedPath = 'src/app/roster/page.tsx';
  const github = new GitHub(async (_command, args) => {
    const endpoint = args[3];
    if (endpoint.startsWith('repos/farbotkol/butterbox/git/matching-refs/')) return '[]';
    if (endpoint === 'repos/farbotkol/butterbox/pulls') return JSON.stringify([{
      number: 73, state: 'open', base: { ref: 'copilot/Development' },
      head: { sha: 'b'.repeat(40), ref: 'copilot/manual-assignment', repo: { full_name: 'farbotkol/butterbox' } },
      user: { login: 'Copilot' }, body: '',
    }]);
    if (endpoint.startsWith('repos/farbotkol/butterbox/pulls/73/files')) {
      return JSON.stringify([{ filename: changedPath }]);
    }
    return '[]';
  });
  const task = { number: 42, digest: 'a'.repeat(64), components: ['application:roster'] };
  await rejects(github.assertNoOpenConflicts(task), 'component_conflict_open_pull_request');
  changedPath = 'src/app/reports/page.tsx';
  await github.assertNoOpenConflicts(task);
});

test('autonomous preflight requires current Copilot assignment and verified dependencies', async t => {
  const { controller } = await fixture(t, { github: { dependencyMerged: async number => number === 19 } });
  controller.mode = 'autonomous';
  const task = parseTask(issue());
  await controller.dispatchPreflight({ ...task, dependsOn: [19] }, null);
  await rejects(controller.dispatchPreflight({ ...task, dependsOn: [20] }, null),
    'dependency_not_merged_and_verified');
  await rejects(controller.dispatchPreflight({ ...task, assignees: ['farbotkol'] }, null),
    'issue_assignment_not_ready');
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
  await rejects(codingHome(value.home), 'unsafe_copilot_config');
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

test('successful synthetic execution closes its issue exactly once and skips replay', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.controller.tick(), { eligible: 1, executed: 1 });
  assert.deepEqual(f.closures, [42]);
  assert.equal((await f.store.read(42)).status, 'succeeded');
  assert.deepEqual(await f.controller.tick(), { eligible: 0, executed: 0 });
  // Fixture reports the issue still open, so the following poll retries only closure,
  // not task execution (normal GitHub will stop returning the closed issue).
  assert.deepEqual(f.closures, [42, 42]);
  assert.equal(f.executions.length, 1);
});

test('failed or interrupted execution never closes a GitHub issue', async t => {
  const f = await fixture(t, { exec: async (command, args, opts) => {
    if (command === 'git') return args.join(' ') === 'remote get-url origin'
      ? 'https://github.com/farbotkol/butterbox.git'
      : args.join(' ') === 'rev-parse --show-toplevel'
        ? opts.cwd
        : args.join(' ') === 'branch --show-current' ? BRANCH
          : args.join(' ') === 'rev-parse HEAD' ? 'a'.repeat(40) : '';
    throw new Error('synthetic failure');
  } });
  await assert.rejects(() => f.controller.tick());
  assert.equal((await f.store.read(42)).status, 'failed');
  assert.deepEqual(f.closures, []);
});

test('GitHub closure failure never replays completed work and allows later retry', async t => {
  let attempts = 0;
  const f = await fixture(t, { github: {
    closeCompleted: async () => { attempts++; if (attempts === 1) throw new Error('offline'); },
  } });
  assert.deepEqual(await f.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal((await f.store.read(42)).status, 'succeeded');
  assert.equal((await f.store.read(42)).closeError, 'github_issue_close_failed');
  assert.deepEqual(await f.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(attempts, 2);
  assert.equal((await f.store.read(42)).closeError, undefined);
  assert.equal(f.executions.length, 1);
});

test('GitHub closeCompleted uses bounded API update and verifies closed state', async () => {
  const commands = [];
  const api = new GitHub(async (_command, args) => {
    commands.push(args);
    return JSON.stringify({ state: 'closed' });
  });
  await api.closeCompleted(42);
  assert.deepEqual(commands[0], [
    'api', '--hostname', 'github.com', 'repos/farbotkol/butterbox/issues/42',
    '--method', 'PATCH', '-f', 'state=closed', '-f', 'state_reason=completed'
  ]);
  assert.ok(commands[0].includes('state_reason=completed'));
});

// Layout observed on the owner's Apple Silicon Mac after `copilot login` and a restricted prompt run
// with Copilot CLI 1.0.105 (values synthetic; structure, comments, modes and key names as observed).
async function observedCopilotHome(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'copilot-home-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const checkout = path.join(root, 'checkout');
  await mkdir(home, { mode: 0o700 });
  await writeFile(path.join(home, 'config.json'), '// User settings belong in settings.json.\n' +
    '// This file is managed automatically.\n' + JSON.stringify({
      firstLaunchAt: '2026-11-04T10:43:00.000Z', appTipShown: true, reasoningSummariesCleanupDone: true,
      trustedFolders: [checkout],
    }, null, 2) + '\n', { mode: 0o600 });
  await writeFile(path.join(home, 'settings.json'), JSON.stringify({
    defaultPermissionMode: 'manual', disableAllHooks: true, bashEnv: false,
  }, null, 2), { mode: 0o600 });
  for (const name of ['command-history-state.json', 'open-sessions-state.json']) {
    await writeFile(path.join(home, name), '{}', { mode: 0o600 });
  }
  for (const name of ['config.json.trusted-folders.lock', 'installed-plugins.lock', 'settings.json.lock']) {
    await writeFile(path.join(home, name), '', { mode: 0o600 });
  }
  for (const name of ['session-store.db', 'session-store.db-shm', 'session-store.db-wal']) {
    await writeFile(path.join(home, name), 'synthetic', { mode: 0o644 });
    await chmod(path.join(home, name), 0o644);
  }
  for (const name of ['ide', 'installed-plugins', 'servers', 'logs', 'sidebar-sessions-state',
    'session-state/.session-operation-locks']) {
    await mkdir(path.join(home, name), { recursive: true, mode: 0o700 });
  }
  await writeFile(path.join(home, 'logs', 'process-1.log'), 'synthetic', { mode: 0o600 });
  return { root, home, checkout };
}

test('coding home accepts the observed Copilot CLI 1.0.105 layout without modifying it', async t => {
  const { home, checkout } = await observedCopilotHome(t);
  const before = (await readdir(home)).sort();
  const settings = await readFile(path.join(home, 'settings.json'), 'utf8');
  const config = await readFile(path.join(home, 'config.json'), 'utf8');
  assert.equal(await codingHome(home, [checkout]), home);
  assert.equal(await codingHome(home), home);
  assert.deepEqual((await readdir(home)).sort(), before);
  assert.equal(await readFile(path.join(home, 'settings.json'), 'utf8'), settings);
  assert.equal(await readFile(path.join(home, 'config.json'), 'utf8'), config);
  await unlink(path.join(home, 'config.json'));
  assert.equal(await codingHome(home, [checkout]), home);
});

test('coding home still rejects MCP servers, plugins, hooks, IDE bridges and unsafe entries', async t => {
  const cases = [
    ['mcp-config.json', home => writeFile(path.join(home, 'mcp-config.json'), '{"mcpServers":{}}', { mode: 0o600 })],
    ['hooks', home => mkdir(path.join(home, 'hooks'), { mode: 0o700 })],
    ['agents', home => mkdir(path.join(home, 'agents'), { mode: 0o700 })],
    ['skills', home => mkdir(path.join(home, 'skills'), { mode: 0o700 })],
    ['plugin', home => mkdir(path.join(home, 'installed-plugins', 'example'), { mode: 0o700 })],
    ['server', home => writeFile(path.join(home, 'servers', 'server.json'), '{}', { mode: 0o600 })],
    ['ide', home => writeFile(path.join(home, 'ide', '1234.lock'), '{}', { mode: 0o600 })],
    ['symlink', async home => {
      await unlink(path.join(home, 'session-store.db'));
      await symlink('/etc/hosts', path.join(home, 'session-store.db'));
    }],
    ['writable', home => chmod(path.join(home, 'session-store.db'), 0o666)],
    ['wrong type', async home => {
      await unlink(path.join(home, 'installed-plugins.lock'));
      await mkdir(path.join(home, 'installed-plugins.lock'), { mode: 0o700 });
    }],
  ];
  for (const [, mutate] of cases) {
    const { home, checkout } = await observedCopilotHome(t);
    await mutate(home);
    await rejects(codingHome(home, [checkout]), 'unsafe_copilot_home_contents');
  }
});

test('coding home rejects unsafe 1.0.105 settings, config keys, comments and broad trusted folders', async t => {
  const settings = [
    { defaultPermissionMode: 'manual', disableAllHooks: true, bashEnv: true },
    { defaultPermissionMode: 'allow-all', disableAllHooks: true, bashEnv: false },
    { defaultPermissionMode: 'manual', disableAllHooks: false },
    { defaultPermissionMode: 'manual', disableAllHooks: true, allowedTools: ['shell'] },
  ];
  for (const value of settings) {
    const { home, checkout } = await observedCopilotHome(t);
    await writeFile(path.join(home, 'settings.json'), JSON.stringify(value));
    await rejects(codingHome(home, [checkout]), 'unsafe_copilot_settings');
  }
  const header = '// This file is managed automatically.\n';
  const configs = [
    header + '{"allowedTools":["shell"]}',
    header + '{"mcpServers":{"x":{"command":"node"}}}',
    header + '{"appTipShown":"yes"}',
    header + '{"trustedFolders":"/"}',
    '/* block */ {"appTipShown":true}',
    header + '{"appTipShown":true} // trailing',
    '{"appTipShown":true}\n// trailing',
  ];
  for (const text of configs) {
    const { home, checkout } = await observedCopilotHome(t);
    await writeFile(path.join(home, 'config.json'), text);
    await rejects(codingHome(home, [checkout]), 'unsafe_copilot_config');
  }
  const { root } = await observedCopilotHome(t);
  for (const folders of [['/'], [os.homedir()], [path.dirname(os.homedir())], [root], ['relative/path'],
    [`${root}/../escape`]]) {
    const { home, checkout } = await observedCopilotHome(t);
    await writeFile(path.join(home, 'config.json'), header + JSON.stringify({ trustedFolders: folders }));
    await rejects(codingHome(home, [checkout, path.join(root, 'checkout')]), 'unsafe_copilot_trusted_folder');
  }
});

test('coding dispatch accepts an observed 1.0.105 home but rejects checkout MCP, agent or skill configuration', async t => {
  const value = await codingFixture(t);
  const observed = await observedCopilotHome(t);
  await rm(value.home, { recursive: true });
  await (await import('node:fs/promises')).cp(observed.home, value.home, { recursive: true });
  await value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']);
  for (const name of ['.mcp.json', '.github/agents', '.github/skills', '.vscode/mcp.json']) {
    await mkdir(path.dirname(path.join(value.cwd, name)), { recursive: true });
    await writeFile(path.join(value.cwd, name), '{}');
    await rejects(value.controller.approve(42, parseTask(issue()).digest, ['src/demo.ts']),
      'coding_checkout_has_cli_configuration');
    await rm(path.join(value.cwd, name), { recursive: true });
  }
  await value.controller.tick();
  assert.equal(value.calls.length, 1);
  assert.equal(value.calls[0].opts.env.COPILOT_HOME, value.home);
  for (const flag of ['--disable-builtin-mcps', '--deny-tool=shell', '--no-bash-env',
    '--available-tools=view,glob,grep,create,edit']) assert.ok(value.calls[0].args.includes(flag));
});

const gitEnv = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
const sh = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, env: { ...process.env, ...gitEnv }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

// Real git against a local bare "GitHub" remote, a fake Copilot agent and a fake gh; no network or credentials.
async function autonomousFixture(t, { agent = async cwd => writeFile(path.join(cwd, 'feature.txt'), 'done\n'),
  version = 'GitHub Copilot CLI 1.0.105.', github = {}, signal, keepSucceeded, autoMerge, autonomous = {},
  retryBaseMs = 0,
  checks = async () => [{ name: 'verify', done: true, ok: true, result: 'success' }] } = {}) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'controller-auto-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const remote = path.join(directory, 'remote.git');
  const seed = path.join(directory, 'seed');
  const profile = path.join(directory, 'profile');
  sh(directory, 'init', '--quiet', '--bare', '-b', BRANCH, remote);
  await mkdir(seed);
  sh(seed, 'init', '--quiet', '-b', BRANCH);
  await writeFile(path.join(seed, 'AGENTS.md'), 'Synthetic instructions only.');
  sh(seed, 'add', '.'); sh(seed, 'commit', '--quiet', '-m', 'seed');
  sh(seed, 'push', '--quiet', remote, BRANCH);
  sh(directory, 'clone', '--quiet', '--branch', BRANCH, remote, profile);
  sh(profile, 'remote', 'set-url', 'origin', 'https://github.com/farbotkol/butterbox.git');
  const copilot = path.join(directory, 'copilot');
  await writeFile(path.join(copilot), '#!/bin/sh\nexit 1\n');
  await chmod(copilot, 0o755);
  const store = new StateStore(path.join(directory, 'state'));
  await store.init();
  const taskRoot = path.join(directory, 'tasks');
  const comments = []; const closures = []; const prs = []; const agents = [];
  const help = ['--available-tools', '--allow-tool', '--deny-tool', '--no-auto-update', '--no-custom-instructions',
    '--disable-builtin-mcps', '--disallow-temp-dir', '--no-bash-env', '--no-ask-user', '--log-level', '--stream',
    '--prompt'].join(' ');
  const exec = async (command, args, options = {}) => {
    if (command === copilot) {
      if (args.includes('--version')) return version;
      if (args.includes('--help')) return help;
      const settings = JSON.parse(await readFile(path.join(options.env.COPILOT_HOME, 'settings.json'), 'utf8'));
      agents.push({ args, options, settings });
      return String((await agent(options.cwd, options, args)) ?? 'Agent summary: changed files, tests passed.');
    }
    if (command === 'gh') { prs.push({ args, options }); pr.created = true; pr.branch = args[args.indexOf('--head') + 1]; return 'https://github.com/farbotkol/butterbox/pull/77'; }
    if (command === 'git') {
      const index = args.indexOf('set-url');
      if (index > -1) args = [...args.slice(0, index + 2), remote];
      return execFile('git', args, { ...options, env: { ...safeEnvironment(), ...gitEnv } });
    }
    throw new Error(`unexpected command ${command}`);
  };
  const labels = []; const unlabels = []; const merges = []; const deleted = []; const checkCalls = []; const reruns = []; const logs = [];
  const head = () => sh(remote, 'rev-parse', pr.branch ?? taskBranch(parseTask(issue())));
  const remoteHead = branch => {
    const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
      { cwd: remote, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const pr = { merged: false, created: false };
  const pullRequest = number => ({ number, html_url: `https://github.com/farbotkol/butterbox/pull/${number}`,
    state: pr.merged ? 'closed' : 'open', merged: pr.merged,
    mergeable: true, merge_commit_sha: pr.merged ? 'c'.repeat(40) : null,
    base: { ref: BRANCH }, head: { ref: pr.branch ?? taskBranch(parseTask(issue())), sha: head() } });
  const githubClient = {
    identity: async () => {}, issues: async () => [issue()], task: async () => parseTask(issue()),
    comment: async (number, message) => { comments.push(message); },
    findComment: async (number, marker) => comments.some(text => text.includes(marker)),
    closeCompleted: async number => { closures.push(number); },
    labelBlocked: async number => { labels.push(number); },
    unlabelBlocked: async number => { unlabels.push(number); },
    checks: async sha => { checkCalls.push(sha); return checks(sha, checkCalls.length); },
    pullRequest: async number => pullRequest(number),
    branchHead: async branch => remoteHead(branch),
    pullRequestForBranch: async branch => pr.created && pr.branch === branch ? pullRequest(77) : null,
    failedJobLog: async id => { logs.push(id); return `job ${id}\tRun tests\t2026-11-04T00:00:00.0000000Z \u001b[31mexpected 1 got 2\u001b[0m`; },
    rerunFailedJobs: async id => { reruns.push(id); },
    merge: async (number, sha) => { merges.push({ number, sha }); pr.merged = true; return 'c'.repeat(40); },
    contains: async () => true,
    deleteBranch: async branch => { deleted.push(branch); }, ...github,
  };
  const config = { profiles: { roadmap: { cwd: profile, branch: BRANCH } }, copilotPath: copilot,
    autonomous: { taskRoot, ...autonomous, ...(keepSucceeded === undefined ? {} : { keepSucceeded }),
      ...(autoMerge === undefined ? {} : { autoMerge }) } };
  const controller = new Controller({ github: githubClient, store, config, exec, mode: 'autonomous', enabled: true,
    autonomousEnabled: true, signal, checksPollMs: 1, checksGraceMs: 0, retryBaseMs });
  return { directory, remote, profile, taskRoot, store, controller, comments, closures, prs, agents, config, exec,
    github: githubClient, task: parseTask(issue()), labels, unlabels, merges, deleted, checkCalls, pr, head, reruns, logs,
    copilot, remoteHead };
}

test('autonomous mode needs both execution gates and a task root outside the home folder', async t => {
  const value = await autonomousFixture(t);
  const options = { github: value.github, store: value.store, config: value.config, exec: value.exec, mode: 'autonomous' };
  assert.throws(() => new Controller(options), error => error.code === 'execution_not_enabled');
  assert.throws(() => new Controller({ ...options, enabled: true }), error => error.code === 'autonomous_mode_not_enabled');
  assert.throws(() => new Controller({ ...options, enabled: true, autonomousEnabled: true,
    config: { ...value.config, autonomous: undefined } }), error => error.code === 'autonomous_config_required');
  for (const autonomous of [{ taskRoot: path.join(os.homedir(), 'tasks') }, { taskRoot: os.homedir() },
    { taskRoot: '/' }, { taskRoot: '/Users/Shared' }, { taskRoot: 'relative' }, { taskRoot: '/x/../y' },
    { taskRoot: '/Users/Shared/t', timeoutMinutes: 1 }, { taskRoot: '/Users/Shared/t', maxAiCredits: 5 },
    { taskRoot: '/Users/Shared/t', maxConcurrentTasks: 0 },
    { taskRoot: '/Users/Shared/t', maxConcurrentTasks: 5 },
    { taskRoot: '/Users/Shared/t', model: 'bad model' }, { taskRoot: '/Users/Shared/t', allowAll: true }]) {
    assert.throws(() => autonomousSettings({ autonomous }), error => error.code === 'invalid_autonomous_config');
  }
  assert.equal(autonomousSettings({ autonomous: { taskRoot: '/Users/Shared/t' } }).timeoutMinutes, 45);
  assert.equal(autonomousSettings({ autonomous: { taskRoot: '/Users/Shared/t' } }).maxConcurrentTasks, 2);
});

test('autonomous invocation is sandboxed, credential-free and never grants all paths or URLs', () => {
  const settings = sandboxSettings('/Users/Shared/t/issue-1', '/Users/owner');
  assert.equal(settings.sandbox.enabled, true);
  assert.equal(settings.sandbox.allowBypass, false);
  assert.deepEqual(settings.sandbox.auth, { git: false, gh: false });
  assert.equal(settings.sandbox.allowDevToolAccess, false);
  assert.ok(settings.sandbox.userPolicy.filesystem.deniedPaths.includes('/Users/owner'));
  assert.deepEqual(settings.sandbox.userPolicy.filesystem.readonlyPaths, ['/Users/Shared/t/issue-1/repo/.git']);
  assert.equal(settings.sandbox.userPolicy.network.allowLocalNetwork, false);
  // An empty allowlist would mean unrestricted egress; untrusted issue text must not reach arbitrary hosts.
  assert.deepEqual(settings.sandbox.userPolicy.network.allowedHosts, ['registry.npmjs.org']);
  assert.deepEqual(settings.sandbox.userPolicy.network.blockedHosts, ['localhost', '127.0.0.1', '::1']);
  assert.deepEqual(sandboxSettings('/Users/Shared/t/issue-1', '/Users/owner', ['registry.npmjs.org', '*.example.com'])
    .sandbox.userPolicy.network.allowedHosts, ['registry.npmjs.org', '*.example.com']);
  for (const hosts of [[], undefined, null, '*', ['*'], ['*.com'], ['1.1.1.1'], ['localhost'], ['::1'],
    ['printer.local'], ['db.internal'], ['https://registry.npmjs.org'], ['registry.npmjs.org:443'],
    ['Registry.NPMJS.org'], ['registry.npmjs.org', 'registry.npmjs.org'], ['a..b.com'], ['-x.example.com']]) {
    assert.throws(() => sandboxSettings('/Users/Shared/t/issue-1', '/Users/owner', hosts ?? []),
      error => error.code === 'invalid_autonomous_config', JSON.stringify(hosts));
    if (hosts !== undefined) {
      assert.throws(() => autonomousSettings({ autonomous: { taskRoot: '/Users/Shared/t', allowedHosts: hosts } }),
        error => error.code === 'invalid_autonomous_config', JSON.stringify(hosts));
    }
  }
  assert.deepEqual(autonomousSettings({ autonomous: { taskRoot: '/Users/Shared/t' } }).allowedHosts, ['registry.npmjs.org']);
  assert.equal(settings.sandbox.userPolicy.seatbelt.keychainAccess, false);
  const args = autonomousArguments('prompt', { maxAiCredits: 50, model: 'm' });
  for (const flag of ['--allow-all', '--yolo', '--allow-all-paths', '--allow-all-urls']) assert.ok(!args.includes(flag));
  for (const flag of ['--allow-all-tools', '--disable-builtin-mcps', '--no-custom-instructions', '--disallow-temp-dir',
    '--excluded-tools=web_fetch', '--deny-tool=shell(git push)', '--deny-tool=shell(gh)']) assert.ok(args.includes(flag));
  assert.deepEqual(args.slice(args.indexOf('--max-ai-credits'), args.indexOf('--max-ai-credits') + 2), ['--max-ai-credits', '50']);
  const env = autonomousEnvironment('/Users/Shared/t/issue-1', { PATH: '/bin', HOME: '/Users/owner', GH_TOKEN: 'secret',
    GITHUB_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', GH_CONFIG_DIR: '/x' });
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'GH_CONFIG_DIR']) assert.equal(env[key], undefined);
  assert.equal(env.COPILOT_HOME, '/Users/Shared/t/issue-1/copilot-home');
  assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null');
});

test('autonomous success waits for green CI, squash-merges the exact commit, then closes and never replays', async t => {
  const value = await autonomousFixture(t, { checks: async (sha, call) => call === 1
    ? [{ name: 'verify', done: false, ok: false, result: 'in_progress' }]
    : [{ name: 'verify', done: true, ok: true, result: 'success' }, { name: 'database', done: true, ok: true, result: 'success' }] });
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  const branch = taskBranch(value.task);
  assert.match(branch, /^agent\/issue-42-[a-f0-9]{8}$/);
  assert.equal(sh(value.remote, 'show', `${branch}:feature.txt`), 'done');
  assert.match(sh(value.remote, 'log', '-1', '--format=%B', branch), /Refs #42/);
  assert.equal(sh(value.remote, 'rev-list', '--count', BRANCH), '1');
  assert.equal(value.agents.length, 1);
  const call = value.agents[0];
  assert.ok(call.options.cwd.startsWith(value.taskRoot));
  assert.ok(call.settings.sandbox.userPolicy.filesystem.deniedPaths.includes(os.homedir()));
  assert.deepEqual(call.settings.sandbox.userPolicy.network.allowedHosts, ['registry.npmjs.org']);
  assert.deepEqual(call.settings.sandbox.userPolicy.network.blockedHosts, ['localhost', '127.0.0.1', '::1']);
  assert.equal(call.options.env.GH_TOKEN, undefined);
  const pr = value.prs[0].args;
  assert.ok(!pr.includes('--draft'));
  assert.equal(pr[pr.indexOf('--base') + 1], BRANCH);
  assert.equal(pr[pr.indexOf('--head') + 1], branch);
  assert.match(pr[pr.indexOf('--body') + 1], /^Refs #42/);
  const commit = value.head();
  assert.ok(value.checkCalls.length >= 2 && value.checkCalls.every(sha => sha === commit));
  assert.deepEqual(value.merges, [{ number: 77, sha: commit }]);
  assert.deepEqual(value.deleted, [branch]);
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.mergeVerified, true);
  assert.equal(ledger.mergeCommit, 'c'.repeat(40));
  assert.deepEqual(ledger.checks, ['verify: success', 'database: success']);
  assert.match(value.comments.at(-1), /completed #42\. Pull request https:\/\/github.com\/farbotkol\/butterbox\/pull\/77 passed every CI check/);
  assert.match(value.comments.at(-1), /- database: success/);
  assert.deepEqual(value.closures, [42]);
  assert.deepEqual(value.labels, []);
  assert.deepEqual(await readdir(value.taskRoot), []);
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(value.agents.length, 1);
  assert.equal(value.merges.length, 1);
});

test('autonomous autoMerge false keeps the draft-only review flow and never merges or closes', async t => {
  const value = await autonomousFixture(t, { autoMerge: false });
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.ok(value.prs[0].args.includes('--draft'));
  assert.deepEqual(value.merges, []);
  assert.deepEqual(value.checkCalls, []);
  assert.match(value.comments.at(-1), /draft pull request https:\/\/github.com\/farbotkol\/butterbox\/pull\/77/);
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.deepEqual(value.closures, []);
});

async function assertBlocked(value, code, { pushed = false, agents = 1, exhausted = false } = {}) {
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'failed');
  assert.equal(ledger.error, code);
  assert.equal(ledger.blockedReported, true);
  assert.equal(ledger.final, true);
  assert.deepEqual(value.labels, [42]);
  assert.deepEqual(value.closures, []);
  assert.match(value.comments.at(-1), new RegExp(`blocked #42; failed: ${code}.*The issue stays open`));
  assert.match(value.comments.at(-1), exhausted ? /Automatic recovery is exhausted/ : /not safe to retry automatically/);
  assert.match(value.comments.at(-1), /Other issues continue/);
  assert.match(value.comments.at(-1), /<!-- butterbox-report:[0-9a-f-]{36} -->$/);
  if (!pushed) assert.equal(sh(value.remote, 'branch', '--list', 'agent/*'), '');
  assert.ok(ledger.history.some(entry => entry.event === 'blocked'));
  // A blocked task never stops the queue and is never replayed.
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(value.agents.length, agents);
  assert.deepEqual(value.labels, [42]);
  return ledger;
}

for (const [name, agent, code] of [
  ['no changes', async () => 'nothing to do', 'no_changes_produced'],
  ['workflow change', async cwd => { await mkdir(path.join(cwd, '.github/workflows'), { recursive: true });
    await writeFile(path.join(cwd, '.github/workflows/x.yml'), 'on: push'); }, 'protected_path_changed'],
  ['gitattributes change', async cwd => writeFile(path.join(cwd, '.gitattributes'), '* filter=x'), 'protected_path_changed'],
  ['symlink', async cwd => symlink('/etc/passwd', path.join(cwd, 'link')), 'symlink_or_submodule_changed'],
  ['too many files', async cwd => { for (let i = 0; i < 61; i++) await writeFile(path.join(cwd, `f${i}`), 'x'); },
    'too_many_changed_files'],
]) {
  test(`autonomous ${name} fails closed without push or PR, labels the issue blocked and continues`, async t => {
    const value = await autonomousFixture(t, { agent });
    assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
    assert.equal(value.prs.length, 0);
    const ledger = await assertBlocked(value, code);
    assert.equal(ledger.pushed, undefined);
    assert.equal(ledger.attempts, 1);
    assert.match(value.comments.find(text => text.includes(': blocked #')), /No pull request was created/);
    assert.deepEqual(await readdir(ledger.taskDir), ['cache', 'copilot-home', 'copilot-output.txt', 'repo', 'tmp']);
  });
}

test('autonomous transient agent failure retries in a fresh folder with backoff, then blocks when exhausted', async t => {
  const value = await autonomousFixture(t, { agent: async () => { throw new ControllerError('command_exit_1'); } });
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
    assert.equal(value.agents.length, attempt);
  }
  assert.equal(value.comments.filter(text => /recovering #42; attempt \d\/3 stopped with command_exit_1/.test(text))
    .length, 2);
  assert.equal(value.comments.filter(text => /resuming #42; attempt [23]\/3/.test(text)).length, 2);
  const ledger = await assertBlocked(value, 'command_exit_1', { agents: 3, exhausted: true });
  assert.equal(ledger.attempts, 3);
  assert.equal(ledger.archivedTaskDirs.length, 2);
  for (const folder of ledger.archivedTaskDirs) assert.ok((await readdir(folder)).includes('repo'));
  assert.equal(value.prs.length, 0);
});

test('autonomous retry backoff waits before resuming a recoverable failure', async t => {
  const value = await autonomousFixture(t, { retryBaseMs: 3_600_000,
    agent: async () => { throw new ControllerError('command_exit_1'); } });
  await value.controller.tick();
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'failed');
  assert.ok(Date.parse(ledger.retryAt) > Date.now() + 3_000_000);
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(value.agents.length, 1);
  assert.deepEqual(value.labels, []);
});

test('autonomous failed CI gets a Copilot repair commit, then merges once every check passes', async t => {
  const repairs = [];
  const value = await autonomousFixture(t, {
    agent: async (cwd, options, args) => {
      const prompt = args[args.indexOf('-p') + 1];
      if (/CI repair attempt/.test(prompt)) {
        repairs.push(prompt);
        await writeFile(path.join(cwd, 'fix.txt'), 'fixed\n');
        return 'Repaired the failing test.';
      }
      await writeFile(path.join(cwd, 'feature.txt'), 'done\n');
    },
    checks: async sha => sha === value.pushedFirst
      ? [{ name: 'verify', done: true, ok: true, result: 'success' },
        { name: 'database', done: true, ok: false, result: 'failure', runId: 5, jobId: 9 }]
      : [{ name: 'verify', done: true, ok: true, result: 'success' },
        { name: 'database', done: true, ok: true, result: 'success' }],
  });
  const push = value.github.checks;
  value.github.checks = async sha => { value.pushedFirst ??= sha; return push(sha); };
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(repairs.length, 1);
  assert.match(repairs[0], /"check":"database","result":"failure"/);
  assert.match(repairs[0], /expected 1 got 2/);
  assert.doesNotMatch(repairs[0], /\u001b|2026-11-04T00:00:00/);
  assert.match(repairs[0], /Never disable, skip or weaken tests/);
  assert.deepEqual(value.logs, [9]);
  const branch = taskBranch(value.task);
  assert.match(sh(value.remote, 'log', '-1', '--format=%B', branch), /CI repair 1[\s\S]*Refs #42[\s\S]*Co-authored-by: Copilot/);
  assert.equal(sh(value.remote, 'show', `${branch}:fix.txt`), 'fixed');
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.ciRepairs, 1);
  assert.notEqual(ledger.commit, value.pushedFirst);
  assert.deepEqual(value.merges, [{ number: 77, sha: ledger.commit }]);
  assert.equal(value.prs.length, 1);
  assert.deepEqual(value.closures, [42]);
  assert.ok(value.comments.some(text => /Starting Copilot CI repair attempt 1\/2/.test(text)));
  assert.ok(ledger.history.some(entry => entry.event === 'repair_pushed'));
});

test('autonomous test broker runs only during each agent invocation and feeds focused CI failures to repairs', async t => {
  const brokers = []; const prompts = [];
  class FakeBroker {
    constructor(options) { this.options = options; this.events = []; brokers.push(this); }
    async prepare() { this.events.push('prepare'); }
    start() { this.events.push('start'); }
    async stop() { this.events.push('stop'); return [{ id: `r${brokers.length}`, suite: 'auth-focused', status: 'passed' }]; }
  }
  const value = await autonomousFixture(t, {
    autonomous: { testBroker: { enabled: true, maxRuns: 3 } },
    github: { failedJobLog: async () => 'Run tests\t2026-11-04T00:00:00Z   ✘   54 tests/e2e/auth.spec.mjs:7137:1 › draft shifts (21s)' },
    agent: async (cwd, options, args) => {
      const prompt = args[args.indexOf('-p') + 1];
      prompts.push(prompt);
      assert.deepEqual(brokers.at(-1).events, ['prepare', 'start']);
      await writeFile(path.join(cwd, /CI repair attempt/.test(prompt) ? 'fix.txt' : 'feature.txt'), 'done\n');
    },
    checks: async sha => sha === value.pushedFirst
      ? [{ name: 'database', done: true, ok: false, result: 'failure', runId: 5, jobId: 9 }]
      : [{ name: 'database', done: true, ok: true, result: 'success' }],
  });
  value.controller.TestBroker = FakeBroker;
  const push = value.github.checks;
  value.github.checks = async sha => { value.pushedFirst ??= sha; return push(sha); };
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(brokers.length, 2);
  for (const broker of brokers) {
    assert.deepEqual(broker.events, ['prepare', 'start', 'stop']);
    assert.equal(broker.options.issue, 42);
    assert.equal(broker.options.maxRuns, 3);
    assert.ok(broker.options.taskDir.startsWith(value.taskRoot));
  }
  const helper = path.join(brokers[0].options.taskDir, 'bin', 'request-tests.mjs');
  assert.ok(prompts[0].includes(`node ${helper} auth-focused`));
  assert.match(prompts[1], /CI repair attempt/);
  assert.match(prompts[1], /"focusedTests":\["tests\/e2e\/auth\.spec\.mjs:7137"\]/);
  assert.match(prompts[1], /reproduce each failing browser or database test locally/);
  for (const call of value.agents) {
    const filesystem = call.settings.sandbox.userPolicy.filesystem;
    assert.ok(filesystem.readwritePaths.includes(path.join(brokers[0].options.taskDir, 'test-requests')));
    assert.ok(filesystem.readonlyPaths.includes(path.join(brokers[0].options.taskDir, 'test-results')));
    assert.deepEqual(call.settings.sandbox.userPolicy.network.blockedHosts, ['localhost', '127.0.0.1', '::1']);
  }
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.history.filter(entry => entry.event === 'agent_test_runs').length, 2);
});

test('autonomous failing CI without a repair reruns failed jobs once, then blocks and never merges', async t => {
  const value = await autonomousFixture(t, { checks: async () => [
    { name: 'verify', done: true, ok: true, result: 'success' },
    { name: 'database', done: true, ok: false, result: 'failure', runId: 5, jobId: 9 }] });
  await value.controller.tick();
  assert.deepEqual(value.merges, []);
  assert.deepEqual(value.reruns, [5]);
  // Both bounded repair attempts ran (before and after the rerun) but produced no change.
  const ledger = await assertBlocked(value, 'ci_checks_failed', { pushed: true, agents: 3 });
  assert.equal(ledger.stage, 'checks');
  assert.equal(ledger.ciRepairs, 2);
  assert.match(value.comments.find(text => text.includes(': blocked #')), /pull\/77 \(not merged\)[\s\S]*- database: failure/);
  assert.ok(value.comments.some(text => /re-running the failed jobs once/.test(text)));
});

for (const [name, github, code] of [
  ['moved head', { pullRequest: async number => ({ number, state: 'open', mergeable: true, base: { ref: BRANCH },
    head: { ref: 'agent/x', sha: 'd'.repeat(40) } }) }, 'pull_request_changed'],
  ['unmergeable PR', { pullRequest: async number => ({ number, state: 'open', mergeable: false, base: { ref: BRANCH },
    head: { ref: 'agent/issue-42-x', sha: 'd'.repeat(40) } }) }, 'pull_request_changed'],
]) {
  test(`autonomous ${name} blocks before merging`, async t => {
    const value = await autonomousFixture(t, { github });
    await value.controller.tick();
    assert.deepEqual(value.merges, []);
    await assertBlocked(value, code, { pushed: true });
  });
}

test('autonomous transient check API failure resumes from GitHub state without rerunning the agent', async t => {
  let outage = true;
  const value = await autonomousFixture(t, { checks: async () => {
    if (outage) throw new ControllerError('command_exit_1');
    return [{ name: 'verify', done: true, ok: true, result: 'success' }];
  } });
  await value.controller.tick();
  const failed = await value.store.read(42);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'command_exit_1');
  assert.equal(failed.stage, 'checks');
  assert.ok(failed.retryAt);
  assert.deepEqual(value.merges, []);
  assert.deepEqual(value.labels, []);
  outage = false;
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(value.agents.length, 1);
  assert.equal(value.prs.length, 1);
  assert.equal(value.merges.length, 1);
  assert.deepEqual(value.closures, [42]);
  const resumed = await value.store.read(42);
  // A delivery failure after the commit was pushed never spends an agent execution attempt.
  assert.equal(resumed.attempts, 1);
  assert.equal(resumed.deliveryRetries, 1);
  assert.ok(value.comments.some(text => /resuming delivery of #42; retry 1\/5 after command_exit_1/.test(text)));
});

test('autonomous merge verification retries without merging twice', async t => {
  let verified = false;
  const value = await autonomousFixture(t, { github: { contains: async () => verified } });
  await value.controller.tick();
  const failed = await value.store.read(42);
  assert.equal(failed.error, 'merge_verification_failed');
  assert.equal(failed.merged, true);
  assert.notEqual(failed.mergeVerified, true);
  assert.deepEqual(value.closures, []);
  verified = true;
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(value.merges.length, 1);
  assert.equal(value.agents.length, 1);
  assert.equal(value.prs.length, 1);
  const ledger = await value.store.read(42);
  assert.equal(ledger.mergeVerified, true);
  assert.ok(ledger.history.some(entry => entry.event === 'reconciled_merge'));
  assert.deepEqual(value.closures, [42]);
});

test('autonomous merge verification that never succeeds blocks after the bounded delivery retries', async t => {
  const value = await autonomousFixture(t, { github: { contains: async () => false } });
  // One execution attempt plus the default 5 delivery retries; the agent and merge each run exactly once.
  for (let i = 0; i < 6; i++) await value.controller.tick();
  const ledger = await assertBlocked(value, 'merge_verification_failed', { pushed: true, exhausted: true });
  assert.equal(value.merges.length, 1);
  assert.match(value.comments.find(text => text.includes(': blocked #')), /merged as c{40}; post-merge verification did not complete/);
  assert.match(value.comments.find(text => text.includes(': blocked #')), /1 of 3 execution attempts, 5 of 5 delivery retries/);
  assert.equal(ledger.attempts, 1);
  assert.equal(ledger.deliveryRetries, 5);
});

test('autonomous merge accepts a lost merge response only when GitHub confirms that exact head merged', async t => {
  const value = await autonomousFixture(t);
  value.github.merge = async (number, sha) => { value.merges.push({ number, sha }); value.pr.merged = true;
    throw new ControllerError('command_exit_1'); };
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal((await value.store.read(42)).mergeVerified, true);
  assert.deepEqual(value.closures, [42]);
});

test('autonomous lost pull request creation response adopts the existing PR instead of opening a duplicate', async t => {
  const value = await autonomousFixture(t);
  const exec = value.exec;
  value.controller.exec = async (command, args, options) => {
    if (command === 'gh') { await exec(command, args, options); throw new ControllerError('command_timeout'); }
    return exec(command, args, options);
  };
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(value.prs.length, 1);
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.ok(ledger.history.some(entry => entry.event === 'reconciled_pull_request'));
});

test('autonomous GitHub reporting outage queues reports durably and delivers each exactly once later', async t => {
  let down = true;
  const value = await autonomousFixture(t);
  const posted = [];
  value.github.comment = async (number, message) => {
    if (down) {
      // The first comment reaches GitHub but its response is lost; later ones fail outright.
      if (!posted.length) posted.push(message);
      throw new ControllerError('command_exit_1');
    }
    posted.push(message);
  };
  value.github.findComment = async (number, marker) => posted.some(text => text.includes(marker));
  value.github.closeCompleted = async number => { if (down) throw new ControllerError('command_exit_1'); value.closures.push(number); };
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  let ledger = await value.store.read(42);
  // The work itself completed; only status delivery is pending.
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.mergeVerified, true);
  assert.ok(ledger.outbox.length >= 3);
  assert.equal(ledger.outbox.at(-1).kind, 'close');
  assert.ok(ledger.history.some(entry => entry.event === 'report_deferred'));
  assert.equal(posted.length, 1);
  down = false;
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec: value.exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, retryBaseMs: 0 });
  assert.deepEqual(await restarted.tick(), { eligible: 0, executed: 0 });
  ledger = await value.store.read(42);
  assert.equal(ledger.outbox, undefined);
  assert.equal(value.closures[0], 42);
  const markers = posted.map(text => text.match(/butterbox-report:([0-9a-f-]{36})/)[1]);
  assert.equal(new Set(markers).size, markers.length);
  assert.match(posted[0], /queued #42/);
  assert.match(posted.at(-1), /completed #42/);
  assert.ok(ledger.history.some(entry => entry.event === 'report_delivered'));
  assert.equal(value.agents.length, 1);
});

test('autonomous legacy reportingError records no longer block the queue', async t => {
  const value = await autonomousFixture(t, { github: { issues: async () => [issue(), issue({ number: 43 })],
    task: async number => parseTask(issue({ number })) } });
  await value.store.save({ issue: 42, digest: parseTask(issue()).digest, workstream: 'roadmap', mode: 'autonomous',
    status: 'failed', error: 'ci_checks_failed', blockedReported: true, reportingError: 'github_status_report_failed',
    reservedAt: new Date().toISOString() });
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(value.agents.length, 1);
  assert.equal((await value.store.read(43)).status, 'succeeded');
  const legacy = await value.store.read(42);
  assert.equal(legacy.reportingError, undefined);
  assert.ok(legacy.history.some(entry => entry.event === 'legacy_reporting_error_requeued'));
});

test('autonomous diverged task branch is isolated and never force-pushed', async t => {
  const value = await autonomousFixture(t, { checks: async () => { throw new ControllerError('command_exit_1'); } });
  await value.controller.tick();
  const branch = taskBranch(value.task);
  const before = sh(value.remote, 'rev-parse', branch);
  const other = path.join(value.directory, 'other');
  sh(value.directory, 'clone', '--quiet', '--branch', branch, value.remote, other);
  await writeFile(path.join(other, 'intruder.txt'), 'x');
  sh(other, 'add', '.'); sh(other, 'commit', '--quiet', '-m', 'outside change'); sh(other, 'push', '--quiet', 'origin', branch);
  await value.controller.tick();
  const ledger = await assertBlocked(value, 'task_branch_diverged', { pushed: true });
  assert.notEqual(sh(value.remote, 'rev-parse', branch), before);
  assert.deepEqual(value.merges, []);
  assert.equal(ledger.commit, before);
});

test('autonomous retry of an edited issue is terminal, not resumed', async t => {
  let body = issue().body;
  const value = await autonomousFixture(t, { agent: async () => { throw new ControllerError('command_exit_1'); },
    github: { issues: async () => [issue({ body })], task: async () => parseTask(issue({ body })) } });
  await value.controller.tick();
  body += '\nAlso deploy to production.';
  await value.controller.tick();
  const ledger = await value.store.read(42);
  assert.equal(ledger.error, 'task_changed_before_execution');
  assert.equal(ledger.final, true);
  assert.equal(value.agents.length, 1);
  assert.deepEqual(value.labels, [42]);
});

test('autonomous per-issue errors are isolated so later eligible issues still run', async t => {
  const value = await autonomousFixture(t, { github: {
    issues: async () => [issue(), issue({ number: 43 })],
    task: async number => {
      if (number === 42) throw new ControllerError('command_exit_1');
      return parseTask(issue({ number }));
    } } });
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal(await value.store.read(42), null);
  assert.equal((await value.store.read(43)).status, 'succeeded');
});

test('autonomous merges refuse default branches and mismatched workstream bases', async t => {
  const value = await autonomousFixture(t);
  const signal = new AbortController().signal;
  for (const base of ['main', 'master', 'feature/award-central-foundation']) {
    await rejects(value.controller.mergeVerified({ workstream: 'roadmap', pullRequest: 'https://github.com/farbotkol/butterbox/pull/1' },
      base, signal), 'merge_base_refused');
  }
  assert.deepEqual(value.checkCalls, []);
});

test('GitHub pull request lookup by branch returns the full pull request, including merged state', async () => {
  const calls = [];
  const branch = 'agent/issue-42-0123abcd';
  const github = new GitHub(async (command, args) => {
    calls.push(args[3]);
    // The list endpoint omits `merged`, exactly as GitHub's short pull request format does.
    if (args[3] === 'repos/farbotkol/butterbox/pulls') {
      return JSON.stringify([{ number: 7, state: 'closed', merged_at: '2026-11-04T00:00:00Z',
        head: { ref: branch, repo: { full_name: 'farbotkol/butterbox' } } }]);
    }
    return JSON.stringify({ number: 7, state: 'closed', merged: true, head: { ref: branch } });
  });
  assert.equal((await github.pullRequestForBranch(branch)).merged, true);
  assert.deepEqual(calls, ['repos/farbotkol/butterbox/pulls', 'repos/farbotkol/butterbox/pulls/7']);
  await rejects(github.pullRequestForBranch('main'), 'invalid_task_branch');
});

test('autonomous retry after a merged PR whose branch was already deleted only re-verifies the merge', async t => {
  let verified = false;
  const value = await autonomousFixture(t, { github: { contains: async () => verified } });
  await value.controller.tick();
  assert.equal((await value.store.read(42)).error, 'merge_verification_failed');
  spawnSync('git', ['update-ref', '-d', `refs/heads/${taskBranch(value.task)}`], { cwd: value.remote });
  value.github.pullRequest = async number => ({ number, html_url: `https://github.com/farbotkol/butterbox/pull/${number}`,
    state: 'closed', merged: true, mergeable: null, merge_commit_sha: 'c'.repeat(40), base: { ref: BRANCH },
    head: { ref: taskBranch(value.task), sha: (await value.store.read(42)).commit } });
  value.github.pullRequestForBranch = async () => value.github.pullRequest(77);
  verified = true;
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  assert.equal((await value.store.read(42)).mergeVerified, true);
  assert.equal(value.merges.length, 1);
  assert.deepEqual(value.labels, []);
  assert.equal(value.closures[0], 42);
});

test('listener crash at the start of a resumed attempt is recovered as an interruption, not blocked', async t => {
  let calls = 0;
  const value = await autonomousFixture(t, { agent: async cwd => {
    if (++calls === 1) throw new ControllerError('command_exit_1');
    await writeFile(path.join(cwd, 'feature.txt'), 'done\n');
  } });
  await value.controller.tick();
  let snapshot;
  const identity = value.github.identity;
  let polls = 0;
  value.github.identity = async () => {
    // The tick's own identity check passes; the resumed run's check is where the "crash" happens.
    if (++polls === 2) { snapshot = await value.store.read(42); throw new ControllerError('operation_cancelled'); }
    return identity();
  };
  await value.controller.tick();
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.attempts, 2);
  await value.store.save(snapshot);
  value.github.identity = identity;
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec: value.exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, checksPollMs: 1, checksGraceMs: 0, retryBaseMs: 0 });
  assert.deepEqual(await restarted.tick(), { eligible: 1, executed: 1 });
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.attempts, 3);
  assert.deepEqual(value.labels, []);
});

test('autonomous outbox never re-posts a comment that may have been sent before a crash', async t => {
  const value = await autonomousFixture(t);
  const id = '11111111-2222-4333-8444-555555555555';
  value.comments.push(`Butterbox local controller: earlier\n\n<!-- butterbox-report:${id} -->`);
  const ledger = { issue: 42, digest: value.task.digest, workstream: 'roadmap', mode: 'autonomous', status: 'succeeded',
    reservedAt: new Date().toISOString(), outbox: [{ id, kind: 'comment', body: 'earlier',
      createdAt: new Date().toISOString(), attempts: 0, sending: true }] };
  await value.store.save(ledger);
  assert.equal(await value.controller.deliver(ledger), true);
  assert.equal(value.comments.length, 1);
  assert.equal((await value.store.read(42)).outbox, undefined);
});

test('GitHub checks include every check run and commit status on the exact commit', async () => {
  const calls = [];
  const github = new GitHub(async (command, args) => {
    calls.push(args.join(' '));
    return JSON.stringify(args.some(arg => arg.endsWith('/check-runs'))
      ? { total_count: 3, check_runs: [{ name: 'a', status: 'completed', conclusion: 'success' },
        { name: 'b', status: 'completed', conclusion: 'skipped' }, { name: 'c', status: 'in_progress', conclusion: null }] }
      : { statuses: [{ context: 'd', state: 'failure' }] });
  });
  const sha = 'a'.repeat(40);
  assert.deepEqual((await github.checks(sha)).map(check => [check.name, check.done, check.ok]),
    [['a', true, true], ['b', true, true], ['c', false, false], ['d', true, false]]);
  assert.ok(calls.every(call => call.includes(sha)));
  await rejects(github.checks('main'), 'invalid_commit_sha');
  const truncated = new GitHub(async () => JSON.stringify({ total_count: 101, check_runs: [], statuses: [] }));
  await rejects(truncated.checks(sha), 'invalid_check_response');
  await rejects(github.deleteBranch(BRANCH), 'refused_branch_deletion');
  await rejects(github.merge(1, 'HEAD'), 'invalid_merge_request');
});

test('autonomous mode rejects unreviewed Copilot sandbox versions before reserving a task', async t => {
  const value = await autonomousFixture(t, { version: 'GitHub Copilot CLI 1.0.106.' });
  await rejects(value.controller.tick(), 'unreviewed_copilot_sandbox_version');
  assert.equal(await value.store.read(42), null);
  assert.equal(value.agents.length, 0);
});

test('autonomous Copilot session start-up failure pauses the queue without spending task attempts', async t => {
  const value = await autonomousFixture(t, { agent: async () => {
    const error = new ControllerError('command_exit_1');
    Object.defineProperty(error, 'diagnostics', { value: { stdout: '', stderr:
      'Failed to initialize session: Error: model resolution leaf failed: alias requires dynamic Auto tiers.' } });
    throw error;
  }, github: { issues: async () => [issue(), issue({ number: 43 })], task: async number => parseTask(issue({ number })) } });
  await rejects(value.controller.tick(), 'copilot_session_init_failed');
  const ledger = await value.store.read(42);
  assert.equal(ledger.error, 'copilot_session_init_failed');
  assert.equal(ledger.attempts, 0);
  assert.ok(Date.parse(ledger.retryAt) > Date.now() + 800_000);
  assert.equal(ledger.final, undefined);
  assert.deepEqual(value.labels, []);
  assert.match(value.comments.at(-1), /paused #42: Copilot CLI could not start a session/);
  assert.match(await readFile(path.join(ledger.taskDir, 'copilot-output-failed.txt'), 'utf8'), /dynamic Auto tiers/);
  assert.equal(await value.store.read(43), null);
  // Still paused on the next poll: no new reservation and no repeated comment.
  const comments = value.comments.length;
  await rejects(value.controller.tick(), 'copilot_session_init_failed');
  assert.equal(value.comments.length, comments);
  assert.equal(await value.store.read(43), null);
  assert.equal(value.agents.length, 1);
});

test('autonomous mode isolates non-owner or edited issues without executing them or stopping the poll', async t => {
  const value = await autonomousFixture(t, { github: {
    issues: async () => [issue({ user: { login: 'attacker', id: 1, type: 'User' } }), issue({ number: 43 })],
    task: async () => { throw new ControllerError('issue_not_original_owner_command'); },
  } });
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(value.agents.length, 0);
  assert.equal(await value.store.read(42), null);
  assert.equal(await value.store.read(43), null);
});

test('autonomous identity failure still fails the whole poll closed', async t => {
  const value = await autonomousFixture(t, { github: {
    identity: async () => { throw new ControllerError('github_identity_mismatch'); } } });
  await rejects(value.controller.tick(), 'github_identity_mismatch');
  assert.equal(value.agents.length, 0);
});

test('listener crash mid-agent: restart stops the orphan immediately even while the retry is backing off', async t => {
  let snapshot;
  const value = await autonomousFixture(t, { agent: async () => {
    snapshot = await value.store.read(42);
    throw new ControllerError('operation_cancelled');
  } });
  await value.controller.tick();
  const orphan = spawn('/bin/sh', ['-c', 'sleep 60; exit 0', value.copilot], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-orphan.pid, 'SIGKILL'); } catch { /* already stopped */ } });
  const exited = new Promise(resolve => orphan.once('exit', resolve));
  await value.store.save({ ...snapshot, agentPid: orphan.pid });
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec: value.exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, checksPollMs: 1, checksGraceMs: 0,
    retryBaseMs: 3_600_000 });
  assert.deepEqual(await restarted.tick(), { eligible: 0, executed: 0 });
  await exited;
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'interrupted');
  assert.equal(ledger.agentPid, undefined);
  assert.ok(Date.parse(ledger.retryAt) > Date.now());
  const events = ledger.history.map(entry => entry.event);
  assert.ok(events.indexOf('orphan_agent_stopped') > events.indexOf('interrupted'));
});

test('listener crash mid-agent: restart stops the orphan agent, archives partial work and resumes once', async t => {
  let calls = 0;
  let snapshot;
  const value = await autonomousFixture(t, { agent: async cwd => {
    calls++;
    if (calls === 1) {
      await writeFile(path.join(cwd, 'partial.txt'), 'half-finished\n');
      snapshot = await value.store.read(42);
      throw new ControllerError('operation_cancelled');
    }
    await writeFile(path.join(cwd, 'feature.txt'), 'done\n');
  } });
  await value.controller.tick();
  // Rewind the ledger to the moment the listener process died: still "running" in the agent stage, with a
  // Copilot process that outlived it.
  const orphan = spawn('/bin/sh', ['-c', 'sleep 60; exit 0', value.copilot], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-orphan.pid, 'SIGKILL'); } catch { /* already stopped */ } });
  const exited = new Promise(resolve => orphan.once('exit', resolve));
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.stage, 'agent');
  await value.store.save({ ...snapshot, agentPid: orphan.pid });
  const comments = value.comments.length;
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec: value.exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, checksPollMs: 1, checksGraceMs: 0, retryBaseMs: 0 });
  assert.deepEqual(await restarted.tick(), { eligible: 1, executed: 1 });
  await exited;
  assert.equal(calls, 2);
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.attempts, 2);
  assert.equal(ledger.agentPid, undefined);
  const events = ledger.history.map(entry => entry.event);
  for (const event of ['interrupted', 'retry_scheduled', 'orphan_agent_stopped', 'task_folder_archived']) {
    assert.ok(events.includes(event), event);
  }
  const branch = taskBranch(value.task);
  assert.throws(() => sh(value.remote, 'show', `${branch}:partial.txt`));
  assert.equal(value.merges.length, 1);
  assert.equal(value.prs.length, 1);
  const added = value.comments.slice(comments);
  assert.ok(added.some(text => /recovering #42; attempt 1\/3 stopped with previous_process_interrupted/.test(text)));
  assert.ok(added.some(text => /resuming #42; attempt 2\/3/.test(text)));
  assert.match(added.at(-1), /completed #42/);
  // Archived diagnostic folders are cleaned up only after success.
  assert.deepEqual(await readdir(value.taskRoot), []);
  assert.deepEqual(await restarted.tick(), { eligible: 0, executed: 0 });
  assert.equal(calls, 2);
});

test('listener crash after push resumes at the pull request without rerunning the agent or pushing again', async t => {
  let snapshot;
  const value = await autonomousFixture(t);
  const exec = value.exec;
  value.controller.exec = async (command, args, options) => {
    if (command === 'gh') {
      snapshot = await value.store.read(42);
      throw new ControllerError('operation_cancelled');
    }
    return exec(command, args, options);
  };
  await value.controller.tick();
  assert.equal(snapshot.stage, 'pull_request');
  assert.equal(snapshot.pushed, true);
  await value.store.save({ ...snapshot, status: 'running' });
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec: value.exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, checksPollMs: 1, checksGraceMs: 0, retryBaseMs: 0 });
  assert.deepEqual(await restarted.tick(), { eligible: 1, executed: 1 });
  assert.equal(value.agents.length, 1);
  assert.equal(value.prs.length, 1);
  assert.equal(value.merges.length, 1);
  assert.equal((await value.store.read(42)).status, 'succeeded');
});

test('listener crash between commit and recorded push reconciles the pushed commit instead of pushing twice', async t => {
  const value = await autonomousFixture(t, { checks: async () => { throw new ControllerError('command_exit_1'); } });
  await value.controller.tick();
  const ledger = await value.store.read(42);
  // Rewind to "commit recorded, push response lost".
  await value.store.save({ ...ledger, status: 'running', stage: 'push', pendingCommit: ledger.commit,
    pushed: undefined, commit: undefined, pullRequest: undefined, retryAt: undefined });
  value.github.checks = async () => [{ name: 'verify', done: true, ok: true, result: 'success' }];
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec: value.exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, checksPollMs: 1, checksGraceMs: 0, retryBaseMs: 0 });
  assert.deepEqual(await restarted.tick(), { eligible: 1, executed: 1 });
  const done = await value.store.read(42);
  assert.equal(done.status, 'succeeded');
  assert.equal(done.commit, ledger.commit);
  assert.ok(done.history.some(entry => entry.event === 'reconciled_push'));
  assert.ok(done.history.some(entry => entry.event === 'reconciled_pull_request'));
  assert.equal(value.agents.length, 1);
  assert.equal(value.prs.length, 1);
});

test('listener start-up recovers a stale lock from a dead or reused PID but never from a live listener', async t => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'controller-lock-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new StateStore(path.join(directory, 'state'));
  await store.init();
  const plant = async pid => {
    await mkdir(store.lock, { mode: 0o700 });
    await store.atomic(path.join(store.lock, 'owner.json'), { pid, startedAt: new Date().toISOString() });
  };
  const dead = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
  await plant(Number(dead.stdout.trim()));
  await rejects(store.acquire(), 'listener_lock_exists');
  assert.equal(await store.recoverLock({ automatic: true }), Number(dead.stdout.trim()));
  await (await store.acquire())();
  const reused = spawn('/bin/sleep', ['60'], { stdio: 'ignore' });
  t.after(() => reused.kill('SIGKILL'));
  await plant(reused.pid);
  await rejects(store.recoverLock(), 'listener_process_still_running');
  assert.equal(await store.recoverLock({ automatic: true }), reused.pid);
  await plant(process.pid);
  await rejects(store.recoverLock({ automatic: true }), 'listener_process_still_running');
  await unlink(path.join(store.lock, 'owner.json'));
  await rm(store.lock, { recursive: true });
  // Two listeners starting together: exactly one reclaims the stale lock, and the other never removes it.
  await plant(Number(dead.stdout.trim()));
  const results = await Promise.allSettled([store.recoverLock({ automatic: true }),
    new StateStore(store.directory).recoverLock({ automatic: true })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'listener_lock_exists');
  await (await store.acquire())();
  assert.deepEqual((await readdir(directory, { recursive: true })).filter(name => name.includes('.stale-')), []);
});

// Fails the next `git push` calls with the given stderr (undefined lets a push through), like a real rejection.
function failPushes(value, stderrs, exec = value.controller.exec) {
  const pushes = [];
  const wrapped = async (command, args, options) => {
    if (command === 'git' && args.includes('push')) {
      pushes.push(args);
      const stderr = stderrs.shift();
      if (stderr !== undefined) {
        const error = new ControllerError('command_exit_1');
        Object.defineProperty(error, 'diagnostics', { value: { stdout: '', stderr } });
        throw error;
      }
    }
    return exec(command, args, options);
  };
  value.controller.exec = wrapped;
  return { pushes, exec: wrapped };
}

test('git and gh rejections are classified, and diagnostics are redacted before being stored', () => {
  assert.equal(classifyCommandFailure('remote: error: GH013: Repository rule violations found\nremote: - Push cannot contain secrets'),
    'push_blocked_by_secret_scanning');
  assert.equal(classifyCommandFailure('fatal: Authentication failed for \'https://github.com/farbotkol/butterbox.git/\''),
    'github_credentials_rejected');
  assert.equal(classifyCommandFailure('remote: error: GH006: Protected branch update failed'), 'push_rejected_by_repository_rules');
  assert.equal(classifyCommandFailure('fatal: unable to access: Could not resolve host: github.com'), null);
  assert.equal(classifyCommandFailure('error: RPC failed; HTTP 502 curl 22'), null);
  const redacted = redactDiagnostics('https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz0123@github.com/r.git ' +
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789 Authorization: Bearer-secret');
  assert.doesNotMatch(redacted, /ghs_|ghp_|x-access-token|Bearer-secret/);
});

test('autonomous transient push failure retries delivery with the preserved commit, never rerunning the agent', async t => {
  const value = await autonomousFixture(t);
  const { pushes } = failPushes(value, ['fatal: unable to access \'https://ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/x\': ' +
    'Could not resolve host: github.com']);
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  const failed = await value.store.read(42);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'command_exit_1');
  assert.equal(failed.stage, 'push');
  assert.equal(failed.retryKind, 'delivery');
  assert.match(failed.cause, /Could not resolve host/);
  assert.doesNotMatch(failed.cause, /ghp_/);
  const saved = failed.history.find(entry => entry.event === 'failure_output_saved').detail;
  const diagnostics = await readFile(saved, 'utf8');
  assert.match(diagnostics, /Could not resolve host/);
  assert.doesNotMatch(diagnostics, /ghp_/);
  assert.ok(value.comments.some(text => /delivery stopped with command_exit_1 \(stage: push\) after the agent's work was preserved/
    .test(text)));
  assert.deepEqual(value.labels, []);
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  const done = await value.store.read(42);
  assert.equal(done.status, 'succeeded');
  assert.equal(done.commit, failed.pendingCommit);
  assert.equal(value.head(), failed.pendingCommit);
  assert.equal(done.attempts, 1);
  assert.equal(done.deliveryRetries, 1);
  assert.equal(value.agents.length, 1);
  assert.equal(pushes.length, 2);
  // Pushes are buffered so GitHub receives a sized request rather than chunked encoding (HTTP 400 on #18).
  for (const args of pushes) assert.ok(args.indexOf('http.postBuffer=268435456') === args.indexOf('push') - 1);
  assert.equal(value.prs.length, 1);
  assert.deepEqual(value.closures, [42]);
});

for (const [stderr, code] of [
  ['remote: error: GH013: Repository rule violations found for refs/heads/agent/x.\nremote: - Push cannot contain secrets',
    'push_blocked_by_secret_scanning'],
  ['remote: Invalid username or password.\nfatal: Authentication failed for \'https://github.com/farbotkol/butterbox.git/\'',
    'github_credentials_rejected'],
]) {
  test(`autonomous ${code} push rejection isolates only that issue and is never retried`, async t => {
    const value = await autonomousFixture(t);
    const { pushes } = failPushes(value, [stderr, stderr]);
    await value.controller.tick();
    const ledger = await assertBlocked(value, code);
    assert.equal(pushes.length, 1);
    assert.equal(value.prs.length, 0);
    assert.ok(ledger.history.some(entry => entry.event === 'failure_classified'));
    assert.match(value.comments.at(-1), /not safe to retry automatically/);
  });
}

test('autonomous record blocked by the old shared attempt budget at push is requeued once and delivered', async t => {
  const value = await autonomousFixture(t);
  const { exec } = failPushes(value, ['fatal: unable to access: Connection reset by peer']);
  await value.controller.tick();
  const scheduled = await value.store.read(42);
  // Rewrite to the shape an earlier controller left behind (as for live issue #18).
  const legacy = { ...scheduled, attempts: 3, final: true, blockedReported: true };
  for (const key of ['retryAt', 'retryKind', 'deliveryRetries']) delete legacy[key];
  await value.store.save(legacy);
  value.labels.push(42);
  const restarted = new Controller({ github: value.github, store: value.store, config: value.config, exec,
    mode: 'autonomous', enabled: true, autonomousEnabled: true, checksPollMs: 1, checksGraceMs: 0, retryBaseMs: 0 });
  assert.deepEqual(await restarted.tick(), { eligible: 1, executed: 1 });
  const done = await value.store.read(42);
  assert.equal(done.status, 'succeeded');
  assert.equal(done.commit, scheduled.pendingCommit);
  assert.equal(done.attempts, 3);
  assert.equal(done.deliveryRetries, 1);
  assert.ok(done.history.some(entry => entry.event === 'legacy_delivery_requeued'));
  assert.deepEqual(value.unlabels, [42]);
  assert.equal(value.agents.length, 1);
  assert.deepEqual(value.closures, [42]);
  // Requeued at most once: a second restart never resurrects a finished or re-blocked record.
  assert.deepEqual(await restarted.tick(), { eligible: 0, executed: 0 });
});

test('autonomous legacy requeue never applies to non-retryable, acknowledged or agent-stage blocks', async t => {
  const value = await autonomousFixture(t, { agent: async () => { throw new ControllerError('command_exit_1'); } });
  for (let i = 0; i < 3; i++) await value.controller.tick();
  const blocked = await value.store.read(42);
  assert.equal(blocked.stage, 'agent');
  assert.equal(blocked.final, true);
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.equal(value.agents.length, 3);
  assert.deepEqual(value.unlabels, []);
  await value.store.save({ ...blocked, stage: 'push', pendingCommit: 'a'.repeat(40), acknowledgedAt: new Date().toISOString() });
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  await value.store.save({ ...blocked, stage: 'push', pendingCommit: 'a'.repeat(40), error: 'protected_path_changed' });
  assert.deepEqual(await value.controller.tick(), { eligible: 0, executed: 0 });
  assert.deepEqual(value.unlabels, []);
  assert.equal(value.agents.length, 3);
});

test('autonomous CI repair whose push failed is pushed on resume instead of being regenerated', async t => {
  const repairs = [];
  const value = await autonomousFixture(t, {
    agent: async (cwd, options, args) => {
      if (/CI repair attempt/.test(args[args.indexOf('-p') + 1])) {
        repairs.push(1);
        await writeFile(path.join(cwd, 'fix.txt'), 'fixed\n');
        return 'Repaired.';
      }
      await writeFile(path.join(cwd, 'feature.txt'), 'done\n');
    },
    checks: async sha => sha === value.first
      ? [{ name: 'database', done: true, ok: false, result: 'failure', runId: 5, jobId: 9 }]
      : [{ name: 'database', done: true, ok: true, result: 'success' }],
  });
  const checks = value.github.checks;
  value.github.checks = async sha => { value.first ??= sha; return checks(sha); };
  failPushes(value, [undefined, 'error: RPC failed; HTTP 502 curl 22 The requested URL returned error: 502']);
  await value.controller.tick();
  const failed = await value.store.read(42);
  assert.equal(failed.stage, 'push');
  assert.equal(failed.commit, value.first);
  assert.ok(failed.pendingCommit && failed.pendingCommit !== value.first);
  assert.equal(failed.retryKind, 'delivery');
  await value.controller.tick();
  const done = await value.store.read(42);
  assert.equal(done.status, 'succeeded');
  assert.equal(done.commit, failed.pendingCommit);
  assert.equal(repairs.length, 1);
  assert.equal(done.ciRepairs, 1);
  assert.equal(done.attempts, 1);
  assert.equal(sh(value.remote, 'show', `${taskBranch(value.task)}:fix.txt`), 'fixed');
  assert.deepEqual(value.merges, [{ number: 77, sha: failed.pendingCommit }]);
});

test('autonomous delivery resume whose preserved commit is gone is charged a full execution attempt', async t => {
  const value = await autonomousFixture(t, { autonomous: { maxAttempts: 2 } });
  failPushes(value, ['fatal: unable to access: Operation timed out', 'fatal: unable to access: Operation timed out']);
  await value.controller.tick();
  await rm(path.join((await value.store.read(42)).taskDir, 'repo'), { recursive: true, force: true });
  await value.controller.tick();
  let ledger = await value.store.read(42);
  assert.equal(value.agents.length, 2);
  assert.equal(ledger.attempts, 2);
  assert.ok(ledger.history.some(entry => entry.event === 'preserved_commit_unavailable'));
  assert.equal(ledger.retryKind, 'delivery');
  await rm(path.join(ledger.taskDir, 'repo'), { recursive: true, force: true });
  await value.controller.tick();
  ledger = await assertBlocked(value, 'execution_attempts_exhausted', { agents: 2 });
  assert.equal(value.prs.length, 0);
});

// The base branch moves after the task branch was cut; GitHub then reports the pull request as conflicting.
async function movedBaseFixture(t, { base = { 'feature.txt': 'base\n' }, resolve } = {}) {
  const prompts = [];
  const value = await autonomousFixture(t, {
    agent: async (cwd, options, args) => {
      const prompt = args[args.indexOf('-p') + 1];
      prompts.push(prompt);
      if (/merge-conflict resolution/.test(prompt)) return resolve?.(cwd, prompt) ?? 'Resolved.';
      await writeFile(path.join(cwd, 'feature.txt'), 'done\n');
      const seed = path.join(value.directory, 'seed');
      for (const [name, text] of Object.entries(base)) await writeFile(path.join(seed, name), text);
      sh(seed, 'add', '.'); sh(seed, 'commit', '--quiet', '-m', 'base moved');
      sh(seed, 'push', '--quiet', value.remote, BRANCH);
      value.baseHead = sh(seed, 'rev-parse', 'HEAD');
    },
  });
  const pullRequest = value.github.pullRequest;
  value.github.pullRequest = async number => {
    const pull = await pullRequest(number);
    const contains = spawnSync('git', ['merge-base', '--is-ancestor', value.baseHead, pull.head.sha], { cwd: value.remote });
    return pull.merged || contains.status === 0 ? pull : { ...pull, mergeable: false, mergeable_state: 'dirty' };
  };
  return { value, prompts };
}

test('autonomous PR that conflicts with a moved base gets a Copilot-resolved merge commit, then merges after CI', async t => {
  const { value, prompts } = await movedBaseFixture(t, {
    resolve: cwd => writeFile(path.join(cwd, 'feature.txt'), 'base\ndone\n'),
  });
  assert.deepEqual(await value.controller.tick(), { eligible: 1, executed: 1 });
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.baseUpdates, 1);
  assert.equal(ledger.attempts, 1);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Edit only those files[\s\S]*\["feature.txt"\]/);
  const branch = taskBranch(value.task);
  assert.equal(sh(value.remote, 'show', `${branch}:feature.txt`), 'base\ndone');
  assert.equal(sh(value.remote, 'rev-list', '--parents', '-n', '1', branch).split(' ').length, 3);
  assert.match(sh(value.remote, 'log', '-1', '--format=%B', branch), /Merge .* into agent\/[\s\S]*Refs #42[\s\S]*Co-authored-by: Copilot/);
  sh(value.remote, 'merge-base', '--is-ancestor', value.baseHead, branch);
  assert.deepEqual(value.merges, [{ number: 77, sha: ledger.commit }]);
  // CI ran again on the merge commit before merging.
  assert.equal(value.checkCalls.at(-1), ledger.commit);
  assert.ok(value.comments.some(text => /conflicts with the updated .* nothing is rebased or force-pushed/.test(text)));
  assert.ok(ledger.history.some(entry => entry.event === 'base_merged'));
  assert.deepEqual(value.closures, [42]);
});

test('autonomous PR behind a moved base without textual conflicts merges the base without running Copilot', async t => {
  const { value, prompts } = await movedBaseFixture(t, { base: { 'other.txt': 'base\n' } });
  await value.controller.tick();
  const ledger = await value.store.read(42);
  assert.equal(ledger.status, 'succeeded');
  assert.equal(prompts.length, 1);
  assert.equal(sh(value.remote, 'show', `${taskBranch(value.task)}:other.txt`), 'base');
  assert.deepEqual(value.merges, [{ number: 77, sha: ledger.commit }]);
});

for (const [name, resolve, code] of [
  ['leaves conflict markers', async () => 'Could not resolve.', 'merge_conflict_unresolved'],
  ['edits files outside the conflict', async cwd => {
    await writeFile(path.join(cwd, 'feature.txt'), 'base\ndone\n');
    await writeFile(path.join(cwd, 'AGENTS.md'), 'changed');
  }, 'merge_resolution_out_of_scope'],
  ['creates new files', async cwd => {
    await writeFile(path.join(cwd, 'feature.txt'), 'base\ndone\n');
    await writeFile(path.join(cwd, 'extra.txt'), 'x');
  }, 'merge_resolution_out_of_scope'],
]) {
  test(`autonomous conflict resolution that ${name} is isolated and never merged`, async t => {
    const { value } = await movedBaseFixture(t, { resolve });
    const branch = taskBranch(value.task);
    await value.controller.tick();
    const before = sh(value.remote, 'rev-parse', branch);
    await assertBlocked(value, code, { pushed: true, agents: 2 });
    assert.deepEqual(value.merges, []);
    assert.equal(sh(value.remote, 'rev-parse', branch), before);
    assert.equal(sh(value.remote, 'rev-list', '--parents', '-n', '1', branch).split(' ').length, 2);
  });
}
