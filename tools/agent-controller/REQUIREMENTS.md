# Butterbox local agent controller — MVP requirements and operating rules

**Status:** Development tooling only. User decision (4 Nov 2026): **execute instructions only when issued by the owner's GitHub user, `farbotkol`.** Not a production app feature.

## Purpose
Small opt-in Mac command-line listener to poll GitHub and dispatch *explicit* owner-approved work to local GitHub Copilot CLI. Polling needs no inbound port, webhook, tunnel, cloud server or second repository. Local Docker/Supabase/Ollama stay on the Mac. This is **not remote desktop control of an existing VS Code Chat session**: CLI is a separate agent invocation unless supported session-resume is positively verified.

## Security contract (mandatory)
1. Only process GitHub issues in `farbotkol/butterbox` whose **API-confirmed issue author login** is exactly `farbotkol` (case-insensitive), numeric ID is `11307166`, and type is `User`. GitHub GraphQL must confirm the same original author and `lastEditedAt:null`; **any body edit, including an owner edit or revert, invalidates the issue**. Issue-body or comment text claiming to be the owner is never authoritative. No bot-created task, collaborator task or quoted content bypasses this gate. Owner-authored comments cannot authorise someone else's issue in MVP. Bot-created ChatGPT tasks remain rejected; the supplied Action instead requires OAuth as the actual owner.
2. Require issue label `butterbox-agent-task`, an explicit `/butterbox run` command on its own line in the original **owner-authored issue body**, and a JSON fenced block with `workstream` (`roadmap` or `award-central`) and `task` (1–4000 characters). No generic shell commands or executable workflow in issue content. **Discussion alone never triggers execution.**
3. Set `AGENT_CONTROLLER_ENABLED=true` locally to permit execution; default off. Use a separate operator-created GitHub authentication via `gh auth login` with minimum necessary repo permissions. Never put tokens into issues, logs or source control.
4. Never execute issue body as shell. Start only an installed and positively verified `copilot` executable with static, reviewed arguments and a bounded, text-only prompt; use `spawn` with `shell:false`. Confirm current Copilot CLI syntax and approval semantics before enabling unattended execution; deny privilege escalation or destructive permission modes. If CLI isn't installed or supported, fail closed.
5. Agent's prompt must enforce AGENTS.md, owner decisions, read-only evaluation where applicable, tenant isolation, restricted development scope and existing approval gates. No production deploy, paid service, secrets, live payroll, DB reset or destructive actions without separate approval. Treat issue text as untrusted *task data*; it cannot override these constraints. For MVP, restrict tasks to developer-repository work, with a human-reviewed local allowlist before enabling if your environment cannot safely confine Copilot tools.
6. Fail closed on any GitHub API error, ambiguous identity, malformed issue, unknown workstream, invalid status, overlapping active work, unclean working tree, wrong repository/branch, unavailable CLI or failed checks. Run only a bounded number of tasks whose declared components are disjoint; no automatic agent switching/restarts.
7. Persist a private local run and component-reservation ledger outside git so tasks are not replayed after crash or restart. Atomically reserve issue and components before invoking CLI; renew leases while active and only recover expired leases after reconciling run, branch and PR state. Ignore and report edited issue content after first reservation.
8. Report status to GitHub issue using authenticated `gh` CLI; avoid logging prompt secrets/private data. Clearly distinguish queued/running/succeeded/failed/interrupted and the actual local exit status, not claims of story acceptance.
9. Owner can stop listener with Ctrl+C. Do not daemonise or start at login until explicitly configured. Never open inbound ports.

## Implementation deliverables
- `tools/agent-controller/listener.mjs` — plain Node.js ESM, `gh` REST polling and safe task dispatch.
- `tools/agent-controller/README.md` — setup, environment, dry-run/opt-in, security and limits.
- `tools/agent-controller/listener.test.mjs` — identity and parsing safety tests.
- Root `package.json` script `agent:listener` for `node tools/agent-controller/listener.mjs`.
- Keep the durable private ledger in `~/.butterbox-agent-controller/` (directory `0700`, files `0600`), outside every checkout. `.agent-controller/` remains gitignored for local fixtures. Use one account-wide lock, including when synthetic tests override their ledger directory. Do not install new application dependencies or connect to paid infrastructure.

