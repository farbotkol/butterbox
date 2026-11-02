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
deployed environment. Staff invitation emails use Supabase Auth and require
the application origin's `/invitations/**` path on its redirect allowlist.
Configure a working email provider and appropriate Auth rate limits before
using this workflow outside a local test project.

After confirming an account, first-time owners can save partial business and
venue details and resume setup later. The first venue requires an address and
timezone; completing setup creates the owner membership atomically.
The owner's dashboard includes a business, venue, staff, draft-shift and
publication checklist, with links and brief guidance for the next steps.

Fictional sample staff and shifts are disabled by default in every database.
Only a database operator can enable them; ordinary application accounts and
the Supabase service role cannot change the policy. To use samples, first
verify that the connected database is an isolated local test instance with no
live data, then, as its database owner only, run:

```sql
update public.demo_seed_policy set enabled = true where singleton;
```

Never enable this policy in production or any environment containing real
customer data. Enabling it allows new test workspaces to opt into fictional
staff and private draft shifts; it does not seed existing workspaces. Set
`enabled = false` again when finished. Applying the onboarding migration does
not remove sample data that was created before this safeguard.

Owners can configure each venue's latitude, longitude and clocking radius on
**Departments**. Coordinates accept up to six meaningful decimal places and
the radius is 1–10,000 metres; clearing all three fields removes the
configuration after verification is disabled. Clock location verification is
off by default, even for an existing geofence; an owner may enable it separately
for each configured venue. Coordinate and setting changes record the actor,
time and previous/new values, and owners can see recent history. Apply the
current migrations before configuring venue locations.

Owners can open **Permissions** to assign roles to existing business members.
Owners are business-wide; general managers have a venue; FOH/BOH managers and
employees have a venue and department. A business must retain at least one
owner. Apply the scoped-membership migration before using this screen.

Managers can open **People** to add and edit employee names, preferred contact
emails, job titles and employment types. Archive rather than delete former
staff: the profile and existing shifts remain, while new assignment is blocked.
Profile department associations cannot be moved through this form because
existing shifts retain their original department references.
The directory searches names and filters by permitted venue, department,
job title and active/archive status. Select **All roles** and **All departments**
when switching venues if the previous filters are not available there.

Managers can invite an active, unlinked employee from their primary department
on **People**. The recipient verifies the email in their own browser and can
choose their own password; the manager never sets it. Invitations expire after
seven days, cannot be reused, and can be revoked or resent while pending. A
failed email request leaves the invitation pending so the manager can retry.
Creation, acceptance, revocation and recorded expiry have protected audit
events. A new account receives employee access only to the invited venue and
department; an existing member keeps their existing role and scope. The email
session is verified and its refresh token exchanged before matching it to the
invitation. Before replacing an existing session, the recipient is asked for
confirmation and shown the invited account.

An account that already belongs to another business can accept an invitation.
It gains only an employee membership for the invited venue and department, and
its other memberships keep their existing roles. After accepting, **Open
workspace** opens the invited business; the account then switches businesses
explicitly (see below).

### Switching businesses

An account with more than one business membership chooses a business at
`/choose-business`, which lists only the account's current memberships. The
sidebar shows **Switch business** and keeps navigation links pinned to the
business shown in that tab (`?business=`). Every page, form submission and
payroll download re-reads the caller's current memberships and resolves the
business from explicit request context: the `business` URL parameter, a form's
`business_id`, or a requested venue. Conflicting, invalid, revoked or outside
businesses fail closed. A per-browser, HTTP-only preference cookie only
chooses the default business for pages opened without context; mutations never
use it, so a form submitted from another tab still acts on the business it was
rendered for. Authenticated pages are dynamic and `no-store`; sign-out clears
the preference.

Managers can record each worker's eligible job roles in their linked
departments and choose a qualified primary role. An existing free-text job
title does **not** by itself establish a qualification. Removing a secondary
department also removes its role qualifications; change the primary role first
if it belongs to that department. Renaming a primary role updates the employee
profile without changing historical shifts.

