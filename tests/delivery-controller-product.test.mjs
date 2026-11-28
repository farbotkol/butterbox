import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileProductMetadata } from '../tools/delivery-controller/product-metadata.mjs';
import { productScope, scopedProductFiles } from '../tools/delivery-controller/product.mjs';
import { repairDiagnostic, repairProduct } from '../tools/delivery-controller/product-repair.mjs';
import { recoveryInstructions } from '../tools/delivery-controller/parked-product.mjs';
import { selectReadyIssue } from '../tools/delivery-controller/queue.mjs';
import { withFactoryHealth } from "../tools/delivery-controller/factory-health.mjs";
import { submitNativeMerge } from "../tools/delivery-controller/native-merge.mjs";
import { apiResponse } from "../tools/delivery-controller/api-response.mjs";
import { modelJson } from "../tools/delivery-controller/product-acceptance.mjs";

const repository = 'farbotkol/butterbox';
const head = '1'.repeat(40);

for (const [number, issue] of [[333, 84], [334, 82]]) {
  test('reconciles actual PR #' + number + ' template and preserves its verification', async () => {
    const body = (await readFile(new URL('./fixtures/delivery-controller/pr-' + number + '.md', import.meta.url), 'utf8')).trimEnd();
    const result = reconcileProductMetadata({ body, title: 'Normal title' }, issue, repository);
    assert.equal(result.changed, true);
    assert(result.body.startsWith(body));
    assert.match(result.body, /Fixes #N/);
    assert.equal(reconcileProductMetadata(result, issue, repository).changed, false);
  });
}

test('repairs missing and malformed metadata while rejecting conflicting issue identity', () => {
  const result = reconcileProductMetadata({ body: 'Summary\n<!-- butterbox-issue: ? -->\nFixes #84', title: 'Fixes #84' }, 84, repository);
  assert.match(result.body, /Summary\n\nRefs #84/);
  assert.equal(result.title, 'Refs #84');
  assert.throws(() => reconcileProductMetadata({ body: 'Fixes #82' }, 84, repository), /conflicting issue/);
  assert.throws(() => reconcileProductMetadata({ body: 'Resolves other/repo#84' }, 84, repository), /conflicting issue/);
  assert.throws(() => reconcileProductMetadata({ body: 'Refs #82' }, 84, repository), /conflicting issue/);
});

test('plain-language documentation issues use bounded scope and the production queue holds later waves', () => {
  const issue = { number: 84, title: 'Explain saving venue settings', body: 'Show where to save several settings together.',
    state: 'open', labels: ['autonomy-ready', 'dependencies-cleared', 'P0.01'] };
  const scope = productScope(issue, ['docs/USER_GUIDE.md']);
  assert(scope);
  assert.deepEqual(scopedProductFiles(scope, [{ filename: 'docs/USER_GUIDE.md', status: 'modified' }]), ['docs/USER_GUIDE.md']);
  assert.throws(() => scopedProductFiles(scope, [{ filename: 'src/app/actions.ts', status: 'modified' }]), /outside/);
  const queue = { p0Only: true, issues: [issue, { ...issue, number: 88, labels: [...issue.labels.slice(0, 2), 'P1'] }],
    prs: [], activeTasks: [], lease: { state: 'free' } };
  assert.equal(selectReadyIssue(queue).issue, 84);
  assert.equal(selectReadyIssue({ ...queue, issues: queue.issues.slice(1) }).action, 'REPORT_BLOCKED');
});

function repairFixture({ infrastructure = false, pending = false } = {}) {
  const name = infrastructure ? 'database-smoke' : 'verify';
  const workflow = infrastructure ? 'fast-database-candidate.yml' : 'ci.yml';
  const run = infrastructure ? 45815159004 : 45815159050;
  const job = infrastructure ? 139893020553 : 139892970457;
  const log = infrastructure ? 'Error response from daemon: Bind for 0.0.0.0:54322 failed: port is already allocated' :
    'src/components/venue-settings-form.tsx\nError: Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect';
  const effects = [];
  const history = [];
  let runAttempt = 1;
  const input = { lease: { issue: 84, tagSha: 'a'.repeat(40) }, pr: { number: 333, head: { sha: head, ref: 'copilot/test' } },
    checks: { check_runs: [{ id: 1, name, head_sha: head, app: { id: 15368 }, status: pending ? 'in_progress' : 'completed',
      conclusion: 'failure', html_url: 'https://github.com/' + repository + '/actions/runs/' + run + '/job/' + job }] },
    paged: async () => history, report: () => {}, confirm: async () => effects.push('confirmed'),
    logs: async id => { assert.equal(id, job); return log; },
    propose: async detail => { assert.match(detail, /set-state-in-effect/); return { additions: [{ path: 'src/example.tsx', contents: 'YWJj' }], deletions: [] }; },
    publish: async () => { effects.push('published'); return '2'.repeat(40); },
    gh: async (path, method, body) => {
      if (path === '/actions/runs/' + run) return { id: run, run_attempt: runAttempt, head_sha: head, path: '.github/workflows/' + workflow, status: 'completed' };
      if (path === '/actions/jobs/' + job) return { id: job, name, head_sha: head, run_id: run, conclusion: 'failure' };
      if (path === '/issues/84/comments') {
        const row = { user: { id: 41898282 }, body: body.body };
        history.push(row);
        return row;
      }
      assert.equal(method, 'POST');
      if (path.endsWith('/rerun-failed-jobs')) runAttempt++;
      effects.push(path);
    },
  };
  return { input, effects, history };
}

test('PR #333 source lint failure records five genuine scoped repairs and then exhausts', async () => {
  const { input, effects, history } = repairFixture();
  for (let i = 0; i < 5; i++) assert.equal(await repairProduct(input), 'started');
  assert.equal(await repairProduct(input), 'exhausted');
  assert.equal(history.length, 5);
  assert.equal(effects.filter(effect => effect === 'published').length, 5);
});

test('PR #333 disposable Supabase collision retries three times without a source write', async () => {
  const { input, effects } = repairFixture({ infrastructure: true });
  assert.equal(repairDiagnostic('EADDRINUSE port 54322').infrastructure, true);
  for (let i = 0; i < 3; i++) assert.equal(await repairProduct(input), 'started');
  assert.equal(await repairProduct(input), 'exhausted');
  assert.deepEqual(effects, ['confirmed', '/actions/runs/45815159004/rerun-failed-jobs',
    'confirmed', '/actions/runs/45815159004/rerun-failed-jobs',
    'confirmed', '/actions/runs/45815159004/rerun-failed-jobs']);
});

test('repair leaves pending CI and an ambiguous writer undisturbed', async () => {
  const pending = repairFixture({ pending: true });
  assert.equal(await repairProduct(pending.input), 'validation-active');
  const busy = repairFixture();
  busy.input.confirm = async () => { throw new Error('competing writer'); };
  await assert.rejects(repairProduct(busy.input), /competing writer/);
  assert.deepEqual(busy.history, []);
});

test('recovery seeds the new attempt from an authenticated immutable closed PR', async () => {
  const body = '<!-- butterbox-recovery-source:v1 -->\n' + JSON.stringify({
    issue: 82, pr: 334, base: 'a'.repeat(40), head: '6e23ba45392869902d8a6d569e904c6cc73a631f',
  });
  assert.equal(await recoveryInstructions(async () => [{ user: { id: 11307166 }, body }], 82), null);
  assert.match(await recoveryInstructions(async () => [{ user: { id: 41898282 }, body }], 82), /Reuse.*closed PR #334/);
});

test('GitHub response contracts distinguish acknowledgements from required resources', async () => {
  const contract = { operation: 'GitHub POST', endpoint: '/actions/workflows/ci.yml/dispatches' };
  assert.deepEqual(await apiResponse(Response.json({ id: 42 }), contract), { id: 42 });
  assert.deepEqual(await apiResponse(Response.json({ id: 42 }, { status: 201 }), contract), { id: 42 });
  for (const [body, status] of [['OK\n', 200], ['', 200], [null, 201], [null, 202], [null, 204]]) {
    assert.equal(await apiResponse(new Response(body, { status }), { ...contract, ack: true }), null);
  }
  for (const [status, category] of [[429, 'integration'], [503, 'integration'], [401, 'permission'], [403, 'permission']]) {
    await assert.rejects(apiResponse(new Response('sensitive diagnosis', { status, headers: {
      'retry-after': status === 429 ? '30' : '',
    } }), contract), error => error.status === status && error.category === category &&
      (status !== 429 || error.retryAfter === '30') && !error.message.includes('sensitive diagnosis'));
  }
  await assert.rejects(apiResponse(new Response('{invalid'), contract), /outer-json\/invalid-json/);
  await assert.rejects(apiResponse(new Response(null, { status: 204 }), contract), /outer-json\/empty/);
});

test('runs 420 and 426: OK cannot become independent acceptance evidence', async () => {
  const log = await readFile(new URL('./fixtures/delivery-controller/ok-json-failure.log', import.meta.url), 'utf8');
  const observed = [...log.matchAll(/STOPPED: Unexpected token 'O', "([^\n]*)\n\S+Z " is not valid JSON/g)];
  assert.equal(observed.length, 2);
  for (const [, line] of observed) {
    const content = line + '\n';
    await assert.rejects(modelJson('Return evidence', {}, { request: async () => new Response(content) }),
      /outer-json\/plain-ok/);
    await assert.rejects(modelJson('Return evidence', {}, { request: async () =>
      Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] }) }),
    /model-output\/invalid-json/);
  }
});

