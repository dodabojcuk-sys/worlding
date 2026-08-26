import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AuthorChangeSetApplyError,
  createStoryStudioAuthorControl,
  type AuthorChangeSetApplyErrorCode,
  type AuthorChangeSetApplyFaultPoint
} from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import {
  createCrashSafeApplyFixture,
  inspectCrashSafeApplyFixture,
  openCrashSafeApplyFixture
} from "../fixtures/authorChangeSetCrashFixture.ts";
import { createWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

const HARNESS = path.resolve("tests/fixtures/authorChangeSetCrashHarness.ts");
type HarnessFixtureResult = {
  projectId: string;
  changeSetId: string;
  protectedFingerprint: string;
  changeSetSemanticHash: string;
  authorDecisionHash: string;
};
type HarnessApplyResult = {
  status: string;
  application: { eventRecorded: boolean };
};
type HarnessInspectionResult = {
  changeSetStatus: string;
  productStatus: string;
  appliedEventId: string;
  intent: TestApplyIntent | null;
  operationEventCount: number;
  operationEventIds: string[];
  targetEventHash: string | null;
  targetEventStatus: string;
  targetEventProvenance: {
    sourceChangeSetId: string | null;
    sourceChangeSetRevision: string | null;
    authorDecisionRef: string | null;
    applyOperationKey: string | null;
    intentHash: string | null;
  } | null;
  operationProjectionCount: number;
  loaderVisibleTemporaryCount: number;
  protectedFingerprint: string;
  changeSetSemanticHash: string;
  authorDecisionHash: string;
};
type TestApplyIntent = {
  targetEventRef: string;
  changeSetId: string;
  changeSetRevision: string;
  authorDecisionRef: string;
  applyOperationKey: string;
  intentHash: string;
  event: { title: string; relativePath: string };
};
const FAULT_POINTS: AuthorChangeSetApplyFaultPoint[] = [
  "before-intent-publish",
  "intent-temporary-durable",
  "intent-final-published",
  "after-intent-durable",
  "applying-temporary-durable",
  "applying-final-published",
  "event-temporary-durable",
  "event-final-published",
  "event-index-persisted",
  "event-operation-persisted",
  "event-state-persisted",
  "event-revision-persisted",
  "before-applied-persist",
  "applied-temporary-durable",
  "applied-final-published",
  "after-applied-durable",
  "before-response"
];
const EVIDENCE_FILE = process.env.TIANYAN_AUTHOR_CHANGESET_EVIDENCE_DIR
  ? path.join(process.env.TIANYAN_AUTHOR_CHANGESET_EVIDENCE_DIR, "fault-recovery-observations.jsonl")
  : null;
if (EVIDENCE_FILE) {
  mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
  writeFileSync(EVIDENCE_FILE, "");
}

for (const faultPoint of FAULT_POINTS) {
  test(`process crash at ${faultPoint} recovers to exactly one confirmed Event`, () => {
    const root = mkdtempSync(path.join(tmpdir(), "author-changeset-crash-matrix-"));
    try {
      const fixture = runHarness("init", root);
      const crashed = spawnSync(process.execPath, [
        "--experimental-strip-types",
        HARNESS,
        "apply",
        root,
        fixture.projectId,
        fixture.changeSetId,
        faultPoint
      ], { cwd: process.cwd(), encoding: "utf8" });
      assert.equal(crashed.status, null);
      assert.equal(crashed.signal, "SIGKILL");

      const crashState = runHarness("inspect", root, fixture.projectId, fixture.changeSetId);
      assert.ok(crashState.operationEventCount === 0 || crashState.operationEventCount === 1);
      assert.equal(crashState.protectedFingerprint, fixture.protectedFingerprint);
      assert.equal(crashState.changeSetSemanticHash, fixture.changeSetSemanticHash);
      assert.equal(crashState.authorDecisionHash, fixture.authorDecisionHash);

      const recovered = runHarness("apply", root, fixture.projectId, fixture.changeSetId);
      const inspected = runHarness("inspect", root, fixture.projectId, fixture.changeSetId);
      assert.equal(recovered.status, "applied");
      assert.equal(inspected.changeSetStatus, "applied");
      assert.equal(inspected.productStatus, "applied");
      assert.equal(inspected.operationEventCount, 1);
      assert.deepEqual(inspected.operationEventIds, [inspected.appliedEventId]);
      assert.equal(inspected.targetEventStatus, "committed");
      assert.equal(inspected.operationProjectionCount, 1);
      assert.equal(inspected.loaderVisibleTemporaryCount, 0);
      assert.equal(inspected.protectedFingerprint, fixture.protectedFingerprint);
      assert.equal(inspected.changeSetSemanticHash, fixture.changeSetSemanticHash);
      assert.equal(inspected.authorDecisionHash, fixture.authorDecisionHash);
      assert.ok(inspected.intent);
      assert.equal(inspected.intent.changeSetRevision, fixture.changeSetSemanticHash);
      assert.deepEqual(inspected.targetEventProvenance, {
        sourceChangeSetId: inspected.intent.changeSetId,
        sourceChangeSetRevision: inspected.intent.changeSetRevision,
        authorDecisionRef: inspected.intent.authorDecisionRef,
        applyOperationKey: inspected.intent.applyOperationKey,
        intentHash: inspected.intent.intentHash
      });
      assert.equal(typeof inspected.targetEventHash, "string");
      recordFaultObservation({
        faultPoint,
        projectId: fixture.projectId,
        changeSetId: fixture.changeSetId,
        changeSetRevision: inspected.intent.changeSetRevision,
        authorDecisionRef: inspected.intent.authorDecisionRef,
        applyOperationKey: inspected.intent.applyOperationKey,
        targetEventRef: inspected.intent.targetEventRef,
        intentHash: inspected.intent.intentHash,
        crashChangeSetStatus: crashState.changeSetStatus,
        crashIntentPresent: crashState.intent !== null,
        crashOperationEventCount: crashState.operationEventCount,
        crashTargetEventHash: crashState.targetEventHash,
        recoveredChangeSetStatus: inspected.changeSetStatus,
        recoveredOperationEventCount: inspected.operationEventCount,
        recoveredTargetEventHash: inspected.targetEventHash,
        operationProjectionCount: inspected.operationProjectionCount,
        loaderVisibleTemporaryCount: inspected.loaderVisibleTemporaryCount,
        protectedFingerprint: inspected.protectedFingerprint,
        changeSetSemanticHash: inspected.changeSetSemanticHash,
        authorDecisionHash: inspected.authorDecisionHash,
        result: "PASS"
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("same-process duplicate apply calls converge on one Event and one receipt", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "author-changeset-same-process-"));
  try {
    const fixture = await createCrashSafeApplyFixture(root);
    const control = createStoryStudioAuthorControl({
      rootPath: fixture.rootPath,
      stateFilePath: fixture.stateFilePath
    });
    const results = await Promise.all([
      Promise.resolve().then(() => control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId })),
      Promise.resolve().then(() => control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId })),
      Promise.resolve().then(() => control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId }))
    ]);
    assert.ok(results.every((result) => result.status === "applied"));
    assert.deepEqual(results, [results[0], results[0], results[0]]);
    const inspected = inspectCrashSafeApplyFixture(root, fixture.projectId, fixture.changeSetId);
    assert.equal(inspected.operationEventCount, 1);
    assert.equal(inspected.operationProjectionCount, 1);
    assert.equal(inspected.protectedFingerprint, fixture.protectedFingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two independent Node processes start together and converge without ordering sleeps", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "author-changeset-cross-process-"));
  try {
    const fixture = await createCrashSafeApplyFixture(root);
    const left = startBarrierApply(root, fixture.projectId, fixture.changeSetId);
    const right = startBarrierApply(root, fixture.projectId, fixture.changeSetId);
    await Promise.all([left.ready, right.ready]);
    left.child.stdin.write("GO\n");
    right.child.stdin.write("GO\n");
    const [leftResult, rightResult] = await Promise.all([left.completed, right.completed]);
    assert.equal(leftResult.status, "applied");
    assert.equal(rightResult.status, "applied");
    const inspected = inspectCrashSafeApplyFixture(root, fixture.projectId, fixture.changeSetId);
    assert.equal(inspected.operationEventCount, 1);
    assert.equal(inspected.operationProjectionCount, 1);
    assert.equal(leftResult.application.eventRecorded, true);
    assert.equal(rightResult.application.eventRecorded, true);
    assert.equal(inspected.protectedFingerprint, fixture.protectedFingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("normal apply persists stable structured provenance and permits later author body edits", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "author-changeset-provenance-"));
  try {
    const fixture = await createCrashSafeApplyFixture(root);
    const opened = openCrashSafeApplyFixture(root, fixture.projectId);
    const control = createStoryStudioAuthorControl({ rootPath: opened.rootPath, stateFilePath: opened.stateFilePath });
    const applied = control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId });
    const inspected = inspectCrashSafeApplyFixture(root, fixture.projectId, fixture.changeSetId);
    assert.equal(applied.status, "applied");
    assert.equal(inspected.intent.targetEventRef, inspected.appliedEventId);
    const event = opened.workspace.readWorldObject({ projectId: fixture.projectId, objectId: inspected.appliedEventId });
    for (const key of [
      "source_change_set_id",
      "source_change_set_revision",
      "author_decision_ref",
      "apply_operation_key",
      "apply_intent_hash"
    ]) {
      assert.equal(typeof event.properties[key], "string", key);
    }

    const editedBody = `${event.body}\nAuthor-authored clarification after apply.\n`;
    opened.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: event.id,
      expectedHash: event.revisionToken,
      title: event.title,
      status: event.status,
      tags: event.tags,
      aliases: event.aliases,
      body: editedBody,
      card: event.card
    });
    const retried = control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId });
    assert.equal(retried.status, "applied");
    assert.equal(opened.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }).body, editedBody);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local apply API returns the same applied receipt across client retry", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "author-changeset-api-"));
  const fixture = await createCrashSafeApplyFixture(root);
  const port = 46_000 + (process.pid % 1_000);
  const token = "crash-safe-event-apply-token";
  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      WORLD_OS_STORY_STUDIO_ROOT: fixture.rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: fixture.stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForStoryStudio(port);
    const endpoint = `http://127.0.0.1:${port}/__local/story-studio/author-control/change-set/apply`;
    const request = () => fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-world-os-local-control-token": token
      },
      body: JSON.stringify({ projectId: fixture.projectId, changeSetId: fixture.changeSetId })
    });
    const firstResponse = await request();
    const first = await firstResponse.json() as { data: HarnessApplyResult };
    const retryResponse = await request();
    const retry = await retryResponse.json() as { data: HarnessApplyResult };
    assert.equal(firstResponse.status, 200);
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(retry, first);
    assert.equal(first.data.status, "applied");
    const inspected = inspectCrashSafeApplyFixture(root, fixture.projectId, fixture.changeSetId);
    assert.equal(inspected.operationEventCount, 1);
    assert.equal(inspected.operationProjectionCount, 1);
  } finally {
    if (server.exitCode == null && server.signalCode == null) {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => server.once("exit", () => resolve()));
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("conflicts and broken invariants fail closed with distinct policy codes", async (t) => {
  await t.test("legacy applying without intent", async () => {
    const fixture = await createDirectFixture();
    try {
      mutateChangeSet(fixture, (value) => ({ ...value, status: "applying" }));
      assertApplyCode(fixture, "LEGACY_APPLYING_UNRECOVERABLE");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("legacy applied receipt whose Event is missing", async () => {
    const fixture = await createDirectFixture();
    try {
      mutateChangeSet(fixture, (value) => ({
        ...value,
        status: "applied",
        application: {
          ...(value.application as Record<string, unknown>),
          appliedEventId: "event.missing-legacy-receipt",
          markdownWrites: 1
        }
      }));
      assertApplyCode(fixture, "APPLIED_EVENT_MISSING");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("Change Set semantic drift after intent", async () => {
    const fixture = await createDirectFixture();
    try {
      prepareIntentOnly(fixture);
      mutateChangeSet(fixture, (value) => ({
        ...value,
        change: [...(Array.isArray(value.change) ? value.change : []), "drift"]
      }));
      assertApplyCode(fixture, "APPLY_INTENT_MISMATCH");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("applied Change Set semantic drift cannot bypass its frozen intent", async () => {
    const fixture = await createDirectFixture();
    try {
      fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId });
      mutateChangeSet(fixture, (value) => ({
        ...value,
        change: [...(Array.isArray(value.change) ? value.change : []), "post-apply drift"]
      }));
      assertApplyCode(fixture, "APPLY_INTENT_MISMATCH");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("source revision drift after intent", async () => {
    const fixture = await createDirectFixture();
    try {
      prepareIntentOnly(fixture);
      const scene = fixture.workspace.readWritingDocument({ projectId: fixture.projectId, documentId: fixture.sceneId });
      fixture.workspace.updateWritingDocument({
        projectId: fixture.projectId,
        documentId: scene.id,
        expectedHash: scene.revisionToken,
        status: scene.status,
        body: `${scene.body}\nExternal revision after apply intent.\n`
      });
      assertApplyCode(fixture, "CHANGESET_REVISION_DRIFT");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("unrelated target identity collision", async () => {
    const fixture = await createDirectFixture();
    try {
      const intent = prepareIntentOnly(fixture);
      createWorkspaceNote(fixture.projectPath, {
        id: intent.targetEventRef,
        type: "event",
        title: "Unrelated collision",
        status: "committed",
        relativePath: intent.event.relativePath,
        frontmatter: { tags: ["unrelated"] },
        body: "# Unrelated collision\n"
      });
      assertApplyCode(fixture, "EVENT_ID_COLLISION");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("same operation with mismatched Event payload", async () => {
    const fixture = await createDirectFixture();
    try {
      const intent = prepareIntentOnly(fixture);
      createWorkspaceNote(fixture.projectPath, {
        id: intent.targetEventRef,
        type: "event",
        title: intent.event.title,
        status: "committed",
        relativePath: intent.event.relativePath,
        frontmatter: {
          tags: ["作者确认"],
          source_change_set_id: intent.changeSetId,
          source_change_set_revision: intent.changeSetRevision,
          author_decision_ref: intent.authorDecisionRef,
          apply_operation_key: intent.applyOperationKey,
          apply_intent_hash: intent.intentHash
        },
        body: "# Author-edited before receipt\n"
      });
      assertApplyCode(fixture, "EVENT_PROVENANCE_MISMATCH");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("multiple Events claim one operation", async () => {
    const fixture = await createDirectFixture();
    try {
      fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId });
      const intent = readIntent(fixture);
      createWorkspaceNote(fixture.projectPath, {
        id: "event.duplicate-operation",
        type: "event",
        title: "Duplicate operation claimant",
        status: "committed",
        relativePath: "world/events/duplicate-operation.md",
        frontmatter: {
          tags: ["作者确认"],
          apply_operation_key: intent.applyOperationKey
        },
        body: "# Duplicate operation claimant\n"
      });
      assertApplyCode(fixture, "MULTIPLE_EVENTS_FOR_OPERATION");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("applied receipt whose Event is missing", async () => {
    const fixture = await createDirectFixture();
    try {
      fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId });
      const intent = readIntent(fixture);
      unlinkSync(path.join(fixture.projectPath, intent.event.relativePath));
      assertApplyCode(fixture, "APPLIED_EVENT_MISSING");
    } finally {
      fixture.cleanup();
    }
  });
});

function runHarness(command: "init", root: string): HarnessFixtureResult;
function runHarness(command: "apply", root: string, projectId: string, changeSetId: string): HarnessApplyResult;
function runHarness(command: "inspect", root: string, projectId: string, changeSetId: string): HarnessInspectionResult;
function runHarness(command: "init" | "apply" | "inspect", root: string, projectId?: string, changeSetId?: string) {
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types",
    HARNESS,
    command,
    root,
    ...(projectId ? [projectId] : []),
    ...(changeSetId ? [changeSetId] : [])
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return parseLastJson<HarnessFixtureResult | HarnessApplyResult | HarnessInspectionResult>(result.stdout);
}

function startBarrierApply(root: string, projectId: string, changeSetId: string) {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    HARNESS,
    "apply-wait",
    root,
    projectId,
    changeSetId
  ], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let readyResolved = false;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!readyResolved && stdout.includes("READY\n")) {
      readyResolved = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completed = new Promise<HarnessApplyResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code !== 0) {
        reject(new Error(`barrier child failed: code=${code} signal=${signal} ${stderr}`));
        return;
      }
      resolve(parseLastJson<HarnessApplyResult>(stdout));
    });
  });
  return { child: child as ChildProcessWithoutNullStreams, ready, completed };
}

async function createDirectFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "author-changeset-conflict-"));
  const fixture = await createCrashSafeApplyFixture(root);
  const opened = openCrashSafeApplyFixture(root, fixture.projectId);
  const control = createStoryStudioAuthorControl({ rootPath: opened.rootPath, stateFilePath: opened.stateFilePath });
  return {
    ...fixture,
    ...opened,
    control,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function prepareIntentOnly(fixture: Awaited<ReturnType<typeof createDirectFixture>>) {
  const control = createStoryStudioAuthorControl({
    rootPath: fixture.rootPath,
    stateFilePath: fixture.stateFilePath,
    faultInjector(point) {
      if (point === "after-intent-durable") throw new Error("EXPECTED_TEST_BOUNDARY_STOP");
    }
  });
  assert.throws(
    () => control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId }),
    /EXPECTED_TEST_BOUNDARY_STOP/
  );
  return readIntent(fixture);
}

function readIntent(fixture: Awaited<ReturnType<typeof createDirectFixture>>): TestApplyIntent {
  return JSON.parse(readFileSync(path.join(
    fixture.projectPath,
    ".world-os",
    "author-control",
    "change-sets",
    `${fixture.changeSetId}.apply-intent.v1.json`
  ), "utf8"));
}

function mutateChangeSet(
  fixture: Awaited<ReturnType<typeof createDirectFixture>>,
  mutate: (value: Record<string, unknown>) => Record<string, unknown>
): void {
  const target = path.join(
    fixture.projectPath,
    ".world-os",
    "author-control",
    "change-sets",
    `${fixture.changeSetId}.json`
  );
  const value = JSON.parse(readFileSync(target, "utf8"));
  writeFileSync(target, `${JSON.stringify(mutate(value), null, 2)}\n`, "utf8");
}

function assertApplyCode(
  fixture: Awaited<ReturnType<typeof createDirectFixture>>,
  code: AuthorChangeSetApplyErrorCode
): void {
  assert.throws(
    () => fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: fixture.changeSetId }),
    (error) => error instanceof AuthorChangeSetApplyError && error.code === code
  );
}

function parseLastJson<T>(source: string): T {
  const lines = source.trim().split("\n").filter((line) => line !== "READY");
  assert.ok(lines.length > 0, "child process did not return JSON");
  return JSON.parse(lines.at(-1)!) as T;
}

function recordFaultObservation(value: Record<string, unknown>): void {
  if (EVIDENCE_FILE) appendFileSync(EVIDENCE_FILE, `${JSON.stringify(value)}\n`, "utf8");
}

async function waitForStoryStudio(port: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/__local/story-studio/bootstrap`)).ok) return;
    } catch {
      // The bounded local startup window intentionally retries connection only.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for the local Story Studio test server.");
}
