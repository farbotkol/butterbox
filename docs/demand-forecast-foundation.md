# Demand forecasting foundation

## FCAST-BASE-001 — Foundation Ready, not a completed forecasting feature

This model-free library provides a deterministic foundation over explicitly
supplied demand history. It groups sales or booking observations into configured
venue-local dayparts, reports accepted/invalid/duplicate/out-of-window records
and expected-period coverage, and keeps an unobserved period distinct from an
observed zero.

The comparable-weekday baseline uses only observed periods before a supplied
training cutoff, within a bounded lookback. It reports the sample count, source
import IDs, baseline version and the observed minimum/maximum. Those bounds are
an observed range, **not** a statistical confidence interval. The backtest uses
a strict time-ordered holdout and reports MAE and WAPE; WAPE is explicitly
unavailable when there are no scored periods or the actual total is zero.

The code is a pure library with local tests. It has no database access, user
interface, authorization boundary, staffing-by-role calculation, roster
recommendation, weather integration, model/provider call or persisted
forecast. It has not been evaluated against a real venue dataset. The tests
demonstrate deterministic behavior and holdout separation; they do not establish
forecast accuracy or employment, award or payroll correctness.

Therefore FCAST-BASE-001 is **Foundation Ready** only. BB-FORECAST-003 remains
Backlog because role-level staffing demand, a validated confidence/uncertainty
measure, real-data evaluation and a user workflow are not delivered.
BB-FORECAST-005 remains Backlog because there is no dashboard or drift
monitoring. No User Guide update is applicable until a user-facing forecast
workflow exists.
