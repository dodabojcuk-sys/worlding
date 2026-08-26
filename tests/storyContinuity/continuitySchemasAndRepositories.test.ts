import assert from "node:assert/strict";
import { lstatSync, mkdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CONTEXT_RECEIPT_VERSION,
  CONTEXT_RECEIPT_V3_VERSION,
  GLOBAL_MEMORY_GRANT_VERSION,
  INTERACTION_EVENT_VERSION,
  MEMORY_VERSION,
  STOPPING_POINT_VERSION,
  allocateMemoryId,
  appendSessionEvent,
  createGlobalMemoryGrant,
  createMemory,
  createReceipt,
  createSession,
  createStoppingPoint,
  defaultTianyiPersona,
  defaultTianyiRelationshipPolicy,
  initializePersona,
  initializeRelationshipPolicy,
  listPersonaRevisions,
  listRelationshipPolicyRevisions,
  normalizeContextReceipt,
  normalizeGlobalMemoryGrant,
  normalizeMemorySource,
  normalizePersonaSource,
  normalizeRelationshipPolicy,
  prepareAuthorGlobalRoot,
  prepareProjectContinuityRoot,
  readAuthorizedGlobalMemory,
  readMemory,
  readReceipt,
  readSession,
  readStoppingPoint,
  resolveContinuityOwner,
  stableJson,
  tianyiObjectContextRefKey,
  updateMemory,
  updatePersona
} from "../../src/storyContinuity/index.ts";
import { serializeStoryMarkdown } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

const RECORDED_AT = "2026-07-14T16:00:00.000Z";

function fixture(name: string) {
  const rootPath = join(tmpdir(), `world-os-tianyi-continuity-${name}-${process.pid}`);
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(join(rootPath, "mist-lighthouse"), { recursive: true });
  writeFileSync(join(rootPath, "mist-lighthouse", "project.md"), "---\nworld_os: story-workspace/v1\nid: project.mist-lighthouse\ntype: project\ntitle: Mist Lighthouse\nstatus: active\n---\nProject\n", "utf8");
  return {
    rootPath,
    global: { rootPath, agentId: "agent.tianyi", scope: "author-global" as const },
    project: { rootPath, agentId: "agent.tianyi", scope: "project" as const, projectId: "mist-lighthouse" }
  };
}

function metadata(source: "create" | "update" | "append" | "immutable-create" = "create") {
  return { source, recordedAt: RECORDED_AT, operationId: `operation.test-${source}.000001` } as const;
}

function memorySource(input: { id?: string; scope?: "author-global" | "project"; projectId?: string; sensitivity?: string; approvalState?: string; body?: string } = {}) {
  return serializeStoryMarkdown({
    frontmatter: {
      world_os: MEMORY_VERSION,
      id: input.id ?? "memory.000001",
      type: "tianyi-memory",
      agent_id: "agent.tianyi",
      scope: input.scope ?? "project",
      project_id: input.projectId ?? "mist-lighthouse",
      kind: "working-preference",
      sensitivity: input.sensitivity ?? "ordinary",
      approval_state: input.approvalState ?? "author-approved",
      model_involvement: "candidate-proposed",
      created_revision: 1,
      last_confirmed_revision: 1,
      review_after: "none",
      expires_after: "none",
      state: "active",
      source_refs: ["scene.scene-01"]
    },
    body: input.body ?? "The author prefers evidence before revision."
  });
}

function receipt(id = "receipt.000001") {
  return {
    version: CONTEXT_RECEIPT_VERSION,
    id,
    sessionId: "session.000001",
    agentId: "agent.tianyi",
    personaRevision: 1,
    relationshipPolicyRevision: 1,
    runtime: { mode: "deterministic" as const, adapterId: "tianyi.fixture" as const, adapterVersion: "1.0.0" },
    project: { id: "mist-lighthouse", surface: "writing" },
    selection: { documentId: "scene.scene-01", objectId: null, timelinePointId: null },
    sources: [{
      id: "scene.scene-01",
      kind: "scene",
      hash: "b".repeat(64),
      range: { startLine: 1, endLine: 2 },
      excerpt: "The lamp remains dark.",
      transfer: "local-only" as const,
      redactions: []
    }],
    approvedMemoryIds: [],
    enabledSkillRefs: [],
    excludedSources: [],
    generationTimestamp: RECORDED_AT,
    stale: false,
    responseClassifications: ["confirmed-fact" as const]
  };
}

