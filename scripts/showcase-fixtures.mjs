import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { Temporal } from "@js-temporal/polyfill";
import { createClient } from "@supabase/supabase-js";
import { genericPayrollCsv, validateGenericPayrollEntries } from "../src/lib/generic-payroll-exports.ts";
import { project, readEnvironment, showcaseStatus, verify } from "./showcase-environment.mjs";

const timezone = "Australia/Sydney";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fixturePlan(namespace, now = new Date().toISOString()) {
  if (!uuid.test(namespace)) throw new Error("A verified showcase namespace is required.");
  const id = (name) => {
    const value = createHash("sha256").update(`${namespace}:${name}`).digest("hex");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
  };
  const today = Temporal.Instant.from(now).toZonedDateTimeISO(timezone).toPlainDate();
  const current = today.subtract({ days: today.dayOfWeek - 1 });
  const previous = current.subtract({ weeks: 1 });
  const at = (date, time) => date.toZonedDateTime({ timeZone: timezone, plainTime: time }).toInstant();
  const names = ["Avery", "Blake", "Casey", "Drew", "Ellis", "Frankie", "Gray",
    "Harper", "Indigo", "Jules", "Kai", "Lane", "Morgan", "Noor"];
  return {
    namespace, businessId: id("business"), outsideId: id("outside"), venueId: id("venue"),
    fohId: id("foh"), bohId: id("boh"), fohRoleId: id("foh-role"), bohRoleId: id("boh-role"),
    fohOpenId: id("foh-open"), bohOpenId: id("boh-open"),
    week: previous.toString(), currentWeek: current.toString(),
    staff: names.map((name, index) => {
      const start = at(previous.add({ days: index % 5 }), `${String(8 + index % 3).padStart(2, "0")}:00`);
      return {
        id: id(`employee-${index}`), name: `Fictional ${name}`, index,
        departmentId: id(index < 7 ? "foh" : "boh"),
        jobRoleId: id(index < 7 ? "foh-role" : "boh-role"),
        roleTitle: index < 7 ? "Server" : "Cook",
        role: index === 0 ? "foh_manager" : index === 7 ? "boh_manager" : "employee",
        email: `showcase-${index}-${namespace}@example.test`,
        startsAt: start.toString(), endsAt: start.add({ hours: 6 }).toString(),
        nextStartsAt: at(current.add({ days: index % 5 }), `${String(8 + index % 3).padStart(2, "0")}:00`).toString(),
        shiftId: id(`shift-${index}`), nextShiftId: id(`next-shift-${index}`),
        sessionId: id(`session-${index}`), clockInId: id(`clock-in-${index}`), breakId: id(`break-${index}`),
      };
    }),
  };
}

