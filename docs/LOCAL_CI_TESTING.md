# Local CI testing

Butterbox's GitHub Actions `Verify` workflow has two jobs:

- `verify`: unit tests, lint, a production build and container health;
- `database`: pgTAP, authenticated tenant isolation and the complete Playwright browser suite, all against a
  fresh local Supabase project.

This guide describes how to reproduce, diagnose and fix those failures locally, quickly and without touching any
other database. It is meant for developers and for the autonomous agent controller. Do not use repeated pushes
as a debugging loop.

The tooling is:

| Command | What it runs | Typical time |
| --- | --- | --- |
| `npm run test:fast` | Unit tests, ESLint, TypeScript and (when `tools/agent-controller/` changed) the controller tests | 1–4 min |
| `npm run test:auth:focused -- --test tests/e2e/auth.spec.mjs:<line>` | Selected Playwright tests on a freshly reset disposable database and a production build | 8–16 min |
| `npm run test:ci:local` | The complete CI `database` job: pgTAP, tenant isolation and every browser test | 45–70 min |
| `BUTTERBOX_TEST_DISPOSABLE=yes npm run test:auth -- <project>` | The existing direct browser-suite command (unchanged) | as before |

## Fast developer tests

```sh
npm run test:fast                    # unit + lint + types (+ controller tests when the controller changed)
npm run test:fast -- --only=unit     # only selected steps: unit, controller, lint, types
npm run test:fast -- --skip=lint
npm run test:fast -- --only=controller
```

It runs on the Node.js version you have; CI uses 24.11.1. ESLint uses a cache under `node_modules/.cache`, so it
does not change the tracked `.eslintcache`. It needs no database, Docker or browser.

## The disposable test environment

Database and browser tests run in a dedicated environment that matches the CI `database` job:

- **A dedicated Colima VM, `butterbox-ci`.** It is separate from the Docker or Colima instance that runs the
  development stack (ports 5432x) and the synthetic showcase or public demo (ports 5742x).
  - It mounts **only** `/Users/Shared/butterbox-test-runs`. Your home folder and checkouts are not visible.
  - Its published ports bind to the VM's own loopback.
  - Firewall rules in the VM (`DOCKER-USER`) reject container traffic to `10/8`, `100.64/10`, `169.254/16` and
    `192.168/16`. These ranges include the Mac host gateway, where the development and showcase stacks listen,
    and the local network.
- **A fixed disposable Supabase project, `butterbox-citest`.**
  - Ports: API `59421`, database `59422`, shadow `59420`, Mailpit `59424`; Studio is disabled.
  - It uses the Supabase CLI 2.122.0, with the same excluded services as CI.
  - Each run copies this checkout's `supabase/migrations` and `supabase/tests` and resets the database first,
    so no data persists between runs.
  - The orchestrator refuses to run if the VM's Docker daemon hosts any other Supabase project.
- **An isolated runner container** (`tools/test-runner/`).
  - It uses Node.js 24.11.1, Chromium from the locked Playwright version and a PostgreSQL 17 client.
  - It runs as a non-root user with all capabilities dropped and `no-new-privileges`, limited to 2 CPUs, 3 GB of
    memory and 4096 processes.
  - It has no Docker socket, credentials or host files: only a read-only snapshot of the code under test, the
    test project's local keys and an artifacts folder.
  - It runs `npm ci`, then the same commands as CI: `supabase test db`, `scripts/test-tenant-isolation.mjs` and
    `npm run test:auth` (a production `next build` followed by Playwright).
  - Database checks that CI performs with `docker exec … psql` go through a restricted shim
    (`tools/test-runner/docker-shim.mjs`). It only allows `docker exec -i supabase_db_butterbox-citest psql …`
    and label/port checks for that project.
- **Limits and cleanup.**
  - One run at a time, serialized by a lock; stale locks of dead runs are released.
  - Each suite has a time limit (`--timeout-minutes`, at most twice the suite default).
  - `Ctrl-C` or `SIGTERM` stops the runner container. `npm run test:env:cleanup` removes interrupted runs,
    stale locks and orphaned containers. The 20 newest run folders (and 20 newest agent runs) are kept.

The environment never connects to the public demo, the showcase, the development database or production. The
generated config contains only the CLI's well-known local development keys for this disposable project.

### One-time setup (macOS)

```sh
brew install colima docker            # Docker CLI and Colima; Docker Desktop is not needed
npx playwright install chromium       # only needed for --runner host
npm run test:env:up                   # creates/starts the butterbox-ci VM and the disposable project
```

The first `up` downloads the VM image and the Supabase images. The first run also builds the runner image
(about 5 minutes). Later runs reuse them. Optionally set
`BUTTERBOX_TEST_SUPABASE_CLI=/path/to/supabase` to a pinned 2.122.0 binary to avoid `npx`.

### Running suites

```sh
# Selected browser tests: by location (repeatable, up to 20) and/or Playwright title pattern.
npm run test:auth:focused -- --test tests/e2e/auth.spec.mjs:7137 --test tests/e2e/auth.spec.mjs:11554
npm run test:auth:focused -- --grep "venue geofences"
npm run test:auth:focused -- --grep "venue geofences" --repeat 5   # reproduce a flaky test

node scripts/test-env.mjs run db          # pgTAP only
node scripts/test-env.mjs run tenant      # tenant-isolation HTTP tests
node scripts/test-env.mjs run auth        # the complete browser suite
npm run test:ci:local                     # the complete CI database job (db + tenant + auth)

npm run test:env:status                   # VM, project, lock and recent runs
npm run test:env:cleanup                  # interrupted runs, stale locks, orphaned containers
npm run test:env:down                     # delete the test project (add -- --vm to stop the VM)
```