On **Departments**, a manager can restrict a role's automatic assignments to
qualified workers. On the roster, **Automatically choose an eligible worker**
selects an active linked worker without an overlapping shift, respecting that
restriction and submitted recurring availability, date blocks and approved
leave; if none qualifies, no shift is created. An unsubmitted pattern is
unknown and does not by itself disqualify a worker; pending leave does not
block selection. This opt-in selection does not yet consider preferred hours
or fairness.
Apply the current database migrations before using the updated role settings,
employee preferences and roster conflict warnings.
Unless a manual restriction is enabled, existing open-shift and explicit
manual assignment behaviour is unchanged.
Managers can separately require qualified workers for manual assignment of a
configured role, including when filling an open shift. This restriction also
applies to automatic selection, while the automatic-only restriction does not
change manual assignment. The check matches the configured role's current name
case-insensitively; unrelated free-text shift titles do not inherit its policy.
Enabling the setting does not retroactively invalidate existing assignments.

On the weekly roster, a manager can select one active department and copy a
previous Monday-to-Sunday week into the displayed week. The copy adds editable
private drafts without replacing existing shifts or notifying employees; use
the separate publish action to share them. Venue-local dates and times, roles,
breaks, assignments and acknowledgement requirements are retained. The whole
copy is rejected if a worker is unavailable, has approved leave, overlaps an
existing shift (including a linked profile at another venue), or no longer
meets the applicable manual role restriction. These checks block copying even
when manual scheduling is configured to warn. Times that do not exist at a
clock change, and source or copied shifts spanning a clock change, must be
created manually instead. Retrying the same request does not create duplicates.
Publication records in-app updates; unlinked employees see them once they accept
a staff invitation or an owner links their account. Email and push delivery are
not yet implemented (BB-COMMS-003).

Owners can link an existing business member to an employee profile on
**People**; the member's venue and department scope must permit that profile.
Linked active employees
can save multiple weekly time ranges on **Availability**, in the venue's local
time zone. An end time at or before the start is on the following day; equal
times represent 24 hours. An explicitly empty pattern means unavailable all
week, while an unsubmitted pattern is unknown. The roster displays the
complement of saved ranges as unavailable periods, including overnight ranges.
Managers can view availability within their permitted departments but cannot
edit a worker's self-reported pattern.

Linked employees can use **Clock in / out** to start and finish attendance at
their permitted venue and department. If more than one employee/department
option is available, choose the correct one before clocking in. The server
records the actual timestamp, employee, venue and department in immutable
original events; retrying the same request does not duplicate it. A worker
cannot start a second open session, including through an explicitly linked
profile at another venue. An archived profile can finish an already-open
session while its account and scope remain valid. Owners cannot link profiles
while more than one has an open session.
While clocked in, start and end each break explicitly as paid or unpaid; ask
your manager which classification applies if unsure. End an open break before
clocking out. The original classification and server-recorded times are
retained; no break is assumed. This does not calculate payroll or establish
award compliance. If location verification is
enabled, the browser requests location only at clock-in or clock-out; breaks
do not request it. A check passes only when the server-calculated distance plus
the device-reported accuracy fits within the venue radius. Permission denial,
unsupported or inaccurate location, a timeout, or a position outside the radius
still records the clock event and flags it for a manager in the relevant
department. Managers can mark exceptions reviewed without changing the original
time. Checks retain derived distance, accuracy and the radius, not raw device
coordinates. Device-reported location can be spoofed and is not proof of
physical presence. Verification results are separate records: original events
retain their original unverified status, and older events are not retroactively
checked. If the network fails while the attendance page is already open, an
employee can save a clock-in or clock-out claim on that device. To reopen the
fallback after a network failure, while signed in and online select the venue,
expand **Prepare this tab for offline reopening** and choose a separate
12–128-character offline passphrase. Reopen `/attendance` in that tab and
unlock with the passphrase. Only the generic offline shell is cached, not
authenticated pages or API responses. The saved employee and venue scope is
encrypted and tied to the current browser session; signing out removes the
preparation, and a different session cannot unlock it. This local check is not
offline authentication and cannot detect a server-side access revocation while
disconnected. Unsupported browser storage or a changed session requires
reconnecting and preparing the tab again. Closing the tab can remove its
preparation; pending claims remain on the device until uploaded or browser
storage is cleared. The device time
is untrusted; the claim is queued in browser storage and submitted when the
same account reconnects, retaining both that claimed time and the server's
receipt time. Claims are visible within the employee's or manager's scope, but
they do not automatically change attendance or worked time. A scoped manager
can review a claim against an existing finished clock event: match it without
changing time, explicitly correct that event to the claimed time, or reject
the claim with a reason. The decision, actor and any correction are recorded;
employees can see the history. An owner, admin or appropriately scoped general
manager can reopen a decision with a reason, without undoing a prior correction
or an attendance session already created from claims. If both clock-in and
clock-out reports exist for the same employee, department and account, a scoped
manager can explicitly create a finished session after checking them and
acknowledging that the reported times are unverified and no breaks were captured.
The original reports, receipt times and attributed decision remain available.
Each resulting event retains whether it came from an offline device claim or
an employee correction request, cannot overlap other attendance for the worker
or a linked profile, and is flagged in **Work time**.
No breaks are fabricated or deducted; check missing breaks with the employee.
A scoped manager can also complete a matching open server-clocked session
with an offline clock-out claim after reviewing the recorded breaks. If a
break is still open, the manager must explicitly confirm its end with the
employee, enter a reason and acknowledge the unverified clock-out. The existing
break start and paid/unpaid classification are preserved; the added end is
labelled manager-reported, attributed in the employee-visible history and
flagged in **Work time**. No break end is inferred automatically. Out-of-order
or overlapping events, edit locks and overlapping sessions prevent completion.
Reopening a previously linked claim does not allow it to create another
attendance session or clock event. Department managers can approve or return
the resulting attendance from **Timesheet review**. Pending claims are not encrypted; clearing browser data or losing the device
can lose unsent claims. Device storage is shared by accounts using the same
browser profile, so use a
private device or separate browser profiles for different users. If account
access is removed during a session, contact an owner for review. Apply the
current migrations before using the clock.

