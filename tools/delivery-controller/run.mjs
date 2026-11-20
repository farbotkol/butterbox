import { readFileSync, appendFileSync } from 'node:fs';
import { decide } from './decide.mjs';

const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const action = decide(snapshot);
const allowed = new Set(['REPORT_BLOCKED', 'OBSERVE', 'REQUEST_GUARDED_MERGE']);
if (!allowed.has(action.action)) throw new Error('Unrecognized controller action');
const output = process.env.GITHUB_OUTPUT;
if (output) appendFileSync(output, `action=${action.action}\npr=${action.pr ?? ''}\nsha=${action.sha ?? ''}\n`);
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, `## Butterbox delivery controller (phase 1)\n\n- Action: **${action.action}**\n- PR: ${action.pr ?? 'none'}\n- Reason: ${action.reason}\n- Coding-agent dispatch: **not enabled, no verified session launch API**\n- Existing required CI and native merge gates remain authoritative.\n`);
console.log(JSON.stringify(action));
