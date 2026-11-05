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

When choosing new work, first inspect the committed active story, dependency readiness, `Status` and `Showcase_Priority`. Safely complete or checkpoint BB-ATTEND-006 if it is still actively being developed, then select ready **P0 showcase** work ahead of later P1/P2/P3 work. Avoid rebuilding Done stories. Do not start blocked stories or violate production/security approvals. Update story evidence and documentation when completing work.

The DEMO epic is an **internal evaluation milestone only**. Use a separately verified isolated environment and synthetic fixtures; no production data, live payroll or real external messages. Do not claim production readiness or award-calculation correctness. Branding requires owner approval for the final logo/identity, and generated concept images are not actual UI screenshots. See `BUTTERBOX_PRODUCT_BACKLOG.md` (Epic DEMO) for exit gates and story-specific criteria.

## Session recovery and story selection

- Before coding, read `BACKLOG_INDEX.csv`, `IMPLEMENTATION_PROGRESS.md` and the
  relevant stories and acceptance criteria in `BUTTERBOX_PRODUCT_BACKLOG.md`.
- Inspect the active branch, Git status, recent commits, other worktrees and
  outstanding blockers. Preserve uncommitted or concurrent work; do not
  recreate completed functionality or overwrite existing migrations.
- Select the highest-priority ready story, favouring partially implemented work
  and completing prerequisites first. Resolve development, authentication,
  tenant and people foundations before dependent rostering features. Prefer
  reliable rostering, attendance and payroll workflows over advanced AI.

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
  Done only after every criterion is verified; record genuine blockers and
  continue with independent ready work.

## User documentation as part of Definition of Done

- Maintain [the role-based User Guide](docs/USER_GUIDE.md) as a living source of user-facing instructions. After implementing or changing a feature, update the appropriate owner, manager, employee or payroll section with its actual tested behavior, permissions, error cases and limitations.
- Treat **accurate user documentation** as a story completion requirement for all user-visible changes. Update existing guides and contextual help where present, while avoiding an unnecessary duplicate guide for each feature. For backend-only changes document operational impacts and explicitly mark user guidance as not applicable.
- Where relevant, add accessible, contextual links/help in the application that lead to task-oriented explanations; do not block completion of a fully tested feature on creating a separate all-app help center, which is tracked in DOC epic.
- Verify route/button wording and permissions against implemented code or a supported browser walkthrough; never invent UI labels, screenshots, functionality, or legal compliance claims. Mark partially delivered or blocked work transparently.
- When documenting features, identify whether external delivery, production data access, legal sign-off or a provider integration is not yet available. Avoid writing customer-facing procedures for capabilities only planned.
- Include a **Documentation: updated / not applicable (reason)** line in the story's acceptance evidence and status report. Missing documentation for a changed user-facing workflow must be corrected before marking the story Done.
- Documentation workstream stories are in the `BB-DOC` epic of `BACKLOG_INDEX.csv` and `BUTTERBOX_PRODUCT_BACKLOG.md`. Complete them as separate ready work without falsely claiming in-app contextual help is already deployed.

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

- During an actively executing agent session, update the workstream-specific status file approximately every **10 minutes of active work**. The Roadmap Agent owns `docs/agent-status/roadmap.md`; the Award Central Agent owns `docs/agent-status/award-central.md`. Never modify the other workstream's status document.
- Commit and push the current status report approximately every **15 minutes of active work**, including when a story is incomplete. Use a separate documentation-only checkpoint from unverified development changes wherever practical. Verify the remote push and record push failures.
- Update and push a status checkpoint **immediately** when starting a story, completing a meaningful milestone, encountering a blocker, completing testing, or finishing a story, subject to the safety exceptions below.
- Every status report must provide: actual update timestamp and timezone; current story ID/title and acceptance criteria; current phase (Planning, Coding, Testing, Debugging, Blocked or Complete); specific activity underway; progress since the previous report; actual passing and failing tests; blockers requiring intervention; the next concrete action; and the latest development commit SHA (or explicitly `unknown`).
- State what was observed and when. Never fabricate progress, test results, timestamps, push outcomes or active status. A last-updated timestamp is **not** proof an agent is still running. When the execution state is unverified, say so clearly.
- Do not interrupt database operations, sensitive Git operations, or long-running tests just to meet a reporting interval. Record the deferred report and update/push immediately after it is safe.
- Never commit secrets, credentials, unrelated files or unverified code as a consequence of status reporting. Do not launch background loops, polling services or monitoring infrastructure solely to satisfy these intervals.
- These intervals apply **only during active execution** and are best-effort when timing cannot be reliably measured. Report at meaningful steps instead of claiming false timed updates.
- Maintain the existing story-selection, acceptance-testing, branch-isolation, safety and delivery instructions below and above; status reporting does not replace implementation work.

## Tracking and Git workflow

- Keep `BACKLOG_INDEX.csv` and `IMPLEMENTATION_PROGRESS.md` consistent. Record
  the current story, verified criteria, files, test results, decisions,
  outstanding defects, blockers and exact next action after each story.
- Work on `copilot/finish-roadmap-for-app`. At each verified feature or safe
  logical checkpoint, inspect the diff for secrets, commit descriptive changes,
  push the development branch and verify its remote SHA. Never merge into
  `main` without approval.
- Provide a concise update after each story with its ID, criteria, tests, files,
  commit and push result, blockers and next story. Continue through ready
  stories while the authorized session has capacity; stop for missing access,
  genuine blockers or required high-risk decisions, recording recovery state.
  Do not ask for routine development confirmation or claim work will continue
  after the session without actual orchestration. At the end, report backlog
  status counts, current validation and recommended next steps.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
