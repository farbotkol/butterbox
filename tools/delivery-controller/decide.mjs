// A conservative action selector. GitHub state, not model text, controls writes.
// This first slice never dispatches an unverified Copilot coding session.
export function decide(snapshot) {
  // Live lease ownership is authoritative. Unknown/malformed state is not free.
  const lease = snapshot?.lease;
  if (!lease || !['free', 'held'].includes(lease.state)) {
    return { action: 'REPORT_BLOCKED', reason: 'Live lease state is unavailable or invalid; fail closed.' };
  }
  if (lease.state === 'held') {
    if (!Number.isSafeInteger(lease.issue) || lease.issue < 1 || !/^[A-Za-z0-9_-]{1,96}$/.test(lease.runId ?? '')) {
      return { action: 'REPORT_BLOCKED', reason: 'Live lease owner metadata is invalid; fail closed.' };
    }
    return { action: 'REPORT_BLOCKED', reason: 'Exclusive implementation lease held by issue #' + lease.issue + ' / run ' + lease.runId + '; do not act concurrently.' };
  }
  const prs = (snapshot.pullRequests ?? []).filter(
    (p) => p.state === 'open' && p.base?.ref === 'copilot/Development',
  );
  if (prs.length > 1) return { action: 'REPORT_BLOCKED', reason: 'Multiple open Development PRs; do not start or merge concurrently.' };
  if (prs.length === 1) {
    const pr = prs[0];
    if (!Number.isSafeInteger(pr.number) || pr.number < 1) return { action: 'REPORT_BLOCKED', reason: 'Invalid PR identifier.' };
    if (pr.draft || pr.mergeable !== true) return { action: 'OBSERVE', pr: pr.number, reason: 'PR is draft or mergeability is unconfirmed.' };
    if (!/^([a-f0-9]{40})$/.test(pr.head?.sha ?? '')) return { action: 'REPORT_BLOCKED', reason: 'Invalid PR head SHA.' };
    return { action: 'REQUEST_GUARDED_MERGE', pr: pr.number, sha: pr.head.sha, reason: 'Existing protected merge workflow will recheck all required gates.' };
  }
  return { action: 'REPORT_BLOCKED', reason: 'No active Development PR. Copilot coding-session dispatch is not verified; no agent was launched.' };
}
