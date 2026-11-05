import { spawnSync } from "node:child_process";
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testSupabaseStatus } from "./test-supabase-status.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const project = "butterbox-showcase";
export const network = "butterbox-showcase-isolated";
export const ports = { api: 57421, db: 57422, mail: 57424 };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const environment = (credentials) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("SUPABASE_"))),
  ...credentials,
});

export function showcaseStatus(workdir) {
  const { credentials } = readEnvironment(workdir);
  if (!process.env.BUTTERBOX_TEST_SUPABASE_CLI) throw new Error("Set BUTTERBOX_TEST_SUPABASE_CLI to the verified local CLI executable.");
  const status = testSupabaseStatus(workdir, environment(credentials));
  if (status.API_URL !== `http://127.0.0.1:${ports.api}` || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("Showcase API status does not match the fixed local project.");
  }
  return status;
}

export const config = `project_id = "${project}"

[api]
enabled = true
port = ${ports.api}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${ports.db}
shadow_port = 57420
major_version = 17
root_key = "env(BUTTERBOX_SHOWCASE_DB_ROOT_KEY)"

[db.seed]
enabled = false

[studio]
enabled = false

[local_smtp]
enabled = true
port = ${ports.mail}

[auth]
enabled = true
site_url = "http://127.0.0.1:3137"
additional_redirect_urls = ["http://127.0.0.1:3137/**"]
enable_signup = false
jwt_secret = "env(BUTTERBOX_SHOWCASE_JWT_SECRET)"
publishable_key = "env(BUTTERBOX_SHOWCASE_PUBLISHABLE_KEY)"
secret_key = "env(BUTTERBOX_SHOWCASE_SECRET_KEY)"
signing_keys_path = "./signing-keys.json"

[auth.email]
enable_signup = true
enable_confirmations = true

[analytics]
enabled = false

[edge_runtime]
enabled = false
`;

function privateFile(filename, contents) {
  fs.writeFileSync(filename, contents, { flag: "wx", mode: 0o600 });
}

function assertPath(workdir) {
  if (!path.isAbsolute(workdir) || path.basename(workdir) !== project ||
      path.relative(root, workdir) === "" || !path.relative(root, workdir).startsWith(`..${path.sep}`)) {
    throw new Error("Use a new absolute butterbox-showcase directory outside the repository.");
  }
}

export function normalizeTestOwnerEmail(email) {
  if (typeof email !== "string" || !/^test[a-z0-9_-]{1,60}@butterbox\.com$/i.test(email)) {
    throw new Error("The showcase owner must be an internal test-only address beginning with test at butterbox.com.");
  }
  return email.toLowerCase();
}

export function prepare(workdir, testOwnerEmail) {
  assertPath(workdir);
  const ownerEmail = testOwnerEmail === undefined ? undefined : normalizeTestOwnerEmail(testOwnerEmail);
  fs.mkdirSync(workdir, { mode: 0o700 });
  if (fs.realpathSync(workdir) !== workdir) throw new Error("Showcase path must not contain symlinks.");
  const supabase = path.join(workdir, "supabase");
  fs.mkdirSync(supabase, { mode: 0o700 });
  fs.mkdirSync(path.join(supabase, "migrations"), { mode: 0o700 });
  const files = {};
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const signingKeys = JSON.stringify([{
    ...privateKey.export({ format: "jwk" }), alg: "ES256", use: "sig", kid: randomUUID(),
    key_ops: ["sign", "verify"], ext: true,
  }]);
  const credentials = {
    BUTTERBOX_SHOWCASE_JWT_SECRET: randomBytes(48).toString("base64url"),
    BUTTERBOX_SHOWCASE_PUBLISHABLE_KEY: `sb_publishable_${randomBytes(24).toString("base64url")}`,
    BUTTERBOX_SHOWCASE_SECRET_KEY: `sb_secret_${randomBytes(32).toString("base64url")}`,
    BUTTERBOX_SHOWCASE_DB_ROOT_KEY: randomBytes(32).toString("hex"),
  };
  for (const [name, value] of [
    ["supabase/config.toml", config],
    ["supabase/signing-keys.json", signingKeys],
    ["credentials.json", JSON.stringify(credentials)],
    ...(ownerEmail ? [["test-owner-account.json", JSON.stringify({ email: ownerEmail })]] : []),
  ]) {
    privateFile(path.join(workdir, name), value);
    files[name] = hash(value);
  }
  for (const name of fs.readdirSync(path.join(root, "supabase/migrations")).sort()) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) throw new Error("Unexpected migration filename.");
    const value = fs.readFileSync(path.join(root, "supabase/migrations", name));
    const target = `supabase/migrations/${name}`;
    privateFile(path.join(workdir, target), value);
    files[target] = hash(value);
  }
  privateFile(path.join(workdir, "manifest.json"), JSON.stringify({
    version: 1, project, network, id: randomUUID(), files, createdAt: new Date().toISOString(),
    purpose: "synthetic-local-showcase-only", fixturesReady: false,
  }, null, 2));
  return readEnvironment(workdir);
}

