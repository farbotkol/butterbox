# User journey measurements

Playwright and headless Chromium ran against the local isolated Butterbox showcase. Accounts, shifts, attendance, timesheets and export examples were fictional. The audit used the current fixture week for scheduling and a completed fixture week for payroll history. Viewports were 1440×1000 desktop, 820×1180 tablet and 390×844 phone. Theme styling ran with local fallback fonts. The setup is suitable for observing interaction and layout, with no claim about deployed performance or precise production typography.

Clicks count button, link and disclosure activations including Save and Confirm. Field edits and drag gestures are listed separately. A page transition changes the path. A same-page URL change alters query or fragment state without changing the path. A save is a successful commit surfaced by the application. The invalid draft's submit attempt is counted as a click. Each journey starts at the named surface. Initial navigation, setup, scrolling and sign-in are excluded unless specified.

## Measured interactions and targets

The target column is a proposed design budget. C = clicks, P = page transitions, S = successful saves, K = explicit confirmations. Budgets include all actions described for the journey. Discoverability and context targets apply alongside the counts.

| Journey | Current C / P / S / K | Observed context and friction | Proposed target C / P / S / K |
| --- | --- | --- | --- |
| Owner creates assigned draft from a roster cell | 2 / 0 / 1 / 0 | Four field edits. Two same-page URL changes. Week retained and draft appeared on the grid. The add affordance begins below the fold. | 2 / 0 / 1 / 0. Prefill date, resource and time from the cell where unambiguous. Keep grid, filter, scroll and focus on return. |
| Owner updates a saved draft | 2 / 0 / 1 / 0 | One field edit. Two same-page URL changes. The exact updated time appeared in the same week. | 2 / 0 / 1 / 0. Show shift context beside the editor and return focus to the edited shift. |
| Owner previews duplicate, applies and undoes | 4 / 0 / 2 / 1 | Two field edits. The non-drag controls retained the page and showed an undo receipt. | ≤4 / 0 / 2 / ≤1. Provide a direct Duplicate command. Prompt for material ambiguity and conflicts. Offer Undo. |
| Owner drags to another day then cancels | 1 / 0 / 0 / 0 | One drag and one Cancel click. The proposed move opened before any write. | 1 / 0 / 0 / 0. Preserve a keyboard and touch alternative with the same preview and cancel results. |
| Owner switches from operational roster to Planning and returns | 2 / 2 / 0 / 0 | Two distinct routes. Return requires choosing an operational week. | 2 / 0 / 0 / 0. Make Planning a view in Roster, show the mapped operational week and preserve its scope. |
| Owner copies a previous week into the selected week | 1 / 0 / 1 / 0 | One source-week field edit. One same-page URL change. Eight draft copies in one department. No separate change preview. | ≤2 / 0 / 1 / ≤1. Show count, destination and skip/conflict treatment before applying. |
| Owner searches for an employee on the roster | 1 / 0 / 0 / 0 | One field edit and one same-page URL change. Search is a separate form above the grid. | ≤1 / 0 / 0 / 0. Show selected filters together and keep the relevant result region in view. |
| Owner submits an invalid draft from its editor | 2 / 0 / 0 / 0 | Opening changes the same-page URL. Submitted without a role. Inline error and inputs retained. | 2 / 0 / 0 / 0. Focus the first invalid input. Keep grid, week and pending fields. |
| Owner reaches employment editor from People | 2 / 2 / 0 / 0 | Person profile then a separate employment route. | 2 / 1 / 0 / 0. Open Employment within the profile and keep directory context available on return. |
| Owner opens original events from a timesheet row | 1 / 0 / 0 / 0 | Original clock event displayed in a row disclosure. The count starts at Timesheets with the row available. | ≤1 / 0 / 0 / 0. Show original and corrected values in one review panel, reachable from the exceptions queue. |
| Owner opens finalised payroll records and export history | 2 / 0 / 0 / 0 | Two independent disclosures retain the route. History and readiness are difficult to scan together. | ≤1 / 0 / 0 / 0. One History tab exposes both record sets with clear groups. |
| Owner adds fictional payroll destination and opens employee mapping | 3 / 3 / 1 / 0 | Two field edits and three paths. Setup is separate from the selected employee and does not contact an external provider. | ≤3 / ≤1 / 1 / 0. Keep setup deliberate. Return to the readiness task with the new destination selected. |
| Employee reaches My schedule from mobile Dashboard | 2 / 1 / 0 / 0 | Menu then My schedule. The destination links shift-related help, requests and inbox. | 1 / 1 / 0 / 0. Persistent Schedule entry. Put the next shift and required actions first. |
| Employee clocks in and out from mobile Attendance | 2 / 0 / 2 / 0 | No field edits with one linked department. Clock-out became available after clock-in and the page returned to Clocked out. One same-page URL change. | 2 / 0 / 2 / 0. Keep clock status and button visible on entry, with geofence and offline recovery where applicable. |

[Browser matrix](evidence/browser-matrix.csv) · [Measured journeys](evidence/journeys.json) · [Responsive measurements](evidence/roster-viewport.json)

## Discoverability and responsive behaviour

| Owner roster | First pixel of Weekly schedule heading | Visible width / scroll content width | Document overflow |
| --- | --- | --- | --- |
| Desktop 1440×1000 | 1523 px | 1128 / 1312 px | None |
| Tablet 820×1180 | 1835 px | 508 / 1312 px | None |
| Phone 390×844 | 2379 px | 348 / 1312 px | None |

Roster controls above the grid include department, date, view, search, copy and publication surfaces. Wide content is contained in a named scroll region, and the employee column stays visible while the days scroll. The phone captures show one day beside the pinned column. Opening an editor from the grid changes same-page URL state, and the exact scroll and focus coordinates after Save were not instrumented. The proposed acceptance criteria require that stronger check.

The populated owner venue settings surface had five visible forms and five submit buttons across 2159 px. Work time exposed 14 visible forms across 4667 px on the seeded completed week. Weekly Timesheet review was 7946 px tall. These counts depend on role, data and disclosure state and describe the captured fixture.

## Accessibility, validation and limits

Twelve axe scans across entry, roster, people, venue settings, time and employee self-service reported zero automated WCAG-tagged violations. This was a representative scan of resting states. Keyboard-only scheduling, focus return after every mutation, assistive technology, forced colours, outdoor contrast, 320 px reflow and real touchscreen gestures still require focused verification. The duplication journey verified the non-drag controls using pointer activation. Drag was tested only through a proposal and cancellation.

The shift editor showed a field-level error after an invalid submit. Account recovery, invitation and kiosk entry surfaces were inspected in the browser. This audit did not complete an external invitation delivery or acceptance, a password-reset email round trip, kiosk pairing, real geolocation or provider OAuth and live payroll transfer. The fictional historical timesheets were seeded approved and finalised. The browser verified source and export history and retained those states, without timing approval, finalisation or publication across all policy modes. Actual notifications and employee acknowledgement delivery were excluded. Manual interpretation of discoverability is a design finding without participant task-time claims.

[Axe evidence](evidence/accessibility-scans.json) · [Screenshot evidence](07-screenshot-evidence.md)
