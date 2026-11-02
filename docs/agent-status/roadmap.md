# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:45 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SAAS-003 — Tenant onboarding and support` (Blocked for full acceptance; implementing the DEC-003 fail-closed safeguard)
- **Acceptance criteria:** Owner checklist progresses business → venue → staff → shift → publish; seeded demo data is isolated from production; inline help covers common tasks.
- **Phase:** Testing
- **Current activity:** Verifying the additive sample-seeding safeguard, clean setup and preservation of historical data before applying the migration to the disposable project.
- **Progress since previous report:** Drafted a forward migration, setup changes and focused tests. The policy cannot be enabled through ordinary operator updates, both historical seed entry points fail closed, and the migration is designed to leave existing sample records untouched; preservation replay is pending. These changes remain uncommitted and have not been applied outside rolled-back preflight transactions.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Rolled-back preflight passed **42/42** onboarding/authorization assertions and **9/9** tenant/department RLS assertions against the verified disposable acceptance database. At the preceding RULES-005 checkpoint, **2,483/2,483** pgTAP assertions across **53** files, **25/25** authenticated integrations, targeted browser checks, changed-file lint, TypeScript and split production build passed.
- **Tests intentionally deferred:** Upgrade replay, applied-migration checks, authenticated race/tenant integration, changed-file lint, TypeScript, production build and focused browser/accessibility checks are still pending. Full browser and Node suites are not planned for this partial safeguard.
- **Remaining verification risks:** The safeguard is not yet applied; it does not prevent deliberate privileged DDL changes or establish an isolated hosted demo, safe outbound behavior, production historical-data provenance or clean demo conversion. The preservation guard does not prevent all privileged child-table, DDL or storage operations.
- **Failing tests:** None in the new rolled-back preflight. Previously reported fixture, browser-runner and replay issues were corrected at the preceding checkpoint.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Rehearse an upgrade from an enabled policy with existing sample records, apply the migration only to the verified disposable acceptance project, run targeted integration and production-browser checks, and keep the story Blocked. Await the separate security review.
- **Latest development commit:** `89738f8e24561dc1481252ae15c073e709a5aeb4`
- **Push outcome:** Planning checkpoint `8e7012002a15bc033c5d09156e411d7f36aa0a94` was pushed and matched the remote SHA; the current code remains uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
