# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 18:04 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-006 — Late, missing and no-show alerts` (In Progress)
- **Acceptance criteria:** Configurable thresholds; duplicate alerts suppressed; acknowledgement and resolution auditable; unpublished shifts excluded.
- **Phase:** Coding
- **Current activity:** Writing focused database acceptance tests before applying the uncommitted alert migration.
- **Progress since previous report:** Traced published shifts, effective attendance corrections and scoped manager permissions. The proposed migration adds disabled-by-default venue settings, an isolated scheduled worker, deduplicated alerts and append-only review events. Its rollback-only DDL preflight passed; no database objects or scheduler were left installed.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** ATTEND-006 migration DDL preflight passed inside a rolled-back transaction on the identified disposable project; the ledger remained at `20261103160000` and pg_cron is not installed. No acceptance assertions have run for this story. The preceding QR feature passed **62/62** focused pgTAP, five authenticated integrations, **8/8** Node checks, changed-file ESLint and TypeScript, a split production build and **3/3** browser scenarios.
- **Tests intentionally deferred:** ATTEND-006 database, authorization, duplicate/concurrency and browser checks will be selected after design. Full repository suites were not rerun; broader migration/security regression remains appropriate at workstream merge or release.
- **Remaining verification risks:** Alert thresholds, roster changes, effective corrections, tenant/department scope and reliable scheduling require investigation and tests. A QR code can be relayed within its lifetime and does not prove presence. ORG-006 and external delivery remain Blocked.
- **Documentation:** No ATTEND-006 user-visible behavior is implemented yet; update the user guide with actual tested behavior before completion. BRAND planning has no customer-facing behavior.
- **Failing tests:** None in the latest completed selected runs. Earlier anonymous-fragment, kiosk/session-sync, selector and immutable-event expectation failures were corrected. The initial replay role-switch attempt failed; the corrected rollback replay passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Write focused pgTAP tests for thresholds, duplicate suppression, audit, permissions, corrections and draft exclusion; execute them in rollback replay, fix failures, then apply only to the verified disposable project.
- **Latest development commit:** `4a325d9bc68fb9a64afcfeeedee287f597b871fd`
- **Push outcome:** Story-start checkpoint `8f3489e2bf2b89b8002a1478885ffe1fc4f68106` was pushed and its remote SHA matched. This status update and the development migration are not yet committed.
- **Backlog:** 122 total; 49 Done, 1 In Progress, 6 Blocked, 66 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
