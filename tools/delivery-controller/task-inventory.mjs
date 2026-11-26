import { WRITER_STATES } from './agent-tasks-api.mjs';
import { competingWriters, taskMarker, verifyTaskSnapshot } from './handoff.mjs';

// A list status alone does not prove its child sessions stopped. Only use a
// summary directly if it already provides a complete and consistent snapshot.
function trustworthyStoppedSummary(row) {
  if (!['completed', 'cancelled', 'failed', 'timed_out', 'idle'].includes(row.state) ||
      !Array.isArray(row.sessions) || !Number.isSafeInteger(row.session_count) ||
      row.session_count !== row.sessions.length ||
      !Array.isArray(row.artifacts)) return false;
  const seen = new Set();
  for (const session of row.sessions) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(session?.id ?? '') ||
        seen.has(session.id) || session.task_id !== row.id) return false;
    seen.add(session.id);
    if (row.state === 'idle' ? session.state !== 'idle' :
        !['completed', 'cancelled', 'failed', 'timed_out'].includes(session.state)) return false;
  }
  return true;
}

export async function listTaskSummaries(api, { states, since, archived } = {}) {
  const options = { ...(states ? { states } : {}), ...(since ? { since } : {}), ...(archived === undefined ? {} : { archived }) };
  const rows = verifyTaskSnapshot(await api.list(Object.keys(options).length ? options : undefined));
  if (states && rows.some(row => !states.includes(row.state)))
    throw new Error('Copilot task inventory does not match requested states');
  if (since && rows.some(row => typeof row.updated_at !== 'string' ||
      !(Date.parse(row.updated_at) >= Date.parse(since))))
    throw new Error('Copilot recent inventory lacks a valid update time or returned a task before since; retain lease');
  return rows;
}

async function hydrate(api, rows, exact = new Set()) {
  const details = Array(rows.length);
  // Keep concurrency low; Promise.all over every historical task can hit
  // GitHub's secondary rate limits. Never convert a failed GET to success.
  const workers = Array.from({ length: Math.min(3, rows.length) }, async (_, worker) => {
    for (let index = worker; index < rows.length; index += 3) {
      const row = rows[index];
      details[index] = !exact.has(row.id) && trustworthyStoppedSummary(row) ? row : await api.get(row.id);
    }
  });
  await Promise.all(workers);
  if (!details.every((task, index) => task?.id === rows[index].id && task.state === rows[index].state &&
      (rows[index].updated_at === undefined || task.updated_at === rows[index].updated_at)))
    throw new Error('Copilot task list changed during independent verification');
  return details;
}

// Routine dispatch must always use the same complete set of potentially active states.
export const listWriterTasks = api => listTaskSummaries(api, { states: WRITER_STATES });
export const readWriterTasks = async api => hydrate(api, await listWriterTasks(api));

// Explicit full audit for bootstrap and stand-alone diagnostics.
export const readTaskDetails = async (api, options) => hydrate(api, await listTaskSummaries(api, options));

function union(rows, more) {
  const combined = new Map(rows.map(row => [row.id, row]));
  for (const row of more) {
    const prior = combined.get(row.id);
    if (prior && (prior.state !== row.state || prior.updated_at !== row.updated_at))
      throw new Error('Copilot task list changed during independent verification');
    combined.set(row.id, row);
  }
  return [...combined.values()];
}

const overlap = 5 * 60 * 1000;
const taskIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const shaPattern = /^[0-9a-f]{40}$/;
const validId = id => typeof id === 'string' && taskIdPattern.test(id);

function checkpoint(saved, start) {
  if (saved === null) return null;
  const record = saved.record;
  const time = Date.parse(record?.verifiedAt);
  if (record?.version !== 1 || typeof record.verifiedAt !== 'string' ||
      !Number.isFinite(time) || time > start || new Date(time).toISOString() !== record.verifiedAt ||
      !Array.isArray(record.unresolved) || !record.unresolved.every(validId) ||
      new Set(record.unresolved).size !== record.unresolved.length ||
      (record.searchedLeaseTag !== null && !shaPattern.test(record.searchedLeaseTag ?? '')) ||
      (record.leaseTask !== null && (!shaPattern.test(record.leaseTask?.tagSha ?? '') ||
        !validId(record.leaseTask.id)))) throw new Error('Invalid Copilot inventory checkpoint; retain lease');
  return record;
}

async function acrossArchives(api, options) {
  const current = await listTaskSummaries(api, { ...options, archived: false });
  const archived = await listTaskSummaries(api, { ...options, archived: true });
  return verifyTaskSnapshot([...current, ...archived]);
}

