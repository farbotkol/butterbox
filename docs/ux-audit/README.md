# Butterbox UX and UI audit

28 November 2026 · Development source `2517f9ae204ab7ec5c035c867526ab19ff9292b6`

## Executive assessment

**Make the roster the first redesign slice.** Owners can already add, edit, copy and move shifts. The principal friction is reaching those controls and staying oriented while using them. The weekly grid begins 523 px below the desktop fold, 655 px below the tablet fold and 1535 px below the phone fold. The assigned-draft journey takes two clicks and one save once the cell is visible. Retain that transaction and put the editor beside the shift, with the selected week, department, filters and scroll still visible.

**Give managers a clear place to start operational work.** Attendance, Work time and Timesheet review split the discovery, correction and approval steps. Start with one scoped Time queue and show source punches, edited time and the next valid decision together. Keep immutable events, approval attribution and finalised payroll history available.

**Group record editing around the person and venue.** Employment currently takes two page changes from the people directory. Venue settings present five independent forms. Make navigation, validation and save feedback consistent and keep sensitive changes explicit. Employee mobile should put Clock, Schedule and Inbox within direct reach.

## Recommended sequence

1. Prototype a contextual draft editor using the existing roster grid and server actions. Prove focus return, one write, same-week context and unchanged scoped permissions.
2. Add visible move and duplicate controls, then consolidate planning, bulk operations and publication into one roster workspace. Keep Planning read-only for the same audience and preserve operational week and payroll boundary semantics.
3. Establish role-specific navigation and reusable feedback patterns alongside the roster work. Apply those patterns to People, Venue settings and the Time queue before redesigning payroll preparation.

The owner review should settle the role navigation and the first roster slice before story scope changes. The backlog document includes dependencies, estimated complexity and acceptance evidence for that review. [Proposed backlog](05-prioritised-backlog.md)

## Evidence and scope

- The inventory covers 44 page routes and supporting route handlers, layouts, error boundaries, components and shared styling. Playwright recorded 180 route and viewport observations including the not-found probe. The authenticated fixtures covered an owner, FOH manager, BOH manager and employee. [Screen inventory](01-screen-inventory.md)
- The local isolated showcase contained 14 fictional employees. The review produced 42 original captures and seven annotated variants across 1440×1000, 820×1180 and 390×844. Measured tasks included draft save and update, duplicate and undo, drag preview, week copy, employee clock-in and clock-out, and payroll record review. [Journeys](06-journey-measurements.md) · [Screenshots](07-screenshot-evidence.md)
- Twelve sampled axe scans found zero automated WCAG-tagged violations. Keyboard-only scheduling, screen-reader operation and real touch drag remain unverified. The local build used fallback fonts. Vendor comparisons use public documentation. [Accessibility scope](06-journey-measurements.md#accessibility-validation-and-limits) · [Industry research](03-competitor-research.md)
- Existing-member setup redirect, invalid invitation and unpaired kiosk states appear in the browser coverage. Fresh onboarding, actual email delivery, paired kiosks, physical geolocation, external provider consent and payroll transmission were outside the executed scenarios. UI observations do not establish tenant isolation or accessibility conformance across every state.

## Audit files

| Document | Use |
| --- | --- |
| [Screen inventory](01-screen-inventory.md) | Route, access and component map |
| [Ranked findings](02-findings.md) | Severity, current behaviour and opportunities |
| [Competitor research](03-competitor-research.md) | Six vendors, pattern comparisons and component choices |
| [Design direction](04-design-direction.md) | Proposed architecture, design system and interaction contracts |
| [Prioritised backlog](05-prioritised-backlog.md) | Sequencing, risks, story mapping and proposed automated acceptance |
| [Journey measurements](06-journey-measurements.md) | Baselines, observable results, target budgets and limits |
| [Screenshot evidence](07-screenshot-evidence.md) | Annotated captures and browser matrix |
| [Visual wireframes](wireframes.html) | Roster, publication, venue settings, time review, person detail and employee mobile concepts |
