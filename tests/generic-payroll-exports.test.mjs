import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decimalHours, genericPayrollCsv, payrollCsvCell, validateGenericPayrollBatch,
  validateGenericPayrollEntries, validateGenericPayrollHistory, validateGenericPayrollHistoryEntries,
  validateGenericPayrollReview,
} from "../src/lib/generic-payroll-exports.ts";
import { validateCanonicalPayrollRecord } from "../src/lib/canonical-payroll.ts";

const businessId = "b7400000-0000-4000-8000-000000000001";
const venueId = "c7400000-0000-4000-8000-000000000001";
const employeeId = "e7400000-0000-4000-8000-000000000001";
const sessionId = "27400000-0000-4000-8000-000000000001";
const finalisationId = "77400000-0000-4000-8000-000000000001";
const batchId = "97400000-0000-4000-8000-000000000001";
const source = {
  schemaVersion: 1, businessId, sessionId,
  worker: { employeeId, providerMapping: null },
  venue: { id: venueId, departmentId: "d7400000-0000-4000-8000-000000000001", timezone: "Australia/Sydney" },
  workDate: "2024-01-10",
  period: {
    weekStart: "2024-01-08", finalisationId, version: "9007199254740993",
    startsAt: "2024-01-07T13:00:00.000000Z", endsAt: "2024-01-14T13:00:00.000000Z",
  },
  attendance: {
    clockInEventId: "47400000-0000-4000-8000-000000000001",
    clockOutEventId: "47400000-0000-4000-8000-000000000002",
    clockInAt: "2024-01-09T22:00:00.000000Z", clockOutAt: "2024-01-10T00:00:00.000000Z",
  },
  hours: { unit: "seconds", elapsed: "7200.000000", worked: "7200.000000", paid: "7200.000000",
    paidBreak: "0.000000", unpaidBreak: "0.000000" },
  breaks: [], payCodes: null,
  approval: { decisionId: "87400000-0000-4000-8000-000000000001", status: "approved", revision: "a".repeat(64) },
};
const scope = { businessId, venueId, weekStart: source.period.weekStart, finalisationId, sessionCount: 1 };
const previous = structuredClone(source);
previous.period.finalisationId = "77400000-0000-4000-8000-000000000002";
previous.attendance.clockOutAt = "2024-01-09T23:00:00.000000Z";
previous.hours.elapsed = previous.hours.worked = previous.hours.paid = "3600.000000";
const canonical = validateCanonicalPayrollRecord(source);

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = input.charCodeAt(0) === 0xfeff ? 1 : 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted && ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ",") { row.push(cell); cell = ""; }
    else if (!quoted && ch === "\r" && input[i + 1] === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; i++;
    } else cell += ch;
  }
  assert.equal(quoted, false);
  assert.deepEqual(row, []);
  return rows;
}

test("batch metadata rejects missing, stale or malformed receipts", () => {
  const batch = {
    batch_id: batchId, week_start: "2024-01-08", finalisation_id: finalisationId,
    session_count: 1, created_at: "2024-01-15T01:02:03.123456+00:00",
  };
  assert.deepEqual(validateGenericPayrollBatch([batch], batchId), {
    id: batchId, weekStart: batch.week_start, finalisationId, sessionCount: 1, createdAt: batch.created_at,
  });
  assert.throws(() => validateGenericPayrollBatch([], batchId), /one batch/);
  assert.throws(() => validateGenericPayrollBatch([batch], sessionId), /identity/);
  assert.throws(() => validateGenericPayrollBatch([{ ...batch, week_start: "2024-01-09" }], batchId), /Monday/);
  assert.throws(() => validateGenericPayrollBatch([{ ...batch, session_count: 0 }], batchId), /count/);
  assert.throws(() => validateGenericPayrollBatch([{ ...batch, created_at: "2024-02-30T00:00:00Z" }], batchId),
    /instant/);
  assert.throws(() => validateGenericPayrollBatch([{ ...batch, unexpected: true }], batchId), /unexpected/);
});

