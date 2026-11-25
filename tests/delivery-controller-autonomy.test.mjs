import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ownerApprovedQueueLabels,selectReadyIssue} from '../tools/delivery-controller/queue.mjs';
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
 assert.deepEqual(activeAgentTasks([{state:'completed'},{state:'in_progress'},{state:'waiting_for_user'},{state:'idle'}]).length,2);
});

test('direct Xero issue numbers and already assigned issues stay out of the queue',()=>{
 const issues=[story(268),story(270),story(301,{assignees:[{login:'another-writer'}]})];
 assert.equal(selectReadyIssue(input({issues})).action,'REPORT_BLOCKED');
});

test('approval requires the owner to apply each current queue label',()=>{
 const events=['autonomy-ready','p0','dependencies-cleared'].map(name=>({
  event:'labeled',label:{name},actor:{id:11307166}
 }));
 assert.equal(ownerApprovedQueueLabels(events,11307166),true);
 assert.equal(ownerApprovedQueueLabels([...events,{...events[0],actor:{id:2}}],11307166),false);
 assert.equal(ownerApprovedQueueLabels([...events,{...events[0],event:'unlabeled'}],11307166),false);
});

test('Copilot keeps its own API version and rejects an incomplete page before dispatch', async () => {
 const api = response => agentTasksApi({
  token: 'fixture', repository: 'farbotkol/butterbox',
  request: async (url, options) => {
   assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
   return { ok: true, ...response };
  },
 });
 await assert.rejects(api({ json: async () => ({ tasks: [], total_count: 1 }) }).list(), /incomplete/);
 await assert.rejects(api({
  headers: new Headers({ Link: '<https://api.github.com/next>; rel="next"' }),
  json: async () => ({ tasks: [] }),
 }).list(), /incomplete/);
 assert.deepEqual(await api({ json: async () => ({ tasks: [], total_count: 0 }) }).list(), []);
});

const repository = 'farbotkol/butterbox';
const baseSha = 'e'.repeat(40);
const tagSha = 'a'.repeat(40);
const recoveryIssue = story(305, { assignees: [] });
const runId = 'actions_123_1';
const taskGet403 = () => Object.assign(new Error('Copilot task API GET returned HTTP 403'),
 { code: 'COPILOT_TASK_GET', status: 403 });

async function recoveryFixture({ list, create, repairBusy = async () => false, race = false } = {}) {
 const { runAcceptanceCycle } = await import('../tools/delivery-controller/run-autonomy.mjs');
 const { recoverPreDispatchLease } = await import('../tools/delivery-controller/pre-dispatch-recovery.mjs');
 const { LEASE_REF, readLease } = await import('../tools/delivery-controller/lease.mjs');
 let ref;
 let tag;
 const seen = { lists: 0, posts: 0, releases: 0, reports: [] };
 const leaseApi = {
  async getRef(name) {
   if (name !== LEASE_REF || !ref) throw Object.assign(new Error('missing'), { status: 404 });
   return { object: { type: 'tag', sha: ref } };
  },
  async getTag(sha) { return { ...tag, sha }; },
  async createTag(value) {
   tag = { ...value, object: { type: value.type, sha: value.object } };
   return { sha: tagSha };
  },
  async createRef({ sha }) { ref = sha; },
  async compareAndDeleteRef(name, expected) {
   assert.equal(name, LEASE_REF);
   if (race) ref = 'c'.repeat(40);
   if (ref !== expected) throw new Error('stale expected SHA');
   seen.releases++;
   ref = undefined;
  },
  async deleteRef() { assert.fail('recovery used unconditional deletion'); },
 };
 const params = {
  repository, runId, leaseApi,
  gh: async path => path.startsWith('/git/ref/') ? { object: { type: 'commit', sha: baseSha } } : recoveryIssue,
  paged: async () => [], repairBusy,
  approval: async () => ({ issue: { ...recoveryIssue, updated_at: '2026-11-23T06:00:00Z' }, approved: true }),
  tasksApi: {
   list: async () => { seen.lists++; return list ? list(seen.lists) : []; },
   create: async () => { seen.posts++; return create(); },
   get: async id => ({ id, state: 'failed', session_count: 1, sessions: [{
    id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890', task_id: id, state: 'queued', prompt: 'other task',
   }] }),
  },
  report: text => seen.reports.push(text),
 };
 return { seen, read: () => readLease(leaseApi), run: () => runAcceptanceCycle(params),
  recover: async verifyOnly => recoverPreDispatchLease({ ...params, verifyOnly, lease: await readLease(leaseApi) }) };
}

