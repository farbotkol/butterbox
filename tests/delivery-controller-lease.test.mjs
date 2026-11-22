import assert from 'node:assert/strict';
import {test} from 'node:test';
import {acquireLease,readLease,releaseLease,isParked,recordParking,LEASE_REF} from '../tools/delivery-controller/lease.mjs';
const sha='a'.repeat(40);
function fakeApi() {
  const tags = new Map(); const refs=new Map(); let n=0;
  return {
    async createTag(tag) {const id=(++n).toString(16).padStart(40,'0');tags.set(id,tag);return {sha:id};},
    async createRef({ref:requested,sha:tagSha}) {
      if (refs.has(requested)) throw Object.assign(new Error('already exists'),{status:422});
      const ref={object:{type:'tag',sha:tagSha}};refs.set(requested,ref);return ref;
    },
    async getRef(requested) {const ref=refs.get(requested);if (!ref) throw Object.assign(new Error('not found'),{status:404});return ref;},
    async getTag(id) {return tags.get(id);},
    async deleteRef(requested) {refs.delete(requested);},
    tamper(value) {refs.set(LEASE_REF,value);}
  };
}
const args=(runId,issue=300)=>({runId,issue,baseSha:sha,startedAt:'2026-11-21T00:00:00Z'});
test('two simultaneous controllers cannot both acquire the same durable lease',async()=>{
 const api=fakeApi();
 const [a,b]=await Promise.all([acquireLease(api,args('run-one')),acquireLease(api,args('run-two',301))]);
 assert.equal([a,b].filter(x=>x.acquired).length,1);
 assert.equal([a,b].filter(x=>!x.acquired).length,1);
 const current=await readLease(api);
 assert.equal(current.runId,[a,b].find(x=>x.acquired).runId);
});
test('lease is retained across new controller invocations',async()=>{
 const api=fakeApi();await acquireLease(api,args('owner'));
 const later=await readLease(api);
 assert.equal(later.issue,300);assert.equal(later.runId,'owner');
});
test('non-owner cannot release and cannot claim work',async()=>{
 const api=fakeApi();await acquireLease(api,args('owner'));
 await assert.rejects(releaseLease(api,{runId:'intruder',confirmedWriterStopped:true}),/another/);
 assert.equal((await readLease(api)).runId,'owner');
});
test('even owner cannot release while a writer may still be running',async()=>{
 const api=fakeApi();await acquireLease(api,args('owner'));
 await assert.rejects(releaseLease(api,{runId:'owner'}),/liveness/);
 assert.ok(await readLease(api));
});
test('owner releases only after writer stop confirmed; a new issue can acquire',async()=>{
 const api=fakeApi();await acquireLease(api,args('owner'));
 assert.equal((await releaseLease(api,{runId:'owner',confirmedWriterStopped:true})).released,true);
 assert.equal((await acquireLease(api,args('next',301))).acquired,true);
});
test('malformed or inaccessible lease fails closed',async()=>{
 const api=fakeApi();api.tamper({object:{type:'commit',sha}});
 await assert.rejects(readLease(api),/fail closed/);
 await assert.rejects(acquireLease(api,args('owner')),/fail closed/);
});
test('invalid issue and SHA never create a lease',async()=>{
 const api=fakeApi();
 await assert.rejects(acquireLease(api,{...args('owner'),baseSha:'bad'}),/Invalid/);
 await assert.rejects(acquireLease(api,args('owner',0)),/Invalid/);
 assert.equal(await readLease(api),null);
});

test('parking survives release and replays without overwriting the blocker record',async()=>{
 const api=fakeApi();
 const lease=await acquireLease(api,args('owner'));
 assert.equal(await isParked(api,lease.issue),false);
 await assert.rejects(recordParking(api,{...lease,tagSha:sha},{action:'PARK_VERIFIED'}),/unchanged/);
 const evidence={action:'PARK_VERIFIED',taskId:'task-1234',taskState:'failed',sessionCount:1};
 await recordParking(api,lease,evidence);
 await recordParking(api,lease,evidence);
 await releaseLease(api,{runId:lease.runId,expectedTagSha:lease.tagSha,confirmedWriterStopped:true});
 assert.equal(await isParked(api,lease.issue),true);
 assert.equal(await isParked(api,lease.issue+1),false);
 assert.ok((await acquireLease(api,args('next',lease.issue+1))).acquired);
});
