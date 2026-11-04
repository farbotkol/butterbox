import { Temporal } from "@js-temporal/polyfill";

export const demandAggregationVersion = "daypart-aggregation-v1";
export const comparableDayBaselineVersion = "comparable-weekday-v1";

export type DemandKind = "sales" | "bookings";
export type DemandDaypart = {
  id: string;
  startMinute: number;
  endMinute: number;
};
export type DemandObservation = {
  sourceImportId: string;
  sourceRecordId: string;
  occurredAt: string;
  value: string;
};
export type DemandAggregationInput = {
  kind: DemandKind;
  timezone: string;
  dayparts: readonly DemandDaypart[];
  expectedLocalDates: readonly string[];
  observations: readonly DemandObservation[];
};
export type DemandPeriod = {
  localDate: string;
  daypartId: string;
  value: number | null;
  observationCount: number;
  sourceImportIds: string[];
};
export type DemandAggregation = {
  version: typeof demandAggregationVersion;
  kind: DemandKind;
  timezone: string;
  periods: DemandPeriod[];
  sourceImportIds: string[];
  quality: {
    receivedRecordCount: number;
    acceptedRecordCount: number;
    invalidRecordCount: number;
    duplicateRecordCount: number;
    outOfWindowRecordCount: number;
    expectedPeriodCount: number;
    observedPeriodCount: number;
    unobservedPeriodCount: number;
    coverageRatio: number;
    complete: boolean;
  };
};
export type DemandForecastTarget = { localDate: string; daypartId: string };
export type ComparableDayForecast = {
  localDate: string;
  daypartId: string;
  status: "ready" | "insufficient_history";
  predictedValue: number | null;
  lowerObservedValue: number | null;
  upperObservedValue: number | null;
  sampleCount: number;
  sourceImportIds: string[];
  baselineVersion: typeof comparableDayBaselineVersion;
};
export type DemandForecastMetrics = {
  scoredPeriodCount: number;
  unscoredPeriodCount: number;
  mae: number | null;
  wape: number | null;
  wapeUnavailableReason: "no_scored_periods" | "zero_actual_total" | null;
};
export type DemandBacktest = {
  baselineVersion: typeof comparableDayBaselineVersion;
  aggregationVersion: typeof demandAggregationVersion;
  kind: DemandKind;
  timezone: string;
  holdoutStartDate: string;
  trainingPeriodCount: number;
  holdoutPeriodCount: number;
  predictions: Array<ComparableDayForecast & { actualValue: number | null }>;
  metrics: DemandForecastMetrics;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sourceRecordPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const salesValuePattern = /^\d{1,9}(?:\.\d{1,2})?$/;
const bookingValuePattern = /^\d{1,6}$/;
const maximumExpectedDates = 730;
const maximumObservations = 100_000;
const maximumDayparts = 12;

export class DemandForecastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemandForecastError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLocalDate(value: unknown): Temporal.PlainDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const date = Temporal.PlainDate.from(value);
    return date.toString() === value ? date : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone }).format(0);
  } catch (error) {
    if (error instanceof RangeError) throw new DemandForecastError("Invalid venue timezone.");
    throw error;
  }
}

function validateDayparts(dayparts: readonly DemandDaypart[]): void {
  if (!Array.isArray(dayparts) || dayparts.length < 1 || dayparts.length > maximumDayparts) {
    throw new DemandForecastError("Configure between 1 and 12 dayparts.");
  }
  const ids = new Set<string>();
  let nextStart = 0;
  for (const part of dayparts) {
    if (!isRecord(part) || typeof part.id !== "string" ||
      typeof part.startMinute !== "number" || typeof part.endMinute !== "number" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(part.id) || ids.has(part.id) ||
      !Number.isInteger(part.startMinute) || !Number.isInteger(part.endMinute) ||
      part.startMinute !== nextStart || part.endMinute <= part.startMinute || part.endMinute > 1440) {
      throw new DemandForecastError("Dayparts must be uniquely named, ordered and cover each minute of the day exactly once.");
    }
    ids.add(part.id);
    nextStart = part.endMinute;
  }
  if (nextStart !== 1440) {
    throw new DemandForecastError("Dayparts must cover the full local day.");
  }
}

function parseValue(value: unknown, kind: DemandKind): number | null {
  if (typeof value !== "string") return null;
  if (kind === "sales" && salesValuePattern.test(value)) {
    const [whole, fraction = ""] = value.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) ? cents / 100 : null;
  }
  if (kind === "bookings" && bookingValuePattern.test(value)) {
    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0 ? count : null;
  }
  return null;
}

