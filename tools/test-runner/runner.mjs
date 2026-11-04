// Entry point of the isolated test runner container (see scripts/test-env.mjs). It accepts only an allowlisted suite
// name, exposes the disposable Supabase stack on the same loopback ports used outside the container, installs the
// code under test from its read-only snapshot and runs that suite with the repository's own test command.
import { spawn } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const suites = {
  auth: ["scripts/test-auth.mjs", "/env"],
  tenant: ["scripts/test-tenant-isolation.mjs", "/env"],
};
const suite = process.env.BUTTERBOX_RUNNER_SUITE;
const project = process.env.BUTTERBOX_RUNNER_PROJECT;
const ports = {
  api: Number(process.env.BUTTERBOX_RUNNER_API_PORT),
  db: Number(process.env.BUTTERBOX_RUNNER_DB_PORT),
  mail: Number(process.env.BUTTERBOX_RUNNER_MAIL_PORT),
};
if (!Object.hasOwn(suites, suite) || !/^[a-z0-9][a-z0-9_-]*$/.test(project ?? "") ||
    Object.values(ports).some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)) {
  console.error("runner: invalid suite or project settings");
  process.exit(2);
}

function forward(localPort, host, port) {
  const server = net.createServer((client) => {
    const upstream = net.connect(port, host);
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on("error", close);
    upstream.on("error", close);
    client.pipe(upstream).pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(localPort, "127.0.0.1", () => resolve(server));
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", cwd: "/work", ...options });
    const stop = (signal) => child.kill(signal);
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    child.on("error", (error) => { console.error(`runner: ${command} failed to start: ${error.message}`); resolve(127); });
    child.on("exit", (code, signal) => {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
      resolve(code ?? (signal ? 128 : 1));
    });
  });
}

const servers = await Promise.all([
  forward(ports.api, `supabase_kong_${project}`, 8000),
  forward(ports.db, `supabase_db_${project}`, 5432),
  forward(ports.mail, `supabase_inbucket_${project}`, 8025),
]);
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${ports.api}/auth/v1/health`, { signal: AbortSignal.timeout(2_000) });
    ready = response.status < 500;
  } catch {
    await delay(1_000);
  }
}
if (!ready) {
  console.error("runner: the disposable Supabase API is not reachable from the runner");
  process.exit(3);
}

console.log("runner: copying the code under test");
let code = await run("cp", ["-a", "/src/.", "/work/"]);
if (code === 0) {
  console.log("runner: npm ci");
  code = await run("npm", ["ci", "--no-audit", "--no-fund", "--prefer-offline"]);
  if (code !== 0) console.error(`runner: npm ci failed (exit ${code})`);
}
if (code === 0) {
  console.log(`runner: running suite ${suite}`);
  code = await run(process.execPath, suites[suite], {
    env: {
      ...process.env,
      BUTTERBOX_TEST_DISPOSABLE: "yes",
      BUTTERBOX_TEST_SUPABASE_STATUS_FILE: "/env/status.json",
      BUTTERBOX_TEST_REPORT_DIR: "/artifacts/playwright",
    },
  });
}
for (const server of servers) server.close();
process.exit(code);
