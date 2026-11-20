// A conservative action selector. GitHub state, not model text, controls writes.
// This first slice never dispatches an unverified Copilot coding session.
export function decide(snapshot) {
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
