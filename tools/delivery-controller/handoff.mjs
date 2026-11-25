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

export function sessionSnapshotProblems(task) {
  if (!Array.isArray(task.sessions)) return [{ reason: 'missing_session_list' }];
  const problems = [];
  if (task.session_count !== task.sessions.length) problems.push({ reason: 'session_count_mismatch' });
  const seen = new Set();
  for (const session of task.sessions) {
    const sessionId = isUuid(session?.id) ? session.id : null;
    if (!sessionId || session.task_id !== task.id || !known.has(session.state)) {
      problems.push({ reason: 'invalid_session_identity_or_state', sessionId });
    }
    if (sessionId && seen.has(sessionId)) problems.push({ reason: 'duplicate_session', sessionId });
    seen.add(sessionId);
  }
  return problems;
}

const completeSessions = tasks => tasks.every(task => !sessionSnapshotProblems(task).length);

export function competingWriters(tasks) {
  verifyTaskSnapshot(tasks);
  if (!completeSessions(tasks)) throw new Error('Incomplete or ambiguous Copilot session snapshot');
  return tasks.flatMap(task => {
    const taskActive = activeAgentTasks([task]).length > 0;
    const sessions = task.sessions.filter(session => session.state !== 'idle' && !stopped.has(session.state));
    if (!taskActive && !sessions.length) return [];
    return [{
      taskId: task.id,
      state: task.state,
      reason: taskActive ? 'active_task' : 'conflicting_task_and_session_states',
      sessions: sessions.map(({ id, state }) => ({ id, state })),
    }];
  });
}

export function assessHandoff({ lease, tasks, openPRs, issue }) {
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
    return { ...blocked('Lease owner may still be writing'), taskId: task.id,
      lastActivity: Math.max(Date.parse(lease.startedAt), ...[task, ...task.sessions]
        .flatMap(row => [row.updated_at, row.created_at, row.completed_at])
        .map(value => Date.parse(value)).filter(Number.isFinite)) };
  const others = tasks.filter(row => row.id !== task.id);
  const writers = competingWriters(others);
  if (writers.length)
    return blocked('A competing Copilot session may still be writing: ' + JSON.stringify(writers));

  if (task.state !== 'completed') {
    const heads = new Set(task.sessions.map(session => session.head_ref).filter(Boolean));
    if (issue.state === 'open' && Array.isArray(task.artifacts) && task.artifacts.length === 0 &&
        openPRs.every(pr => heads.size === task.sessions.length && pr.head?.ref && !heads.has(pr.head.ref)))
      return { action: 'PARK_VERIFIED', taskId: task.id, taskState: task.state, sessionCount: task.session_count };
    return blocked('Stopped task has unresolved artifacts, a session branch PR, or uncertain issue state');
  }

  if (task.sessions.some(session => session.state !== 'completed'))
    return blocked('Copilot sessions did not all complete');
  if (!Array.isArray(task.artifacts)) return blocked('Missing Copilot PR artifacts');
  const artifacts = task.artifacts.filter(artifact => artifact.provider === 'github' && artifact.type === 'pull');
  if (artifacts.length !== 1 || !Number.isSafeInteger(artifacts[0].data?.id) || artifacts[0].data.id < 1)
    return blocked('Missing or ambiguous Copilot PR artifact');
  return { action: 'VERIFY_PR', task, artifact: artifacts[0].data.id };
}
