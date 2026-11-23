import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { githubLeaseApi } from './github-lease-api.mjs';
import { readLease, acquireLease, releaseLease, isParked } from './lease.mjs';
import { ownerApprovedQueueLabels, selectReadyIssue } from './queue.mjs';
import { agentTasksApi, verifyCreatedTask } from './agent-tasks-api.mjs';
import { taskMarker, development, competingWriters, isSha } from './handoff.mjs';
import { ownerId, proofFor, issueDigest, developmentSha, firstAcceptanceCompleted,
  openDevelopmentPRs, readTaskDetails, advanceAcceptance } from './acceptance.mjs';

import { preDispatchStop, recoverPreDispatchLease, verifyStoppedAttempt } from './pre-dispatch-recovery.mjs';

const exec = promisify(execFile);
const repo = process.env.GITHUB_REPOSITORY;
const ghToken = process.env.GITHUB_TOKEN;
const agentToken = process.env.COPILOT_AGENT_USER_TOKEN;
const runId = 'actions_' + process.env.GITHUB_RUN_ID + '_' + process.env.GITHUB_RUN_ATTEMPT;
const summary = process.env.GITHUB_STEP_SUMMARY;
const report = message => {
  console.log(message);
  if (summary) appendFileSync(summary, message + '\n');
};

