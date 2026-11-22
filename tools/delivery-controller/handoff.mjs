// Identity and liveness checks shared by the unattended handoff and synthetic proof.
import { activeAgentTasks } from './agent-tasks-api.mjs';

export const development = 'copilot/Development';
export const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const stopped = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
const known = new Set([...stopped, 'idle', 'queued', 'in_progress', 'waiting_for_user']);
export const taskMarker = runId => 'BUTTERBOX_LEASE_RUN=' + runId;

export function verifyTaskSnapshot(rows) {
  if (!Array.isArray(rows) || rows.some(row => !isUuid(row.id) || !known.has(row.state)) ||
      new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Incomplete or ambiguous Copilot task list');
  return rows;
}

function completeSessions(tasks) {
  return tasks.every(task => Array.isArray(task.sessions) && task.session_count === task.sessions.length &&
    task.sessions.every(session => isUuid(session.id) && session.task_id === task.id && known.has(session.state)) &&
    new Set(task.sessions.map(session => session.id)).size === task.sessions.length);
}

export function competingWriters(tasks) {
  if (!completeSessions(tasks)) throw new Error('Incomplete or ambiguous Copilot session snapshot');
  return activeAgentTasks(tasks).length > 0 || tasks.some(task =>
    task.sessions.some(session => session.state !== 'idle' && !stopped.has(session.state)));
}

export function assessHandoff({ lease, tasks, openPRs, issue, now = Date.now() }) {
  const blocked = reason => ({ action: 'RETAIN_LEASE', reason });
  if (!Array.isArray(openPRs) || issue?.number !== lease.issue || issue.pull_request)
    return blocked('Incomplete PR or issue evidence');
  verifyTaskSnapshot(tasks);
  if (!completeSessions(tasks)) return blocked('Incomplete or ambiguous Copilot session snapshot');

  const marker = taskMarker(lease.runId);
  const matches = tasks.filter(task => task.sessions.some(session =>
    typeof session.prompt === 'string' && session.prompt.split(/\r?\n/).includes(marker)));
  if (matches.length !== 1) return blocked('Cannot uniquely identify the Copilot task from the exact lease marker');
  const [task] = matches;
  if (!stopped.has(task.state) || task.sessions.some(session => !stopped.has(session.state) ||
      session.base_ref !== development))
    return blocked('Lease owner may still be writing');
  const others = tasks.filter(row => row.id !== task.id);
  if (competingWriters(others))
    return blocked('A competing Copilot session may still be writing');

  if (task.state !== 'completed') {
    if (issue.state === 'open' && now - Date.parse(lease.startedAt) >= 12 * 60 * 60 * 1000 &&
        openPRs.length === 0 && Array.isArray(task.artifacts) && task.artifacts.length === 0)
      return { action: 'PARK_VERIFIED', taskId: task.id, taskState: task.state, sessionCount: task.session_count };
    return blocked('Stopped task has PR artifacts, uncertain issue state or is under 12 hours old');
  }

  if (task.sessions.some(session => session.state !== 'completed'))
    return blocked('Copilot sessions did not all complete');
  if (!Array.isArray(task.artifacts)) return blocked('Missing Copilot PR artifacts');
  const artifacts = task.artifacts.filter(artifact => artifact.provider === 'github' && artifact.type === 'pull');
  if (artifacts.length !== 1 || !Number.isSafeInteger(artifacts[0].data?.id) || artifacts[0].data.id < 1)
    return blocked('Missing or ambiguous Copilot PR artifact');
  return { action: 'VERIFY_PR', task, artifact: artifacts[0].data.id };
}