test("export entries require complete, unique, approved and correctly scoped snapshots", () => {
  const row = { session_id: sessionId, employee_name: "\t=1+1", record: source };
  const entries = validateGenericPayrollEntries([row], scope);
  assert.equal(entries[0].employeeName, "\t=1+1");
  assert.deepEqual(entries[0].record, source);
  assert.throws(() => validateGenericPayrollEntries([], scope), /count/);
  assert.throws(() => validateGenericPayrollEntries([row, row], { ...scope, sessionCount: 2 }), /scope/);
  assert.throws(() => validateGenericPayrollEntries([{ ...row, session_id: employeeId }], scope), /scope/);
  assert.throws(() => validateGenericPayrollEntries([{ ...row, employee_name: "  " }], scope), /employee name/);
  assert.throws(() => validateGenericPayrollEntries([row], { ...scope, businessId: employeeId }), /scope/);
  assert.throws(() => validateGenericPayrollEntries([row], { ...scope, finalisationId: batchId }), /scope/);
  const rejected = structuredClone(source);
  rejected.approval.status = "rejected";
  assert.throws(() => validateGenericPayrollEntries([{ ...row, record: rejected }], scope), /approval/);
});

test("reconciliation reviews require changed records matching the current snapshot and tenant", () => {
  const change = { sessionId, employeeName: "Employee", previous, current: source };
  const review = { reviewHash: "a".repeat(64), newCount: 0, changes: [change] };
  assert.equal(validateGenericPayrollReview(review, scope, [canonical]).changes.length, 1);
  assert.throws(() => validateGenericPayrollReview({ ...review, reviewHash: "bad" }, scope, [canonical]), /hash/);
  assert.throws(() => validateGenericPayrollReview({ ...review, newCount: 1 }, scope, [canonical]), /counts/);
  assert.throws(() => validateGenericPayrollReview({ ...review, changes: [change, change] }, scope, [canonical]),
    /duplicate/);
  assert.throws(() => validateGenericPayrollReview(review, scope, []), /incomplete/);
  const otherTenant = structuredClone(previous);
  otherTenant.businessId = employeeId;
  assert.throws(() => validateGenericPayrollReview({
    ...review, changes: [{ ...change, previous: otherTenant }],
  }, scope, [canonical]), /scope/);
  assert.throws(() => validateGenericPayrollReview({
    ...review, changes: [{ ...change, previous: source }],
  }, scope, [canonical]), /have not changed/);
  const alteredCurrent = structuredClone(source);
  alteredCurrent.attendance.clockOutAt = "2024-01-09T23:00:00.000000Z";
  alteredCurrent.hours.elapsed = alteredCurrent.hours.worked = alteredCurrent.hours.paid = "3600.000000";
  assert.throws(() => validateGenericPayrollReview({
    ...review, changes: [{ ...change, current: alteredCurrent }],
  }, scope, [canonical]), /snapshot/);
});

test("export history validates actor, reason, timestamp and unique audit IDs", () => {
  const batch = {
    id: batchId, kind: "batch", finalisation_id: finalisationId, actor_role: "owner", actor_is_self: true,
    entry_count: 1, reason: null, created_at: "2024-01-15T01:02:03+00:00",
  };
  const reconciliation = {
    ...batch, id: sessionId, kind: "reconciliation", reason: "Adjusted external payroll",
  };
  assert.equal(validateGenericPayrollHistory([batch, reconciliation]).length, 2);
  assert.throws(() => validateGenericPayrollHistory([batch, batch]), /duplicate/);
  assert.throws(() => validateGenericPayrollHistory([{ ...batch, actor_role: "foh_manager" }]), /audit/);
  assert.throws(() => validateGenericPayrollHistory([{ ...batch, reason: "unexpected" }]), /audit/);
  assert.throws(() => validateGenericPayrollHistory([{ ...reconciliation, reason: " " }]), /audit/);
  assert.throws(() => validateGenericPayrollHistory([{ ...reconciliation, reason: "\ufeff \t\ufeff" }]), /audit/);
  const emoji = "\u{1F600}";
  const maximumReason = `Moved ${emoji.repeat(247)}`;
  assert.equal(maximumReason.length, 500);
  assert.equal(validateGenericPayrollHistory([{ ...reconciliation, reason: maximumReason }])[0].reason, maximumReason);
  assert.throws(() => validateGenericPayrollHistory([{ ...reconciliation, reason: emoji.repeat(251) }]), /audit/);
  assert.throws(() => validateGenericPayrollHistory([{ ...batch, created_at: "invalid" }]), /instant/);
});

