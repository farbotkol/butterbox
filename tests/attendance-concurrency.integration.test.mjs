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