function boundProviderReceipt() {
  const source = {
    version: "story-tianyi-object-context-ref/v1" as const,
    ownerType: "markdown-writing" as const,
    objectType: "selection" as const,
    stableId: "selection.1.5",
    projectId: "mist-lighthouse",
    ownerId: "scene.scene-01",
    contentHash: "d".repeat(64),
    state: "current" as const,
    inclusion: "included" as const,
    label: "当前写作选区"
  };
  return {
    version: CONTEXT_RECEIPT_V3_VERSION,
    id: "receipt.000009",
    sessionId: "session.golden-loop",
    agentId: "agent.tianyi",
    personaRevision: 1,
    relationshipPolicyRevision: 1,
    runtime: { mode: "provider" as const, providerId: "siliconflow", modelId: "Qwen/Qwen3.5-35B-A3B", profileId: "siliconflow-qwen" },
    project: { id: "mist-lighthouse", surface: "a".repeat(64) },
    selection: { documentId: "scene.scene-01", objectId: null, timelinePointId: null },
    sources: [{ ...source, sourceRef: tianyiObjectContextRefKey(source) }],
    sourceBinding: {
      version: "story-studio-document-selection-binding/v1" as const,
      documentId: "scene.scene-01",
      documentRevision: "d".repeat(64),
      selection: { coordinate: "utf16-code-unit" as const, start: 1, end: 5 },
      contentHash: "e".repeat(64)
    },
    approvedMemoryIds: [],
    enabledSkillRefs: [],
    excludedSources: [],
    generationTimestamp: RECORDED_AT,
    stale: false,
    responseClassifications: ["candidate-suggestion" as const]
  };
}

test("continuity roots are canonical, private, and reject root/intermediate/final symlinks", async () => {
  const input = fixture("paths");
  const globalRoot = await prepareAuthorGlobalRoot(input.rootPath);
  const projectRoot = await prepareProjectContinuityRoot(input.rootPath, "mist-lighthouse");
  assert.equal(globalRoot, join(realpathSync(input.rootPath), "_continuity"));
  assert.equal(projectRoot, join(realpathSync(input.rootPath), "mist-lighthouse", "continuity"));
  assert.equal(statSync(globalRoot).mode & 0o777, 0o700);

  const rootLink = `${input.rootPath}-link`;
  rmSync(rootLink, { recursive: true, force: true });
  symlinkSync(input.rootPath, rootLink);
  await assert.rejects(prepareAuthorGlobalRoot(rootLink), /symlink/i);

  const intermediate = join(input.rootPath, "_continuity", "agents", "agent.tianyi");
  mkdirSync(join(input.rootPath, "_continuity", "agents"), { recursive: true });
  rmSync(intermediate, { recursive: true, force: true });
  symlinkSync(join(input.rootPath, "mist-lighthouse"), intermediate);
  await assert.rejects(resolveContinuityOwner(input.global, "memory", "memory.000001", { createDirectories: true }), /symlink/i);
  rmSync(intermediate, { force: true });

  const location = await resolveContinuityOwner(input.global, "memory", "memory.000001", { createDirectories: true });
  writeFileSync(join(input.rootPath, "outside.md"), "outside", "utf8");
  symlinkSync(join(input.rootPath, "outside.md"), location.absolutePath);
  await assert.rejects(readMemory(input.global, "memory.000001"), /symlink/i);
});

