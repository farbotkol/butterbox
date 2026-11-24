// Conservative evidence gate for a Development tip that moved after agent launch.
// This module deliberately does not change the durable lease or authorize a merge.
import { isSha } from './handoff.mjs';

export function assessDevelopmentDrift({ pinnedSha, currentSha, comparison, proofPath }) {
  if (!isSha(pinnedSha) || !isSha(currentSha) ||
      typeof proofPath !== 'string' || !proofPath.startsWith('docs/agent-work/')) {
    throw new Error('Invalid development drift evidence');
  }
  if (pinnedSha === currentSha) return { kind: 'unchanged', safe: true };
  if (!comparison || comparison.status !== 'ahead' ||
      comparison.base_commit?.sha !== pinnedSha ||
      comparison.merge_base_commit?.sha !== pinnedSha ||
      comparison.too_large === true ||
      !Number.isSafeInteger(comparison.total_commits) || comparison.total_commits !== comparison.ahead_by ||
      comparison.ahead_by > 100 ||
      !Number.isSafeInteger(comparison.ahead_by) || comparison.ahead_by < 1 ||
      !Array.isArray(comparison.files) || !Array.isArray(comparison.commits) ||
      comparison.commits.length !== comparison.ahead_by ||
      comparison.commits.at(-1)?.sha !== currentSha ||
      comparison.files.length >= 300 ||
      comparison.files.some(file => !['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'].includes(file.status)) ||
      comparison.files.some(file => typeof file.filename !== 'string' ||
        file.filename === proofPath || file.previous_filename === proofPath)) {
    return { kind: 'blocked', safe: false, reason: 'Development drift ancestry, completeness or proof path is unverified' };
  }
  return {
    kind: 'candidate', safe: false, // A candidate is NOT authorization to promote or merge.
    reason: 'Ancestry and proof-path isolation passed; remaining live checks are required',
    interveningCommits: comparison.ahead_by,
  };
}