For a missed clock, a linked employee can submit an online **Request a missed
clock time** with a past venue-local time and an explanation. The request is
unverified and does not change attendance on submission. A scoped manager can
reject it with an explanation, approve an already matching event, apply it as
an auditable correction to a finished event, complete a matching open
clock-out, or pair a reported clock-in and clock-out to create a finished
session. The manager must check the reported time and any breaks; edit locks,
stale-record and overlap safeguards still apply. The employee can see the
decision and its explanation. Original events and the initial request remain
unchanged. A local time skipped by a daylight-saving transition is rejected;
one occurring twice requires selecting its first or second occurrence. New
events from requests are labelled as employee-requested, not as offline device
clocks, and remain flagged as unverified in work time and timesheet review.

Managers can use **Work time** to inspect actual attendance sessions in their
permitted departments and venue. Calculations use elapsed instants, including
across midnight and daylight-saving transitions, and display timestamps in
the venue's current timezone. Worked time excludes explicitly recorded paid
and unpaid breaks; paid time includes the paid breaks. Original event
precision is retained, and only the displayed duration is rounded to the
nearest second; no payroll rounding or award rules are applied. Missing,
invalid or overlapping events are flagged and have no calculated totals.
Location exceptions remain visible even after review.

On a finished session, a manager with department access can open **Review and
correct attendance** to correct an existing clock or break time with a reason.
Corrections are attributed additions; the original event, previous effective
time, replacement, actor and reason remain in the history. The employee can
see corrections to their own linked attendance on **Clock in / out**. Times use
the venue's current timezone: a local time skipped by a clock change is rejected,
and a repeated local time requires choosing its first or second occurrence.
For sub-millisecond precision, enter the final three microsecond digits in the
optional field. An overlapping session for the same or linked worker is rejected.
Invalid clock or break chronology remains flagged with no calculated total.

Managers can lock valid sessions against further corrections; only an owner,
admin or suitably scoped general manager can unlock them, with a reason.
Managers can inspect the attributed lock and unlock history. These edit locks
are not payroll approvals, and a future timesheet approval workflow must apply
its own finalisation rules. Work time is not a payroll approval or export
workflow.

On **Timesheet review**, managers can filter a venue-local week by employee
and compare published assigned shifts with recorded attendance within their
permitted departments. Historical workers remain selectable when they have
records in that scope. Shifts belong to the week they start; sessions use their
corrected clock-in, or clock-out or creation time if clock-in is missing.
Overnight records are not split between weeks. The planned span is before
unclassified planned breaks and is compared with recorded elapsed time, not
paid time. Matching totals do not pair individual shifts with sessions or
approve payroll. Incomplete attendance is excluded from recorded totals and
flagged for review. Expand a session to inspect its original and effective
event timestamps and source; corrections and edit-lock history are available
from **Work time**. A manager can select up to 100 complete, unlocked sessions,
enter a reason and lock them against corrections. Invalid sessions are excluded
again on the server, already-locked sessions are skipped, and changed records
must be reviewed again. Location and reported-time source warnings still require
attention; locking does not resolve them or approve payroll. The result is
retrieved from an attributed, protected receipt, and individual lock history
remains available under **Work time**.

