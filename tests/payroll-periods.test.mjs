import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePayrollPeriod, parsePayrollPeriodEvents, parsePayrollPeriodExceptions, parsePayrollPeriodInput,
  payrollActorLabel, payrollExceptionCodes, payrollExceptionLabels, payrollFailureReason, payrollFinalisedMessage,
  payrollPeriodStatusLabels, payrollPeriodStatuses,
} from "../src/lib/payroll-periods.ts";

const eventId = "e7200000-0000-4000-8000-000000000001";
const sessionId = "27200000-0000-4000-8000-000000000001";
const claimId = "37200000-0000-4000-8000-000000000001";
const open = {
  status: "open", period_starts_at: "2024-09-29T14:00:00+00:00", period_ends_at: "2024-10-06T13:00:00+00:00",
  period_ended: true, can_finalise: true, event_id: null, actor_role: null, actor_is_self: null, reason: null,
  session_count: null, worked_seconds: null, paid_seconds: null, decided_at: null,
};
const finalised = {
  ...open, status: "finalised", event_id: eventId, actor_role: "general_manager", actor_is_self: false,
  reason: null, session_count: 4, worked_seconds: 27000, paid_seconds: "25200.5", decided_at: "2024-10-07T01:00:00Z",
};
const reopened = {
  ...finalised, status: "reopened", reason: "Late correction", session_count: 0, worked_seconds: 0, paid_seconds: 0,
};

test("every status and exception code has a label", () => {
  for (const status of payrollPeriodStatuses) assert.ok(payrollPeriodStatusLabels[status]);
  for (const code of payrollExceptionCodes) assert.ok(payrollExceptionLabels[code]);
});

test("parses open, finalised and reopened periods", () => {
  assert.deepEqual(parsePayrollPeriod([open]), {
    status: "open", periodStartsAt: open.period_starts_at, periodEndsAt: open.period_ends_at, periodEnded: true,
    canFinalise: true, eventId: null, actorRole: null, actorIsSelf: null, reason: null, sessionCount: null,
    workedSeconds: null, paidSeconds: null, decidedAt: null,
  });
  const final = parsePayrollPeriod([finalised]);
  assert.equal(final?.status, "finalised");
  assert.equal(final?.paidSeconds, 25200.5);
  assert.equal(final?.sessionCount, 4);
  assert.equal(parsePayrollPeriod([reopened])?.reason, "Late correction");
});

test("rejects inconsistent or malformed periods", () => {
  assert.equal(parsePayrollPeriod(open), null);
  assert.equal(parsePayrollPeriod([]), null);
  assert.equal(parsePayrollPeriod([open, open]), null);
  assert.equal(parsePayrollPeriod([{ ...open, status: "closed" }]), null);
  assert.equal(parsePayrollPeriod([{ ...open, event_id: eventId }]), null);
  assert.equal(parsePayrollPeriod([{ ...open, period_ends_at: open.period_starts_at }]), null);
  assert.equal(parsePayrollPeriod([{ ...open, can_finalise: "true" }]), null);
  assert.equal(parsePayrollPeriod([{ ...finalised, event_id: "not-a-uuid" }]), null);
  assert.equal(parsePayrollPeriod([{ ...finalised, actor_role: "foh_manager" }]), null);
  assert.equal(parsePayrollPeriod([{ ...finalised, worked_seconds: -1 }]), null);
  assert.equal(parsePayrollPeriod([{ ...finalised, session_count: 1.5 }]), null);
  assert.equal(parsePayrollPeriod([{ ...finalised, reason: " " }]), null);
  assert.equal(parsePayrollPeriod([{ ...reopened, reason: null }]), null);
  assert.equal(parsePayrollPeriod([{ ...reopened, session_count: 2 }]), null);
});

