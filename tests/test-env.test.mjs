import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BLOCKED_RANGES, LOCAL_RUNS_ROOT, PORTS, PROJECT, colimaConfig, context, egressScript, parseArgs, runnerArgs,
  summarizeReports, summaryMarkdown, testEnvironment, testProjectConfig, verifyColimaConfig, verifyEgressRules,
} from "../scripts/test-env.mjs";
import { controllerChanged, fastEnvironment, parseFastArgs } from "../scripts/test-fast.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTH = "tests/e2e/auth.spec.mjs";

test("test-env accepts only allowlisted suites and well-formed selections", () => {
  const focused = parseArgs(["run", "auth-focused", "--test", `${AUTH}:4482`, "--test", `${AUTH}:7137`,
    "--grep", "venue geofences"]);
  assert.deepEqual(focused.tests, [`${AUTH}:4482`, `${AUTH}:7137`]);
  assert.equal(focused.runner, "container");
  assert.equal(focused.timeoutMinutes, 30);
  assert.equal(parseArgs(["run", "database"]).timeoutMinutes, 100);
  assert.equal(parseArgs(["run", "auth-focused", "--grep", "geofence", "--repeat", "5"]).repeat, 5);

  for (const argv of [
    ["run", "shell"], ["exec", "ls"], ["run", "auth-focused"],
    ["run", "auth", "--grep", "x"], ["run", "auth-focused", "--test", "tests/e2e/other.spec.mjs:1"],
    ["run", "auth-focused", "--test", `${AUTH}:0`], ["run", "auth-focused", "--test", `${AUTH}:12;rm -rf /`],
    ["run", "auth-focused", "--grep", "a\nb"], ["run", "auth-focused", "--grep", "x".repeat(201)],
    ["run", "auth-focused", "--grep", "x", "--runner", "docker"],
    ["run", "auth-focused", "--grep", "x", "--source", "relative/path"],
    ["run", "auth-focused", "--grep", "x", "--timeout-minutes", "61"],
    ["run", "auth-focused", "--grep", "x", "--repeat", "11"], ["run", "auth-focused", "--grep", "x", "--repeat", "1.5"],
    ["run", "auth", "--repeat", "2"], ["run", "auth-focused", "--grep", "x", "--unknown"], ["status", "--grep", "x"], ["run", "tenant", "--grep"],
  ]) {
    assert.throws(() => parseArgs(argv), (error) => error.exitCode === 2, argv.join(" "));
  }
  assert.throws(() => parseArgs(["run", "auth-focused", ...Array.from({ length: 21 },
    (_, index) => ["--test", `${AUTH}:${index + 1}`]).flat()]), /at most 20/);
  assert.equal(parseArgs(["down", "--vm"]).vm, true);
});

test("the disposable project uses fixed dedicated ports and never the developer or showcase projects", () => {
  const config = testProjectConfig(`project_id = "butterbox"

[api]
enabled = true
port = 54321

[db]
port = 54322
major_version = 17

[studio]
enabled = true
port = 54323

[auth]
site_url = "http://localhost:3000"
`);
  assert.match(config, new RegExp(`^project_id = "${PROJECT}"$`, "m"));
  assert.doesNotMatch(config, /project_id = "butterbox"$/m);
  assert.doesNotMatch(config, /= (5432|5742|5842)\d$/m);
  assert.match(config, new RegExp(`\\[api\\]\\nenabled = true\\nport = ${PORTS.api}`));
  assert.match(config, new RegExp(`\\[db\\]\\nport = ${PORTS.db}\\nmajor_version = 17\\nshadow_port = ${PORTS.shadow}`));
  assert.match(config, new RegExp(`\\[studio\\]\\nenabled = false\\nport = ${PORTS.studio}`));
  assert.match(config, new RegExp(`\\[local_smtp\\]\\nenabled = true\\nport = ${PORTS.mail}`));
  assert.match(config, /\[analytics\]\nenabled = false/);
  assert.match(config, /\[edge_runtime\]\nenabled = false/);
  assert.match(config, /site_url = "http:\/\/localhost:3000"/);
  assert.throws(() => testProjectConfig("[inbucket]\nport = 1\n"), /local_smtp/);
  for (const port of Object.values(PORTS)) assert.ok(port >= 59420 && port <= 59424);
});

