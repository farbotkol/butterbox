# Butterbox hosted Development database deployment

## Purpose

The hosted Supabase project **Butterbox Dev Project** (`crnstaknwervwjvbtabp`) is the development/test database. It is not a customer production database. Its schema is defined by versioned SQL files in `supabase/migrations/`.

The `Deploy Supabase migrations - Development` GitHub Actions workflow is the **only new hosted-database writer** supplied by this change. The existing Verify workflow continues to test migrations against a disposable local Supabase instance, and Phase 2 continues to enforce the existing PR and CI merge gates. Never give a PR job hosted database credentials.

## One-time GitHub setup (required before first run)

1. In GitHub, open `farbotkol/butterbox` → **Settings → Environments**, and create an environment named **`butterbox-development`**. Limit deployment branches to `copilot/Development` if the available environment protection rules support it. Do not require approvals if truly unattended operation is desired; use approvals if you want an explicit initial rollout gate.
2. In that environment's **Secrets**, add:
   - `SUPABASE_ACCESS_TOKEN`: personal access token from Supabase account settings, authorised for the Butterbox Development project.
   - `SUPABASE_DB_PASSWORD`: the *database password* for Butterbox Dev Project. This is not the anon/publishable key and not the service-role key.
3. Do not commit these secrets, paste them into issues, or use Vercel's public environment variables. Keep Supabase production credentials completely separate.
4. Check Supabase → Database → Migrations and Tables; the initial migration set may already have been installed manually. The CLI tracks applied migration versions and should apply only pending versions. Always inspect the first deployment logs for errors.

## Running and observing

The workflow runs following a **successful Phase 2 merge workflow**; because GitHub native auto-merge may complete asynchronously, it also checks the latest approved `copilot/Development` commit every 30 minutes. It can be run manually through **Actions → Deploy Supabase migrations - Development → Run workflow**.

Each invocation checks out the **current** `copilot/Development` branch, links only to the fixed development project reference, and runs the pinned CLI `supabase db push --linked --yes`. A dedicated concurrency group serialises hosted migration attempts and does **not** cancel in-flight runs. GitHub's versioned migration history makes repeated reconciliations idempotent. A failure is visible as a failed workflow and must be investigated; the workflow must not reset the database, seed it, apply `db push --include-all`, or force a migration.

**Important scope:** A successful GitHub PR CI run does not prove that the hosted migration deployment succeeded. Check the specific hosted deployment run separately before testing a feature that depends on new schema. Likewise, this workflow does **not yet gate Vercel's automatic application deployment**. A subsequent deployment-order change should hold application release until migrations succeed, or ensure application changes are backwards compatible.

## Recovery and security

- This workflow deploys only from the approved shared branch, never from a Copilot PR branch.
- If a run fails, read the Actions job output; correct the migration or credentials through a reviewed PR, then rerun. Do not reset an existing hosted project.
- A migration that breaks the hosted schema may require a forward corrective migration. A Git revert alone doesn't roll back applied database migrations.
- The development environment should hold synthetic or test-only data, not live customer or payroll information.
- Set up separate projects, keys and a release process before any production deployment.
