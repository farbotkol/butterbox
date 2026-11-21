import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessHandoff,taskMarker} from '../tools/delivery-controller/handoff.mjs';
const lease={runId:'actions_123',issue:301};
const pr={number:401,base:{ref:'copilot/Development'},merged_at:'2026-11-22T00:00:00Z',merge_commit_sha:'a'.repeat(40),body:'Refs #301\n<!-- butterbox-issue: 301 -->\n<!-- butterbox-evidence: docs/agent-work/issues/issue-301/pr-401/attempt-01.evidence.json -->'};
const task={id:'a1b2c3d4-e5f6-7890-abcd-ef1234567890',state:'completed',session_count:1,artifacts:[{provider:'github',type:'pull',data:{id:401}}],sessions:[{state:'completed',task_id:'a1b2c3d4-e5f6-7890-abcd-ef1234567890',base_ref:'copilot/Development',prompt:'Work\n'+taskMarker(lease.runId)}]};
const good=(overrides={})=>({lease,tasks:[task],prs:[pr],openPRs:[],issue:{number:301,state:'closed'},...overrides});
test('confirmed completed session, merged canonical PR and closed issue releases lease',()=>assert.equal(assessHandoff(good()).action,'RELEASE_VERIFIED'));
test('queued/active task and ambiguous task evidence retain lock',()=>{
 assert.equal(assessHandoff(good({tasks:[{...task,state:'in_progress'}]})).action,'RETAIN_LEASE');
 assert.equal(assessHandoff(good({tasks:[]})).action,'RETAIN_LEASE');
 assert.equal(assessHandoff(good({tasks:[task,task]})).action,'RETAIN_LEASE');
});
test('not reconciled issue, noncanonical or unlinked PR retains lock',()=>{
 assert.equal(assessHandoff(good({issue:{number:301,state:'open'}})).action,'RETAIN_LEASE');
 assert.equal(assessHandoff(good({prs:[{...pr,body:'Refs #301'}]})).action,'RETAIN_LEASE');
 assert.equal(assessHandoff(good({tasks:[{...task,artifacts:[]}]})).action,'RETAIN_LEASE');
});
test('another active PR and incomplete API view retain lock',()=>{
 assert.equal(assessHandoff(good({openPRs:[{state:'open',base:{ref:'copilot/Development'}}]})).action,'RETAIN_LEASE');
 assert.equal(assessHandoff(good({openPRs:null})).action,'RETAIN_LEASE');
});

test('handoff rejects a marker prefix collision or an incomplete session list',()=>{
 const wrongRun={...task,sessions:[{...task.sessions[0],prompt:taskMarker(lease.runId+'4')}]};
 for(const candidate of [wrongRun,{...task,session_count:2}]) {
  assert.equal(assessHandoff(good({tasks:[candidate]})).action,'RETAIN_LEASE');
 }
});

test('12-hour parking requires fully stopped sessions, an open issue and no PR artifact',()=>{
 const startedAt='2026-11-21T00:00:00Z';
 const now=Date.parse('2026-11-21T12:00:00Z');
 const failed={...task,state:'failed',artifacts:[],sessions:[{...task.sessions[0],state:'failed'}]};
 const snapshot=good({lease:{...lease,startedAt},tasks:[failed],issue:{number:301,state:'open'},now});
 assert.equal(assessHandoff(snapshot).action,'PARK_VERIFIED');
 assert.equal(assessHandoff({...snapshot,now:now-1}).action,'RETAIN_LEASE');
 assert.equal(assessHandoff({...snapshot,tasks:[{...failed,artifacts:task.artifacts}]}).action,'RETAIN_LEASE');
 assert.equal(assessHandoff({...snapshot,tasks:[failed,{state:'waiting_for_user',sessions:[]}]}).action,'RETAIN_LEASE');
 assert.equal(assessHandoff({...snapshot,openPRs:[{state:'open',base:{ref:'copilot/Development'}}]}).action,'RETAIN_LEASE');
});
