# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 19:35 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-DEMO-001 — Isolated synthetic showcase café` (In Progress; environment implementation)
- **Acceptance criteria:** Dedicated verified isolated environment; 12–15 fictional FOH/BOH staff; realistic availability/roster/attendance/correction/approved CSV; no real data, messages/payroll or unidentified seeding.
- **Phase:** Debugging
- **Current activity:** Correcting email/password login configuration while keeping global public signup disabled; only the new showcase stack stopped with volumes preserved.
- **Progress since previous report:** Added 14-person FOH/BOH fixture planner, private account inventory, scoped seed and explicit guarded reset. Twelve Node tests passed. First seed exposed unsupported attendance shift_id (removed); verified synthetic reset completed but a transient readiness check failed, then empty-state recovery preserved the prior inventory. Second seed created fictional accounts/rosters/original attendance but owner sign-in failed because email provider login was disabled. No real data/messages/payroll used. Approximately 30 GB free disk.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Environment/fixture Node tests 12/12 and changed-file ESLint passed before latest restart support; rerun pending. Prior TypeScript and focused pgTAP 74/74 passed. Actual reset produced empty Auth/business data; prior state archived privately. Stop preserved verified volume identities. Owner password login currently failed; correction/approval/CSV steps not yet executed.
- **Tests intentionally deferred:** Final fixture/permission/browser/reset-repeatability/active-egress checks pending corrected Auth; no full unrelated regressions or production build (no app code changed).
- **Remaining verification risks:** Standard local database password, no production/shared-host isolation claim. Reviewer port API 403; remote access unverified. Fixture creation incomplete; no app simulation banner or successful approved CSV. Final identity approval outstanding.
- **Documentation:** Updated operator README for the tested empty backend; user guidance not applicable yet (no new app workflow).
- **Failing tests:** Actual fixture seed: owner password login disabled by auth.email.enable_signup=false. Global auth.enable_signup must remain false. New reset readiness retries and volume-provenance restart support pending final verification.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Enable email provider login only, restart against exact preserved volume identities, verify signup remains denied, reset/reseed the known synthetic fixture and finish corrections/approvals/CSV.
- **Latest development commit:** `c61725d4239438c0c8fb8ea407087bd8f74944a5`
- **Push outcome:** Verified empty backend milestone pushed; `git ls-remote` matched exact SHA. Fixture/restart additions remain uncommitted pending runtime verification.
- **Backlog:** 127 total; 53 Done, 1 In Progress, 6 Blocked, 67 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
