#!/usr/bin/env node
// Isolated, disposable local CI test environment for Butterbox (see docs/LOCAL_CI_TESTING.md).
//
// Locally every container runs on a dedicated Colima VM ("butterbox-ci") that mounts only the test-run staging
// folder and rejects container traffic to private networks, so test code cannot reach the developer database, the
// synthetic showcase or anything else on the host. GitHub Actions uses its own ephemeral runner instead.
//
// Code under test is staged as a snapshot. The "container" runner (default; the only runner the agent controller
// uses) executes it in a resource-limited container with no Docker socket, credentials or host files. The "host"
// runner is a faster option for trusted code in this checkout only.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECT = "butterbox-citest";
export const PORTS = Object.freeze({ shadow: 59420, api: 59421, db: 59422, studio: 59423, mail: 59424 });
export const SUPABASE_VERSION = "2.122.0";
export const CI_NODE_VERSION = "24.11.1";
export const EXCLUDED_SERVICES =
  "studio,realtime,storage-api,imgproxy,postgres-meta,edge-runtime,logflare,vector,supavisor";
export const COLIMA_PROFILE = "butterbox-ci";
export const LOCAL_RUNS_ROOT = "/Users/Shared/butterbox-test-runs";
export const AUTH_FILE = "tests/e2e/auth.spec.mjs";
export const RUN_LABEL = "butterbox.test-run";
export const NPM_CACHE_VOLUME = `${PROJECT}-npm-cache`;
// Agent task clones are untrusted: never let their Git configuration run commands (fsmonitor) or hooks.
const SAFE_GIT = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
// Container egress to these ranges is rejected: they include the Colima host gateway (the Mac's loopback, where
// the developer and showcase stacks listen) and the local network. Public hosts (npm registry, Google Fonts for
// the Next.js build) remain reachable, as on GitHub Actions.
export const BLOCKED_RANGES = Object.freeze(["10.0.0.0/8", "100.64.0.0/10", "169.254.0.0/16", "192.168.0.0/16"]);
export const SUITES = Object.freeze({
  db: { minutes: 15, steps: ["db"], description: "pgTAP database tests (CI: supabase test db)" },
  tenant: { minutes: 20, steps: ["tenant"], description: "authenticated tenant-isolation tests" },
  "auth-focused": { minutes: 30, steps: ["auth"], focused: true,
    description: "selected browser tests (--grep and/or --test file:line)" },
  auth: { minutes: 60, steps: ["auth"], description: "complete browser suite (CI: npm run test:auth)" },
  database: { minutes: 100, steps: ["db", "tenant", "auth"], description: "the complete CI database job" },
});
const EXIT = { passed: 0, failed: 1, usage: 2, error: 3, timeout: 124, interrupted: 130 };

export class TestEnvError extends Error {
  constructor(message, exitCode = EXIT.error) {
    super(message);
    this.exitCode = exitCode;
  }
}
const usageError = (message) => new TestEnvError(message, EXIT.usage);

export const USAGE = `Usage: node scripts/test-env.mjs <command> [options]

Commands:
  up                      Start the dedicated VM and disposable Supabase test project.
  run <suite> [options]   Reset the test database and run one allowlisted suite.
  status                  Show the environment, lock and recent runs.
  cleanup                 Remove interrupted runs, stale locks and orphaned runner containers.
  down [--vm]             Stop and delete the test project (and stop the dedicated VM with --vm).

Suites: ${Object.entries(SUITES).map(([name, suite]) => `\n  ${name.padEnd(13)} ${suite.description}`).join("")}

Run options:
  --grep <pattern>        Playwright test-name pattern (auth-focused only).
  --test <file:line>      ${AUTH_FILE}:<line> location; repeatable (auth-focused only).
  --repeat <n>            Run each selected test n times (1-10) to reproduce flaky failures (auth-focused only).
  --runner <name>         container (default; isolated, any code) or host (trusted checkout only).
  --source <dir>          Code under test (default: this checkout). Requires the container runner otherwise.
  --artifacts <dir>       Where to write result.json, summary.md, logs, screenshots and traces.
  --timeout-minutes <n>   Overall time limit (defaults per suite).`;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!["up", "run", "status", "cleanup", "down", "help", "--help"].includes(command ?? "")) {
    throw usageError(USAGE);
  }
  const options = { command, tests: [] };
  if (command === "run") {
    options.suite = rest.shift();
    if (!Object.hasOwn(SUITES, options.suite ?? "")) throw usageError(`Unknown suite.\n\n${USAGE}`);
  }
  while (rest.length) {
    const flag = rest.shift();
    const value = () => {
      const next = rest.shift();
      if (next === undefined) throw usageError(`${flag} needs a value.`);
      return next;
    };
    if (command === "down" && flag === "--vm") options.vm = true;
    else if (command !== "run") throw usageError(`Unexpected argument ${flag}.`);
    else if (flag === "--grep") options.grep = value();
    else if (flag === "--test") options.tests.push(value());
    else if (flag === "--repeat") options.repeat = Number(value());
    else if (flag === "--runner") options.runner = value();
    else if (flag === "--source") options.source = value();
    else if (flag === "--artifacts") options.artifacts = value();
    else if (flag === "--timeout-minutes") options.timeoutMinutes = Number(value());
    else throw usageError(`Unknown option ${flag}.`);
  }
  if (command === "run") validateRun(options);
  return options;
}

