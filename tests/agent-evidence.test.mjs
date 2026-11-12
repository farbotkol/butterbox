import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  buildReconciliationComment,
  checkManagedFiles,
  evidenceMarkdownPath,
  getEvidencePathFromPullRequest,
  isDocumentationOnly,
  isManagedFile,
  requiredCiStatus,
  validateEvidence,
  validateRepositoryEvidence,
} from '../tools/agent-evidence/evidence.mjs';
import { reconcileCandidates, reconcilePullRequest } from '../tools/agent-evidence/reconcile.mjs';

const root = new URL('../', import.meta.url);
const repository = 'example/butterbox';
const issueNumber = 900001;
const pullNumber = 900002;
const attemptPath = `docs/agent-work/issues/issue-${issueNumber}/pr-${pullNumber}/attempt-01.evidence.json`;
const markdown = '# Evidence\n';
const markdownSha256 = createHash('sha256').update(markdown, 'utf8').digest('hex');
const headSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const changedFiles = [
  attemptPath,
  evidenceMarkdownPath(attemptPath),
  'src/example.ts',
];

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    attempt: 1,
    issue: {
      number: issueNumber,
      url: `https://github.com/${repository}/issues/${issueNumber}`,
    },
    pullRequest: {
      number: pullNumber,
      url: `https://github.com/${repository}/pull/${pullNumber}`,
      baseBranch: 'copilot/Development',
      headBranch: 'feature/example',
      headSha: null,
      mergeSha: null,
    },
    run: {
      id: 1,
      agent: 'copilot',
      commitSha: headSha,
      startedAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T00:01:00Z',
    },
    scope: {
      summary: 'Synthetic evidence fixture.',
      changedFiles,
      implemented: ['A synthetic code slice.'],
    },
    criteria: [{
      id: 'AC-1',
      description: 'Synthetic acceptance criterion.',
      status: 'pass',
      evidence: [{ kind: 'test', reference: 'tests/agent-evidence.test.mjs', outcome: 'passed' }],
    }],
    tests: [{
      command: 'node --test tests/agent-evidence.test.mjs',
      outcome: 'passed',
      result: 'Synthetic fixture.',
      reference: null,
    }],
    ci: [
      { name: 'verify', status: 'pass', runId: 10, url: 'https://github.com/example/butterbox/actions/runs/10' },
      { name: 'database', status: 'pass', runId: 11, url: 'https://github.com/example/butterbox/actions/runs/11' },
    ],
    decisions: ['Keep canonical issue authoritative.'],
    reruns: [],
    limitations: [],
    blockers: [],
    recommendation: 'complete',
    markdownPath: evidenceMarkdownPath(attemptPath),
    markdownSha256,
    auditUrl: `https://github.com/${repository}`,
    ...overrides,
  };
}

function pullRequest({
  number = pullNumber,
  issue = issueNumber,
  head = headSha,
  merge = mergeSha,
  files = changedFiles,
  body,
  mergedAt = '2026-11-12T01:00:00Z',
} = {}) {
  const jsonPath = `docs/agent-work/issues/issue-${issue}/pr-${number}/attempt-01.evidence.json`;
  return {
    number,
    merged: true,
    merged_at: mergedAt,
    merge_commit_sha: merge,
    body: body ?? [
      `<!-- butterbox-issue: ${issue} -->`,
      `<!-- butterbox-evidence: ${jsonPath} -->`,
    ].join('\n'),
    head: { sha: head },
    base: { ref: 'copilot/Development' },
    files,
  };
}

function successfulChecks() {
  return [
    { name: 'verify', status: 'completed', conclusion: 'success', started_at: '2026-11-12T00:01:00Z', run_id: 10 },
    { name: 'database', status: 'completed', conclusion: 'success', started_at: '2026-11-12T00:02:00Z', run_id: 11 },
  ];
}

function fakeApi({ evidenceByPr = new Map(), checks = successfulChecks(), failPost = false } = {}) {
  const comments = [];
  const written = [];
  let shouldFailPost = failPost;
  const api = {
    getIssue: async number => ({ number, state: 'open' }),
    getFiles: async number => (evidenceByPr.get(number)?.files ?? changedFiles).map(filename => ({ filename })),
    getCheckRuns: async () => checks,
    getEvidence: async (filePath, _sha) => {
      const pr = Number(filePath.match(/pr-(\d+)/)?.[1]);
      return evidenceByPr.get(pr)?.json ?? evidence();
    },
    getMarkdown: async () => markdown,
    getComments: async () => [...comments],
    postComment: async (number, body) => {
      if (shouldFailPost) {
        shouldFailPost = false;
        throw new Error('Synthetic transient GitHub API failure');
      }
      comments.push({ issue: number, body });
      written.push({ issue: number, body });
    },
  };
  return { api, comments, written };
}

