# Butterbox — Owner decisions and agent implementation handoff
**Approved 4 November 2026 (Australia/Melbourne)** · **Status: decisions approved; implementation and tests not yet verified**

This handoff records owner instructions for the Roadmap and Award Central agents. Work from current repository state and existing backlog stories; do not create duplicate implementations or mark stories Done on the strength of this document. Follow `AGENTS.md` and the existing security, branch, risk-based testing and progress-reporting rules. No production deployment, paid service, live payroll, hosted database, or destructive modification of existing data is authorised here.

## 1. SaaS pricing and entitlements — approved commercial decision
All product features are available in every tier, including Free. **Entitlements differ only by active worker count at each venue/location.** Prices below are **AUD per venue per month** (billing tax treatment and payment implementation to be verified).

| Venue's counted workers | Tier | Monthly price (AUD) |
|---|---|---:|
| 1–3 | Free | $0 |
| 4–15 | Starter | $15 |
| 16–30 | Pro | $25 |
| 31–60 | Plus | $45 |
| 61–100 | Growth | $69 |
| 101–200 | Scale | $99 |
| 201+ | Enterprise | Custom |

- Free has **no time limit** and is a legitimate small-venue plan, distinct from the pre-existing isolated synthetic-data showcase/demo.
- **Calculate entitlement and billing independently for every venue**, not globally per business. Example: a business with 10 workers at Venue A owes $15/month there; an additional location is priced separately based on its own workers.
- An employee who works at two venues contributes to the count at **both** venues. Avoid double-counting the same person within one venue. Define/count active venue assignments, not historic/inactive workers; document the lifecycle and boundary rules for reviewer approval before enforcement if ambiguous.
- Existing entitlements must enforce tier changes safely and predictably, with clear upgrade handling rather than silently disabling core functionality or deleting records.
- Build a tier configuration/data-driven entitlement service and tests covering exact boundaries, venues with overlapping workers, 0/empty venues, activation/deactivation and tenant isolation. Do not introduce feature-gating across tiers.
- Confirm how a zero-worker venue is displayed/treated before charging; the table expressly defines Free as 1–3.
- Update relevant subscription stories, acceptance evidence and pricing documentation. Do not activate charging or external billing providers without separate approval.

## 2. AI governance and model evaluation — approved development direction
Both **manager/owner and employee assistants** are in scope; roll out manager use cases first, then employee use cases after proving safety. The application must remain **model/provider independent**, with deterministic permission checks and business calculations.

- On the development **Apple Silicon Mac (32 GB RAM)**, assess installed Ollama, available disk/RAM, and whether the agent has direct Mac execution permissions.
- **Primary experimental model:** `qwen3.5:9b` via Ollama. **Comparison candidate:** `gemma4:12b`. Verify actual Ollama availability, exact tags, model licences and hardware requirements at setup time rather than assuming they are present. If one is unavailable/incompatible, report accurately and use a suitable explicitly approved fallback; do not silently change the chosen models.
- Installation is an **explicit optional developer setup step**, not `npm install`, application startup, Docker build or CI. Suggested local commands (only after compatibility check):
  ```sh
  ollama pull qwen3.5:9b
  ollama pull gemma4:12b
  ollama list
  ```
- Keep model weights, secrets and Mac-specific paths out of Git. Example server-side development defaults: `AI_ENABLED=false`, `AI_PROVIDER=ollama`, `AI_MODEL=qwen3.5:9b`, `OLLAMA_BASE_URL=http://localhost:11434` (verify container-to-host networking where applicable).
- Enforce server-side business/venue/department/employee permissions and tenant boundaries *before* retrieval or tools; use allow-listed tools, strictly parsed structured outputs, request minimisation, bounded context, budgets, timeouts, audit metadata, fail-closed feature flags and graceful no-model behaviour.
- **Initial manager slice:** open-shift recommendations and explanations derived from eligible workers determined by deterministic shift/availability/rule checks. Never let the LLM override eligibility or publish a roster without authorised manager confirmation.
- **Initial employee slice:** read-only questions about their own next shifts, weekly shifts, availability and open shifts they can request; no access to another employee's private details.
- **Later candidate slices:** draft roster optimisation and labour-cost explanations. Deterministic solver/statistical forecast/rules engine must compute schedules, figures, award interpretations and wages; LLM only helps interpret/explain verified results.
- Benchmark both candidates with *synthetic* multi-tenant fixtures: tool-choice accuracy, valid JSON/contracts, fabricated facts, cross-tenant leakage, prompt injection, forbidden writes, useful response quality, latency, RAM and operational cost. Record real measured results; do not claim model superiority before tests.
- Never expose local Ollama publicly or connect it to production without separate review. Relate this work to **BB-AI-005 through BB-AI-008**, reconciling existing partial foundations first.

## 3. Award Central — initial award scope approved
Start MVP with **Restaurant Industry Award** and **Hospitality Industry (General) Award** only. The underlying model and rules engine **must be generic and reusable** for other Modern Awards later: versioned source documents, provenance/effective dates, reusable predicates, classification/employment type/pay-period/penalty rules, tenant mappings, immutable approved versions, audit and tests.

