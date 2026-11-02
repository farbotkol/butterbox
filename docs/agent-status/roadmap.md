# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:29 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-001 — Employment rule metadata`
- **Acceptance criteria:** Maintain employment basis and award/contract references; keep unknown classifications explicit; effective-date changes.
- **Phase:** Testing
- **Current activity:** Building the changed route and running the focused production-browser scenario.
- **Progress since previous report:** The authenticated integration now passes: concurrent metadata/profile edits serialize by revision, identical retries deduplicate, and live role revocation and tenant/department denials are enforced. The employee-deletion regression remains fixed.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Seven affected pgTAP files passed **282/282** on acceptance; metadata, profiles and audit passed **98/98** on replay; the upgrade fixture passed **5/5**. The authenticated race/revocation/tenant integration passed **1/1**. Four targeted Node files passed **12/12**, and changed-file ESLint and TypeScript passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Broader regression is required when merging workstreams or preparing a release.
- **Failing tests:** None in the latest focused runs. The earlier audit deletion failure was fixed and the affected set rerun. Production build and browser tests have not yet run.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Run the split production build and focused metadata, People and audit browser scenarios; fix and rerun any failures.
- **Latest development commit:** `de39307dcfed4b121ee8417d93622b408c0a86c9`
- **Push outcome:** Documentation checkpoint `649c4877b6a7a6f39685ce776280d470bcba5cc9` was pushed and its remote SHA matched. The metadata migrations, UI and tests remain uncommitted.
- **Backlog:** 109 total; 45 Done, 1 In Progress, 4 Blocked, 59 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
