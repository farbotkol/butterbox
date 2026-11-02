# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:43 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy`
- **Acceptance criteria:** Point-in-time location by default; document visibility and retention; provide employee access and correction; preserve required employment records.
- **Phase:** Coding
- **Current activity:** Implementing a paginated, self-only attendance history and documenting actual visibility and retention limits.
- **Progress since previous report:** Location checking defaults off and uses a point-in-time request; raw device coordinates are not stored. Employees can submit corrections and see decisions but cannot browse all ordinary historical events in the UI. Application users cannot delete businesses, while privileged business deletion cascades records. No approved statutory retention/deletion policy has been established.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** No BB-RULES-005 tests have run in this story yet. For the completed metadata story, seven affected pgTAP files passed **282/282** on acceptance, replay passed **98/98**, the upgrade fixture passed **5/5**, race/tenant integration passed **1/1**, targeted Node tests passed **13/13**, and four browser scenarios, lint, TypeScript and the split build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. Legal guidance lookup timed out; no compliance claim is made. The legacy employment-type field can become stale when a future metadata event takes effect. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the final BB-RULES-001 selected runs. BB-RULES-005 has not yet been tested.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Add a self-only scoped history RPC and page, document known retention behavior and run focused tenant, location, correction, preservation and mobile checks.
- **Latest development commit:** `43ab17e9b03927f83db530a30f97df20cd58efd6`
- **Push outcome:** Story-start checkpoint `16e4ae6b55a272078c98bd4cff2d16fd29240e96` was pushed; the remote SHA matched.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 4 Blocked, 58 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
