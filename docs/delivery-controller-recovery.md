# Recover parked P0 work

Issue #327 keeps the native controller schedule paused until the corrected
controller and recovery are verified. P1–P9 remain held. Both original pull
requests are closed unmerged, and their branches and parking tags are retained.

| Priority | Issue | Preserved pull request | Preserved head | Parking tag SHA |
| --- | --- | --- | --- | --- |
| P0.01 | #84 | #333 | `11566f387cd336f9015d0c4346f1a88cb0ec8ef0` | `48c4dae907b67b6a6b5ad24a54e6c09d90230ac8` |
| P0.02 | #82 | #334 | `6e23ba45392869902d8a6d569e904c6cc73a631f` | `e3f9eda18d85443c04ee915b6f70a35907552eff` |

Both patches passed a local three-way application check against Development
`73f02a914d9eae74d7241fc0c3793833e164bf87` independently. Both touch the user
guide and browser spec, so reevaluate conflicts against the current Development
tip before each dispatch.

After the corrected controller merges and the owner authorizes re-entry, use
`unpark` with the issue number and exact parking tag SHA. The controller checks
the parked task and closed PR, verifies the stopped writer and scoped diff,
records the immutable source range, and compares and deletes the parking tag.
The next authorized controller cycle gives the new Copilot task the preserved
source range to apply under its own lease. The old PR and branch stay intact.
For #84, the previously recorded failures include React lint and disposable
Supabase startup. The recovered head must run fresh CI and acceptance before merge.

The live proof is one P0 delivery through confirmed Development deployment and
issue closure, followed by dispatch of the next eligible item. Keep #327 open
until that proof is recorded.
