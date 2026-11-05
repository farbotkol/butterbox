import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { cp } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { project, readEnvironment, showcaseStatus, verify } from "./showcase-environment.mjs";
import { assertKnownFixtureAccounts, fixturePlan } from "./showcase-fixtures.mjs";
import { createPublicGateway, publicShowcaseOrigin } from "./showcase-public-gateway.mjs";

const appPort = 3141;
const gatewayPort = 3140;
const tunnelProfile = "butterbox-showcase";

function snapshotFor(workdir) {
  const snapshot = path.join(path.dirname(workdir), "butterbox-showcase-public", "app");
  const stat = fs.lstatSync(snapshot);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid() ||
      fs.realpathSync(snapshot) !== snapshot) {
    throw new Error("The separate public showcase snapshot must be a private, real directory.");
  }
  return snapshot;
}

async function verifiedSettings(workdir) {
  await verify(workdir);
  const { manifest, testOwnerEmail } = readEnvironment(workdir);
  const stateFile = path.join(workdir, "fixture-state.json");
  const stat = fs.lstatSync(stateFile);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) {
    throw new Error("The showcase fixture inventory must be private and operator-owned.");
  }
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const plan = fixturePlan(manifest.id);
  if (state.project !== project || state.namespace !== manifest.id || state.phase !== "seeded" ||
      state.simulationOnly !== true || state.plan?.businessId !== plan.businessId ||
      state.plan?.outsideId !== plan.outsideId || state.plan?.venueId !== plan.venueId) {
    throw new Error("The seeded synthetic showcase inventory is unverified.");
  }

  const settings = showcaseStatus(workdir);
  const admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("Could not verify showcase identities.");
  assertKnownFixtureAccounts(users.data.users, state.accounts, manifest.id, testOwnerEmail);
  const businesses = await admin.from("businesses").select("id,name");
  const expectedBusinesses = new Map([
    [plan.businessId, "SIMULATION ONLY - Wattle and Wave Cafe"],
    [plan.outsideId, "SIMULATION ONLY - Private isolation control"],
  ]);
  if (businesses.error || businesses.data.length !== expectedBusinesses.size ||
      businesses.data.some((business) => expectedBusinesses.get(business.id) !== business.name)) {
    throw new Error("The showcase business inventory does not match the fictional fixture.");
  }
  const venues = await admin.from("venues").select("id,business_id,name");
  if (venues.error || venues.data.length !== 1 || venues.data[0].id !== plan.venueId ||
      venues.data[0].business_id !== plan.businessId ||
      venues.data[0].name !== "SIMULATION ONLY - Harbour Cafe") {
    throw new Error("The showcase venue inventory does not match the fictional fixture.");
  }
  const employees = await admin.from("employees").select("id,name,email,business_id");
  const expectedEmployees = new Map(plan.staff.map((employee) => [employee.id, employee]));
  if (employees.error || employees.data.length !== expectedEmployees.size ||
      employees.data.some((employee) => {
        const expected = expectedEmployees.get(employee.id);
        return !expected || employee.business_id !== plan.businessId ||
          employee.name !== expected.name || employee.email !== expected.email;
      })) {
    throw new Error("The showcase employee inventory does not match the fictional fixture.");
  }
  return settings;
}

function applicationEnvironment(settings) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !name.startsWith("SUPABASE_") && !name.startsWith("NEXT_PUBLIC_") &&
    !name.startsWith("BUTTERBOX_TEST_") && name !== "CODESPACE_NAME" && name !== "NODE_OPTIONS"));
  return {
    ...inherited,
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: settings.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: settings.ANON_KEY,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3137",
    NEXT_PUBLIC_BUTTERBOX_SHOWCASE: "true",
    NEXT_PUBLIC_BUTTERBOX_PUBLIC_SHOWCASE: "true",
    BUTTERBOX_OPERATIONS_TOKEN: randomBytes(32).toString("base64url"),
  };
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Public showcase build failed: ${command} exited ${result.status}.`);
}

async function build(workdir) {
  const snapshot = snapshotFor(workdir);
  const env = applicationEnvironment(await verifiedSettings(workdir));
  run("npm", ["run", "build", "--", "--experimental-build-mode", "compile"], snapshot, env);
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], snapshot, env);
  run("npm", ["run", "build", "--", "--experimental-build-mode", "generate"], snapshot, env);
  await cp(path.join(snapshot, "public"), path.join(snapshot, ".next/standalone/public"), { recursive: true });
  await cp(path.join(snapshot, ".next/static"), path.join(snapshot, ".next/standalone/.next/static"), { recursive: true });
  await cp(path.join(snapshot, "docs/USER_GUIDE.md"), path.join(snapshot, ".next/standalone/docs/USER_GUIDE.md"));
  console.log("The separate public showcase production build is ready; the local showcase was not rebuilt.");
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => probe.close(resolve));
  });
}

async function waitForApplication(child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The separate public showcase app exited before becoming ready.");
    }
    try {
      const login = await fetch(`http://127.0.0.1:${appPort}/login`, { signal: AbortSignal.timeout(2000) });
      const page = await login.text();
      const ready = await fetch(`http://127.0.0.1:${appPort}/api/ready`, { signal: AbortSignal.timeout(5000) });
      if (login.ok && page.includes("SIMULATION ONLY") &&
          page.includes("This public demo uses pre-provisioned fictional accounts.") && ready.ok) return;
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
    }
    await delay(500);
  }
  throw new Error("The separate public showcase app did not pass its guarded readiness checks.");
}

