// Deterministic, owner-opt-in GitHub Issues queue. Never execute text from an issue.
const validId = n => Number.isSafeInteger(n) && n > 0;
const labels = i => new Set((i.labels ?? []).map(x => String(typeof x === 'string' ? x : x.name).toLowerCase()));
const blockedTerms = /\b(blocked|hold dispatch|do not dispatch|not dispatched|external authorization|external authorisation|owner action|consent required)\b/i;
const nonStories = /^\s*(\[(?:epic|dev-factory|beta|ci)|dev-factory:|epic:)/i;
function priority(i) {
  const tags=labels(i);
  const content=[i.title, i.body?.slice(0,350) ?? ''].join(' ');
  if(tags.has('p0') || /\[(?:p0|showcase p0)\]/i.test(i.title ?? '') || /(?:Showcase priority|Priority):\s*P0\b/i.test(content)) return 0;
  return 1;
}
export function selectReadyIssue({issues, prs, activeTasks, lease, snapshotComplete=true}={}) {
  const blocked = reason => ({action:'REPORT_BLOCKED',reason});
  if (!snapshotComplete || !Array.isArray(issues) || !Array.isArray(prs) || !Array.isArray(activeTasks)) return blocked('Unverified or truncated GitHub snapshot');
  if (!lease || lease.state !== 'free') return blocked('Exclusive lease is held or unknown');
  if (prs.some(p => p.state === 'open' && p.base?.ref === 'copilot/Development')) return blocked('Open Development PR exists; do not create another implementation');
  if (activeTasks.length) return blocked('Existing Copilot task may still be writing');
  const ready=issues.filter(i=>{
    if(!validId(i.number) || i.state !== 'open' || i.pull_request) return false;
    const tags=labels(i);
    if(!tags.has('autonomy-ready') || !tags.has('p0')) return false; // explicit owner authorization
    if([...tags].some(t=>['blocked','hold','external','needs-owner','in-progress'].includes(t))) return false;
    if(nonStories.test(i.title??'')) return false;
    if(blockedTerms.test((i.title??'')+' '+(i.body??'').slice(0,2000))) return false;
    if(!/## Acceptance criteria/i.test(i.body??'')) return false;
    if(/#(?:268|270)\b/.test((i.title??'')+' '+(i.body??''))) return false;
    // Dependencies must be resolved externally; only explicitly dependency-free stories can be dispatched.
    if(!tags.has('dependencies-cleared')) return false;
    return true;
  }).sort((a,b)=>priority(a)-priority(b)||a.number-b.number);
  if (!ready.length) return blocked('No explicitly authorised dependency-cleared P0 story');
  return {action:'SELECT_NEXT_READY', issue:ready[0].number, title:ready[0].title};
}
