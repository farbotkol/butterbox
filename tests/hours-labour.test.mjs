import assert from "node:assert/strict";
import { test } from "node:test";
import {
  illustrativeCostCents, parseHoursLabour, parseIllustrativeRate, parseReportFilter, totalHoursLabour,
} from "../src/lib/hours-labour.ts";
import { timesheetWeek } from "../src/lib/weekly-timesheet.ts";

const scope = {
  businessId: "b9120000-0000-4000-8000-000000000001", week: "2024-09-30", venueId: null, departmentId: null,
};
const row = {
  business_id: scope.businessId, week_start: scope.week,
  venue_id: "c9120000-0000-4000-8000-000000000001", venue_name: "Sydney", venue_timezone: "Australia/Sydney",
  department_id: "d9120000-0000-4000-8000-000000000001", department_name: "FOH",
  scheduled_seconds: 39600, scheduled_shifts: 3, approved_worked_seconds: 36900, approved_paid_seconds: 37800,
  approved_entries: 3, excluded_entries: 4, invalid_entries: 1,
};

test("hours report validates rows and tenant, venue, department and week scope", () => {
  assert.deepEqual(parseHoursLabour([row], scope), [row]);
  assert.deepEqual(parseHoursLabour([], scope), []);
  for (const changed of [
    { business_id: "b9120000-0000-4000-8000-000000000002" }, { week_start: "2024-10-07" },
    { venue_id: "bad" }, { department_id: "" }, { venue_timezone: "Invalid/Timezone" },
    { venue_name: " " }, { department_name: null },
  ]) assert.equal(parseHoursLabour([{ ...row, ...changed }], scope), null);
  assert.equal(parseHoursLabour([row], { ...scope, venueId: "c9120000-0000-4000-8000-000000000002" }), null);
  assert.equal(parseHoursLabour([row], { ...scope, departmentId: "d9120000-0000-4000-8000-000000000002" }), null);
  assert.equal(parseHoursLabour([row, row], scope), null);
  assert.equal(parseHoursLabour(null, scope), null);
});

test("report rejects invalid, inconsistent and unsafe aggregates", () => {
  for (const changed of [
    { scheduled_seconds: -1 }, { approved_paid_seconds: 1 }, { invalid_entries: 5 },
    { approved_entries: 0 }, { scheduled_shifts: 0 }, { excluded_entries: 1.5 },
    { approved_worked_seconds: "36900" }, { scheduled_seconds: Infinity },
    { scheduled_seconds: Number.MAX_SAFE_INTEGER }, { approved_entries: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(parseHoursLabour([{ ...row, ...changed }], scope), null);
  const empty = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? 0 : value]));
  assert.deepEqual(parseHoursLabour([empty], scope), [empty]);
});

test("report totals preserve microseconds and reject aggregate overflow", () => {
  const second = { ...row, department_id: "d9120000-0000-4000-8000-000000000002",
    scheduled_seconds: 1.000001, approved_worked_seconds: 2.000001, approved_paid_seconds: 2.000002 };
  assert.deepEqual(totalHoursLabour([row, second]), {
    scheduled_seconds: 39601.000001, approved_worked_seconds: 36902.000001, approved_paid_seconds: 37802.000002,
    scheduled_shifts: 6, approved_entries: 6, excluded_entries: 8, invalid_entries: 2,
  });
  assert.equal(totalHoursLabour([{ ...row, approved_entries: Number.MAX_SAFE_INTEGER }, row]), null);
  const large = { ...row, scheduled_seconds: 5_000_000_000 };
  assert.equal(totalHoursLabour([large, large]), null);
  assert.equal(totalHoursLabour([]).scheduled_seconds, 0);
});

test("filters accept singular identifiers and normalize dates to the timesheet week", () => {
  assert.equal(parseReportFilter(undefined), null);
  assert.equal(parseReportFilter(""), null);
  assert.equal(parseReportFilter(row.venue_id), row.venue_id);
  for (const invalid of ["bad", [row.venue_id], null, 1]) assert.equal(parseReportFilter(invalid), undefined);
  assert.equal(timesheetWeek("2024-10-06", "Australia/Sydney"), "2024-09-30");
  assert.equal(timesheetWeek("2024-10-07", "Australia/Sydney"), "2024-10-07");
  assert.equal(timesheetWeek("2024-02-30", "Australia/Sydney"), null);
  assert.equal(timesheetWeek(["2024-09-30"], "UTC"), null);
});

test("optional illustrative AUD rates are bounded and strictly parsed", () => {
  assert.equal(parseIllustrativeRate(undefined), null);
  assert.equal(parseIllustrativeRate(""), null);
  assert.equal(parseIllustrativeRate("0"), 0);
  assert.equal(parseIllustrativeRate("30.5"), 3050);
  assert.equal(parseIllustrativeRate("10000.00"), 1_000_000);
  for (const invalid of ["-1", "1.001", "10000.01", "1e3", " 30", "01", ["30"], null]) {
    assert.equal(parseIllustrativeRate(invalid), undefined);
  }
});

test("illustrative costs use exact duration and half-up cents, not actual payroll", () => {
  assert.equal(illustrativeCostCents(37800, 3000), 31500);
  assert.equal(illustrativeCostCents(18, 100), 1);
  assert.equal(illustrativeCostCents(17.999999, 100), 0);
  assert.equal(illustrativeCostCents(3600, 0), 0);
  assert.equal(illustrativeCostCents(-1, 100), null);
  assert.equal(illustrativeCostCents(3600, 1.5), null);
  assert.equal(illustrativeCostCents(3600, 1_000_001), null);
  assert.equal(illustrativeCostCents(Number.MAX_SAFE_INTEGER, 100), null);
});