test('versioned schema and synthetic example validate without treating it as delivery', async () => {
  const schema = JSON.parse(await readFile(new URL('tools/agent-evidence/evidence.schema.json', root), 'utf8'));
  assert.equal(schema.properties.schemaVersion.const, 1);
  const example = JSON.parse(await readFile(
    new URL('docs/agent-work/issues/issue-999999/pr-999998/attempt-01.evidence.json', root),
    'utf8',
  ));
  const errors = validateEvidence(example, {
    evidencePath: 'docs/agent-work/issues/issue-999999/pr-999998/attempt-01.evidence.json',
  });
  assert.deepEqual(errors, []);
  assert.equal(example.recommendation, 'partial');
  assert.equal(example.criteria[0].status, 'not-tested');
});

test('evidence validator rejects tampering, mismatched identities, unsafe files and unknown fields', () => {
  assert.deepEqual(validateRepositoryEvidence(evidence(), {
    repository,
    issueNumber,
    pullNumber,
    headSha,
    mergeSha,
    changedFiles,
    evidencePath: attemptPath,
  }), []);

  const tampered = evidence({
    extra: 'unreviewed data',
    issue: { number: issueNumber + 1, url: `https://github.com/${repository}/issues/${issueNumber + 1}` },
    pullRequest: { ...evidence().pullRequest, headSha: 'c'.repeat(40) },
    scope: { ...evidence().scope, changedFiles: ['BACKLOG_INDEX.csv'] },
    decisions: ['contact attacker@example.invalid'],
  });
  const errors = validateRepositoryEvidence(tampered, {
    repository,
    issueNumber,
    pullNumber,
    headSha,
    mergeSha,
    changedFiles,
    evidencePath: attemptPath,
  });
  assert.ok(errors.some(error => error.includes('not allowed by schema')));
  assert.ok(errors.some(error => error.includes('canonical issue')));
  assert.ok(errors.some(error => error.includes('PR head')));
  assert.ok(errors.some(error => error.includes('merged PR file list')));
  assert.ok(errors.some(error => error.includes('personal contact')));
});

test('managed-file enforcement rejects feature edits and accepts only exact-head owner-audited exceptions', () => {
  assert.equal(isManagedFile('docs/agent-status/roadmap.md'), true);
  assert.equal(isManagedFile('docs/agent-status-extra/roadmap.md'), false);
  assert.equal(isManagedFile('src/feature.ts'), false);
  const files = ['src/feature.ts', 'BACKLOG_INDEX.csv', 'docs/agent-status/roadmap.md'];
  assert.equal(checkManagedFiles(files).allowed, false);

  const exception = checkManagedFiles(files, {
    labels: ['agent-evidence-governance-exception'],
    pullRequestBody: 'Managed-file exception: #77',
    headSha,
    reviews: [{
      user: { login: 'farbotkol' },
      state: 'APPROVED',
      commit_id: headSha,
      body: 'Managed-file exception approved: #77',
    }],
  });
  assert.equal(exception.allowed, true);
  assert.deepEqual(exception.exception.managedFiles, ['BACKLOG_INDEX.csv', 'docs/agent-status/roadmap.md']);
  assert.equal(checkManagedFiles(files, {
    labels: ['agent-evidence-governance-exception'],
    pullRequestBody: 'Managed-file exception: #77',
    headSha,
    reviews: [{
      user: { login: 'farbotkol' }, state: 'APPROVED', commit_id: 'c'.repeat(40),
      body: 'Managed-file exception approved: #77',
    }],
  }).allowed, false);
});

test('required CI comes from actual exact-name check runs and missing gates remain not-tested', () => {
  const ci = requiredCiStatus([
    ...successfulChecks(),
    { name: 'verify', status: 'completed', conclusion: 'failure', started_at: '2026-11-12T00:03:00Z' },
  ]);
  assert.equal(ci.verify.status, 'fail');
  assert.equal(ci.database.status, 'pass');
  assert.equal(requiredCiStatus([]).database.status, 'not-tested');
});