test('an integration failure before publication does not reserve a source repair', async () => {
  const { input, history, effects } = repairFixture();
  input.propose = () => apiResponse(new Response('OK'), { operation: 'GitHub Models', endpoint: '/inference/chat/completions' });
  await assert.rejects(repairProduct(input), /outer-json\/plain-ok/);
  assert.deepEqual(history, []);
  assert.deepEqual(effects, ['confirmed']);
});

test('factory checkpoints enforce Retry-After, suspend work on probe failure and resume after recovery', async () => {
  const history = [];
  const messages = [];
  let timestamp = Date.parse('2026-11-26T21:38:00Z');
  let invocations = 0;
  let probes = 0;
  let healthy = false;
  const unavailable = Object.assign(new Error('Provider busy'), {
    code: 'CONTROLLER_API', category: 'integration', retryAfter: '1200',
  });
  const run = () => withFactoryHealth({
    revision: head, now: () => timestamp, report: message => messages.push(message),
    paged: async () => history,
    gh: async (path, method, { body }) => {
      assert.equal(path, '/issues/327/comments');
      assert.equal(method, 'POST');
      const row = { user: { id: 41898282 }, id: history.length + 1, body, created_at: timestamp, updated_at: timestamp };
      history.push(row);
      return row;
    },
    probe: async () => {
      probes++;
      if (!healthy) throw unavailable;
    },
    advance: async () => {
      invocations++;
      if (!healthy) throw unavailable;
    },
  });
  await run();
  timestamp += 19 * 60000;
  await run();
  assert.equal(invocations, 1);
  assert.equal(probes, 0);
  for (let i = 2; i <= 5; i++) {
    timestamp += 60 * 60000;
    await run();
    assert.equal(invocations, i);
  }
  timestamp += 60 * 60000;
  await run();
  assert.equal(invocations, 5);
  assert.equal(probes, 1);
  assert(messages.some(message => message.startsWith('FACTORY_BLOCKED')));
  healthy = true;
  timestamp += 60 * 60000;
  await run();
  assert.equal(probes, 2);
  assert.equal(invocations, 6);
  assert.equal(messages.at(-1), 'FACTORY_HEALTH_RESTORED');
});

