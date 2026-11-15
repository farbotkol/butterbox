import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/pr-coordination.yml', import.meta.url), 'utf8');

test('PR coordination always checks out current trusted Development policy for pull_request_target', () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'pull_request_target' && 'refs\/heads\/copilot\/Development' \|\| github\.event\.merge_group\.base_sha \}\}/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.(?:base|head)\.sha/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head\.ref/);
});

test('privileged coordination remains read-only and never checks out PR head code', () => {
  assert.match(workflow, /permissions:\n  contents: read\n  pull-requests: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node tools\/agent-controller\/check-pr-coordination\.mjs/);
  assert.match(workflow, /merge_group:\n    types: \[checks_requested\]/);
});
