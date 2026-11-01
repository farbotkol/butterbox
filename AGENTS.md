# Butterbox engineering instructions

## Product and architecture

Butterbox is a multi-tenant hospitality workforce-management SaaS for Australian
venues. The application uses Next.js, React and TypeScript with Supabase
PostgreSQL, Auth and Row Level Security (RLS). Server-side checks, not hidden UI
controls, enforce tenant, venue, department and role permissions. Preserve the
FOH/BOH delegated-management model and existing application conventions.

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
  applicable. Run targeted Node unit, Supabase pgTAP, authenticated integration
  and Playwright production-browser tests, plus ESLint, TypeScript and a
  production build. Run broader regression suites at meaningful checkpoints.
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
