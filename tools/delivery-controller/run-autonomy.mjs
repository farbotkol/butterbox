// Cloud-only autonomous issue dispatcher. No unverified coding session is ever claimed.
import {appendFileSync} from 'node:fs';
import {githubLeaseApi} from './github-lease-api.mjs';
import {readLease,acquireLease,releaseLease} from './lease.mjs';
import {selectReadyIssue} from './queue.mjs';
import {agentTasksApi,activeAgentTasks,verifyCreatedTask} from './agent-tasks-api.mjs';
import {assessHandoff,taskMarker} from './handoff.mjs';
const repo=process.env.GITHUB_REPOSITORY;
const ghToken=process.env.GITHUB_TOKEN;
const agentToken=process.env.COPILOT_AGENT_USER_TOKEN;
const runId='actions_'+process.env.GITHUB_RUN_ID;
const summary=process.env.GITHUB_STEP_SUMMARY;
const report=message=>{console.log(message);if(summary)appendFileSync(summary,message+'\n');};
if(repo!=='farbotkol/butterbox'||process.env.GITHUB_REF!=='refs/heads/copilot/Development')throw new Error('Autonomy restricted to Butterbox Development');
if(!ghToken)throw new Error('Missing actions repository token');
if(!agentToken){report('DISPATCH_BLOCKED: COPILOT_AGENT_USER_TOKEN is not configured; no task started.');process.exit(0);}
if(process.env.BUTTERBOX_AUTONOMY_ENABLED!=='true'){report('DISPATCH_DISABLED: owner opt-in switch is not enabled.');process.exit(0);}
const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+ghToken,'X-GitHub-Api-Version':'2022-11-28'};
async function gh(path) {
 const response=await fetch('https://api.github.com/repos/'+repo+path,{headers});
 if(!response.ok)throw new Error('GitHub snapshot HTTP '+response.status+' for '+path);
 return response.json();
}
async function paged(path) {
 const all=[];
 for(let page=1;page<=10;page++){
   const rows=await gh(path+(path.includes('?')?'&':'?')+'per_page=100&page='+page);
   if(!Array.isArray(rows))throw new Error('GitHub paged snapshot not array');
   all.push(...rows);
   if(rows.length<100)return all;
 }
 throw new Error('GitHub page cap reached; fail closed');
}
const leaseApi=githubLeaseApi({token:ghToken,repository:repo});
const tasksApi=agentTasksApi({token:agentToken,repository:repo});
const current=await readLease(leaseApi);
if(current){
 const ageHours=(Date.now()-Date.parse(current.startedAt))/3600000;
 report('LEASE_HELD issue #'+current.issue+' run '+current.runId+' age '+ageHours.toFixed(1)+'h. Verifying independently.');
 const [taskRows,openPrRows,closedPrRows,issueRow]=await Promise.all([
  tasksApi.list(),paged('/pulls?state=open&base=copilot%2FDevelopment'),
  paged('/pulls?state=closed&base=copilot%2FDevelopment'),gh('/issues/'+current.issue)
 ]);
 // Read each task independently: list responses omit full session prompt information.
 const taskDetails=await Promise.all(taskRows.map(t=>tasksApi.get(t.id)));
 const result=assessHandoff({lease:current,tasks:taskDetails,prs:closedPrRows,openPRs:openPrRows,issue:issueRow});
 if(result.action==='RELEASE_VERIFIED'){
   // Only the original lease owner may release. Another run cannot impersonate it:
   // verified GitHub task + issue + PR evidence authorises the recovery operation.
   // Our lease helper requires matching run ID and an externally verified stopped writer.
   await releaseLease(leaseApi,{runId:current.runId,confirmedWriterStopped:true});
   report('LEASE_RELEASED after independently confirmed task '+result.taskId+' PR #'+result.pr+' merge '+result.mergeSha);
   report('Next eligible issue will be considered on the next scheduled run; not in this run.');
 }else{
   report('RETAIN_LEASE: '+result.reason);
   if(ageHours>=12) report('PARK_REVIEW_REQUIRED: age >= 12 hours; do not steal or release while writer status is uncertain.');
 }
 process.exit(0);
}
const [prs,allIssues,agentTasks,ref]=await Promise.all([
 paged('/pulls?state=open&base=copilot%2FDevelopment'),
 paged('/issues?state=open'),
 tasksApi.list(),
 gh('/git/ref/heads/copilot%2FDevelopment')
]);
const issues=allIssues.filter(i=>!i.pull_request);
const selection=selectReadyIssue({issues,prs,activeTasks:activeAgentTasks(agentTasks),lease:{state:'free'}});
if(selection.action!=='SELECT_NEXT_READY'){report(selection.action+': '+selection.reason);process.exit(0);}
if(ref?.object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(ref.object.sha))throw new Error('Current Development SHA invalid');
const issue=await gh('/issues/'+selection.issue);
if(issue.state!=='open'||issue.title!==selection.title)throw new Error('Issue changed since candidate selection');
const recheck=selectReadyIssue({issues:[issue],prs:await paged('/pulls?state=open&base=copilot%2FDevelopment'),activeTasks:activeAgentTasks(await tasksApi.list()),lease:{state:'free'}});
if(recheck.action!=='SELECT_NEXT_READY'||recheck.issue!==issue.number)throw new Error('Candidate changed while checking; fail closed');
const acquired=await acquireLease(leaseApi,{issue:issue.number,runId,baseSha:ref.object.sha});
if(!acquired.acquired){report('LEASE_CONFLICT: another controller owns '+acquired.holder.runId);process.exit(0);}
report('LEASE_ACQUIRED for #'+issue.number+' by '+runId+'. Dispatch will retain lease on ambiguity.');
// Recheck after acquiring atomically. Never dispatch while a competing PR or task exists.
const [finalPrs,finalTasks]=await Promise.all([paged('/pulls?state=open&base=copilot%2FDevelopment'),tasksApi.list()]);
if(finalPrs.length||activeAgentTasks(finalTasks).length){
 report('POST_LEASE_BLOCK: PR/task appeared after initial snapshot. Lease retained for safe manual reconciliation.');
 process.exit(0);
}
const prompt=[
 'Implement Butterbox GitHub issue #'+issue.number+' only, against copilot/Development.',
 taskMarker(runId),
 'Issue: '+issue.title,
 'Read its current GitHub issue description and acceptance criteria before coding.',
 'Respect AGENTS.md, existing CI, tenant isolation, evidence contract and squash merge gates.',
 'Open a DRAFT PR with Refs #'+issue.number+' and canonical issue/evidence markers.',
 'Do not access production, perform database writes, change branch rules, or initiate external OAuth.',
 'Never begin another issue. This session is the sole authorised coding writer.'
].join('\n');
let created;
try{
 created=await tasksApi.create({prompt});
 const confirmed=await tasksApi.get(created.id);
 const live=verifyCreatedTask(created,confirmed);
 report('COPILOT_LAUNCHED: issue #'+issue.number+' task '+live.id+' state='+live.state+' '+live.url+' sessionIds='+JSON.stringify(live.sessionIds));
}catch(error){
 report('DISPATCH_UNCERTAIN: '+error.message+'; lease deliberately retained. Inspect GitHub agent tasks before any retry.');
 throw error;
}
