# Butterbox engineering instructions

## Product and architecture

Butterbox is a multi-tenant hospitality workforce-management SaaS for Australian
venues. The application uses Next.js, React and TypeScript with Supabase
PostgreSQL, Auth and Row Level Security (RLS). Server-side checks, not hidden UI
controls, enforce tenant, venue, department and role permissions. Preserve the
FOH/BOH delegated-management model and existing application conventions.

## Approved owner decisions — 4 November 2026

Before selecting subscription, AI, Award Central, Xero Payroll or local Supabase/database-isolation work, read [the 4 November owner decision and implementation handoff](docs/agent-handoffs/2026-11-04-owner-decisions.md). It records approved venue-based pricing, local open-model evaluation, two-award MVP scope, Xero developer-account responsibilities and the P0 disposable database environment. Reconcile it against current implementation and backlog evidence; it authorises ordinary safe development, not live integrations, production deployment or destructive changes to existing environments.

## Showcase-first prioritization

The owner has authorized a **first internal product-review Showcase MVP**, distinct from production go-live. `BACKLOG_INDEX.csv` contains both the original `Priority` (long-term roadmap) and `Showcase_Priority` (first-review sequencing). Do not overwrite either with the other.

When preparing issues for the Showcase MVP, check dependency readiness, `Status`
and `Showcase_Priority`. Queue ready **P0 showcase** work ahead of later P1/P2/P3
work. Keep blocked stories out of the dispatch queue and retain completed stories
with their evidence.

The DEMO epic is an **internal evaluation milestone only**. Use a separately verified isolated environment and synthetic fixtures; no production data, live payroll or real external messages. Do not claim production readiness or award-calculation correctness. Branding requires owner approval for the final logo/identity, and generated concept images are not actual UI screenshots. See `BUTTERBOX_PRODUCT_BACKLOG.md` (Epic DEMO) for exit gates and story-specific criteria.

## GitHub issue intake and session recovery

- Start implementation from an open GitHub issue assigned to the agent or
  explicitly selected by the owner or dispatcher. Before starting, check the
  issue's dependencies, existing assignee and any linked PR. If the session
  has no authorized issue, wait for one.
- Use the issue for scope and acceptance criteria. When creating an issue
  from the backlog, put the `BB-` story ID in the title and link its product
  story and CSV row. Before coding, read the linked requirements,
  `IMPLEMENTATION_PROGRESS.md` and any applicable owner decisions. Resolve
  conflicting scope or approvals on the issue before implementing.
- Inspect the active branch, Git status, recent commits, other worktrees and
  outstanding blockers. Preserve uncommitted or concurrent work and existing
  migrations. Reuse completed functionality.

## Implementation and verification

- Implement an end-to-end vertical slice using existing patterns and helpers.
  Include scoped server-side authorization, tenant isolation, validation,
  failure states, accessibility and mobile behaviour where relevant.
- Test successful, invalid, unauthorized, cross-tenant and concurrency paths as
  applicable, using the risk-based testing policy below.
- Use only an explicitly identified isolated, disposable Supabase project for
  database migrations and destructive test resets; verify its project ID and
  ports first. Never perform destructive tests on shared or production data.
  Use the established serialized, low-memory browser runner when necessary.
- Fix underlying failures and rerun affected tests. Never weaken or remove
  legitimate tests or acceptance criteria, bypass failures, fabricate results
  or claim runtime acceptance from inspection alone.
- For each acceptance criterion, record its identifier, implementation
  evidence, test, actual result and Pass, Fail or Blocked status. Mark a story
  Done only after the full story is verified. Record blockers on the issue
  and leave it open for follow-up.

## User documentation as part of Definition of Done

- Maintain [the role-based User Guide](docs/USER_GUIDE.md) as a living source of user-facing instructions. After implementing or changing a feature, update the appropriate owner, manager, employee or payroll section with its actual tested behavior, permissions, error cases and limitations.
- Treat **accurate user documentation** as a story completion requirement for all user-visible changes. Update existing guides and contextual help where present, while avoiding an unnecessary duplicate guide for each feature. For backend-only changes document operational impacts and explicitly mark user guidance as not applicable.
- Where relevant, add accessible, contextual links/help in the application that lead to task-oriented explanations; do not block completion of a fully tested feature on creating a separate all-app help center, which is tracked in DOC epic.
- Verify route/button wording and permissions against implemented code or a supported browser walkthrough; never invent UI labels, screenshots, functionality, or legal compliance claims. Mark partially delivered or blocked work transparently.
- When documenting features, identify whether external delivery, production data access, legal sign-off or a provider integration is not yet available. Avoid writing customer-facing procedures for capabilities only planned.
- Include a **Documentation: updated / not applicable (reason)** line in the story's acceptance evidence and status report. Missing documentation for a changed user-facing workflow must be corrected before marking the story Done.
- Documentation workstream stories are in the `BB-DOC` epic of `BACKLOG_INDEX.csv` and `BUTTERBOX_PRODUCT_BACKLOG.md`. Execute them through a separate GitHub issue and describe only verified in-app help.

