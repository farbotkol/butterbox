import { developmentProvider, inferProductAcceptance } from './product-acceptance.mjs';
import { productScope, conflictsWithProduct } from './product.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { githubLeaseApi } from './github-lease-api.mjs';
import { readLease, acquireLease, releaseLease, isParked, unparkIssue } from './lease.mjs';
import { ownerApprovedQueueLabels, queuePriority, selectReadyIssue } from './queue.mjs';
import { agentTasksApi, verifyCreatedTask } from './agent-tasks-api.mjs';
import { taskMarker, development, competingWriters, isSha } from './handoff.mjs';
import { ownerId, acceptanceIssues, proofFor, issueDigest, developmentSha, firstAcceptanceCompleted,
  openDevelopmentPRs, advanceAcceptance } from './acceptance.mjs';

import { preDispatchStop, recoverPreDispatchLease, verifyStoppedAttempt } from './pre-dispatch-recovery.mjs';
import { readLeaseCandidates, rememberLeaseTask, withTaskInventory } from './task-inventory.mjs';
import { autonomousDevelopmentMarker } from '../agent-evidence/evidence.mjs';
import { downloadJobLog } from './job-log-download.mjs';

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
  if (!['none', 'verify', 'release', 'merged-verify', 'merged-release', 'unpark'].includes(recovery))
    throw new Error('Invalid recovery mode');
  if (recovery !== 'none' && (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_TRIGGERING_ACTOR !== 'farbotkol' || !isSha(process.env.EXPECTED_LEASE_TAG_SHA))) {
    throw new Error('Recovery requires owner workflow dispatch and the exact tag SHA');
  }
  if (recovery === 'none' && process.env.BUTTERBOX_AUTONOMY_ENABLED !== 'true') {
    report('DISPATCH_DISABLED: owner opt-in switch is not enabled.');
    return;
  }
  if (!ghToken) throw new Error('Missing Actions repository token');
  if (!agentToken && recovery !== 'unpark') {
    if (recovery !== 'none') throw new Error('Missing Copilot credential for recovery');
    report('DISPATCH_BLOCKED: COPILOT_AGENT_USER_TOKEN is unavailable.');
    return;
  }

  const request = (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const provider = developmentProvider({ token: process.env.VERCEL_DEPLOYMENT_READ_TOKEN, request });
  const infer = input => inferProductAcceptance(input, { token: ghToken, request });
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
  async function closingIssues(pr) {
    if (typeof pr.node_id !== 'string') throw new Error('Missing product PR graph identity');
    const response = await request('https://api.github.com/graphql', {
      method: 'POST', headers, body: JSON.stringify({
        query: 'query($id: ID!) { node(id: $id) { ... on PullRequest { headRefOid closingIssuesReferences(first: 1) { totalCount } } } }',
        variables: { id: pr.node_id },
      }),
    });
    if (!response.ok) throw new Error('Could not verify GitHub closing issue links');
    const json = await response.json();
    const prNode = json.data?.node;
    const count = prNode?.closingIssuesReferences?.totalCount;
    if (json.errors?.length || prNode?.headRefOid !== pr.head?.sha || !Number.isSafeInteger(count) || count < 0)
      throw new Error('Incomplete GitHub closing issue links');
    return count;
  }
  async function approval(number) {
    const [issue, events, dependencies] = await Promise.all([
      gh('/issues/' + number), paged('/issues/' + number + '/events'),
      paged('/issues/' + number + '/dependencies/blocked_by'),
    ]);
    if (issue.number !== number || issue.pull_request || !Array.isArray(issue.labels) ||
        !Array.isArray(issue.assignees) || !Number.isFinite(Date.parse(issue.updated_at)) ||
        dependencies.some(row => !Number.isSafeInteger(row.number) || !['open', 'closed'].includes(row.state)))
      throw new Error('Incomplete canonical issue or dependency evidence for #' + number);
    const approved = ownerApprovedQueueLabels(events, ownerId, issue) &&
      ['autonomy-ready', 'dependencies-cleared'].every(label =>
        issue.labels.some(row => row.name.toLowerCase() === label)) &&
      dependencies.every(row => row.state === 'closed' && row.state_reason === 'completed');
    return { issue, approved };
  }

  const leaseApi = githubLeaseApi({ token: ghToken, repository: repo, request });
  if (recovery === 'unpark') {
    const input = process.env.PARKED_ISSUE_NUMBER ?? '';
    if (!/^[1-9][0-9]*$/.test(input) || !Number.isSafeInteger(Number(input)))
      throw new Error('Unpark requires a canonical issue number');
    const { issue, approved } = await approval(Number(input));
    if (!approved || !selectReadyIssue({ issues: [issue], prs: [], activeTasks: [], lease: { state: 'free' } }).issue ||
        (!acceptanceIssues.includes(issue.number) && !productScope(issue)))
      throw new Error('Issue has not been reauthorised with viable scope and dependencies');
    await unparkIssue(leaseApi, issue.number, process.env.EXPECTED_LEASE_TAG_SHA, queuePriority(issue).label);
    report('UNPARKED #' + issue.number + ' · normal dispatch requires a separate run');
    return;
  }
  const tasksApi = withTaskInventory(agentTasksApi({ token: agentToken, repository: repo, request }),
    leaseApi, { readOnly: ['verify', 'merged-verify'].includes(recovery) });
  if (recovery !== 'none') {
    const lease = await readLease(leaseApi, { verifyTarget: true });
    if (lease?.tagSha !== process.env.EXPECTED_LEASE_TAG_SHA) throw new Error('Expected lease tag is no longer held');
    if (recovery.startsWith('merged-')) {
      await advanceAcceptance({ repository: repo, gh, paged, tasksApi, leaseApi, lease, runId, report,
        approval, repairBusy, readyPull, closingIssues, provider, mergedRecovery: recovery.slice('merged-'.length) });
      return;
    }
    const readRunLog = async (id, attempt) => {
      let stage = 'job_inventory_request';
      try {
        const api = async path => {
          const { stdout } = await exec('gh', ['api', path], {
            env: { ...process.env, GH_TOKEN: ghToken }, timeout: 30000,
            maxBuffer: 10 * 1024 * 1024,
          });
          return stdout;
        };
        const raw = await api('repos/' + repo +
          '/actions/runs/' + id + '/attempts/' + attempt + '/jobs?per_page=100');
        stage = 'job_inventory_json';
        const result = JSON.parse(raw);
        stage = 'job_inventory_completeness';
        if (!Number.isSafeInteger(result.total_count) ||
            !Array.isArray(result.jobs) || result.total_count !== result.jobs.length)
          throw new Error('incomplete_inventory');
        stage = 'dispatch_job_identity';
        const jobs = result.jobs.filter(job => job.name === 'autonomous-dispatch' &&
          String(job.run_id) === id && job.run_attempt === Number(attempt) &&
          job.status === 'completed' && job.conclusion === 'failure' &&
          Number.isSafeInteger(job.id));
        if (jobs.length !== 1) throw new Error('ambiguous_job');
        stage = 'job_log_request';
        const output = await downloadJobLog({ repository: repo, jobId: jobs[0].id, token: ghToken });
        stage = 'job_log_nonempty';
        if (!output.trim()) throw new Error('empty_log');
        return output;
      } catch (error) {
        // Do not expose command output, HTTP bodies, prompts or credentials.
        const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
        const http = stderr.match(/\bHTTP (?:[1-5]\d\d)\b/)?.[0] ??
          String(error?.message ?? '').match(/\bHTTP (?:[1-5]\d\d)\b/)?.[0] ?? 'unknown';
        const code = ['job_inventory_request', 'job_log_request'].includes(stage) ?
          ' http=' + http : '';
        throw new Error('Cannot independently read the exact original dispatch job log' +
          ' stage=' + stage + code);
      }
    };
    await verifyStoppedAttempt({ lease, gh, readRunLog });
    await recoverPreDispatchLease({ repository: repo, lease, leaseApi, gh, paged, tasksApi, repairBusy,
      report, verifyOnly: recovery === 'verify' });
    return;
  }
  await runAcceptanceCycle({ repository: repo, gh, paged, tasksApi, leaseApi, runId, report, approval, repairBusy, readyPull, closingIssues, infer, provider });
}

