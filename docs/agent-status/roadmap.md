# Roadmap Agent — Activity Status

## BB-DEMO-005 — Clearly labelled future-vision concept previews

- **Last report:** 2026-11-04 12:12 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current story:** BB-DEMO-005 — Clearly labelled future-vision concept previews (P2, In Progress).
- **Acceptance criteria:** Optional AI, forecasting and Award Central concepts must be clearly nonfunctional, use illustrative data only, make no payroll or award-compliance claims, and not change production workflows.
- **Phase:** Planning.
- **Activity:** Reviewing existing showcase gates and selecting an isolated verification approach; no protected showcase is being redeployed.
- **Plan:** Add an optional static concept preview gated to the showcase or explicitly enabled isolated development, with no external service or real data; test honest labels, feature gating, accessibility, mobile layouts and existing Help integration.
- **Progress since previous report:** The owner authorized resuming ordinary backlog work. Confirmed BB-ATTEND-006 is Done and no ready Showcase P0 remains. Recorded BB-RULES-002/004 and BB-SHIFTS-005 as blocked on reviewed employment-rule sources, and BB-BRAND-006 as blocked on specific template approval and rights clearance.
- **Tests and results:** No BB-DEMO-005 tests have run yet. The branch and remote matched at `37dd4a24115fd611e07e39bc71ab66d413c66eb3`; unrelated `.eslintcache` and `.vscode/` changes were left untouched.
- **Failing tests:** None observed for this story; verification has not started.
- **Blockers requiring intervention:** Reviewed employment-rule sources and marketing-template approval/rights remain external blockers for the higher-priority stories; no BB-DEMO-005 blocker identified yet.
- **Documentation:** Planned; update the User Guide, backlog and criterion-level implementation evidence after verification.
- **Next concrete action:** Verify an isolated development environment and implement the gated concept component and focused tests.
- **Latest development commit:** `984e0bb6a826939fdb783dae898a9a2e581c3171` (BB-REPORT-003); current branch checkpoint is `37dd4a24115fd611e07e39bc71ab66d413c66eb3`.
- **Push outcome:** Branch checkpoint `37dd4a24115fd611e07e39bc71ab66d413c66eb3` was verified on the remote; this planning checkpoint is pending push.

## Owner-requested UXFIX public deployment — issue #5

- **Last report:** 2026-11-04 11:35 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Deployment verification complete at this checkpoint; autonomous Roadmap work is paused for owner review.
- **Current task:** Deploy BB-UXFIX-001 through BB-UXFIX-005 to the existing public OpenTunnel URL and update the local showcase for shared-database compatibility; pause other Roadmap work.
- **Acceptance criteria:** Preserve the URL, existing synthetic users/data and scoped security; apply only safely reviewed required migrations; verify public owner/manager/employee authentication, five UXFIX surfaces, existing workflows and responsive layouts; keep the local showcase compatible.
- **Phase:** Complete.
- **Activity:** Recording verified deployment evidence and handing the existing public preview to the owner.
- **Progress since previous report:** Posted the deployment success to issue #5. Corrected obsolete showcase-availability statements in the User Guide, backlog and progress record, and synchronized both runtime guides without changing application code.
- **Tests and results:** Public owner, FOH/BOH manager, employee and outside-business authentication and scope checks passed. All five UXFIX surfaces, existing roster/attendance/timesheets, five responsive widths, keyboard and targeted axe checks passed; no browser runtime or HTTP 5xx errors occurred. The local UXFIX showcase and public gateway restrictions passed. The restored pre-cutover backup matched **81/81** pre-existing application tables apart from the new revision and scheduled worker timestamp. Pre-cutover pgTAP passed **174/174**; both builds and TypeScript passed. Updated Help units passed **15/15**, changed-test ESLint passed, and **12/12** owner/manager/employee Help article checks passed on the running public and local applications. Backlog CSV validation confirmed only the five UXFIX evidence fields changed; priorities and statuses were preserved.
- **Failing tests:** No remaining selected failures. Four initial browser assertions reflected an overly exact selector and premature redirect checks; the corrected full rerun passed. The first restore attempt hit the test cluster's `pg_cron` restriction; the corrected partial-platform restore passed.
- **Blockers requiring intervention:** None for deployment. Owner review remains outstanding; the temporary public preview depends on the local machine and tunnel staying online.
- **Documentation:** Updated; `IMPLEMENTATION_PROGRESS.md` and the backlog record deployment evidence, and the User Guide and both runtime copies describe the actual deployed UXFIX availability.
- **Next concrete action:** Push the final documentation consistency checkpoint, verify issue #5 and stop autonomous backlog development for owner review.
- **Latest development commit:** `984e0bb6a826939fdb783dae898a9a2e581c3171` (report exports, not selected for this paused deployment); latest UXFIX-only candidate is `5968d863b383ade37aebe3aa83c87a3cad45e490`.
- **Push outcome:** Deployment evidence checkpoint `bb647d1145655157c6a757595ded6295b03354d8` was pushed and verified; this documentation consistency checkpoint is pending push.

## BB-REPORT-003 — Export Business Reports