export function validateRun(options) {
  const suite = SUITES[options.suite];
  if (options.grep !== undefined &&
      (typeof options.grep !== "string" || !options.grep.trim() || options.grep.length > 200 ||
       /[\u0000-\u001f\u007f]/.test(options.grep))) {
    throw usageError("--grep must be a single-line pattern of at most 200 characters.");
  }
  if (options.tests.length > 20 || options.tests.some((test) => !new RegExp(
    `^${AUTH_FILE.replaceAll(".", "\\.")}:[1-9]\\d{0,5}$`).test(test))) {
    throw usageError(`--test must be ${AUTH_FILE}:<line> (at most 20).`);
  }
  if (options.repeat !== undefined && (!suite.focused || !Number.isInteger(options.repeat) || options.repeat < 1 ||
      options.repeat > 10)) {
    throw usageError("--repeat must be a whole number from 1 to 10 and is only for auth-focused.");
  }
  if (suite.focused && options.grep === undefined && !options.tests.length) {
    throw usageError("auth-focused needs --grep <pattern> and/or --test <file:line>.");
  }
  if (!suite.focused && (options.grep !== undefined || options.tests.length)) {
    throw usageError(`${options.suite} always runs completely; use auth-focused to select browser tests.`);
  }
  options.runner ??= "container";
  if (!["container", "host"].includes(options.runner)) throw usageError("--runner must be container or host.");
  if (options.timeoutMinutes === undefined) options.timeoutMinutes = suite.minutes;
  if (!Number.isInteger(options.timeoutMinutes) || options.timeoutMinutes < 1 ||
      options.timeoutMinutes > suite.minutes * 2) {
    throw usageError(`--timeout-minutes must be between 1 and ${suite.minutes * 2} for ${options.suite}.`);
  }
  for (const key of ["source", "artifacts"]) {
    if (options[key] !== undefined && !path.isAbsolute(options[key])) throw usageError(`--${key} must be absolute.`);
  }
  return options;
}

export function context(env = process.env, home = os.homedir()) {
  const github = env.GITHUB_ACTIONS === "true";
  if (github && !env.RUNNER_TEMP) throw new TestEnvError("RUNNER_TEMP is required in GitHub Actions.");
  const runsRoot = github ? path.join(env.RUNNER_TEMP, "butterbox-test-runs") : LOCAL_RUNS_ROOT;
  const docker = github ? {} : {
    DOCKER_HOST: `unix://${path.join(home, ".colima", COLIMA_PROFILE, "docker.sock")}`,
    // An empty client configuration: never the developer's registry credentials or contexts.
    DOCKER_CONFIG: path.join(home, ".colima", COLIMA_PROFILE, "docker-config"),
  };
  return { github, home, runsRoot, envDir: path.join(runsRoot, "env"), docker, colimaDir: path.join(home, ".colima",
    COLIMA_PROFILE) };
}

const INHERITED = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "SHELL", "CI", "GITHUB_ACTIONS",
  "RUNNER_TEMP", "PLAYWRIGHT_BROWSERS_PATH", "BUTTERBOX_TEST_SUPABASE_CLI", "BUTTERBOX_TEST_LOW_MEMORY"];
// Test processes receive an allowlisted environment: never cloud, GitHub, Supabase or application credentials.
export function testEnvironment(ctx, env = process.env, extra = {}) {
  const result = Object.fromEntries(INHERITED.filter((name) => env[name] !== undefined).map((name) => [name,
    env[name]]));
  result.PATH = [path.dirname(process.execPath), result.PATH].filter(Boolean).join(path.delimiter);
  result.TMPDIR = fs.realpathSync(os.tmpdir());
  result.NEXT_TELEMETRY_DISABLED = "1";
  return { ...result, ...ctx.docker, ...extra };
}

// Derives the disposable project's configuration from this checkout's trusted config.toml (never from the code
// under test): a fixed project ID, dedicated ports and only the services the CI job starts.
export function testProjectConfig(source) {
  const overrides = {
    "": { project_id: `"${PROJECT}"` },
    api: { port: String(PORTS.api) },
    db: { port: String(PORTS.db), shadow_port: String(PORTS.shadow) },
    studio: { enabled: "false", port: String(PORTS.studio) },
    local_smtp: { enabled: "true", port: String(PORTS.mail) },
    analytics: { enabled: "false" },
    edge_runtime: { enabled: "false" },
  };
  const sections = [{ name: "", lines: [] }];
  for (const line of source.split("\n")) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) sections.push({ name: header[1].trim(), header: line, lines: [] });
    else sections.at(-1).lines.push(line);
  }
  if (sections.some((section) => section.name === "inbucket")) {
    throw new TestEnvError("Rename [inbucket] to [local_smtp] in supabase/config.toml before using test-env.");
  }
  const output = [];
  const seen = new Set();
  for (const section of sections) {
    const wanted = { ...(overrides[section.name] ?? {}) };
    seen.add(section.name);
    if (section.header) output.push(section.header);
    const lines = section.lines.map((line) => {
      const key = /^\s*([A-Za-z0-9_]+)\s*=/.exec(line)?.[1];
      if (key && Object.hasOwn(wanted, key)) {
        const replacement = `${key} = ${wanted[key]}`;
        delete wanted[key];
        return replacement;
      }
      return line;
    });
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    const added = Object.entries(wanted).map(([key, value]) => `${key} = ${value}`);
    output.push(...(section.name === "" ? [...added, ...lines] : [...lines, ...added]), "");
  }
  for (const [name, values] of Object.entries(overrides)) {
    if (seen.has(name)) continue;
    output.push(`[${name}]`, ...Object.entries(values).map(([key, value]) => `${key} = ${value}`), "");
  }
  return `# Generated by scripts/test-env.mjs for the disposable ${PROJECT} project; do not edit.\n${output.join("\n")}`;
}

