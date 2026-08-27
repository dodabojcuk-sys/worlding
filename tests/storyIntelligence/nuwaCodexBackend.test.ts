import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const codexExecutable = fakeCodexExecutable("available", "codex");
  const controlledEnvironment = { PATH: path.dirname(codexExecutable) };
  const capabilities = discoverNuwaCodexCliCapabilities({ env: controlledEnvironment });
  assert.equal(capabilities.execAvailable, true);
  assert.equal(capabilities.executable, codexExecutable);
  assert.equal(capabilities.safeExperimentalPath, false);
  assert.match(capabilities.diagnostic, /EXPERIMENTALLY_UNSAFE/);
  const descriptor = listNuwaExecutionBackends({ env: controlledEnvironment }).find((item) => item.id === "codex-cli");
  assert.equal(descriptor?.availability, "unavailable");

  const workspacePath = copyWorkspace("Codex Disabled");
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远发现一条线索" });
  let processCalls = 0;
  const backend = createNuwaExecutionBackend({
    id: "codex-cli",
    env: { WORLD_OS_NUWA_CODEX_ENABLED: "1", WORLD_OS_NUWA_CODEX_PATH: codexExecutable, API_KEY: "must-not-pass" },
    executeCodex: async () => { processCalls += 1; return { exitCode: 0, stdout: "", stderr: "" }; }
  });
  const outcome = await executeNuwaPlanWithBackend({ plan, snapshot, backend });
  assert.equal(processCalls, 0);
  assert.equal(outcome.results.length, 0);
  assert.equal(outcome.executions.every((item) => item.status === "rejected"), true);
  assert.equal(outcome.missingRequiredRoles.length > 0, true);
});

test("Codex executable discovery is explicit-first, PATH-aware, and fail-closed for invalid configuration", () => {
  const explicit = fakeCodexExecutable("explicit");
  const configured = fakeCodexExecutable("configured");
  const onPath = fakeCodexExecutable("path", "codex");
  const pathEnvironment = { PATH: path.dirname(onPath), WORLD_OS_NUWA_CODEX_PATH: configured };

  assert.equal(discoverNuwaCodexCliCapabilities({ executable: explicit, env: pathEnvironment }).executable, explicit);
  assert.equal(discoverNuwaCodexCliCapabilities({ env: pathEnvironment }).executable, configured);
  assert.equal(discoverNuwaCodexCliCapabilities({ env: { PATH: path.dirname(onPath) } }).executable, onPath);

  const missing = path.join(path.dirname(explicit), "missing-codex");
  const nonExecutable = fakeCodexExecutable("non-executable", "codex-disabled", false);
  const directory = path.join(path.dirname(explicit), "codex-directory");
  mkdirSync(directory);
  for (const invalid of ["", missing, nonExecutable, directory]) {
    const capabilities = discoverNuwaCodexCliCapabilities({ executable: invalid, env: { PATH: path.dirname(onPath) } });
    assert.equal(capabilities.execAvailable, false);
    assert.equal(capabilities.executable, null);
    assert.match(capabilities.diagnostic, /empty, missing, or not executable/u);
  }

  const invalidConfigured = discoverNuwaCodexCliCapabilities({ env: { WORLD_OS_NUWA_CODEX_PATH: missing, PATH: path.dirname(onPath) } });
  assert.equal(invalidConfigured.execAvailable, false);
  assert.match(invalidConfigured.diagnostic, /WORLD_OS_NUWA_CODEX_PATH.*not executable/u);
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
  assert.match(source, /Applications\/ChatGPT\.app\/Contents\/Resources\/codex/u);
  assert.match(source, /usr\/lib\/chatgpt\/resources\/codex/u);
});

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function copyWorkspace(name: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-codex-security-"));
  const workspacePath = path.join(root, name);
  roots.push(root);
  cpSync(fixtureRoot, workspacePath, { recursive: true });
  return workspacePath;
}

function fakeCodexExecutable(name: string, filename = `codex-${name}`, executable = true): string {
  const root = mkdtempSync(path.join(tmpdir(), `nuwa-codex-executable-${name}-`));
  const target = path.join(root, filename);
  roots.push(root);
  writeFileSync(target, "#!/bin/sh\nexit 97\n", "utf8");
  chmodSync(target, executable ? 0o700 : 0o600);
  return target;
}