- **Last report:** 2026-11-04 10:01 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Complete at this checkpoint; no later execution state is implied.
- **Current story:** BB-REPORT-003 — Export business reports (P2, Done in isolated development).
- **Acceptance criteria:** CSV exports for rostering and attendance respect tenant permissions and the chosen period; sensitive fields are excluded unless explicitly allowed; each generated event is audited.
- **Phase:** Complete.
- **Activity:** Recording verified criterion-level evidence after pushing the feature and user documentation.
- **Plan:** Add separate owner-only CSVs for an explicitly selected venue and week, minimise exported fields, neutralise spreadsheet formulas, record attributed immutable generation events and verify role/tenant isolation, boundaries, failures, audit and browser behavior in the disposable project.
- **Progress since previous report:** Added actual cross-business and cross-venue attendance fixtures and reran the expanded database checks. Adjacent regressions, final units, TypeScript and lint passed. The verified feature and User Guide were committed and pushed; neither protected showcase was changed.
- **Tests and results:** Final focused pgTAP **58/58** and adjacent hours/weekly-timesheet/audit pgTAP **116/116** passed on verified disposable project `butterbox-report-002-55b9`. Owner-revocation/timezone concurrency **1/1**, export browser **1/1**, existing hours browser **1/1**, CSV/request/payroll-helper/audit/Help units **35/35**, TypeScript, changed-file ESLint and isolated split production build passed. The attendance-cap pgTAP uses a 30-second test statement budget.
- **Failing tests:** No current selected functional failures. The earlier browser fixture and native-date keyboard assertion failures were corrected and the complete case passed. In a separate rolled-back 8-second synthetic probe, 10,000 unclocked attendance sessions exported in 2.940 seconds and 10,001 were explicitly rejected in 5.222 seconds on a fresh transaction; a repeated over-limit request in the first transaction timed out at 8.014 seconds. Large or long-history attendance exports therefore have a documented capacity risk; these timings are not a production benchmark.
- **Blockers requiring intervention:** No feature blocker. Large attendance histories may time out; production performance and physical assistive-device review remain unverified. The protected local and public showcases must not be reset, reconfigured or redeployed; consolidated owner UX review remains separate.
- **Documentation:** Updated; the User Guide and contextual Help describe sensitive fields, audit delivery, row limits and attendance-timeout limitations.
- **Next concrete action:** Push completion evidence, then select the highest-priority ready safe story after checking its requirements and dependencies; do not deploy to either protected showcase without approval.
- **Latest development commit:** `984e0bb6a826939fdb783dae898a9a2e581c3171`.
- **Push outcome:** Verified feature commit `984e0bb6a826939fdb783dae898a9a2e581c3171` was pushed and its remote SHA verified; this completion-evidence checkpoint is pending push.

## BB-UXFIX-005 — Hospitality Workflow Navigation

- **Last report:** 2026-11-04 09:09 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current story:** BB-UXFIX-005 — Hospitality workflow-based application navigation (P1, Done in isolated development).
- **Acceptance criteria:** Exact four ordered groups and destinations; existing routes and context preserved; role-aware visibility backed by server authorization; honest feature states; accessible desktop/mobile navigation at five widths; role/tenant, regression and before/after visual evidence.
- **Phase:** Complete.
- **Activity:** Recording criterion-level completion evidence after the full Linux regression passed.
- **Plan:** Map existing routes into the four ordered groups; keep Help as a separate utility, owner-only kiosk/venue settings owner-only, and retain employee access to readable Rostering and Announcements. Preserve server authorization and business/venue context, then verify roles, isolation, keyboard, accessibility and screenshots only in the disposable environment.
- **Progress since previous report:** Linux CI run `41726343706` passed both jobs and the full browser regression: **101 passed, one public-mode-only case skipped**. The formerly failing quick-roster, department and attendance cases all passed. Both protected local and public showcase login endpoints returned HTTP **200** at 09:09 AEDT; neither showcase was changed.
- **Tests and results:** Pre-change baseline **2/2**, final role/route/context **3/3**, five-width keyboard/axe **5/5**, isolated production build, TypeScript, changed-file ESLint and full pgTAP **2,964/2,964** across 65 files passed. The complete Node/integration rerun passed **300** with **one** intentionally skipped protected-showcase test; affected initial failures passed **30/30**. Focused Help/navigation units passed **18/18** after the label correction. Full Linux CI passed **101 browser cases** with **one** public-mode-only skip; that scenario was separately verified during UXFIX-001. The earlier Linux attendance timeout passed a targeted rerun and the final full CI. The local 25×7 benchmark measured **1,702/3,000 ms** roster load, **1,979/5,000 ms** publication and **396/2,000 ms** mobile schedule load.
- **Failing tests:** None in the final Linux CI. Synthetic ArrowDown on a bare native select remains unsupported in the tested macOS browser harness; the retained actual ArrowDown scenario passed on Linux. The protected-showcase integration was deliberately not run.
- **Blockers requiring intervention:** No feature blocker. Physical assistive-device review, consolidated owner UX review and deployment to either protected showcase remain separate. Remaining Showcase P1 rule/scenario work lacks verified applicable rule sources; marketing templates require rights and approval.
- **Documentation:** Updated, including the attendance label correction and passing browser Help/context verification.
- **Next concrete action:** Commit and push completion evidence, then select the independent ready BB-REPORT-003 business-report export story after checking its prerequisites.
- **Latest development commit:** `aa2922458cf9b768010b603111d7897a714a04aa`.
- **Push outcome:** Status checkpoint `6d453a7242bc855fbfd4287e11a9b61bcb4641a3` was pushed and its remote SHA verified; this completion checkpoint is pending push.

## BB-UXFIX-004 — Payroll Employee Mapping

- **Last report:** 2026-11-04 07:28 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current story:** BB-UXFIX-004 — Payroll Employee Mapping directory and contextual editor (P1, Done in isolated development).
- **Acceptance criteria:** Destination-first navigation; searchable mapped/missing directory; read-first focused edit and confirmed unmap; existing case-sensitive uniqueness, revisions, audit and role/tenant isolation; honest provider limitations; five-width accessible production-browser checks and actual before/after screenshots.
- **Phase:** Complete.
- **Activity:** Verified feature, criterion evidence and screenshots committed and pushed.
- **Plan:** Reuse the established directory/detail/edit pattern, preserve business and venue context and existing authoritative mutation rules, add explicit destination/unmap confirmation, then test invalid, stale, concurrent and unauthorized paths without changing payroll calculations or either protected showcase.
- **Progress since previous report:** Thirty actual synthetic before/after captures were converted to dimension- and pixel-identical lossless WebP. Final TypeScript, changed-file lint and syntax checks passed. The protected local showcase login returned HTTP **200** at 06:36 AEDT.
- **Tests and results:** Pre-change mapping/CSV browser baseline **2/2**, post-migration mapping/CSV **2/2**, expanded browser **3/5** followed by failed-case rerun **2/2**, final five-width checks **5/5**, database **218/218**, integration **2/2** plus bypass rerun **1/1**, relevant units/Help **42/42**, TypeScript, changed-file ESLint and isolated production build passed.
- **Failing tests:** None remain in the completed selected checks. Earlier selector clipping and a later tablet timeout were followed by a passing final five-width run.
- **Blockers requiring intervention:** None identified. Consolidated owner UX review and any deployment to the protected showcases remain separate.
- **Documentation:** Updated — User Guide, contextual Help, RPC rollout guidance, criterion evidence and 30 synthetic screenshots.
- **Next concrete action:** Begin BB-UXFIX-005 in the separate isolated development environment.
- **Latest development commit:** `401c9b8767151ecf55d22d80e057dc2abb5c0b26`.
- **Push outcome:** Feature commit `401c9b8767151ecf55d22d80e057dc2abb5c0b26` was pushed and its remote SHA verified.

