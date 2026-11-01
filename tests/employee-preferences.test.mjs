import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEmployeePreferences } from "../src/lib/employee-preferences.ts";

const choices = { notifyScheduleEmail: "true", notifyLeaveEmail: "false" };

test("preferences distinguish unspecified, zero and quarter-hour values", () => {
  assert.deepEqual(parseEmployeePreferences({ ...choices, preferredWeeklyHours: "" }), {
    valid: true, preferredWeeklyHours: null, notifyScheduleEmail: true, notifyLeaveEmail: false,
  });
  assert.deepEqual(parseEmployeePreferences({ ...choices, preferredWeeklyHours: "0" }), {
    valid: true, preferredWeeklyHours: 0, notifyScheduleEmail: true, notifyLeaveEmail: false,
  });
  assert.deepEqual(parseEmployeePreferences({ ...choices, preferredWeeklyHours: " 24.75 " }), {
    valid: true, preferredWeeklyHours: 24.75, notifyScheduleEmail: true, notifyLeaveEmail: false,
  });
  assert.equal(parseEmployeePreferences({ ...choices, preferredWeeklyHours: "168" }).valid, true);
});

test("preferences reject invalid hours and implicit notification choices", () => {
  for (const preferredWeeklyHours of ["-1", "168.25", "0.1", "NaN", "Infinity", "1e2", "1.001"]) {
    assert.deepEqual(parseEmployeePreferences({ ...choices, preferredWeeklyHours }), { valid: false });
  }
  assert.deepEqual(parseEmployeePreferences({
    preferredWeeklyHours: "8", notifyScheduleEmail: "", notifyLeaveEmail: "true",
  }), { valid: false });
  assert.deepEqual(parseEmployeePreferences({
    preferredWeeklyHours: "8", notifyScheduleEmail: "false", notifyLeaveEmail: "",
  }), { valid: false });
});