function periodKey(localDate: string, daypartId: string): string {
  return `${localDate}\u0000${daypartId}`;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function dayOfWeek(value: string): number {
  const date = parseLocalDate(value);
  if (!date) throw new DemandForecastError("Invalid local date.");
  return date.dayOfWeek;
}

export function aggregateDemandHistory(input: DemandAggregationInput): DemandAggregation {
  if (!isRecord(input) || (input.kind !== "sales" && input.kind !== "bookings") ||
    typeof input.timezone !== "string" || !Array.isArray(input.expectedLocalDates) ||
    !Array.isArray(input.observations) || input.observations.length > maximumObservations) {
    throw new DemandForecastError("Invalid demand aggregation input.");
  }
  validateTimezone(input.timezone);
  validateDayparts(input.dayparts);

  if (input.expectedLocalDates.length < 1 || input.expectedLocalDates.length > maximumExpectedDates) {
    throw new DemandForecastError("Choose between 1 and 730 expected local dates.");
  }
  const dates = new Set<string>();
  for (const value of input.expectedLocalDates) {
    if (!parseLocalDate(value) || dates.has(value)) {
      throw new DemandForecastError("Expected local dates must be valid and unique.");
    }
    dates.add(value);
  }
  const sortedDates = [...dates].sort();
  const accumulators = new Map<string, {
    localDate: string;
    daypartId: string;
    total: number;
    observationCount: number;
    sourceImportIds: Set<string>;
  }>();
  for (const localDate of sortedDates) {
    for (const part of input.dayparts) {
      accumulators.set(periodKey(localDate, part.id), {
        localDate, daypartId: part.id, total: 0, observationCount: 0, sourceImportIds: new Set(),
      });
    }
  }

  let acceptedRecordCount = 0;
  let invalidRecordCount = 0;
  let duplicateRecordCount = 0;
  let outOfWindowRecordCount = 0;
  const seenRecords = new Set<string>();
  for (const observation of input.observations) {
    if (!isRecord(observation) || typeof observation.sourceImportId !== "string" ||
      !uuidPattern.test(observation.sourceImportId) ||
      typeof observation.sourceRecordId !== "string" || !sourceRecordPattern.test(observation.sourceRecordId) ||
      typeof observation.occurredAt !== "string" || typeof observation.value !== "string") {
      invalidRecordCount += 1;
      continue;
    }
    const value = parseValue(observation.value, input.kind);
    let instant: Temporal.Instant;
    try {
      instant = Temporal.Instant.from(observation.occurredAt);
    } catch (error) {
      if (error instanceof RangeError) {
        invalidRecordCount += 1;
        continue;
      }
      throw error;
    }
    if (value === null) {
      invalidRecordCount += 1;
      continue;
    }

    const uniqueKey = `${observation.sourceImportId.toLowerCase()}\u0000${observation.sourceRecordId}`;
    if (seenRecords.has(uniqueKey)) {
      duplicateRecordCount += 1;
      continue;
    }
    seenRecords.add(uniqueKey);

    let local: Temporal.ZonedDateTime;
    try {
      local = instant.toZonedDateTimeISO(input.timezone);
    } catch (error) {
      if (error instanceof RangeError) {
        invalidRecordCount += 1;
        continue;
      }
      throw error;
    }
    const localDate = local.toPlainDate().toString();
    if (!dates.has(localDate)) {
      outOfWindowRecordCount += 1;
      continue;
    }
    const minuteOfDay = local.hour * 60 + local.minute;
    const part = input.dayparts.find((candidate) =>
      minuteOfDay >= candidate.startMinute && minuteOfDay < candidate.endMinute,
    );
    if (!part) {
      invalidRecordCount += 1;
      continue;
    }
    const accumulator = accumulators.get(periodKey(localDate, part.id));
    if (!accumulator) {
      invalidRecordCount += 1;
      continue;
    }
    const aggregateValue = input.kind === "sales" ? Math.round(value * 100) : value;
    const aggregateTotal = accumulator.total + aggregateValue;
    if (!Number.isSafeInteger(aggregateTotal)) {
      throw new DemandForecastError("Demand total exceeds the safe aggregation limit.");
    }
    accumulator.total = aggregateTotal;
    accumulator.observationCount += 1;
    accumulator.sourceImportIds.add(observation.sourceImportId);
    acceptedRecordCount += 1;
  }

  const periods = [...accumulators.values()].map((period) => ({
    localDate: period.localDate,
    daypartId: period.daypartId,
    value: period.observationCount === 0
      ? null
      : input.kind === "sales" ? period.total / 100 : period.total,
    observationCount: period.observationCount,
    sourceImportIds: [...period.sourceImportIds].sort(),
  }));
  const observedPeriodCount = periods.filter((period) => period.value !== null).length;
  const expectedPeriodCount = periods.length;
  const unobservedPeriodCount = expectedPeriodCount - observedPeriodCount;
  const sourceImportIds = [...new Set(periods.flatMap((period) => period.sourceImportIds))].sort();
  return {
    version: demandAggregationVersion,
    kind: input.kind,
    timezone: input.timezone,
    periods,
    sourceImportIds,
    quality: {
      receivedRecordCount: input.observations.length,
      acceptedRecordCount,
      invalidRecordCount,
      duplicateRecordCount,
      outOfWindowRecordCount,
      expectedPeriodCount,
      observedPeriodCount,
      unobservedPeriodCount,
      coverageRatio: observedPeriodCount / expectedPeriodCount,
      complete: invalidRecordCount === 0 && duplicateRecordCount === 0 &&
        outOfWindowRecordCount === 0 && unobservedPeriodCount === 0,
    },
  };
}

export function buildComparableDayBaseline(
  aggregation: DemandAggregation,
  targets: readonly DemandForecastTarget[],
  options: { trainingEndDate: string; minimumSamples?: number; lookbackWeeks?: number },
): ComparableDayForecast[] {
  if (!isRecord(aggregation) || aggregation.version !== demandAggregationVersion ||
    (aggregation.kind !== "sales" && aggregation.kind !== "bookings") ||
    typeof aggregation.timezone !== "string" || !Array.isArray(aggregation.periods) ||
    !Array.isArray(targets) || !isRecord(options)) {
    throw new DemandForecastError("Invalid comparable-day baseline input.");
  }
  validateTimezone(aggregation.timezone);
  const trainingEnd = parseLocalDate(options.trainingEndDate);
  const minimumSamples = options.minimumSamples ?? 4;
  const lookbackWeeks = options.lookbackWeeks ?? 12;
  if (!trainingEnd || !Number.isInteger(minimumSamples) || minimumSamples < 1 || minimumSamples > 104 ||
    !Number.isInteger(lookbackWeeks) || lookbackWeeks < 1 || lookbackWeeks > 104 ||
    targets.length > maximumExpectedDates * maximumDayparts) {
    throw new DemandForecastError("Invalid baseline training limits.");
  }
  if (!targets.every((target) => isRecord(target) && parseLocalDate(target.localDate) !== null &&
    typeof target.daypartId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(target.daypartId))) {
    throw new DemandForecastError("Invalid comparable-day forecast target.");
  }

  const periodIds = new Set<string>();
  const validHistory = aggregation.periods.filter((period) => {
    if (!isRecord(period) || !parseLocalDate(period.localDate) || typeof period.daypartId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(period.daypartId) ||
      (period.value !== null && (typeof period.value !== "number" || !Number.isFinite(period.value) || period.value < 0)) ||
      !Number.isInteger(period.observationCount) || period.observationCount < 0 ||
      !Array.isArray(period.sourceImportIds) ||
      !period.sourceImportIds.every((id) => typeof id === "string" && uuidPattern.test(id))) {
      throw new DemandForecastError("Invalid historical demand period.");
    }
    if ((period.value === null) !== (period.observationCount === 0) ||
      (period.observationCount === 0) !== (period.sourceImportIds.length === 0)) {
      throw new DemandForecastError("Historical period coverage is inconsistent.");
    }
    const key = periodKey(period.localDate, period.daypartId);
    if (periodIds.has(key)) throw new DemandForecastError("Duplicate historical demand period.");
    periodIds.add(key);
    return period.value !== null && Temporal.PlainDate.compare(
      Temporal.PlainDate.from(period.localDate), trainingEnd,
    ) < 0;
  });
  const knownDayparts = new Set(aggregation.periods.map((period) => period.daypartId));
  const targetKeys = new Set<string>();
  const orderedTargets = [...targets].sort((a, b) =>
    a.localDate.localeCompare(b.localDate) || a.daypartId.localeCompare(b.daypartId),
  );
  return orderedTargets.map((target) => {
    const targetDate = parseLocalDate(target.localDate);
    const key = periodKey(target.localDate, target.daypartId);
    if (!targetDate || !knownDayparts.has(target.daypartId) || targetKeys.has(key) ||
      Temporal.PlainDate.compare(targetDate, trainingEnd) < 0) {
      throw new DemandForecastError("Targets must be unique, in scope and on or after the training cutoff.");
    }
    targetKeys.add(key);
    const oldestDate = targetDate.subtract({ weeks: lookbackWeeks });
    const samples = validHistory.filter((period) => period.daypartId === target.daypartId &&
      Temporal.PlainDate.compare(Temporal.PlainDate.from(period.localDate), oldestDate) >= 0 &&
      dayOfWeek(period.localDate) === targetDate.dayOfWeek,
    );
    const sourceImportIds = [...new Set(samples.flatMap((period) => period.sourceImportIds))].sort();
    if (samples.length < minimumSamples) {
      return {
        localDate: target.localDate,
        daypartId: target.daypartId,
        status: "insufficient_history",
        predictedValue: null,
        lowerObservedValue: null,
        upperObservedValue: null,
        sampleCount: samples.length,
        sourceImportIds,
        baselineVersion: comparableDayBaselineVersion,
      };
    }
    const values = samples.map((sample) => sample.value as number);
    return {
      localDate: target.localDate,
      daypartId: target.daypartId,
      status: "ready",
      predictedValue: roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length),
      lowerObservedValue: Math.min(...values),
      upperObservedValue: Math.max(...values),
      sampleCount: values.length,
      sourceImportIds,
      baselineVersion: comparableDayBaselineVersion,
    };
  });
}