## BB-UXFIX-003 — Business Permissions

- **Last report:** 2026-11-04 01:59 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current story:** BB-UXFIX-003 — Business Permissions directory and focused access editing (P1, Done in isolated development).
- **Acceptance criteria:** Searchable/filterable/sortable member directory; read-first detail and focused edit with before/after confirmation; preserved role scopes, last-owner concurrency protection, audit and tenant isolation; five-width accessible production-browser checks and actual before/after screenshots.
- **Phase:** Complete.
- **Activity:** Recording verified criterion-level evidence and preparing the feature commit and push.
- **Plan:** Reuse the directory/detail/edit pattern without broadening the existing owner-only membership administration. Add stale-write protection around the authoritative mutation, retain its last-owner locking and audit, and verify role/tenant isolation, accessibility, mobile layouts and documentation in the disposable environment.
- **Progress since previous report:** Final TypeScript, lint and units passed; updated pending-save and five-width Tab/Shift+Tab checks passed **2/2**, and the distinct empty-member state passed **1/1** using only synthetic disposable fixtures. Twenty-five actual before/after captures were converted to pixel-identical lossless WebP. The protected local showcase login returned HTTP 200 at 01:56 AEDT; neither showcase was changed.
- **Tests and results:** Pre-change browser baseline **6/6**; four permission, tenant and audit pgTAP files **141/141**; deterministic concurrency integration **1/1**; directory, pagination and Help units **20/20**; final TypeScript and changed-file ESLint; isolated production build; **13 distinct** targeted production-browser scenarios across runs — all passed. Five-width keyboard, overflow and all configured WCAG-tagged axe checks passed.
- **Failing tests:** None remain in completed selected checks. Earlier navigation/route-announcer assertions and a fixture-scoped audit assertion were corrected and rerun successfully. The cross-business streaming not-found UI and non-disclosure are verified; Next.js may return HTTP 200 after streaming starts.
- **Blockers requiring intervention:** None identified. The protected local and public showcases must remain unchanged; consolidated owner UX review is separate.
- **Documentation:** Updated — User Guide, contextual Help, criterion-level evidence and 25 synthetic screenshots.
- **Next concrete action:** Inspect, commit and push the verified feature, then begin BB-UXFIX-004 in the isolated environment.
- **Latest development commit:** `0f08ad4087fcbff37a044d1294bd533ec3dcd5a7`.
- **Push outcome:** The first HTTPS pushes disconnected; a per-command HTTP/1.1/non-chunked retry succeeded and the remote SHA matched feature commit `4857bb9f797f07e53d234b9e6178729635d08238`.

## BB-UXFIX-002 — Departments and Roles

- **Last report:** 2026-11-04 01:26 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current story:** BB-UXFIX-002 — Departments & Roles directory and detail management (P1, Done).
- **Acceptance criteria:** Scoped searchable/filterable department list and read-first detail; focused department/role/restriction edits with save/cancel, lifecycle confirmation and stale handling; preserved venue settings, qualification rules, histories and authorization; five-width accessible browser checks and actual before/after screenshots.
- **Phase:** Complete.
- **Activity:** Verified feature, criterion-by-criterion evidence and synthetic screenshots committed and pushed.
- **Plan:** Keep `/settings/organisation` available for venue settings; add a Departments & Roles workspace with selected department/role editors, reuse the existing server rules and add checked concurrency/lifecycle wrappers. Verify restrictions, history, authorization and five viewport sizes in the disposable environment; update guide/help and evidence without deploying to either showcase.
- **Progress since previous report:** The expanded five-width scope scenario passed after waiting for save completion before refresh; administrator/general-manager edits, cross-venue forged actions, inactive-role feedback and stale edits were verified. Publication settings passed after scoping an ambiguous alert locator. Thirty actual synthetic before/after screenshots were converted to pixel-identical lossless WebP. Both protected showcase login endpoints returned **200** at 01:23 AEDT; neither deployment was modified.
- **Tests and results:** Eight relevant pgTAP files **292/292**, deterministic competing-write/revocation integration **1/1**, directory and Help units **14/14**, changed-file ESLint, TypeScript and final isolated production build passed. Ten distinct targeted production-browser scenarios passed across runs; the final scope/lifecycle/publication rerun passed **3/3**, and the final publication-only rerun passed **1/1**. Five-width keyboard, overflow and serious/critical axe checks passed.
- **Failing tests:** None remain in the selected checks. The earlier long-name overflow, immediate-refresh test sequencing and ambiguous alert locator were corrected and rerun successfully.
- **Blockers requiring intervention:** None identified. The protected local and public showcases must remain unchanged; consolidated owner UX review is separate.
- **Documentation:** Updated — BB-UXFIX-002 User Guide, contextual Help, acceptance evidence and 30 synthetic screenshots.
- **Next concrete action:** Continue with BB-UXFIX-003 without changing the protected showcases.
- **Latest development commit:** `0f08ad4087fcbff37a044d1294bd533ec3dcd5a7`.
- **Push outcome:** The first push disconnected before reaching the remote; retry succeeded and the remote SHA matched `0f08ad4087fcbff37a044d1294bd533ec3dcd5a7`.

## Public synthetic showcase — completed operator request

