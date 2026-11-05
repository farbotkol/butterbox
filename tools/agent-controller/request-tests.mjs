#!/usr/bin/env node
// Agent-side client for the Butterbox controller test broker. Copied read-only into each autonomous task folder;
// it only writes a JSON request and waits for the controller's result. See docs/LOCAL_CI_TESTING.md.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const taskDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requests = path.join(taskDir, 'test-requests');
const results = path.join(taskDir, 'test-results');
const FINAL = { passed: 0, failed: 1, rejected: 2, error: 3, timeout: 3, interrupted: 3, cancelled: 3 };
const usage = `Usage:
  node ${path.join(taskDir, 'bin', 'request-tests.mjs')} <suite> [options]
  node ${path.join(taskDir, 'bin', 'request-tests.mjs')} --wait <request-id>

Suites: auth-focused (selected browser tests), auth (complete browser suite), db (pgTAP), tenant (tenant
isolation), database (the complete CI database job). Runs use a fresh disposable Supabase database, a production
Next.js build of this repository's working tree and Playwright Chromium, isolated from all other data.

Options (auth-focused only):
  --test tests/e2e/auth.spec.mjs:<line>   Repeatable; up to 20 test locations.
  --grep <pattern>                        Playwright test-name pattern.
  --repeat <n>                            Run each selected test n times (1-10) to reproduce flaky failures.
  --max-wait-minutes <n>                  Stop waiting after n minutes (default 40); resume with --wait <id>.`;

function parse(argv) {
  const options = { request: {}, maxWait: 40 };
  const args = [...argv];
  const value = flag => {
    const next = args.shift();
    if (next === undefined) throw new Error(`${flag} needs a value`);
    return next;
  };
  if (args[0] === '--wait') {
    args.shift();
    options.wait = value('--wait');
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(options.wait)) throw new Error('invalid request id');
  } else {
    options.request.suite = args.shift();
    if (!options.request.suite || options.request.suite.startsWith('-')) throw new Error('a suite is required');
  }
  while (args.length) {
    const flag = args.shift();
    if (flag === '--test') (options.request.tests ??= []).push(value(flag));
    else if (flag === '--grep') options.request.grep = value(flag);
    else if (flag === '--repeat') options.request.repeat = Number(value(flag));
    else if (flag === '--max-wait-minutes') options.maxWait = Number(value(flag));
    else throw new Error(`unknown option ${flag}`);
  }
  if (!Number.isFinite(options.maxWait) || options.maxWait <= 0) throw new Error('invalid --max-wait-minutes');
  return options;
}

let options;
try {
  if (process.argv.length < 3 || ['-h', '--help'].includes(process.argv[2])) {
    console.log(usage);
    process.exit(process.argv.length < 3 ? 2 : 0);
  }
  options = parse(process.argv.slice(2));
} catch (error) {
  console.error(`request-tests: ${error.message}\n\n${usage}`);
  process.exit(2);
}
if (!existsSync(requests)) {
  console.error('request-tests: the controller test broker is not enabled for this task.');
  process.exit(3);
}

let id = options.wait;
if (!id) {
  id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const temporary = path.join(requests, `${id}.json.tmp`);
  writeFileSync(temporary, JSON.stringify(options.request));
  renameSync(temporary, path.join(requests, `${id}.json`));
  console.log(`Test request ${id} submitted: ${JSON.stringify(options.request)}`);
}

const deadline = Date.now() + options.maxWait * 60_000;
let last;
for (;;) {
  let result;
  try { result = JSON.parse(readFileSync(path.join(results, `${id}.json`), 'utf8')); } catch { /* not yet */ }
  if (result && result.status !== last) {
    last = result.status;
    if (Object.hasOwn(FINAL, result.status)) {
      console.log(`\nTest request ${id}: ${result.status.toUpperCase()}${result.reason ? ` (${result.reason})` : ''}`);
      if (result.summary) console.log(`\n${result.summary}`);
      else if (result.output) console.log(`\nController output (tail):\n${result.output}`);
      if (result.artifacts) console.log(`Artifacts (screenshots, traces, error-context.md, run.log): ${result.artifacts}`);
      console.log(`Full result: ${path.join(results, `${id}.json`)}`);
      process.exit(FINAL[result.status]);
    }
    console.log(`Test request ${id}: ${result.status}${result.position ? ` (queue position ${result.position})` : ''}…`);
  }
  if (Date.now() > deadline) {
    console.log(`Still ${last ?? 'pending'}. Resume waiting with: node ${process.argv[1]} --wait ${id}`);
    process.exit(75);
  }
  await new Promise(resolve => setTimeout(resolve, 5_000));
}
