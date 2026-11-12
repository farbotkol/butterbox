# GitHub Issues: Butterbox delivery source of truth

## Migration checkpoint (12 November 2026)

The legacy `BACKLOG_INDEX.csv` contains **132 product stories**:
- **76 Done**, now represented by closed, explicitly **historical** GitHub Issues; 75 were newly imported as #162–#236, while existing closed issue #6 represents `BB-FORECAST-001`. The original sources remain intact and are not superseded as verification evidence.
- **43 Backlog** and **13 Blocked** (56 outstanding), now represented by canonical GitHub Issues.
- Four existing Issues already represented outstanding stories: `BB-PAY-008` (#61), `BB-AI-006` (#68), `BB-AI-007` (#62) and `BB-SAAS-001` (#60). These are **partial slices**, so verify their parent-story scope before closing any full story.
- **52 new product backlog Issues** were imported on 12 November 2026. They retain the legacy story ID, epic, user story, acceptance criteria, historical status, priorities, dependencies and prior evidence.
- One duplicate import of `BB-PAYRULES-005` (#118) was closed as duplicate. **#117 is canonical.**
- **19 product epic issues** (#143–#161) now contain explicit links to all 132 stories and their historical/open states. They are navigable epic indexes, **not native GitHub Projects boards or GitHub sub-issue hierarchies**.
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

For the 76 legacy Done rows, preserve their original CSV/backlog/implementation evidence and the 76 corresponding closed historical Issues (#162–#236 and #6). These imported records are **not newly tested or delivered**, and must not cause automatic dispatch or newly claim runtime acceptance. Future historical backfills must first search existing Issues by exact `BB-` identifier and link PR evidence rather than creating duplicates. Completed work with later known gaps needs an explicit follow-up Issue, not retroactive changes to historical acceptance claims.

## Cutover and rollback

This document and `AGENTS.md` change become operating guidance **only after the governance PR merges**. No live application, production database, Vercel deployment, controller service or GitHub branch protection is changed by this migration.

The connected GitHub tool used for this migration can create Issues and repository PRs, but cannot directly create/configure GitHub Projects, project fields/views, repository rulesets, or a guaranteed atomic, enforced agent lock. Those are **outstanding steps**, not completed items.

If important requirements were lost in transfer, compare the new issue to its historical `BB-` entry and add a traceable amendment to the issue. Do not silently rewrite historical evidence.

## Native GitHub Issue Types (manual authenticated application)

The native type bulk-update helper is `scripts/set-issue-types.sh`. It uses
`gh api` with the **operator's own authenticated GitHub CLI session** because
the ChatGPT GitHub connector does not expose the issue-type write parameter.
It cannot run automatically from a PR or by adding an issue.

Run from a trusted checkout after review:

```bash
bash scripts/set-issue-types.sh          # preview, no writes
bash scripts/set-issue-types.sh --apply  # explicit GitHub write, verifies each result
```

The helper assigns **Epic** to #143–#161, **Feature** to legacy `BB-` product
stories (including historical closed stories), **Bug** to three known UI defect
issues (#82–#84), and **Task** to other stand-alone issues. It only uses issue
types actually enabled for the repository, skips missing types rather than
substituting a misleading one, and does not touch PRs, GitHub Projects or
labels. Install `gh` and `jq` and ensure authenticated GitHub access has
repository Issues write permission. Review the dry-run classification before
using `--apply` since a number of standalone issues may be better classified
as Feature rather than Task.

**Status:** helper is committed in governance PR #141; no native Issue Type has
been assigned via this helper during its creation. GitHub type changes require
an operator to run it with `--apply` or a different authorised connector.