export function colimaConfig(runsRoot = LOCAL_RUNS_ROOT) {
  return `# Managed by scripts/test-env.mjs: dedicated, disposable Butterbox CI test VM.
# Only the test-run staging folder is shared with the VM (never the home folder).
cpu: 2
disk: 40
memory: 4
arch: aarch64
runtime: docker
hostname: colima-${COLIMA_PROFILE}
kubernetes:
  enabled: false
autoActivate: false
network:
  address: false
  mode: shared
  dns: null
  dnsHosts: {}
  hostAddresses: false
forwardAgent: false
docker:
  default-network-opts:
    bridge:
      com.docker.network.bridge.host_binding_ipv4: 127.0.0.1
  ip: 127.0.0.1
vmType: vz
portForwarder: ssh
rosetta: false
binfmt: false
nestedVirtualization: false
mountType: virtiofs
mountInotify: false
provision: []
sshConfig: false
mounts:
  - location: ${runsRoot}
    writable: true
env: {}
`;
}

// Fails closed unless the VM configuration shares exactly the staging folder.
export function verifyColimaConfig(text, runsRoot = LOCAL_RUNS_ROOT) {
  const locations = [...text.matchAll(/^\s*-\s*location:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  if (locations.length !== 1 || locations[0] !== runsRoot || !/^mounts:\s*$/m.test(text) ||
      /^forwardAgent:\s*true/m.test(text)) {
    throw new TestEnvError(`~/.colima/${COLIMA_PROFILE}/colima.yaml must share only ${runsRoot}.`);
  }
}

export function egressScript() {
  const rules = BLOCKED_RANGES.map((range) =>
    `iptables -C DOCKER-USER -d ${range} -j REJECT 2>/dev/null || iptables -I DOCKER-USER -d ${range} -j REJECT`);
  // DNS for containers is answered through the VM's resolver on the host gateway; nothing else is.
  const dns = ["udp", "tcp"].map((protocol) =>
    `iptables -C DOCKER-USER -d "$ns" -p ${protocol} --dport 53 -j ACCEPT 2>/dev/null || ` +
    `iptables -I DOCKER-USER -d "$ns" -p ${protocol} --dport 53 -j ACCEPT`);
  return ["set -eu", ...rules,
    "for ns in $(awk '/^nameserver/ {print $2}' /etc/resolv.conf | grep -E '^[0-9.]+$'); do", ...dns, "done",
    "iptables -S DOCKER-USER"].join("\n");
}

export function verifyEgressRules(listing) {
  const missing = BLOCKED_RANGES.filter((range) => !listing.includes(`-A DOCKER-USER -d ${range} -j REJECT`));
  if (missing.length) throw new TestEnvError(`Container egress rules are missing for ${missing.join(", ")}.`);
}

export function runnerImageTag(root = ROOT) {
  const hash = createHash("sha256");
  for (const name of ["Dockerfile", "docker-shim.mjs", "runner.mjs"]) {
    hash.update(name).update(fs.readFileSync(path.join(root, "tools/test-runner", name)));
  }
  hash.update(playwrightVersion(root));
  return `butterbox-test-runner:${hash.digest("hex").slice(0, 16)}`;
}

export function playwrightVersion(root = ROOT) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const version = lock.packages?.["node_modules/@playwright/test"]?.version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new TestEnvError("Cannot read the locked Playwright version.");
  return version;
}

export function runnerArgs({ runId, image, suite, src, envDir, artifacts, options }) {
  return ["run", "--rm", "--name", `${PROJECT}-run-${runId}`,
    "--label", `${RUN_LABEL}=${runId}`, "--label", `${RUN_LABEL}.owner=${process.pid}`,
    "--network", `supabase_network_${PROJECT}`,
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "4096",
    "--memory", "3g", "--memory-swap", "3g", "--cpus", "2", "--shm-size", "1g",
    "--mount", "type=volume,dst=/work",
    "--mount", `type=volume,src=${NPM_CACHE_VOLUME},dst=/home/tester/.npm`,
    "--mount", `type=bind,src=${src},dst=/src,readonly`,
    "--mount", `type=bind,src=${envDir},dst=/env,readonly`,
    "--mount", `type=bind,src=${artifacts},dst=/artifacts`,
    "--env", `BUTTERBOX_RUNNER_SUITE=${suite}`, "--env", `BUTTERBOX_RUNNER_PROJECT=${PROJECT}`,
    "--env", `BUTTERBOX_RUNNER_API_PORT=${PORTS.api}`, "--env", `BUTTERBOX_RUNNER_DB_PORT=${PORTS.db}`,
    "--env", `BUTTERBOX_RUNNER_MAIL_PORT=${PORTS.mail}`,
    ...(options.grep !== undefined ? ["--env", `BUTTERBOX_TEST_GREP=${options.grep}`] : []),
    ...(options.tests.length ? ["--env", `BUTTERBOX_TEST_SELECTIONS=${options.tests.join(",")}`] : []),
    ...(options.repeat ? ["--env", `BUTTERBOX_TEST_REPEAT=${options.repeat}`] : []),
    image];
}

const stripAnsi = (text) => String(text ?? "").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

// Turns Playwright JSON reports into the actionable failure list returned to developers and agents.
export function summarizeReports(reports, artifactsDir, containerArtifacts = "/artifacts") {
  const stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  const failures = [];
  const mapPath = (file) => (file?.startsWith(`${containerArtifacts}/`)
    ? path.join(artifactsDir, file.slice(containerArtifacts.length + 1)) : file);
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      if (spec.ok) continue;
      const results = spec.tests.flatMap((test) => test.results ?? []);
      failures.push({
        title: [...titles, spec.title].filter(Boolean).join(" › "),
        location: `${spec.file.startsWith("tests/") ? spec.file : `tests/e2e/${spec.file}`}:${spec.line}`,
        errors: results.flatMap((result) => result.errors ?? [])
          .map((error) => stripAnsi(error.message ?? error.value).slice(0, 4000)).slice(0, 5),
        attachments: results.flatMap((result) => result.attachments ?? [])
          .filter((attachment) => attachment.path).map((attachment) => mapPath(attachment.path)),
      });
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title && !child.title.endsWith(".mjs")
      ? child.title : ""]);
  };
  for (const report of reports) {
    for (const key of Object.keys(stats)) stats[key] += report.stats?.[key] ?? 0;
    for (const suite of report.suites ?? []) walk(suite, []);
    for (const error of report.errors ?? []) {
      failures.push({ title: "Playwright run error", location: "", errors: [stripAnsi(error.message).slice(0, 4000)],
        attachments: [] });
    }
  }
  return { stats, failures };
}

