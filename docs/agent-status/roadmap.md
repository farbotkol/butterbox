# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 10:02 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ROSTER-009 — Roster approval workflow`
- **Acceptance criteria:** Owner chooses direct or approval publication; reviewer sees changes; approval/rejection is scoped and audited.
- **Phase:** Planning
- **Current activity:** Designing an optional review flow around the existing scoped publication, conflict checks, snapshots and notifications.
- **Progress since previous report:** `BB-RULES-005` personal-history and disclosure changes were committed and pushed as `a98b1ad18abc69cf12f442e9a38db26028b46a58`. Its preservation criterion remains blocked; this independent roster story is a prerequisite for actionable approval defaults.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** No `BB-ROSTER-009` tests run yet. For the previous privacy checkpoint, history/corrections/tenant pgTAP passed **137/137** after the access fix, final history passed **22/22** on replay, four Node files passed **12/12**, and six targeted browser scenarios, changed-file ESLint, TypeScript and the split production build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Roster review must prevent direct-publication bypass and stale approval without changing existing publication notifications or delegated scope. Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. No compliance claim is made. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the latest focused runs. A manager unlink test exposed an access defect and now passes after a forward migration. A browser bulk-insert fixture and the replay Auth helper were corrected without weakening assertions.
- **Blockers requiring owner intervention:** RULES-005 approved record retention/deletion and recovery policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Define the review snapshot, scoped reviewer checks and concurrency-safe publication gate; implement and test the database transaction first.
- **Latest development commit:** `a98b1ad18abc69cf12f442e9a38db26028b46a58`
- **Push outcome:** Feature checkpoint `a98b1ad18abc69cf12f442e9a38db26028b46a58` was pushed; the remote SHA matched.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 5 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
