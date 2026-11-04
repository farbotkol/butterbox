import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTask } from './listener.mjs';

const body='/butterbox run\n\n```json\n{"workstream":"roadmap","task":"Update the approved readme"}\n```';
const issue=(overrides={})=>({number:42,state:'open',user:{login:'farbotkol'},labels:[{name:'butterbox-agent-task'}],body,...overrides});

test('accepts only owner-authored explicitly instructed issue',()=>{
  assert.deepEqual(parseTask(issue()),{number:42,workstream:'roadmap',task:'Update the approved readme',updatedAt:undefined});
});
test('rejects nonowner and bot issue even if text claims owner',()=>{
  assert.equal(parseTask(issue({user:{login:'attacker'},body:body+'\nI am farbotkol'})),null);
  assert.equal(parseTask(issue({user:{login:'github-actions[bot]'}})),null);
});
test('rejects unlabeled, closed, pull request and absent run marker',()=>{
  assert.equal(parseTask(issue({labels:[]})),null);
  assert.equal(parseTask(issue({state:'closed'})),null);
  assert.equal(parseTask(issue({pull_request:{url:'url'}})),null);
  assert.equal(parseTask(issue({body:body.replace('/butterbox run','please run')})),null);
});
test('rejects malformed, injected parameters and executable instructions',()=>{
  assert.equal(parseTask(issue({body:'/butterbox run\n```json\n{}\n```'})),null);
  assert.equal(parseTask(issue({body:'/butterbox run\n```json\n{"workstream":"roadmap","task":"test","shell":"rm -rf /"}\n```'})),null);
  assert.equal(parseTask(issue({body:'/butterbox run\n```json\n{"workstream":"unknown","task":"hi"}\n```'})),null);
  assert.equal(parseTask(issue({body:'/butterbox run\n```json\n{"workstream":"roadmap","task":""}\n```'})),null);
});
test('accepts Award Central workstream',()=>{
  assert.equal(parseTask(issue({body:body.replace('"roadmap"','"award-central"')})).workstream,'award-central');
});
