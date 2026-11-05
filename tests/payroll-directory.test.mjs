import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PAYROLL_FILTERS, filterAndSortPayrollMappings, parsePayrollDirectoryContext,
  parsePayrollDirectoryFilters, payrollDirectoryHref, payrollEmployeeHref, payrollNewDestinationHref,
  serializePayrollDirectoryFilters,
} from "../src/lib/payroll-directory.ts";

const business = "a0000000-0000-4000-8000-000000000001";
const venue = "b0000000-0000-4000-8000-000000000001";
const connection = "c0000000-0000-4000-8000-000000000001";
const first = "d0000000-0000-4000-8000-000000000001";
const second = "d0000000-0000-4000-8000-000000000002";
const third = "d0000000-0000-4000-8000-000000000003";

test("payroll directory filters have explicit defaults and reject invalid or ambiguous values", () => {
  assert.deepEqual(parsePayrollDirectoryFilters({}), DEFAULT_PAYROLL_FILTERS);
  assert.deepEqual(parsePayrollDirectoryFilters({ q: "  Alex  ", status: "missing", sort: "status", page: "2" }),
    { q: "Alex", status: "missing", sort: "status", page: 2 });
  for (const input of [
    { q: ["Alex", "Sam"] }, { q: "x".repeat(101) }, { q: "bad\nname" },
    { status: "constructor" }, { status: ["mapped", "missing"] }, { sort: "unknown" },
    { page: "0" }, { page: "01" }, { page: "100001" },
  ]) assert.equal(parsePayrollDirectoryFilters(input), null);
});

test("payroll directory context accepts only single known normalized parameters", () => {
  const filters = { q: "Alex & Sam", status: "missing", sort: "payroll-id", page: 3 };
  const context = serializePayrollDirectoryFilters(filters);
  assert.deepEqual(parsePayrollDirectoryContext(context), filters);
  assert.deepEqual(parsePayrollDirectoryContext(""), DEFAULT_PAYROLL_FILTERS);
  for (const value of [
    null, "q=x&q=y", "status=all&status=missing", "business=other", "__proto__=x", "q=%00",
    "q=" + "x".repeat(1025),
  ]) assert.equal(parsePayrollDirectoryContext(value), null);
});

test("payroll URLs retain only safe filter and selected scope context", () => {
  const filters = { q: "Alex & Sam", status: "missing", sort: "status", page: 2 };
  const list = new URL(payrollDirectoryHref(business, venue, connection, filters), "http://localhost");
  assert.equal(list.pathname, "/settings/payroll");
  assert.equal(list.searchParams.get("business"), business);
  assert.equal(list.searchParams.get("venue"), venue);
  assert.equal(list.searchParams.get("connection"), connection);
  assert.equal(list.searchParams.get("q"), "Alex & Sam");
  assert.equal(list.searchParams.get("page"), "2");
  assert.equal(new URL(payrollEmployeeHref(business, venue, connection, filters, first), list).pathname,
    `/settings/payroll/${first}`);
  assert.equal(new URL(payrollNewDestinationHref(business, venue, connection, filters), list).pathname,
    "/settings/payroll/new");
});

test("payroll directory searches only supplied rows and sorts stably without changing exact IDs", () => {
  const rows = [
    { employee_id: third, employee_name: "Alex", external_employee_id: "staff-001", revision: 1 },
    { employee_id: second, employee_name: "Alex", external_employee_id: null, revision: 0 },
    { employee_id: first, employee_name: "Alex", external_employee_id: "Staff-001", revision: 1 },
  ];
  assert.deepEqual(filterAndSortPayrollMappings(rows, DEFAULT_PAYROLL_FILTERS).map((row) => row.employee_id),
    [first, second, third]);
  assert.deepEqual(filterAndSortPayrollMappings(rows, { ...DEFAULT_PAYROLL_FILTERS, status: "missing" })
    .map((row) => row.employee_id), [second]);
  assert.deepEqual(filterAndSortPayrollMappings(rows, { ...DEFAULT_PAYROLL_FILTERS, q: "STAFF-001" })
    .map((row) => row.external_employee_id), ["Staff-001", "staff-001"]);
  assert.deepEqual(filterAndSortPayrollMappings(rows, { ...DEFAULT_PAYROLL_FILTERS, q: second })
    .map((row) => row.employee_id), [second]);
  assert.deepEqual(filterAndSortPayrollMappings(rows, { ...DEFAULT_PAYROLL_FILTERS, sort: "status" })
    .map((row) => row.employee_id), [first, third, second]);
  assert.deepEqual(rows.map((row) => row.employee_id), [third, second, first]);
});
