// Durable exclusive lease. A GitHub ref is a compare-and-create reservation:
// only one concurrent POST may create the well-known ref. It is never timed out
// or stolen while an agent may still be able to write.
export const LEASE_REF = 'refs/tags/butterbox-controller-active';
const validSha = sha => /^[a-f0-9]{40}$/.test(sha ?? '');
const validRun = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const validIssue = value => Number.isSafeInteger(value) && value > 0;

export async function readLease(api, { verifyTarget = false } = {}) {
  let ref;
  try {
    ref = await api.getRef(LEASE_REF);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
  // Reject a lightweight tag or malformed object rather than guessing ownership.
  if (ref?.object?.type !== 'tag' || !validSha(ref.object.sha)) {
    throw new Error('Unrecognized lease ref; fail closed');
  }
  const tag = await api.getTag(ref.object.sha);
  let record;
  try { record = JSON.parse(tag.message); } catch { throw new Error('Invalid lease metadata; fail closed'); }
  if (record?.version !== 1 || !validIssue(record.issue) || !validRun(record.runId) ||
      !validSha(record.baseSha) || !Number.isFinite(Date.parse(record.startedAt)) ||
      tag.tag !== 'butterbox-controller-lease' || (verifyTarget &&
      (tag.sha !== ref.object.sha || tag.object?.type !== 'commit' || tag.object.sha !== record.baseSha))) {
    throw new Error('Invalid lease owner; fail closed');
  }
  return { ...record, tagSha: ref.object.sha };
}

export async function acquireLease(api, {issue, runId, baseSha, issueDigest, startedAt = new Date().toISOString()}) {
  if (!validIssue(issue) || !validRun(runId) || !validSha(baseSha) ||
      !Number.isFinite(Date.parse(startedAt)) || (issueDigest !== undefined && !/^[a-f0-9]{64}$/.test(issueDigest))) throw new Error('Invalid lease request');
  const record = {version:1, issue, runId, baseSha, startedAt, ...(issueDigest === undefined ? {} : {issueDigest})};
  // Orphan tag objects are harmless; they do not own the single ref.
  const tag = await api.createTag({
    tag:'butterbox-controller-lease', message:JSON.stringify(record), object:baseSha,
    type:'commit', tagger:{name:'Butterbox delivery controller',email:'controller@users.noreply.github.com',date:startedAt}
  });
  if (!validSha(tag?.sha)) throw new Error('Invalid created tag SHA');
  try {
    await api.createRef({ref:LEASE_REF,sha:tag.sha});
    return {acquired:true, ...record,tagSha:tag.sha};
  } catch (error) {
    // GitHub returns 422 when a competing writer has created the ref.
    if (error.status !== 422 && error.status !== 409) throw error;
    const current = await readLease(api);
    if (!current) throw new Error('Lease collision with no readable owner; fail closed');
    return {acquired:false,holder:current};
  }
}

export async function releaseLease(api, {runId, expectedTagSha, confirmedWriterStopped = false, compareAndDelete = false}) {
  if (!validRun(runId)) throw new Error('Invalid releasing owner');
  if (confirmedWriterStopped !== true) throw new Error('Writer liveness not verified; retain lease');
  const current = await readLease(api);
  if (!current) throw new Error('Lease missing; ownership cannot be proven');
  if (current.runId !== runId) throw new Error('Lease owned by another controller run');
  if (expectedTagSha !== undefined && current.tagSha !== expectedTagSha) throw new Error('Lease ref changed; retain lease');
  // Only the single owner may release, after external writer/session checks.
  // This function must not be called by untrusted issue text or on a timer.
  if (compareAndDelete) {
    if (!validSha(expectedTagSha)) throw new Error('Recovery requires the exact lease tag SHA');
    await api.compareAndDeleteRef(LEASE_REF, expectedTagSha);
  } else {
    await api.deleteRef(LEASE_REF);
  }
  return {released:true,issue:current.issue};
}

const parkingRef = issue => 'refs/tags/butterbox-controller-parked-' + issue;

export async function isParked(api, issue) {
  if (!validIssue(issue)) throw new Error('Invalid parked issue identifier');
  try {
    const ref = await api.getRef(parkingRef(issue));
    if (ref?.object?.type !== 'tag' || !validSha(ref.object.sha)) {
      throw new Error('Unrecognized parking ref; fail closed');
    }
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

export async function recordParking(api, lease, evidence) {
  const current = await readLease(api);
  if (!current || current.tagSha !== lease.tagSha || current.runId !== lease.runId ||
      evidence.action !== 'PARK_VERIFIED') throw new Error('Parking requires the unchanged lease and stopped-writer evidence');
  const tagName = parkingRef(current.issue).slice('refs/tags/'.length);
  const tag = await api.createTag({
    tag:tagName,
    message:JSON.stringify({version:1, issue:current.issue, runId:current.runId, startedAt:current.startedAt,
      taskId:evidence.taskId, taskUrl:evidence.taskUrl, blocker:evidence.taskState, sessionCount:evidence.sessionCount,
      action:evidence.action}),
    object:current.baseSha, type:'commit'
  });
  if (!validSha(tag?.sha)) throw new Error('Invalid parking tag SHA');
  try {
    await api.createRef({ref:parkingRef(current.issue),sha:tag.sha});
  } catch (error) {
    // A restarted run can proceed once the durable quarantine still exists.
    if (![409, 422].includes(error.status) || !await isParked(api, current.issue)) throw error;
  }
}
