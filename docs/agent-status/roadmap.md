# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:48 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SAAS-003 — Tenant onboarding and support` (Blocked for full acceptance; implementing the DEC-003 fail-closed safeguard)
- **Acceptance criteria:** Owner checklist progresses business → venue → staff → shift → publish; seeded demo data is isolated from production; inline help covers common tasks.
- **Phase:** Testing
- **Current activity:** Testing authenticated setup races, tenant isolation and the production browser after applying the additive safeguard only to the verified disposable acceptance project.
- **Progress since previous report:** The Supabase CLI applied and recorded `20261103140000` in `butterbox-acceptance` (API 55421, DB 55422). Rollback-only upgrade rehearsals started with the policy enabled and verified the original sample business, venues, departments, staff, roles and shifts were unchanged. Application, migration and test changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Applied-migration onboarding, department RLS, setup and tenant-isolation pgTAP passed **102/102** assertions. Enabled-policy upgrade preservation passed **16/16** on acceptance and **16/16** in the separately verified, rolled-back replay project. Changed-file ESLint and TypeScript passed. Earlier rolled-back onboarding/RLS preflight passed **51/51**.
- **Tests intentionally deferred:** Authenticated race/tenant integrations, production build and focused browser/accessibility checks are pending. Full browser and Node suites are not planned for this partial safeguard.
- **Remaining verification risks:** The safeguard is applied only to the disposable project; it does not prevent deliberate privileged DDL changes or establish an isolated hosted demo, safe outbound behavior, production historical-data provenance or clean demo conversion. The preservation guard does not prevent all privileged child-table, DDL or storage operations.
- **Failing tests:** The first replay attempt could not switch from `postgres` to `supabase_admin`; the connection rolled back without changes. Connecting directly as the isolated administrative test role fixed the setup, and the rerun passed. No current assertion failures.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Run the targeted authenticated setup/tenant/race integrations and serialized production-browser/accessibility checks; address any failures and keep the story Blocked. Await the separate security review.
- **Latest development commit:** `89738f8e24561dc1481252ae15c073e709a5aeb4`
- **Push outcome:** Preflight checkpoint `907b49f874e9940b8be817a8216d82c8e6e1a6a5` was pushed and matched the remote SHA; the current code remains uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
