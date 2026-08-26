import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildNuwaTaskContextPack,
  buildStorySnapshot,
  createNuwaExecutionBackend,
  createNuwaPlan,
  createNuwaRunPack,
  executeNuwaPlanWithBackend,
  getNuwaSynthesisReadiness,
  importNuwaResultFile,
  readNuwaBackendManifest,
  readNuwaRunPack,
  runDeterministicNuwaPlan,
  runDeterministicNuwaTask,
  sanitizeDiagnostic,
  synthesizeNuwaResults,
  writeNuwaExecutionOutcome,
  writeNuwaResults,
  type NuwaAgentExecutionBackend,
  type NuwaAgentResult
} from "../../src/storyIntelligence/index.ts";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const roots: string[] = [];

test("one backend interface keeps deterministic output bounded and accepted before caching", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远向阿岚透露部分秘密，但保留核心悬念" });
  const context = buildNuwaTaskContextPack({ plan, snapshot, task: plan.tasks[0] });
  const contextText = JSON.stringify(context);
  assert.equal(context.allowedNotes.every((note) => plan.tasks[0].allowedNoteRefs.includes(note.relativePath)), true);
  for (const forbidden of [".git/", "node_modules", ".env", "BEGIN OPENSSH", "browser cookies", "process.env"]) {
    assert.equal(contextText.includes(forbidden), false, forbidden);
  }

  createNuwaRunPack({ workspacePath, plan, snapshot });
  const first = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend(), profile: "balanced" });
  assert.equal(first.results.length, plan.tasks.length);
  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome: first });
  const manifest = readNuwaBackendManifest(workspacePath, plan.runId);
  assert.equal(manifest.executions.every((item) => item.status === "accepted-by-nuwa"), true);
  assert.equal(Object.keys(manifest.cache).length, plan.tasks.length);
  assert.equal(Object.values(manifest.cache).every((entry) => entry.validationStatus === "accepted-by-nuwa"), true);

  const cached = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend(), profile: "balanced", cachedResults: manifest.cache });
  assert.equal(cached.executions.every((item) => item.status === "accepted-by-nuwa" && item.cacheHit), true);
});

test("cache identity cannot cross profile, model identity, schema metadata, or stale context", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让地下室秘密保持为未解线索" });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const first = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend(), profile: "balanced" });
  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome: first });
  const manifest = readNuwaBackendManifest(workspacePath, plan.runId);

  const economy = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend(), profile: "economy", cachedResults: manifest.cache });
  assert.equal(economy.executions.some((item) => item.cacheHit), false);

  const differentModel = createNuwaExecutionBackend();
  differentModel.descriptor = { ...differentModel.descriptor, modelIdentity: "different-model" };
  const modelRun = await executeNuwaPlanWithBackend({ plan, snapshot, backend: differentModel, profile: "balanced", cachedResults: manifest.cache });
  assert.equal(modelRun.executions.some((item) => item.cacheHit), false);

  const tampered = structuredClone(manifest.cache);
  const entry = Object.values(tampered)[0];
  entry.identity.resultSchemaVersion = "world-os-nuwa-agent-result-v1";
  entry.identity.instructionVersion = "world-os-nuwa-specialist-instruction-v1";
  entry.cacheKey = "collision";
  const collision = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend(), profile: "balanced", cachedResults: { [Object.keys(manifest.cache)[0]]: entry } });
  assert.equal(collision.executions.some((item) => item.cacheHit), false);

  const changedSnapshot = structuredClone(snapshot);
  changedSnapshot.snapshotHash = "stale-snapshot";
  await assert.rejects(() => executeNuwaPlanWithBackend({ plan, snapshot: changedSnapshot, backend: createNuwaExecutionBackend(), cachedResults: manifest.cache }), /plan snapshot/i);
});

test("invalid results are rejected, never cached, and cannot enter synthesis", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远发现一条线索" });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const invalidBackend = fakeBackend(async (task) => {
    const result = runDeterministicNuwaTask({ plan, snapshot, task });
    result.evidence[0].relativePath = "../outside.md";
    return result;
  });
  const outcome = await executeNuwaPlanWithBackend({ plan, snapshot, backend: invalidBackend });
  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome });
  const manifest = readNuwaBackendManifest(workspacePath, plan.runId);
  assert.equal(Object.keys(manifest.cache).length, 0);
  assert.equal(manifest.executions.every((item) => item.status === "rejected"), true);
  assert.equal(readNuwaRunPack(workspacePath, plan.runId).results.length, 0);
  assert.throws(() => synthesizeNuwaResults({ plan, snapshot, results: [] }), /requires validated results/i);
});

