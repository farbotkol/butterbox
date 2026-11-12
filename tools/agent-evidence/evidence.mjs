import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/i;
const EVIDENCE_PATH = /^docs\/agent-work\/issues\/issue-(\d+)\/pr-(\d+)\/attempt-(\d{2})\.evidence\.json$/;
const MANAGED_PATHS = new Set([
  'BACKLOG_INDEX.csv',
  'BUTTERBOX_PRODUCT_BACKLOG.md',
  'IMPLEMENTATION_PROGRESS.md',
]);
const SECRET_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const EVIDENCE_STATUSES = new Set(['pass', 'fail', 'blocked', 'not-tested']);
const CI_STATUSES = new Set(['pending', 'pass', 'fail', 'blocked', 'not-tested']);
const RECOMMENDATIONS = new Set(['complete', 'partial', 'blocked']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const sorted = values => [...values].sort();
const safeMarkdownText = value => String(value)
  .replace(/[\r\n]/g, ' ')
  .replace(/@/g, '@\u200b')
  .replace(/[\\`*_{}\[\]()#+.!|>]/g, '\\$&');

export function evidenceMarkdownPath(evidencePath) {
  return evidencePath.replace(/\.evidence\.json$/, '.md');
}

export function evidencePathIdentity(evidencePath) {
  const match = EVIDENCE_PATH.exec(evidencePath);
  return match && {
    issueNumber: Number(match[1]),
    pullNumber: Number(match[2]),
    attempt: Number(match[3]),
  };
}

export function isManagedFile(filePath) {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\/+/, '');
  return MANAGED_PATHS.has(normalized) || normalized.startsWith('docs/agent-status/');
}

function inspectSecretValues(value, location, errors) {
  if (typeof value === 'string') {
    if (SECRET_PATTERN.test(value)) errors.push(`${location} contains a secret or personal contact value`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectSecretValues(item, `${location}[${index}]`, errors));
    return;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) inspectSecretValues(item, `${location}.${key}`, errors);
  }
}

function requireString(value, label, errors, max = 2000) {
  if (!nonEmptyString(value) || value.length > max) errors.push(`${label} must be a non-empty string of at most ${max} characters`);
}

function requireArray(value, label, errors) {
  if (!Array.isArray(value)) errors.push(`${label} must be an array`);
  return Array.isArray(value) ? value : [];
}

function allowOnlyKeys(value, allowed, label, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${label}.${key} is not allowed by schema version 1`);
  }
}

