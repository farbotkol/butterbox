import { spawnSync } from "node:child_process";

export function testSupabaseStatus(workdir, env = process.env) {
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
