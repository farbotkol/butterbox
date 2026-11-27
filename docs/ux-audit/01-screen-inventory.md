# Application screen inventory

All 44 page routes were enumerated from the audited Next.js checkout. Access is a source-level entry-point guide. Permissions, active membership, active venue, feature state and record ownership can change what is rendered. O = owner, A = administrator, M = manager including scoped department managers, E = employee. Runtime observations are in [the browser matrix](evidence/browser-matrix.csv).

## Entry and account

| Route | Surface | Entry scope |
| --- | --- | --- |
| [/](../../src/app/page.tsx) | Dashboard, onboarding and urgent activity | O M E |
| [/login](../../src/app/login/page.tsx) | Sign in and error recovery | Public |
| [/signup](../../src/app/signup/page.tsx) | Create account and email confirmation | Public |
| [/forgot-password](../../src/app/forgot-password/page.tsx) | Request a reset link | Public |
| [/reset-password](../../src/app/reset-password/page.tsx) | Set a new password using recovery context | Token |
| [/choose-business](../../src/app/choose-business/page.tsx) | Choose or switch business | O M E |
| [/setup](../../src/app/setup/page.tsx) | Create or complete business setup | Setup |
| [/invitations/[id]](../../src/app/invitations/[id]/page.tsx) | Accept or decline an invitation | Token |
| [/help](../../src/app/help/page.tsx) | Role-sensitive help and guides | O M E |

## Scheduling and coordination

| Route | Surface | Entry scope |
| --- | --- | --- |
| [/roster](../../src/app/roster/page.tsx) | Operational roster, add/edit, quick changes, open shifts, requests, publication | O M E · scoped |
| [/roster/planning](../../src/app/roster/planning/page.tsx) | Venue-wide authorised read-only planning view | O M · scoped |
| [/my-schedule](../../src/app/my-schedule/page.tsx) | Personal shifts and shift actions | O M E · linked |
| [/availability](../../src/app/availability/page.tsx) | Recurring availability and dated exceptions | O M E · linked |
| [/shift-swaps](../../src/app/shift-swaps/page.tsx) | Swap requests and decisions | O M E · scoped |
| [/shift-conversations](../../src/app/shift-conversations/page.tsx) | Contextual shift conversation | O M E · scoped |
| [/announcements](../../src/app/announcements/page.tsx) | Read or manage team announcements | O M E · scoped |
| [/notifications](../../src/app/notifications/page.tsx) | Notification inbox and read actions | O M E |

## Time and payroll

| Route | Surface | Entry scope |
| --- | --- | --- |
| [/attendance](../../src/app/attendance/page.tsx) | Clock state, corrections, claims and alerts | O M E · scoped |
| [/attendance/alerts](../../src/app/attendance/alerts/page.tsx) | Attendance alert setup and resolution | O M · scoped |
| [/attendance/history](../../src/app/attendance/history/page.tsx) | Own attendance history | O M E · linked |
| [/attendance/qr](../../src/app/attendance/qr/page.tsx) | Venue clock QR setup | O · scoped |
| [/attendance/kiosks](../../src/app/attendance/kiosks/page.tsx) | Manage kiosk installations | O |
| [/kiosk](../../src/app/kiosk/page.tsx) | Pair and operate dedicated clock kiosk | Device |
| [/work-time](../../src/app/work-time/page.tsx) | Recorded work time and corrections | O M |
| [/timesheets](../../src/app/timesheets/page.tsx) | Weekly review, source events, payroll period and export | O M · scoped |
| [/settings/payroll](../../src/app/settings/payroll/page.tsx) | Provider and employee mapping overview | O A |
| [/settings/payroll/new](../../src/app/settings/payroll/new/page.tsx) | Payroll mapping destination configuration | O A |
| [/settings/payroll/xero](../../src/app/settings/payroll/xero/page.tsx) | Xero connection status and configuration | O A · conditional |
| [/settings/payroll/[employeeId]](../../src/app/settings/payroll/[employeeId]/page.tsx) | Employee payroll mapping | O A · conditional |

