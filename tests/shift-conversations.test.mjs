import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  parseConversationContext, parseConversationMessages, parseConversationSummaries,
  parseShiftMessageInput, shiftConversationHref,
} from "../src/lib/shift-conversations.ts";

const business = "a0000000-0000-4000-8000-000000000001";
const venue = "a0000000-0000-4000-8000-000000000002";
const shift = "a0000000-0000-4000-8000-000000000003";
const department = "a0000000-0000-4000-8000-000000000009";
const employee = "a0000000-0000-4000-8000-000000000004";
const participant = "a0000000-0000-4000-8000-000000000005";
const conversation = "a0000000-0000-4000-8000-000000000006";
const request = "a0000000-0000-4000-8000-000000000007";
const message = "a0000000-0000-4000-8000-000000000008";
const timestamp = "2026-11-04T02:00:00.123456+00:00";

function context() {
  return {
    conversation_id: conversation, shift_id: shift, department_id: department, employee_id: employee,
    participant_user_id: participant,
    employee_name: "Worker", department_name: "FOH", role_title: "Server",
    starts_at: timestamp, ends_at: timestamp, shift_updated_at: timestamp, can_reply: true,
  };
}

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    business_id: business, venue_id: venue, shift_id: shift, department_id: department, employee_id: employee,
    participant_user_id: participant, shift_updated_at: timestamp, request_id: request, body: " Hello ",
  })) data.set(key, value);
  return data;
}

test("conversation links preserve business and venue context", () => {
  assert.equal(shiftConversationHref(business, venue), `/shift-conversations?business=${business}&venue=${venue}`);
  assert.equal(shiftConversationHref(business, venue, { shiftId: shift }),
    `/shift-conversations?business=${business}&venue=${venue}&shift=${shift}`);
  assert.equal(shiftConversationHref(business, venue, { conversationId: conversation }),
    `/shift-conversations?business=${business}&venue=${venue}&conversation=${conversation}`);
});

test("roster and schedule discussion links include their visible text in the accessible name", () => {
  for (const file of ["roster", "my-schedule"]) {
    const url = new URL(`../src/app/${file}/page.tsx`, import.meta.url);
    const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let links = 0;
    const visit = (node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Link") {
        const attributes = node.openingElement.attributes.properties.filter(ts.isJsxAttribute);
        const href = attributes.find((attribute) => attribute.name.getText(source) === "href")?.initializer;
        if (href && ts.isJsxExpression(href) && href.expression && ts.isCallExpression(href.expression) &&
            href.expression.expression.getText(source) === "shiftConversationHref" &&
            href.expression.arguments.length === 3) {
          links++;
          const visibleText = node.children.filter(ts.isJsxText).map((child) => child.text).join("").trim();
          assert.equal(visibleText, "Discuss shift", file);
          const label = attributes.find((attribute) => attribute.name.getText(source) === "aria-label")?.initializer;
          assert.ok(label && ts.isJsxExpression(label) && label.expression &&
            ts.isTemplateExpression(label.expression), `${file}: missing contextual accessible name`);
          assert.ok(label.expression.head.text.startsWith(`${visibleText} `),
            `${file}: accessible name must begin with the visible action before shift details`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(links, 1, `${file}: discussion entry point was not checked`);
  }
});

test("conversation context fails closed on malformed or incomplete responses", () => {
  assert.deepEqual(parseConversationContext([context()]), context());
  assert.equal(parseConversationContext([]), null);
  assert.equal(parseConversationContext([context(), context()]), null);
  for (const change of [
    { employee_id: "bad" }, { department_id: "bad" }, { starts_at: "invalid" }, { can_reply: "true" },
    { participant_user_id: null }, { conversation_id: "bad" },
  ]) assert.equal(parseConversationContext([{ ...context(), ...change }]), null);
  assert.ok(parseConversationContext([{ ...context(), conversation_id: null, participant_user_id: null, can_reply: false }]));
});

test("history summaries reject duplicates and malformed counts or timestamps", () => {
  const row = {
    conversation_id: conversation, shift_id: shift, employee_name: "Worker", department_name: "FOH",
    role_title: "Server", starts_at: timestamp, last_sent_at: timestamp, message_count: 2,
  };
  assert.deepEqual(parseConversationSummaries([row]), [row]);
  assert.equal(parseConversationSummaries([row, row]), null);
  for (const change of [{ message_count: 0 }, { message_count: 1.5 }, { last_sent_at: "bad" }]) {
    assert.equal(parseConversationSummaries([{ ...row, ...change }]), null);
  }
});

test("messages require unique, increasing order and known sender types", () => {
  const row = { message_id: message, sequence_id: 1, sender_kind: "manager", is_mine: false,
    body: "<script>plain text</script>", sent_at: timestamp };
  assert.deepEqual(parseConversationMessages([row]), [row]);
  assert.equal(parseConversationMessages([row, row]), null);
  assert.equal(parseConversationMessages([{ ...row, sequence_id: 2 }, { ...row, message_id: request }]), null);
  for (const change of [{ sender_kind: "system" }, { is_mine: "false" }, { body: "" }, { body: "x".repeat(2001) }]) {
    assert.equal(parseConversationMessages([{ ...row, ...change }]), null);
  }
});

test("message input validates a single scoped request and Unicode character limit", () => {
  const input = parseShiftMessageInput(form());
  assert.equal(input.body, "Hello");
  assert.equal(input.updatedAt, timestamp);
  for (const [key, value] of [["body", " \n\t"], ["body", "x".repeat(2001)], ["shift_id", "not-a-uuid"],
    ["participant_user_id", ""], ["department_id", ""], ["shift_updated_at", "invalid"]]) {
    const data = form();
    data.set(key, value);
    assert.equal(parseShiftMessageInput(data), null, key);
  }
  const duplicate = form();
  duplicate.append("request_id", request);
  assert.equal(parseShiftMessageInput(duplicate), null);
  const emoji = form();
  emoji.set("body", "🫖".repeat(2000));
  assert.equal(Array.from(parseShiftMessageInput(emoji).body).length, 2000);
});
