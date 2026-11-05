import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function disposableDatabase(container, url) {
  assert.equal(process.env.BUTTERBOX_TEST_DISPOSABLE, "yes");
  assert.ok(container && url);
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname));
  assert.equal(parsedUrl.pathname, "/");
  assert.equal(parsedUrl.username, "");
  assert.equal(parsedUrl.password, "");
  assert.equal(parsedUrl.search, "");
  assert.equal(parsedUrl.hash, "");
  const project = /^supabase_db_([a-z0-9][a-z0-9_-]*)$/.exec(container)?.[1];
  assert.ok(project, "A local Supabase database container name is required");
  const [label, apiPort] = await Promise.all([
    execFileAsync("docker", [
      "inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', container,
    ]),
    execFileAsync("docker", [
      "inspect", "--format", '{{ (index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort }}',
      `supabase_kong_${project}`,
    ]),
  ]);
  assert.equal(label.stdout.trim(), project);
  assert.equal(apiPort.stdout.trim(), parsedUrl.port || "80");

  async function sql(statement) {
    const result = await execFileAsync("docker", [
      "exec", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", statement,
    ], { timeout: 5_000 });
    return result.stdout.trim();
  }

  async function waitForLock(functionName) {
    assert.match(functionName, /^[a-z_]+$/);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const count = await sql(
        `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${functionName}%'`,
      );
      if (Number(count) > 0) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${functionName} to reach its lock.`);
  }

  async function holdLock(statement, expectedOutput) {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres",
    ]);
    let output = "";
    let errors = "";
    let ready;
    const marker = new Promise((resolve) => { ready = resolve; });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("LOCK_READY")) ready();
    });
    child.stderr.on("data", (chunk) => { errors += chunk.toString(); });
    child.stdin.on("error", (error) => { errors += error.message; });
    const closed = new Promise((resolve) => {
      child.once("error", (error) => resolve({ error }));
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child.stdin.write(`begin;\n${statement};\n\\echo LOCK_READY\n`);
    try {
      await Promise.race([
        marker,
        closed.then(() => { throw new Error(`The lock session exited early: ${errors}`); }),
        delay(10_000, undefined, { ref: false }).then(() => {
          throw new Error("Timed out acquiring the test lock.");
        }),
      ]);
      if (expectedOutput) assert.ok(output.includes(expectedOutput), "The test row must exist");
    } catch (error) {
      if (!child.stdin.destroyed) child.stdin.end("rollback;\n\\q\n");
      const result = await Promise.race([closed, delay(5_000, undefined, { ref: false }).then(() => null)]);
      if (!result) {
        child.kill("SIGTERM");
        await closed;
      }
      throw error;
    }
    let released = false;
    return {
      async release(commit) {
        if (released) return;
        released = true;
        child.stdin.end(`${commit ? "commit" : "rollback"};\n\\q\n`);
        const result = await Promise.race([closed, delay(5_000, undefined, { ref: false }).then(() => null)]);
        if (!result) {
          child.kill("SIGTERM");
          await closed;
          throw new Error("The test lock session did not exit.");
        }
        assert.ifError(result.error);
        assert.equal(result.code, 0, `The test lock session failed: ${errors}`);
      },
    };
  }

  return { sql, waitForLock, holdLock };
}

export async function assertBusinessFixturesPreserved(admin, businessIds) {
  const ids = Array.isArray(businessIds) ? businessIds : [businessIds];
  if (!ids.length) return;
  assert.ok(ids.every((id) => typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)));
  await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, process.env.BUTTERBOX_TEST_SUPABASE_URL);
  const existing = await admin.from("businesses").select("id").in("id", ids);
  assert.ifError(existing.error);
  if (!existing.data.length) return;
  const deletion = await admin.from("businesses").delete().in("id", ids);
  assert.equal(deletion.error?.code, "P0001");
  assert.equal(deletion.error?.message,
    "Business deletion is disabled while record preservation requirements remain unresolved");
  const remaining = await admin.from("businesses").select("id").in("id", ids);
  assert.ifError(remaining.error);
  assert.deepEqual(remaining.data.map(({ id }) => id).sort(), existing.data.map(({ id }) => id).sort());
}