export function withTaskInventory(api, store, { readOnly = false, requireCheckpoint = false, now = Date.now } = {}) {
  return { ...api, inventory: { store, readOnly, requireCheckpoint, now } };
}

export async function readLeaseCandidates(api, lease, { exactTaskId, stable = false } = {}) {
  // Plain adapters support bounded audits and local fixtures; production entry
  // points attach the same durable checkpoint store.
  if (!api.inventory) {
    if (!lease) return readTaskDetails(api);
    const started = Date.parse(lease.startedAt);
    if (!Number.isFinite(started)) throw new Error('Invalid lease inventory scope');
    const recent = await listTaskSummaries(api, { since: new Date(started - overlap).toISOString() });
    return hydrate(api, union(recent, await listWriterTasks(api)));
  }

  const { store, readOnly, requireCheckpoint, now } = api.inventory;
  const start = now();
  const saved = await store.readInventory();
  const prior = checkpoint(saved, start);
  if (!prior && requireCheckpoint) throw new Error('Copilot inventory checkpoint has not been bootstrapped');
  const known = prior?.leaseTask?.tagSha === lease?.tagSha ? prior?.leaseTask?.id : undefined;
  if (exactTaskId !== undefined && (!validId(exactTaskId) || (known && known !== exactTaskId)))
    throw new Error('Conflicting exact Copilot task identity; retain lease');
  const exact = new Set([...(prior?.unresolved ?? []), ...[known, exactTaskId].filter(Boolean)]);
  let since;
  if (prior) {
    const searched = lease && prior.searchedLeaseTag === lease.tagSha;
    const leaseStart = lease && !searched && !known && !exactTaskId ? Date.parse(lease.startedAt) : start;
    if (!Number.isFinite(leaseStart)) throw new Error('Invalid lease inventory scope');
    since = new Date(Math.min(leaseStart, Date.parse(prior.verifiedAt)) - overlap).toISOString();
  }
  const scan = async () => {
    const recent = await acrossArchives(api, since ? { since } : {});
    const rows = union(recent, await acrossArchives(api, { states: WRITER_STATES }));
    const tasks = await hydrate(api, rows, exact);
    const listed = new Set(rows.map(row => row.id));
    for (const id of exact) {
      if (listed.has(id)) continue;
      const task = await api.get(id);
      if (task?.id !== id) throw new Error('Exact Copilot task identity changed; retain lease');
      tasks.push(task);
    }
    competingWriters(tasks); // Validate complete child identity and state before advancing.
    return tasks;
  };
  const tasks = await scan();
  if (stable) {
    const signature = rows => JSON.stringify(rows.map(task => [
      task.id, task.state, task.updated_at, task.sessions.map(session =>
        [session.id, session.state, session.updated_at, session.prompt]).sort(),
    ]).sort());
    if (signature(tasks) !== signature(await scan())) throw new Error('Copilot task inventory changed during recovery');
  }
  const marker = lease && taskMarker(lease.runId);
  const matches = marker ? tasks.filter(task => task.sessions.some(session =>
    typeof session.prompt === 'string' && session.prompt.split(/\r?\n/).some(line => line.trim() === marker))) : [];
  if (matches.length > 1 || (known && matches.some(task => task.id !== known)))
    throw new Error('Ambiguous Copilot task for lease; retain lease');
  if (!readOnly) await store.writeInventory(saved?.sha ?? '', {
    version: 1,
    verifiedAt: new Date(start).toISOString(),
    searchedLeaseTag: lease?.tagSha ?? null,
    unresolved: tasks.filter(task => !trustworthyStoppedSummary(task)).map(task => task.id).sort(),
    leaseTask: lease && (known || matches.length === 1) ?
      { tagSha: lease.tagSha, id: known || matches[0].id } : null,
  });
  return tasks;
}

// Bind an acknowledged task to the exact lease without advancing the scan
// boundary. The next scan GETs it even if it leaves both filtered lists.
export async function rememberLeaseTask(api, lease, id) {
  if (!api.inventory) return;
  const { store, readOnly, now } = api.inventory;
  if (readOnly || !shaPattern.test(lease?.tagSha ?? '') || !validId(id))
    throw new Error('Invalid Copilot task checkpoint binding');
  const saved = await store.readInventory();
  const prior = checkpoint(saved, now());
  if (!prior || (prior.leaseTask?.tagSha === lease.tagSha && prior.leaseTask.id !== id))
    throw new Error('Missing or conflicting Copilot task checkpoint');
  await store.writeInventory(saved.sha, {
    ...prior, leaseTask: { tagSha: lease.tagSha, id },
    unresolved: [...new Set([...prior.unresolved, id])].sort(),
  });
}
