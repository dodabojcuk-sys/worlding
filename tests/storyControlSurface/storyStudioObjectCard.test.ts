import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XCrx2QAAAABJRU5ErkJggg==";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-object-card-"));
  const stateFilePath = path.join(rootPath, ".app-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const character = operations.createWorldObject({ projectId: project.id, type: "character", title: "林远", aliases: ["守灯人"] });
  return { rootPath, stateFilePath, operations, project, character, projectRoot: path.join(rootPath, project.id) };
}

test("character cards migrate layout, block order, and local media into the presentation companion", () => {
  const input = fixture();
  const asset = input.operations.importVisualAsset({
    projectId: input.project.id,
    category: "images",
    filename: "lin-yuan.png",
    mimeType: "image/png",
    base64: pixelPng
  });
  const opened = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id });
  assert.deepEqual(opened.card.blocks.map((block) => block.kind), ["text", "properties", "media", "connections", "graph"]);
  assert.equal(opened.card.source, "virtual-v1");

  const saved = input.operations.updateWorldObject({
    projectId: input.project.id,
    objectId: opened.id,
    expectedHash: opened.revisionToken,
    presentationExpectedHash: opened.card.revisionToken,
    title: opened.title,
    status: opened.status,
    tags: opened.tags,
    aliases: opened.aliases,
    body: "# 林远\n\n守灯人仍然保持沉默。\n",
    card: {
      ...opened.card,
      layout: "vertical" as const,
      blocks: ["media", "text", "connections", "properties", "graph"].map((kind) => opened.card.blocks.find((block) => block.kind === kind)!),
      cover: { assetRef: asset.relativePath, fit: "cover" as const, position: { x: 0.5, y: 0.5 } },
      visual: { ...opened.card.visual, mediaAssets: [asset.relativePath] }
    }
  });
  assert.equal(saved.conflict, false);
  assert.equal(saved.object.card.layout, "vertical");
  assert.deepEqual(saved.object.card.blocks.map((block) => block.kind), ["media", "text", "connections", "properties", "graph"]);
  assert.equal(saved.presentationSaved, true);

  const source = readFileSync(path.join(input.projectRoot, opened.relativeId), "utf8");
  assert.doesNotMatch(source, /card_layout|card_blocks|cover:|media:/);
  assert.equal((source.match(/守灯人仍然保持沉默/g) || []).length, 1);
  const presentationSource = readFileSync(path.join(input.projectRoot, "documents/cards", `${opened.id}.card.json`), "utf8");
  assert.match(presentationSource, /story-card-presentation\/v2/);
  assert.match(presentationSource, /assets\/images\/lin-yuan\.png/);
  assert.doesNotMatch(presentationSource, /守灯人仍然保持沉默/);
  assert.equal(Object.hasOwn(JSON.parse(presentationSource), "title"), false);

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const restored = restarted.readWorldObject({ projectId: input.project.id, objectId: opened.id });
  assert.deepEqual(restored.card.blocks, saved.object.card.blocks);
  assert.equal(restored.card.source, "presentation-json");
  assert.match(restored.body, /守灯人仍然保持沉默/);
});

test("object card validation rejects unsupported blocks, traversal, and missing images", () => {
  const input = fixture();
  const opened = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id });
  const base = {
    projectId: input.project.id,
    objectId: opened.id,
    expectedHash: opened.revisionToken,
    presentationExpectedHash: opened.card.revisionToken,
    title: opened.title,
    status: opened.status,
    tags: opened.tags,
    aliases: opened.aliases,
    body: opened.body
  };

  assert.throws(() => input.operations.updateWorldObject({
    ...base,
    card: { ...opened.card, blocks: [...opened.card.blocks, { ...opened.card.blocks[0], id: "card-block.agent.01", kind: "agent" as "text" }] }
  }), /block.*not supported|kind.*not supported/i);
  assert.throws(() => input.operations.updateWorldObject({
    ...base,
    card: { ...opened.card, cover: { assetRef: "assets/images/../secret.png", fit: "cover", position: { x: 0.5, y: 0.5 } } }
  }), /asset reference is invalid/i);
  assert.throws(() => input.operations.updateWorldObject({
    ...base,
    card: { ...opened.card, cover: { assetRef: "assets/images/missing.png", fit: "cover", position: { x: 0.5, y: 0.5 } } }
  }), /does not exist|Asset/i);
});

test("map and graph card blocks derive appearances from stable object references", () => {
  const input = fixture();
  const location = input.operations.createWorldObject({ projectId: input.project.id, type: "location", title: "旧灯塔" });
  const map = input.operations.createVisualDocument({ projectId: input.project.id, type: "map", title: "灯塔海域" });
  const graph = input.operations.createVisualDocument({ projectId: input.project.id, type: "graph", title: "核心关系" });

  input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: map.relativePath,
    expectedHash: map.contentHash,
    document: {
      ...map,
      content: {
        ...map.content,
        markers: [{ id: "marker.lighthouse", objectId: location.id, layerId: "layer.main", x: 240, y: 160, label: "旧灯塔", color: "#67c3b5" }]
      }
    }
  });
  input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: graph.relativePath,
    expectedHash: graph.contentHash,
    document: {
      ...graph,
      content: {
        ...graph.content,
        nodes: [{ id: "node.lin", objectId: input.character.id, x: 280, y: 220 }]
      }
    }
  });

  const character = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id });
  const lighthouse = input.operations.readWorldObject({ projectId: input.project.id, objectId: location.id });
  assert.deepEqual(character.visualReferences, [{ type: "graph", title: "核心关系", relativePath: graph.relativePath }]);
  assert.deepEqual(lighthouse.visualReferences, [{ type: "map", title: "灯塔海域", relativePath: map.relativePath }]);

  const graphSource = readFileSync(path.join(input.projectRoot, graph.relativePath), "utf8");
  assert.match(graphSource, new RegExp(input.character.id.replace(".", "\\.")));
  assert.doesNotMatch(graphSource, /守灯人仍然保持沉默|# 林远/);
});
