import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  changedVenueSettingsSections,
  mergeSavedVenueSettings,
  runVenueSettingsOperations,
  validateVenueSettings,
  venueSettingsSaveButtonState,
  venueSettingsSaveOrder,
} from "../src/lib/venue-settings.ts";

const defaults = {
  weekday: "1",
  mode: "direct",
  manual_unavailability: "false",
  publish_unavailability: "false",
  publish_overlap: "false",
  publish_long_shift: "false",
  latitude: "",
  longitude: "",
  radius_meters: "",
  enabled: "false",
};

test("one responsive Save changes action is available to edit venue settings", async () => {
  const component = await readFile(new URL("../src/components/venue-settings-form.tsx", import.meta.url), "utf8");
  assert.equal((component.match(/<button type="submit"/g) ?? []).length, 1);
  assert.deepEqual(venueSettingsSaveButtonState(false, false), { disabled: true, label: "Save changes" });
  assert.deepEqual(venueSettingsSaveButtonState(true, true), { disabled: true, label: "Saving..." });
  assert.deepEqual(venueSettingsSaveButtonState(true, false), { disabled: false, label: "Save changes" });
});

test("a change to one setting saves only its section", async () => {
  const desired = { ...defaults, mode: "approval" };
  assert.deepEqual(changedVenueSettingsSections(defaults, desired), ["publicationMode"]);
  assert.deepEqual(venueSettingsSaveOrder(defaults, desired), ["publicationMode"]);
  const calls = [];
  const result = await runVenueSettingsOperations(venueSettingsSaveOrder(defaults, desired), async (section) => {
    calls.push(section);
    return null;
  });
  assert.deepEqual(calls, ["publicationMode"]);
  assert.deepEqual(result.savedSections, ["publicationMode"]);
});

test("one submit sequences changes across multiple sections", async () => {
  const desired = {
    ...defaults,
    weekday: "7",
    mode: "approval",
    publish_overlap: "true",
    latitude: "-33.8688",
    longitude: "151.2093",
    radius_meters: "150",
    enabled: "true",
  };
  const order = venueSettingsSaveOrder(defaults, desired);
  assert.deepEqual(order, [
    "planningWeek", "publicationMode", "conflictPolicy", "venueLocation", "clockVerification",
  ]);
  const calls = [];
  const result = await runVenueSettingsOperations(order, async (section) => {
    calls.push(section);
    return null;
  });
  assert.deepEqual(calls, order);
  assert.deepEqual(result.savedSections, order);
  assert.equal(result.failedSection, null);
});

test("unchanged sections are excluded from saves", async () => {
  const desired = { ...defaults, publish_overlap: "true" };
  assert.deepEqual(changedVenueSettingsSections(defaults, desired), ["conflictPolicy"]);
  const calls = [];
  await runVenueSettingsOperations(venueSettingsSaveOrder(defaults, desired), async (section) => {
    calls.push(section);
    return null;
  });
  assert.deepEqual(calls, ["conflictPolicy"]);
});

test("validation and partial failure leave unsaved sections retryable", async () => {
  const invalid = validateVenueSettings({
    ...defaults,
    latitude: "91",
    longitude: "181",
    radius_meters: "0",
    publish_overlap: "sometimes",
  });
  assert.match(invalid.latitude, /latitude from -90 to 90/);
  assert.match(invalid.longitude, /longitude from -180 to 180/);
  assert.match(invalid.radius_meters, /whole-number radius from 1 to 10,000/);
  assert.match(invalid.publish_overlap, /warns or blocks/);
  assert.deepEqual(validateVenueSettings({ ...defaults, enabled: "true" }), {
    enabled: "A venue location is required while clock location verification is on. Configure a location or turn verification off.",
  });

  const desired = { ...defaults, mode: "approval", latitude: "-33.8688", longitude: "151.2093", radius_meters: "150" };
  const order = venueSettingsSaveOrder(defaults, desired);
  const calls = [];
  const failed = await runVenueSettingsOperations(order, async (section) => {
    calls.push(section);
    return section === "venueLocation" ? "temporary failure" : null;
  });
  assert.deepEqual(calls, ["publicationMode", "venueLocation"]);
  assert.deepEqual(failed.savedSections, ["publicationMode"]);
  assert.equal(failed.failedSection, "venueLocation");
  const reconciled = mergeSavedVenueSettings(defaults, desired, failed.savedSections);
  assert.deepEqual(venueSettingsSaveOrder(reconciled, desired), ["venueLocation"]);
  const retried = await runVenueSettingsOperations(
    venueSettingsSaveOrder(reconciled, desired), async () => null,
  );
  assert.deepEqual(retried.savedSections, ["venueLocation"]);
});

test("batch action keeps owner checks, scoped RPCs and existing audit histories", async () => {
  const [action, page] = await Promise.all([
    readFile(new URL("../src/app/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/settings/organisation/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(action, /getWorkspace\(venueIds\[0\], businessContext\(formData\)\)/);
  assert.match(action, /workspace\.membership\.role !== "owner"/);
  for (const rpc of [
    "save_venue_roster_week", "save_roster_publication_mode", "save_venue_conflict_policy",
    "save_venue_geofence", "set_venue_clock_geofence",
  ]) assert.ok(action.includes(`rpc("${rpc}"`), `expected existing scoped RPC ${rpc}`);
  for (const history of [
    "venue_roster_week_events", "roster_publication_mode_events", "venue_conflict_policy_events",
    "venue_geofence_events", "venue_clock_location_events",
  ]) assert.ok(page.includes(`from("${history}")`), `expected existing audit history ${history}`);
});

test("dirty-state protection and save feedback remain accessible", async () => {
  const component = await readFile(new URL("../src/components/venue-settings-form.tsx", import.meta.url), "utf8");
  assert.match(component, /window\.addEventListener\("beforeunload"/);
  assert.match(component, /window\.confirm\("Discard your unsaved changes and leave this page\?"/);
  assert.match(component, /state\.status === "saved"/);
  assert.match(component, /state\.status === "partial"/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(component, /disabled=\{button\.disabled \|\| submitLocked\}/);
});

test("mobile browser coverage checks a single action, multi-section saves and validation", async () => {
  const e2e = await readFile(new URL("./e2e/auth.spec.mjs", import.meta.url), "utf8");
  const testStart = e2e.indexOf('test("owners configure venue geofences with protected audit and scoped access"');
  const testEnd = e2e.indexOf('\ntest("venue planning weeks remain scoped', testStart);
  assert.notEqual(testStart, -1);
  assert.notEqual(testEnd, -1);
  const browserTest = e2e.slice(testStart, testEnd);
  assert.match(browserTest, /setViewportSize\(\{ width: 375, height: 812 \}\)/);
  assert.match(browserTest, /Publication mode"\)\.selectOption\("approval"\)/);
  assert.match(browserTest, /Publish with overlapping shifts"\)\.selectOption\("true"\)/);
  assert.match(browserTest, /name: "Save changes"/);
  assert.match(browserTest, /aria-invalid", "true"/);
  assert.match(browserTest, /All changed venue settings were saved/);
});
