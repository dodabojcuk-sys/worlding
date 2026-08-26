import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CONTEXT_RECEIPT_VERSION,
  INTERACTION_EVENT_VERSION,
  MEMORY_VERSION,
  STOPPING_POINT_VERSION,
  createMemory,
  createReceipt,
  createSession,
  createStoppingPoint,
  deleteReceipt,
  exportContinuityPack,
  hardDeleteMemory,
  hardDeleteSession,
  hardDeleteStoppingPoint,
  listMemoryRevisions,
  normalizeMemorySource,
  readMemory,
  readMemoryTombstone,
  readReceiptTombstone,
  readSessionTombstone,
  readStoppingPointTombstone,
  restoreMemoryRevision,
  revokeMemory,
  runIndependentContinuityOperations,
  sha256,
  stageContinuityPack,
  updateMemory
} from "../../src/storyContinuity/index.ts";
import { serializeStoryMarkdown } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

const RECORDED_AT = "2026-07-14T17:00:00.000Z";
const DELETE_AT = "2026-07-14T18:00:00.000Z";

function fixture(name: string) {
  const rootPath = join(tmpdir(), `world-os-tianyi-history-${name}-${process.pid}`);
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(join(rootPath, "mist-lighthouse"), { recursive: true });
  writeFileSync(join(rootPath, "mist-lighthouse", "project.md"), "---\nworld_os: story-workspace/v1\nid: project.mist-lighthouse\ntype: project\ntitle: Mist Lighthouse\nstatus: active\n---\nProject\n", "utf8");
  return {
    rootPath,
    project: { rootPath, agentId: "agent.tianyi", scope: "project" as const, projectId: "mist-lighthouse" }
  };
}

function memory(id: string, body: string, sensitivity: "ordinary" | "personal" | "sensitive" = "ordinary") {
  return normalizeMemorySource(serializeStoryMarkdown({
    frontmatter: {
      world_os: MEMORY_VERSION,
      id,
      type: "tianyi-memory",
      agent_id: "agent.tianyi",
      scope: "project",
      project_id: "mist-lighthouse",
      kind: "working-preference",
      sensitivity,
      approval_state: "author-approved",
      model_involvement: "candidate-proposed",
      created_revision: 1,
      last_confirmed_revision: 1,
      review_after: "none",
      expires_after: "none",
      state: "active",
      source_refs: ["scene.scene-01"]
    },
    body
  })).value;
}

function metadata(source: "create" | "update" | "revoke" = "create") {
  return { source, recordedAt: RECORDED_AT, operationId: `operation.${source}.000001` } as const;
}

test("revoke and restore append independent revisions without rewinding history", async () => {
  const input = fixture("restore");
  const created = await createMemory(input.project, memory("memory.000001", "First approved statement."), metadata());
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("memory create failed");
  const updated = await updateMemory(input.project, "memory.000001", created.current.contentHash, { ...created.current.value, body: "Second approved statement.", last_confirmed_revision: 2 }, { recordedAt: RECORDED_AT, operationId: "operation.update.000002" });
  assert.equal(updated.ok, true);
  if (!updated.ok) throw new Error("memory update failed");
  const revoked = await revokeMemory(input.project, "memory.000001", updated.current.contentHash, { recordedAt: RECORDED_AT, operationId: "operation.revoke.000001" });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) throw new Error("memory revoke failed");
  assert.equal(revoked.current.value.state, "revoked");
  const restored = await restoreMemoryRevision(input.project, "memory.000001", revoked.current.contentHash, "revision.000001", { recordedAt: RECORDED_AT, operationId: "operation.restore.000001" });
  assert.equal(restored.ok, true);
  if (!restored.ok) throw new Error("memory restore failed");
  assert.equal(restored.current.value.state, "active");
  assert.equal(restored.current.value.body, "First approved statement.");
  const revisions = await listMemoryRevisions(input.project, "memory.000001");
  assert.deepEqual(revisions.map((revision) => revision.sequence), [1, 2, 3, 4]);
  assert.equal(revisions[3].restoredFromRevisionId, "revision.000001");
});

