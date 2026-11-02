# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:07 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ORG-006 — Business configuration` (Blocked for full acceptance; planning the independent prospective venue-week slice)
- **Acceptance criteria:** Per-venue overrides are clear; changes apply prospectively unless explicitly migrated; audit shows each setting change.
- **Phase:** Testing
- **Current activity:** Verifying the uncommitted prospective planning-week slice before any feature checkpoint. The existing operational roster and Monday-aligned publication/payroll periods retain their semantics; a separate read-only planning view explains and links to those operational weeks.
- **Progress since previous report:** Added a draft owner-authorized, append-only venue setting, server-side planning-period resolver, owner settings and read-only planning view. The isolated acceptance database remains at migration `20261103140000`: the new migration has run only inside rolled-back preflight transactions. Documentation checkpoint `108e514ad00545d42b2cf67296c10ced5eb72d3d` was pushed and matched the remote.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Rollback-only pgTAP preflight **55/55** covers authorization, audit, historical settings, transitions, DST, year boundaries and unchanged publication/payroll fixtures. Planning parser Node tests **5/5**, changed-file ESLint and TypeScript passed. The generic test-discovery tool did not recognize the Node test file, so the repository's Node runner was used successfully.
- **Tests intentionally deferred:** Applied-migration pgTAP and neighboring regressions, authenticated concurrency/tenant integration, production build and targeted browser/accessibility checks have not yet run. Full repository suites are not planned for this partial slice.
- **Remaining verification risks:** All ORG-006 code is uncommitted and the planning interface, migration upgrade and real concurrent requests remain unverified. It does not change the existing editable Monday-based roster; the full configuration story and external delivery remain Blocked. The SAAS-003 safeguard does not establish isolated demo infrastructure, historical production provenance or clean conversion.
- **Failing tests:** None in the selected database, Node, lint or type-check runs.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Verify disposable project identity and disk, apply the new migration only there, then run focused database regressions, authenticated concurrency and targeted production-browser checks. Await the separate security review.
- **Latest development commit:** `b45439e8d23a6d2257684fe7fe7ba6eeadbf5825`
- **Push outcome:** Documentation checkpoint `108e514ad00545d42b2cf67296c10ced5eb72d3d` matched the remote SHA; this status checkpoint is pending. The development changes remain uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
