import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestShiftOfferCandidates } from "../src/lib/shift-offer-suggestions.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = (n, name, ineligibility = null) => ({
  employee_id: id(n), employee_name: name, ineligibility,
});
const shift = (employee, department, startsAt, endsAt) => ({
  employee_id: employee, department_id: department, starts_at: startsAt, ends_at: endsAt,
});
const inputs = () => ({
  candidates: [
    candidate(1, "Zulu"), candidate(2, "Alpha"), candidate(3, "Bravo"),
    candidate(4, "Unavailable", "availability"), candidate(5, "Overlapping", "conflict"),
    candidate(6, "Wrong role", "role"), candidate(7, "Wrong department", "department"),
  ],
  departmentId: id(10),
  roleTitle: "  Barista ",
  roles: [
    { id: id(11), department_id: id(10), name: "Barista" },
    { id: id(12), department_id: id(10), name: "bArIsTa" },
    { id: id(13), department_id: id(20), name: "Barista" },
  ],
  assignments: [
    { employee_id: id(1), department_id: id(10), job_role_id: id(11) },
    { employee_id: id(2), department_id: id(10), job_role_id: id(12) },
    { employee_id: id(3), department_id: id(20), job_role_id: id(13) },
  ],
  shifts: [
    shift(id(1), id(10), "2032-04-05T09:00:00Z", "2032-04-05T17:00:00Z"),
    shift(id(2), id(10), "2032-04-05T09:00:00Z", "2032-04-05T12:00:00Z"),
    shift(id(2), id(10), "2032-04-06T09:00:00Z", "2032-04-06T10:00:00Z"),
    shift(id(2), id(20), "2032-04-07T09:00:00Z", "2032-04-07T17:00:00Z"),
    shift(null, id(10), "2032-04-07T09:00:00Z", "2032-04-07T17:00:00Z"),
  ],
  patternEmployees: new Set([id(2)]),
});

test("suggestions exclude ineligible workers and rank role tags before scoped weekly time", () => {
  assert.deepEqual(suggestShiftOfferCandidates(inputs()), [
    { employeeId: id(2), employeeName: "Alpha", roleMatch: "recorded",
      hasAvailabilityPattern: true, scheduledSeconds: 4 * 3600 },
    { employeeId: id(1), employeeName: "Zulu", roleMatch: "recorded",
      hasAvailabilityPattern: false, scheduledSeconds: 8 * 3600 },
    { employeeId: id(3), employeeName: "Bravo", roleMatch: "not_recorded",
      hasAvailabilityPattern: false, scheduledSeconds: 0 },
  ]);
});

test("missing role tags are disclosed and names do not affect tie order", () => {
  const data = inputs();
  data.roles = [];
  data.shifts = [];
  const suggestions = suggestShiftOfferCandidates(data);
  assert.deepEqual(suggestions.map((row) => row.employeeId), [id(1), id(2), id(3)]);
  assert.ok(suggestions.every((row) => row.roleMatch === "not_configured"));
});

test("empty or entirely ineligible audiences have no alternatives", () => {
  assert.deepEqual(suggestShiftOfferCandidates({ ...inputs(), candidates: [] }), []);
  assert.deepEqual(suggestShiftOfferCandidates({
    ...inputs(), candidates: [candidate(4, "Unavailable", "availability")],
  }), []);
});

test("unavailable role-assignment data does not become an unqualified ranking", () => {
  assert.equal(suggestShiftOfferCandidates({ ...inputs(), assignments: null }), null);
});

test("invalid or non-positive scoped durations fail the entire ranking", () => {
  for (const [start, end] of [
    ["invalid", "2032-04-06T10:00:00Z"],
    ["2032-04-06T10:00:00Z", "invalid"],
    ["2032-04-06T10:00:00Z", "2032-04-06T10:00:00Z"],
    ["2032-04-06T10:00:00Z", "2032-04-06T09:00:00Z"],
  ]) {
    const data = inputs();
    data.shifts = [shift(id(1), id(10), start, end)];
    assert.equal(suggestShiftOfferCandidates(data), null);
  }
});

test("unrelated department and ineligible-worker durations do not affect the ranking", () => {
  const data = inputs();
  data.shifts.push(shift(id(1), id(20), "invalid", "invalid"));
  data.shifts.push(shift(id(4), id(10), "invalid", "invalid"));
  assert.deepEqual(suggestShiftOfferCandidates(data), suggestShiftOfferCandidates(inputs()));
});
