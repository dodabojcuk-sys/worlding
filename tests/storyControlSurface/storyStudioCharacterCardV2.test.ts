import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  cardPresentationRelativePath,
  nextCardBlockId,
  readCardPresentation,
  saveCardPresentation
} from "../../src/storyWorkspace/cardPresentationRepository.mjs";
import { appendStoryCardSection, listUnplacedStoryCardSections, nextStoryCardSectionId } from "../../src/storyCardPresentation/storyCardSectionAnchors.ts";
import { readWorkspaceNote, updateWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

function fixture(options: Parameters<typeof createStoryStudioWorkspaceOperations>[0] extends infer T ? Partial<T> : never = {}) {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-character-card-v2-"));
  const stateFilePath = path.join(rootPath, ".app-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath, ...options });
  const project = operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const character = operations.createWorldObject({ projectId: project.id, type: "character", title: "林远", aliases: ["守灯人"], body: "# 林远\n\nCANARY_CHARACTER_PROSE_A\n" });
  const projectRoot = path.join(rootPath, project.id);
  return { rootPath, stateFilePath, projectRoot, operations, project, character };
}

function saveObject(operations: ReturnType<typeof createStoryStudioWorkspaceOperations>, projectId: string, object: ReturnType<typeof operations.readWorldObject>, patch: Partial<ReturnType<typeof operations.readWorldObject>["card"]> = {}, body = object.body) {
  return operations.updateWorldObject({
    projectId,
    objectId: object.id,
    expectedHash: object.revisionToken,
    presentationExpectedHash: object.card.revisionToken,
    title: object.title,
    status: object.status,
    tags: object.tags,
    aliases: object.aliases,
    body,
    card: { ...object.card, ...patch }
  });
}

test("v1 open is read-only and first save migrates with stable IDs, separate hashes, cleanup, and restart parity", () => {
  const input = fixture();
  const notePath = path.join(input.projectRoot, input.character.relativeId);
  const beforeSource = readFileSync(notePath, "utf8");
  const beforeMtime = statSync(notePath).mtimeMs;
  const first = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id });
  const second = input.operations.openWorldObject({ projectId: input.project.id, objectId: input.character.id });
  assert.equal(first.card.source, "virtual-v1");
  assert.deepEqual(first.card.blocks.map((block) => block.id), second.card.blocks.map((block) => block.id));
  assert.equal(existsSync(path.join(input.projectRoot, "documents/cards")), false);
  assert.equal(readFileSync(notePath, "utf8"), beforeSource);
  assert.equal(statSync(notePath).mtimeMs, beforeMtime);

  const saved = saveObject(input.operations, input.project.id, first, { layout: "vertical" });
  assert.equal(saved.conflict, false);
  assert.equal(saved.presentationSaved, true);
  assert.equal(saved.object.card.source, "presentation-json");
  assert.notEqual(saved.object.card.revisionToken, saved.object.revisionToken);
  assert.doesNotMatch(readFileSync(notePath, "utf8"), /card_layout|card_blocks|\ncover:|\nmedia:/);
  const companionPath = path.join(input.projectRoot, cardPresentationRelativePath(first.id));
  assert.equal(existsSync(companionPath), true);
  assert.deepEqual(saved.object.card.blocks.map((block) => block.id), first.card.blocks.map((block) => block.id));

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const restored = restarted.readWorldObject({ projectId: input.project.id, objectId: first.id });
  assert.deepEqual(restored.card.blocks, saved.object.card.blocks);
  assert.equal(restored.card.layout, "vertical");
  assert.ok(restarted.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "card", id: first.id } }).revisions.length >= 1);
  assert.ok(restarted.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "object", id: first.id } }).revisions.length >= 2);
});

