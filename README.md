# Butterbox

Butterbox is a mobile-first workforce scheduling app for Australian hospitality
venues. This repository now contains the first runnable vertical slice:
Supabase email/password authentication, a tenant-aware owner workspace, a
fictional FOH/BOH sample team, and a weekly roster with draft shifts and
department-level publishing.

The employee experience is a responsive, installable PWA. It is not a native
Android application yet; the PWA is the current mobile foundation.

## Run locally

### Requirements

- Node.js 22.6 or newer
- npm
- Docker, for the local Supabase stack
- Supabase CLI (`npx supabase` can run the CLI without a global install)

### Start Supabase and Next.js

1. Copy `.env.example` to `.env.local`.
2. Start the local Supabase services from the repository root:

   ```sh
   npx supabase start
   npx supabase db reset
   npx supabase status -o env
   ```

3. Copy the local `API_URL` and `ANON_KEY` values from `supabase status` into
   `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The local Supabase config disables email
   confirmation so a local account can sign in immediately.
4. Install dependencies and start the web app:

   ```sh
   npm install
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000), create an account, and
   create a business and venue. Leave “Add a sample team” selected to create
   24 fictional employees and draft shifts for this week across FOH and BOH.

The SQL migration is in `supabase/migrations`. Sample data is generated
transactionally by the authenticated workspace-creation RPC; no real employee
data or credentials are included in this repository.

## Supabase configuration

The app only needs the Supabase project URL and publishable/anon key in
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put a
service-role key in browser-visible or `NEXT_PUBLIC_` configuration.

For a hosted Supabase project, apply the migration in
`supabase/migrations/20261030230000_initial_foundation.sql` using the Supabase
SQL editor or the Supabase CLI, then set the two environment variables in the
deployment environment. Keep email confirmation enabled in production and
configure the project’s allowed redirect URLs for the deployed app.

## What works today

- Supabase email/password sign-up, sign-in and sign-out.
- First-run business and venue setup, including Australian venue timezones.
- Tenant-scoped PostgreSQL tables and RLS-protected reads.
- Server-enforced owner, general-manager and department-manager checks for
  creating, deleting and publishing roster shifts.
- Draft shift creation, employee assignment, open shifts, overlap prevention,
  overnight shifts, break minutes, and weekly FOH/BOH views.
- Publishing a department’s roster and removing draft shifts.
- A responsive app shell and PWA manifest suitable for installation on Android
  or iOS.

## Not implemented yet

This is the foundation and first rostering slice, not the complete product.
Employee invitations and self-service roster views, native Android packaging,
clock-in/out, GPS and rotating QR verification, break events, availability,
shift swaps, notifications, timesheets, payroll export/integrations, billing,
audit history, and production monitoring remain future milestones. Published
shifts are intentionally read-only in this first slice; no employee change
notification workflow exists yet.

There is no claim of Australian award-rule or payroll compliance. The app does
not calculate wages, tax, superannuation, or payable time.

## Development checks

```sh
npm run lint
npm test
npx supabase test db
npm run build
```

The database test verifies sample-data creation, assigned shift creation,
overlap rejection, FOH/BOH manager scoping and tenant isolation.