test("hard delete purges active/history/temp/index/staging content and leaves a no-content tombstone", async () => {
  const input = fixture("hard-delete");
  const canary = "DELETE-ME-CONTENT-CANARY-93841";
  const created = await createMemory(input.project, memory("memory.000001", canary), metadata());
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("memory create failed");

  const exported = await exportContinuityPack(input.rootPath, {
    packId: "pack.000001",
    createdAt: RECORDED_AT,
    agentId: "agent.tianyi",
    selections: [{ kind: "memory", id: "memory.000001", scope: "project", projectId: "mist-lighthouse" }],
    includePersonal: false,
    includeSensitive: false,
    sensitiveSecondConfirmation: false
  });
  assert.equal(exported.manifest.files.length, 1);
  await stageContinuityPack(input.rootPath, { sourcePackId: "pack.000001", importId: "import.000001" });

  const ownerDirectory = join(input.rootPath, "mist-lighthouse", "continuity", "agents", "agent.tianyi", "memories");
  writeFileSync(join(ownerDirectory, ".memory.000001.md.continuity-tmp-canary"), canary, "utf8");
  const indexDirectory = join(input.rootPath, ".world-os", "continuity-indexes");
  mkdirSync(indexDirectory, { recursive: true });
  writeFileSync(join(indexDirectory, "memory-index.json"), canary, "utf8");

  const deleted = await hardDeleteMemory(input.project, "memory.000001", {
    expectedContentHash: created.current.contentHash,
    deletedAt: DELETE_AT,
    operationId: "operation.memory-delete.000001"
  });
  assert.equal(deleted.ok, true);
  assert.equal(await readMemory(input.project, "memory.000001"), null);
  assert.deepEqual(await listMemoryRevisions(input.project, "memory.000001"), []);
  assert.equal(treeContains(join(input.rootPath, "mist-lighthouse", "continuity"), canary), false);
  assert.equal(treeContains(indexDirectory, canary), false);
  assert.equal(treeContains(join(input.rootPath, "_continuity", "packs", "import-staging"), canary), false);
  assert.equal(treeContains(join(input.rootPath, "_continuity", "packs", "exports", "pack.000001"), canary), true, "old exported Packs are not remotely recalled");

  const tombstone = await readMemoryTombstone(input.project, "memory.000001");
  assert.equal(tombstone?.state, "hard-deleted");
  const tombstoneSource = JSON.stringify(tombstone);
  assert.doesNotMatch(tombstoneSource, /DELETE-ME|source|sensitivity|contentHash/i);
  const recreate = await createMemory(input.project, memory("memory.000001", "Replacement statement."), metadata());
  assert.equal(recreate.ok, false, "a tombstone keeps the deleted ID occupied");
  await assert.rejects(exportContinuityPack(input.rootPath, {
    packId: "pack.000002",
    createdAt: RECORDED_AT,
    agentId: "agent.tianyi",
    selections: [{ kind: "memory", id: "memory.000001", scope: "project", projectId: "mist-lighthouse" }],
    includePersonal: false,
    includeSensitive: false,
    sensitiveSecondConfirmation: false
  }), /does not exist/i);
});

