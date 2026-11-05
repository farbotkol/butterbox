import assert from "node:assert/strict";
import { test } from "node:test";
import { groupRosterEmployees } from "../src/lib/roster-groups.ts";

const departments = [
  { id: "boh", name: "Back of House", active: true },
  { id: "foh", name: "Front of House", active: true },
];
const employees = [
  { id: "shared", name: "Shared", department_id: "foh", role_title: "Server", active: true },
  { id: "archived", name: "Archived", department_id: "foh", role_title: "Server", active: false },
];

test("a worker linked to multiple departments is grouped in each one", () => {
  const groups = groupRosterEmployees(departments, employees, [
    { employee_id: "shared", department_id: "foh" },
    { employee_id: "shared", department_id: "boh" },
  ], []);
  assert.deepEqual(groups.map((group) => [group.department.id, group.employees.map((e) => e.id)]), [
    ["boh", ["shared"]],
    ["foh", ["shared"]],
  ]);
});

test("assigned shifts keep archived and no-longer-linked workers in their department", () => {
  const groups = groupRosterEmployees(departments, employees, [], [
    { employee_id: "shared", department_id: "boh" },
    { employee_id: "archived", department_id: "foh" },
    { employee_id: "missing", department_id: "foh" },
    { employee_id: null, department_id: "foh" },
  ]);
  assert.deepEqual(groups.map((group) => [group.department.id, group.employees.map((e) => e.id)]), [
    ["boh", ["shared"]],
    ["foh", ["archived", "missing"]],
  ]);
  assert.equal(groups[1].employees[1].name, "Former team member");
});

test("only permitted departments are grouped and inactive staff without shifts are hidden", () => {
  const groups = groupRosterEmployees([departments[1]], employees, [
    { employee_id: "archived", department_id: "foh" },
    { employee_id: "shared", department_id: "boh" },
  ], [{ employee_id: "shared", department_id: "boh" }]);
  assert.deepEqual(groups, []);
});
