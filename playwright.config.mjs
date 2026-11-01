import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.mjs",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.BUTTERBOX_TEST_APP_URL,
    headless: true,
    launchOptions: process.env.BUTTERBOX_TEST_LOW_MEMORY === "yes"
      ? { args: ["--renderer-process-limit=2"] }
      : undefined,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
