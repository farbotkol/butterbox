import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { evaluatePhase2Eligibility } from '../tools/phase2-automerge-policy.mjs';

const repository = 'farbotkol/butterbox';

function pullRequest(overrides = {}) {
  return {
    state: 'open',
    draft: false,
    created_at: '2026-11-06T00:00:00Z',
    user: { login: 'Copilot' },
    base: { ref: 'copilot/Development' },
    head: {
      ref: 'copilot/legacy-repair',
      sha: 'a'.repeat(40),
      repo: { full_name: repository },
    },
    requested_reviewers: [],
    requested_teams: [],
    ...overrides,
  };
}

test('allows existing and future Copilot PRs without using a creation-date cutoff', () => {
  for (const created_at of ['2026-11-06T00:00:00Z', '2027-01-01T00:00:00Z']) {
    const result = evaluatePhase2Eligibility(pullRequest({ created_at }), repository);
    assert.equal(result.eligible, true, result.reason);
  }
});

test('rejects mismatched and unsafe PR metadata with actionable reasons', () => {
  const cases = [
    [pullRequest({ state: 'closed' }), /not open/],
    [pullRequest({ base: { ref: 'main' } }), /target branch must be copilot\/Development/],
    [pullRequest({
      head: {
        ref: 'copilot/forked-change',
        sha: 'a'.repeat(40),
        repo: { full_name: 'someone/butterbox' },
      },
    }), /head repository must be this repository/],
    [pullRequest({
      head: {
        ref: 'feature/copilot-change',
        sha: 'a'.repeat(40),
        repo: { full_name: repository },
      },
    }), /head branch must use the copilot\/ namespace/],
    [pullRequest({ user: { login: 'farbotkol' } }), /author must be the Copilot account/],
    [pullRequest({ draft: true }), /draft or draft status is unknown/],
    [pullRequest({ draft: undefined }), /draft or draft status is unknown/],
    [pullRequest({ requested_reviewers: [{ login: 'reviewer' }] }), /reviewers are still requested/],
    [pullRequest({ requested_teams: [{ slug: 'review-team' }] }), /reviewers are still requested/],
    [pullRequest({ requested_reviewers: undefined }), /review-request metadata is incomplete/],
    [pullRequest({
      head: { ref: 'copilot/change', sha: '', repo: { full_name: repository } },
    }), /head commit SHA is missing/],
  ];

  for (const [candidate, expectedReason] of cases) {
    const result = evaluatePhase2Eligibility(candidate, repository);
    assert.equal(result.eligible, false);
    assert.match(result.reason, expectedReason);
  }
});

test('fails closed when repository identity or pull request metadata is missing', () => {
  assert.equal(evaluatePhase2Eligibility(pullRequest(), '').eligible, false);
  assert.equal(evaluatePhase2Eligibility(null, repository).eligible, false);
});

test('workflow retains required CI and native squash auto-merge without draft promotion', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/phase2-automerge-development.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /node tools\/phase2-automerge-policy\.mjs/);
  assert.match(workflow, /for required in verify database/);
  assert.match(workflow, /gh pr merge "\$number" --repo "\$REPO" --squash --auto/);
  assert.doesNotMatch(workflow, /gh pr ready/);
  assert.doesNotMatch(workflow, /--admin|--force/);
  assert.doesNotMatch(workflow, /2026-11-07T01:30:00Z|\.number == 34|\.number == 39/);
});