test('a transient post-acquisition GET 403 requires fresh evidence and releases without dispatch', async () => {
 const fixture = await recoveryFixture({ list: async n => { if (n === 2) throw taskGet403(); return []; } });
 await fixture.run();
 assert.equal(fixture.seen.lists, 4);
 assert.equal(fixture.seen.posts, 0);
 assert.equal(fixture.seen.releases, 1);
 assert.match(fixture.seen.reports.at(-1), /^PRE_DISPATCH_LEASE_RELEASED/);
 assert.equal(await fixture.read(), null);
});

test('persistent 403, incomplete inventory and queued child sessions all retain the lease', async () => {
 const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
 for (const late of [
  () => { throw taskGet403(); },
  () => [{ id, state: 'unknown' }],
  () => [{ id, state: 'failed' }],
 ]) {
  const fixture = await recoveryFixture({ list: async n => {
   if (n === 2) throw taskGet403();
   return n > 2 ? late() : [];
  } });
  await assert.rejects(fixture.run());
  assert.equal(fixture.seen.posts, 0);
  assert.equal(fixture.seen.releases, 0);
  assert.equal((await fixture.read()).tagSha, tagSha);
 }
});

test('a replacement ref defeats recovery and verification makes no ref changes', async () => {
 const fixture = await recoveryFixture({ race: true, list: async n => {
  if (n === 2 || n === 3) throw taskGet403();
  return [];
 } });
 await assert.rejects(fixture.run(), /HTTP 403/);
 await fixture.recover(true);
 assert.equal((await fixture.read()).tagSha, tagSha);
 await assert.rejects(fixture.recover(false), /stale expected SHA/);
 assert.equal((await fixture.read()).tagSha, 'c'.repeat(40));
 assert.equal(fixture.seen.posts, 0);
 assert.equal(fixture.seen.releases, 0);
});

test('an ambiguous POST receives no retry or pre-dispatch recovery evidence', async () => {
 const fixture = await recoveryFixture({ create: () => { throw new Error('connection lost after sending POST'); } });
 await assert.rejects(fixture.run(), /after sending POST/);
 await fixture.run();
 assert.equal(fixture.seen.posts, 1);
 assert.equal(fixture.seen.releases, 0);
 assert.equal((await fixture.read()).tagSha, tagSha);
 assert.ok(fixture.seen.reports.some(text => text.startsWith('DISPATCH_UNCERTAIN')));
 assert.ok(!fixture.seen.reports.some(text => text.startsWith('PRE_DISPATCH_')));
});

test('owner recovery verifies the exact raw GitHub job log and fails closed on missing proof', async () => {
 const { preDispatchStop, verifyStoppedAttempt } = await import('../tools/delivery-controller/pre-dispatch-recovery.mjs');
 const lease = { issue: 305, runId: 'actions_45121500090_1',
  baseSha: 'e8c7a42209e497e1c415a422e3343f9b43851fbb',
  tagSha: '7dd255f68cff1cf7a3774c980836ce8d010ac122',
  startedAt: '2026-11-23T06:02:50.607Z' };
 const run = { id: 45121500090, run_attempt: 1, head_sha: lease.baseSha,
  head_branch: 'copilot/Development', path: '.github/workflows/delivery-controller.yml',
  event: 'workflow_dispatch', status: 'completed', conclusion: 'failure',
  run_started_at: '2026-11-23T06:02:30Z', updated_at: '2026-11-23T06:03:00Z' };
 const log = (time, message) => time + ' ' + message;
 const checkout = [
  log('2026-11-23T06:02:44.1506953Z', '[command]/usr/bin/git log -1 --format=%H'),
  log('2026-11-23T06:02:44.1528367Z', lease.baseSha),
 ];
 const acquire = log('2026-11-23T06:02:51.5412874Z',
  'LEASE_ACQUIRED for #305 by ' + lease.runId);
 const stop = log('2026-11-23T06:02:52.1803064Z',
  'STOPPED: Copilot task API GET returned HTTP 403');
 const check = (lines, overrides = {}) => verifyStoppedAttempt({
  lease,
  gh: async path => {
   assert.equal(path, '/actions/runs/45121500090/attempts/1');
   return { ...run, ...overrides };
  },
  readRunLog: async () => lines.join('\n'),
 });
 await check([...checkout, acquire, stop]);
 await assert.rejects(check([acquire, stop]), /checkout_sha/);
 await assert.rejects(check([...checkout, acquire]), /pre_dispatch_stop/);
 await assert.rejects(check([...checkout, stop, acquire]), /stop_order/);
 await assert.rejects(check([...checkout, acquire,
  log('2026-11-23T06:02:51.8000000Z', 'DISPATCH_UNCERTAIN: POST timed out'), stop]),
  /task_dispatch_evidence/);
 await assert.rejects(check([...checkout, acquire, stop], { run_attempt: 2 }), /attempt identity/);
});

