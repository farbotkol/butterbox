import { createHash } from 'node:crypto';
import { verifyTaskSnapshot, assessHandoff, development, isSha } from './handoff.mjs';
import { readLease, recordParking, releaseLease } from './lease.mjs';
import { canonicalIssueNumber } from '../agent-evidence/evidence.mjs';

export const acceptanceIssues = [305, 306];
export const ownerId = 11307166;
const actionsBot = 41898282;
const requiredChecks = ['verify', 'database-smoke'];
export const proofFor = issue => {
  const letter = issue === 305 ? 'A' : 'B';
  const order = issue === 305 ? 'first' : 'second';
  return {
    path: 'docs/agent-work/autonomy-acceptance-' + letter.toLowerCase() + '.md',
    bytes: Buffer.from('# Autonomous delivery acceptance ' + letter +
      '\n\nThis document is the ' + order + ' unattended Butterbox controller acceptance proof.\n'),
  };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const marker = '<!-- butterbox-autonomy-reconciled:v1 -->';
const originalBody = issue => (issue.body ?? '').split('\n\n' + marker)[0];
export const issueDigest = issue => createHash('sha256').update(JSON.stringify([issue.title, originalBody(issue)])).digest('hex');

export function developmentSha(ref) {
  assert(ref?.object?.type === 'commit' && isSha(ref.object.sha), 'Development ref is missing or invalid');
  return ref.object.sha;
}

export function closedByController(issue, events) {
  const lastState = events.findLast(event => ['closed', 'reopened'].includes(event.event));
  return issue.state === 'closed' && issue.state_reason === 'completed' &&
    lastState?.event === 'closed' && lastState.actor?.id === actionsBot && lastState.commit_id === null;
}

export function firstAcceptanceCompleted(issue, events) {
  return issue.number === 305 && !issue.pull_request && closedByController(issue, events) &&
    /<!-- butterbox-autonomy-reconciled:v1 -->\n\nIssue #305 · lease actions_[1-9]\d*_[1-9]\d* · task [0-9a-f-]{36}\n/.test(issue.body ?? '');
}

export function compareProof(file, approved, blob) {
  return file?.type === 'file' && file.encoding === 'base64' && file.sha === blob &&
    typeof file.content === 'string' && Buffer.from(file.content, 'base64').equals(approved);
}

export function verifiedChecks(checks, head, boundary = Date.now()) {
  assert(Array.isArray(checks.check_runs) && checks.total_count === checks.check_runs.length &&
    new Set(checks.check_runs.map(row => row.id)).size === checks.check_runs.length, 'Incomplete check-run snapshot');
  return requiredChecks.map(name => {
    const rows = checks.check_runs.filter(row => row.name === name && row.app?.slug === 'github-actions' &&
      row.app.id === 15368 && row.head_sha === head);
    assert(rows.every(row => Number.isSafeInteger(row.id) && Number.isFinite(time(row.started_at))),
      'Ambiguous check timing for ' + name);
    const check = rows.filter(row => time(row.started_at) <= boundary).sort((a, b) => b.id - a.id)[0];
    assert(check?.status === 'completed' && check.conclusion === 'success' &&
      time(check.completed_at) >= time(check.started_at) && time(check.completed_at) <= boundary &&
      /^https:\/\/github\.com\/farbotkol\/butterbox\/actions\/runs\/\d+\/job\/\d+$/.test(check.html_url ?? ''),
    'Missing successful exact-head check ' + name);
    return name + ' ' + check.html_url;
  });
}

const closesIssue = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s*:?\s*(?:#\d+|[\w.-]+\/[\w.-]+#\d+|https?:\/\/[^\s]+\/issues\/\d+)/i;
const contentsAt = (gh, path, sha) => gh('/contents/' + path + '?ref=' + sha);

export async function openDevelopmentPRs(paged, repository) {
  const prs = await paged('/pulls?state=open&base=copilot%2FDevelopment');
  assert(prs.every(pr => Number.isSafeInteger(pr.number) && pr.state === 'open' &&
    pr.base?.ref === development && pr.base.repo?.full_name === repository && isSha(pr.head?.sha)) &&
    new Set(prs.map(pr => pr.number)).size === prs.length, 'Incomplete open Development PR snapshot');
  return prs;
}

export async function readTaskDetails(api) {
  const rows = verifyTaskSnapshot(await api.list());
  const details = await Promise.all(rows.map(row => api.get(row.id)));
  assert(details.every((task, index) => task?.id === rows[index].id && task.state === rows[index].state),
    'Copilot task list changed during independent verification');
  return details;
}

export async function advanceAcceptance({ repository, gh, paged, tasksApi, leaseApi, lease, runId, report,
  approval, repairBusy, readyPull }) {
  const release = () => releaseLease(leaseApi, {
    runId: lease.runId, expectedTagSha: lease.tagSha, confirmedWriterStopped: true,
  });
  if (!acceptanceIssues.includes(lease.issue) || !/^actions_\d+_\d+$/.test(lease.runId) ||
      !/^[a-f0-9]{64}$/.test(lease.issueDigest ?? '')) {
    report('RETAIN_LEASE: No controlled acceptance scope for the active lease.');
    return;
  }
  const checkIdentity = async () => {
    const [current, issue, tasks, openPRs, repair] = await Promise.all([
      readLease(leaseApi), gh('/issues/' + lease.issue), readTaskDetails(tasksApi),
      openDevelopmentPRs(paged, repository), repairBusy(),
    ]);
    assert(current?.tagSha === lease.tagSha && current.runId === lease.runId, 'Exclusive lease changed');
    assert(!repair, 'CI repair may still be writing');
    assert(issueDigest(issue) === lease.issueDigest, 'Issue requirements changed after lease acquisition');
    return { issue, openPRs, result: assessHandoff({ lease, tasks, openPRs, issue }) };
  };

  const snapshot = await checkIdentity();
  const { issue, result, openPRs } = snapshot;
  if (result.action === 'RETAIN_LEASE') {
    report('RETAIN_LEASE: ' + result.reason);
    return;
  }
  if (result.action === 'PARK_VERIFIED') {
    await recordParking(leaseApi, lease, result);
    const recheck = (await checkIdentity()).result;
    assert(recheck.action === result.action && recheck.taskId === result.taskId, 'Parking evidence changed');
    await release();
    report('PARKED issue #' + lease.issue + ' after task ' + result.taskId + ' ended ' + result.taskState);
    return;
  }

  const { task, artifact } = result;
  const { path, bytes } = proofFor(lease.issue);
  const matching = openPRs.filter(pr => pr.id === artifact || pr.number === artifact);
  assert(openPRs.length === matching.length && matching.length <= 1, 'Competing Development PR exists');
  // A Copilot artifact can be either the PR number or the numeric REST database ID.
  const candidates = matching.length ? matching : (await paged('/pulls?state=closed&base=copilot%2FDevelopment'))
    .filter(pr => pr.number === artifact || pr.id === artifact);
  assert(candidates.length === 1 && Number.isSafeInteger(candidates[0].number), 'Missing or ambiguous PR for Copilot artifact');
  const number = candidates[0].number;
  const endpoint = '/pulls/' + number;
  const pr = await gh(endpoint);
  const head = pr.head?.sha;
  assert(pr.number === number && (pr.id === artifact || pr.number === artifact) &&
    pr.base?.ref === development && pr.base.repo?.full_name === repository &&
    pr.head?.repo?.full_name === repository && pr.head.ref?.startsWith('copilot/') && isSha(head) &&
    task.sessions.some(session => session.head_ref === pr.head.ref), 'PR identity or session head does not match the artifact');
  const body = pr.body ?? '';
  assert(canonicalIssueNumber(body) === lease.issue && (body.match(/<!--\s*butterbox-issue:/g) ?? []).length === 1 && body.split(/\r?\n/).includes('Refs #' + lease.issue) &&
    body.split(/\r?\n/).filter(line => line.startsWith('<!-- butterbox-evidence:')).join() ===
      '<!-- butterbox-evidence: ' + path + ' -->' && !closesIssue.test(body) && !closesIssue.test(pr.title ?? ''),
  'PR lacks canonical issue/proof markers or uses a GitHub issue closing reference');
  assert(Array.isArray(pr.requested_reviewers) && !pr.requested_reviewers.length &&
    Array.isArray(pr.requested_teams) && !pr.requested_teams.length, 'PR still has pending reviews or missing review evidence');

  const [files, headProof, checks, ref, rules] = await Promise.all([
    gh(endpoint + '/files?per_page=2'), contentsAt(gh, path, head),
    gh('/commits/' + head + '/check-runs?filter=all&per_page=100'), gh('/git/ref/heads/' + development),
    gh('/rules/branches/' + encodeURIComponent(development)),
  ]);
  assert(Array.isArray(rules) && rules.some(rule => rule.type === 'pull_request' &&
    rule.parameters?.allowed_merge_methods?.includes('squash')) &&
    requiredChecks.every(name => rules.some(rule => rule.type === 'required_status_checks' &&
      rule.parameters?.required_status_checks?.some(check => check.context === name && check.integration_id === 15368))),
  'Required Development squash and GitHub Actions rules are unavailable');
  assert(pr.changed_files === 1 && Array.isArray(files) && files.length === 1 &&
    files[0].filename === path && files[0].status === 'added' && isSha(files[0].sha) &&
    compareProof(headProof, bytes, files[0].sha), 'PR does not add exactly the approved proof file and bytes');
  const mergedAt = time(pr.merged_at);
  const ci = verifiedChecks(checks, head, pr.merged === true ? mergedAt : Date.now());
  const tip = developmentSha(ref);
  const sessionEvidence = task => JSON.stringify(task.sessions.map(session =>
    [session.id, session.state, session.task_id, session.base_ref, session.head_ref]).sort());
  const confirm = async expectedOpen => {
    const [fresh, freshPR, freshTip, approved] = await Promise.all([
      checkIdentity(), gh(endpoint), gh('/git/ref/heads/' + development), approval(lease.issue),
    ]);
    assert(fresh.result.action === 'VERIFY_PR' && fresh.result.task.id === task.id &&
      sessionEvidence(fresh.result.task) === sessionEvidence(task) &&
      fresh.result.artifact === artifact && fresh.openPRs.length === (expectedOpen ? 1 : 0) &&
      (!expectedOpen || (fresh.openPRs[0].number === number && fresh.openPRs[0].head.sha === head)) &&
      developmentSha(freshTip) === tip && freshPR.head?.sha === head && freshPR.body === pr.body &&
      freshPR.title === pr.title && freshPR.state === pr.state && freshPR.draft === pr.draft &&
      freshPR.merged === pr.merged && freshPR.merged_at === pr.merged_at && freshPR.merged_by?.id === pr.merged_by?.id &&
      freshPR.head?.ref === pr.head.ref && freshPR.head?.repo?.full_name === repository &&
      (!expectedOpen || freshPR.base?.sha === tip) &&
      freshPR.base?.ref === development && freshPR.base?.repo?.full_name === repository &&
      freshPR.merge_commit_sha === pr.merge_commit_sha && freshPR.auto_merge === null &&
      Array.isArray(freshPR.requested_reviewers) && !freshPR.requested_reviewers.length &&
      Array.isArray(freshPR.requested_teams) && !freshPR.requested_teams.length &&
      approved.approved && approved.issue.updated_at === fresh.issue.updated_at,
    'PR, Development, approval or writer evidence changed during handoff');
    return fresh.issue;
  };

  if (pr.state === 'open') {
    assert(pr.merged === false && matching.length === 1 && issue.state === 'open' &&
      !issue.body?.includes(marker) && tip === lease.baseSha && pr.base.sha === tip,
    'Open PR or pinned Development SHA changed');
    const comparison = await gh('/compare/' + tip + '...' + head + '?per_page=1');
    assert(comparison.status === 'ahead' && comparison.merge_base_commit?.sha === tip,
      'PR head is not based on the leased Development commit');
    assert(pr.auto_merge === null && typeof pr.draft === 'boolean' && pr.mergeable === true,
      'PR mergeability, draft state or native auto-merge is unverified');
    const currentIssue = await confirm(true);
    assert(currentIssue.state === 'open' && !currentIssue.body?.includes(marker), 'Issue changed before merge');
    const latest = await gh('/commits/' + head + '/check-runs?filter=all&per_page=100');
    verifiedChecks(latest, head);
    if (pr.draft) {
      assert(typeof pr.node_id === 'string' && pr.node_id.length > 0, 'Missing pull request GraphQL ID');
      await readyPull(pr.node_id, head);
      report('PR_READY #' + number + ' head ' + head + ' · ' + ci.join(' · '));
      return;
    }
    assert(pr.mergeable_state === 'clean', 'GitHub merge requirements are not clean');
    const merge = await gh(endpoint + '/merge', 'PUT', {
      sha: head, merge_method: 'squash', commit_title: 'Add controller acceptance proof for #' + lease.issue,
      commit_message: 'Refs #' + lease.issue,
    });
    assert(merge.merged === true && isSha(merge.sha), 'GitHub did not confirm the protected squash merge');
    report('MERGE_CONFIRMED PR #' + number + ' head ' + head + ' merge ' + merge.sha + ' · ' + ci.join(' · '));
    return;
  }

  const merge = pr.merge_commit_sha;
  assert(pr.state === 'closed' && pr.merged === true && Number.isFinite(mergedAt) && isSha(merge) &&
    pr.merged_by?.id === actionsBot && tip === merge && !openPRs.length,
  'Missing controller merge_commit_sha, bot merge identity, or matching Development tip');
  const [commit, mergedProof] = await Promise.all([
    gh('/commits/' + merge + '?per_page=2'), contentsAt(gh, path, merge),
  ]);
  assert(commit.sha === merge && commit.parents?.length === 1 && commit.parents[0].sha === lease.baseSha &&
    commit.files?.length === 1 && commit.files[0].status === 'added' && commit.files[0].filename === path &&
    commit.files[0].sha === files[0].sha && compareProof(mergedProof, bytes, files[0].sha),
  'Squash commit parent, changed file or proof bytes do not match the verified PR');

  const record = [
    marker, '',
    'Issue #' + lease.issue + ' · lease ' + lease.runId + ' · task ' + task.id,
    'Task https://github.com/' + repository + '/copilot/tasks/' + task.id,
    'Completed sessions ' + task.sessions.map(session => session.id).sort().join(', '),
    'PR #' + number + ' · head ' + head + ' · squash ' + merge + ' · proof blob ' + files[0].sha,
    ...ci,
    'Launch https://github.com/' + repository + '/actions/runs/' + lease.runId.split('_')[1],
  ].join('\n');
  const currentIssue = await confirm(false);
  if (currentIssue.state === 'open') {
    assert(!currentIssue.body?.includes(marker), 'Issue already has reconciliation evidence but is open');
    const closed = await gh('/issues/' + lease.issue, 'PATCH', {
      body: originalBody(currentIssue) + '\n\n' + record + '\nReconciliation https://github.com/' +
        repository + '/actions/runs/' + runId.split('_')[1],
      state: 'closed', state_reason: 'completed',
    });
    assert(closed.number === lease.issue && closed.state === 'closed' && closed.body?.includes(record),
      'GitHub did not confirm issue closure and evidence');
    report('ISSUE_RECONCILED #' + lease.issue + ' PR #' + number + ' merge ' + merge);
  }
  const [closed, events] = await Promise.all([confirm(false), paged('/issues/' + lease.issue + '/events')]);
  assert(closedByController(closed, events) && closed.body?.includes(record + '\nReconciliation '),
    'Missing matching controller closure and audit evidence');
  await release();
  report('LEASE_RELEASED #' + lease.issue + ' task ' + task.id + ' PR #' + number + ' merge ' + merge +
    ' · next selection is a separate run');
}