## Risk-based, change-focused testing

The default is targeted verification, not a full regression after every story.

- After each change, identify the affected files, components, database objects
  and workflows. Run the smallest meaningful set of tests that verifies them and
  their direct dependencies. Fix failures and rerun only the affected tests.
- By change type:
  - **Documentation or status only:** no tests.
  - **UI only:** targeted unit tests and relevant accessibility/browser checks.
  - **API or business logic:** relevant unit and integration tests, including
    failure and authorisation paths.
  - **Schema or RLS:** apply migrations safely in the isolated project, then run
    the affected pgTAP files and tenant-isolation checks.
  - **Attendance, timesheet or payroll:** targeted workflow, permission and
    relevant idempotency/concurrency cases.
  - **Shared authorisation, identity or tenant context:** a broader set of
    impacted security and cross-tenant regressions.
  - **Award or pay rules:** affected rule fixtures, boundaries and
    deterministic outcomes. Never infer compliance from unrelated passing tests.
- Run ESLint and TypeScript on the changed code. Run a production build when
  routes, Next.js configuration or server/client boundaries change, rather than
  for every edit.
- A story is Done when every criterion is implemented, the relevant targeted
  tests pass, the required negative, security and edge cases are verified, and
  no known blocking defect remains. A full-repository run is not required.
- Broaden testing, affected suites first, only for:
  - major shared architectural changes;
  - authorisation or tenant-isolation changes across modules;
  - migration compatibility or significant shared-schema changes;
  - payroll calculation foundation changes;
  - merging the Award Central and Roadmap workstreams;
  - release, deployment or production-readiness signoff;
  - unexpected failures suggesting a larger blast radius.
- Prefer focused pgTAP files, browser greps, small fixtures and the existing
  environment over full resets or repeated rebuilds.
- Record the tests selected and why, actual results, tests intentionally
  deferred, remaining verification risks, and any need for broader regression
  later. Never claim full regression coverage that was not run.

## Security and operational safeguards

- Protect credentials and customer data; do not commit secrets, disable
  security controls, deploy, alter live data, make destructive changes outside
  development or rewrite Git history without explicit approval. Historical
  credential findings require owner assessment and rotation; never expose
  their values.
- Preserve immutable original timekeeping events. Corrections must be
  attributable, auditable additions rather than silent overwrites.
- Preserve tenant ownership, scoped permissions and RLS in every schema,
  server action, API, job and user interface. Test two-tenant isolation where
  relevant. Document compliance assumptions without claiming unverified
  Australian award or payroll compliance.

## Agent Progress Reporting and Visibility

- During active work, maintain **issue/PR-specific** progress and verification
  evidence. Checkpoints must distinguish Planning, Coding, Testing, Debugging,
  Blocked and Complete. Include actual timestamp, issue and PR links, current
  acceptance criteria, activity, observed test results, blockers, next action,
  commit SHA and push/CI outcomes. Never imply an agent remains active merely
  because an earlier checkpoint has a timestamp.
- Post meaningful checkpoints on the canonical issue/PR, or write isolated
  per-run evidence files where an approved agent workflow supports them. Avoid
  multiple agents rewriting the same backlog, implementation-progress or
  roadmap files. Workstream historical status documents remain readable,
  but are not the dispatch or completion authority.
- Retain any existing controller-specific operational status requirements
  **only where they do not conflict** with these single-source rules.
  Issue #75 is the follow-on implementation for a validated per-agent evidence
  schema, central post-merge consolidator, and enforcement; do not claim these
  mechanisms are already deployed.
- Do not interrupt database operations, sensitive Git operations or tests to
  produce a checkpoint. Report actual observed events, not fabricated timing.

## Tracking and Git workflow (Issues as authoritative work queue)

- **Effective after this governance PR merges:** GitHub Issues are the source of
  truth for outstanding work scope, priority, readiness, dependencies, ownership,
  status, acceptance criteria and completion evidence. GitHub PRs and checks are
  the implementation/verification record. GitHub Projects, if configured, is a
  view of Issues, not a second work queue.
- `BUTTERBOX_PRODUCT_BACKLOG.md`, `BACKLOG_INDEX.csv` and
  `IMPLEMENTATION_PROGRESS.md` are retained as **historical reference**
  for legacy IDs, owner-approved product definitions and past test evidence.
  Do not independently update their statuses or add new work to these archives.
  When legacy descriptions contradict a newer owner-approved GitHub issue,
  surface the conflict and resolve it on that issue without silently deleting
  historical requirements. `docs/DECISION_LOG.md` and approved handoffs
  remain authoritative for owner decisions.
