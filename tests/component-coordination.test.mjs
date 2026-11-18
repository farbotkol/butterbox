import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BRANCH, LABEL, OWNER_ID, Controller, StateStore, parseTask } from '../tools/agent-controller/listener.mjs';
import {
  canReleaseLease, componentOverlap, componentsForFiles, declaredComponents, findOverlaps, leaseConflicts,
  filesWithinComponents, normalizeComponents, pullRequestAdvisories, pullRequestConflicts,
  databaseObjectsForFiles,
} from '../tools/agent-controller/component-coordination.mjs';

test('component metadata is validated and paths map to isolated work areas', () => {
  assert.deepEqual(normalizeComponents(['agent-controller', 'ci:verify-yml', 'agent-controller']),
    ['agent-controller', 'ci:verify-yml']);
  assert.equal(normalizeComponents(['not-a-component']), null);
  assert.deepEqual(componentsForFiles(['tools/agent-controller/listener.mjs']), ['agent-controller']);
  assert.deepEqual(componentsForFiles(['.github/workflows/ci.yml']), ['ci:ci-yml']);
  assert.deepEqual(componentsForFiles(['docs/agent-work/issues/issue-12/pr-34/attempt-01.md']),
    ['evidence:issue-12-pr-34']);
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

test('broad application, test-suite, and evidence ownership remains advisory', () => {
  const cases = [
    [
      { number: 271, body: '', files: [{ path: 'src/app/settings/profile/page.tsx' }] },
      { number: 269, body: '', files: [{ path: 'src/app/settings/security/page.tsx' }] },
      'application:settings',
    ],
    [
      { number: 271, body: '', files: [{ path: 'tests/e2e/auth.spec.mjs' }] },
      { number: 269, body: '', files: [{ path: 'tests/unit/auth.spec.mjs' }] },
      'test:auth',
    ],
    [
      { number: 271, body: '', files: [{ path: 'docs/agent-work/issues/issue-91/pr-271/attempt-01.md' }] },
      { number: 269, body: '', files: [{ path: 'docs/agent-work/issues/issue-91/pr-269/attempt-01.md' }] },
      undefined,
    ],
    [
      { number: 271, body: '<!-- butterbox-components: ["repository-wide"] -->',
        files: [{ path: 'src/app/settings/profile/page.tsx' }] },
      { number: 269, body: '', files: [{ path: 'tools/agent-controller/listener.mjs' }] },
      'repository-wide / agent-controller',
    ],
  ];
  for (const [candidate, other, advisoryComponent] of cases) {
    assert.deepEqual(pullRequestConflicts(candidate, [other]), []);
    const advisories = pullRequestAdvisories(candidate, [other]);
    if (advisoryComponent) {
      assert.deepEqual(advisories, [{
        pullRequest: other.number,
        reason: 'broad_component_overlap',
        components: [advisoryComponent],
      }]);
    } else {
      assert.deepEqual(advisories, []);
      assert.deepEqual(componentsForFiles(candidate.files), ['evidence:issue-91-pr-271']);
      assert.deepEqual(componentsForFiles(other.files), ['evidence:issue-91-pr-269']);
    }
  }
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

test('generated Xero-sized SQL ownership remains disjoint from unrelated workflow fixes', () => {
  const migrationSql = Array.from({ length: 15 }, (_, index) =>
    `create function public.xero_claim_${index}() returns void language sql as $ select null; $;`
  ).join('\n');
  const xero = {
    number: 262, draft: true, body: '',
    files: [
      { path: 'supabase/migrations/20261115060000_xero_oauth_connections.sql', content: migrationSql },
      ...Array.from({ length: 10 }, (_, index) =>
        ({ path: `src/app/xero-area-${index}/route.ts` })),
      { path: 'tests/xero-oauth.test.mjs' },
    ],
  };
  const workflow = {
    number: 267, draft: true, body: '',
    files: [{ path: '.github/workflows/pr-coordination.yml' }],
  };
  assert.equal(normalizeComponents(Array.from({ length: 21 }, (_, i) => `application:area-${i}`)), null,
    'declared component cap must remain unchanged');
  assert.deepEqual(pullRequestConflicts(workflow, [xero]), []);
  assert.deepEqual(pullRequestConflicts(xero, [workflow]), []);

  const sameObject = {
    number: 268, draft: true, body: '',
    files: [{ path: 'supabase/migrations/20261115070000_overlap.sql',
      content: 'alter function public.xero_claim_0() owner to postgres;' }],
  };
  assert.equal(pullRequestConflicts(sameObject, [xero]).length, 1,
    'a shared SQL object must still block');
  assert.deepEqual(componentOverlap(['not-a-component'], ['ci:pr-coordination-yml']),
    ['invalid_component_metadata'], 'invalid metadata must still fail closed');
});

test('SQL policy and trigger targets are captured without crashing coordination', () => {
  const files = [{
    path: 'supabase/migrations/202611190001_policy_trigger.sql',
    content: [
      'create policy staff_read on public.employees for select using (true);',
      'create trigger audit_staff after update on public.employees for each row execute function public.audit();',
    ].join('\n'),
  }];
  const objects = databaseObjectsForFiles(files);
  assert.ok(objects.includes('database:policy:staff_read'));
  assert.ok(objects.includes('database:trigger:audit_staff'));
  assert.ok(objects.includes('database:table:public.employees'));
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

test('direct Copilot PRs sharing ordinary files receive advisories rather than automatic blocks', () => {
  const manual = {
    number: 73, user: { login: 'Copilot' }, body: '',
    files: [{ path: 'tools/agent-controller/listener.mjs' }],
  };
  const active = {
    number: 72, body: '<!-- butterbox-components: ["agent-controller"] -->',
    files: [{ path: 'tools/agent-controller/listener.mjs' }],
  };
  assert.deepEqual(pullRequestConflicts(manual, [active]), []);
  assert.ok(pullRequestAdvisories(manual, [active]).some(advisory =>
    advisory.reason === 'shared_file_overlap' &&
    advisory.paths.includes('tools/agent-controller/listener.mjs')));
});

test('unstarted empty drafts do not block unrelated or overlapping active PRs', () => {
  const emptyXero = { number: 262, draft: true, body: '', files: [] };
  const emptySms = { number: 263, draft: true, body: '', files: [] };
  const button = {
    number: 261, draft: true, body: '',
    files: [{ path: 'src/app/people/page.tsx' }],
  };
  assert.deepEqual(pullRequestConflicts(button, [emptyXero, emptySms]), []);
  assert.deepEqual(pullRequestConflicts(emptyXero, [button, emptySms]), []);
  assert.deepEqual(pullRequestConflicts(emptySms, [button, emptyXero]), []);
});

test('malformed candidate metadata and empty non-draft candidates remain blocked', () => {
  const button = {
    number: 261, draft: true, body: '',
    files: [{ path: 'src/app/people/page.tsx' }],
  };
  const invalid = { number: 262, draft: true,
    body: '<!-- butterbox-components: ["not-a-component"] -->', files: [] };
  const invalidActive = { ...invalid, files: [{ path: 'docs/xero-payroll-delivery.md' }] };
  const readyEmpty = { number: 263, draft: false, body: '', files: [] };
  assert.deepEqual(pullRequestConflicts(button, [invalid]), []);
  assert.deepEqual(pullRequestAdvisories(button, [invalid]), [
    { pullRequest: 262, reason: 'invalid_peer_component_metadata' },
  ]);
  assert.deepEqual(pullRequestConflicts(button, [invalidActive]), []);
  assert.deepEqual(pullRequestAdvisories(button, [invalidActive]), [
    { pullRequest: 262, reason: 'invalid_peer_component_metadata' },
  ]);
  const invalidDatabaseOwnership = {
    number: 265,
    draft: true,
    body: '<!-- butterbox-components: ["database:table:public.shifts", "not-a-component"] -->',
    files: [{ path: 'src/app/reports/page.tsx' }],
  };
  assert.deepEqual(pullRequestConflicts(button, [invalidDatabaseOwnership]), [
    { pullRequest: 265, reason: 'invalid_safety_critical_component_metadata' },
  ]);
  assert.deepEqual(pullRequestAdvisories(button, [invalidDatabaseOwnership]), []);
  assert.deepEqual(pullRequestConflicts(invalid, [button]), [
    { pullRequest: 262, reason: 'invalid_component_metadata' },
  ]);
  assert.deepEqual(pullRequestConflicts({ number: 264, draft: true, body: '', files: [] }, [invalid]), []);
  assert.deepEqual(pullRequestConflicts(button, [readyEmpty]), []);
  assert.deepEqual(pullRequestAdvisories(button, [readyEmpty]), [
    { pullRequest: 263, reason: 'peer_no_changed_files' },
  ]);
  assert.deepEqual(pullRequestConflicts(readyEmpty, [button]), [
    { pullRequest: 263, reason: 'no_changed_files' },
  ]);
});

test('invalid API changed-file paths fail closed with the affected PR identified', () => {
  const candidate = { number: 271, draft: true, body: '',
    files: [{ path: 'src/app/people/page.tsx' }] };
  assert.deepEqual(pullRequestConflicts({
    ...candidate, files: [{ path: '../invalid.ts' }],
  }, []), [
    { pullRequest: 271, reason: 'invalid_changed_files' },
  ]);
  assert.deepEqual(pullRequestConflicts(candidate, [{
    number: 269, draft: true, body: '', files: [{ path: '../invalid.ts' }],
  }]), [
    { pullRequest: 269, reason: 'invalid_changed_files' },
  ]);
});

test('ordinary file overlaps warn while shared migrations still block', () => {
  const button = { number: 261, draft: true, body: '',
    files: [{ path: 'src/app/people/page.tsx' }] };
  const sameFile = { number: 262, draft: true, body: '',
    files: [{ path: 'src/app/people/page.tsx' }] };
  assert.deepEqual(pullRequestConflicts(button, [sameFile]), []);
  assert.ok(pullRequestAdvisories(button, [sameFile]).some(advisory =>
    advisory.reason === 'shared_file_overlap' &&
    advisory.paths.includes('src/app/people/page.tsx')));
  const sql = { number: 263, draft: true, body: '',
    files: [{ path: 'supabase/migrations/202611180001_example.sql', content: 'alter table public.employees add column example text;' }] };
  const sameSql = { number: 264, draft: true, body: '',
    files: [{ path: 'supabase/migrations/202611180001_example.sql', content: 'alter table public.employees add column example text;' }] };
  assert.equal(pullRequestConflicts(sql, [sameSql]).length, 1);
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
