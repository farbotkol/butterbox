# GitHub Issues: Butterbox delivery source of truth

## Migration checkpoint (12 November 2026)

The legacy `BACKLOG_INDEX.csv` contains **132 product stories**:
- **76 Done**, retained in their original historical sources with supporting evidence. Not bulk-converted into redundant closed Issues.
- **43 Backlog** and **13 Blocked** (56 outstanding), now represented by canonical GitHub Issues.
- Four existing Issues already represented outstanding stories: `BB-PAY-008` (#61), `BB-AI-006` (#68), `BB-AI-007` (#62) and `BB-SAAS-001` (#60). These are **partial slices**, so verify their parent-story scope before closing any full story.
- **52 new product backlog Issues** were imported on 12 November 2026. They retain the legacy story ID, epic, user story, acceptance criteria, historical status, priorities, dependencies and prior evidence.
- One duplicate import of `BB-PAYRULES-005` (#118) was closed as duplicate. **#117 is canonical.**
- Existing standalone UX, demo, agent-tooling and other Issues remain valid; do not deduplicate unrelated scopes automatically.

The migrated Issues are **intake only, with no new Copilot assignment**. A legacy story marked Blocked is not ready for dispatch until its blocker is explicitly resolved. Old CSV status is historical, not automatically an accurate live project status.

## Operating model

1. **GitHub Issues** own work requests, current scope, priority, dependencies, readiness, owner/agent assignment, acceptance criteria and authoritative delivery state. Reference existing `BB-` IDs in the issue title when applicable.
2. **GitHub PRs + checks** own changes, tests and review evidence. Code on a branch does not equal delivered functionality; distinguish proposed, reviewed, merged and accepted.
3. **GitHub Projects**, when an owner creates/configures one, is a *view* of Issues. Suggested fields: Status, Priority, Showcase priority, Epic/workstream, Components, Blocked by, Agent, PR. Suggested views: Roadmap, Intake, Ready queue, In progress, Blocked, Review, Verified done.
4. **`AGENTS.md`** is the agent operating policy. Approval, isolation, dependency and collision checks remain mandatory.
5. **`BUTTERBOX_PRODUCT_BACKLOG.md`, `BACKLOG_INDEX.csv`, `IMPLEMENTATION_PROGRESS.md`, `docs/agent-status/`** retain historical definitions and verification evidence. Do not maintain them as competing live status trackers. Approved decisions in `docs/DECISION_LOG.md` remain authoritative decisions, not archived requirements that can be ignored.

## Intake and dispatch

- Before opening a new issue, search for matching `BB-` ID, feature, UI area, open PR and previously merged slice. Link related issues instead of making duplicates.
- Before dispatch: confirm owner authorization, dependencies, intended environments, required secrets and data restrictions, acceptance tests, and anticipated components/files.
- No agent starts when it would conflict with an active issue/PR's scoped work or depends on an unfinished prerequisite.
- Keep blockers visible. A green CI run, an auto-closing PR keyword, or a partial slice cannot close an incomplete product story.
- Assign agents only through approved dispatch. Manual GitHub Copilot assignment may bypass local controller coordination; **automatic work-area locking is not currently verified/enforced**.
- Do not turn on unattended agent dispatch merely because this migration is complete.

## Concurrent work and reporting

Use **issue/PR-specific reporting**, not common files edited by every agent. Record per-criterion outcomes, commit/test evidence, CI run, and outstanding blockers directly with the issue and PR.

Issue [#75](https://github.com/farbotkol/butterbox/issues/75) is the existing implementation backlog for single-writer reporting, per-agent evidence, enforcement and post-merge reconciliation. Adapt its design to Issues being the source of truth instead of rebuilding a second CSV status authority. Introduce work-area reservation/lease checks, PR overlap validation and a serialized merge queue with separate authorized implementation work. Do not claim these mechanisms are operational until tested.

## Historical completion

For the 76 legacy Done rows, keep the legacy index and product backlog frozen as audit/reference material. Do **not** create 76 closed Issues by default: it duplicates PR history and may misrepresent evidence. If traceability requires an individual historical Issue, create it after checking for an existing Issue/PR, link original evidence and mark it clearly as **historical import**, not newly completed or newly tested.

## Cutover and rollback

This document and `AGENTS.md` change become operating guidance **only after the governance PR merges**. No live application, production database, Vercel deployment, controller service or GitHub branch protection is changed by this migration.

The connected GitHub tool used for this migration can create Issues and repository PRs, but cannot directly create/configure GitHub Projects, project fields/views, repository rulesets, or a guaranteed atomic, enforced agent lock. Those are **outstanding steps**, not completed items.

If important requirements were lost in transfer, compare the new issue to its historical `BB-` entry and add a traceable amendment to the issue. Do not silently rewrite historical evidence.
