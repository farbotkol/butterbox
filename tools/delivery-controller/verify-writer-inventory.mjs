// Read-only admission gate for the separate CI repair and Phase 2 merge jobs.
import { agentTasksApi } from './agent-tasks-api.mjs';
import { githubLeaseApi } from './github-lease-api.mjs';
import { competingWriters } from './handoff.mjs';
import { readLease } from './lease.mjs';
import { readLeaseCandidates, withTaskInventory } from './task-inventory.mjs';

const repository = process.env.GITHUB_REPOSITORY;
if (repository !== 'farbotkol/butterbox') throw new Error('Writer inventory is scoped to Butterbox');
const request = (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
const leases = githubLeaseApi({ token: process.env.GITHUB_TOKEN, repository, request });
if (await readLease(leases)) throw new Error('Exclusive delivery lease is held');
const tasks = withTaskInventory(agentTasksApi({
  token: process.env.COPILOT_AGENT_USER_TOKEN, repository, request,
}), leases, { readOnly: true, requireCheckpoint: true });
const writers = competingWriters(await readLeaseCandidates(tasks));
for (const writer of writers) console.error('COPILOT_WRITER_BLOCK: ' + JSON.stringify(writer));
if (writers.length || await readLease(leases)) throw new Error('Another delivery writer may still be active');
