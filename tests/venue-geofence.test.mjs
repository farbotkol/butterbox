import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVenueGeofence } from "../src/lib/venue-geofence.ts";

test("venue geofences support explicit clearing and bounded coordinates", () => {
  assert.deepEqual(parseVenueGeofence({ latitude: "", longitude: " ", radiusMeters: "" }), {
    valid: true, latitude: null, longitude: null, radiusMeters: null,
  });
  assert.deepEqual(parseVenueGeofence({
    latitude: " -33.8688000 ", longitude: "151.2093", radiusMeters: "150",
  }), { valid: true, latitude: -33.8688, longitude: 151.2093, radiusMeters: 150 });
  assert.deepEqual(parseVenueGeofence({ latitude: "-90", longitude: "180", radiusMeters: "1" }), {
    valid: true, latitude: -90, longitude: 180, radiusMeters: 1,
  });
  assert.deepEqual(parseVenueGeofence({ latitude: "90", longitude: "-180", radiusMeters: "10000" }), {
    valid: true, latitude: 90, longitude: -180, radiusMeters: 10000,
  });
  assert.deepEqual(parseVenueGeofence({ latitude: ".5", longitude: "0.", radiusMeters: "001" }), {
    valid: true, latitude: 0.5, longitude: 0, radiusMeters: 1,
  });
});

test("venue geofences reject partial, imprecise, nonfinite and out-of-range values", () => {
  const valid = { latitude: "0", longitude: "0", radiusMeters: "100" };
  for (const latitude of ["", "90.000001", "-90.000001", "0.1234567", "NaN", "Infinity", "1e1", "+1", "1".repeat(33)]) {
    assert.deepEqual(parseVenueGeofence({ ...valid, latitude }), { valid: false }, latitude);
  }
  for (const longitude of ["", "180.000001", "-180.000001", "0.0000001", "Infinity"]) {
    assert.deepEqual(parseVenueGeofence({ ...valid, longitude }), { valid: false }, longitude);
  }
  for (const radiusMeters of ["", "0", "-1", "10001", "1.5", "1e2", "NaN"]) {
    assert.deepEqual(parseVenueGeofence({ ...valid, radiusMeters }), { valid: false }, radiusMeters);
  }
});
