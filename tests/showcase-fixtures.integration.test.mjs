import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { createClient } from "@supabase/supabase-js";
import { genericPayrollCsv, validateGenericPayrollEntries } from "../src/lib/generic-payroll-exports.ts";
import { project, readEnvironment, showcaseStatus, verify } from "../scripts/showcase-environment.mjs";
import { seed } from "../scripts/showcase-fixtures.mjs";

const workdir = process.env.BUTTERBOX_SHOWCASE_WORKDIR;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

test("isolated showcase preserves synthetic workflow, tenant scope, signup denial and outbound containment", {
  skip: !workdir,
}, async () => {
  await verify(workdir);
  const { manifest } = readEnvironment(workdir);
  const state = JSON.parse(fs.readFileSync(path.join(workdir, "fixture-state.json"), "utf8"));
  assert.equal(state.namespace, manifest.id);
  assert.equal(state.phase, "seeded");
  assert.equal(state.simulationOnly, true);
  const plan = state.plan;
  const status = showcaseStatus(workdir);
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  const clients = [];
  async function signedIn(account) {
    const client = createClient(status.API_URL, status.ANON_KEY, options);
    clients.push(client);
    const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    assert.ifError(result.error);
    return client;
  }
  try {
    const owner = await signedIn(state.accounts.find((account) => account.role === "owner"));
    for (const [table, count] of [
      ["employees", 14], ["departments", 2], ["shifts", 30],
      ["employee_availability_patterns", 14], ["employee_availability_intervals", 98],
      ["attendance_sessions", 14], ["attendance_events", 56], ["attendance_event_corrections", 1],
    ]) {
      const result = await owner.from(table).select("*", { count: "exact" }).eq("business_id", plan.businessId);
      assert.ifError(result.error);
      assert.equal(result.count, count, `Expected complete synthetic ${table}`);
    }
    const original = await owner.from("attendance_events").select("occurred_at").eq("id", plan.staff[0].clockInId).single();
    assert.ifError(original.error);
    assert.equal(Temporal.Instant.from(original.data.occurred_at).toString(),
      Temporal.Instant.from(plan.staff[0].startsAt).add({ minutes: 10 }).toString());
    const correction = await owner.from("attendance_event_corrections").select("new_at,reason,actor_id")
      .eq("event_id", plan.staff[0].clockInId).single();
    assert.ifError(correction.error);
    assert.equal(Temporal.Instant.from(correction.data.new_at).toString(), plan.staff[0].startsAt);
    assert.match(correction.data.reason, /^SIMULATION ONLY:/);
    assert.equal(correction.data.actor_id, state.accounts.find((account) => account.role === "owner").userId);
    const batch = await owner.rpc("list_generic_payroll_batch_entries", {
      p_business_id: plan.businessId, p_venue_id: plan.venueId, p_batch_id: state.batchId,
    });
    assert.ifError(batch.error);
    const entries = validateGenericPayrollEntries(batch.data, {
      businessId: plan.businessId, venueId: plan.venueId, weekStart: plan.week,
      finalisationId: state.finalisationId, sessionCount: 14,
    });
    assert.equal(entries.length, 14);
    assert.ok(entries.every((entry) => entry.employeeName.startsWith("Fictional ") &&
      entry.record.approval.status === "approved" && entry.record.worker.providerMapping === null &&
      entry.record.payCodes === null));
    const csv = fs.readFileSync(path.join(workdir, state.csv), "utf8");
    assert.equal(csv, genericPayrollCsv(state.batchId, entries, true));
    assert.equal(csv.split("SIMULATION ONLY - NOT FOR PAYROLL").length - 1, 14);
    assert.equal(csv.trimEnd().split("\r\n").length, 15);
    const rpcScope = { p_business_id: plan.businessId, p_venue_id: plan.venueId, p_week_start: plan.week };
    const publications = await owner.from("roster_publications").select("id", { count: "exact" }).eq("business_id", plan.businessId);
    assert.ifError(publications.error);
    assert.equal(publications.count, 4);
    for (const role of ["foh_manager", "boh_manager", "employee", "outside"]) {
      const client = await signedIn(state.accounts.find((account) => account.role === role));
      const result = await client.from("employees").select("id,department_id").eq("business_id", plan.businessId);
      assert.ifError(result.error);
      assert.equal(result.data.length, role.endsWith("_manager") ? 7 : role === "employee" ? 1 : 0);
      if (role.endsWith("_manager")) assert.ok(result.data.every((person) =>
        person.department_id === (role === "foh_manager" ? plan.fohId : plan.bohId)));
      const forbidden = await client.rpc("get_hours_labour_report", rpcScope);
      assert.equal(forbidden.error?.message, "Only a business owner can view the hours and labour report");
      assert.equal(forbidden.data, null);
    }
    const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
    const signup = await anonymous.auth.signUp({
      email: `showcase-denied-${manifest.id}@example.test`, password: `${randomBytes(24).toString("base64url")}aA1!`,
    });
    assert.equal(signup.error?.code, "signup_disabled");
    assert.equal(signup.data.user, null);
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.ifError(users.error);
    assert.equal(users.data.users.length, 16);
    assert.ok(users.data.users.every((user) => user.email.endsWith(`-${manifest.id}@example.test`)));
    const mail = await (await fetch("http://127.0.0.1:57424/api/v1/messages")).json();
    assert.equal(mail.total, 0, "No signup, invitation or external notification email generated by fixture creation");
    const egress = spawnSync("docker", [
      "exec", `supabase_db_${project}`, "timeout", "3", "bash", "-c", "exec 3<>/dev/tcp/198.51.100.1/443",
    ], { encoding: "utf8" });
    assert.ifError(egress.error);
    assert.notEqual(egress.status, 0);
    assert.match(egress.stderr, /Network (?:is )?unreachable/);
    await assert.rejects(() => seed(workdir), /Fixture state already exists/);
  } finally {
    for (const client of clients) await client.auth.signOut();
  }
});
