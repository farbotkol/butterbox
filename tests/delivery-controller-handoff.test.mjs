import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessHandoff, competingWriters, taskMarker, development } from '../tools/delivery-controller/handoff.mjs';
import { advanceAcceptance, firstAcceptanceCompleted, issueDigest, proofFor, readTaskDetails, planAcceptancePrMetadata } from '../tools/delivery-controller/acceptance.mjs';
import { developmentProvider } from '../tools/delivery-controller/product-acceptance.mjs';
import { runAcceptanceCycle } from '../tools/delivery-controller/run-autonomy.mjs';
import { autonomousDevelopmentMarker } from '../tools/agent-evidence/evidence.mjs';
import { LEASE_REF } from '../tools/delivery-controller/lease.mjs';

const repository = 'farbotkol/butterbox';
const { path, bytes } = proofFor(305);
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const merge = 'c'.repeat(40);
const moved = 'f'.repeat(40);
const blob = 'd'.repeat(40);
const tagSha = 'e'.repeat(40);
const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891';
const at = '2024-11-22T00:00:00Z';
const ended = '2024-11-22T00:05:00Z';
const mergedAt = '2024-11-22T00:10:00Z';
const issue = { number: 305, state: 'open', title: 'Test A', body: '## Acceptance criteria\n- Verify the approved proof.', updated_at: at };
const record = { version: 1, runId: 'actions_123_1', issue: 305, issueDigest: issueDigest(issue), baseSha: base, startedAt: at };
const lease = { ...record, tagSha };
const task = {
  id: taskId, state: 'completed', updated_at: at, session_count: 1, artifacts: [{ provider: 'github', type: 'pull', data: { id: 9999 } }],
  sessions: [{ id: sessionId, state: 'completed', task_id: taskId, base_ref: development, head_ref: 'copilot/proof',
    prompt: 'Work\n' + taskMarker(lease.runId) }],
};

