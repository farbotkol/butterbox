import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Set by scripts/test-env.mjs (and CI) to keep failure screenshots, traces and a JSON report for diagnosis.
const reportDir = process.env.BUTTERBOX_TEST_REPORT_DIR;
// Playwright empties outputDir on start and scripts/test-auth.mjs may start several runners (low-memory batches), so
// each runner gets its own directory. Workers inherit this variable from the runner that first loaded the config.
const reportRun = reportDir ? (process.env.BUTTERBOX_TEST_REPORT_RUN ??= `${Date.now()}-${process.pid}`) : "";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.mjs",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: reportDir
    ? [["list"], ["json", { outputFile: join(reportDir, `report-${reportRun}.json`) }]]
    : "list",
  ...(reportDir ? { outputDir: join(reportDir, `test-results-${reportRun}`) } : {}),
  use: {
    baseURL: process.env.BUTTERBOX_TEST_APP_URL,
    headless: true,
    screenshot: reportDir ? "only-on-failure" : "off",
    trace: reportDir ? "retain-on-failure" : "off",
    video: "off",
  },
});
