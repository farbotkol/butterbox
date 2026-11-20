// Dependency resolution is a deterministic gate around untrusted AI proposals.
// It does not itself launch an agent or write a GitHub Issue.
const isId = value => Number.isSafeInteger(value) && value > 0;
const norm = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
const hasExternalConsent = value => /oauth|authorization|authorisation|consent|contract|legal sign.off|billing|production credential|customer access/i.test(value ?? '');

export function resolveDependency({parent, proposal, issues = [], activeWriter = false, activePRs = [], maxDepth = 3} = {}) {
  const blocked = reason => ({action:'REPORT_BLOCKED',reason});
  if (!parent || !isId(parent.number) || parent.state !== 'open') return blocked('Parent must be an open GitHub issue.');
  if (!proposal || !isId(proposal.parentIssue) || proposal.parentIssue !== parent.number) return blocked('Proposal must target this parent issue.');
  if (proposal.kind !== 'code' && proposal.kind !== 'external') return blocked('Unknown dependency type.');
  if (!Number.isSafeInteger(proposal.depth) || proposal.depth < 1 || proposal.depth > maxDepth) return blocked('Dependency chain exceeds allowed depth or is invalid.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 .,:/()_+#-]{11,139}$/.test(proposal.title ?? '')) return blocked('Invalid prerequisite title.');
  if (typeof proposal.body !== 'string' || proposal.body.length < 80 || proposal.body.length > 6000 ||
    !proposal.body.includes('## Acceptance criteria')) return blocked('Prerequisite needs scoped evidence and acceptance criteria.');
  if (!Array.isArray(issues) || !Array.isArray(activePRs)) return blocked('Incomplete GitHub snapshot.');
  if (issues.length >= 100 || activePRs.length >= 100) return blocked('GitHub snapshot may be truncated.');
  if (activeWriter || activePRs.some(pr => pr.state === 'open' && pr.base?.ref === 'copilot/Development')) {
    return blocked('Active implementation writer or Development PR; cannot transfer exclusive lease.');
  }
  if (hasExternalConsent(proposal.title + ' ' + proposal.body) || proposal.kind === 'external') {
    return {action:'PARK_EXTERNAL',parentIssue:parent.number,reason:'External authorization or owner consent cannot be implemented by a coding agent.'};
  }
  const key = norm(proposal.title);
  const existing = issues.find(issue => isId(issue.number) && issue.number !== parent.number &&
    issue.state !== 'closed' && (norm(issue.title) === key ||
      (typeof proposal.storyId === 'string' && proposal.storyId.length >= 5 &&
       (issue.title ?? '').includes(proposal.storyId))));
  if (existing) return {action:'REUSE_PREREQUISITE',parentIssue:parent.number,issue:existing.number,depth:proposal.depth};
  if (issues.some(issue => issue.number === parent.number && issue.state !== 'open')) return blocked('Parent state changed.');
  return {action:'PROPOSE_PREREQUISITE',parentIssue:parent.number,
    title:proposal.title.trim(),body:proposal.body,depth:proposal.depth,
    reason:'Valid candidate; recheck live issues and exclusive lease before creating.'};
}
