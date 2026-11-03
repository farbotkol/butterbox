import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("employment metadata and People sections serialize competing edits and enforce live tenant scope", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 180_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "foh", "boh", "worker", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, fohId, bohId, employeeId] =
    Array.from({ length: 6 }, () => randomUUID());
  const users = {};

  async function waitForWaiters(functionName, expected) {
    assert.match(functionName, /^[a-z_][a-z0-9_]*$/);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${functionName}%'`,
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} ${functionName} calls to reach a lock.`);
  }

  const request = (basis, revision, requestId, effectiveOn = "2020-01-01") => ({
    p_business_id: businessId, p_employee_id: employeeId, p_effective_on: effectiveOn,
    p_employment_basis: basis, p_classification: null, p_award_reference: "Award reference",
    p_contract_reference: null, p_expected_revision: revision, p_request_id: requestId,
  });
  const save = (client, input) => client.rpc("save_employee_employment_metadata", input);

  try {
    for (const role of roles) {
      const created = await admin.auth.admin.createUser({
        email: `employment-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(created.error);
      users[role] = created.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Employment metadata cafe" },
      { id: outsideId, name: "Outside employment cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "First", timezone: "Australia/Sydney",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users.worker, name: "Worker", role_title: "Server",
    })).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `employment-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const directoryInput = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: null,
      p_search: "", p_role: "", p_status: "all",
    };
    const firstPage = await clients.owner.rpc("list_people_directory", directoryInput, { count: "exact" })
      .order("name").order("id").range(0, 0);
    assert.ifError(firstPage.error);
    assert.equal(firstPage.count, 1);
    assert.deepEqual(firstPage.data.map((employee) => employee.id), [employeeId]);
    const hiddenDirectory = await clients.outsider.rpc("list_people_directory", directoryInput, { count: "exact" })
      .order("name").order("id").range(0, 0);
    assert.ifError(hiddenDirectory.error);
    assert.equal(hiddenDirectory.count, 0);
    assert.deepEqual(hiddenDirectory.data, []);

    const creationRequest = randomUUID();
    const creation = {
      p_business_id: businessId, p_department_id: fohId, p_name: "Concurrent new worker",
      p_email: "creation@example.test", p_role_title: "Server", p_employment_type: "casual",
      p_active: true, p_request_id: creationRequest,
    };
    const creationGate = await holdLock(
      `select pg_advisory_xact_lock(hashtextextended('employee-creation:${businessId}:${users.owner}:${creationRequest}', 0))`,
    );
    let competingCreations;
    try {
      competingCreations = Promise.all([0, 1].map(() =>
        clients.owner.rpc("create_employee_profile_idempotent", creation)));
      await waitForWaiters("create_employee_profile_idempotent", 2);
      await creationGate.release(false);
      const results = await competingCreations;
      results.forEach((result) => assert.ifError(result.error));
      assert.equal(results[0].data, results[1].data, "concurrent retries return one employee");
      const created = await admin.from("employees").select("id")
        .eq("business_id", businessId).eq("name", creation.p_name);
      assert.ifError(created.error);
      assert.deepEqual(created.data.map((employee) => employee.id), [results[0].data]);
    } finally {
      await creationGate.release(false);
      await Promise.allSettled([competingCreations].filter(Boolean));
    }
    const reusedCreation = await clients.owner.rpc("create_employee_profile_idempotent", {
      ...creation, p_name: "Different worker",
    });
    assert.equal(reusedCreation.error?.message, "Request identifier already used");
    for (const role of ["boh", "worker", "outsider"]) {
      const deniedCreation = await clients[role].rpc("create_employee_profile_idempotent", {
        ...creation, p_request_id: randomUUID(),
      });
      assert.equal(deniedCreation.error?.message, "Permission denied");
    }
    const fohCreation = { ...creation, p_name: "Manager-created worker", p_request_id: randomUUID() };
    assert.ifError((await clients.foh.rpc("create_employee_profile_idempotent", fohCreation)).error);

    const inputs = [
      request("full_time", 0, randomUUID()),
      request("part_time", 0, randomUUID()),
    ];
    const writers = [clients.owner, clients.foh];
    const gate = await holdLock(
      `select id from public.employees where id = '${employeeId}'::uuid for update`, employeeId,
    );
    let pending;
    let results;
    try {
      pending = Promise.all(writers.map((client, index) => save(client, inputs[index])));
      await waitForWaiters("save_employee_employment_metadata", 2);
      await gate.release(false);
      results = await pending;
    } finally {
      await gate.release(false);
      await Promise.allSettled([pending].filter(Boolean));
    }
    assert.equal(results.filter((result) => !result.error).length, 1, "only one same-revision edit succeeds");
    assert.equal(results.find((result) => result.error)?.error.message,
      "Employment metadata changed; refresh before saving");
    const winningIndex = results.findIndex((result) => !result.error);
    const retry = await save(writers[winningIndex], inputs[winningIndex]);
    assert.ifError(retry.error);
    assert.equal(retry.data, results[winningIndex].data, "a retry returns the original event");
    const reused = await save(writers[winningIndex], { ...inputs[winningIndex], p_classification: "Different" });
    assert.equal(reused.error?.message, "Request identifier already used");
    const initialHistory = await clients.owner.from("employee_employment_metadata_events")
      .select("id, revision").eq("employee_id", employeeId);
    assert.ifError(initialHistory.error);
    assert.deepEqual(initialHistory.data.map((event) => event.revision), [1]);

    for (const role of ["boh", "worker", "outsider"]) {
      const denied = await save(clients[role], request("casual", 1, randomUUID()));
      assert.equal(denied.error?.message, "Permission denied");
    }
    for (const role of ["boh", "outsider"]) {
      const hidden = await clients[role].from("employee_employment_metadata_events")
        .select("id").eq("business_id", businessId);
      assert.ifError(hidden.error);
      assert.deepEqual(hidden.data, []);
    }
    const ownHistory = await clients.worker.from("employee_employment_metadata_events")
      .select("id").eq("employee_id", employeeId);
    assert.ifError(ownHistory.error);
    assert.equal(ownHistory.data.length, 1);

    const profileGate = await holdLock(
      `select id from public.employees where id = '${employeeId}'::uuid for update`, employeeId,
    );
    let profileRace;
    let profileResults;
    try {
      profileRace = Promise.all([
        clients.owner.rpc("save_employee_profile_checked", {
          p_business_id: businessId, p_department_id: fohId, p_employee_id: employeeId,
          p_name: "Edited worker", p_email: "", p_role_title: "Server",
          p_employment_type: "casual", p_active: true, p_expected_employment_revision: 1,
        }),
        save(clients.foh, request("unknown", 1, randomUUID(), "2022-01-01")),
      ]);
      await waitForLock("save_employee_profile_checked");
      await waitForLock("save_employee_employment_metadata");
      await profileGate.release(false);
      profileResults = await profileRace;
    } finally {
      await profileGate.release(false);
      await Promise.allSettled([profileRace].filter(Boolean));
    }
    assert.equal(profileResults.filter((result) => !result.error).length, 1,
      "a profile edit and dated edit cannot both use the same revision");
    assert.equal(profileResults.find((result) => result.error)?.error.message,
      "Employment metadata changed; refresh before saving");
    const history = await clients.owner.from("employee_employment_metadata_events")
      .select("revision").eq("employee_id", employeeId).order("revision");
    assert.ifError(history.error);
    assert.deepEqual(history.data.map((event) => event.revision), [1, 2]);
    const current = await clients.owner.rpc("list_current_employee_employment_metadata", {
      p_business_id: businessId, p_venue_id: venueId,
    }).eq("employee_id", employeeId).single();
    assert.ifError(current.error);
    const profile = await admin.from("employees").select("name, employment_type, profile_revision")
      .eq("id", employeeId).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.employment_type, current.data.employment_basis);
    assert.equal(profile.data.name, profileResults[0].error ? "Worker" : "Edited worker");

    const profileRevisionGate = await holdLock(
      `select id from public.employees where id = '${employeeId}'::uuid for update`, employeeId,
    );
    let competingProfiles;
    let competingResults;
    try {
      competingProfiles = Promise.all([clients.owner, clients.foh].map((client, index) =>
        client.rpc("save_employee_profile_checked_v2", {
          p_business_id: businessId, p_department_id: fohId, p_employee_id: employeeId,
          p_name: `Concurrent profile ${index}`, p_email: "", p_role_title: "Server",
          p_employment_type: profile.data.employment_type, p_active: true,
          p_expected_employment_revision: current.data.revision,
          p_expected_profile_revision: profile.data.profile_revision, p_lifecycle_confirmed: false,
        })));
      await waitForWaiters("save_employee_profile_checked_v2", 2);
      await profileRevisionGate.release(false);
      competingResults = await competingProfiles;
    } finally {
      await profileRevisionGate.release(false);
      await Promise.allSettled([competingProfiles].filter(Boolean));
    }
    assert.equal(competingResults.filter((result) => !result.error).length, 1,
      "only one concurrent edit of the same profile revision succeeds");
    assert.equal(competingResults.find((result) => result.error)?.error.message,
      "Employee profile changed; refresh before saving");
    const savedProfile = await clients.owner.from("employees").select("name, profile_revision")
      .eq("id", employeeId).single();
    assert.ifError(savedProfile.error);
    assert.equal(savedProfile.data.name, `Concurrent profile ${competingResults.findIndex((result) => !result.error)}`);
    assert.equal(savedProfile.data.profile_revision, profile.data.profile_revision + 1);

    const [extraDepartment, roleOne, roleTwo, secondVenue, thirdVenue,
      secondDepartment, thirdDepartment, secondEmployee, thirdEmployee] =
      Array.from({ length: 9 }, () => randomUUID());
    assert.ifError((await admin.from("venues").insert([
      { id: secondVenue, business_id: businessId, name: "Second" },
      { id: thirdVenue, business_id: businessId, name: "Third" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: extraDepartment, business_id: businessId, venue_id: venueId, name: "Extra" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Second" },
      { id: thirdDepartment, business_id: businessId, venue_id: thirdVenue, name: "Third" },
    ])).error);
    assert.ifError((await admin.from("job_roles").insert([
      { id: roleOne, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Barista" },
      { id: roleTwo, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Runner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: secondEmployee, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        name: "Second worker", role_title: "Server" },
      { id: thirdEmployee, business_id: businessId, venue_id: thirdVenue, department_id: thirdDepartment,
        name: "Third worker", role_title: "Server" },
    ])).error);

    async function compete(functionName, lockStatement, requests, staleMessage) {
      const gate = await holdLock(lockStatement);
      let pending;
      try {
        pending = Promise.all(requests.map(({ client, args }) => client.rpc(functionName, args)));
        await waitForWaiters(functionName, 2);
        await gate.release(false);
        const results = await pending;
        assert.equal(results.filter((result) => !result.error).length, 1, `${functionName}: one edit wins`);
        assert.equal(results.find((result) => result.error)?.error.message, staleMessage);
        return results.findIndex((result) => !result.error);
      } finally {
        await gate.release(false);
        await Promise.allSettled([pending].filter(Boolean));
      }
    }

    const employeeLock = `select id from public.employees where id = '${employeeId}'::uuid for update`;
    const departmentChoices = [bohId, extraDepartment];
    const departmentWinner = await compete("set_employee_departments_checked", employeeLock,
      departmentChoices.map((choice) => ({
        client: clients.owner,
        args: { p_business_id: businessId, p_employee_id: employeeId,
          p_department_ids: [fohId, choice], p_expected_department_ids: [fohId] },
      })), "Employee departments changed; refresh before saving");
    const departments = await admin.from("employee_departments").select("department_id").eq("employee_id", employeeId);
    assert.ifError(departments.error);
    assert.deepEqual(departments.data.map((item) => item.department_id).sort(),
      [fohId, departmentChoices[departmentWinner]].sort());

    const roleChoices = [roleOne, roleTwo];
    const roleWinner = await compete("set_employee_eligible_roles_checked", employeeLock,
      roleChoices.map((choice, index) => ({
        client: index ? clients.foh : clients.owner,
        args: { p_business_id: businessId, p_employee_id: employeeId, p_department_id: fohId,
          p_job_role_ids: [choice], p_expected_job_role_ids: [] },
      })), "Employee roles changed; refresh before saving");
    const rolesAfterRace = await admin.from("employee_job_roles").select("job_role_id").eq("employee_id", employeeId);
    assert.ifError(rolesAfterRace.error);
    assert.deepEqual(rolesAfterRace.data.map((item) => item.job_role_id), [roleChoices[roleWinner]]);
    assert.ifError((await clients.owner.rpc("set_employee_eligible_roles", {
      p_business_id: businessId, p_employee_id: employeeId, p_department_id: fohId, p_job_role_ids: roleChoices,
    })).error);

    const accountWinner = await compete("set_employee_auth_user_checked", employeeLock,
      [users.owner, null].map((userId) => ({
        client: clients.owner,
        args: { p_business_id: businessId, p_employee_id: employeeId, p_user_id: userId,
          p_expected_profile_revision: savedProfile.data.profile_revision },
      })), "Employee profile changed; refresh before saving");
    const accountAfterRace = await admin.from("employees").select("auth_user_id, profile_revision")
      .eq("id", employeeId).single();
    assert.ifError(accountAfterRace.error);
    assert.equal(accountAfterRace.data.auth_user_id, [users.owner, null][accountWinner]);

    const primaryWinner = await compete("set_employee_primary_role_checked", employeeLock,
      roleChoices.map((choice, index) => ({
        client: index ? clients.foh : clients.owner,
        args: { p_business_id: businessId, p_employee_id: employeeId, p_job_role_id: choice,
          p_expected_profile_revision: accountAfterRace.data.profile_revision },
      })), "Employee profile changed; refresh before saving");
    const primary = await admin.from("employee_job_roles").select("job_role_id")
      .eq("employee_id", employeeId).eq("is_primary", true).single();
    assert.ifError(primary.error);
    assert.equal(primary.data.job_role_id, roleChoices[primaryWinner]);

    const otherChoices = [secondEmployee, thirdEmployee];
    const sharedLock = `select pg_advisory_xact_lock(hashtextextended('shared-worker-links:' || '${businessId}'::text, 0))`;
    const sharedWinner = await compete("link_shared_worker_profiles_checked", sharedLock,
      otherChoices.map((choice) => ({
        client: clients.owner,
        args: { p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
          p_other_employee_id: choice, p_expected_linked_ids: [] },
      })), "Shared-worker links changed; refresh before saving");
    const shared = await clients.owner.rpc("list_shared_worker_profiles", {
      p_business_id: businessId, p_venue_id: venueId,
    }).eq("employee_id", employeeId);
    assert.ifError(shared.error);
    assert.deepEqual(shared.data.map((item) => item.linked_employee_id), [otherChoices[sharedWinner]]);

    const sectionMembershipGate = await holdLock(
      `update public.business_memberships set role = 'employee' where business_id = '${businessId}'::uuid and user_id = '${users.foh}'::uuid returning id`,
    );
    let revokedSectionWrite;
    try {
      revokedSectionWrite = Promise.resolve(clients.foh.rpc("set_employee_eligible_roles_checked", {
        p_business_id: businessId, p_employee_id: employeeId, p_department_id: fohId,
        p_job_role_ids: roleChoices, p_expected_job_role_ids: roleChoices,
      }));
      await waitForLock("set_employee_eligible_roles_checked");
      await sectionMembershipGate.release(true);
      assert.equal((await revokedSectionWrite).error?.message, "Permission denied",
        "section access is rechecked after a concurrent role change");
      assert.equal((await clients.foh.rpc("create_employee_profile_idempotent", fohCreation)).error?.message,
        "Permission denied", "a creation retry cannot bypass a revoked membership");
    } finally {
      await sectionMembershipGate.release(false);
      await Promise.allSettled([revokedSectionWrite].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({
      role: "foh_manager", venue_id: venueId, department_id: fohId,
    }).eq("business_id", businessId).eq("user_id", users.foh)).error);

    const membershipGate = await holdLock(
      `update public.business_memberships set role = 'employee' where business_id = '${businessId}'::uuid and user_id = '${users.foh}'::uuid returning id`,
    );
    let revokedWrite;
    try {
      revokedWrite = Promise.resolve(save(clients.foh, request("casual", 2, randomUUID(), "2023-01-01")));
      await waitForLock("save_employee_employment_metadata");
      await membershipGate.release(true);
      assert.equal((await revokedWrite).error?.message, "Permission denied",
        "permission is rechecked after a concurrent role change");
    } finally {
      await membershipGate.release(false);
      await Promise.allSettled([revokedWrite].filter(Boolean));
    }
    const finalHistory = await clients.owner.from("employee_employment_metadata_events")
      .select("revision").eq("employee_id", employeeId).order("revision");
    assert.ifError(finalHistory.error);
    assert.deepEqual(finalHistory.data.map((event) => event.revision), [1, 2]);
  } finally {
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