test("historical batch and reconciliation entries retain scoped before/after details", () => {
  const events = validateGenericPayrollHistory([
    { id: batchId, kind: "batch", finalisation_id: finalisationId, actor_role: "owner", actor_is_self: true,
      entry_count: 1, reason: null, created_at: "2024-01-15T01:02:03+00:00" },
    { id: employeeId, kind: "reconciliation", finalisation_id: finalisationId, actor_role: "general_manager",
      actor_is_self: false, entry_count: 1, reason: "Adjusted externally", created_at: "2024-01-16T01:02:03+00:00" },
  ]);
  const batchEntry = {
    event_id: batchId, kind: "batch", session_id: sessionId, employee_name: "Employee",
    previous_record: null, current_record: source,
  };
  const reconciliationEntry = {
    ...batchEntry, event_id: employeeId, kind: "reconciliation", previous_record: previous,
  };
  const entries = [batchEntry, reconciliationEntry];
  assert.equal(validateGenericPayrollHistoryEntries(entries, events, scope)[1].previous.hours.paid, "3600.000000");
  assert.throws(() => validateGenericPayrollHistoryEntries([batchEntry], events, scope), /counts/);
  assert.throws(() => validateGenericPayrollHistoryEntries([batchEntry, batchEntry], events, scope), /inconsistent/);
  assert.throws(() => validateGenericPayrollHistoryEntries([
    { ...batchEntry, event_id: sessionId }, reconciliationEntry,
  ], events, scope), /inconsistent/);
  assert.throws(() => validateGenericPayrollHistoryEntries([
    { ...batchEntry, previous_record: previous }, reconciliationEntry,
  ], events, scope), /incomplete/);
  assert.throws(() => validateGenericPayrollHistoryEntries(entries, events, { ...scope, venueId: employeeId }), /scope/);
  assert.throws(() => validateGenericPayrollHistoryEntries([
    batchEntry, { ...reconciliationEntry, previous_record: source },
  ], events, scope), /have not changed/);
  assert.throws(() => validateGenericPayrollHistoryEntries([
    batchEntry, { ...reconciliationEntry, current_record: previous },
  ], events, scope), /finalisation/);
});

test("decimal hours use exact half-up rounding to six places", () => {
  assert.equal(decimalHours("0"), "0.000000");
  assert.equal(decimalHours("0.001799"), "0.000000");
  assert.equal(decimalHours("0.001800"), "0.000001");
  assert.equal(decimalHours("3599.998200"), "1.000000");
  assert.equal(decimalHours("7200.000000"), "2.000000");
  assert.equal(decimalHours("90071992547409.000001"), "25019997929.835833");
  assert.throws(() => decimalHours("-1"), /seconds/);
  assert.throws(() => decimalHours("0.0000001"), /seconds/);
});

test("CSV output quotes every cell, neutralizes formulas and preserves explicit IDs and exact seconds", () => {
  for (const value of ["=1+1", "+1", "-1", "@SUM(A1)", " \t=1", "\u200b=1", "\rhello", "\nhello"]) {
    assert.equal(payrollCsvCell(value), `"'${value}"`);
  }
  assert.equal(payrollCsvCell('A, "quoted"\nname'), '"A, ""quoted""\nname"');
  const entries = validateGenericPayrollEntries([
    { session_id: sessionId, employee_name: ' =SUM(1,"2")\nSecond line', record: source },
  ], scope);
  const csv = genericPayrollCsv(batchId, entries);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const [headers, values] = parseCsv(csv);
  assert.equal(headers.length, 22);
  assert.equal(values.length, headers.length);
  const fields = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  assert.equal(fields.batch_id, batchId);
  assert.equal(fields.finalisation_id, finalisationId);
  assert.equal(fields.payroll_version, "9007199254740993");
  assert.equal(fields.employee_id, employeeId);
  assert.equal(fields.employee_name, `' =SUM(1,"2")\nSecond line`);
  assert.equal(fields.session_id, sessionId);
  assert.equal(fields.clock_in_utc, "2024-01-09T22:00:00.000000Z");
  assert.equal(fields.paid_seconds, "7200.000000");
  assert.equal(fields.paid_hours, "2.000000");
  assert.equal(fields.approval_revision, "a".repeat(64));
});