function fixture(overrides = {}) {
  let currentTag = tagSha;
  let reads = 0;
  const events = [];
  const comments = [];
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
    parent: base,
    proof: { type: 'file', encoding: 'base64', content: bytes.toString('base64'), sha: blob },
    files: [{ filename: path, status: 'added', sha: blob }],
    ...overrides,
  };
  const leased = { ...lease, issue: state.issue.number, issueDigest: issueDigest(state.issue) };
  const issueRoute = '/issues/' + state.issue.number;
  const gh = async (route, method = 'GET', data) => {
    if (method === 'PATCH' && route === '/pulls/401' && data.state === 'closed') {
      effects.push('close-unmerged');
      state.pr.state = 'closed';
      state.openPRs = state.openPRs.filter(row => row.number !== 401);
      return structuredClone(state.pr);
    }
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
      state.parent = state.tip;
      state.tip = merge;
      return { merged: true, sha: merge };
    }
    if (method === 'PATCH' && route === issueRoute) {
      effects.push('close');
      Object.assign(state.issue, data);
      events.push({ event: 'closed', actor: { id: 41898282 }, commit_id: null });
      if (state.losePatchResponse) throw new Error('PATCH response lost');
      return structuredClone(state.issue);
    }
    if (method === 'POST' && route === issueRoute + '/comments') {
      const comment = { id: 123 + comments.length, body: data.body, user: { id: 41898282 },
        created_at: ended, updated_at: ended };
      comments.push(comment);
      return comment;
    }
    assert.equal(method, 'GET');
    if (route === '/actions/runs/123') return {
      id: 123, head_sha: head, path: '.github/workflows/product-criteria.yml',
      event: 'pull_request', head_repository: { full_name: repository },
    };
    if (route === issueRoute) return structuredClone(state.issue);
    if (route === '/issues/' + state.nextIssue?.number) return state.nextIssue;
    if (route === '/pulls/401') return structuredClone(state.pr);
    if (route === '/pulls/402') return structuredClone(state.humanPR);
    if (route === '/pulls/401/files?per_page=2') return state.files;
    if (route.startsWith('/contents/' + path)) return state.proof;
    if (route.startsWith('/commits/' + head + '/check-runs')) return {
      total_count: state.checkCount ?? state.checks.length, check_runs: state.checks,
    };
    if (route.startsWith('/commits/' + merge)) return { sha: merge, parents: [{ sha: state.parent }], files: state.mergedFiles ?? state.files };
    if (route.startsWith('/git/ref/heads/')) return { object: { sha: state.tip, type: 'commit' } };
    if (route.startsWith('/compare/')) {
      const target = route.split('/').at(-1).split('?')[0].split('...')[1];
      if (target === head) return { status: 'ahead', merge_base_commit: { sha: base } };
      return state.comparison ?? { status: 'ahead', base_commit: { sha: base },
        merge_base_commit: { sha: base }, ahead_by: 1, total_commits: 1,
        commits: [{ sha: moved }], files: [{ filename: 'tools/delivery-controller/acceptance.mjs', status: 'modified' }] };
    }
    if (route.startsWith('/rules/branches/')) return [
      { type: 'pull_request', parameters: { allowed_merge_methods: ['squash'], required_approving_review_count: 0, required_reviewers: [] } },
      { type: 'required_status_checks', parameters: { required_status_checks: ['verify', 'database-smoke']
        .map(context => ({ context, integration_id: 15368 })) } },
    ];
    throw new Error('Unexpected route ' + route);
  };
  const paged = async route => {
    if (route === issueRoute + '/comments') return comments;
    if (route === issueRoute + '/events') return events;
    if (route.startsWith('/issues?')) return state.nextIssue ? [state.nextIssue] : [];
    if (route.startsWith('/commits/' + merge + '/statuses')) return state.deployStatuses ?? [];
    if (route === '/pulls/401/files') return state.files;
    if (route === '/pulls/402/files') return state.humanFiles;
    if (route.startsWith('/pulls?state=open')) return state.openPRs ?? (state.pr.state === 'open' ? [state.pr] : []);
    if (route.startsWith('/pulls?state=closed')) return [state.pr];
    throw new Error('Unexpected paged route ' + route);
  };
  const leaseApi = {
    async createTag(tag) {
      if (tag.tag === 'butterbox-controller-lease') {
        state.nextLease = JSON.parse(tag.message);
        return { sha: '1'.repeat(40) };
      }
      assert.match(tag.tag, /^butterbox-controller-parked-/);
      state.parking = JSON.parse(tag.message);
      return { sha: blob };
    },
    async createRef({ ref, sha }) {
      if (ref === LEASE_REF && !currentTag) {
        currentTag = sha;
        return;
      }
      assert.equal(ref, 'refs/tags/butterbox-controller-parked-' + state.issue.number);
      assert.equal(sha, blob);
      effects.push('park');
    },
    async getRef(ref) {
      if (ref !== LEASE_REF) throw Object.assign(new Error('not found'), { status: 404 });
      reads++;
      if (state.replaceLease && reads > 1) currentTag = 'f'.repeat(40);
      if (!currentTag) throw Object.assign(new Error('not found'), { status: 404 });
      return { object: { sha: currentTag, type: 'tag' } };
    },
    async getTag(sha) {
      return { tag: 'butterbox-controller-lease', message: JSON.stringify(sha === '1'.repeat(40) ? state.nextLease : leased) };
    },
    async compareAndDeleteRef(ref, expected) {
      assert.equal(ref, LEASE_REF);
      if (state.replaceAtDelete) currentTag = 'f'.repeat(40);
      if (currentTag !== expected) throw new Error('Lease ref changed');
      effects.push('release'); currentTag = null;
    },
  };
  const controller = mergedRecovery => ({
    repository, gh, paged, leaseApi, lease: leased, closingIssues: async () => state.closingIssues ?? 0, runId: 'actions_124_1',
    mergedRecovery, now: () => state.now ?? Date.now(),
    infer: async () => state.aiResults,
    provider: state.provider,
    tasksApi: {
      list: async ({ states } = {}) => [{ id: taskId, state: state.task.state, updated_at: state.task.updated_at }, ...(state.otherTasks ?? [])].filter(row => !states || states.includes(row.state)),
      get: async id => id === taskId ? state.task : state.otherTasks.find(row => row.id === id),
      create: async ({ prompt }) => { state.nextPrompt = prompt; throw new Error('simulated unconfirmed next dispatch'); },
    },
    approval: async number => ({ issue: { ...(number === state.issue.number ? state.issue : state.nextIssue) },
      approved: !state.revoked }),
    repairBusy: async () => Boolean(state.repair),
    readyPull: async (id, sha) => {
      assert.equal(id, 'pr-node');
      assert.equal(sha, head);
      state.pr.draft = false;
      effects.push('ready');
    },
    report: line => reports.push(line),
  });
  return {
    run: (recovery = 'none') => advanceAcceptance(controller(recovery)),
    cycle: () => runAcceptanceCycle(controller('none')),
    effects, reports, state, events, comments,
  };
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

