import { execFile, spawnSync } from 'node:child_process';
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
  const push = (ref, expected, source) => exec('git', [
    'push', '--porcelain', '--force-with-lease=' + ref + ':' + expected,
    'https://github.com/' + repository + '.git', source + ':' + ref,
  ], {
    timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('x-access-token:' + token).toString('base64') },
  });
  const inventoryRef = 'refs/tags/butterbox-controller-inventory';
  const inventoryTag = 'butterbox-controller-inventory';
  return {
    createTag: data => call('POST','/git/tags',data),
    createRef: data => call('POST','/git/refs',data),
    getRef: ref => call('GET','/git/ref/' + ref.replace(/^refs\//,'')),
    getTag: sha => call('GET','/git/tags/' + sha),
    async readInventory() {
      let ref;
      try {
        ref = await this.getRef(inventoryRef);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
      const sha = ref?.object?.sha;
      if (ref?.object?.type !== 'tag' || !/^[a-f0-9]{40}$/.test(sha ?? ''))
        throw new Error('Invalid Copilot inventory checkpoint ref');
      const tag = await this.getTag(sha);
      if (tag?.sha !== sha || tag.tag !== inventoryTag || tag.object?.type !== 'commit')
        throw new Error('Invalid Copilot inventory checkpoint tag');
      return { sha, record: JSON.parse(tag.message) };
    },
    async writeInventory(expected, record) {
      if (expected !== '' && !/^[a-f0-9]{40}$/.test(expected)) throw new Error('Invalid checkpoint SHA');
      const { stdout } = await exec('git', ['rev-parse', '--verify', 'HEAD']);
      const target = stdout.trim();
      if (!/^[a-f0-9]{40}$/.test(target)) throw new Error('Invalid checkout for Copilot inventory checkpoint');
      const tag = spawnSync('git', ['mktag'], {
        encoding: 'utf8', timeout: 10000,
        input: 'object ' + target + '\ntype commit\ntag ' + inventoryTag +
          '\ntagger Butterbox delivery controller <controller@users.noreply.github.com> ' +
          Math.floor(Date.now() / 1000) + ' +0000\n\n' + JSON.stringify(record) + '\n',
      });
      const sha = tag.stdout?.trim();
      if (tag.status !== 0 || !/^[a-f0-9]{40}$/.test(sha ?? ''))
        throw new Error('Could not create Copilot inventory checkpoint');
      try {
        await push(inventoryRef, expected, sha);
      } catch {
        throw new Error('Could not confirm Copilot inventory checkpoint update; retain lease');
      }
    },
    async compareAndDeleteRef(ref, sha) {
      if (ref !== LEASE_REF || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid lease deletion target');
      try {
        await push(ref, sha, '');
      } catch {
        throw new Error('Git did not confirm exact lease removal. Inspect the ref before retrying.');
      }
    },
    deleteRef: ref => call('DELETE','/git/refs/' + ref.replace(/^refs\//,'')),
  };
}