export function summaryMarkdown(result) {
  const lines = [`# Butterbox ${result.suite} test run: ${result.status.toUpperCase()}`, "",
    `- Run: ${result.runId} (${result.runner} runner) — ${result.durationSeconds}s`,
    `- Source: ${result.source.commit ?? "unknown"}${result.source.dirty ? " with uncommitted changes" : ""}`,
    `- Isolated project: ${PROJECT} (API 127.0.0.1:${PORTS.api}); database reset before the run`,
    ...result.steps.map((step) => `- Step ${step.name}: exit ${step.exitCode} in ${step.durationSeconds}s`),
  ];
  if (result.playwright) {
    const { expected, unexpected, flaky, skipped } = result.playwright;
    lines.push(`- Browser tests: ${expected} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped`);
  }
  if (result.note) lines.push("", result.note);
  for (const failure of result.failures) {
    lines.push("", `## ${failure.title}`, failure.location ? `Location: \`${failure.location}\`` : "",
      ...failure.errors.map((error) => ["```", error.split("\n").slice(0, 30).join("\n"), "```"].join("\n")));
    if (failure.attachments.length) lines.push("Artifacts:", ...failure.attachments.map((file) => `- ${file}`));
    if (failure.location) {
      lines.push(`Rerun: \`npm run test:auth:focused -- --test ${failure.location}\``);
    }
  }
  lines.push("", `Full log: ${result.log}`);
  return `${lines.filter((line) => line !== undefined).join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------

const active = { children: new Set(), container: undefined, interrupted: undefined };

function capture(command, args, env, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", env, timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 16 * 1024 * 1024, cwd: options.cwd, input: options.input });
  if (result.error) throw new TestEnvError(`${command} failed to start: ${result.error.message}`);
  return result;
}

function stream(command, args, { env, cwd, log }) {
  return new Promise((resolve) => {
    const started = Date.now();
    log?.write(`\n$ ${[command, ...args].join(" ")}\n`);
    const child = spawn(command, args, { env, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    active.children.add(child);
    const forward = (target) => (chunk) => { target.write(chunk); log?.write(chunk); };
    child.stdout.on("data", forward(process.stdout));
    child.stderr.on("data", forward(process.stderr));
    child.on("error", (error) => { log?.write(`failed to start: ${error.message}\n`); });
    child.on("close", (code, signal) => {
      active.children.delete(child);
      resolve({ exitCode: code ?? (signal ? 128 : 1), signal, durationSeconds: Math.round((Date.now() - started) / 1000) });
    });
  });
}

async function stopChildren() {
  for (const child of active.children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
  }
  const deadline = Date.now() + 5_000;
  while (active.children.size && Date.now() < deadline) await delay(100);
  for (const child of active.children) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

function supabase(args, env, options = {}) {
  const command = env.BUTTERBOX_TEST_SUPABASE_CLI || "npx";
  const prefix = env.BUTTERBOX_TEST_SUPABASE_CLI ? [] : ["--yes", `supabase@${SUPABASE_VERSION}`];
  return options.stream ? stream(command, [...prefix, ...args], { env, cwd: options.cwd, log: options.log })
    : capture(command, [...prefix, ...args], env, options);
}

function docker(ctx, args, options = {}) {
  return capture("docker", args, testEnvironment(ctx), options);
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

function privateDir(directory, mode = 0o700) {
  fs.mkdirSync(directory, { recursive: true, mode });
  fs.chmodSync(directory, mode);
}

async function ensureVm(ctx) {
  if (ctx.github) return;
  const status = capture("colima", ["status", "--profile", COLIMA_PROFILE], process.env, { timeoutMs: 60_000 });
  const configFile = path.join(ctx.colimaDir, "colima.yaml");
  if (!fs.existsSync(configFile)) {
    privateDir(ctx.colimaDir);
    fs.writeFileSync(configFile, colimaConfig(ctx.runsRoot), { mode: 0o600, flag: "wx" });
  }
  verifyColimaConfig(fs.readFileSync(configFile, "utf8"), ctx.runsRoot);
  privateDir(ctx.docker.DOCKER_CONFIG);
  if (status.status !== 0) {
    console.log(`Starting the dedicated Colima VM "${COLIMA_PROFILE}" (first start downloads its image)…`);
    const started = await stream("colima", ["start", COLIMA_PROFILE], { env: process.env });
    if (started.exitCode !== 0) throw new TestEnvError(`colima start ${COLIMA_PROFILE} failed.`);
  }
}

// The daemon must be the dedicated VM (or GitHub's ephemeral runner) and host no other Supabase project.
function verifyDaemon(ctx) {
  const info = docker(ctx, ["info", "--format", "{{.Name}}"]);
  if (info.status !== 0) throw new TestEnvError("The test Docker daemon is not reachable; run `npm run test:env:up`.");
  if (!ctx.github && info.stdout.trim() !== `colima-${COLIMA_PROFILE}`) {
    throw new TestEnvError(`Refusing to use Docker daemon "${info.stdout.trim()}": not the dedicated test VM.`);
  }
  const projects = docker(ctx, ["ps", "-a", "--format", '{{.Label "com.supabase.cli.project"}}']);
  const foreign = [...new Set(projects.stdout.split("\n").map((line) => line.trim()).filter(Boolean))]
    .filter((project) => project !== PROJECT);
  if (foreign.length) {
    throw new TestEnvError(`Refusing to run: the test daemon also hosts Supabase project(s) ${foreign.join(", ")}.`);
  }
}

function ensureEgressRules(ctx) {
  if (ctx.github) return;
  const result = capture("colima", ["ssh", "--profile", COLIMA_PROFILE, "--", "sudo", "sh", "-c", egressScript()],
    process.env, { timeoutMs: 60_000 });
  if (result.status !== 0) throw new TestEnvError(`Could not apply container egress rules: ${result.stderr.trim()}`);
  verifyEgressRules(result.stdout);
}

function syncSupabase(ctx, source) {
  privateDir(ctx.envDir);
  const target = path.join(ctx.envDir, "supabase");
  for (const name of ["migrations", "tests"]) {
    fs.rmSync(path.join(target, name), { recursive: true, force: true });
    if (fs.existsSync(path.join(source, "supabase", name))) {
      fs.cpSync(path.join(source, "supabase", name), path.join(target, name), { recursive: true, verbatimSymlinks: true });
    }
  }
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "config.toml"),
    testProjectConfig(fs.readFileSync(path.join(ROOT, "supabase/config.toml"), "utf8")));
  fs.chmodSync(ctx.envDir, 0o755);
}

function projectRunning(ctx) {
  const result = docker(ctx, ["inspect", "--format", "{{.State.Running}}", `supabase_db_${PROJECT}`,
    `supabase_kong_${PROJECT}`, `supabase_auth_${PROJECT}`]);
  return result.status === 0 && result.stdout.trim().split("\n").every((line) => line === "true");
}

function writeStatus(ctx) {
  const status = supabase(["status", "--workdir", ctx.envDir, "-o", "json"], testEnvironment(ctx));
  if (status.status !== 0) throw new TestEnvError("Could not read the disposable Supabase status.");
  const parsed = JSON.parse(status.stdout);
  const expected = { API_URL: `http://127.0.0.1:${PORTS.api}`, MAILPIT_URL: `http://127.0.0.1:${PORTS.mail}` };
  for (const [key, value] of Object.entries(expected)) {
    if (parsed[key] !== value) throw new TestEnvError(`Unexpected test project ${key}: ${parsed[key]}`);
  }
  // Only the well-known local development keys of this disposable project.
  const kept = Object.fromEntries(["API_URL", "MAILPIT_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"]
    .map((key) => [key, parsed[key]]));
  fs.writeFileSync(path.join(ctx.envDir, "status.json"), `${JSON.stringify(kept, null, 2)}\n`, { mode: 0o644 });
  return kept;
}

