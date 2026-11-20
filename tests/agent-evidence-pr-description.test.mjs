import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createGitHubApi,
  isEligiblePullRequest,
  reconcileDescriptionBody,
  reconcilePullRequestDescription,
  rerunVerifyForPullRequest,
} from '../tools/agent-evidence/reconcile-pr-description.mjs';
import { getEvidencePathFromPullRequest } from '../tools/agent-evidence/evidence.mjs';

const repository = 'farbotkol/butterbox';
const issueNumber = 278;
const pullNumber = 279;
const headSha = 'a'.repeat(40);
const evidencePath = `docs/agent-work/issues/issue-${issueNumber}/pr-${pullNumber}/attempt-01.evidence.json`;
const markdownPath = evidencePath.replace(/\.evidence\.json$/, '.md');
const markdown = '# Verified evidence\n';
const markdownSha256 = createHash('sha256').update(markdown, 'utf8').digest('hex');
const acceptance = 'The generated footer is reconciled without weakening evidence checks.';
const evidenceFiles = [evidencePath, markdownPath, 'src/reconciliation.ts'];

function pr(body, overrides = {}) {
  return {
    number: pullNumber,
    state: 'open',
    merged: false,
    merged_at: null,
    body,
    updated_at: '2026-11-16T21:00:00Z',
    draft: true,
    user: { login: 'farbotkol' },
    base: { ref: 'copilot/Development' },
    head: {
      ref: 'copilot/reconcile-descriptions',
      sha: headSha,
      repo: { full_name: repository },
    },
    ...overrides,
  };
}

function body({ footer = true, markers = true, refs = true } = {}) {
  return [
    '## Scope',
    ...(refs ? [`Refs #${issueNumber}`] : []),
    ...(markers ? [
      `<!-- butterbox-issue: ${issueNumber} -->`,
      `<!-- butterbox-evidence: ${evidencePath} -->`,
    ] : []),
    ...(footer ? [`- Fixes #${issueNumber}`] : []),
  ].join('\n');
}

function completeEvidence() {
  return {
    schemaVersion: 1,
    attempt: 1,
    issue: { number: issueNumber, url: `https://github.com/${repository}/issues/${issueNumber}` },
    pullRequest: {
      number: pullNumber,
      url: `https://github.com/${repository}/pull/${pullNumber}`,
      baseBranch: 'copilot/Development',
      headBranch: 'copilot/reconcile-descriptions',
      headSha,
      mergeSha: null,
    },
    run: {
      id: 1,
      agent: 'copilot',
      commitSha: headSha,
      startedAt: '2026-11-16T20:00:00Z',
      updatedAt: '2026-11-16T21:00:00Z',
    },
    scope: { summary: 'Complete synthetic implementation.', changedFiles: evidenceFiles, implemented: ['Reconciler'] },
    criteria: [{
      id: 'AC-1',
      description: acceptance,
      status: 'pass',
      evidence: [{ kind: 'test', reference: 'tests/agent-evidence-pr-description.test.mjs', outcome: 'passed' }],
    }],
    tests: [{
      command: 'node --test tests/agent-evidence-pr-description.test.mjs',
      outcome: 'passed',
      result: 'All cases passed.',
      reference: null,
    }],
    ci: [
      { name: 'verify', status: 'pass', runId: 1, url: 'https://github.com/farbotkol/butterbox/actions/runs/1' },
      { name: 'database', status: 'pass', runId: 2, url: 'https://github.com/farbotkol/butterbox/actions/runs/2' },
    ],
    decisions: [],
    reruns: [],
    limitations: [],
    blockers: [],
    recommendation: 'complete',
    markdownPath,
    markdownSha256,
    auditUrl: `https://github.com/${repository}`,
  };
}

