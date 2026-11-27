import { createHash } from 'node:crypto';
import { isSha } from './handoff.mjs';
import { githubDiagnostic } from './api-response.mjs';

const prefix = '<!-- butterbox-native-merge:v1 -->\n';
const bot = 41898282;
const interval = 15 * 60000;
const unverified = message => Object.assign(new Error(message), { code: 'CONTROLLER_API', category: 'integration' });
const requiredWorkflows = new Set(['.github/workflows/ci.yml', '.github/workflows/fast-database-candidate.yml']);

export async function submitNativeMerge({ gh, paged, pr, lease, tip, ci, body, report, now }) {
  const endpoint = '/pulls/' + pr.number;
  const route = '/issues/' + lease.issue + '/comments';
  const head = pr.head.sha;
  const label = 'issue #' + lease.issue + ' PR #' + pr.number + ' head ' + head;
  const bound = row => row.lease === lease.tagSha && row.pr === pr.number && row.head === head;
  const prior = (await paged(route))
    .filter(row => row.user?.id === bot && row.created_at === row.updated_at && row.body?.startsWith(prefix))
    .sort((a, b) => b.id - a.id).map(row => JSON.parse(row.body.slice(prefix.length))).find(bound);

  const snapshot = async current => {
    const runs = await gh('/actions/runs?head_sha=' + head + '&event=pull_request&per_page=100');
    if (!Array.isArray(runs.workflow_runs) || runs.total_count !== runs.workflow_runs.length)
      throw unverified('Incomplete exact-head merge workflow evidence for ' + label);
    const latest = new Map();
    for (const row of runs.workflow_runs.sort((a, b) => b.id - a.id)) {
      if (row.event === 'pull_request' && row.head_sha === head &&
          row.head_repository?.full_name === pr.head.repo.full_name &&
          row.pull_requests?.some(pull => pull.number === pr.number) &&
          requiredWorkflows.has(row.path) && !latest.has(row.path)) latest.set(row.path, row);
    }
    const workflows = [...latest.values()].map(row => [row.id, row.run_attempt, row.status, row.conclusion, row.actor?.login]);
    const approval = workflows.some(([, , , conclusion, actor]) => conclusion === 'action_required' && actor === 'github-actions[bot]');
    const key = createHash('sha256').update(JSON.stringify([tip, ci, current.mergeable_state,
      current.merge_commit_sha, workflows])).digest('hex');
    return { key, approval, workflows };
  };
  const waiting = (reason, nextAt) => {
    report('MERGE_WAIT ' + label + ' · ' + reason + ' · reassess ' + new Date(nextAt).toISOString());
    return null;
  };
  if (prior) {
    if (!Number.isSafeInteger(prior.nextAt) || !Number.isSafeInteger(prior.firstAt) || !Number.isSafeInteger(prior.attempt) ||
        prior.attempt < 1 || !isSha(prior.head) || typeof prior.key !== 'string')
      throw unverified('Invalid native merge checkpoint for ' + label);
    if (now() < prior.nextAt) return waiting(prior.reason, prior.nextAt);
    const current = await snapshot(pr);
    if (prior.approval === true && current.approval)
      return waiting(prior.reason, now() + interval);
    if (current.key === prior.key) {
      if (!current.approval && (now() - prior.firstAt >= 4 * interval || prior.attempt >= 4))
        return { exhausted: true, reason: prior.reason };
      return waiting(prior.reason, now() + interval);
    }
  }

  report('MERGE_REQUEST ' + label);
  let failure, result;
  try {
    result = await gh(endpoint + '/merge', 'PUT', body);
    if (result?.merged === true && isSha(result.sha)) return result;
    failure = Object.assign(new Error('Unconfirmed GitHub merge response · ' + githubDiagnostic(result)),
      { code: 'CONTROLLER_API', category: 'integration', nativeRestriction: Boolean(result?.merged === false && result?.message) });
  } catch (error) {
    failure = error;
  }
  // This read is deliberately before classifying a failed or ambiguous mutation.
  const fresh = await gh(endpoint);
  if (fresh.number !== pr.number || fresh.head?.sha !== head ||
      fresh.head?.ref !== pr.head.ref || fresh.head?.repo?.full_name !== pr.head.repo.full_name) {
    report('MERGE_REVALIDATE ' + label + ' · PR identity or head changed');
    return null;
  }
  if (fresh.state === 'closed' && fresh.merged === true && fresh.merged_by?.id === bot && isSha(fresh.merge_commit_sha))
    return { merged: true, sha: fresh.merge_commit_sha };
  if (fresh.state !== 'open' || fresh.merged !== false) {
    report('MERGE_REVALIDATE ' + label + ' · PR state changed');
    return null;
  }
  if (!failure.nativeRestriction && ![405, 409, 422].includes(failure.status)) throw failure;
  const observed = await snapshot(fresh);
  const reason = failure.message.slice(0, 550) + (observed.approval
    ? ' · GitHub Actions maintainer approval required for PR runs ' +
      observed.workflows.filter(row => row[3] === 'action_required').map(row => row[0]).join(', ')
    : ' · native restriction; await changed GitHub evidence');
  const attempt = (prior?.attempt ?? 0) + 1;
  if (!observed.approval && attempt >= 4) return { exhausted: true, reason };
  const nextAt = now() + interval;
  const checkpoint = prefix + JSON.stringify({ lease: lease.tagSha, pr: pr.number, head, key: observed.key,
    firstAt: prior?.firstAt ?? now(), nextAt, attempt, approval: observed.approval, reason });
  const saved = await gh(route, 'POST', { body: checkpoint });
  if (saved.user?.id !== bot || saved.body !== checkpoint || saved.created_at !== saved.updated_at)
    throw unverified('GitHub did not confirm the native merge checkpoint for ' + label);
  report('MERGE_BLOCKED ' + label + ' · ' + reason);
  return waiting(reason, nextAt);
}