async function main() {
  if (!/^actions_[1-9][0-9]*_[1-9][0-9]*$/.test(runId)) throw new Error('Missing Actions run identity');
  if (repo !== 'farbotkol/butterbox' || process.env.GITHUB_REF !== 'refs/heads/' + development ||
      !['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME))
    throw new Error('Autonomy restricted to Butterbox Development schedules and owner dispatch');
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_ACTOR_ID !== String(ownerId))
    throw new Error('Only the owner can manually run autonomous acceptance');
  const recovery = process.env.LEASE_RECOVERY || 'none';
  if (!['none', 'verify', 'release'].includes(recovery)) throw new Error('Invalid recovery mode');
  if (recovery !== 'none' && (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_TRIGGERING_ACTOR !== 'farbotkol' || !isSha(process.env.EXPECTED_LEASE_TAG_SHA))) {
    throw new Error('Recovery requires owner workflow dispatch and the exact tag SHA');
  }
  if (recovery === 'none' && process.env.BUTTERBOX_AUTONOMY_ENABLED !== 'true') {
    report('DISPATCH_DISABLED: owner opt-in switch is not enabled.');
    return;
  }
  if (!ghToken) throw new Error('Missing Actions repository token');
  if (!agentToken) {
    if (recovery !== 'none') throw new Error('Missing Copilot credential for recovery');
    report('DISPATCH_BLOCKED: COPILOT_AGENT_USER_TOKEN is unavailable.');
    return;
  }

  const request = (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + ghToken,
    // The newer REST representation omits merge_commit_sha. Copilot uses its own API version.
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  async function gh(path, method = 'GET', body) {
    const response = await request('https://api.github.com/repos/' + repo + path, {
      headers, method, body: body && JSON.stringify(body),
    });
    if (!response.ok) throw new Error('GitHub ' + method + ' HTTP ' + response.status + ' for ' + path);
    return response.json();
  }
  async function paged(path) {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const rows = await gh(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
      if (!Array.isArray(rows)) throw new Error('GitHub paged snapshot is not an array');
      all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw new Error('GitHub page cap reached');
  }
  const repairBusy = async () => {
    const states = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];
    const snapshots = await Promise.all(states.map(status =>
      gh('/actions/workflows/agent-merge-enrollment.yml/runs?status=' + status + '&per_page=1')));
    if (snapshots.some(data => !Number.isSafeInteger(data.total_count) || data.total_count < 0 ||
      !Array.isArray(data.workflow_runs) || data.workflow_runs.length !== Math.min(1, data.total_count))) {
      throw new Error('Incomplete CI repair snapshot');
    }
    return snapshots.some(data => data.total_count > 0);
  };
  const readyPull = async (nodeId, head) => {
    const response = await request('https://api.github.com/graphql', {
      method: 'POST', headers, body: JSON.stringify({
        query: 'mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft headRefOid } } }',
        variables: { id: nodeId },
      }),
    });
    if (!response.ok) throw new Error('GitHub draft promotion returned HTTP ' + response.status);
    const json = await response.json();
    const pr = json.data?.markPullRequestReadyForReview?.pullRequest;
    if (json.errors?.length || pr?.isDraft !== false || pr.headRefOid !== head)
      throw new Error('GitHub did not confirm draft promotion at the verified head');
  };
  async function approval(number) {
    const [issue, events, dependencies] = await Promise.all([
      gh('/issues/' + number), paged('/issues/' + number + '/events'),
      paged('/issues/' + number + '/dependencies/blocked_by'),
    ]);
    const approved = ownerApprovedQueueLabels(events, ownerId) && Array.isArray(issue.labels) &&
      ['autonomy-ready', 'p0', 'dependencies-cleared'].every(label =>
        issue.labels.some(row => row.name.toLowerCase() === label)) &&
      dependencies.every(row => row.state === 'closed' && row.state_reason === 'completed');
    return { issue, approved };
  }

  const leaseApi = githubLeaseApi({ token: ghToken, repository: repo, request });
  const tasksApi = agentTasksApi({ token: agentToken, repository: repo, request });
  if (recovery !== 'none') {
    const lease = await readLease(leaseApi, { verifyTarget: true });
    if (lease?.tagSha !== process.env.EXPECTED_LEASE_TAG_SHA) throw new Error('Expected lease tag is no longer held');
    const readRunLog = async (id, attempt) => {
      try {
        const { stdout } = await exec('gh', ['run', 'view', id, '--repo', repo, '--attempt', attempt, '--log'], {
          env: { ...process.env, GH_TOKEN: ghToken }, timeout: 30000,
        });
        return stdout;
      } catch {
        throw new Error('Cannot independently read the original controller attempt log');
      }
    };
    await verifyStoppedAttempt({ lease, gh, readRunLog });
    await recoverPreDispatchLease({ repository: repo, lease, leaseApi, gh, paged, tasksApi, repairBusy,
      report, verifyOnly: recovery === 'verify' });
    return;
  }
  await runAcceptanceCycle({ repository: repo, gh, paged, tasksApi, leaseApi, runId, report, approval, repairBusy, readyPull });
}

export async function runAcceptanceCycle({ repository, gh, paged, tasksApi, leaseApi, runId, report, approval,
  repairBusy, readyPull }) {
  const current = await readLease(leaseApi);
  if (current) {
    report('LEASE_HELD issue #' + current.issue + ' run ' + current.runId +
      ' age ' + ((Date.now() - Date.parse(current.startedAt)) / 3600000).toFixed(1) + 'h');
    await advanceAcceptance({ repository, gh, paged, tasksApi, leaseApi, lease: current, runId, report,
      approval, repairBusy, readyPull });
    return;
  }

  const secondAllowed = async () => firstAcceptanceCompleted(
    await gh('/issues/305'), await paged('/issues/305/events'));
  const scope = await secondAllowed() ? 306 : 305;
  const candidateSnapshot = async () => {
    const [prs, rows, repair, ref] = await Promise.all([
      openDevelopmentPRs(paged, repository), readTaskDetails(tasksApi), repairBusy(), gh('/git/ref/heads/' + development),
    ]);
    const writers = competingWriters(rows);
    for (const writer of writers) report('COPILOT_WRITER_BLOCK: ' + JSON.stringify(writer));
    if (repair) report('CI_REPAIR_BLOCK: A CI repair run may still be writing.');
    const activeTasks = repair ? [...writers, { source: 'CI repair' }] : writers;
    return { prs, activeTasks, lease: { state: 'free' }, baseSha: developmentSha(ref) };
  };
  const initial = await candidateSnapshot();
  const queue = { ...initial, issues: [await gh('/issues/' + scope)] };
  const selection = selectReadyIssue(queue);
  if (selection.action !== 'SELECT_NEXT_READY') {
    report(selection.action + ': ' + selection.reason);
    return;
  }
  const number = selection.issue;
  if (await isParked(leaseApi, number)) {
    report('REPORT_BLOCKED: acceptance issue #' + number + ' is parked');
    return;
  }
  const { issue, approved } = await approval(number);
  if (!approved || issue.number !== number || issue.state !== 'open' || issue.title !== selection.title ||
      !Number.isFinite(Date.parse(issue.updated_at)))
    throw new Error('Issue approval or identity changed since selection');
  const acquired = await acquireLease(leaseApi, {
    issue: number, runId, baseSha: initial.baseSha, issueDigest: issueDigest(issue),
  });
  if (!acquired.acquired) {
    report('LEASE_CONFLICT: another controller owns ' + acquired.holder.runId);
    return;
  }
  report('LEASE_ACQUIRED for #' + number + ' by ' + runId);
  let final, checked, held;
  try {
    [final, checked, held] = await Promise.all([candidateSnapshot(), approval(number), readLease(leaseApi)]);
  } catch (error) {
    // This path returns or throws before the only call that can create a task.
    report(preDispatchStop(acquired));
    if (error.code !== 'COPILOT_TASK_GET' || error.status !== 403) throw error;
    await recoverPreDispatchLease({ repository, lease: acquired, leaseApi, gh, paged, tasksApi, repairBusy, report });
    return;
  }
  if (held?.tagSha !== acquired.tagSha || held.runId !== runId) throw new Error('Lease changed before dispatch');
  const finalSelection = selectReadyIssue({ ...final, issues: [checked.issue] });
  if (finalSelection.issue !== number || await isParked(leaseApi, number) || !checked.approved ||
      checked.issue.updated_at !== issue.updated_at || issueDigest(checked.issue) !== held.issueDigest ||
      final.baseSha !== initial.baseSha || (number === 306 && !await secondAllowed())) {
    await releaseLease(leaseApi, { runId, expectedTagSha: acquired.tagSha, confirmedWriterStopped: true });
    report('POST_LEASE_BLOCK: GitHub evidence changed. Released the unused lease before task creation.');
    return;
  }

  const proof = proofFor(number);
  const prompt = [
    'Implement Butterbox GitHub issue #' + number + ' only, against ' + development + '.',
    taskMarker(runId),
    'Read its issue and AGENTS.md. Add only ' + proof.path + ' with exactly the content in the issue.',
    'Open a draft PR. Use this body with one marker per line and no GitHub issue closing keywords:',
    'Refs #' + number,
    '<!-- butterbox-issue: ' + number + ' -->',
    '<!-- butterbox-evidence: ' + proof.path + ' -->',
    'Leave CI and merge to GitHub. Do not access external systems, change other files, or begin another issue.',
  ].join('\n');
  try {
    const created = await tasksApi.create({ prompt });
    const live = verifyCreatedTask(created, await tasksApi.get(created.id));
    report('COPILOT_LAUNCHED issue #' + number + ' task ' + live.id + ' state=' + live.state +
      ' ' + live.url + ' sessions=' + JSON.stringify(live.sessionIds));
  } catch (error) {
    report('DISPATCH_UNCERTAIN: ' + error.message + '; lease retained for independent verification.');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    report('STOPPED: ' + error.message);
    process.exitCode = 1;
  });
}
