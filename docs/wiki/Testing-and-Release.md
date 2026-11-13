# Testing, environments and release

[← Wiki home](Home.md) · [Status and roadmap →](Status-and-Roadmap.md)

## Testing layers

| Layer | Purpose | Trigger/status as of this edition |
|---|---|---|
| Fast unit/static checks | Unit tests, lint, TypeScript/build and evidence validation | Existing `Verify / verify` PR gate |
| Database correctness | SQL/pgTAP tests in disposable Supabase | Existing `Verify / database` gate |
| Tenant isolation | Authenticated cross-tenant negative checks | Included in required database verification |
| Focused browser tests | Selected Playwright tests for a specific fault or changed workflow | Diagnostic runner; not itself a merge gate |
| Full browser regression | Broad authenticated browser/axe scenarios | Existing required database workflow; expensive and currently has recorded failures |
| Fast database smoke candidate | pgTAP, tenant isolation, critical browser selection | Proposed in **draft PR #252**, **not yet the default required check** |
| Nightly and release-commit full regression | Comprehensive off-PR suite and exact release candidate validation | Proposed in **draft PR #252**, not yet merged into Development |

The measured fast smoke candidate passed in about **3m 53s**, while the previous required full browser run on PR #252 recorded **85 passed, 23 failed, 1 skipped**. A fast pass does not negate the full-suite failures.

## Current issue dependencies

- [Issue #249](https://github.com/farbotkol/butterbox/issues/249): staged fast PR, targeted integration, nightly full regression and safeguarded cutover.
- [PR #252](https://github.com/farbotkol/butterbox/pull/252): non-gating fast candidate and nightly workflow, **draft** at wiki creation.
- [Issue #253](https://github.com/farbotkol/butterbox/issues/253): investigate and stabilize 23 browser regressions. A focused WCAG batch passed; the full set remains unverified.
- [Focused diagnostic run #43419683296](https://github.com/farbotkol/butterbox/actions/runs/43419683296): focused WCAG run on a repair branch. A subsequent requested batch should be checked on its own run, not conflated with this result.

## Development and test environments

The repo's README documents Node.js 24, a pinned Supabase CLI and Docker for local development. Environment variables include a local Supabase URL/key and application origin; do not paste secrets into issues, docs or CI output.

Common commands from `package.json`:

```sh
npm ci
npm run test:fast
npm run test:auth:focused -- --test tests/e2e/auth.spec.mjs:<line>
npm run test:ci:local
```

Focused browser runs use isolated test environments and produce artifacts such as screenshots/traces on failure. They should target the actual failing test cases, rather than quietly ignoring them.

## Safe merge and release approach

1. Reproduce failures with focused tests, retain trace evidence and fix their shared causes.
2. Re-run affected tests at the exact fix SHA; avoid broad test disabling or inflated timeouts as camouflage.
3. Require existing protected checks on mergeable PRs. If check-name cutover is needed, change CI and rulesets together with a reversible plan.
4. Run the **full regression on the exact release candidate SHA** before an authorized Beta or production release.
5. Record owner go/no-go, known limitations, rollback and operational readiness. GitHub green checks alone do not authorize customer activation.

**Source:** [Local CI testing](../LOCAL_CI_TESTING.md), [AGENTS.md](../../AGENTS.md), [Beta planning issue #245](https://github.com/farbotkol/butterbox/issues/245).
