import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;
const disposable = process.env.BUTTERBOX_TEST_DISPOSABLE;
const configured = [url, anonKey, serviceKey, disposable].some(Boolean);

test(
  "two tenants remain isolated and concurrent shift assignments cannot overlap",
  { skip: configured ? false : "requires an explicitly configured disposable local Supabase" },
  async () => {
    assert.ok(url && anonKey && serviceKey, "All test Supabase settings are required");
    assert.equal(disposable, "yes", "The test database must be explicitly disposable");
    const parsedUrl = new URL(url);
    assert.equal(parsedUrl.protocol, "http:");
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname),
      "Integration tests may only connect to a local Supabase API",
    );
    assert.equal(parsedUrl.pathname, "/");
    assert.equal(parsedUrl.username, "");
    assert.equal(parsedUrl.password, "");
    assert.equal(parsedUrl.search, "");
    assert.equal(parsedUrl.hash, "");

    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const users = [];
    const businesses = [];
    const suffix = randomUUID();
    const password = `${randomBytes(24).toString("base64url")}aA1!`;

    async function createTenant(label) {
      const email = `tenant-${label}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(created.error);
      assert.ok(created.data.user);
      users.push(created.data.user.id);

      const client = createClient(url, anonKey, options);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      assert.ifError(signedIn.error);
      assert.ok(signedIn.data.session);

      const business = await client.rpc("create_business", {
        p_business_name: `Tenant ${label} ${suffix}`,
        p_venue_name: `Venue ${label}`,
        p_timezone: "Australia/Sydney",
        p_include_sample_data: false,
      });
      assert.ifError(business.error);
      assert.ok(business.data);
      businesses.push(business.data);

      const venue = await client
        .from("venues")
        .select("id")
        .eq("business_id", business.data)
        .single();
      assert.ifError(venue.error);
      const department = await client
        .from("departments")
        .select("id")
        .eq("business_id", business.data)
        .eq("name", "Front of House")
        .single();
      assert.ifError(department.error);

      const shift = await client.rpc("save_shift", {
        p_business_id: business.data,
        p_venue_id: venue.data.id,
        p_department_id: department.data.id,
        p_employee_id: null,
        p_role_title: "Server",
        p_start_local: "2031-06-02 09:00:00",
        p_end_local: "2031-06-02 10:00:00",
        p_break_minutes: 0,
      });
      assert.ifError(shift.error);
      assert.ok(shift.data);

      return {
        client,
        business: business.data,
        venue: venue.data.id,
        department: department.data.id,
        shift: shift.data,
      };
    }

    async function assertIsolation(own, other) {
      for (const [table, id] of [
        ["businesses", other.business],
        ["venues", other.venue],
        ["departments", other.department],
        ["shifts", other.shift],
      ]) {
        const result = await own.client.from(table).select("id").eq("id", id);
        assert.ifError(result.error);
        assert.deepEqual(result.data, [], `${table} from another tenant must be hidden`);
      }

      const visible = await own.client
        .from("shifts")
        .select("id")
        .eq("id", own.shift)
        .single();
      assert.ifError(visible.error);
      assert.equal(visible.data.id, own.shift);

      const directWrite = await own.client
        .from("venues")
        .insert({ business_id: other.business, name: "Unauthorised" });
      assert.equal(directWrite.error?.code, "42501");

      const createShift = await own.client.rpc("save_shift", {
        p_business_id: other.business,
        p_venue_id: other.venue,
        p_department_id: other.department,
        p_employee_id: null,
        p_role_title: "Server",
        p_start_local: "2031-06-03 09:00:00",
        p_end_local: "2031-06-03 10:00:00",
        p_break_minutes: 0,
      });
      assert.equal(createShift.error?.message, "Permission denied");

      const publish = await own.client.rpc("publish_roster", {
        p_business_id: other.business,
        p_venue_id: other.venue,
        p_department_id: other.department,
        p_week_start: "2026-10-26",
      });
      assert.equal(publish.error?.message, "Permission denied");

      const remove = await own.client.rpc("delete_shift", {
        p_shift_id: other.shift,
      });
      assert.equal(remove.error?.message, "Permission denied");
    }

    async function assertConcurrentAssignments(tenant) {
      const employeeId = randomUUID();
      const employee = await admin.from("employees").insert({
        id: employeeId,
        business_id: tenant.business,
        venue_id: tenant.venue,
        department_id: tenant.department,
        name: "Concurrent test worker",
        role_title: "Server",
      });
      assert.ifError(employee.error);
      const details = {
        p_business_id: tenant.business,
        p_venue_id: tenant.venue,
        p_department_id: tenant.department,
        p_role_title: "Server",
        p_break_minutes: 0,
      };
      async function openShift(day) {
        const result = await tenant.client.rpc("save_shift", {
          ...details,
          p_employee_id: null,
          p_start_local: `${day} 08:00`,
          p_end_local: `${day} 09:00`,
        });
        assert.ifError(result.error);
        assert.ok(result.data);
        return result.data;
      }
      const [first, second] = await Promise.all([openShift("2033-06-01"), openShift("2033-06-01")]);
      const edit = (shiftId, day) => tenant.client.rpc("update_draft_shift", {
        ...details,
        p_shift_id: shiftId,
        p_employee_id: employeeId,
        p_start_local: `${day} 15:00`,
        p_end_local: `${day} 17:00`,
      });
      const assertOneWinner = (results, expectedErrors) => {
        assert.equal(results.filter((result) => !result.error).length, 1);
        const failed = results.filter((result) => result.error);
        assert.equal(failed.length, 1);
        assert.ok(expectedErrors.includes(failed[0].error.message), failed[0].error.message);
      };
      assertOneWinner(await Promise.all([edit(first, "2033-06-01"), edit(second, "2033-06-01")]),
        ["Employee has an overlapping shift"]);
      const stored = await admin.from("shifts").select("id, employee_id").in("id", [first, second]);
      assert.ifError(stored.error);
      assert.equal(stored.data.filter((shift) => shift.employee_id === employeeId).length, 1);
      assert.equal(stored.data.filter((shift) => shift.employee_id === null).length, 1);

      const third = await openShift("2033-06-02");
      assertOneWinner(await Promise.all([
        edit(third, "2033-06-02"),
        tenant.client.rpc("save_shift", {
          ...details, p_employee_id: employeeId,
          p_start_local: "2033-06-02 15:00", p_end_local: "2033-06-02 17:00",
        }),
      ]), ["Employee has an overlapping shift"]);

      const fourth = await openShift("2033-06-03");
      assertOneWinner(await Promise.all([
        edit(fourth, "2033-06-03"),
        tenant.client.rpc("save_shift_auto_assign", {
          ...details,
          p_start_local: "2033-06-03 15:00", p_end_local: "2033-06-03 17:00",
        }),
      ]), ["Employee has an overlapping shift", "No eligible employee available for automatic assignment"]);
    }

    try {
      const first = await createTenant("a");
      const second = await createTenant("b");
      await assertIsolation(first, second);
      await assertIsolation(second, first);
      await assertConcurrentAssignments(first);
    } finally {
      const cleanupErrors = [];
      if (businesses.length > 0) {
        const shifts = await admin.from("shifts").delete().in("business_id", businesses);
        if (shifts.error) cleanupErrors.push(`shifts: ${shifts.error.message}`);
        const removed = await admin.from("businesses").delete().in("id", businesses);
        if (removed.error) cleanupErrors.push(`businesses: ${removed.error.message}`);
      }
      for (const user of users) {
        const removed = await admin.auth.admin.deleteUser(user);
        if (removed.error) cleanupErrors.push(`test user: ${removed.error.message}`);
      }
      assert.deepEqual(cleanupErrors, [], "Disposable test fixtures must be removed");
    }
  },
);