Each attendance session is approved by a manager of the department it was
recorded in, so a worker who works in both FOH and BOH needs approval from each
department for the matching sessions. Owners and general managers can decide any
department. The server checks scope, the reviewed revision and the request
identifier, so stale or repeated submissions cannot record a second decision.
Approval requires complete, valid attendance and locks the session against
corrections. If an owner or general manager later unlocks or changes it, the
status becomes **Changed after approval** and it must be approved again. A
return requires a reason, leaves the session correctable and is shown to the
employee under **Timesheet decisions** on **Attendance**; once it is corrected
it shows **Corrected after return** for another review. Managers cannot decide
their own attendance; another manager or the owner must do so. Every decision
is kept as an immutable, attributed record. Approval does not finalise payroll
or verify award compliance. Apply the current migrations before using this
screen.

A **payroll period** is the venue's Monday-to-Sunday week in its current
timezone. The **Payroll period** panel on **Timesheets** lists outstanding
exceptions: entries awaiting approval, returned or changed since approval,
incomplete attendance, unreviewed location exceptions, and offline claims or
employee time requests awaiting review. Department managers see the exceptions
for their departments. Only an owner, admin or general manager with access to
every department in the venue can finalise a week. It must have ended and have
no exceptions; an optional note can be added. Finalising snapshots each
session's worked and paid time and approval. Until the week is reopened, the
server refuses corrections, edit-lock changes, approvals, breaks, clock events
and location reviews in it. Employees can still submit time requests, which
appear as exceptions. Reopening requires a reason. Each finalisation and
reopening is kept as an immutable, attributed history entry with its totals, and
earlier snapshots are retained. Finalising does not export payroll or verify
award compliance.

Owners and admins can open **Manage payroll employee mapping** from the
**Payroll period** panel. Register a mapping destination using the provider's
account/organisation ID and a display label, then enter each employee's exact,
case-sensitive payroll ID. Destinations belong to the business; the employee
list is scoped to the selected venue. A worker can have different IDs in
different destinations, but an ID cannot identify two workers in the same
destination. Identical employee names are not matched or copied automatically.
Leave an ID blank to remove it. Each save requires a reason, checks the reviewed
revision and appends an attributed audit event; retries do not duplicate events.

The `list_provider_payroll_records` RPC is the provider-adapter input boundary:
it checks current finalisation, venue authority, exceptions, destination tenant
and complete explicit mappings before returning any records. It adds mapping
metadata only to detached records; original snapshots and generic CSV batches
remain unchanged. Provider-ready reads serialize with mapping changes and
refuse a missing or removed mapping rather than returning a partial payroll.
An adapter must persist the mapping it uses in its own immutable delivery
record. **Mapping setup does not authenticate, connect or enable Xero, MYOB,
Employment Hero or QuickBooks.** No provider credentials are collected and no
payroll is sent by this workflow; provider-specific sandbox acceptance remains
required.

For newly finalised weeks, **Finalised payroll records** is a whole-venue,
read-only preview available to those same full-venue payroll managers. Each
versioned record retains the employee and venue IDs, venue-local work date,
corrected clock-event IDs and timestamps, individual paid and unpaid breaks,
worked and paid time, and the approving decision and revision. Timestamps and
decimal seconds retain microsecond precision; displayed durations are rounded.
Provider employee mappings and pay codes remain unassigned until explicitly
configured by future payroll work. The preview is not an export, provider
integration or award calculation, and outstanding exceptions still need
resolution before any export.

Finalisations created before detailed snapshots were introduced cannot safely
be reconstructed from subsequently changed attendance. If their details are
missing, the preview explains that an authorised manager must reopen the period
with a reason, review it and finalise it again. The earlier finalisation and
original attendance remain in the audit history. Provider preparation validates
explicit employee mapping and pay-code totals on a detached, immutable copy;
it never updates source attendance or approval records.

### Generic payroll CSV

On **Timesheets**, a full-venue payroll manager may prepare a CSV for the
current finalised week after all exceptions are resolved. It covers the whole
venue, regardless of the employee filter. Only approved sessions that have
never appeared in a previous batch are included. Preparing a batch records its
actor, time, finalisation and individual immutable source records; it does not
prove that a file was downloaded or imported. An existing current batch may be
downloaded again, but importing it twice can pay workers twice. Check the
external payroll system before importing or retrying. Correct a blank or
excessively long employee name before preparing a batch; the batch is not
created if a name cannot be represented safely.

