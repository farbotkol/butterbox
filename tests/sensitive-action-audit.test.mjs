import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { auditSources, parseAuditFilters, parseAuditRows } from "../src/lib/sensitive-action-audit.ts";

const business = "b8800000-0000-4000-8000-000000000001";
const actor = "a8800000-0000-4000-8000-000000000001";
const row = {
  id: "e8800000-0000-4000-8000-000000000001", business_id: business, actor_id: actor, actor_kind: "user",
  source_table: "employees", operation: "UPDATE", record_id: "employee-1",
  old_values: { name: "Before", active: true }, new_values: { name: "After", active: false },
  reason: null, occurred_at: "2026-11-02T00:00:00Z",
};

test("audit filters validate exact dates, UTC bounds, identifiers and pagination", () => {
  assert.deepEqual(parseAuditFilters({}), {
    source: undefined, operation: undefined, actor: undefined, from: undefined, to: undefined, page: 1,
  });
  assert.deepEqual(parseAuditFilters({
    source: "employees", operation: "UPDATE", actor, from: "2024-02-29", to: "2024-03-01", page: "2",
  }), {
    source: "employees", operation: "UPDATE", actor, from: "2024-02-29T00:00:00.000Z",
    to: "2024-03-02T00:00:00.000Z", page: 2,
  });
  for (const invalid of [
    { source: "auth.users" }, { source: "__proto__" }, { operation: "TRUNCATE" }, { actor: "not-an-id" },
    { from: "2023-02-29" }, { to: "2024-13-01" }, { from: "2024-03-02", to: "2024-03-01" },
    { page: "0" }, { page: "1.5" }, { page: "-1" }, { page: "01" }, { page: "100001" },
    { source: ["employees"] },
  ]) assert.equal(parseAuditFilters(invalid), null, JSON.stringify(invalid));
});

test("audit row parsing rejects foreign, malformed and inconsistent records", () => {
  assert.deepEqual(parseAuditRows([row], business), [row]);
  for (const source of [
    "attendance_kiosks", "venue_roster_week_events", "attendance_alert_policy_events", "attendance_alert_events",
  ]) {
    assert.deepEqual(parseAuditRows([{ ...row, source_table: source }], business)?.[0].source_table, source);
    assert.equal(parseAuditFilters({ source })?.source, source);
  }
  assert.deepEqual(parseAuditRows([{ ...row, actor_kind: "database", actor_id: null }], business)?.length, 1);
  assert.deepEqual(parseAuditRows([], business), []);
  assert.equal(parseAuditRows(null, business), null);
  assert.equal(parseAuditRows([row, row], business), null);
  for (const change of [
    { business_id: actor }, { id: "invalid" }, { actor_kind: "database" }, { actor_id: null },
    { source_table: "profiles" }, { operation: "TRUNCATE" }, { record_id: "" }, { occurred_at: "invalid" },
    { old_values: null, new_values: null }, { old_values: [] }, { new_values: { nested: { token: "excluded" } } },
  ]) assert.equal(parseAuditRows([{ ...row, ...change }], business), null, JSON.stringify(change));
});

test("every audited source has a documented label and a database audit producer", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261103010000_sensitive_action_audit.sql", import.meta.url), "utf8");
  const loop = migration.split("foreach v_table in array array[")[1].split("] loop")[0];
  const sources = [...loop.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  const metadataMigration = readFileSync(new URL("../supabase/migrations/20261103070000_employment_rule_metadata.sql", import.meta.url), "utf8");
  const metadataTrigger = metadataMigration.match(
    /create trigger sensitive_action_audit\s+after insert on public\.([a-z_]+)\s+for each row execute function public\.record_sensitive_action_audit\(\)/,
  );
  assert.ok(metadataTrigger);
  sources.push(metadataTrigger[1]);
  const rosterMigration = readFileSync(new URL("../supabase/migrations/20261103110000_roster_approval_workflow.sql", import.meta.url), "utf8");
  const rosterTriggers = [...rosterMigration.matchAll(
    /create trigger sensitive_action_audit\s+after insert on public\.([a-z_]+)\s+for each row execute function public\.record_sensitive_action_audit\(\)/g,
  )].map((match) => match[1]);
  assert.deepEqual(rosterTriggers.sort(), ["roster_review_decisions", "roster_review_requests"]);
  sources.push(...rosterTriggers);
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const manualSources = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql"))
    .flatMap((file) => [...readFileSync(new URL(file, migrationDirectory), "utf8")
      .matchAll(/'([a-z_]+)', '(?:INSERT|UPDATE|DELETE)'/g)].map((match) => match[1]));
  assert.ok(manualSources.includes("attendance_kiosks"));
  assert.ok(manualSources.includes("venue_roster_week_events"));
  assert.ok(manualSources.includes("attendance_alert_policy_events"));
  assert.ok(manualSources.includes("attendance_alert_events"));
  assert.deepEqual([...new Set([...sources, ...manualSources])].sort(), Object.keys(auditSources).sort());
  for (const label of Object.values(auditSources)) assert.ok(label.length > 0);
});
