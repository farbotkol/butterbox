import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function testSupabaseStatus(workdir, env = process.env) {
  // Written by scripts/test-env.mjs for its isolated runner container, which has no Docker or Supabase CLI access.
  if (env.BUTTERBOX_TEST_SUPABASE_STATUS_FILE) {
    return JSON.parse(readFileSync(env.BUTTERBOX_TEST_SUPABASE_STATUS_FILE, "utf8"));
  }
  const executable = env.BUTTERBOX_TEST_SUPABASE_CLI;
  const command = executable || "npx";
  const args = executable ? [] : ["--yes", "supabase@2.122.0"];
  args.push("status", "--workdir", workdir, "-o", "json");
  const status = spawnSync(command, args, { encoding: "utf8", env });
  if (status.error) throw status.error;
  if (status.status !== 0) {
    throw new Error(
      `Could not read local Supabase status (exit ${status.status}, signal ${status.signal}); check Docker and the local project.`,
    );
  }
  return JSON.parse(status.stdout);
}
