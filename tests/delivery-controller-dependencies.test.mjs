import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveDependency} from '../tools/delivery-controller/dependencies.mjs';

const parent = {number:300,state:'open',title:'Feature'};
const proposal = {parentIssue:300,kind:'code',depth:1,title:'Build required payroll mapping adapter',
  body:'## Problem\nThe feature needs an adapter.\n## Scope\nAdd isolated adapter and tests.\n## Acceptance criteria\n- [ ] Adapter works with isolated fixtures.'};
const run = (overrides = {}) => resolveDependency({parent,proposal,issues:[],activePRs:[],...overrides});
test('valid scoped prerequisite is proposed, never silently executed',()=>{
  const result = run();
  assert.equal(result.action,'PROPOSE_PREREQUISITE');
  assert.equal(result.parentIssue,300);
});
test('reuses existing open issue before creating a duplicate',()=>{
  const result = run({issues:[{number:301,state:'open',title:proposal.title}]});
  assert.equal(result.action,'REUSE_PREREQUISITE');
  assert.equal(result.issue,301);
});
test('never reuses its own parent',()=>{
  assert.equal(run({issues:[parent]}).action,'PROPOSE_PREREQUISITE');
});
test('external authorization is parked rather than coded around',()=>{
  const result=run({proposal:{...proposal,title:'Complete Xero OAuth authorization'}});
  assert.equal(result.action,'PARK_EXTERNAL');
});
test('explicit external dependency is parked',()=>{
  assert.equal(run({proposal:{...proposal,kind:'external'}}).action,'PARK_EXTERNAL');
});
test('one active Development PR blocks prerequisite switching',()=>{
  assert.equal(run({activePRs:[{state:'open',base:{ref:'copilot/Development'}}]}).action,'REPORT_BLOCKED');
});
test('live writing agent blocks prerequisite switching',()=>{
  assert.equal(run({activeWriter:true}).action,'REPORT_BLOCKED');
});
test('maximum three dependency levels',()=>{
  assert.equal(run({proposal:{...proposal,depth:4}}).action,'REPORT_BLOCKED');
  assert.equal(run({proposal:{...proposal,depth:3}}).action,'PROPOSE_PREREQUISITE');
});
test('rejects unknown AI action and unrelated parent',()=>{
  assert.equal(run({proposal:{...proposal,kind:'execute_shell'}}).action,'REPORT_BLOCKED');
  assert.equal(run({proposal:{...proposal,parentIssue:555}}).action,'REPORT_BLOCKED');
});
test('rejects an incomplete acceptance contract',()=>{
  assert.equal(run({proposal:{...proposal,body:'Implement something'}}).action,'REPORT_BLOCKED');
});
test('refuses truncated issue snapshots',()=>{
  assert.equal(run({issues:Array.from({length:100},(_,i)=>({number:i+1,state:'open',title:'unrelated'}))}).action,'REPORT_BLOCKED');
});
