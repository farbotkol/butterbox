# Butterbox

Butterbox is a Next.js application backed by Supabase. The product backlog is
in [BACKLOG_INDEX.csv](BACKLOG_INDEX.csv); work in progress is recorded in
[IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

## Local development

Use Node.js 24 and Docker. From a clean checkout:

```sh
npm ci
cp .env.example .env.local
npx --yes supabase@2.122.0 start
```

Set the three values in `.env.local` to the local Supabase API URL, its
publishable/anon key, and the application origin (normally
`http://localhost:3000`). `npx --yes supabase@2.122.0 status` displays the
local values; don't paste its output into issues or commit `.env.local`.
Never put a Supabase `service_role` or secret key in a `NEXT_PUBLIC_` variable.
The local Supabase configuration requires email confirmation. Open the local
Mailpit inbox shown by `supabase status` to use test confirmation and reset
links. Configure confirmation and allowed redirect URLs separately for each
deployed environment.

After confirming an account, first-time owners can save partial business and
venue details and resume setup later. The first venue requires an address and
timezone; completing setup creates the owner membership atomically.

Owners can open **Permissions** to assign roles to existing business members.
Owners are business-wide; general managers have a venue; FOH/BOH managers and
employees have a venue and department. A business must retain at least one
owner. Joining new members by invitation is a separate, not-yet-delivered
workflow. Apply the scoped-membership migration before using this screen.

Managers can open **People** to add and edit employee names, preferred contact
emails, job titles and employment types. Archive rather than delete former
staff: the profile and existing shifts remain, while new assignment is blocked.
Profile department associations cannot be moved through this form because
existing shifts retain their original department references.
The directory searches names and filters by permitted venue, department,
job title and active/archive status. Select **All roles** and **All departments**
when switching venues if the previous filters are not available there.

```sh
npm run dev
npm test
npm run lint
npm run build
npx --yes supabase@2.122.0 test db --local
```

The Supabase CLI applies the local migrations when starting a new local
project. Database tests require Docker and use the local database. Use a
separate Supabase project and credentials for each environment; do not point
local tests or destructive reset commands at staging or production.

For the HTTP tenant-isolation test, start a **disposable** local Supabase
project in its own work directory, with distinct ports and the repository's
migrations applied. Then run:

```sh
BUTTERBOX_TEST_DISPOSABLE=yes node scripts/test-tenant-isolation.mjs /path/to/disposable-project
```

The test obtains the local keys from the CLI without printing them, creates
two temporary users and businesses, and deletes those fixtures afterward. It
refuses non-loopback URLs, but a loopback connection can still be a tunnel to
another database: use an isolated test project, never a shared or production
one. Without test settings, the normal `npm test` run explicitly skips this
integration test. CI runs both the database suite and the HTTP test on a fresh
local Supabase project.

To exercise authentication/recovery, resumable setup, permission assignment,
employee profiles and directory filters in a real browser, install Chromium and its
platform dependencies, then run against a **disposable** local project:

```sh
npx playwright install chromium
BUTTERBOX_TEST_DISPOSABLE=yes npm run test:auth -- /path/to/disposable-project
```

The command builds the application with the test project's public settings,
starts it at `http://127.0.0.1:3117`, runs the browser tests and stops its
server. It modifies the local `.next` build output and requires that port to
be free. The Supabase project must have email confirmation enabled, Mailpit
running and the application callback origin on its redirect allowlist. It
creates and removes test users and businesses; never use a shared database or
a loopback tunnel to a non-disposable project. Set `BUTTERBOX_TEST_APP_URL` to
another loopback origin if needed, and allow that origin in Supabase first.
For a lower-memory local functional run, append `--dev` to use a disposable
development server instead. This does not replace the production build check.
Alternatively, append `--split-build` to use Next.js's experimental separate
compile and generate phases with an explicit TypeScript check between them.
On memory-constrained machines, `BUTTERBOX_TEST_LOW_MEMORY=yes` limits the
number of Chromium renderer processes without changing the tested behavior.

## Staging and production

Apply reviewed migrations to the appropriate Supabase project using your
deployment process. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin
and configure the matching authentication redirect URLs in Supabase. Next.js
inlines `NEXT_PUBLIC_` values during the build, so build a separate image for
each environment with that environment's **public** settings:

```sh
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --build-arg NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" \
  -t butterbox .
docker run --rm -p 3000:3000 butterbox
```

The container runs as a non-root user and checks `/api/health` automatically.
That endpoint reports **process liveness only**: it does not check Supabase,
migrations, authentication, or deployment readiness. Configure your platform
to use the container health status (or `GET /api/health`) for liveness, and
monitor external dependencies separately. Put a reverse proxy in front of a
public self-hosted deployment.

CI installs from the lockfile, runs tests, lint and a production build, then
builds the image and waits for its health check.