Reopening a period prevents downloading the old batch. If a previously
exported session changes, the manager must review its before/after records,
handle any necessary adjustment in external payroll, and record a reason and
explicit confirmation before preparing another batch. Butterbox does not
create or transmit that adjustment. A previously exported session is never
automatically emitted again, even if it moves to another week; only newly
added approved sessions can appear in a later batch. History shows each
batch's session, exact worked and paid seconds, and finalisation version, as
well as the before/after reconciliation records. This read-only audit remains
available to full-venue payroll managers after reopening. A new outstanding
claim also blocks downloads until it is resolved.

The UTF-8 CSV has a byte-order mark, a header, CRLF line endings and
double-quoted cells; embedded quotes are doubled. Spreadsheet-formula-like
values are prefixed with an apostrophe, including values preceded by whitespace
or control characters. Keep IDs and versions as text when importing into
spreadsheet software, which may otherwise coerce large numbers or dates.

| Columns | Format and meaning |
| --- | --- |
| `batch_id`, `finalisation_id`, `business_id`, `venue_id`, `department_id`, `employee_id`, `session_id`, `approval_id` | Butterbox UUIDs; `employee_id` is not an external payroll ID. |
| `payroll_version` | Exact decimal finalisation version, represented as text. |
| `employee_name` | Name captured when the batch was prepared, for human review only; never use it to infer a payroll ID. |
| `work_date`, `venue_timezone` | Corrected clock-in date as `YYYY-MM-DD` in the named IANA venue timezone. |
| `clock_in_utc`, `clock_out_utc` | Corrected UTC instants as `YYYY-MM-DDTHH:mm:ss.ffffffZ`, with six fractional digits. |
| `elapsed_seconds`, `worked_seconds`, `paid_seconds`, `paid_break_seconds`, `unpaid_break_seconds` | Exact non-negative decimal seconds, with up to six fractional digits. Worked time excludes all breaks; paid time excludes unpaid breaks. |
| `worked_hours`, `paid_hours` | Decimal hours rounded half-up to six decimal places from the exact seconds; use the seconds columns when that rounding is unsuitable. |
| `approval_revision` | The approved attendance revision as a lowercase SHA-256 hexadecimal value. |

This file contains no external employee mappings, pay rates, award
interpretation or pay codes. The venue remains responsible for confirming
payroll import, any manual adjustments and applicable award obligations.

Linked active employees can also record an optional preferred number of weekly
hours (0–168 in quarter-hour increments) and separate email choices for schedule
updates and leave decisions on **Availability**. These preferences are not
contractual limits and do not change roster eligibility. Eligible managers can
view them on **People**, and changes record the actor, time and previous/new
values. Email delivery is not implemented yet, regardless of the choices saved.

On **Availability**, a linked employee can block a date range immediately or
request leave for manager review. Dates are inclusive venue-local days, with
a maximum of 366 days per entry. Date blocks and approved leave override
recurring availability for the entire day; pending leave is shown separately
and does not change the pattern until approved. Employees can cancel their
own date blocks and pending requests and see pending, approved, rejected and
cancelled statuses. A permitted manager can approve or reject pending leave,
or explicitly cancel an approval. Leave and date blocks are displayed on the
roster. Automatic selection excludes workers with date blocks or approved
leave. Leave notifications and schedule emails are not sent yet.

Assigned shifts show advisory conflict labels when they overlap a submitted
unavailable period, active date block or approved leave. Overnight shifts and
daylight-saving clock changes use the actual venue-local dates and times.
Unsubmitted availability remains unknown, and pending leave is not treated as
approved. A legacy shift longer than 24 hours is flagged for manual review.
Managers also see a generic overlap warning on their affected shifts, including
conflicts with shifts in a department they cannot view; the other shift's
details are not disclosed. New overlaps for the same venue profile are already
rejected. Owners can configure venue-specific rules on **Departments and
roles** to block manual assignment of unavailable workers and, separately,
publication of unavailable workers, overlaps or shifts longer than 24 hours.
Each rule defaults to a warning, preserving existing behaviour, and real changes
are recorded in owner-only history. Existing assignments are not changed by
enabling a rule, although publication can be blocked. Availability cannot be
verified for legacy assigned shifts longer than 24 hours, so the unavailable
worker publication rule also blocks them.

