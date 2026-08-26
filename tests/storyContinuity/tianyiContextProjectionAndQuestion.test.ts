import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GLOBAL_MEMORY_GRANT_VERSION,
  MEMORY_VERSION,
  TIANYI_MAX_ACTUAL_SOURCES,
  TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES,
  TIANYI_MAX_SOURCE_LINES,
  TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES,
  buildTianyiBoundedSourceMaterial,
  buildTianyiContextProjection,
  createGlobalMemoryGrant,
  createMemory,
  deriveReceiptCurrentStatus,
  graphemeCount,
  resolveTianyiMemoryProjection,
  runTianyiDeterministicQuestion,
  stableJson,
  tianyiFixtureAdapter,
  takeGraphemes,
  type BuildTianyiContextProjectionInput,
  type GlobalMemoryGrant,
  type MemoryItem,
  type TianyiContextProjection
} from "../../src/storyContinuity/index.ts";

const RECORDED_AT = "2026-07-14T18:00:00.000Z";

test("projection uses deterministic priority, contains no prose, and fingerprints every runtime input", () => {
  const input = projectionInput();
  input.sources = [
    source("review.review-1", "review-evidence", "review-evidence", "f", "Review", "review-evidence"),
    source("object.hero", "shared-selection", "world-object", "b", "Hero"),
    source("scene.opening", "active-owner", "writing-document", "a", "Opening"),
    source("rule.locked", "locked-rule", "locked-rule", "d", "Locked rule", "rule"),
    source("object.guard", "writing-guard", "writing-guard", "c", "Guard object")
  ];
  const first = buildTianyiContextProjection(input);
  const second = buildTianyiContextProjection(structuredClone(input));

  assert.deepEqual(first.sources.map((item) => item.id), ["scene.opening", "object.hero", "object.guard", "rule.locked", "review.review-1"]);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.doesNotMatch(JSON.stringify(first), /PROSE_CANARY|secret text|body|excerpt/i);

  const changes: Array<(draft: BuildTianyiContextProjectionInput) => void> = [
    (draft) => { draft.projectId = "other-project"; },
    (draft) => { draft.productMode = "world"; },
    (draft) => { draft.activeSurface = { ownerKind: "world-object", ownerId: "object.hero" }; },
    (draft) => { draft.selection.objectId = "object.hero"; },
    (draft) => { draft.sources[0].hash = "9".repeat(64); },
    (draft) => { draft.persona.revision += 1; },
    (draft) => { draft.relationshipPolicy.contentHash = "8".repeat(64); },
    (draft) => { draft.enabledSkillRefs[0].version = "1.0.1"; },
    (draft) => { draft.runtime.adapterVersion = "1.0.1"; }
  ];
  for (const change of changes) {
    const changed = structuredClone(input);
    change(changed);
    assert.notEqual(buildTianyiContextProjection(changed).fingerprint, first.fingerprint);
  }
});

