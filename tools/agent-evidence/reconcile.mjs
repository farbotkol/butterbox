import { execFileSync } from 'node:child_process';
import {
  buildReconciliationComment,
  canonicalIssueNumber,
  evidenceIsComplete,
  hasCanonicalIssueApproval,
  parseAcceptanceCriteria,
  getEvidencePathFromPullRequest,
  referencesCanonicalIssue,
  requiredCiStatus,
  validateMarkdownEvidence,
  validateRepositoryEvidence,
} from './evidence.mjs';

const TARGET_BRANCH = 'copilot/Development';
const SHA = /^[a-f0-9]{40}$/i;

function assertRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be owner/name');
  }
}

function parsePages(output) {
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed.flat() : parsed;
}

export function createGitHubApi({
  repository,
  token = process.env.GH_TOKEN,
  run = (args, input) => execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    env: { ...process.env, GH_TOKEN: token },
    maxBuffer: 20 * 1024 * 1024,
  }),
} = {}) {
  assertRepository(repository);
  if (!token) throw new Error('GH_TOKEN is required');

  const api = path => {
    const args = ['api', '--hostname', 'github.com'];
    args.push(path);
    return JSON.parse(run(args));
  };
  const pages = (path) => parsePages(run(['api', '--hostname', 'github.com', '--paginate', '--slurp', path]));

  return {
    listMergedPullRequests: () => pages(`repos/${repository}/pulls?state=closed&base=${encodeURIComponent(TARGET_BRANCH)}&per_page=100&sort=updated&direction=desc`),
    getIssue: number => api(`repos/${repository}/issues/${number}`),
    getPullRequestReviews: number => pages(`repos/${repository}/pulls/${number}/reviews?per_page=100`),
    isIssueLinkedToPullRequest: async (issueNumber, pullNumber) => {
      const timeline = pages(`repos/${repository}/issues/${issueNumber}/timeline?per_page=100`);
      return timeline.some(event =>
        event.event === 'cross-referenced' &&
        event.source?.issue?.number === pullNumber &&
        Boolean(event.source.issue.pull_request));
    },
    getFiles: number => pages(`repos/${repository}/pulls/${number}/files?per_page=100`),
    getCheckRuns: sha => pages(`repos/${repository}/commits/${sha}/check-runs?per_page=100`)
      .flatMap(page => page.check_runs ?? []),
    getComments: number => pages(`repos/${repository}/issues/${number}/comments?per_page=100`),
    getEvidence: async (evidencePath, ref) => {
      try {
        const content = api(`repos/${repository}/contents/${evidencePath}?ref=${encodeURIComponent(ref)}`);
        const raw = Buffer.from(content.content, 'base64').toString('utf8');
        try {
          return JSON.parse(raw);
        } catch {
          return { _invalidEvidenceJson: true };
        }
      } catch (error) {
        if (/HTTP 404|Not Found/i.test(error.stderr?.toString?.() ?? error.message)) return null;
        throw error;
      }
    },
    getMarkdown: async (markdownPath, ref) => {
      try {
        const content = api(`repos/${repository}/contents/${markdownPath}?ref=${encodeURIComponent(ref)}`);
        return Buffer.from(content.content, 'base64').toString('utf8');
      } catch (error) {
        if (/HTTP 404|Not Found/i.test(error.stderr?.toString?.() ?? error.message)) return null;
        throw error;
      }
    },
    postComment: (number, body) => run(
      ['api', '--hostname', 'github.com', '--method', 'POST', `repos/${repository}/issues/${number}/comments`, '--input', '-'],
      `${JSON.stringify({ body })}\n`,
    ),
  };
}

function confirmedMerged(pullRequest) {
  return pullRequest?.merged === true ||
    (pullRequest?.state === 'closed' && Boolean(pullRequest.merged_at) && SHA.test(pullRequest.merge_commit_sha ?? ''));
}

