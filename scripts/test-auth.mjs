import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { cp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { testSupabaseStatus } from "./test-supabase-status.mjs";
import { showcaseStatus, verify } from "./showcase-environment.mjs";

if (process.env.BUTTERBOX_TEST_DISPOSABLE !== "yes") {
  throw new Error(
    "Set BUTTERBOX_TEST_DISPOSABLE=yes only for a disposable local Supabase project.",
  );
}

const workdir = resolve(process.argv[2] ?? ".");
const useDevServer = process.argv[3] === "--dev";
const serveShowcase = process.argv[3] === "--serve-showcase";
const useSplitBuild = process.argv[3] === "--split-build" || serveShowcase;
if (process.argv.length > 4 || (process.argv[3] && !useDevServer && !useSplitBuild)) {
  throw new Error("Usage: node scripts/test-auth.mjs <disposable-workdir> [--dev|--split-build|--serve-showcase]");
}

const testFile = process.env.BUTTERBOX_TEST_FILE ?? "tests/e2e/auth.spec.mjs";
if (!["tests/e2e/auth.spec.mjs", "tests/e2e/showcase.spec.mjs"].includes(testFile)) {
  throw new Error("Select the established auth or isolated showcase browser test file.");
}
const settings = testFile === "tests/e2e/showcase.spec.mjs" ? showcaseStatus(workdir) : testSupabaseStatus(workdir);
if (!settings.API_URL || !settings.MAILPIT_URL || !settings.ANON_KEY || !settings.SERVICE_ROLE_KEY) {
  throw new Error("Local Supabase status is missing API, Mailpit or test authentication settings.");
}
const config = await readFile(resolve(workdir, "supabase/config.toml"), "utf8");
const projectId = /^project_id\s*=\s*"([a-z0-9][a-z0-9_-]*)"\s*(?:#.*)?$/m.exec(config)?.[1];
if (!projectId) throw new Error("The disposable Supabase project ID is missing or invalid.");

function localOrigin(value) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username || parsed.password || parsed.pathname !== "/" ||
    parsed.search || parsed.hash
  ) {
    throw new Error("Authentication tests only permit local HTTP origins.");
  }
  return parsed;
}

const appUrl = localOrigin(process.env.BUTTERBOX_TEST_APP_URL ?? "http://127.0.0.1:3117");
if (serveShowcase) {
  if (testFile !== "tests/e2e/showcase.spec.mjs" || process.env.NEXT_PUBLIC_BUTTERBOX_SHOWCASE !== "true" ||
      appUrl.origin !== "http://127.0.0.1:3137" || process.env.BUTTERBOX_SHOWCASE_WORKDIR !== workdir) {
    throw new Error("Showcase serving requires the explicit isolated showcase file, workdir, labeling and local origin.");
  }
  await verify(workdir);
  const fixture = JSON.parse(await readFile(resolve(workdir, "fixture-state.json"), "utf8"));
  if (fixture.phase !== "seeded" || fixture.simulationOnly !== true) throw new Error("Synthetic fixture is not ready.");
}
localOrigin(settings.API_URL);
localOrigin(settings.MAILPIT_URL);
const host = appUrl.hostname === "[::1]" ? "::1" : appUrl.hostname;
const port = Number(appUrl.port || 80);
const operationsToken = randomBytes(32).toString("base64url");
const testEnv = {
  ...process.env,
  BUTTERBOX_TEST_APP_URL: appUrl.origin,
  BUTTERBOX_TEST_SUPABASE_URL: settings.API_URL,
  BUTTERBOX_TEST_MAIL_URL: settings.MAILPIT_URL,
  BUTTERBOX_TEST_SUPABASE_ANON_KEY: settings.ANON_KEY,
  BUTTERBOX_TEST_SUPABASE_SERVICE_KEY: settings.SERVICE_ROLE_KEY,
  BUTTERBOX_TEST_DB_CONTAINER: `supabase_db_${projectId}`,
  BUTTERBOX_TEST_OPERATIONS_TOKEN: operationsToken,
};

async function checkPortAvailable() {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, host, () => {
      probe.close((error) => (error ? reject(error) : resolvePort()));
    });
  });
}

async function waitForApp(server) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error("The disposable authentication test server exited before becoming ready.");
    }
    try {
      const response = await fetch(new URL("/api/health", appUrl), {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error("The disposable authentication test server did not become ready.", {
    cause: lastError,
  });
}

let server;
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    if (!(await Promise.race([exited.then(() => true), delay(5_000, false)]))) {
      server.kill("SIGKILL");
      await exited;
    }
  }
  server = undefined;
}

