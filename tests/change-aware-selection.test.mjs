import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const selector = fileURLToPath(new URL("../scripts/select-change-aware-tests.mjs", import.meta.url));
function runScenario(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "butterbox-selection-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "CI selector test");
    writeFileSync(path.join(dir, "seed.txt"), "seed");
    git("add", ".");
    git("commit", "-qm", "initial");
    const base = git("rev-parse", "HEAD");
    for (const f of files) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), "changed");
    }
    git("add", ".");
    git("commit", "-qm", "change");
    return JSON.parse(execFileSync(process.execPath, [selector],
      {cwd: dir, encoding: "utf8", env: {...process.env, BASE_SHA: base, GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: ""}}));
  } finally { rmSync(dir, {recursive: true, force: true}); }
}
test("documentation-only PR does not run extra browser checks", () => {
  assert.equal(runScenario(["docs/example.md"]).mode, "none");
});
test("roster change selects roster and permission tests", () => {
  const result = runScenario(["src/app/roster/page.tsx"]);
  assert.equal(result.mode, "focused");
  assert.match(result.grep, /roster/);
  assert.match(result.grep, /permissions/);
});
test("database migration falls back to full regression", () => {
  assert.equal(runScenario(["supabase/migrations/20261114000000_foo.sql"]).mode, "full");
});
test("unclassified feature code falls back to full regression", () => {
  assert.equal(runScenario(["src/components/new-widget.tsx"]).mode, "full");
});
test("mixed documentation and permissions changes run relevant tests", () => {
  const result = runScenario(["docs/plan.md", "src/app/settings/permissions/page.tsx"]);
  assert.equal(result.mode, "focused");
  assert.match(result.grep, /permissions/);
});