test('merged recovery verification is read-only and release is a separate guarded operation', async () => {
  const { run, effects, state, reports } = fixture();
  await assert.rejects(run('verify'), /closed issue/);
  await run();
  await run();
  state.losePatchResponse = true;
  await assert.rejects(run(), /PATCH response lost/);
  await run('verify');
  assert.deepEqual(effects, ['ready', 'merge', 'close']);
  assert.match(reports.at(-1), /MERGED_RECOVERY_VERIFIED/);
  await run('release');
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
  await assert.rejects(run('release'), /Exclusive lease changed|Lease missing/);
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
});

test('merged recovery refuses a replacement lease at the deletion boundary', async () => {
  const { run, effects, state } = fixture();
  await run();
  await run();
  state.losePatchResponse = true;
  await assert.rejects(run(), /PATCH response lost/);
  state.replaceAtDelete = true;
  await assert.rejects(run('release'), /Lease ref changed/);
  assert.deepEqual(effects, ['ready', 'merge', 'close']);
});

test('reconciles merged proof despite unrelated open PR and later Development commit', async () => {
  const { run, effects, state } = fixture();
  await run();
  await run();
  const unrelated = { ...structuredClone(state.pr), id: 10001, number: 402,
    state: 'open', head: { ...state.pr.head, ref: 'human/other', sha: moved } };
  state.openPRs = [unrelated];
  state.tip = moved;
  state.comparison = { status: 'ahead', base_commit: { sha: merge }, merge_base_commit: { sha: merge } };
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
});

test('retains the lease when the merged proof is not on current Development', async () => {
  const { run, effects, state } = fixture();
  await run();
  await run();
  state.tip = moved;
  state.comparison = { status: 'diverged', base_commit: { sha: merge }, merge_base_commit: { sha: base } };
  await assert.rejects(run(), /not an ancestor/);
  assert.deepEqual(effects, ['ready', 'merge']);
});

