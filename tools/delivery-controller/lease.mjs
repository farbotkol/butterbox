// Durable exclusive lease. A GitHub ref is a compare-and-create reservation:
// only one concurrent POST may create the well-known ref. It is never timed out
// or stolen while an agent may still be able to write.
export const LEASE_REF = 'refs/tags/butterbox-controller-active';
const validSha = sha => /^[a-f0-9]{40}$/.test(sha ?? '');
const validRun = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const validIssue = value => Number.isSafeInteger(value) && value > 0;

export async function readLease(api) {
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
      tag.tag !== 'butterbox-controller-lease') {
    throw new Error('Invalid lease owner; fail closed');
  }
  return { ...record, tagSha: ref.object.sha };
}

export async function acquireLease(api, {issue, runId, baseSha, startedAt = new Date().toISOString()}) {
  if (!validIssue(issue) || !validRun(runId) || !validSha(baseSha) ||
      !Number.isFinite(Date.parse(startedAt))) throw new Error('Invalid lease request');
  const record = {version:1, issue, runId, baseSha, startedAt};
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

export async function releaseLease(api, {runId, confirmedWriterStopped = false}) {
  if (!validRun(runId)) throw new Error('Invalid releasing owner');
  if (confirmedWriterStopped !== true) throw new Error('Writer liveness not verified; retain lease');
  const current = await readLease(api);
  if (!current) throw new Error('Lease missing; ownership cannot be proven');
  if (current.runId !== runId) throw new Error('Lease owned by another controller run');
  // Only the single owner may release, after external writer/session checks.
  // This function must not be called by untrusted issue text or on a timer.
  await api.deleteRef(LEASE_REF);
  return {released:true,issue:current.issue};
}