test("duplicate text and secret blocks keep prose in Markdown, preserve IDs through reorder, and leave removed sections unplaced", () => {
  const input = fixture();
  const opened = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id });
  let body = opened.body;
  const blocks = [...opened.card.blocks];
  for (const kind of ["text", "secret", "secret"] as const) {
    const sectionId = nextStoryCardSectionId(body, kind);
    const canary = kind === "text" ? "CANARY_TEXT_SECOND" : blocks.some((block) => block.kind === "secret") ? "CANARY_SECRET_BETA" : "CANARY_SECRET_ALPHA";
    body = appendStoryCardSection(body, { id: sectionId, kind, content: `${canary}\n` });
    blocks.push({
      id: nextCardBlockId(opened.id, kind, blocks.map((block) => block.id)),
      kind,
      contentRef: `markdown-section.${sectionId}`,
      collapsed: kind === "secret",
      size: kind === "text" ? "large" : "medium"
    });
  }
  const reordered = [blocks.at(-1)!, ...blocks.slice(0, -1)];
  const saved = saveObject(input.operations, input.project.id, opened, { blocks: reordered }, body);
  assert.equal(saved.conflict, false);
  assert.equal(saved.object.card.blocks.filter((block) => block.kind === "text").length, 2);
  assert.equal(saved.object.card.blocks.filter((block) => block.kind === "secret").length, 2);
  assert.deepEqual(saved.object.card.blocks.map((block) => block.id), reordered.map((block) => block.id));
  const markdownHistory = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "object", id: opened.id } });
  const presentationHistory = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "card", id: opened.id } });
  assert.ok(markdownHistory.revisions[0].operationId);
  assert.equal(markdownHistory.revisions[0].operationId, presentationHistory.revisions[0].operationId);
  const presentationSource = readFileSync(path.join(input.projectRoot, cardPresentationRelativePath(opened.id)), "utf8");
  for (const canary of ["CANARY_CHARACTER_PROSE_A", "CANARY_TEXT_SECOND", "CANARY_SECRET_ALPHA", "CANARY_SECRET_BETA"]) assert.equal(presentationSource.includes(canary), false);
  const markdownSource = readFileSync(path.join(input.projectRoot, opened.relativeId), "utf8");
  for (const canary of ["CANARY_CHARACTER_PROSE_A", "CANARY_TEXT_SECOND", "CANARY_SECRET_ALPHA", "CANARY_SECRET_BETA"]) assert.equal(markdownSource.includes(canary), true);

  const secretToRemove = saved.object.card.blocks.find((block) => block.kind === "secret")!;
  const removed = saveObject(input.operations, input.project.id, saved.object, { blocks: saved.object.card.blocks.filter((block) => block.id !== secretToRemove.id) });
  assert.equal(removed.presentationSaved, true);
  const unplaced = listUnplacedStoryCardSections(removed.object.body, removed.object.card.blocks.flatMap((block) => block.contentRef ? [block.contentRef] : []));
  assert.equal(unplaced.some((section) => `markdown-section.${section.id}` === secretToRemove.contentRef), true);
});

test("Markdown-first partial success preserves new content as unplaced when presentation changes after validation", () => {
  const input = fixture();
  const migrated = saveObject(input.operations, input.project.id, input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id }));
  let hookRan = false;
  const racing = createStoryStudioWorkspaceOperations({
    rootPath: input.rootPath,
    stateFilePath: input.stateFilePath,
    beforeCardPresentationSave: ({ projectPath, objectId }) => {
      if (hookRan) return;
      hookRan = true;
      const note = readWorkspaceNote(projectPath, migrated.object.relativeId);
      const current = readCardPresentation(projectPath, { objectId, legacyCard: null, markdownBody: note.body });
      saveCardPresentation(projectPath, { objectId, expectedContentHash: current.contentHash, document: { ...current.document, layout: current.document.layout === "horizontal" ? "vertical" : "horizontal" }, markdownBody: note.body });
    }
  });
  const opened = racing.readWorldObject({ projectId: input.project.id, objectId: migrated.object.id });
  const sectionId = nextStoryCardSectionId(opened.body, "secret");
  const body = appendStoryCardSection(opened.body, { id: sectionId, kind: "secret", content: "CANARY_SECRET_PARTIAL\n" });
  const block = { id: nextCardBlockId(opened.id, "secret", opened.card.blocks.map((item) => item.id)), kind: "secret" as const, contentRef: `markdown-section.${sectionId}`, collapsed: true, size: "medium" as const };
  const result = saveObject(racing, input.project.id, opened, { blocks: [...opened.card.blocks, block] }, body);
  assert.equal(result.characterContentSaved, true);
  assert.equal(result.presentationSaved, false);
  assert.equal(result.presentationConflict, true);
  assert.equal(result.unplacedContentCreated, true);
  assert.match(result.object.body, /CANARY_SECRET_PARTIAL/);
  assert.equal(result.object.card.blocks.some((item) => item.id === block.id), false);
  assert.equal(listUnplacedStoryCardSections(result.object.body, result.object.card.blocks.flatMap((item) => item.contentRef ? [item.contentRef] : [])).some((section) => section.id === sectionId), true);
});

test("Markdown and presentation stale writes reject independently without authorizing the other owner", () => {
  const input = fixture();
  const migrated = saveObject(input.operations, input.project.id, input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id })).object;
  const notePath = path.join(input.projectRoot, migrated.relativeId);
  writeFileSync(notePath, `${readFileSync(notePath, "utf8")}\n外部 Markdown 修改。\n`);
  const markdownConflict = saveObject(input.operations, input.project.id, migrated, { layout: "vertical" }, `${migrated.body}\n本地草稿`);
  assert.equal(markdownConflict.markdownConflict, true);
  assert.equal(markdownConflict.presentationSaved, false);
  assert.match(readFileSync(notePath, "utf8"), /外部 Markdown 修改/);

  const fresh = input.operations.readWorldObject({ projectId: input.project.id, objectId: migrated.id });
  const currentPresentation = readCardPresentation(input.projectRoot, { objectId: fresh.id, legacyCard: null, markdownBody: fresh.body });
  saveCardPresentation(input.projectRoot, { objectId: fresh.id, expectedContentHash: currentPresentation.contentHash, document: { ...currentPresentation.document, layout: "vertical" }, markdownBody: fresh.body });
  const beforeMarkdown = readFileSync(notePath, "utf8");
  const presentationConflict = saveObject(input.operations, input.project.id, fresh, { layout: "horizontal" });
  assert.equal(presentationConflict.presentationConflict, true);
  assert.equal(presentationConflict.characterContentSaved, false);
  assert.equal(readFileSync(notePath, "utf8"), beforeMarkdown);
});

