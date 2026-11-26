import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileProductMetadata } from '../tools/delivery-controller/product-metadata.mjs';
import { productScope, scopedProductFiles } from '../tools/delivery-controller/product.mjs';
import { repairDiagnostic, repairProduct } from '../tools/delivery-controller/product-repair.mjs';
import { recoveryInstructions } from '../tools/delivery-controller/parked-product.mjs';
import { selectReadyIssue } from '../tools/delivery-controller/queue.mjs';
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
  const input = { lease: { issue: 84, tagSha: 'a'.repeat(40) }, pr: { number: 333, head: { sha: head, ref: 'copilot/test' } },
    checks: { check_runs: [{ id: 1, name, head_sha: head, app: { id: 15368 }, status: pending ? 'in_progress' : 'completed',
      conclusion: 'failure', html_url: 'https://github.com/' + repository + '/actions/runs/' + run + '/job/' + job }] },
    paged: async () => history, report: () => {}, confirm: async () => effects.push('confirmed'),
    logs: async id => { assert.equal(id, job); return log; },
    propose: async detail => { assert.match(detail, /set-state-in-effect/); return { additions: [{ path: 'src/example.tsx', contents: 'YWJj' }], deletions: [] }; },
    publish: async () => effects.push('published'),
    gh: async (path, method, body) => {
      if (path === '/actions/runs/' + run) return { id: run, head_sha: head, path: '.github/workflows/' + workflow, status: 'completed' };
      if (path === '/actions/jobs/' + job) return { id: job, name, head_sha: head, run_id: run, conclusion: 'failure' };
      if (path === '/issues/84/comments') {
        const row = { user: { id: 41898282 }, body: body.body };
        history.push(row);
        return row;
      }
      assert.equal(method, 'POST');
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
  assert.equal(await repairProduct(pending.input), 'waiting');
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
