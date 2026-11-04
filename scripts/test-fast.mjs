#!/usr/bin/env node
// Fast developer verification: unit tests, controller tests, ESLint and TypeScript.
// No database, browser or network is used. See docs/LOCAL_CI_TESTING.md.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STEPS = ["unit", "controller", "lint", "types"];
const CI_NODE_MAJOR = 24;
const BASE_REF = "origin/copilot/finish-roadmap-for-app";
const CONTROLLER_PREFIX = "tools/agent-controller/";

export function parseFastArgs(argv) {
  const selected = new Set();
  let explicit = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true, steps: [] };
    const match = /^--(only|skip)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown option ${arg}. Use --only=<steps> or --skip=<steps>.`);
    const names = match[2].split(",").map((name) => name.trim()).filter(Boolean);
    for (const name of names) {
      if (!STEPS.includes(name)) throw new Error(`Unknown step ${name}. Steps: ${STEPS.join(", ")}.`);
    }
    if (match[1] === "only") {
      if (explicit || selected.size) throw new Error("Use --only once, before any --skip.");
      explicit = true;
      for (const name of names) selected.add(name);
    } else {
      const base = selected.size ? [...selected] : STEPS;
      selected.clear();
      for (const name of base.filter((step) => !names.includes(step))) selected.add(name);
      if (!selected.size) throw new Error("No steps remain after --skip.");
    }
  }
  return { help: false, explicit, steps: selected.size ? STEPS.filter((step) => selected.has(step)) : [...STEPS] };
}

// The slow controller suite runs by default only when controller files differ from the base branch.
export function controllerChanged(changed) {
  return changed === null || changed.some((file) => file.startsWith(CONTROLLER_PREFIX));
}

export function changedFiles(directory = root, base = BASE_REF) {
  const git = (args) => spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  const mergeBase = git(["merge-base", base, "HEAD"]);
  if (mergeBase.status !== 0) return null;
  const diff = git(["diff", "--name-only", mergeBase.stdout.trim()]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  if (diff.status !== 0 || untracked.status !== 0) return null;
  return `${diff.stdout}\n${untracked.stdout}`.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function fastCommands(directory = root) {
  const unitFiles = readdirSync(path.join(directory, "tests"))
    .filter((name) => name.endsWith(".test.mjs")).sort().map((name) => path.join("tests", name));
  const bin = (name) => path.join(directory, "node_modules", ".bin", name);
  return {
    unit: [process.execPath, ["--experimental-strip-types", "--test", ...unitFiles]],
    controller: [process.execPath, ["--test", "tools/agent-controller/listener.test.mjs", "tools/agent-controller/test-broker.test.mjs"]],
    lint: [bin("eslint"), ["--cache", "--cache-location", "node_modules/.cache/butterbox-eslint/", "."]],
    types: [bin("tsc"), ["--noEmit", "--pretty", "false"]],
  };
}

// macOS TMPDIR lives below the /var symlink; showcase path-safety tests require a real path.
export function fastEnvironment(env = process.env) {
  const temporary = realpathSync(env.TMPDIR || tmpdir());
  return { ...env, TMPDIR: temporary, FORCE_COLOR: env.FORCE_COLOR ?? "0", NEXT_TELEMETRY_DISABLED: "1" };
}

function runStep(name, [command, args], env) {
  const started = Date.now();
  return new Promise((resolve) => {
    console.log(`\n=== ${name}: ${path.basename(command)} ${args.slice(0, 3).join(" ")}${args.length > 3 ? " …" : ""}`);
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`${name} could not start: ${error.message}`);
      resolve({ name, code: 127, seconds: (Date.now() - started) / 1000 });
    });
    child.on("close", (code, signal) => resolve({
      name, code: code ?? (signal ? 128 : 1), seconds: (Date.now() - started) / 1000,
    }));
  });
}

async function main() {
  let options;
  try {
    options = parseFastArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (options.help) {
    console.log(`Usage: npm run test:fast [-- --only=${STEPS.join(",")}] [-- --skip=lint]`);
    return;
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== CI_NODE_MAJOR) {
    console.warn(`Warning: GitHub Actions uses Node ${CI_NODE_MAJOR}; this is Node ${process.versions.node}.`);
  }
  mkdirSync(path.join(root, "node_modules", ".cache", "butterbox-eslint"), { recursive: true });
  if (!options.explicit && options.steps.includes("controller") && !controllerChanged(changedFiles())) {
    options.steps = options.steps.filter((step) => step !== "controller");
    console.log(`Skipping controller tests: no ${CONTROLLER_PREFIX} changes from ${BASE_REF}. Use --only=controller to force.`);
  }
  const env = fastEnvironment();
  const commands = fastCommands();
  const results = [];
  for (const step of options.steps) results.push(await runStep(step, commands[step], env));
  console.log("\nFast verification summary");
  for (const result of results) {
    console.log(`  ${result.code === 0 ? "PASS" : "FAIL"}  ${result.name.padEnd(10)} ${result.seconds.toFixed(1)}s`);
  }
  const failed = results.filter((result) => result.code !== 0);
  if (failed.length) {
    console.log("\nNext: fix the failures above. Browser and database checks run separately with npm run test:auth:focused.");
    process.exit(1);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
