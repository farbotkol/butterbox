# Butterbox hosted Development database deployment

## Purpose

The hosted Supabase project **Butterbox Dev Project** (`crnstaknwervwjvbtabp`) is the development/test database, not customer production. Its schema is defined by versioned SQL files in `supabase/migrations/`.

The `Deploy Supabase migrations - Development` workflow is an optional hosted-database writer. **It runs only after GitHub receives a successful deployment status for the `copilot/Development` revision in the Vercel Preview environment.** It does **not** run every 30 minutes, on PR merges alone, after Phase 2 workflow success alone, or on manual dispatch.

This ordering is the owner's explicit choice: successful **application deployment first**, followed by pending **Development Supabase** migrations. It is not a database-before-application release gate. Application changes must be backward compatible with the old database schema during deployment.

## One-time setup and event prerequisite

1. Confirm the approved hosted Supabase development project is **Butterbox Dev Project** (`crnstaknwervwjvbtabp`). Do not substitute a production, public showcase or local database.
2. In GitHub `farbotkol/butterbox` → **Settings → Environments**, create `butterbox-development` and configure its secrets:
   - `SUPABASE_ACCESS_TOKEN`: account token authorised for the Development project;
   - `SUPABASE_DB_PASSWORD`: the Development project's database password, not an anon or service-role key.
3. Keep these secrets out of repository files, issues and public Vercel variables. Configure the environment's deployment restrictions to match the chosen event-based workflow without granting production access.
4. **Validate the deployment event integration before rollout.** GitHub must receive a `deployment_status` event from the Vercel integration with `state=success`, `deployment.ref=copilot/Development` and `deployment.environment=Preview`. Some Vercel integrations provide only check runs instead of GitHub Deployment Status events, or use a different environment/ref label. If those properties are not emitted, this workflow intentionally **does nothing**. Inspect a real, non-production successful deployment's GitHub metadata and adapt the verified event mapping in a reviewed PR. Never broaden the trigger to production or unrelated environments just to make it fire.
5. Confirm the initial remote migration history and schemas. The current database may already contain migrations applied manually. Inspect any mismatches rather than forcibly replaying them.

## Exact trigger and deployment behaviour

The workflow uses `on: deployment_status`, with a job guard for successful `Preview` deployments whose GitHub deployment ref is exactly `copilot/Development`.

It checks out **the successfully deployed SHA** (not the newest head), verifies that it remains in the Development branch history, then runs the pinned `supabase@2.122.0` CLI to link only to the fixed Development project and apply pending versioned migrations with `db push --linked --yes`. GitHub Actions concurrency serialises changes with `cancel-in-progress: false`. The Supabase migration history prevents repeated versions from being reapplied.

A failed Vercel deployment, failed PR CI, unsuccessful merge, ordinary scheduled interval or unrelated deployment does not authorize migration processing. The workflow does not reset/seed a hosted database, force schema changes or deploy production migrations.

**Important limitation:** The GitHub workflow's successful execution means the migration command succeeded, not that an application deployment had no runtime problems after it reached `success`. Conversely, a GitHub check labelled successful is **not automatically** a GitHub `deployment_status` event. Confirm the trigger receives the intended event before relying on it.

## Verification and recovery

- Review and merge the workflow PR only after checking the actual deployment-status event metadata and target credentials. The first hosted database deployment has **not** been run or verified.
- On a successful Vercel Preview deployment of `copilot/Development`, confirm a new GitHub Actions run appears, inspect the deployed SHA and migration history, and check the exact target project.
- On failure, read GitHub Actions logs and correct credentials or create a reviewed forward migration. A Git revert does not undo applied SQL migrations. No reset of the hosted project is permitted.
- If an event is lost, produce a verified new successful deployment to retrigger reconciliation, or add a separately reviewed safe manual recovery mechanism. There is intentionally no periodic backup trigger.
- Test and synthetic data only; never reuse production credentials or touch either existing local/public showcase.