- **Last report:** 2026-11-03 21:55 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Implementation and checks are complete at this checkpoint. The public app/tunnel are deliberately left running; this report does not imply continued agent activity.
- **Current work:** Owner-requested internet-accessible synthetic showcase. No new backlog story was started; existing BB-DEMO-001 evidence was updated without changing its status or priority.
- **Acceptance criteria:** PUB-01 HTTPS access, PUB-02 synthetic isolation, PUB-03 role scope, PUB-04 mobile/help and PUB-06 temporary operations/documentation passed. PUB-05 positive public clock mutation and PUB-07 durable hosting remain blocked/unverified, as recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Phase:** Complete for the requested temporary preview; production and durable hosting are not claimed.
- **Activity:** Delivered a separate app snapshot, supervised application-only gateway and locally terminated HTTPS tunnel, without restarting or resetting the original showcase.
- **Progress since previous report:** Deployed the updated in-app guide, added direct password-action guards and verified manager rosters/employee availability; committed and pushed the tested implementation.
- **Tests and results:** Public HTTPS Chromium **7/7**, original local owner/FOH/BOH/employee browser journeys **4/4**, focused Node/guide **18/18**, changed-file ESLint, TypeScript, split production build and diff checks passed. App/tunnel failure and graceful-stop checks passed. Public and local login returned **200**; Supabase API/database and ordinary app remained loopback-only; the live TLS certificate matched the local certificate.
- **Failing tests:** The earlier outside-business sign-out timeout was fixed by using the existing business chooser. An earlier harmless direct password-change check reached validation; the added server guard passed direct-action tests. Startup HTTPS attempts failed briefly before the tunnel connected, then passed.
- **Blockers requiring intervention:** Durable hosting, production/marketing rights approval, a physical external-device check and a positive public clock mutation are unverified. BB-REPORT-002 is not deployed to this older snapshot. Public and local reviews share synthetic data; email, password changes/recovery and offline claims are unavailable publicly.
- **Documentation:** Updated — README, User Guide, deployed in-app Help, backlog evidence and implementation progress.
- **Next concrete action:** Share the public HTTPS link and the owner's existing private showcase credentials. For durable hosting or production, obtain separate approval and complete the outstanding security, data, branding and operational gates.
- **Latest development commit:** `cfcabb51a3cd0b890f51bd05b21b48a5a3aa79dd`.
- **Push outcome:** Development commit `cfcabb5` was pushed to `copilot/finish-roadmap-for-app`; its remote SHA matched. This final documentation checkpoint is pending push.

## Public synthetic showcase — testing milestone

- **Last report:** 2026-11-03 21:48 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current work:** Owner-requested internet access to the isolated synthetic showcase; no backlog story status changed.
- **Acceptance criteria:** Encrypted public login and role workflows; scoped tenant/department access; synthetic data only; ordinary app and backend ports remain private.
- **Phase:** Testing and documentation.
- **Activity:** Finalising the public preview and its operational/user guidance without resetting or stopping the original local showcase.
- **Progress:** A separate production snapshot, host/origin-validated application-only gateway and locally terminated HTTPS tunnel are running. Public sessions use Secure/HttpOnly cookies; signup, password changes/recovery, invitations and offline claims are unavailable. The public and local apps share the synthetic database.
- **Tests and results:** Live Chromium **7/7** passed: login/sign-out, direct disabled-action requests, owner, FOH/BOH managers, employee mobile layout/axe, reports, simulation-only CSV, tenant and department restrictions. Focused Node **9/9**, changed-file ESLint, TypeScript and split production build passed. Public TLS certificate matched the local certificate. Deliberately stopping the separate app or tunnel stopped the other public services; graceful stop also succeeded. Original port 3137 returned **200** and API/database listeners remained on loopback.
- **Failing tests:** The first cross-tenant browser run timed out during sign-out because the control business has no venue; using its existing **Choose a business** sign-out route resolved it. The complete rerun passed. A harmless direct password-change request initially reached its validation; a server-side public-mode guard was added and verified. Startup TLS attempts briefly failed before the tunnel connected, then returned **200**.
- **Blockers requiring intervention:** None for temporary preview. Durable hosting, production approval, public marketing-image rights and an actual public clock mutation remain unverified; BB-REPORT-002 is not deployed in this snapshot.
- **Documentation:** README and User Guide updated; the revised guide still needs copying to the public standalone Help build and a final live check.
- **Next concrete action:** Deploy the guide, rerun final focused checks, inspect and commit the code without credentials, push and verify the remote SHA.
- **Latest development commit:** `1865111a81fba062bc60fc66b1c751456092b887`; current repository merge checkpoint `546652badf7db6707105e1aae7eeada0aa431310`; public-preview code is uncommitted.
- **Push outcome:** Repository merge checkpoint `546652b` was pushed and its remote SHA matched. This status checkpoint is pending push.

## Public showcase access — operator request

- **Last report:** 2026-11-03 21:23 AEDT (UTC+1100), observed on the operator's clock.
- **Execution state:** Active at this checkpoint only; no later execution state is implied.
- **Current work:** Public access to the isolated synthetic showcase; no backlog story has been started or changed.
- **Acceptance criteria:** Reach the synthetic showcase over HTTPS, verify sign-in and the intended reviewer workflows, retain tenant and department authorization, and keep the ordinary application and all backend ports private.
- **Phase:** Planning and safety verification.
- **Activity:** Investigating an encrypted public route without restarting or reseeding the showcase.
- **Progress:** The ordinary network is behind carrier NAT. A free OpenTunnel client was downloaded from the pinned upstream release and checksum verified. Its published client source generates the TLS private key locally and terminates visitor TLS on the local machine. A temporary route exposed only a non-sensitive connectivity page, not the app or database.
- **Tests and results:** The temporary HTTPS page returned **200**; its public certificate fingerprint matched the locally stored certificate. The showcase login returned **200** and its API/database ports remained loopback-only.
- **Failing tests:** None so far. The tunnel has not yet been connected to the application, and no public sign-in or reviewer workflow is claimed.
- **Blockers requiring intervention:** Browser-side attendance and invitation components reference the local Supabase URL; remote behavior and a safe application-only gateway need verification. The existing showcase is deliberately guarded as local-only, and email delivery remains unavailable.
- **Documentation:** Status checkpoint only; user guidance must be updated if public access is delivered.
- **Next concrete action:** Verify an application-only, host-validated HTTPS gateway and remote role workflows without exposing backend ports or disrupting the live showcase.
- **Latest development commit:** `1865111a81fba062bc60fc66b1c751456092b887`; latest repository checkpoint before this update was `a04f256`.
- **Push outcome:** Checkpoint `e983ecf` was rejected because concurrent owner commits advanced the remote branch; a non-rewriting merge is in progress.

## BB-BRAND-004 closed by owner — internal showcase scope only

- **Decision:** Owner expressly accepts the present AI-generated coastal café images as temporary imagery for the **private internal Showcase P0**, with replacement planned for production. BB-BRAND-004 status: **Done**. This does not claim production imagery standards are satisfied.
- **Evidence retained:** 15 scenes, 49 optimized review variants, truthful AI labelling and alt text, prior owner visual selection, image tests 4/4 and isolated browser preview tests 4/4.
- **Deferred mandatory production/public launch requirements:** Native 3200 × 1800 hero replacement (current source 861 × 377), verified generation-account terms and input/third-party rights, and explicit public marketing publication approval. All remain unverified; not waived or represented as legally cleared.
- **Backlog:** 127 total; 66 Done, 0 In Progress, 6 Blocked, 55 Backlog; **Showcase P0 57/57 Done (100% by count)**.
- **Safety:** Documentation-only GitHub commits. No app, database, showcase on port 3137, or live web deployment was accessed or altered.
- **Next action:** Preserve the showcase for later consolidated owner UX feedback. Codespace agent can refresh and select the next ready task; these commits do not start it.


