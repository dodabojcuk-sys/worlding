import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildStorySnapshot,
  createNuwaPlan,
  createNuwaRunPack,
  runDeterministicNuwaPlan,
  stableJson,
  synthesizeNuwaResults,
  writeNuwaPredictionBundle,
  type StoryPredictionBundle
} from "../../src/storyIntelligence/index.ts";
import { rebuildWorkspaceIndex, updateWorkspaceState } from "../../src/storyWorkspace/index.mjs";

const WORKER = path.join(process.cwd(), "tests", "fixtures", "nuwaPredictionBundleRaceWorker.ts");
const FIXTURE_ROOT = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const SELECTED_SCENE = "scenes/03-02-告知边界.md";

type WorkerResult = {
  ok: boolean;
  runId?: string;
  status?: string;
  authorGoal?: string | null;
  bundleSha256?: string;
  publication?: "created" | "exists";
  message?: string;
  workerId?: string;
  attemptId?: string;
  targetDirectory?: string;
  localSequence?: number;
  eventType?: string;
};

type AtomicWorkerCompletion = {
  result: WorkerResult;
  events: WorkerResult[];
};

test("C0: an EEXIST contender confirms directory durability while the creator is blocked after link", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "atomic-eexist-durability-"));
  try {
    const reportPath = path.join(root, "report");
    const targetPath = path.join(reportPath, "prediction-bundle.json");
    const contentPath = path.join(root, "candidate.bin");
    const expectedBytes = Buffer.from("{\"candidate\":\"complete\"}\n", "utf8");
    mkdirSync(reportPath, { recursive: true });
    writeFileSync(contentPath, expectedBytes);

    const first = startAtomicPublisher(root, targetPath, contentPath, true, "worker-a", "attempt-a");
    await first.temporaryDurable;
    assert.equal(existsSync(targetPath), false, "partial final visibility must remain zero before link");

    first.child.stdin.write("GO_LINK\n");
    await first.finalPublished;
    assert.deepEqual(readFileSync(targetPath), expectedBytes, "link must expose only complete staged bytes");

    const second = startAtomicPublisher(root, targetPath, contentPath, false, "worker-b", "attempt-b");
    const secondCompletion = await second.completed;
    assert.equal(first.child.exitCode, null, "creator must still be blocked before its own directory fsync");
    assert.deepEqual(readFileSync(targetPath), expectedBytes, "the loser must not overwrite winner bytes");
    assert.equal(stagingFiles(reportPath).length, 1, "only the blocked creator may retain its own staging link");

    first.child.stdin.write("GO_FSYNC\n");
    const firstCompletion = await first.completed;
    const completions = [firstCompletion, secondCompletion];
    const winners = completions.filter(({ result }) => result.publication === "created");
    const losers = completions.filter(({ result }) => result.publication === "exists");
    assert.equal(winners.length, 1, JSON.stringify(completions));
    assert.equal(losers.length, 1, JSON.stringify(completions));

    const loser = losers[0];
    const expectedTargetDirectory = realpathSync(path.dirname(targetPath));
    const entered = loser.events.find((event) => event.eventType === "directory_fsync_entered");
    const completed = loser.events.find((event) => event.eventType === "directory_fsync_completed");
    const result = loser.events.find((event) => event.eventType === "result");
    assert.ok(completed, "loser must emit directory_fsync_completed before result");
    assert.ok(entered, "loser must emit directory_fsync_entered");
    assert.ok(result, "loser must emit result");
    assert.equal(completed.workerId, loser.result.workerId);
    assert.equal(completed.attemptId, loser.result.attemptId);
    assert.equal(completed.targetDirectory, expectedTargetDirectory);
    assert.equal(result.targetDirectory, expectedTargetDirectory);
    assert.ok((entered.localSequence ?? Infinity) < (completed.localSequence ?? -Infinity));
    assert.ok((completed.localSequence ?? Infinity) < (result.localSequence ?? -Infinity));
    assert.deepEqual(readFileSync(targetPath), expectedBytes);
    assertNoStagingFiles(reportPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C1: same-content cross-process publication is content-idempotent and restart-stable", async () => {
  const fixture = createFixture("same-content");
  try {
    const firstPath = writeBundleInput(fixture.root, "first", fixture.bundle);
    const secondPath = writeBundleInput(fixture.root, "second", fixture.bundle);
    const first = startPublisher(fixture.workspacePath, fixture.runId, firstPath);
    const second = startPublisher(fixture.workspacePath, fixture.runId, secondPath);

    await Promise.all([first.ready, second.ready]);
    assert.equal(existsSync(fixture.targetPath), false, "the final path must remain absent before publication");
    first.child.stdin.write("GO\n");
    second.child.stdin.write("GO\n");
    const results = await Promise.all([first.completed, second.completed]);

    assert.equal(results.every((result) => result.ok), true, JSON.stringify(results));
    assert.deepEqual(results.map((result) => result.runId), [fixture.runId, fixture.runId]);
    assert.equal(readFileSync(fixture.targetPath, "utf8"), `${stableJson(fixture.bundle)}\n`);
    assertNoStagingFiles(fixture.reportPath);

    const restarted = inspectInFreshProcess(fixture);
    assert.equal(restarted.ok, true, restarted.message);
    assert.equal(restarted.runId, fixture.runId);
    assert.equal(restarted.status, "ready-for-author-review");
    assert.equal(restarted.authorGoal, fixture.bundle.authorGoal);
    assert.equal(restarted.bundleSha256, sha256(readFileSync(fixture.targetPath)));
  } finally {
    fixture.cleanup();
  }
});

