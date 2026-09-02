import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations, type OutputArtifactType } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import { migrateMarkdownToNovelDocumentModelR1, replaceBlockText, withRevision, type NovelDocumentModelR1 } from "../../src/storyCreation/novelDocumentModelR1.ts";
import { NOVEL_DOCUMENT_AUTHORITY_KEY, NOVEL_DOCUMENT_MODEL_KEY, NOVEL_MIGRATION_RECEIPT_KEY } from "../../src/storyCreation/creationArtifactModel.ts";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-unit-artifact-"));
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".app-state.json") });
  const project = operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  return { rootPath, operations, project };
}

function source(entityId: string, entityVersion = "source-v1") {
  return { sourceKind: "event-line" as const, ownerId: "workspace-event-owner", entityId, entityVersion, capturedAt: "2026-08-16T00:00:00.000Z", staleState: "fresh" as const };
}

test("Story Unit persists item-level authority and source references without creating a world fact", () => {
  const input = fixture();
  const before = input.operations.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id }).objects.length;
  const unit = input.operations.createStoryUnit({
    projectId: input.project.id,
    title: "钟声前的迟疑",
    summary: "保留守夜人是否被胁迫的悬念。",
    sourceRefs: [source("event.confirmed.1")],
    items: [
      { id: "item.fact", kind: "event", authority: "canon", content: { title: "钟声响起" }, sourceRefs: [source("event.confirmed.1")], createdBy: "author" },
      { id: "item.intent", kind: "intent", authority: "author-intent", content: { intent: "保留悬念" }, sourceRefs: [source("tianyi.intent.1")], createdBy: "author" },
      { id: "item.candidate", kind: "possibility", authority: "candidate", possibilityStatus: "selected-for-output", content: { title: "守夜人逃离" }, sourceRefs: [source("candidate.1")], createdBy: "ai" }
    ]
  });

  assert.deepEqual(unit.items.map((item) => item.authority), ["canon", "author-intent", "candidate"]);
  assert.equal(unit.items[2]?.possibilityStatus, "selected-for-output");
  assert.equal(input.operations.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id }).objects.length, before);

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: path.join(input.rootPath, ".app-state.json") });
  const restored = restarted.readStoryUnit({ projectId: input.project.id, unitId: unit.id });
  assert.deepEqual(restored.items.map((item) => item.authority), ["canon", "author-intent", "candidate"]);
  assert.equal(restored.sourceRefs[0]?.entityId, "event.confirmed.1");
});

test("Story Unit branch identity is formal, versioned, and survives rename", () => {
  const input = fixture();
  const main = input.operations.createStoryUnit({
    projectId: input.project.id,
    title: "雾港",
    kind: "main",
    order: 10,
    sourceVersionRef: "work-version.1",
    status: "active",
    objective: "找到暗号的来源。"
  });
  const branchPoint = input.operations.createWorldObject({
    projectId: input.project.id,
    type: "event",
    title: "仓库对峙",
    status: "draft",
    tags: ["单元：雾港"],
    body: "分支从这里开始。"
  });
  const branch = input.operations.createStoryUnit({
    projectId: input.project.id,
    title: "灯塔余波",
    kind: "branch",
    parentUnitId: main.id,
    branchPointEventId: branchPoint.id,
    mergeTargetUnitId: main.id,
    order: 20,
    sourceVersionRef: main.version,
    status: "candidate",
    coreConflict: "是否公开失踪名单。"
  });

  const renamed = input.operations.updateStoryUnit({
    projectId: input.project.id,
    unitId: branch.id,
    expectedVersion: branch.version,
    title: "不含分支字样的新名称"
  });

  assert.equal(renamed.conflict, false);
  assert.equal(renamed.unit.kind, "branch");
  assert.equal(renamed.unit.parentUnitId, main.id);
  assert.equal(renamed.unit.branchPointEventId, branchPoint.id);
  assert.equal(renamed.unit.mergeTargetUnitId, main.id);
  assert.equal(renamed.unit.objective, "");
  assert.equal(renamed.unit.coreConflict, "是否公开失踪名单。");
  assert.deepEqual(input.operations.listStoryUnits({ projectId: input.project.id }).map((unit) => unit.id), [main.id, branch.id]);
});

