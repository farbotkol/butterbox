import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUSINESS_PREFERENCE_COOKIE, parseBusinessId, selectBusinessMembership, withBusiness,
} from "../src/lib/business-selection.ts";

const first = "b1000000-0000-4000-8000-000000000001";
const second = "b2000000-0000-4000-8000-000000000002";
const outside = "b3000000-0000-4000-8000-000000000003";
const memberships = [
  { business_id: first, role: "owner" },
  { business_id: second, role: "employee" },
];

test("business identifiers are optional, normalised and strictly validated", () => {
  assert.equal(BUSINESS_PREFERENCE_COOKIE, "bb_business");
  assert.equal(parseBusinessId(undefined), undefined);
  assert.equal(parseBusinessId(null), undefined);
  assert.equal(parseBusinessId(""), undefined);
  assert.equal(parseBusinessId(first.toUpperCase()), first);
  for (const invalid of ["invalid", `${first} `, `${first},${second}`, 42, [first], {}]) {
    assert.equal(parseBusinessId(invalid), null);
  }
});

test("explicit request context selects only a current membership", () => {
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [second] }),
    { kind: "selected", membership: memberships[1] });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [undefined, second.toUpperCase()] }),
    { kind: "selected", membership: memberships[1] });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [second, second] }),
    { kind: "selected", membership: memberships[1] });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [outside] }), { kind: "forbidden" });
  assert.deepEqual(selectBusinessMembership({ memberships: [], requested: [outside] }), { kind: "forbidden" });
});

test("explicit context outranks the preference and conflicting or invalid context fails closed", () => {
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [first], preference: second }),
    { kind: "selected", membership: memberships[0] });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [first, second] }), { kind: "forbidden" });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [null], preference: first }),
    { kind: "forbidden" });
  assert.deepEqual(selectBusinessMembership({ memberships: [memberships[0]], requested: [null] }),
    { kind: "forbidden" });
});

test("without explicit context only a single membership or a valid page preference is used", () => {
  assert.deepEqual(selectBusinessMembership({ memberships: [], requested: [] }), { kind: "none" });
  assert.deepEqual(selectBusinessMembership({ memberships: [memberships[1]], requested: [undefined] }),
    { kind: "selected", membership: memberships[1] });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [] }), { kind: "choose" });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [], preference: second }),
    { kind: "selected", membership: memberships[1] });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [], preference: outside }), { kind: "choose" });
  assert.deepEqual(selectBusinessMembership({ memberships, requested: [], preference: "invalid" }), { kind: "choose" });
});

test("business links keep existing query strings and fragments", () => {
  assert.equal(withBusiness("/", first), `/?business=${first}`);
  assert.equal(withBusiness("/people?error=filter", first), `/people?error=filter&business=${first}`);
  assert.equal(withBusiness("/settings/permissions#member", first), `/settings/permissions?business=${first}#member`);
});
