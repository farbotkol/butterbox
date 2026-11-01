import assert from "node:assert/strict";
import { test } from "node:test";
import { isRosterWeek, rosterCopyError } from "../src/lib/roster-copy.ts";

test("roster copy accepts only real Monday dates", () => {
  for (const value of ["2032-03-29", "2024-02-26", "0001-01-01"]) {
    assert.equal(isRosterWeek(value), true, value);
  }
  for (const value of ["", "2032-03-30", "2032-02-30", "0000-01-03", "2032-03-29x", "2032-3-29"]) {
    assert.equal(isRosterWeek(value), false, value);
  }
});

test("copy failures distinguish known rollbacks from uncertain results", () => {
  assert.match(rosterCopyError("P0001", "An employee is unavailable for a copied shift"), /No shifts were copied/);
  assert.match(rosterCopyError("P0001", "A copied shift overlaps an existing shift"), /overlaps/);
  assert.match(rosterCopyError("P0001", "A source shift crosses a clock change and cannot be copied safely"), /clock change/);
  assert.match(rosterCopyError("P0001", "A copied shift crosses a clock change and cannot be copied safely"), /clock change/);
  assert.match(rosterCopyError("P0001", "Invalid shift duration"), /longer than 24 hours/);
  assert.match(rosterCopyError("P0001", "Job role is inactive"), /inactive/);
  assert.match(rosterCopyError("P0001", "Request identifier already used"), /different dates/);
  assert.match(rosterCopyError("NETWORK", "An employee is unavailable for a copied shift"), /couldn't confirm/);
  assert.match(rosterCopyError("P0001", "unrecognised failure"), /couldn't confirm/);
});
