import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PayrollRecordValidationError, prepareCanonicalPayrollForProvider,
  validateCanonicalPayrollRecord, validateCanonicalPayrollRows,
} from "../src/lib/canonical-payroll.ts";

const businessId = "b7300000-0000-4000-8000-000000000001";
const venueId = "c7300000-0000-4000-8000-000000000001";
const employeeId = "e7300000-0000-4000-8000-000000000001";
const sessionId = "27300000-0000-4000-8000-000000000001";
const finalisationId = "77300000-0000-4000-8000-000000000001";
const source = {
  schemaVersion: 1,
  businessId,
  sessionId,
  worker: { employeeId, providerMapping: null },
  venue: { id: venueId, departmentId: "d7300000-0000-4000-8000-000000000001", timezone: "Australia/Sydney" },
  workDate: "2024-10-05",
  period: {
    weekStart: "2024-09-30", finalisationId, version: "9007199254740993",
    startsAt: "2024-09-29T14:00:00.000000Z", endsAt: "2024-10-06T13:00:00.000000Z",
  },
  attendance: {
    clockInEventId: "47300000-0000-4000-8000-000000000001",
    clockOutEventId: "47300000-0000-4000-8000-000000000006",
    clockInAt: "2024-10-05T13:15:00.123456Z", clockOutAt: "2024-10-05T17:15:00.123457Z",
  },
  hours: {
    unit: "seconds", elapsed: "14400.000001", worked: "11700.000000", paid: "12600.000001",
    paidBreak: "900.000001", unpaidBreak: "1800.000000",
  },
  breaks: [
    {
      id: "37300000-0000-4000-8000-000000000001", classification: "paid",
      startEventId: "47300000-0000-4000-8000-000000000002",
      endEventId: "47300000-0000-4000-8000-000000000003",
      startedAt: "2024-10-05T14:00:00.234567Z", endedAt: "2024-10-05T14:15:00.234568Z", seconds: "900.000001",
    },
    {
      id: "37300000-0000-4000-8000-000000000002", classification: "unpaid",
      startEventId: "47300000-0000-4000-8000-000000000004",
      endEventId: "47300000-0000-4000-8000-000000000005",
      startedAt: "2024-10-05T15:30:00.000000Z", endedAt: "2024-10-05T16:00:00.000000Z", seconds: "1800.000000",
    },
  ],
  payCodes: null,
  approval: {
    decisionId: "87300000-0000-4000-8000-000000000001", status: "approved", revision: "a".repeat(64),
  },
};
const scope = { businessId, venueId, weekStart: "2024-09-30", finalisationId, sessionCount: 1 };
const assignment = {
  businessId, employeeId, provider: "example",
  connectionId: "97300000-0000-4000-8000-000000000001", externalEmployeeId: "employee-123",
  payCodes: [{ code: "base", seconds: "11699.999999" }, { code: "paid-break", seconds: "900.000002" }],
};

function assertInvalid(mutator, message) {
  const record = structuredClone(source);
  mutator(record);
  assert.throws(() => validateCanonicalPayrollRecord(record), (error) =>
    error instanceof PayrollRecordValidationError && error.message.includes(message));
}

test("canonical record preserves exact approved time, timezone, breaks and version", () => {
  const input = structuredClone(source);
  const record = validateCanonicalPayrollRecord(input);
  assert.deepEqual(record, source);
  assert.equal(record.period.version, "9007199254740993");
  assert.equal(record.worker.providerMapping, null);
  assert.equal(record.payCodes, null);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.hours));
  assert.ok(Object.isFrozen(record.breaks));
  assert.ok(Object.isFrozen(record.breaks[0]));
  input.hours.paid = "0";
  input.breaks[0].seconds = "0";
  assert.equal(record.hours.paid, "12600.000001");
  assert.equal(record.breaks[0].seconds, "900.000001");
  assert.throws(() => { record.breaks[0].seconds = "0"; }, TypeError);
});

