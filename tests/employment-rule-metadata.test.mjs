import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentEmploymentMetadata, employmentMetadataFailure, isEmploymentEffectiveDate,
  parseEmploymentMetadataEvents, parseEmploymentMetadataInput, parseEmploymentMetadataSnapshots,
} from "../src/lib/employment-rule-metadata.ts";

const employeeId = "e6900000-0000-4000-8000-000000000001";
const actorId = "a6900000-0000-4000-8000-000000000001";
const requestId = "96900000-0000-4000-8000-000000000001";
const input = {
  employeeId, effectiveOn: "2024-02-29", employmentBasis: "part_time",
  classification: "  Level 2  ", awardReference: " Award-1 ", contractReference: " ",
  revision: "0", requestId,
};
const event = {
  id: "f6900000-0000-4000-8000-000000000001", employee_id: employeeId, effective_on: "2024-01-01",
  employment_basis: "part_time", classification: null, award_reference: "Award-1", contract_reference: null,
  revision: 1, source: "dated_editor", actor_id: actorId, recorded_at: "2026-11-02T00:00:00Z",
};

test("employment metadata input validates dates, identifiers, lengths and explicit unknowns", () => {
  assert.deepEqual(parseEmploymentMetadataInput(input), {
    employeeId, effectiveOn: "2024-02-29", employmentBasis: "part_time",
    classification: "Level 2", awardReference: "Award-1", contractReference: null, revision: 0, requestId,
  });
  assert.deepEqual(parseEmploymentMetadataInput({
    ...input, employmentBasis: "unknown", classification: "", awardReference: "", contractReference: "",
  }), {
    employeeId, effectiveOn: "2024-02-29", employmentBasis: "unknown",
    classification: null, awardReference: null, contractReference: null, revision: 0, requestId,
  });
  for (const change of [
    { employeeId: "invalid" }, { requestId: null }, { effectiveOn: "2023-02-29" },
    { effectiveOn: "1899-12-31" }, { effectiveOn: "10000-01-01" }, { employmentBasis: "contractor" },
    { classification: "\n" }, { classification: "x".repeat(101) }, { awardReference: "x".repeat(256) },
    { contractReference: null }, { revision: "-1" }, { revision: "01" }, { revision: "2147483647" },
  ]) assert.equal(parseEmploymentMetadataInput({ ...input, ...change }), null, JSON.stringify(change));
  assert.equal(isEmploymentEffectiveDate("2000-02-29"), true);
  assert.equal(isEmploymentEffectiveDate("1900-02-29"), false);
});

test("employment snapshots preserve unknown current details and reject malformed rows", () => {
  const unknown = { employee_id: employeeId, employment_basis: null, effective_on: null, revision: 0 };
  assert.deepEqual(parseEmploymentMetadataSnapshots([unknown]), [unknown]);
  assert.deepEqual(parseEmploymentMetadataSnapshots([{ ...unknown, revision: 1 }]), [{ ...unknown, revision: 1 }]);
  const known = { ...unknown, employment_basis: "casual", effective_on: "2026-01-01", revision: 1 };
  assert.deepEqual(parseEmploymentMetadataSnapshots([known]), [known]);
  for (const rows of [
    null, [known, known], [{ ...known, employee_id: "bad" }], [{ ...known, employment_basis: "invalid" }],
    [{ ...known, effective_on: null }], [{ ...known, revision: 0 }], [{ ...known, revision: 1.5 }],
    [{ ...unknown, effective_on: "2026-01-01" }],
  ]) assert.equal(parseEmploymentMetadataSnapshots(rows), null);
});

test("employment history validates stored rows and selects effective dates and corrections", () => {
  const correction = {
    ...event, id: "f6900000-0000-4000-8000-000000000002", employment_basis: "full_time", revision: 2,
  };
  const future = {
    ...event, id: "f6900000-0000-4000-8000-000000000003", effective_on: "2027-01-01", revision: 3,
  };
  const rows = [event, future, correction];
  assert.deepEqual(parseEmploymentMetadataEvents(rows, employeeId), rows);
  assert.deepEqual(parseEmploymentMetadataEvents(rows, employeeId.toUpperCase()), rows);
  assert.deepEqual(parseEmploymentMetadataEvents(
    [{ ...event, employee_id: employeeId.toUpperCase() }], employeeId,
  ), [event]);
  assert.equal(currentEmploymentMetadata(rows, "2023-12-31"), null);
  assert.equal(currentEmploymentMetadata(rows, "2026-11-02"), correction);
  assert.equal(currentEmploymentMetadata(rows, "2027-01-01"), future);
  assert.throws(() => currentEmploymentMetadata(rows, "invalid"), RangeError);
  for (const rowsToReject of [
    [event, event], [{ ...event, employee_id: actorId }], [{ ...event, classification: "  " }],
    [{ ...event, effective_on: "2025-02-29" }], [{ ...event, source: "other" }],
    [{ ...event, actor_id: null }], [{ ...event, recorded_at: "bad" }],
    [event, { ...correction, revision: 1 }],
  ]) assert.equal(parseEmploymentMetadataEvents(rowsToReject, employeeId), null);
});

test("employment metadata failures distinguish permission, stale, invalid and retry states", () => {
  assert.equal(employmentMetadataFailure("Permission denied"), "permission");
  assert.equal(employmentMetadataFailure("Employment metadata changed; refresh before saving"), "stale");
  assert.equal(employmentMetadataFailure("Invalid employment metadata"), "invalid");
  assert.equal(employmentMetadataFailure("Request identifier already used"), "retry");
  assert.equal(employmentMetadataFailure(undefined), "save");
});
