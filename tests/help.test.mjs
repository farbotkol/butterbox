import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { helpAnchor, helpContentHref, helpHref, helpMarkdownOptions, helpTopics, searchHelp } from "../src/lib/help.ts";

const source = readFileSync(new URL("../docs/USER_GUIDE.md", import.meta.url), "utf8");

test("help derives supported task content from the maintained guide for every known role", () => {
  for (const role of ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager", "employee", "new_owner"]) {
    const topics = helpTopics(source, role, true);
    assert.ok(topics.length > 0);
    assert.equal(new Set(topics.map((topic) => topic.id)).size, topics.length);
    assert.ok(topics.every((topic) => topic.markdown.length > 0 && topic.anchors.includes(topic.anchor)));
  }
  assert.throws(() => helpTopics(source, "forged_owner"), /Unsupported help membership role/);
  assert.throws(() => helpTopics(source.replace("### Audit history", "### Removed audit history"), "owner"), /exactly one/);
});

test("help visibility is derived from effective roles, not a requested topic or search", () => {
  const employee = helpTopics(source, "employee");
  const manager = helpTopics(source, "foh_manager");
  const owner = helpTopics(source, "owner");
  for (const id of ["permissions", "people", "rosters", "timesheets", "payroll", "hours", "audit", "kiosk", "alerts"]) {
    assert.ok(!employee.some((topic) => topic.id === id), id);
    assert.ok(!searchHelp(employee, "").some((topic) => topic.id === id), id);
  }
  assert.ok(manager.some((topic) => topic.id === "timesheets"));
  for (const id of ["permissions", "payroll", "hours", "audit", "kiosk"]) {
    assert.ok(!manager.some((topic) => topic.id === id), id);
  }
  assert.ok(owner.some((topic) => topic.id === "payroll"));
  assert.ok(!owner.some((topic) => topic.id.startsWith("showcase-")));
  assert.ok(helpTopics(source, "owner", true).some((topic) => topic.id === "showcase-owner"));
  assert.ok(!helpTopics(source, "new_owner").some((topic) => topic.id === "people"));
});

test("help keyword and category search requires all terms and preserves empty and no-match states", () => {
  const topics = helpTopics(source, "owner");
  assert.equal(searchHelp(topics, "   ").length, topics.length);
  assert.ok(searchHelp(topics, "CSV RECONCILE").some((topic) => topic.id === "payroll"));
  assert.ok(searchHelp(topics, "break", "Attendance").every((topic) => topic.category === "Attendance"));
  assert.deepEqual(searchHelp(topics, "absent-keyword-93725"), []);
  assert.deepEqual(searchHelp(topics, "CSV", "Nonexistent category"), []);
});

test("help links retain business scope and allow only visible real guide anchors", () => {
  const owner = helpTopics(source, "owner", true);
  const employee = helpTopics(source, "employee", true);
  assert.equal(helpHref("payroll", "business id"), "/help?business=business+id&topic=payroll");
  assert.equal(helpContentHref("#timesheets-and-payroll-preparation", owner, "business"),
    "/help?business=business&topic=payroll#timesheets-and-payroll-preparation");
  assert.equal(helpContentHref("#timesheets-and-payroll-preparation", employee), null);
  for (const target of ["javascript:alert(1)", "data:text/html,test", "https://example.test", "//example.test",
    "../README.md", "/help?role=owner", "#missing-heading"]) {
    assert.equal(helpContentHref(target, owner), null, target);
  }
  assert.equal(helpAnchor("Hours and labour — owners"), "hours-and-labour--owners");
});

test("actual Markdown rendering controls exclude raw HTML, scripts, images and unsafe links but retain semantic tables", () => {
  const topics = helpTopics(source, "owner");
  const html = renderToStaticMarkup(createElement(Markdown, {
    ...helpMarkdownOptions(topics), remarkPlugins: [remarkGfm],
  }, '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n![tracker](https://example.test/image.png)\n\n[bad](javascript:alert%281%29)\n\n| Task | Result |\n| --- | --- |\n| Clock | Review |\n\n**Safe guidance**'));
  assert.doesNotMatch(html, /<script|<img|onerror=|href="(?:javascript|data|https?):/i);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Task<\/th>/);
  assert.match(html, /<strong>Safe guidance<\/strong>/);
});