test("author-global Memory is exact-selection and project-grant default deny", async () => {
  const rootPath = await createWorkspace();
  const agentId = "agent.tianyi";
  const globalContext = { rootPath, agentId, scope: "author-global" as const };
  const projectA = { rootPath, agentId, scope: "project" as const, projectId: "project-a" };
  try {
    const memory = memoryItem("memory.000001", "author-global", "project-a", "ordinary");
    const created = await createMemory(globalContext, memory, metadata("operation.memory-create"));
    assert.equal(created.ok, true);
    const memoryHash = created.ok ? created.current.contentHash : "";

    const denied = await resolveTianyiMemoryProjection({ rootPath, projectId: "project-a", agentId, selections: [{ id: memory.id, scope: "author-global" }] });
    assert.equal(denied.approvedMemoryRefs.length, 0);
    assert.equal(denied.sources[0].exclusionReason, "missing-or-revoked-grant");

    const grant: GlobalMemoryGrant = {
      version: GLOBAL_MEMORY_GRANT_VERSION,
      id: "grant.000001",
      agentId,
      memoryId: memory.id,
      memoryContentHash: memoryHash,
      projectId: "project-a",
      state: "active",
      approvedRevision: 1
    };
    const grantWrite = await createGlobalMemoryGrant(projectA, grant, metadata("operation.grant-create"));
    assert.equal(grantWrite.ok, true);
    const allowed = await resolveTianyiMemoryProjection({ rootPath, projectId: "project-a", agentId, selections: [{ id: memory.id, scope: "author-global" }] });
    assert.equal(allowed.approvedMemoryRefs.length, 1);
    assert.equal(allowed.approvedMemoryRefs[0].grantHash, grantWrite.ok ? grantWrite.current.contentHash : null);

    const otherProject = await resolveTianyiMemoryProjection({ rootPath, projectId: "project-b", agentId, selections: [{ id: memory.id, scope: "author-global" }] });
    assert.equal(otherProject.approvedMemoryRefs.length, 0);
    assert.equal(otherProject.sources[0].exclusionReason, "missing-or-revoked-grant");

    const personal = memoryItem("memory.000002", "project", "project-a", "personal");
    await createMemory(projectA, personal, metadata("operation.personal-create"));
    const personalProjection = await resolveTianyiMemoryProjection({ rootPath, projectId: "project-a", agentId, selections: [{ id: personal.id, scope: "project" }] });
    assert.equal(personalProjection.approvedMemoryRefs.length, 0);
    assert.equal(personalProjection.sources[0].exclusionReason, "personal-default-deny");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("bounded source material enforces exact ranges, Unicode-safe limits, and structured redaction", () => {
  const projection = buildTianyiContextProjection({
    ...projectionInput(),
    sources: Array.from({ length: 10 }, (_, index) => source(`scene.source-${index + 1}`, index === 0 ? "active-owner" : "writing-guard", "writing-document", String(index % 10), `Source ${index + 1}`))
  });
  const sources = projection.sources.map((item, index) => ({
    id: item.id,
    kind: "scene",
    hash: item.hash,
    classification: "ordinary" as const,
    range: { startLine: 1, endLine: 100 },
    content: index === 0
      ? `# Safe\n/Users/example/private/story.md\nsk-test_12345678901234567890\n<!-- world-os:section id="secret" kind="secret" -->\nSECRET_CANARY\n<!-- world-os:section id="public" kind="summary" -->\n${"👨‍👩‍👧‍👦".repeat(300)}`
      : Array.from({ length: 30 }, (_, line) => `Line ${line + 1} ${"x".repeat(30)}`).join("\n")
  }));
  const bundle = buildTianyiBoundedSourceMaterial({ projection, sources, localControlToken: "test-local-control-token" });

  assert.ok(bundle.adapterSources.length <= TIANYI_MAX_ACTUAL_SOURCES);
  assert.ok(bundle.adapterSources.every((item) => graphemeCount(item.excerpt) <= TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES));
  assert.ok(bundle.adapterSources.reduce((sum, item) => sum + graphemeCount(item.excerpt), 0) <= TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES);
  assert.ok(bundle.adapterSources.every((item) => item.range.endLine - item.range.startLine + 1 <= TIANYI_MAX_SOURCE_LINES));
  assert.doesNotMatch(JSON.stringify(bundle.adapterSources), /SECRET_CANARY|\/Users\/example|sk-test_/u);
  assert.ok(bundle.adapterSources[0].redactions.includes("secret-section"));
  assert.ok(bundle.adapterSources[0].redactions.includes("absolute-path"));
  assert.equal(takeGraphemes("A👨‍👩‍👧‍👦B", 2), "A👨‍👩‍👧‍👦");

  const restrictedProjection = buildTianyiContextProjection({ ...projectionInput(), sources: [source("memory.restricted", "explicit-memory", "memory", "7", "Restricted", "memory")] });
  const restricted = buildTianyiBoundedSourceMaterial({
    projection: restrictedProjection,
    sources: [{ id: "memory.restricted", kind: "memory", hash: "7".repeat(64), content: "RESTRICTED_CANARY", classification: "restricted" }]
  });
  assert.equal(restricted.adapterSources.length, 0);
  assert.doesNotMatch(JSON.stringify(restricted), /RESTRICTED_CANARY/u);
});

test("question uses the exact Receipt sources and rejects TOCTOU answers as current", async () => {
  const firstProjection = currentProjection("a");
  const current = await runTianyiDeterministicQuestion({
    agentId: "agent.tianyi",
    sessionId: "session.000001",
    receiptId: "receipt.000001",
    generationTimestamp: RECORDED_AT,
    request: { boundedAction: "fixture.current" },
    buildProjection: async () => firstProjection,
    readSourceMaterial: async () => [{ id: "scene.opening", kind: "scene", hash: "a".repeat(64), content: "# Opening\nThe lamp is dark.", classification: "ordinary" }]
  });
  assert.equal(current.status, "current");
  assert.equal(current.currentVisibleResponse, current.visibleResponse);
  assert.equal(current.receipt.sources[0].excerpt, "# Opening\nThe lamp is dark.");
  assert.equal(current.receipt.project.surface, firstProjection.fingerprint);
  assert.equal(deriveReceiptCurrentStatus(current.receipt, firstProjection), "current");

  let projectionReads = 0;
  const staleProjection = currentProjection("b");
  const stale = await runTianyiDeterministicQuestion({
    agentId: "agent.tianyi",
    sessionId: "session.000001",
    receiptId: "receipt.000002",
    generationTimestamp: RECORDED_AT,
    request: { boundedAction: "fixture.current" },
    buildProjection: async () => (++projectionReads === 1 ? firstProjection : staleProjection),
    readSourceMaterial: async () => [{ id: "scene.opening", kind: "scene", hash: "a".repeat(64), content: "# Opening\nThe lamp is dark.", classification: "ordinary" }]
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.currentVisibleResponse, null);
  assert.equal(stale.receipt.stale, true);
  const historicalReceipt = stableJson(stale.receipt);
  assert.equal(deriveReceiptCurrentStatus(current.receipt, staleProjection), "stale");
  assert.equal(stableJson(stale.receipt), historicalReceipt);
});

test("Archive-backed question writes exact v2 message refs and rejects a Receipt draft that omits actual use", async () => {
  const projection = currentProjection("a");
  const archiveMessages = [{
    projectId: "project-a",
    sessionId: "session.000001",
    eventId: "event.archive-1",
    sequence: 2,
    actor: "author" as const,
    recordedAt: RECORDED_AT,
    contentHash: "7".repeat(64),
    excerpt: "The author chose the lighthouse to remain dark."
  }];
  const result = await runTianyiDeterministicQuestion({
    agentId: "agent.tianyi",
    sessionId: "session.000002",
    receiptId: "receipt.000002",
    generationTimestamp: RECORDED_AT,
    request: { boundedAction: "fixture.current" },
    buildProjection: async () => projection,
    readSourceMaterial: async () => [{ id: "scene.opening", kind: "scene", hash: "a".repeat(64), content: "# Opening\nThe lamp is dark.", classification: "ordinary" }],
    archiveMessages
  });
  assert.equal(result.receipt.version, "story-tianyi-context-receipt/v2");
  assert.deepEqual("archiveMessageRefs" in result.receipt ? result.receipt.archiveMessageRefs.map((item) => item.eventId) : [], ["event.archive-1"]);

  await assert.rejects(
    runTianyiDeterministicQuestion({
      agentId: "agent.tianyi",
      sessionId: "session.000002",
      receiptId: "receipt.000003",
      generationTimestamp: RECORDED_AT,
      request: { boundedAction: "fixture.current" },
      buildProjection: async () => projection,
      readSourceMaterial: async () => [{ id: "scene.opening", kind: "scene", hash: "a".repeat(64), content: "# Opening\nThe lamp is dark.", classification: "ordinary" }],
      archiveMessages,
      adapter: {
        async run(input) {
          const output = await tianyiFixtureAdapter.run(input);
          return { ...output, contextReceiptDraft: { ...output.contextReceiptDraft, usedArchiveMessageRefs: [] } };
        }
      }
    }),
    /Archive message use does not match selected Recall Results/i
  );
});

function projectionInput(): BuildTianyiContextProjectionInput {
  return {
    projectId: "project-a",
    productMode: "writing",
    activeSurface: { ownerKind: "writing-document", ownerId: "scene.opening" },
    selection: { documentId: "scene.opening", objectId: null, timelinePointId: null },
    sources: [source("scene.opening", "active-owner", "writing-document", "a", "Opening")],
    approvedMemoryRefs: [],
    persona: { revision: 1, contentHash: "1".repeat(64) },
    relationshipPolicy: { revision: 1, contentHash: "2".repeat(64) },
    enabledSkillRefs: [{ id: "story-memory-recall", version: "1.0.0" }],
    runtime: { adapterId: "tianyi.fixture", adapterVersion: "1.0.0" },
    lockedRuleIds: ["rule.locked"],
    unresolvedThreadIds: ["thread.open"],
    reviewEvidenceIds: ["review.review-1"]
  };
}

function currentProjection(hashCharacter: string): TianyiContextProjection {
  return buildTianyiContextProjection({
    ...projectionInput(),
    enabledSkillRefs: [],
    sources: [source("scene.opening", "active-owner", "writing-document", hashCharacter, "Opening")]
  });
}

function source(
  id: string,
  origin: BuildTianyiContextProjectionInput["sources"][number]["origin"],
  ownerKind: BuildTianyiContextProjectionInput["sources"][number]["ownerKind"],
  hashCharacter: string,
  label: string,
  classification: BuildTianyiContextProjectionInput["sources"][number]["classification"] = "story-source"
): BuildTianyiContextProjectionInput["sources"][number] {
  return { id, ownerKind, hash: hashCharacter.repeat(64), label, state: "current", classification, origin, exclusionReason: null };
}

async function createWorkspace(): Promise<string> {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-projection-"));
  for (const projectId of ["project-a", "project-b"]) {
    await mkdir(path.join(rootPath, projectId), { recursive: true });
    await writeFile(path.join(rootPath, projectId, "project.md"), `---\nworld_os: story-project/v1\nid: ${projectId}\ntitle: Project\n---\n`, "utf8");
  }
  return rootPath;
}

function memoryItem(id: string, scope: "author-global" | "project", projectId: string, sensitivity: MemoryItem["sensitivity"]): MemoryItem {
  return {
    world_os: MEMORY_VERSION,
    id,
    type: "tianyi-memory",
    agent_id: "agent.tianyi",
    scope,
    project_id: scope === "author-global" ? "none" : projectId,
    kind: "working-preference",
    sensitivity,
    approval_state: "author-approved",
    model_involvement: "deterministic-fixture",
    created_revision: 1,
    last_confirmed_revision: 1,
    review_after: "none",
    expires_after: "none",
    state: "active",
    source_refs: ["scene.opening"],
    body: "Inspect evidence before revising."
  };
}

function metadata(operationId: string) {
  return { source: "create" as const, recordedAt: RECORDED_AT, operationId };
}
