import { queuePriority } from './queue.mjs';
import { createHash } from 'node:crypto';
import { assessHandoff, development, isSha, taskMarker } from './handoff.mjs';
import { readLease, recordParking, releaseLease } from './lease.mjs';
import { canonicalIssueNumber, referencesCanonicalIssue } from '../agent-evidence/evidence.mjs';
import { productScope, scopedProductFiles, readProductDiff, conflictsWithProduct, productReview, sameSquashFiles } from './product.mjs';
import { assessDevelopmentDrift } from './development-drift.mjs';
import { readTaskDetails, readLeaseCandidates } from './task-inventory.mjs';
export { readTaskDetails } from './task-inventory.mjs';

export const acceptanceIssues = [305, 306];
export const ownerId = 11307166;
const actionsBot = 41898282;
const requiredChecks = ['verify', 'database-smoke'];
export const proofFor = issue => {
  if (!acceptanceIssues.includes(issue)) throw new Error('Issue is outside the controlled acceptance scope');
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

export function firstAcceptanceCompleted(issue, events, number = 305) {
  const note = (issue.body ?? '').split('\n\n' + marker + '\n\n');
  return acceptanceIssues.includes(number) && issue.number === number && !issue.pull_request && closedByController(issue, events) && note.length === 2 &&
    new RegExp('^Issue #' + number + ' · lease actions_[1-9][0-9]*_[1-9][0-9]* · task [0-9a-f-]{36}\n').test(note[1]) &&
    /^Completed sessions [0-9a-f-]{36}(?:, [0-9a-f-]{36})*$/m.test(note[1]) &&
    /^PR #[1-9]\d* · head [0-9a-f]{40} · squash [0-9a-f]{40} · proof blob [0-9a-f]{40}$/m.test(note[1]) &&
    /^Reconciliation https:\/\/github\.com\/farbotkol\/butterbox\/actions\/runs\/\d+$/m.test(note[1]);
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

// PR text is not identity evidence. Only fill missing annotations once independent
// lease, task, artifact, exact proof and CI checks have passed.
export function planAcceptancePrMetadata(body, issueNumber, proofPath, title = '') {
  assert(typeof body === 'string' && typeof title === 'string' && body.length <= 60000,
    'Invalid PR metadata');
  assert(acceptanceIssues.includes(issueNumber) && proofFor(issueNumber).path === proofPath,
    'Unapproved issue or proof identity');
  assert(!closesIssue.test(body) && !closesIssue.test(title),
    'PR uses a GitHub issue closing reference');
  const references = [...body.matchAll(/\b(?:Refs|Related to)\s+#(\d+)\b/gi)]
    .map(match => Number(match[1]));
  assert(references.every(number => number === issueNumber),
    'PR contains a conflicting issue reference');
  const issueTags = [...body.matchAll(/<!--\s*butterbox-issue\s*:\s*([^>]*?)\s*-->/g)];
  const proofTags = [...body.matchAll(/<!--\s*butterbox-evidence\s*:\s*([^>]*?)\s*-->/g)];
  // Malformed or duplicated annotations must never be silently overwritten.
  assert((body.match(/<!--\s*butterbox-issue\s*:/g) ?? []).length === issueTags.length &&
    (body.match(/<!--\s*butterbox-evidence\s*:/g) ?? []).length === proofTags.length &&
    issueTags.length <= 1 && proofTags.length <= 1 &&
    (!issueTags.length || issueTags[0][1].trim() === String(issueNumber)) &&
    (!proofTags.length || proofTags[0][1].trim() === proofPath),
  'PR contains conflicting, duplicate or malformed identity markers');
  const additions = [];
  if (!references.length) additions.push('Refs #' + issueNumber);
  if (!issueTags.length) additions.push('<!-- butterbox-issue: ' + issueNumber + ' -->');
  if (!proofTags.length) additions.push('<!-- butterbox-evidence: ' + proofPath + ' -->');
  const repaired = additions.length ? body.trimEnd() + '\n\n' + additions.join('\n') : body;
  assert(repaired.length <= 60000, 'Repaired PR description exceeds safety limit');
  return { body: repaired, changed: additions.length > 0 };
}

const contentsAt = (gh, path, sha) => gh('/contents/' + path + '?ref=' + sha);

export async function openDevelopmentPRs(paged, repository) {
  const prs = await paged('/pulls?state=open&base=copilot%2FDevelopment');
  assert(prs.every(pr => Number.isSafeInteger(pr.number) && pr.state === 'open' &&
    pr.base?.ref === development && pr.base.repo?.full_name === repository && isSha(pr.head?.sha)) &&
    new Set(prs.map(pr => pr.number)).size === prs.length, 'Incomplete open Development PR snapshot');
  return prs;
}

export async function advanceAcceptance({ repository, gh, paged, tasksApi, leaseApi, lease, runId, report,
  approval, repairBusy, readyPull, closingIssues, mergedRecovery = 'none' }) {
  assert(['none', 'verify', 'release'].includes(mergedRecovery), 'Invalid merged recovery mode');
  const release = () => releaseLease(leaseApi, {
    runId: lease.runId, expectedTagSha: lease.tagSha, confirmedWriterStopped: true, compareAndDelete: true,
  });
  const product = !acceptanceIssues.includes(lease.issue);
  if (!/^actions_\d+_\d+$/.test(lease.runId) ||
      !/^[a-f0-9]{64}$/.test(lease.issueDigest ?? '')) {
    report('RETAIN_LEASE: No controlled acceptance scope for the active lease.');
    return;
  }
  const checkIdentity = async ({ discovery = false } = {}) => {
    const tasks = await (tasksApi.inventory || discovery ? readLeaseCandidates(tasksApi, lease) : readTaskDetails(tasksApi));
    const [current, issue, openPRs, repair] = await Promise.all([
      readLease(leaseApi), gh('/issues/' + lease.issue),
      openDevelopmentPRs(paged, repository), repairBusy(),
    ]);
    assert(current?.tagSha === lease.tagSha && current.runId === lease.runId, 'Exclusive lease changed');
    assert(!repair, 'CI repair may still be writing');
    assert(issueDigest(issue) === lease.issueDigest, 'Issue requirements changed after lease acquisition');
    if (product) assert(productScope(issue) && Array.isArray(issue.assignees) && !issue.assignees.length,
      'Missing approved product scope or issue has a competing assignee');
    return { issue, openPRs, result: assessHandoff({ lease, tasks, openPRs, issue, product }) };
  };

  const snapshot = await checkIdentity({ discovery: true });
  const { issue, result, openPRs } = snapshot;
  if (mergedRecovery !== 'none') {
    assert(issue.state === 'closed' && result.action === 'VERIFY_PR',
      'Merged recovery requires a closed issue and a uniquely stopped task');
  }
  if (result.action === 'RETAIN_LEASE') {
    report('RETAIN_LEASE: ' + result.reason);
    const age = Date.now() - (result.lastActivity ?? time(lease.startedAt));
    if (age >= 60 * 60 * 1000) {
      const level = age >= 2 * 60 * 60 * 1000 ? 'OWNER_ESCALATION' : 'NO_PROGRESS';
      report(level + ' #' + lease.issue + ': ' + (result.taskId ?
        'no observed task progress for ' : 'writer identity or state unresolved after ') +
        Math.floor(age / 60000) + ' minutes; lease retained.');
    }
    return;
  }
  const park = async (expected, readEvidence) => {
    const audited = await readEvidence();
    assert(audited && audited.action === 'PARK_VERIFIED' && audited.taskId === expected.taskId &&
      audited.taskState === expected.taskState, 'Parking evidence changed during writer verification');
    await recordParking(leaseApi, lease, { ...audited, priority: lease.priority ?? queuePriority(issue)?.label });
    const endpoint = '/issues/' + lease.issue + '/comments';
    const marker = '<!-- butterbox-parking:' + lease.tagSha + ' -->';
    const prior = (await paged(endpoint)).filter(comment => comment.user?.id === actionsBot &&
      comment.body?.startsWith(marker + '\n'));
    assert(prior.length <= 1, 'Ambiguous canonical parking evidence');
    if (!prior.length) {
      const body = [
        marker, 'Autonomous delivery parked at ' + new Date().toISOString() + '.',
        'Task ' + audited.taskId + ' ended ' + audited.taskState +
          (audited.taskUrl ? '. Its task PR is closed and unmerged: ' + audited.taskUrl :
            '. Its sessions are terminal and no task PR artifact was found.'),
        'Resolve the task failure before asking the repository owner to review and reauthorise dispatch.',
      ].join('\n');
      const comment = await gh(endpoint, 'POST', { body });
      assert(comment.body === body && comment.user?.id === actionsBot && Number.isSafeInteger(comment.id),
        'GitHub did not confirm canonical parking evidence');
    }
    const recheck = await readEvidence();
    assert(recheck?.action === 'PARK_VERIFIED' && recheck.taskId === expected.taskId &&
      recheck.taskState === expected.taskState, 'Parking evidence changed');
    await release();
    report('PARKED issue #' + lease.issue + ' after task ' + audited.taskId + ' ended ' + audited.taskState);
  };
  if (result.action === 'PARK_VERIFIED') {
    await park(result, async () => (await checkIdentity()).result);
    return;
  }

  const { task, artifact } = result;
  const scope = product && productScope(issue);
  const { path, bytes } = product ? {} : proofFor(lease.issue);
  const matching = openPRs.filter(pr => pr.id === artifact || pr.number === artifact);
  assert(matching.length <= 1, 'Ambiguous task PR exists');
  // A Copilot artifact can be either the PR number or the numeric REST database ID.
  const candidates = matching.length ? matching : (await paged('/pulls?state=closed&base=copilot%2FDevelopment'))
    .filter(pr => pr.number === artifact || pr.id === artifact);
  assert(candidates.length === 1 && Number.isSafeInteger(candidates[0].number), 'Missing or ambiguous PR for Copilot artifact');
  const number = candidates[0].number;
  const endpoint = '/pulls/' + number;
  const pr = await gh(endpoint);
  if (mergedRecovery !== 'none') assert(pr.state === 'closed' && pr.merged === true,
    'Merged recovery requires the task PR to be merged');
  const head = pr.head?.sha;
  assert(pr.number === number && (pr.id === artifact || pr.number === artifact) &&
    pr.base?.ref === development && pr.base.repo?.full_name === repository &&
    pr.head?.repo?.full_name === repository && pr.head.ref?.startsWith('copilot/') && isSha(head) &&
    task.sessions.some(session => session.head_ref === pr.head.ref && typeof session.prompt === 'string' &&
      session.prompt.split(/\r?\n/).includes(taskMarker(lease.runId))), 'PR identity or session head does not match the artifact');
  assert(!openPRs.some(row => row.number !== number && row.head?.repo?.full_name === repository &&
    row.head?.ref === pr.head.ref), 'Competing Development PR uses the leased task branch');
  if (product && pr.state === 'closed' && pr.merged === false && issue.state === 'open') {
    const stopped = { action: 'PARK_VERIFIED', taskId: task.id, taskState: 'closed-unmerged',
      sessionCount: task.session_count, taskUrl: 'https://github.com/' + repository + '/pull/' + number };
    await park(stopped, async () => {
      const [fresh, currentPR] = await Promise.all([checkIdentity(), gh(endpoint)]);
      const verified = fresh.result;
      return fresh.issue.state === 'open' && verified.action === result.action && verified.task.id === task.id &&
        verified.artifact === artifact && currentPR.number === number && currentPR.head?.sha === head &&
        currentPR.state === 'closed' && currentPR.merged === false &&
        !fresh.openPRs.some(row => row.number === number || row.head?.ref === pr.head.ref) ? stopped : null;
    });
    return;
  }
  assert(result.action === 'VERIFY_PR', 'Failed product task still has an unresolved PR artifact');
  let metadata;
  if (product) {
    const refs = [...(pr.body ?? '').matchAll(/\b(?:Refs|Related to)\s+#(\d+)\b/gi)];
    assert(refs.every(ref => Number(ref[1]) === lease.issue) && !closesIssue.test(pr.body ?? '') && !closesIssue.test(pr.title ?? '') &&
      canonicalIssueNumber(pr.body) === lease.issue && referencesCanonicalIssue(pr.body, lease.issue) &&
      (pr.body.match(/<!--\s*butterbox-issue\s*:/g) ?? []).length === 1,
    'Product PR lacks unique canonical metadata or uses an issue closing reference');
    metadata = { changed: false };
  } else {
    metadata = planAcceptancePrMetadata(pr.body ?? '', lease.issue, path, pr.title ?? '');
  }
  // Closed/merged PRs cannot be repaired after the fact.
  if (pr.state !== 'open') assert(!metadata.changed && canonicalIssueNumber(pr.body) === lease.issue,
    'Merged PR lacks verified metadata');
  assert(Array.isArray(pr.requested_reviewers) && !pr.requested_reviewers.length &&
    Array.isArray(pr.requested_teams) && !pr.requested_teams.length, 'PR still has pending reviews or missing review evidence');

  const [files, headProof, checks, ref, rules] = await Promise.all([
    product ? readProductDiff(paged, gh, pr) : gh(endpoint + '/files?per_page=2'),
    product ? null : contentsAt(gh, path, head),
    gh('/commits/' + head + '/check-runs?filter=all&per_page=100'), gh('/git/ref/heads/' + development),
    gh('/rules/branches/' + encodeURIComponent(development)),
  ]);
  assert(Array.isArray(rules) && rules.some(rule => rule.type === 'pull_request' &&
    rule.parameters?.allowed_merge_methods?.includes('squash')) &&
    requiredChecks.every(name => rules.some(rule => rule.type === 'required_status_checks' &&
      rule.parameters?.required_status_checks?.some(check => check.context === name && check.integration_id === 15368))),
  'Required Development squash and GitHub Actions rules are unavailable');
  const productPaths = product && scopedProductFiles(scope, files);
  if (product) assert(files.length < 100, 'Product diff exceeds the verifiable squash bound');
  if (!product) assert(pr.changed_files === 1 && Array.isArray(files) && files.length === 1 &&
    files[0].filename === path && files[0].status === 'added' && isSha(files[0].sha) &&
    compareProof(headProof, bytes, files[0].sha), 'PR does not add exactly the approved proof file and bytes');
  const mergedAt = time(pr.merged_at);
  const readOwnerReview = async () => productReview(await paged(endpoint + '/reviews'), head,
    lease.issue, scope.criteria, ownerId, pr.merged === true ? mergedAt : Date.now(), lease.issueDigest);
  const review = product && (!pr.draft || pr.merged === true) ? await readOwnerReview() : null;
  if (product && !pr.draft && !review) {
    report('PRODUCT_ACCEPTANCE_PENDING #' + lease.issue + ' PR #' + number + ' head ' + head + ' scope ' + lease.issueDigest);
    return;
  }
  const ci = verifiedChecks(checks, head, pr.merged === true ? mergedAt : Date.now());
  const tip = developmentSha(ref);
  // Validate only bounded, complete forward ancestry. The original lease remains immutable.
  const checkedAncestry = async (from, to) => {
    if (from === to) return { kind: 'unchanged', safe: true };
    const comparison = await gh('/compare/' + from + '...' + to + '?per_page=100');
    const verdict = assessDevelopmentDrift({ pinnedSha: from, currentSha: to, comparison, proofPath: path, productPaths });
    assert(verdict.kind === 'candidate', 'Unsafe Development movement: ' + verdict.reason);
    return verdict;
  };
  const sessionEvidence = task => JSON.stringify(task.sessions.map(session =>
    [session.id, session.state, session.task_id, session.base_ref, session.head_ref]).sort());
  const confirm = async (expectedOpen, expectedBody = pr.body) => {
    const fresh = await checkIdentity();
    const [freshPR, freshTip, approved] = await Promise.all([
      gh(endpoint), gh('/git/ref/heads/' + development), approval(lease.issue),
    ]);
    if (product) {
      assert(await closingIssues(freshPR) === 0, 'Product PR has linked issue-closing references');
      if (expectedOpen) assert(!await conflictsWithProduct(paged, gh, fresh.openPRs, scope, number),
        'Competing Development PR overlaps the product work area');
      if (review) {
        const latest = await readOwnerReview();
        assert(latest?.id === review.id && latest.body === review.body, 'Product acceptance review changed');
      }
    }
    assert(fresh.result.action === 'VERIFY_PR' && fresh.result.task.id === task.id &&
      sessionEvidence(fresh.result.task) === sessionEvidence(task) &&
      fresh.result.artifact === artifact &&
      (expectedOpen ? (product || fresh.openPRs.length === 1) &&
        fresh.openPRs.some(row => row.number === number && row.head.sha === head) :
        !fresh.openPRs.some(row => row.id === artifact || row.number === artifact || row.number === number ||
          (row.head?.repo?.full_name === repository && row.head?.ref === pr.head.ref))) &&
      developmentSha(freshTip) === tip && freshPR.head?.sha === head && freshPR.body === expectedBody &&
      freshPR.title === pr.title && freshPR.state === pr.state && freshPR.draft === pr.draft &&
      freshPR.merged === pr.merged && freshPR.merged_at === pr.merged_at && freshPR.merged_by?.id === pr.merged_by?.id &&
      freshPR.head?.ref === pr.head.ref && freshPR.head?.repo?.full_name === repository &&
      (!expectedOpen || freshPR.base?.sha === pr.base.sha) &&
      freshPR.base?.ref === development && freshPR.base?.repo?.full_name === repository &&
      freshPR.merge_commit_sha === pr.merge_commit_sha && freshPR.auto_merge === null &&
      Array.isArray(freshPR.requested_reviewers) && !freshPR.requested_reviewers.length &&
      Array.isArray(freshPR.requested_teams) && !freshPR.requested_teams.length &&
      approved.approved && Number.isFinite(time(fresh.issue.updated_at)) &&
      approved.issue.updated_at === fresh.issue.updated_at,
    'PR, Development, approval or writer evidence changed during handoff');
    return fresh.issue;
  };

  if (pr.state === 'open') {
    assert(product || openPRs.length === 1, 'Competing Development PR exists');
    assert(pr.merged === false && matching.length === 1 && issue.state === 'open' &&
      !issue.body?.includes(marker) && isSha(pr.base?.sha),
    'Open PR or reported Development base is invalid');
    const movement = await checkedAncestry(lease.baseSha, tip);
    // GitHub may retain the original PR base SHA after the target branch advances.
    // Independently prove the reported base lies on the verified forward path.
    // A fresh snapshot must still match both the reported base and live tip.
    if (pr.base.sha !== tip) {
      await checkedAncestry(lease.baseSha, pr.base.sha);
      await checkedAncestry(pr.base.sha, tip);
      report('STALE_PR_BASE_VALIDATED #' + number + ' reported ' + pr.base.sha + ' current ' + tip);
    }
    if (movement.kind === 'candidate') report('DEVELOPMENT_DRIFT_VALIDATED #' + number + ' original ' + lease.baseSha + ' current ' + tip);
    const comparison = await gh('/compare/' + lease.baseSha + '...' + head + '?per_page=1');
    assert(comparison.status === 'ahead' && comparison.merge_base_commit?.sha === lease.baseSha,
      'PR head is not based on the original leased Development commit');
    assert(pr.auto_merge === null && typeof pr.draft === 'boolean' && pr.mergeable === true,
      'PR mergeability, draft state or native auto-merge is unverified');
    const currentIssue = await confirm(true);
    assert(currentIssue.state === 'open' && !currentIssue.body?.includes(marker), 'Issue changed before merge');
    if (metadata.changed) {
      // Separate, reverified stage. Never promote or merge in the repair run.
      const updated = await gh(endpoint, 'PATCH', { body: metadata.body });
      assert(updated.number === number && updated.head?.sha === head &&
        updated.body === metadata.body && updated.state === 'open' &&
        updated.draft === pr.draft && updated.merged === false,
      'GitHub did not confirm exact metadata repair');
      await confirm(true, metadata.body);
      report('PR_METADATA_REPAIRED #' + number + ' head ' + head +
        ' · independently verified issue #' + lease.issue + ' proof ' + path);
      return;
    }
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
      sha: head, merge_method: 'squash', commit_title: (product ? 'Deliver approved product issue #' : 'Add controller acceptance proof for #') + lease.issue,
      commit_message: 'Refs #' + lease.issue,
    });
    assert(merge.merged === true && isSha(merge.sha), 'GitHub did not confirm the protected squash merge');
    report('MERGE_CONFIRMED PR #' + number + ' head ' + head + ' merge ' + merge.sha + ' · ' + ci.join(' · '));
    return;
  }

  const merge = pr.merge_commit_sha;
  assert(pr.state === 'closed' && pr.merged === true && Number.isFinite(mergedAt) && isSha(merge) &&
    pr.merged_by?.id === actionsBot && matching.length === 0,
  'Missing controller merge_commit_sha, bot merge identity, or task PR remains open');
  if (tip !== merge) {
    const ancestry = await gh('/compare/' + merge + '...' + tip + '?per_page=1');
    assert(ancestry.status === 'ahead' && ancestry.base_commit?.sha === merge &&
      ancestry.merge_base_commit?.sha === merge, 'Merged proof is not an ancestor of Development');
  }
  const [commit, mergedProof] = await Promise.all([
    gh('/commits/' + merge + (product ? '?per_page=100' : '?per_page=2')),
    product ? null : contentsAt(gh, path, merge),
  ]);
  assert(commit.sha === merge && commit.parents?.length === 1 && isSha(commit.parents[0].sha) &&
    (product ? files.length < 100 && sameSquashFiles(files, commit.files) :
      commit.files?.length === 1 && commit.files[0].status === 'added' && commit.files[0].filename === path &&
      commit.files[0].sha === files[0].sha && compareProof(mergedProof, bytes, files[0].sha)),
  'Squash commit parent, changed file or proof bytes do not match the verified PR');
  const parent = commit.parents[0].sha;
  await checkedAncestry(lease.baseSha, parent);
  const record = [
    marker, '',
    'Issue #' + lease.issue + ' · lease ' + lease.runId + ' · task ' + task.id,
    'Task https://github.com/' + repository + '/copilot/tasks/' + task.id,
    'Completed sessions ' + task.sessions.map(session => session.id).sort().join(', '),
    'PR #' + number + ' · head ' + head + ' · squash ' + merge +
      (product ? ' · owner acceptance review ' + review.id + ' · issue digest ' + lease.issueDigest : ' · proof blob ' + files[0].sha),
    'Original base ' + lease.baseSha + ' · verified squash parent ' + parent,
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
  if (mergedRecovery === 'verify') {
    report('MERGED_RECOVERY_VERIFIED #' + lease.issue + ' task ' + task.id + ' PR #' + number + ' merge ' + merge);
    return;
  }
  await release();
  report('LEASE_RELEASED #' + lease.issue + ' task ' + task.id + ' PR #' + number + ' merge ' + merge +
    ' · next selection is a separate run');
}
