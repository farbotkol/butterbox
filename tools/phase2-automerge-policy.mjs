import { isAutonomousDevelopmentPR } from './agent-evidence/evidence.mjs';
import { fileURLToPath } from 'node:url';

const DEVELOPMENT_BRANCH = 'copilot/Development';

export function evaluatePhase2Eligibility(pullRequest, repository) {
  const reject = reason => ({ eligible: false, reason });

  if (typeof repository !== 'string' || repository.length === 0) {
    return reject('repository identity is unavailable; refusing to evaluate eligibility.');
  }
  if (!pullRequest || typeof pullRequest !== 'object') {
    return reject('pull request metadata is unavailable; refusing to evaluate eligibility.');
  }
  if (pullRequest.state !== 'open') {
    return reject('pull request is not open.');
  }
  if (pullRequest.base?.ref !== DEVELOPMENT_BRANCH) {
    return reject(`target branch must be ${DEVELOPMENT_BRANCH}.`);
  }
  if (isAutonomousDevelopmentPR(pullRequest)) {
    return reject('Autonomous Development uses the delivery controller acceptance and merge gate.');
  }
  if (pullRequest.head?.repo?.full_name !== repository) {
    return reject('head repository must be this repository; fork or missing heads are not eligible.');
  }
  if (typeof pullRequest.head?.ref !== 'string' || !pullRequest.head.ref.startsWith('copilot/')) {
    return reject('head branch must use the copilot/ namespace.');
  }
  if (typeof pullRequest.user?.login !== 'string' ||
      pullRequest.user.login.toLowerCase() !== 'copilot') {
    return reject('pull request author must be the Copilot account.');
  }
  if (typeof pullRequest.head?.sha !== 'string' || pullRequest.head.sha.length === 0) {
    return reject('head commit SHA is missing; refusing to evaluate checks.');
  }
  if (pullRequest.draft !== false) {
    return reject('pull request is draft or draft status is unknown; mark it ready after review.');
  }
  if (!Array.isArray(pullRequest.requested_reviewers) ||
      !Array.isArray(pullRequest.requested_teams)) {
    return reject('review-request metadata is incomplete; refusing to evaluate eligibility.');
  }
  if (pullRequest.requested_reviewers.length > 0 || pullRequest.requested_teams.length > 0) {
    return reject('reviewers are still requested; wait for the requested review before auto-merge.');
  }

  return {
    eligible: true,
    reason: 'open, non-draft Copilot PR from this repository targeting Development with no pending review requests.',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = JSON.parse(await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  }));
  const result = evaluatePhase2Eligibility(input.pullRequest, input.repository);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