export async function runAcceptanceCycle({ repository, gh, paged, tasksApi, leaseApi, runId, report, approval,
  repairBusy, readyPull, closingIssues, infer, provider }) {
  const current = await readLease(leaseApi);
  if (current) {
    report('LEASE_HELD issue #' + current.issue + ' run ' + current.runId +
      ' age ' + ((Date.now() - Date.parse(current.startedAt)) / 3600000).toFixed(1) + 'h');
    const outcome = await advanceAcceptance({ repository, gh, paged, tasksApi, leaseApi, lease: current, runId, report,
      approval, repairBusy, readyPull, closingIssues, infer, provider });
    if (outcome !== 'released' || current.runId === runId) return;
  }

  const candidateSnapshot = async lease => {
    const [prs, rows, repair, ref, issues] = await Promise.all([
      openDevelopmentPRs(paged, repository), readLeaseCandidates(tasksApi, tasksApi.inventory ? lease : undefined), repairBusy(),
      gh('/git/ref/heads/' + development), paged('/issues?state=open&sort=created&direction=asc'),
    ]);
    if (issues.some(row => !Number.isSafeInteger(row.number) || row.state !== 'open') ||
        new Set(issues.map(row => row.number)).size !== issues.length)
      throw new Error('Incomplete or inconsistent open GitHub issue snapshot');
    const writers = competingWriters(rows);
    for (const writer of writers) report('COPILOT_WRITER_BLOCK: ' + JSON.stringify(writer));
    if (repair) report('CI_REPAIR_BLOCK: A CI repair run may still be writing.');
    const activeTasks = repair ? [...writers, { source: 'CI repair' }] : writers;
    const queue = { prs: [], activeTasks, lease: { state: 'free' } };
    const eligible = [];
    let target;
    for (const row of issues) {
      if (!selectReadyIssue({ ...queue, issues: [row] }).issue) continue;
      const { issue, approved } = await approval(row.number);
      if (issue.updated_at !== row.updated_at || issueDigest(issue) !== issueDigest(row))
        throw new Error('Issue snapshot changed during queue evaluation for #' + row.number);
      if (!approved || await isParked(leaseApi, row.number)) {
        report('QUEUE_SKIPPED #' + row.number + ': owner approval, dependencies or parking gate');
        continue;
      }
      if (!acceptanceIssues.includes(row.number)) {
        const scope = productScope(issue);
        if (!scope || !closingIssues) {
          report('PRODUCT_SCOPE_BLOCKED #' + row.number + ': owner-approved work area or lifecycle verification unavailable.');
          continue;
        }
        const proofs = await Promise.all(acceptanceIssues.map(async number => firstAcceptanceCompleted(
          await gh('/issues/' + number), await paged('/issues/' + number + '/events'), number)));
        if (!proofs.every(Boolean) || await conflictsWithProduct(paged, gh, prs, scope)) {
          report('PRODUCT_SCOPE_BLOCKED #' + row.number + ': proof sequence or work-area conflict.');
          continue;
        }
      } else if (prs.length) continue;
      if (row.number === 306 && !firstAcceptanceCompleted(
        await gh('/issues/305'), await paged('/issues/305/events'))) {
        report('QUEUE_SKIPPED #306: historical proof #305 lacks verified completion');
        continue;
      }
      if (provider || !acceptanceIssues.includes(row.number)) {
        target ??= Promise.resolve().then(() => provider.verifyTarget()).then(() => true, error => {
          report('DEVELOPMENT_TARGET_BLOCKED: ' + error.message);
          return false;
        });
        if (!await target) continue;
      }
      eligible.push(issue);
    }
    const selection = selectReadyIssue({ ...queue, issues: eligible });
    return { selection, issue: eligible.find(row => row.number === selection.issue), baseSha: developmentSha(ref) };
  };
  const initial = await candidateSnapshot();
  const { selection, issue } = initial;
  if (!issue) {
    report(selection.action + ': ' + selection.reason);
    return;
  }
  const number = issue.number;
  const acquired = await acquireLease(leaseApi, {
    issue: number, runId, baseSha: initial.baseSha, issueDigest: issueDigest(issue),
    priority: queuePriority(issue).label,
  });
  if (!acquired.acquired) {
    report('LEASE_CONFLICT: another controller owns ' + acquired.holder.runId);
    return;
  }
  report('LEASE_ACQUIRED for #' + number + ' by ' + runId);
  let final, held;
  try {
    final = await candidateSnapshot(acquired);
    held = await readLease(leaseApi);
  } catch (error) {
    // This path returns or throws before the only call that can create a task.
    report(preDispatchStop(acquired));
    if (error.code !== 'COPILOT_TASK_GET' || error.status !== 403) throw error;
    await recoverPreDispatchLease({ repository, lease: acquired, leaseApi, gh, paged, tasksApi, repairBusy, report });
    return;
  }
  if (held?.tagSha !== acquired.tagSha || held.runId !== runId) throw new Error('Lease changed before dispatch');
  if (final.selection.issue !== number || final.issue.updated_at !== issue.updated_at ||
      issueDigest(final.issue) !== held.issueDigest || final.baseSha !== initial.baseSha) {
    await releaseLease(leaseApi, { runId, expectedTagSha: acquired.tagSha, confirmedWriterStopped: true,
      compareAndDelete: true });
    report('POST_LEASE_BLOCK: GitHub evidence changed. Released the unused lease before task creation.');
    return;
  }

  const proof = acceptanceIssues.includes(number) ? proofFor(number) : null;
  const prompt = [
    'Implement Butterbox GitHub issue #' + number + ' only, against ' + development + '.',
    taskMarker(runId),
    proof ? 'Read its issue and AGENTS.md. Add only ' + proof.path + ' with exactly the content in the issue.' :
      'Read its issue and AGENTS.md. Work only in the approved Autonomy scope: ' + productScope(issue).paths.join(', ') +
      '. Add executable assertions in scoped top-level tests/*.test.mjs for each criterion. Report tests and evidence for every acceptance criterion in the PR. Report any incomplete criteria explicitly.',
    'Open a draft PR. Use this body with one marker per line and no GitHub issue closing keywords:',
    'Refs #' + number,
    '<!-- butterbox-issue: ' + number + ' -->',
    ...(proof ? ['<!-- butterbox-evidence: ' + proof.path + ' -->'] : [autonomousDevelopmentMarker]),
    'Leave CI and merge to GitHub. Do not access external systems, change other files, or begin another issue.',
  ].join('\n');
  try {
    const created = await tasksApi.create({ prompt });
    const live = verifyCreatedTask(created, await tasksApi.get(created.id));
    await rememberLeaseTask(tasksApi, acquired, live.id);
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
