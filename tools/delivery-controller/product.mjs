import { parseAcceptanceCriteria, hasCanonicalIssueApproval, isManagedFile } from '../agent-evidence/evidence.mjs';
import { isSha } from './handoff.mjs';

const pathPattern = /^(?:src|tests|docs|public|supabase\/migrations)\/[a-zA-Z0-9_./-]+$/;
const validPath = path => typeof path === 'string' && pathPattern.test(path) &&
  !path.split('/').some(part => part === '.' || part === '..' || !part) && !isManagedFile(path);
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/') ||
  (a.startsWith('supabase/') && b.startsWith('supabase/'));

export function productScope(issue) {
  if (!/^\s*(?:\[BB-[A-Z0-9-]+\]|BB-[A-Z0-9-]+\b)/i.test(issue.title ?? '')) return null;
  const sections = [...(issue.body ?? '').matchAll(/^##[ \t]+Autonomy scope[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]|$(?![\s\S]))/gim)];
  const lines = sections[0]?.[1].trim().split(/\r?\n/) ?? [];
  const paths = lines.map(line => /^- `([^\x60]+)`$/.exec(line.trim())?.[1]?.replace(/\/$/, ''));
  const criteria = parseAcceptanceCriteria(issue.body).map(row => row.description);
  return sections.length === 1 && paths.length > 0 && paths.length <= 30 &&
    paths.every(validPath) && new Set(paths).size === paths.length && criteria.length > 0 &&
    new Set(criteria).size === criteria.length ? { paths, criteria, issue: issue.number } : null;
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
      !paths.some(path => /^(src|public|supabase)\//.test(path)))
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

export function productReview(reviews, head, issueNumber, criteria, ownerId, boundary, scopeDigest) {
  const blocking = ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'];
  const review = reviews.filter(row => row.user?.id === ownerId && blocking.includes(row.state))
    .sort((a, b) => b.id - a.id)[0];
  if (!review || !Number.isSafeInteger(review.id) || !isSha(head) ||
      !(Date.parse(review.submitted_at) <= boundary) ||
      !hasCanonicalIssueApproval([review], head, issueNumber, 'farbotkol')) return null;
  const lines = (review.body ?? '').split(/\r?\n/);
  if (!lines.includes('Acceptance scope: ' + scopeDigest)) return null;
  const accepted = lines.filter(line => line.startsWith('Criterion '));
  if (accepted.length !== criteria.length ||
      !criteria.every((_, index) => accepted[index]?.startsWith('Criterion ' + (index + 1) + ' PASS: ') &&
        accepted[index].slice(('Criterion ' + (index + 1) + ' PASS: ').length).trim().length > 0)) return null;
  return review;
}

export function sameSquashFiles(left, right) {
  const signature = files => JSON.stringify(files.map(file =>
    [file.filename, file.previous_filename ?? null, file.status, file.sha]).sort());
  return Array.isArray(right) && left.length === right.length &&
    left.every(file => isSha(file.sha)) && signature(left) === signature(right);
}
