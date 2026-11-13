import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BRANCH, LABEL, OWNER_ID, Controller, StateStore, parseTask } from '../tools/agent-controller/listener.mjs';
import {
  canReleaseLease, componentOverlap, componentsForFiles, declaredComponents, findOverlaps, leaseConflicts,
  filesWithinComponents, normalizeComponents, pullRequestConflicts,
} from '../tools/agent-controller/component-coordination.mjs';

test('component metadata is validated and paths map to isolated work areas', () => {
  assert.deepEqual(normalizeComponents(['agent-controller', 'ci:verify-yml', 'agent-controller']),
    ['agent-controller', 'ci:verify-yml']);
  assert.equal(normalizeComponents(['not-a-component']), null);
  assert.deepEqual(componentsForFiles(['tools/agent-controller/listener.mjs']), ['agent-controller']);
  assert.deepEqual(componentsForFiles(['.github/workflows/ci.yml']), ['ci:ci-yml']);
  assert.deepEqual(componentsForFiles(['docs/agent-work/issues/issue-12/pr-34/attempt-01.md']),
    ['evidence:issue-12']);
});

test('Playwright spec filenames produce valid, disjoint component identifiers', () => {
  assert.deepEqual(componentsForFiles(['tests/e2e/auth.spec.mjs']), ['test:auth']);
  assert.deepEqual(componentsForFiles(['tests/e2e/showcase.spec.mjs']), ['test:showcase']);
  assert.deepEqual(componentsForFiles(['tests/onboarding.test.mjs']), ['test:onboarding']);
  assert.deepEqual(componentsForFiles(['tests/helpers/e2e-shared.mjs']), ['tests']);
  assert.deepEqual(componentOverlap(['ci:pr-coordination-yml'], componentsForFiles([
    'tests/e2e/auth.spec.mjs', 'tests/e2e/showcase.spec.mjs', 'tests/onboarding.test.mjs',
  ])), []);
});

test('owner tasks accept only known declared components and bounded dependencies', () => {
  const taskIssue = components => ({
    number: 31, state: 'open', user: { login: 'farbotkol', id: OWNER_ID, type: 'User' },
    assignees: [{ login: 'Copilot' }], labels: [{ name: LABEL }],
    body: `/butterbox run\n\n\`\`\`json\n${JSON.stringify({
      workstream: 'roadmap', task: 'Synthetic task', components, dependsOn: [29],
    })}\n\`\`\``,
  });
  assert.deepEqual(parseTask(taskIssue(['agent-controller']))?.components, ['agent-controller']);
  assert.deepEqual(parseTask(taskIssue(['agent-controller']))?.dependsOn, [29]);
  assert.equal(parseTask(taskIssue(['unknown-area'])), null);
});

test('agent changes must stay inside the declared work areas', () => {
  assert.equal(filesWithinComponents(['agent-controller'], ['tools/agent-controller/listener.mjs']), true);
  assert.equal(filesWithinComponents(['agent-controller'], ['tests/component-coordination.test.mjs']), false);
  assert.equal(filesWithinComponents(['repository-wide'], ['tools/agent-controller/listener.mjs']), true);
  assert.equal(filesWithinComponents(['unknown-area'], ['tools/agent-controller/listener.mjs']), false);
});

test('declared component markers augment actual file-derived ownership', () => {
  const marker = '<!-- butterbox-components: ["agent-controller","ci:verify-yml"] -->';
  assert.deepEqual(declaredComponents(marker), ['agent-controller', 'ci:verify-yml']);
  assert.equal(declaredComponents('<!-- butterbox-components: ["unknown"] -->'), null);
  assert.deepEqual(declaredComponents('no marker'), []);
});

test('disjoint files and issue evidence paths can proceed concurrently', () => {
  const left = { components: ['application:roster'], files: [{ path: 'src/app/roster/page.tsx' }] };
  const right = { components: ['application:reports'], files: [{ path: 'src/app/reports/page.tsx' }] };
  assert.equal(findOverlaps(left, right).conflicts, false);
  assert.deepEqual(componentOverlap(['evidence:issue-12'], ['evidence:issue-13']), []);
  assert.deepEqual(componentsForFiles(['docs/github-issues-workflow.md']), ['governance:workflow']);
  assert.deepEqual(componentsForFiles(['docs/agent-status/roadmap.md']), ['governance:status']);
  assert.equal(componentOverlap(['governance:workflow'], ['governance:status']).length, 0);
});

