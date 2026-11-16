#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pullRequestAdvisories, pullRequestConflicts } from './component-coordination.mjs';

const shaPattern = /^[a-f0-9]{40}$/;

function runGh(args) {
  return execFileSync('gh', ['api', '--hostname', 'github.com', ...args], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function api(endpoint) {
  try { return JSON.parse(runGh([endpoint])); }
  catch { throw new Error('GitHub API response was unavailable or invalid; coordination fails closed.'); }
}

function paged(endpoint) {
  try {
    const pages = JSON.parse(runGh(['--paginate', '--slurp', endpoint]));
    if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) throw new Error();
    return pages.flat();
  } catch { throw new Error('GitHub pagination failed; coordination fails closed.'); }
}

function validPullRequest(pull, repository) {
  return pull && Number.isSafeInteger(pull.number) && pull.state === 'open' &&
    pull.base?.ref === 'copilot/Development' && pull.head?.repo?.full_name === repository &&
    shaPattern.test(pull.head.sha);
}

async function filesFor(pull, repository) {
  const rows = paged(`repos/${repository}/pulls/${pull.number}/files?per_page=100`);
  if (rows.some(row => typeof row?.filename !== 'string')) {
    throw new Error(`PR #${pull.number} file list is invalid; coordination fails closed.`);
  }
  const files = [];
  for (const row of rows) {
    if (row.previous_filename) files.push({ path: row.previous_filename });
    const file = { path: row.filename };
    if (row.filename.startsWith('supabase/migrations/') && row.filename.endsWith('.sql') &&
      row.status !== 'removed') {
      const filePath = row.filename.split('/').map(encodeURIComponent).join('/');
      const blob = api(`repos/${repository}/contents/${filePath}?ref=${pull.head.sha}`);
      if (blob?.encoding !== 'base64' || typeof blob.content !== 'string' || blob.content.length > 3_000_000) {
        throw new Error(`PR #${pull.number} migration content is unreadable; coordination fails closed.`);
      }
      file.content = Buffer.from(blob.content.replace(/\s/g, ''), 'base64').toString('utf8');
    }
    files.push(file);
  }
  return files;
}

async function pullRequests(repository) {
  const rows = paged(`repos/${repository}/pulls?state=open&per_page=100`);
  if (rows.length >= 1000) throw new Error('Open PR scan reached its safety limit; coordination fails closed.');
  return rows.filter(pull => pull.base?.ref === 'copilot/Development');
}

function explain(conflict) {
  if (conflict.reason === 'invalid_safety_critical_component_metadata') {
    return `PR #${conflict.pullRequest}: malformed safety-critical database ownership metadata. Correct the declaration and rerun coordination; this check fails closed until then.`;
  }
  if (conflict.reason === 'invalid_component_metadata') {
    return `PR #${conflict.pullRequest}: malformed component declaration. Correct the declaration and rerun coordination.`;
  }
  if (conflict.reason === 'invalid_changed_files') {
    return `PR #${conflict.pullRequest}: invalid or unreadable changed-file metadata. Restore valid GitHub API/file data and rerun coordination.`;
  }
  if (conflict.reason === 'no_changed_files') {
    return `PR #${conflict.pullRequest}: non-draft PR has no changed files. Push its implementation or convert/close it before rerunning coordination.`;
  }
  const reasons = [
    ...(conflict.paths ?? []).map(name => `shared file ${name}`),
    ...(conflict.database ?? []).map(name => `shared SQL object ${name}`),
    ...(conflict.reason ? [conflict.reason] : []),
  ];
  const resolution = (conflict.paths ?? []).some(name => name.startsWith('tests/'))
    ? 'Coordinate the test edits or validate their combined result at merge time, then rerun coordination.'
    : 'Coordinate the shared change, rebase or merge the PRs, then rerun coordination.';
  return `PR #${conflict.pullRequest}: ${reasons.join(', ') || 'invalid coordination metadata'}. ${resolution}`;
}

function explainAdvisory(advisory) {
  if (advisory.reason === 'invalid_peer_component_metadata') {
    return `[advisory] PR #${advisory.pullRequest} has malformed non-authoritative component metadata; the current API file list was used. Repair its declaration; unavailable or invalid API data still fails closed.`;
  }
  if (advisory.reason === 'peer_no_changed_files') {
    return `[advisory] PR #${advisory.pullRequest} is an empty non-draft PR and is not treated as an overlap; add its changed files or convert/close it.`;
  }
  return `[advisory] PR #${advisory.pullRequest} shares broad component labels ${advisory.components.join(', ')}; labels alone do not block. Review combined behavior and rely on merge-time validation where safe.`;
}

function reportAdvisories(candidate, others) {
  for (const advisory of pullRequestAdvisories(candidate, others)) {
    console.log(explainAdvisory(advisory));
  }
}

async function currentPullRequest(event, repository) {
  const number = event.pull_request?.number;
  if (!Number.isSafeInteger(number)) throw new Error('Pull request event did not include a valid PR number.');
  const pull = api(`repos/${repository}/pulls/${number}`);
  if (pull.state !== 'open') return null;
  if (!validPullRequest(pull, repository)) {
    throw new Error(`PR #${number} is not an open same-repository Development PR.`);
  }
  pull.files = await filesFor(pull, repository);
  return pull;
}

async function mergeGroupPullRequests(event, openPulls, repository) {
  const head = event.merge_group?.head_sha;
  if (!shaPattern.test(head ?? '')) throw new Error('Merge-group head is invalid; coordination fails closed.');
  const included = [];
  for (const pull of openPulls) {
    if (!validPullRequest(pull, repository)) throw new Error('Open PR metadata is invalid; coordination fails closed.');
    const comparison = api(`repos/${repository}/compare/${pull.head.sha}...${head}`);
    if (comparison.status === 'identical' || comparison.status === 'ahead') {
      pull.files = await filesFor(pull, repository);
      included.push(pull);
    }
  }
  if (!included.length) throw new Error('Merge-group did not identify an open Development PR; coordination fails closed.');
  return included;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be owner/name.');
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const openPulls = await pullRequests(repository);
  if (event.pull_request) {
    const candidate = await currentPullRequest(event, repository);
    if (!candidate) {
      console.log('PR is no longer open; no active coordination reservation remains.');
      return;
    }
    const others = [];
    for (const pull of openPulls) {
      if (pull.number === candidate.number) continue;
      if (!validPullRequest(pull, repository)) throw new Error('Open PR metadata is invalid; coordination fails closed.');
      pull.files = await filesFor(pull, repository);
      others.push(pull);
    }
    reportAdvisories(candidate, others);
    const conflicts = pullRequestConflicts(candidate, others);
    if (conflicts.length) throw new Error(`PR #${candidate.number} conflicts with active PRs:\n` +
      conflicts.map(explain).join('\n'));
    console.log(`PR #${candidate.number} has no hard shared-file or SQL-object conflicts.`);
    return;
  }

  if (!event.merge_group) throw new Error('Expected pull_request_target or merge_group event.');
  const included = await mergeGroupPullRequests(event, openPulls, repository);
  const outside = [];
  for (const pull of openPulls) {
    if (included.some(candidate => candidate.number === pull.number)) continue;
    if (!validPullRequest(pull, repository)) throw new Error('Open PR metadata is invalid; coordination fails closed.');
    pull.files = await filesFor(pull, repository);
    outside.push(pull);
  }
  const conflicts = [];
  for (let index = 0; index < included.length; index++) {
    const candidate = included[index];
    const peers = [...included.slice(0, index), ...included.slice(index + 1), ...outside];
    reportAdvisories(candidate, peers);
    conflicts.push(...pullRequestConflicts(candidate, peers));
  }
  if (conflicts.length) throw new Error(`Merge group conflicts with active PRs:\n${conflicts.map(explain).join('\n')}`);
  console.log(`Merge group of PRs ${included.map(pull => `#${pull.number}`).join(', ')} has no hard shared-file or SQL-object conflicts.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
