import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;
const execFileAsync = promisify(execFile);

test(
  "leave approval and automatic assignment serialize against the same employee",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.equal(process.env.BUTTERBOX_TEST_DISPOSABLE, "yes");
    assert.ok(url && anonKey && serviceKey);
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

    const [label, port] = await Promise.all([
      execFileAsync("docker", [
        "inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', container,
      ]),
      execFileAsync("docker", [
        "inspect", "--format", '{{ (index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort }}',
        `supabase_kong_${project}`,
      ]),
    ]);
    assert.equal(label.stdout.trim(), project, "The database container project label must match");
    assert.equal(port.stdout.trim(), parsedUrl.port || "80", "The API must belong to this database project");

    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const owner = createClient(url, anonKey, options);
    const worker = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const businessId = randomUUID();
    const venueId = randomUUID();
    const departmentId = randomUUID();
    const employeeId = randomUUID();
    const users = [];

    async function sql(statement) {
      const result = await execFileAsync("docker", [
        "exec", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres", "-c", statement,
      ], { timeout: 5_000 });
      return result.stdout.trim();
    }

    async function waitForLock(functionName) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const count = await sql(
          `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${functionName}%'`,
        );
        if (Number(count) > 0) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${functionName} to block on the employee lock.`);
    }

    async function holdEmployeeLock() {
      const process = spawn("docker", [
        "exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres",
      ]);
      let output = "";
      let errors = "";
      let ready;
      const marker = new Promise((resolve) => { ready = resolve; });
      process.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.includes("LOCK_READY")) ready();
      });
      process.stderr.on("data", (chunk) => { errors += chunk.toString(); });
      process.stdin.on("error", (error) => { errors += error.message; });
      const closed = new Promise((resolve) => {
        process.once("error", (error) => resolve({ error }));
        process.once("exit", (code, signal) => resolve({ code, signal }));
      });
      process.stdin.write(
        `begin;\nselect id from public.employees where id = '${employeeId}'::uuid for update;\n\\echo LOCK_READY\n`,
      );
      try {
        await Promise.race([
          marker,
          closed.then(() => { throw new Error(`The lock session exited early: ${errors}`); }),
          delay(10_000, undefined, { ref: false }).then(() => {
            throw new Error("Timed out acquiring the test employee lock.");
          }),
        ]);
        assert.ok(output.includes(employeeId), "The test employee must exist before locking");
      } catch (error) {
        if (!process.stdin.destroyed) process.stdin.end("rollback;\n\\q\n");
        const result = await Promise.race([closed, delay(5_000, undefined, { ref: false }).then(() => null)]);
        if (!result) {
          process.kill("SIGTERM");
          await closed;
        }
        throw error;
      }
      let released = false;
      return {
        async release(commit) {
          if (released) return;
          released = true;
          process.stdin.end(`${commit ? "commit" : "rollback"};\n\\q\n`);
          const result = await Promise.race([closed, delay(5_000, undefined, { ref: false }).then(() => null)]);
          if (!result) {
            process.kill("SIGTERM");
            await closed;
            throw new Error("The test lock session did not exit.");
          }
          assert.ifError(result.error);
          assert.equal(result.code, 0, `The test lock session failed: ${errors}`);
        },
      };
    }

    async function runOrderedRace(day, reviewFirst) {
      const request = await worker.rpc("request_availability_exception", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
        p_starts_on: day, p_ends_on: day, p_exception_type: "leave",
      });
      assert.ifError(request.error);
      const reviewArgs = {
        p_business_id: businessId, p_venue_id: venueId, p_exception_id: request.data, p_status: "approved",
      };
      const title = reviewFirst ? "Approval before assignment" : "Assignment before approval";
      const assignArgs = {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
        p_role_title: title, p_start_local: `${day} 09:00`, p_end_local: `${day} 10:00`, p_break_minutes: 0,
      };
      const lock = await holdEmployeeLock();
      let review;
      let assignment;
      try {
        if (reviewFirst) {
          review = Promise.resolve(owner.rpc("review_leave_request", reviewArgs));
          await waitForLock("review_leave_request");
          assignment = Promise.resolve(owner.rpc("save_shift_auto_assign", assignArgs));
          await waitForLock("save_shift_auto_assign");
        } else {
          assignment = Promise.resolve(owner.rpc("save_shift_auto_assign", assignArgs));
          await waitForLock("save_shift_auto_assign");
          review = Promise.resolve(owner.rpc("review_leave_request", reviewArgs));
          await waitForLock("review_leave_request");
        }
        await lock.release(true);
        const [reviewResult, assignResult] = await Promise.all([review, assignment]);
        assert.ifError(reviewResult.error);
        if (reviewFirst) {
          assert.equal(assignResult.error?.message, "No eligible employee available for automatic assignment");
        } else {
          assert.ifError(assignResult.error);
          assert.ok(assignResult.data);
        }
        const saved = await admin.from("shifts").select("employee_id")
          .eq("business_id", businessId).eq("role_title", title);
        assert.ifError(saved.error);
        assert.deepEqual(saved.data, reviewFirst ? [] : [{ employee_id: employeeId }]);
      } finally {
        try {
          await lock.release(false);
        } finally {
          await Promise.allSettled([review, assignment].filter(Boolean));
        }
      }
    }

    try {
      for (const name of ["owner", "worker"]) {
        const result = await admin.auth.admin.createUser({
          email: `auto-lock-${name}-${suffix}@example.test`, password, email_confirm: true,
        });
        assert.ifError(result.error);
        users.push(result.data.user.id);
      }
      assert.ifError((await admin.from("businesses").insert({ id: businessId, name: `Auto locks ${suffix}` })).error);
      assert.ifError((await admin.from("venues").insert({
        id: venueId, business_id: businessId, name: "Test", timezone: "UTC",
      })).error);
      assert.ifError((await admin.from("departments").insert({
        id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
      })).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: businessId, user_id: users[0], role: "owner" },
        { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      ])).error);
      assert.ifError((await admin.from("employees").insert({
        id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "Lock test worker", role_title: "Server",
      })).error);
      assert.ifError((await owner.auth.signInWithPassword({
        email: `auto-lock-owner-${suffix}@example.test`, password,
      })).error);
      assert.ifError((await worker.auth.signInWithPassword({
        email: `auto-lock-worker-${suffix}@example.test`, password,
      })).error);
      await runOrderedRace("2032-03-15", true);
      await runOrderedRace("2032-03-22", false);
    } finally {
      assert.ifError((await admin.from("shifts").delete().eq("business_id", businessId)).error);
      assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
      for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
  },
);
