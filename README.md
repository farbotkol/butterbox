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

Managers can record each worker's eligible job roles in their linked
departments and choose a qualified primary role. An existing free-text job
title does **not** by itself establish a qualification. Removing a secondary
department also removes its role qualifications; change the primary role first
if it belongs to that department. Renaming a primary role updates the employee
profile without changing historical shifts.

On **Departments**, a manager can restrict a role's automatic assignments to
qualified workers. On the roster, **Automatically choose an eligible worker**
selects an active linked worker without an overlapping shift, respecting that
restriction; if none qualifies, no shift is created. This opt-in selection
does not yet check recurring availability, leave, preferred hours or fairness.
Unless a manual restriction is enabled, existing open-shift and explicit
manual assignment behaviour is unchanged.
Managers can separately require qualified workers for manual assignment of a
configured role, including when filling an open shift. This restriction also
applies to automatic selection, while the automatic-only restriction does not
change manual assignment. The check matches the configured role's current name
case-insensitively; unrelated free-text shift titles do not inherit its policy.
Enabling the setting does not retroactively invalidate existing assignments.

Owners can link an existing business member to an employee profile on
**People**; the member's venue and department scope must permit that profile.
Invitations for new members are not yet implemented. Linked active employees
can save multiple weekly time ranges on **Availability**, in the venue's local
time zone. An end time at or before the start is on the following day; equal
times represent 24 hours. An explicitly empty pattern means unavailable all
week, while an unsubmitted pattern is unknown. The roster displays the
complement of saved ranges as unavailable periods, including overnight ranges.
Managers can view availability within their permitted departments but cannot
edit a worker's self-reported pattern. These indicators do not yet block
manual or automatic shift assignment.

On **Availability**, a linked employee can block a date range immediately or
request leave for manager review. Dates are inclusive venue-local days, with
a maximum of 366 days per entry. Date blocks and approved leave override
recurring availability for the entire day; pending leave is shown separately
and does not change the pattern until approved. Employees can cancel their
own date blocks and pending requests and see pending, approved, rejected and
cancelled statuses. A permitted manager can approve or reject pending leave,
or explicitly cancel an approval. Leave and date blocks are displayed on the
roster, but do **not** yet prevent a manager from assigning or publishing a
conflicting shift. No leave or schedule notifications are sent yet.

The weekly roster groups workers by department. Staff linked to multiple
departments appear in each group, with that department's shifts shown in its
row. Archived or no-longer-linked workers remain visible when they have shifts
in the displayed week; a worker's name is replaced by a generic label if the
viewer can no longer access their profile. Week navigation keeps the selected
department or all-departments view. Linked employees can see their own
published shifts in a secondary department while their membership still covers
their profile; this does not grant management permissions for that department.
Use the department headers to collapse or expand groups. The department filter
and collapsed groups are preserved during week navigation and roster changes.
Where a user has access to multiple venues, select the venue on the roster;
only its departments and workers are offered. Managers can edit assigned and
open draft shifts from the grid. Published shifts remain protected from edits
and deletion. Shift validation appears beside the relevant field. Times use
the selected venue's timezone: an earlier or equal time on the same date ends
the following day, and nonexistent daylight-saving clock times are rejected.
When clocks repeat a local time, newly entered values use the later occurrence;
editing an unchanged time preserves its original instant, including any
historical seconds not displayed by the minute-precision form.

**My schedule** shows a linked team member their next published shift and a
mobile-friendly weekly list, including overnight shifts that overlap the
week. It displays the selected venue's local time and address and never
includes unassigned, draft or other people's shifts. Refresh the schedule
after a manager publishes changes. Publication acknowledgements are not yet
available.

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
two temporary users and businesses, checks concurrent roster assignments,
and deletes those fixtures afterward. It
refuses non-loopback URLs, but a loopback connection can still be a tunnel to
another database: use an isolated test project, never a shared or production
one. Without test settings, the normal `npm test` run explicitly skips this
integration test. CI runs both the database suite and the HTTP test on a fresh
local Supabase project.
If the pinned CLI is already installed locally, set `BUTTERBOX_TEST_SUPABASE_CLI`
to its executable path to avoid launching `npx` for the test status check.

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
On memory-constrained machines, `BUTTERBOX_TEST_LOW_MEMORY=yes` runs each
discovered scenario with fresh application and browser processes; all
scenarios still run and any failure remains fatal. To run a focused scenario
instead, set `BUTTERBOX_TEST_GREP` to a Playwright test-name pattern; run the
unfiltered suite separately for regression coverage.

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