test('a confirmed repair with no changes is recorded and never publishes', async () => {
  const { input, history, effects } = repairFixture();
  input.propose = async () => ({ additions: [], deletions: [] });
  assert.equal(await repairProduct(input), 'no-change');
  assert.match(history[0].body, /"outcome":"no-change"/);
  assert.deepEqual(effects, ['confirmed']);
});

test('a confirmed out-of-scope repair is recorded and never publishes', async () => {
  const { input, history, effects } = repairFixture();
  input.propose = async () => null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal(await repairProduct(input), attempt === 5 ? 'exhausted' : 'no-change');
  }
  assert.equal(await repairProduct(input), 'exhausted');
  assert.equal(history.length, 5);
  assert(history.every(row => /"outcome":"out-of-scope"/.test(row.body)));
  assert.deepEqual(effects, Array(5).fill('confirmed'));
});

test('an acknowledged rerun without a new attempt is not dispatched twice', async () => {
  const { input, history } = repairFixture({ infrastructure: true });
  let submitted = 0;
  const gh = input.gh;
  input.gh = async (...args) => {
    if (args[0].endsWith('/rerun-failed-jobs')) {
      submitted++;
      return null;
    }
    return gh(...args);
  };
  assert.equal(await repairProduct(input), 'rerun-pending');
  assert.equal(await repairProduct(input), 'rerun-pending');
  assert.equal(submitted, 1);
  assert.equal(history.length, 1);
});