## Owner approval of BB-BRAND-004 visual selection — 2026-11-03

- **Last report:** 2026-11-03 18:07 AEDT (UTC+1100), as provided with the owner's message.
- **Execution state:** Completed approval-record update; no continuing background work is implied.
- **Current story:** BB-BRAND-004 — Prepare homepage imagery (Blocked, partial; Showcase P0).
- **Acceptance criteria:** Visual selection approved and truthfully labelled; rights clearance and a sufficiently sized production master remain unverified. Draft responsive variants, alt text and preview checks are recorded.
- **Phase:** Complete for this approval update; the story itself remains Blocked.
- **Activity:** Recording the owner's selection decision without treating it as rights or publication authorization.
- **Progress:** Owner message: “im happy with the propsed images”. The proposed desktop/mobile hero, team and alternative, café operations, terrace and service images are selected for the internal imagery library.
- **Tests and results:** Catalogue regression **4/4** passed, including source hashes, image dimensions, no-upscaling and approval/rights metadata. CSV validation confirmed 202 catalogue rows and 51 review entries remain `draft`; `git diff --check` passed.
- **Failing tests:** The first catalogue run exposed its stale expectation that owner selection was pending; the assertion now accepts recorded selection approval while retaining rights checks, and the rerun passed **4/4**.
- **Blockers requiring intervention:** The supplied hero is 861 × 377 versus the brief's native 3200 × 1800 requirement. Applicable generation-account terms, input/third-party rights and publication clearance remain unverified.
- **Documentation:** Selection summary, brand README/guidelines, asset catalogue, backlog and implementation evidence updated.
- **Safety:** No app, database, showcase service or data was changed; no public homepage was deployed.
- **Next concrete action:** Obtain verifiable usage-rights evidence and a suitable native-resolution hero before publication; keep BB-BRAND-004 Blocked until its criteria are met.
- **Latest development commit:** `1865111a81fba062bc60fc66b1c751456092b887` (owner visual selection approval).
- **Push outcome:** Commit `1865111` was pushed to `copilot/finish-roadmap-for-app`; remote SHA verified.
- **Backlog:** 127 total, 65 Done, 0 In Progress, 7 Blocked, 55 Backlog. BB-DEMO-004 internal delivery remains Done; this image decision is not production or rights approval.

## Owner acceptance of BB-DEMO-004 — 2026-11-03

- **Owner decision:** BB-DEMO-004 is **Done** — owner accepted delivery of the internal, functioning isolated Butterbox Showcase MVP, superseding earlier pending-review milestone notes.
- **Basis:** Prior isolated operator acceptance: six-container verification, synthetic reset/reseed, integration 1/1, Chromium 15/15, successful owner login. Owner additionally confirmed `http://127.0.0.1:3137` accessible and working.
- **Boundary:** This is showcase **delivery** acceptance, not owner approval of each feature, screen, UX, artwork, external exposure, compliance or production readiness. Consolidated functional/UX feedback will be supplied separately.
- **Safety:** GitHub documentation-only update; no local service, database, data reset or redeployment touched.
- **Remaining P0:** BB-BRAND-004 Blocked on native hero resolution and rights clearance; owner visual selection is now recorded.
- **Backlog:** 127 total, 65 Done, 0 In Progress, 7 Blocked, 55 Backlog. Showcase P0 56/57 Done (98.2%) and 1 Blocked.
- **Next action:** Main Agent should refresh `copilot/finish-roadmap-for-app` and select the next unblocked roadmap task, without disturbing the live showcase. This repository update does not start the Codespace agent.


## Roadmap recovery checkpoint after BB-REPORT-002

- **Last report:** 2026-11-03 17:20 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** This is a handoff checkpoint; it does not imply the agent remains active.
- **Current story:** BB-REPORT-002 — Overtime and exceptions report (Done, Showcase P1); no new story has been started.
- **Acceptance criteria:** Summarise overlaps, excessive hours and missing clock events; provide source drill-down; do not infer award breaches without verified rules. All three are Pass in implementation progress.
- **Phase:** Complete.
- **Activity:** Recording cleanup, remaining review gates and next-story readiness.
- **Progress since previous report:** Stopped only the verified disposable report-test project, retaining its data volumes. Confirmed the ordinary database remains running and the showcase login on port 3137 returns HTTP 200. No showcase restart, reset or deployment occurred.
- **Tests and results:** Final focused pgTAP **30/30**, related pgTAP **167/167**, Node **31/31**, HTTP authorization **1/1**, adjacent concurrency **3/3**, production Chromium **1/1**, changed-file ESLint, TypeScript and split production build passed. Full regression was deferred.
- **Failing tests:** None remain; the previously omitted disposable flag was supplied on the successful HTTP rerun.
- **Blockers requiring intervention:** BRAND-004 needs suitable native-resolution masters, applicable rights verification and owner selection; DEMO-004 needs the owner's personal review. No validated employment-rule source was established for the next safeguards/change stories, and BRAND-006 requires specific asset rights and approval.
- **Documentation:** Updated — User Guide, contextual help, backlog, per-criterion evidence and next-story recovery notes.
- **Next concrete action:** Obtain the outstanding owner reviews; reassess Showcase P1 readiness without inventing employment restrictions. REPORT-003 is an independent P2 candidate if higher-priority work cannot safely proceed.
- **Latest development commit:** `bed7416c0b091841692382ae2b9bf884d50c9195` (BB-REPORT-002).
- **Push outcome:** Completion checkpoint `1ea93f600af69dee7838dd6400fd61cdb8334cb6` was pushed and its remote SHA verified; this handoff checkpoint is pending.
- **Backlog:** 127 total; 64 Done, 0 In Progress, 8 Blocked, 55 Backlog.

## BB-REPORT-002 completion checkpoint

