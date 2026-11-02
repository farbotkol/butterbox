# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:18 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-001 — Employment rule metadata`
- **Acceptance criteria:** Maintain employment basis and award/contract references; keep unknown classifications explicit; effective-date changes.
- **Phase:** Coding
- **Current activity:** Wiring the dated metadata editor and existing People workflow to the new scoped history.
- **Progress since previous report:** Implemented an uncommitted forward migration and pgTAP suite: append-only effective-dated records, explicit unknown values, revisions, scoped reads/writes, profile-edit compatibility and audit events. The migration and tests were rolled back after isolated validation; no database change was retained.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Rolled-back isolated pgTAP passed employment metadata **47/47** and the existing employee-profile regression **18/18**. For the completed swap story, isolated pgTAP passed **354/354 assertions**, the race/tenant integration **1/1**, Node **14/14**, five targeted browser scenarios, changed-file ESLint, TypeScript and split production build.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Broader regression is required when merging workstreams or preparing a release.
- **Failing tests:** None in the latest database runs. UI, authenticated concurrency and browser tests for the new story have not yet run.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Implement the People integration and dated metadata editor, then apply the migration only to the verified disposable project and run focused end-to-end checks.
- **Latest development commit:** `de39307dcfed4b121ee8417d93622b408c0a86c9`
- **Push outcome:** Swap feature `de39307dcfed4b121ee8417d93622b408c0a86c9` and documentation checkpoint `90564660e28f8dcf44f8b9ccd1dd885a904717b1` were pushed; each remote SHA matched. The metadata migration and test remain uncommitted.
- **Backlog:** 109 total; 45 Done, 1 In Progress, 4 Blocked, 59 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