## People and administration

| Route | Surface | Entry scope |
| --- | --- | --- |
| [/people](../../src/app/people/page.tsx) | Search people, filters and bulk actions | O M |
| [/people/new](../../src/app/people/new/page.tsx) | Add a person | O M · scoped |
| [/people/[employeeId]](../../src/app/people/[employeeId]/page.tsx) | Person profile, roles, invitations and work preferences | O M · scoped |
| [/people/[employeeId]/employment](../../src/app/people/[employeeId]/employment/page.tsx) | Separate employment editor | O M · scoped |
| [/settings/organisation](../../src/app/settings/organisation/page.tsx) | Venue identity, planning, publication, conflicts and location | O |
| [/settings/departments](../../src/app/settings/departments/page.tsx) | Departments and roles list | O M · scoped |
| [/settings/departments/[departmentId]](../../src/app/settings/departments/[departmentId]/page.tsx) | Department detail, role management | O M · scoped |
| [/settings/departments/[departmentId]/roles/[roleId]](../../src/app/settings/departments/[departmentId]/roles/[roleId]/page.tsx) | Job role detail | O M · scoped |
| [/settings/demo-data](../../src/app/settings/demo-data/page.tsx) | Synthetic data administration | O · gated |
| [/settings/permissions](../../src/app/settings/permissions/page.tsx) | Business members and access scopes | O |
| [/settings/permissions/[userId]](../../src/app/settings/permissions/[userId]/page.tsx) | Individual access scope editor | O |
| [/settings/audit](../../src/app/settings/audit/page.tsx) | Audit history | O |

## Reports

| Route | Surface | Entry scope |
| --- | --- | --- |
| [/reports/hours](../../src/app/reports/hours/page.tsx) | Hours and labour reporting | O |
| [/reports/exceptions](../../src/app/reports/exceptions/page.tsx) | Operational exceptions reporting | O M |
| [/reports/demand-history](../../src/app/reports/demand-history/page.tsx) | Historical demand and import | O M · scoped |

## Browser coverage

The matrix covers four authenticated fixture roles, with owner and public samples repeated across viewports. Public reset/invitation views used no usable token. Signed-in setup redirected to Dashboard and the kiosk rendered its unpaired state. The owner verified the nested job role and the payroll mapping detail after creating a fictional mapping destination. Administrator and paired-device behaviours were reviewed at entry points and in source.

## Shared and non-page surfaces

The shared [shell](../../src/components/app-shell.tsx), [navigation](../../src/components/main-navigation.tsx), [role mapping](../../src/lib/navigation.ts), [auth layout](../../src/components/auth-layout.tsx), [theme](../../src/app/globals.css), [root error](../../src/app/error.tsx) and [404](../../src/app/not-found.tsx) affect nearly every journey. Route-specific loading/error boundaries are listed below. Callback, health, export and kiosk code endpoints are included for completeness. CSV and authentication callbacks are transitions with downstream UI, rather than standalone HTML screens.