function fixture(initialBody, options = {}) {
  let current = pr(initialBody, options.pullRequest);
  const updates = [];
  const reruns = [];
  let pullReads = 0;
  const api = {
    getPullRequest: async () => {
      pullReads++;
      if (options.concurrent && pullReads === 2) {
        current = { ...current, body: `${current.body}\nConcurrent user text`, updated_at: '2026-11-16T21:01:00Z' };
      }
      return structuredClone(current);
    },
    getIssue: async () => {
      if (options.issueError) throw options.issueError;
      return {
        number: issueNumber,
        state: 'open',
        body: `## Acceptance criteria\n- ${acceptance}`,
      };
    },
    isIssueLinkedToPullRequest: async () => true,
    getFiles: async () => (options.files ?? evidenceFiles).map(filename => ({ filename })),
    getEvidence: async () => {
      if (options.evidenceError) throw options.evidenceError;
      return options.complete ? completeEvidence() : null;
    },
    getMarkdown: async () => options.complete ? markdown : null,
    getPullRequestReviews: async () => {
      if (options.reviewError) throw options.reviewError;
      return options.complete ? [{
        user: { login: 'farbotkol' },
        state: 'APPROVED',
        commit_id: headSha,
        body: `Canonical issue approved: #${issueNumber}`,
      }] : [];
    },
    listVerifyRuns: async () => [{
      id: 700,
      event: 'pull_request',
      status: 'completed',
      conclusion: 'failure',
      created_at: '2026-11-16T21:00:00Z',
      pull_requests: [{ number: pullNumber, head: { sha: headSha } }],
    }],
    rerunWorkflow: async runId => { reruns.push(runId); },
    updatePullRequestBody: async (_number, nextBody) => {
      updates.push(nextBody);
      current = { ...current, body: nextBody, updated_at: '2026-11-16T21:02:00Z' };
    },
  };
  return { api, updates, reruns, getCurrent: () => current };
}

test('empty initial draft stays untouched and does not infer an issue', async () => {
  const value = fixture('');
  const result = await reconcilePullRequestDescription({ repository, pullRequest: pr(''), api: value.api });
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /no canonical issue link/);
  assert.deepEqual(value.updates, []);
});

test('valid partial PR loses only its trailing auto-close footer', async () => {
  const initial = `${body()}\n\n`;
  const value = fixture(initial);
  const result = await reconcilePullRequestDescription({ repository, pullRequest: pr(initial), api: value.api });
  assert.equal(result.status, 'updated');
  assert.equal(result.removedAutoCloseFooter, true);
  assert.deepEqual(result.verify, { status: 'rerun-requested', runId: 700 });
  assert.deepEqual(value.reruns, [700]);
  assert.match(value.updates[0], new RegExp(`Refs #${issueNumber}`));
  assert.match(value.updates[0], new RegExp(`<!-- butterbox-evidence: ${evidencePath.replaceAll('/', '\\/')} -->`));
  assert.doesNotMatch(value.updates[0], /-\s*Fixes #/);
});

test('a later Copilot footer is repaired without creating an edited-event loop', async () => {
  const initial = body({ footer: false });
  const value = fixture(initial);
  const first = await reconcilePullRequestDescription({ repository, pullRequest: pr(initial), api: value.api });
  assert.equal(first.status, 'unchanged');

  value.getCurrent().body += '\n- Fixes #278';
  value.getCurrent().updated_at = '2026-11-16T21:03:00Z';
  const secondBody = value.getCurrent().body;
  const second = await reconcilePullRequestDescription({ repository, pullRequest: pr(secondBody), api: value.api });
  assert.equal(second.status, 'updated');
  assert.equal(value.updates.length, 1);
  const third = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(value.getCurrent().body),
    api: value.api,
  });
  assert.equal(third.status, 'unchanged');
  assert.equal(value.updates.length, 1);

  value.getCurrent().body += '\n- Fixes #278';
  value.getCurrent().updated_at = '2026-11-16T21:04:00Z';
  const fourth = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(value.getCurrent().body),
    api: value.api,
  });
  assert.equal(fourth.status, 'updated');
  assert.equal(value.updates.length, 2);

  value.getCurrent().body += '\n- Fixes #278';
  value.getCurrent().updated_at = '2026-11-16T21:05:00Z';
  const fifth = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(value.getCurrent().body),
    api: value.api,
  });
  assert.equal(fifth.status, 'blocked');
  assert.match(fifth.reason, /repair limit/);
  assert.equal(value.updates.length, 2);
});