- **Last report:** 2026-11-03 17:18 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-REPORT-002 — Overtime and exceptions report (Done, Showcase P1).
- **Acceptance criteria:** Summarise overlaps, excessive hours and missing clock events; provide source drill-down; do not infer award breaches without verified rules. All three are recorded as Pass in implementation progress.
- **Phase:** Complete.
- **Activity:** Recording the verified report commit and reassessing remaining Showcase P1 work.
- **Progress since previous report:** Added an explicit supported date range after reproducing an existing early-year roster source limitation. Verified exact shift and session links, including an unavailable profile and the earliest supported week. Committed the report and its acceptance evidence.
- **Tests and results:** Focused pgTAP **30/30**, related pgTAP **167/167**, Node **31/31**, authenticated HTTP **1/1**, adjacent concurrency **3/3**, and production Chromium **1/1** including desktop/mobile axe passed. Changed-file ESLint, TypeScript, split production build and diff checks passed.
- **Failing tests:** None remain. One HTTP invocation was refused before fixture operations because the disposable flag was omitted; the corrected run passed.
- **Blockers requiring intervention:** BRAND-004 still requires suitable native-resolution masters, applicable rights verification and the owner's visual selection. DEMO-004 still requires the owner's personal review.
- **Documentation:** Updated — role-based User Guide, contextual help, backlog and per-criterion evidence. The report is not deployed to the running showcase.
- **Safety:** Test work used only disposable project `butterbox-report-002-55b9` on loopback ports 58421/58422/58424. The showcase login on 3137 returned HTTP 200; it was not restarted or reset.
- **Next concrete action:** Stop only the verified disposable report-test project, then evaluate the remaining ready Showcase P1 stories without inventing employment rules or claiming unapproved brand assets.
- **Latest development commit:** `bed7416c0b091841692382ae2b9bf884d50c9195` (BB-REPORT-002).
- **Push outcome:** `bed7416` was pushed and its remote SHA verified; this status checkpoint is pending.
- **Backlog:** 127 total; 64 Done, 0 In Progress, 8 Blocked, 55 Backlog.

## BB-REPORT-002 source-link and privacy checkpoint

- **Last report:** 2026-11-03 17:13 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-REPORT-002 — Overtime and exceptions report (In Progress, Showcase P1).
- **Acceptance criteria:** Summarise overlaps, excessive hours and missing clock events; provide source drill-down; do not infer award breaches without verified rules.
- **Phase:** Testing.
- **Activity:** Rechecking exact roster drill-down and historical-worker privacy in the separately identified disposable project.
- **Progress since previous report:** Added a direct shift anchor for historical records, preserved four-digit early-year week validation, and masked unavailable employee profile names consistently across report arrays. No feature code has been committed or deployed to the showcase.
- **Tests and results:** Focused calculation, weekly-timesheet, worked-time and help tests **26/26** passed. Revised report pgTAP **28/28** passed, including unavailable-profile redaction and cross-venue isolation. Related weekly-timesheet, overlap, shared-worker, tenant and labour pgTAP suites previously passed **167/167**; three concurrency integrations and the updated HTTP authorization integration passed. Changed-file ESLint and TypeScript passed. A production browser scenario passed before the latest source-link and redaction changes.
- **Failing tests:** None currently known; the latest browser scenario has not yet been rerun.
- **Blockers requiring intervention:** None identified for the report. BB-BRAND-004 remains Blocked on native resolution, rights and owner approval; BB-DEMO-004 remains Blocked on owner review.
- **Documentation:** User Guide and contextual help updated in the uncommitted report work.
- **Safety:** Changes were applied only to the verified disposable project `butterbox-report-002-55b9` on loopback ports 58421/58422/58424. The running showcase on 3137 returned an HTTP redirect during this check and has not been restarted or reset.
- **Next concrete action:** Rebuild the isolated application snapshot and rerun the focused browser/accessibility scenario, including the historical source link, before recording final acceptance evidence.
- **Latest development commit:** `06aca95d2620116dd0a06cda99c5bcdd6695ade3` (BB-BRAND-004 review library).
- **Push outcome:** Previous testing checkpoint `d6055bf` was pushed and its remote SHA verified; this checkpoint is pending.

## BB-REPORT-002 implementation milestone

- **Last report:** 2026-11-03 17:03 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-REPORT-002 — Overtime and exceptions report (In Progress, Showcase P1).
- **Acceptance criteria:** Summarise overlaps, excessive hours and missing clock events; provide source drill-down; do not infer award breaches without verified rules.
- **Phase:** Testing.
- **Activity:** Verifying the new read-only venue/department-scoped report and its contextual help in an isolated test project.
- **Progress since previous report:** Added a single-statement report snapshot, optional user-entered threshold, manager-facing route, source links and User Guide draft. Threshold totals separate published scheduled and currently approved worked hours; no statutory calculation is inferred. None of the new code has been committed yet.
- **Tests and results:** Targeted calculation, weekly-timesheet, worked-time and help tests **25/25** passed. The new isolated-project pgTAP suite passed **20/20**, including FOH/BOH and cross-tenant denial. Changed-file ESLint and TypeScript passed.
- **Failing tests:** The first test migration attempt exposed a reserved SQL identifier; it was corrected and the migration then applied successfully to the disposable project. No current failing tests.
- **Blockers requiring intervention:** None identified for the report. BB-BRAND-004 remains Blocked on native resolution, rights and owner approval; BB-DEMO-004 remains Blocked on owner review.
- **Documentation:** Draft User Guide and contextual help updated; browser verification is still pending.
- **Safety:** New disposable project `butterbox-report-002-55b9` was positively checked against its workdir and loopback API/DB/mail ports 58421/58422/58424. No existing project was reset; the showcase on 3137 returned HTTP 200.
- **Next concrete action:** Run focused browser/accessibility, source-link, invalid-filter and isolation checks in the separate project, then review and record acceptance evidence.
- **Latest development commit:** `06aca95d2620116dd0a06cda99c5bcdd6695ade3` (BB-BRAND-004 review library).
- **Push outcome:** Previous story-start checkpoint `5701154` was pushed and its remote SHA verified; this checkpoint is pending.

## BB-REPORT-002 resumed checkpoint

