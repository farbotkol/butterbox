import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSynthetic } from '../tools/delivery-controller/synthetic-launch.mjs';
import { LEASE_REF } from '../tools/delivery-controller/lease.mjs';

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const merge = 'c'.repeat(40);
const tagSha = 'd'.repeat(40);
const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891';
const file = 'docs/agent-work/synthetic-copilot-proof.md';
const repo = 'farbotkol/butterbox';
const branch = 'copilot/Development';
const runId = 'synthetic_123';
const intent = 'refs/tags/butterbox-synthetic-launch-298';

function fixture({ getOverride, originalNumber = 300, originalTask = taskId } = {}) {
  const refs = new Map();
  const seen = { creates: 0, gets: 0, deletes: 0, writes: [], reports: [], preflight: 0 };
  const state = {
    didCreate: false, draftOpen: false, openAfterLease: false, inProgressRepair: false,
    sessions: true, otherTasks: [], errorOnCreate: false, merged: false, badFile: false, badCheck: false,
    issue: {
      number: 298, title: 'Synthetic Copilot launch proof for #290', state: 'open',
      assignees: [], labels: [], body: 'Refs #290.',
    },
  };
  let tag;
  const leases = {
    async getRef(ref) {
      if (!refs.has(ref)) throw Object.assign(new Error('missing'), { status: 404 });
      return { object: { type: 'tag', sha: refs.get(ref) } };
    },
    async getTag() { return tag; },
    async createTag(value) { tag = value; return { sha: tagSha }; },
    async createRef({ ref, sha }) {
      if (refs.has(ref)) throw Object.assign(new Error('conflict'), { status: 422 });
      refs.set(ref, sha);
    },
    async deleteRef(ref) { seen.deletes++; refs.delete(ref); },
  };
  const tasks = {
    async list({ states } = {}) { return state.otherTasks.filter(row => !states || !['completed','failed','cancelled','timed_out','idle'].includes(row.state)); },
    async create({ prompt }) {
      seen.creates++;
      assert.match(prompt, /BUTTERBOX_LEASE_RUN=synthetic_123/);
      assert.ok(refs.has(LEASE_REF) && refs.has(intent));
      if (state.errorOnCreate) throw new Error('connection lost');
      state.didCreate = true;
      return { id: originalTask };
    },
    async get(id) {
      seen.gets++;
      assert.equal(id, originalTask);
      const completed = state.merged ? 'completed' : 'in_progress';
      return {
        id, state: completed, session_count: 1, artifacts: [{ provider: 'github', type: 'pull', data: { id: originalNumber } }],
        sessions: state.sessions ? [{
          id: sessionId, task_id: id, base_ref: branch, head_ref: 'copilot/synthetic-proof',
          state: completed, prompt: 'BUTTERBOX_LEASE_RUN=' + runId,
        }] : [],
      };
    },
  };
  const description = '# Synthetic Copilot launch proof\n\nThis file verifies a controlled Copilot documentation change.\n';
  async function gh(path, method = 'GET', body, apiVersion) {
    if (method === 'PATCH') {
      assert.equal(path, '/issues/298');
      seen.writes.push(body);
      state.issue = { ...state.issue, ...body };
      return state.issue;
    }
    const override = getOverride?.(path, apiVersion);
    if (override !== undefined) return override;
    if (path === '/issues/298') return state.issue;
    if (path === '/issues/290') return { number: 290, state: 'open' };
    if (path === '/pulls/294') return { number: 294, state: state.draftOpen ? 'open' : 'closed' };
    if (path.startsWith('/pulls?')) return (++seen.preflight > 1 && state.openAfterLease) ? [{ number: 301 }] : [];
    if (path.startsWith('/actions/workflows/')) {
      return state.inProgressRepair ? { total_count: 1, workflow_runs: [{}] } : { total_count: 0, workflow_runs: [] };
    }
    if (path.startsWith('/git/ref/')) return { object: { type: 'commit', sha: base } };
    if (path === '/pulls/300') return {
      number: 300, state: state.merged ? 'closed' : 'open', merged: state.merged, merge_commit_sha: merge,
      base: { ref: branch, repo: { full_name: repo } }, head: { ref: 'copilot/synthetic-proof', sha: head, repo: { full_name: repo } },
      body: 'Refs #298',
    };
    if (path.startsWith('/pulls/300/files?')) return [{ filename: state.badFile ? 'wrong.md' : file, status: 'added' }];
    if (path.startsWith('/contents/')) return {
      type: 'file', encoding: 'base64', content: Buffer.from(description).toString('base64'), sha: base,
    };
    if (path.includes('/check-runs?')) return {
      total_count: 2, check_runs: ['verify', 'database-smoke'].map((name, id) => ({
        name, id, app: { slug: 'github-actions' }, head_sha: state.badCheck ? base : head, status: 'completed', conclusion: 'success',
      })),
    };
    if (path.startsWith('/compare/')) return { status: 'ahead' };
    if (path.startsWith('/commits/')) return { sha: merge, parents: [{}], files: [{ filename: file, status: 'added' }] };
    throw new Error('Unexpected path: ' + path);
  }
  const run = (inputs = {}) => runSynthetic({
    operation: 'launch', confirmation: 'LAUNCH-298', runId, baseSha: base,
    gh, tasks, leases, report: line => seen.reports.push(line), ...inputs,
  });
  return { run, refs, state, seen };
}