test('partial and documentation-only deliveries never become full-story acceptance or close an issue', () => {
  const ci = requiredCiStatus(successfulChecks());
  const partial = buildReconciliationComment({
    repository,
    issueNumber,
    pullNumber,
    headSha,
    mergeSha,
    ci,
    evidence: evidence({
      recommendation: 'partial',
      criteria: [{ id: 'AC-1', description: 'Incomplete', status: 'blocked', evidence: [] }],
    }),
    changedFiles,
  });
  assert.match(partial, /full-story acceptance remains pending/i);
  assert.match(partial, /does not close or reopen/);

  const docsFiles = ['docs/guide.md', attemptPath, evidenceMarkdownPath(attemptPath)];
  assert.equal(isDocumentationOnly(docsFiles), true);
  const docs = buildReconciliationComment({
    repository, issueNumber, pullNumber, mergeSha, ci, evidence: evidence(), changedFiles: docsFiles,
  });
  assert.match(docs, /Documentation-only delivery/);
  assert.match(docs, /does not close or reopen/);
});

test('merged PR reconciliation is idempotent and verifies issue, evidence, file list, merge SHA and CI', async () => {
  const { api, comments } = fakeApi();
  const pr = pullRequest();
  const first = await reconcilePullRequest({ repository, pullRequest: pr, api });
  assert.equal(first.status, 'merged-evidence-recorded');
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, new RegExp(mergeSha));
  assert.match(comments[0].body, /verify: pass/);

  const duplicate = await reconcilePullRequest({ repository, pullRequest: pr, api });
  assert.equal(duplicate.status, 'already-reconciled');
  assert.equal(comments.length, 1);

  const missingCi = fakeApi({ checks: [successfulChecks()[0]] });
  const unverified = await reconcilePullRequest({
    repository, pullRequest: pr, api: missingCi.api,
  });
  assert.equal(unverified.status, 'merged-unverified');
  assert.match(missingCi.comments[0].body, /database: not-tested/);

  const modified = fakeApi({
    evidenceByPr: new Map([[pullNumber, {
      json: evidence({ scope: { ...evidence().scope, changedFiles: ['src/forged.ts'] } }),
      files: changedFiles,
    }]]),
  });
  const tampered = await reconcilePullRequest({ repository, pullRequest: pr, api: modified.api });
  assert.equal(tampered.status, 'merged-unverified');
  assert.match(modified.comments[0].body, /does not match the merged PR file list/);
});

test('serialized recovery retains concurrent and out-of-order merges without duplicating audit comments', async () => {
  const firstPr = pullRequest({ number: 901, issue: 902, merge: 'd'.repeat(40), mergedAt: '2026-11-12T00:00:00Z' });
  const secondPr = pullRequest({ number: 903, issue: 904, merge: 'e'.repeat(40), mergedAt: '2026-11-12T00:01:00Z' });
  const { api, written } = fakeApi();
  const results = await reconcileCandidates({
    repository,
    pullRequests: [secondPr, firstPr],
    api,
  });
  assert.deepEqual(results.map(item => item.pullNumber), [901, 903]);
  assert.deepEqual(written.map(item => item.issue), [902, 904]);

  const outOfOrder = await reconcilePullRequest({ repository, pullRequest: secondPr, api });
  assert.equal(outOfOrder.status, 'already-reconciled');
  assert.equal(written.length, 2);
});

test('failed writes are visible and a retry recovers; workflow serializes without cancelling and sweeps', async () => {
  const workflow = await readFile(new URL('.github/workflows/agent-evidence-reconciliation.yml', root), 'utf8');
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  const { api, comments } = fakeApi({ failPost: true });
  await assert.rejects(
    reconcileCandidates({ repository, pullRequests: [pullRequest()], api }),
    /Reconciliation failed/,
  );
  assert.equal(comments.length, 0);
  const recovered = await reconcileCandidates({ repository, pullRequests: [pullRequest()], api });
  assert.equal(recovered[0].status, 'merged-evidence-recorded');
  assert.equal(comments.length, 1);
});

test('PR markers must bind the evidence path to the canonical issue and PR IDs', () => {
  assert.equal(getEvidencePathFromPullRequest(
    `<!-- butterbox-evidence: ${attemptPath} -->`,
    issueNumber,
    pullNumber,
  ), attemptPath);
  assert.equal(getEvidencePathFromPullRequest(
    `<!-- butterbox-evidence: ${attemptPath} -->`,
    issueNumber + 1,
    pullNumber,
  ), null);
});
