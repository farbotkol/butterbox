# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 08:45 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Debugging
- **Current activity:** Repairing the recovered swap approval transaction using a new forward-only migration; the existing committed migration will be preserved.
- **Progress since previous report:** Restart recovery found `20261103050000_shift_swap_requests.sql` and `shift_swaps.test.sql` committed and pushed in `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`. Local, fetched and remote SHAs matched; the worktree was clean. The identified disposable `butterbox-acceptance` database (API 55421, DB 55422) is healthy and has that migration applied. No swap UI references were found. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected:** The first recovered `shift_swaps.test.sql` execution on the isolated acceptance database reached 23 passing assertions and 10 failing assertions before a subsequent SQL error stopped it. The root approval failure is an invocation of nonexistent `public.lock_shared_worker_links(uuid)`; several later failures cascade from approval not occurring. The previous rolled-back DDL check passed but did not exercise these paths. Previous BB-COMMS-002 results remain recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Swap code is unverified and has no interface yet; existing acknowledgement and publication workflows require targeted regression. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** Swap pgTAP approval, reassignment, publication and acknowledgement paths currently fail as described above; the suite is incomplete and is not accepted.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Align approval locking with the existing scheduling helpers in a new migration, rerun and repair the complete swap pgTAP suite, then build participant, manager and notification interfaces.
- **Latest development commit:** `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`
- **Push outcome:** Local, fetched and remote branch SHA matched `9ec5e6f033e8e95e1d17624beb7c7f5d38321604` at recovery.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
