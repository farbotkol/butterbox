# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:14 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-001 — Employment rule metadata`
- **Acceptance criteria:** Maintain employment basis and award/contract references; keep unknown classifications explicit; effective-date changes.
- **Phase:** Coding
- **Current activity:** Implementing an append-only, scoped employment-metadata history and compatible date-aware employee-profile workflow.
- **Progress since previous report:** Existing employee employment types are undated and default to casual, so they cannot establish historic classifications or award/contract details. The design keeps unknown values explicit, preserves legacy edits, records future and corrected versions, and avoids inventing historical facts. The story is a prerequisite for the separate Award Central workstream.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** No `BB-RULES-001` tests run yet. For the completed swap story, isolated pgTAP passed **354/354 assertions**, including swap **67/67** on both acceptance and fresh-replay projects; the race/tenant integration passed **1/1**, Node **14/14**, five targeted browser scenarios, changed-file ESLint, TypeScript, diff check and split production build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Broader regression is required when merging workstreams or preparing a release.
- **Failing tests:** None in the latest swap runs; no tests for the new story have run.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Implement the migration and focused pgTAP tests, then wire the existing People workflow and a dated metadata editor.
- **Latest development commit:** `de39307dcfed4b121ee8417d93622b408c0a86c9`
- **Push outcome:** Swap feature `de39307dcfed4b121ee8417d93622b408c0a86c9` and documentation checkpoint `eb20761614f30c41b48742bd90190d421d65e240` were pushed; each remote SHA matched.
- **Backlog:** 109 total; 45 Done, 1 In Progress, 4 Blocked, 59 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