test("legacy Story Unit records receive compatible explicit structure defaults", () => {
  const input = fixture();
  const unit = input.operations.createStoryUnit({ projectId: input.project.id, title: "旧版单元" });
  assert.equal(unit.kind, "main");
  assert.equal(unit.parentUnitId, null);
  assert.equal(unit.order, 0);
  assert.equal(unit.status, "draft");
  assert.equal(unit.objective, "");
  assert.deepEqual(unit.collectionPoints, []);
});

test("Collection Point owns one non-nested Event reference group with durable receipts", () => {
  const input = fixture();
  const events = ["仓库对峙", "旧仓库封锁", "雾港启航"].map((title) => input.operations.createWorldObject({ projectId: input.project.id, type: "event", title, status: "draft", body: `${title}的作者草稿。` }));
  const unit = input.operations.createStoryUnit({ projectId: input.project.id, title: "雾港", linkedEntityIds: events.map((event) => event.id), sourceVersionRef: "work-version.collection-r1" });
  const created = input.operations.createStoryCollectionPoint({ projectId: input.project.id, unitId: unit.id, expectedUnitVersion: unit.version, operationId: "collection.create.warehouse", title: "仓库冲突", eventIds: events.slice(0, 2).map((event) => event.id), sourceVersionRef: "work-version.collection-r1", layout: { x: 320, y: 180, pinned: true } });
  assert.equal(created.conflict, false);
  assert.deepEqual(created.collectionPoint?.eventIds, events.slice(0, 2).map((event) => event.id));
  assert.deepEqual(created.receipt && [created.receipt.formalEventWrites, created.receipt.formalRelationWrites], [0, 0]);

  const repeated = input.operations.createStoryCollectionPoint({ projectId: input.project.id, unitId: unit.id, expectedUnitVersion: unit.version, operationId: "collection.create.warehouse", title: "仓库冲突", eventIds: events.slice(0, 2).map((event) => event.id), sourceVersionRef: "work-version.collection-r1" });
  assert.equal(repeated.collectionPoint?.id, created.collectionPoint?.id);
  assert.equal(repeated.unit.version, created.unit.version);

  assert.throws(() => input.operations.createStoryCollectionPoint({ projectId: input.project.id, unitId: unit.id, expectedUnitVersion: created.unit.version, operationId: "collection.create.overlap", title: "重叠集点", eventIds: [events[1]!.id, events[2]!.id], sourceVersionRef: "work-version.collection-r1" }), /one primary Collection Point/u);
  const updated = input.operations.updateStoryCollectionPoint({ projectId: input.project.id, unitId: unit.id, collectionPointId: created.collectionPoint!.id, expectedUnitVersion: created.unit.version, expectedRevision: 1, operationId: "collection.update.warehouse", title: "仓库决断", collapsed: true });
  assert.equal(updated.collectionPoint?.title, "仓库决断");
  assert.equal(updated.collectionPoint?.collapsed, true);
  assert.equal(updated.collectionPoint?.revision, 2);

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: path.join(input.rootPath, ".app-state.json") });
  assert.equal(restarted.readStoryUnit({ projectId: input.project.id, unitId: unit.id }).collectionPoints[0]?.title, "仓库决断");
  const dissolved = restarted.dissolveStoryCollectionPoint({ projectId: input.project.id, unitId: unit.id, collectionPointId: created.collectionPoint!.id, expectedUnitVersion: updated.unit.version, expectedRevision: 2, operationId: "collection.dissolve.warehouse" });
  assert.equal(dissolved.conflict, false);
  assert.deepEqual(dissolved.unit.collectionPoints, []);
  assert.equal(restarted.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id }).objects.filter((event) => events.some((source) => source.id === event.id)).length, 3);
});

