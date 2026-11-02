import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  assertContainer, assertNetwork, config, network, ports, prepare, project, readEnvironment,
} from "../scripts/showcase-environment.mjs";
import { testSupabaseStatus } from "../scripts/test-supabase-status.mjs";

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "butterbox-showcase-test-"));
  t.after(() => fs.rmSync(parent, { recursive: true }));
  return path.join(parent, project);
}

test("showcase preparation creates private independent keys and copies migration snapshots without seeding", (t) => {
  const workdir = fixture(t);
  const first = prepare(workdir);
  assert.equal(first.manifest.project, project);
  assert.equal(first.manifest.fixturesReady, false);
  assert.equal(fs.statSync(workdir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(workdir, "credentials.json")).mode & 0o777, 0o600);
  const keys = JSON.parse(fs.readFileSync(path.join(workdir, "supabase/signing-keys.json"), "utf8"));
  assert.equal(keys.length, 1);
  assert.equal(keys[0].alg, "ES256");
  assert.deepEqual(keys[0].key_ops, ["sign", "verify"]);
  assert.equal(keys[0].ext, true);
  assert.equal(createPublicKey({ key: keys[0], format: "jwk" }).asymmetricKeyType, "ec");
  assert.match(config, /\[db.seed\]\nenabled = false/);
  assert.match(config, /enable_signup = false/);
  assert.ok(Object.keys(first.manifest.files).filter((name) => name.startsWith("supabase/migrations/")).length > 50);
  const second = prepare(fixture(t));
  assert.notDeepEqual(first.credentials, second.credentials);
  assert.notEqual(first.manifest.files["supabase/signing-keys.json"], second.manifest.files["supabase/signing-keys.json"]);
  assert.throws(() => prepare(workdir), /EEXIST/);
  assert.deepEqual(readEnvironment(workdir).manifest, first.manifest);
});

test("showcase refuses existing, relative, repository, wrong-name and symlink targets", (t) => {
  assert.throws(() => prepare("butterbox-showcase"), /absolute/);
  assert.throws(() => prepare(path.resolve("butterbox-showcase")), /outside/);
  assert.throws(() => prepare("/tmp/butterbox-acceptance"), /absolute/);
  const workdir = fixture(t);
  const target = fixture(t);
  fs.mkdirSync(target);
  fs.symlinkSync(target, workdir);
  assert.throws(() => prepare(workdir), /EEXIST/);
});

test("showcase refuses changed configuration, keys, migration files and permissions", (t) => {
  for (const name of ["supabase/config.toml", "supabase/signing-keys.json", "credentials.json"]) {
    const workdir = fixture(t);
    prepare(workdir);
    fs.appendFileSync(path.join(workdir, name), "\n");
    assert.throws(() => readEnvironment(workdir), /integrity/);
  }
  const workdir = fixture(t);
  const { manifest } = prepare(workdir);
  const migration = Object.keys(manifest.files).find((name) => name.startsWith("supabase/migrations/"));
  fs.appendFileSync(path.join(workdir, migration), "\n");
  assert.throws(() => readEnvironment(workdir), /integrity/);
  const loose = fixture(t);
  prepare(loose);
  fs.chmodSync(loose, 0o755);
  assert.throws(() => readEnvironment(loose), /private/);
});

test("showcase manifest cannot omit required files or escape the owned directory", (t) => {
  const workdir = fixture(t);
  const { manifest } = prepare(workdir);
  const filename = path.join(workdir, "manifest.json");
  delete manifest.files["credentials.json"];
  fs.writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(() => readEnvironment(workdir), /Incomplete/);
  manifest.files["credentials.json"] = "unused";
  manifest.files = { "../outside": "unused", ...manifest.files };
  fs.writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(() => readEnvironment(workdir), /Invalid manifest path/);
});

test("showcase network must prevent external routing and bind published ports to localhost", () => {
  const good = {
    Name: network, Driver: "bridge", Internal: true,
    Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
    Labels: { "com.butterbox.showcase.id": "owned" },
  };
  assert.doesNotThrow(() => assertNetwork(good, "owned"));
  for (const changed of [{ Internal: false }, { Options: {} }, { Labels: {} }, { Name: "bridge" }, { Driver: "host" }]) {
    assert.throws(() => assertNetwork({ ...good, ...changed }, "owned"), /network/);
  }
});

test("showcase rejects wrong-project, cross-network, public ports, shared storage and unhealthy containers", () => {
  const workdir = "/private/butterbox-showcase";
  const good = {
    Config: { Labels: { "com.supabase.cli.project": project, "com.supabase.cli.workdir": workdir } },
    State: { Running: true, Health: { Status: "healthy" } },
    NetworkSettings: { Networks: { [network]: {} }, Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: String(ports.db) }] } },
    Mounts: [{ Type: "volume", Name: `supabase_db_${project}` }],
  };
  assert.doesNotThrow(() => assertContainer(good, workdir));
  for (const changed of [
    { Config: { Labels: { "com.supabase.cli.project": "butterbox-acceptance" } } },
    { State: { Running: false } }, { State: { Running: true, Health: { Status: "starting" } } },
    { NetworkSettings: { ...good.NetworkSettings, Networks: { [network]: {}, bridge: {} } } },
    { NetworkSettings: { ...good.NetworkSettings, Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: String(ports.db) }] } } },
    { NetworkSettings: { ...good.NetworkSettings, Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] } } },
    { Mounts: [{ Type: "volume", Name: "supabase_db_butterbox" }] },
    { Mounts: [{ Type: "bind", Source: "/customer/data" }] },
  ]) assert.throws(() => assertContainer({ ...good, ...changed }, workdir));
});

test("local status helper passes an explicit isolated environment and reports child failure without output", (t) => {
  const workdir = fixture(t);
  const cli = path.join(path.dirname(workdir), "fake-cli.mjs");
  fs.writeFileSync(cli, '#!/usr/bin/env node\nconsole.log(JSON.stringify({ isolated: process.env.EXPECTED }));\n', { mode: 0o700 });
  const env = { PATH: process.env.PATH, BUTTERBOX_TEST_SUPABASE_CLI: cli, EXPECTED: "showcase-only" };
  assert.deepEqual(testSupabaseStatus(workdir, env), { isolated: "showcase-only" });
  fs.writeFileSync(cli, '#!/usr/bin/env node\nconsole.error("private diagnostic");process.exit(2);\n');
  assert.throws(() => testSupabaseStatus(workdir, env), (error) =>
    error.message.includes("exit 2") && !error.message.includes("private diagnostic"));
});
