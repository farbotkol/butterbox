import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { testSupabaseStatus } from "./test-supabase-status.mjs";

if (process.env.BUTTERBOX_TEST_DISPOSABLE !== "yes") {
  throw new Error(
    "Set BUTTERBOX_TEST_DISPOSABLE=yes only for a disposable local Supabase project.",
  );
}

const workdir = resolve(process.argv[2] ?? ".");
const settings = testSupabaseStatus(workdir);
if (!settings.API_URL || !settings.ANON_KEY || !settings.SERVICE_ROLE_KEY) {
  throw new Error("Local Supabase status is missing API or test authentication settings.");
}
const config = readFileSync(resolve(workdir, "supabase/config.toml"), "utf8");
const projectId = /^project_id\s*=\s*"([a-z0-9][a-z0-9_-]*)"\s*(?:#.*)?$/m.exec(config)?.[1];
if (!projectId) throw new Error("The disposable Supabase project ID is missing or invalid.");
const container = `supabase_db_${projectId}`;
if (process.env.BUTTERBOX_TEST_DB_CONTAINER && process.env.BUTTERBOX_TEST_DB_CONTAINER !== container) {
  throw new Error("The requested database container does not match the disposable project.");
}

const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types", "--test", "--test-concurrency=1",
    "tests/tenant-isolation.integration.test.mjs",
    "tests/business-switching.integration.test.mjs",
    ...(process.env.BUTTERBOX_TEST_DB_CONTAINER
      ? [
          "tests/auto-assignment-concurrency.integration.test.mjs",
          "tests/shared-worker-concurrency.integration.test.mjs",
          "tests/roster-copy-concurrency.integration.test.mjs",
          "tests/roster-review-concurrency.integration.test.mjs",
          "tests/roster-quick-changes-concurrency.integration.test.mjs",
          "tests/onboarding-demo-policy.integration.test.mjs",
          "tests/staff-invitations.integration.test.mjs",
          "tests/business-preservation.integration.test.mjs",
          "tests/attendance-concurrency.integration.test.mjs",
          "tests/attendance-corrections-concurrency.integration.test.mjs",
          "tests/employee-correction-requests.integration.test.mjs",
          "tests/attendance-location-concurrency.integration.test.mjs",
          "tests/offline-attendance-concurrency.integration.test.mjs",
          "tests/offline-claim-reconciliation-concurrency.integration.test.mjs",
          "tests/offline-claim-sessions-concurrency.integration.test.mjs",
          "tests/weekly-timesheet.integration.test.mjs",
          "tests/weekly-timesheet-bulk-locks.integration.test.mjs",
          "tests/timesheet-approvals.integration.test.mjs",
          "tests/payroll-period-finalisation.integration.test.mjs",
          "tests/employment-rule-metadata-concurrency.integration.test.mjs",
          "tests/shift-offers-concurrency.integration.test.mjs",
          "tests/shift-swaps-concurrency.integration.test.mjs",
        ] : []),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BUTTERBOX_TEST_SUPABASE_URL: settings.API_URL,
      BUTTERBOX_TEST_SUPABASE_ANON_KEY: settings.ANON_KEY,
      BUTTERBOX_TEST_SUPABASE_SERVICE_KEY: settings.SERVICE_ROLE_KEY,
      BUTTERBOX_TEST_DB_CONTAINER: container,
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
