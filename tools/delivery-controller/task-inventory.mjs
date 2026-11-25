import { WRITER_STATES } from './agent-tasks-api.mjs';
import { verifyTaskSnapshot } from './handoff.mjs';

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

export async function listTaskSummaries(api, { states, since } = {}) {
  const options = { ...(states ? { states } : {}), ...(since ? { since } : {}) };
  const rows = verifyTaskSnapshot(await api.list(Object.keys(options).length ? options : undefined));
  if (states && rows.some(row => !states.includes(row.state)))
    throw new Error('Copilot task inventory does not match requested states');
  return rows;
}

async function hydrate(api, rows) {
  const details = Array(rows.length);
  // Keep concurrency low; Promise.all over every historical task can hit
  // GitHub's secondary rate limits. Never convert a failed GET to success.
  const workers = Array.from({ length: Math.min(3, rows.length) }, async (_, worker) => {
    for (let index = worker; index < rows.length; index += 3) {
      const row = rows[index];
      details[index] = trustworthyStoppedSummary(row) ? row : await api.get(row.id);
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

// Explicit full audit: only for recovery or a critical mutation where historical
// parent/child contradictions must still be ruled out. No cached liveness evidence.
export const readTaskDetails = async (api, options) => hydrate(api, await listTaskSummaries(api, options));

// Read-only lease discovery: only recently updated tasks and potentially active
// writers. A later full independent audit is still mandatory before mutation.
export async function readLeaseCandidates(api, lease) {
  const started = Date.parse(lease.startedAt);
  if (!Number.isFinite(started)) throw new Error('Invalid lease inventory scope');
  const since = new Date(started - 5 * 60 * 1000).toISOString();
  const recent = await listTaskSummaries(api, { since });
  const active = await listWriterTasks(api);
  const combined = new Map(recent.map(row => [row.id, row]));
  for (const row of active) {
    const prior = combined.get(row.id);
    if (prior && (prior.state !== row.state ||
        (prior.updated_at !== undefined && row.updated_at !== prior.updated_at)))
      throw new Error('Copilot task list changed during independent verification');
    combined.set(row.id, row);
  }
  return hydrate(api, [...combined.values()]);
}
