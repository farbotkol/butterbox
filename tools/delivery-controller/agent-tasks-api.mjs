// GitHub Copilot cloud tasks public-preview API; requires user-to-server credential.
export function agentTasksApi({token,repository,request=fetch,report=message=>console.error(message)}={}) {
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??'')) throw new Error('Copilot user token and repository required');
  const root='https://api.github.com/agents/repos/'+repository+'/tasks';
  const counts = { LIST_TASKS: 0, GET_TASK_DETAIL: 0, CREATE_TASK: 0 };
  let sequence = 0;
  async function call(method,path,body) {
    const operation = method === 'POST' ? 'CREATE_TASK' : path.startsWith('?') ? 'LIST_TASKS' : 'GET_TASK_DETAIL';
    const requestNumber = ++sequence;
    counts[operation]++;

    const response=await request(root+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
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
      // Preserve the exact existing error contract for lease recovery evidence.
      const error=new Error('Copilot task API '+method+' returned HTTP '+response.status);
      error.status=response.status;error.code='COPILOT_TASK_'+method;throw error;
    }
    const result = await response.json();
    if (!path || !path.startsWith('?')) return result;
    if (!Array.isArray(result.tasks) || result.tasks.length >= 100 ||
        (Object.hasOwn(result, 'total_count') && result.total_count !== result.tasks.length) ||
        /rel="?next"?/.test(response.headers?.get('link') ?? '')) {
      throw new Error('Copilot task list incomplete; fail closed');
    }
    return result;
  }
  return {
    list:async({states}={})=>{
      const allowed=['queued','in_progress'];
      if(states!==undefined && (!Array.isArray(states)||!states.length||
          states.some(state=>!allowed.includes(state))||new Set(states).size!==states.length))
        throw new Error('Unsupported Copilot writer state filter');
      const query='?per_page=100'+(states?'&state='+states.join(','):'');
      const tasks=(await call('GET',query)).tasks;
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
