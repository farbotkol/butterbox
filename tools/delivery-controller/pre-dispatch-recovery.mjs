import { developmentSha, issueDigest, openDevelopmentPRs, readTaskDetails } from './acceptance.mjs';
import { competingWriters, development, isSha, taskMarker, verifyTaskSnapshot } from './handoff.mjs';
import { readLease, releaseLease } from './lease.mjs';

const workflowPath = '.github/workflows/delivery-controller.yml';
const legacyBase = 'e8c7a42209e497e1c415a422e3343f9b43851fbb';
const legacyTag = '7dd255f68cff1cf7a3774c980836ce8d010ac122';
const stopped = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
const logStep = 'Advance the controlled GitHub acceptance lifecycle';
export const preDispatchStop = lease => 'PRE_DISPATCH_STOP issue #' + lease.issue +
  ' run ' + lease.runId + ' tag ' + lease.tagSha;

export async function verifyStoppedAttempt({ lease, gh, readRunLog }) {
  const match = /^actions_([1-9]\d*)_([1-9]\d*)$/.exec(lease.runId);
  if (!match) throw new Error('Missing controller run and attempt');
  const [, id, attempt] = match;
  const run = await gh('/actions/runs/' + id + '/attempts/' + attempt);
  if (String(run.id) !== id || String(run.run_attempt) !== attempt ||
      run.path !== workflowPath || run.head_branch !== development || run.head_sha !== lease.baseSha ||
      !['schedule', 'workflow_dispatch'].includes(run.event) || run.status !== 'completed' ||
      run.conclusion !== 'failure' ||
      !(Date.parse(run.run_started_at) <= Date.parse(lease.startedAt) &&
        Date.parse(lease.startedAt) <= Date.parse(run.updated_at))) {
    throw new Error('Controller attempt identity or conclusion is unverified');
  }

  // Require the checked-out code and explicit stop point in the exact attempt's
  // GitHub job log. The old controller emitted only the final GET error.
  const lines = (await readRunLog(id, attempt)).split(/\r?\n/);
  const messages = step => lines.flatMap(line => {
    const [job, name, output] = line.split('\t', 3);
    return job === 'autonomous-dispatch' && name === step && output ?
      [output.replace(/^\S+Z /, '')] : [];
  });
  const output = messages(logStep);
  const acquire = 'LEASE_ACQUIRED for #' + lease.issue + ' by ' + lease.runId;
  const legacy = lease.issue === 305 && lease.runId === 'actions_45121500090_1' &&
    lease.baseSha === legacyBase && lease.tagSha === legacyTag;
  const stop = legacy ? 'STOPPED: Copilot task API GET returned HTTP 403' : preDispatchStop(lease);
  if (!messages('Run actions/checkout@v4').includes(lease.baseSha) ||
      output.filter(line => line === acquire).length !== 1 ||
      output.filter(line => line === stop).length !== 1 ||
      output.indexOf(stop) <= output.indexOf(acquire) ||
      (legacy && output.indexOf(stop) !== output.indexOf(acquire) + 1) ||
      output.some(line => /^(COPILOT_LAUNCHED|DISPATCH_UNCERTAIN):? /.test(line))) {
    throw new Error('No positive pre-dispatch stop evidence in the controller attempt');
  }
}

export async function recoverPreDispatchLease({ repository, lease, leaseApi, gh, paged, tasksApi,
  repairBusy, report, verifyOnly = false }) {
  if (![305, 306].includes(lease?.issue) || !isSha(lease.tagSha) ||
      !/^[a-f0-9]{64}$/.test(lease.issueDigest ?? '')) throw new Error('Unrecognized recovery lease');
  const [issue, ref, tasks, prs, repair, current] = await Promise.all([
    gh('/issues/' + lease.issue), gh('/git/ref/heads/' + development), readTaskDetails(tasksApi),
    openDevelopmentPRs(paged, repository), repairBusy(), readLease(leaseApi, { verifyTarget: true }),
  ]);
  if (current?.tagSha !== lease.tagSha || current.runId !== lease.runId ||
      issue.number !== lease.issue || issue.pull_request || issue.state !== 'open' ||
      !Array.isArray(issue.assignees) || issue.assignees.length || issueDigest(issue) !== lease.issueDigest) {
    throw new Error('Lease or issue identity changed, or issue is assigned');
  }
  // A reviewed corrective PR can advance Development. The annotated lease
  // still pins the old commit, which must remain an ancestor of the new tip.
  const tip = developmentSha(ref);
  if (tip !== lease.baseSha) {
    const comparison = await gh('/compare/' + lease.baseSha + '...' + tip + '?per_page=1');
    if (comparison.status !== 'ahead' || comparison.merge_base_commit?.sha !== lease.baseSha)
      throw new Error('Development no longer descends from the leased base');
  }
  const marker = taskMarker(lease.runId);
  if (repair || prs.length || competingWriters(tasks).length || tasks.some(task =>
    !stopped.has(task.state) || !task.sessions.length || task.sessions.some(session =>
      !stopped.has(session.state) || typeof session.prompt !== 'string' || !session.prompt.trim() ||
      session.prompt.split(/\r?\n/).some(line => line.trim() === marker)))) {
    throw new Error('Writer, matching task, or incomplete task/session/PR evidence; retain lease');
  }
  const latest = verifyTaskSnapshot(await tasksApi.list());
  const states = rows => rows.map(row => row.id + ':' + row.state).sort().join(',');
  if (states(latest) !== states(tasks)) throw new Error('Copilot task inventory changed during recovery');
  const origin = 'https://github.com/' + repository + '/actions/runs/' + lease.runId.split('_')[1];
  const evidence = ' issue #' + lease.issue + ' run ' + lease.runId + ' tag ' + lease.tagSha +
    ' base ' + lease.baseSha + ' task details checked=' + tasks.length + ' origin=' + origin;
  report('PRE_DISPATCH_RECOVERY_VERIFIED' + evidence);
  if (verifyOnly) return;
  await releaseLease(leaseApi, { runId: lease.runId, expectedTagSha: lease.tagSha,
    confirmedWriterStopped: true, compareAndDelete: true });
  report('PRE_DISPATCH_LEASE_RELEASED' + evidence + ' · next selection is a separate run');
}