export async function up(ctx, { source = ROOT, log } = {}) {
  await ensureVm(ctx);
  privateDir(ctx.runsRoot);
  verifyDaemon(ctx);
  ensureEgressRules(ctx);
  syncSupabase(ctx, source);
  if (!projectRunning(ctx)) {
    console.log(`Starting disposable Supabase project ${PROJECT}…`);
    const env = testEnvironment(ctx);
    const version = supabase(["--version"], env);
    if (version.stdout.trim() !== SUPABASE_VERSION) {
      throw new TestEnvError(`Supabase CLI ${SUPABASE_VERSION} is required (found ${version.stdout.trim()}).`);
    }
    const started = await supabase(["start", "--workdir", ctx.envDir, "--exclude", EXCLUDED_SERVICES], env,
      { stream: true, log });
    if (started.exitCode !== 0) throw new TestEnvError("Failed to start the disposable Supabase project.");
  }
  verifyDaemon(ctx);
  return writeStatus(ctx);
}

function sourceSnapshot(source, dest) {
  const listing = capture("git", [...SAFE_GIT, "-C", source, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", HOME: os.tmpdir() });
  if (listing.status !== 0) throw new TestEnvError("The source must be a Git working tree.");
  let bytes = 0;
  const files = [...new Set(listing.stdout.split("\0").filter(Boolean))];
  if (files.length > 20_000) throw new TestEnvError("The source has too many files to stage.");
  for (const file of files) {
    if (path.isAbsolute(file) || file.split("/").includes("..")) throw new TestEnvError(`Unsafe path ${file}.`);
    const from = path.join(source, file);
    let stat;
    try { stat = fs.lstatSync(from); } catch { continue; }
    if (stat.isSymbolicLink()) throw new TestEnvError(`Refusing to stage symbolic link ${file}.`);
    if (!stat.isFile()) continue;
    bytes += stat.size;
    if (bytes > 300 * 1024 * 1024) throw new TestEnvError("The source exceeds the 300 MiB staging limit.");
    fs.mkdirSync(path.dirname(path.join(dest, file)), { recursive: true, mode: 0o755 });
    fs.copyFileSync(from, path.join(dest, file));
    fs.chmodSync(path.join(dest, file), stat.mode & 0o111 ? 0o755 : 0o644);
  }
  fs.chmodSync(dest, 0o755);
  const head = capture("git", [...SAFE_GIT, "-C", source, "rev-parse", "HEAD"], { PATH: process.env.PATH });
  const dirty = capture("git", [...SAFE_GIT, "-C", source, "status", "--porcelain"], { PATH: process.env.PATH });
  return { commit: head.status === 0 ? head.stdout.trim() : undefined, dirty: Boolean(dirty.stdout.trim()) };
}

async function acquireLock(ctx, runId, waitMinutes = 30) {
  const lock = path.join(ctx.runsRoot, "lock");
  const deadline = Date.now() + waitMinutes * 60_000;
  let announced = false;
  for (;;) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, runId,
        startedAt: new Date().toISOString() }));
      return () => fs.rmSync(lock, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let owner;
    try { owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")); } catch { /* being written */ }
    if (owner && !alive(owner.pid)) {
      console.log(`Releasing the stale lock of interrupted run ${owner.runId}.`);
      fs.rmSync(lock, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) throw new TestEnvError(`The test environment is busy with run ${owner?.runId}.`);
    if (!announced) console.log(`Waiting for run ${owner?.runId ?? "(starting)"} to finish…`);
    announced = true;
    await delay(2_000);
  }
}

export function cleanup(ctx, { keepRun } = {}) {
  const removed = [];
  if (fs.existsSync(path.join(ctx.runsRoot, "lock"))) {
    let owner;
    try { owner = JSON.parse(fs.readFileSync(path.join(ctx.runsRoot, "lock", "owner.json"), "utf8")); } catch { /**/ }
    if (!owner || (!alive(owner.pid) && owner.runId !== keepRun)) {
      fs.rmSync(path.join(ctx.runsRoot, "lock"), { recursive: true, force: true });
      removed.push("stale lock");
    }
  }
  const containers = docker(ctx, ["ps", "-a", "--filter", `label=${RUN_LABEL}`, "--format",
    `{{.Names}}\t{{.Label "${RUN_LABEL}"}}\t{{.Label "${RUN_LABEL}.owner"}}`]);
  for (const line of containers.stdout.split("\n").filter(Boolean)) {
    const [name, runId, owner] = line.split("\t");
    if (runId === keepRun || alive(Number(owner))) continue;
    docker(ctx, ["rm", "-f", name]);
    removed.push(`container ${name}`);
  }
  const runs = path.join(ctx.runsRoot, "runs");
  if (fs.existsSync(runs)) {
    const entries = fs.readdirSync(runs).filter((name) => /^[0-9TZ-]+-[0-9a-f]{6}$/.test(name)).sort();
    for (const name of entries) {
      if (name === keepRun) continue;
      const src = path.join(runs, name, "src");
      if (fs.existsSync(src)) {
        fs.rmSync(src, { recursive: true, force: true });
        removed.push(`snapshot ${name}`);
      }
    }
    for (const name of entries.slice(0, Math.max(0, entries.length - 20))) {
      if (name !== keepRun) fs.rmSync(path.join(runs, name), { recursive: true, force: true });
    }
  }
  // Controller test-broker artifacts: keep the 20 most recent.
  const agent = path.join(ctx.runsRoot, "agent");
  if (fs.existsSync(agent)) {
    const entries = fs.readdirSync(agent).filter((name) => /^[0-9TZ-]+-issue-\d+-[a-z0-9-]+$/.test(name)).sort();
    for (const name of entries.slice(0, Math.max(0, entries.length - 20))) {
      fs.rmSync(path.join(agent, name), { recursive: true, force: true });
    }
  }
  return removed;
}

function ensureImage(ctx, log) {
  const image = runnerImageTag();
  if (docker(ctx, ["image", "inspect", image]).status === 0) return Promise.resolve(image);
  console.log(`Building isolated runner image ${image} (first use takes several minutes)…`);
  return stream("docker", ["build", "--build-arg", `PLAYWRIGHT_VERSION=${playwrightVersion()}`, "--build-arg",
    `NODE_VERSION=${CI_NODE_VERSION}`, "-t", image, path.join(ROOT, "tools/test-runner")],
  { env: testEnvironment(ctx), log }).then((built) => {
    if (built.exitCode !== 0) throw new TestEnvError("Building the isolated runner image failed.");
    return image;
  });
}

function readReports(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^report-.+\.json$/.test(name)).sort().flatMap((name) => {
    try { return [JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))]; } catch { return []; }
  });
}