- [src/app/api/health/route.ts](../../src/app/api/health/route.ts)
- [src/app/api/metrics/route.ts](../../src/app/api/metrics/route.ts)
- [src/app/api/ready/route.ts](../../src/app/api/ready/route.ts)
- [src/app/api/xero/oauth/authorize/route.ts](../../src/app/api/xero/oauth/authorize/route.ts)
- [src/app/api/xero/oauth/callback/route.ts](../../src/app/api/xero/oauth/callback/route.ts)
- [src/app/auth/callback/route.ts](../../src/app/auth/callback/route.ts)
- [src/app/error.tsx](../../src/app/error.tsx)
- [src/app/kiosk/code/route.ts](../../src/app/kiosk/code/route.ts)
- [src/app/layout.tsx](../../src/app/layout.tsx)
- [src/app/my-schedule/loading.tsx](../../src/app/my-schedule/loading.tsx)
- [src/app/not-found.tsx](../../src/app/not-found.tsx)
- [src/app/people/loading.tsx](../../src/app/people/loading.tsx)
- [src/app/reports/exceptions/loading.tsx](../../src/app/reports/exceptions/loading.tsx)
- [src/app/reports/export/route.ts](../../src/app/reports/export/route.ts)
- [src/app/reports/hours/loading.tsx](../../src/app/reports/hours/loading.tsx)
- [src/app/settings/departments/error.tsx](../../src/app/settings/departments/error.tsx)
- [src/app/settings/departments/loading.tsx](../../src/app/settings/departments/loading.tsx)
- [src/app/settings/payroll/error.tsx](../../src/app/settings/payroll/error.tsx)
- [src/app/settings/payroll/loading.tsx](../../src/app/settings/payroll/loading.tsx)
- [src/app/settings/permissions/error.tsx](../../src/app/settings/permissions/error.tsx)
- [src/app/settings/permissions/loading.tsx](../../src/app/settings/permissions/loading.tsx)
- [src/app/timesheets/payroll-export/route.ts](../../src/app/timesheets/payroll-export/route.ts)

## Component inventory

Components were grouped by user interaction. Brand geometry and artwork are supporting assets.

- [announcement-form.tsx](../../src/components/announcement-form.tsx)
- [app-shell.tsx](../../src/components/app-shell.tsx)
- [attendance-correction-history.tsx](../../src/components/attendance-correction-history.tsx)
- [auth-layout.tsx](../../src/components/auth-layout.tsx)
- [availability-editor.tsx](../../src/components/availability-editor.tsx)
- [coastal-artwork.ts](../../src/components/brand/coastal-artwork.ts)
- [logo-geometry.ts](../../src/components/brand/logo-geometry.ts)
- [brand-lockup.tsx](../../src/components/brand-lockup.tsx)
- [clock-location-form.tsx](../../src/components/clock-location-form.tsx)
- [coastal-illustration.tsx](../../src/components/coastal-illustration.tsx)
- [copy-roster-form.tsx](../../src/components/copy-roster-form.tsx)
- [demand-history-form.tsx](../../src/components/demand-history-form.tsx)
- [discard-kiosk-fragment.tsx](../../src/components/discard-kiosk-fragment.tsx)
- [future-vision-preview.tsx](../../src/components/future-vision-preview.tsx)
- [inline-editor.tsx](../../src/components/inline-editor.tsx)
- [invitation-session.tsx](../../src/components/invitation-session.tsx)
- [kiosk-activation-form.tsx](../../src/components/kiosk-activation-form.tsx)
- [kiosk-clock-form.tsx](../../src/components/kiosk-clock-form.tsx)
- [kiosk-display.tsx](../../src/components/kiosk-display.tsx)
- [kiosk-setup-form.tsx](../../src/components/kiosk-setup-form.tsx)
- [main-navigation.tsx](../../src/components/main-navigation.tsx)
- [offline-attendance.tsx](../../src/components/offline-attendance.tsx)
- [offline-claim-review.tsx](../../src/components/offline-claim-review.tsx)
- [offline-reopen-setup.tsx](../../src/components/offline-reopen-setup.tsx)
- [onboarding-checklist.tsx](../../src/components/onboarding-checklist.tsx)
- [password-input.tsx](../../src/components/password-input.tsx)
- [roster-notification-banner.tsx](../../src/components/roster-notification-banner.tsx)
- [roster-productivity.tsx](../../src/components/roster-productivity.tsx)
- [roster-quick-changes.tsx](../../src/components/roster-quick-changes.tsx)
- [roster-review-panel.tsx](../../src/components/roster-review-panel.tsx)
- [roster-timeline.tsx](../../src/components/roster-timeline.tsx)
- [session-sync.tsx](../../src/components/session-sync.tsx)
- [shift-conversation-form.tsx](../../src/components/shift-conversation-form.tsx)
- [shift-editor.tsx](../../src/components/shift-editor.tsx)
