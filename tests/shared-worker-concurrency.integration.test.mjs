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
  "shared-worker linking, assignment and publication serialize across venues",
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
    const businessId = randomUUID();
    const [firstVenue, secondVenue] = [randomUUID(), randomUUID()];
    const [firstDepartment, secondDepartment] = [randomUUID(), randomUUID()];
    const [firstEmployee, secondEmployee] = [randomUUID(), randomUUID()];
    const email = `shared-race-${randomUUID()}@example.test`;
    const managerEmail = `shared-race-manager-${randomUUID()}@example.test`;
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    let userId;
    let managerId;

    const linkArgs = {
      p_business_id: businessId, p_venue_id: firstVenue,
      p_employee_id: firstEmployee, p_other_employee_id: secondEmployee,
    };
    const autoArgs = (venue, department, title, start, end) => ({
      p_business_id: businessId, p_venue_id: venue, p_department_id: department,
      p_role_title: title, p_start_local: start, p_end_local: end, p_break_minutes: 0,
    });

    try {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      userId = created.data.user.id;
      const createdManager = await admin.auth.admin.createUser({
        email: managerEmail, password, email_confirm: true,
      });
      assert.ifError(createdManager.error);
      managerId = createdManager.data.user.id;
      assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Shared-worker races" })).error);
      assert.ifError((await admin.from("venues").insert([
        { id: firstVenue, business_id: businessId, name: "First", timezone: "UTC" },
        { id: secondVenue, business_id: businessId, name: "Second", timezone: "UTC" },
      ])).error);
      assert.ifError((await admin.from("departments").insert([
        { id: firstDepartment, business_id: businessId, venue_id: firstVenue, name: "First FOH" },
        { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Second BOH" },
      ])).error);
      assert.ifError((await admin.from("business_memberships").insert([
        { business_id: businessId, user_id: userId, role: "owner" },
        { business_id: businessId, user_id: managerId, role: "foh_manager",
          venue_id: firstVenue, department_id: firstDepartment },
      ])).error);
      assert.ifError((await admin.from("employees").insert([
        { id: firstEmployee, business_id: businessId, venue_id: firstVenue,
          department_id: firstDepartment, name: "Same worker", role_title: "Server" },
        { id: secondEmployee, business_id: businessId, venue_id: secondVenue,
          department_id: secondDepartment, name: "Same worker", role_title: "Cook" },
      ])).error);
      assert.ifError((await admin.from("shifts").insert({
        business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        employee_id: secondEmployee, role_title: "Existing other venue",
        starts_at: "2032-03-15T09:00:00Z", ends_at: "2032-03-15T10:00:00Z",
      })).error);
      assert.ifError((await owner.auth.signInWithPassword({ email, password })).error);
      assert.ifError((await manager.auth.signInWithPassword({ email: managerEmail, password })).error);

      const identityLock = await holdLock(
        `select pg_advisory_xact_lock(hashtextextended('shared-worker-links:${businessId}', 0))`,
      );
      let link;
      let assignment;
      try {
        link = Promise.resolve(owner.rpc("link_shared_worker_profiles", linkArgs));
        await waitForLock("link_shared_worker_profiles");
        assignment = Promise.resolve(owner.rpc("save_shift_auto_assign", autoArgs(
          firstVenue, firstDepartment, "Link before assignment", "2032-03-15 09:00", "2032-03-15 10:00",
        )));
        await waitForLock("save_shift_auto_assign");
        await identityLock.release(true);
        const [linked, assigned] = await Promise.all([link, assignment]);
        assert.ifError(linked.error);
        assert.equal(assigned.error?.message, "No eligible employee available for automatic assignment");
      } finally {
        await identityLock.release(false);
        await Promise.allSettled([link, assignment].filter(Boolean));
      }

      const employeeLock = await holdLock(
        `select id from public.employees where id = '${firstEmployee}'::uuid for update`, firstEmployee,
      );
      let pendingAssignment;
      let unlink;
      try {
        pendingAssignment = Promise.resolve(owner.rpc("save_shift_auto_assign", autoArgs(
          firstVenue, firstDepartment, "Assignment before unlink", "2032-03-15 11:00", "2032-03-15 12:00",
        )));
        await waitForLock("save_shift_auto_assign");
        unlink = Promise.resolve(owner.rpc("unlink_shared_worker_profile", {
          p_business_id: businessId, p_venue_id: secondVenue, p_employee_id: secondEmployee,
        }));
        await waitForLock("unlink_shared_worker_profile");
        await employeeLock.release(true);
        const [assigned, unlinked] = await Promise.all([pendingAssignment, unlink]);
        assert.ifError(assigned.error);
        assert.ok(assigned.data);
        assert.ifError(unlinked.error);
      } finally {
        await employeeLock.release(false);
        await Promise.allSettled([pendingAssignment, unlink].filter(Boolean));
      }
      const afterUnlink = await owner.rpc("save_shift_auto_assign", autoArgs(
        firstVenue, firstDepartment, "Unlinked assignment", "2032-03-15 09:00", "2032-03-15 10:00",
      ));
      assert.ifError(afterUnlink.error);
      assert.ok(afterUnlink.data);
      assert.ifError((await owner.rpc("link_shared_worker_profiles", linkArgs)).error);

      const draft = await owner.rpc("save_shift", {
        ...autoArgs(firstVenue, firstDepartment, "Group-lock draft", "2032-03-22 09:00", "2032-03-22 10:00"),
        p_employee_id: firstEmployee,
      });
      assert.ifError(draft.error);
      assert.ifError((await owner.rpc("save_venue_conflict_policy", {
        p_business_id: businessId, p_venue_id: firstVenue,
        p_block_manual_unavailability: false, p_block_publish_unavailability: false,
        p_block_publish_overlap: true, p_block_publish_long_shift: false,
      })).error);
      const groupId = await sql(
        `select shared_worker_id from public.shared_worker_profiles where employee_id = '${firstEmployee}'::uuid`,
      );
      assert.match(groupId, /^[0-9a-f-]{36}$/);
      const groupLock = await holdLock(
        `select pg_advisory_xact_lock(hashtextextended('shared-worker:${groupId}', 0))`,
      );
      try {
        const busyAuto = await owner.rpc("save_shift_auto_assign", autoArgs(
          firstVenue, firstDepartment, "Busy automatic", "2032-03-23 09:00", "2032-03-23 10:00",
        ));
        assert.equal(busyAuto.error?.message, "Roster changed while scheduling; please try again");
        const busyManual = await owner.rpc("save_shift", {
          ...autoArgs(firstVenue, firstDepartment, "Busy manual", "2032-03-23 09:00", "2032-03-23 10:00"),
          p_employee_id: firstEmployee,
        });
        assert.equal(busyManual.error?.message, "Roster changed while scheduling; please try again");
        const busyEdit = await owner.rpc("update_draft_shift", {
          ...autoArgs(firstVenue, firstDepartment, "Busy edit", "2032-03-22 10:00", "2032-03-22 11:00"),
          p_shift_id: draft.data, p_employee_id: firstEmployee,
        });
        assert.equal(busyEdit.error?.message, "Roster changed while scheduling; please try again");
        const busyPublish = await owner.rpc("publish_roster", {
          p_business_id: businessId, p_venue_id: firstVenue,
          p_department_id: firstDepartment, p_week_start: "2032-03-22",
        });
        assert.equal(busyPublish.error?.message, "Roster changed while publishing; please try again");
      } finally {
        await groupLock.release(false);
      }
      const published = await owner.rpc("publish_roster", {
        p_business_id: businessId, p_venue_id: firstVenue,
        p_department_id: firstDepartment, p_week_start: "2032-03-22",
      });
      assert.ifError(published.error);
      assert.equal(published.data, 1);

      for (let day = 5; day <= 9; day += 1) {
        const date = `2032-04-${String(day).padStart(2, "0")}`;
        const requests = [
          autoArgs(firstVenue, firstDepartment, `First automatic ${date}`, `${date} 09:00`, `${date} 10:00`),
          autoArgs(secondVenue, secondDepartment, `Second automatic ${date}`, `${date} 09:00`, `${date} 10:00`),
        ];
        const results = await Promise.all(requests.map((args) => owner.rpc("save_shift_auto_assign", args)));
        assert.equal(results.filter((result) => !result.error).length, 1, "Only one linked profile can be auto-assigned");
        const loser = results.findIndex((result) => result.error);
        assert.ok([
          "Roster changed while scheduling; please try again",
          "No eligible employee available for automatic assignment",
        ].includes(results[loser].error.message));
        if (results[loser].error.message.startsWith("Roster changed")) {
          const retry = await owner.rpc("save_shift_auto_assign", requests[loser]);
          assert.equal(retry.error?.message, "No eligible employee available for automatic assignment");
        }
        const rows = await admin.from("shifts").select("id").eq("business_id", businessId)
          .gte("starts_at", `${date}T09:00:00Z`).lt("starts_at", `${date}T10:00:00Z`);
        assert.ifError(rows.error);
        assert.equal(rows.data.length, 1);
      }

      const revocationDraft = await owner.rpc("save_shift", {
        ...autoArgs(firstVenue, firstDepartment, "Revocation draft", "2032-03-29 09:00", "2032-03-29 10:00"),
        p_employee_id: firstEmployee,
      });
      assert.ifError(revocationDraft.error);
      const revocationCases = [
        {
          name: "save_shift",
          args: { ...autoArgs(firstVenue, firstDepartment, "Revoked manual", "2032-03-30 09:00", "2032-03-30 10:00"),
            p_employee_id: firstEmployee },
        },
        {
          name: "save_shift_auto_assign",
          args: autoArgs(firstVenue, firstDepartment, "Revoked automatic", "2032-03-30 11:00", "2032-03-30 12:00"),
        },
        {
          name: "update_draft_shift",
          args: { ...autoArgs(firstVenue, firstDepartment, "Revoked edit", "2032-03-29 10:00", "2032-03-29 11:00"),
            p_shift_id: revocationDraft.data, p_employee_id: firstEmployee },
        },
        {
          name: "publish_roster",
          args: { p_business_id: businessId, p_venue_id: firstVenue,
            p_department_id: firstDepartment, p_week_start: "2032-03-29" },
        },
      ];
      for (const [index, scenario] of revocationCases.entries()) {
        const identityLock = await holdLock(
          `select pg_advisory_xact_lock(hashtextextended('shared-worker-links:${businessId}', 0))`,
        );
        let pending;
        try {
          pending = Promise.resolve(manager.rpc(scenario.name, scenario.args));
          await waitForLock(scenario.name);
          const revoked = await admin.from("business_memberships").delete()
            .eq("business_id", businessId).eq("user_id", managerId);
          assert.ifError(revoked.error);
          await identityLock.release(true);
          assert.equal((await pending).error?.message, "Permission denied",
            `${scenario.name} must recheck membership after waiting`);
        } finally {
          await identityLock.release(false);
          await Promise.allSettled([pending].filter(Boolean));
        }
        if (index < revocationCases.length - 1) {
          assert.ifError((await admin.from("business_memberships").insert({
            business_id: businessId, user_id: managerId, role: "foh_manager",
            venue_id: firstVenue, department_id: firstDepartment,
          })).error);
        }
      }
      const preservedDraft = await admin.from("shifts").select("role_title, is_published")
        .eq("id", revocationDraft.data).single();
      assert.ifError(preservedDraft.error);
      assert.deepEqual(preservedDraft.data, { role_title: "Revocation draft", is_published: false });
      const revokedWrites = await admin.from("shifts").select("id").eq("business_id", businessId)
        .in("role_title", ["Revoked manual", "Revoked automatic"]);
      assert.ifError(revokedWrites.error);
      assert.deepEqual(revokedWrites.data, []);
    } finally {
      await assertBusinessFixturesPreserved(admin, businessId);
      if (userId) assert.ifError((await admin.auth.admin.deleteUser(userId)).error);
      if (managerId) assert.ifError((await admin.auth.admin.deleteUser(managerId)).error);
    }
  },
);