export function readEnvironment(workdir) {
  assertPath(workdir);
  const stat = fs.lstatSync(workdir);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || fs.realpathSync(workdir) !== workdir) {
    throw new Error("Showcase directory must be private, real and owned by this operator.");
  }
  if (stat.uid !== process.getuid()) throw new Error("Showcase directory belongs to another operator.");
  const manifest = JSON.parse(fs.readFileSync(path.join(workdir, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.project !== project || manifest.network !== network ||
      manifest.purpose !== "synthetic-local-showcase-only" || !manifest.id ||
      manifest.files?.["supabase/config.toml"] !== hash(config)) {
    throw new Error("Showcase identity/configuration is not the expected isolated setup.");
  }
  for (const name of ["credentials.json", "supabase/config.toml", "supabase/signing-keys.json"]) {
    if (!Object.hasOwn(manifest.files, name)) throw new Error("Incomplete showcase manifest.");
  }
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (path.isAbsolute(name) || name.split("/").includes("..")) throw new Error("Invalid manifest path.");
    const filename = path.join(workdir, name);
    const file = fs.lstatSync(filename);
    if (!file.isFile() || (file.mode & 0o077) !== 0 || file.uid !== process.getuid() ||
        hash(fs.readFileSync(filename)) !== digest) {
      throw new Error("Showcase file integrity or private permissions changed; refusing access.");
    }
  }
  const ownerFile = path.join(workdir, "test-owner-account.json");
  const hasOwnerFile = Object.hasOwn(manifest.files, "test-owner-account.json");
  if (fs.existsSync(ownerFile) !== hasOwnerFile) throw new Error("Showcase test-owner configuration is incomplete.");
  let testOwnerEmail;
  if (hasOwnerFile) {
    const owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
    if (!owner || typeof owner !== "object" || Object.keys(owner).length !== 1 ||
        normalizeTestOwnerEmail(owner.email) !== owner.email) {
      throw new Error("Showcase test-owner configuration is invalid.");
    }
    testOwnerEmail = owner.email;
  }
  return {
    manifest, testOwnerEmail,
    credentials: JSON.parse(fs.readFileSync(path.join(workdir, "credentials.json"), "utf8")),
  };
}

