import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectReadyIssue} from '../tools/delivery-controller/queue.mjs';
import {agentTasksApi,activeAgentTasks,verifyCreatedTask} from '../tools/delivery-controller/agent-tasks-api.mjs';
const story=(number,overrides={})=>({number,title:'[BB-DEMO-TEST] Ready story '+number,state:'open',labels:[{name:'autonomy-ready'},{name:'p0'},{name:'dependencies-cleared'}],body:'## Acceptance criteria\n- [ ] verified implementation tests',...overrides});
const input=(overrides={})=>({issues:[story(301),story(302)],prs:[],activeTasks:[],lease:{state:'free'},...overrides});
test('selects deterministic priority among explicitly authorised stories',()=>assert.equal(selectReadyIssue(input()).issue,301));
test('blocks missing owner approval or dependency clearance',()=>assert.equal(selectReadyIssue(input({issues:[story(301,{labels:[{name:'p0'}]})]})).action,'REPORT_BLOCKED'));
test('blocks open draft PR and agent sessions',()=>{
 assert.equal(selectReadyIssue(input({prs:[{state:'open',base:{ref:'copilot/Development'},draft:true}]})).action,'REPORT_BLOCKED');
 assert.equal(selectReadyIssue(input({activeTasks:[{state:'in_progress'}]})).action,'REPORT_BLOCKED');
});
test('blocks held/unknown lease, incomplete snapshots',()=>{
 for(const lease of [undefined,{state:'held'},{state:'unknown'}]) assert.equal(selectReadyIssue(input({lease})).action,'REPORT_BLOCKED');
 assert.equal(selectReadyIssue(input({snapshotComplete:false})).action,'REPORT_BLOCKED');
});
test('blocks parent issues, Xero dependencies and external consent',()=>{
 for(const title of ['[EPIC] Core things','[P0] Xero #268 dependent task'])assert.equal(selectReadyIssue(input({issues:[story(301,{title})]})).action,'REPORT_BLOCKED');
 assert.equal(selectReadyIssue(input({issues:[story(301,{body:'## Acceptance criteria\n- [ ] OAuth consent required'})]})).action,'REPORT_BLOCKED');
});
test('no eligible story never dispatches',()=>assert.equal(selectReadyIssue(input({issues:[]})).action,'REPORT_BLOCKED'));
test('task API posts only to documented endpoint and verifies a real GET',async()=>{
 const calls=[];const id='a1b2c3d4-e5f6-7890-abcd-ef1234567890';
 const request=async(url,opt)=>{calls.push({url,opt});return {ok:true,json:async()=>opt.method==='POST'?{id}:{id,state:'queued',html_url:'https://github.com/test/repo/copilot/tasks/'+id}};};
 const api=agentTasksApi({token:'fake-user-token',repository:'test/repo',request});
 const created=await api.create({prompt:'Implement only authorised issue #301 with targeted tests and no production operations.'});
 const verified=verifyCreatedTask(created,await api.get(created.id));
 assert.equal(verified.id,id);
 assert.equal(calls[0].opt.method,'POST');
 assert.match(calls[0].url,/\/agents\/repos\/test\/repo\/tasks$/);
 assert.equal(JSON.parse(calls[0].opt.body).base_ref,'copilot/Development');
});
test('missing task confirmation or ambiguous state fails closed',()=>{
 assert.throws(()=>verifyCreatedTask({id:'a1b2c3d4-e5f6-7890-abcd-ef1234567890'},{}));
 assert.deepEqual(activeAgentTasks([{state:'completed'},{state:'in_progress'},{state:'waiting_for_user'}]).length,2);
});
