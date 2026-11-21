import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide as decideRaw } from '../tools/delivery-controller/decide.mjs';
const decide = snapshot => decideRaw({...snapshot, lease:{state:'free'}});

const pr = (overrides = {}) => ({
  number: 300, state: 'open', base: { ref: 'copilot/Development' },
  head: { sha: 'a'.repeat(40) }, draft: false, mergeable: true, ...overrides,
});

test('requests existing guarded merge for a single eligible PR', () => {
  assert.deepEqual(decide({ pullRequests: [pr()] }), {
    action: 'REQUEST_GUARDED_MERGE', pr: 300, sha: 'a'.repeat(40),
    reason: 'Existing protected merge workflow will recheck all required gates.',
  });
});
test('never attempts merge for draft PR', () => {
  assert.equal(decide({ pullRequests: [pr({ draft: true })] }).action, 'OBSERVE');
});
test('stops on multiple open Development PRs', () => {
  assert.equal(decide({ pullRequests: [pr(), pr({ number: 301 })] }).action, 'REPORT_BLOCKED');
});
test('rejects stale or missing SHA', () => {
  assert.equal(decide({ pullRequests: [pr({ head: { sha: 'bad' } })] }).action, 'REPORT_BLOCKED');
});
test('does not invent coding-agent dispatch when no PR is open', () => {
  const result = decide({ pullRequests: [] });
  assert.equal(result.action, 'REPORT_BLOCKED');
  assert.match(result.reason, /no agent was launched/i);
});
test('ignores PRs targeting other branches', () => {
  assert.equal(decide({ pullRequests: [pr({ base: { ref: 'main' } })] }).action, 'REPORT_BLOCKED');
});
