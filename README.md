# Butterbox

A venue-first workforce tool for Australian hospitality. This increment delivers
an authenticated, tenant-aware foundation and a usable weekly FOH/BOH roster—not
the entire product roadmap.

## Run locally in two minutes

Requires **Node.js 24+** and npm.

```sh
npm ci
cp .env.example .env.local
```

Set `BUTTERBOX_DEMO=true` in `.env.local`, then:

```sh
npm run dev
```

Open <http://localhost:3000>. Local demo accounts all use `butterbox-demo`:

| Account | Access |
| --- | --- |
| `owner@demo.butterbox.test` | Entire fictional café |
| `foh@demo.butterbox.test` | Front of House only |
| `boh@demo.butterbox.test` | Back of House only |
| `employee@demo.butterbox.test` | Own published shifts only |

These are intentionally public **local test credentials**, not real accounts.
Demo mode is disabled in production and on Vercel. Do not expose the development
server publicly or put real employee information in the demo database.

The fictional Little Wattle Café has 24 employees across FOH/BOH, with draft,
published and unassigned shifts. Demo writes persist in the gitignored
`.local/butterbox.sqlite`. Stop the server and delete `.local` to reset. Session
tokens are random, hashed at rest, HTTP-only, revocable and expire after eight
hours. Demo login attempts are rate limited. This SQLite implementation is a
local test double, **not** a production alternative to Supabase.

## Supabase setup

1. Create a Supabase project, selecting an Australian region where available.
   Verify the actual database, authentication, backup and email data residency
   with your providers; a region selection alone is not a residency guarantee.
2. Apply the SQL files in `supabase/migrations` in filename order, using the
   Supabase SQL editor or the Supabase CLI migration workflow. Do not run these
   against an unrelated existing database without reviewing them.