- **Last report:** 2026-11-03 16:54 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-REPORT-002 — Overtime and exceptions report, already In Progress (Showcase P1).
- **Acceptance criteria:** Summarise overlaps, excessive hours and missing clock events; provide source drill-down; do not infer award breaches without verified rules.
- **Phase:** Planning.
- **Activity:** Resuming the paused story by inspecting existing reporting, authorization, attendance and roster primitives.
- **Progress since previous report:** BB-BRAND-004's supplied imagery review library, provenance, catalogue and visual selection summary were committed as `06aca95`. BRAND-004 remains Blocked on native resolution, rights and owner approval; DEMO-004 remains Blocked on owner review. The running showcase was not disrupted.
- **Tests and results:** BRAND-004 image checks **4/4**, isolated browser checks **4/4**, catalogue **202/202**, documentation links **24/24**, changed-file ESLint and TypeScript passed. No REPORT-002 implementation or tests have run yet.
- **Failing tests:** None known. The first imagery push received HTTP 400; retrying over HTTP/1.1 succeeded and the remote SHA matched.
- **Blockers requiring intervention:** No REPORT-002 blocker established yet. Its operational hours threshold must not be presented as an award rule; safe database verification requires a separately identified disposable project.
- **Documentation:** BRAND-004 brand documentation updated; the application User Guide was not applicable to its undeployed review assets. REPORT-002 guidance is pending implementation.
- **Next concrete action:** Trace the existing report and scoped data-access patterns, then implement and test the smallest safe end-to-end slice without changing the showcase.
- **Latest development commit:** `06aca95d2620116dd0a06cda99c5bcdd6695ade3` (BB-BRAND-004 review library).
- **Push outcome:** `06aca95` pushed and remote SHA verified; this checkpoint is pending.
- **Backlog:** 127 total; 63 Done, 1 In Progress, 8 Blocked, 55 Backlog.

## BB-BRAND-004 supplied imagery checkpoint

- **Last report:** 2026-11-03 16:49 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-BRAND-004 — Prepare homepage imagery.
- **Acceptance criteria:** Select approved, rights-cleared imagery and distinguish illustrations from actual screenshots; retain originals and provide responsive optimized formats; supply appropriate alt text; verify desktop/mobile presentation and loading before deployment.
- **Phase:** Testing.
- **Activity:** Documenting the selected image concepts, provenance, asset catalogue and owner-review limitations.
- **Progress since previous report:** Selected hero, team, café operations, terrace and service scenes. Generated 49 AVIF/WebP/JPEG draft crops directly from the preserved PNG sheets, excluding visible collage borders and never enlarging the source. The largest hero is 848 × 371 and the phone crop is 296 × 370; the source does not meet the brief's 3200 × 1800 native hero requirement.
- **Tests and results:** Image integrity, sizes, no-enlargement and measured compression tests **3/3** passed; isolated Chromium preview tests **4/4** passed at 320, 390 and 1440 px, including axe, source selection, loading and JPEG fallback. ESLint passed and regeneration produced identical manifest and preview hashes. Desktop and mobile screenshots were visually inspected. The showcase returned HTTP 200 before work began; it has not been restarted or reset.
- **Failing tests:** None observed. A one-off backlog inspection command could not load an absent optional `csv-parse` package; use the standard-library CSV reader instead.
- **Blockers requiring intervention:** Written final visual selection, applicable usage-rights confirmation and a native-resolution hero remain outstanding; do not claim publication approval. BB-DEMO-004 still awaits owner review.
- **Documentation:** Catalogue, provenance and visual selection summary are being updated; no application workflow has changed.
- **Next concrete action:** Complete the catalogue and owner-review summary, verify their links and hashes, commit the draft library, and then resume the next safe Roadmap story.
- **Latest development commit:** `324e07250ed507eb3dc9c54e4fa0f2821ecd1090` (supplied website imagery).
- **Push outcome:** The initial status checkpoint `549b88c` was pushed and its remote SHA verified; this update is pending.

## Showcase P0 unblock checkpoint (BB-BRAND-004, BB-DEMO-004)

- **Last report:** 2026-11-03 13:49 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current work:** Owner-authorised Showcase P0 unblock. BB-DEMO-004 (repeatable showcase acceptance and reset) and BB-BRAND-004 (homepage imagery).
- **Criteria:** DEMO-004: documented access and role accounts, core-journey and tenant-isolation smoke tests, verified reset, repeatable synthetic data, logged gaps, no production secrets/payroll/messaging, owner review evidence. BRAND-004: approved rights-cleared imagery labelled as illustration, responsive optimised formats with originals kept, alt text, verified mobile/desktop presentation.
- **Phase:** Complete for this session; both stories remain Blocked on owner/rights gates.
- **Activity:** Recorded evidence; committing and pushing.
- **Progress since previous report:** Fast-forwarded to `d2ebe99` (DEMO-003 Done, DEMO-004 checklist). Built and pushed the BRAND-004 imagery library (`dfaf495`). Ran the full DEMO-004 checklist against the positively identified `butterbox-showcase` only: verify, private recovery dump, graceful stop, confirmed reset (receipt `51939669`), reseed, integration, browser suite, restart from a `dfaf495` snapshot and live owner sign-in.
- **Tests and results:** Showcase verify passed (6 containers). Fixture/tenant integration **1/1**. Showcase production Chromium **15/15** (roles, scoped managers, mobile employee, offline, help, cookie isolation, reports, payroll CSV, axe and 375 px overflow). Live owner sign-in at 1440/390 px passed. Imagery harness at 390/1440 px: correct art direction, no overflow, axe 0; ESLint passed on the new script. Post-run showcase counts match the fixture; ordinary project unchanged and demo seeding disabled.
- **Failing tests:** None.
- **Blockers requiring intervention:** **Owner:** personally review the showcase and record the outcome (DEMO-004). **BRAND-004:** the authorised generated coastal imagery files were not found anywhere; supply the originals with their generator/date/usage terms, or licensed photography, plus final visual review.
- **Documentation:** updated — User Guide reviewer note (latest run, new passwords), branding README/guidelines, asset index, progress evidence and owner-review record.
- **Next concrete action:** Owner review of `http://127.0.0.1:3137` using the regenerated private login; then resume the paused P1 BB-REPORT-002.
- **Latest development commit:** `dfaf495484afce88518d334f7acb9ebfb1f725f0` (homepage imagery library); evidence commit follows this report.
- **Push outcome:** `dfaf495` pushed and remote SHA verified; this checkpoint pending.
- **Backlog:** 127 total; 63 Done, 1 In Progress, 8 Blocked, 55 Backlog.

## Local application refresh checkpoint