export function computeDemandForecastMetrics(
  pairs: readonly { predictedValue: number | null; actualValue: number | null }[],
): DemandForecastMetrics {
  let absoluteErrorTotal = 0;
  let actualTotal = 0;
  let scoredPeriodCount = 0;
  for (const pair of pairs) {
    if (!isRecord(pair) ||
      (pair.predictedValue !== null &&
        (typeof pair.predictedValue !== "number" || !Number.isFinite(pair.predictedValue) || pair.predictedValue < 0)) ||
      (pair.actualValue !== null &&
        (typeof pair.actualValue !== "number" || !Number.isFinite(pair.actualValue) || pair.actualValue < 0))) {
      throw new DemandForecastError("Invalid forecast metric pair.");
    }
    if (pair.predictedValue === null || pair.actualValue === null) continue;
    absoluteErrorTotal += Math.abs(pair.predictedValue - pair.actualValue);
    actualTotal += pair.actualValue;
    scoredPeriodCount += 1;
  }
  const unscoredPeriodCount = pairs.length - scoredPeriodCount;
  return {
    scoredPeriodCount,
    unscoredPeriodCount,
    mae: scoredPeriodCount === 0 ? null : roundMetric(absoluteErrorTotal / scoredPeriodCount),
    wape: scoredPeriodCount === 0 || actualTotal === 0
      ? null
      : roundMetric(absoluteErrorTotal / actualTotal),
    wapeUnavailableReason: scoredPeriodCount === 0
      ? "no_scored_periods"
      : actualTotal === 0 ? "zero_actual_total" : null,
  };
}

