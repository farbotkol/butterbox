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
  "availability, conflict policies and roster writes serialize against concurrent changes",
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

    async function holdLock(statement, expectedOutput) {
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
      process.stdin.write(`begin;\n${statement};\n\\echo LOCK_READY\n`);
      try {
        await Promise.race([
          marker,
          closed.then(() => { throw new Error(`The lock session exited early: ${errors}`); }),
          delay(10_000, undefined, { ref: false }).then(() => {
            throw new Error("Timed out acquiring the test employee lock.");
          }),
        ]);
        if (expectedOutput) assert.ok(output.includes(expectedOutput), "The test row must exist before locking");
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

    function holdEmployeeLock() {
      return holdLock(`select id from public.employees where id = '${employeeId}'::uuid for update`, employeeId);
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

    async function savePolicy(manual, unavailable, overlap = false) {
      const result = await owner.rpc("save_venue_conflict_policy", {
        p_business_id: businessId, p_venue_id: venueId,
        p_block_manual_unavailability: manual, p_block_publish_unavailability: unavailable,
        p_block_publish_overlap: overlap, p_block_publish_long_shift: false,
      });
      assert.ifError(result.error);
    }

    async function requestLeave(day) {
      const result = await worker.rpc("request_availability_exception", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
        p_starts_on: day, p_ends_on: day, p_exception_type: "leave",
      });
      assert.ifError(result.error);
      return result.data;
    }

    function reviewLeave(exceptionId) {
      return Promise.resolve(owner.rpc("review_leave_request", {
        p_business_id: businessId, p_venue_id: venueId,
        p_exception_id: exceptionId, p_status: "approved",
      }));
    }

    function createShift(day, title) {
      return Promise.resolve(owner.rpc("save_shift", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
        p_employee_id: employeeId, p_role_title: title,
        p_start_local: `${day} 09:00`, p_end_local: `${day} 10:00`, p_break_minutes: 0,
      }));
    }

    function publish(day) {
      return Promise.resolve(owner.rpc("publish_roster", {
        p_business_id: businessId, p_venue_id: venueId,
        p_department_id: departmentId, p_week_start: day,
      }));
    }

    async function runPublicationLeaveRace(day, reviewFirst) {
      await savePolicy(false, true, true);
      const shift = await createShift(day, `Publish leave ${day}`);
      assert.ifError(shift.error);
      const exceptionId = await requestLeave(day);
      const lock = await holdEmployeeLock();
      let review;
      let publication;
      try {
        if (reviewFirst) {
          review = reviewLeave(exceptionId);
          await waitForLock("review_leave_request");
          publication = publish(day);
          await waitForLock("publish_roster");
        } else {
          publication = publish(day);
          await waitForLock("publish_roster");
          review = reviewLeave(exceptionId);
          await waitForLock("review_leave_request");
        }
        await lock.release(true);
        const [reviewResult, publicationResult] = await Promise.all([review, publication]);
        assert.ifError(reviewResult.error);
        if (reviewFirst) {
          assert.equal(publicationResult.error?.message, "Roster has unavailable employees");
        } else {
          assert.ifError(publicationResult.error);
          assert.equal(publicationResult.data, 1);
        }
        const stored = await admin.from("shifts").select("is_published").eq("id", shift.data).single();
        assert.ifError(stored.error);
        assert.equal(stored.data.is_published, !reviewFirst);
      } finally {
        try {
          await lock.release(false);
        } finally {
          await Promise.allSettled([review, publication].filter(Boolean));
        }
      }
    }

    async function runManualLeaveRace(day, reviewFirst) {
      await savePolicy(true, false);
      const exceptionId = await requestLeave(day);
      const lock = await holdEmployeeLock();
      let review;
      let assignment;
      try {
        if (reviewFirst) {
          review = reviewLeave(exceptionId);
          await waitForLock("review_leave_request");
          assignment = createShift(day, `Manual leave ${day}`);
          await waitForLock("save_shift");
        } else {
          assignment = createShift(day, `Manual leave ${day}`);
          await waitForLock("save_shift");
          review = reviewLeave(exceptionId);
          await waitForLock("review_leave_request");
        }
        await lock.release(true);
        const [reviewResult, assignmentResult] = await Promise.all([review, assignment]);
        assert.ifError(reviewResult.error);
        if (reviewFirst) {
          assert.equal(assignmentResult.error?.message, "Employee is unavailable for this shift");
        } else {
          assert.ifError(assignmentResult.error);
          assert.ok(assignmentResult.data);
        }
        const stored = await admin.from("shifts").select("id")
          .eq("business_id", businessId).eq("role_title", `Manual leave ${day}`);
        assert.ifError(stored.error);
        assert.equal(stored.data.length, reviewFirst ? 0 : 1);
      } finally {
        try {
          await lock.release(false);
        } finally {
          await Promise.allSettled([review, assignment].filter(Boolean));
        }
      }
    }

    async function runPolicyPublicationRace(day, policyFirst) {
      await savePolicy(false, false);
      const blocked = await worker.rpc("request_availability_exception", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
        p_starts_on: day, p_ends_on: day, p_exception_type: "unavailable",
      });
      assert.ifError(blocked.error);
      const shift = await createShift(day, `Policy race ${day}`);
      assert.ifError(shift.error);
      const lock = await holdLock(`select id from public.venues where id = '${venueId}'::uuid for update`, venueId);
      let policy;
      let publication;
      try {
        if (policyFirst) {
          policy = savePolicy(false, true);
          await waitForLock("save_venue_conflict_policy");
          publication = publish(day);
          await waitForLock("publish_roster");
        } else {
          publication = publish(day);
          await waitForLock("publish_roster");
          policy = savePolicy(false, true);
          await waitForLock("save_venue_conflict_policy");
        }
        await lock.release(true);
        const [, publicationResult] = await Promise.all([policy, publication]);
        if (policyFirst) {
          assert.equal(publicationResult.error?.message, "Roster has unavailable employees");
        } else {
          assert.ifError(publicationResult.error);
          assert.equal(publicationResult.data, 1);
        }
        const stored = await admin.from("shifts").select("is_published").eq("id", shift.data).single();
        assert.ifError(stored.error);
        assert.equal(stored.data.is_published, !policyFirst);
      } finally {
        try {
          await lock.release(false);
        } finally {
          await Promise.allSettled([policy, publication].filter(Boolean));
        }
      }
    }

    async function runPolicyManualRace(day, policyFirst) {
      await savePolicy(false, false);
      const blocked = await worker.rpc("request_availability_exception", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
        p_starts_on: day, p_ends_on: day, p_exception_type: "unavailable",
      });
      assert.ifError(blocked.error);
      const lock = await holdLock(`select id from public.venues where id = '${venueId}'::uuid for update`, venueId);
      let policy;
      let assignment;
      try {
        if (policyFirst) {
          policy = savePolicy(true, false);
          await waitForLock("save_venue_conflict_policy");
          assignment = createShift(day, `Manual policy race ${day}`);
          await waitForLock("save_shift");
        } else {
          assignment = createShift(day, `Manual policy race ${day}`);
          await waitForLock("save_shift");
          policy = savePolicy(true, false);
          await waitForLock("save_venue_conflict_policy");
        }
        await lock.release(true);
        const [, assignmentResult] = await Promise.all([policy, assignment]);
        if (policyFirst) {
          assert.equal(assignmentResult.error?.message, "Employee is unavailable for this shift");
        } else {
          assert.ifError(assignmentResult.error);
          assert.ok(assignmentResult.data);
        }
        const stored = await admin.from("shifts").select("id")
          .eq("business_id", businessId).eq("role_title", `Manual policy race ${day}`);
        assert.ifError(stored.error);
        assert.equal(stored.data.length, policyFirst ? 0 : 1);
      } finally {
        try {
          await lock.release(false);
        } finally {
          await Promise.allSettled([policy, assignment].filter(Boolean));
        }
      }
    }

    async function runBusyPublication(day, lockEmployee) {
      await savePolicy(false, true, true);
      const shift = await createShift(day, `Busy publication ${day}`);
      assert.ifError(shift.error);
      const lock = lockEmployee
        ? await holdLock(`select pg_advisory_xact_lock(hashtextextended('${employeeId}', 0))`)
        : await holdLock(`select id from public.shifts where id = '${shift.data}'::uuid for update`, shift.data);
      try {
        const blocked = await publish(day);
        assert.equal(blocked.error?.message, "Roster changed while publishing; please try again");
        const before = await admin.from("shifts").select("is_published").eq("id", shift.data).single();
        assert.ifError(before.error);
        assert.equal(before.data.is_published, false);
        await lock.release(true);
        const retried = await publish(day);
        assert.ifError(retried.error);
        assert.equal(retried.data, 1);
      } finally {
        await lock.release(false);
      }
    }

    async function runConcurrentVersionRace(day) {
      await savePolicy(false, false);
      const first = await createShift(day, `First version ${day}`);
      assert.ifError(first.error);
      const second = await owner.rpc("save_shift", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
        p_employee_id: employeeId, p_role_title: `Second version ${day}`,
        p_start_local: `${day} 11:00`, p_end_local: `${day} 12:00`, p_break_minutes: 0,
      });
      assert.ifError(second.error);
      const lock = await holdLock(
        `update public.shifts set is_published = true, published_at = now() where id = '${first.data}'::uuid returning id`,
        first.data,
      );
      let publication;
      try {
        publication = Promise.resolve(admin.from("shifts")
          .update({ is_published: true, published_at: new Date().toISOString() })
          .eq("id", second.data));
        await waitForLock("shifts");
        const uncommitted = await admin.from("roster_publications").select("id")
          .eq("business_id", businessId).eq("department_id", departmentId).eq("week_start", day);
        assert.ifError(uncommitted.error);
        assert.deepEqual(uncommitted.data, []);
        await lock.release(true);
        const result = await publication;
        assert.ifError(result.error);
        const versions = await admin.from("roster_publications")
          .select("id, version, shift_count, new_shift_count")
          .eq("business_id", businessId).eq("department_id", departmentId)
          .eq("week_start", day).order("version");
        assert.ifError(versions.error);
        assert.deepEqual(versions.data.map(({ version, shift_count, new_shift_count }) => ({
          version, shift_count, new_shift_count,
        })), [
          { version: 1, shift_count: 1, new_shift_count: 1 },
          { version: 2, shift_count: 2, new_shift_count: 1 },
        ]);
        const snapshot = await admin.from("roster_publication_shifts")
          .select("shift_id").eq("publication_id", versions.data[1].id);
        assert.ifError(snapshot.error);
        assert.deepEqual(snapshot.data.map(({ shift_id }) => shift_id).sort(), [first.data, second.data].sort());
        const recipients = await admin.from("roster_publication_recipients")
          .select("publication_id, employee_id").in("publication_id", versions.data.map(({ id }) => id));
        assert.ifError(recipients.error);
        assert.equal(recipients.data.length, 2);
        assert.ok(recipients.data.every(({ employee_id }) => employee_id === employeeId));
        const notices = await worker.rpc("list_roster_notifications", {
          p_business_id: businessId, p_venue_id: venueId,
        }).in("publication_id", versions.data.map(({ id }) => id));
        assert.ifError(notices.error);
        assert.equal(notices.data.length, 2);
        assert.ok(notices.data.every(({ unread }) => unread));
        const [firstRead, secondRead] = await Promise.all([
          worker.rpc("mark_roster_notification_read", { p_publication_id: versions.data[0].id }),
          worker.rpc("mark_roster_notification_read", { p_publication_id: versions.data[0].id }),
        ]);
        assert.ifError(firstRead.error);
        assert.ifError(secondRead.error);
        const readRecords = await admin.from("roster_publication_notification_reads")
          .select("user_id").eq("publication_id", versions.data[0].id);
        assert.ifError(readRecords.error);
        assert.deepEqual(readRecords.data, [{ user_id: users[1] }]);
      } finally {
        try {
          await lock.release(false);
        } finally {
          await Promise.allSettled([publication].filter(Boolean));
        }
      }
    }

    async function runAcknowledgementRaces(day) {
      await savePolicy(false, false);
      const shift = await createShift(day, `Acknowledgement race ${day}`);
      assert.ifError(shift.error);
      const requirement = {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
        p_shift_id: shift.data, p_required: true,
      };
      const acknowledgement = {
        p_business_id: businessId, p_venue_id: venueId, p_shift_id: shift.data,
      };
      const shiftLock = await holdLock(
        `select id from public.shifts where id = '${shift.data}'::uuid for update`, shift.data,
      );
      let setting;
      try {
        setting = Promise.resolve(owner.rpc("set_shift_acknowledgement_requirement", requirement));
        await waitForLock("set_shift_acknowledgement_requirement");
        const busy = await publish(day);
        assert.equal(busy.error?.message, "Roster changed while publishing; please try again");
        await shiftLock.release(true);
        assert.ifError((await setting).error);
        const published = await publish(day);
        assert.ifError(published.error);
        assert.equal(published.data, 1);
      } finally {
        try {
          await shiftLock.release(false);
        } finally {
          await Promise.allSettled([setting].filter(Boolean));
        }
      }

      const unlink = await holdLock(
        `update public.employees set auth_user_id = null where id = '${employeeId}'::uuid returning id`, employeeId,
      );
      let whileUnlinking;
      try {
        whileUnlinking = Promise.resolve(worker.rpc("acknowledge_shift", acknowledgement));
        await waitForLock("acknowledge_shift");
        await unlink.release(true);
        assert.equal((await whileUnlinking).error?.message, "Shift not found or permission denied");
      } finally {
        try {
          await unlink.release(false);
        } finally {
          await Promise.allSettled([whileUnlinking].filter(Boolean));
        }
      }
      assert.ifError((await owner.rpc("set_employee_auth_user", {
        p_business_id: businessId, p_employee_id: employeeId, p_user_id: users[1],
      })).error);

      const revoke = await holdLock(
        `delete from public.business_memberships where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
        users[1],
      );
      let whileRevoking;
      try {
        whileRevoking = Promise.resolve(worker.rpc("acknowledge_shift", acknowledgement));
        await waitForLock("acknowledge_shift");
        await revoke.release(true);
        assert.equal((await whileRevoking).error?.message, "Shift not found or permission denied");
      } finally {
        try {
          await revoke.release(false);
        } finally {
          await Promise.allSettled([whileRevoking].filter(Boolean));
        }
      }
      assert.ifError((await admin.from("business_memberships").insert({
        business_id: businessId, user_id: users[1], role: "employee",
        venue_id: venueId, department_id: departmentId,
      })).error);
      const [first, second] = await Promise.all([
        worker.rpc("acknowledge_shift", acknowledgement),
        worker.rpc("acknowledge_shift", acknowledgement),
      ]);
      assert.ifError(first.error);
      assert.ifError(second.error);
      assert.equal(first.data, second.data);
      const records = await admin.from("shift_acknowledgements")
        .select("user_id, acknowledged_at").eq("shift_id", shift.data);
      assert.ifError(records.error);
      assert.deepEqual(records.data, [{ user_id: users[1], acknowledged_at: first.data }]);
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
      await runPublicationLeaveRace("2032-03-29", true);
      await runPublicationLeaveRace("2032-04-05", false);
      await runManualLeaveRace("2032-04-12", true);
      await runManualLeaveRace("2032-04-19", false);
      await runPolicyPublicationRace("2032-04-26", true);
      await runPolicyPublicationRace("2032-05-03", false);
      await runBusyPublication("2032-05-10", false);
      await runBusyPublication("2032-05-17", true);
      await runPolicyManualRace("2032-05-24", true);
      await runPolicyManualRace("2032-05-31", false);
      await runConcurrentVersionRace("2032-06-07");
      await runAcknowledgementRaces("2032-06-14");
    } finally {
      assert.ifError((await admin.from("shifts").delete().eq("business_id", businessId)).error);
      assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
      for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
  },
);
