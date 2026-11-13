# Butterbox App Wiki

> **Butterbox Systems:** *Less admin. More good days.*
>
> **Wiki edition:** 13 November 2026. **Status:** a navigational summary of the current Development repository and its documented workflows. This is **not** a production-readiness certification or a replacement for product acceptance testing. Features may differ between Development, the isolated showcase and any deployed environment.

Butterbox is a multi-tenant workforce-management application intended for Australian cafés, restaurants and hospitality venues. Its day-to-day loop connects **venue setup → people and availability → roster planning and publication → attendance → timesheet review and approval → finalised hours → payroll-ready CSV**.

## Browse the wiki

| Topic | Start here |
|---|---|
| **New to Butterbox?** | [Product overview and capabilities](Product-Overview.md) |
| **Who can do what?** | [Accounts, personas and permissions](Roles-and-Access.md) |
| **Managing a venue** | [Owner and manager workflows](Venue-Operations.md) |
| **Employee experience** | [Employee workflows](Employee-Experience.md) |
| **Time and payroll** | [Attendance, approval and CSV exports](Time-and-Payroll.md) |
| **How it's built** | [Architecture, data and security](Architecture-and-Security.md) |
| **Delivery and quality** | [Testing, environments and release](Testing-and-Release.md) |
| **What is ready?** | [Availability, limitations and roadmap](Status-and-Roadmap.md) |

## At a glance

- **Customers:** Australian venue owners, general managers, FOH/BOH and department managers, employees and payroll operators.
- **Application:** Next.js, React and TypeScript on Supabase Auth/PostgreSQL with Row Level Security.
- **Work organisation:** Separate business, venue and department scopes. Authorization is checked on the server and in the database, not by navigation visibility alone.
- **Payroll boundary:** Current generic export contains **approved time/hours information**, not award interpretation, gross wages, tax or live payroll-provider processing.
- **Showcase:** An optional, isolated, fictional-data environment. It is not a production tenant or proof of live customer readiness.

## Recommended journey for reviewers

1. Start at [Product overview](Product-Overview.md) and [Roles and access](Roles-and-Access.md).
2. Follow a sample venue from [setup through roster publication](Venue-Operations.md).
3. Review what a worker sees in [Employee experience](Employee-Experience.md).
4. Trace recorded time through [approval and export](Time-and-Payroll.md).
5. Check [Status and roadmap](Status-and-Roadmap.md) before describing any feature as generally available.

## Source of truth and maintenance

This wiki is an **index and explanation layer**, not a second independent specification. For exact controls, error handling and feature-specific caveats refer to:

- [User Guide](../USER_GUIDE.md): primary usage instructions and screen-level guidance
- [README](../../README.md): setup, deployment, operations and showcase instructions
- [Product Decision Log](../DECISION_LOG.md): owner decisions versus pending approvals
- [Implementation Progress](../../IMPLEMENTATION_PROGRESS.md): historical engineering evidence and blocked work
- [Engineering Instructions](../../AGENTS.md): design, security and acceptance expectations
- [Product backlog](../../BUTTERBOX_PRODUCT_BACKLOG.md): planned backlog; historical “Done” does not mean beta acceptance
- [CI stabilization issue #253](https://github.com/farbotkol/butterbox/issues/253) and [CI strategy issue #249](https://github.com/farbotkol/butterbox/issues/249): live delivery context as of this edition

When a product flow changes, update the primary User Guide and affected wiki page in the same PR; preserve source references and distinguish **implemented**, **verified in isolation**, **blocked**, **proposed**, and **approved for release**.
