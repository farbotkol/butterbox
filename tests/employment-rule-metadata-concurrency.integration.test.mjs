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

test("employment metadata serializes competing edits and enforces live tenant scope", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
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