test("malformed shapes and identities fail with a field-specific error", () => {
  assertInvalid((row) => { delete row.worker; }, "record: missing or unexpected fields");
  assertInvalid((row) => { row.unexpected = true; }, "record: missing or unexpected fields");
  assertInvalid((row) => { row.schemaVersion = 2; }, "record.schemaVersion");
  assertInvalid((row) => { row.businessId = "not-a-uuid"; }, "record.businessId");
  assertInvalid((row) => { row.worker.employeeId = "Night Worker"; }, "record.worker.employeeId");
  assertInvalid((row) => { row.worker.providerMapping = {}; }, "record.worker.providerMapping");
  assertInvalid((row) => { row.venue.timezone = "not/a-zone"; }, "record.venue.timezone");
  assertInvalid((row) => { row.approval.status = "rejected"; }, "record.approval");
  assertInvalid((row) => { row.approval.revision = "z".repeat(64); }, "record.approval");
  assertInvalid((row) => { row.period.version = "9223372036854775808"; }, "record.period.version");
  assertInvalid((row) => { row.period.version = 3; }, "record.period.version");
  assertInvalid((row) => { row.attendance.clockOutEventId = row.attendance.clockInEventId; }, "record.attendance");
});

test("local dates and UTC instants are strictly validated across midnight and DST", () => {
  assertInvalid((row) => { row.workDate = "2024-10-06"; }, "record.workDate");
  assertInvalid((row) => { row.workDate = "2024-02-30"; }, "record.workDate");
  assertInvalid((row) => { row.period.weekStart = "2024-10-01"; }, "record.workDate");
  assertInvalid((row) => { row.period.endsAt = row.period.startsAt; }, "record.period");
  assertInvalid((row) => { row.period.startsAt = "2024-09-29T13:00:00.000000Z"; }, "record.period");
  assertInvalid((row) => { row.period.endsAt = "2024-10-06T14:00:00.000000Z"; }, "record.period");
  assertInvalid((row) => { row.attendance.clockInAt = "2024-10-05T13:15:00.123Z"; }, "clockInAt");
  assertInvalid((row) => { row.attendance.clockInAt = "2024-02-30T13:15:00.123456Z"; }, "clockInAt");
  assertInvalid((row) => { row.attendance.clockOutAt = "2024-10-05T13:15:00.123455Z"; }, "record.attendance");
  assertInvalid((row) => { row.attendance.clockInAt = "2024-09-29T13:59:59.999999Z"; }, "record.attendance");
});

test("exact seconds, individual breaks, event provenance and totals must reconcile", () => {
  assertInvalid((row) => { row.hours.unit = "hours"; }, "record.hours.unit");
  assertInvalid((row) => { row.hours.elapsed = 14400; }, "record.hours.elapsed");
  assertInvalid((row) => { row.hours.elapsed = "-1"; }, "record.hours.elapsed");
  assertInvalid((row) => { row.hours.elapsed = "1.0000001"; }, "record.hours.elapsed");
  assertInvalid((row) => { row.hours.paid = "12600.000002"; }, "record.hours");
  assertInvalid((row) => { row.breaks[0].seconds = "900.000000"; }, "record.breaks[0]");
  assertInvalid((row) => { row.breaks[0].classification = "unknown"; }, "classification");
  assertInvalid((row) => { row.breaks[1].id = row.breaks[0].id; }, "duplicate break");
  assertInvalid((row) => { row.breaks[1].startEventId = row.breaks[0].endEventId; }, "duplicate break");
  assertInvalid((row) => { row.breaks.reverse(); }, "unordered");
  assertInvalid((row) => {
    row.breaks[1].startedAt = "2024-10-05T14:10:00.000000Z";
    row.breaks[1].seconds = "6600.000000";
  }, "overlapping");
  assertInvalid((row) => { row.breaks.pop(); }, "individual breaks do not match");
});

