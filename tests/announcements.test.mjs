import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canManageAnnouncements, parseAnnouncementInput, parseAnnouncementReceipts, parseMyAnnouncements, parsePublishedAnnouncements,
} from "../src/lib/announcements.ts";

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
function input(values = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    title: "Notice", body: "Message", scope: "department", department_id: id(1),
    acknowledgement: "required", request_id: id(2), confirm: "yes", ...values,
  })) form.set(key, value);
  return form;
}
const notice = {
  announcement_id: id(1), recipient_id: id(2), title: "Notice", body: "Plain text <script>test</script>",
  published_at: "2032-04-01T00:00:00Z", requires_acknowledgement: true,
  acknowledged_at: null, venue_id: id(3), department_id: id(4),
};

test("announcement publication validates exact fields, consent and actual length boundaries", () => {
  assert.ok(parseAnnouncementInput(input()));
  assert.ok(parseAnnouncementInput(input({ title: "x".repeat(120), body: "x".repeat(4000) })));
  for (const values of [
    { title: "x".repeat(121) }, { body: "x".repeat(4001) }, { title: " " }, { body: " " },
    { request_id: "invalid" }, { confirm: "no" }, { scope: "forged" }, { acknowledgement: "read" },
    { department_id: "" }, { scope: "venue" }, { scope: "business" },
  ]) assert.equal(parseAnnouncementInput(input(values)), null, JSON.stringify(values));
  const duplicate = input();
  duplicate.append("title", "Different");
  assert.equal(parseAnnouncementInput(duplicate), null);
  const venue = parseAnnouncementInput(input({ scope: "venue", department_id: "", acknowledgement: "optional" }));
  assert.equal(venue.departmentId, null);
  assert.equal(venue.requiresAcknowledgement, false);
  assert.ok(canManageAnnouncements("foh_manager"));
  assert.equal(canManageAnnouncements("employee"), false);
});

test("employee history validates source scope and acknowledgement state without interpreting text as markup", () => {
  assert.deepEqual(parseMyAnnouncements([notice]), [notice]);
  assert.deepEqual(parseMyAnnouncements([]), []);
  for (const row of [
    { ...notice, title: "" }, { ...notice, recipient_id: "invalid" }, { ...notice, venue_id: null },
    { ...notice, published_at: "invalid" }, { ...notice, acknowledged_at: "invalid" },
    { ...notice, requires_acknowledgement: false, acknowledged_at: notice.published_at },
  ]) assert.equal(parseMyAnnouncements([row]), null);
  assert.equal(parseMyAnnouncements([notice, notice]), null);
  assert.equal(parseMyAnnouncements(null), null);
});

test("manager tracking rejects malformed and inconsistent recipient/acknowledgement counts", () => {
  const published = {
    announcement_id: notice.announcement_id, title: notice.title, body: notice.body, published_at: notice.published_at,
    requires_acknowledgement: true, venue_id: null, department_id: null, recipient_count: 2, acknowledged_count: 1,
  };
  assert.deepEqual(parsePublishedAnnouncements([published]), [published]);
  for (const change of [
    { recipient_count: 0 }, { recipient_count: 1.5 }, { acknowledged_count: 3 },
    { acknowledged_count: -1 }, { department_id: id(2) }, { acknowledged_count: "1" },
    { requires_acknowledgement: false },
  ]) assert.equal(parsePublishedAnnouncements([{ ...published, ...change }]), null);
  assert.equal(parsePublishedAnnouncements([published, published]), null);
});

test("recipient receipts require identities and valid immutable acknowledgement timestamps", () => {
  const receipt = { recipient_id: id(1), employee_name: "Synthetic worker", acknowledged_at: null };
  assert.deepEqual(parseAnnouncementReceipts([receipt]), [receipt]);
  assert.equal(parseAnnouncementReceipts([{ ...receipt, employee_name: " " }]), null);
  assert.equal(parseAnnouncementReceipts([{ ...receipt, acknowledged_at: "invalid" }]), null);
  assert.equal(parseAnnouncementReceipts([receipt, receipt]), null);
  assert.equal(parseAnnouncementReceipts(null), null);
});
