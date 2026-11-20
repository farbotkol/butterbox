# Dynamic prerequisites (Phase 2)

This is the dependency-planning guard for issue #290. It is **not yet an autonomous issue-creation or coding-session dispatcher**.

When the delivery controller or an authorized Copilot planning step finds that a selected issue cannot be implemented until another issue is completed, it must construct a structured proposal:

```json
{
  "parentIssue": 300,
  "kind": "code",
  "depth": 1,
  "title": "Build required payroll mapping adapter",
  "body": "## Problem\n...\n## Scope\n...\n## Acceptance criteria\n- [ ] ...",
  "storyId": "BB-..."
}
```

Call `resolveDependency` using the **current** parent issue, complete open-issue snapshot, open Development PRs and confirmed current writer/lease state. An untrusted AI recommendation is never sufficient authority to write.

The decision is one of:
- `REUSE_PREREQUISITE`: link the existing matching open issue instead of creating a duplicate.
- `PROPOSE_PREREQUISITE`: candidate may be created **only after a fresh atomic lease acquisition and live duplicate/external blocker recheck**; execution is not implemented in this slice.
- `PARK_EXTERNAL`: external consent/OAuth/legal approval is not automatable by code.
- `REPORT_BLOCKED`: invalid metadata, more than three dependency levels, open Development PR, active writer, or incomplete snapshot.

Before execution, the next slice must establish a durable exclusive writer lease, re-fetch the parent and open issues, create a GitHub issue exactly once (idempotency), add a blocked-by relationship, and wait until the prerequisite is verified and merged before returning to the parent. It may create a technical prerequisite but must never claim a coding agent started without a confirmed session ID. Never abandon an active writer because twelve hours elapsed.

Testing: `node --test tests/delivery-controller-dependencies.test.mjs`. The GitHub controller PR workflow also runs these tests. User Guide: not applicable; this is an internal delivery system.