test("strict schemas normalize NFC and reject unknown, dangerous, restricted, rejected, and oversized data", async () => {
  const persona = defaultTianyiPersona();
  persona.display_name = "A\u030A";
  const normalizedPersona = normalizePersonaSource(serializeStoryMarkdown({ frontmatter: Object.fromEntries(Object.entries(persona).filter(([key]) => key !== "body")), body: persona.body }));
  assert.equal(normalizedPersona.value.display_name, "Å");

  assert.throws(() => normalizeRelationshipPolicy({ ...defaultTianyiRelationshipPolicy(), extra: true }), /unknown field/i);
  assert.throws(() => normalizeRelationshipPolicy(JSON.parse('{"version":"story-tianyi-relationship-policy/v1","__proto__":{},"agentId":"agent.tianyi"}')), /dangerous|unknown/i);
  const input = fixture("strict-memory");
  const rejected = normalizeMemorySource(memorySource({ approvalState: "rejected" })).value;
  await assert.rejects(createMemory(input.project, rejected, metadata()), /author-approved/i);
  assert.equal(await readMemory(input.project, rejected.id), null);
  const restricted = normalizeMemorySource(memorySource({ sensitivity: "restricted" })).value;
  await assert.rejects(createMemory(input.project, restricted, metadata()), /restricted/i);
  assert.throws(() => normalizeMemorySource(memorySource({ body: "x".repeat(2_001) })), /invalid|large/i);
});

test("Persona and Relationship Policy keep independent hashes and revision ledgers", async () => {
  const input = fixture("persona-policy");
  const personaCreated = await initializePersona(input.global, metadata());
  const policyCreated = await initializeRelationshipPolicy(input.global, metadata());
  assert.equal(personaCreated.ok, true);
  assert.equal(policyCreated.ok, true);
  if (!personaCreated.ok || !policyCreated.ok) throw new Error("fixture create failed");
  assert.notEqual(personaCreated.current.contentHash, policyCreated.current.contentHash);
  const nextPersona = { ...personaCreated.current.value, display_name: "Tianyi", persona_revision: 2 };
  const updated = await updatePersona(input.global, personaCreated.current.contentHash, nextPersona, { recordedAt: RECORDED_AT, operationId: "operation.persona-update.000001" });
  assert.equal(updated.ok, true);
  assert.equal((await listPersonaRevisions(input.global)).length, 2);
  assert.equal((await listRelationshipPolicyRevisions(input.global)).length, 1);
  const personaPath = join(input.rootPath, "_continuity", "agents", "agent.tianyi", "persona.md");
  assert.equal(lstatSync(personaPath).mode & 0o777, 0o600);
});

test("Memory IDs are monotonic under concurrent allocation and global grants are default-deny and hash-bound", async () => {
  const input = fixture("grant");
  const ids = await Promise.all(Array.from({ length: 12 }, () => allocateMemoryId(input.global)));
  assert.equal(new Set(ids).size, 12);
  assert.deepEqual(ids.slice().sort(), Array.from({ length: 12 }, (_, index) => `memory.${String(index + 1).padStart(6, "0")}`));

  const memory = normalizeMemorySource(memorySource({ id: ids[0], scope: "author-global", projectId: "none" })).value;
  const created = await createMemory(input.global, memory, metadata());
  assert.equal(created.ok, true);
  assert.equal((await readAuthorizedGlobalMemory(input.project, memory.id)).authorized, false);
  if (!created.ok) throw new Error("memory create failed");
  const grant = normalizeGlobalMemoryGrant({
    version: GLOBAL_MEMORY_GRANT_VERSION,
    id: "grant.000001",
    agentId: "agent.tianyi",
    memoryId: memory.id,
    memoryContentHash: created.current.contentHash,
    projectId: "mist-lighthouse",
    state: "active",
    approvedRevision: 1
  });
  await createGlobalMemoryGrant(input.project, grant, metadata());
  assert.equal((await readAuthorizedGlobalMemory(input.project, memory.id)).authorized, true);
  const edited = { ...memory, body: "The author now prefers concise evidence.", last_confirmed_revision: 2 };
  const update = await updateMemory(input.global, memory.id, created.current.contentHash, edited, { recordedAt: RECORDED_AT, operationId: "operation.memory-update.000001" });
  assert.equal(update.ok, true);
  assert.equal((await readAuthorizedGlobalMemory(input.project, memory.id)).authorized, false, "grant must become stale after Memory hash drift");
});

