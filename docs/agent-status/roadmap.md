# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:09 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-001 — Employment rule metadata`
- **Acceptance criteria:** Maintain employment basis and award/contract references; keep unknown classifications explicit; effective-date changes.
- **Phase:** Planning
- **Current activity:** Recovering existing employee schema, permissions, editing workflow and relevant tests before designing the P0 metadata history.
- **Progress since previous report:** `BB-SHIFTS-004` passed all four criteria and was committed and pushed. Expanded pgTAP verified publications and acknowledgements across two roster weeks. The next core story is a prerequisite for the separate Award Central workstream.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** No `BB-RULES-001` tests run yet. For the completed swap story, isolated pgTAP passed **354/354 assertions**, including swap **67/67** on both acceptance and fresh-replay projects; the race/tenant integration passed **1/1**, Node **14/14**, five targeted browser scenarios, changed-file ESLint, TypeScript, diff check and split production build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Broader regression is required when merging workstreams or preparing a release.
- **Failing tests:** None in the latest swap runs; no tests for the new story have run.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Inspect employee records, existing authorisation and tests; design explicit unknown and effective-dated history without duplicating Award Central.
- **Latest development commit:** `de39307dcfed4b121ee8417d93622b408c0a86c9`
- **Push outcome:** The swap feature was pushed and the remote development ref matched `de39307dcfed4b121ee8417d93622b408c0a86c9`.
- **Backlog:** 109 total; 45 Done, 1 In Progress, 4 Blocked, 59 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