test("required results block synthesis while missing optional results create marked partial coverage", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远向阿岚透露部分秘密" });
  const results = runDeterministicNuwaPlan({ plan, snapshot });
  const requiredRoles = new Set(plan.tasks.filter((task) => task.requirement === "required").map((task) => task.role));
  const requiredResults = results.filter((result) => requiredRoles.has(result.role));
  const partial = synthesizeNuwaResults({ plan, snapshot, results: requiredResults });
  assert.equal(partial.coverage.completeness, "partial");
  assert.equal(partial.coverage.missingOptionalRoles.length > 0, true);
  assert.throws(() => synthesizeNuwaResults({ plan, snapshot, results: results.filter((result) => !requiredRoles.has(result.role)) }), /requires validated results/i);
});

test("external imports are path bounded, size limited, non-symlink, strict, and not cacheable", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让地下室秘密保持为未解线索" });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const runPath = path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId);
  const importsPath = path.join(runPath, "backend", "imports");
  const result = runDeterministicNuwaPlan({ plan, snapshot })[0];
  const validPath = path.join(importsPath, "valid.json");
  writeFileSync(validPath, JSON.stringify(result));
  importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: validPath });
  assert.equal(getNuwaSynthesisReadiness(workspacePath, plan.runId).validatedResultCount, 1);
  assert.equal(Object.keys(readNuwaBackendManifest(workspacePath, plan.runId).cache).length, 0);

  const outside = path.join(workspacePath, "outside.json");
  writeFileSync(outside, JSON.stringify(result));
  assert.throws(() => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: outside }), /inside the run/);
  assert.throws(() => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: "../outside.json" }), /inside the run/);

  const link = path.join(importsPath, "link.json");
  symlinkSync(outside, link);
  assert.throws(() => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: link }), /non-symlink/);

  const oversized = path.join(importsPath, "oversized.json");
  writeFileSync(oversized, "x".repeat(256 * 1024 + 1));
  assert.throws(() => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: oversized }), /256 KiB/);

  const unexpected = path.join(importsPath, "unexpected.json");
  writeFileSync(unexpected, JSON.stringify({ ...result, execute: "touch /tmp/nope" }));
  assert.throws(() => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: unexpected }), /unexpected executable/);

  const polluted = path.join(importsPath, "polluted.json");
  writeFileSync(polluted, JSON.stringify(result).replace('"version"', '"__proto__":{"polluted":true},"version"'));
  assert.throws(() => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: polluted }), /forbidden object key/);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);

  const secondResult = runDeterministicNuwaPlan({ plan, snapshot })[1];
  const outsideTarget = path.join(workspacePath, "outside-target.json");
  writeFileSync(outsideTarget, "unchanged");
  const resultTemporaryPath = path.join(runPath, "results", `${secondResult.taskId}.json.tmp`);
  symlinkSync(outsideTarget, resultTemporaryPath);
  assert.throws(
    () => writeNuwaResults({ workspacePath, runId: plan.runId, results: [secondResult] }),
    /temporary path must not be a symbolic link/
  );
  assert.equal(readFileSync(outsideTarget, "utf8"), "unchanged");

  const escapedImports = path.join(workspacePath, "escaped-imports");
  rmSync(importsPath, { recursive: true, force: true });
  mkdirSync(escapedImports);
  writeFileSync(path.join(escapedImports, "escaped.json"), JSON.stringify(result));
  symlinkSync(escapedImports, importsPath);
  assert.throws(
    () => importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: path.join(importsPath, "escaped.json") }),
    /inside the run|outside the workspace run directory/
  );

  const escapedWorkspace = copyWorkspace();
  const escapedSnapshot = buildStorySnapshot({ workspacePath: escapedWorkspace });
  const escapedPlan = createNuwaPlan({ snapshot: escapedSnapshot, authorGoal: "保持秘密" });
  createNuwaRunPack({ workspacePath: escapedWorkspace, plan: escapedPlan, snapshot: escapedSnapshot });
  const escapedRunPath = path.join(escapedWorkspace, ".world-os", "runs", "nuwa", escapedPlan.runId);
  const escapedResults = path.join(escapedWorkspace, "escaped-results");
  rmSync(path.join(escapedRunPath, "results"), { recursive: true, force: true });
  mkdirSync(escapedResults);
  symlinkSync(escapedResults, path.join(escapedRunPath, "results"));
  assert.throws(
    () => writeNuwaResults({
      workspacePath: escapedWorkspace,
      runId: escapedPlan.runId,
      results: [runDeterministicNuwaPlan({ plan: escapedPlan, snapshot: escapedSnapshot })[0]]
    }),
    /outside the workspace run directory/
  );
  assert.deepEqual(readdirSync(escapedResults), []);
});