export function backtestComparableDayBaseline(
  aggregation: DemandAggregation,
  holdoutStartDate: string,
  options: { minimumSamples?: number; lookbackWeeks?: number } = {},
): DemandBacktest {
  const holdoutDate = parseLocalDate(holdoutStartDate);
  if (!holdoutDate || !isRecord(aggregation) ||
    aggregation.version !== demandAggregationVersion || !Array.isArray(aggregation.periods)) {
    throw new DemandForecastError("Invalid demand aggregation or holdout start date.");
  }
  if (!isRecord(options)) throw new DemandForecastError("Invalid backtest options.");
  for (const period of aggregation.periods) {
    if (!isRecord(period) || !parseLocalDate(period.localDate)) {
      throw new DemandForecastError("Invalid historical demand period.");
    }
  }
  const trainingPeriods = aggregation.periods.filter((period) =>
    Temporal.PlainDate.compare(Temporal.PlainDate.from(period.localDate), holdoutDate) < 0,
  );
  const holdoutPeriods = aggregation.periods.filter((period) =>
    Temporal.PlainDate.compare(Temporal.PlainDate.from(period.localDate), holdoutDate) >= 0,
  );
  const targets = holdoutPeriods.map(({ localDate, daypartId }) => ({ localDate, daypartId }));
  const forecasts = buildComparableDayBaseline(aggregation, targets, {
    trainingEndDate: holdoutStartDate,
    minimumSamples: options.minimumSamples,
    lookbackWeeks: options.lookbackWeeks,
  });
  const predictions = forecasts.map((forecast) => {
    const actual = holdoutPeriods.find((period) =>
      period.localDate === forecast.localDate && period.daypartId === forecast.daypartId,
    );
    return { ...forecast, actualValue: actual?.value ?? null };
  });
  return {
    baselineVersion: comparableDayBaselineVersion,
    aggregationVersion: aggregation.version,
    kind: aggregation.kind,
    timezone: aggregation.timezone,
    holdoutStartDate,
    trainingPeriodCount: trainingPeriods.filter((period) => period.value !== null).length,
    holdoutPeriodCount: holdoutPeriods.length,
    predictions,
    metrics: computeDemandForecastMetrics(predictions),
  };
}
