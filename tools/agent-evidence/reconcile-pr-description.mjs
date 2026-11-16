import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  canonicalIssueNumber,
  evidenceIsComplete,
  evidenceMarkdownPath,
  evidencePathIdentity,
  getEvidencePathFromPullRequest,
  hasCanonicalIssueApproval,
  parseAcceptanceCriteria,
  referencesCanonicalIssue,
  validateMarkdownEvidence,
  validateRepositoryEvidence,
} from './evidence.mjs';

const SHA = /^[a-f0-9]{40}$/i;
const MAX_REPAIRS_PER_HEAD = 2;

function assertRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be owner/name');
  }
}

function parsePages(output) {
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed.flat() : parsed;
}

function bodyContent(body) {
  let fenced = false;
  return String(body ?? '').split(/\r?\n/).filter(line => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced && !/^\s*>/.test(line);
  }).join('\n');
}

function repairState(body, headSha) {
  const content = bodyContent(body);
  const starts = [...content.matchAll(/<!--\s*butterbox-pr-description-reconciled:/gi)];
  const markers = [...content.matchAll(/<!--\s*butterbox-pr-description-reconciled:v1:([a-f0-9]{40}):(\d+)\s*-->/gi)];
  if (starts.length !== markers.length || markers.length > 1) {
    return { error: 'malformed or duplicate reconciliation marker' };
  }
  if (!markers.length || markers[0][1] !== headSha) return { count: 0 };
  return { count: Number(markers[0][2]) };
}

function closeFooter(body, repository) {
  const lines = String(body ?? '').split(/\r?\n/);
  let index = lines.length - 1;
  while (index >= 0 && !lines[index].trim()) index--;
  if (index < 0) return null;
  const parsed = autoCloseLine(lines[index], repository);
  return parsed ? { index, issueNumber: parsed.issueNumber, lines } : null;
}

function autoCloseLine(line, repository) {
  const match = /^(\s*(?:>\s*)*)([-*]\s+)?(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(\S+\/\S+))?#(\d+)\s*$/i
    .exec(line);
  if (!match || (match[4] && match[4].toLowerCase() !== repository.toLowerCase())) return null;
  return {
    issueNumber: Number(match[5]),
    prefix: match[1],
    bullet: match[2] ?? '',
    verb: match[3],
    repository: match[4] ?? '',
  };
}

function knownAutoCloseLines(body, repository) {
  let fenced = false;
  return String(body ?? '').split(/\r?\n/).flatMap((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced) return [];
    const parsed = autoCloseLine(line, repository);
    return parsed ? [{ ...parsed, index }] : [];
  });
}

