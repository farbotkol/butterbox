# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:26 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-001 — Employment rule metadata`
- **Acceptance criteria:** Maintain employment basis and award/contract references; keep unknown classifications explicit; effective-date changes.
- **Phase:** Testing
- **Current activity:** Preparing authenticated concurrency and production-browser verification for the dated metadata workflow.
- **Progress since previous report:** A forward migration fixed the employee-deletion regression without removing historical metadata. Both migrations were applied only to the identified disposable acceptance and replay projects; upgrade behavior with pre-existing metadata was also tested in a rolled-back transaction.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Seven affected pgTAP files passed **282/282** on acceptance (metadata 49, profiles 18, preferences 57, role eligibility 45, business permissions 50, tenant isolation 32, audit 31). Metadata, profiles and audit passed **98/98** on replay; the upgrade fixture passed **5/5**. Four targeted Node files passed **12/12**, and changed-file ESLint and TypeScript passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Broader regression is required when merging workstreams or preparing a release.
- **Failing tests:** None in the latest focused runs. The earlier audit deletion failure was fixed and the full affected set rerun. Authenticated concurrency and browser tests have not yet run.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Add and run authenticated same-revision race/tenant tests, build the changed route and run focused People, metadata and audit browser scenarios.
- **Latest development commit:** `de39307dcfed4b121ee8417d93622b408c0a86c9`
- **Push outcome:** Documentation checkpoint `fbbd85076473b76817d2a0b54ada8e503f4ac7f9` was pushed and its remote SHA matched. The metadata migrations, UI and tests remain uncommitted.
- **Backlog:** 109 total; 45 Done, 1 In Progress, 4 Blocked, 59 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