test('retains the lease when another open PR uses the leased task branch', async () => {
  const { run, effects, state } = fixture();
  await run();
  await run();
  state.openPRs = [{ ...structuredClone(state.pr), id: 10001, number: 402, state: 'open' }];
  await assert.rejects(run(), /leased task branch/);
  assert.deepEqual(effects, ['ready', 'merge']);
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
    [s => { s.tip = moved; s.pr.base.sha = moved; s.comparison = { status: 'diverged' }; }, /Unsafe Development movement/],
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
  const assess = tasks => assessHandoff({ lease, tasks, openPRs: [], issue });
  const copy = id => ({ ...task, id, sessions: [{ ...task.sessions[0], task_id: id }] });
  const otherId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892';
  for (const tasks of [
    [{ ...task, state: 'in_progress' }], [{ ...task, state: 'idle' }], [task, copy(otherId)],
    [{ ...task, session_count: 2 }], [{ ...task, artifacts: [] }],
    [{ ...task, sessions: [{ ...task.sessions[0], prompt: taskMarker(lease.runId + '4') }] }],
    [task, { id: otherId, state: 'waiting_for_user', sessions: [], session_count: 0 }],
  ]) assert.equal(assess(tasks).action, 'RETAIN_LEASE');
  assert.equal(assess([task, { id: otherId, state: 'idle', sessions: [], session_count: 0 }]).action, 'VERIFY_PR');
  for (const state of ['failed', 'cancelled', 'timed_out']) {
    const failed = { ...task, state, artifacts: [], sessions: [{ ...task.sessions[0], state }] };
    assert.equal(assess([failed]).action, 'PARK_VERIFIED');
    assert.equal(assess([{ ...failed, artifacts: task.artifacts }]).action, 'RETAIN_LEASE');
    assert.equal(assessHandoff({ lease, tasks: [failed], issue,
      openPRs: [{ head: { ref: 'human/unrelated' } }] }).action, 'PARK_VERIFIED');
    assert.equal(assessHandoff({ lease, tasks: [failed], issue,
      openPRs: [{ head: { ref: task.sessions[0].head_ref } }] }).action, 'RETAIN_LEASE');
  }
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
        assert.deepEqual(states, ['queued', 'in_progress', 'waiting_for_user']);
        return [];
      }
      return launched.length ? [{ id: taskId, state: 'completed', updated_at: '2099-01-01T00:00:00.000Z' }] : [];
    },
    get: async () => ({
      ...task, updated_at: '2099-01-01T00:00:00.000Z', state: 'completed', // POST is acknowledged, but the task is not live yet.
    }),
    create: async ({ prompt }) => { launched.push(prompt); return { id: taskId }; },
  };
  const run = number => runAcceptanceCycle({
    repository, gh, paged: async route => {
      if (route.startsWith('/issues?')) return [...rows.values()].filter(row => row.state === 'open');
      return route.startsWith('/issues/305/events') ? events : [];
    },
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

test('dispatch checks all potentially active task states before acquiring a lease', async () => {
  const { runAcceptanceCycle } = await import('../tools/delivery-controller/run-autonomy.mjs');
  const reports = [];
  const row = { id: taskId, state: 'queued' };
  await runAcceptanceCycle({
    repository,
    gh: async route => route.startsWith('/git/ref/heads/') ? { object: { type: 'commit', sha: base } } : issue,
    paged: async () => [],
    tasksApi: {
      list: async options => {
        assert.equal(options, undefined);
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
      assert.deepEqual(states, ['queued', 'in_progress', 'waiting_for_user']);
      return rows;
    },
    get: async id => {
      reads++;
      return { id, state: 'queued', session_count: 0, sessions: [], artifacts: [] };
    },
  }, { states: ['queued', 'in_progress', 'waiting_for_user'] });
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


test('safe forward Development drift resumes draft, merge and audited close over scheduled runs', async () => {
  const { run, effects, state, reports } = fixture();
  state.tip = moved;
  state.pr.base.sha = moved;
  await run();
  assert.deepEqual(effects, ['ready']);
  assert(reports.some(line => line.startsWith('DEVELOPMENT_DRIFT_VALIDATED')));
  await run();
  assert.deepEqual(effects, ['ready', 'merge']);
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
  assert.match(state.issue.body, /Original base .*verified squash parent/);
});

test('drift with proof overlap, truncated compare, or moving tip never mutates PR', async () => {
  for (const comparison of [
    { status: 'diverged' },
    { status: 'ahead', base_commit: { sha: base }, merge_base_commit: { sha: base },
      ahead_by: 2, total_commits: 2, commits: [{ sha: moved }], files: [] },
    { status: 'ahead', base_commit: { sha: base }, merge_base_commit: { sha: base },
      ahead_by: 1, total_commits: 1, commits: [{ sha: moved }], files: [{ filename: path, status: 'added' }] },
  ]) {
    const { run, state, effects } = fixture({ tip: moved, comparison });
    state.pr.base.sha = moved;
    await assert.rejects(run(), /Unsafe Development movement/);
    assert.deepEqual(effects, []);
  }
});


test('stale PR base at original lease permits verified forward drift and full handoff', async () => {
  const { run, effects, state, reports } = fixture({ tip: moved });
  assert.equal(state.pr.base.sha, base);
  await run();
  assert.deepEqual(effects, ['ready']);
  assert(reports.some(line => line.startsWith('STALE_PR_BASE_VALIDATED')));
  await run();
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
});

test('stale PR base outside verified ancestry cannot promote or merge', async () => {
  const { run, effects, state } = fixture({ tip: moved });
  state.pr.base.sha = '9'.repeat(40);
  await assert.rejects(run(), /Unsafe Development movement/);
  assert.deepEqual(effects, []);
});

test('invalid reported PR base fails closed', async () => {
  const { run, effects, state } = fixture({ tip: moved });
  state.pr.base.sha = null;
  await assert.rejects(run(), /reported Development base is invalid/);
  assert.deepEqual(effects, []);
});

test('scoped lease discovery excludes historical detail calls and deduplicates active candidates', async () => {
  const { readLeaseCandidates, readTaskDetails } = await import('../tools/delivery-controller/task-inventory.mjs');
  const old = Array.from({ length: 59 }, (_, i) => ({
    id: 'a1b2c3d4-e5f6-7890-abcd-' + String(i + 1).padStart(12, '0'),
    state: 'completed', session_count: 0, sessions: [], artifacts: [],
  }));
  const updated_at = '2026-11-24T00:01:00.000Z';
  const owner = { ...task, state: 'completed', updated_at };
  const waiting = { id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890',
    state: 'waiting_for_user', session_count: 0, sessions: [], artifacts: [], updated_at };
  const calls = [];
  const api = {
    list: async options => {
      calls.push(options);
      if (options?.states) return [waiting];
      if (options?.since) return [{ id: owner.id, state: owner.state, updated_at }, waiting];
      return [...old, owner, waiting];
    },
    get: async id => {
      calls.push(id);
      return id === owner.id ? owner : waiting;
    },
  };
  const scoped = await readLeaseCandidates(api, { startedAt: '2026-11-24T00:00:00.000Z' });
  assert.equal(scoped.length, 2);
  assert.deepEqual(calls[0], { since: '2026-11-23T23:55:00.000Z' });
  assert.deepEqual(calls[1], { states: ['queued', 'in_progress', 'waiting_for_user'] });
  assert.equal(calls.length, 4);
  const audited = await readTaskDetails(api);
  assert.equal(audited.length, 61);
  assert.equal(competingWriters(audited).length, 1);
});

test('filtered read-only discovery uses four HTTP GETs with 60, 100 or 1,000 historical tasks', async () => {
  const { agentTasksApi } = await import('../tools/delivery-controller/agent-tasks-api.mjs');
  const { readLeaseCandidates, readTaskDetails } = await import('../tools/delivery-controller/task-inventory.mjs');
  const since = '2026-11-23T23:55:00.000Z';
  const lease = { startedAt: '2026-11-24T00:00:00.000Z' };
  for (const volume of [60, 100, 1000]) {
    const old = Array.from({ length: volume }, (_, index) => ({
      id: 'a1b2c3d4-e5f6-7890-abcd-' + String(index + 1).padStart(12, '0'),
      state: 'completed', updated_at: '2026-11-01T00:00:00.000Z',
      session_count: 0, sessions: [], artifacts: [],
    }));
    const recent = { ...task, updated_at: since };
    const active = { id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890', state: 'queued',
      updated_at: since, session_count: 0, sessions: [], artifacts: [] };
    // Simulate a child changing without a corresponding parent version change.
    // This must remain visible to the existing mutation audit.
    const hidden = { ...old[0], session_count: 1, sessions: [{
      ...task.sessions[0], task_id: old[0].id, state: 'queued',
    }] };
    old[0] = hidden;
    const history = [...old, recent, active];
    const requests = [];
    const api = agentTasksApi({ token: 'fixture', repository, request: async (input, { method }) => {
      assert.equal(method, 'GET');
      const url = new URL(input);
      requests.push(url);
      if (!url.search) return Response.json(history.find(row => url.pathname.endsWith('/' + row.id)));
      const cutoff = url.searchParams.get('since');
      const states = url.searchParams.get('state')?.split(',');
      const filtered = history.filter(row => (!cutoff || row.updated_at >= cutoff) &&
        (!states || states.includes(row.state)));
      const page = Number(url.searchParams.get('page') ?? 1);
      const rows = filtered.slice((page - 1) * 100, page * 100);
      const headers = {};
      if (page * 100 < filtered.length) {
        url.searchParams.set('page', String(page + 1));
        headers.link = '<' + url.href + '>; rel="next"';
      }
      return Response.json({ total_count: filtered.length, tasks: rows.map(row =>
        row.id === recent.id ? { id: row.id, state: row.state, updated_at: row.updated_at } : row) }, { headers });
    } });
    const scoped = await readLeaseCandidates(api, lease);
    assert.deepEqual(scoped.map(row => row.id), [recent.id, active.id]);
    assert.equal(requests.length, 4, 'filtered GETs at ' + volume + ' historical tasks');
    requests.length = 0;
    const audited = await readTaskDetails(api);
    assert.equal(requests.length, Math.ceil(history.length / 100) + 3);
    assert.ok(competingWriters(audited).some(writer => writer.taskId === hidden.id));
  }
});

test('lease discovery rejects missing, invalid or out-of-window modification timestamps', async () => {
  const { readLeaseCandidates } = await import('../tools/delivery-controller/task-inventory.mjs');
  for (const updated_at of [undefined, 'unknown', '2026-11-23T23:54:59.999Z']) {
    await assert.rejects(readLeaseCandidates({
      list: async () => [{ id: taskId, state: 'completed', updated_at }],
      get: async () => assert.fail('must reject before hydrating'),
    }, { startedAt: '2026-11-24T00:00:00.000Z' }), /recent inventory/);
  }
});

test('durable inventory bootstrap and restart retain unresolved and leased IDs at every history size', async () => {
  const { agentTasksApi } = await import('../tools/delivery-controller/agent-tasks-api.mjs');
  const { readLeaseCandidates, withTaskInventory, rememberLeaseTask } = await import('../tools/delivery-controller/task-inventory.mjs');
  for (const volume of [60, 100, 1000]) {
    let now = Date.parse('2026-11-24T00:00:00Z');
    let saved = null;
    let writes = 0;
    const store = {
      async readInventory() { return saved; },
      async writeInventory(expected, record) {
        assert.equal(expected, saved?.sha ?? '');
        saved = { sha: String(++writes).padStart(40, '0'), record };
      },
    };
    const liveLease = { ...lease, startedAt: new Date(now).toISOString() };
    const old = Array.from({ length: volume }, (_, index) => ({
      id: '01234567-89ab-cdef-0123-' + String(index).padStart(12, '0'),
      state: 'completed', updated_at: '2026-01-01T00:00:00Z', archived: index % 2 === 0,
      session_count: 0, sessions: [], artifacts: [],
    }));
    const owned = { ...task, updated_at: new Date(now).toISOString(), archived: false };
    const unresolved = old[0];
    unresolved.sessions = [{ id: sessionId, task_id: unresolved.id, state: 'queued' }];
    unresolved.session_count = 1;
    const history = [...old, owned];
    const requests = [];
    let failArchive = false;
    const adapter = () => agentTasksApi({ token: 'fixture', repository, report: () => {},
      request: async (input, { method }) => {
        assert.equal(method, 'GET');
        const url = new URL(input);
        requests.push(url.href);
        if (!url.search) return Response.json(history.find(row => url.pathname.endsWith('/' + row.id)));
        const q = url.searchParams;
        if (failArchive && q.get('is_archived') === 'true') return new Response('{}', { status: 403 });
        const rows = history.filter(row => String(row.archived) === q.get('is_archived') &&
          (!q.has('state') || q.get('state').split(',').includes(row.state)) &&
          (!q.has('since') || Date.parse(row.updated_at) >= Date.parse(q.get('since'))));
        const page = Number(q.get('page') ?? 1);
        const headers = {};
        if (page * 100 < rows.length) {
          q.set('page', String(page + 1));
          headers.link = '<' + url.href + '>; rel="next"';
        }
        return Response.json({ total_count: rows.length, tasks: rows.slice((page - 1) * 100, page * 100) }, { headers });
      } });
    const init = withTaskInventory(adapter(), store, { now: () => now });
    await readLeaseCandidates(init, liveLease);
    assert.deepEqual(saved.record.unresolved, [unresolved.id]);
    assert.deepEqual(saved.record.leaseTask, { tagSha: liveLease.tagSha, id: owned.id });
    await rememberLeaseTask(init, liveLease, owned.id);
    assert.equal(saved.record.verifiedAt, liveLease.startedAt);

    const cutoff = new Date(now - 300000).toISOString();
    now += 10 * 86400000; // A scheduler outage must not move the lower bound.
    requests.length = 0;
    const fresh = old[1];
    fresh.updated_at = cutoff; // Inclusive boundary of the overlap.
    fresh.sessions = [{ id: sessionId, task_id: fresh.id, state: 'queued' }];
    fresh.session_count = 1;
    const restarted = withTaskInventory(adapter(), store, { now: () => now });
    const before = saved;
    failArchive = true;
    await assert.rejects(readLeaseCandidates(restarted, liveLease), /HTTP 403/);
    assert.equal(saved, before);
    failArchive = false;
    requests.length = 0;
    const candidates = await readLeaseCandidates(restarted, liveLease);
    assert.ok(requests.some(url => new URL(url).searchParams.get('since') === cutoff));
    assert.deepEqual(competingWriters(candidates).map(row => row.taskId).sort(), [fresh.id, unresolved.id].sort());
    assert.ok(candidates.some(row => row.id === owned.id));
    assert.equal(requests.length, 7, 'incremental GETs at ' + volume + ' historical tasks');
    assert.equal(saved.record.verifiedAt, new Date(now).toISOString());

    const readOnly = withTaskInventory(adapter(), store, { readOnly: true, now: () => now });
    const verified = saved;
    await readLeaseCandidates(readOnly, liveLease, { stable: true });
    assert.equal(saved, verified);
  }
});

test('independent writer gates require a checkpoint and changed recovery snapshots cannot advance it', async () => {
  const { readLeaseCandidates, withTaskInventory } = await import('../tools/delivery-controller/task-inventory.mjs');
  const now = () => Date.parse('2026-11-26T00:00:00Z');
  const readOnly = withTaskInventory({ list: async () => assert.fail('no bootstrap in an independent gate') },
    { readInventory: async () => null }, { readOnly: true, requireCheckpoint: true, now });
  await assert.rejects(readLeaseCandidates(readOnly), /has not been bootstrapped/);

  const prior = { sha: tagSha, record: {
    version: 1, verifiedAt: new Date(now() - 60_000).toISOString(), searchedLeaseTag: null,
    unresolved: [], leaseTask: null,
  } };
  let passes = 0;
  const api = withTaskInventory({
    list: async ({ archived, states }) => {
      if (archived || states) return [];
      return [{ ...task, updated_at: new Date(now()).toISOString(),
        sessions: [{ ...task.sessions[0], updated_at: new Date(now() + passes++).toISOString() }] }];
    },
  }, {
    readInventory: async () => prior,
    writeInventory: async () => assert.fail('changed snapshot cannot advance the checkpoint'),
  }, { now });
  await assert.rejects(readLeaseCandidates(api, undefined, { stable: true }), /changed during recovery/);
});

function productFixture() {
  const productIssue = {
    ...issue, number: 401, title: '[BB-ROSTER-42] Display the roster',
    assignees: [], labels: ['p2.01', 'autonomy-ready', 'dependencies-cleared'],
    body: '## Autonomy scope\n- `src/roster`\n- `tests/roster.test.mjs`\n\n## Acceptance criteria\n' +
      '- Render roster\n- Preserve empty state',
  };
  const testPath = 'tests/roster.test.mjs';
  const assertions = ['assert.equal(view.rows.length, 1);', 'assert.equal(empty.rows.length, 0);'];
  const productFiles = [
    { filename: 'src/roster/view.ts', status: 'modified', sha: blob,
      additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-hideRoster();\n+showRoster();' },
    { filename: testPath, status: 'added', sha: blob, additions: 2, deletions: 0,
      patch: '@@ -0,0 +1,2 @@\n' + assertions.map(line => '+' + line).join('\n') },
  ];
  const run = fixture({ issue: productIssue, files: productFiles });
  const { state } = run;
  state.now = Date.parse('2024-11-22T00:15:00Z');
  state.pr.title = 'Display roster';
  state.pr.body = 'Refs #401\n<!-- butterbox-issue: 401 -->\n' + autonomousDevelopmentMarker;
  state.pr.changed_files = productFiles.length;
  state.checks.push({ ...state.checks[0], name: 'product-criteria', id: 102,
    html_url: 'https://github.com/' + repository + '/actions/runs/123/job/102' });
  state.humanPR = { ...state.pr, number: 402, id: 9998, body: 'Unrelated payroll documentation', changed_files: 1,
    head: { ...state.pr.head, sha: moved, ref: 'human/payroll-doc' } };
  state.humanFiles = [{ filename: 'docs/payroll.md', status: 'modified' }];
  state.openPRs = [state.pr, state.humanPR];
  state.deployStatuses = [{ id: 17, state: 'success', context: 'Vercel', created_at: mergedAt,
    target_url: 'https://vercel.com/farbotkol/butterbox/fake184' }];
  state.deployment = { id: 'dpl_fake184', projectId: 'prj_q6t7qQVxFhQHlwQk7yKPI6zw7fof', target: null,
    readyState: 'READY', createdAt: Date.parse(mergedAt), url: 'butterbox-example.vercel.app',
    meta: { githubOrg: 'farbotkol', githubRepo: 'butterbox', githubCommitRef: development, githubCommitSha: merge } };
  state.provider = {
    async verifyTarget() { if (state.productionTarget) throw new Error('Development is the production target'); },
    async readDeployment() { return state.deployment; },
  };
  const results = assertions.map((assertion, index) => ({ criterion: index + 1, pass: true, test: testPath, assertion }));
  return { ...run, results };
}

test('product promotes, merges on independent criterion evidence without approval, deploys, closes and releases', async () => {
  const { run, effects, state, results } = productFixture();
  state.pr.requested_reviewers = [{ login: 'farbotkol' }];
  await run();
  assert.deepEqual(effects, ['ready']);
  await assert.rejects(run(), /Missing complete independent/);
  state.aiResults = results.slice(0, 1);
  await assert.rejects(run(), /Missing complete independent/);
  state.aiResults = [{ ...results[0], assertion: 'assert.equal(view.rows.length, 9);' }, results[1]];
  await assert.rejects(run(), /Missing complete independent/);
  state.aiResults = [{ ...results[0], pass: false }, results[1]];
  await assert.rejects(run(), /Missing complete independent/);
  assert.deepEqual(effects, ['ready']);
  state.aiResults = results;
  state.files[1].additions++;
  await assert.rejects(run(), /complete text diffs/);
  state.files[1].additions--;
  await run();
  assert.deepEqual(effects, ['ready', 'merge']);
  assert.equal(state.issue.state, 'open');
  state.openPRs = [state.humanPR];
  await run();
  assert.deepEqual(effects, ['ready', 'merge', 'close', 'release']);
  assert.match(state.issue.body, /independent AI acceptance comment 123/);
  assert.match(state.issue.body, /Development deployment dpl_fake184/);
});

test('product blocks a production target, linked closure, overlapping changes, failed CI and wrong squash files', async () => {
  const { run, effects, state, results } = productFixture();
  state.aiResults = results;
  await run();
  state.closingIssues = 1;
  await assert.rejects(run(), /linked issue-closing references/);
  state.closingIssues = 0;
  state.humanFiles = [{ filename: 'docs/payroll.md', previous_filename: 'src/roster/view.ts', status: 'renamed' }];
  await assert.rejects(run(), /overlaps the product work area/);
  state.humanFiles = [{ filename: 'docs/payroll.md', status: 'modified' }];
  state.productionTarget = true;
  await assert.rejects(run(), /production target/);
  state.productionTarget = false;
  state.checks[2].conclusion = 'failure';
  await assert.rejects(run(), /product-criteria/);
  state.checks[2].conclusion = 'success';
  await run();
  state.openPRs = [state.humanPR];
  state.mergedFiles = [{ ...state.files[0], sha: moved }];
  await assert.rejects(run(), /Squash commit/);
  assert.deepEqual(effects, ['ready', 'merge']);
  assert.equal(state.issue.state, 'open');
});

test('a stopped task with failed deployment parks after bounded verification and leaves the issue open', async () => {
  const { run, effects, state, results } = productFixture();
  state.aiResults = results;
  await run();
  await run();
  state.openPRs = [state.humanPR];
  state.deployment.target = 'production';
  await assert.rejects(run(), /deployment is pending, failed, or unverifiable/);
  state.now += 60 * 60 * 1000;
  assert.equal(await run(), 'released');
  assert.deepEqual(effects, ['ready', 'merge', 'park', 'release']);
  assert.equal(state.issue.state, 'open');
});

test('failed product task closes and parks only its exact stopped PR, leaving unrelated human work open', async () => {
  const { run, effects, state, comments } = productFixture();
  state.task.state = 'failed';
  state.task.sessions[0].state = 'failed';
  assert.equal(await run(), 'released');
  assert.deepEqual(effects, ['close-unmerged', 'park', 'release']);
  assert.equal(state.humanPR.state, 'open');
  assert.equal(state.issue.state, 'open');
  assert.equal(state.parking.priority, 'p2.01');
  assert.match(comments[0].body, /closed-unmerged/);
});

test('requirements changes invalidate product acceptance and park the exact PR after the deadline', async () => {
  const { run, effects, state, results } = productFixture();
  state.aiResults = results;
  await run();
  state.issue.body += '\n- New requirement';
  await assert.rejects(run(), /requirements changed/);
  state.now += 60 * 60 * 1000;
  assert.equal(await run(), 'released');
  assert.deepEqual(effects, ['ready', 'close-unmerged', 'park', 'release']);
});

test('post-merge reconciliation rejects changed acceptance records and accepts no second AI verdict', async () => {
  const { run, effects, state, results, comments } = productFixture();
  state.aiResults = results;
  await run();
  await run();
  state.openPRs = [state.humanPR];
  const original = comments[0].body;
  comments[0].body = original.replace(head, moved);
  await assert.rejects(run(), /Missing historical independent/);
  comments[0].body = original;
  comments[0].user.id = 11307166;
  await assert.rejects(run(), /Missing historical independent/);
  assert.equal(comments.length, 1);
  assert.deepEqual(effects, ['ready', 'merge']);
});

test('a parked lease releases and selects the next eligible issue in the same cycle', async () => {
  const { cycle, effects, state } = productFixture();
  state.task.state = 'failed';
  state.task.sessions[0].state = 'failed';
  state.humanPR = null;
  state.openPRs = [state.pr];
  state.nextIssue = { ...issue, title: '[BB-TEST-001] Next eligible proof', labels: ['p2', 'autonomy-ready', 'dependencies-cleared'] };
  await assert.rejects(cycle(), /unconfirmed next dispatch/);
  assert.deepEqual(effects, ['close-unmerged', 'park', 'release']);
  assert.equal(state.nextLease.issue, 305);
  assert.match(state.nextPrompt, /issue #305 only/);
});

test('the Vercel adapter requires a linked nonproduction Development branch', async () => {
  const project = { id: 'prj_q6t7qQVxFhQHlwQk7yKPI6zw7fof', accountId: 'team_rXIarTVLEVlIYFY2Kr5rT4W3',
    link: { type: 'github', org: 'farbotkol', repo: 'butterbox', productionBranch: development } };
  const provider = developmentProvider({
    token: 'fixture',
    request: async (url, options) => {
      assert.match(url, /^https:\/\/api\.vercel\.com\/v9\/projects\//);
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      return { ok: true, json: async () => project };
    },
  });
  await assert.rejects(provider.verifyTarget(), /separate from its production branch/);
  project.link.productionBranch = 'copilot/Production';
  await provider.verifyTarget();
  project.link.repo = 'different';
  await assert.rejects(provider.verifyTarget(), /separate from its production branch/);
});
