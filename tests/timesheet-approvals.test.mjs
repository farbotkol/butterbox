import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseTimesheetApprovals, parseTimesheetDecisionInput, parseTimesheetDecisions, timesheetApprovalLabels,
  timesheetApprovalStatuses, timesheetApprovalsWithinSessions,
} from "../src/lib/timesheet-approvals.ts";

const sessionId = "21000000-0000-4000-8000-000000000001";
const departmentId = "d1000000-0000-4000-8000-000000000001";
const actorId = "a1000000-0000-4000-8000-000000000001";
const pending = {
  session_id: sessionId, department_id: departmentId, status: "pending", decision: null, reason: null,
  decided_at: null, actor_id: null, self_owned: false,
};
const returned = {
  ...pending, session_id: "21000000-0000-4000-8000-000000000003", status: "returned", decision: "rejected", reason: "Clock-out missing",
  decided_at: "2024-10-07T01:00:00Z", actor_id: actorId,
};

test("every approval status has a label", () => {
  for (const status of timesheetApprovalStatuses) assert.equal(typeof timesheetApprovalLabels[status], "string");
});

test("approval rows parse pending, approved and returned states", () => {
  const approved = { ...returned, session_id: "21000000-0000-4000-8000-000000000002", status: "approval_outdated",
    decision: "approved", reason: null };
  assert.deepEqual(parseTimesheetApprovals([pending, returned, approved]), [pending, returned, approved]);
  assert.deepEqual(parseTimesheetApprovals([{ ...returned, status: "resubmitted" }])?.[0].status, "resubmitted");
});

test("approval rows reject inconsistent or malformed data", () => {
  assert.equal(parseTimesheetApprovals(null), null);
  assert.equal(parseTimesheetApprovals([{ ...pending, status: "approved" }]), null);
  assert.equal(parseTimesheetApprovals([{ ...pending, reason: "x" }]), null);
  assert.equal(parseTimesheetApprovals([{ ...returned, reason: null }]), null);
  assert.equal(parseTimesheetApprovals([{ ...returned, status: "approved" }]), null);
  assert.equal(parseTimesheetApprovals([{ ...returned, actor_id: "nope" }]), null);
  assert.equal(parseTimesheetApprovals([{ ...pending, self_owned: "no" }]), null);
  assert.equal(parseTimesheetApprovals([pending, { ...pending, session_id: sessionId.toUpperCase() }]), null);
});

test("employee decision history parses and rejects pending or reasonless returns", () => {
  const row = {
    decision_id: "c1000000-0000-4000-8000-000000000001", session_id: sessionId, employee_name: "Worker",
    department_name: "FOH", clocked_in_at: "2024-10-06T22:00:00Z", decision: "rejected", reason: "Fix break",
    status: "returned", decided_at: "2024-10-07T01:00:00Z", actor_id: actorId,
  };
  assert.deepEqual(parseTimesheetDecisions([row]), [row]);
  assert.deepEqual(parseTimesheetDecisions([{ ...row, clocked_in_at: null }])?.[0].clocked_in_at, null);
  assert.equal(parseTimesheetDecisions([{ ...row, status: "pending" }]), null);
  assert.equal(parseTimesheetDecisions([{ ...row, reason: null }]), null);
  assert.equal(parseTimesheetDecisions([{ ...row, decision: "approved" }]), null);
  assert.equal(parseTimesheetDecisions([{ ...row, decided_at: "bad" }]), null);
  assert.equal(parseTimesheetDecisions({}), null);
});

test("decision input requires a bounded reason only when returning", () => {
  assert.deepEqual(parseTimesheetDecisionInput("approved", ""), { decision: "approved", reason: null });
  assert.deepEqual(parseTimesheetDecisionInput("approved", null), { decision: "approved", reason: null });
  assert.deepEqual(parseTimesheetDecisionInput("rejected", "  Missing break  "),
    { decision: "rejected", reason: "Missing break" });
  assert.equal(parseTimesheetDecisionInput("rejected", "   "), null);
  assert.equal(parseTimesheetDecisionInput("rejected", "x".repeat(501)), null);
  assert.equal(parseTimesheetDecisionInput("approve", ""), null);
  assert.equal(parseTimesheetDecisionInput("approved", 5), null);
});

test("approvals must belong to a visible session in the same department", () => {
  const sessions = [{ session_id: sessionId, department_id: departmentId }];
  assert.equal(timesheetApprovalsWithinSessions(sessions, [pending]), true);
  assert.equal(timesheetApprovalsWithinSessions(sessions, []), true);
  assert.equal(timesheetApprovalsWithinSessions(sessions,
    [{ ...pending, department_id: "d1000000-0000-4000-8000-000000000002" }]), false);
  assert.equal(timesheetApprovalsWithinSessions([], [pending]), false);
});
