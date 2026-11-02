# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 04:08 UTC (15:08 AEDT), observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Planning
- **Current activity:** Beginning the next ready P1 operational story after completing the notification-centre criteria.
- **Progress since previous report:** BB-COMMS-002 now combines roster-publication updates with per-recipient shift-offer and manager claim-outcome notices. Its three acceptance criteria have targeted database and browser evidence. BB-SHIFTS-004 is selected next; criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected:** BB-COMMS-002 `open_shift_offers` pgTAP passed 78/78 on the acceptance database and after a clean migration replay. `roster_publication_notifications` passed 77/77 on acceptance. Two production Chromium scenarios passed: offer/claim outcome notices on mobile and the existing publication-notification flow. `tests/roster-notifications.test.mjs` passed 2/2. Production build, TypeScript, changed-file ESLint and `git diff --check` passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** BB-SHIFTS-004 has not yet been implemented or tested. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003. Offer expiry is enforced at read/response time with no background job.
- **Failing tests:** None known.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Inspect shift, eligibility and swap-related tests/helpers, then implement BB-SHIFTS-004 without weakening the two-party or manager decision requirements.
- **Latest development commit:** `a1816ee011c1c4ed2325197969f8720c36ed3af6` (status checkpoint; notification implementation is verified but not yet committed)
- **Push outcome:** Status checkpoint remote SHA matched `a1816ee011c1c4ed2325197969f8720c36ed3af6`; implementation checkpoint is pending.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