export function validateEvidence(evidence, {
  repository,
  issueNumber,
  pullNumber,
  headSha,
  mergeSha,
  changedFiles,
  evidencePath,
  acceptanceCriteria,
} = {}) {
  const errors = [];
  if (!isObject(evidence)) return ['evidence must be a JSON object'];

  allowOnlyKeys(evidence, [
    'schemaVersion', 'attempt', 'issue', 'pullRequest', 'run', 'scope', 'criteria',
    'tests', 'ci', 'decisions', 'reruns', 'limitations', 'blockers',
    'recommendation', 'markdownPath', 'markdownSha256', 'auditUrl',
  ], 'evidence', errors);
  allowOnlyKeys(evidence.issue, ['number', 'url'], 'issue', errors);
  allowOnlyKeys(evidence.pullRequest, ['number', 'url', 'baseBranch', 'headBranch', 'headSha', 'mergeSha'], 'pullRequest', errors);
  allowOnlyKeys(evidence.run, ['id', 'agent', 'commitSha', 'startedAt', 'updatedAt'], 'run', errors);
  allowOnlyKeys(evidence.scope, ['summary', 'changedFiles', 'implemented'], 'scope', errors);
  if (evidence.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!Number.isSafeInteger(evidence.attempt) || evidence.attempt < 1 || evidence.attempt > 99) {
    errors.push('attempt must be an integer from 1 to 99');
  }
  if (evidencePath) {
    const identity = evidencePathIdentity(evidencePath);
    if (!identity) errors.push('evidencePath must use the issue/PR/attempt layout');
    else {
      if (identity.issueNumber !== evidence.issue?.number) errors.push('evidence path issue does not match issue.number');
      if (identity.pullNumber !== evidence.pullRequest?.number) errors.push('evidence path PR does not match pullRequest.number');
      if (identity.attempt !== evidence.attempt) errors.push('evidence path attempt does not match attempt');
      if (evidence.markdownPath !== evidenceMarkdownPath(evidencePath)) errors.push('markdownPath must point to the paired attempt log');
    }
  }

  if (!isObject(evidence.issue) || !Number.isSafeInteger(evidence.issue.number) || evidence.issue.number < 1) {
    errors.push('issue.number must be a positive integer');
  } else {
    if (issueNumber !== undefined && evidence.issue.number !== issueNumber) errors.push('issue.number does not match the canonical issue');
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+$/.test(evidence.issue.url ?? '')) {
      errors.push('issue.url must be a GitHub issue URL');
    } else if (Number(evidence.issue.url.split('/').at(-1)) !== evidence.issue.number) {
      errors.push('issue.url does not match issue.number');
    }
  }
  if (repository && evidence.issue?.url !== `https://github.com/${repository}/issues/${issueNumber}`) {
    errors.push('issue.url does not match the canonical repository and issue');
  }

  const pr = evidence.pullRequest;
  if (!isObject(pr) || !Number.isSafeInteger(pr.number) || pr.number < 1) {
    errors.push('pullRequest.number must be a positive integer');
  } else {
    if (pullNumber !== undefined && pr.number !== pullNumber) errors.push('pullRequest.number does not match the merged PR');
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/.test(pr.url ?? '')) {
      errors.push('pullRequest.url must be a GitHub pull request URL');
    } else if (Number(pr.url.split('/').at(-1)) !== pr.number) {
      errors.push('pullRequest.url does not match pullRequest.number');
    }
  }
  if (repository && pr?.url !== `https://github.com/${repository}/pull/${pullNumber}`) {
    errors.push('pullRequest.url does not match the merged repository and PR');
  }
  requireString(pr?.baseBranch, 'pullRequest.baseBranch', errors, 200);
  if (pr?.baseBranch !== undefined && pr.baseBranch !== 'copilot/Development') {
    errors.push('pullRequest.baseBranch must be copilot/Development');
  }
  requireString(pr?.headBranch, 'pullRequest.headBranch', errors, 200);
  if (pr?.headSha !== null && pr?.headSha !== undefined && !SHA.test(pr.headSha)) {
    errors.push('pullRequest.headSha must be null or a 40-character commit SHA');
  }
  if (headSha && pr?.headSha && pr.headSha !== headSha) errors.push('pullRequest.headSha does not match the PR head');
  if (pr?.mergeSha !== null && pr?.mergeSha !== undefined && !SHA.test(pr.mergeSha)) {
    errors.push('pullRequest.mergeSha must be null or a 40-character commit SHA');
  }
  if (mergeSha && pr?.mergeSha && pr.mergeSha !== mergeSha) errors.push('pullRequest.mergeSha does not match the GitHub merge SHA');

  const run = evidence.run;
  if (!isObject(run)) errors.push('run must be an object');
  if (!Number.isSafeInteger(run?.id) || run.id < 1) errors.push('run.id must be a positive integer');
  if (!['copilot', 'human', 'automation'].includes(run?.agent)) errors.push('run.agent must be copilot, human, or automation');
  if (!SHA.test(run?.commitSha ?? '')) errors.push('run.commitSha must be the commit tested by this attempt');
  for (const field of ['startedAt', 'updatedAt']) {
    if (!nonEmptyString(run?.[field]) || Number.isNaN(Date.parse(run[field]))) errors.push(`run.${field} must be an ISO timestamp`);
  }

  if (!isObject(evidence.scope)) errors.push('scope must be an object');
  requireString(evidence.scope?.summary, 'scope.summary', errors, 2000);
  const files = requireArray(evidence.scope?.changedFiles, 'scope.changedFiles', errors);
  if (files.length === 0) errors.push('scope.changedFiles must not be empty');
  if (files.some(file => !nonEmptyString(file) || file.startsWith('/') || file.split('/').includes('..'))) {
    errors.push('scope.changedFiles must contain safe repository-relative paths');
  }
  if (new Set(files).size !== files.length) errors.push('scope.changedFiles must not contain duplicates');
  if (changedFiles && JSON.stringify(sorted(files)) !== JSON.stringify(sorted(changedFiles))) {
    errors.push('scope.changedFiles does not match the merged PR file list');
  }
  for (const [name, values] of Object.entries({
    implemented: evidence.scope?.implemented,
    decisions: evidence.decisions,
    limitations: evidence.limitations,
    blockers: evidence.blockers,
    reruns: evidence.reruns,
    tests: evidence.tests,
    ci: evidence.ci,
    criteria: evidence.criteria,
  })) requireArray(values, name, errors);
  if (!Array.isArray(evidence.scope?.implemented)) errors.push('scope.implemented must be an array');
  else evidence.scope.implemented.forEach((item, index) => requireString(item, `scope.implemented[${index}]`, errors));

  const criteria = Array.isArray(evidence.criteria) ? evidence.criteria : [];
  if (acceptanceCriteria) {
    if (criteria.length !== acceptanceCriteria.length) {
      errors.push('criteria count does not match the canonical issue acceptance checklist');
    } else {
      criteria.forEach((criterion, index) => {
        if (criterion.description.trim() !== acceptanceCriteria[index]) {
          errors.push(`criteria[${index}].description does not match the canonical issue checklist`);
        }
      });
    }
  }
  if (criteria.length === 0) errors.push('criteria must include at least one acceptance criterion');
  const criterionIds = new Set();
  criteria.forEach((criterion, index) => {
    const label = `criteria[${index}]`;
    if (!isObject(criterion)) {
      errors.push(`${label} must be an object`);
      return;
    }
    allowOnlyKeys(criterion, ['id', 'description', 'status', 'evidence'], label, errors);
    if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(criterion.id ?? '')) errors.push(`${label}.id is invalid`);
    else if (criterionIds.has(criterion.id)) errors.push(`${label}.id must be unique`);
    else criterionIds.add(criterion.id);
    requireString(criterion.description, `${label}.description`, errors);
    if (!EVIDENCE_STATUSES.has(criterion.status)) errors.push(`${label}.status is invalid`);
    const items = requireArray(criterion.evidence, `${label}.evidence`, errors);
    items.forEach((item, evidenceIndex) => {
      if (!isObject(item) || !['test', 'ci', 'review', 'commit', 'file', 'issue'].includes(item.kind)) {
        errors.push(`${label}.evidence[${evidenceIndex}].kind is invalid`);
      } else {
        allowOnlyKeys(item, ['kind', 'reference', 'outcome'], `${label}.evidence[${evidenceIndex}]`, errors);
        requireString(item.reference, `${label}.evidence[${evidenceIndex}].reference`, errors, 1000);
        requireString(item.outcome, `${label}.evidence[${evidenceIndex}].outcome`, errors, 1000);
      }
    });
    if (criterion.status === 'pass' && items.length === 0) errors.push(`${label} passing evidence requires at least one evidence reference`);
  });

  const ci = Array.isArray(evidence.ci) ? evidence.ci : [];
  const ciNames = new Set();
  for (const [index, result] of ci.entries()) {
    if (!isObject(result)) {
      errors.push(`ci[${index}] must be an object`);
      continue;
    }
    allowOnlyKeys(result, ['name', 'status', 'runId', 'url'], `ci[${index}]`, errors);
    if (!['verify', 'database'].includes(result.name)) errors.push(`ci[${index}].name must be verify or database`);
    if (ciNames.has(result.name)) errors.push(`ci[${index}].name must be unique`);
    ciNames.add(result.name);
    if (!CI_STATUSES.has(result.status)) errors.push(`ci[${index}].status is invalid`);
    if (result.runId !== null && result.runId !== undefined && !Number.isSafeInteger(result.runId)) {
      errors.push(`ci[${index}].runId must be an integer or null`);
    }
    if (result.url !== null && result.url !== undefined && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+(?:\/job\/\d+)?$/.test(result.url)) {
      errors.push(`ci[${index}].url must be a GitHub Actions run URL or null`);
    }
  }
  for (const requiredName of ['verify', 'database']) {
    if (!ciNames.has(requiredName)) errors.push(`ci must include ${requiredName}`);
  }

  const tests = Array.isArray(evidence.tests) ? evidence.tests : [];
  tests.forEach((item, index) => {
    if (!isObject(item)) return errors.push(`tests[${index}] must be an object`);
    allowOnlyKeys(item, ['command', 'outcome', 'result', 'reference'], `tests[${index}]`, errors);
    requireString(item.command, `tests[${index}].command`, errors, 500);
    if (!['passed', 'failed', 'blocked', 'not-run'].includes(item.outcome)) errors.push(`tests[${index}].outcome is invalid`);
    requireString(item.result, `tests[${index}].result`, errors, 1000);
    if (item.reference !== null && item.reference !== undefined) requireString(item.reference, `tests[${index}].reference`, errors, 1000);
  });

  const reruns = Array.isArray(evidence.reruns) ? evidence.reruns : [];
  reruns.forEach((item, index) => {
    if (!isObject(item) || !Number.isSafeInteger(item.attempt) || item.attempt < 1) errors.push(`reruns[${index}] must include a positive attempt`);
    allowOnlyKeys(item, ['attempt', 'reason', 'outcome', 'runId'], `reruns[${index}]`, errors);
    requireString(item.reason, `reruns[${index}].reason`, errors);
    requireString(item.outcome, `reruns[${index}].outcome`, errors);
  });
  if (!RECOMMENDATIONS.has(evidence.recommendation)) errors.push('recommendation must be complete, partial, or blocked');
  const markdownMatch = /^docs\/agent-work\/issues\/issue-(\d+)\/pr-(\d+)\/attempt-(\d{2})\.md$/.exec(evidence.markdownPath ?? '');
  if (!markdownMatch) {
    errors.push('markdownPath must use the issue/PR/attempt layout');
  } else {
    if (Number(markdownMatch[1]) !== evidence.issue?.number) errors.push('markdownPath issue does not match issue.number');
    if (Number(markdownMatch[2]) !== evidence.pullRequest?.number) errors.push('markdownPath PR does not match pullRequest.number');
    if (Number(markdownMatch[3]) !== evidence.attempt) errors.push('markdownPath attempt does not match attempt');
  }
  if (!/^[a-f0-9]{64}$/i.test(evidence.markdownSha256 ?? '')) errors.push('markdownSha256 must be a SHA-256 digest');
  if (!REPOSITORY_URL.test(evidence.auditUrl ?? '')) errors.push('auditUrl must be a canonical GitHub repository URL');
  for (const [name, values] of Object.entries({
    decisions: evidence.decisions,
    limitations: evidence.limitations,
    blockers: evidence.blockers,
  })) {
    if (Array.isArray(values)) values.forEach((value, index) => requireString(value, `${name}[${index}]`, errors));
  }

  inspectSecretValues(evidence, 'evidence', errors);
  return [...new Set(errors)];
}

