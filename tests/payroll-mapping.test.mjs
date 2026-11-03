import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPayrollProvider, parsePayrollConnections, parsePayrollEmployeeMappings,
  payrollMappingFailure, payrollMappingRevision, payrollMappingText,
} from "../src/lib/payroll-mapping.ts";

const id = "e7600000-0000-4000-8000-000000000001";
test("payroll mapping inputs preserve explicit case-sensitive IDs and reject malformed values", () => {
  assert.equal(payrollMappingText(" Staff-001 ", 255), "Staff-001");
  assert.equal(payrollMappingText("a\nb", 255), null);
  assert.equal(payrollMappingText(" ", 255), null);
  assert.equal(payrollMappingText("x".repeat(256), 255), null);
  assert.equal(payrollMappingText(String.fromCodePoint(0x1f600).repeat(128), 255), null);
  assert.equal(payrollMappingRevision("0"), 0);
  assert.equal(payrollMappingRevision("2147483646"), 2147483646);
  for (const value of ["01", "1.5", "-1", "2147483647", null]) {
    assert.equal(payrollMappingRevision(value), null);
  }
  assert.equal(isPayrollProvider("xero"), true);
  assert.equal(isPayrollProvider("toString"), false);
});

test("mapping destinations and employee rows reject inconsistent or duplicate data", () => {
  const connection = { id, provider: "xero", account_id: "org-1", name: "Cafe payroll" };
  assert.deepEqual(parsePayrollConnections([connection]), [connection]);
  assert.equal(parsePayrollConnections([connection, connection]), null);
  assert.equal(parsePayrollConnections([{ ...connection, account_id: " org-1 " }]), null);
  const unmapped = { employee_id: id, employee_name: "Same Name", external_employee_id: null, revision: 0 };
  assert.deepEqual(parsePayrollEmployeeMappings([unmapped]), [unmapped]);
  assert.equal(parsePayrollEmployeeMappings([{ ...unmapped, external_employee_id: "Staff-1" }]), null);
  const mapped = { ...unmapped, external_employee_id: "Staff-1", revision: 1 };
  assert.deepEqual(parsePayrollEmployeeMappings([mapped]), [mapped]);
  assert.equal(parsePayrollEmployeeMappings([{ ...mapped, revision: 2147483647 }])?.[0].revision, 2147483647);
  assert.equal(parsePayrollEmployeeMappings([mapped, mapped]), null);
  assert.equal(parsePayrollEmployeeMappings([mapped, { ...mapped, employee_id: id.replace(/1$/, "2") }]), null);
  assert.equal(parsePayrollEmployeeMappings([{ ...mapped, revision: -1 }]), null);
});

test("mapping failures distinguish duplicate IDs, stale edits, scope and unconfirmed saves", () => {
  assert.equal(payrollMappingFailure("Payroll employee ID is already mapped to another employee"), "duplicate");
  assert.equal(payrollMappingFailure("Payroll mapping changed; refresh before saving"), "stale");
  assert.equal(payrollMappingFailure("Permission denied"), "permission");
  assert.equal(payrollMappingFailure("Confirm payroll destination"), "confirm");
  assert.equal(payrollMappingFailure("Confirm mapping removal"), "confirm");
  assert.equal(payrollMappingFailure(undefined), "save");
});
