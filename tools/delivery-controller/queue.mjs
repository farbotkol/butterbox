// Deterministic, owner-opt-in GitHub Issues queue. Never execute text from an issue.
const validId = n => Number.isSafeInteger(n) && n > 0;
const labels = i => new Set((i.labels ?? []).map(x => String(typeof x === 'string' ? x : x.name).toLowerCase()));
const blockedTerms = /\b(blocked|hold dispatch|do not dispatch|not dispatched|external authorization|external authorisation|owner action|consent required)\b/i;
const nonStories = /^\s*(\[(?:epic|dev-factory|beta|ci)|dev-factory:|epic:)/i;
const priorityPattern = /^p(10|[0-9])(?:\.([0-9]{2}))?$/;

export function queuePriority(issue) {
  const candidates = (issue.labels ?? [])
    .map(label => String(typeof label === 'string' ? label : label.name).toLowerCase())
    .filter(name => /^p[0-9]/.test(name));
  if (candidates.length !== 1) return null;
  const [label, major, minor = '00'] = candidates[0].match(priorityPattern) ?? [];
  return label ? { label, major: Number(major), minor: Number(minor) } : null;
}
export function selectReadyIssue({issues, prs, activeTasks, lease, snapshotComplete=true}={}) {
  const blocked = reason => ({action:'REPORT_BLOCKED',reason});
  if (!snapshotComplete || !Array.isArray(issues) || !Array.isArray(prs) || !Array.isArray(activeTasks)) return blocked('Unverified or truncated GitHub snapshot');
  if (!lease || lease.state !== 'free') return blocked('Exclusive lease is held or unknown');
  if (prs.some(p => p.state === 'open' && p.base?.ref === 'copilot/Development')) return blocked('Open Development PR exists; do not create another implementation');
  if (activeTasks.length) return blocked('Existing Copilot task may still be writing');
  const ready=issues.filter(i=>{
    if(!validId(i.number) || [268, 270].includes(i.number) || i.state !== 'open' || i.pull_request) return false;
    const tags=labels(i);
    if(!queuePriority(i) || !requiredLabels.every(label=>tags.has(label))) return false;
    if([...tags].some(t=>['blocked','hold','external','needs-owner','in-progress','parked','autonomy-parked'].includes(t))) return false;
    if(nonStories.test(i.title??'') || (i.assignees ?? []).length) return false;
    if(blockedTerms.test((i.title??'')+' '+(i.body??'').slice(0,2000))) return false;
    if (!hasAcceptanceCriteria(i.body)) return false;
    if(/#(?:268|270)\b/.test((i.title??'')+' '+(i.body??''))) return false;
    return true;
  }).map(issue => ({ issue, priority: queuePriority(issue) }))
    .sort((a, b) => a.priority.major - b.priority.major ||
      a.priority.minor - b.priority.minor || a.issue.number - b.issue.number);
  if (!ready.length) return blocked('No structurally eligible owner-opt-in story');
  return {action:'SELECT_NEXT_READY', issue:ready[0].issue.number, title:ready[0].issue.title};
}

const requiredLabels = ['autonomy-ready', 'dependencies-cleared'];

function hasAcceptanceCriteria(body) {
  const section = typeof body === 'string' &&
    body.match(/^##[ \t]+Acceptance criteria[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]|$(?![\s\S]))/im);
  return Boolean(section && /^\s*(?:[-*]|[0-9]+\.)[ \t]+(?:\[[ xX]\][ \t]+)?\S/m.test(section[1]));
}

export function ownerApprovedQueueLabels(events, ownerId, issue) {
  if (!Array.isArray(events) || !validId(ownerId)) return false;
  const priority = queuePriority(issue ?? { labels: ['p0'] });
  if (!priority) return false;
  return [...requiredLabels, priority.label].every(label => {
    const event = events.findLast(row =>
      ['labeled', 'unlabeled'].includes(row.event) && row.label?.name?.toLowerCase() === label
    );
    return event?.event === 'labeled' && event.actor?.id === ownerId;
  });
}