export function validateMarkdownEvidence(evidence, markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return ['paired Markdown evidence is missing or empty'];
  const digest = createHash('sha256').update(markdown, 'utf8').digest('hex');
  return digest === evidence?.markdownSha256 ? [] : ['paired Markdown SHA-256 does not match'];
}

export function validateRepositoryEvidence(evidence, {
  repository,
  issueNumber,
  pullNumber,
  headSha,
  mergeSha,
  changedFiles,
  evidencePath,
  acceptanceCriteria,
} = {}) {
  const errors = validateEvidence(evidence, {
    repository, issueNumber, pullNumber, headSha, mergeSha, changedFiles, evidencePath, acceptanceCriteria,
  });
  if (repository && evidence?.auditUrl !== `https://github.com/${repository}`) {
    errors.push('auditUrl does not match the repository');
  }
  return [...new Set(errors)];
}

export function checkManagedFiles(changes, {
  labels = [],
  pullRequestBody = '',
  reviews = [],
  headSha,
  ownerLogin = 'farbotkol',
} = {}) {
  const files = changes.flatMap(change => typeof change === 'string'
    ? [change]
    : [change?.filename, change?.previous_filename].filter(Boolean));
  const managed = [...new Set(files.filter(isManagedFile))].sort();
  if (!managed.length) return { allowed: true, managedFiles: [], exception: null };
  const exception = pullRequestBody.match(/Managed-file exception:\s*#(\d+)\b/);
  const issueNumber = exception ? Number(exception[1]) : null;
  const hasLabel = labels.some(label => (typeof label === 'string' ? label : label.name) === 'agent-evidence-governance-exception');
  const approved = issueNumber !== null && reviews.some(review =>
    review?.user?.login?.toLowerCase() === ownerLogin.toLowerCase() &&
    review.state === 'APPROVED' &&
    review.commit_id === headSha &&
    new RegExp(`Managed-file exception approved:\\s*#${issueNumber}\\b`).test(review.body ?? ''));
  return {
    allowed: Boolean(hasLabel && approved),
    managedFiles: managed,
    exception: hasLabel && approved ? { issueNumber, headSha, managedFiles: managed } : null,
  };
}

export function getEvidencePathFromPullRequest(body, issueNumber, pullNumber) {
  const marker = body.match(/<!--\s*butterbox-evidence:\s*(\S+)\s*-->/);
  if (!marker) return null;
  const evidencePath = marker[1];
  const identity = evidencePathIdentity(evidencePath);
  return identity?.issueNumber === issueNumber && identity.pullNumber === pullNumber ? evidencePath : null;
}

export function canonicalIssueNumber(body) {
  const match = /<!--\s*butterbox-issue:\s*(\d+)\s*-->/.exec(body ?? '');
  return match ? Number(match[1]) : null;
}

export function referencesCanonicalIssue(body, issueNumber) {
  return new RegExp(`\\b(?:Refs|Related to)\\s+#${issueNumber}\\b`, 'i').test(body ?? '');
}

export function hasCanonicalIssueApproval(reviews, headSha, issueNumber, ownerLogin) {
  const approval = new RegExp(`Canonical issue approved:\\s*#${issueNumber}\\b`);
  return reviews.some(review =>
    review?.user?.login?.toLowerCase() === ownerLogin.toLowerCase() &&
    review.state === 'APPROVED' &&
    review.commit_id === headSha &&
    approval.test(review.body ?? ''));
}

export function hasAutoCloseKeyword(body) {
  return /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#)\d+\b/i.test(body ?? '');
}

export function parseAcceptanceCriteria(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  const heading = lines.findIndex(line => /^#{1,6}\s+Acceptance criteria\s*$/i.test(line.trim()));
  if (heading < 0) return [];
  const criteria = [];
  for (const line of lines.slice(heading + 1)) {
    if (/^#{1,6}\s+/.test(line.trim())) break;
    const match = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (match) criteria.push({ checked: match[1].toLowerCase() === 'x', description: match[2] });
  }
  return criteria;
}

export function isDocumentationOnly(files) {
  return files.length > 0 && files.every(file => file.startsWith('docs/') || file.endsWith('.md'));
}

export function evidenceIsComplete(evidence, changedFiles, acceptanceCriteria) {
  return Boolean(evidence) &&
    evidence.recommendation === 'complete' &&
    Array.isArray(evidence.criteria) &&
    evidence.criteria.length > 0 &&
    evidence.criteria.every(item => item.status === 'pass') &&
    Array.isArray(acceptanceCriteria) &&
    acceptanceCriteria.length === evidence.criteria.length &&
    evidence.criteria.every((item, index) => item.description.trim() === acceptanceCriteria[index]) &&
    Array.isArray(evidence.blockers) &&
    evidence.blockers.length === 0 &&
    !isDocumentationOnly(changedFiles);
}

export function requiredCiStatus(checkRuns) {
  const results = {};
  for (const name of ['verify', 'database']) {
    const latest = checkRuns
      .filter(check => check.name === name)
      .sort((left, right) => String(right.started_at ?? '').localeCompare(String(left.started_at ?? '')))[0];
    results[name] = latest
      ? {
          status: latest.status === 'completed' && latest.conclusion === 'success'
            ? 'pass'
            : latest.status === 'completed' ? 'fail' : 'pending',
          url: latest.html_url ?? null,
          runId: latest.run_id ?? null,
        }
      : { status: 'not-tested', url: null, runId: null };
  }
  return results;
}

export function buildReconciliationComment({
  repository,
  issueNumber,
  pullNumber,
  headSha,
  mergeSha,
  ci,
  evidence,
  errors = [],
  changedFiles = [],
  evidencePath,
  acceptanceCriteria,
}) {
  const key = `<!-- butterbox-reconciliation:v1:pr-${pullNumber}:${mergeSha} -->`;
  const ciPassed = ci.verify.status === 'pass' && ci.database.status === 'pass';
  const criteria = Array.isArray(evidence?.criteria) ? evidence.criteria : [];
  const docsOnly = isDocumentationOnly(changedFiles);
  const evidenceComplete = errors.length === 0 && ciPassed &&
    evidenceIsComplete(evidence, changedFiles, acceptanceCriteria);
  const gateLine = ['verify', 'database'].map(name =>
    `${name}: ${ci[name].status}${ci[name].url ? ` ([run](${ci[name].url}))` : ''}`).join(' · ');
  const criterionLines = criteria.length
    ? criteria.map(item => {
        const status = EVIDENCE_STATUSES.has(item.status) ? item.status : 'invalid';
        return `- \`${safeMarkdownText(item.id)}\`: **${status}**`;
      }).join('\n')
    : '- No valid per-criterion evidence supplied.';
  const problemLines = errors.length ? errors.map(error => `- ${safeMarkdownText(error)}`).join('\n') : '- None';
  const acceptance = evidenceComplete
    ? 'Evidence complete; full-story acceptance and closure remain subject to human review.'
    : docsOnly
      ? 'Documentation-only delivery; full-story acceptance remains pending.'
      : 'Full-story acceptance remains pending; this merge records only the delivered slice.';
  const evidenceLink = EVIDENCE_PATH.test(evidencePath ?? '')
    ? `- Evidence: [JSON](https://github.com/${repository}/blob/${mergeSha}/${evidencePath})` +
      (evidenceMarkdownPath(evidencePath) === evidence?.markdownPath
        ? ` · [Markdown](https://github.com/${repository}/blob/${mergeSha}/${evidence.markdownPath})`
        : '')
    : '- Evidence: missing or invalid attempt path.';
  return [
    key,
    '### Post-merge delivery reconciliation',
    `- Canonical issue: [#${issueNumber}](https://github.com/${repository}/issues/${issueNumber}).`,
    `- PR: [#${pullNumber}](https://github.com/${repository}/pull/${pullNumber}) — merged to \`copilot/Development\`.`,
    `- PR head SHA: \`${headSha}\`.`,
    `- Merge SHA: \`${mergeSha}\`.`,
    `- Required CI: ${gateLine}.`,
    evidenceLink,
    `- Evidence status: ${errors.length ? 'invalid or missing' : evidence ? 'schema-validated' : 'missing'}.`,
    `- Acceptance state: **${acceptance}**`,
    '- Per-criterion evidence:',
    criterionLines,
    '- Blockers:',
    problemLines,
    '',
    'This reconciliation is append-only. It does not close or reopen the issue; partial or documentation-only delivery never closes a full story.',
  ].join('\n');
}

export async function validateEvidenceFile(filePath, options = {}) {
  const absolute = path.resolve(filePath);
  const evidence = JSON.parse(await readFile(absolute, 'utf8'));
  const evidencePath = path.relative(process.cwd(), absolute).split(path.sep).join('/');
  const errors = validateEvidence(evidence, { ...options, evidencePath });
  let markdown = null;
  const markdownAbsolute = path.resolve(process.cwd(), evidence.markdownPath ?? '');
  const markdownRoot = path.resolve(process.cwd(), 'docs/agent-work') + path.sep;
  if (!markdownAbsolute.startsWith(markdownRoot)) {
    errors.push('markdownPath must remain within docs/agent-work');
  } else {
    try {
      markdown = await readFile(markdownAbsolute, 'utf8');
    } catch {
      errors.push('paired Markdown evidence file is missing');
    }
  }
  errors.push(...validateMarkdownEvidence(evidence, markdown));
  return { evidence, evidencePath, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  if (fileIndex < 0 || !args[fileIndex + 1]) {
    console.error('Usage: node tools/agent-evidence/evidence.mjs --file <path> [--repo <owner/name>]');
    process.exitCode = 2;
  } else {
    const repositoryIndex = args.indexOf('--repo');
    const repository = repositoryIndex < 0 ? undefined : args[repositoryIndex + 1];
    try {
      const { errors } = await validateEvidenceFile(args[fileIndex + 1], { repository });
      if (errors.length) {
        errors.forEach(error => console.error(`Invalid evidence: ${error}`));
        process.exitCode = 1;
      } else {
        console.log('Evidence schema valid.');
      }
    } catch (error) {
      console.error(`Unable to validate evidence: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