test("Archive, Receipt, and Stopping Point hard delete independently without cascading to Memory", async () => {
  const input = fixture("owner-delete");
  const memoryCreated = await createMemory(input.project, memory("memory.000001", "Keep this independently approved Memory."), metadata());
  const sessionCreated = await createSession(input.project, {
    version: INTERACTION_EVENT_VERSION,
    eventId: "event.000001",
    sessionId: "session.000001",
    sequence: 1,
    type: "session-opened",
    recordedAt: RECORDED_AT,
    actor: "system",
    content: "",
    responseClassifications: [],
    memoryCandidateIds: [],
    receiptId: null,
    operationId: "operation.session-open.000001"
  }, metadata());
  const receiptCreated = await createReceipt(input.project, {
    version: CONTEXT_RECEIPT_VERSION,
    id: "receipt.000001",
    sessionId: "session.000001",
    agentId: "agent.tianyi",
    personaRevision: 1,
    relationshipPolicyRevision: 1,
    runtime: { mode: "deterministic", adapterId: "tianyi.fixture", adapterVersion: "1.0.0" },
    project: { id: "mist-lighthouse", surface: "writing" },
    selection: { documentId: null, objectId: null, timelinePointId: null },
    sources: [], approvedMemoryIds: [], enabledSkillRefs: [], excludedSources: [],
    generationTimestamp: RECORDED_AT, stale: false, responseClassifications: ["confirmed-fact"]
  }, { ...metadata(), source: "immutable-create" });
  const stoppingCreated = await createStoppingPoint(input.project, {
    world_os: STOPPING_POINT_VERSION,
    id: "stopping-point.000001",
    agent_id: "agent.tianyi",
    project_id: "mist-lighthouse",
    source_id: "scene.scene-01",
    source_hash: "c".repeat(64),
    state: "active",
    created_revision: 1,
    body: "Continue from the approved stopping point."
  }, metadata());
  assert.equal(memoryCreated.ok && sessionCreated.ok && receiptCreated.ok && stoppingCreated.ok, true);
  if (!sessionCreated.ok || !receiptCreated.ok || !stoppingCreated.ok) throw new Error("owner fixture failed");
  await hardDeleteSession(input.project, "session.000001", { expectedContentHash: sessionCreated.current.contentHash, deletedAt: DELETE_AT, operationId: "operation.session-delete.000001" });
  await deleteReceipt(input.project, "receipt.000001", { expectedContentHash: receiptCreated.current.contentHash, deletedAt: DELETE_AT, operationId: "operation.receipt-delete.000001" });
  await hardDeleteStoppingPoint(input.project, "stopping-point.000001", { expectedContentHash: stoppingCreated.current.contentHash, deletedAt: DELETE_AT, operationId: "operation.stopping-delete.000001" });
  assert.equal((await readSessionTombstone(input.project, "session.000001"))?.state, "hard-deleted");
  assert.equal((await readReceiptTombstone(input.project, "receipt.000001"))?.state, "hard-deleted");
  assert.equal((await readStoppingPointTombstone(input.project, "stopping-point.000001"))?.state, "hard-deleted");
  assert.equal((await readMemory(input.project, "memory.000001"))?.value.body, "Keep this independently approved Memory.");
});

test("Pack export enforces sensitivity, integrity, sorted paths, and conservative credential detection", async () => {
  const input = fixture("pack");
  const ordinary = await createMemory(input.project, memory("memory.000001", "The key opens the fictional archive."), metadata());
  const personal = await createMemory(input.project, memory("memory.000002", "The author prefers quiet review sessions.", "personal"), metadata());
  const sensitive = await createMemory(input.project, memory("memory.000003", "The author marked this private concern for local review.", "sensitive"), metadata());
  assert.equal(ordinary.ok && personal.ok && sensitive.ok, true);

  await assert.rejects(exportContinuityPack(input.rootPath, {
    packId: "pack.000001", createdAt: RECORDED_AT, agentId: "agent.tianyi",
    selections: [{ kind: "memory", id: "memory.000002", scope: "project", projectId: "mist-lighthouse" }],
    includePersonal: false, includeSensitive: false, sensitiveSecondConfirmation: false
  }), /opt-in/i);
  await assert.rejects(exportContinuityPack(input.rootPath, {
    packId: "pack.000001", createdAt: RECORDED_AT, agentId: "agent.tianyi",
    selections: [{ kind: "memory", id: "memory.000003", scope: "project", projectId: "mist-lighthouse" }],
    includePersonal: true, includeSensitive: true, sensitiveSecondConfirmation: false
  }), /second confirmation/i);

  const pack = await exportContinuityPack(input.rootPath, {
    packId: "pack.000001", createdAt: RECORDED_AT, agentId: "agent.tianyi",
    selections: [
      { kind: "memory", id: "memory.000003", scope: "project", projectId: "mist-lighthouse" },
      { kind: "memory", id: "memory.000001", scope: "project", projectId: "mist-lighthouse" },
      { kind: "memory", id: "memory.000002", scope: "project", projectId: "mist-lighthouse" }
    ],
    includePersonal: true, includeSensitive: true, sensitiveSecondConfirmation: true
  });
  assert.deepEqual(pack.manifest.files.map((file) => file.path), pack.manifest.files.map((file) => file.path).slice().sort());
  for (const file of pack.manifest.files) {
    const source = readFileSync(join(input.rootPath, "_continuity", "packs", "exports", "pack.000001", file.path));
    assert.equal(file.sha256, sha256(source));
    assert.equal(file.bytes, source.byteLength);
  }
});