export function assertDedicatedTunnelStatus(output, origin) {
  const host = new URL(publicShowcaseOrigin(origin)).hostname;
  const routes = output.split(/\r?\n/).filter((line) => line.includes(" → "));
  if (routes.length !== 1 || routes[0].trim() !== `${host}  →  127.0.0.1:${gatewayPort}` ||
      !/^Service: stopped\b/m.test(output)) {
    throw new Error("The dedicated showcase tunnel must be stopped and route only to the loopback gateway.");
  }
}

function verifiedTunnel(workdir, origin) {
  const executable = path.join(path.dirname(workdir), "butterbox-showcase-public", "bin", "opentunnel");
  const stat = fs.lstatSync(executable);
  if (!stat.isFile() || (stat.mode & 0o022) !== 0 || stat.uid !== process.getuid() ||
      fs.realpathSync(executable) !== executable) {
    throw new Error("The public tunnel executable must be an operator-owned, non-writable real file.");
  }
  const status = spawnSync(executable, ["--profile", tunnelProfile, "status"], {
    encoding: "utf8", timeout: 10_000,
  });
  if (status.error || status.status !== 0) throw new Error("Could not verify the dedicated showcase tunnel profile.");
  assertDedicatedTunnelStatus(status.stdout, origin);
  return executable;
}

async function terminate(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (!(await Promise.race([exited.then(() => true), delay(5000, false)]))) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function serve(workdir, origin) {
  const publicOrigin = publicShowcaseOrigin(origin);
  const snapshot = snapshotFor(workdir);
  const tunnelExecutable = verifiedTunnel(workdir, publicOrigin);
  const env = {
    ...applicationEnvironment(await verifiedSettings(workdir)),
    HOSTNAME: "127.0.0.1",
    PORT: String(appPort),
  };
  await assertPortAvailable(appPort);
  await assertPortAvailable(gatewayPort);
  const standalone = path.join(snapshot, ".next/standalone");
  const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
    cwd: standalone, env, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  let gateway;
  let tunnel;
  let stopping = false;
  let shutdown;
  async function stop() {
    if (shutdown) return shutdown;
    stopping = true;
    shutdown = (async () => {
      await terminate(tunnel);
      if (gateway?.listening) {
        gateway.closeAllConnections();
        await new Promise((resolve) => gateway.close(resolve));
      }
      await terminate(child);
    })();
    return shutdown;
  }
  function failed(component, details) {
    if (stopping) return;
    console.error(`The public showcase ${component} stopped.`, details);
    void stop().then(() => { process.exitCode = 1; });
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => { void stop().then(() => process.exit(0)); });
  }
  child.once("exit", (code, signal) => failed("application", { code, signal }));
  child.once("error", (error) => failed("application", { code: error.code }));
  try {
    await waitForApplication(child);
    gateway = createPublicGateway({ origin: publicOrigin, upstreamPort: appPort });
    await new Promise((resolve, reject) => {
      gateway.once("error", reject);
      gateway.listen({ host: "127.0.0.1", port: gatewayPort, exclusive: true }, resolve);
    });
    gateway.on("error", (error) => failed("gateway", { code: error.code }));
    gateway.once("close", () => failed("gateway", { reason: "closed" }));
    tunnel = spawn(tunnelExecutable, ["--profile", tunnelProfile, "serve"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    tunnel.stdout.pipe(process.stdout);
    tunnel.stderr.pipe(process.stderr);
    tunnel.once("exit", (code, signal) => failed("tunnel", { code, signal }));
    tunnel.once("error", (error) => failed("tunnel", { code: error.code }));
    await once(tunnel, "spawn");
    console.log(`Public showcase gateway ready on 127.0.0.1:${gatewayPort}; supervised TLS tunnel starting.`);
  } catch (error) {
    await stop();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, workdir, origin, ...extra] = process.argv.slice(2);
    if (!workdir || extra.length || !["build", "serve"].includes(action) ||
        (action === "build" && origin) || (action === "serve" && !origin)) {
      throw new Error("Usage: node scripts/public-showcase.mjs build|serve /private/path/butterbox-showcase [public-https-origin]");
    }
    if (action === "build") await build(workdir);
    else await serve(workdir, origin);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Public showcase operation failed.");
    process.exitCode = 1;
  }
}
