import { responseFailure } from './api-response.mjs';
// GitHub Copilot cloud tasks public-preview API; requires user-to-server credential.
export const WRITER_STATES = Object.freeze(['queued', 'in_progress', 'waiting_for_user']);
export function agentTasksApi({token,repository,request=fetch,report=message=>console.error(message),
  now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??'')) throw new Error('Copilot user token and repository required');
  const root='https://api.github.com/agents/repos/'+repository+'/tasks';
  const counts = { LIST_TASKS: 0, GET_TASK_DETAIL: 0, CREATE_TASK: 0 };
  let sequence = 0;
  // One shared queue and quota clock for all Copilot operations, including concurrent callers.
  let tail = Promise.resolve(), resetAt = 0, waited = 0, generation = 0;
  async function waitForQuota() {
    const delay = resetAt - now();
    if (delay <= 0) return;
    if (delay > 90000 || waited + delay > 240000)
      throw new Error('Copilot API quota reset exceeds bounded wait; retain lease');
    waited += delay;
    report('COPILOT_API_QUOTA_WAIT ms=' + delay);
    let remaining = delay;
    while (remaining > 0) {
      await sleep(remaining);
      remaining = resetAt - now();
      if (remaining > delay)
        throw new Error('Copilot API quota clock moved backwards; retain lease');
    }
  }
  function call(method,path,body) {
    const queuedGeneration = generation;
    const next = tail.then(async () => {
      if (queuedGeneration !== generation) throw new Error('Copilot API request cancelled after a failed operation');
      try { return await execute(method,path,body); }
      catch (error) { generation++; throw error; }
    });
    tail = next.catch(() => {});
    return next;
  }
  async function execute(method,path,body,retried=false) {
    await waitForQuota();
    if (sequence >= 320) throw new Error('Copilot API per-run request budget exhausted; retain lease');
    const operation = method === 'POST' ? 'CREATE_TASK' : path.startsWith('?') ? 'LIST_TASKS' : 'GET_TASK_DETAIL';
    const requestNumber = ++sequence;
    counts[operation]++;

    const response=await request(root+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const remaining = response.headers?.get('x-ratelimit-remaining');
    const reset = response.headers?.get('x-ratelimit-reset');
    if (remaining === '0' && typeof reset === 'string' && /^\d+$/.test(reset)) {
      const deadline = Number(reset) * 1000 + 1000;
      if (Number.isSafeInteger(deadline) && deadline > now()) resetAt = deadline;
    }
    if(!response.ok) {
      const readHeader = (name, pattern) => {
        const value = response.headers?.get(name);
        return typeof value === 'string' && value.length <= 200 && pattern.test(value) && !value.includes(token) ? value : null;
      };
      // Classify GitHub's message rather than printing arbitrary response content.
      let reason = 'unclassified';
      try {
        const message = (await response.json())?.message;
        if (typeof message === 'string') {
          if (/secondary rate limit|abuse detection/i.test(message)) reason = 'secondary_rate_limit';
          else if (/rate limit/i.test(message)) reason = 'rate_limit';
          else if (/resource not accessible|permission|forbidden|access denied/i.test(message)) reason = 'access_denied';
          else if (/bad credentials|expired token|requires authentication/i.test(message)) reason = 'authentication';
          else if (/not found/i.test(message)) reason = 'not_found';
        }
      } catch { /* Missing/non-JSON error bodies must not mask original failure. */ }
      const diagnostics = {
        method, operation, requestNumber, counts: { ...counts }, status: response.status, reason,
        endpoint: root + (operation === 'GET_TASK_DETAIL' ? '/:task_id' : path),
        requestId: readHeader('x-github-request-id', /^[0-9a-f:]+$/i),
        acceptedPermissions: readHeader('x-accepted-github-permissions', /^[a-z0-9_=,; -]+$/i),
        rateLimit: readHeader('x-ratelimit-limit', /^\d+$/),
        rateLimitRemaining: readHeader('x-ratelimit-remaining', /^\d+$/),
        rateLimitUsed: readHeader('x-ratelimit-used', /^\d+$/),
        rateLimitReset: readHeader('x-ratelimit-reset', /^\d+$/),
        rateLimitResource: readHeader('x-ratelimit-resource', /^[a-z_]+$/),
        retryAfter: readHeader('retry-after', /^\d+$/),
      };
      report('COPILOT_API_FAILURE ' + JSON.stringify(diagnostics));
      // Retry only a GET with positive primary quota evidence and a valid future reset.
      // Never replay a task-creation POST, even on a rate-limit response.
      if (!retried && method === 'GET' && [403,429].includes(response.status) &&
          reason === 'rate_limit' && remaining === '0' && resetAt > now()) {
        return execute(method,path,body,true);
      }
      // Preserve the exact existing error contract for lease recovery evidence.
      const error=new Error('Copilot task API '+method+' returned HTTP '+response.status);
      error.status = response.status;
      error.code = 'COPILOT_TASK_' + method;
      error.category = reason.includes('rate_limit') || response.status === 429 || response.status >= 500
        ? 'integration' : [401, 403].includes(response.status) ? 'permission' : 'request';
      error.retryAfter = diagnostics.retryAfter;
      error.rateLimitReset = diagnostics.rateLimitReset;
      throw error;
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw responseFailure(response, { operation: 'Copilot ' + operation, endpoint: '/agents/repos/:repo/tasks' },
        'outer-json', 'invalid-json');
    }
    if (result === null || typeof result !== 'object')
      throw responseFailure(response, { operation: 'Copilot ' + operation, endpoint: '/agents/repos/:repo/tasks' },
        'outer-json', 'invalid-shape');
    if (!path || !path.startsWith('?')) return result;
    const link = response.headers?.get('link') ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="?next"?(?:\s*[,;]|$)/)?.[1];
    if (!Array.isArray(result.tasks) || result.tasks.length > 100 ||
        (Object.hasOwn(result, 'total_count') &&
          (!Number.isSafeInteger(result.total_count) || result.total_count < result.tasks.length)) ||
        (!next && /rel="?next"?/.test(link))) {
      throw new Error('Copilot task list incomplete; fail closed');
    }
    return { rows: result.tasks, total: result.total_count, next };

  }
  return {
    list:async({states,since,archived}={})=>{
      if (archived !== undefined && typeof archived !== 'boolean') throw new Error('Invalid Copilot archive scope');
      const allowed=WRITER_STATES;
      if(states!==undefined && (!Array.isArray(states)||!states.length||
          states.some(state=>!allowed.includes(state))||new Set(states).size!==states.length))
        throw new Error('Unsupported Copilot writer state filter');
      if (since !== undefined && (typeof since !== 'string' || !Number.isFinite(Date.parse(since)) ||
          new Date(since).toISOString() !== since)) throw new Error('Invalid Copilot inventory time scope');
      const query='?per_page=100'+(states?'&state='+states.join(','):'')+
        (since?'&since='+encodeURIComponent(since):'') +
        (archived === undefined ? '' : '&is_archived=' + archived);
      const tasks = [];
      let path = query;
      let expectedTotal;
      const visited = new Set();
      for (let page = 0; page < 20; page++) {
        if (visited.has(path)) throw new Error('Copilot task list incomplete: pagination loop');
        visited.add(path);
        const { rows, total, next } = await call('GET', path);
        if (total !== undefined) {
          if (expectedTotal !== undefined && expectedTotal !== total)
            throw new Error('Copilot task list incomplete: total changed during pagination');
          expectedTotal = total;
        }
        tasks.push(...rows);
        if (!next) {
          if ((expectedTotal !== undefined && tasks.length !== expectedTotal) ||
              (expectedTotal === undefined && rows.length === 100))
            throw new Error('Copilot task list incomplete: missing pagination or count evidence');
          break;
        }
        if (!rows.length || page === 19)
          throw new Error('Copilot task list incomplete: bounded pagination exhausted');
        const url = new URL(next, root);
        const original = new URL(root + query);
        if (url.origin + url.pathname !== root || url.username || url.password || url.hash || !url.search ||
            ['state', 'since', 'is_archived'].some(key => url.searchParams.get(key) !== original.searchParams.get(key)))
          throw new Error('Copilot task list incomplete: invalid pagination link');
        path = url.search;
      }
      if(states && tasks.some(task=>!states.includes(task.state)))
        throw new Error('Copilot server returned task outside requested writer states');
      return tasks;
    },
    get:id=>{if(!/^[A-Za-z0-9-]{8,96}$/.test(id??''))throw new Error('Invalid task id');return call('GET','/'+id);},
    create:({prompt})=>{if(typeof prompt!=='string'||prompt.length<50||prompt.length>6000)throw new Error('Invalid prompt');return call('POST','',{prompt,base_ref:'copilot/Development',create_pull_request:true});}
  };
}
export const activeAgentTasks = tasks => tasks.filter(t=>!['completed','failed','cancelled','timed_out','idle'].includes(t.state));
// A terminal agent task is NOT proof that its PR merged or writer cannot mutate files.
export function verifyCreatedTask(created,confirmed) {
  if(!created?.id || !/^[A-Za-z0-9-]{8,96}$/.test(created.id)) throw new Error('No verifiable Copilot task id');
  if(confirmed?.id!==created.id || !['queued','in_progress','idle','waiting_for_user'].includes(confirmed.state)) throw new Error('Copilot task not confirmed active');
  if(!/^https:\/\/github\.com\//.test(confirmed.html_url??created.html_url??'')) throw new Error('Copilot task URL unavailable');
  return {id:created.id,state:confirmed.state,url:confirmed.html_url??created.html_url,sessionIds:(confirmed.sessions??[]).map(s=>s.id).filter(Boolean)};
}
