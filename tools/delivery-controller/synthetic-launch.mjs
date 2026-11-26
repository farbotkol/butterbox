import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { competingWriters } from './handoff.mjs';
import { agentTasksApi, activeAgentTasks } from './agent-tasks-api.mjs';
import { listWriterTasks, readLeaseCandidates, rememberLeaseTask, withTaskInventory } from './task-inventory.mjs';
import { githubLeaseApi } from './github-lease-api.mjs';
import { acquireLease, readLease, releaseLease } from './lease.mjs';
import { taskMarker } from './handoff.mjs';

const repo = 'farbotkol/butterbox';
const branch = 'copilot/Development';
const issueNumber = 298;
const issueTitle = 'Synthetic Copilot launch proof for #290';
const intentRef = 'refs/tags/butterbox-synthetic-launch-298';
const proofPath = 'docs/agent-work/synthetic-copilot-proof.md';
const proofText = '# Synthetic Copilot launch proof\n\nThis file verifies a controlled Copilot documentation change.\n';
// Immutable evidence from PR #302 and failed reconciliation run 45010717756.
const deviation = {
  number: 302,
  taskId: '82d93745-533d-426d-8863-c51eaff764fc',
  head: 'b97669035f08092e0e287ec1d37dcb8f8528eb32',
  merge: '6de8ea9868424320413454c6a47cb2ff3b89b538',
  blob: '72500c8676657a6936f24acb279d6ed2c37132d4',
  run: '45010717756',
};
const requiredChecks = ['verify', 'database-smoke'];
const correctivePaths = [
  proofPath,
  '.github/workflows/copilot-synthetic-launch.yml',
  'docs/agent-work/autonomous-controller-operations.md',
  'tests/delivery-controller-synthetic.test.mjs',
  'tools/delivery-controller/synthetic-launch.mjs',
];
const reconciledMarker = '<!-- synthetic-298-reconciled -->';
const shaPattern = /^[0-9a-f]{40}$/;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const positiveInteger = /^[1-9][0-9]*$/;
const taskStates = new Set(['queued', 'in_progress', 'completed', 'failed', 'idle', 'waiting_for_user', 'timed_out', 'cancelled']);

class EvidenceError extends Error {}

function requireEvidence(condition, message) {
  if (!condition) throw new EvidenceError(message);
}