function discoverIssue(body, repository) {
  const text = String(body ?? '');
  const content = bodyContent(text);
  const markerStarts = [...content.matchAll(/<!--\s*butterbox-issue:/gi)];
  const markerMatches = [...content.matchAll(/<!--\s*butterbox-issue:\s*(\d+)\s*-->/gi)];
  if (markerStarts.length !== markerMatches.length) return { error: 'malformed canonical issue marker' };

  const numbers = new Set(markerMatches.map(match => Number(match[1])));
  const references = [...content.matchAll(/\b(?:Refs|Related to)\s+#(\d+)\b/gi)];
  for (const reference of references) numbers.add(Number(reference[1]));
  const footer = closeFooter(text, repository);
  if (footer) numbers.add(footer.issueNumber);
  if (numbers.size === 0) return { error: 'no canonical issue link in PR body' };
  if (numbers.size !== 1) return { error: 'multiple issue links in PR body' };
  return { issueNumber: [...numbers][0], footer };
}

function evidenceMarkers(body) {
  const text = bodyContent(body);
  const markerStarts = [...text.matchAll(/<!--\s*butterbox-evidence:/gi)];
  const markerMatches = [...text.matchAll(/<!--\s*butterbox-evidence:\s*(\S+)\s*-->/gi)];
  return {
    malformed: markerStarts.length !== markerMatches.length,
    paths: markerMatches.map(match => match[1]),
  };
}

function evidencePathFromFiles(files, issueNumber, pullNumber) {
  const candidates = files.filter(file => {
    const identity = evidencePathIdentity(file);
    return identity?.issueNumber === issueNumber && identity.pullNumber === pullNumber &&
      files.includes(evidenceMarkdownPath(file));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export function reconcileDescriptionBody({
  body,
  repository,
  issueNumber,
  pullNumber,
  changedFiles = [],
  fullyAccepted = false,
  headSha = null,
  repairsForHead = 0,
}) {
  const discovered = discoverIssue(body, repository);
  if (discovered.error) return { status: 'blocked', reason: discovered.error };
  if (discovered.issueNumber !== issueNumber) {
    return { status: 'blocked', reason: 'PR body issue does not match the verified linked issue' };
  }

  const original = String(body ?? '');
  const lines = original.split(/\r?\n/);
  const content = bodyContent(original);
  const refs = [...content.matchAll(/\b(?:Refs|Related to)\s+#(\d+)\b/gi)];
  const markerMatches = [...content.matchAll(/<!--\s*butterbox-issue:\s*(\d+)\s*-->/gi)];
  const footer = closeFooter(original, repository);
  let removedFooter = false;
  if (!fullyAccepted) {
    const closeLines = knownAutoCloseLines(original, repository)
      .filter(line => line.issueNumber === issueNumber);
    for (const closeLine of closeLines.sort((left, right) => right.index - left.index)) {
      if (closeLine.index === footer?.index) {
        lines.splice(closeLine.index, 1);
      } else {
        const reference = closeLine.repository ? `${closeLine.repository}#${issueNumber}` : `#${issueNumber}`;
        lines[closeLine.index] = `${closeLine.prefix}${closeLine.bullet}Refs ${reference}`;
      }
      removedFooter = true;
    }
  }
  if (!refs.some(reference => Number(reference[1]) === issueNumber)) {
    lines.unshift(`Refs #${issueNumber}`);
  } else if (!refs.some(reference => reference[0].toLowerCase().startsWith('refs'))) {
    lines.unshift(`Refs #${issueNumber}`);
  }
  if (!markerMatches.some(marker => Number(marker[1]) === issueNumber)) {
    lines.unshift(`<!-- butterbox-issue: ${issueNumber} -->`);
  }

  const markers = evidenceMarkers(original);
  if (!markers.malformed && markers.paths.length === 0) {
    const evidencePath = evidencePathFromFiles(changedFiles, issueNumber, pullNumber);
    if (evidencePath) lines.unshift(`<!-- butterbox-evidence: ${evidencePath} -->`);
  }

  let nextBody = lines.join('\n');
  if (nextBody !== original && repairsForHead >= MAX_REPAIRS_PER_HEAD) {
    return { status: 'blocked', reason: 'per-head description repair limit reached' };
  }
  if (nextBody !== original && headSha) {
    const stateLine = /^\s*<!--\s*butterbox-pr-description-reconciled:v1:[a-f0-9]{40}:\d+\s*-->\s*$/i;
    const stableLines = nextBody.split(/\r?\n/).filter(line => !stateLine.test(line));
    const state = `<!-- butterbox-pr-description-reconciled:v1:${headSha}:${repairsForHead + 1} -->`;
    nextBody = `${stableLines.join('\n')}\n\n${state}`;
  }
  return {
    status: nextBody === original ? 'unchanged' : 'updated',
    body: nextBody,
    issueNumber,
    removedFooter,
  };
}

export function isEligiblePullRequest(pullRequest, repository) {
  const ownerLogin = repository?.split('/')[0]?.toLowerCase();
  return Boolean(pullRequest &&
    pullRequest.state === 'open' &&
    !pullRequest.merged &&
    !pullRequest.merged_at &&
    pullRequest.base?.ref === 'copilot/Development' &&
    pullRequest.head?.ref?.startsWith('copilot/') &&
    pullRequest.head?.repo?.full_name === repository &&
    pullRequest.user?.login?.toLowerCase() === ownerLogin &&
    Number.isSafeInteger(pullRequest.number) &&
    pullRequest.number > 0 &&
    SHA.test(pullRequest.head?.sha ?? ''));
}

async function fullyAcceptedDelivery({ repository, pullRequest, issue, body, changedFiles, api }) {
  const issueNumber = issue.number;
  const evidencePath = getEvidencePathFromPullRequest(body, issueNumber, pullRequest.number);
  if (!evidencePath || !referencesCanonicalIssue(body, issueNumber) ||
      canonicalIssueNumber(body) !== issueNumber) return false;

  const [evidence, markdown, reviews] = await Promise.all([
    api.getEvidence(evidencePath, pullRequest.head.sha),
    api.getMarkdown(evidenceMarkdownPath(evidencePath), pullRequest.head.sha),
    api.getPullRequestReviews(pullRequest.number),
  ]);
  if (!evidence || !markdown) return false;
  const acceptanceCriteria = parseAcceptanceCriteria(issue.body).map(item => item.description.trim());
  const errors = validateRepositoryEvidence(evidence, {
    repository,
    issueNumber,
    pullNumber: pullRequest.number,
    headSha: pullRequest.head.sha,
    changedFiles,
    evidencePath,
    acceptanceCriteria,
  });
  if (errors.length || validateMarkdownEvidence(evidence, markdown).length) return false;
  return evidenceIsComplete(evidence, changedFiles, acceptanceCriteria) &&
    hasCanonicalIssueApproval(reviews, pullRequest.head.sha, issueNumber, repository.split('/')[0]);
}

export async function reconcilePullRequestDescription({ repository, pullRequest, api }) {
  assertRepository(repository);
  const number = pullRequest?.number;
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Pull request number is invalid');

  const current = await api.getPullRequest(number);
  if (!isEligiblePullRequest(current, repository)) {
    return { pullNumber: number, status: 'skipped', reason: 'PR is not an eligible open Copilot PR' };
  }

  const discovered = discoverIssue(current.body, repository);
  if (discovered.error) {
    return { pullNumber: number, status: 'skipped', reason: discovered.error };
  }
  const state = repairState(current.body, current.head.sha);
  if (state.error) {
    return { pullNumber: number, status: 'skipped', reason: state.error };
  }
  const issue = await api.getIssue(discovered.issueNumber);
  if (!issue || issue.pull_request || issue.state !== 'open') {
    return { pullNumber: number, status: 'skipped', reason: 'canonical issue is missing, closed, or not an issue' };
  }
  if (!await api.isIssueLinkedToPullRequest(issue.number, number)) {
    return { pullNumber: number, status: 'skipped', reason: 'GitHub has no verified issue-to-PR cross-reference' };
  }

  const changedFiles = (await api.getFiles(number)).map(file => file.filename);
  let fullyAccepted = false;
  if (knownAutoCloseLines(current.body, repository).some(line => line.issueNumber === issue.number)) try {
    const candidateBody = reconcileDescriptionBody({
      body: current.body,
      repository,
      issueNumber: issue.number,
      pullNumber: number,
      changedFiles,
      fullyAccepted: true,
      headSha: current.head.sha,
      repairsForHead: state.count,
    });
    fullyAccepted = await fullyAcceptedDelivery({
      repository,
      pullRequest: current,
      issue,
      body: candidateBody.body ?? current.body,
      changedFiles,
      api,
    });
  } catch {
    throw new Error(`Could not verify complete evidence for PR #${number}; reconciliation failed closed`);
  }

  const result = reconcileDescriptionBody({
    body: current.body,
    repository,
    issueNumber: issue.number,
    pullNumber: number,
    changedFiles,
    fullyAccepted,
    headSha: current.head.sha,
    repairsForHead: state.count,
  });
  if (result.status !== 'updated') {
    return { pullNumber: number, status: result.status, reason: result.reason, issueNumber: issue.number };
  }

  const latest = await api.getPullRequest(number);
  if (!isEligiblePullRequest(latest, repository) ||
      latest.body !== current.body ||
      latest.updated_at !== current.updated_at ||
      latest.head.sha !== current.head.sha) {
    return {
      pullNumber: number,
      status: 'skipped',
      reason: 'PR changed concurrently; no body update was made',
      issueNumber: issue.number,
    };
  }

  await api.updatePullRequestBody(number, result.body);
  return {
    pullNumber: number,
    status: 'updated',
    issueNumber: issue.number,
    removedAutoCloseFooter: result.removedFooter,
    verifyRerunExpected: true,
  };
}

export function createGitHubApi({
  repository,
  token = process.env.GH_TOKEN,
  run = (args, input) => execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    env: { ...process.env, GH_TOKEN: token },
    maxBuffer: 20 * 1024 * 1024,
  }),
} = {}) {
  assertRepository(repository);
  if (!token) throw new Error('GH_TOKEN is required');

  const api = (path, method, body) => {
    const args = ['api', '--hostname', 'github.com'];
    if (method) args.push('--method', method);
    args.push(path);
    if (body !== undefined) args.push('--input', '-');
    return JSON.parse(run(args, body === undefined ? undefined : `${JSON.stringify(body)}\n`));
  };
  const pages = path => parsePages(run([
    'api', '--hostname', 'github.com', '--paginate', '--slurp', path,
  ]));
  const content = async (path, ref) => {
    try {
      const response = api(`repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return Buffer.from(response.content, 'base64').toString('utf8');
    } catch (error) {
      if (/HTTP 404|Not Found/i.test(error.stderr?.toString?.() ?? error.message)) return null;
      throw error;
    }
  };

  return {
    getPullRequest: number => api(`repos/${repository}/pulls/${number}`),
    getIssue: number => api(`repos/${repository}/issues/${number}`),
    isIssueLinkedToPullRequest: async (issueNumber, pullNumber) => pages(
      `repos/${repository}/issues/${issueNumber}/timeline?per_page=100`,
    ).some(event =>
      event.event === 'cross-referenced' &&
      event.source?.issue?.number === pullNumber &&
      Boolean(event.source.issue.pull_request)),
    getFiles: number => pages(`repos/${repository}/pulls/${number}/files?per_page=100`),
    getPullRequestReviews: number => pages(`repos/${repository}/pulls/${number}/reviews?per_page=100`),
    getEvidence: async (path, ref) => {
      const raw = await content(path, ref);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return { _invalidEvidenceJson: true };
      }
    },
    getMarkdown: content,
    updatePullRequestBody: (number, body) => api(
      `repos/${repository}/pulls/${number}`,
      'PATCH',
      { body },
    ),
  };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  assertRepository(repository);
  let pullNumber = 'unknown';
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    pullNumber = event.pull_request?.number ?? pullNumber;
    const result = await reconcilePullRequestDescription({
      repository,
      pullRequest: event.pull_request,
      api: createGitHubApi({ repository }),
    });
    const action = result.removedAutoCloseFooter ? 'normalized generated auto-close wording' : result.status;
    console.log(`PR #${result.pullNumber}: ${action}${result.issueNumber ? ` for issue #${result.issueNumber}` : ''}` +
      `${result.reason ? ` (${result.reason})` : ''}` +
      `${result.verifyRerunExpected ? '; GitHub edited event will rerun Verify' : ''}`);
  } catch (error) {
    const text = `${error?.stderr?.toString?.() ?? ''} ${error?.message ?? ''}`;
    const status = text.match(/HTTP\s+\d{3}/i)?.[0] ?? 'GitHub/API error';
    const detail = /rate limit/i.test(text) ? '; rate limit encountered' : '';
    console.error(`PR #${pullNumber}: reconciliation failed closed (${status}${detail})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch(() => {
    console.error('PR description reconciliation failed closed before the PR could be identified');
    process.exitCode = 1;
  });
}
