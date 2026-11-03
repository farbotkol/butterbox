import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertKnownFixtureAccounts, fixturePlan, reset, seed, withFixtureLock } from "../scripts/showcase-fixtures.mjs";
import { prepare, project } from "../scripts/showcase-environment.mjs";

const namespace = "a0000000-0000-4000-8000-000000000001";

test("showcase plan contains fourteen explicitly fictional scoped staff and reserved emails", () => {
  const plan = fixturePlan(namespace, "2026-11-02T00:00:00Z");
  assert.equal(plan.staff.length, 14);
  assert.equal(plan.staff.filter((person) => person.departmentId === plan.fohId).length, 7);
  assert.equal(plan.staff.filter((person) => person.departmentId === plan.bohId).length, 7);
  assert.equal(plan.staff.filter((person) => person.role.endsWith("_manager")).length, 2);
  for (const person of plan.staff) {
    assert.match(person.name, /^Fictional /);
    assert.match(person.email, /^showcase-\d+-[a-f0-9-]{36}@example\.test$/);
    assert.match(person.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(Temporal.Instant.from(person.endsAt).since(Temporal.Instant.from(person.startsAt)).total("hours"), 6);
  }
});

test("showcase weeks use venue-local Mondays and handle daylight saving", () => {
  for (const now of ["2026-11-01T13:30:00Z", "2026-04-05T14:30:00Z", "2026-10-04T13:30:00Z"]) {
    const plan = fixturePlan(namespace, now);
    const monday = Temporal.PlainDate.from(plan.currentWeek);
    assert.equal(monday.dayOfWeek, 1);
    assert.equal(Temporal.PlainDate.from(plan.week).add({ weeks: 1 }).toString(), plan.currentWeek);
    for (const person of plan.staff) {
      const local = Temporal.Instant.from(person.startsAt).toZonedDateTimeISO("Australia/Sydney");
      assert.equal(local.hour, 8 + person.index % 3);
      assert.ok(Temporal.Instant.compare(person.endsAt, Temporal.Instant.from(now)) < 0);
    }
  }
});

test("showcase identities are deterministic, collision-free and independent between environments", () => {
  const now = "2026-11-02T00:00:00Z";
  const first = fixturePlan(namespace, now);
  assert.deepEqual(fixturePlan(namespace, now), first);
  const identities = [
    first.businessId, first.outsideId, first.venueId, first.fohId, first.bohId, first.fohRoleId, first.bohRoleId,
    ...first.staff.flatMap((person) => [person.id, person.shiftId, person.nextShiftId, person.sessionId, person.clockInId, person.breakId]),
  ];
  assert.equal(new Set(identities).size, identities.length);
  const other = fixturePlan("a0000000-0000-4000-8000-000000000002", now);
  assert.notEqual(first.businessId, other.businessId);
  assert.notEqual(first.staff[0].email, other.staff[0].email);
});

test("showcase fixture planning rejects invalid identities and timestamps", () => {
  for (const value of ["", "production", "../other", "not-a-uuid"]) assert.throws(() => fixturePlan(value), /namespace/);
  assert.throws(() => fixturePlan(namespace, "invalid"), RangeError);
});

test("reset inventory allows only the configured test owner and exact fictional accounts", () => {
  const plan = fixturePlan(namespace);
  const testOwner = "test-reviewer@butterbox.com";
  const accounts = [
    { email: `showcase-owner-${namespace}@example.test`, role: "owner", userId: randomUUID() },
    ...plan.staff.map((person) => ({ email: person.email, role: person.role, userId: randomUUID() })),
    { email: `showcase-outside-${namespace}@example.test`, role: "outside", userId: randomUUID() },
  ];
  const usersFor = (inventory) => inventory.map((account) => ({ id: account.userId, email: account.email }));
  assert.doesNotThrow(() => assertKnownFixtureAccounts(usersFor(accounts), accounts, namespace));
  const selected = accounts.map((account) => account.role === "owner" ? { ...account, email: testOwner } : account);
  const users = usersFor(selected);
  assert.doesNotThrow(() => assertKnownFixtureAccounts(users, selected, namespace, testOwner));
  assert.throws(() => assertKnownFixtureAccounts(users, selected, namespace), /no reset permitted/);
  assert.throws(() => assertKnownFixtureAccounts(users, selected, namespace, "test-other@butterbox.com"), /no reset permitted/);
  assert.throws(() => assertKnownFixtureAccounts(users, selected, namespace, "customer@butterbox.com"), /test-only/);
  assert.throws(() => assertKnownFixtureAccounts([...users.slice(1), users[1]], selected, namespace, testOwner), /no reset permitted/);
  const unexpected = selected.map((account, index) => index === 1 ? { ...account, email: "test-staff@butterbox.com" } : account);
  assert.throws(() => assertKnownFixtureAccounts(usersFor(unexpected), unexpected, namespace, testOwner), /no reset permitted/);
  const changedRole = selected.map((account, index) => index === 1 ? { ...account, role: "owner" } : account);
  assert.throws(() => assertKnownFixtureAccounts(users, changedRole, namespace, testOwner), /no reset permitted/);
});

test("showcase refuses accidental resets and unidentified fixture targets before database access", async () => {
  await assert.rejects(() => reset("/unidentified", undefined), /explicit synthetic/);
  await assert.rejects(() => reset("/unidentified", "--confirm-synthetic-reset=production"), /explicit synthetic/);
  await assert.rejects(() => seed("/tmp/butterbox-acceptance"), /absolute/);
  await assert.rejects(() => seed("butterbox-showcase"), /absolute/);
});

test("showcase seed and reset serialize and release locks after successful or failed operations", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "butterbox-fixture-lock-test-"));
  t.after(() => fs.rmSync(parent, { recursive: true }));
  const workdir = path.join(parent, project);
  prepare(workdir);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const first = withFixtureLock(workdir, () => pending);
  await assert.rejects(() => withFixtureLock(workdir, () => "not run"), /holds the lock/);
  release();
  await first;
  assert.equal(fs.existsSync(path.join(workdir, "fixture-operation.lock")), false);
  await assert.rejects(() => withFixtureLock(workdir, () => { throw new Error("fixture failed"); }), /fixture failed/);
  assert.equal(await withFixtureLock(workdir, () => "safe next operation"), "safe next operation");
  fs.writeFileSync(path.join(workdir, "fixture-operation.lock"), "interrupted", { mode: 0o600 });
  await assert.rejects(() => withFixtureLock(workdir, () => "not run"), /interrupted/);
});
