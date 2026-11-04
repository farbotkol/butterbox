# Butterbox

Butterbox is a Next.js application backed by Supabase. The product backlog is
in [BACKLOG_INDEX.csv](BACKLOG_INDEX.csv); work in progress is recorded in
[IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

## User guide and documentation

- [Butterbox User Guide](docs/USER_GUIDE.md) — practical guidance for owners, managers, employees and payroll administrators, including current limitations.
- [Product Decision Log](docs/DECISION_LOG.md) — approved product directions, pending approvals and delivery gates.
- [Documentation backlog](BUTTERBOX_PRODUCT_BACKLOG.md#epic-doc--user-guidance-and-contextual-help-p1) — screen-level walkthrough validation, in-product help and ongoing documentation maintenance.

The guide is a living document; always confirm the relevant capability is tested and available before relying on it in production.

## Sensitive action history

Owners can open **Audit history** to review staffing, permission, roster,
attendance and payroll changes recorded after the audit migration is installed.
Filter by category, operation, actor user ID and inclusive UTC dates; results
are paginated in groups of 50. Each record includes the business, actor,
timestamp, allowed before/after fields and the source reason where applicable.
Service changes without a user session are labelled **Database service**.
Existing domain histories remain on their original screens; this view does
not invent historical actors or backfill earlier changes.

Audit records are inserted atomically with source changes and cannot be
created, edited or deleted by application users or the service role. RLS
restricts reads to the current business owner; revocation takes effect on the
next request. A field allowlist excludes contact email, credentials, captured
GPS positions and arbitrary nested metadata. Owners should still treat the
included names, identifiers and free-text reasons as sensitive personal data.
Source-record deletion retains its audit history. Business deletion and
truncation are disabled by the preservation migration, although other
privileged operations may still remove records.

## Attendance exception monitoring

Owners enable per-venue monitoring in **Attendance → Review attendance
alerts**. Scoped managers acknowledge or resolve signals; resolution requires
a reason. See [the User Guide](docs/USER_GUIDE.md#configure-and-review-attendance-alerts)
for thresholds, permissions, notification read state and limitations.

The attendance-alert migrations require `pg_cron` and schedule
`public.run_attendance_alert_worker()` every minute. Verify extension support
and job operation in each authorized deployment before relying on alerts.
The page warns when the most recent completed scan is more than five minutes
old or unavailable. A scan uses its captured start time; a later clock is
evaluated on a subsequent scan. Monitoring is disabled by default and only
considers assigned, scheduled, published shifts. A no-show signal is not proof
of absence or a payroll/compliance decision. No external messages are sent.

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

Fictional sample staff and shifts remain unavailable in ordinary workspaces. The setup
form, server actions and database seed functions reject sample requests;
ordinary accounts, the service role and an operator updating the old policy
cannot enable them. New customer workspaces start without sample staff or
shifts. Applying the safeguard disables a previously enabled policy but does
not delete or establish the provenance of any historical sample records.
Privileged direct table writes or schema changes can bypass this safeguard and
must be governed separately. See `docs/DECISION_LOG.md` (DEC-003) for the
remaining isolation, historical-data assessment and clean-conversion requirements.

### Isolated local synthetic showcase

BB-DEMO-001 provides a tested **local internal review** environment, not a
production deployment. A separately built, temporary internet-accessible
synthetic preview is described below. The showcase contains
14 fictional FOH/BOH employees, scoped review accounts, availability, published
rosters/open shifts, original clock/break events, an attributable correction
and approved/finalised sample time. No production data is copied. Do not seed
an acceptance, ordinary local, unidentified or production project instead.

The operator-only helper requires the verified Supabase CLI 2.122.0 executable,
Docker and at least 10 GiB available disk. Choose a **new absolute directory
outside the checkout**, named `butterbox-showcase`, whose parent already exists:

```sh
export BUTTERBOX_TEST_SUPABASE_CLI=/absolute/path/to/supabase
node scripts/showcase-environment.mjs prepare /private/operator/path/butterbox-showcase
```

For an explicitly designated **internal test owner**, the operator may instead
append `--test-owner-email "$BUTTERBOX_SHOWCASE_TEST_OWNER_EMAIL"` to the
`prepare` command. The address must be at `@butterbox.com` with a local part
consisting of `test` followed by 1–60 letters, digits, underscores or hyphens;
do not use a real employee or customer address. This format check cannot prove
an address is fictional: the operator must confirm it is an internal test
alias. The address identifies a new, separate showcase-only Auth account with
its own generated password, not the existing account or password in another
workspace. The remaining review accounts retain their reserved fictional
addresses. The designated address is private, integrity checked, and accepted
by reset only as the exact owner. The showcase uses a separate authentication
cookie so its login and sign-out do not replace an ordinary local workspace's
session on the same host.

Preparation creates mode-0700 directories, mode-0600 generated API/signing
material and hashed migration snapshots. It refuses to overwrite an existing
directory. Never commit or publish those files, private failure diagnostics or
raw CLI status output. No automatic seed or public signup is enabled.

The backend uses project `butterbox-showcase`, dedicated storage and an
owned **internal-only Docker network**. This Docker configuration does not
publish container ports; fixed-target host proxies provide local access without
giving the service containers an external default route. Start the proxy in
one terminal, then the backend in another. The proxy creates or verifies the
owned internal network before listening:

```sh
node scripts/showcase-environment.mjs proxy /private/operator/path/butterbox-showcase
```

```sh
node scripts/showcase-environment.mjs start /private/operator/path/butterbox-showcase
node scripts/showcase-environment.mjs verify /private/operator/path/butterbox-showcase
```

On macOS with Colima, container bridge addresses are reachable from the Colima
VM rather than the Mac host. Run the proxy command inside that VM with a Node
runtime there, using the same mounted checkout and private workdir paths; run
the backend and app commands on the host. Verify Colima forwards each proxy
port to host **loopback only** before seeding. A VM without the same paths,
ownership or loopback forwarding is not a verified showcase environment.

Proxies listen only on `127.0.0.1`: API **57421**, database **57422**, Mailpit
**57424**. They check target project/workdir, network, health and storage before
forwarding. Stop the proxy with Ctrl-C when finished. Do not make these ports
public or use this as a production/shared-host security boundary: the CLI still
uses its standard local PostgreSQL password, and trusted local operators have
Docker access. Do not forward backend ports. Remote/private reviewer access
through the Codespaces port-visibility API was not verified (it returned 403);
the optional public preview uses a separate application-only HTTPS gateway.

Verification checks every required service, generated signing-secret wiring,
the real Auth endpoint, acceptance of the project's signed administrative JWT
and rejection of a foreign administrative JWT and anonymous business reads.
Local OpenAPI discovery is anonymous; an opaque `apikey` alone is not the
authorization test. The helper does not print tokens.

Seed only after verification, using the same private workdir:

```sh
node --experimental-strip-types scripts/showcase-fixtures.mjs seed /private/operator/path/butterbox-showcase
```

The private `fixture-state.json` contains generated review account credentials,
role scopes, IDs, venue-local week dates and the sample batch ID. Give only the
appropriate account to a trusted local reviewer; never print or publish the
inventory. It includes an owner, FOH/BOH managers, employees and a separate
outside-business control owner. The `SIMULATION_ONLY_APPROVED_TIME_*.csv`
snapshot is also private and is **not for payroll**. There are no provider
mappings, pay-code calculations, live payroll submission or compliance claims.
See [the reviewer guidance](docs/USER_GUIDE.md#internal-synthetic-showcase).

Start the app in a third terminal with the existing controlled production
runner. It builds with the explicit showcase configuration, verifies the
seeded project and binds only `127.0.0.1:3137`:

```sh
BUTTERBOX_TEST_DISPOSABLE=yes \
BUTTERBOX_TEST_FILE=tests/e2e/showcase.spec.mjs \
BUTTERBOX_SHOWCASE_WORKDIR=/private/operator/path/butterbox-showcase \
BUTTERBOX_TEST_APP_URL=http://127.0.0.1:3137 \
NEXT_PUBLIC_BUTTERBOX_SHOWCASE=true \
node scripts/test-auth.mjs /private/operator/path/butterbox-showcase --serve-showcase
```

Keep the CLI executable variable exported in that terminal. Do not reuse a
production build across normal/showcase origins: public configuration is
embedded at build time. This launcher rebuilds for the selected environment.
If using a separate source snapshot, keep its dependencies inside that
snapshot; Turbopack can reject a `node_modules` symlink outside its workspace.
The app displays **SIMULATION ONLY**; every downloaded sample CSV row also
contains **SIMULATION ONLY - NOT FOR PAYROLL**. The notice is not an
authorization boundary; normal server permissions and RLS still apply.

The optional **Explore future concepts** preview is off by default. An operator
may set `BUTTERBOX_FUTURE_VISION_PREVIEW=true` for a verified synthetic
showcase, or for a separately verified disposable local development project
whose application and Supabase API use distinct loopback HTTP origins. A local
origin alone does not prove that a project contains only synthetic data. The
preview uses static fictional examples and performs no AI, forecasting, award
or payroll calculation. An invalid flag or an attempt to enable it in an
ordinary production configuration fails explicitly. Do not enable or deploy
it to an existing protected showcase without separate owner approval.

Stop both the local review app and any public preview **before** reset. Keep the
backend/proxy running and explicitly confirm the destructive reset of this
synthetic project only:

```sh
node --experimental-strip-types scripts/showcase-fixtures.mjs reset /private/operator/path/butterbox-showcase --confirm-synthetic-reset=butterbox-showcase
node --experimental-strip-types scripts/showcase-fixtures.mjs seed /private/operator/path/butterbox-showcase
```

Reset checks the exact project, private configuration, credentials, network,
storage and known fictional Auth/business inventory first. It refuses unknown
accounts/businesses. It archives the prior private inventory/CSV and records a
hashed local reset receipt; it does not preserve database edits made during a
review. Reseeding generates new account passwords; retrieve them from the new
private inventory. Only enter fictional data. Seed never overwrites existing
state or implicitly resets. Seed/reset share an exclusive operation lock; a partial
inventory or interrupted lock requires private operator inspection, not
automatic deletion or a bypass.

#### Repeatable acceptance checklist (BB-DEMO-004)

Run this sequence before each owner review, from one private workdir, and keep
the output privately. Every step must pass; stop at the first failure.

1. **Isolation:** `node scripts/showcase-environment.mjs verify <workdir>` with
   the backend/proxy running (exact project, private network, loopback-only
   ports, owned storage, signed/foreign JWT and anonymous-read checks).
2. **Reset:** stop the review app, then run the confirmed `reset` above. It
   must report an empty project and append a `reset-history.jsonl` receipt.
3. **Reseed:** run `seed`. Expect a new private `fixture-state.json` in phase
   `seeded` with `simulationOnly: true` and new generated passwords.
4. **Data and tenant isolation:** with the same workdir exported as
   `BUTTERBOX_SHOWCASE_WORKDIR`, run
   `node --experimental-strip-types --test tests/showcase-fixtures.integration.test.mjs`.
   Run it immediately after reseeding, before any review edits, because it
   expects the exact fixture counts. It checks 14 staff, 30 shifts, preserved
   original clock events with an attributed correction, 4 roster publications, 14 sample payroll rows marked
   **SIMULATION ONLY - NOT FOR PAYROLL**, FOH/BOH managers seeing only their
   7 department staff, the employee seeing only themselves, the
   outside-business owner seeing none of the showcase staff, owner-only
   reporting, disabled signup, zero captured mail and no outbound network.
5. **Core journeys:** with the review app stopped (it binds the same port),
   run the launcher command above with `--split-build` instead of
   `--serve-showcase`; it builds, serves and runs `tests/e2e/showcase.spec.mjs`
   (owner payroll preparation, scoped FOH/BOH managers, mobile employee,
   offline reopening, Help Center and contextual help, cookie separation from
   the ordinary app). Run it after step 4: one check briefly creates, then
   deletes, a temporary onboarding account.
   Then start the review app again with `--serve-showcase`.
6. **Record:** add the date, commit SHA, reset ID and step results to the
   owner-review record in `IMPLEMENTATION_PROGRESS.md`. Only the owner may
   record their own review outcome.

| Failure | Meaning | Safe response |
| --- | --- | --- |
| `verify` rejects project, network, ports or storage | Not a verified isolated showcase | Do not seed, reset or review; inspect the private diagnostics |
| Reset refuses unknown accounts or businesses | Non-fixture data is present | Preserve the project; investigate privately; never bypass |
| `Fixture state already exists` on seed | Seed never overwrites | Run the confirmed reset first, or keep the existing fixture |
| Operation lock or partial inventory | An interrupted seed/reset | Inspect privately; do not delete the lock or state by hand |
| Integration or browser step fails | Fixture or app regression | Do not present the showcase; record the failure and fix it first |
| Reviewer cannot sign in after reseed | Passwords are regenerated | Supply the new private credentials |

Known gaps: the normal showcase address is loopback-only; the optional public
preview depends on the operator's computer and is not durable hosting.
Browser-level cross-business checks cover the Help Center and sample export,
with data isolation also proven by the local integration step; dashboard
forecasting, labour optimisation, compliance checks and AI Copilot are
labelled concepts; there is no cleared public marketing launch (BB-BRAND-004);
the Coastal Wave logo system awaits the owner's final visual review; external
notifications, live payroll, award calculation and production readiness are
out of scope.

#### Temporary public synthetic preview

The optional public preview exposes the **application only** through a dedicated
random HTTPS OpenTunnel route. It is an internet-accessible demonstration,
not a private network, production deployment, durable hosted service or
approval to publish the draft marketing imagery. The route and TLS private key
belong to the operator's dedicated profile; the gateway and app remain on
`127.0.0.1:3140` and `127.0.0.1:3141`. The Supabase API/database and ordinary
app must remain loopback-only and must never be tunnel targets.

The public and local showcases share the same synthetic database. Reviewer edits
are shared, and the launcher refuses to start if the known fictional identity,
business, venue or employee inventory no longer matches. Do not enter real
personal information, use production data, run live payroll, or share review
passwords publicly. Public sign-up, password changes and recovery, email
invitations, offline attendance claims and offline reopening are disabled.
Clocking controls are present online; a public clock mutation was not executed
as part of the read-only review. CSV exports remain simulation-only.

For the verified Mac operator environment, provision the separately owned
`$HOME/butterbox-showcase-public/app` source snapshot and its own dependencies
from a trusted revision. Install the checksum-verified OpenTunnel client at
`$HOME/butterbox-showcase-public/bin/opentunnel`, with the dedicated
`butterbox-showcase` profile configured for exactly one route to
`127.0.0.1:3140`. Adding a route can install an automatic login service: run
`"$HOME/butterbox-showcase-public/bin/opentunnel" --profile butterbox-showcase down`
and confirm `status` reports
**stopped** before using the supervised runner. Do not use the CLI's `up`
autostart mode or expose a second route through this profile.

With the previously verified isolated backend/proxy and private workdir
running, and with the required Docker/CLI variables from the local setup
exported, build the separate snapshot and start its supervised public app,
gateway and tunnel. Substitute the dedicated route's HTTPS origin; never use a
production project:

```sh
node --experimental-strip-types scripts/public-showcase.mjs build "$HOME/butterbox-showcase"
node --experimental-strip-types scripts/public-showcase.mjs serve "$HOME/butterbox-showcase" "$PUBLIC_SHOWCASE_ORIGIN"
```

Set `PUBLIC_SHOWCASE_ORIGIN` to the exact HTTPS route shown by the profile's
`status` command before starting the runner.

With the preview running, the following targeted checks sign in with the
private synthetic review accounts without changing seeded staff or attendance:

```sh
BUTTERBOX_SHOWCASE_WORKDIR="$HOME/butterbox-showcase" \
BUTTERBOX_TEST_PUBLIC_SHOWCASE=yes \
BUTTERBOX_TEST_APP_URL="$PUBLIC_SHOWCASE_ORIGIN" \
node --experimental-strip-types node_modules/@playwright/test/cli.js test tests/e2e/public-showcase.spec.mjs --browser=chromium --workers=1
```

The runner verifies the isolated project, known fictional inventory and stopped
single-route profile, starts the gateway only after app readiness, and
supervises the tunnel and app together. It shuts the tunnel down before
releasing the gateway during a normal stop; it also stops the remaining
services if the app or tunnel exits. A forced kill, computer sleep, network
loss, certificate expiry or reboot can still interrupt the preview. Do not
reassign the gateway port while the tunnel might be running. Give trusted
reviewers the current HTTPS URL and only their own provisioned credentials;
the private fixture inventory is never a public download.

Check `"$HOME/butterbox-showcase-public/bin/opentunnel" --profile butterbox-showcase status`,
fetch the HTTPS login
and compare the served certificate fingerprint to the locally held certificate
before sharing the link. To stop the preview, send Ctrl-C to its supervised
runner and confirm the tunnel is stopped before starting any other process on
port 3140. If the runner cannot be stopped normally, first run
`"$HOME/butterbox-showcase-public/bin/opentunnel" --profile butterbox-showcase down`,
verify the tunnel is stopped,
then stop the public gateway/app. The local showcase on port 3137 is a separate
process and need not be interrupted. Rebuild only after stopping the public
runner; copy the current user guide into the public source snapshot before
building so in-app Help matches the actual preview.

To pause while preserving storage, use:

```sh
node scripts/showcase-environment.mjs stop /private/operator/path/butterbox-showcase
```

Then stop the proxy with Ctrl-C. The helper records exact owned-volume identity;
restart refuses replacement, extra or unidentified volumes. Preserve private
diagnostics and volumes after a failure; never remove them to bypass checks.
Auth permits existing password logins but global signup is disabled. Local
Mailpit captures test mail; backend containers have no external network route.
Live external messaging/provider delivery remains unavailable.
Continue to monitor disk during startup and tests, stopping safely below
10 GiB. Ordinary customer sample-data safeguards remain disabled. Broader
SAAS-003 production assessment and clean real-customer conversion remain
unverified; do not copy this demo's data or configuration into a real tenant.

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

From a worker's **People** card, authorised managers can open **Review
employment metadata** to record an effective date, employment basis, optional
classification and independent award and contract references. A blank
classification explicitly means **Unknown**. References are supplied by the
venue; Butterbox does not interpret them, calculate award pay or certify
compliance. Existing profile employment types, including the legacy default,
do not establish a dated basis or classification; record dated details
explicitly when they are known.

The current entry is selected using the venue's calendar; future entries
remain in history until their effective date. Later corrections for the same
date supersede earlier entries without deleting them. Changing the employment
type on an existing profile records a basis effective today and carries
forward the current references; a stale edit must be refreshed. Employment
history records the actor and is retained if the employee profile is deleted.
The profile's legacy employment-type field is synchronized when a current
change is saved, but may be stale when a future change becomes effective:
date-aware consumers must read the employment metadata history or
`list_current_employee_employment_metadata` instead.

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

Owners can choose a venue's **Roster planning week** on **Departments**.
Monday is the default. A new start day takes effect after the current
venue-local planning week; an intervening transition may contain fewer than
seven days so every date appears once. A pending change can be replaced or
cancelled before its transition period begins; once that period starts, wait
until the new start takes effect before changing it again. Changes and their
effective dates are recorded in the venue settings history and sensitive-action
audit.

The read-only **Venue planning view** groups only shifts visible to the signed-in
user by these prospective periods. It links to each Monday-based operational
week covered by the view. Editing, copying, approval and publication remain on
the existing Monday-to-Sunday roster; timesheet and payroll periods and historic
publication records are not changed. **My schedule** retains its existing
Monday-based navigation. This planning view does not implement optional
notification delivery or the remaining business-configuration requirements.

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

Linked employees can open **View your attendance history** from the clock
screen to see their own original and corrected clock and break events,
including the source and retained location-check outcome. The page is scoped
to the current business and venue; managers using it see their own events,
not their team's. A correction link returns to the request form and existing
attributed correction history. Owners and scoped managers can review attendance
in their permitted departments; database operators may also have access.
After a worker's membership or employee link is removed, access through their
account to personal history ends and they should contact their employer for
records or correction. Separate authorised management access is unaffected
by removing an employee-profile link.

Original attendance, corrections, claims and payroll records are not subject
to a configured automatic live-record expiry in this application. Ordinary
edits and individual deletion are restricted. Business DELETE and TRUNCATE are
disabled, including for the service role, while preservation requirements are
unresolved; this does not protect against every privileged database or storage
operation. Hosted backups and a legally appropriate live-record
retention/deletion policy have not been verified. The backup objectives
below are separate from employment-record retention. Nothing here guarantees
compliance with Australian privacy or workplace-record requirements.

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
account/organisation ID and a display label, then select the destination and
find the employee in the searchable, filterable mapping directory. Open their
read-only detail and select **Edit mapping** to enter the exact, case-sensitive
payroll ID. Destinations belong to the business; the employee list is scoped to
the selected venue. A worker can have different IDs in different destinations,
but an ID cannot identify two workers in the same destination. Identical
employee names are not matched or copied automatically. Each save requires a
reason and destination confirmation, checks the reviewed revision and appends
an attributed audit event; retries do not duplicate events. Clearing an ID also
requires explicit removal confirmation and blocks provider-ready records while
retaining history.

The `20261104070000` migration intentionally removes authenticated direct
execution of the former `set_payroll_employee_mapping` RPC. Callers must use
`set_payroll_employee_mapping_scoped` with the selected venue and explicit
destination/removal confirmations; the original mutation remains internal to
that checked entry point. Coordinate application and database updates so an old
application is not left calling the revoked RPC. This is a compatibility
change, not approval to deploy either protected showcase.

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
Provider employee mappings and pay codes remain unassigned in the original
records; the separate mapping setup only adds employee IDs to eligible
detached provider-ready records. The preview is not an export, provider
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
Each newly sent open-shift offer also creates an unread update for its
invited employees. Manager claim decisions create an outcome update for each
recipient, including the employee whose claim was approved. These notices open
the employee's own venue-local schedule at the shift-offer section.
Unlinked profiles retain their update until linked; managers are warned when
affected profiles lack a linked account, eligible membership or department
link, and the warning links to **People** to send a staff invitation. An in-app update is visible when the employee next signs in; this does
not verify external delivery. Updates are not retroactively generated for
older publications or offers, and email and push delivery are not yet available.

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

For a quick roster change, a manager can drag **Move or duplicate** to a team
member and day, or activate the control and select the target using a keyboard.
The preview identifies the destination and shows conflicts or warnings before
confirmation. Moves change drafts only; published shifts can be duplicated as
private drafts. The most recent quick change can be undone while its result
remains unchanged and unpublished. The server rechecks permissions, the preview
and scheduling rules when applying or undoing, and rejects unsafe clock-change
times. Changes remain private until the normal publication workflow succeeds.

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

### Shift swaps

From **My schedule**, a linked employee can request an exchange of an upcoming
published shift with a colleague in the same venue and department. The
colleague can decline or explicitly agree by proposing one of their own
upcoming published shifts in that department. The requester must then confirm
the proposed exchange. Shifts longer than 24 hours cannot be swapped.

An authorised department manager reviews the confirmed exchange on **Shift
swaps** and can approve it or reject it with a reason. Approval rechecks both
employees' qualifications, availability and overlapping shifts, including
explicitly linked profiles at other venues. Until approval, neither assignment
changes. Approval records a new publication snapshot and resets any required
acknowledgement for the incoming assignee; previous acknowledgements remain in
the history. If a shift changes or starts before approval, request a new swap.

The recipient, requester and scoped managers receive relevant in-app updates
in **Notifications**; the two employees receive the approval or rejection
outcome. Updates can be marked read or opened directly. Email and push delivery
are not yet available.

```sh
npm run dev
npm test
npm run lint
npm run build
npx --yes supabase@2.122.0 test db supabase/tests/database --local
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
two synthetic users and businesses, and checks concurrent roster assignments.
It verifies that business deletion is refused and removes the test user
accounts; protected synthetic business records remain until an explicitly
verified disposable project is reset. It checks the project label and API
port and refuses non-loopback URLs: use an isolated test project, never a
shared or production one. Without test settings, the normal `npm test` run
explicitly skips this integration test. CI runs both the database suite and
the HTTP test on a fresh local Supabase project.
To also verify concurrent leave, attendance, location and sample-policy transitions,
set `BUTTERBOX_TEST_DB_CONTAINER` to that disposable project's
`supabase_db_<project-id>` Docker container. These tests verify the container's
project label and API port before using temporary row locks.
If the pinned CLI is already installed locally, set `BUTTERBOX_TEST_SUPABASE_CLI`
to its executable path to avoid launching `npx` for the test status check.

The sample-policy upgrade rehearsal requires a verified disposable database
with migrations through `20261103130000` and without the later safeguard.
After verifying its project label and database port, stream the migration into
the rolled-back test (replace `<project-id>` with the verified project ID):

```sh
sed '/^-- APPLY_DEMO_SAFEGUARD_MIGRATION$/r supabase/migrations/20261103140000_disable_unisolated_demo_seed.sql' \
  supabase/tests/migration-upgrade/demo_seed_fail_closed.test.sql |
  docker exec -i supabase_db_<project-id> psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres
```

Check the TAP plan and every assertion, including `not ok` lines; a successful
`psql` exit alone does not mean the assertions passed. The rehearsal creates
sample records only inside its rolled-back transaction.

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
creates and removes test users. Protected synthetic businesses remain until a
separately verified disposable project reset; never use a shared database or a
loopback tunnel to a non-disposable project. The sample-data browser test
verifies that setup remains clean and sample creation is unavailable, including
for a previously saved sample preference.
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
use `GET /api/ready` for dependency readiness. Readiness executes a
non-privileged, data-free RPC through PostgREST and JWT validation to PostgreSQL
with a three-second timeout. It returns 200 `{"status":"ok"}` or a generic
503 `{"status":"unavailable"}` with `Cache-Control: no-store`; it does not
expose dependency errors or tenant data. Apply the readiness migration first.
It is a connectivity/schema-probe check, not a check of every migration,
the Auth service, email delivery, external payroll or all application functionality. Put a
reverse proxy in front of a public self-hosted deployment, with rate limits
for public health probes and an appropriate readiness polling interval.

CI installs from the lockfile, runs tests, lint and a production build, then
builds the image and waits for its health check.

### Operational error and health metrics

Set `BUTTERBOX_OPERATIONS_TOKEN` securely in the **server runtime** to an
operator-generated random value of at least 32 characters. It is not a
`NEXT_PUBLIC_` setting, customer credential or browser session token. Never
commit it, put it in a URL, or share it with tenants. `GET /api/metrics` requires
`Authorization: Bearer <operator token>`; absent/wrong credentials return 401,
and missing or too-short server configuration returns 503. All responses are
uncached. Restrict access further at the operator network/proxy layer.

The JSON response exposes fixed-cardinality counters for liveness/readiness
successes and failures and captured Next.js request errors by
render/route/action/proxy category, with observation/start/last-error times.
Counters are **per Node.js process**, reset on restart and must be collected
from each replica; they are not durable global totals or customer-level
analytics. Next's `onRequestError` hook also emits structured
`butterbox_request_error` log events. Readiness emits `butterbox_readiness`
events. These events deliberately omit request URLs, headers, error messages,
user identifiers and payloads. Existing application logs require their own
access/retention controls; the hook does not sanitise third-party logs.

Before a pilot, an operator must configure a collector for these logs and
metrics, notify on repeated readiness failure or elevated error counts, and
verify an alert reaches its on-call destination. No external monitoring
provider or alert delivery has been provisioned or verified by local tests.
The browser regression checks real healthy probes, a controlled database
permission failure, generic 503, continued liveness, recovered readiness,
protected metric reads and failure-counter increments on the disposable stack.

### Backup retention and recovery runbook

**Status:** no hosted staging/production backup configuration or retained
backup has been verified. The owner has deferred a hosted rehearsal to
pre-production; it remains a mandatory production release gate, not evidence
that recovery works in a deployed project. The owner must explicitly identify
an isolated staging Supabase project and authorise a restore there before this
story can be marked Done. Never restore,
reset or alter a shared/live database while following local test instructions.

Owner-directed recovery objectives (DEC-005), requiring provisioning and verification:

- Target **seven days** of point-in-time recovery and **30 days** of encrypted
  daily backups in restricted operator storage, with monitored backup success
  and deletion/expiry controls. This recovery policy is not a statutory
  employee/payroll record retention policy; do not delete live timekeeping or
  audit records when backups expire.
- Target at most **15 minutes** of data loss and a **four-hour** restore time.
  These are objectives, not measured guarantees; daily backups alone do not
  establish the 15-minute target. The hosted staging rehearsal must record
  actual RPO/RTO and owner sign-off before production use.
- Verify the selected hosted plan, actual recovery-point history, PITR
  availability, retention implementation and costs before claiming the
  objectives are achievable. Escalate unsupported capabilities or costs for
  an owner decision rather than assuming a plan provides them.
- Back up Storage objects separately; database backups contain their metadata,
  not their contents. Preserve environment configuration, migrations, auth
  redirect settings and external integration configuration through their
  respective secure recovery procedures. Custom role passwords may need
  re-provisioning. Do not copy production credentials or real customer data
  into a test project.

Staging rehearsal, to be performed only after explicit target authorisation:

1. Record the source/target project IDs, data classification, migration SHA,
   backup timestamp and intended recovery point. Verify the target is
   isolated and disposable, has no live users/data/integrations, and all
   outbound payroll and customer messaging are disabled.
2. Seed synthetic records for two tenants, scoped managers, an employee,
   immutable clocks/corrections, payroll finalisation, mapping and export
   history. Record known counts and checksums outside the target, without
   credentials or personal data.
3. Use the supported Supabase backup/restore workflow for the identified
   project and plan. Recheck the target ID at its destructive confirmation;
   never reuse a production project ID or a shared development database.
4. After restore, verify migration history, synthetic counts/checksums,
   immutable original and correction records, payroll versions and export
   deduplication. Recheck two-tenant RLS, authenticated login, permission
   revocation and idempotent retry behaviour, then readiness/metrics and
   alert delivery.
5. Record the recovery-point timestamp, start/end times, measured RPO/RTO,
   verification outputs and any restore gaps. Confirm backup expiry behaviour
   without deleting retained live backups. Obtain owner approval before any
   pilot recovery claim or cleanup of the explicit staging target.

Reference: [Supabase database backups](https://supabase.com/docs/guides/platform/backups).
Local migration replay and transactional regression results are recorded in
`IMPLEMENTATION_PROGRESS.md`; they do not substitute for this staging rehearsal.