import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessHandoff, competingWriters, taskMarker, development } from '../tools/delivery-controller/handoff.mjs';
import { advanceAcceptance, firstAcceptanceCompleted, issueDigest, proofFor, readTaskDetails, planAcceptancePrMetadata } from '../tools/delivery-controller/acceptance.mjs';
import { LEASE_REF } from '../tools/delivery-controller/lease.mjs';

const repository = 'farbotkol/butterbox';
const { path, bytes } = proofFor(305);
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const merge = 'c'.repeat(40);
const blob = 'd'.repeat(40);
const tagSha = 'e'.repeat(40);
const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891';
const at = '2024-11-22T00:00:00Z';
const ended = '2024-11-22T00:05:00Z';
const mergedAt = '2024-11-22T00:10:00Z';
const issue = { number: 305, state: 'open', title: 'Test A', body: '## Acceptance criteria', updated_at: at };
const record = { version: 1, runId: 'actions_123_1', issue: 305, issueDigest: issueDigest(issue), baseSha: base, startedAt: at };
const lease = { ...record, tagSha };
const task = {
  id: taskId, state: 'completed', session_count: 1, artifacts: [{ provider: 'github', type: 'pull', data: { id: 9999 } }],
  sessions: [{ id: sessionId, state: 'completed', task_id: taskId, base_ref: development, head_ref: 'copilot/proof',
    prompt: 'Work\n' + taskMarker(lease.runId) }],
};

function fixture(overrides = {}) {
  let currentTag = tagSha;
  let reads = 0;
  const events = [];
  const effects = [];
  const reports = [];
  const state = {
    issue: { ...issue },
    task: structuredClone(task),
    pr: {
      id: 9999, number: 401, changed_files: 1, state: 'open', merged: false, draft: true,
      mergeable: true, mergeable_state: 'clean', node_id: 'pr-node',
      body: 'Refs #305\n<!-- butterbox-issue: 305 -->\n<!-- butterbox-evidence: ' + path + ' -->',
      title: 'Add proof', auto_merge: null, requested_reviewers: [], requested_teams: [],
      base: { ref: development, sha: base, repo: { full_name: repository } },
      head: { ref: 'copilot/proof', sha: head, repo: { full_name: repository } },
    },
    checks: ['verify', 'database-smoke'].map((name, index) => ({
      id: 100 + index, name, app: { slug: 'github-actions', id: 15368 },
      status: 'completed', conclusion: 'success', head_sha: head, started_at: at, completed_at: ended,
      html_url: 'https://github.com/' + repository + '/actions/runs/123/job/' + (100 + index),
    })),
    tip: base,
    proof: { type: 'file', encoding: 'base64', content: bytes.toString('base64'), sha: blob },
    files: [{ filename: path, status: 'added', sha: blob }],
    ...overrides,
  };
  const gh = async (route, method = 'GET', data) => {
    if (method === 'PATCH' && route === '/pulls/401') {
      effects.push('metadata');
      if (state.failMetadataPatch) throw new Error('PR metadata PATCH failed');
      if (state.mutateBeforeMetadataPatch) state.mutateBeforeMetadataPatch(state);
      state.pr.body = data.body;
      if (state.corruptMetadataReply) return { ...state.pr, body: 'unexpected' };
      return structuredClone(state.pr);
    }
    if (method === 'PUT' && route === '/pulls/401/merge') {
      assert.equal(data.sha, head);
      assert.equal(data.merge_method, 'squash');
      effects.push('merge');
      Object.assign(state.pr, { state: 'closed', merged: true, merged_at: mergedAt, merge_commit_sha: merge,
        merged_by: { id: 41898282 } });
      state.tip = merge;
      return { merged: true, sha: merge };
    }
    if (method === 'PATCH' && route === '/issues/305') {
      effects.push('close');
      Object.assign(state.issue, data);
      events.push({ event: 'closed', actor: { id: 41898282 }, commit_id: null });
      if (state.losePatchResponse) throw new Error('PATCH response lost');
      return structuredClone(state.issue);
    }
    assert.equal(method, 'GET');
    if (route === '/issues/305') return structuredClone(state.issue);
    if (route === '/pulls/401') return structuredClone(state.pr);
    if (route === '/pulls/401/files?per_page=2') return state.files;
    if (route.startsWith('/contents/' + path)) return state.proof;
    if (route.startsWith('/commits/' + head + '/check-runs')) return {
      total_count: state.checkCount ?? state.checks.length, check_runs: state.checks,
    };
    if (route.startsWith('/commits/' + merge)) return { sha: merge, parents: [{ sha: base }], files: state.files };
    if (route.startsWith('/git/ref/heads/')) return { object: { sha: state.tip, type: 'commit' } };
    if (route.startsWith('/compare/')) return { status: 'ahead', merge_base_commit: { sha: base } };
    if (route.startsWith('/rules/branches/')) return [
      { type: 'pull_request', parameters: { allowed_merge_methods: ['squash'] } },
      { type: 'required_status_checks', parameters: { required_status_checks: ['verify', 'database-smoke']
        .map(context => ({ context, integration_id: 15368 })) } },
    ];
    throw new Error('Unexpected route ' + route);
  };
  const paged = async route => {
    if (route === '/issues/305/events') return events;
    if (route.startsWith('/pulls?state=open')) return state.openPRs ?? (state.pr.state === 'open' ? [state.pr] : []);
    if (route.startsWith('/pulls?state=closed')) return [state.pr];
    throw new Error('Unexpected paged route ' + route);
  };
  const leaseApi = {
    async getRef(ref) {
      assert.equal(ref, LEASE_REF);
      reads++;
      if (state.replaceLease && reads > 1) currentTag = 'f'.repeat(40);
      if (!currentTag) throw Object.assign(new Error('not found'), { status: 404 });
      return { object: { sha: currentTag, type: 'tag' } };
    },
    async getTag() { return { tag: 'butterbox-controller-lease', message: JSON.stringify(record) }; },
    async deleteRef() { effects.push('release'); currentTag = null; },
  };
  const run = () => advanceAcceptance({
    repository, gh, paged, leaseApi, lease, runId: 'actions_124_1',
    tasksApi: {
      list: async () => [{ id: taskId, state: state.task.state }, ...(state.otherTasks ?? [])],
      get: async id => id === taskId ? state.task : state.otherTasks.find(row => row.id === id),
    },
    approval: async () => ({ issue: { ...state.issue }, approved: !state.revoked }),
    repairBusy: async () => Boolean(state.repair),
    readyPull: async (id, sha) => {
      assert.equal(id, 'pr-node');
      assert.equal(sha, head);
      state.pr.draft = false;
      effects.push('ready');
    },
    report: line => reports.push(line),
  });
  return { run, effects, reports, state, events };
}

