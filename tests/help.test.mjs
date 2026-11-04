import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ts from "typescript";
import { helpAnchor, helpContentHref, helpHref, helpMarkdownOptions, helpTopics, searchHelp } from "../src/lib/help.ts";

const source = readFileSync(new URL("../docs/USER_GUIDE.md", import.meta.url), "utf8");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

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

test("payroll help describes the focused mapping workflow and its permissions", () => {
  for (const role of ["owner", "admin", "general_manager"]) {
    const payroll = helpTopics(source, role).find((topic) => topic.id === "payroll");
    assert.ok(payroll, role);
    const markdown = payroll.markdown.replace(/\s+/g, " ").toLowerCase();
    for (const phrase of [
      "Only owners/admins can manage mappings", "Edit mapping", "Confirm and remove mapping",
      "provider adapters remain", "public and local showcases now use this updated mapping workflow",
    ]) assert.ok(markdown.includes(phrase.toLowerCase()), `${role}: ${phrase}`);
    assert.ok(!markdown.includes("showcase retains its earlier mapping screen"), role);
  }
});

test("attendance help uses the current clock navigation label", () => {
  const topics = helpTopics(source, "owner");
  for (const id of ["attendance", "alerts", "kiosk", "employee"]) {
    const topic = topics.find((candidate) => candidate.id === id);
    assert.ok(topic, id);
    assert.match(topic.markdown, /\*\*Clock in \/ out\*\*/, id);
  }
});

test("shift conversation help explains scope, retained messages and delivery limits", () => {
  for (const role of ["owner", "foh_manager", "employee"]) {
    const topic = helpTopics(source, role).find((candidate) => candidate.id === "shift-conversations");
    assert.ok(topic, role);
    for (const phrase of ["Discuss shift", "Conversation history", "cannot see the previous employee's messages",
      "no automatic conversation notifications", "not been deployed"]) {
      assert.ok(topic.markdown.replace(/\s+/g, " ").toLowerCase().includes(phrase.toLowerCase()), `${role}: ${phrase}`);
    }
  }
});

