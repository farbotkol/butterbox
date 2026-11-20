import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('repair authentication smoke supports personal accounts and stays non-destructive', async () => {
  const workflow = await readFile(new URL('.github/workflows/agent-merge-enrollment.yml', root), 'utf8');

  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.equal((workflow.match(/COPILOT_GITHUB_TOKEN: \\$\\{\\{ secrets\\.COPILOT_GITHUB_TOKEN \\}\\}/g) || []).length, 2);
  assert.match(workflow, /GH_TOKEN: \\$\\{\\{ github\\.token \\}\\}/);
  assert.match(workflow, /attempt == '1'/);
  assert.match(workflow, /contents: write[\s\S]*pull-requests: read[\s\S]*actions: write[\s\S]*copilot-requests: write/);
  assert.match(workflow, /\.head\.repo\.full_name == \$repo/);
  assert.match(workflow, /\.base\.ref == "copilot\/Development"/);
  assert.match(workflow, /\.head\.ref \| startswith\("copilot\/"\)/);
  assert.match(workflow, /Do not use any tools/);
  assert.match(workflow, /--deny-tool=write --deny-tool=shell --deny-tool=url/);
  assert.match(workflow, /no response or credentials were logged/);
  assert.match(workflow, /sanitized CLI diagnostic follows/);
  assert.match(workflow, /group: copilot-ci-test-repair-development[\s\S]*cancel-in-progress: false/);
  assert.ok(workflow.indexOf('Non-destructive Copilot authentication smoke test') <
    workflow.indexOf('Ask Copilot to repair failing Node test files'));
});

test('repair is limited to failed Node tests, bounded attempts, and a 12-hour window', async () => {
  const workflow = await readFile(new URL('.github/workflows/agent-merge-enrollment.yml', root), 'utf8');

  assert.match(workflow, /MAX_ATTEMPTS: \$\{\{ vars\.CI_REPAIR_MAX_ATTEMPTS \|\| '3' \}\}/);
  assert.match(workflow, /\[1-5\]/);
  assert.match(workflow, /Run npm test/);
  assert.match(workflow, /12 \* 60 \* 60/);
  assert.match(workflow, /PARKED: PR #\$number exceeded the 12-hour repair window/);
  assert.match(workflow, /current_sha" != "\$EXPECTED_SHA"/);
  assert.match(workflow, /-F force=false/);
  assert.match(workflow, /\^tests\/\[a-zA-Z0-9_.-\]\+\\\.test\\\.mjs\$/);
});

test('repair reruns the current checks without removing the legacy database job', async () => {
  const repairWorkflow = await readFile(
    new URL('.github/workflows/agent-merge-enrollment.yml', root),
    'utf8',
  );
  const mergeWorkflow = await readFile(
    new URL('.github/workflows/phase2-automerge-development.yml', root),
    'utf8',
  );
  const ciWorkflow = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');

  assert.match(repairWorkflow, /gh workflow run ci\.yml --ref "\$BRANCH"/);
  assert.match(repairWorkflow, /gh workflow run fast-database-candidate\.yml --ref "\$BRANCH"/);
  assert.match(mergeWorkflow, /for required in verify database-smoke/);
  assert.match(ciWorkflow, /^\s+database:\s*$/m);
  assert.match(ciWorkflow, /needs:\s*\[verify, database\]/);
});