test("the dedicated VM may share only the staging folder", () => {
  assert.doesNotThrow(() => verifyColimaConfig(colimaConfig()));
  assert.match(colimaConfig(), new RegExp(`mounts:\\n  - location: ${LOCAL_RUNS_ROOT}\\n    writable: true`));
  assert.match(colimaConfig(), /forwardAgent: false/);
  for (const unsafe of [
    colimaConfig().replace(LOCAL_RUNS_ROOT, "/Users"),
    colimaConfig().replace("mounts:\n", "mounts:\n  - location: ~\n    writable: true\n"),
    colimaConfig().replace("forwardAgent: false", "forwardAgent: true"),
    colimaConfig().replace(/mounts:[\s\S]*?env:/, "mounts: []\nenv:"),
  ]) {
    assert.throws(() => verifyColimaConfig(unsafe), /must share only/);
  }
});

test("container egress to the host gateway and private networks is rejected", () => {
  const script = egressScript();
  for (const range of ["192.168.0.0/16", "10.0.0.0/8", "169.254.0.0/16", "100.64.0.0/10"]) {
    assert.ok(BLOCKED_RANGES.includes(range));
    assert.match(script, new RegExp(`iptables -I DOCKER-USER -d ${range.replaceAll(".", "\\.")} -j REJECT`));
  }
  assert.match(script, /--dport 53 -j ACCEPT/);
  const listing = BLOCKED_RANGES.map((range) => `-A DOCKER-USER -d ${range} -j REJECT`).join("\n");
  assert.doesNotThrow(() => verifyEgressRules(listing));
  assert.throws(() => verifyEgressRules(listing.replace("-A DOCKER-USER -d 192.168.0.0/16 -j REJECT", "")),
    /192\.168\.0\.0\/16/);
});

test("test processes receive an allowlisted environment without credentials", () => {
  const ctx = context({ HOME: "/home/dev" }, "/home/dev");
  assert.equal(ctx.runsRoot, LOCAL_RUNS_ROOT);
  assert.equal(ctx.docker.DOCKER_HOST, "unix:///home/dev/.colima/butterbox-ci/docker.sock");
  assert.equal(ctx.docker.DOCKER_CONFIG, "/home/dev/.colima/butterbox-ci/docker-config");
  const env = testEnvironment(ctx, {
    PATH: "/usr/bin", HOME: "/home/dev", GH_TOKEN: "secret", GITHUB_TOKEN: "secret", SUPABASE_ACCESS_TOKEN: "secret",
    SUPABASE_SERVICE_ROLE_KEY: "secret", NEXT_PUBLIC_SUPABASE_URL: "https://prod.example", AWS_SECRET_ACCESS_KEY: "x",
    DOCKER_HOST: "unix:///var/run/docker.sock", BUTTERBOX_SHOWCASE_URL: "https://demo.example",
  });
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "SUPABASE_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL", "AWS_SECRET_ACCESS_KEY", "BUTTERBOX_SHOWCASE_URL"]) {
    assert.equal(env[key], undefined, key);
  }
  assert.equal(env.DOCKER_HOST, ctx.docker.DOCKER_HOST);

  const github = context({ GITHUB_ACTIONS: "true", RUNNER_TEMP: "/tmp/runner" });
  assert.equal(github.runsRoot, "/tmp/runner/butterbox-test-runs");
  assert.deepEqual(github.docker, {});
  assert.throws(() => context({ GITHUB_ACTIONS: "true" }), /RUNNER_TEMP/);
});

test("the runner container is unprivileged, resource-limited and has no Docker socket or home mount", () => {
  const args = runnerArgs({ runId: "r1", image: "butterbox-test-runner:abc", suite: "auth", src: "/s/src",
    envDir: "/s/env", artifacts: "/s/artifacts", options: { grep: "geofence", tests: [`${AUTH}:4482`], repeat: 3 } });
  const joined = args.join(" ");
  for (const flag of ["--cap-drop ALL", "--security-opt no-new-privileges", "--pids-limit 4096", "--memory 3g",
    "--cpus 2", "--rm", `--network supabase_network_${PROJECT}`]) {
    assert.ok(joined.includes(flag), flag);
  }
  assert.ok(args.includes("type=bind,src=/s/src,dst=/src,readonly"));
  assert.ok(args.includes("type=bind,src=/s/env,dst=/env,readonly"));
  assert.ok(args.includes("BUTTERBOX_TEST_GREP=geofence"));
  assert.ok(args.includes(`BUTTERBOX_TEST_SELECTIONS=${AUTH}:4482`));
  assert.ok(args.includes("BUTTERBOX_TEST_REPEAT=3"));
  assert.doesNotMatch(joined, /docker\.sock|--privileged|--network host|\/Users|\/home\/dev|-v /);
  assert.equal(args.at(-1), "butterbox-test-runner:abc");
});

