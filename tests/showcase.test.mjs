import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHOWCASE_AUTH_COOKIE_NAME, publicShowcaseMode, showcaseMode, supabaseAuthCookieName, supabaseAuthCookieOptions,
} from "../src/lib/showcase.ts";

test("showcase label is explicit, off by default and restricted to the separate local configuration", () => {
  assert.equal(showcaseMode({}), false);
  assert.equal(showcaseMode({ flag: "false", apiUrl: "https://ordinary.example.test" }), false);
  const valid = { flag: "true", apiUrl: "http://127.0.0.1:57421", appUrl: "http://127.0.0.1:3137" };
  assert.equal(showcaseMode(valid), true);
  assert.throws(() => showcaseMode({ ...valid, flag: undefined }), /explicit simulation/);
  assert.throws(() => showcaseMode({ ...valid, flag: "false" }), /explicit simulation/);
  for (const changed of [
    { flag: "yes" }, { flag: "" }, { apiUrl: "https://production.example.test" },
    { apiUrl: "http://127.0.0.1:55421" }, { apiUrl: "http://localhost:57421" },
    { appUrl: "http://127.0.0.1:3000" }, { appUrl: undefined },
  ]) assert.throws(() => showcaseMode({ ...valid, ...changed }), /verified local/);
});

test("public showcase mode is opt-in and cannot target an ordinary environment", () => {
  const showcase = { flag: "true", apiUrl: "http://127.0.0.1:57421", appUrl: "http://127.0.0.1:3137" };
  assert.equal(publicShowcaseMode(showcase), false);
  assert.equal(publicShowcaseMode({ ...showcase, publicFlag: "false" }), false);
  assert.equal(publicShowcaseMode({ ...showcase, publicFlag: "true" }), true);
  assert.throws(() => publicShowcaseMode({ ...showcase, publicFlag: "yes" }), /requires the verified/);
  assert.throws(() => publicShowcaseMode({ publicFlag: "true" }), /requires the verified/);
  assert.throws(() => publicShowcaseMode({ ...showcase, publicFlag: "true", apiUrl: "https://production.example.test" }), /verified local/);
});

test("showcase auth cookies are isolated while ordinary cookie naming stays unchanged", () => {
  const normal = { apiUrl: "http://127.0.0.1:54321", appUrl: "http://127.0.0.1:3000" };
  const showcase = { flag: "true", apiUrl: "http://127.0.0.1:57421", appUrl: "http://127.0.0.1:3137" };
  assert.equal(supabaseAuthCookieOptions(normal), undefined);
  assert.equal(supabaseAuthCookieName(normal.apiUrl, normal), "sb-127-auth-token");
  assert.equal(supabaseAuthCookieName("https://project.supabase.co", {}), "sb-project-auth-token");
  assert.deepEqual(supabaseAuthCookieOptions(showcase), { name: SHOWCASE_AUTH_COOKIE_NAME });
  assert.deepEqual(supabaseAuthCookieOptions({ ...showcase, publicFlag: "true" }), {
    name: SHOWCASE_AUTH_COOKIE_NAME, secure: true, httpOnly: true,
  });
  assert.equal(supabaseAuthCookieName(showcase.apiUrl, showcase), SHOWCASE_AUTH_COOKIE_NAME);
  assert.throws(() => supabaseAuthCookieOptions({ ...showcase, flag: undefined }), /explicit simulation/);
  assert.throws(() => supabaseAuthCookieName(showcase.apiUrl, { ...showcase, appUrl: normal.appUrl }), /verified local/);
  assert.throws(() => supabaseAuthCookieOptions({ ...normal, publicFlag: "true" }), /requires the verified/);
});
