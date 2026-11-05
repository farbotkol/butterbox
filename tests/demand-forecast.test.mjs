import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateDemandHistory, backtestComparableDayBaseline, buildComparableDayBaseline,
  computeDemandForecastMetrics, DemandForecastError,
} from "../src/lib/demand-forecast.ts";

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const sourceImportId = id(1);
const fullDay = [{ id: "all-day", startMinute: 0, endMinute: 1440 }];
const observation = (date, value, index, importId = sourceImportId, time = "12:00:00Z") => ({
  sourceImportId: importId,
  sourceRecordId: `record-${index}`,
  occurredAt: `${date}T${time}`,
  value: String(value),
});

function aggregate(overrides = {}) {
  return aggregateDemandHistory({
    kind: "sales",
    timezone: "UTC",
    dayparts: [
      { id: "morning", startMinute: 0, endMinute: 720 },
      { id: "afternoon", startMinute: 720, endMinute: 1440 },
    ],
    expectedLocalDates: ["2024-01-01", "2024-01-02"],
    observations: [],
    ...overrides,
  });
}

test("aggregation uses explicit local dayparts and keeps unobserved demand distinct from zero", () => {
  const result = aggregate({
    observations: [
      observation("2024-01-01", "1.25", 1, sourceImportId, "11:59:00Z"),
      observation("2024-01-01", "0", 2, sourceImportId, "12:00:00Z"),
    ],
  });
  assert.deepEqual(result.periods.map(({ localDate, daypartId, value, observationCount }) =>
    [localDate, daypartId, value, observationCount]), [
    ["2024-01-01", "morning", 1.25, 1],
    ["2024-01-01", "afternoon", 0, 1],
    ["2024-01-02", "morning", null, 0],
    ["2024-01-02", "afternoon", null, 0],
  ]);
  assert.equal(result.quality.expectedPeriodCount, 4);
  assert.equal(result.quality.observedPeriodCount, 2);
  assert.equal(result.quality.unobservedPeriodCount, 2);
  assert.equal(result.quality.coverageRatio, 0.5);
  assert.equal(result.quality.complete, false);
  assert.deepEqual(result.sourceImportIds, [sourceImportId]);
});

test("venue-local aggregation handles daylight-saving gaps and repeated clock hours", () => {
  const spring = aggregate({
    timezone: "Australia/Sydney",
    dayparts: [
      { id: "before-transition", startMinute: 0, endMinute: 120 },
      { id: "transition-hour", startMinute: 120, endMinute: 180 },
      { id: "after-transition", startMinute: 180, endMinute: 1440 },
    ],
    expectedLocalDates: ["2024-10-06"],
    observations: [
      observation("2024-10-05", "1.00", 1, sourceImportId, "15:30:00Z"),
      observation("2024-10-05", "2.00", 2, id(2), "16:30:00Z"),
    ],
  });
  assert.deepEqual(spring.periods.map(({ daypartId, value }) => [daypartId, value]), [
    ["before-transition", 1], ["transition-hour", null], ["after-transition", 2],
  ]);

  const autumn = aggregate({
    timezone: "Australia/Sydney",
    dayparts: [
      { id: "overnight", startMinute: 0, endMinute: 180 },
      { id: "rest-of-day", startMinute: 180, endMinute: 1440 },
    ],
    expectedLocalDates: ["2024-04-07"],
    observations: [
      observation("2024-04-06", "1.00", 3, sourceImportId, "15:30:00Z"),
      observation("2024-04-06", "2.00", 4, id(2), "16:30:00Z"),
    ],
  });
  assert.deepEqual(autumn.periods.map(({ daypartId, value, observationCount }) =>
    [daypartId, value, observationCount]), [
    ["overnight", 3, 2], ["rest-of-day", null, 0],
  ]);
});

test("duplicate, invalid and out-of-window observations are counted and never silently treated as demand", () => {
  const result = aggregate({
    dayparts: fullDay,
    expectedLocalDates: ["2024-01-01"],
    observations: [
      observation("2024-01-01", "1.25", 1),
      observation("2024-01-01", "9.00", 1),
      observation("2024-01-01", "1.234", 2),
      observation("2024-01-02", "5.00", 3),
    ],
  });
  assert.equal(result.periods[0].value, 1.25);
  assert.equal(result.quality.acceptedRecordCount, 1);
  assert.equal(result.quality.duplicateRecordCount, 1);
  assert.equal(result.quality.invalidRecordCount, 1);
  assert.equal(result.quality.outOfWindowRecordCount, 1);
  assert.equal(result.quality.complete, false);
});

