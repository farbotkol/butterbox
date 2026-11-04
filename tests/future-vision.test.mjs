import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { futureVisionConcepts, futureVisionPreviewEnabled } from "../src/lib/future-vision.ts";

test("future concepts are opt-in and fail closed outside the verified showcase or local development", () => {
  const ordinary = { showcase: false, environment: "production" };
  assert.equal(futureVisionPreviewEnabled(ordinary), false);
  assert.equal(futureVisionPreviewEnabled({ ...ordinary, flag: "false" }), false);
  assert.equal(futureVisionPreviewEnabled({ ...ordinary, flag: "true", showcase: true }), true);
  assert.throws(() => futureVisionPreviewEnabled({ ...ordinary, flag: "true" }), /verified showcase/);
  for (const flag of ["", "yes", "TRUE", "0"]) {
    assert.throws(() => futureVisionPreviewEnabled({ ...ordinary, flag }), /must be true or false/);
  }

  const development = {
    flag: "true", environment: "development", showcase: false,
    apiUrl: "http://127.0.0.1:58421", siteUrl: "http://127.0.0.1:3117",
  };
  assert.equal(futureVisionPreviewEnabled(development), true);
  assert.equal(futureVisionPreviewEnabled({
    ...development, apiUrl: "http://localhost:58421", siteUrl: "http://[::1]:3117",
  }), true);
  for (const change of [
    { environment: "production" }, { apiUrl: undefined }, { siteUrl: undefined },
    { apiUrl: "https://example.test" }, { siteUrl: "https://example.test" },
    { apiUrl: "http://127.0.0.1:58421/path" }, { siteUrl: "http://127.0.0.1:3117/?q=x" },
    { apiUrl: "http://user:pass@127.0.0.1:58421" },
    { apiUrl: development.siteUrl },
  ]) {
    assert.throws(() => futureVisionPreviewEnabled({ ...development, ...change }), /separate local development/);
  }
});

test("runtime enablement recognizes only the existing verified production showcase", () => {
  const moduleUrl = new URL("../src/lib/future-vision.ts", import.meta.url).href;
  const script = `import { isFutureVisionPreviewEnabled } from ${JSON.stringify(moduleUrl)};
    console.log(isFutureVisionPreviewEnabled());`;
  const env = {
    ...process.env,
    NODE_ENV: "production",
    BUTTERBOX_FUTURE_VISION_PREVIEW: "true",
    NEXT_PUBLIC_BUTTERBOX_SHOWCASE: "true",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:57421",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3137",
  };
  const showcase = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    encoding: "utf8", env,
  });
  assert.ifError(showcase.error);
  assert.equal(showcase.status, 0);
  assert.equal(showcase.stdout.trim(), "true");

  const ordinary = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...env, NEXT_PUBLIC_BUTTERBOX_SHOWCASE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://ordinary.example.test", NEXT_PUBLIC_SITE_URL: "https://app.example.test" },
  });
  assert.ifError(ordinary.error);
  assert.notEqual(ordinary.status, 0);
  assert.match(ordinary.stderr, /Future concepts require the verified showcase/);
});

test("all future concepts use explicitly illustrative examples and disclose their limitations", () => {
  assert.deepEqual(futureVisionConcepts.map((concept) => concept.id), ["assistant", "forecast", "award"]);
  for (const concept of futureVisionConcepts) {
    assert.ok(concept.title);
    assert.match(concept.example, /^Illustrative example:/);
    assert.match(concept.limitation, /^No /);
  }
  assert.match(futureVisionConcepts[2].limitation, /No award interpretation, entitlement, payroll or compliance/);
});