test("six output types are peers and keep Unit lineage without promoting a candidate", () => {
  const input = fixture();
  const unit = input.operations.createStoryUnit({ projectId: input.project.id, title: "海雾中的决定", items: [{ id: "candidate.1", kind: "possibility", authority: "candidate", possibilityStatus: "selected-for-output", content: { branch: "留下" }, sourceRefs: [source("candidate.1")], createdBy: "ai" }] });
  const types: OutputArtifactType[] = ["novel", "screenplay", "storyboard", "comic", "motion-comic", "interactive-drama"];
  const artifacts = types.map((type) => input.operations.createOutputArtifact({ projectId: input.project.id, type, title: `${type} 制作稿`, sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: ["candidate.1"] }] }));

  assert.deepEqual(new Set(artifacts.map((artifact) => artifact.type)), new Set(types));
  assert.ok(artifacts.every((artifact) => artifact.sourceUnits[0]?.unitId === unit.id));
  assert.equal(input.operations.readStoryUnit({ projectId: input.project.id, unitId: unit.id }).items[0]?.authority, "candidate");
  assert.equal(input.operations.readStoryUnit({ projectId: input.project.id, unitId: unit.id }).items[0]?.possibilityStatus, "selected-for-output");
});

test("artifact creation fails closed for a stale Story Unit version and archived Units remain recoverable", () => {
  const input = fixture();
  const unit = input.operations.createStoryUnit({ projectId: input.project.id, title: "旧信的来源" });
  const changed = input.operations.updateStoryUnit({ projectId: input.project.id, unitId: unit.id, expectedVersion: unit.version, summary: "来源已经补充。" });
  assert.equal(changed.conflict, false);
  assert.throws(() => input.operations.createOutputArtifact({ projectId: input.project.id, type: "novel", title: "过期来源小说", sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: [] }] }), /stale/i);

  const artifact = input.operations.createOutputArtifact({ projectId: input.project.id, type: "novel", title: "来源小说", sourceUnits: [{ unitId: unit.id, unitVersion: changed.unit.version, role: "primary", includedItemIds: [] }] });
  const archived = input.operations.archiveStoryUnit({ projectId: input.project.id, unitId: unit.id, expectedVersion: changed.unit.version });
  assert.equal(archived.conflict, false);
  assert.equal(archived.unit.lifecycle, "archived");
  assert.equal(input.operations.readOutputArtifact({ projectId: input.project.id, artifactId: artifact.id }).sourceUnits[0]?.unitId, unit.id);
});

test("output artifacts are editable, versioned, and archive without erasing their Unit lineage", () => {
  const input = fixture();
  const unit = input.operations.createStoryUnit({ projectId: input.project.id, title: "雨夜的线索" });
  const artifact = input.operations.createOutputArtifact({
    projectId: input.project.id,
    type: "screenplay",
    title: "雨夜场景",
    sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: [] }],
    content: "INT. 钟楼 - 夜",
    structure: { episodes: [{ id: "episode.1", scenes: ["scene.1"] }] }
  });
  const updated = input.operations.updateOutputArtifact({
    projectId: input.project.id,
    artifactId: artifact.id,
    expectedVersion: artifact.version,
    content: "INT. 钟楼 - 夜\n\n守夜人停在钟下。",
    structure: { episodes: [{ id: "episode.1", scenes: ["scene.1"], dialogue: true }] }
  });
  assert.equal(updated.conflict, false);
  assert.match(updated.artifact.content, /守夜人/);
  assert.notEqual(updated.artifact.currentRevisionId, artifact.currentRevisionId);
  const stale = input.operations.updateOutputArtifact({ projectId: input.project.id, artifactId: artifact.id, expectedVersion: artifact.version, title: "不能覆盖" });
  assert.equal(stale.conflict, true);
  const archived = input.operations.archiveOutputArtifact({ projectId: input.project.id, artifactId: artifact.id, expectedVersion: updated.artifact.version });
  assert.equal(archived.conflict, false);
  assert.equal(archived.artifact.lifecycle, "archived");
  assert.equal(archived.artifact.sourceUnits[0]?.unitId, unit.id);
});