test("aggregation rejects invalid timezones, incomplete dayparts, invalid dates and duplicate dates", () => {
  assert.throws(() => aggregate({ timezone: "Not/A_Timezone" }), DemandForecastError);
  assert.throws(() => aggregate({
    dayparts: [{ id: "gap", startMinute: 0, endMinute: 100 }],
  }), DemandForecastError);
  assert.throws(() => aggregate({ expectedLocalDates: ["2024-02-30"] }), DemandForecastError);
  assert.throws(() => aggregate({ expectedLocalDates: ["2024-01-01", "2024-01-01"] }), DemandForecastError);
});

test("baseline rejects malformed targets and backtests reject malformed history dates", () => {
  const history = aggregate({
    dayparts: fullDay,
    expectedLocalDates: ["2024-01-01"],
    observations: [observation("2024-01-01", "5.00", 1)],
  });
  assert.throws(() => buildComparableDayBaseline(history, [null], {
    trainingEndDate: "2024-01-01",
  }), DemandForecastError);
  assert.throws(() => backtestComparableDayBaseline({
    ...history,
    periods: [{ ...history.periods[0], localDate: "invalid" }],
  }, "2024-01-01"), DemandForecastError);
});

test("comparable-day baselines use only prior same-weekday history and expose observed ranges", () => {
  const trainingDates = [
    ["2024-01-01", "10.00"],
    ["2024-01-08", "20.00"],
    ["2024-01-15", "30.00"],
    ["2024-01-22", "40.00"],
    ["2024-01-29", "50.00"],
  ];
  const holdoutDates = [
    ["2024-02-05", "100.00"],
    ["2024-02-12", "200.00"],
    ["2024-02-19", "999.00"],
  ];
  const records = [
    ...trainingDates.map(([date, value], index) => observation(date, value, index + 1, id(index + 1))),
    ...holdoutDates.map(([date, value], index) =>
      observation(date, value, index + 20, id(index + 20))),
  ];
  const history = aggregate({
    dayparts: fullDay,
    expectedLocalDates: [...trainingDates, ...holdoutDates].map(([date]) => date),
    observations: records,
  });
  const forecast = buildComparableDayBaseline(history, [
    { localDate: "2024-02-05", daypartId: "all-day" },
  ], { trainingEndDate: "2024-02-05", minimumSamples: 3, lookbackWeeks: 12 })[0];
  assert.equal(forecast.status, "ready");
  assert.equal(forecast.predictedValue, 30);
  assert.equal(forecast.lowerObservedValue, 10);
  assert.equal(forecast.upperObservedValue, 50);
  assert.equal(forecast.sampleCount, 5);
  assert.deepEqual(forecast.sourceImportIds, [id(1), id(2), id(3), id(4), id(5)]);

  const backtest = backtestComparableDayBaseline(history, "2024-02-05", {
    minimumSamples: 3,
    lookbackWeeks: 12,
  });
  assert.equal(backtest.trainingPeriodCount, 5);
  assert.equal(backtest.holdoutPeriodCount, 3);
  assert.ok(backtest.predictions.every((prediction) => prediction.predictedValue === 30));
  assert.ok(backtest.predictions.every((prediction) =>
    prediction.sourceImportIds.every((sourceId) => [id(1), id(2), id(3), id(4), id(5)].includes(sourceId))));
  assert.deepEqual(backtest.metrics, {
    scoredPeriodCount: 3,
    unscoredPeriodCount: 0,
    mae: 403,
    wape: 0.930716,
    wapeUnavailableReason: null,
  });
});

test("insufficient comparable history yields no numeric prediction", () => {
  const history = aggregate({
    kind: "bookings",
    dayparts: fullDay,
    expectedLocalDates: ["2024-01-01", "2024-01-08"],
    observations: [
      observation("2024-01-01", "5", 1),
    ],
  });
  const forecast = buildComparableDayBaseline(history, [
    { localDate: "2024-01-08", daypartId: "all-day" },
  ], { trainingEndDate: "2024-01-08", minimumSamples: 2 })[0];
  assert.equal(forecast.status, "insufficient_history");
  assert.equal(forecast.predictedValue, null);
  assert.equal(forecast.sampleCount, 1);
});

test("MAE and WAPE report zero-demand and unscored periods honestly", () => {
  assert.deepEqual(computeDemandForecastMetrics([
    { predictedValue: 0, actualValue: 0 },
    { predictedValue: 10, actualValue: null },
  ]), {
    scoredPeriodCount: 1,
    unscoredPeriodCount: 1,
    mae: 0,
    wape: null,
    wapeUnavailableReason: "zero_actual_total",
  });
  assert.deepEqual(computeDemandForecastMetrics([
    { predictedValue: null, actualValue: 4 },
  ]), {
    scoredPeriodCount: 0,
    unscoredPeriodCount: 1,
    mae: null,
    wape: null,
    wapeUnavailableReason: "no_scored_periods",
  });
  assert.throws(() => computeDemandForecastMetrics([
    { predictedValue: -1, actualValue: 4 },
  ]), DemandForecastError);
});
