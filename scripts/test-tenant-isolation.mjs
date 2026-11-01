import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (process.env.BUTTERBOX_TEST_DISPOSABLE !== "yes") {
  throw new Error(
    "Set BUTTERBOX_TEST_DISPOSABLE=yes only for a disposable local Supabase project.",
  );
}

const workdir = resolve(process.argv[2] ?? ".");
const status = spawnSync(
  "npx",
  ["--yes", "supabase@2.122.0", "status", "--workdir", workdir, "-o", "json"],
  { encoding: "utf8" },
);
if (status.error) throw status.error;
if (status.status !== 0) {
  throw new Error(
    `Could not read local Supabase status (exit ${status.status}); check Docker and the local project.`,
  );
}

const settings = JSON.parse(status.stdout);
if (!settings.API_URL || !settings.ANON_KEY || !settings.SERVICE_ROLE_KEY) {
  throw new Error("Local Supabase status is missing API or test authentication settings.");
}

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", "tests/tenant-isolation.integration.test.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BUTTERBOX_TEST_SUPABASE_URL: settings.API_URL,
      BUTTERBOX_TEST_SUPABASE_ANON_KEY: settings.ANON_KEY,
      BUTTERBOX_TEST_SUPABASE_SERVICE_KEY: settings.SERVICE_ROLE_KEY,
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