test("hostile import remains staged, rejects traversal/symlink/authority input, and never overwrites canonical owners", async () => {
  const input = fixture("import");
  const created = await createMemory(input.project, memory("memory.000001", "Canonical value remains unchanged."), metadata());
  assert.equal(created.ok, true);
  await exportContinuityPack(input.rootPath, {
    packId: "pack.000001", createdAt: RECORDED_AT, agentId: "agent.tianyi",
    selections: [{ kind: "memory", id: "memory.000001", scope: "project", projectId: "mist-lighthouse" }],
    includePersonal: false, includeSensitive: false, sensitiveSecondConfirmation: false
  });
  const staged = await stageContinuityPack(input.rootPath, { sourcePackId: "pack.000001", importId: "import.000001" });
  assert.equal(staged.inventory.integrityStatus, "valid");
  assert.equal((await readMemory(input.project, "memory.000001"))?.value.body, "Canonical value remains unchanged.");
  const stagingPath = join(input.rootPath, staged.relativePath);
  assert.equal(statSync(stagingPath).mode & 0o777, 0o500);

  const exportsRoot = join(input.rootPath, "_continuity", "packs", "exports");
  const traversalPack = join(exportsRoot, "pack.000002");
  cpSync(join(exportsRoot, "pack.000001"), traversalPack, { recursive: true });
  const traversalManifestPath = join(traversalPack, "manifest.json");
  const traversalManifest = JSON.parse(readFileSync(traversalManifestPath, "utf8"));
  traversalManifest.packId = "pack.000002";
  traversalManifest.files[0].path = "files/canonical/../escape.md";
  writeFileSync(traversalManifestPath, `${JSON.stringify(traversalManifest, null, 2)}\n`, "utf8");
  await assert.rejects(stageContinuityPack(input.rootPath, { sourcePackId: "pack.000002", importId: "import.000002" }), /path|invalid/i);

  const symlinkPack = join(exportsRoot, "pack.000003");
  cpSync(join(exportsRoot, "pack.000001"), symlinkPack, { recursive: true });
  const symlinkManifestPath = join(symlinkPack, "manifest.json");
  const symlinkManifest = JSON.parse(readFileSync(symlinkManifestPath, "utf8"));
  symlinkManifest.packId = "pack.000003";
  writeFileSync(symlinkManifestPath, `${JSON.stringify(symlinkManifest, null, 2)}\n`, "utf8");
  const selected = join(symlinkPack, symlinkManifest.files[0].path);
  unlinkSync(selected);
  linkSync(join(exportsRoot, "pack.000001", symlinkManifest.files[0].path), selected);
  await assert.rejects(stageContinuityPack(input.rootPath, { sourcePackId: "pack.000003", importId: "import.000003" }), /hardlink/i);

  const authorityPack = join(exportsRoot, "pack.000004");
  cpSync(join(exportsRoot, "pack.000001"), authorityPack, { recursive: true });
  const authorityManifestPath = join(authorityPack, "manifest.json");
  const authorityManifest = JSON.parse(readFileSync(authorityManifestPath, "utf8"));
  authorityManifest.packId = "pack.000004";
  const authorityFilePath = join(authorityPack, authorityManifest.files[0].path);
  const authoritySource = `${readFileSync(authorityFilePath, "utf8")}\n{\"permissions\":{\"useNetwork\":true}}\n`;
  writeFileSync(authorityFilePath, authoritySource, "utf8");
  authorityManifest.files[0].sha256 = sha256(authoritySource);
  authorityManifest.files[0].bytes = Buffer.byteLength(authoritySource);
  writeFileSync(authorityManifestPath, `${JSON.stringify(authorityManifest, null, 2)}\n`, "utf8");
  await assert.rejects(stageContinuityPack(input.rootPath, { sourcePackId: "pack.000004", importId: "import.000004" }), /Skill|authority/i);

  const linkPack = join(exportsRoot, "pack.000005");
  cpSync(join(exportsRoot, "pack.000001"), linkPack, { recursive: true });
  const linkManifestPath = join(linkPack, "manifest.json");
  const linkManifest = JSON.parse(readFileSync(linkManifestPath, "utf8"));
  linkManifest.packId = "pack.000005";
  writeFileSync(linkManifestPath, `${JSON.stringify(linkManifest, null, 2)}\n`, "utf8");
  const linkedFile = join(linkPack, linkManifest.files[0].path);
  unlinkSync(linkedFile);
  const sourceFile = join(exportsRoot, "pack.000001", linkManifest.files[0].path);
  const { symlinkSync } = await import("node:fs");
  symlinkSync(sourceFile, linkedFile);
  await assert.rejects(stageContinuityPack(input.rootPath, { sourcePackId: "pack.000005", importId: "import.000005" }), /symlink/i);

  const collisionPack = join(exportsRoot, "pack.000006");
  cpSync(join(exportsRoot, "pack.000001"), collisionPack, { recursive: true });
  const collisionManifestPath = join(collisionPack, "manifest.json");
  const collisionManifest = JSON.parse(readFileSync(collisionManifestPath, "utf8"));
  collisionManifest.packId = "pack.000006";
  const original = collisionManifest.files[0];
  collisionManifest.files = [{ ...original, path: original.path.toUpperCase() }, original].sort((left: { path: string }, right: { path: string }) => left.path.localeCompare(right.path));
  writeFileSync(collisionManifestPath, `${JSON.stringify(collisionManifest, null, 2)}\n`, "utf8");
  await assert.rejects(stageContinuityPack(input.rootPath, { sourcePackId: "pack.000006", importId: "import.000006" }), /collide|collision/i);

  assert.equal(readdirSync(join(input.rootPath, "_continuity", "packs", "import-staging")).some((name) => /import\.00000[2-6]/u.test(name)), false);
  assert.equal((await readMemory(input.project, "memory.000001"))?.value.body, "Canonical value remains unchanged.");
});

test("multi-owner operations preserve successful owners and report later failure without destructive rollback", async () => {
  const input = fixture("partial-success");
  const results = await runIndependentContinuityOperations([
    { owner: "memory:memory.000001", run: () => createMemory(input.project, memory("memory.000001", "Independent success."), metadata()) },
    { owner: "policy:agent.tianyi", run: async () => { throw new Error("forced independent conflict"); } }
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal((await readMemory(input.project, "memory.000001"))?.value.body, "Independent success.");
});

function treeContains(root: string, canary: string): boolean {
  if (!existsSync(root)) return false;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && treeContains(target, canary)) return true;
    if (entry.isFile() && readFileSync(target, "utf8").includes(canary)) return true;
  }
  return false;
}
