import assert from "node:assert/strict";
import { test } from "node:test";
import { showcaseMode } from "../src/lib/showcase.ts";

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
