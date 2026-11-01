import assert from "node:assert/strict";
import { test } from "node:test";
import { validateShiftForm } from "../src/lib/shift-form.ts";

const valid = {
  role: "Server",
  employee: "e9000000-0000-4000-8000-000000000001",
  start: "2032-03-15T10:00",
  end: "2032-03-15T13:00",
  break: "15",
};

test("valid draft, open and automatic shift inputs pass", () => {
  assert.deepEqual(validateShiftForm(valid, true).errors, {});
  assert.deepEqual(validateShiftForm({ ...valid, employee: "", break: "" }, true).errors, {});
  assert.deepEqual(validateShiftForm({ ...valid, employee: "auto" }, false).errors, {});
  assert.ok(validateShiftForm({ ...valid, employee: "auto" }, true).errors.employee);
});

test("invalid shift inputs produce field-specific errors", () => {
  const errors = validateShiftForm({
    role: " ",
    employee: "not-an-id",
    start: "2032-02-30T09:00",
    end: "2032-03-15T25:00",
    break: "2.5",
  }, false).errors;
  assert.deepEqual(Object.keys(errors).sort(), ["break", "employee", "end", "role", "start"]);
});

test("break limits and role length are enforced", () => {
  assert.ok(validateShiftForm({ ...valid, break: "241" }, false).errors.break);
  assert.ok(validateShiftForm({ ...valid, break: "-1" }, false).errors.break);
  assert.ok(validateShiftForm({ ...valid, role: "x".repeat(81) }, false).errors.role);
  assert.deepEqual(validateShiftForm({ ...valid, break: "240" }, false).errors, {});
});

test("the end date cannot precede the start date, while same-day overnight times are allowed", () => {
  assert.ok(validateShiftForm({ ...valid, end: "2032-03-14T11:00" }, true).errors.end);
  assert.deepEqual(validateShiftForm({ ...valid, end: "2032-03-15T04:00" }, true).errors, {});
});