3. Set `BUTTERBOX_DEMO=false` and provide `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. These are public client
   configuration. **Never provide a service-role key to the application.**
4. Create an email/password user in Supabase Authentication and confirm their
   email. Sign in at `/login`.
5. An authenticated user without membership reaches `/setup`. Explicitly choose
   **Create fictional café** to provision a sample business, owner membership,
   departments, roles, 24 fictional employees and roster. This is sample
   provisioning, not a finished production business-onboarding flow.
6. To test isolation, create a second confirmed auth user and repeat setup.
   Each gets an independent business. Hosted auth passwords are never seeded.

For local Supabase, use `supabase start`, `supabase db reset`, and the URL/key
reported by the CLI. `supabase/config.toml` and `supabase/seed.sql` are supplied.
Docker and an independently installed Supabase CLI are required for this path.
The SQL tests use PostgreSQL assertions rather than pgTAP; run them with `psql`
as shown below.

### Provisioning additional access

Self-service invitations and membership administration UI are **not implemented**.
Until they exist, an administrator must provision confirmed auth users through
trusted SQL tooling. Use the existing sample owner/business as a reference:

- Add a `user_profiles` row for the auth user.
- Add `business_memberships` with `owner`, `general_manager`,
  `department_manager` or `employee`.
- Add `venue_memberships` for every assigned venue.
- Department managers need `department_memberships` for each managed department.
- Employees need an `employees.user_id` link to their auth user and
  `employee_department_roles` entries for eligible departments/roles.
- `role_permissions` is business-specific. Managers need `manage_roster` to
  mutate drafts and `publish_roster` to publish; owners have full roster access.

Do not grant direct table-write access to browser clients. Membership and
permission editing is intentionally not exposed through a privileged public API.
The initial UI chooses the user's first business membership; business switching
is future work. Venue/department filters operate within that business.

## What works

- Supabase email/password sign-in, session refresh and sign-out.
- Responsive cream/green dashboard, weekly roster and team directory.
- Owner-wide, venue-scoped general manager, department manager and employee
  server-side access boundaries.
- Venue, department and week filtering.
- Draft shift creation, optimistic edits and deletion; role/employee eligibility.
- Unassigned shifts, scheduled breaks, cross-midnight shifts and UTC storage with
  venue-timezone input/display. Nonexistent or ambiguous DST wall times require
  choosing an unambiguous time rather than silently selecting an offset.
- Transactional overlap prevention, including conflicts hidden by department
  access rules.
- Department/week publication; employees see only their own published roster.
- Audit records for roster mutations and publication.
- Dashboard counts derived from stored **scheduled** shifts, not fake attendance.
- Web app manifest and icon. There is no service worker/offline data cache;
  authenticated workforce data is not cached for offline use.

Scheduled break minutes inform the roster hours summary only. They are **not**
actual breaks, timesheets or payroll deductions. No award compliance is claimed.
Published shifts cannot yet be edited, cancelled or reassigned.

## Architecture and security

Next.js App Router, React, strict TypeScript, Tailwind and Lucide form a modular
monolith. Accessible native controls keep this first slice lightweight; a full
shadcn component system has not been introduced. Server actions validate inputs
with Zod. `src/lib/domain.ts` defines the shared contract;
`src/lib/workspace.ts` resolves authenticated membership and loads RLS-filtered
data. The browser never supplies trusted business identity.

Supabase uses only the signed-in user's credentials. RLS protects reads, scoped
security-definer RPCs protect roster writes, composite foreign keys prevent
cross-tenant references, and a PostgreSQL exclusion constraint serialises
overlapping employee assignments. Database checks are authoritative; hiding
controls is not an authorisation mechanism. Original hosted roster changes are
recorded in audit logs. The SQLite test double checks the same scope/eligibility
rules within write transactions, but is not evidence that hosted RLS has run.

Next.js server actions supply same-origin mutation protection. Passwords and
tokens are not logged. Production cookies are managed by Supabase SSR;
authentication rate limits and email delivery are configured in Supabase.
Authenticated pages are not shared-cacheable. Security headers deny framing and
MIME sniffing. Before public launch, add distributed business-operation rate
limits, a reviewed CSP, abuse monitoring, MFA/recovery policies, retention rules
and a full security assessment.

## Validation

```sh
npm test             # Node's built-in runner: permissions, persistence and roster rules
npm run lint
npm run typecheck
npm run build
# Requires a running, migrated local Supabase stack; use its local DB password.
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X \
  -v ON_ERROR_STOP=1 -f supabase/tests/roster.sql
```

SQL isolation tests are separate from the SQLite/unit tests. Neither substitutes
for exercising a hosted project with its real auth configuration.

## Deployment

Deploy to Vercel with Node.js 24 and the two public Supabase environment
variables, `BUTTERBOX_DEMO=false`, and the migrations applied first. Configure
Supabase's Site URL and allowed redirect URLs for your deployment. No live
billing, payroll credentials or email-provider secrets are needed for this slice.
`npm run build && npm start` also serves the production application locally, but
requires Supabase; it intentionally does not allow demo credentials.

Before a real café pilot: configure backups/PITR as appropriate to your Supabase
plan; perform and record an actual restore drill in a separate environment;
define access reviews, incident response, employee privacy notices and retention
procedures. Backups and seven-year employment-record retention are **not**
implemented or validated by this repository.

## Remaining roadmap

Milestone 1 is an initial foundation, not a complete production release.
Outstanding work includes invitations and employee editing, configurable
permission-management UI, roster approval routing, drag/drop, availability
checks, templates, minimum staffing, acknowledgements and change notifications.
Attendance/GPS/rotating QR, actual breaks, timesheets/corrections/approvals,
payroll CSV and provider integrations, open-shift claims/swaps, announcements,
scenario workflows, billing, background jobs, push/email delivery, comprehensive
end-to-end automation and production hardening are **not implemented**.

No dashboard metric should be interpreted as clocked-in presence, actual worked
hours, labour cost or payroll readiness.