function command(executable, args, env = process.env, diagnosticDirectory) {
  const result = spawnSync(executable, args, { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    let diagnostic = "raw output withheld because it may contain credentials";
    if (diagnosticDirectory) {
      const filename = path.join(diagnosticDirectory, `${args[0]}-failure-${randomUUID()}.log`);
      privateFile(filename, `${result.stdout}\n${result.stderr}`);
      diagnostic = `private diagnostic saved to ${filename}`;
    }
    throw new Error(`${path.basename(executable)} ${args[0]} failed (${result.status}); ${diagnostic}.`);
  }
  return result.stdout;
}

export function assertNetwork(actual, id) {
  if (actual.Name !== network || actual.Driver !== "bridge" || actual.Internal !== true ||
      actual.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1" ||
      actual.Labels?.["com.butterbox.showcase.id"] !== id) {
    throw new Error("Showcase network must be owned, internal-only and loopback-bound.");
  }
}

function ensureOwnedNetwork(manifest) {
  const existing = command("docker", ["network", "ls", "--filter", `name=^${network}$`, "--format", "{{.Name}}"]).trim();
  if (!existing) {
    command("docker", ["network", "create", "--internal", "--driver", "bridge", "--opt",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      "--label", `com.butterbox.showcase.id=${manifest.id}`, network]);
  }
  assertNetwork(JSON.parse(command("docker", ["network", "inspect", network]))[0], manifest.id);
}

export function assertContainer(actual, workdir) {
  if (actual.Config?.Labels?.["com.supabase.cli.project"] !== project ||
      actual.Config?.Labels?.["com.supabase.cli.workdir"] !== workdir) {
    throw new Error("Showcase container identity is unverified.");
  }
  if (!actual.State?.Running || (actual.State.Health && actual.State.Health.Status !== "healthy")) {
    throw new Error("Showcase container is not healthy yet.");
  }
  const networks = Object.keys(actual.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1 || networks[0] !== network) throw new Error("Unexpected showcase network attachment.");
  for (const bindings of Object.values(actual.NetworkSettings.Ports ?? {})) {
    for (const binding of bindings ?? []) {
      if (binding.HostIp !== "127.0.0.1" ||
          !Object.values(ports).map(String).includes(binding.HostPort)) {
        throw new Error("Unexpected or non-loopback showcase port publication.");
      }
    }
  }
  for (const mount of actual.Mounts ?? []) {
    if (mount.Type !== "volume" || !mount.Name?.endsWith(`_${project}`)) {
      throw new Error("Showcase storage is not a dedicated project volume.");
    }
  }
}

export async function verify(workdir) {
  const { manifest, credentials } = readEnvironment(workdir);
  assertNetwork(JSON.parse(command("docker", ["network", "inspect", network]))[0], manifest.id);
  const names = command("docker", ["ps", "-aq", "--filter", `label=com.supabase.cli.project=${project}`]).trim().split(/\s+/).filter(Boolean);
  if (names.length === 0) throw new Error("No running showcase containers; no fixture access allowed.");
  const containers = JSON.parse(command("docker", ["inspect", ...names]));
  for (const container of containers) assertContainer(container, workdir);
  for (const name of ["db", "kong", "auth", "rest", "inbucket", "storage"]) {
    if (!containers.some((container) => container.Name === `/supabase_${name}_${project}`)) {
      throw new Error(`Required showcase service ${name} is missing.`);
    }
  }
  for (const [service, variable] of [["db", "JWT_SECRET"], ["auth", "GOTRUE_JWT_SECRET"]]) {
    const container = containers.find((item) => item.Name === `/supabase_${service}_${project}`);
    if (!container.Config.Env.includes(`${variable}=${credentials.BUTTERBOX_SHOWCASE_JWT_SECRET}`)) {
      throw new Error("Showcase signing secret does not match the independently generated configuration.");
    }
    const auth = containers.find((item) => item.Name === `/supabase_auth_${project}`);
    if (!auth.Config.Env.includes("GOTRUE_DISABLE_SIGNUP=true") ||
        !auth.Config.Env.includes("GOTRUE_EXTERNAL_EMAIL_ENABLED=true")) {
      throw new Error("Showcase must allow existing email logins while refusing public signup.");
    }
  }
  const status = showcaseStatus(workdir);
  const response = await fetch(`http://127.0.0.1:${ports.api}/auth/v1/health`, {
    headers: { apikey: credentials.BUTTERBOX_SHOWCASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || (await response.json()).name !== "GoTrue") {
    throw new Error("Showcase API health check failed through the loopback proxy.");
  }
  const resource = `${status.API_URL}/rest/v1/businesses?select=id&limit=1`;
  const own = await fetch(resource, {
    headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (own.status >= 500) throw new Error("Showcase API is not ready yet.");
  if (!own.ok) throw new Error("Showcase's own signed administrative token was rejected.");
  await own.body?.cancel();
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
  const foreignToken = `${header}.${payload}.${createHmac("sha256", randomBytes(48)).update(`${header}.${payload}`).digest("base64url")}`;
  const foreign = await fetch(resource, {
    headers: { apikey: foreignToken, Authorization: `Bearer ${foreignToken}` },
    signal: AbortSignal.timeout(5000),
  });
  if (![401, 403].includes(foreign.status)) throw new Error("Showcase accepted a foreign signed administrative token.");
  await foreign.body?.cancel();
  const anonymous = await fetch(resource, {
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.ANON_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (![401, 403].includes(anonymous.status)) throw new Error("Showcase exposed business records anonymously.");
  await anonymous.body?.cancel();
  return { project, containers: containers.length, credentialsVerified: true };
}

export async function start(workdir) {
  const { manifest, credentials } = readEnvironment(workdir);
  const disk = fs.statfsSync(workdir);
  if (disk.bavail * disk.bsize < 10 * 1024 ** 3) throw new Error("Less than 10 GiB available; stop safely.");
  ensureOwnedNetwork(manifest);
  const cli = process.env.BUTTERBOX_TEST_SUPABASE_CLI;
  if (!cli) throw new Error("Set BUTTERBOX_TEST_SUPABASE_CLI to the verified local CLI executable.");
  const containers = command("docker", ["ps", "-aq", "--filter", `label=com.supabase.cli.project=${project}`]).trim();
  if (containers) return verify(workdir);
  const volumes = command("docker", ["volume", "ls", "--filter", `name=${project}`, "--format", "{{.Name}}"]).trim();
  if (volumes) {
    const proof = JSON.parse(fs.readFileSync(path.join(workdir, "volume-ownership.json"), "utf8"));
    assertOwnedVolumes(proof, manifest.id, volumeSnapshot(volumes.split("\n")));
  }
  command(cli, ["start", "--workdir", workdir, "--network-id", network, "--exclude",
    "studio,postgres-meta,realtime,imgproxy,edge-runtime,logflare,vector,supavisor"],
  environment(credentials), workdir);
  return verify(workdir);
}

export function assertOwnedVolumes(proof, namespace, volumes) {
  if (proof?.namespace !== namespace || !Array.isArray(proof.volumes) || volumes.length === 0 ||
      JSON.stringify(proof.volumes) !== JSON.stringify(volumes)) {
    throw new Error("Existing showcase volumes do not match verified ownership. Preserve them; refusing adoption.");
  }
}

function volumeSnapshot(names) {
  if (!names.length || names.some((name) => !name.endsWith(`_${project}`))) {
    throw new Error("Unexpected showcase volume identity.");
  }
  return JSON.parse(command("docker", ["volume", "inspect", ...names])).map((volume) => ({
    name: volume.Name, createdAt: volume.CreatedAt, driver: volume.Driver, mountpoint: volume.Mountpoint,
  })).sort((first, second) => first.name.localeCompare(second.name));
}

export async function stop(workdir) {
  await verify(workdir);
  const { manifest, credentials } = readEnvironment(workdir);
  const names = command("docker", ["volume", "ls", "--filter", `name=${project}`, "--format", "{{.Name}}"]).trim().split("\n");
  fs.writeFileSync(path.join(workdir, "volume-ownership.json"), JSON.stringify({
    namespace: manifest.id, verifiedAt: new Date().toISOString(), volumes: volumeSnapshot(names),
  }), { mode: 0o600 });
  command(process.env.BUTTERBOX_TEST_SUPABASE_CLI, ["stop", "--workdir", workdir, "--network-id", network],
    environment(credentials), workdir);
  return { project, stopped: true, volumesPreserved: true };
}

export async function proxy(workdir) {
  const { manifest } = readEnvironment(workdir);
  ensureOwnedNetwork(manifest);
  const servers = [];
  try {
    for (const [service, hostPort, containerPort] of [
      ["kong", ports.api, 8000], ["db", ports.db, 5432], ["inbucket", ports.mail, 8025],
    ]) {
      const server = net.createServer((client) => {
        let upstream;
        try {
          const actual = JSON.parse(command("docker", ["inspect", `supabase_${service}_${project}`]))[0];
          assertContainer(actual, workdir);
          const address = actual.NetworkSettings.Networks[network].IPAddress;
          if (net.isIP(address) !== 4) throw new Error("No verified internal IPv4 address.");
          upstream = net.connect({ host: address, port: containerPort });
          client.pipe(upstream).pipe(client);
        } catch (error) {
          console.error(`Showcase ${service} proxy refused connection: ${error.message}`);
          client.destroy();
          return;
        }
        client.on("error", () => upstream.destroy());
        upstream.on("error", (error) => {
          console.error(`Showcase ${service} upstream failed: ${error.code}`);
          client.destroy();
        });
        client.on("close", () => upstream.destroy());
        upstream.on("close", () => client.destroy());
      });
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port: hostPort, exclusive: true }, resolve);
      });
    }
  } catch (error) {
    for (const server of servers) server.close();
    throw error;
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      for (const server of servers) server.close();
      process.exit(0);
    });
  }
  return { project, loopbackPorts: Object.values(ports) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, workdir, ...extra] = process.argv.slice(2);
    const testOwnerOption = action === "prepare" && extra.length === 2 && extra[0] === "--test-owner-email";
    if (!workdir || !["prepare", "start", "stop", "verify", "proxy"].includes(action) ||
        (extra.length && !testOwnerOption)) {
      throw new Error("Usage: node scripts/showcase-environment.mjs prepare|start|stop|verify|proxy /private/path/butterbox-showcase [--test-owner-email EMAIL (prepare only)]");
    }
    if (action === "prepare") {
      prepare(workdir, testOwnerOption ? extra[1] : undefined);
      console.log("Prepared private synthetic showcase configuration; not seeded or ready for reviewers.");
    } else {
      console.log(JSON.stringify(await ({ start, stop, verify, proxy })[action](workdir)));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Showcase environment operation failed.");
    process.exitCode = 1;
  }
}