function checked(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

function privateState(filename, state, flag = "w") {
  fs.writeFileSync(filename, JSON.stringify(state, null, 2), { flag, mode: 0o600 });
}

function sql(query) {
  const result = spawnSync("docker", [
    "exec", "-i", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
  ], { input: query, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Synthetic fixture SQL failed: ${result.stderr}`);
}

async function waitForEnvironment(workdir) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await verify(workdir);
    } catch (error) {
      const transient = error instanceof Error && (
        (error instanceof TypeError && error.message === "fetch failed") ||
        ["Showcase container is not healthy yet.", "Showcase API is not ready yet.",
          "Showcase API health check failed through the loopback proxy."].includes(error.message));
      if (!transient || attempt >= 30) throw error;
      console.error(`Waiting for synthetic reset readiness (${attempt + 1}/30): ${error.message}`);
      await setTimeout(1000);
    }
  }
}

export async function seed(workdir) {
  return withFixtureLock(workdir, () => seedUnlocked(workdir));
}

export async function withFixtureLock(workdir, operation) {
  readEnvironment(workdir);
  const filename = path.join(workdir, "fixture-operation.lock");
  let descriptor;
  try {
    descriptor = fs.openSync(filename, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error("Another or interrupted fixture operation holds the lock; inspect the private lock and process before recovery.");
  }
  try {
    fs.writeSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await operation();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(filename);
  }
}

async function seedUnlocked(workdir) {
  await verify(workdir);
  const { manifest } = readEnvironment(workdir);
  const status = showcaseStatus(workdir);
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  const stateFile = path.join(workdir, "fixture-state.json");
  if (fs.existsSync(stateFile)) throw new Error("Fixture state already exists; preserve it. This seed never overwrites or resets data.");
  const users = checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1 }), "Check empty Auth");
  const businesses = checked(await admin.from("businesses").select("id").limit(1), "Check empty business data");
  if (users.users.length || businesses.length) throw new Error("Showcase is not empty; refusing to seed existing records.");
  const plan = fixturePlan(manifest.id);
  const state = {
    project, namespace: manifest.id, phase: "creating", plan, accounts: [],
    createdAt: new Date().toISOString(), simulationOnly: true,
  };
  privateState(stateFile, state, "wx");
  for (const account of [
    { role: "owner", name: "Fictional Owner", email: `showcase-owner-${manifest.id}@example.test` },
    ...plan.staff,
    { role: "outside", name: "Fictional Isolation Owner", email: `showcase-outside-${manifest.id}@example.test` },
  ]) {
    const password = `${randomBytes(24).toString("base64url")}aA1!`;
    const created = checked(await admin.auth.admin.createUser({
      email: account.email, password, email_confirm: true, user_metadata: { full_name: account.name },
    }), "Create fictional Auth account");
    if (!uuid.test(created.user.id)) throw new Error("Auth returned an invalid fictional user identifier.");
    state.accounts.push({ email: account.email, role: account.role, userId: created.user.id, password });
    privateState(stateFile, state);
  }
  const owner = state.accounts.find((account) => account.role === "owner");
  const outside = state.accounts.find((account) => account.role === "outside");
  const userFor = (person) => state.accounts.find((account) => account.email === person.email).userId;
  const scope = { business_id: plan.businessId, venue_id: plan.venueId };
  checked(await admin.from("businesses").insert([
    { id: plan.businessId, name: "SIMULATION ONLY - Wattle and Wave Cafe" },
    { id: plan.outsideId, name: "SIMULATION ONLY - Private isolation control" },
  ]), "Create fictional businesses");
  checked(await admin.from("venues").insert({
    id: plan.venueId, business_id: plan.businessId, name: "SIMULATION ONLY - Harbour Cafe", timezone,
  }), "Create fictional venue");
  checked(await admin.from("departments").insert([
    { id: plan.fohId, ...scope, name: "FOH" }, { id: plan.bohId, ...scope, name: "BOH" },
  ]), "Create FOH and BOH");
  checked(await admin.from("job_roles").insert([
    { id: plan.fohRoleId, ...scope, department_id: plan.fohId, name: "Server" },
    { id: plan.bohRoleId, ...scope, department_id: plan.bohId, name: "Cook" },
  ]), "Create fictional roles");
  checked(await admin.from("business_memberships").insert([
    { business_id: plan.businessId, user_id: owner.userId, role: "owner", venue_id: null, department_id: null },
    { business_id: plan.outsideId, user_id: outside.userId, role: "owner", venue_id: null, department_id: null },
    ...plan.staff.map((person) => ({
      ...scope, user_id: userFor(person), role: person.role, department_id: person.departmentId,
    })),
  ]), "Create scoped fictional memberships");
  checked(await admin.from("employees").insert(plan.staff.map((person) => ({
    id: person.id, ...scope, department_id: person.departmentId, auth_user_id: userFor(person),
    name: person.name, email: person.email, role_title: person.roleTitle,
    employment_type: person.index % 3 === 0 ? "part_time" : "casual",
  }))), "Create fourteen fictional employees");
  checked(await admin.from("employee_job_roles").insert(plan.staff.map((person) => ({
    ...scope, department_id: person.departmentId, employee_id: person.id, job_role_id: person.jobRoleId, is_primary: true,
  }))), "Create role eligibility");
  checked(await admin.from("employee_availability_patterns").insert(plan.staff.map((person) => ({
    ...scope, employee_id: person.id,
  }))), "Create recurring availability");
  checked(await admin.from("employee_availability_intervals").insert(plan.staff.flatMap((person) =>
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      ...scope, employee_id: person.id, weekday, start_minute: 360, end_minute: 1200,
    })))), "Create weekly availability intervals");
  checked(await admin.from("shifts").insert(plan.staff.flatMap((person) => [
    { id: person.shiftId, starts_at: person.startsAt, ends_at: person.endsAt },
    { id: person.nextShiftId, starts_at: person.nextStartsAt, ends_at: Temporal.Instant.from(person.nextStartsAt).add({ hours: 6 }).toString() },
  ].map((shift) => ({
    ...shift, ...scope, department_id: person.departmentId, employee_id: person.id,
    role_title: person.roleTitle, break_minutes: 30, is_published: false, created_by: owner.userId,
  })))), "Create fictional published rosters");
  const openStart = Temporal.PlainDate.from(plan.currentWeek).add({ days: 4 })
    .toZonedDateTime({ timeZone: timezone, plainTime: "11:00" }).toInstant();
  checked(await admin.from("shifts").insert([
    { id: plan.fohOpenId, department_id: plan.fohId, role_title: "Server" },
    { id: plan.bohOpenId, department_id: plan.bohId, role_title: "Cook" },
  ].map((shift) => ({
    ...shift, ...scope, employee_id: null, starts_at: openStart.toString(),
    ends_at: openStart.add({ hours: 4 }).toString(), break_minutes: 0, is_published: false, created_by: owner.userId,
  }))), "Create fictional open-shift opportunities");
  checked(await admin.from("attendance_sessions").insert(plan.staff.map((person) => ({
    id: person.sessionId, ...scope, department_id: person.departmentId, employee_id: person.id,
    started_by: userFor(person),
  }))), "Create fictional attendance sessions");
  sql(`begin;\n${plan.staff.map((person) => {
    const at = (minutes) => Temporal.Instant.from(person.startsAt).add({ minutes }).toString();
    return `insert into public.attendance_breaks (id, session_id, business_id, classification)
      values ('${person.breakId}', '${person.sessionId}', '${plan.businessId}', 'unpaid');
      insert into public.attendance_events (id, session_id, business_id, venue_id, department_id, employee_id,
        actor_id, request_id, event_type, occurred_at, source, break_id) values
      ${[
        [person.clockInId, "clock_in", at(person.index === 0 ? 10 : person.index % 3), null],
        [randomUUID(), "break_start", at(180), person.breakId],
        [randomUUID(), "break_end", at(210), person.breakId],
        [randomUUID(), "clock_out", at(360), null],
      ].map(([eventId, type, time, breakId]) =>
        `('${eventId}', '${person.sessionId}', '${plan.businessId}', '${plan.venueId}', '${person.departmentId}',
        '${person.id}', '${userFor(person)}', '${randomUUID()}', '${type}', '${time}', 'server_clock', ${breakId ? `'${breakId}'` : "null"})`).join(",")};`;
  }).join("\n")}\ncommit;`);
  const ownerApi = createClient(status.API_URL, status.ANON_KEY, options);
  checked(await ownerApi.auth.signInWithPassword({ email: owner.email, password: owner.password }), "Sign in fictional owner");
  for (const week of [plan.week, plan.currentWeek]) {
    for (const departmentId of [plan.fohId, plan.bohId]) {
      checked(await ownerApi.rpc("publish_roster", {
        p_business_id: plan.businessId, p_venue_id: plan.venueId, p_department_id: departmentId, p_week_start: week,
      }), "Publish fictional roster with normal notification/version handling");
    }
  }
  const first = plan.staff[0];
  checked(await ownerApi.rpc("correct_attendance_event", {
    p_business_id: plan.businessId, p_venue_id: plan.venueId, p_session_id: first.sessionId,
    p_event_id: first.clockInId, p_request_id: randomUUID(),
    p_expected_at: Temporal.Instant.from(first.startsAt).add({ minutes: 10 }).toString(),
    p_new_at: first.startsAt, p_reason: "SIMULATION ONLY: fictional missed clock-in corrected with employee confirmation.",
  }), "Record attributable fictional correction");
  const rpcScope = { p_business_id: plan.businessId, p_venue_id: plan.venueId, p_week_start: plan.week };
  const entries = checked(await ownerApi.rpc("list_weekly_worked_time_for_edit", rpcScope), "Review fictional worked time");
  if (entries.length !== 14) throw new Error("Expected fourteen complete synthetic timesheets.");
  for (const entry of entries) {
    checked(await ownerApi.rpc("decide_attendance_timesheet", {
      p_business_id: plan.businessId, p_venue_id: plan.venueId, p_session_id: entry.session_id,
      p_request_id: randomUUID(), p_expected_revision: entry.edit_revision, p_decision: "approved", p_reason: null,
    }), "Approve current fictional timesheet revision");
  }
  state.finalisationId = checked(await ownerApi.rpc("finalise_payroll_period", {
    ...rpcScope, p_request_id: randomUUID(), p_note: "SIMULATION ONLY - no real payroll or award validation.",
  }), "Finalise synthetic approved time");
  state.batchId = checked(await ownerApi.rpc("create_generic_payroll_export", {
    ...rpcScope, p_finalisation_id: state.finalisationId, p_request_id: randomUUID(),
  }), "Prepare simulated generic CSV batch");
  const rows = checked(await ownerApi.rpc("list_generic_payroll_batch_entries", {
    p_business_id: plan.businessId, p_venue_id: plan.venueId, p_batch_id: state.batchId,
  }), "Read simulated payroll snapshot");
  const validated = validateGenericPayrollEntries(rows, {
    businessId: plan.businessId, venueId: plan.venueId, weekStart: plan.week,
    finalisationId: state.finalisationId, sessionCount: 14,
  });
  state.csv = `SIMULATION_ONLY_APPROVED_TIME_${plan.week}.csv`;
  fs.writeFileSync(path.join(workdir, state.csv), genericPayrollCsv(state.batchId, validated, true), { flag: "wx", mode: 0o600 });
  state.phase = "seeded";
  privateState(stateFile, state);
  await ownerApi.auth.signOut();
  return { project, employees: 14, departments: 2, approvedSessions: 14, csv: state.csv, simulationOnly: true };
}

export async function reset(workdir, confirmation) {
  if (confirmation !== "--confirm-synthetic-reset=butterbox-showcase") {
    throw new Error("Reset requires the explicit synthetic showcase confirmation; no data changed.");
  }
  return withFixtureLock(workdir, () => resetUnlocked(workdir));
}

async function resetUnlocked(workdir) {
  await verify(workdir);
  const { manifest, credentials } = readEnvironment(workdir);
  const filename = path.join(workdir, "fixture-state.json");
  const previous = fs.readFileSync(filename, "utf8");
  const state = JSON.parse(previous);
  if (state.project !== project || state.namespace !== manifest.id || state.simulationOnly !== true ||
      state.plan?.namespace !== manifest.id || !Array.isArray(state.accounts) || state.accounts.length !== 16) {
    throw new Error("No complete owned account inventory; preserve this project for operator inspection.");
  }
  if (state.csv !== undefined && !/^SIMULATION_ONLY_APPROVED_TIME_\d{4}-\d{2}-\d{2}\.csv$/.test(state.csv)) {
    throw new Error("Unexpected sample CSV identity; preserve this project.");
  }
  const status = showcaseStatus(workdir);
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  const users = checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), "Inspect synthetic reset users");
  if (users.users.length !== 16 || users.users.some((user) =>
    !state.accounts.some((account) => account.userId === user.id && account.email === user.email) ||
    !user.email?.endsWith(`-${manifest.id}@example.test`))) {
    throw new Error("Unexpected Auth data: preserve the project; no reset permitted.");
  }
  const businesses = checked(await admin.from("businesses").select("id,name"), "Inspect synthetic reset businesses");
  if (businesses.some((business) => ![state.plan.businessId, state.plan.outsideId].includes(business.id) ||
      !business.name.startsWith("SIMULATION ONLY - "))) {
    throw new Error("Unexpected business data: preserve the project; no reset permitted.");
  }
  const disk = fs.statfsSync(workdir);
  if (disk.bavail * disk.bsize < 10 * 1024 ** 3) throw new Error("Less than 10 GiB available; stop safely.");
  state.phase = "resetting";
  state.resetStartedAt = new Date().toISOString();
  privateState(filename, state);
  const cli = process.env.BUTTERBOX_TEST_SUPABASE_CLI;
  const result = spawnSync(cli, [
    "db", "reset", "--local", "--yes", "--workdir", workdir, "--network-id", "butterbox-showcase-isolated",
  ], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("SUPABASE_"))), ...credentials },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = path.join(workdir, `reset-failure-${randomUUID()}.log`);
    fs.writeFileSync(diagnostic, `${result.stdout}\n${result.stderr}`, { flag: "wx", mode: 0o600 });
    throw new Error(`Synthetic reset failed; preserve state and inspect private diagnostic ${diagnostic}.`);
  }
  await waitForEnvironment(workdir);
  const remaining = checked(await admin.from("businesses").select("id").limit(1), "Verify empty reset");
  const remainingUsers = checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1 }), "Verify empty reset Auth");
  if (remaining.length || remainingUsers.users.length) throw new Error("Reset did not produce an empty project; refusing further fixture operations.");
  const resetId = randomUUID();
  if (state.csv && fs.existsSync(path.join(workdir, state.csv))) {
    fs.renameSync(path.join(workdir, state.csv), path.join(workdir, `before-reset-${resetId}-${state.csv}`));
  }
  fs.renameSync(filename, path.join(workdir, `fixture-state-before-reset-${resetId}.json`));
  fs.appendFileSync(path.join(workdir, "reset-history.jsonl"), `${JSON.stringify({
    at: new Date().toISOString(), resetId, namespace: manifest.id,
    previousStateSha256: createHash("sha256").update(previous).digest("hex"),
    reason: "Explicit reset of positively verified synthetic local project; no production/customer data.",
  })}\n`, { mode: 0o600 });
  return { project, reset: true, empty: true, resetId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, workdir, confirmation, ...extra] = process.argv.slice(2);
    if (!workdir || extra.length || !["seed", "reset"].includes(action) || (action === "seed" && confirmation)) {
      throw new Error("Usage: node scripts/showcase-fixtures.mjs seed|reset /private/path/butterbox-showcase [--confirm-synthetic-reset=butterbox-showcase]");
    }
    console.log(JSON.stringify(action === "seed" ? await seed(workdir) : await reset(workdir, confirmation)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Showcase fixture operation failed.");
    process.exitCode = 1;
  }
}
