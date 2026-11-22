// GitHub Copilot cloud tasks public-preview API; requires user-to-server credential.
export function agentTasksApi({token,repository,request=fetch}={}) {
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??'')) throw new Error('Copilot user token and repository required');
  const root='https://api.github.com/agents/repos/'+repository+'/tasks';
  async function call(method,path,body) {
    const response=await request(root+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok) {const error=new Error('Copilot task API '+method+' returned HTTP '+response.status);error.status=response.status;throw error;}
    return response.json();
  }
  return {
    list:async()=>{const result=await call('GET','?per_page=100');if(!Array.isArray(result.tasks) || result.tasks.length>=100)throw new Error('Copilot task list incomplete; fail closed');return result.tasks;},
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
