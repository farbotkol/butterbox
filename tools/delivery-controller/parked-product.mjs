import { assessHandoff, development, isSha } from './handoff.mjs';
import { readLease } from './lease.mjs';
import { readLeaseCandidates } from './task-inventory.mjs';
import { readProductDiff, scopedProductFiles } from './product.mjs';

const prefix = '<!-- butterbox-recovery-source:v1 -->\n';
const bot = 41898282;

export async function recordRecoverySource({ gh, paged, leaseApi, tasksApi, issue, expected, scope, repository, repairBusy }) {
  const current = await leaseApi.getRef('refs/tags/butterbox-controller-parked-' + issue.number);
  if (current?.object?.type !== 'tag' || current.object.sha !== expected)
    throw new Error('Parked source tag changed');
  const tag = await leaseApi.getTag(expected);
  const record = JSON.parse(tag.message);
  if (tag.sha !== expected || tag.tag !== 'butterbox-controller-parked-' + issue.number || record.issue !== issue.number || record.action !== 'PARK_VERIFIED')
    throw new Error('Parked source identity changed');
  if (!record.taskUrl || record.blocker !== 'closed-unmerged') return;
  const match = /^https:\/\/github\.com\/farbotkol\/butterbox\/pull\/([1-9]\d*)$/.exec(record.taskUrl);
  if (!match || tag.object?.type !== 'commit' || !isSha(tag.object.sha)) throw new Error('Malformed parked source');
  const number = Number(match[1]);
  const pr = await gh('/pulls/' + number);
  if (pr.number !== number || pr.state !== 'closed' || pr.merged !== false || pr.auto_merge !== null ||
      pr.base?.ref !== development || pr.base.repo?.full_name !== repository ||
      pr.head?.repo?.full_name !== repository || !pr.head?.ref?.startsWith('copilot/') || !isSha(pr.head.sha))
    throw new Error('Parked PR identity cannot be verified');
  const tasks = await readLeaseCandidates(tasksApi, record, { exactTaskId: record.taskId, stable: true });
  const openPRs = await paged('/pulls?state=open&base=copilot%2FDevelopment');
  const handoff = assessHandoff({ lease: record, tasks, openPRs, issue, product: true });
  if (!['VERIFY_PR', 'VERIFY_PARK_PR'].includes(handoff.action) || handoff.task.id !== record.taskId ||
      ![pr.id, pr.number].includes(handoff.artifact) ||
      !handoff.task.sessions.some(session => session.head_ref === pr.head.ref) ||
      openPRs.some(candidate => candidate.head?.ref === pr.head.ref) ||
      await repairBusy() || await readLease(leaseApi))
    throw new Error('Parked PR writer cannot be proven stopped');
  scopedProductFiles(scope, await readProductDiff(paged, gh, pr));
  const comparison = await gh('/compare/' + tag.object.sha + '...' + pr.head.sha + '?per_page=1');
  if (comparison.status !== 'ahead' || comparison.merge_base_commit?.sha !== tag.object.sha)
    throw new Error('Parked implementation base cannot be verified');
  const body = prefix + JSON.stringify({ issue: issue.number, pr: number, base: tag.object.sha, head: pr.head.sha });
  const route = '/issues/' + issue.number + '/comments';
  if (!(await paged(route)).some(row => row.user?.id === bot && row.body === body)) {
    const saved = await gh(route, 'POST', { body });
    if (saved.user?.id !== bot || saved.body !== body) throw new Error('Parked source was not recorded');
  }
}

export async function recoveryInstructions(paged, issue) {
  const row = (await paged('/issues/' + issue + '/comments')).filter(comment =>
    comment.user?.id === bot && comment.body?.startsWith(prefix)).at(-1);
  if (!row) return null;
  const source = JSON.parse(row.body.slice(prefix.length));
  if (source.issue !== issue || !Number.isSafeInteger(source.pr) || !isSha(source.base) || !isSha(source.head))
    throw new Error('Invalid recorded recovery source');
  return 'Reuse the existing implementation from closed PR #' + source.pr + ' using the Git diff from ' +
    source.base + ' to ' + source.head + '. Apply the scoped changes to this new leased branch and fix verified failures. ' +
    'Leave the original branch and closed PR intact.';
}
