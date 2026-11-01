import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWorkedDuration, parseWorkedTime } from "../src/lib/worked-time.ts";

const row = {
  session_id: "21000000-0000-4000-8000-000000000001",
  employee_id: "e1000000-0000-4000-8000-000000000001",
  employee_name: "Worker",
  department_id: "d1000000-0000-4000-8000-000000000001",
  department_name: "FOH",
  venue_id: "c1000000-0000-4000-8000-000000000001",
  venue_name: "Harbour",
  venue_timezone: "Australia/Sydney",
  clocked_in_at: "2024-10-05T13:30:00Z",
  clocked_out_at: "2024-10-05T17:30:00Z",
  elapsed_seconds: 14400,
  worked_seconds: 11700,
  paid_seconds: 12600,
  paid_break_seconds: 900,
  unpaid_break_seconds: 1800,
  exceptions: [],
};

test("work-time results preserve exact durations and distinguish location exceptions", () => {
  assert.deepEqual(parseWorkedTime([row]), [row]);
  const precise = {
    ...row, elapsed_seconds: 10.530865, worked_seconds: 9.430864,
    paid_seconds: 9.430864, paid_break_seconds: 0, unpaid_break_seconds: 1.100001,
    exceptions: ["location_review_required", "location_reviewed"],
  };
  assert.deepEqual(parseWorkedTime([precise]), [precise]);
  const offline = { ...row, exceptions: ["offline_claim_unverified"] };
  assert.deepEqual(parseWorkedTime([offline]), [offline]);
  const reportedBreak = { ...row, exceptions: ["offline_claim_unverified", "manager_reported_break"] };
  assert.deepEqual(parseWorkedTime([reportedBreak]), [reportedBreak]);
  const employeeRequest = { ...row, exceptions: ["employee_request_unverified"] };
  assert.deepEqual(parseWorkedTime([employeeRequest]), [employeeRequest]);
  const incomplete = {
    ...row, clocked_out_at: null, elapsed_seconds: null, worked_seconds: null,
    paid_seconds: null, paid_break_seconds: null, unpaid_break_seconds: null,
    exceptions: ["missing_clock_out", "incomplete_break"],
  };
  assert.deepEqual(parseWorkedTime([incomplete]), [incomplete]);
  assert.deepEqual(parseWorkedTime([]), []);
});

test("work-time results reject incomplete, inconsistent or unauthorized-shaped data", () => {
  for (const invalid of [
    { ...row, session_id: "invalid" },
    { ...row, employee_name: " " },
    { ...row, venue_timezone: "Invalid/Timezone" },
    { ...row, clocked_in_at: "not-a-date" },
    { ...row, clocked_out_at: null },
    { ...row, exceptions: ["missing_clock_out"] },
    { ...row, exceptions: ["unknown"] },
    { ...row, exceptions: ["location_reviewed", "location_reviewed"] },
    { ...row, worked_seconds: -1 },
    { ...row, worked_seconds: NaN },
    { ...row, worked_seconds: null },
    { ...row, worked_seconds: 12000 },
    { ...row, paid_seconds: 11700 },
    { ...row, exceptions: ["invalid_break"] },
  ]) assert.equal(parseWorkedTime([invalid]), null);
  assert.equal(parseWorkedTime([row, { ...row, session_id: row.session_id.toUpperCase() }]), null);
  assert.equal(parseWorkedTime(null), null);
});

test("duration formatting rounds for display only, including minute boundaries", () => {
  assert.equal(formatWorkedDuration(9.430864), "0h 0m 9s");
  assert.equal(formatWorkedDuration(59.5), "0h 1m 0s");
  assert.equal(formatWorkedDuration(3599.5), "1h 0m 0s");
  assert.equal(formatWorkedDuration(14400), "4h 0m 0s");
});