## Setup and manual validation
- Authenticate `gh` as `farbotkol`; verify `gh api user --jq .login`.
- Verify `copilot` is installed, configured, and that supported `-p` programmatic mode does not bypass approval policies. Validate local Mac cwd and branch.
- Run `npm run agent:listener` with execution disabled to validate polling and identity; test with an owner-created synthetic task.
- Set `AGENT_CONTROLLER_ENABLED=true` only after confirming local agent permissions and safe task isolation.
- Test non-owner issue, fake claimed identity, edited issue, duplicate polling, crash restart, bad JSON, wrong branch, missing CLI, and denied destructive task. Report evidence, not assumptions.

**Important integration caveat:** Only owner-authored GitHub issues qualify. This initial rule cannot guarantee that an issue created by ChatGPT's GitHub connection qualifies (the API may attribute authorship to an app or bot). Before saying ChatGPT can directly launch work, create a benign task through the connector, inspect its API author and verify the control path. If it isn't `farbotkol`, request an explicitly authorised secure delegation design rather than loosening the owner's origin requirement.

## Implementation and acceptance evidence — 4 November 2026

Scope: local development tooling only; application features, showcases, databases
and existing VS Code agent sessions were not changed. Documentation: updated in
the controller [README](./README.md); application User Guide not applicable.

| Requirement | Implementation and actual evidence | Status |
| --- | --- | --- |
| Owner-only, explicit authorization | Strict whole-body envelope, fixed owner login/ID/User, REST plus GraphQL original-body provenance; tests reject collaborators, bots, edited bodies, quoted commands and ordinary discussion. Original owner task #7 passed the actual GitHub provenance check. | Pass |
| CLI and startup | `npm run agent:listener`, dry-run default, opt-in synthetic/coding modes, bounded one-shot or serialized continuous polling. Actual default owner-authenticated polling passed. | Pass |
| ChatGPT submission | Fixed-repository owner-OAuth Action schema, explicit readback/authorization and consequential confirmation; bot bypass remains prohibited. Schema tests pass; its exact status query was verified against GitHub. Owner OAuth registration and an actual ChatGPT submission are not configured/tested. | Partially verified; external configuration required |
| Both workstreams | Separate branch/checkout profiles and workstream-specific project context. Roadmap synthetic dispatch passed on GitHub; Award Central branch and prompt context passed targeted tests. No existing VS Code chat/session control is claimed. | Pass for fresh CLI dispatch; session resume not supported |
| Execution and reporting | Real synthetic issue [#7](https://github.com/farbotkol/butterbox/issues/7): dry-run eligible=1/executed=0; synthetic eligible=1/executed=1; original owner queued/running/succeeded comments; ledger succeeded/exit=0; duplicate poll eligible=0/executed=0. Its clean checkout remained at `30c79688c1c203763dd99c6e4ecf60b1dc4424f1` with no changes. | Pass for synthetic; real coding permissions not runtime verified |
| Continuous Mac safety | Private atomic/fsynced ledger, account-wide lock, explicit interruption recovery/acknowledgement, bounded output and deadlines, subprocess group cancellation, API/reporting failures fail closed. Real subprocess tests verify descendants stop; continuous CLI SIGINT test verifies exit 130 and lock release. | Pass for tested lifecycle paths |
| Coding permissions | Exact local task/commit/file and executable hash/version approval, secret-free checkout, dedicated minimal CLI home, static restricted tools and no shell/MCP/privilege flags. Mocked dispatch tests pass; actual `--mode coding` without verification exits 1 with `coding_permissions_not_verified`. | Deliberately disabled; owner runtime verification required |
| Installation/shutdown/help | README covers prerequisites, profiles, synthetic validation, OAuth setup, local approval, Ctrl+C, recovery and troubleshooting. No login daemon, inbound listener or persistent coding runner was enabled. | Pass |

Security review finding resolved: an owner-created issue remains attributed to
its creator after a collaborator edits its body. Creator identity alone was
insufficient; all edited bodies now fail original-owner provenance before
dispatch. This does not pretend GitHub OAuth guarantees the owner's spoken
intent: explicit ChatGPT confirmation and the additional local coding approval
remain required.

The targeted suite covers identity, parsing, provenance, permissions, locks,
crash/replay recovery, both workstreams, reporting errors, subprocess bounds,
shutdown, CLI configuration/approval changes and OAuth schema. See the README
for final command/results evidence. No Next.js build or application/database
regression was run: no application route, TypeScript, schema or dependency
changed. These results do **not** prove unattended real coding or an end-to-end
voice-first integration.