test("C2: different-content cross-process publication keeps one immutable winner and fails the loser closed", async () => {
  const fixture = createFixture("different-content");
  try {
    const alternate = { ...fixture.bundle, authorGoal: `${fixture.bundle.authorGoal} (alternate)` };
    const firstPath = writeBundleInput(fixture.root, "first", fixture.bundle);
    const secondPath = writeBundleInput(fixture.root, "second", alternate);
    const first = startPublisher(fixture.workspacePath, fixture.runId, firstPath);
    const second = startPublisher(fixture.workspacePath, fixture.runId, secondPath);

    await Promise.all([first.ready, second.ready]);
    assert.equal(existsSync(fixture.targetPath), false, "the final path must remain absent before publication");
    first.child.stdin.write("GO\n");
    second.child.stdin.write("GO\n");
    const results = await Promise.all([first.completed, second.completed]);
    const winners = results.filter((result) => result.ok);
    const losers = results.filter((result) => !result.ok);

    assert.equal(winners.length, 1, JSON.stringify(results));
    assert.equal(losers.length, 1, JSON.stringify(results));
    assert.match(losers[0].message ?? "", /different content/i);
    const winnerBundle = winners[0].authorGoal === fixture.bundle.authorGoal ? fixture.bundle : alternate;
    const winnerBytes = `${stableJson(winnerBundle)}\n`;
    assert.equal(readFileSync(fixture.targetPath, "utf8"), winnerBytes);
    assertNoStagingFiles(fixture.reportPath);

    const restarted = inspectInFreshProcess(fixture);
    assert.equal(restarted.ok, true, restarted.message);
    assert.equal(restarted.authorGoal, winnerBundle.authorGoal);
    assert.equal(restarted.bundleSha256, sha256(Buffer.from(winnerBytes)));
    assert.equal(readFileSync(fixture.targetPath, "utf8"), winnerBytes, "the loser must never replace winner bytes");
  } finally {
    fixture.cleanup();
  }
});

test("C3: byte-identical existing bundle returns the existing run identity", () => {
  const fixture = createFixture("byte-identical");
  try {
    const expectedBytes = Buffer.from(`${stableJson(fixture.bundle)}\n`, "utf8");
    writeFileSync(fixture.targetPath, expectedBytes);
    const record = writeNuwaPredictionBundle({
      workspacePath: fixture.workspacePath,
      runId: fixture.runId,
      bundle: fixture.bundle
    });
    assert.equal(record.runId, fixture.runId);
    assert.deepEqual(readFileSync(fixture.targetPath), expectedBytes);
    assertNoStagingFiles(fixture.reportPath);
  } finally {
    fixture.cleanup();
  }
});

test("C4: semantic-equivalent pretty JSON with different whitespace fails closed", () => {
  assertByteVariantFails("pretty-whitespace", (bundle) => `${JSON.stringify(bundle, null, 2)}\n`);
});

test("C5: semantic-equivalent JSON with different key order fails closed", () => {
  assertByteVariantFails("key-order", (bundle) => {
    const reversed = Object.fromEntries(Object.entries(bundle).reverse());
    return `${JSON.stringify(reversed)}\n`;
  });
});

test("C6: semantic-equivalent JSON with an additional trailing newline fails closed", () => {
  assertByteVariantFails("extra-newline", (bundle) => `${stableJson(bundle)}\n\n`);
});