test('an ordinary reset header does not delay reconciliation of an acknowledged mutation', async () => {
  const reset = String(Math.floor(Date.now() / 1000) + 3600);
  const request = { operation: 'GitHub publish repair', endpoint: '/graphql' };
  await assert.rejects(apiResponse(new Response('OK', { headers: {
    'x-ratelimit-reset': reset, 'x-ratelimit-remaining': '4999',
  } }), request), error => error.category === 'integration' && error.rateLimitReset === undefined);
  await assert.rejects(apiResponse(new Response('rate limit', { status: 429, headers: {
    'x-ratelimit-reset': reset, 'x-ratelimit-remaining': '0',
  } }), request), error => error.status === 429 && error.rateLimitReset === reset);
});

test('a replacement implementation reconciles the known successful HTTP 200 acknowledgement', async () => {
  const at = Date.parse('2026-11-27T01:45:00Z');
  const prior = { attempt: 1, nextAt: at + 20 * 60000, category: 'integration', revision: 'old',
    reason: 'GitHub publish repair HTTP 200 for /graphql · branch-verification/unconfirmed' };
  const row = { id: 1, user: { id: 41898282 }, body: '<!-- butterbox-factory-health:v1 -->\n' + JSON.stringify(prior),
    created_at: at - 5 * 60000, updated_at: at - 5 * 60000 };
  let advanced = 0;
  await withFactoryHealth({ paged: async () => [row], now: () => at, revision: 'new', report: () => {},
    advance: async () => { advanced++; }, gh: async (_path, _method, { body }) => ({ ...row, id: 2, body }),
  });
  assert.equal(advanced, 1);
});

function nativeMergeFixture() {
  const comments = [], reports = [], effects = [];
  let time = 1700000000000;
  const pr = { number: 340, state: 'open', merged: false, mergeable_state: 'blocked',
    head: { sha: head, ref: 'copilot/scope', repo: { full_name: repository } } };
  const state = {
    fresh: structuredClone(pr),
    failure: { status: 405, message: 'Pull Request is not mergeable' },
    workflows: [{ id: 10, run_attempt: 1, path: '.github/workflows/ci.yml', event: 'pull_request',
      head_sha: head, head_repository: { full_name: repository }, pull_requests: [{ number: 340 }],
      status: 'completed', conclusion: 'action_required', actor: { login: 'github-actions[bot]' } }],
  };
  const run = () => submitNativeMerge({
    pr, ci: ['verify'], tip: '2'.repeat(40), lease: { issue: 82, tagSha: '3'.repeat(40) },
    body: { sha: head, merge_method: 'squash' }, now: () => time, report: line => reports.push(line),
    paged: async () => comments, gh: async (path, method, data) => {
      effects.push([path, method]);
      if (path.endsWith('/merge')) {
        assert.equal(data.sha, head);
        if (state.failure) throw Object.assign(new Error(state.failure.message), { code: 'CONTROLLER_API', ...state.failure });
        return { merged: true, sha: '4'.repeat(40) };
      }
      if (path === '/pulls/340') return state.fresh;
      if (path.startsWith('/actions/runs?')) return { total_count: state.workflows.length, workflow_runs: [...state.workflows] };
      const saved = { id: comments.length + 1, user: { id: 41898282 }, created_at: time, updated_at: time, body: data.body };
      comments.push(saved);
      return saved;
    },
  });
  return { state, run, reports, effects, comments, advance: minutes => { time += minutes * 60000; } };
}

test('a native 405 waits for changed approval evidence without opening the factory circuit', async () => {
  const { run, advance, state, effects, reports } = nativeMergeFixture();
  assert.equal(await run(), null);
  assert(reports.some(row => row.includes('maintainer approval required for PR runs 10')));
  advance(75);
  assert.equal(await run(), null);
  assert.equal(effects.filter(([, method]) => method === 'PUT').length, 1);
  advance(15);
  state.workflows[0].conclusion = 'success';
  state.failure = null;
  assert.deepEqual(await run(), { merged: true, sha: '4'.repeat(40) });
  assert.equal(effects.filter(([, method]) => method === 'PUT').length, 2);
});

