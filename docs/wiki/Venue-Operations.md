# Owner and manager workflows

[← Wiki home](Home.md) · [Time and payroll →](Time-and-Payroll.md)

## 1. Configure the workplace

An owner registers, confirms their account and completes the first business and venue setup. Required first-venue details include address and **venue timezone**. The venue then receives departments, role definitions, appropriate managers and employee profiles. Review venue settings such as geofence and publication mode separately.

## 2. Populate the team

Use **People** to review employee profiles, active/inactive state, department membership and role qualifications. Invite accounts into the correct scope. Workers may set recurring availability and submit date exceptions; managers should not treat missing availability as a confirmed “yes.”

## 3. Build a roster

On **Rostering** (`/roster`), choose a department, week and optionally one day. The schedule shows team members against local dates, including open shifts.

To create a draft, use a visible **Add at** slot or expand **Add shift manually**, select role/employee, start/end time and break, and save. The roster's shortcut slots are intentionally coarse (00:00, 06:00, 12:00, 18:00). Use the manual editor for other times and overnight work. Correct or delete a **draft** using guarded controls. Conflict checks cover configured overlaps, availability, leave and other policy constraints.

Use **Copy a previous week** for an authorized draft copy. An existing published roster is not silently replaced or altered by a draft.

## 4. Publish or request approval

A venue can use direct departmental publication or approval-based publication. When approval is configured, a distinct eligible reviewer evaluates a submitted snapshot and must provide a reason on rejection. Approval and publication recheck relevant eligibility and conflicts.

Draft shifts remain private until publication. Staff-facing in-app updates are recorded for supported published changes. Do not mistake notification delivery for evidence that a shift was accepted.

## 5. Handle vacancies and swaps

- **Open shift:** publish an unassigned future shift, select eligible staff, send an offer with an expiry and wait for responses. A **claim is not assignment** until an eligible manager confirms it. Withdrawals and ineligibility are handled explicitly.
- **Shift swap:** one worker requests, the other proposes/consents, the requester confirms the exchange and an eligible manager approves or rejects. Stale/changed shifts require reassessment.
- **Shift discussion:** authorized participants can review communications tied to a shift; access must remain scoped.

Development also documents rule-based candidate suggestions for open shifts. They are not AI-generated and are not enabled in every showcase.

## 6. Run daily operations

Review attendance alerts, location exceptions, correction requests, timesheet approvals, announcements and source audit history within your role. An attendance alert is a signal to investigate, not proof that a person was absent.

## First-time manager acceptance checklist

- [ ] Can access the correct venue and department, but not another tenant's data
- [ ] Can create and revise a draft shift, including an alternative start time
- [ ] Can see and interpret conflict warnings
- [ ] Can publish directly or request appropriate separate approval
- [ ] Employee sees the published shift, not the private draft
- [ ] Can review source attendance and approve only authorized time

**This checklist is a walkthrough template, not a recorded passing test.** For detailed instructions, use [User Guide: rostering](../USER_GUIDE.md#rostering), [open shifts and swaps](../USER_GUIDE.md#open-shifts-and-swaps) and [attendance](../USER_GUIDE.md#attendance).