test('new recovery stops require the original failed run evidence and raw checkout log', async () => {
 const { preDispatchStop, verifyStoppedAttempt } = await import('../tools/delivery-controller/pre-dispatch-recovery.mjs');
 const lease = { issue: 305, runId: 'actions_123_1',
  baseSha: 'e'.repeat(40), tagSha: 'a'.repeat(40),
  startedAt: '2026-11-23T06:00:01Z' };
 const run = { id: 123, run_attempt: 1, head_sha: lease.baseSha,
  head_branch: 'copilot/Development', path: '.github/workflows/delivery-controller.yml',
  event: 'workflow_dispatch', status: 'completed', conclusion: 'failure',
  run_started_at: '2026-11-23T06:00:00Z', updated_at: '2026-11-23T06:00:02Z' };
 const records = [
  '2026-11-23T06:00:00Z [command]/usr/bin/git log -1 --format=%H',
  '2026-11-23T06:00:00Z ' + lease.baseSha,
  '2026-11-23T06:00:01Z LEASE_ACQUIRED for #305 by actions_123_1',
  '2026-11-23T06:00:01Z ' + preDispatchStop(lease),
 ];
 await verifyStoppedAttempt({ lease, gh: async () => run,
  readRunLog: async () => records.join('\n') });
});

test('recovery accepts stopped and idle sessions without prompts but detects visible lease markers', async () => {
 const { recoveryTaskBlockers } = await import('../tools/delivery-controller/pre-dispatch-recovery.mjs');
 const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
 const sessionId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
 const task = (state, sessionState, prompt = 'unrelated private text') => ({
  id: taskId, state, session_count: 1,
  sessions: [{ id: sessionId, task_id: taskId, state: sessionState, prompt }],
 });
 const blockers = (...tasks) => recoveryTaskBlockers(tasks, runId);
 const sessionBlock = reason => [{ taskId, sessionId, reason }];

 assert.deepEqual(blockers(task('idle', 'idle')), []);
 assert.deepEqual(blockers(task('completed', 'completed')), []);
 assert.deepEqual(blockers(task('idle', 'idle', ' ')), []);
 assert.deepEqual(blockers(task('completed', 'completed', ' ')), []);
 assert.deepEqual(blockers(task('cancelled', 'cancelled', undefined)), []);
 assert.deepEqual(blockers(task('failed', 'failed', null)), []);
 assert.deepEqual(blockers(task('idle', 'idle', 'private text\n BUTTERBOX_LEASE_RUN=' + runId)),
  sessionBlock('matching_lease_marker'));
 assert.deepEqual(blockers(task('failed', 'queued')), sessionBlock('active_session'));
 assert.deepEqual(blockers(task('idle', 'in_progress')), sessionBlock('active_session'));
 assert.deepEqual(blockers(task('idle', 'completed')), sessionBlock('inconsistent_idle_state'));
 assert.deepEqual(blockers(task('completed', 'idle')), sessionBlock('inconsistent_idle_state'));
 assert.ok(blockers(task('queued', 'queued')).some(blocker => blocker.reason === 'active_task'));
 assert.deepEqual(blockers({ ...task('idle', 'idle'), sessions: [], session_count: 0 }),
  [{ taskId, reason: 'no_sessions' }]);
 assert.deepEqual(blockers({ ...task('idle', 'idle'), session_count: 2 }),
  [{ taskId, reason: 'session_count_mismatch' }]);
 const absentPrompt = task('idle', 'idle');
 delete absentPrompt.sessions[0].prompt;
 assert.deepEqual(blockers(absentPrompt), []);
 const wrongParent = task('idle', 'idle');
 wrongParent.sessions[0].task_id = sessionId;
 assert.deepEqual(blockers(wrongParent), sessionBlock('invalid_session_identity_or_state'));
});