test("explicit owner intent lets pure Markdown and pure presentation saves ignore drift in the untouched owner", () => {
  const input = fixture();
  const migrated = saveObject(input.operations, input.project.id, input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id })).object;
  const presentation = readCardPresentation(input.projectRoot, { objectId: migrated.id, legacyCard: null, markdownBody: migrated.body });
  saveCardPresentation(input.projectRoot, { objectId: migrated.id, expectedContentHash: presentation.contentHash, document: { ...presentation.document, visual: { ...presentation.document.visual, density: "compact" } }, markdownBody: migrated.body });
  const markdownOnly = input.operations.updateWorldObject({
    projectId: input.project.id,
    objectId: migrated.id,
    expectedHash: migrated.revisionToken,
    presentationExpectedHash: migrated.card.revisionToken,
    writeMarkdown: true,
    writePresentation: false,
    title: migrated.title,
    status: migrated.status,
    tags: migrated.tags,
    aliases: migrated.aliases,
    body: `${migrated.body}\n纯 Markdown 修改。\n`,
    card: migrated.card
  });
  assert.equal(markdownOnly.conflict, false);
  assert.equal(markdownOnly.characterContentSaved, true);
  assert.equal(markdownOnly.presentationSaved, false);
  assert.equal(markdownOnly.object.card.visual.density, "compact");

  const beforePresentationOnly = markdownOnly.object;
  writeFileSync(path.join(input.projectRoot, beforePresentationOnly.relativeId), `${readFileSync(path.join(input.projectRoot, beforePresentationOnly.relativeId), "utf8")}\n外部内容漂移。\n`);
  const presentationOnly = input.operations.updateWorldObject({
    projectId: input.project.id,
    objectId: beforePresentationOnly.id,
    expectedHash: beforePresentationOnly.revisionToken,
    presentationExpectedHash: beforePresentationOnly.card.revisionToken,
    writeMarkdown: false,
    writePresentation: true,
    title: beforePresentationOnly.title,
    status: beforePresentationOnly.status,
    tags: beforePresentationOnly.tags,
    aliases: beforePresentationOnly.aliases,
    body: beforePresentationOnly.body,
    card: { ...beforePresentationOnly.card, layout: "vertical" }
  });
  assert.equal(presentationOnly.conflict, false);
  assert.equal(presentationOnly.characterContentSaved, false);
  assert.equal(presentationOnly.presentationSaved, true);
  assert.match(presentationOnly.object.body, /外部内容漂移/);
});

test("migration cleanup conflict keeps the companion authoritative and exposes a retry notice", () => {
  const input = fixture();
  let changed = false;
  const operations = createStoryStudioWorkspaceOperations({
    rootPath: input.rootPath,
    stateFilePath: input.stateFilePath,
    beforeLegacyCardCleanup: ({ projectPath }) => {
      if (changed) return;
      changed = true;
      const current = readWorkspaceNote(projectPath, input.character.relativeId);
      updateWorkspaceNote(projectPath, { relativePath: current.relativePath, expectedContentHash: current.contentHash, body: `${current.body}\n外部清理竞争。\n` });
    }
  });
  const opened = operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id });
  const result = saveObject(operations, input.project.id, opened, { layout: "vertical" });
  assert.equal(result.presentationSaved, true);
  assert.equal(result.migrationCleanupPending, true);
  assert.equal(result.object.card.source, "presentation-json");
  assert.equal(result.object.card.migration.cleanupPending, true);
  assert.match(readFileSync(path.join(input.projectRoot, input.character.relativeId), "utf8"), /card_layout/);
  assert.equal(result.object.card.layout, "vertical");
});

test("presentation restore appends card history without rewriting Markdown", () => {
  const input = fixture();
  const first = saveObject(input.operations, input.project.id, input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id })).object;
  const second = saveObject(input.operations, input.project.id, first, { layout: "vertical" }).object;
  const ref = { kind: "card" as const, id: second.id };
  const beforeHistory = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref });
  const restoreTarget = beforeHistory.revisions.at(-1)!;
  const markdownBefore = readFileSync(path.join(input.projectRoot, second.relativeId), "utf8");
  const restored = input.operations.restoreDocumentRevision({ projectId: input.project.id, ref, revisionId: restoreTarget.id, expectedHash: second.card.revisionToken! });
  assert.equal(restored.conflict, false);
  assert.equal(restored.history.revisions.length, beforeHistory.revisions.length + 1);
  assert.equal(readFileSync(path.join(input.projectRoot, second.relativeId), "utf8"), markdownBefore);
  assert.equal(input.operations.readWorldObject({ projectId: input.project.id, objectId: second.id }).card.layout, "horizontal");
});
