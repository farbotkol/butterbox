import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  canonicalIssueNumber,
  getEvidencePathFromPullRequest,
  hasCanonicalIssueApproval,
  hasAutoCloseKeyword,
  evidenceIsComplete,
  referencesCanonicalIssue,
  parseAcceptanceCriteria,
  validateEvidenceFile,
} from './evidence.mjs';

function workflowValue(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A').replaceAll(':', '%3A');
}

function runGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pullRequest = event.pull_request;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!pullRequest || !Number.isSafeInteger(pullRequest.number) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('Issue evidence validation requires a pull_request event and owner/name repository');
  }
  const issueNumber = canonicalIssueNumber(pullRequest.body);
  if (!issueNumber || !referencesCanonicalIssue(pullRequest.body, issueNumber)) {
    throw new Error('PR body must include `Refs #N` and the matching canonical issue marker');
  }
  const evidencePath = getEvidencePathFromPullRequest(
    pullRequest.body, issueNumber, pullRequest.number,
  );
  if (!evidencePath) throw new Error('PR body must include its matching attempt-specific JSON evidence marker');

  const pages = JSON.parse(runGh([
    'api', '--hostname', 'github.com', '--paginate', '--slurp',
    `repos/${repository}/pulls/${pullRequest.number}/files?per_page=100`,
  ])).flat();
  const changedFiles = pages.map(file => file.filename);
  const issue = JSON.parse(runGh([
    'api', '--hostname', 'github.com',
    `repos/${repository}/issues/${issueNumber}`,
  ]));
  if (!issue || issue.pull_request) throw new Error(`Canonical issue #${issueNumber} could not be verified`);
  const acceptanceCriteria = parseAcceptanceCriteria(issue.body).map(item => item.description.trim());
  const pairedMarkdown = evidencePath.replace(/\.evidence\.json$/, '.md');
  if (!changedFiles.includes(evidencePath) || !changedFiles.includes(pairedMarkdown)) {
    throw new Error('PR must add both its JSON evidence and paired Markdown file');
  }

  const { evidence, errors } = await validateEvidenceFile(evidencePath, {
    repository,
    issueNumber,
    pullNumber: pullRequest.number,
    headSha: pullRequest.head.sha,
    changedFiles,
    acceptanceCriteria,
  });
  if (errors.length) {
    throw new Error(`Invalid issue evidence: ${errors.map(workflowValue).join('; ')}`);
  }
  if (hasAutoCloseKeyword(pullRequest.body)) {
    if (!evidenceIsComplete(evidence, changedFiles, acceptanceCriteria)) {
      throw new Error('Partial or incomplete issue delivery must not use GitHub auto-close keywords');
    }
    const reviews = JSON.parse(runGh([
      'api', '--hostname', 'github.com', '--paginate', '--slurp',
      `repos/${repository}/pulls/${pullRequest.number}/reviews?per_page=100`,
    ])).flat();
    const ownerLogin = repository.split('/')[0];
    if (!hasCanonicalIssueApproval(reviews, pullRequest.head.sha, issueNumber, ownerLogin)) {
      throw new Error(`Repository owner must approve the canonical issue #${issueNumber} on this exact PR head before issue auto-closure`);
    }
  }
  console.log(`Validated attempt ${evidence.attempt} evidence for issue #${issueNumber}, PR #${pullRequest.number}.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
