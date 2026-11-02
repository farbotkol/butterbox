import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test(
  "multi-business members are authorised per business on every request",
  {
    skip: url && anonKey && serviceKey ? false : "requires a disposable local Supabase API",
    timeout: 60_000,
  },
  async () => {
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const member = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const [ownedBusiness, staffBusiness, outsideBusiness, ownedVenue, staffVenue, outsideVenue,
      ownedDepartment, staffDepartment, outsideDepartment, ownedEmployee, staffEmployee, outsideEmployee] =
      Array.from({ length: 12 }, () => randomUUID());
    const users = [];
    try {
      for (const name of ["member", "outside"]) {
        const created = await admin.auth.admin.createUser({
          email: `switch-${name}-${suffix}@example.test`, password, email_confirm: true,
        });
        assert.ifError(created.error);
        users.push(created.data.user.id);
      }
      assert.ifError((await admin.from("businesses").insert([
        { id: ownedBusiness, name: `Owned ${suffix}` },
        { id: staffBusiness, name: `Staff ${suffix}` },
        { id: outsideBusiness, name: `Outside ${suffix}` },
      ])).error);
      assert.ifError((await admin.from("venues").insert([
        { id: ownedVenue, business_id: ownedBusiness, name: "Owned venue", timezone: "UTC" },
        { id: staffVenue, business_id: staffBusiness, name: "Staff venue", timezone: "UTC" },
        { id: outsideVenue, business_id: outsideBusiness, name: "Outside venue", timezone: "UTC" },
      ])).error);
      assert.ifError((await admin.from("departments").insert([
        { id: ownedDepartment, business_id: ownedBusiness, venue_id: ownedVenue, name: "Owned FOH" },
        { id: staffDepartment, business_id: staffBusiness, venue_id: staffVenue, name: "Staff FOH" },
        { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside FOH" },
      ])).error);
      assert.ifError((await admin.from("employees").insert([
        { id: ownedEmployee, business_id: ownedBusiness, venue_id: ownedVenue, department_id: ownedDepartment,
          name: "Owned colleague", role_title: "Server" },
        { id: staffEmployee, business_id: staffBusiness, venue_id: staffVenue, department_id: staffDepartment,
          name: "Staff colleague", role_title: "Server" },
        { id: outsideEmployee, business_id: outsideBusiness, venue_id: outsideVenue,
          department_id: outsideDepartment, name: "Outside colleague", role_title: "Server" },
      ])).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: ownedBusiness, user_id: users[0], role: "owner" },
        { business_id: staffBusiness, user_id: users[0], role: "employee",
          venue_id: staffVenue, department_id: staffDepartment },
        { business_id: outsideBusiness, user_id: users[1], role: "owner" },
      ])).error);
      assert.ifError((await member.auth.signInWithPassword({
        email: `switch-member-${suffix}@example.test`, password,
      })).error);

      const visibleBusinesses = await member.from("businesses").select("id")
        .in("id", [ownedBusiness, staffBusiness, outsideBusiness]).order("id");
      assert.ifError(visibleBusinesses.error);
      assert.deepEqual(visibleBusinesses.data.map((row) => row.id).sort(), [ownedBusiness, staffBusiness].sort());
      const ownMemberships = await member.from("business_memberships").select("business_id, role")
        .in("business_id", [ownedBusiness, staffBusiness, outsideBusiness]);
      assert.ifError(ownMemberships.error);
      assert.deepEqual(ownMemberships.data.map((row) => `${row.business_id}:${row.role}`).sort(),
        [`${ownedBusiness}:owner`, `${staffBusiness}:employee`].sort());

      const ownedDepartmentSave = await member.rpc("save_department", {
        p_business_id: ownedBusiness, p_venue_id: ownedVenue, p_department_id: null,
        p_name: "Owner-created", p_active: true,
      });
      assert.ifError(ownedDepartmentSave.error);
      // Owner rights in one business must never apply to the employee-only business or an outside business.
      for (const [businessId, venueId] of [[staffBusiness, staffVenue], [outsideBusiness, outsideVenue],
        [staffBusiness, ownedVenue], [ownedBusiness, staffVenue]]) {
        const denied = await member.rpc("save_department", {
          p_business_id: businessId, p_venue_id: venueId, p_department_id: null,
          p_name: `Denied ${businessId.slice(0, 8)}`, p_active: true,
        });
        assert.ok(denied.error, `department save must fail for ${businessId}/${venueId}`);
      }
      const deniedDepartments = await admin.from("departments").select("id")
        .in("business_id", [staffBusiness, outsideBusiness]).like("name", "Denied %");
      assert.ifError(deniedDepartments.error);
      assert.deepEqual(deniedDepartments.data, []);

      const colleagues = await member.from("employees").select("id")
        .in("id", [ownedEmployee, staffEmployee, outsideEmployee]);
      assert.ifError(colleagues.error);
      assert.ok(colleagues.data.some((row) => row.id === ownedEmployee));
      assert.ok(!colleagues.data.some((row) => row.id === outsideEmployee));

      assert.ifError((await admin.from("business_memberships").delete()
        .eq("business_id", staffBusiness).eq("user_id", users[0])).error);
      // The same signed-in token is re-authorised against current memberships without re-login.
      const afterRevocation = await member.from("businesses").select("id")
        .in("id", [ownedBusiness, staffBusiness, outsideBusiness]);
      assert.ifError(afterRevocation.error);
      assert.deepEqual(afterRevocation.data.map((row) => row.id), [ownedBusiness]);
      const revokedStaff = await member.from("employees").select("id").eq("business_id", staffBusiness);
      assert.ifError(revokedStaff.error);
      assert.deepEqual(revokedStaff.data, []);
      const revokedVenues = await member.from("venues").select("id").eq("business_id", staffBusiness);
      assert.ifError(revokedVenues.error);
      assert.deepEqual(revokedVenues.data, []);
      const stillOwned = await member.rpc("save_department", {
        p_business_id: ownedBusiness, p_venue_id: ownedVenue, p_department_id: null,
        p_name: "Still owned", p_active: true,
      });
      assert.ifError(stillOwned.error);
    } finally {
      await member.auth.signOut();
      for (const business of [ownedBusiness, staffBusiness, outsideBusiness]) {
        assert.ifError((await admin.from("businesses").delete().eq("id", business)).error);
      }
      for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
    }
  },
);
