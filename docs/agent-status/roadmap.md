# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:23 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-001 — Employment rule metadata`
- **Acceptance criteria:** Maintain employment basis and award/contract references; keep unknown classifications explicit; effective-date changes.
- **Phase:** Debugging
- **Current activity:** Fixing an employee-deletion regression while retaining immutable employment history.
- **Progress since previous report:** The uncommitted migration was applied to the verified disposable acceptance project and the People/editor code was added. Focused database tests found that deleting an employee with metadata is blocked by the history's cascade; the existing audit regression correctly exposed this defect.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** On the migrated disposable project, six focused pgTAP files passed **249/249** assertions (metadata 47, profiles 18, preferences 57, role eligibility 45, business permissions 50, tenant isolation 32); the audit test aborted on the deletion defect. Four targeted Node files passed **12/12**, and changed-file ESLint and TypeScript passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Broader regression is required when merging workstreams or preparing a release.
- **Failing tests:** `sensitive_action_audit.test.sql` aborted because employee deletion tried to cascade-delete immutable metadata. UI, authenticated concurrency and browser tests have not yet run.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Add a forward-only migration that preserves metadata when a profile is deleted, then rerun the audit and metadata suites before browser/integration testing.
- **Latest development commit:** `de39307dcfed4b121ee8417d93622b408c0a86c9`
- **Push outcome:** Documentation checkpoint `e40593d2f8c9ec100b9001f100e51a4cd1e40b88` was pushed and its remote SHA matched. The metadata migration, UI and tests remain uncommitted.
- **Backlog:** 109 total; 45 Done, 1 In Progress, 4 Blocked, 59 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