test("help visibility is derived from effective roles, not a requested topic or search", () => {
  const employee = helpTopics(source, "employee");
  const manager = helpTopics(source, "foh_manager");
  const owner = helpTopics(source, "owner");
  for (const id of ["permissions", "people", "rosters", "timesheets", "payroll", "hours", "exceptions", "audit", "kiosk", "alerts"]) {
    assert.ok(!employee.some((topic) => topic.id === id), id);
    assert.ok(!searchHelp(employee, "").some((topic) => topic.id === id), id);
  }
  assert.ok(manager.some((topic) => topic.id === "timesheets"));
  assert.ok(manager.some((topic) => topic.id === "exceptions"));
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

test("manager roster help includes the actual display filter and optional shortcuts", () => {
  const topics = helpTopics(source, "foh_manager");
  const roster = topics.find((topic) => topic.id === "rosters");
  assert.ok(roster);
  assert.match(roster.markdown, /Search changes the display only;/);
  assert.match(roster.markdown, /Alt\+Shift\+Left\/Right/);
  assert.match(roster.markdown, /Confirm deletion/);
  assert.ok(searchHelp(topics, "roster shortcuts").some((topic) => topic.id === "rosters"));
});

test("People help describes the directory, focused editing and lifecycle controls", () => {
  const people = helpTopics(source, "foh_manager").find((topic) => topic.id === "people");
  assert.ok(people);
  for (const label of ["Your people", "View profile", "Add person", "Edit overview",
    "Discard changes", "Archive person", "Reactivate person", "Manage invitation"]) {
    assert.ok(people.markdown.includes(label), label);
  }
  assert.match(people.markdown, /An owner can choose \*\*Edit account link\*\*/);
  assert.match(people.markdown, /public showcase does not\s+send invitations/);
});

test("department help describes scoped details, restrictions and showcase availability", () => {
  const people = helpTopics(source, "foh_manager").find((topic) => topic.id === "people");
  assert.ok(people);
  assert.ok(people.anchors.includes("departments-and-roles"));
  for (const label of ["Show departments", "Edit department details", "Create role",
    "Deactivate role", "Save automatic assignment", "Save manual assignment"]) {
    assert.ok(people.markdown.includes(label), label);
  }
  assert.match(people.markdown, /public and local showcases now use this updated department\s+directory/);
  assert.doesNotMatch(people.markdown, /showcase retains its earlier department screen/);
});

test("owner permissions help describes focused changes and showcase availability", () => {
  const permissions = helpTopics(source, "owner").find((topic) => topic.id === "permissions");
  assert.ok(permissions);
  for (const label of ["View access", "Edit permissions", "Review change",
    "Current access", "New access", "Confirm and save permissions", "Discard changes"]) {
    assert.ok(permissions.markdown.replace(/\s+/g, " ").includes(label), label);
  }
  assert.match(permissions.markdown, /Only owners can inspect and manage this directory/);
  assert.match(permissions.markdown, /public and local showcases now use this updated permissions\s+directory/);
  assert.doesNotMatch(permissions.markdown, /showcase retains its earlier permissions screen/);
});

test("showcase help describes the deployed navigation and owner walkthrough", () => {
  const owner = helpTopics(source, "owner", true).find((topic) => topic.id === "showcase-owner");
  const employee = helpTopics(source, "employee", true).find((topic) => topic.id === "employee");
  assert.ok(owner);
  assert.ok(employee);
  assert.match(owner.markdown, /\*\*Departments & roles\*\* under \*\*Venue Management\*\*/);
  assert.match(employee.markdown, /public and local showcases now use this navigation/);
  assert.doesNotMatch(employee.markdown, /showcase retains its older navigation/);
});

test("help links retain business scope and allow only visible real guide anchors", () => {
  const owner = helpTopics(source, "owner", true);
  const employee = helpTopics(source, "employee", true);
  assert.equal(helpHref("payroll", "business id"), "/help?business=business+id&topic=payroll");
  assert.equal(helpHref("payroll", "business id", "venue id"),
    "/help?business=business+id&contextVenue=venue+id&topic=payroll");
  assert.equal(helpContentHref("#timesheets-and-payroll-preparation", owner, "business", "venue"),
    "/help?business=business&contextVenue=venue&topic=payroll#timesheets-and-payroll-preparation");
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

test("canonical guide Markdown file references and heading anchors resolve", () => {
  for (const [, href] of source.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    if (/^https?:\/\//.test(href)) continue;
    const [relative, fragment] = href.split("#");
    const target = relative ? path.resolve(root, "docs", relative) : path.join(root, "docs/USER_GUIDE.md");
    assert.ok(target.startsWith(`${root}${path.sep}`), href);
    assert.ok(existsSync(target), href);
    if (fragment) {
      const content = readFileSync(target, "utf8");
      const anchors = [...content.matchAll(/^#{1,6} (.+)$/gm)].map((match) => helpAnchor(match[1]));
      assert.ok(anchors.includes(fragment), href);
    }
  }
});

test("core contextual help destinations and documented screen/link labels stay wired", () => {
  const screens = [
    ["src/app/setup/page.tsx", "Set up your workspace", "Help with workspace setup"],
    ["src/app/people/page.tsx", "Your people", "Help with managing people"],
    ["src/app/people/[employeeId]/page.tsx", "Help with managing people"],
    ["src/app/settings/departments/page.tsx", "Departments and roles", "Department help"],
    ["src/app/settings/permissions/page.tsx", "Business permissions", "Help with permissions"],
    ["src/app/settings/permissions/[userId]/page.tsx", "Help with permissions"],
    ["src/components/onboarding-checklist.tsx", "Get your first roster ready", "Help with your first roster"],
    ["src/app/roster/page.tsx", "Weekly roster", "Help with rosters"],
    ["src/app/my-schedule/page.tsx", "My schedule", "Help with your schedule"],
    ["src/app/attendance/page.tsx", "Clock in / out", "Help with clocking and corrections"],
    ["src/app/timesheets/page.tsx", "Weekly timesheet review", "Help with timesheet review", "Help with payroll CSV"],
    ["src/app/settings/payroll/page.tsx", "Payroll employee mapping", "Help with payroll preparation"],
    ["src/app/settings/payroll/[employeeId]/page.tsx", "Help with payroll preparation"],
    ["src/app/settings/payroll/new/page.tsx", "Help with payroll preparation"],
    ["src/app/announcements/page.tsx", "Announcements", "Help with announcements"],
    ["src/components/future-vision-preview.tsx", "Help with future concepts"],
    ["src/app/shift-conversations/page.tsx", "Help with shift conversations"],
  ];
  const topics = [...helpTopics(source, "owner"), ...helpTopics(source, "new_owner")];
  for (const [file, ...labels] of screens) {
    const code = readFileSync(path.join(root, file), "utf8");
    const syntax = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let links = 0;
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "helpHref") {
        links++;
        const checkTopic = (argument) => {
          if (ts.isStringLiteral(argument)) {
            assert.ok(topics.some((topic) => topic.id === argument.text), `${file}: ${argument.text}`);
          } else if (ts.isConditionalExpression(argument)) {
            checkTopic(argument.whenTrue);
            checkTopic(argument.whenFalse);
          } else {
            assert.fail(`${file}: contextual topic must be a reviewed literal or role conditional`);
          }
        };
        checkTopic(node.arguments[0]);
        if (file.includes("/setup/")) {
          assert.equal(node.arguments.length, 1, `${file}: setup has no selected workspace`);
        } else {
          assert.equal(node.arguments.length, 3, `${file}: missing business or venue context`);
          assert.match(node.arguments[1].getText(syntax), /^(?:businessId|workspace\.business\.id)$/);
          assert.match(node.arguments[2].getText(syntax), /^(?:venueId|workspace\.venue\.id)$/);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(syntax);
    assert.ok(links > 0, `${file}: no contextual help link`);
    for (const label of labels) {
      assert.ok(code.includes(label), `${file}: stale documented label "${label}"`);
      assert.ok(source.includes(label), `guide: missing "${label}"`);
    }
  }
});

test("guide review history and documentation Definition of Done remain explicit", () => {
  const version = /\*\*Guide version:\*\* ([\d.]+) — reviewed (\d{4}-\d{2}-\d{2})/.exec(source);
  assert.ok(version, "missing guide version and actual review date");
  assert.ok(source.includes(`| ${version[1]} | ${version[2]} |`), "current review missing from history");
  const instructions = readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(instructions, /accurate user documentation.*story completion requirement/);
  assert.match(source, /human review remains necessary/);
  assert.match(source, /No actual UI screenshots or optional AI help are available/);
});