- **Last report:** 2026-11-03 12:44 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Complete at this checkpoint; the local apps remain running, with no background scheduling claim.
- **Current work:** User-directed refresh of the ordinary app and existing BB-DEMO-001 showcase; no story status changed.
- **Criteria:** Load the latest branch code in both local apps while preserving the isolated showcase, its owner login and all existing data.
- **Phase:** Complete.
- **Activity:** Delivered the Coastal Wave integration from development commit `6d5c4e7a4a33324d1c1100d628298bd936588e77` to both loopback apps.
- **Progress since previous report:** Fast-forwarded the branch, verified the development app's hot update, built the showcase in a separate private snapshot, browser-tested the preview and gracefully replaced only the old showcase app. No database migration or reset was needed.
- **Tests and results:** Showcase split production build and TypeScript passed; desktop/mobile login and logo checks passed for the ordinary app and showcase preview. The live showcase owner signed in, saw 14 fictional staff, verified cookie isolation and reloaded the roster. Both live apps served the new manifest and exact icon bytes; health, six-service isolation and read-only pre/post database counts passed.
- **Failing tests:** None known for this refresh.
- **Blockers/risks:** No local refresh blocker. The showcase remains internal-only and simulated; hosted access, final brand review and production/release regression remain separate.
- **Documentation:** Not applicable — this was an operational refresh of existing upstream changes; the updated User Guide was bundled and verified.
- **Next concrete action:** Refresh the open browser tabs to load the updated apps; resume roadmap story selection separately.
- **Latest development commit:** `6d5c4e7a4a33324d1c1100d628298bd936588e77` (brand integration).
- **Push outcome:** Upstream development commit `6d5c4e7a4a33324d1c1100d628298bd936588e77` was fetched and verified; this status checkpoint is pending.
- **Backlog:** 127 total; 62 Done, 1 In Progress, 7 Blocked, 57 Backlog.

## Local showcase setup checkpoint

- **Last report:** 2026-11-03 12:15 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current work:** User-directed BB-DEMO-001 operator setup and test-owner option; the completed story is not being reopened.
- **Criteria:** A separately verified internal-only showcase, 12–15 fictional FOH/BOH staff and realistic sample workflows, no production data, real messaging or live payroll, and guarded reset; the designated login must be test-only and scoped to the isolated project.
- **Phase:** Complete.
- **Activity:** Delivering the running isolated local showcase and its private owner-login handoff.
- **Progress since previous report:** Committed and pushed the verified source, tests and documentation; confirmed the private login matches the requested showcase owner. Both app login pages returned HTTP 200 on loopback, the running guide matches source, and the final six-service isolation check passed.
- **Tests and results:** 35/35 focused Node tests, 3/3 live integration runs, 7/7 production Chromium scenarios, a reciprocal ordinary-app session check, guarded isolated reset/reseed, production build, changed-code ESLint, TypeScript and diff checks passed. The old-build cookie collision passed after the fix. Final read-only ordinary-project counts remained 1 account, 1 business, 1 venue, 2 departments, 0 employees and 2 shifts; demo seeding remained disabled.
- **Failing tests:** None known for this local setup.
- **Blockers/risks:** The operator must confirm the designated alias is test-only. Hosted access, production/release regression, award compliance and final brand gates are not established by this setup. A concurrent branding commit arrived after the historical blocker below; its current approval status was not verified here.
- **Documentation:** README and user guide updated for test-owner isolation, separate passwords, reset and operator responsibilities; acceptance evidence recorded in implementation progress.
- **Next concrete action:** The operator can sign into the showcase with the separate generated owner password. When Roadmap work resumes, reassess current branding evidence and select the next ready story; BB-REPORT-002 remains In Progress.
- **Latest development commit:** `0f8c847aaa089baaed754a3cd059cb1644afa13c` (isolated showcase test-owner login and session separation).
- **Push outcome:** Development commit `0f8c847aaa089baaed754a3cd059cb1644afa13c` was pushed and its remote SHA verified; this status checkpoint is pending.

The prior Roadmap planning and brand blocker remain below; their current execution state is not verified by this local checkpoint.

---

- **Last report:** 2026-11-03 01:51 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent; Core Roadmap on `copilot/finish-roadmap-for-app`
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-DEMO-004 — Repeatable showcase acceptance and reset: **Blocked (prepared)**. Criteria: documented restricted access and role accounts; automated core-journey and tenant-isolation smoke tests; verified reset; repeatable synthetic data; logged gaps and failure states; no production secrets, live payroll or messaging; owner review evidence.
- **Phase:** Blocked.
- **Progress since previous report:**
  - BB-DEMO-003 Done and pushed in `0181177` (grouped scrollable desktop navigation, accessible mobile **Menu**, owner/admin **Payroll** link, tagline header, dashboard concept labels; 5/5 targeted production browser tests; help upkeep 9/9).
  - DEMO-004: the owner was unavailable for the run-vs-prepare decision, so the live showcase was left untouched. Added the README repeatable acceptance checklist (verify → reset → reseed → fixture/tenant integration → showcase browser spec → record), a failure-mode table, known gaps, a User Guide reviewer note and a pending owner-review record.
- **Tests and results:** Documentation only for DEMO-004; `tests/help.test.mjs` 9/9 passed. No showcase reset, integration or browser run was performed.
- **Failing tests:** None known.
- **Blockers requiring intervention:**
  - **Operator:** stop the review app and run README checklist steps 1–5 on the current commit (this also runs the DEMO-003-adapted `tests/e2e/showcase.spec.mjs`), then record results.
  - **Owner:** review the showcase and record the outcome; final visual review of the Coastal Wave logo system.
  - BRAND-004 needs licensed coastal café photography.
- **Documentation:** updated — README acceptance checklist, User Guide reviewer note, progress evidence.
- **Latest development commit:** `0181177ece06b2f40afd8f360b505dc60758e9e3` (DEMO-003); DEMO-004 documentation commit follows this report.
- **Next concrete action:** With all ready P0 showcase work Done or Blocked, resume the paused P1 BB-REPORT-002 (overtime and exceptions report) planning in a later session.
- **Backlog:** 127 total; 62 Done, 1 In Progress, 7 Blocked, 57 Backlog.
- **Preserved:** the `.eslintcache` deletion and the untracked `supabase/migrations/20261103220000_scoped_exceptions_report.sql` (not committed).

Criterion evidence: `IMPLEMENTATION_PROGRESS.md`.