- Before creating an issue, search by backlog ID, title, affected component and
  related PRs to avoid duplication. Maintain one canonical issue per outstanding
  product story. Use a separate issue for a safe independently verifiable slice
  only when needed, and link it to the parent; a partial slice never completes
  the full parent story.
- **Do not auto-dispatch migrated issues.** Assign an agent only after explicit
  owner authorization, dependency checks and a conflict/ownership check against
  active issues and open PRs. Existing direct Copilot assignments can bypass a
  local coordinator; until mandatory dispatch enforcement is installed, an
  owner/reviewer must do these checks manually.
- Before coding, declare expected affected components and check for overlapping
  active work; if a collision or unresolved dependency exists, mark it blocked
  and ask for sequencing rather than independently editing shared files.
  Treat a PR awaiting review as active work. Do not claim enforced locks until
  enforcement is implemented and verified.
- Do not let independent coding agents edit shared status/roadmap archives.
  Prefer scoped issue/PR-specific evidence. Issue #75 covers implementing
  automated single-writer evidence consolidation and guardrails; this governance
  change does not imply that enforcement is already live.
- For each issue/PR/attempt, keep append-only Markdown and versioned JSON evidence
  under `docs/agent-work/issues/issue-N/pr-N/attempt-NN.*`; validate it with
  `node tools/agent-evidence/evidence.mjs --file <json> --repo farbotkol/butterbox`.
  Record criterion-level outcomes and evidence, exact tests, CI references,
  decisions, reruns, limitations and blockers. Do not include credentials,
  personal contact details or raw logs.
- Do not edit `BACKLOG_INDEX.csv`, `BUTTERBOX_PRODUCT_BACKLOG.md`,
  `IMPLEMENTATION_PROGRESS.md` or `docs/agent-status/` in independent feature
  PRs. CI permits an exception only with the
  `agent-evidence-governance-exception` label, a linked issue in the PR body,
  and the repository owner's approval review on the exact PR head. This is an
  audited exception, not permission to restore those files as live status.
## Mandatory Copilot pull request description contract

When creating or updating **any** PR, follow `tools/agent-evidence/check-pr-evidence.mjs` and the repository PR template. GitHub's automatic Copilot `Fixes #N` suffix is **not sufficient** and will fail `Verify / verify`.

- Create or identify the canonical GitHub Issue first. After the PR number is known, use the *same* issue number `N` in the PR body reference and the two markers below; use the actual PR number `M` and evidence attempt `XX`.
- Include these exact plain-text lines **outside a fenced code block** in every PR body:
  ```text
  Refs #N
  <!-- butterbox-issue: N -->
  <!-- butterbox-evidence: docs/agent-work/issues/issue-N/pr-M/attempt-XX.evidence.json -->
  ```
- Add **both** matching files `docs/agent-work/issues/issue-N/pr-M/attempt-XX.evidence.json` and `docs/agent-work/issues/issue-N/pr-M/attempt-XX.md` to that PR, with per-criterion status and validated evidence. A marker alone cannot satisfy CI.
- Remove auto-generated `Fixes #N`, `Closes #N` or `Resolves #N` for draft, partial or incompletely accepted work. Do not close a canonical story from a partial slice. Auto-close may only be considered once full acceptance and exact-head owner approval are verified.
- Before marking ready for review, verify that the PR body, issue ID, PR ID, evidence paths and JSON/Markdown validation match. Check the actual `verify` and `database` results. Never silence the validator to compensate for a missing reference.

- Merged-PR evidence reconciliation is append-only on the canonical GitHub
  issue. Include `Refs #N` plus the exact issue/evidence markers in the PR body
  and add both Markdown and JSON attempt files. CI checks the markers and evidence;
  the writer requires a repository-owner approval review on the exact PR head
  saying `Canonical issue approved: #N`, and verifies GitHub's issue-to-PR
  cross-reference before commenting.
  Partial and documentation-only PRs must use reference-only links. CI permits
  auto-close keywords only when evidence exactly matches every canonical issue
  criterion, every criterion passes, there are no blockers, and the delivery is
  not documentation-only. The writer never closes or reopens an issue; human
  reviewers decide full-story acceptance and closure.
- Use an issue branch and PR to `copilot/Development`, subject to existing
  CI, security, review and merge gates. Production changes require explicit
  approval. Use closing keywords only when all issue acceptance criteria have
  been verified; otherwise link the partial PR without auto-closing the issue.
- Completion requires recorded per-criterion evidence and the actual PR merge
  status, not just a green CI run or an agent claim. Update the issue after
  merge and maintain auditable links; do not independently rewrite the archives.
- See `docs/github-issues-workflow.md` for migration/cutover rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
