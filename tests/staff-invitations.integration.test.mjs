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
  "staff invitations serialize duplicates, acceptance, revocation and membership changes",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const clients = Object.fromEntries(
      ["owner", "manager", "worker1", "worker2", "worker3", "outside"]
        .map((name) => [name, createClient(url, anonKey, options)]),
    );
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const businessId = randomUUID();
    const outsideBusinessId = randomUUID();
    const venueId = randomUUID();
    const outsideVenueId = randomUUID();
    const departmentId = randomUUID();
    const outsideDepartmentId = randomUUID();
    const employeeIds = Array.from({ length: 6 }, () => randomUUID());
    const users = {};
    const businesses = new Set([businessId, outsideBusinessId]);
    const email = (name) => `invitation-${name}-${suffix}@example.test`;
    const invite = (index, address) => ({
      p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
      p_employee_id: employeeIds[index], p_email: address,
    });

    try {
      for (const name of Object.keys(clients)) {
        const created = await admin.auth.admin.createUser({
          email: email(name), password, email_confirm: true,
        });
        assert.ifError(created.error);
        assert.ok(created.data.user);
        users[name] = created.data.user.id;
        assert.ifError((await clients[name].auth.signInWithPassword({
          email: email(name), password,
        })).error);
      }
      assert.ifError((await admin.from("businesses").insert([
        { id: businessId, name: "Invitation races" },
        { id: outsideBusinessId, name: "Outside invitation business" },
      ])).error);
      assert.ifError((await admin.from("venues").insert([
        { id: venueId, business_id: businessId, name: "First", timezone: "UTC" },
        { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside", timezone: "UTC" },
      ])).error);
      assert.ifError((await admin.from("departments").insert([
        { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
        { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "FOH" },
      ])).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: businessId, user_id: users.owner, role: "owner" },
        { business_id: businessId, user_id: users.manager, role: "foh_manager",
          venue_id: venueId, department_id: departmentId },
        { business_id: outsideBusinessId, user_id: users.outside, role: "owner" },
      ])).error);
      assert.ifError((await admin.from("employees").insert(employeeIds.map((id, index) => ({
        id, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: `Worker ${index}`, role_title: "Server",
      })))).error);

      const retries = await Promise.all(
        Array.from({ length: 3 }, () => clients.manager.rpc("create_staff_invitation", invite(0, email("worker1")))),
      );
      const created = retries.filter((result) => !result.error);
      assert.equal(created.length, 1);
      for (const result of retries.filter((item) => item.error)) {
        assert.equal(result.error.message, "An active invitation already exists");
      }
      const firstId = created[0].data;
      assert.match(firstId, /^[0-9a-f-]{36}$/i);
      const hidden = await clients.outside.from("staff_invitations").select("id").eq("id", firstId);
      assert.ifError(hidden.error);
      assert.deepEqual(hidden.data, []);
      assert.equal(
        (await clients.outside.rpc("revoke_staff_invitation", { p_invitation_id: firstId })).error?.message,
        "Permission denied",
      );

      const acceptances = await Promise.all(
        Array.from({ length: 3 }, () =>
          clients.worker1.rpc("accept_staff_invitation", { p_invitation_id: firstId })),
      );
      assert.equal(acceptances.filter((result) => !result.error).length, 1);
      for (const result of acceptances.filter((item) => item.error)) {
        assert.equal(result.error.message, "Invitation is unavailable");
      }
      const membership = await admin.from("business_memberships")
        .select("business_id, venue_id, department_id, role").eq("user_id", users.worker1);
      assert.ifError(membership.error);
      assert.deepEqual(membership.data, [{
        business_id: businessId, venue_id: venueId, department_id: departmentId, role: "employee",
      }]);
      const firstProfile = await admin.from("employees").select("auth_user_id").eq("id", employeeIds[0]).single();
      assert.ifError(firstProfile.error);
      assert.equal(firstProfile.data.auth_user_id, users.worker1);
      const firstEvents = await clients.manager.from("staff_invitation_events").select("event, actor_id")
        .eq("invitation_id", firstId).order("id");
      assert.ifError(firstEvents.error);
      assert.deepEqual(firstEvents.data, [
        { event: "created", actor_id: users.manager },
        { event: "accepted", actor_id: users.worker1 },
      ]);

      const second = await clients.manager.rpc("create_staff_invitation", invite(1, email("worker2")));
      assert.ifError(second.error);
      const revokedLock = await holdLock(
        `update public.staff_invitations set status = 'revoked' where id = '${second.data}'::uuid`,
      );
      let pendingAcceptance;
      try {
        pendingAcceptance = Promise.resolve(
          clients.worker2.rpc("accept_staff_invitation", { p_invitation_id: second.data }),
        );
        await waitForLock("accept_staff_invitation");
        await revokedLock.release(true);
        assert.equal((await pendingAcceptance).error?.message, "Invitation is unavailable or expired");
      } finally {
        await revokedLock.release(false);
        if (pendingAcceptance) await Promise.allSettled([pendingAcceptance]);
      }
      const secondMembership = await admin.from("business_memberships").select("id").eq("user_id", users.worker2);
      assert.ifError(secondMembership.error);
      assert.deepEqual(secondMembership.data, []);

      const third = await clients.manager.rpc("create_staff_invitation", invite(2, email("worker3")));
      assert.ifError(third.error);
      const setupRace = await Promise.all([
        clients.worker3.rpc("accept_staff_invitation", { p_invitation_id: third.data }),
        clients.worker3.rpc("complete_initial_setup", {
          p_business_name: `Race setup ${suffix}`, p_venue_name: "New venue",
          p_venue_address: "10 Test Street", p_timezone: "UTC", p_include_sample_data: false,
        }),
      ]);
      assert.equal(setupRace.filter((result) => !result.error).length, 1);
      const failedSetupRace = setupRace.find((result) => result.error);
      assert.ok([
        "Workspace already exists",
        "Business switching is not yet available for this account",
      ].includes(failedSetupRace.error.message));
      const thirdMembership = await admin.from("business_memberships").select("business_id")
        .eq("user_id", users.worker3);
      assert.ifError(thirdMembership.error);
      assert.equal(thirdMembership.data.length, 1);
      for (const membershipRow of thirdMembership.data) businesses.add(membershipRow.business_id);

      const duplicateEmail = `duplicate-${suffix}@example.test`;
      const emailRace = await Promise.all([
        clients.manager.rpc("create_staff_invitation", invite(3, duplicateEmail)),
        clients.manager.rpc("create_staff_invitation", invite(4, duplicateEmail)),
      ]);
      assert.equal(emailRace.filter((result) => !result.error).length, 1);
      assert.equal(emailRace.find((result) => result.error).error.message, "An active invitation already exists");

      const membershipLock = await holdLock(
        `delete from public.business_memberships where business_id = '${businessId}'::uuid and user_id = '${users.manager}'::uuid`,
      );
      let pendingInvite;
      try {
        pendingInvite = Promise.resolve(
          clients.manager.rpc("create_staff_invitation", invite(5, `last-${suffix}@example.test`)),
        );
        await waitForLock("create_staff_invitation");
        await membershipLock.release(true);
        assert.equal((await pendingInvite).error?.message, "Permission denied");
      } finally {
        await membershipLock.release(false);
        if (pendingInvite) await Promise.allSettled([pendingInvite]);
      }
      assert.equal(
        await sql(`select count(*) from public.staff_invitations where employee_id = '${employeeIds[5]}'::uuid`),
        "0",
      );
    } finally {
      if (users.worker3) {
        const memberships = await admin.from("business_memberships").select("business_id").eq("user_id", users.worker3);
        assert.ifError(memberships.error);
        for (const membership of memberships.data) businesses.add(membership.business_id);
      }
      for (const business of businesses) {
        assert.ifError((await admin.from("businesses").delete().eq("id", business)).error);
      }
      for (const user of Object.values(users)) {
        assert.ifError((await admin.auth.admin.deleteUser(user)).error);
      }
    }
  },
);