test('a launch with the one-time intent independently GETs its task and sessions; verify never creates', async () => {
  const { run, refs, seen } = fixture();
  await run();
  await run({ operation: 'verify', taskId });
  await assert.rejects(run(), /prior synthetic launch intent/);
  assert.deepEqual([seen.creates, seen.gets], [1, 2]);
  assert.ok(refs.has(LEASE_REF) && refs.has(intent));
});

test('open #294 and CI repair each block before acquiring', async () => {
  for (const blocker of ['draftOpen', 'inProgressRepair']) {
    const { run, refs, seen, state } = fixture();
    state[blocker] = true;
    await assert.rejects(run(), /blocked/i);
    assert.equal(refs.size, 0);
    assert.equal(seen.creates, 0);
  }
});

test('a PR appearing after acquire releases only the unused lease', async () => {
  const { run, refs, seen, state } = fixture();
  state.openAfterLease = true;
  await assert.rejects(run(), /Launch blocked/);
  assert.equal(refs.size, 0);
  assert.equal(seen.deletes, 1);
  assert.equal(seen.creates, 0);
});

test('an ambiguous POST or a pending session retains the intent and lease', async () => {
  for (const [flag, value, expected] of [
    ['errorOnCreate', true, /connection lost/], ['sessions', false, /pending or incomplete/],
  ]) {
    const { run, refs, seen, state } = fixture();
    state[flag] = value;
    await assert.rejects(run(), expected);
    await assert.rejects(run(), /prior synthetic launch intent/);
    assert.equal(seen.creates, 1);
    assert.ok(refs.has(LEASE_REF) && refs.has(intent));
  }
});

test('reconcile checks the task, exact PR scope, CI, merge and issue before releasing once', async () => {
  const { run, refs, seen, state } = fixture();
  await run();
  state.merged = true;
  const reconciliation = { operation: 'reconcile', taskId, prNumber: '300', runId: 'synthetic_456' };
  state.badFile = true;
  await assert.rejects(run(reconciliation), /only the approved documentation file/);
  state.badFile = false;
  state.badCheck = true;
  await assert.rejects(run(reconciliation), /exact-head check/);
  assert.equal(seen.writes.length, 0);
  assert.ok(refs.has(LEASE_REF));
  state.badCheck = false;
  await run(reconciliation);
  assert.ok(!refs.has(LEASE_REF) && refs.has(intent));
  assert.equal(seen.writes.length, 1);
  assert.match(seen.writes[0].body, /synthetic-298-reconciled/);
  assert.equal(state.issue.state, 'closed');
});

test('the manual synthetic test ignores idle tasks and blocks all other nonterminal states', async () => {
  const idle = fixture();
  idle.state.otherTasks = [{ id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890', state: 'idle' }, { id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567891', state: 'idle' }];
  await idle.run();
  assert.equal(idle.seen.creates, 1);
  assert.equal(idle.seen.gets, 1);

  for (const state of ['queued', 'in_progress', 'waiting_for_user', 'unknown', undefined]) {
    const blocked = fixture();
    blocked.state.otherTasks = [{ id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890', state: 'idle' }, { id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567891', state }];
    await assert.rejects(blocked.run(), /Launch blocked|Copilot task list|Copilot task inventory/);
    assert.equal(blocked.seen.creates, 0);
    assert.equal(blocked.refs.size, 0);
  }
});

