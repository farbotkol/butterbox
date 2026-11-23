import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LEASE_REF } from './lease.mjs';

const exec = promisify(execFile);

// GitHub REST adapter for the exclusive lease. This is intentionally not wired
// to automated dispatch until the live concurrency and writer-liveness gates pass.
export function githubLeaseApi({token, repository, request = fetch} = {}) {
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('Missing GitHub token or invalid repository');
  }
  const root = 'https://api.github.com/repos/' + repository;
  async function call(method, path, body) {
    const response = await request(root + path, {
      method,
      headers: {
        'Accept':'application/vnd.github+json',
        'Authorization':'Bearer ' + token,
        'X-GitHub-Api-Version':'2022-11-28',
        ...(body ? {'Content-Type':'application/json'} : {}),
      },
      ...(body ? {body:JSON.stringify(body)} : {}),
    });
    if (!response.ok) {
      const error = new Error('GitHub lease API ' + method + ' failed with HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    createTag: data => call('POST','/git/tags',data),
    createRef: data => call('POST','/git/refs',data),
    getRef: ref => call('GET','/git/ref/' + ref.replace(/^refs\//,'')),
    getTag: sha => call('GET','/git/tags/' + sha),
    async compareAndDeleteRef(ref, sha) {
      if (ref !== LEASE_REF || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid lease deletion target');
      // Git's receive-pack checks the expected old object when applying the
      // update. REST delete-ref has no expected-SHA parameter.
      try {
        await exec('git', ['push', '--porcelain', '--force-with-lease=' + ref + ':' + sha,
          'https://github.com/' + repository + '.git', ':' + ref], {
          timeout: 30000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
            GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('x-access-token:' + token).toString('base64') },
        });
      } catch {
        throw new Error('Git did not confirm exact lease removal. Inspect the ref before retrying.');
      }
    },
    deleteRef: ref => call('DELETE','/git/refs/' + ref.replace(/^refs\//,'')),
  };
}