export async function run(ctx, options) {
  const source = fs.realpathSync(options.source ?? ROOT);
  if (options.runner === "host") {
    if (source !== fs.realpathSync(ROOT)) {
      throw usageError("The host runner only runs this trusted checkout; use the container runner for other code.");
    }
    if (process.versions.node.split(".")[0] !== CI_NODE_VERSION.split(".")[0]) {
      throw new TestEnvError(`The host runner needs Node.js ${CI_NODE_VERSION.split(".")[0]}.x like CI (found ` +
        `${process.versions.node}); use the container runner or e.g. \`npx node@24 scripts/test-env.mjs …\`.`);
    }
  }
  if (options.artifacts !== undefined && options.runner === "container" && !ctx.github) {
    const resolved = path.resolve(options.artifacts);
    // The dedicated VM shares only the runs root; a bind mount from elsewhere would silently be empty.
    if (!resolved.startsWith(`${ctx.runsRoot}${path.sep}`) || resolved.split(path.sep).includes("..")) {
      throw usageError(`--artifacts must be inside ${ctx.runsRoot} for the container runner.`);
    }
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
  const runDir = path.join(ctx.runsRoot, "runs", runId);
  privateDir(ctx.runsRoot);
  privateDir(runDir);
  const artifacts = options.artifacts ?? path.join(runDir, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  // The runner container's unprivileged user writes reports here; the private staging root still guards it.
  fs.chmodSync(artifacts, 0o777);
  const logFile = path.join(artifacts, "run.log");
  const log = fs.createWriteStream(logFile, { flags: "a", mode: 0o644 });
  const started = Date.now();
  const result = { schema: 1, runId, suite: options.suite, runner: options.runner, status: "error",
    startedAt: new Date(started).toISOString(), source: { path: source }, steps: [], failures: [], log: logFile,
    artifacts, selection: { grep: options.grep, tests: options.tests, repeat: options.repeat } };
  let release;
  let timer;
  const finish = (status, note) => {
    result.status = status;
    if (note) result.note = note;
  };
  try {
    timer = setTimeout(() => {
      active.interrupted = "timeout";
      console.error(`Time limit of ${options.timeoutMinutes} minutes reached; stopping the run.`);
      void stopRun(ctx);
    }, options.timeoutMinutes * 60_000);
    release = await acquireLock(ctx, runId);
    const removed = cleanup(ctx, { keepRun: runId });
    if (removed.length) console.log(`Cleaned up after interrupted runs: ${removed.join(", ")}.`);
    const src = path.join(runDir, "src");
    fs.mkdirSync(src, { mode: 0o755 });
    Object.assign(result.source, sourceSnapshot(source, src));
    await up(ctx, { source: src, log });
    if (active.interrupted) throw new TestEnvError("stopped");
    console.log(`Resetting ${PROJECT} with the migrations under test…`);
    const reset = await supabase(["db", "reset", "--local", "--workdir", ctx.envDir], testEnvironment(ctx),
      { stream: true, log });
    result.steps.push({ name: "reset", ...reset });
    if (reset.exitCode !== 0) throw new TestEnvError("Applying the migrations under test failed (see the log).");
    writeStatus(ctx);
    const image = options.runner === "container" ? await ensureImage(ctx, log) : undefined;
    const reportDir = path.join(artifacts, "playwright");
    for (const step of SUITES[options.suite].steps) {
      if (active.interrupted) break;
      console.log(`\n=== ${step} ===`);
      let outcome;
      if (step === "db") {
        outcome = await supabase(["test", "db", path.join(ctx.envDir, "supabase/tests/database"), "--local",
          "--workdir", ctx.envDir], testEnvironment(ctx), { stream: true, log, cwd: ctx.envDir });
      } else if (options.runner === "container") {
        active.container = `${PROJECT}-run-${runId}`;
        outcome = await stream("docker", runnerArgs({ runId, image, suite: step, src, envDir: ctx.envDir,
          artifacts, options }), { env: testEnvironment(ctx), log });
        active.container = undefined;
      } else {
        const script = step === "auth" ? "scripts/test-auth.mjs" : "scripts/test-tenant-isolation.mjs";
        outcome = await stream(process.execPath, [script, ctx.envDir], { cwd: ROOT, log,
          env: testEnvironment(ctx, process.env, {
            BUTTERBOX_TEST_DISPOSABLE: "yes",
            BUTTERBOX_TEST_SUPABASE_STATUS_FILE: path.join(ctx.envDir, "status.json"),
            BUTTERBOX_TEST_REPORT_DIR: reportDir,
            ...(options.grep !== undefined ? { BUTTERBOX_TEST_GREP: options.grep } : {}),
            ...(options.tests.length ? { BUTTERBOX_TEST_SELECTIONS: options.tests.join(",") } : {}),
            ...(options.repeat ? { BUTTERBOX_TEST_REPEAT: String(options.repeat) } : {}),
          }) });
      }
      result.steps.push({ name: step, ...outcome });
      if (outcome.exitCode !== 0) break;
    }
    const reports = readReports(reportDir);
    if (reports.length) {
      const summary = summarizeReports(reports, artifacts);
      result.playwright = summary.stats;
      result.failures = summary.failures;
    }
    if (active.interrupted) finish(active.interrupted);
    else if (result.steps.every((step) => step.exitCode === 0)) {
      finish(result.playwright && result.playwright.expected === 0 && SUITES[options.suite].steps.includes("auth")
        ? "failed" : "passed", result.playwright?.expected === 0 ? "No browser test matched the selection." : undefined);
    } else finish("failed");
  } catch (error) {
    if (active.interrupted) finish(active.interrupted);
    else finish("error", `Environment error: ${error.message}`);
    if (!(error instanceof TestEnvError)) console.error(error);
  } finally {
    clearTimeout(timer);
    await stopRun(ctx);
    fs.rmSync(path.join(runDir, "src"), { recursive: true, force: true });
    release?.();
    result.finishedAt = new Date().toISOString();
    result.durationSeconds = Math.round((Date.now() - started) / 1000);
    fs.writeFileSync(path.join(artifacts, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o644 });
    fs.writeFileSync(path.join(artifacts, "summary.md"), summaryMarkdown(result), { mode: 0o644 });
    await new Promise((resolve) => log.end(resolve));
  }
  console.log(`\n${summaryMarkdown(result)}`);
  console.log(`Result: ${path.join(artifacts, "result.json")}`);
  return result;
}

async function stopRun(ctx) {
  if (active.container) {
    docker(ctx, ["rm", "-f", active.container]);
    active.container = undefined;
  }
  await stopChildren();
}

function status(ctx) {
  const vm = ctx.github ? "GitHub Actions runner" : capture("colima", ["status", "--profile", COLIMA_PROFILE],
    process.env).status === 0 ? "running" : "stopped";
  console.log(`VM (${COLIMA_PROFILE}): ${vm}`);
  if (vm === "stopped") return;
  verifyDaemon(ctx);
  console.log(`Project ${PROJECT}: ${projectRunning(ctx) ? "running" : "stopped"} (API 127.0.0.1:${PORTS.api}, ` +
    `DB ${PORTS.db}, Mailpit ${PORTS.mail})`);
  if (!ctx.github) {
    const rules = capture("colima", ["ssh", "--profile", COLIMA_PROFILE, "--", "sudo", "iptables", "-S",
      "DOCKER-USER"], process.env);
    try { verifyEgressRules(rules.stdout); console.log("Container egress rules: present"); } catch (error) {
      console.log(`Container egress rules: ${error.message}`);
    }
  }
  const lock = path.join(ctx.runsRoot, "lock", "owner.json");
  console.log(`Lock: ${fs.existsSync(lock) ? fs.readFileSync(lock, "utf8") : "free"}`);
  const runs = path.join(ctx.runsRoot, "runs");
  for (const name of fs.existsSync(runs) ? fs.readdirSync(runs).sort().slice(-5) : []) {
    const file = path.join(runs, name, "artifacts", "result.json");
    const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
    console.log(`Run ${name}: ${result ? `${result.suite} ${result.status}` : "no result (interrupted?)"}`);
  }
}

async function down(ctx, options) {
  if (!ctx.github && capture("colima", ["status", "--profile", COLIMA_PROFILE], process.env).status !== 0) {
    console.log("The dedicated VM is not running.");
    return;
  }
  verifyDaemon(ctx);
  if (fs.existsSync(path.join(ctx.envDir, "supabase/config.toml"))) {
    const stopped = await supabase(["stop", "--workdir", ctx.envDir, "--no-backup"], testEnvironment(ctx),
      { stream: true });
    if (stopped.exitCode !== 0) throw new TestEnvError("supabase stop failed.");
  }
  cleanup(ctx);
  fs.rmSync(ctx.envDir, { recursive: true, force: true });
  if (options.vm && !ctx.github) await stream("colima", ["stop", COLIMA_PROFILE], { env: process.env });
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return error.exitCode ?? EXIT.usage;
  }
  if (["help", "--help"].includes(options.command)) {
    console.log(USAGE);
    return 0;
  }
  const ctx = context();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (active.interrupted) return;
      active.interrupted = "interrupted";
      console.error(`Received ${signal}; stopping the run and cleaning up.`);
      void stopRun(ctx);
    });
  }
  try {
    if (options.command === "up") {
      await up(ctx);
      console.log(`Disposable ${PROJECT} is ready at http://127.0.0.1:${PORTS.api}.`);
    } else if (options.command === "down") await down(ctx, options);
    else if (options.command === "status") status(ctx);
    else if (options.command === "cleanup") {
      verifyDaemon(ctx);
      const removed = cleanup(ctx);
      console.log(removed.length ? `Removed: ${removed.join(", ")}` : "Nothing to clean up.");
    } else {
      const result = await run(ctx, options);
      return EXIT[result.status] ?? EXIT.error;
    }
    return 0;
  } catch (error) {
    console.error(error.message);
    return error.exitCode ?? EXIT.error;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
