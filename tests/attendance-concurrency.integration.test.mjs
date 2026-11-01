import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test(
  "clock requests, shared identities and permission changes serialize safely",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { holdLock, waitForLock } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const owner = createClient(url, anonKey, options);
    const first = createClient(url, anonKey, options);
    const second = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const [businessId, firstVenue, secondVenue, firstDepartment, otherDepartment,
      secondDepartment, firstEmployee, secondEmployee] = Array.from({ length: 8 }, () => randomUUID());
    const users = [];
    const linkArgs = {
      p_business_id: businessId, p_venue_id: firstVenue,
      p_employee_id: firstEmployee, p_other_employee_id: secondEmployee,
    };
    const clockArgs = (which, requestId) => ({
      p_business_id: businessId,
      p_venue_id: which === "first" ? firstVenue : secondVenue,
      p_department_id: which === "first" ? firstDepartment : secondDepartment,
      p_employee_id: which === "first" ? firstEmployee : secondEmployee,
      p_request_id: requestId,
    });
    const clockOut = (client, sessionId, requestId = randomUUID()) =>
      client.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: sessionId, p_request_id: requestId,
      });

    try {
      for (const role of ["owner", "first", "second"]) {
        const result = await admin.auth.admin.createUser({
          email: `clock-race-${role}-${suffix}@example.test`, password, email_confirm: true,
        });
        assert.ifError(result.error);
        users.push(result.data.user.id);
      }
      assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Clock race business" })).error);
      assert.ifError((await admin.from("venues").insert([
        { id: firstVenue, business_id: businessId, name: "First", timezone: "UTC" },
        { id: secondVenue, business_id: businessId, name: "Second", timezone: "UTC" },
      ])).error);
      assert.ifError((await admin.from("departments").insert([
        { id: firstDepartment, business_id: businessId, venue_id: firstVenue, name: "FOH" },
        { id: otherDepartment, business_id: businessId, venue_id: firstVenue, name: "BOH" },
        { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Other venue" },
      ])).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: businessId, user_id: users[0], role: "owner" },
        { business_id: businessId, user_id: users[1], role: "employee",
          venue_id: firstVenue, department_id: firstDepartment },
        { business_id: businessId, user_id: users[2], role: "employee",
          venue_id: secondVenue, department_id: secondDepartment },
      ])).error);
      assert.ifError((await admin.from("employees").insert([
        { id: firstEmployee, business_id: businessId, venue_id: firstVenue,
          department_id: firstDepartment, auth_user_id: users[1], name: "Worker", role_title: "Server" },
        { id: secondEmployee, business_id: businessId, venue_id: secondVenue,
          department_id: secondDepartment, auth_user_id: users[2], name: "Worker", role_title: "Cook" },
      ])).error);
      for (const [client, role] of [[owner, "owner"], [first, "first"], [second, "second"]]) {
        assert.ifError((await client.auth.signInWithPassword({
          email: `clock-race-${role}-${suffix}@example.test`, password,
        })).error);
      }
      assert.ifError((await owner.rpc("link_shared_worker_profiles", linkArgs)).error);

      const requestId = randomUUID();
      const duplicateIns = await Promise.all(Array.from({ length: 6 }, () =>
        first.rpc("clock_in_attendance", clockArgs("first", requestId))));
      for (const result of duplicateIns) assert.ifError(result.error);
      const started = duplicateIns[0].data[0];
      for (const result of duplicateIns) assert.deepEqual(result.data[0], started);
      const afterIn = await admin.from("attendance_events").select("id, event_type")
        .eq("business_id", businessId);
      assert.ifError(afterIn.error);
      assert.deepEqual(afterIn.data, [{ id: started.event_id, event_type: "clock_in" }]);
      const linkedAttempt = await second.rpc("clock_in_attendance", clockArgs("second", randomUUID()));
      assert.equal(linkedAttempt.error?.message, "Already clocked in");

      const outRequest = randomUUID();
      const duplicateOuts = await Promise.all(Array.from({ length: 6 }, () =>
        clockOut(first, started.session_id, outRequest)));
      for (const result of duplicateOuts) assert.ifError(result.error);
      for (const result of duplicateOuts) assert.deepEqual(result.data[0], duplicateOuts[0].data[0]);
      const afterOut = await admin.from("attendance_events").select("event_type")
        .eq("session_id", started.session_id);
      assert.ifError(afterOut.error);
      assert.deepEqual(afterOut.data.map((event) => event.event_type).sort(), ["clock_in", "clock_out"]);

      const competing = await Promise.all([
        first.rpc("clock_in_attendance", clockArgs("first", randomUUID())),
        first.rpc("clock_in_attendance", clockArgs("first", randomUUID())),
      ]);
      assert.equal(competing.filter((result) => !result.error).length, 1);
      assert.equal(competing.find((result) => result.error).error.message, "Already clocked in");
      assert.ifError((await clockOut(first, competing.find((result) => !result.error).data[0].session_id)).error);

      const simultaneous = await Promise.all([
        first.rpc("clock_in_attendance", clockArgs("first", randomUUID())),
        second.rpc("clock_in_attendance", clockArgs("second", randomUUID())),
      ]);
      assert.equal(simultaneous.filter((result) => !result.error).length, 1);
      const winner = simultaneous.findIndex((result) => !result.error);
      assert.equal(simultaneous[1 - winner].error?.message, "Already clocked in");
      assert.ifError((await clockOut(winner === 0 ? first : second, simultaneous[winner].data[0].session_id)).error);

      const revocation = await holdLock(
        `update public.business_memberships set department_id = '${otherDepartment}'::uuid ` +
          `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
        users[1],
      );
      let pendingRevocation;
      try {
        pendingRevocation = Promise.resolve(first.rpc("clock_in_attendance", clockArgs("first", randomUUID())));
        await waitForLock("clock_in_attendance");
        await revocation.release(true);
        const result = await pendingRevocation;
        assert.equal(result.error?.message, "Employee not found or permission denied");
      } finally {
        await revocation.release(false);
        await Promise.allSettled([pendingRevocation].filter(Boolean));
      }
      assert.ifError((await admin.from("business_memberships").update({ department_id: firstDepartment })
        .eq("business_id", businessId).eq("user_id", users[1])).error);

      const unlink = await holdLock(
        `update public.employees set auth_user_id = null where id = '${firstEmployee}'::uuid returning id`,
        firstEmployee,
      );
      let pendingUnlink;
      try {
        pendingUnlink = Promise.resolve(first.rpc("clock_in_attendance", clockArgs("first", randomUUID())));
        await waitForLock("clock_in_attendance");
        await unlink.release(true);
        const result = await pendingUnlink;
        assert.equal(result.error?.message, "Employee not found or permission denied");
      } finally {
        await unlink.release(false);
        await Promise.allSettled([pendingUnlink].filter(Boolean));
      }
      assert.ifError((await admin.from("employees").update({ auth_user_id: users[1] }).eq("id", firstEmployee)).error);

      assert.ifError((await owner.rpc("unlink_shared_worker_profile", {
        p_business_id: businessId, p_venue_id: firstVenue, p_employee_id: firstEmployee,
      })).error);
      const firstOpen = await first.rpc("clock_in_attendance", clockArgs("first", randomUUID()));
      assert.ifError(firstOpen.error);
      const [linkResult, secondOpen] = await Promise.all([
        owner.rpc("link_shared_worker_profiles", linkArgs),
        second.rpc("clock_in_attendance", clockArgs("second", randomUUID())),
      ]);
      assert.equal(Number(!linkResult.error) + Number(!secondOpen.error), 1);
      if (linkResult.error) {
        assert.equal(linkResult.error.message, "Cannot link profiles while more than one has an open clock session");
        assert.ifError((await clockOut(second, secondOpen.data[0].session_id)).error);
        assert.ifError((await owner.rpc("link_shared_worker_profiles", linkArgs)).error);
      } else {
        assert.equal(secondOpen.error?.message, "Already clocked in");
      }
      assert.ifError((await clockOut(first, firstOpen.data[0].session_id)).error);
      const closed = await admin.from("attendance_events").select("session_id, event_type, verification_status")
        .eq("business_id", businessId);
      assert.ifError(closed.error);
      assert.ok(closed.data.every((event) => event.verification_status === "unverified"));
      for (const sessionId of new Set(closed.data.map((event) => event.session_id))) {
        assert.deepEqual(closed.data.filter((event) => event.session_id === sessionId)
          .map((event) => event.event_type).sort(), ["clock_in", "clock_out"]);
      }
    } finally {
      const removed = await admin.from("businesses").delete().eq("id", businessId);
      assert.ifError(removed.error);
      for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
    }
  },
);

test(
  "break requests, clock-out and permission changes serialize safely",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { holdLock, waitForLock } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const worker = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const [businessId, venueId, departmentId, otherDepartment, employeeId] =
      Array.from({ length: 5 }, () => randomUUID());
    const users = [];
    const clockIn = () => worker.rpc("clock_in_attendance", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
      p_employee_id: employeeId, p_request_id: randomUUID(),
    });
    const clockOut = (sessionId, requestId = randomUUID()) =>
      worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: sessionId, p_request_id: requestId,
      });
    const startBreak = (sessionId, classification, requestId = randomUUID()) =>
      worker.rpc("start_attendance_break", {
        p_business_id: businessId, p_session_id: sessionId,
        p_classification: classification, p_request_id: requestId,
      });
    const endBreak = (sessionId, breakId, requestId = randomUUID()) =>
      worker.rpc("end_attendance_break", {
        p_business_id: businessId, p_session_id: sessionId,
        p_break_id: breakId, p_request_id: requestId,
      });
    const state = async () => {
      const result = await worker.rpc("get_my_attendance_state_with_break", {
        p_business_id: businessId,
      }).single();
      assert.ifError(result.error);
      return result.data;
    };

    try {
      for (const role of ["owner", "worker"]) {
        const result = await admin.auth.admin.createUser({
          email: `break-race-${role}-${suffix}@example.test`, password, email_confirm: true,
        });
        assert.ifError(result.error);
        users.push(result.data.user.id);
      }
      assert.ifError((await admin.from("businesses").insert({
        id: businessId, name: "Break race business",
      })).error);
      assert.ifError((await admin.from("venues").insert({
        id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
      })).error);
      assert.ifError((await admin.from("departments").insert([
        { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
        { id: otherDepartment, business_id: businessId, venue_id: venueId, name: "BOH" },
      ])).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: businessId, user_id: users[0], role: "owner" },
        { business_id: businessId, user_id: users[1], role: "employee",
          venue_id: venueId, department_id: departmentId },
      ])).error);
      assert.ifError((await admin.from("employees").insert({
        id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "Break worker", role_title: "Server",
      })).error);
      assert.ifError((await worker.auth.signInWithPassword({
        email: `break-race-worker-${suffix}@example.test`, password,
      })).error);

      const firstIn = await clockIn();
      assert.ifError(firstIn.error);
      const firstSession = firstIn.data[0].session_id;
      const startKey = randomUUID();
      const starts = await Promise.all(Array.from({ length: 6 }, () =>
        startBreak(firstSession, "paid", startKey)));
      for (const result of starts) {
        assert.ifError(result.error);
        assert.deepEqual(result.data[0], starts[0].data[0]);
      }
      const firstBreak = (await state()).break_id;
      assert.ok(firstBreak);
      const changedReplay = await startBreak(firstSession, "unpaid", startKey);
      assert.equal(changedReplay.error?.message, "Request identifier already used");
      const breakRows = await admin.from("attendance_breaks").select("id, classification")
        .eq("session_id", firstSession);
      assert.ifError(breakRows.error);
      assert.deepEqual(breakRows.data, [{ id: firstBreak, classification: "paid" }]);
      assert.equal((await clockOut(firstSession)).error?.message, "End the open break before clocking out");

      const endKey = randomUUID();
      const ends = await Promise.all(Array.from({ length: 6 }, () =>
        endBreak(firstSession, firstBreak, endKey)));
      for (const result of ends) {
        assert.ifError(result.error);
        assert.deepEqual(result.data[0], ends[0].data[0]);
      }
      const firstEvents = await admin.from("attendance_events").select("event_type")
        .eq("session_id", firstSession);
      assert.ifError(firstEvents.error);
      assert.deepEqual(firstEvents.data.map((event) => event.event_type).sort(),
        ["break_end", "break_start", "clock_in"]);

      const competingStarts = await Promise.all([
        startBreak(firstSession, "paid"),
        startBreak(firstSession, "unpaid"),
      ]);
      assert.equal(competingStarts.filter((result) => !result.error).length, 1);
      assert.equal(competingStarts.find((result) => result.error).error.message, "Already on a break");
      const secondBreak = (await state()).break_id;
      const outKey = randomUUID();
      const [ended, out] = await Promise.all([
        endBreak(firstSession, secondBreak),
        clockOut(firstSession, outKey),
      ]);
      assert.ifError(ended.error);
      if (out.error) {
        assert.equal(out.error.message, "End the open break before clocking out");
        assert.ifError((await clockOut(firstSession, outKey)).error);
      }
      assert.equal((await state()).state, "clocked_out");

      const nextIn = await clockIn();
      assert.ifError(nextIn.error);
      const nextSession = nextIn.data[0].session_id;
      const [racingStart, racingOut] = await Promise.all([
        startBreak(nextSession, "unpaid"),
        clockOut(nextSession),
      ]);
      assert.equal(Number(!racingStart.error) + Number(!racingOut.error), 1);
      if (!racingStart.error) {
        assert.equal(racingOut.error?.message, "End the open break before clocking out");
        assert.ifError((await endBreak(nextSession, (await state()).break_id)).error);
        assert.ifError((await clockOut(nextSession)).error);
      } else {
        assert.equal(racingStart.error.message, "Attendance session is not open");
      }

      const permissionIn = await clockIn();
      assert.ifError(permissionIn.error);
      const permissionSession = permissionIn.data[0].session_id;
      assert.ifError((await startBreak(permissionSession, "paid")).error);
      const permissionBreak = (await state()).break_id;
      const revocation = await holdLock(
        `update public.business_memberships set department_id = '${otherDepartment}'::uuid ` +
          `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
        users[1],
      );
      const pendingKey = randomUUID();
      let pendingEnd;
      try {
        pendingEnd = Promise.resolve(endBreak(permissionSession, permissionBreak, pendingKey));
        await waitForLock("end_attendance_break");
        await revocation.release(true);
        const denied = await pendingEnd;
        assert.equal(denied.error?.message, "Session not found or permission denied");
      } finally {
        await revocation.release(false);
        await Promise.allSettled([pendingEnd].filter(Boolean));
      }
      assert.ifError((await admin.from("business_memberships").update({ department_id: departmentId })
        .eq("business_id", businessId).eq("user_id", users[1])).error);
      assert.ifError((await endBreak(permissionSession, permissionBreak, pendingKey)).error);
      assert.ifError((await clockOut(permissionSession)).error);

      const unlinkIn = await clockIn();
      assert.ifError(unlinkIn.error);
      const unlinkSession = unlinkIn.data[0].session_id;
      const unlink = await holdLock(
        `update public.employees set auth_user_id = null where id = '${employeeId}'::uuid returning id`,
        employeeId,
      );
      let pendingStart;
      try {
        pendingStart = Promise.resolve(startBreak(unlinkSession, "unpaid"));
        await waitForLock("start_attendance_break");
        await unlink.release(true);
        const denied = await pendingStart;
        assert.equal(denied.error?.message, "Session not found or permission denied");
      } finally {
        await unlink.release(false);
        await Promise.allSettled([pendingStart].filter(Boolean));
      }
      assert.ifError((await admin.from("employees").update({ auth_user_id: users[1] })
        .eq("id", employeeId)).error);
      assert.ifError((await startBreak(unlinkSession, "unpaid")).error);
      assert.ifError((await endBreak(unlinkSession, (await state()).break_id)).error);
      assert.ifError((await clockOut(unlinkSession)).error);
    } finally {
      assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
      for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
    }
  },
);