async function optionalRef(leases, ref) {
  try {
    return await leases.getRef(ref);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function taskLink(id) {
  return 'https://github.com/' + repo + '/copilot/tasks/' + id;
}

function issueLink(number) {
  return 'https://github.com/' + repo + '/issues/' + number;
}

export function verifiedSessions(task, id, lease) {
  requireEvidence(task?.id === id && idPattern.test(id) && taskStates.has(task.state), 'Task identity or status is unverified.');
  requireEvidence(Array.isArray(task.sessions) && task.sessions.length > 0 &&
    task.session_count === task.sessions.length, 'Session evidence is pending or incomplete. Run verify again later.');
  requireEvidence(task.sessions.every(session => idPattern.test(session.id) &&
    session.task_id === id && session.base_ref === branch && taskStates.has(session.state)) &&
    task.sessions.some(session => session.prompt?.split(/\r?\n/).includes(taskMarker(lease.runId))),
  'The task sessions do not match the synthetic lease and Development branch.');
  requireEvidence(new Set(task.sessions.map(session => session.id)).size === task.sessions.length,
    'Duplicate session identities in GitHub response.');
  return task.sessions;
}

function exactProof(proof) {
  return proof.type === 'file' && proof.encoding === 'base64' &&
    Buffer.from(proof.content, 'base64').equals(Buffer.from(proofText));
}

const branchRef = encodeURIComponent(branch);
const proofAt = (gh, sha) => gh('/contents/' + proofPath + '?ref=' + sha);
const prLink = number => 'https://github.com/' + repo + '/pull/' + number;
// The 2026-03-10 REST response omits merge_commit_sha, which both merge checks require.
const pullAt = (gh, number) => gh('/pulls/' + number, 'GET', undefined, '2022-11-28');

async function checkedHead(gh, head, mergedAt) {
  const filter = mergedAt ? 'all' : 'latest';
  const checks = await gh('/commits/' + head + '/check-runs?filter=' + filter + '&per_page=100');
  requireEvidence(Array.isArray(checks.check_runs) && Number.isSafeInteger(checks.total_count) &&
    checks.total_count <= checks.check_runs.length, 'CI evidence is incomplete.');
  const evidence = [];
  for (const name of requiredChecks) {
    const candidates = checks.check_runs.filter(row => row.name === name && row.app?.slug === 'github-actions' &&
      row.head_sha === head).sort((a, b) => b.id - a.id);
    // For a historical merge, inspect the latest check started at the time of merge.
    // Keep later activity in the audit record without letting it rewrite that decision.
    const check = mergedAt ? candidates.find(row => Date.parse(row.started_at) <= mergedAt) : candidates[0];
    requireEvidence(check?.status === 'completed' && check.conclusion === 'success' &&
      (!mergedAt || Date.parse(check.completed_at) <= mergedAt), 'Missing successful exact-head check: ' + name);
    evidence.push(name + ' ' + check.html_url);
    if (mergedAt) {
      for (const later of candidates.filter(row => Date.parse(row.started_at) > mergedAt)) {
        evidence.push('post-merge ' + name + ' ' + (later.conclusion ?? later.status) + ' ' + later.html_url);
      }
    }
  }
  return 'PR head ' + head + ' · ' + evidence.join(' · ');
}

async function verifyCorrection({ gh, number, original, baseSha }) {
  const pr = await pullAt(gh, number);
  requireEvidence(shaPattern.test(pr.merge_commit_sha ?? ''), 'Corrective PR merge_commit_sha is missing or invalid.');
  requireEvidence(pr.number === Number(number) && pr.merged === true && pr.state === 'closed' &&
    pr.base?.ref === branch && pr.base?.repo?.full_name === repo && pr.head?.repo?.full_name === repo &&
    /^Refs #298\s*$/mi.test(pr.body ?? '') && shaPattern.test(pr.head?.sha ?? '') &&
    pr.merge_commit_sha !== original.merge_commit_sha &&
    Date.parse(pr.merged_at) > Date.parse(original.merged_at),
  'The corrective PR must reference #298 and have a distinct, later merge into Development.');

  const head = pr.head.sha;
  const merge = pr.merge_commit_sha;
  const limit = '?per_page=' + (correctivePaths.length + 1);
  const [files, commit, ancestry, tip, rules, headProof, mergeProof] = await Promise.all([
    gh('/pulls/' + number + '/files' + limit),
    gh('/commits/' + merge + limit),
    gh('/compare/' + original.merge_commit_sha + '...' + merge),
    gh('/git/ref/heads/' + branch),
    gh('/rules/branches/' + branchRef),
    proofAt(gh, head),
    proofAt(gh, merge),
  ]);
  requireEvidence(tip.object?.type === 'commit' && tip.object.sha === baseSha && shaPattern.test(baseSha),
    'Development moved. Start a new workflow run on the current branch.');
  requireEvidence(ancestry.status === 'ahead', 'The correction does not descend from the original merge.');
  const reachable = await gh('/compare/' + merge + '...' + baseSha);
  requireEvidence(['ahead', 'identical'].includes(reachable.status), 'The corrective merge is not reachable from Development.');
  requireEvidence(Array.isArray(rules) && rules.some(rule => rule.type === 'pull_request' &&
    rule.parameters?.allowed_merge_methods?.includes('squash')) &&
    requiredChecks.every(name => rules.some(rule => rule.type === 'required_status_checks' &&
      rule.parameters?.required_status_checks?.some(check => check.context === name && check.integration_id === 15368))),
  'Development protection or required GitHub Actions checks could not be verified.');

  requireEvidence(Array.isArray(files) && files.length === correctivePaths.length &&
    correctivePaths.every(path => files.some(file => file.filename === path && file.status === 'modified' &&
      shaPattern.test(file.sha ?? ''))) && commit.sha === merge && commit.parents?.length === 1 &&
    shaPattern.test(commit.parents[0].sha ?? '') && commit.files?.length === files.length &&
    files.every(file => commit.files.some(merged => merged.filename === file.filename &&
      merged.status === file.status && merged.sha === file.sha)),
  'The correction must be a single-parent merge of the reviewed corrective files.');
  const [before, currentProof] = await Promise.all([proofAt(gh, commit.parents[0].sha), proofAt(gh, baseSha)]);
  requireEvidence(before.sha === deviation.blob && exactProof(headProof) && exactProof(mergeProof) &&
    exactProof(currentProof) && shaPattern.test(headProof.sha ?? '') && headProof.sha === mergeProof.sha &&
    mergeProof.sha === currentProof.sha,
  'The correction must replace the recorded deviation with the exact approved proof at the PR head, merge and Development tip.');
  const ci = await checkedHead(gh, head);
  const mergeCi = await checkedHead(gh, head, Date.parse(pr.merged_at));
  return 'Correction ' + prLink(number) + ' · ' + ci + ' · pre-merge ' + mergeCi +
    ' · merge ' + merge + ' · approved proof blob ' + mergeProof.sha + ' · Development ' + baseSha;
}

export async function runSynthetic({ operation, confirmation, taskId, prNumber, correctionPrNumber, runId, baseSha, gh, tasks, leases, report }) {
  requireEvidence(['launch', 'verify', 'reconcile'].includes(operation), 'Unknown synthetic operation.');
  requireEvidence(!correctionPrNumber || (operation === 'reconcile' && prNumber === String(deviation.number) &&
    taskId === deviation.taskId && positiveInteger.test(correctionPrNumber) &&
    Number.isSafeInteger(Number(correctionPrNumber)) && ![294, deviation.number].includes(Number(correctionPrNumber))),
  'A corrective PR is allowed only for reconciliation of the recorded PR #302 deviation.');
  const [issue, current, intent] = await Promise.all([
    gh('/issues/' + issueNumber), readLease(leases), optionalRef(leases, intentRef),
  ]);
  requireEvidence(issue.number === issueNumber && issue.title === issueTitle && !issue.pull_request,
    'Synthetic issue identity is unverified.');

  if (operation === 'launch') {
    requireEvidence(confirmation === 'LAUNCH-298' && !taskId && !prNumber,
      'Launch requires LAUNCH-298 and empty task ID and PR inputs.');
    requireEvidence(issue.state === 'open' && issue.assignees?.length === 0 && issue.labels?.length === 0,
      'Synthetic issue must be open, unassigned and unlabelled.');
    requireEvidence(!current && !intent, 'An exclusive lease or prior synthetic launch intent exists.');
    const preflight = async () => {
      const [prs, allTasks, tip, draft, repairs] = await Promise.all([
        // Any row is enough to block. No second page is needed if the first is empty.
        gh('/pulls?state=open&base=copilot%2FDevelopment&per_page=1'),
        (tasks.inventory ? readLeaseCandidates(tasks) : listWriterTasks(tasks)),
        gh('/git/ref/heads/copilot/Development'),
        gh('/pulls/294'),
        gh('/actions/workflows/agent-merge-enrollment.yml/runs?status=in_progress&per_page=1'),
      ]);
      requireEvidence(draft.number === 294 && draft.state === 'closed' && Array.isArray(prs) && prs.length === 0,
        'An open Development PR may have a writer, including draft PR #294. Launch blocked.');
      requireEvidence(repairs.total_count === 0 && repairs.workflow_runs?.length === 0,
        'A CI repair run may still be writing. Launch blocked.');
      requireEvidence((tasks.inventory ? competingWriters(allTasks) : activeAgentTasks(allTasks)).length === 0, 'A Copilot task may still be writing. Launch blocked.');
      requireEvidence(shaPattern.test(baseSha) && tip.object?.type === 'commit' && tip.object.sha === baseSha,
        'Development moved. Start a new workflow run on the current branch.');
    };
    await preflight();
    const lease = await acquireLease(leases, { issue: issueNumber, runId, baseSha });
    requireEvidence(lease.acquired, 'Another run acquired the exclusive lease.');
    report('Exclusive lease ' + lease.tagSha + ' held for ' + issueLink(issueNumber) + '.');
    try {
      await preflight();
    } catch (error) {
      await releaseLease(leases, { runId, expectedTagSha: lease.tagSha, confirmedWriterStopped: true });
      throw error;
    }
    // The permanent intent survives release and blocks duplicate starts, even after issue reopening.
    await leases.createRef({ ref: intentRef, sha: lease.tagSha });
    const prompt = [
      'Implement only the synthetic Butterbox issue #' + issueNumber + '.',
      taskMarker(runId),
      'Add only ' + proofPath + ' with the following exact content:',
      proofText,
      'Open a draft PR into ' + branch + ' with Refs #' + issueNumber + ' in the body.',
      'Do not merge or close any issue. Do not change any other file or touch PR #294.',
      'Do not access production, payroll, OAuth, databases, secrets or deployments.',
      'Do not invoke shell commands, workflows or other agents. Submit only the specified file.',
    ].join('\n');
    report('Sending the one allowed task-creation request. An ambiguous result keeps the lease.');
    const created = await tasks.create({ prompt });
    requireEvidence(idPattern.test(created?.id ?? ''), 'Task creation returned no valid task ID. Lease retained.');
    report('HTTP 201 accepted. Task ID ' + created.id + ' · ' + taskLink(created.id));
    const task = await tasks.get(created.id);
    requireEvidence(task?.id === created.id && taskStates.has(task.state), 'Independent task identity or status could not be confirmed.');
    report('Independent GET · task ' + task.id + ' · ' + task.state);
    const sessions = verifiedSessions(task, created.id, lease);
    await rememberLeaseTask(tasks, lease, created.id);
    for (const session of sessions) {
      report('Session ' + session.id + ' · ' + session.state);
    }
    return;
  }

  requireEvidence(idPattern.test(taskId), 'Use the Copilot task UUID from the launch evidence.');
  requireEvidence(current?.issue === issueNumber && current.runId.startsWith('synthetic_') &&
    intent?.object?.type === 'tag' && intent.object.sha === current.tagSha,
  'The one-time intent and active synthetic lease do not match.');
  const inventory = tasks.inventory ? await readLeaseCandidates(tasks, current, { exactTaskId: taskId }) : null;
  const task = inventory ? inventory.find(row => row.id === taskId) : await tasks.get(taskId);
  const sessions = verifiedSessions(task, taskId, current);
  report('Independent GET · ' + taskLink(taskId) + ' · ' + task.state);
  for (const session of sessions) report('Session ' + session.id + ' · ' + session.state);

  if (operation === 'verify' && !prNumber) return;
  requireEvidence(positiveInteger.test(prNumber) && Number.isSafeInteger(Number(prNumber)),
    'Enter the synthetic PR number.');
  const pr = await pullAt(gh, prNumber);
  const githubArtifact = task.artifacts?.some(artifact => artifact.provider === 'github' &&
    artifact.type === 'pull' && [pr.number, pr.id].includes(artifact.data?.id));
  requireEvidence(pr.number === Number(prNumber) && pr.number !== 294 && githubArtifact &&
    pr.base?.ref === branch && pr.base?.repo?.full_name === repo && pr.head?.repo?.full_name === repo &&
    shaPattern.test(pr.head?.sha ?? '') && sessions.some(session => session.head_ref === pr.head.ref) &&
    new RegExp('^Refs #' + issueNumber + '\\s*$', 'mi').test(pr.body ?? ''),
  'The PR is not linked to the synthetic task, session, issue and Development branch.');
  const files = await gh('/pulls/' + prNumber + '/files?per_page=2');
  requireEvidence(Array.isArray(files) && files.length === 1 && files[0].filename === proofPath && files[0].status === 'added',
    'The synthetic PR must add only the approved documentation file.');
  const { head } = pr;
  const proof = await proofAt(gh, head.sha);
  if (correctionPrNumber) {
    requireEvidence(pr.merged === true, 'Original PR merged must be true.');
    requireEvidence(head.sha === deviation.head, 'Original PR head.sha differs from the recorded deviation.');
    requireEvidence(pr.merge_commit_sha === deviation.merge,
      'Original PR merge_commit_sha is missing or differs from the recorded deviation.');
    requireEvidence(Number.isFinite(Date.parse(pr.merged_at)), 'Original PR merged_at is missing or invalid.');
    requireEvidence(proof.type === 'file', 'Original proof type must be file.');
    requireEvidence(proof.encoding === 'base64', 'Original proof encoding must be base64.');
    requireEvidence(proof.sha === deviation.blob, 'Original proof sha differs from the recorded deviation.');
    requireEvidence(typeof proof.content === 'string', 'Original proof content is missing or invalid.');
    requireEvidence(!exactProof(proof), 'Original proof content matches the approved text instead of the recorded deviation.');
  } else {
    requireEvidence(exactProof(proof), 'The proof file differs from the approved content.');
  }
  const ci = await checkedHead(gh, head.sha, correctionPrNumber && Date.parse(pr.merged_at));
  requireEvidence(task.state === 'completed' && sessions.every(session => session.state === 'completed'),
    'The Copilot writer has not independently completed.');
  const evidence = 'PR ' + prLink(prNumber) + ' · ' + ci;
  report(evidence);
  if (operation === 'verify') {
    requireEvidence(pr.state === 'open', 'Use reconcile for a merged synthetic PR.');
    report('Scope and CI verified. Review this exact head before a GitHub-protected squash merge.');
    return;
  }

  requireEvidence(pr.merged === true, 'Synthetic PR merged must be true.');
  requireEvidence(shaPattern.test(pr.merge_commit_sha ?? ''), 'Synthetic PR merge_commit_sha is missing or invalid.');
  const merge = pr.merge_commit_sha;
  const comparison = await gh('/compare/' + merge + '...copilot%2FDevelopment');
  requireEvidence(['ahead', 'identical'].includes(comparison.status), 'Merge is not reachable from Development.');
  const commit = await gh('/commits/' + merge + '?per_page=2');
  requireEvidence(commit.sha === merge && commit.parents?.length === 1 && commit.files?.length === 1 &&
    commit.files[0].filename === proofPath && commit.files[0].status === 'added',
  'The merge commit is not a single-parent, documentation-only change.');
  const mergeProof = await gh('/contents/' + proofPath + '?ref=' + merge);
  requireEvidence(mergeProof.sha === proof.sha, 'The merged commit does not contain the verified proof blob.');
  const correctionEvidence = [];
  if (correctionPrNumber) {
    const failureUrl = 'https://github.com/' + repo + '/actions/runs/' + deviation.run;
    const deviationEvidence = 'Original content criterion failed · ' + failureUrl + ' · PR #' + deviation.number +
      ' copied task instructions into proof blob ' + deviation.blob + ' · original merge ' + merge;
    report(deviationEvidence);
    const corrected = await verifyCorrection({ gh, number: correctionPrNumber, original: pr, baseSha });
    report(corrected);
    correctionEvidence.push(deviationEvidence, corrected);
    const parentIssue = await gh('/issues/290');
    requireEvidence(parentIssue.number === 290 && parentIssue.state === 'open' && !parentIssue.pull_request,
      'Issue #290 must remain open.');
    const active = await readLease(leases);
    requireEvidence(active?.tagSha === current.tagSha && active.runId === current.runId,
      'The synthetic lease changed during verification.');
  }
  const writers = tasks.inventory ?
    competingWriters(await readLeaseCandidates(tasks, current, { exactTaskId: taskId })) :
    activeAgentTasks(await listWriterTasks(tasks));
  requireEvidence(writers.length === 0, 'Another Copilot task may still be writing.');
  const runUrl = 'https://github.com/' + repo + '/actions/runs/' + runId.slice('synthetic_'.length);
  const launchRunUrl = 'https://github.com/' + repo + '/actions/runs/' + current.runId.slice('synthetic_'.length);
  const note = [
    reconciledMarker, '### GitHub-verified synthetic evidence',
    'Task ' + taskLink(taskId) + ' · sessions ' + sessions.map(session => session.id).join(', '),
    evidence, 'Merge ' + merge, ...correctionEvidence, 'Launch ' + launchRunUrl, 'Reconciliation ' + runUrl,
  ].join('\n\n');
  if (issue.state === 'open') {
    const closed = await gh('/issues/' + issueNumber, 'PATCH', {
      state: 'closed', state_reason: 'completed', body: (issue.body ?? '') + '\n\n' + note,
    });
    requireEvidence(closed.number === issueNumber && closed.state === 'closed' && closed.body?.includes(note),
      'Issue reconciliation was not confirmed. Lease retained.');
  } else {
    requireEvidence(issue.state === 'closed' && issue.body?.includes(reconciledMarker) &&
      issue.body.includes(taskLink(taskId)) && issue.body.includes('Merge ' + merge) && correctionEvidence.every(line => issue.body.includes(line)),
    'Synthetic issue was closed without matching evidence. Lease retained.');
  }
  await releaseLease(leases, { runId: current.runId, expectedTagSha: current.tagSha, confirmedWriterStopped: true });
  report('Verified merge ' + merge + ', reconciled ' + issueLink(issueNumber) + ', and released the exact synthetic lease.');
}

async function main() {
  const env = process.env;
  requireEvidence(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === repo &&
    env.GITHUB_REF === 'refs/heads/' + branch && env.GITHUB_ACTOR_ID === '11307166' &&
    env.GITHUB_RUN_ATTEMPT === '1' && positiveInteger.test(env.GITHUB_RUN_ID ?? '') &&
    env.BUTTERBOX_AUTONOMY_ENABLED !== 'true', 'The owner, branch, event or dispatch settings did not pass the guard.');
  requireEvidence(env.GITHUB_TOKEN && env.COPILOT_AGENT_USER_TOKEN, 'The Actions credential or Copilot user secret is unavailable.');
  const report = line => {
    console.log(line);
    appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n\n');
  };
  const request = (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const gh = async (path, method = 'GET', body, apiVersion = '2026-03-10') => {
    const response = await request('https://api.github.com/repos/' + repo + path, {
      method,
      headers: {
        Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + env.GITHUB_TOKEN,
        'X-GitHub-Api-Version': apiVersion, 'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    });
    requireEvidence(response.ok, 'Repository API ' + method + ' returned HTTP ' + response.status + '.');
    return response.json();
  };
  const agentRequest = async (url, options) => {
    const response = await request(url, options);
    if (options.method === 'POST') {
      report('Copilot task-creation endpoint returned HTTP ' + response.status + '.');
      requireEvidence(response.status === 201, 'Task creation was not accepted. The one-time intent and lease are retained.');
    }
    return response;
  };
  const leases = githubLeaseApi({ token: env.GITHUB_TOKEN, repository: repo, request });
  await runSynthetic({
    operation: env.SYNTHETIC_OPERATION, confirmation: env.SYNTHETIC_CONFIRMATION,
    taskId: env.SYNTHETIC_TASK_ID, prNumber: env.SYNTHETIC_PR_NUMBER,
    correctionPrNumber: env.SYNTHETIC_CORRECTION_PR_NUMBER,
    runId: 'synthetic_' + env.GITHUB_RUN_ID, baseSha: env.GITHUB_SHA, report, gh,
    tasks: withTaskInventory(agentTasksApi({ token: env.COPILOT_AGENT_USER_TOKEN, repository: repo, request: agentRequest }),
      leases, { readOnly: env.SYNTHETIC_OPERATION === 'verify' }),
    leases,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const knownApiStatus = /^(Copilot task API|GitHub lease API) (GET|POST|DELETE) (returned|failed with) HTTP [1-5][0-9][0-9]$/.test(error.message);
    const message = error instanceof EvidenceError || knownApiStatus ? error.message :
      'A network or response validation error interrupted the run. Inspect the preceding evidence before taking further action.';
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'Stopped: ' + message + '\n');
    console.error('Stopped: ' + message);
    process.exitCode = 1;
  });
}