test('oversized component declarations fail closed instead of dropping overlap results', () => {
  const many = Array.from({ length: 21 }, (_, index) => `application:area-${index}`);
  const overlap = findOverlaps(
    { components: many, files: [{ path: 'src/app/roster/page.tsx' }] },
    { components: ['application:area-0'], files: [{ path: 'src/app/reports/page.tsx' }] },
  );
  assert.equal(overlap.conflicts, true);
  assert.ok(overlap.components.length > 0);
});

test('exact file edits and shared SQL objects conflict across different migrations', () => {
  const left = {
    components: [],
    files: [{ path: 'supabase/migrations/202611120001_a.sql', content: 'alter table public.shifts add column note text;' }],
  };
  const sameObject = {
    components: [],
    files: [{ path: 'supabase/migrations/202611120002_b.sql', content: 'create index on public.shifts (starts_at);' }],
  };
  const otherObject = {
    components: [],
    files: [{ path: 'supabase/migrations/202611120003_c.sql', content: 'alter table public.employees add column note text;' }],
  };
  assert.equal(findOverlaps(left, sameObject).conflicts, true);
  assert.equal(findOverlaps(left, otherObject).conflicts, false);
  assert.equal(findOverlaps(
    { components: [], files: [{ path: 'src/app/roster/page.tsx' }] },
    { components: [], files: [{ path: 'src/app/roster/page.tsx' }] },
  ).conflicts, true);
});

test('direct Copilot PRs without controller metadata cannot bypass actual-path overlap checks', () => {
  const manual = {
    number: 73, user: { login: 'Copilot' }, body: '',
    files: [{ path: 'tools/agent-controller/listener.mjs' }],
  };
  const active = {
    number: 72, body: '<!-- butterbox-components: ["agent-controller"] -->',
    files: [{ path: 'tools/agent-controller/listener.mjs' }],
  };
  const conflicts = pullRequestConflicts(manual, [active]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].paths, ['tools/agent-controller/listener.mjs']);
});

test('expired reservations remain blocking until verified safe release', () => {
  const candidate = { issue: 20, digest: 'b'.repeat(64), components: ['agent-controller'] };
  const leases = [{
    issue: 19, digest: 'a'.repeat(64), components: ['agent-controller'],
    expiresAt: '2026-01-01T00:00:00.000Z', pullRequest: 'https://github.com/farbotkol/butterbox/pull/42',
  }];
  const conflicts = leaseConflicts(leases, candidate, Date.parse('2026-01-02T00:00:00Z'));
  assert.equal(conflicts[0].reason, 'expired_unreconciled_lease');
  assert.equal(canReleaseLease(leases[0], { verified: true, pullRequestOpen: true }), false);
  assert.equal(canReleaseLease(leases[0], { verified: false, safeCancellation: true }), false);
  assert.equal(canReleaseLease(leases[0], { verified: true, pullRequestMerged: true }), true);
  assert.equal(canReleaseLease(leases[0], { verified: true, safeCancellation: true }), true);
});

test('reservation writes are atomic: conflicting work loses a race while disjoint areas coexist', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'component-leases-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new StateStore(directory);
  await store.init();
  const candidate = (issue, component) => ({
    number: issue, digest: String(issue).repeat(64).slice(0, 64), workstream: 'roadmap',
    components: [component],
  });
  const same = await Promise.allSettled([
    store.reserveComponents(candidate(41, 'agent-controller'), 'autonomous'),
    store.reserveComponents(candidate(42, 'agent-controller'), 'autonomous'),
  ]);
  assert.equal(same.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(same.find(result => result.status === 'rejected').reason.code, 'component_reservation_conflict');

  const disjoint = await Promise.all([
    store.reserveComponents(candidate(43, 'application:roster'), 'autonomous'),
    store.reserveComponents(candidate(44, 'application:reports'), 'autonomous'),
  ]);
  assert.equal(disjoint.length, 2);
});