test("parses session and claim exceptions", () => {
  const rows = [
    { session_id: sessionId, claim_id: null, employee_name: "Ada", department_name: "FOH",
      occurred_at: null, exception_code: "incomplete_attendance" },
    { session_id: null, claim_id: claimId, employee_name: "Ada", department_name: "FOH",
      occurred_at: "2024-10-01T01:00:00Z", exception_code: "correction_request_pending" },
  ];
  assert.deepEqual(parsePayrollPeriodExceptions(rows)?.map((row) => [row.sessionId, row.claimId, row.code]), [
    [sessionId, null, "incomplete_attendance"], [null, claimId, "correction_request_pending"],
  ]);
  assert.deepEqual(parsePayrollPeriodExceptions([]), []);
  assert.equal(parsePayrollPeriodExceptions(null), null);
  assert.equal(parsePayrollPeriodExceptions([{ ...rows[0], exception_code: "unknown" }]), null);
  assert.equal(parsePayrollPeriodExceptions([{ ...rows[0], claim_id: claimId }]), null);
  assert.equal(parsePayrollPeriodExceptions([{ ...rows[1], session_id: sessionId }]), null);
  assert.equal(parsePayrollPeriodExceptions([{ ...rows[1], occurred_at: null }]), null);
  assert.equal(parsePayrollPeriodExceptions([{ ...rows[0], employee_name: 1 }]), null);
});

test("parses period history and rejects duplicates or missing reopen reasons", () => {
  const history = [
    { event_id: "e7200000-0000-4000-8000-000000000002", action: "reopened", actor_role: "owner", actor_is_self: true,
      reason: "Late correction", session_count: 0, worked_seconds: 0, paid_seconds: 0, created_at: "2024-10-08T00:00:00Z" },
    { event_id: eventId, action: "finalised", actor_role: "general_manager", actor_is_self: false, reason: "Week closed",
      session_count: 4, worked_seconds: "27000", paid_seconds: 25200, created_at: "2024-10-07T00:00:00Z" },
  ];
  const parsed = parsePayrollPeriodEvents(history);
  assert.equal(parsed?.length, 2);
  assert.equal(parsed?.[1].workedSeconds, 27000);
  assert.equal(parsePayrollPeriodEvents([history[1], history[1]]), null);
  assert.equal(parsePayrollPeriodEvents([{ ...history[0], reason: null }]), null);
  assert.equal(parsePayrollPeriodEvents([{ ...history[0], action: "approved" }]), null);
  assert.equal(parsePayrollPeriodEvents([{ ...history[1], created_at: "later" }]), null);
});

test("validates finalise notes and reopen reasons", () => {
  assert.deepEqual(parsePayrollPeriodInput("finalised", null), { action: "finalised", reason: null });
  assert.deepEqual(parsePayrollPeriodInput("finalised", "  "), { action: "finalised", reason: null });
  assert.deepEqual(parsePayrollPeriodInput("finalised", " Week closed "), { action: "finalised", reason: "Week closed" });
  assert.deepEqual(parsePayrollPeriodInput("reopened", " Late correction "), { action: "reopened", reason: "Late correction" });
  assert.equal(parsePayrollPeriodInput("reopened", " "), null);
  assert.equal(parsePayrollPeriodInput("reopened", null), null);
  assert.equal(parsePayrollPeriodInput("finalised", "x".repeat(501)), null);
  assert.equal(parsePayrollPeriodInput("approved", null), null);
});

test("describes actors and maps server failures", () => {
  assert.equal(payrollActorLabel("owner", false), "an owner");
  assert.equal(payrollActorLabel("general_manager", false), "a general manager");
  assert.equal(payrollActorLabel("admin", true), "you (admin)");
  assert.equal(payrollFailureReason("Resolve outstanding exceptions before finalising"), "period-exceptions");
  assert.equal(payrollFailureReason("Payroll period has not ended"), "period-not-ended");
  assert.equal(payrollFailureReason("Permission denied"), "period-permission");
  assert.equal(payrollFailureReason("Payroll period is already finalised"), "period-stale");
  assert.equal(payrollFailureReason("Request identifier already used"), "period-retry");
  assert.equal(payrollFailureReason(undefined), "period-save");
  assert.match(payrollFinalisedMessage, /reopen it before changing attendance/);
});
