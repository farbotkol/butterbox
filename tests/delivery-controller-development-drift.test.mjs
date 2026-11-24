import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessDevelopmentDrift } from '../tools/delivery-controller/development-drift.mjs';

const a='a'.repeat(40), b='b'.repeat(40);
const proofPath='docs/agent-work/autonomy-acceptance-a.md';
const evidence={pinnedSha:a,currentSha:b,proofPath,comparison:{
  status:'ahead',base_commit:{sha:a},merge_base_commit:{sha:a},ahead_by:1,
  commits:[{sha:b}],files:[{filename:'tools/delivery-controller/acceptance.mjs',status:'modified'}],
}};

test('same base requires no drift exception',()=>{
  assert.deepEqual(assessDevelopmentDrift({...evidence,currentSha:a}),{kind:'unchanged',safe:true});
});
test('verified ancestry is only a candidate, never automatic merge authorization',()=>{
  const result=assessDevelopmentDrift(evidence);
  assert.equal(result.kind,'candidate'); assert.equal(result.safe,false);
});
test('fail closed on missing, truncated, unrelated, and ambiguous commit evidence',()=>{
  const cases=[
    {status:'diverged'}, {base_commit:{sha:b}}, {merge_base_commit:{sha:b}},
    {too_large:true}, {ahead_by:2}, {commits:[]}, {files:null},
    {files:[{filename:proofPath,status:'modified'}]},
    {files:[{filename:'other.md',previous_filename:proofPath,status:'renamed'}]},
  ];
  for(const patch of cases){
    const result=assessDevelopmentDrift({...evidence,comparison:{...evidence.comparison,...patch}});
    assert.equal(result.kind,'blocked',JSON.stringify(patch));
    assert.equal(result.safe,false);
  }
});
test('invalid sha and path evidence cannot be treated as safe',()=>{
  assert.throws(()=>assessDevelopmentDrift({...evidence,pinnedSha:'bad'}),/Invalid/);
  assert.throws(()=>assessDevelopmentDrift({...evidence,proofPath:'../secret'}),/Invalid/);
});
