# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:52 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SAAS-003 — Tenant onboarding and support` (Blocked for full acceptance; implementing the DEC-003 fail-closed safeguard)
- **Acceptance criteria:** Owner checklist progresses business → venue → staff → shift → publish; seeded demo data is isolated from production; inline help covers common tasks.
- **Phase:** Testing
- **Current activity:** Rechecking the production browser after tightening server-action rejection of any submitted sample-data field.
- **Progress since previous report:** Authenticated setup/tenant/invitation races passed; production split build and the signup and checklist browser scenarios passed. The mobile sample scenario passed after fixing its alert locator. A subsequent small server-action/input-validation refinement needs a fresh build and browser rerun. Application, migration and test changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Applied-migration onboarding, department RLS, setup and tenant-isolation pgTAP passed **102/102**; enabled-policy upgrade preservation passed **16/16** on each of two rolled-back disposable projects. Authenticated integrations passed **3/3**. The first production split build passed; signup and checklist browser scenarios passed, and the corrected mobile sample/accessibility scenario passed on rerun. Earlier changed-file ESLint and TypeScript passed before the latest input-validation refinement.
- **Tests intentionally deferred:** Rerun changed-file lint, TypeScript, production build and the affected signup/mobile browser scenarios after the refinement. Full browser and Node suites are not planned for this partial safeguard.
- **Remaining verification risks:** The safeguard is applied only to the disposable project; it does not prevent privileged direct table writes or schema changes, or establish an isolated hosted demo, safe outbound behavior, production historical-data provenance or clean demo conversion. The preservation guard does not prevent all privileged child-table, DDL or storage operations.
- **Failing tests:** The initial mobile test matched both the form alert and Next.js route announcer; scoping the locator to the form alert fixed the test and its rerun passed. The earlier replay role-switch failure was also corrected. Final verification of the subsequent small code refinement remains pending.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Rerun lint, type-check, split build and the affected production-browser scenarios, then document and checkpoint the partial safeguard while keeping the story Blocked. Await the separate security review.
- **Latest development commit:** `89738f8e24561dc1481252ae15c073e709a5aeb4`
- **Push outcome:** Migration-verification checkpoint `60b39d59fce610e2a9ae4faa8ae1ef261829cd1b` was pushed and matched the remote SHA; the current code remains uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
