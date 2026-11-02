# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 10:00 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy`
- **Acceptance criteria:** Point-in-time location by default; document visibility and retention; provide employee access and correction; preserve required employment records.
- **Phase:** Blocked
- **Current activity:** Checkpointing verified personal-history and visibility changes; preparing to select an independent ready core story.
- **Progress since previous report:** The production history scenario and five related browser scenarios passed. A manager-profile unlink regression was found and fixed with a forward-only migration; the focused database and browser checks passed afterward. The preservation criterion remains blocked on an approved retention/deletion policy and hosted recovery.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Seven affected pgTAP files passed **410/410** on acceptance before the access fix. History, corrections and tenant isolation passed **137/137** after it; final history passed **22/22** on replay. History, corrections and location previously passed **174/174** on replay using the identical Auth helper only in rolled-back transactions. Four focused Node files passed **12/12**; six targeted browser scenarios, changed-file ESLint, TypeScript and the split production build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. Legal guidance lookup timed out; no compliance claim is made. The legacy employment-type field can become stale when a future metadata event takes effect. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the latest focused runs. A manager unlink test exposed an access defect and now passes after a forward migration. A browser bulk-insert fixture and the replay Auth helper were corrected without weakening assertions.
- **Blockers requiring owner intervention:** RULES-005 approved record retention/deletion and recovery policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Scan and push the verified partial checkpoint, investigate `BB-ORG-006` prerequisites, and start an independent ready core story.
- **Latest development commit:** `43ab17e9b03927f83db530a30f97df20cd58efd6`
- **Push outcome:** Progress checkpoint `7554896e91213b42b8f794a71c0d70a1587b4d90` was pushed; the remote SHA matched. The personal-history feature is not yet committed.
- **Backlog:** 109 total; 46 Done, 0 In Progress, 5 Blocked, 58 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
