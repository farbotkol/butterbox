# Implementation progress

## Current story

- **BB-FOUND-002 — Register and sign in:** authentication and recovery fixes
  are implemented; a fresh production build and live browser acceptance run
  are in progress against the isolated project.
- **BB-ORG-001 — Create business and first venue:** resumable setup and venue
  address collection are implemented; database tests pass and browser
  acceptance is in progress.

## Stories in progress

### BB-FOUND-002 — Register and sign in (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 002.1 Verified accounts can authenticate | Signup verification uses the configured callback; the callback exchanges the confirmation code. | A live browser run exposed the original wrong redirect and a second run exposed an internal-host redirect; both defects have been fixed and a fresh run is pending. | In Progress |
| 002.2 Wrong credentials have non-enumerating errors | Sign-in uses one generic error; password-reset requests also use a generic confirmation. | The browser test compares unknown, unverified and wrong-password responses; the complete run is pending. | In Progress |
| 002.3 Session expiry and logout work across tabs | Session-end notification and visibility refresh; sign-out errors are shown rather than reported as success. | The browser scenario covers logout in another tab and a revoked, expired session on refocus; the complete run is pending. | In Progress |
| 002.4 Password reset completes | Recovery uses the callback, changes the password and signs out before showing completion. | A real Mailpit recovery-link and password-change scenario is implemented; the complete run is pending. | In Progress |

### BB-ORG-001 — Create business and first venue (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-001.1 Setup collects business name, venue name, address and timezone | `src/app/setup/page.tsx`, `src/app/actions.ts` and `supabase/migrations/20261101040000_resumable_business_setup.sql`. | Isolated pgTAP verifies stored name, address and timezone, and rejects missing addresses and invalid timezones; browser verification is pending. | In Progress |
| ORG-001.2 Ownership is established securely | The setup RPC checks the authenticated user, serializes initial setup and creates the owner membership atomically. | Isolated pgTAP verifies ownership, anonymous denial and repeat-setup denial; authenticated browser verification is pending. | In Progress |
| ORG-001.3 Incomplete setup can be resumed | A user-scoped, RLS-protected setup draft persists partial form values and is removed when setup succeeds. | Isolated pgTAP verifies save, update, user isolation, failed-setup retention and completed-setup cleanup. A separate-browser-context resume test is pending. | In Progress |

The setup migration has been applied only to the disposable test database;
existing development and deployed databases still need the normal reviewed
migration process.

## Completed and verified

### BB-FOUND-003 — Tenant isolation (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 003.1 Tenant-owned records have an immutable business association | `supabase/migrations/20261101030000_immutable_business_associations.sql` guards all six business-scoped tables; user profiles are global identities, not business-owned records. | `tenant_isolation.test.sql` exercises every guard, including a previously movable membership and a same-business update. Six tests failed before the migration; all pass afterward. | Pass |
| 003.2 RLS and API reject cross-tenant reads and writes | Existing RLS and permission-checked RPCs plus immutable-ID triggers. | pgTAP tests reads, direct writes, RPC denial and valid own-tenant operations; `tests/tenant-isolation.integration.test.mjs` verifies authenticated HTTP reads and writes in both directions. Both pass. | Pass |
| 003.3 Automated tests cover two distinct businesses | `supabase/tests/database/tenant_isolation.test.sql`, `tests/tenant-isolation.integration.test.mjs`. | 32 new pgTAP assertions and one authenticated HTTP integration test pass with two businesses; the existing 9 pgTAP assertions also pass. | Pass |

The migration has been applied **only** to the disposable test database. Apply
it through the normal reviewed migration process before using it in another
environment. HTTP test fixtures were removed and their absence verified.

## Blocked stories

### BB-FOUND-001 — Create production-ready application (Blocked)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 001.1 Clean checkout installs and builds with documented commands | `README.md`, lockfile and `Dockerfile`. | A separate clean checkout successfully ran `npm ci`, `npm test` and `npm run build`; the container also installed and built from scratch. | Pass |
| 001.2 Environment variables have safe examples | `.env.example`, `.gitignore`, `.dockerignore` and `README.md`. | Example values are empty; a redacted Gitleaks scan of the clean checkout found no leaks. | Pass |
| 001.3 A deployment runs a health check | `src/app/api/health/route.ts`, `src/proxy.ts`, `Dockerfile` and `.github/workflows/ci.yml`. | A built container became healthy as UID 1000; `GET` returned 200 and `no-store`, `POST` returned 405, and the home page returned 200. | Pass |
| 001.4 No secrets are committed | `.gitignore` excludes local environment and Supabase CLI state. | Gitleaks found no leaks on the current branch or in the clean checkout. A scan of **all local refs** nevertheless found four Supabase key/token findings in an earlier local checkpoint commit, not reachable from the current branch. | Blocked |

Credential owners must assess/rotate any affected keys and decide how to handle
the local checkpoint history. This session did not rewrite or delete those
refs, and no secret values were printed. GitHub CI has been configured but has
not yet run remotely.

## Test environment and outcomes

- Supabase CLI 2.122.0 runs through `npx` in a separate temporary project on
  ports 55421/55422, using copied migrations. The existing Butterbox stack was
  not modified. SQL fixtures are rolled back; HTTP fixtures are cleaned up.
- `npm test`: 7 passing unit tests; the HTTP test is explicitly skipped without
  disposable-project settings and passes when run against the isolated stack.
- `npm run lint` passed after the current changes. The isolated database suite
  passes 60/60 assertions and the two-tenant HTTP integration passes.
- The previous clean-checkout build and container liveness test passed. A
  concurrent build was terminated under resource pressure; a fresh sequential
  build and browser run are in progress, so they are not yet claimed as passing.
- The test helper rejects missing disposable confirmation and non-local URLs.
- `npm audit --omit=dev` reported no production dependency vulnerabilities;
  `npm ci` reported 16 moderate development-dependency advisories.

## Outstanding defects and technical decisions

- The health endpoint is liveness only; it does not assert Supabase readiness.
- Build separate images per environment: Next.js embeds `NEXT_PUBLIC_` values
  at build time. Never use a secret/service-role key in those values.
- Stories are marked Done only after every acceptance criterion is verified.

## Next story

- Finish the combined authentication and resumable-setup browser acceptance
  test, rerun affected checks, and update the backlog only if every criterion
  is verified. Next, implement BB-FOUND-004 business and venue permissions.