try {
  await checkPortAvailable();
  const appEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: settings.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: settings.ANON_KEY,
    NEXT_PUBLIC_SITE_URL: appUrl.origin,
    BUTTERBOX_OPERATIONS_TOKEN: operationsToken,
  };
  if (!useDevServer) {
    const commands = useSplitBuild
      ? [
          ["npm", ["run", "build", "--", "--experimental-build-mode", "compile"]],
          [process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]],
          ["npm", ["run", "build", "--", "--experimental-build-mode", "generate"]],
        ]
      : [["npm", ["run", "build"]]];
    for (const [command, args] of commands) {
      const build = spawnSync(command, args, { stdio: "inherit", env: appEnv });
      if (build.error) throw build.error;
      if (build.status !== 0) {
        throw new Error(`Test application build or type check failed (exit ${build.status}).`);
      }
    }

    await cp("public", ".next/standalone/public", { recursive: true });
    await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  }

  const cli = "node_modules/@playwright/test/cli.js";
  const grepArgs = process.env.BUTTERBOX_TEST_GREP
    ? ["--grep", process.env.BUTTERBOX_TEST_GREP] : [];
  let selections = [testFile];
  if (process.env.BUTTERBOX_TEST_LOW_MEMORY === "yes" && !serveShowcase) {
    const listing = spawnSync(process.execPath, [cli, "test", testFile, "--list", "--reporter=json", ...grepArgs], {
      encoding: "utf8", env: testEnv,
    });
    if (listing.error) throw listing.error;
    if (listing.status !== 0) {
      process.stderr.write(listing.stderr);
      throw new Error(`Could not discover browser tests (exit ${listing.status}, signal ${listing.signal}).`);
    }
    const report = JSON.parse(listing.stdout);
    function collectSpecs(suite) {
      return [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(collectSpecs)];
    }
    const specs = report.suites.flatMap(collectSpecs);
    if (!specs.length || specs.some((spec) => !Number.isInteger(spec.line) || spec.file !== basename(testFile))) {
      throw new Error("Browser test discovery returned no valid test locations.");
    }
    selections = [...new Set(specs.map((spec) => `${testFile}:${spec.line}`))];
    console.log(`Low-memory mode: running ${selections.length} scenarios in separate app and browser processes.`);
  }

  for (const selection of selections) {
    await checkPortAvailable();
    server = useDevServer
      ? spawn(
          process.execPath,
          ["node_modules/next/dist/bin/next", "dev", "--hostname", host, "--port", String(port)],
          { stdio: "inherit", env: { ...appEnv, NODE_ENV: "development" } },
        )
      : spawn(process.execPath, [".next/standalone/server.js"], {
          stdio: "inherit",
          env: { ...appEnv, NODE_ENV: "production", HOSTNAME: host, PORT: String(port) },
        });
    await waitForApp(server);
    const serverExit = once(server, "exit");
    if (serveShowcase) {
      console.log(`Synthetic showcase ready at ${appUrl.origin}; local access only. Stop with Ctrl-C before resetting.`);
      let stop;
      const requested = new Promise((resolveStop) => { stop = resolveStop; });
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        await Promise.race([
          requested,
          serverExit.then(() => { throw new Error("The synthetic showcase server exited unexpectedly."); }),
        ]);
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
      break;
    }
    const browser = spawn(
      process.execPath,
      [cli, "test", selection, ...grepArgs],
      { stdio: "inherit", env: testEnv },
    );
    const browserExit = once(browser, "exit");
    const outcome = await Promise.race([
      browserExit.then(([code, signal]) => ({ source: "browser", code, signal })),
      serverExit.then(([code, signal]) => ({ source: "server", code, signal })),
    ]);
    if (outcome.source === "server") {
      if (browser.exitCode === null && browser.signalCode === null) {
        browser.kill("SIGTERM");
        await browserExit;
      }
      throw new Error(
        `The disposable test server exited during browser tests (code ${outcome.code}, signal ${outcome.signal}).`,
      );
    }
    if (outcome.code !== 0) {
      if (outcome.signal) console.error(`Browser test process terminated by ${outcome.signal}.`);
      process.exitCode = outcome.code ?? 1;
    }
    await stopServer();
  }
} finally {
  await stopServer();
}