test('duplicate references are preserved without duplicating markers', () => {
  const input = `Refs #${issueNumber}\nRefs #${issueNumber}\n<!-- butterbox-issue: ${issueNumber} -->\n- Fixes #${issueNumber}`;
  const result = reconcileDescriptionBody({
    body: input,
    repository,
    issueNumber,
    pullNumber,
    fullyAccepted: false,
  });
  assert.equal(result.status, 'updated');
  assert.equal((result.body.match(new RegExp(`Refs #${issueNumber}`, 'g')) ?? []).length, 2);
  assert.equal((result.body.match(/butterbox-issue:/g) ?? []).length, 1);
});

test('only the linked repository auto-close footer is removed', () => {
  const trusted = reconcileDescriptionBody({
    body: `Refs #${issueNumber}\n<!-- butterbox-issue: ${issueNumber} -->\n- Fixes ${repository}#${issueNumber}`,
    repository,
    issueNumber,
    pullNumber,
  });
  assert.equal(trusted.removedFooter, true);

  const external = reconcileDescriptionBody({
    body: `Refs #${issueNumber}\n<!-- butterbox-issue: ${issueNumber} -->\n- Fixes another/project#${issueNumber}`,
    repository,
    issueNumber,
    pullNumber,
  });
  assert.equal(external.removedFooter, true);
  assert.match(external.body, /Refs another\/project#278/);
  assert.doesNotMatch(external.body, /Fixes another\/project#278/);
});

test('auto-close lines for other issues are neutralized too', () => {
  const input = `Refs #${issueNumber}\n<!-- butterbox-issue: ${issueNumber} -->\n` +
    '- Fixes #280\n- Fixes #278';
  const result = reconcileDescriptionBody({
    body: input,
    repository,
    issueNumber,
    pullNumber,
  });
  assert.equal(result.status, 'updated');
  assert.match(result.body, /Refs #280/);
  assert.doesNotMatch(result.body, /- Fixes #/);

  const unrelatedTail = reconcileDescriptionBody({
    body: `Refs #${issueNumber}\n<!-- butterbox-issue: ${issueNumber} -->\n- Fixes #280`,
    repository,
    issueNumber,
    pullNumber,
  });
  assert.equal(unrelatedTail.status, 'updated');
  assert.match(unrelatedTail.body, /Refs #280/);
  assert.doesNotMatch(unrelatedTail.body, /- Fixes #280/);
});

test('missing markers are restored only from a unique verified issue and actual evidence files', async () => {
  const initial = `## Work\n- Fixes #${issueNumber}`;
  const value = fixture(initial);
  const result = await reconcilePullRequestDescription({ repository, pullRequest: pr(initial), api: value.api });
  assert.equal(result.status, 'updated');
  assert.match(value.updates[0], new RegExp(`Refs #${issueNumber}`));
  assert.match(value.updates[0], new RegExp(`<!-- butterbox-issue: ${issueNumber} -->`));
  assert.match(value.updates[0], new RegExp(`<!-- butterbox-evidence: ${evidencePath.replaceAll('/', '\\/')} -->`));

  const noEvidence = reconcileDescriptionBody({
    body: initial,
    repository,
    issueNumber,
    pullNumber,
    changedFiles: ['src/change.ts'],
  });
  assert.equal(getEvidencePathFromPullRequest(noEvidence.body, issueNumber, pullNumber), null);
});

test('malformed or absent evidence markers never manufacture evidence files', async () => {
  const malformed = `Refs #${issueNumber}\n<!-- butterbox-issue: ${issueNumber} -->\n` +
    '<!-- butterbox-evidence: invalid-path -->\n- Fixes #278';
  const value = fixture(malformed, { files: ['src/change.ts'] });
  const result = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(malformed),
    api: value.api,
  });
  assert.equal(result.status, 'updated');
  assert.match(value.updates[0], /<!-- butterbox-evidence: invalid-path -->/);
  assert.doesNotMatch(value.updates[0], /- Fixes #278/);
  assert.equal(getEvidencePathFromPullRequest(value.updates[0], issueNumber, pullNumber), null);
});

test('malformed markers and conflicting issue links fail closed', () => {
  for (const input of [
    '<!-- butterbox-issue: nope -->\n- Fixes #278',
    'Refs #278\nRefs #280\n- Fixes #278',
    'Refs #278\n<!-- butterbox-issue: 280 -->\n- Fixes #278',
  ]) {
    const result = reconcileDescriptionBody({
      body: input,
      repository,
      issueNumber,
      pullNumber,
    });
    assert.equal(result.status, 'blocked');
  }
});

test('quoted issue placeholders are not treated as PR markers or references', () => {
  const input = [
    '> <!-- butterbox-issue: ISSUE_NUMBER -->',
    '> Refs #ISSUE_NUMBER',
    `> - Closes ${repository}#${issueNumber}`,
    'Generated PR body text.',
    `- Fixes #${issueNumber}`,
  ].join('\n');
  const result = reconcileDescriptionBody({
    body: input,
    repository,
    issueNumber,
    pullNumber,
  });
  assert.equal(result.status, 'updated');
  assert.match(result.body, new RegExp(`<!-- butterbox-issue: ${issueNumber} -->`));
  assert.match(result.body, new RegExp(`Refs #${issueNumber}`));
  assert.match(result.body, new RegExp(`> - Refs ${repository.replaceAll('/', '\\/')}#${issueNumber}`));
  assert.doesNotMatch(result.body, /\b(?:Fixes|Closes|Resolves)\s+(?:farbotkol\/butterbox#)?278/);
});

test('closed or merged PRs are never edited', async () => {
  for (const state of [
    { state: 'closed' },
    { state: 'open', merged: true },
    { state: 'open', merged_at: '2026-11-16T00:00:00Z' },
  ]) {
    const initial = body();
    const value = fixture(initial, { pullRequest: state });
    const result = await reconcilePullRequestDescription({
      repository,
      pullRequest: pr(initial),
      api: value.api,
    });
    assert.equal(result.status, 'skipped');
    assert.deepEqual(value.updates, []);
  }
});

test('external repositories and unrelated contributors are never eligible', () => {
  assert.equal(isEligiblePullRequest(pr(''), repository), true);
  assert.equal(isEligiblePullRequest(pr('', {
    head: { ref: 'copilot/fork', sha: headSha, repo: { full_name: 'someone/fork' } },
  }), repository), false);
  assert.equal(isEligiblePullRequest(pr('', { user: { login: 'contributor' } }), repository), false);
  assert.equal(isEligiblePullRequest(pr('', { head: { ref: 'feature/user', sha: headSha, repo: { full_name: repository } } }), repository), false);
});

test('an unverified issue cross-reference or closed issue cannot authorize a body edit', async () => {
  const initial = body();
  const unlinked = fixture(initial);
  unlinked.api.isIssueLinkedToPullRequest = async () => false;
  const missingLink = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(initial),
    api: unlinked.api,
  });
  assert.equal(missingLink.status, 'skipped');
  assert.match(missingLink.reason, /cross-reference/);

  const closedIssue = fixture(initial);
  closedIssue.api.getIssue = async () => ({ number: issueNumber, state: 'closed', body: '' });
  const closed = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(initial),
    api: closedIssue.api,
  });
  assert.equal(closed.status, 'skipped');
  assert.deepEqual(closedIssue.updates, []);
});

test('detectable concurrent PR body changes are not overwritten', async () => {
  const initial = body();
  const value = fixture(initial, { concurrent: true });
  const result = await reconcilePullRequestDescription({ repository, pullRequest: pr(initial), api: value.api });
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /changed concurrently/);
  assert.deepEqual(value.updates, []);
});

test('GitHub API errors and rate limits fail closed without a body write', async () => {
  for (const options of [
    { issueError: new Error('API rate limit exceeded') },
    { evidenceError: new Error('HTTP 429 rate limit') },
    { reviewError: new Error('HTTP 503 unavailable') },
  ]) {
    const initial = body();
    const value = fixture(initial, { ...options, complete: true });
    await assert.rejects(reconcilePullRequestDescription({
      repository,
      pullRequest: pr(initial),
      api: value.api,
    }), /failed closed|rate limit|unavailable/);
    assert.deepEqual(value.updates, []);
  }
});

test('fully accepted evidence and exact-head owner approval preserve a close footer', async () => {
  const initial = body();
  const value = fixture(initial, { complete: true });
  const result = await reconcilePullRequestDescription({ repository, pullRequest: pr(initial), api: value.api });
  assert.equal(result.status, 'unchanged');
  assert.deepEqual(value.updates, []);
});

test('Verify rerun waits for the matching PR head and never uses an unrelated run', async () => {
  let time = 0;
  let reads = 0;
  const rerunIds = [];
  const result = await rerunVerifyForPullRequest({
    api: {
      listVerifyRuns: async () => {
        reads++;
        if (reads === 1) return [{
          id: 10, event: 'pull_request', status: 'completed', conclusion: 'failure',
          pull_requests: [{ number: pullNumber, head: { sha: 'b'.repeat(40) } }],
        }];
        return [{
          id: 11, event: 'pull_request', status: 'completed', conclusion: 'failure',
          pull_requests: [{ number: pullNumber, head: { sha: headSha } }],
        }];
      },
      rerunWorkflow: async id => { rerunIds.push(id); },
    },
    pullRequest: pr(''),
    timeoutMs: 20,
    intervalMs: 10,
    pause: async () => { time += 10; },
    now: () => time,
  });
  assert.equal(result.status, 'rerun-requested');
  assert.equal(result.runId, 11);
  assert.deepEqual(rerunIds, [11]);
});

test('fully accepted evidence cannot carry an unrelated issue auto-close phrase', async () => {
  const initial = `${body({ footer: false })}\n- Fixes #280\n- Fixes #278`;
  const value = fixture(initial, { complete: true });
  const result = await reconcilePullRequestDescription({ repository, pullRequest: pr(initial), api: value.api });
  assert.equal(result.status, 'updated');
  assert.match(value.updates[0], /Refs #280/);
  assert.match(value.updates[0], /- Fixes #278/);
  assert.doesNotMatch(value.updates[0], /- Fixes #280/);

  const unrelatedTail = `${body({ footer: false })}\n- Fixes #280`;
  const second = fixture(unrelatedTail, { complete: true });
  const secondResult = await reconcilePullRequestDescription({
    repository,
    pullRequest: pr(unrelatedTail),
    api: second.api,
  });
  assert.equal(secondResult.status, 'updated');
  assert.match(second.updates[0], /Refs #280/);
  assert.doesNotMatch(second.updates[0], /- Fixes #280/);
});

test('Verify no longer requires PR evidence markers and preserves managed-file protections', async () => {
  const workflow = await readFile(new URL('../.github/workflows/reconcile-pr-descriptions.yml', import.meta.url), 'utf8');
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const managedFileGate = await readFile(new URL('../tools/agent-evidence/check-managed-files.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(ci, /run: node tools\/agent-evidence\/check-pr-evidence\.mjs/);
  assert.doesNotMatch(ci, /run: node tools\/agent-evidence\/validate-all\.mjs/);
  assert.match(ci, /node tools\/agent-evidence\/check-managed-files\.mjs/);
  assert.match(ci, /- run: npm test/);
  assert.match(ci, /- run: npm run lint/);
  assert.match(ci, /- run: npm run build/);
  assert.match(ci, /npx --yes supabase@2\.122\.0 test db/);
  assert.match(managedFileGate, /pullRequestBody:\s*currentPullRequest\.body/);
});

test('GitHub updates use a single pull-request body PATCH with the supplied exact body', async () => {
  let request;
  const api = createGitHubApi({
    repository,
    token: 'test-token',
    run: (args, input) => {
      request = { args, input };
      return '{}';
    },
  });
  await api.updatePullRequestBody(pullNumber, 'Refs #278\n');
  assert.ok(request.args.includes('--method'));
  assert.equal(request.args[request.args.indexOf('--method') + 1], 'PATCH');
  assert.ok(request.args.includes(`repos/${repository}/pulls/${pullNumber}`));
  assert.deepEqual(JSON.parse(request.input), { body: 'Refs #278\n' });
});
