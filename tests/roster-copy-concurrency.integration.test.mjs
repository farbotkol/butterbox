import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test(
  "roster copying serializes retries, availability, overlaps, role policies and permission changes",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const owner = createClient(url, anonKey, options);
    const manager = createClient(url, anonKey, options);
    const worker = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const businessId = randomUUID();
    const [venueId, otherVenueId] = [randomUUID(), randomUUID()];
    const [departmentId, otherDepartmentId] = [randomUUID(), randomUUID()];
    const [employeeId, linkedEmployeeId] = [randomUUID(), randomUUID()];
    const roleId = randomUUID();
    const users = [];
    const args = (targetWeek, requestId = randomUUID()) => ({
      p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
      p_source_week: "2032-03-29", p_target_week: targetWeek, p_request_id: requestId,
    });

    async function targetShifts(week) {
      const start = new Date(`${week}T00:00:00Z`);
      const end = new Date(start.valueOf() + 7 * 24 * 60 * 60 * 1000);
      const result = await admin.from("shifts").select("id, employee_id, is_published, break_minutes")
        .eq("business_id", businessId).eq("venue_id", venueId)
        .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
      assert.ifError(result.error);
      return result.data;
    }

    try {
      for (const name of ["owner", "manager", "worker"]) {
        const created = await admin.auth.admin.createUser({
          email: `copy-${name}-${suffix}@example.test`, password, email_confirm: true,
        });
        assert.ifError(created.error);
        users.push(created.data.user.id);
      }
      assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Copy races" })).error);
      assert.ifError((await admin.from("venues").insert([
        { id: venueId, business_id: businessId, name: "First", timezone: "UTC" },
        { id: otherVenueId, business_id: businessId, name: "Second", timezone: "UTC" },
      ])).error);
      assert.ifError((await admin.from("departments").insert([
        { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
        { id: otherDepartmentId, business_id: businessId, venue_id: otherVenueId, name: "Other" },
      ])).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: businessId, user_id: users[0], role: "owner" },
        { business_id: businessId, user_id: users[1], role: "foh_manager",
          venue_id: venueId, department_id: departmentId },
        { business_id: businessId, user_id: users[2], role: "employee",
          venue_id: venueId, department_id: departmentId },
      ])).error);
      assert.ifError((await admin.from("employees").insert([
        { id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
          auth_user_id: users[2], name: "Copy worker", role_title: "Server" },
        { id: linkedEmployeeId, business_id: businessId, venue_id: otherVenueId,
          department_id: otherDepartmentId, name: "Linked worker", role_title: "Server" },
      ])).error);
      assert.ifError((await admin.from("job_roles").insert({
        id: roleId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Server", restrict_manual_assignment: false,
      })).error);
      assert.ifError((await admin.from("shifts").insert([
        { business_id: businessId, venue_id: venueId, department_id: departmentId,
          employee_id: employeeId, role_title: "Server", starts_at: "2032-03-29T09:00:00Z",
          ends_at: "2032-03-29T11:00:00Z" },
        { business_id: businessId, venue_id: venueId, department_id: departmentId,
          employee_id: null, role_title: "Open", starts_at: "2032-03-29T12:00:00Z",
          ends_at: "2032-03-29T14:00:00Z" },
      ])).error);
      for (const [client, name] of [[owner, "owner"], [manager, "manager"], [worker, "worker"]]) {
        assert.ifError((await client.auth.signInWithPassword({
          email: `copy-${name}-${suffix}@example.test`, password,
        })).error);
      }

      const sameRequest = args("2032-04-05");
      const retries = await Promise.all([
        owner.rpc("copy_roster_week", sameRequest), owner.rpc("copy_roster_week", sameRequest),
      ]);
      for (const result of retries) {
        assert.ifError(result.error);
        assert.equal(result.data, 2);
      }
      const copied = await targetShifts("2032-04-05");
      assert.equal(copied.length, 2);
      assert.ok(copied.every((shift) => !shift.is_published));

      const sourceShift = await admin.from("shifts").select("id")
        .eq("business_id", businessId).eq("role_title", "Server")
        .eq("starts_at", "2032-03-29T09:00:00Z").single();
      assert.ifError(sourceShift.error);
      const sourceLock = await holdLock(
        `update public.shifts set break_minutes = 5 where id = '${sourceShift.data.id}'::uuid`,
      );
      const changedSource = args("2032-05-24");
      try {
        assert.equal((await owner.rpc("copy_roster_week", changedSource)).error?.message,
          "Roster changed while copying; please try again");
        await sourceLock.release(true);
        const retried = await owner.rpc("copy_roster_week", changedSource);
        assert.ifError(retried.error);
        assert.equal(retried.data, 2);
        assert.equal((await targetShifts("2032-05-24"))
          .find((shift) => shift.employee_id === employeeId).break_minutes, 5);
      } finally {
        await sourceLock.release(false);
      }

      const policyLock = await holdLock(
        `update public.job_roles set restrict_manual_assignment = true where id = '${roleId}'::uuid`,
      );
      const policyRequest = args("2032-04-12");
      try {
        const busy = await owner.rpc("copy_roster_week", policyRequest);
        assert.equal(busy.error?.message, "Roster changed while copying; please try again");
        await policyLock.release(true);
        const rejected = await owner.rpc("copy_roster_week", policyRequest);
        assert.equal(rejected.error?.message, "Employee is not qualified for this role");
        assert.deepEqual(await targetShifts("2032-04-12"), []);
      } finally {
        await policyLock.release(false);
      }
      assert.ifError((await admin.from("job_roles").update({ restrict_manual_assignment: false }).eq("id", roleId)).error);

      const leave = await worker.rpc("request_availability_exception", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
        p_starts_on: "2032-04-19", p_ends_on: "2032-04-19", p_exception_type: "leave",
      });
      assert.ifError(leave.error);
      const employeeLock = await holdLock(
        `select id from public.employees where id = '${employeeId}'::uuid for update`, employeeId,
      );
      let review;
      const leaveRequest = args("2032-04-19");
      try {
        review = Promise.resolve(owner.rpc("review_leave_request", {
          p_business_id: businessId, p_venue_id: venueId, p_exception_id: leave.data, p_status: "approved",
        }));
        await waitForLock("review_leave_request");
        const busy = await owner.rpc("copy_roster_week", leaveRequest);
        assert.equal(busy.error?.message, "Roster changed while copying; please try again");
        await employeeLock.release(true);
        assert.ifError((await review).error);
        const rejected = await owner.rpc("copy_roster_week", leaveRequest);
        assert.equal(rejected.error?.message, "An employee is unavailable for a copied shift");
        assert.deepEqual(await targetShifts("2032-04-19"), []);
      } finally {
        await employeeLock.release(false);
        await Promise.allSettled([review].filter(Boolean));
      }

      const availabilityLock = await holdLock(
        `select id from public.employees where id = '${employeeId}'::uuid for update`, employeeId,
      );
      let availability;
      const availabilityRequest = args("2032-04-26");
      try {
        availability = Promise.resolve(worker.rpc("set_employee_recurring_availability", {
          p_business_id: businessId, p_employee_id: employeeId, p_intervals: [],
        }));
        await waitForLock("set_employee_recurring_availability");
        assert.equal((await owner.rpc("copy_roster_week", availabilityRequest)).error?.message,
          "Roster changed while copying; please try again");
        await availabilityLock.release(true);
        assert.ifError((await availability).error);
        assert.equal((await owner.rpc("copy_roster_week", availabilityRequest)).error?.message,
          "An employee is unavailable for a copied shift");
        assert.deepEqual(await targetShifts("2032-04-26"), []);
      } finally {
        await availabilityLock.release(false);
        await Promise.allSettled([availability].filter(Boolean));
      }
      assert.ifError((await admin.from("employee_availability_patterns").delete().eq("employee_id", employeeId)).error);

      const overlapLock = await holdLock(
        `select pg_advisory_xact_lock(hashtextextended('${employeeId}', 0));
         insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at)
         values ('${businessId}', '${venueId}', '${departmentId}', '${employeeId}',
           'Concurrent shift', '2032-05-03 09:30+00', '2032-05-03 10:30+00')`,
      );
      const overlapRequest = args("2032-05-03");
      try {
        assert.equal((await owner.rpc("copy_roster_week", overlapRequest)).error?.message,
          "Roster changed while copying; please try again");
        await overlapLock.release(true);
        assert.equal((await owner.rpc("copy_roster_week", overlapRequest)).error?.message,
          "A copied shift overlaps an existing shift");
        assert.equal((await targetShifts("2032-05-03")).length, 1);
      } finally {
        await overlapLock.release(false);
      }

      const identityLock = await holdLock(
        `select pg_advisory_xact_lock(hashtextextended('shared-worker-links:${businessId}', 0))`,
      );
      let revokedCopy;
      try {
        revokedCopy = Promise.resolve(manager.rpc("copy_roster_week", args("2032-05-10")));
        await waitForLock("copy_roster_week");
        assert.ifError((await admin.from("business_memberships").delete()
          .eq("business_id", businessId).eq("user_id", users[1])).error);
        await identityLock.release(true);
        assert.equal((await revokedCopy).error?.message, "Permission denied");
        assert.deepEqual(await targetShifts("2032-05-10"), []);
      } finally {
        await identityLock.release(false);
        await Promise.allSettled([revokedCopy].filter(Boolean));
      }

      assert.ifError((await owner.rpc("link_shared_worker_profiles", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
        p_other_employee_id: linkedEmployeeId,
      })).error);
      const groupId = await sql(
        `select shared_worker_id from public.shared_worker_profiles where employee_id = '${employeeId}'::uuid`,
      );
      assert.match(groupId, /^[0-9a-f-]{36}$/);
      const groupLock = await holdLock(
        `select pg_advisory_xact_lock(hashtextextended('shared-worker:${groupId}', 0))`,
      );
      const groupRequest = args("2032-05-17");
      try {
        assert.equal((await owner.rpc("copy_roster_week", groupRequest)).error?.message,
          "Roster changed while copying; please try again");
      } finally {
        await groupLock.release(false);
      }
      const afterGroupLock = await owner.rpc("copy_roster_week", groupRequest);
      assert.ifError(afterGroupLock.error);
      assert.equal(afterGroupLock.data, 2);
      assert.equal((await targetShifts("2032-05-17")).length, 2);
    } finally {
      await assertBusinessFixturesPreserved(admin, businessId);
      for (const userId of users) assert.ifError((await admin.auth.admin.deleteUser(userId)).error);
    }
  },
);
