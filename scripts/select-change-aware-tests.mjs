#!/usr/bin/env node
// Conservative, advisory test selection. Never use PR-provided metadata to skip security checks.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_SHA;
if (!/^[0-9a-f]{40}$/.test(BASE ?? "")) {
  console.error("Missing or invalid BASE_SHA; refusing to narrow coverage.");
  process.exit(1);
}
const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACDMRT", `${BASE}...HEAD`],
  { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const base = [
  "verified signup", "tenant", "roster timetable", "offline attendance",
  "payroll", "permissions UX"
];
const rules = [
  { path: /(^|\/)(roster|shift|availability)/i, tests: ["roster", "shift", "availability", "permissions"] },
  { path: /(^|\/)(attendance|kiosk|work-time)/i, tests: ["attendance", "kiosk", "clock", "break"] },
  { path: /(^|\/)(timesheet|payroll|report)/i, tests: ["timesheet", "payroll", "report", "hours"] },
  { path: /(^|\/)(people|employee|invitation|department)/i, tests: ["employee", "people", "department", "invitation", "permissions"] },
  { path: /(^|\/)(permission|auth|login|signup|session|tenant)/i, tests: ["auth", "session", "login", "signup", "permissions", "tenant", "business"] },
  { path: /(^|\/)(announcement|notification|conversation)/i, tests: ["announcement", "notification", "conversation"] },
];
const docsOnly = /^(docs\/|\.github\/ISSUE_TEMPLATE\/|README|CHANGELOG|LICENSE|.*\.md$)/i;
const highRisk = /^(supabase\/|tests\/|scripts\/|tools\/|\.github\/workflows\/|package(-lock)?\.json$|playwright\.config|next\.config|src\/lib\/|src\/middleware|src\/proxy)/i;
let mode = "focused";
const tests = new Set(base);
let reason = "";
if (changed.length === 0 || changed.some(f => highRisk.test(f))) {
  mode = "full"; reason = "Shared, security, database, tooling or unknown comparison scope";
} else {
  for (const file of changed) {
    if (docsOnly.test(file)) continue;
    const matching = rules.filter(r => r.path.test(file));
    if (!matching.length) { mode = "full"; reason = `Unclassified change: ${file}`; break; }
    for (const rule of matching) for (const test of rule.tests) tests.add(test);
  }
  if (mode !== "full" && changed.every(f => docsOnly.test(f))) {
    mode = "none"; reason = "Documentation-only changes";
  }
}
const grep = [...tests].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const output = { mode, grep, files: changed, reason };
console.log(JSON.stringify(output, null, 2));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\ngrep=${grep}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Advisory change-aware validation\nMode: **${mode}**\n\nChanged files: ${changed.length}\n\n${reason}\n\n`);
}