test("Creation media backlinks guard deletion without creating Canon or Event writes", () => {
  const input = fixture();
  const beforeObjects = input.operations.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id }).objects.length;
  const media = input.operations.createCreationMediaAsset({
    projectId: input.project.id,
    expectedCatalogHash: null,
    asset: { fileName: "灯塔.png", kind: "image", mimeType: "image/png", size: 4096, width: 1200, height: 800, durationMs: null, source: "author", license: "original", generatedBy: "", tags: ["灯塔"], relativePath: "assets/images/lighthouse.png" }
  });
  const artifact = input.operations.createOutputArtifact({
    projectId: input.project.id,
    type: "comic",
    title: "灯塔分格",
    structure: { pages: [{ id: "page.1", panels: [{ id: "panel.1", assetId: media.asset.id, sourceEventId: "event.read-only-ref" }] }] }
  });
  const catalog = input.operations.getCreationMediaCatalog({ projectId: input.project.id });
  assert.deepEqual(catalog.assets[0]?.backlinks, [{ artifactId: artifact.id, artifactTitle: "灯塔分格", structurePath: "structure.pages[0].panels[0].assetId" }]);
  assert.throws(() => input.operations.deleteCreationMediaAsset({ projectId: input.project.id, assetId: media.asset.id, expectedCatalogHash: catalog.contentHash }), /still used/u);
  const updated = input.operations.updateOutputArtifact({ projectId: input.project.id, artifactId: artifact.id, expectedVersion: artifact.version, structure: { pages: [{ id: "page.1", panels: [{ id: "panel.1", assetId: "", sourceEventId: "event.read-only-ref" }] }] } });
  assert.equal(updated.conflict, false);
  const unlinked = input.operations.getCreationMediaCatalog({ projectId: input.project.id });
  assert.equal(input.operations.deleteCreationMediaAsset({ projectId: input.project.id, assetId: media.asset.id, expectedCatalogHash: unlinked.contentHash }).catalog.assets.length, 0);
  assert.equal(input.operations.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id }).objects.length, beforeObjects);
});

test("legacy OutputArtifact opens through v2 projection without a read migration and upgrades on first save", () => {
  const input = fixture();
  const projectPath = input.operations.resolveProjectWorkspacePath({ projectId: input.project.id });
  const relativePath = "artifacts/legacy-output.md";
  const timestamp = "2026-08-16T00:00:00.000Z";
  createWorkspaceNote(projectPath, {
    id: "artifact.legacy-output",
    type: "artifact",
    title: "旧翻译稿",
    status: "draft",
    relativePath,
    frontmatter: {
      artifact_type: "novel",
      artifact_payload: JSON.stringify({ id: "artifact.legacy-output", type: "novel", title: "旧翻译稿", sourceUnits: [], generationBrief: { derivation: "translation", sourceArtifactId: "artifact.source", sourceArtifactVersion: "sha256:old" }, content: "# 旧文稿\n\n原文保留。", structure: { chapters: [{ title: "旧章" }] }, lifecycle: "draft", currentRevisionId: "legacy.r1", createdAt: timestamp, updatedAt: timestamp })
    },
    body: "# 旧翻译稿\n\nCompatibility fixture.\n"
  });
  const absolutePath = path.join(projectPath, relativePath);
  const before = readFileSync(absolutePath);
  const projected = input.operations.readOutputArtifact({ projectId: input.project.id, artifactId: "artifact.legacy-output" });
  assert.equal(projected.schemaVersion, "story-studio-output-artifact/v2");
  assert.equal(projected.provenance.migratedFromVersion, "story-studio-output-artifact/legacy");
  assert.equal(projected.provenance.sourceArtifactId, "artifact.source");
  assert.deepEqual(readFileSync(absolutePath), before, "opening a legacy artifact must be zero-write");
  const updated = input.operations.updateOutputArtifact({ projectId: input.project.id, artifactId: projected.id, expectedVersion: projected.version, content: `${projected.content}\n` });
  assert.equal(updated.conflict, false);
  assert.equal(updated.artifact.schemaVersion, "story-studio-output-artifact/v2");
  assert.equal(readFileSync(absolutePath, "utf8").includes("story-studio-output-artifact/v2"), true);
});