test("row collection refuses duplicate, incomplete, cross-tenant or stale versions", () => {
  const rows = [{ session_id: sessionId, record: source }];
  assert.deepEqual(validateCanonicalPayrollRows(rows, scope), [source]);
  assert.deepEqual(validateCanonicalPayrollRows([], { ...scope, sessionCount: 0 }), []);
  assert.throws(() => validateCanonicalPayrollRows([], scope), /record count does not match/);
  assert.throws(() => validateCanonicalPayrollRows([...rows, ...rows], { ...scope, sessionCount: 2 }),
    /identity, scope or version/);
  assert.throws(() => validateCanonicalPayrollRows(rows, {
    ...scope, businessId: "b7300000-0000-4000-8000-000000000002",
  }), /identity, scope or version/);
  assert.throws(() => validateCanonicalPayrollRows(rows, {
    ...scope, finalisationId: "77300000-0000-4000-8000-000000000002",
  }), /identity, scope or version/);
  assert.throws(() => validateCanonicalPayrollRows([{ session_id: employeeId, record: source }], scope),
    /identity, scope or version/);
  const anotherSession = "27300000-0000-4000-8000-000000000002";
  assert.throws(() => validateCanonicalPayrollRows([
    ...rows,
    { session_id: anotherSession, record: { ...source, sessionId: anotherSession, period: { ...source.period, version: "2" } } },
  ], { ...scope, sessionCount: 2 }), /disagree about the finalised period/);
});

test("provider preparation requires explicit scoped mapping and detached matching pay codes", () => {
  const input = structuredClone(source);
  const mapping = structuredClone(assignment);
  const original = structuredClone(input);
  const prepared = prepareCanonicalPayrollForProvider(input, mapping);
  assert.deepEqual(input, original);
  assert.equal(prepared.worker.providerMapping.externalEmployeeId, "employee-123");
  assert.equal(prepared.worker.providerMapping.connectionId, assignment.connectionId);
  assert.deepEqual(prepared.payCodes, assignment.payCodes);
  assert.notStrictEqual(prepared.breaks, input.breaks);
  assert.notStrictEqual(prepared.payCodes, mapping.payCodes);
  assert.ok(Object.isFrozen(prepared.worker.providerMapping));
  assert.ok(Object.isFrozen(prepared.payCodes[0]));
  mapping.payCodes[0].seconds = "1";
  assert.equal(prepared.payCodes[0].seconds, "11699.999999");
  assert.throws(() => { prepared.attendance.clockInAt = "changed"; }, TypeError);
  assert.equal(input.attendance.clockInAt, source.attendance.clockInAt);
});

test("provider preparation rejects unmapped, mismatched and malformed pay data", () => {
  assert.throws(() => prepareCanonicalPayrollForProvider(source, null), /assignment: expected an object/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, {
    ...assignment, businessId: "b7300000-0000-4000-8000-000000000002",
  }), /different business or employee/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, {
    ...assignment, employeeId: "e7300000-0000-4000-8000-000000000002",
  }), /different business or employee/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, { ...assignment, externalEmployeeId: "" }),
    /externalEmployeeId/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, { ...assignment, externalEmployeeId: " worker " }),
    /externalEmployeeId/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, { ...assignment, connectionId: "worker-name" }),
    /connectionId/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, { ...assignment, payCodes: null }),
    /explicitly assigned pay codes/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, { ...assignment, payCodes: [] }),
    /do not match paid time/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, {
    ...assignment, payCodes: [{ code: "base", seconds: "12600.000000" }],
  }), /do not match paid time/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, {
    ...assignment, payCodes: [{ code: "base", seconds: "6000" }, { code: "base", seconds: "6600.000001" }],
  }), /duplicate pay code/);
  assert.throws(() => prepareCanonicalPayrollForProvider(source, {
    ...assignment, payCodes: [{ code: "base", seconds: "0" }],
  }), /duration must be positive/);
  assert.throws(() => prepareCanonicalPayrollForProvider({
    ...source, approval: { ...source.approval, status: "rejected" },
  }, assignment), /approved attendance revision/);
  const alreadyPrepared = prepareCanonicalPayrollForProvider(source, assignment);
  assert.throws(() => prepareCanonicalPayrollForProvider(alreadyPrepared, assignment), /already assigned/);
});
