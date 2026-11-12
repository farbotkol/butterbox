import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { checkManagedFiles } from './evidence.mjs';

function runGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function workflowValue(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A').replaceAll(':', '%3A');
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pullRequest = event.pull_request;
  if (!pullRequest || !Number.isSafeInteger(pullRequest.number)) {
    throw new Error('Managed-file enforcement requires a pull_request event');
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be owner/name');
  }
  const pages = JSON.parse(runGh([
    'api', '--hostname', 'github.com', '--paginate', '--slurp',
    `repos/${repository}/pulls/${pullRequest.number}/files?per_page=100`,
  ])).flat();
  const reviews = JSON.parse(runGh([
    'api', '--hostname', 'github.com', '--paginate', '--slurp',
    `repos/${repository}/pulls/${pullRequest.number}/reviews?per_page=100`,
  ])).flat();
  const result = checkManagedFiles(pages, {
    labels: pullRequest.labels ?? [],
    pullRequestBody: pullRequest.body ?? '',
    reviews,
    headSha: pullRequest.head.sha,
  });
  if (!result.allowed) {
    const paths = result.managedFiles.length
      ? result.managedFiles.map(workflowValue).join(', ')
      : '(no managed paths)';
    throw new Error(`Independent PRs cannot modify managed archive/status files: ${paths}. Governance exceptions require the exception label and owner approval on the exact head SHA.`);
  }
  if (result.exception) {
    const paths = result.exception.managedFiles.map(workflowValue).join(', ');
    console.log(`::notice::Managed-file exception approved by repository owner for issue #${result.exception.issueNumber}, PR head ${result.exception.headSha}; paths: ${paths}`);
  } else {
    console.log('No managed archive or status files changed.');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
