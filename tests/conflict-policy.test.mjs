import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConflictPolicy } from "../src/lib/conflict-policy.ts";

function policyForm() {
  const form = new FormData();
  form.set("manual_unavailability", "true");
  form.set("publish_unavailability", "false");
  form.set("publish_overlap", "true");
  form.set("publish_long_shift", "false");
  return form;
}

test("conflict policy parses each explicit venue setting", () => {
  assert.deepEqual(parseConflictPolicy(policyForm()), {
    manual_unavailability: true,
    publish_unavailability: false,
    publish_overlap: true,
    publish_long_shift: false,
  });
});

test("conflict policy rejects omitted, duplicated and malformed fields", () => {
  for (const field of [
    "manual_unavailability", "publish_unavailability", "publish_overlap", "publish_long_shift",
  ]) {
    const missing = policyForm();
    missing.delete(field);
    assert.equal(parseConflictPolicy(missing), null);
    const duplicate = policyForm();
    duplicate.append(field, "true");
    assert.equal(parseConflictPolicy(duplicate), null);
    const malformed = policyForm();
    malformed.set(field, "on");
    assert.equal(parseConflictPolicy(malformed), null);
    const file = policyForm();
    file.set(field, new Blob(["true"]), "flag.txt");
    assert.equal(parseConflictPolicy(file), null);
  }
});