test("Archive append requires exact hash and next sequence", async () => {
  const input = fixture("archive");
  const opened = {
    version: INTERACTION_EVENT_VERSION,
    eventId: "event.000001",
    sessionId: "session.000001",
    sequence: 1,
    type: "session-opened" as const,
    recordedAt: RECORDED_AT,
    actor: "system" as const,
    content: "",
    responseClassifications: [],
    memoryCandidateIds: [],
    receiptId: null,
    operationId: "operation.session-open.000001"
  };
  const created = await createSession(input.project, opened, metadata());
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("session create failed");
  const message = { ...opened, eventId: "event.000002", sequence: 2, type: "author-message" as const, actor: "author" as const, content: "Why is this locked?", operationId: "operation.question.000001" };
  const appended = await appendSessionEvent(input.project, opened.sessionId, created.current.contentHash, 2, message, { recordedAt: RECORDED_AT, operationId: message.operationId });
  assert.equal(appended.ok, true);
  const stale = await appendSessionEvent(input.project, opened.sessionId, created.current.contentHash, 3, { ...message, eventId: "event.000003", sequence: 3 }, { recordedAt: RECORDED_AT, operationId: "operation.question.000002" });
  assert.equal(stale.ok, false);
  assert.equal((await readSession(input.project, opened.sessionId))?.value.length, 2);
});

test("Context Receipt is immutable and bounded while stopping points are project-local", async () => {
  const input = fixture("receipt-stopping");
  const created = await createReceipt(input.project, receipt(), metadata("immutable-create"));
  assert.equal(created.ok, true);
  const conflict = await createReceipt(input.project, receipt(), metadata("immutable-create"));
  assert.equal(conflict.ok, false);
  assert.equal((await readReceipt(input.project, "receipt.000001"))?.value.sources.length, 1);
  assert.throws(() => normalizeContextReceipt({ ...receipt(), sources: [{ ...receipt().sources[0], excerpt: "x".repeat(241) }] }), /excerpt/i);
  assert.throws(() => normalizeContextReceipt({ ...receipt(), sources: [{ ...receipt().sources[0], kind: "secret" }] }), /sensitive/i);

  const stopping = {
    world_os: STOPPING_POINT_VERSION,
    id: "stopping-point.000001",
    agent_id: "agent.tianyi",
    project_id: "mist-lighthouse",
    source_id: "scene.scene-01",
    source_hash: "c".repeat(64),
    state: "active" as const,
    created_revision: 1,
    body: "Continue from the unresolved bell sequence."
  };
  await createStoppingPoint(input.project, stopping, metadata());
  assert.equal((await readStoppingPoint(input.project, stopping.id))?.value.project_id, "mist-lighthouse");
  await assert.rejects(createStoppingPoint(input.global, stopping, metadata()), /project-local/i);
});

test("provider Context Receipt binding stores only server-resolved identity, revision, UTF-16 range, and digest", () => {
  const normalized = normalizeContextReceipt(boundProviderReceipt());
  assert.equal(normalized.version, CONTEXT_RECEIPT_V3_VERSION);
  if (normalized.version !== CONTEXT_RECEIPT_V3_VERSION) throw new Error("expected V3 Receipt");
  assert.deepEqual(normalized.sourceBinding, boundProviderReceipt().sourceBinding);
  assert.equal(JSON.stringify(normalized.sourceBinding).includes("正文"), false);

  const invalidCoordinate = boundProviderReceipt();
  invalidCoordinate.sourceBinding.selection.coordinate = "utf8-byte" as never;
  assert.throws(() => normalizeContextReceipt(invalidCoordinate), /coordinate/i);
  const divergentDocument = boundProviderReceipt();
  divergentDocument.sourceBinding.documentId = "scene.other";
  assert.throws(() => normalizeContextReceipt(divergentDocument), /does not match/i);
});
