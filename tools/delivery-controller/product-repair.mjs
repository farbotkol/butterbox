import { isSha } from './handoff.mjs';

const prefix = '<!-- butterbox-repair:v1 -->\n';
const bot = 41898282;
const workflowByCheck = {
  verify: 'ci.yml', database: 'ci.yml', 'database-smoke': 'fast-database-candidate.yml',
  'product-criteria': 'product-criteria.yml', targeted: 'change-aware-browser.yml',
};

export function repairDiagnostic(log) {
  const tail = log.slice(-120000);
  const lines = tail.split(/\r?\n/).filter(line => /(?:error|failed|failure|lint|expect\(|address already|assertion)/i.test(line))
    .slice(-35).map(line => line.replace(/(?:gh[pousr]_|github_pat_)[a-z0-9_]+|Bearer\s+\S+/gi, '[redacted]').slice(0, 350));
  return {
    infrastructure: /(?:port is already allocated|address already in use|EADDRINUSE)/i.test(tail),
    text: lines.join('\n'),
  };
}

export async function repairProduct({ gh, paged, lease, pr, checks, failure, confirm, logs, propose, publish, report }) {
  const head = pr.head.sha;
  const route = '/issues/' + lease.issue + '/comments';
  const previous = (await paged(route)).filter(row => row.user?.id === bot && row.body?.startsWith(prefix))
    .map(row => JSON.parse(row.body.slice(prefix.length))).filter(row => row.lease === lease.tagSha);
  if (previous.some(row => row.pr !== pr.number || !isSha(row.head) || !['infra', 'source'].includes(row.kind)))
    throw new Error('Ambiguous repair history');
  // A source mutation may have succeeded even if its response was lost.
  const interrupted = previous.find(row => row.kind === 'source' && row.head !== head &&
    !previous.some(next => next.head === head));
  const rows = checks.check_runs;
  const latest = Object.keys(workflowByCheck).map(name => rows.filter(row => row.name === name &&
    row.head_sha === head && row.app?.id === 15368).sort((a, b) => b.id - a.id)[0]).filter(Boolean);
  if (latest.some(row => row.status !== 'completed')) return 'waiting';
  const failed = latest.find(row => ['failure', 'timed_out', 'cancelled', 'startup_failure'].includes(row.conclusion));
  let run;
  let detail = { text: failure };
  if (failed) {
    const source = /^https:\/\/github\.com\/farbotkol\/butterbox\/actions\/runs\/(\d+)\/job\/(\d+)$/.exec(failed.html_url ?? '');
    if (!source) return 'unsafe';
    run = await gh('/actions/runs/' + source[1]);
    if (String(run.id) !== source[1] || run.head_sha !== head ||
        run.path !== '.github/workflows/' + workflowByCheck[failed.name]) return 'unsafe';
    if (run.status !== 'completed') return 'waiting';
    const job = await gh('/actions/jobs/' + source[2]);
    if (String(job.id) !== source[2] || job.run_id !== run.id || job.head_sha !== head ||
        job.name !== failed.name || job.conclusion !== failed.conclusion) return 'unsafe';
    detail = ['cancelled', 'startup_failure'].includes(failed.conclusion) ?
      { infrastructure: true } : repairDiagnostic(await logs(Number(source[2])));
  } else if (!failure && !interrupted) return 'waiting';
  const kind = detail.infrastructure || (!failure && interrupted && !failed) ? 'infra' : 'source';
  if (previous.filter(row => row.kind === kind).length >= (kind === 'source' ? 3 : 2)) return 'exhausted';
  if (kind === 'source' && !detail.text?.trim()) return 'unsafe';
  const changes = kind === 'source' ? await propose(detail.text) : null;
  if (kind === 'source' && !changes?.length) return 'unsafe';
  await confirm();
  const body = prefix + JSON.stringify({ lease: lease.tagSha, pr: pr.number, head, kind });
  const receipt = await gh(route, 'POST', { body });
  if (receipt.user?.id !== bot || receipt.body !== body) throw new Error('Repair reservation was not confirmed');
  if (kind === 'infra' && run && failed.conclusion !== 'cancelled') {
    await gh('/actions/runs/' + run.id + '/rerun-failed-jobs', 'POST');
  } else if (kind === 'source') {
    await confirm();
    await publish(changes);
  }
  if (kind === 'source' || !run || failed?.conclusion === 'cancelled') {
    for (const workflow of ['ci.yml', 'fast-database-candidate.yml', 'product-criteria.yml']) {
      await gh('/actions/workflows/' + workflow + '/dispatches', 'POST', { ref: pr.head.ref });
    }
  }
  report('PRODUCT_REPAIR #' + lease.issue + ' PR #' + pr.number + ' · ' + kind);
  return 'started';
}
