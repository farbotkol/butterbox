import { parseAcceptanceCriteria, isManagedFile } from '../agent-evidence/evidence.mjs';
import { isSha } from './handoff.mjs';

const pathPattern = /^(?:src|tests|docs|public|supabase\/migrations)\/[a-zA-Z0-9_./-]+$/;
export const validPath = path => typeof path === 'string' && pathPattern.test(path) &&
  !path.split('/').some(part => part === '.' || part === '..' || !part) && !isManagedFile(path) && !/^(?:src\/(?:middleware|proxy)\.|docs\/agent-work\/|tests\/(?:delivery-controller|agent-evidence|ci-repair|phase2))/i.test(path);
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/') ||
  (a.startsWith('supabase/') && b.startsWith('supabase/'));

export function productScope(issue, plannedPaths) {
  // Reconciliation appends an audit record, not new authorised scope or criteria.
  // Only closed completed issues may use the original body for replay; acceptance
  // still independently verifies the digest, closure actor, evidence and writer.
  const body = issue.state === 'closed' && issue.state_reason === 'completed'
    ? (issue.body ?? '').split('\n\n<!-- butterbox-autonomy-reconciled:v1 -->')[0]
    : (issue.body ?? '');
  const sections = [...body.matchAll(/^##[ \t]+Autonomy scope[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]|$(?![\s\S]))/gim)];
  const paths = sections.length ? sections[0][1].trim().split(/\r?\n/)
    .map(line => /^- `([^`]+)`$/.exec(line.trim())?.[1]?.replace(/\/$/, '')) : plannedPaths;
  const criteria = parseAcceptanceCriteria(body).map(row => row.description);
  if (!criteria.length && body.trim()) criteria.push(issue.title + '\n' + body.trim());
  return sections.length <= 1 && Array.isArray(paths) && paths.length > 0 && paths.length <= 30 &&
    paths.every(validPath) && new Set(paths).size === paths.length && criteria.length > 0 ?
    { paths, criteria: [...new Set(criteria)], issue: issue.number } : null;
}

export function changedPaths(files) {
  if (!Array.isArray(files) || !files.length || files.length >= 300 ||
      new Set(files.map(file => file.filename)).size !== files.length) throw new Error('Incomplete work-area diff');
  return files.flatMap(file => {
    if (typeof file.filename !== 'string' || !file.filename ||
        !['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'].includes(file.status) ||
        (['renamed', 'copied'].includes(file.status) && !file.previous_filename))
      throw new Error('Unverifiable changed path');
    return file.previous_filename ? [file.filename, file.previous_filename] : [file.filename];
  });
}

export function scopedProductFiles(scope, files) {
  const paths = changedPaths(files);
  if (!paths.every(path => validPath(path) &&
      scope.paths.some(area => path === area || path.startsWith(area + '/'))) ||
      !paths.some(path => /^(src|public|supabase|docs)\//.test(path)))
    throw new Error('Product PR changes paths outside its approved scope or lacks a product change');
  return paths;
}

export async function readProductDiff(paged, gh, pr) {
  const files = await paged('/pulls/' + pr.number + '/files');
  const fresh = await gh('/pulls/' + pr.number);
  if (fresh.number !== pr.number || fresh.head?.sha !== pr.head?.sha ||
      fresh.state !== pr.state || fresh.base?.ref !== 'copilot/Development' ||
      fresh.changed_files !== files.length) throw new Error('PR changed during work-area verification');
  changedPaths(files);
  return files;
}

export async function conflictsWithProduct(paged, gh, prs, scope, own) {
  for (const row of prs) {
    if (row.number === own) continue;
    if (scope.issue && new RegExp('(?:^|[^0-9])#' + scope.issue + '(?![0-9])').test(row.body ?? ''))
      return row.number;
    const pr = await gh('/pulls/' + row.number);
    if (pr.number !== row.number || pr.state !== 'open' || pr.head?.sha !== row.head?.sha ||
        pr.base?.ref !== 'copilot/Development') throw new Error('Open PR changed during work-area verification');
    const paths = changedPaths(await readProductDiff(paged, gh, pr));
    if (paths.some(file => scope.paths.some(area => overlaps(file, area)))) return pr.number;
  }
  return null;
}

export function sameSquashFiles(left, right) {
  const signature = files => JSON.stringify(files.map(file =>
    [file.filename, file.previous_filename ?? null, file.status, file.sha]).sort());
  return Array.isArray(right) && left.length === right.length &&
    left.every(file => isSha(file.sha)) && signature(left) === signature(right);
}
