#!/usr/bin/env node
// Restricted stand-in for the docker CLI inside the isolated test runner. The runner has no Docker socket; this
// answers only the label/port lookups and psql sessions made by tests/helpers/disposable-database.mjs, and only for
// the fixed disposable test project. Everything else fails like a missing object.
import { spawn } from "node:child_process";

const project = process.env.BUTTERBOX_RUNNER_PROJECT;
const apiPort = process.env.BUTTERBOX_RUNNER_API_PORT;
const dbPort = process.env.BUTTERBOX_RUNNER_DB_PORT;
const refuse = (message, code = 1) => {
  process.stderr.write(`docker (isolated test runner): ${message}\n`);
  process.exit(code);
};
if (!/^[a-z0-9][a-z0-9_-]*$/.test(project ?? "") || !/^\d+$/.test(apiPort ?? "") || !/^\d+$/.test(dbPort ?? "")) {
  refuse("runner project settings are missing", 125);
}

const [command, ...args] = process.argv.slice(2);
if (command === "inspect") {
  if (args.length !== 3 || args[0] !== "--format") refuse("only 'inspect --format <template> <name>' is supported", 125);
  const [, format, name] = args;
  if (name === `supabase_db_${project}` && format.includes('"com.supabase.cli.project"')) {
    process.stdout.write(`${project}\n`);
  } else if (name === `supabase_kong_${project}` && format.includes('"8000/tcp"')) {
    process.stdout.write(`${apiPort}\n`);
  } else {
    refuse(`Error: No such object: ${name}`);
  }
} else if (command === "exec") {
  const rest = [...args];
  while (rest[0] === "-i") rest.shift();
  const [name, program, ...psqlArgs] = rest;
  if (name !== `supabase_db_${project}`) refuse(`Error: No such container: ${name}`);
  if (program !== "psql") refuse("only psql may be executed in the disposable database", 126);
  const child = spawn("psql", ["-h", "127.0.0.1", "-p", dbPort, ...psqlArgs], {
    stdio: "inherit", env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "5" },
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => refuse(error.message, 127));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else {
  refuse(`'${command ?? ""}' is not available in the isolated test runner`, 125);
}
