import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildStorySnapshot,
  createNuwaExecutionBackend,
  createNuwaPlan,
  discoverNuwaCodexCliCapabilities,
  executeNuwaPlanWithBackend,
  listNuwaExecutionBackends
} from "../../src/storyIntelligence/index.ts";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const roots: string[] = [];

test("Codex backend is experimentally unsafe and normal tests make zero process calls", async () => {
  const capabilities = discoverNuwaCodexCliCapabilities();
  assert.equal(capabilities.execAvailable, true);
  assert.equal(capabilities.safeExperimentalPath, false);
  assert.match(capabilities.diagnostic, /EXPERIMENTALLY_UNSAFE/);
  const descriptor = listNuwaExecutionBackends().find((item) => item.id === "codex-cli");
  assert.equal(descriptor?.availability, "unavailable");

  const workspacePath = copyWorkspace("Codex Disabled");
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远发现一条线索" });
  let processCalls = 0;
  const backend = createNuwaExecutionBackend({
    id: "codex-cli",
    env: { WORLD_OS_NUWA_CODEX_ENABLED: "1", API_KEY: "must-not-pass" },
    executeCodex: async () => { processCalls += 1; return { exitCode: 0, stdout: "", stderr: "" }; }
  });
  const outcome = await executeNuwaPlanWithBackend({ plan, snapshot, backend });
  assert.equal(processCalls, 0);
  assert.equal(outcome.results.length, 0);
  assert.equal(outcome.executions.every((item) => item.status === "rejected"), true);
  assert.equal(outcome.missingRequiredRoles.length > 0, true);
});

test("hostile goals and workspace paths remain inert while Codex process integration is disabled", async () => {
  const hostileGoals = [
    "test; rm -rf /",
    "$(touch /tmp/world-os-injected)",
    "`touch /tmp/world-os-backtick`",
    "goal\n--dangerous-flag"
  ];
  const workspaceNames = ["World OS Test", "女娲 测试", "story';touch injected;'"];
  let processCalls = 0;
  for (let index = 0; index < hostileGoals.length; index += 1) {
    const workspacePath = copyWorkspace(workspaceNames[index % workspaceNames.length]);
    const snapshot = buildStorySnapshot({ workspacePath });
    const plan = createNuwaPlan({ snapshot, authorGoal: hostileGoals[index] });
    const outcome = await executeNuwaPlanWithBackend({
      plan,
      snapshot,
      backend: createNuwaExecutionBackend({
        id: "codex-cli",
        env: { WORLD_OS_NUWA_CODEX_ENABLED: "1" },
        executeCodex: async () => { processCalls += 1; return { exitCode: 0, stdout: "", stderr: "" }; }
      })
    });
    assert.equal(outcome.results.length, 0);
    assert.equal(plan.authorGoal, hostileGoals[index].trim());
  }
  assert.equal(processCalls, 0);
  assert.equal(existsSync("/tmp/world-os-injected"), false);
  assert.equal(existsSync("/tmp/world-os-backtick"), false);
});

test("Codex backend source has no process launcher, shell execution, or parent environment forwarding", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "storyIntelligence", "nuwaExecutionBackend.ts"), "utf8");
  assert.doesNotMatch(source, /node:child_process|\bspawn\(|\bexec\(|shell\s*:\s*true/);
  assert.doesNotMatch(source, /process\.env\s*[,}]/);
  assert.match(source, /filesystem read isolation and an isolated authentication HOME are not proven/);
});

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function copyWorkspace(name: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-codex-security-"));
  const workspacePath = path.join(root, name);
  roots.push(root);
  cpSync(fixtureRoot, workspacePath, { recursive: true });
  return workspacePath;
}