test('PR 302 correction preserves the recorded failure and releases only after both merges and exact content are verified', async () => {
  const originalHead = 'b97669035f08092e0e287ec1d37dcb8f8528eb32';
  const originalMerge = '6de8ea9868424320413454c6a47cb2ff3b89b538';
  const originalBlob = '72500c8676657a6936f24acb279d6ed2c37132d4';
  const originalTask = '82d93745-533d-426d-8863-c51eaff764fc';
  const originalAt = '2026-11-22T09:52:17Z';
  const correctedAt = '2026-11-22T10:30:00Z';
  const protectedRules = [
    { type: 'pull_request', parameters: { allowed_merge_methods: ['squash'] } },
    { type: 'required_status_checks', parameters: { required_status_checks: ['verify', 'database-smoke']
      .map(context => ({ context, integration_id: 15368 })) } },
  ];
  const approved = '# Synthetic Copilot launch proof\n\nThis file verifies a controlled Copilot documentation change.\n';
  const correctedFiles = [
    file, '.github/workflows/copilot-synthetic-launch.yml', 'docs/agent-work/autonomous-controller-operations.md',
    'tests/delivery-controller-synthetic.test.mjs', 'tools/delivery-controller/synthetic-launch.mjs',
  ].map(filename => ({ filename, status: 'modified', sha: tagSha }));
  let block;
  const evidence = fixture({ originalNumber: 302, originalTask, getOverride(path, apiVersion) {
    if (path === '/pulls/302' || path === '/pulls/303') {
      const original = path.endsWith('302');
      return {
        number: original ? 302 : 303, state: 'closed', merged: original || block !== 'unmerged',
        merged_at: original ? originalAt : correctedAt,
        // GitHub omits this field in the 2026-03-10 response for both merged PRs.
        ...(apiVersion === '2022-11-28' && block !== (original ? 'original SHA missing' : 'correction SHA missing')
          ? { merge_commit_sha: original ? originalMerge : merge }
          : {}),
        base: { ref: branch, repo: { full_name: repo } },
        head: { ref: 'copilot/synthetic-proof', sha: original ? originalHead : head, repo: { full_name: repo } },
        body: 'Refs #298',
      };
    }
    if (path.startsWith('/pulls/302/files')) return [{ filename: file, status: 'added' }];
    if (path.startsWith('/pulls/303/files')) return correctedFiles;
    if (path === '/commits/' + originalMerge + '?per_page=2') {
      return { sha: originalMerge, parents: [{}], files: [{ filename: file, status: 'added' }] };
    }
    if (path === '/commits/' + merge + '?per_page=6') {
      return { sha: merge, parents: [{ sha: originalMerge }], files: block === 'scope' ? [] : correctedFiles };
    }
    if (path.startsWith('/compare/')) return { status: block === 'ancestry' ? 'diverged' : 'ahead' };
    if (path.startsWith('/rules/branches/')) return block === 'protection' ? [] : protectedRules;
    if (path.startsWith('/contents/')) {
      const ref = path.split('ref=')[1];
      const original = [originalHead, originalMerge].includes(ref);
      const content = original || (ref === base && block === 'tip') ? approved + 'Extra instructions.\n' : approved;
      return { type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64'),
        sha: original ? originalBlob : tagSha };
    }
    if (path.includes('/check-runs?')) {
      const original = path.includes(originalHead);
      const rows = ['verify', 'database-smoke'].map((name, id) => ({
        name, id, app: { slug: 'github-actions' }, head_sha: original ? originalHead : head, status: 'completed',
        conclusion: block === (original ? 'original CI' : 'correction CI') ? 'failure' : 'success',
        started_at: '2026-11-22T09:48:32Z', completed_at: '2026-11-22T09:52:11Z', html_url: 'check-' + id,
      }));
      if (original) rows.push({ ...rows[0], id: 2, conclusion: 'failure',
        started_at: '2026-11-22T10:04:08Z', html_url: 'post-merge-check' });
      return { total_count: rows.length, check_runs: rows };
    }
  } });
  await evidence.run();
  evidence.state.merged = true;
  const inputs = { operation: 'reconcile', taskId: originalTask, prNumber: '302', baseSha: base };
  await assert.rejects(evidence.run(inputs), /differs from the approved content/);
  inputs.correctionPrNumber = '303';
  for (const [failure, message] of [
    ['original SHA missing', /Original PR merge_commit_sha/],
    ['correction SHA missing', /Corrective PR merge_commit_sha/],
    ['unmerged', /distinct, later merge/], ['scope', /reviewed corrective files/], ['ancestry', /reachable/],
    ['protection', /protection/], ['tip', /exact approved proof/], ['original CI', /exact-head check/],
    ['correction CI', /exact-head check/],
  ]) {
    block = failure;
    await assert.rejects(evidence.run(inputs), message);
    assert.equal(evidence.seen.writes.length, 0);
    assert.ok(evidence.refs.has(LEASE_REF));
  }
  block = undefined;
  evidence.state.otherTasks = [{ id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890', state: 'in_progress' }];
  await assert.rejects(evidence.run(inputs), /still be writing/);
  assert.ok(evidence.refs.has(LEASE_REF));
  assert.equal(evidence.seen.writes.length, 0);
  evidence.state.otherTasks = [];
  await evidence.run(inputs);
  assert.equal(evidence.seen.deletes, 1);
  assert.ok(!evidence.refs.has(LEASE_REF) && evidence.refs.has(intent));
  const note = evidence.seen.writes[0].body;
  assert.match(note, /Original content criterion failed.*45010717756/);
  assert.match(note, /post-merge verify failure post-merge-check/);
  assert.match(note, /Correction .*pull\/303.*approved proof blob/);
});