test('a native 422 with unchanged evidence can be parked without repeating the merge', async () => {
  const { run, advance, state, effects } = nativeMergeFixture();
  state.workflows = [];
  state.failure.status = 422;
  assert.equal(await run(), null);
  advance(65);
  assert.equal((await run()).exhausted, true);
  assert.equal(effects.filter(([, method]) => method === 'PUT').length, 1);
});

test('an ambiguous merge reconciles an already merged PR and drops stale evidence for a changed head', async () => {
  const recovered = nativeMergeFixture();
  recovered.state.failure.status = 503;
  Object.assign(recovered.state.fresh, { state: 'closed', merged: true, merged_by: { id: 41898282 }, merge_commit_sha: '4'.repeat(40) });
  assert.deepEqual(await recovered.run(), { merged: true, sha: '4'.repeat(40) });
  assert.equal(recovered.comments.length, 0);
  const changed = nativeMergeFixture();
  changed.state.failure.status = 409;
  changed.state.fresh.head.sha = '5'.repeat(40);
  assert.equal(await changed.run(), null);
  assert.equal(changed.comments.length, 0);
  assert.match(changed.reports.at(-1), /MERGE_REVALIDATE/);
});

test('permission failures visibly fail a factory cycle and can recover with the same revision', async () => {
  let now = 1700000000000, healthy = false, deliveries = 0, probes = 0;
  const rows = [];
  const denied = Object.assign(new Error('GitHub credential rejected'), { code: 'CONTROLLER_API', category: 'permission' });
  const run = () => withFactoryHealth({
    revision: head, now: () => now, paged: async () => rows, report: () => {},
    gh: async (_path, _method, { body }) => {
      const row = { id: rows.length + 1, user: { id: 41898282 }, created_at: now, updated_at: now, body };
      rows.push(row);
      return row;
    },
    advance: async () => { if (!healthy) throw denied; deliveries++; },
    probe: async category => { assert.equal(category, 'permission'); probes++; if (!healthy) throw denied; },
  });
  assert.equal(await run(), false);
  assert.equal(await run(), false);
  assert.equal(probes, 0);
  now += 60 * 60000;
  assert.equal(await run(), false);
  assert.equal(deliveries, 0);
  healthy = true;
  now += 60 * 60000;
  assert.equal(await run(), true);
  assert.equal(probes, 2);
  assert.equal(deliveries, 1);
});

test('GitHub error diagnostics preserve known messages and omit arbitrary structured payload text', async () => {
  const response = Response.json({ message: 'Pull Request is not mergeable', errors: [
    { resource: 'PullRequest', field: 'sha', code: 'invalid', message: 'ghp_testSecret' },
  ] }, { status: 405, headers: { 'x-github-request-id': 'A1:B2' } });
  await assert.rejects(apiResponse(response, { operation: 'GitHub PUT', endpoint: '/pulls/340/merge' }), error =>
    /405.*A1:B2.*Pull Request is not mergeable.*PullRequest\/sha\/invalid/.test(error.message) &&
    !error.message.includes('ghp_testSecret'));
});


test('completed product reconciliation does not consume trailing audit evidence as scope', () => {
  const issue = { number: 346, title: 'Shared feedback', state: 'open',
    body: '## Acceptance criteria\n- Provide accessible feedback.\n\n## Autonomy scope\n- `src/components`\n- `tests/e2e`' };
  const original = productScope(issue);
  assert(original);
  const body = issue.body + '\n\n<!-- butterbox-autonomy-reconciled:v1 -->\n\nIssue #346 · lease actions_1_1\nDevelopment deployment verified';
  assert.equal(productScope({ ...issue, body }), null);
  assert.equal(productScope({ ...issue, body, state: 'closed', state_reason: 'not_planned' }), null);
  assert.deepEqual(productScope({ ...issue, body, state: 'closed', state_reason: 'completed' }), original);
  assert.equal(productScope({ ...issue, body: body.replace('src/components', '.github/workflows'), state: 'closed', state_reason: 'completed' }), null);
});
