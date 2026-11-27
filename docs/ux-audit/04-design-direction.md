# Proposed product structure and design system

## Information architecture

| Destination | Owner and manager | Employee |
| --- | --- | --- |
| Today | Staffing gaps, late clocks, requests and approvals due. Role-scoped action links. | Next shift, clock status and pending requests. |
| Roster | A single schedule workspace. Week, Day and Planning views share the selected venue, week and authorised filters. | My schedule, open shifts, swaps and shift conversations. |
| People | Directory → profile with Overview, Employment, Roles & access and Activity. Add and invitation remain separate intentional processes. | My profile and availability under Me. |
| Time | Exceptions → Review time → Payroll preparation, with role- and state-appropriate actions. | My time, corrections and approval outcomes. |
| Inbox | Notifications plus action queue with source links and unread counts. | Schedule changes, announcements and requests. |
| Settings | Venue, departments and roles, permissions, integrations and audit history. Owners see business configuration, managers only the scope they administer. | Account and help under Me. |

Desktop uses a shallow sidebar with an always-visible business and venue selector. Tablet moves the secondary nav into a collapsible rail and retains a visible workspace heading. Employee mobile prioritises Today, Clock, Schedule, Inbox and Me. Manager mobile prioritises Today, Roster, Time and More. Route changes retain authorized context, and business switches reload the scope with the previous tenant's client state cleared.

## Foundations

- Keep the existing ocean, cloud and ink palette. Use ocean **#123F4A** for primary actions, ink **#173A40** for body text, muted **#53696D** for supporting copy and cloud **#FAF9F6** for page background. Use sea-glass and sun for accents. Add status text and icons for Draft, Published, Conflict, Needs approval, Approved and Exported. Verify each composed foreground/background pair against WCAG 2.2 AA.
- Retain Inter for UI and reserve Poppins for display. Use a 14–16 px interactive baseline and tabular figures for time and hours. Prefer 24–30 px page titles, 18–20 px section titles and sentence case controls. Adopt a 4/8/12/16/24/32 spacing scale. Use a 44 px target for key controls and viable alternatives for dense grid cells.
- Use one primary action per task scope, for example Save draft in a drawer and Publish changes in the workspace. Add text labels to unfamiliar icons and preserve visible keyboard focus. Place destructive commands away from routine Save actions. Confirm publishing, payroll finalisation, material permissions and irreversible mutations with scoped consequences.

## Components and behaviour

| Component | Contract |
| --- | --- |
| Shell and header | Landmark, skip target, active route, workspace context and sticky section title. Prefer stable headings and link names. At 320 px keep page scroll vertical. |
| Filter and table | Visible active chips, clear all, result count, native semantics, useful no-results recovery and named scroll containment for wide data. Encode safe range/filter state in URL. Never restore a filter outside the effective scope. |
| Roster cell and editor | Click Add in a person/day cell or activate from keyboard. Prefill scoped resource, date and optional time. Edit existing shift in the same drawer. Offer Move, Duplicate, Resize and Delete in an accessible action menu. Retain scroll, focused origin, week, lens and filter after every mutation. |
| Collision and bulk preview | Show availability, conflicting shift and reason near the proposed placement. Distinguish advisory warnings from protected blocks. For bulk edits expose exact count, impact, skipped items, and disposition before commit. Uncertain mutation outcome requires reconciliation. |
| Profile and settings | Use consistent tab order. One save per independently editable section or same-domain record. Preserve untouched values. Explicitly show cross-record partial success with retry for the failed section. Separate invite, access change and sensitive payroll actions from ordinary profile save. |
| Time review | Work from a queue of exceptions, with planned vs actual, original events, correction reason and approval state in the same review panel. Allow approve and next only when eligible. Preserve source IDs and audit history. |
| Feedback | Store field errors adjacent to inputs and show a focused summary for multi-field failure. Keep values on validation and transient failure. Use one polite live-region receipt per successful operation and a visible retry surface. Skeletons keep geometry stable. |
| Responsive editor | Side drawer at desktop, full-height focus-managed overlay when narrow. Escape and Cancel restore the origin. Dirty-close warning applies to unsaved changes. On mobile, default to an agenda rather than requiring horizontal roster interaction. |

## Rollout and guardrails

Ship a vertical slice around draft shift creation and editing, then validate moves and collisions, then bulk and publication. Treat UI reuse and permissions as separate concerns with existing server scope checks effective on every path. Keep cancelled or failed optimistic updates reversible locally and validate stale version and overlap on the server. Preserve draft versus published visibility, notification acknowledgement, immutable attendance events, pay-period locks, CSV provenance and audit attribution throughout the redesign.

The [visual wireframes](wireframes.html) cover roster and edit drawer, publication, venue settings, time review, person profile and employee mobile. Each concept uses fictional examples.