test("Playwright reports become actionable failures with artifacts and rerun commands", () => {
  const report = {
    stats: { expected: 2, unexpected: 1, flaky: 0, skipped: 1 },
    suites: [{ title: "auth.spec.mjs", file: "auth.spec.mjs", specs: [
      { title: "passes", ok: true, file: "auth.spec.mjs", line: 1, tests: [] },
      { title: "draft shifts", ok: false, file: "auth.spec.mjs", line: 7137, tests: [{ results: [{
        errors: [{ message: "\u001b[31mExpected: 0\u001b[39m\nReceived: 1" }],
        attachments: [{ name: "trace", path: "/artifacts/playwright/test-results-1/trace.zip" }, { name: "x" }],
      }] }] },
    ] }],
    errors: [{ message: "worker crashed" }],
  };
  const summary = summarizeReports([report], "/runs/r1/artifacts");
  assert.deepEqual(summary.stats, { expected: 2, unexpected: 1, flaky: 0, skipped: 1 });
  assert.equal(summary.failures.length, 2);
  assert.deepEqual(summary.failures[0], {
    title: "draft shifts", location: `${AUTH}:7137`, errors: ["Expected: 0\nReceived: 1"],
    attachments: ["/runs/r1/artifacts/playwright/test-results-1/trace.zip"],
  });
  const markdown = summaryMarkdown({ suite: "auth-focused", status: "failed", runId: "r1", runner: "container",
    durationSeconds: 10, source: { commit: "abc", dirty: true }, steps: [{ name: "auth", exitCode: 1,
      durationSeconds: 9 }], playwright: summary.stats, failures: summary.failures, log: "/runs/r1/artifacts/run.log" });
  assert.match(markdown, /FAILED/);
  assert.match(markdown, /abc with uncommitted changes/);
  assert.match(markdown, new RegExp(`Rerun: \`npm run test:auth:focused -- --test ${AUTH}:7137\``));
  assert.match(markdown, /trace\.zip/);
});

const shim = path.join(root, "tools/test-runner/docker-shim.mjs");
const runShim = (args, env = {}) => spawnSync(process.execPath, [shim, ...args], { encoding: "utf8", env: {
  PATH: process.env.PATH, BUTTERBOX_RUNNER_PROJECT: PROJECT, BUTTERBOX_RUNNER_API_PORT: String(PORTS.api),
  BUTTERBOX_RUNNER_DB_PORT: String(PORTS.db), ...env } });

test("the runner's docker shim answers only disposable-project lookups", () => {
  const project = runShim(["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}',
    `supabase_db_${PROJECT}`]);
  assert.equal(project.status, 0);
  assert.equal(project.stdout, `${PROJECT}\n`);
  const port = runShim(["inspect", "--format", '{{ (index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort }}',
    `supabase_kong_${PROJECT}`]);
  assert.equal(port.stdout, `${PORTS.api}\n`);
  for (const args of [
    ["inspect", "--format", "{{.Name}}", "supabase_db_butterbox"],
    ["inspect", "--format", '"com.supabase.cli.project"', "supabase_db_butterbox-showcase"],
    ["exec", "supabase_db_butterbox", "psql"], ["exec", "-i", `supabase_db_${PROJECT}`, "sh", "-c", "id"],
    ["run", "--privileged", "alpine"], ["ps"], [],
  ]) {
    const result = runShim(args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
  }
  assert.equal(runShim(["ps"], { BUTTERBOX_RUNNER_PROJECT: "" }).status, 125);
});

test("fast verification selects steps and runs the slow controller suite only for controller changes", () => {
  assert.deepEqual(parseFastArgs([]).steps, ["unit", "controller", "lint", "types"]);
  assert.deepEqual(parseFastArgs(["--only=lint,unit"]).steps, ["unit", "lint"]);
  assert.deepEqual(parseFastArgs(["--skip=lint,types"]).steps, ["unit", "controller"]);
  assert.equal(parseFastArgs(["--only=controller"]).explicit, true);
  assert.throws(() => parseFastArgs(["--only=deploy"]), /Unknown step/);
  assert.throws(() => parseFastArgs(["--skip=unit,controller,lint,types"]), /No steps/);
  assert.throws(() => parseFastArgs(["rm"]), /Unknown option/);
  assert.equal(controllerChanged(["src/app/page.tsx"]), false);
  assert.equal(controllerChanged(["tools/agent-controller/listener.mjs"]), true);
  assert.equal(controllerChanged(null), true);
  assert.equal(fastEnvironment({ TMPDIR: "/tmp" }).TMPDIR, (spawnSync("realpath", ["/tmp"], { encoding: "utf8" })
    .stdout || "/tmp\n").trim());
});
