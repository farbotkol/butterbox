// Independent evidence gates for releasing a durable implementation lease.
// A timer, AI statement, terminal task alone, or merged PR alone is never enough.
const isSha=s=>/^[a-f0-9]{40}$/.test(s??'');
const terminal=new Set(['completed','failed','cancelled','timed_out']);
export const taskMarker=runId=>'BUTTERBOX_LEASE_RUN='+runId;
export function assessHandoff({lease,tasks,prs,issue,openPRs}={}) {
 const blocked=reason=>({action:'RETAIN_LEASE',reason});
 if(!lease || !lease.runId || !Number.isSafeInteger(lease.issue))return blocked('Unverified lease');
 if(!Array.isArray(tasks)||!Array.isArray(prs)||!Array.isArray(openPRs)||!issue)return blocked('Incomplete GitHub evidence');
 const mark=taskMarker(lease.runId);
 const matches=tasks.filter(t=>(t.sessions??[]).some(s=>(s.prompt??'').includes(mark)));
 if(matches.length!==1)return blocked('Cannot uniquely identify Copilot task from durable lease marker');
 const task=matches[0];
 if(task.state!=='completed'||!(task.sessions??[]).length||task.sessions.some(s=>s.state!=='completed'))return blocked('Copilot writer not independently confirmed completed');
 if(openPRs.some(p=>p.state==='open'&&p.base?.ref==='copilot/Development'))return blocked('Another open Development PR exists');
 if(issue.number!==lease.issue||issue.state!=='closed')return blocked('Issue completion not reconciled');
 const issueMarker='<!-- butterbox-issue: '+lease.issue+' -->';
 const merged=prs.filter(pr=>pr.merged_at&&isSha(pr.merge_commit_sha)&&pr.base?.ref==='copilot/Development'&&
 (pr.body??'').includes(issueMarker)&&/<!-- butterbox-evidence: docs\/agent-work\/issues\/issue-\d+\/pr-\d+\/attempt-\d+\.evidence\.json -->/.test(pr.body??''));
 if(merged.length!==1)return blocked('No unique merged PR with canonical issue/evidence markers');
 // Cross-check the actual PR artifact if supplied by the agent API.
 const artifacts=(task.artifacts??[]).filter(x=>x.type==='pull').map(x=>Number(x.data?.id)).filter(Number.isSafeInteger);
 if(!artifacts.includes(merged[0].number))return blocked('Merged PR does not match confirmed Copilot task artifact');
 return {action:'RELEASE_VERIFIED',taskId:task.id,pr:merged[0].number,mergeSha:merged[0].merge_commit_sha};
}