On **People**, a business owner can explicitly link profiles for the same
person at different venues after confirming their identity. Names and email
addresses are never used to infer links, and linking does not connect accounts
or grant venue access. Unlinking a profile removes it from all its linked
venues. Managers see only their own affected shift when a linked profile
overlaps elsewhere. Automatic selection avoids those overlaps; manual
cross-venue assignments show a warning and the venue's publication overlap rule
can block publishing. Concurrent link, edit, assignment and publication
changes are coordinated; when necessary the manager is asked to retry.

When a department roster is published, a numbered version and a snapshot of its
published shifts are recorded for that venue-local week. Authorised managers
can see publication history on the roster. Publishing with no drafts, or a
publication blocked by a conflict rule, does not create a version. Shifts
published before version history was introduced are not retroactively logged.
New publications create one in-app roster update per affected account, even
when several shifts or linked profiles are involved. Employees can review and
mark updates read in **Notifications**, or open their own schedule directly.
Unlinked profiles retain their update until linked; managers are warned when
affected profiles lack a linked account, eligible membership or department
link, and the warning links to **People** to send a staff invitation. An in-app update is visible when the employee next signs in; this does
not verify external delivery. Updates are not retroactively generated for
older publications, and email and push delivery are not yet available.

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
after a manager publishes changes. Managers can require acknowledgement for an
assigned draft shift; existing shifts do not require it by default. Once
published, the linked employee can acknowledge the shift in their schedule and
the manager can see its status on the roster. Acknowledgements are recorded
against the published snapshot and account, and remain valid when an unchanged
shift appears in a later version. If a required draft becomes unassigned, it
must be reassigned or its requirement removed before publishing.

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

To rehearse the canonical-record migration against a real pre-migration
finalisation, copy the repository migrations into an isolated disposable
Supabase workdir. Verify its project ID and its published database and API
ports, and set `WORKDIR` and `DISPOSABLE_DB_CONTAINER` to that project.
**These resets erase that project's database**:

```sh
npx --yes supabase@2.122.0 db reset --local --no-seed --version 20261102180000 --workdir "$WORKDIR"
docker exec -i "$DISPOSABLE_DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/tests/migrations/canonical_payroll_legacy_setup.sql
npx --yes supabase@2.122.0 migration up --local --workdir "$WORKDIR"
docker exec -i "$DISPOSABLE_DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -At -q \
  < supabase/tests/migrations/canonical_payroll_legacy_verify.sql
npx --yes supabase@2.122.0 db reset --local --no-seed --workdir "$WORKDIR"
```

Check the pgTAP output for the full plan and any `not ok` lines; a successful
`psql` exit alone does not establish that the assertions passed.

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
To also verify concurrent leave, attendance, location and sample-policy transitions,
set `BUTTERBOX_TEST_DB_CONTAINER` to that disposable project's
`supabase_db_<project-id>` Docker container. These tests verify the container's
project label and API port before using temporary row locks.
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
a loopback tunnel to a non-disposable project. The sample-data browser test
requires the policy to be disabled initially, verifies the Docker project label
and API port, temporarily enables the policy and restores it afterward.
Set `BUTTERBOX_TEST_APP_URL` to
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

### Accessibility and performance checks

The browser suite runs axe-core WCAG 2.0/2.1 A and AA plus WCAG 2.2 AA rules.
It covers the signed-out pages, the owner's core pages and the employee's core
pages on a 375px phone viewport. Each page must have one `main` landmark,
one level-one heading, a document title and `lang="en-AU"`, with no
horizontal page scroll on the phone. Keyboard checks sign in using only the
keyboard, use the "Skip to main content" link, publish a roster and mark a
notification as read. Automated checks are smoke tests, not a full manual
WCAG audit or a screen-reader user study.

The performance benchmark seeds 25 employees with one draft shift each day for
7 days (175 shifts) against the production build. Its budgets are:

| Measure | Budget |
| --- | --- |
| Median manager roster page load until all 175 drafts render (3 loads) | 3,000 ms |
| Publishing all 175 shifts until confirmation | 5,000 ms |
| Median employee schedule on a 375px phone until the week renders (3 loads) | 2,000 ms |

Measured times are written to the test output as `25x7 benchmark`. They depend
on the host, so treat them as regression guards rather than production service
levels. Loading, failure and missing-page states are tested with a delayed
navigation, a simulated server-action outage followed by **Try again**, and an
unknown URL.

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