import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemoStore, createDemoWorkspace, demoSession, scopeWorkspace } from "../src/lib/demo-store.ts";
import { canManage, scheduledHours, shiftSchema, validateShift, type ShiftInput } from "../src/lib/domain.ts";

function draft(): ShiftInput {
  const data = createDemoWorkspace();
  return {
    venue_id: data.venues[0].id, department_id: data.departments[0].id,
    role_id: data.jobRoles[0].id, employee_id: data.employees[0].id,
    starts_at: "2030-01-01T22:00:00Z", ends_at: "2030-01-02T05:00:00Z",
    break_minutes: 30,
  };
}

test("owner, scoped managers and employees have distinct server permissions", () => {
  const data = createDemoWorkspace();
  assert.ok(canManage(demoSession("owner"), data.departments[1]));
  assert.ok(canManage(demoSession("foh"), data.departments[0]));
  assert.equal(canManage(demoSession("foh"), data.departments[1]), false);
  assert.equal(canManage(demoSession("employee"), data.departments[0]), false);
  assert.throws(() => scopeWorkspace({ ...demoSession("owner"), businessId: crypto.randomUUID() }, data), /denied/);
});

test("FOH and BOH data are isolated; employees see only own published roster", () => {
  const data = createDemoWorkspace();
  const foh = scopeWorkspace(demoSession("foh"), data);
  assert.equal(foh.departments.length, 1);
  assert.equal(foh.employees.length, 12);
  assert.ok(foh.shifts.every(s => s.department_id === data.departments[0].id));
  const employee = scopeWorkspace(demoSession("employee"), data);
  assert.equal(employee.employees.length, 1);
  assert.ok(employee.shifts.length > 0);
  assert.ok(employee.shifts.every(s => s.employee_id === demoSession("employee").employeeId && s.status === "published"));
});

test("shift validation supports overnight work but rejects bad breaks and times", () => {
  assert.ok(shiftSchema.safeParse(draft()).success);
  assert.equal(shiftSchema.safeParse({ ...draft(), ends_at: draft().starts_at }).success, false);
  assert.equal(shiftSchema.safeParse({ ...draft(), break_minutes: 420 }).success, false);
  assert.equal(shiftSchema.safeParse({ ...draft(), ends_at: "2030-01-04T05:00:00Z" }).success, false);
  assert.equal(shiftSchema.safeParse({ ...draft(), id: crypto.randomUUID() }).success, false);
  assert.ok(shiftSchema.safeParse({
    ...draft(), venue_id: "00000000-0000-0000-0000-000000000001",
  }).success, "PostgreSQL UUIDs need not carry an RFC version or variant");
});

test("overlap prevention includes published and cross-department shifts; adjacent shifts allowed", () => {
  const data = createDemoWorkspace();
  const input = draft();
  data.shifts.push({
    ...input, business_id: data.business.id, id: crypto.randomUUID(),
    status: "published", version: 1, department_id: data.departments[1].id,
  });
  assert.throws(() => validateShift(demoSession("owner"), data, input), /overlapping/);
  assert.doesNotThrow(() => validateShift(demoSession("owner"), data, {
    ...input, starts_at: input.ends_at, ends_at: "2030-01-02T12:00:00Z",
  }));
  assert.throws(() => validateShift(demoSession("owner"), data, {
    ...input, employee_id: data.employees[12].id,
  }), /eligible/);
});

test("draft save, optimistic edits, publishing and immutable published shifts", () => {
  const store = new DemoStore(":memory:");
  try {
    const owner = demoSession("owner");
    const input = draft();
    store.saveShift(owner, input);
    let shift = store.workspace(owner).shifts.find(s => s.starts_at === input.starts_at)!;
    assert.ok(shift);
    assert.throws(() => store.saveShift(owner, input), /overlapping/);
    assert.throws(() => store.saveShift(demoSession("boh"), { ...input, employee_id: null }), /department/);
    assert.throws(() => store.saveShift(demoSession("employee"), input), /department/);
    const hidden = store.workspace(owner).shifts.find(s => s.department_id !== input.department_id && s.status === "draft")!;
    assert.throws(() => store.saveShift(demoSession("foh"), {
      ...input, employee_id: null, id: hidden.id, version: hidden.version,
    }), /access denied/);
    store.saveShift(owner, { ...input, id: shift.id, version: shift.version, break_minutes: 45 });
    assert.throws(() => store.saveShift(owner, { ...input, id: shift.id, version: shift.version }), /changed/);
    shift = store.workspace(owner).shifts.find(s => s.id === shift.id)!;
    assert.throws(() => store.deleteShift(owner, shift.id, shift.version - 1), /unchanged/);
    assert.throws(() => store.publish(demoSession("employee"), input.venue_id, input.department_id, "2030-01-01T00:00:00Z", "2030-01-08T00:00:00Z"), /publish/);
    store.publish(owner, input.venue_id, input.department_id, "2030-01-01T00:00:00Z", "2030-01-08T00:00:00Z");
    shift = store.workspace(owner).shifts.find(s => s.id === shift.id)!;
    assert.equal(shift.status, "published");
    assert.equal(scheduledHours([shift]), 6.25);
    assert.throws(() => store.deleteShift(owner, shift.id, shift.version), /draft/);
    assert.throws(() => store.saveShift(owner, { ...input, id: shift.id, version: shift.version }), /Published/);
  } finally { store.close(); }
});

test("demo sessions are opaque, expirable, revocable and login is rate limited", () => {
  const store = new DemoStore(":memory:");
  try {
    assert.equal(store.login("owner@demo.butterbox.test", "wrong"), null);
    const token = store.login("owner@demo.butterbox.test", "butterbox-demo")!;
    assert.equal(store.session(token)?.role, "owner");
    assert.equal(store.session("invented-token"), null);
    store.logout(token);
    assert.equal(store.session(token), null);
    for (let i = 0; i < 10; i++) store.login("boh@demo.butterbox.test", "wrong");
    assert.equal(store.login("boh@demo.butterbox.test", "butterbox-demo"), null);
  } finally { store.close(); }
});

test("local test double persists roster changes across connections", () => {
  const directory = mkdtempSync(join(tmpdir(), "butterbox-test-"));
  const path = join(directory, "test.sqlite");
  try {
    const store = new DemoStore(path);
    store.saveShift(demoSession("owner"), draft());
    store.close();
    const reopened = new DemoStore(path);
    assert.ok(reopened.workspace(demoSession("owner")).shifts.some(s => s.starts_at === draft().starts_at));
    reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
