const comments = '/issues/327/comments';
const prefix = '<!-- butterbox-factory-health:v1 -->\n';
const actionsBot = 41898282;
const minute = 60000;
const retryLimit = 5;

function deadline(error, now) {
  const header = error.retryAfter;
  const retryAfter = /^\d+$/.test(header ?? '') ? now + Number(header) * 1000 : Date.parse(header);
  const reset = /^\d+$/.test(error.rateLimitReset ?? '') ? Number(error.rateLimitReset) * 1000 : 0;
  return Math.max(Number.isSafeInteger(retryAfter) ? retryAfter : 0, Number.isSafeInteger(reset) ? reset : 0);
}

export async function withFactoryHealth({ gh, paged, probe, advance, report, revision, now = Date.now }) {
  const history = (await paged(comments)).filter(row => row.user?.id === actionsBot && row.body?.startsWith(prefix))
    .sort((a, b) => b.id - a.id);
  let prior;
  if (history.length) {
    const last = history[0];
    if (!Number.isSafeInteger(last.id) || last.created_at !== last.updated_at)
      throw new Error('Unverified factory health checkpoint');
    prior = JSON.parse(last.body.slice(prefix.length));
    if (!Number.isInteger(prior.attempt) || prior.attempt < 0 || prior.attempt > retryLimit + 1 ||
        !Number.isSafeInteger(prior.nextAt) || typeof prior.revision !== 'string' ||
        !['healthy', 'integration', 'permission', 'request'].includes(prior.category))
      throw new Error('Invalid factory health checkpoint');
  }
  const save = async state => {
    const body = prefix + JSON.stringify({ ...state, revision });
    const row = await gh(comments, 'POST', { body });
    if (row.user?.id !== actionsBot || row.body !== body || !Number.isSafeInteger(row.id) ||
        row.created_at !== row.updated_at) throw new Error('Could not confirm factory health checkpoint');
  };
  // Earlier controllers recorded native merge rejections as factory requests.
  const legacyMerge = prior?.category === 'request' &&
    /^GitHub PUT HTTP (405|409|422) for \/pulls\/\d+\/merge · /.test(prior.reason ?? '');
  const unhealthy = prior && prior.category !== 'healthy' && !legacyMerge;
  const open = unhealthy && (prior.attempt >= retryLimit || prior.category !== 'integration');
  const stalePublishDelay = unhealthy && prior.revision !== revision && prior.attempt === 1 &&
    prior.category === 'integration' && prior.reason?.startsWith(
      'GitHub publish repair HTTP 200 for /graphql · branch-verification/unconfirmed');
  if (unhealthy && !stalePublishDelay && now() < prior.nextAt) {
    report((open ? 'FACTORY_BLOCKED' : 'FACTORY_RETRY_SCHEDULED') + ' · ' + prior.category +
      ' · attempt ' + prior.attempt + ' · reassess ' + new Date(prior.nextAt).toISOString());
    return false;
  }
  const failed = async (error, healthCheck) => {
    if (!['CONTROLLER_API', 'COPILOT_TASK_GET', 'COPILOT_TASK_POST'].includes(error.code)) throw error;
    const category = error.category ?? 'integration';
    const attempt = Math.min(retryLimit + 1, ((unhealthy && prior.revision === revision) ? prior.attempt : 0) + 1);
    const time = now();
    const nextAt = Math.max(time + Math.min(60, 2 ** attempt) * minute, deadline(error, time));
    await save({ attempt, nextAt, category, stage: healthCheck ? 'health-probe' : 'delivery-cycle',
      reason: error.message.slice(0, 500) });
    report((attempt >= retryLimit || category !== 'integration' ? 'FACTORY_BLOCKED' : 'FACTORY_RETRY') +
      ' · attempt ' + attempt + ' · reassess ' + new Date(nextAt).toISOString() + ' · ' + error.message);
  };
  if (open) {
    try {
      await probe(prior.category);
    } catch (error) {
      await failed(error, true);
      return false;
    }
  }
  try {
    await advance();
  } catch (error) {
    await failed(error, false);
    return false;
  }
  if (unhealthy || legacyMerge) {
    await save({ attempt: 0, nextAt: 0, category: 'healthy' });
    report('FACTORY_HEALTH_RESTORED');
  }
  return true;
}