function createFixture(suffix: string) {
  const root = mkdtempSync(path.join(tmpdir(), `nuwa-bundle-race-${suffix}-`));
  const workspacePath = path.join(root, "workspace");
  cpSync(FIXTURE_ROOT, workspacePath, { recursive: true });
  for (const directory of ["world/events", "planning", "reviews", ".world-os/cache", ".world-os/locks", ".world-os/runs"]) {
    mkdirSync(path.join(workspacePath, directory), { recursive: true });
  }
  rebuildWorkspaceIndex(workspacePath);
  updateWorkspaceState(workspacePath, {
    currentChapterPath: "chapters/03-潜入灯塔.md",
    currentScenePath: SELECTED_SCENE
  });
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: `Atomic candidate publication ${suffix}` });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const results = runDeterministicNuwaPlan({ plan, snapshot });
  const bundle = synthesizeNuwaResults({ plan, snapshot, results });
  const reportPath = path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId, "report");
  const targetPath = path.join(reportPath, "prediction-bundle.json");
  return {
    root,
    workspacePath,
    runId: plan.runId,
    bundle,
    reportPath,
    targetPath,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function writeBundleInput(root: string, label: string, bundle: StoryPredictionBundle): string {
  const target = path.join(root, `${label}-bundle.json`);
  writeFileSync(target, JSON.stringify(bundle), "utf8");
  return target;
}

function startPublisher(workspacePath: string, runId: string, bundlePath: string) {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    WORKER,
    "publish",
    workspacePath,
    runId,
    bundlePath
  ], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.includes("READY\n")) resolveReady();
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completed = new Promise<WorkerResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code !== 0) {
        reject(new Error(`Nuwa bundle worker failed: code=${code} signal=${signal} ${stderr}`));
        return;
      }
      resolve(parseLastJson(stdout));
    });
  });
  return { child: child as ChildProcessWithoutNullStreams, ready, completed };
}

function startAtomicPublisher(
  rootPath: string,
  targetPath: string,
  contentPath: string,
  blockBoundaries: boolean,
  workerId: string,
  attemptId: string
) {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    WORKER,
    "atomic-publish",
    rootPath,
    targetPath,
    contentPath,
    blockBoundaries ? "block-boundaries" : "observe-only",
    workerId,
    attemptId
  ], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let resolveTemporaryDurable!: () => void;
  let resolveFinalPublished!: () => void;
  const temporaryDurable = new Promise<void>((resolve) => { resolveTemporaryDurable = resolve; });
  const finalPublished = new Promise<void>((resolve) => { resolveFinalPublished = resolve; });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.includes('"eventType":"temporary_durable"')) resolveTemporaryDurable();
    if (stdout.includes('"eventType":"final_published"')) resolveFinalPublished();
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completed = new Promise<AtomicWorkerCompletion>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code !== 0) {
        reject(new Error(`Atomic publication worker failed: code=${code} signal=${signal} ${stderr}`));
        return;
      }
      const events = parseJsonLines(stdout);
      resolve({ result: parseLastJson(stdout), events });
    });
  });
  return {
    child: child as ChildProcessWithoutNullStreams,
    temporaryDurable,
    finalPublished,
    completed
  };
}

function parseJsonLines(source: string): WorkerResult[] {
  return source.trim().split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line) as WorkerResult];
    } catch {
      return [];
    }
  });
}

function inspectInFreshProcess(fixture: ReturnType<typeof createFixture>): WorkerResult {
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types",
    WORKER,
    "inspect",
    fixture.workspacePath,
    fixture.runId,
    fixture.targetPath
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return parseLastJson(result.stdout);
}

function assertNoStagingFiles(reportPath: string): void {
  assert.deepEqual(stagingFiles(reportPath), []);
}

function stagingFiles(reportPath: string): string[] {
  return readdirSync(reportPath).filter((entry) => entry.includes("tianyan-stage") || entry.endsWith(".tmp"));
}

function assertByteVariantFails(label: string, serialize: (bundle: StoryPredictionBundle) => string): void {
  const fixture = createFixture(label);
  try {
    const expectedBytes = Buffer.from(`${stableJson(fixture.bundle)}\n`, "utf8");
    const existingBytes = Buffer.from(serialize(fixture.bundle), "utf8");
    assert.equal(existingBytes.equals(expectedBytes), false, "the adversarial fixture must differ at the byte level");
    writeFileSync(fixture.targetPath, existingBytes);
    assert.throws(
      () => writeNuwaPredictionBundle({
        workspacePath: fixture.workspacePath,
        runId: fixture.runId,
        bundle: fixture.bundle
      }),
      /different content/i
    );
    assert.deepEqual(readFileSync(fixture.targetPath), existingBytes, "fail-closed validation must not rewrite the existing file");
    assertNoStagingFiles(fixture.reportPath);
  } finally {
    fixture.cleanup();
  }
}

function parseLastJson(source: string): WorkerResult {
  const line = source.trim().split("\n").at(-1);
  if (!line) throw new Error("Nuwa bundle worker returned no JSON result.");
  return JSON.parse(line) as WorkerResult;
}

function sha256(value: string | NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(value).digest("hex");
}
