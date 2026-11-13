# CI test strategy: staged migration (issue #249)

## Current state and safety guarantee

The existing `.github/workflows/ci.yml` workflow remains unchanged in the first stage. Its **`verify`** and **`database`** check names, the entire pgTAP/tenant/browser coverage and the GitHub branch-protection merge gates remain unchanged. No change in this PR authorises disabling a required check, merging on a failed check, or deploying.

The new workflows run **alongside** existing protection, not instead of it:

| Workflow | Trigger | Role |
| --- | --- | --- |
| `Verify` / `verify` and `database` | Every PR | Existing required unit, build, database and full browser gates; unchanged during evaluation |
| `Fast database candidate` / `database-smoke` | PR and manual | Non-required candidate: disposable pgTAP and authenticated tenant isolation, followed by a fixed selection of critical Playwright tests |
| `Nightly full regression` / `full-regression` | Every day and manual | Complete pgTAP, authenticated tenant isolation and all authenticated browser tests |
| `Focused browser tests` | Manual and tooling changes | Existing targeted diagnosis; not a substitute for a required gate |

### Full regression timing and release verification

The daily run is scheduled for **15:00 UTC**, corresponding to **02:00 AEDT in Melbourne** and **01:00 AEST**. GitHub scheduled jobs are best-effort and may start late. This is intentionally a fixed UTC schedule, not a daylight-saving-aware local-time scheduler.

Before a Beta release, manually dispatch the `Nightly full regression` workflow with `release_sha` set to the **full 40-character commit SHA of the exact candidate**. The checked-out SHA is printed in the Actions summary. A prior nightly run on a different SHA does **not** satisfy release acceptance. The release decision is human-controlled, and all required checks must pass on that exact candidate.

### Fast smoke coverage and limitations

The candidate uses a **disposable** Supabase instance and always runs the complete database SQL tests and the existing tenant-isolation script. Its baseline Playwright subset tests verified signup/recovery, the roster timetable, employee clock events and the approved-hours payroll CSV export. This is a conservative starting subset, **not** proof of full application regression.

The four selected browser tests may take more than the proposed 5–15 minute goal. We must measure actual times, flaky runs and diagnostic value before treating the goal as achievable.

The first stage deliberately does **not** implement risk-aware change classification, nightly failure alerting, branch-protection changes, or an automatic merge cutover. Those remain acceptance work under issue #249; the work must not be marked complete prematurely.

## Release phases

1. **Stage A, this PR:** add the non-gating fast candidate, scheduled/manual full regression, and this guide. Keep all current required checks and Phase 2 agent merge eligibility unchanged. Validate the new YAML, smoke selection, end-to-end execution and artifacts.
2. **Stage B, benchmarking:** compare the existing `database` full run and `database-smoke` on multiple commits; track p50/p95 duration, pass rates, missing security scenarios, and runner queue time. Review whether critical auth, RLS, payroll, approvals and permission checks are covered. Harden fast tests and failure reporting.
3. **Stage C, change-aware targeted validation:** introduce reviewed path-to-test mapping and default to broader coverage when changes affect shared auth, migrations, policies, finance, test infrastructure or cannot be classified. Do not allow untrusted PR text to opt out of tests.
4. **Stage D, protected cutover:** review repo rulesets, native branch protection, merge queue, `.github/workflows/phase2-automerge-development.yml`, and the `Verify` workflow's dispatch/resume logic **together**. Retain the stable required `verify` and `database` names, and change only what those checks execute after the candidate is proved. Never leave a period where required names are absent or a merge can occur with only a skipped check. Record an owner-approved cutover checklist and immediately restore the original checks if validation or branch rules fail.
5. **Stage E, steady state:** run lightweight mandatory validation on every PR, change-aware targeted tests on relevant PRs, nightly complete regression, and exact-SHA release acceptance. Alert on nightly failures without duplicate issue spam; prevent release of any failing or untested candidate.

## Explicit rollback

If a staged cutover creates blind spots, missed check names or uncontrolled merges, restore the original `database` job body from the last approved commit while keeping its exact job identifier `database`, and restore the previous branch protection or ruleset values. Do not solve an outage by deleting required checks.

## Investigation checklist

For CI failures, first identify the failing **job and step**, source ref/SHA, and initial error in the logs. Browser reports can include many individual failures; count them from Playwright results rather than the final `exit 1`. Run focused local tests before dispatching a full hour-long retry. Preserve failure artifacts only for bounded retention and without leaking secrets or real customer data.
