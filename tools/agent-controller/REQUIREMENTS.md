# Butterbox local agent controller — MVP requirements and operating rules

**Status:** Development tooling only. User decision (4 Nov 2026): **execute instructions only when issued by the owner's GitHub user, `farbotkol`.** Not a production app feature.

## Purpose
Small opt-in Mac command-line listener to poll GitHub and dispatch *explicit* owner-approved work to local GitHub Copilot CLI. Polling needs no inbound port, webhook, tunnel, cloud server or second repository. Local Docker/Supabase/Ollama stay on the Mac. This is **not remote desktop control of an existing VS Code Chat session**: CLI is a separate agent invocation unless supported session-resume is positively verified.

## Security contract (mandatory)
1. Only process GitHub issues in `farbotkol/butterbox` whose **API-confirmed issue author login** is exactly `farbotkol` (case-insensitive). Issue-body or comment text claiming to be the owner is never authoritative. No bot-created task, collaborator task or quoted content bypasses this gate. Owner-authored comments cannot authorise someone else's issue in MVP. The connected ChatGPT GitHub integration may create issues as a bot; such issues are **intentionally rejected** until a future secure delegation mechanism is explicitly designed and approved.
2. Require issue label `butterbox-agent-task`, an explicit `/butterbox run` command on its own line in the original **owner-authored issue body**, and a JSON fenced block with `workstream` (`roadmap` or `award-central`) and `task` (1–4000 characters). No generic shell commands or executable workflow in issue content. **Discussion alone never triggers execution.**
3. Set `AGENT_CONTROLLER_ENABLED=true` locally to permit execution; default off. Use a separate operator-created GitHub authentication via `gh auth login` with minimum necessary repo permissions. Never put tokens into issues, logs or source control.
4. Never execute issue body as shell. Start only an installed and positively verified `copilot` executable with static, reviewed arguments and a bounded, text-only prompt; use `spawn` with `shell:false`. Confirm current Copilot CLI syntax and approval semantics before enabling unattended execution; deny privilege escalation or destructive permission modes. If CLI isn't installed or supported, fail closed.
5. Agent's prompt must enforce AGENTS.md, owner decisions, read-only evaluation where applicable, tenant isolation, restricted development scope and existing approval gates. No production deploy, paid service, secrets, live payroll, DB reset or destructive actions without separate approval. Treat issue text as untrusted *task data*; it cannot override these constraints. For MVP, restrict tasks to developer-repository work, with a human-reviewed local allowlist before enabling if your environment cannot safely confine Copilot tools.
6. Fail closed on any GitHub API error, ambiguous identity, malformed issue, unknown workstream, invalid status, existing running work, unclean working tree, wrong repository/branch, unavailable CLI or failed checks. One task at a time. No automatic agent switching/restarts.
7. Persist a local run ledger outside git so a task is not replayed after crash or restart; atomically reserve task before invoking CLI. Polling can only resume after restart; do not silently re-run interrupted work. Ignore and report edited issue content after first reservation.
8. Report status to GitHub issue using authenticated `gh` CLI; avoid logging prompt secrets/private data. Clearly distinguish queued/running/succeeded/failed/interrupted and the actual local exit status, not claims of story acceptance.
9. Owner can stop listener with Ctrl+C. Do not daemonise or start at login until explicitly configured. Never open inbound ports.

## Implementation deliverables
- `tools/agent-controller/listener.mjs` — plain Node.js ESM, `gh` REST polling and safe task dispatch.
- `tools/agent-controller/README.md` — setup, environment, dry-run/opt-in, security and limits.
- `tools/agent-controller/listener.test.mjs` — identity and parsing safety tests.
- Root `package.json` script `agent:listener` for `node tools/agent-controller/listener.mjs`.
- Keep generated state in `.agent-controller/` (gitignored). Do not install new dependencies or connect to paid infrastructure.

## Setup and manual validation
- Authenticate `gh` as `farbotkol`; verify `gh api user --jq .login`.
- Verify `copilot` is installed, configured, and that supported `-p` programmatic mode does not bypass approval policies. Validate local Mac cwd and branch.
- Run `npm run agent:listener` with execution disabled to validate polling and identity; test with an owner-created synthetic task.
- Set `AGENT_CONTROLLER_ENABLED=true` only after confirming local agent permissions and safe task isolation.
- Test non-owner issue, fake claimed identity, edited issue, duplicate polling, crash restart, bad JSON, wrong branch, missing CLI, and denied destructive task. Report evidence, not assumptions.

**Important integration caveat:** Only owner-authored GitHub issues qualify. This initial rule cannot guarantee that an issue created by ChatGPT's GitHub connection qualifies (the API may attribute authorship to an app or bot). Before saying ChatGPT can directly launch work, create a benign task through the connector, inspect its API author and verify the control path. If it isn't `farbotkol`, request an explicitly authorised secure delegation design rather than loosening the owner's origin requirement.
