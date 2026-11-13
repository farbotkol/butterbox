# Availability, limitations and roadmap

[← Wiki home](Home.md) · [Product overview →](Product-Overview.md)

## How to read status

This wiki distinguishes **documented implementation**, **tests run in an isolated environment**, **merged and currently in Development**, **available in a particular showcase**, and **approved for real-customer release**. None automatically implies the next.

The historical implementation ledger has many rows labelled “Done,” but the Beta v0.1 parent issue explicitly requires a fresh end-to-end acceptance review rather than accepting legacy status at face value.

## Core Beta v0.1 target

The proposed first pilot journey is:

**Create venue → add/invite team → roster and publish → worker time capture → review/approve → finalize → approved-hours CSV**.

Each stage requires actual tenant and permission testing, reliable audit evidence and a recorded synthetic pilot rehearsal. The Beta scope also covers support, resilience, backups and rollback gates. The owner must explicitly approve any live pilot.

[Beta v0.1 planning and release gates: issue #245](https://github.com/farbotkol/butterbox/issues/245). This is planning intake marked **HOLD DISPATCH**, not authorization for a rollout.

## Generally not accepted as live capabilities

- Direct payroll-provider integration, including Xero, MYOB or Employment Hero.
- Award Central legal award/pay calculation and compliance certification.
- AI-generated rosters, dynamic labour optimization and actual demand forecasting.
- General external delivery channels (SMS/WhatsApp/email/push notifications outside supported account-service messages).
- Self-service subscription billing and a complete production go-live/readiness sign-off.
- Demo-to-real-tenant conversion and unrestricted real-data showcase use.

The current dashboard can display concept cards and an AI Copilot concept panel. Those labels **do not** establish a functional AI service. A separately verified synthetic environment can show fictional future-vision examples, but they are static concept previews.

## Decisions versus implementation

- Per-venue subscription tiering has owner-approved product direction (see [4 November decision handoff](../agent-handoffs/2026-11-04-owner-decisions.md)); billing activation is a separate implementation and acceptance question.
- Customer export/retention direction is recorded in DEC-001, but proposed cancellation-day defaults and deletion conditions require further legal/operational approval.
- Operational backup/recovery gates remain separate from marketing-level readiness claims.

## Current delivery blockers (13 Nov 2026)

- CI/test strategy issue #249 and draft PR #252 are not yet the default PR operating model.
- Issue #253 tracks browser test stabilization after the latest full run reported 23 failures.
- A focused green check covers only its selection, not all 23 failed tests.
- Beta release and production readiness require explicit owner approval and evidence under issue #245.

## Source links

[User Guide: not generally available](../USER_GUIDE.md#features-not-yet-generally-available-or-accepted) · [Decision Log](../DECISION_LOG.md) · [Implementation Progress](../../IMPLEMENTATION_PROGRESS.md) · [Backlog](../../BUTTERBOX_PRODUCT_BACKLOG.md)
