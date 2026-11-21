import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decide} from '../tools/delivery-controller/decide.mjs';

const ready = {number:400,state:'open',base:{ref:'copilot/Development'},head:{sha:'a'.repeat(40)},draft:false,mergeable:true};
test('unknown live lease fails closed',()=>{
  assert.equal(decide({pullRequests:[ready]}).action,'REPORT_BLOCKED');
  assert.equal(decide({pullRequests:[ready],lease:{state:'unknown'}}).action,'REPORT_BLOCKED');
});
test('active live lease prevents merge request and new dispatch',()=>{
  const lease={state:'held',issue:290,runId:'proof_123_one'};
  assert.equal(decide({pullRequests:[ready],lease}).action,'REPORT_BLOCKED');
  assert.equal(decide({pullRequests:[],lease}).action,'REPORT_BLOCKED');
});
test('malformed live owner does not imply free lease',()=>{
  assert.equal(decide({pullRequests:[ready],lease:{state:'held',issue:-1,runId:'bad'}}).action,'REPORT_BLOCKED');
});
test('known free lease still defers to existing guarded merge policy',()=>{
  assert.equal(decide({pullRequests:[ready],lease:{state:'free'}}).action,'REQUEST_GUARDED_MERGE');
  assert.equal(decide({pullRequests:[{...ready,draft:true}],lease:{state:'free'}}).action,'OBSERVE');
  assert.equal(decide({pullRequests:[ready,{...ready,number:401}],lease:{state:'free'}}).action,'REPORT_BLOCKED');
});
