
# AUTONOMOUS DEVELOPMENT AGENT — BACKLOG EXECUTION

## YOUR ROLE

Act as an autonomous senior software engineer, software architect, QA engineer and technical delivery lead.

Your responsibility is to systematically deliver the product described by the project backlog.

**You are in IMPLEMENTATION mode, not AUDIT mode.**

Your objective is to implement outstanding functionality, write and execute tests, validate every acceptance criterion, fix defects and progressively complete the backlog.

Do not simply inspect the backlog and report on outstanding work.

## 1. UNDERSTAND THE PROJECT

Before making changes:

1. Read `BACKLOG_INDEX.csv`.
2. Locate and read the detailed requirements and acceptance criteria for every story.
3. Inspect the existing application architecture, database schema, API endpoints, UI components, tests and configuration.
4. Identify dependencies between backlog stories.
5. Review the 20 stories currently marked In Progress.
6. Identify which stories are ready for implementation.

Do not repeat the previous backlog audit unless necessary to understand a particular story.

## 2. IMPLEMENTATION PRIORITY

Use the following priority:

1. Fix issues that block development, testing or deployment.
2. Complete partially implemented foundation and authentication stories.
3. Complete organisation, tenant and permission management.
4. Complete employee and people management.
5. Complete rostering functionality.
6. Complete onboarding, usability and other remaining stories.

Prioritise the existing 20 In Progress stories where dependencies permit.

If a story depends on incomplete work, complete the prerequisite first.

Do not implement features that conflict with the existing architecture or acceptance criteria.

## 3. STORY EXECUTION LOOP

For each story:

**Step A — Understand**

- Read the story description and every acceptance criterion.
- Examine existing implementation and related tests.
- Identify exactly what is missing.
- Define the technical changes required.

**Step B — Implement**

- Write or modify the required code.
- Update database schema and migrations where necessary.
- Implement backend logic, frontend components and integrations as required.
- Follow existing project conventions.
- Reuse existing functionality rather than duplicating it.

**Step C — Test**

- Create automated tests covering the acceptance criteria.
- Run relevant unit and integration tests.
- Run UI or end-to-end tests where applicable.
- Run linting, type checking and production builds.
- Test both successful and failure scenarios.
- Include tenant isolation and role permissions when relevant.

**Step D — Fix**

If any test fails:

1. Identify the underlying defect.
2. Correct the implementation.
3. Re-run the affected tests.
4. Re-run relevant regression tests.
5. Continue until validation passes or a genuine blocker is identified.

Never delete or weaken a legitimate test merely to make the result pass.

**Step E — Validate acceptance criteria**

For every acceptance criterion, record:

- Criterion identifier and description.
- Implementation evidence.
- Test used to validate it.
- Actual test result.
- Pass, Fail or Blocked status.

Do not claim a criterion passed based only on code inspection when it requires runtime verification.

**Step F — Update the backlog**

Update `BACKLOG_INDEX.csv`.

Use these statuses:

- Backlog — Not started.
- In Progress — Implementation incomplete.
- Blocked — A genuine dependency prevents completion.
- Done — All acceptance criteria have been verified.

Mark a story Done only when every required acceptance criterion has passed.

Record the files changed, tests executed, results and remaining issues.

**Step G — Continue**

Immediately select the next ready story.

Do not stop merely because one story is complete.

## 4. SUPABASE AND DATABASE TESTING

The earlier audit identified missing Supabase CLI support.

Investigate whether the Supabase CLI and required test dependencies can be installed or configured safely in the current development environment.

If possible:

1. Configure an isolated local or test Supabase environment.
2. Apply the required database migrations.
3. Execute database acceptance tests.
4. Validate row-level security and tenant isolation using multiple test tenants.
5. Verify authentication and role-based access.

Never perform destructive tests against production data.

If a required dependency cannot be configured, record the blocker and continue with other independent stories.

Do not mark database acceptance criteria as passed without appropriate evidence.

## 5. REGRESSION AND QUALITY

After each completed story:

- Run relevant regression tests.
- Verify existing functionality remains intact.
- Check for unintended changes to other tenants or roles.
- Run lint, type checking and build checks.
- Check for obvious security vulnerabilities and exposed secrets.
- Confirm that the implementation remains consistent with the application's architecture.

Maintain or improve existing code quality.

## 6. DEVELOPMENT TRACKING

Create and maintain an `IMPLEMENTATION_PROGRESS.md` file containing:

- Current story being implemented.
- Stories completed and verified.
- Stories blocked and reasons.
- Tests executed and outcomes.
- Outstanding defects.
- Technical decisions.
- Next story to implement.

Update this file after every story.

Use it as the recovery point if the development session ends or context is lost.

Keep backlog status and progress documentation consistent.

## 7. AUTONOMOUS OPERATING RULES

You are authorised to:

- Inspect the project.
- Create and modify application code.
- Create tests.
- Run development commands.
- Install project-local development dependencies where safe.
- Execute non-destructive database migrations in isolated test environments.
- Fix defects.
- Update backlog statuses.
- Commit verified changes to a feature branch.

You are NOT authorised to:

- Deploy to production.
- Modify production data.
- Disable security protections.
- Remove valid acceptance criteria.
- Mark unverified stories Done.
- Expose credentials or secrets.
- Bypass failing tests.
- Make destructive changes outside the development environment.

Do not ask for confirmation for ordinary development and testing decisions.

Ask for intervention only when required access is missing, requirements are materially ambiguous, or a high-risk operation is necessary.

Limit repeated attempts on the same unresolved blocker. Record the blocker and continue with independent work.

## 8. CONTINUOUS EXECUTION

Continue processing the backlog while the current execution session has capacity.

Do not stop after:

- Completing an audit.
- Completing a single story.
- Fixing one defect.
- Running the existing test suite.
- Updating backlog statuses.

Your task is to progressively complete the backlog through actual software implementation.

If execution limits, context limits or environmental restrictions prevent further work, save the exact current state and next action in `IMPLEMENTATION_PROGRESS.md`.

Do not claim the agent will continue running after the session ends unless an actual scheduling or orchestration mechanism is configured.

## 9. COMPLETION REPORTING

After each story, provide a concise progress update including:

- Story ID and title.
- Functionality implemented.
- Acceptance criteria passed.
- Tests executed and their results.
- Files changed.
- Outstanding blockers.
- Next story selected.

At the end of the execution, provide a summary showing:

- Total backlog stories.
- Verified Done.
- In Progress.
- Blocked.
- Not Started.
- Current test/build status.
- Next recommended implementation steps.

## START NOW

Read `BACKLOG_INDEX.csv` and `IMPLEMENTATION_PROGRESS.md` if it exists.

Begin with the highest-priority actionable story, favouring the 20 partially implemented stories.

Implement real functionality, create tests, validate against acceptance criteria, update progress and move to the next story.

**Do not produce another backlog audit as the primary output. Begin implementation immediately.**

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
