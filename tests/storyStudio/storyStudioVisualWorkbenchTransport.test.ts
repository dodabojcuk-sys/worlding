import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Story Studio visual workbench transport persists documents and serves local map assets", async () => {
  const rootPath = path.join(tmpdir(), `world-os-story-studio-visual-transport-${process.pid}`);
  const stateFilePath = path.join(tmpdir(), `world-os-story-studio-visual-transport-state-${process.pid}.json`);
  const port = 45_000 + (process.pid % 1_000);
  const token = "story-studio-visual-workbench-token";
  rmSync(rootPath, { recursive: true, force: true });
  rmSync(stateFilePath, { force: true });
  mkdirSync(rootPath, { recursive: true });

  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const base = `http://127.0.0.1:${port}/__local/story-studio`;
    await post(`${base}/projects/create`, token, { title: "雾中灯塔", folderSlug: "mist-lighthouse" }, 201);
    await post(`${base}/projects/create`, token, { title: "空白世界", folderSlug: "blank-world" }, 201);
    const initialWriting = await post(`${base}/writing/start`, token, { projectId: "blank-world" }, 201);
    assert.equal(initialWriting.data.chapter.title, "未命名章节");
    assert.equal(initialWriting.data.scene.title, "新场景");
    assert.equal(initialWriting.data.writing.activeDocument.id, initialWriting.data.scene.id);
    const location = await post(`${base}/world-objects/create`, token, { projectId: "mist-lighthouse", type: "location", title: "旧灯塔" }, 201);
    const character = await post(`${base}/world-objects/create`, token, { projectId: "mist-lighthouse", type: "character", title: "林远" }, 201);
    const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
    const planning = workspace.createPlanningEvent({ projectId: "mist-lighthouse", title: "地下室线索被部分透露" });
    const review = authorControl.createPlanningEventImpactReview({ projectId: "mist-lighthouse", planningEventId: planning.id });
    authorControl.chooseImpactRoute({ projectId: "mist-lighthouse", reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
    const changeSet = authorControl.createAuthorChangeSet({ projectId: "mist-lighthouse", reviewId: review.id });
    authorControl.applyAuthorChangeSet({ projectId: "mist-lighthouse", changeSetId: changeSet.id });
    const timelineEvent = workspace.listWorldObjects({ projectId: "mist-lighthouse", type: "event" })
      .map((event) => workspace.readWorldObject({ projectId: "mist-lighthouse", objectId: event.id }))
      .find((event) => event.properties.source_change_set_id === changeSet.id)!;
    assert.ok(timelineEvent);
    const map = await post(`${base}/visual-documents/create`, token, { projectId: "mist-lighthouse", type: "map", title: "灯塔海域" }, 201);
    const graph = await post(`${base}/visual-documents/create`, token, { projectId: "mist-lighthouse", type: "graph", title: "核心关系" }, 201);
    const canvas = await post(`${base}/visual-documents/create`, token, { projectId: "mist-lighthouse", type: "canvas", title: "线索板" }, 201);
    const timeline = await post(`${base}/visual-documents/create`, token, { projectId: "mist-lighthouse", type: "timeline", title: "灯塔正史" }, 201);
    const tree = await post(`${base}/visual-documents/create`, token, { projectId: "mist-lighthouse", type: "tree", title: "守塔结构" }, 201);
    const denied = await post(`${base}/visual-documents/create`, "", { projectId: "mist-lighthouse", type: "map", title: "未授权" }, 403);
    assert.equal(denied.ok, false);

    const updatedDocument = {
      ...map.data,
      content: {
        ...map.data.content,
        markers: [{ id: "marker.1", objectId: location.data.id, layerId: "layer.main", x: 120, y: 80, label: "旧灯塔", color: "#63c3b5" }]
      }
    };
    const updated = await post(`${base}/visual-documents/update`, token, {
      projectId: "mist-lighthouse",
      relativePath: map.data.relativePath,
      expectedHash: map.data.contentHash,
      document: updatedDocument
    }, 200);
    assert.equal(updated.data.conflict, false);
    assert.equal(updated.data.document.content.markers[0].objectId, location.data.id);

    const canvasUpdated = await post(`${base}/visual-documents/update`, token, {
      projectId: "mist-lighthouse",
      relativePath: canvas.data.relativePath,
      expectedHash: canvas.data.contentHash,
      document: {
        ...canvas.data,
        content: { ...canvas.data.content, nodes: [{ id: "node.1", kind: "object", objectId: location.data.id, text: "", assetPath: "", x: 40, y: 60, width: 220, height: 110 }] }
      }
    }, 200);
    assert.equal(canvasUpdated.data.document.content.nodes[0].objectId, location.data.id);

    const graphUpdated = await post(`${base}/visual-documents/update`, token, {
      projectId: "mist-lighthouse",
      relativePath: graph.data.relativePath,
      expectedHash: graph.data.contentHash,
      document: {
        ...graph.data,
        content: {
          nodes: [{ id: "node.lin", objectId: character.data.id, x: 40, y: 50 }, { id: "node.lighthouse", objectId: location.data.id, x: 280, y: 50 }],
          edges: [{ id: "edge.guard", source: "node.lin", target: "node.lighthouse", relation: "守护", direction: "forward" }],
          filters: { objectTypes: [] }
        }
      }
    }, 200);
    assert.equal(graphUpdated.data.document.content.edges[0].id, "edge.guard");

    const timelineUpdated = await post(`${base}/visual-documents/update`, token, {
      projectId: "mist-lighthouse",
      relativePath: timeline.data.relativePath,
      expectedHash: timeline.data.contentHash,
      document: { ...timeline.data, content: { lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }], entries: [{ id: "entry.1", eventId: timelineEvent.id, laneId: "lane.canon", order: 0 }] } }
    }, 200);
    assert.equal(timelineUpdated.data.document.objectRefs[0], timelineEvent.id);

    const treeUpdated = await post(`${base}/visual-documents/update`, token, {
      projectId: "mist-lighthouse",
      relativePath: tree.data.relativePath,
      expectedHash: tree.data.contentHash,
      document: { ...tree.data, content: { sourceGraphPath: graph.data.relativePath, includedEdgeIds: ["edge.guard"], rootObjectIds: [character.data.id], collapsedObjectIds: [], direction: "LR" } }
    }, 200);
    assert.deepEqual(treeUpdated.data.document.objectRefs.sort(), [character.data.id, location.data.id].sort());

    await post(`${base}/workspace/selection`, token, { projectId: "mist-lighthouse", selection: { objectId: location.data.id, source: "canvas-node", documentId: canvas.data.id, blockId: "node.1", relationId: null } }, 200);
    const library = await get(`${base}/world-library?projectId=mist-lighthouse`, 200);
    assert.equal(library.data.selection.objectId, location.data.id);

    const chapter = await post(`${base}/writing/create`, token, { projectId: "mist-lighthouse", type: "chapter", title: "第三章" }, 201);
    const scene = await post(`${base}/writing/create`, token, { projectId: "mist-lighthouse", type: "scene", title: "地下室门前", chapterId: chapter.data.id }, 201);
    const sceneSaved = await post(`${base}/writing/update`, token, { projectId: "mist-lighthouse", documentId: scene.data.id, expectedHash: scene.data.revisionToken, status: "drafting", body: "# 地下室门前\n\n回到 [[旧灯塔]]。\n" }, 200);
    assert.equal(sceneSaved.data.conflict, false);
    assert.equal(sceneSaved.data.document.mentionedObjects[0].id, location.data.id);
    const writing = await get(`${base}/writing?projectId=mist-lighthouse`, 200);
    assert.equal(writing.data.activeDocument.id, scene.data.id);

    await post(`${base}/visual-documents/open`, token, { projectId: "mist-lighthouse", relativePath: map.data.relativePath, pane: "primary" }, 200);
    await post(`${base}/visual-documents/open`, token, { projectId: "mist-lighthouse", relativePath: graph.data.relativePath, pane: "secondary" }, 200);
    const split = await post(`${base}/visual-workbench/split`, token, { projectId: "mist-lighthouse", enabled: true }, 200);
    assert.equal(split.data.splitView, true);

    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const asset = await post(`${base}/visual-assets/import`, token, { projectId: "mist-lighthouse", category: "maps", filename: "map.png", mimeType: "image/png", base64: png }, 201);
    const assetResponse = await fetch(`${base}/visual-asset?projectId=mist-lighthouse&relativePath=${encodeURIComponent(asset.data.relativePath)}`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("content-type"), "image/png");
    assert.ok((await assetResponse.arrayBuffer()).byteLength > 0);

    const source = JSON.stringify(split);
    assert.doesNotMatch(source, new RegExp(escapeRegExp(rootPath)));
    assert.doesNotMatch(source, new RegExp(escapeRegExp(token)));
  } finally {
    server.kill("SIGTERM");
  }
});

async function post(url: string, token: string, body: Record<string, unknown>, expected: number) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-world-os-local-control-token": token } : {}) }, body: JSON.stringify(body) });
  const payload = await response.json();
  assert.equal(response.status, expected);
  return { ok: response.ok, ...payload };
}

async function get(url: string, expected: number) {
  const response = await fetch(url);
  const payload = await response.json();
  assert.equal(response.status, expected);
  return payload;
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/__local/story-studio/bootstrap`)).ok) return;
    } catch {
      // Startup is retried within the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for Story Studio server.");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
