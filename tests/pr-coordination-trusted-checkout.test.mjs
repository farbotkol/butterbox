import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/pr-coordination.yml', import.meta.url), 'utf8');
const checker = readFileSync(new URL('../tools/agent-controller/check-pr-coordination.mjs', import.meta.url), 'utf8');

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

test('PR events use fresh PR metadata and merge groups compare against the queued head SHA', () => {
  assert.match(checker, /api\(`repos\/\$\{repository\}\/pulls\/\$\{number\}`\)/);
  assert.match(checker, /const head = event\.merge_group\?\.head_sha/);
  assert.match(checker, /compare\/\$\{pull\.head\.sha\}\.\.\.\$\{head\}/);
});