test('stale active PR leases are renewed; API failures never reclaim ownership', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'component-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new StateStore(directory);
  await store.init();
  await store.saveComponentLeases([{
    issue: 51, digest: 'c'.repeat(64), workstream: 'roadmap', mode: 'autonomous',
    components: ['agent-controller'], acquiredAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T00:01:00.000Z',
    status: 'active', pullRequest: 'https://github.com/farbotkol/butterbox/pull/52',
  }]);
  await store.reconcileComponents(async () => ({
    verified: true, pullRequestOpen: true, pullRequest: 'https://github.com/farbotkol/butterbox/pull/52',
  }), 60_000);
  let leases = await store.readComponentLeases();
  assert.equal(leases.length, 1);
  assert.ok(Date.parse(leases[0].expiresAt) > Date.now());
  leases[0].expiresAt = '2026-01-01T00:01:00.000Z';
  await store.saveComponentLeases(leases);
  await store.reconcileComponents(async () => { throw new Error('GitHub unavailable'); });
  assert.equal((await store.readComponentLeases()).length, 1);
});

test('crash recovery marks the run interrupted but does not release its active PR lease', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'component-crash-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new StateStore(directory);
  await store.init();
  const task = {
    number: 55, digest: 'd'.repeat(64), workstream: 'roadmap', components: ['agent-controller'],
    dependsOn: [],
  };
  await store.reserveComponents(task, 'autonomous');
  await store.reserve(task, 'autonomous');
  const local = await store.read(task.number);
  local.status = 'running';
  local.pullRequest = 'https://github.com/farbotkol/butterbox/pull/56';
  await store.save(local);
  let leases = await store.readComponentLeases();
  leases[0].expiresAt = '2026-01-01T00:01:00.000Z';
  await store.saveComponentLeases(leases);

  await store.recoverRuns({ autonomous: true });
  assert.equal((await store.read(task.number)).status, 'interrupted');
  const changes = await store.reconcileComponents(async () => ({
    verified: true, pullRequestOpen: true, pullRequest: local.pullRequest,
  }), 60_000);
  assert.equal(changes[0].action, 'renewed');
  assert.equal((await store.readComponentLeases()).length, 1);
});

test('the autonomous queue runs disjoint eligible issues concurrently within its configured bound', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'component-queue-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cwd = path.join(directory, 'checkout');
  await mkdir(cwd);
  const store = new StateStore(path.join(directory, 'state'));
  await store.init();
  const taskIssue = (number, component) => ({
    number, state: 'open', user: { login: 'farbotkol', id: OWNER_ID, type: 'User' },
    assignees: [{ login: 'Copilot' }], labels: [{ name: LABEL }],
    body: `/butterbox run\n\n\`\`\`json\n${JSON.stringify({
      workstream: 'roadmap', task: 'Synthetic task', components: [component],
    })}\n\`\`\``,
  });
  const exec = async (_command, args) => ({
    'remote get-url origin': 'https://github.com/farbotkol/butterbox.git',
    'rev-parse --show-toplevel': cwd,
    'branch --show-current': BRANCH,
    'rev-parse HEAD': 'a'.repeat(40),
  }[args.join(' ')] ?? '');
  const controller = new Controller({
    store,
    config: {
      profiles: { roadmap: { cwd, branch: BRANCH } },
      autonomous: { taskRoot: path.join(directory, 'tasks'), maxConcurrentTasks: 2 },
    },
    github: {
      identity: async () => {},
      issues: async () => [taskIssue(61, 'application:roster'), taskIssue(62, 'application:reports')],
    },
    exec,
    mode: 'autonomous',
    enabled: true,
    autonomousEnabled: true,
  });
  let active = 0;
  let maximum = 0;
  controller.consider = async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return 'executed';
  };
  const result = await controller.tick();
  assert.deepEqual(result, { eligible: 2, executed: 2 });
  assert.equal(maximum, 2);
});