test('recovery reports sanitized blocking task and session IDs and retains the exact lease', async () => {
 const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
 const sessionId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
 const fixture = await recoveryFixture({ list: async n => {
  if (n === 2) throw taskGet403();
  return n > 2 ? [{ id: taskId, state: 'failed' }] : [];
 } });
 await assert.rejects(fixture.run(), /retain lease/);
 const report = fixture.seen.reports.find(value => value.startsWith('PRE_DISPATCH_RECOVERY_BLOCK: '));
 assert.deepEqual(JSON.parse(report.split(': ')[1]), { taskId, reason: 'active_session', sessionId });
 assert.ok(!report.includes('other task'));
 assert.equal(fixture.seen.posts, 0);
 assert.equal(fixture.seen.releases, 0);
 assert.equal((await fixture.read()).tagSha, tagSha);
});

test('Copilot failure diagnostics identify request and classify denial without leaking response text', async () => {
 const logs = [];
 const token = 'secret-fixture-token';
 const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
 let calls = 0;
 const api = agentTasksApi({ token, repository: 'farbotkol/butterbox', report: message => logs.push(message),
  request: async () => ++calls === 1
   ? { ok: true, json: async () => ({ tasks: [], total_count: 0 }) }
   : { ok: false, status: 403, headers: new Headers({
      'x-github-request-id': 'ABCD:1234',
      'x-accepted-github-permissions': 'agent_tasks=read',
      'x-ratelimit-remaining': '4999', 'retry-after': '60',
      'x-ratelimit-resource': token,
     }), json: async () => ({ message: 'You have exceeded a secondary rate limit. ' + token }) },
 });
 await api.list();
 await assert.rejects(api.get(id), error =>
  error.message === 'Copilot task API GET returned HTTP 403' &&
  error.status === 403 && error.code === 'COPILOT_TASK_GET');
 assert.equal(calls, 2);
 assert.equal(logs.length, 1);
 const d = JSON.parse(logs[0].slice('COPILOT_API_FAILURE '.length));
 assert.equal(d.operation, 'GET_TASK_DETAIL');
 assert.equal(d.requestNumber, 2);
 assert.deepEqual(d.counts, { LIST_TASKS: 1, GET_TASK_DETAIL: 1, CREATE_TASK: 0 });
 assert.equal(d.endpoint, 'https://api.github.com/agents/repos/farbotkol/butterbox/tasks/:task_id');
 assert.equal(d.reason, 'secondary_rate_limit');
 assert.equal(d.acceptedPermissions, 'agent_tasks=read');
 assert.equal(d.rateLimitRemaining, '4999');
 assert.equal(d.retryAfter, '60');
 assert.equal(d.requestId, 'ABCD:1234');
 assert.equal(d.rateLimitResource, null);
 assert.ok(!logs[0].includes(token));
 assert.ok(!logs[0].includes(id));
});

test('Copilot diagnostic handles permission denial and non-JSON failures without retrying POST', async () => {
 const logs = [];
 let calls = 0;
 const api = agentTasksApi({ token: 'fixture', repository: 'test/repo', report: message => logs.push(message),
  request: async () => ({ ok: false, status: 403, json: async () => {
   if (++calls === 1) return { message: 'Resource not accessible by integration' };
   throw new Error('non-JSON response');
  } }),
 });
 await assert.rejects(api.list({ states: ['queued', 'in_progress'] }), /HTTP 403/);
 await assert.rejects(api.create({ prompt: 'Implement only authorised issue #305 without production operations or other edits.' }), /HTTP 403/);
 const [list, post] = logs.map(line => JSON.parse(line.slice('COPILOT_API_FAILURE '.length)));
 assert.equal(list.reason, 'access_denied');
 assert.equal(list.operation, 'LIST_TASKS');
 assert.match(list.endpoint, /state=queued,in_progress$/);
 assert.equal(post.reason, 'unclassified');
 assert.equal(post.operation, 'CREATE_TASK');
 assert.equal(post.counts.CREATE_TASK, 1);
 assert.equal(calls, 2);
 assert.ok(!logs.join(' ').includes('Implement only'));
});
