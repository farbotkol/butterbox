# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 04:18:18 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Coding
- **Current activity:** Implementing the swap transaction, participant consent, scoped manager review, notifications and publication/acknowledgement handling.
- **Progress since previous report:** The uncommitted swap migration defines a two-party workflow, scoped review and notification RPCs, transactional eligibility checks, audit events and publication snapshots. Existing acknowledgements are retained, but a reassigned shift requires a new acknowledgement. Application interfaces and acceptance tests are still outstanding. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected:** The new swap migration passed a syntax/DDL check in a rolled-back transaction on the isolated acceptance database. An initial run failed because the linked-worker column name was wrong; it was corrected and the check passed. No swap acceptance tests have yet run. Previous BB-COMMS-002 results remain recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Swap code is unverified and has no interface yet; existing acknowledgement and publication workflows require targeted regression. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** No swap acceptance tests have run; the first rolled-back DDL check failed and passed after the column-name fix.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Apply the migration to the identified disposable acceptance project, add targeted pgTAP tests, then build the participant and manager interfaces.
- **Latest development commit:** `47bfab03a81bbea5ab9dedd732f77ab0c3bc6a4f`
- **Push outcome:** Remote SHA matched `47bfab03a81bbea5ab9dedd732f77ab0c3bc6a4f`.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
