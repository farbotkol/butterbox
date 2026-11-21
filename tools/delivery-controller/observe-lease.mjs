// Read-only gate. A transient API failure never implies an unlocked controller.
import {writeFileSync} from 'node:fs';
import {githubLeaseApi} from './github-lease-api.mjs';
import {readLease} from './lease.mjs';

const path = process.argv[2];
if (!path) throw new Error('Live lease output path required');
const api = githubLeaseApi({token:process.env.GH_TOKEN,repository:process.env.REPO});
const holder = await readLease(api);
const state = holder ? {state:'held',issue:holder.issue,runId:holder.runId,tagSha:holder.tagSha} : {state:'free'};
writeFileSync(path, JSON.stringify(state) + '\n', {flag:'wx',mode:0o600});
console.log(holder ? 'Exclusive delivery lease occupied; controller will not act.' : 'Exclusive delivery lease absent; other gates still apply.');