export async function reconcilePullRequest({ repository, pullRequest, api }) {
  const number = pullRequest?.number;
  const result = { pullNumber: number, status: 'skipped', reason: null };
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Pull request number is invalid');
  if (!confirmedMerged(pullRequest) || !pullRequest.merged_at ||
      pullRequest.base?.ref !== TARGET_BRANCH || !SHA.test(pullRequest.merge_commit_sha ?? '')) {
    result.reason = 'PR is not confirmed merged to copilot/Development';
    return result;
  }

  const issueNumber = canonicalIssueNumber(pullRequest.body);
  if (!issueNumber) {
    result.reason = 'PR body lacks the canonical <!-- butterbox-issue: N --> marker';
    return result;
  }
  if (!referencesCanonicalIssue(pullRequest.body, issueNumber)) {
    result.status = 'blocked';
    result.reason = `PR body must visibly reference its canonical issue with Refs #${issueNumber}`;
    return result;
  }
  const mergeSha = pullRequest.merge_commit_sha;
  const evidencePath = getEvidencePathFromPullRequest(pullRequest.body, issueNumber, number);
  const ownerLogin = repository.split('/')[0];
  const [issue, linked, reviews, files, checkRuns] = await Promise.all([
    api.getIssue(issueNumber),
    api.isIssueLinkedToPullRequest(issueNumber, number),
    api.getPullRequestReviews(number),
    api.getFiles(number),
    api.getCheckRuns(pullRequest.head.sha),
  ]);
  if (!issue || issue.pull_request) throw new Error(`Canonical issue #${issueNumber} could not be verified`);
  const acceptanceCriteria = parseAcceptanceCriteria(issue.body).map(item => item.description.trim());
  if (!hasCanonicalIssueApproval(reviews, pullRequest.head.sha, issueNumber, ownerLogin)) {
    result.status = 'blocked';
    result.reason = `Repository owner must approve the canonical issue #${issueNumber} association on the exact PR head`;
    return result;
  }
  if (!linked) {
    result.status = 'blocked';
    result.reason = `GitHub has no verified cross-reference from issue #${issueNumber} to PR #${number}`;
    return result;
  }

  const changedFiles = files.map(file => file.filename);
  const ci = requiredCiStatus(checkRuns);
  const errors = [];
  let evidence = null;
  if (!evidencePath) {
    errors.push('PR body lacks a valid attempt-specific evidence path');
  } else {
    evidence = await api.getEvidence(evidencePath, mergeSha);
    if (!evidence) {
      errors.push('Evidence JSON is missing from the merged commit');
    } else {
      const markdown = await api.getMarkdown(evidence.markdownPath, mergeSha);
      errors.push(...validateMarkdownEvidence(evidence, markdown));
      errors.push(...validateRepositoryEvidence(evidence, {
        repository,
        issueNumber,
        pullNumber: number,
        headSha: pullRequest.head.sha,
        mergeSha,
        changedFiles,
        evidencePath,
        acceptanceCriteria,
      }));
    }
  }

  const marker = `<!-- butterbox-reconciliation:v1:pr-${number}:${mergeSha} -->`;
  const existingComments = await api.getComments(issueNumber);
  const ciPassed = ci.verify.status === 'pass' && ci.database.status === 'pass';
  const unverified = errors.length > 0 || !ciPassed ||
    !evidenceIsComplete(evidence, changedFiles, acceptanceCriteria);
  if (existingComments.some(comment => comment.body?.includes(marker))) {
    return {
      ...result,
      status: unverified ? 'merged-unverified' : 'already-reconciled',
      issueNumber,
      mergeSha,
      ci,
      errors,
    };
  }

  const comment = buildReconciliationComment({
    repository,
    issueNumber,
    pullNumber: number,
    headSha: pullRequest.head.sha,
    mergeSha,
    ci,
    evidence,
    errors,
    changedFiles,
    evidencePath,
    acceptanceCriteria,
  });
  await api.postComment(issueNumber, comment);
  return {
    ...result,
    status: unverified ? 'merged-unverified' : 'merged-evidence-recorded',
    issueNumber,
    mergeSha,
    ci,
    errors,
  };
}

export async function reconcileCandidates({ repository, pullRequests, api }) {
  const ordered = [...pullRequests]
    .filter(pr => confirmedMerged(pr) && pr.base?.ref === TARGET_BRANCH)
    .sort((left, right) =>
      String(left.merged_at ?? '').localeCompare(String(right.merged_at ?? '')) ||
      left.number - right.number);
  const results = [];
  const failures = [];
  for (const pullRequest of ordered) {
    try {
      results.push(await reconcilePullRequest({ repository, pullRequest, api }));
    } catch (error) {
      failures.push({ pullNumber: pullRequest.number, error });
    }
  }
  const unresolved = results.filter(result => result.status === 'blocked' || result.status === 'merged-unverified');
  if (failures.length || unresolved.length) {
    const affected = [
      ...failures.map(item => item.pullNumber),
      ...unresolved.map(item => item.pullNumber),
    ];
    throw new AggregateError(
      failures.map(item => item.error),
      `Reconciliation unresolved for PR(s): ${affected.map(number => `#${number}`).join(', ')}`,
    );
  }
  return results;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  assertRepository(repository);
  const api = createGitHubApi({ repository });
  const pullRequests = await api.listMergedPullRequests();
  const results = await reconcileCandidates({ repository, pullRequests, api });
  for (const result of results) {
    console.log(`PR #${result.pullNumber}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