- Fetch and document authoritative Fair Work award instruments and pay guides, with publication/effective dates, update cadence and verification steps. Do not presume a guide alone resolves every rule.
- AI may assist in proposing/parsing draft rules but **must never activate or certify them**. Independent subject-matter validation/approval is required before calculations are presented as compliant.
- Use deterministic and tested evaluation of approved rules; include boundary fixtures (ordinary hours, overtime, weekends, public holidays, casual loadings, breaks and classification where relevant).
- Existing Award Central branch/workstream rules remain in force; coordinate changes and merge only through the approved workflow. Scope limitation does not imply other awards or production compliance are complete.

## 4. Xero Australian Payroll — preparatory integration work approved, live access pending
The owner will create a **new Butterbox Xero developer identity**. The coding agent can independently prepare the provider-neutral adapter, OAuth flow, secure configuration, mocks, synthetic test harness, employee matching, timesheet payload mapping, idempotency/retry/reconciliation and developer documentation now.

- Owner action remains: create/verify account at **https://developer.xero.com/**, configure/authorise app as required, and approve any Xero consent. **Do not create accounts, click external consent or assume credentials exist on the owner's behalf.**
- Verify current Xero developer/demo-company capability and specifically **Australian Payroll API support**, scopes, access restrictions and whether the selected test organisation supports the required payroll actions. Do not assume a demo company provides executable Payroll API access merely because a UI demo exists.
- Test mocks without credentials; use fictional data only for any later authorised connection. Never send live payroll or expose secrets.
- Related blocker **BB-PAY-004** is **partially unblocked for preparatory work**, not unblocked for a real Xero integration test; leave the external-access gate open pending verified owner login, app consent and a suitable test organisation.

## 5. Dedicated disposable local Supabase database — P0 infrastructure work
The owner confirms the development environment uses **Docker/local Supabase on the Mac**, and has not configured a hosted Supabase database. Create a **separate, disposable, verified local agent test project** without disturbing development or showcase data.

### Inspect before touching state
1. Inspect Docker context/daemon access, existing containers, networks, volumes and port ownership; Supabase CLI version, `supabase/config.toml`, existing scripts including `scripts/showcase-environment.mjs` and `scripts/test-tenant-isolation.mjs`, README, env files, and any tunnel/port forwards.
2. Distinguish inability of an agent's shell to access Docker from the Mac actually lacking Docker. Do not claim existing state was inspected until it was.
3. Never stop, overwrite, rename, reset or reconfigure ordinary development/showcase resources.

### Build separately
- Suggested isolated project ID: `butterbox-agent-test`; use a dedicated working directory and **independent Docker containers, volumes, network, auth and database data**. Avoid editing the existing project's `supabase/config.toml` as a switching mechanism.
- Candidate ports: **API 58421**, **PostgreSQL 58422**, **Studio 58423**; first check all are free, including tunnels. Resolve other required Supabase ports without collisions.
- Use the repo's existing migrations and *fictional* test fixtures only. No hosted projects, paid services or production/external provider connections.

### Guard destructive work
- Implement explicit `test:db:verify` checking project ID, container identity/labels, volumes, actual endpoints and schema/fixture provenance; **ports alone are insufficient**. Fail closed on uncertainty. Repeat verification immediately before every destructive operation.
- Provide reproducible guarded commands (adapt to actual tooling): `npm run test:db:start`, `test:db:verify`, `test:db:migrate`, `test:db`, `test:db:reset`, `test:db:stop`.
- Protect against two agents resetting each other's state: isolated per-agent project instances or explicit coordination/locking, not shared anonymous disposable databases.
- Verify migrations, schema, RLS, cross-tenant access, auth, role permissions and affected database-backed workflows. Record tests actually run and failures. Existing development and showcase containers/data must be demonstrated unchanged.

### Reassess dependent stories
After isolation is verified, reassess and resume **eligible** database-backed AI governance, venue subscription entitlements, provider-neutral payroll delivery, forecasting foundation and Award Central versioning/provenance. Do not turn on live payroll, publish unapproved pay rules, or activate external AI.

### Acceptance criteria / reporting
Environment exists in local Docker; its identity/volumes/ports are verified; migrations and targeted tests pass; normal development and showcase are untouched; reset safeguards are independently exercised; scripts and README reproduce the process; multi-agent collision handling exists. Agent reports actual results, modified files, unresolved external prerequisites and commit SHA. Update `BACKLOG_INDEX.csv`, `BUTTERBOX_PRODUCT_BACKLOG.md`, `IMPLEMENTATION_PROGRESS.md` and the **correct** `docs/agent-status/` workstream file as implementation progresses. Never mark parent stories Done without passing all their criteria.

## Agent execution order
1. Read `AGENTS.md`, `docs/DECISION_LOG.md`, this handoff and current backlog/progress/status, and inspect ongoing branch/worktree changes.
2. Reconcile these approved decisions with existing stories; record any conflicting assumptions rather than overwriting work.
3. Prioritise isolated local DB safety prerequisite; other independent preparatory work may proceed concurrently on isolated branches/worktrees.
4. Update real stories and tests in place (avoid duplicate story IDs). Follow targeted, change-focused tests and record pass/fail/blocked evidence.
5. Commit and push safe checkpoints on authorised development branches, verify remote commit, and report clearly which items remain blocked by the owner or provider.
6. **No automated continuation beyond an actually running agent session is implied by this document.** Do not self-trigger other agents without an explicitly supported execution mechanism.

**Owner approval covers these decisions and ordinary local development only—not unverified third-party access, production deployment, live transactions or destructive modification of existing data.**