test('draft, exact-head protected squash, audited close, then release in order', async () => {
  const { run, effects, state, events } = fixture();
  assert.equal(firstAcceptanceCompleted(state.issue, events), false);
  await run();
  assert.deepEqual(effects, ['ready']);
  await run();
  assert.deepEqual(effects, ['ready', 'merge']);
  assert.equal(firstAcceptanceCompleted(state.issue, events), false);
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
  assert.equal(firstAcceptanceCompleted(state.issue, events), true);
  assert.match(state.issue.body, /Completed sessions .*\nPR #401.*squash/);
  assert.equal(firstAcceptanceCompleted(state.issue, []), false);
});


test('accepts a prose issue reference without requiring a standalone Refs line', async () => {
  const { run, effects, state } = fixture();
  state.pr.body = '## Issue closure\n\nRefs #305. No closing keyword; runtime acceptance is pending.\n' +
    '<!-- butterbox-issue: 305 -->\n<!-- butterbox-evidence: ' + path + ' -->';
  await run();
  assert.deepEqual(effects, ['ready']);
});

test('repairs missing metadata only after verified task, file, CI, lease and approval; rechecks then returns', async () => {
  const { run, effects, state, reports } = fixture();
  state.pr.body = '## Issue closure\n\nRefs #305. No closing keyword; runtime acceptance is pending.';
  await run();
  assert.deepEqual(effects, ['metadata']);
  assert.match(state.pr.body, /<!-- butterbox-issue: 305 -->/);
  assert.match(state.pr.body, /<!-- butterbox-evidence: docs\/agent-work\/autonomy-acceptance-a.md -->/);
  assert.equal((state.pr.body.match(/Refs #305/g) ?? []).length, 1);
  assert.match(reports[0], /^PR_METADATA_REPAIRED #401/);
  await run();
  assert.deepEqual(effects, ['metadata', 'ready']);
  await run();
  assert.deepEqual(effects, ['metadata', 'ready', 'merge']);
  await run();
  assert.deepEqual(effects, ['metadata', 'ready', 'merge', 'close', 'release']);
});

test('repairs missing references using independently verified lease issue when body has no issue reference', async () => {
  const { run, effects, state } = fixture();
  state.pr.body = 'Only the approved proof file changed.';
  await run();
  assert.deepEqual(effects, ['metadata']);
  assert.match(state.pr.body, /\nRefs #305\n/);
  assert.equal(planAcceptancePrMetadata(state.pr.body, 305, path).changed, false);
});

test('rejects contradictory or duplicated metadata, closing references, and nonapproved proof paths', async () => {
  for (const body of [
    'Refs #306', 'Related to #306, Refs #305', 'Fixes #305',
    'Refs #305\n<!-- butterbox-issue: 306 -->',
    'Refs #305\n<!-- butterbox-evidence: docs/agent-work/autonomy-acceptance-b.md -->',
    'Refs #305\n<!-- butterbox-issue: 305 -->\n<!-- butterbox-issue: 305 -->',
    'Refs #305\n<!-- butterbox-evidence: missing -->\n<!-- butterbox-evidence: ' + path + ' -->',
    'Refs #305\n<!-- butterbox-issue: 305',
  ]) {
    const { run, effects, state } = fixture();
    state.pr.body = body;
    await assert.rejects(run(), /conflicting|duplicate|malformed|closing/);
    assert.deepEqual(effects, []);
  }
  assert.throws(() => planAcceptancePrMetadata('Refs #305', 305,
    'docs/agent-work/autonomy-acceptance-b.md'), /Unapproved/);
});

test('metadata repair fails closed if independent evidence changes or the PATCH is not confirmed', async () => {
  for (const [mutate, error] of [
    [s => { s.proof = null; }, /approved proof/],
    [s => { s.checks[0].conclusion = 'failure'; }, /exact-head check/],
    [s => { s.revoked = true; }, /approval/],
    [s => { s.openPRs = [s.pr, { ...s.pr, id: 10001, number: 402 }]; }, /Competing/],
    [s => { s.corruptMetadataReply = true; }, /exact metadata repair/],
    [s => { s.failMetadataPatch = true; }, /PATCH failed/],
  ]) {
    const { run, effects, state } = fixture();
    state.pr.body = 'Refs #305. Existing prose reference.';
    mutate(state);
    await assert.rejects(run(), error);
    assert(!effects.includes('ready') && !effects.includes('merge'));
  }
});

test('a lost closure response is recoverable with the same audit and exact lease', async () => {
  const { run, effects, state } = fixture();
  await run();
  await run();
  state.losePatchResponse = true;
  await assert.rejects(run(), /PATCH response lost/);
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
});

test('absent merge SHA in the newer REST representation, unverified close and wrong merge actor retain lease', async () => {
  for (const mutate of [
    ({ pr }) => { delete pr.merge_commit_sha; },
    ({ pr }) => { pr.merged_by.id = 11307166; },
    ({ issue: row }) => { row.state = 'closed'; },
  ]) {
    const { run, effects, state } = fixture();
    await run();
    await run();
    mutate(state);
    await assert.rejects(run(), /merge_commit_sha|closure and audit evidence/);
    assert.deepEqual(effects, ['ready', 'merge']);
  }
});

test('base drift, missing proof, truncation, failed or pending retry and competing writers stop mutations', async () => {
  const invalid = [
    [s => { s.tip = merge; }, /pinned Development SHA/],
    [s => { s.proof = null; }, /approved proof/],
    [s => { s.checkCount = 101; }, /Incomplete check-run/],
    [s => { s.checks[0].head_sha = base; }, /exact-head check/],
    [s => { s.checks.push({ ...s.checks[0], id: 109, conclusion: 'failure' }); }, /exact-head check/],
    [s => { s.checks.push({ ...s.checks[1], id: 109, status: 'in_progress' }); }, /exact-head check/],
    [s => { s.openPRs = [...[s.pr], { ...s.pr, number: 402, id: 10000 }]; }, /Competing Development PR/],
    [s => { s.openPRs = [{ number: 401 }]; }, /Incomplete open Development PR/],
    [s => { s.replaceLease = true; }, /lease changed/],
    [s => { s.repair = true; }, /CI repair/],
    [s => { s.revoked = true; }, /approval/],
    [s => { s.pr.body += '\nFixes #290'; }, /closing reference/],
  ];
  for (const [mutate, expected] of invalid) {
    const { run, effects, state } = fixture();
    mutate(state);
    await assert.rejects(run(), expected);
    assert.deepEqual(effects, []);
  }
});

test('later successful CI retry is accepted, later historical failures stay separate from merge-time CI', async () => {
  const { run, state, effects } = fixture();
  state.checks.push({ ...state.checks[0], id: 109, conclusion: 'failure' }, { ...state.checks[0], id: 110 });
  await run();
  await run();
  state.checks.push({ ...state.checks[0], id: 111, started_at: '2024-11-22T00:11:00Z', conclusion: 'failure' });
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
});

test('stalled, idle owner, ambiguous sessions, missing artifact and competing tasks retain the lease', () => {
  const assess = (tasks, now) => assessHandoff({ lease, tasks, openPRs: [], issue, now });
  const copy = id => ({ ...task, id, sessions: [{ ...task.sessions[0], task_id: id }] });
  const otherId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892';
  for (const tasks of [
    [{ ...task, state: 'in_progress' }], [{ ...task, state: 'idle' }], [task, copy(otherId)],
    [{ ...task, session_count: 2 }], [{ ...task, artifacts: [] }],
    [{ ...task, sessions: [{ ...task.sessions[0], prompt: taskMarker(lease.runId + '4') }] }],
    [task, { id: otherId, state: 'waiting_for_user', sessions: [], session_count: 0 }],
  ]) assert.equal(assess(tasks, Date.parse(at) + 13 * 3600000).action, 'RETAIN_LEASE');
  assert.equal(assess([task, { id: otherId, state: 'idle', sessions: [], session_count: 0 }]).action, 'VERIFY_PR');
  const failed = { ...task, state: 'failed', artifacts: [], sessions: [{ ...task.sessions[0], state: 'failed' }] };
  assert.equal(assess([failed], Date.parse(at) + 12 * 3600000 - 1).action, 'RETAIN_LEASE');
  assert.equal(assess([failed], Date.parse(at) + 12 * 3600000).action, 'PARK_VERIFIED');
});

test('controller cycles serialize competing launches and gate B on audited A closure and lease release', async () => {
  const { runAcceptanceCycle } = await import('../tools/delivery-controller/run-autonomy.mjs');
  const labels = ['autonomy-ready', 'p0', 'dependencies-cleared'].map(name => ({ name }));
  const rows = new Map([305, 306].map(number => [number, { ...issue, number, labels, title: 'Acceptance ' + number }]));
  const events = [];
  const tags = new Map();
  const launched = [];
  let activeRef;
  const leaseApi = {
    async getRef(ref) {
      if (ref !== LEASE_REF || !activeRef) throw Object.assign(new Error('missing'), { status: 404 });
      return { object: { type: 'tag', sha: activeRef } };
    },
    async getTag(sha) { return tags.get(sha); },
    async createTag(payload) {
      const sha = String(tags.size + 1).repeat(40);
      tags.set(sha, payload);
      return { sha };
    },
    async createRef({ sha }) {
      if (activeRef) throw Object.assign(new Error('conflict'), { status: 422 });
      activeRef = sha;
    },
  };
  const gh = async route => {
    if (route.startsWith('/git/ref/heads/')) return { object: { type: 'commit', sha: base } };
    if (route.startsWith('/issues/')) return rows.get(Number(route.split('/').at(-1)));
    throw new Error('Unexpected ' + route);
  };
  const tasksApi = {
    list: async ({ states } = {}) => {
      if (states) {
        assert.deepEqual(states, ['queued', 'in_progress']);
        return [];
      }
      return launched.length ? [{ id: taskId, state: 'completed' }] : [];
    },
    get: async () => ({
      ...task, state: 'completed', // POST is acknowledged, but the task is not live yet.
    }),
    create: async ({ prompt }) => { launched.push(prompt); return { id: taskId }; },
  };
  const run = number => runAcceptanceCycle({
    repository, gh, paged: async route => route.startsWith('/issues/305/events') ? events : [],
    tasksApi, leaseApi, runId: 'actions_' + number + '_1', report: () => {},
    approval: async number => ({ issue: rows.get(number), approved: true }), repairBusy: async () => false,
  });
  rows.get(305).labels = [];
  await run(120);
  assert.deepEqual(launched, []);
  rows.get(305).labels = labels;
  const concurrent = await Promise.allSettled([run(121), run(122)]);
  assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
  assert.equal(launched.length, 1);
  assert.match(launched[0], /issue #305 only/);
  assert.ok(activeRef); // An ambiguous independent GET must preserve the lease.
  const first = rows.get(305);
  const owningRun = JSON.parse(tags.get(activeRef).message).runId;
  first.state = 'closed';
  first.state_reason = 'completed';
  first.body += '\n\n<!-- butterbox-autonomy-reconciled:v1 -->\n\nIssue #305 · lease ' +
    owningRun + ' · task ' + taskId + '\nCompleted sessions ' + sessionId + '\nPR #401 · head ' + head +
    ' · squash ' + merge + ' · proof blob ' + blob +
    '\nReconciliation https://github.com/farbotkol/butterbox/actions/runs/124';
  events.push({ event: 'closed', actor: { id: 41898282 }, commit_id: null });
  await run(123);
  assert.equal(launched.length, 1);
  activeRef = null; // The protected closure-to-release transition is verified in the lifecycle test above.
  await assert.rejects(run(124), /not confirmed active/);
  assert.equal(launched.length, 2);
  assert.match(launched[1], /issue #306 only/);
});


test('a failed parent with a stale-looking queued session still blocks and reports only IDs and states', () => {
  const candidate = {
    ...task, state: 'failed', updated_at: '2026-11-12T21:50:55.109Z',
    sessions: [{ ...task.sessions[0], state: 'queued', created_at: '2026-11-12T21:50:54.530Z',
      updated_at: '2026-11-12T21:50:54.530Z', completed_at: null, prompt: 'private prompt' }],
  };
  assert.deepEqual(competingWriters([candidate]), [{
    taskId, state: 'failed', reason: 'conflicting_task_and_session_states',
    sessions: [{ id: sessionId, state: 'queued' }],
  }]);
  assert.deepEqual(competingWriters([{ ...candidate, state: 'idle',
    sessions: [{ ...candidate.sessions[0], state: 'idle' }] }]), []);
  assert.deepEqual(competingWriters([{ ...candidate, state: 'in_progress', sessions: [], session_count: 0 }]),
    [{ taskId, state: 'in_progress', reason: 'active_task', sessions: [] }]);
  assert.throws(() => competingWriters([{ ...candidate, session_count: 2 }]), /session snapshot/);
});

test('dispatch checks only queued and in-progress tasks before acquiring a lease', async () => {
  const { runAcceptanceCycle } = await import('../tools/delivery-controller/run-autonomy.mjs');
  const reports = [];
  const row = { id: taskId, state: 'queued' };
  await runAcceptanceCycle({
    repository,
    gh: async route => route.startsWith('/git/ref/heads/') ? { object: { type: 'commit', sha: base } } : issue,
    paged: async () => [],
    tasksApi: {
      list: async options => {
        assert.deepEqual(options, { states: ['queued', 'in_progress'] });
        return [row];
      },
      get: async () => ({ ...task, ...row,
        sessions: [{ ...task.sessions[0], state: 'queued', prompt: 'private prompt' }] }),
      create: async () => assert.fail('dispatch attempted'),
    },
    leaseApi: {
      getRef: async () => { throw Object.assign(new Error('not found'), { status: 404 }); },
      createTag: async () => assert.fail('lease acquisition attempted'),
    },
    runId: 'actions_124_1', repairBusy: async () => false, report: line => reports.push(line),
  });
  const [diagnostic, blocked] = reports;
  assert.match(diagnostic, /COPILOT_WRITER_BLOCK: .*active_task/);
  assert.ok(diagnostic.includes(taskId) && diagnostic.includes(sessionId));
  assert.ok(!diagnostic.includes('private prompt'));
  assert.equal(blocked, 'REPORT_BLOCKED: Existing Copilot task may still be writing');
});


test('writer gate distinguishes stopped and idle pairs from resumable sessions and multiple competing agents', () => {
  const withStates = (taskState, sessionState) => ({
    ...task, state: taskState, sessions: [{ ...task.sessions[0], state: sessionState }],
  });
  for (const state of ['failed', 'completed', 'idle']) {
    assert.deepEqual(competingWriters([withStates(state, state)]), []);
  }
  for (const state of ['queued', 'waiting_for_user', 'in_progress']) {
    const [blocker] = competingWriters([withStates('failed', state)]);
    assert.equal(blocker.reason, 'conflicting_task_and_session_states');
    assert.equal(blocker.sessions[0].state, state);
  }
  const otherTaskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892';
  const otherSessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567893';
  const other = {
    ...task, id: otherTaskId, state: 'in_progress',
    sessions: [{ ...task.sessions[0], id: otherSessionId, task_id: otherTaskId, state: 'in_progress' }],
  };
  assert.deepEqual(competingWriters([withStates('failed', 'queued'), other]).map(row => row.taskId),
    [taskId, otherTaskId]);
});

test('the task list and detail must agree before writer classification', async () => {
  for (const detail of [{ ...task, state: 'failed' }, { ...task, id: sessionId }]) {
    await assert.rejects(readTaskDetails({
      list: async () => [{ id: taskId, state: 'completed' }],
      get: async () => detail,
    }), /changed during independent verification/);
  }
  await assert.rejects(readTaskDetails({
    list: async () => [task, task],
    get: async () => assert.fail('ambiguous list should halt before detail requests'),
  }), /ambiguous Copilot task list/);
});

test('task inventory avoids safe full snapshots but fetches uncertain and contradictory summaries', async () => {
  const known = structuredClone(task);
  const failedId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567893';
  const failed = { ...known, id: failedId, state: 'failed',
    sessions: [{ ...known.sessions[0], task_id: failedId, state: 'queued' }] };
  const pending = { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567892', state: 'in_progress' };
  const fetched = [];
  const rows = [known, failed, pending];
  const details = await readTaskDetails({
    list: async () => rows,
    get: async id => {
      fetched.push(id);
      return id === failed.id ? failed : { ...pending, session_count: 0, sessions: [], artifacts: [] };
    },
  });
  assert.deepEqual(fetched.sort(), [failed.id, pending.id].sort());
  assert.equal(details[0], known);
  assert.deepEqual(competingWriters(details).map(row => row.taskId), [failed.id, pending.id]);
});

test('task inventory fetches terminal summaries without child evidence and fails closed on GET errors', async () => {
  const rows = [{ id: taskId, state: 'completed' }];
  await assert.rejects(readTaskDetails({
    list: async () => rows,
    get: async () => { throw Object.assign(new Error('HTTP 403'), { status: 403 }); },
  }), /HTTP 403/);
});

test('task inventory never runs more than three simultaneous detail calls', async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: 'a1b2c3d4-e5f6-7890-abcd-' + String(index + 1).padStart(12, '0'),
    state: 'in_progress',
  }));
  let active = 0;
  let peak = 0;
  const result = await readTaskDetails({
    list: async () => rows,
    get: async id => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return { id, state: 'in_progress', sessions: [], session_count: 0, artifacts: [] };
    },
  });
  assert.equal(result.length, 10);
  assert.equal(peak, 3);
});

test('writer inventory applies requested states before any task detail reads', async () => {
  const rows = [{ id: taskId, state: 'queued' }];
  let reads = 0;
  const result = await readTaskDetails({
    list: async ({ states }) => {
      assert.deepEqual(states, ['queued', 'in_progress']);
      return rows;
    },
    get: async id => {
      reads++;
      return { id, state: 'queued', session_count: 0, sessions: [], artifacts: [] };
    },
  }, { states: ['queued', 'in_progress'] });
  assert.equal(reads, 1);
  assert.equal(result.length, 1);
  await assert.rejects(readTaskDetails({
    list: async () => [{ id: taskId, state: 'failed' }],
    get: async () => assert.fail('must not fetch excluded task'),
  }, { states: ['queued', 'in_progress'] }), /does not match requested states/);
});

test('Copilot API lists only queued and in-progress from server, rejects out-of-filter results', async () => {
  const { agentTasksApi } = await import('../tools/delivery-controller/agent-tasks-api.mjs');
  const urls = [];
  const api = agentTasksApi({
    token: 'test-token', repository,
    request: async url => {
      urls.push(url);
      return { ok: true, json: async () => ({ tasks: [{ id: taskId, state: 'queued' }] }),
        headers: { get: () => null } };
    },
  });
  const tasks = await api.list({ states: ['queued', 'in_progress'] });
  assert.equal(tasks.length, 1);
  assert.match(urls[0], /[?&]state=queued,in_progress/);
  await assert.rejects(api.list({ states: ['completed'] }), /Unsupported Copilot writer state filter/);
});