test("retry, timeout, cancellation, and concurrency are bounded with no silent fallback", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让第五章变化影响后续关系" });
  let attempts = 0;
  const rejecting = fakeBackend(async () => { attempts += 1; throw new Error("token=secret-value\nbackend failed"); });
  const rejected = await executeNuwaPlanWithBackend({ plan, snapshot, backend: rejecting, profile: "balanced", taskTimeoutMs: 100 });
  assert.equal(attempts, plan.tasks.length * 2);
  assert.equal(rejected.results.length, 0);
  assert.equal(rejected.executions.every((item) => item.status === "rejected" && item.attempts === 2), true);

  const never = fakeBackend(async () => new Promise<NuwaAgentResult>(() => {}));
  const timedOut = await executeNuwaPlanWithBackend({ plan, snapshot, backend: never, profile: "economy", taskTimeoutMs: 5 });
  assert.equal(timedOut.executions.every((item) => item.status === "rejected" && item.diagnostic === "Backend task timed out."), true);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend(), signal: controller.signal });
  assert.equal(cancelled.executions.every((item) => item.status === "cancelled"), true);

  let active = 0;
  let peak = 0;
  const bounded = fakeBackend(async (task) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    return runDeterministicNuwaTask({ plan, snapshot, task });
  });
  await executeNuwaPlanWithBackend({ plan, snapshot, backend: bounded, profile: "balanced" });
  assert.equal(peak <= 2, true);
});

test("event diagnostics are sanitized and malformed final JSONL lines recover safely", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远发现一条线索" });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const eventsPath = path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId, "events.jsonl");
  writeFileSync(eventsPath, '{"valid":true}\n{"broken"');
  const outcome = await executeNuwaPlanWithBackend({ plan, snapshot, backend: fakeBackend(async () => { throw new Error("API_KEY=top-secret\n/Users/private-user/story"); }) });
  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome });
  const eventText = readFileSync(eventsPath, "utf8");
  assert.doesNotMatch(eventText, /top-secret|private-user|\{"broken"/);
  assert.match(eventText, /redacted|backend-selected/);
  for (const line of eventText.trim().split("\n")) assert.doesNotThrow(() => JSON.parse(line));
  assert.equal(sanitizeDiagnostic("access_token=abc /Users/tester/x"), "redacted ~/x");
});

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function fakeBackend(run: (task: ReturnType<typeof createNuwaPlan>["tasks"][number]) => Promise<NuwaAgentResult>): NuwaAgentExecutionBackend {
  return {
    descriptor: {
      id: "deterministic",
      label: "Fake bounded backend",
      availability: "available",
      optInRequired: false,
      remoteExecution: false,
      supportsExport: false,
      implementationVersion: "fake-v1",
      modelIdentity: "fake-model"
    },
    async executeTask(input) {
      try {
        const result = await run(input.task);
        return {
          taskId: input.task.taskId,
          role: input.task.role,
          status: "result-produced",
          taskHash: input.context.taskHash,
          result,
          attempts: 1,
          requirement: input.task.requirement,
          cacheHit: false,
          validationStatus: "pending"
        };
      } catch (error) {
        return {
          taskId: input.task.taskId,
          role: input.task.role,
          status: "rejected",
          taskHash: input.context.taskHash,
          diagnostic: sanitizeDiagnostic(error instanceof Error ? error.message : String(error)),
          attempts: 1,
          requirement: input.task.requirement,
          cacheHit: false,
          validationStatus: "rejected"
        };
      }
    }
  };
}

function copyWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-backend-security-"));
  roots.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  mkdirSync(path.join(root, ".world-os"), { recursive: true });
  return root;
}