All selected tests run in **one** batch: one database reset, one production build and one Playwright process.

- The default `--runner container` runs any code, including agent-written code, in the isolated runner.
- `--runner host` runs this trusted checkout directly on your Mac against the same disposable project. It is
  faster and needs Node.js 24 (for example `npx node@24 scripts/test-env.mjs run …`).
- `--source <dir>` tests another working tree. It requires the container runner.

### Results and diagnostics

Every run writes to `/Users/Shared/butterbox-test-runs/runs/<run-id>/artifacts/` (or `--artifacts <dir>`):

- `summary.md` (also printed at the end) lists each failing test with:
  - its title and `file:line` location;
  - the assertion error and the source excerpt;
  - the paths to its screenshot, `error-context.md` (the page's accessibility snapshot at failure) and
    `trace.zip`;
  - a ready-to-paste rerun command.
- `result.json` has the same information in machine-readable form, plus step timings and the Playwright counts.
- `run.log` is the complete output. `playwright/` contains the JSON reports and per-test outputs. Open a trace
  with `npx playwright show-trace <path>/trace.zip`.

The exit codes are 0 for passed, 1 for failed, 2 for invalid usage, 3 for an environment error, 124 for a timeout
and 130 for an interrupted run.

### Recommended workflow

1. `npm run test:fast` while editing.
2. Reproduce a CI browser failure with `npm run test:auth:focused -- --test <file:line>` before changing code.
   Use the location printed by CI (`✘ … tests/e2e/auth.spec.mjs:<line>`). Lines move when the spec changes, so
   use `--grep "<title>"` if needed.
3. Fix it, then rerun the same focused selection until it passes. Use `--repeat` for timing-sensitive tests.
4. Before pushing a change with database or browser impact, run the affected complete suite (`run db`,
   `run tenant` or `run auth`), or `npm run test:ci:local`.
5. Push. The complete `Verify` workflow still gates every merge.

## Autonomous agents: the controller test broker

Autonomous agents run inside Copilot CLI's macOS sandbox. It denies Docker, localhost, Supabase and the home
folder, and that sandbox is **not** relaxed. Instead, when `autonomous.testBroker.enabled` is set, the controller
runs a **test broker** while each agent runs (`tools/agent-controller/test-broker.mjs`):

- The agent runs `node <task>/bin/request-tests.mjs <suite> [--test …] [--grep …] [--repeat n]`. The helper is
  controller-owned and read-only to the agent. It writes a small JSON request into `<task>/test-requests/`, the
  only extra folder the agent may write.
- The controller validates the request:
  - it must be a regular file of at most 4 KB;
  - only the suites `auth-focused`, `auth`, `db`, `tenant` and `database` are allowed;
  - test locations must be `tests/e2e/auth.spec.mjs:<line>`, with a single-line pattern and a repeat count of
    1–10;
  - no other fields are accepted.

  The controller then runs `scripts/test-env.mjs` from its own trusted checkout, with the **container runner**
  and the task's working tree as `--source`. Nothing is passed to a shell, and the environment contains no
  tokens or Docker settings.
- Results appear in `<task>/test-results/<id>.json`, which is read-only to the agent. The helper waits for the
  result and prints the summary, failures and artifact paths. Artifacts are kept under
  `/Users/Shared/butterbox-test-runs/agent/`.
- Each agent invocation may make at most `maxRuns` runs (default 6, at most 20); runs are serialized. When the
  agent finishes or times out, queued requests are cancelled and a running suite is stopped. The runs are
  recorded in the task's audit history (`agent_test_runs`).
- CI repair prompts list the failing Playwright locations from the GitHub Actions log (`focusedTests`). They
  instruct the agent to reproduce each failure locally, fix it and rerun the same focused tests.

The broker is opt-in. See `tools/agent-controller/README.md` for configuration. Both the broker and
`request-tests.mjs` must exist in the controller's checkout, or the controller refuses to start
(`test_broker_unavailable`).

### Residual risks

- Code under test, including agent-written code, can reach **public** internet hosts from the runner container.
  `npm ci` and the Next.js build (Google Fonts) need this, just as on GitHub Actions. It cannot reach private
  networks, the Mac or other local stacks, and the container holds no credentials. However, it could send the
  working tree it is testing to a public host. Restricting this would need an allowlisting egress proxy.
- The VM's own SSH port is reachable from containers but requires the VM's private key, which is not mounted.
- The npm cache volume is shared between runs. npm verifies package integrity against `package-lock.json`.

## GitHub Actions

- `.github/workflows/ci.yml` (`Verify`) is the complete merge gate and still runs every check. Changes:
  - Pushes run only for `main` and the workstream branches. Task branches are verified once, by their pull
    request run.
  - Agent status checkpoints (`docs/agent-status/**` only) do not start a run.
  - A newer commit on the same pull request cancels its superseded in-progress run.
  - Browser failures upload screenshots, traces and `error-context.md` as the `playwright-failures-*` artifact
    (kept 7 days).
- `.github/workflows/focused-browser.yml` (`Focused browser tests`) runs the same
  `node scripts/test-env.mjs run auth-focused --runner host …` command on a GitHub runner.
  - It is available through **Run workflow** with `tests`, `grep` and `repeat` inputs.
  - Pull requests that change the test tooling run it automatically with a small default selection.
  - It is a diagnostic aid, not a merge gate.