test("new novel OutputArtifacts use the neutral DocumentModel as their only content authority", () => {
  const input = fixture();
  const artifact = input.operations.createOutputArtifact({ projectId: input.project.id, type: "novel", title: "模型小说" });
  assert.equal(artifact.structure[NOVEL_DOCUMENT_AUTHORITY_KEY], "document-model-r1");
  const model = artifact.structure[NOVEL_DOCUMENT_MODEL_KEY] as NovelDocumentModelR1;
  assert.ok(model.revision.id);
  assert.match(artifact.content, /tianyan:novel-document/u);
  assert.throws(() => input.operations.updateOutputArtifact({ projectId: input.project.id, artifactId: artifact.id, expectedVersion: artifact.version, content: "独立 Markdown 不得成为第二权威" }), /自然编辑保存/u);
  const current = input.operations.readOutputArtifact({ projectId: input.project.id, artifactId: artifact.id });
  const paragraphId = Object.keys(model.blocks).find((id) => model.blocks[id]?.kind === "paragraph")!;
  const updatedModel = replaceBlockText(model, paragraphId, "第一句");
  const updated = input.operations.updateOutputArtifact({ projectId: input.project.id, artifactId: artifact.id, expectedVersion: current.version, structure: { ...current.structure, [NOVEL_DOCUMENT_MODEL_KEY]: withRevision(updatedModel, "edit", "2026-08-17T00:00:00.000Z") } });
  assert.equal(updated.conflict, false);
  assert.match(updated.artifact.content, /第一句/u);
});

test("legacy novel migration is previewable, explicit, and receipt-bound", () => {
  const input = fixture();
  const projectPath = input.operations.resolveProjectWorkspacePath({ projectId: input.project.id });
  const timestamp = "2026-08-17T00:00:00.000Z";
  createWorkspaceNote(projectPath, {
    id: "artifact.legacy-novel",
    type: "artifact",
    title: "旧小说",
    status: "draft",
    relativePath: "artifacts/legacy-novel.md",
    frontmatter: { artifact_type: "novel", artifact_payload: JSON.stringify({ id: "artifact.legacy-novel", type: "novel", title: "旧小说", sourceUnits: [], content: "# 第一章\n\n旧文稿保留。", structure: {}, lifecycle: "draft", currentRevisionId: "legacy.r1", createdAt: timestamp, updatedAt: timestamp }) },
    body: "# 旧小说\n\n旧文稿保留。\n"
  });
  const legacy = input.operations.readOutputArtifact({ projectId: input.project.id, artifactId: "artifact.legacy-novel" });
  const originalBytes = readFileSync(path.join(projectPath, legacy.relativeId));
  const sourceContentHash = `sha256:${createHash("sha256").update(legacy.content, "utf8").digest("hex")}`;
  const model = withRevision(migrateMarkdownToNovelDocumentModelR1(legacy.content, { documentId: legacy.id, title: legacy.title, createdAt: timestamp, sourceArtifactId: legacy.id, sourceArtifactVersion: legacy.version, sourceContentHash }), "migration", timestamp);
  const structure = { ...legacy.structure, [NOVEL_DOCUMENT_AUTHORITY_KEY]: "document-model-r1", [NOVEL_DOCUMENT_MODEL_KEY]: model, [NOVEL_MIGRATION_RECEIPT_KEY]: { version: "tianyan-novel-migration/r1", sourceArtifactVersion: legacy.version, sourceContentHash, parserVersion: model.version, confirmedAt: timestamp, originalContentPreserved: true } };
  assert.deepEqual(readFileSync(path.join(projectPath, legacy.relativeId)), originalBytes, "migration preview must be zero-write");
  const confirmed = input.operations.updateOutputArtifact({ projectId: input.project.id, artifactId: legacy.id, expectedVersion: legacy.version, structure });
  assert.equal(confirmed.conflict, false);
  assert.equal(confirmed.artifact.structure[NOVEL_DOCUMENT_AUTHORITY_KEY], "document-model-r1");
  assert.match(confirmed.artifact.content, /tianyan:block/u);
});
