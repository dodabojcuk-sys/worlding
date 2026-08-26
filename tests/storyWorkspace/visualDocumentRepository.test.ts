import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createStoryWorkspace,
  createWorkspaceNote,
  updateWorkspaceNote
} from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  createVisualDocument,
  importVisualAsset,
  listVisualDocuments,
  readVisualDocument,
  updateVisualDocument,
  validateVisualDocumentUpdate
} from "../../src/storyWorkspace/visualDocumentRepository.mjs";
import {
  acceptRelationProposal,
  createRelationProposal,
  immediateNeighborhood,
  rejectRelationProposal,
  shortestRelationshipPath
} from "../../apps/story-studio/src/lib/graphAuthoring.ts";

function createFixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-visual-doc-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const location = createWorkspaceNote(rootPath, {
    id: "location.old-lighthouse",
    type: "location",
    title: "旧灯塔",
    status: "active",
    body: "# 旧灯塔\n"
  });
  const character = createWorkspaceNote(rootPath, {
    id: "character.lin-yuan",
    type: "character",
    title: "林远",
    status: "active",
    body: "# 林远\n"
  });
  return { rootPath, location, character };
}

test("visual document repository persists open map and graph envelopes with stable object references", () => {
  const fixture = createFixture();
  const map = createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "灯塔海域",
    content: {
      baseImage: null,
      layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: false }],
      markers: [{ id: "marker.lighthouse", objectId: fixture.location.id, layerId: "layer.main", x: 42, y: 68, label: "旧灯塔", color: "#63c3b5" }],
      regions: [],
      labels: []
    }
  });
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "核心关系",
    content: {
      nodes: [
        { id: "node.lin", objectId: fixture.character.id, x: 80, y: 120 },
        { id: "node.lighthouse", objectId: fixture.location.id, x: 420, y: 120 }
      ],
      edges: [{ id: "edge.guard", source: "node.lin", target: "node.lighthouse", relation: "守护", direction: "forward" }],
      filters: { objectTypes: [] }
    }
  });

  assert.equal(map.version, "story-visual-document/v1");
  assert.equal(map.relativePath, "documents/maps/灯塔海域.map.json");
  assert.deepEqual(map.objectRefs, [fixture.location.id]);
  assert.equal(graph.relativePath, "documents/graphs/核心关系.graph.json");
  assert.deepEqual(graph.objectRefs, [fixture.character.id, fixture.location.id]);
  assert.deepEqual(listVisualDocuments(fixture.rootPath).map((item) => item.type), ["graph", "map"]);
  assert.deepEqual(readVisualDocument(fixture.rootPath, map.relativePath), map);
});

test("Map v1 content migrates additively to backgrounds and author-facing styles", () => {
  const fixture = createFixture();
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const asset = importVisualAsset(fixture.rootPath, {
    category: "maps",
    filename: "灯塔地表.png",
    mimeType: "image/png",
    base64: png
  });
  const map = createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "迁移地图",
    content: {
      baseImage: { assetPath: asset.relativePath, mimeType: asset.mimeType, width: 1200, height: 800 },
      layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: false }],
      markers: [{ id: "marker.lin", objectId: fixture.character.id, layerId: "layer.main", x: 120, y: 180, label: "旧复制标题", color: "#63c3b5" }],
      regions: [{ id: "region.harbor", title: "港区", layerId: "layer.main", color: "#d08b43", points: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 40, y: 90 }] }],
      labels: [{ id: "label.harbor", text: "港口", layerId: "layer.main", x: 40, y: 40 }]
    }
  });

  assert.equal(map.version, "story-visual-document/v1");
  assert.equal(map.content.backgrounds.length, 1);
  assert.equal(map.content.backgrounds[0].id, "background.main");
  assert.equal(map.content.activeBackgroundId, "background.main");
  assert.equal("label" in map.content.markers[0], false);
  assert.equal(map.content.markers[0].labelMode, "always");
  assert.equal(map.content.regions[0].fillOpacity, 0.16);
  assert.equal(map.content.labels[0].treatment, "outline");
});

test("Map 2.0 validates multiple backgrounds, polygon styles, and label bounds", () => {
  const fixture = createFixture();
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const surface = importVisualAsset(fixture.rootPath, { category: "maps", filename: "地表.png", mimeType: "image/png", base64: png });
  const underground = importVisualAsset(fixture.rootPath, { category: "maps", filename: "地下.png", mimeType: "image/png", base64: png });
  const map = createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "双层地图",
    content: {
      baseImage: null,
      backgrounds: [
        { id: "background.surface", title: "地表", assetPath: surface.relativePath, mimeType: surface.mimeType, width: 1200, height: 800, opacity: 1, visible: true },
        { id: "background.underground", title: "地下", assetPath: underground.relativePath, mimeType: underground.mimeType, width: 900, height: 700, opacity: 0.75, visible: true }
      ],
      activeBackgroundId: "background.underground",
      layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: false }],
      markers: [{ id: "marker.lin", objectId: fixture.character.id, layerId: "layer.main", x: 120, y: 180, color: "#63c3b5", labelMode: "hover" }],
      regions: [{ id: "region.harbor", title: "港区", layerId: "layer.main", points: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 40, y: 90 }], strokeColor: "#d08b43", fillColor: "#234f49", fillOpacity: 0.35, objectId: fixture.location.id }],
      labels: [{ id: "label.harbor", text: "港口", layerId: "layer.main", x: 40, y: 40, fontSize: 22, fontWeight: 700, align: "center", rotation: -12, visible: true, treatment: "plate" }]
    }
  });

  assert.equal(map.content.backgrounds.length, 2);
  assert.equal(map.content.activeBackgroundId, "background.underground");
  assert.equal(map.content.baseImage?.assetPath, underground.relativePath);
  assert.deepEqual(map.objectRefs, [fixture.character.id, fixture.location.id].sort());
  assert.throws(() => updateVisualDocument(fixture.rootPath, {
    relativePath: map.relativePath,
    expectedContentHash: map.contentHash,
    document: { ...map, content: { ...map.content, labels: [{ ...map.content.labels[0], fontSize: 200 }] } }
  }), /font size must be between/i);
  assert.throws(() => updateVisualDocument(fixture.rootPath, {
    relativePath: map.relativePath,
    expectedContentHash: map.contentHash,
    document: { ...map, content: { ...map.content, backgrounds: map.content.backgrounds.map((item) => ({ ...item, opacity: 2 })) } }
  }), /opacity must be between/i);
});

test("visual documents reject invalid references and stale external edits", () => {
  const fixture = createFixture();
  assert.throws(() => createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "坏地图",
    content: {
      baseImage: null,
      layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: false }],
      markers: [{ id: "marker.missing", objectId: "location.missing", layerId: "layer.main", x: 0, y: 0, label: "不存在", color: "#ffffff" }],
      regions: [],
      labels: []
    }
  }), /unknown world object/i);

  const map = createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "灯塔海域",
    content: { baseImage: null, layers: [], markers: [], regions: [], labels: [] }
  });
  const absolutePath = path.join(fixture.rootPath, map.relativePath);
  const external = JSON.parse(readFileSync(absolutePath, "utf8"));
  external.title = "外部修改的地图";
  writeFileSync(absolutePath, `${JSON.stringify(external, null, 2)}\n`, "utf8");

  const result = updateVisualDocument(fixture.rootPath, {
    relativePath: map.relativePath,
    expectedContentHash: map.contentHash,
    document: { ...map, title: "本地修改" }
  });
  assert.equal(result.conflict, true);
  assert.equal(result.document.title, "外部修改的地图");
});

test("visual documents with the same title receive unique paths and stable IDs", () => {
  const fixture = createFixture();
  const first = createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "灯塔海域"
  });
  const second = createVisualDocument(fixture.rootPath, {
    type: "map",
    title: "灯塔海域"
  });

  assert.notEqual(first.relativePath, second.relativePath);
  assert.notEqual(first.id, second.id);
  assert.equal(first.id, "map.灯塔海域");
  assert.equal(second.id, "map.灯塔海域-2");
  assert.equal(readVisualDocument(fixture.rootPath, second.relativePath).id, second.id);
});

test("visual asset import writes allowlisted local image data outside .world-os", () => {
  const fixture = createFixture();
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const asset = importVisualAsset(fixture.rootPath, {
    category: "maps",
    filename: "灯塔 海域.png",
    mimeType: "image/png",
    base64: png
  });

  assert.match(asset.relativePath, /^assets\/maps\//);
  assert.equal(asset.mimeType, "image/png");
  assert.ok(readFileSync(path.join(fixture.rootPath, asset.relativePath)).length > 0);
  assert.doesNotMatch(asset.relativePath, /^\.world-os\//);
  assert.throws(() => importVisualAsset(fixture.rootPath, {
    category: "maps",
    filename: "map.svg",
    mimeType: "image/svg+xml",
    base64: Buffer.from("<svg/>").toString("base64")
  }), /image type/i);
});

test("timeline accepts only committed author-confirmed event Markdown and stores references without prose", () => {
  const fixture = createFixture();
  const committed = createWorkspaceNote(fixture.rootPath, {
    id: "event.basement-clue",
    type: "event",
    title: "地下室线索被部分透露",
    status: "committed",
    frontmatter: { tags: ["作者确认"] },
    body: "# 地下室线索被部分透露\n\n林远只说出了一部分。\n"
  });
  const candidate = createWorkspaceNote(fixture.rootPath, {
    id: "event.candidate",
    type: "event",
    title: "尚未确认的候选事件",
    status: "drafting",
    frontmatter: { tags: ["候选"] },
    body: "# 尚未确认的候选事件\n"
  });

  const timeline = createVisualDocument(fixture.rootPath, {
    type: "timeline",
    title: "灯塔正史",
    content: {
      lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }],
      entries: [{ id: "entry.1", eventId: committed.id, laneId: "lane.canon", order: 0 }]
    }
  });

  assert.equal(timeline.relativePath, "documents/timelines/灯塔正史.timeline.json");
  assert.deepEqual(timeline.objectRefs, [committed.id]);
  const source = readFileSync(path.join(fixture.rootPath, timeline.relativePath), "utf8");
  assert.doesNotMatch(source, /林远只说出了一部分/);
  updateWorkspaceNote(fixture.rootPath, { relativePath: committed.relativePath, frontmatter: { status: "drafting", tags: ["候选"] } });
  const drifted = readVisualDocument(fixture.rootPath, timeline.relativePath);
  assert.deepEqual(drifted.content.entries.map((entry) => entry.eventId), [committed.id]);
  assert.equal(drifted.diagnostics.timeline.entryStates[0].status, "ineligible");
  assert.throws(() => createVisualDocument(fixture.rootPath, {
    type: "timeline",
    title: "错误时间线",
    content: {
      lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }],
      entries: [{ id: "entry.1", eventId: candidate.id, laneId: "lane.canon", order: 0 }]
    }
  }), /committed author-confirmed event/i);
});

test("Timeline v1 reads additively without rewriting bytes and saves deterministic v2 content", () => {
  const fixture = createFixture();
  const first = createWorkspaceNote(fixture.rootPath, {
    id: "event.first",
    type: "event",
    title: "先进入灯塔",
    status: "committed",
    frontmatter: { tags: ["作者确认"] },
    body: "# 先进入灯塔\n"
  });
  const second = createWorkspaceNote(fixture.rootPath, {
    id: "event.second",
    type: "event",
    title: "后发现旧信",
    status: "committed",
    frontmatter: { tags: ["作者确认"] },
    body: "# 后发现旧信\n"
  });
  const timeline = createVisualDocument(fixture.rootPath, { type: "timeline", title: "旧版时间线" });
  const timelinePath = path.join(fixture.rootPath, timeline.relativePath);
  const legacy = JSON.parse(readFileSync(timelinePath, "utf8"));
  legacy.content = {
    lanes: [
      { id: "lane.canon", title: "正史", color: "#63c3b5" },
      { id: "lane.echo", title: "回声", color: "#d08b43" }
    ],
    entries: [
      { id: "entry.second", eventId: second.id, laneId: "lane.echo", order: 0 },
      { id: "entry.first", eventId: first.id, laneId: "lane.canon", order: 7 }
    ]
  };
  const legacySource = `${JSON.stringify(legacy, null, 2)}\n`;
  writeFileSync(timelinePath, legacySource, "utf8");

  const opened = readVisualDocument(fixture.rootPath, timeline.relativePath);
  assert.equal(readFileSync(timelinePath, "utf8"), legacySource);
  assert.deepEqual(opened.content.lanes.map((lane) => [lane.id, lane.order]), [["lane.canon", 0], ["lane.echo", 1]]);
  assert.deepEqual(opened.content.entries.map((entry) => [entry.id, entry.order]), [["entry.first", 0], ["entry.second", 1]]);
  assert.deepEqual(opened.content.trackViews.map((track) => track.kind), ["canon", "planning", "custom"]);
  assert.deepEqual(opened.content.dependencies, []);
  assert.deepEqual(opened.content.filters, { mode: "all", objectIds: [] });
  assert.deepEqual(opened.content.viewport, { focusedTrackId: null, density: "comfortable" });

  const saved = updateVisualDocument(fixture.rootPath, {
    relativePath: opened.relativePath,
    expectedContentHash: opened.contentHash,
    document: opened
  });
  assert.equal(saved.conflict, false);
  const persisted = JSON.parse(readFileSync(timelinePath, "utf8"));
  assert.ok(Array.isArray(persisted.content.trackViews));
  assert.deepEqual(persisted.content.entries.map((entry) => entry.id), ["entry.first", "entry.second"]);
  assert.equal("diagnostics" in persisted, false);
});

test("Timeline v2 preserves invalid reads while operation-level validation permits cleanup and display-only saves", () => {
  const fixture = createFixture();
  const committed = createWorkspaceNote(fixture.rootPath, {
    id: "event.valid",
    type: "event",
    title: "已确认事件",
    status: "committed",
    frontmatter: { tags: ["作者确认"] },
    body: "# 已确认事件\n"
  });
  const timeline = createVisualDocument(fixture.rootPath, {
    type: "timeline",
    title: "可修复时间线",
    content: {
      lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }],
      entries: [{ id: "entry.valid", eventId: committed.id, laneId: "lane.canon", order: 0 }]
    }
  });
  const timelinePath = path.join(fixture.rootPath, timeline.relativePath);
  const external = JSON.parse(readFileSync(timelinePath, "utf8"));
  external.content.entries.push({ id: "entry.missing", eventId: "event.missing", laneId: "lane.canon", order: 1 });
  external.content.dependencies = [{ id: "dependency.missing", fromEventId: committed.id, toEventId: "event.missing", kind: "requires" }];
  writeFileSync(timelinePath, `${JSON.stringify(external, null, 2)}\n`, "utf8");

  const broken = readVisualDocument(fixture.rootPath, timeline.relativePath);
  assert.deepEqual(broken.content.entries.map((entry) => entry.eventId), [committed.id, "event.missing"]);
  assert.ok(broken.diagnostics.timeline.issues.some((issue) => issue.code === "missing-event"));
  assert.ok(broken.diagnostics.timeline.issues.some((issue) => issue.code === "missing-dependency-endpoint"));

  const displayOnly = updateVisualDocument(fixture.rootPath, {
    relativePath: broken.relativePath,
    expectedContentHash: broken.contentHash,
    document: { ...broken, content: { ...broken.content, filters: { mode: "planning", objectIds: [] } } }
  });
  assert.equal(displayOnly.conflict, false);
  assert.deepEqual(displayOnly.document.content.entries.map((entry) => entry.eventId), [committed.id, "event.missing"]);

  assert.throws(() => updateVisualDocument(fixture.rootPath, {
    relativePath: displayOnly.document.relativePath,
    expectedContentHash: displayOnly.document.contentHash,
    document: {
      ...displayOnly.document,
      content: {
        ...displayOnly.document.content,
        entries: [...displayOnly.document.content.entries, { id: "entry.new-missing", eventId: "event.other-missing", laneId: "lane.canon", order: 2 }]
      }
    }
  }), /missing event|invalid timeline/i);

  const cleaned = updateVisualDocument(fixture.rootPath, {
    relativePath: displayOnly.document.relativePath,
    expectedContentHash: displayOnly.document.contentHash,
    document: {
      ...displayOnly.document,
      content: {
        ...displayOnly.document.content,
        entries: displayOnly.document.content.entries.filter((entry) => entry.eventId !== "event.missing"),
        dependencies: []
      }
    }
  });
  assert.equal(cleaned.conflict, false);
  assert.deepEqual(cleaned.document.diagnostics.timeline.issues, []);
});

test("Timeline v2 dependency validation is repository-owned, cycle-safe, and mutation-free", () => {
  const fixture = createFixture();
  const createEvent = (id: string, status: string, tags: string[]) => createWorkspaceNote(fixture.rootPath, {
    id,
    type: "event",
    title: id,
    status,
    frontmatter: { tags },
    body: `# ${id}\n\nDependency source prose.\n`
  });
  const canonA = createEvent("event.canon-a", "committed", ["作者确认"]);
  const canonB = createEvent("event.canon-b", "committed", ["作者确认"]);
  const planA = createEvent("event.plan-a", "planned", ["作者规划"]);
  const planB = createEvent("event.plan-b", "planned", ["作者规划"]);
  const entries = [canonA, canonB, planA, planB].map((event, index) => ({ id: `entry.${index + 1}`, eventId: event.id, laneId: "lane.canon", order: index }));
  const timeline = createVisualDocument(fixture.rootPath, {
    type: "timeline",
    title: "依赖时间线",
    content: {
      lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }],
      entries,
      dependencies: [
        { id: "dependency.1", fromEventId: canonA.id, toEventId: canonB.id, kind: "requires" },
        { id: "dependency.2", fromEventId: canonB.id, toEventId: planA.id, kind: "requires" },
        { id: "dependency.3", fromEventId: planA.id, toEventId: planB.id, kind: "requires" }
      ]
    }
  });
  assert.deepEqual(timeline.content.entries.map((entry) => entry.order), [0, 1, 2, 3]);
  assert.equal(timeline.content.dependencies.length, 3);
  const markdownBefore = [canonA, canonB, planA, planB].map((event) => readFileSync(path.join(fixture.rootPath, event.relativePath), "utf8"));
  const source = readFileSync(path.join(fixture.rootPath, timeline.relativePath), "utf8");
  assert.doesNotMatch(source, /Dependency source prose/);

  const cycleCandidate = {
    ...timeline,
    content: {
      ...timeline.content,
      dependencies: [
        ...timeline.content.dependencies,
        { id: "dependency.cycle", fromEventId: planB.id, toEventId: planA.id, kind: "requires" }
      ]
    }
  };
  const validation = validateVisualDocumentUpdate(fixture.rootPath, {
    relativePath: timeline.relativePath,
    expectedContentHash: timeline.contentHash,
    document: cycleCandidate
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.conflict, false);
  assert.match(validation.reason, /cycle|loop/i);
  assert.equal(readFileSync(path.join(fixture.rootPath, timeline.relativePath), "utf8"), source);
  assert.deepEqual([canonA, canonB, planA, planB].map((event) => readFileSync(path.join(fixture.rootPath, event.relativePath), "utf8")), markdownBefore);

  assert.throws(() => updateVisualDocument(fixture.rootPath, {
    relativePath: timeline.relativePath,
    expectedContentHash: timeline.contentHash,
    document: { ...timeline, content: { ...timeline.content, dependencies: [...timeline.content.dependencies, { id: "dependency.cycle", fromEventId: planB.id, toEventId: planA.id, kind: "requires" }] } }
  }), /cycle|loop/i);
  assert.throws(() => updateVisualDocument(fixture.rootPath, {
    relativePath: timeline.relativePath,
    expectedContentHash: timeline.contentHash,
    document: { ...timeline, content: { ...timeline.content, dependencies: [...timeline.content.dependencies, { id: "dependency.invalid-direction", fromEventId: planA.id, toEventId: canonA.id, kind: "requires" }] } }
  }), /planned.*canonical|invalid direction/i);
  assert.throws(() => updateVisualDocument(fixture.rootPath, {
    relativePath: timeline.relativePath,
    expectedContentHash: timeline.contentHash,
    document: { ...timeline, content: { ...timeline.content, dependencies: [...timeline.content.dependencies, { id: "dependency.duplicate", fromEventId: canonA.id, toEventId: canonB.id, kind: "requires" }] } }
  }), /duplicate/i);
  assert.deepEqual(readVisualDocument(fixture.rootPath, timeline.relativePath).content.entries.map((entry) => entry.order), [0, 1, 2, 3]);
  assert.deepEqual([canonA, canonB, planA, planB].map((event) => readFileSync(path.join(fixture.rootPath, event.relativePath), "utf8")), markdownBefore);
  assert.deepEqual(listVisualDocuments(fixture.rootPath).map((document) => document.type), ["timeline"]);
});

test("tree reuses graph relation edges and cannot invent a second relationship truth", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "守塔关系",
    content: {
      nodes: [
        { id: "node.lin", objectId: fixture.character.id, x: 60, y: 80 },
        { id: "node.lighthouse", objectId: fixture.location.id, x: 320, y: 80 }
      ],
      edges: [{ id: "edge.guard", source: "node.lin", target: "node.lighthouse", relation: "守护", direction: "forward" }],
      filters: { objectTypes: [] }
    }
  });
  const tree = createVisualDocument(fixture.rootPath, {
    type: "tree",
    title: "守塔结构",
    content: {
      sourceGraphPath: graph.relativePath,
      includedEdgeIds: ["edge.guard"],
      rootObjectIds: [fixture.character.id],
      collapsedObjectIds: [],
      direction: "LR"
    }
  });

  assert.equal(tree.relativePath, "documents/trees/守塔结构.tree.json");
  assert.deepEqual(tree.objectRefs, [fixture.character.id, fixture.location.id].sort());
  assert.deepEqual(tree.content.includedEdgeIds, ["edge.guard"]);
  const graphWithoutRelation = updateVisualDocument(fixture.rootPath, {
    relativePath: graph.relativePath,
    expectedContentHash: graph.contentHash,
    document: { ...graph, content: { ...graph.content, edges: [] } }
  });
  assert.equal(graphWithoutRelation.conflict, false);
  const staleTreeProjection = readVisualDocument(fixture.rootPath, tree.relativePath);
  assert.deepEqual(staleTreeProjection.content.includedEdgeIds, []);
  assert.deepEqual(staleTreeProjection.objectRefs, [fixture.character.id]);
  assert.throws(() => createVisualDocument(fixture.rootPath, {
    type: "tree",
    title: "虚构关系树",
    content: {
      sourceGraphPath: graph.relativePath,
      includedEdgeIds: ["edge.invented"],
      rootObjectIds: [],
      collapsedObjectIds: [],
      direction: "TB"
    }
  }), /not present in its source graph/i);
});

test("tree keeps stable source references while its graph is temporarily missing", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "临时缺失关系",
    content: {
      nodes: [
        { id: "node.lin", objectId: fixture.character.id, x: 60, y: 80 },
        { id: "node.lighthouse", objectId: fixture.location.id, x: 320, y: 80 }
      ],
      edges: [{ id: "edge.guard", source: "node.lin", target: "node.lighthouse", relation: "守护", direction: "forward" }],
      filters: { objectTypes: [] }
    }
  });
  const tree = createVisualDocument(fixture.rootPath, {
    type: "tree",
    title: "缺源保留结构",
    content: {
      sourceGraphPath: graph.relativePath,
      includedEdgeIds: ["edge.guard"],
      rootObjectIds: [fixture.character.id],
      collapsedObjectIds: [fixture.character.id],
      direction: "LR"
    }
  });
  const graphPath = path.join(fixture.rootPath, graph.relativePath);
  const graphSource = readFileSync(graphPath, "utf8");

  rmSync(graphPath);
  const missingSource = readVisualDocument(fixture.rootPath, tree.relativePath);
  assert.equal(missingSource.content.sourceGraphPath, graph.relativePath);
  assert.deepEqual(missingSource.content.includedEdgeIds, ["edge.guard"]);
  assert.deepEqual(missingSource.content.rootObjectIds, [fixture.character.id]);
  assert.deepEqual(missingSource.content.collapsedObjectIds, [fixture.character.id]);
  assert.deepEqual(missingSource.objectRefs, [fixture.character.id]);

  writeFileSync(graphPath, graphSource);
  const recovered = readVisualDocument(fixture.rootPath, tree.relativePath);
  assert.deepEqual(recovered.content.includedEdgeIds, ["edge.guard"]);
  assert.deepEqual(recovered.objectRefs, [fixture.character.id, fixture.location.id].sort());
});

test("Graph 2.0 migrates proposals additively and keeps pending relations outside confirmed edges", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "关系提案",
    content: {
      nodes: [
        { id: "node.lin", objectId: fixture.character.id, x: 60, y: 80 },
        { id: "node.lighthouse", objectId: fixture.location.id, x: 320, y: 80 }
      ],
      edges: [],
      filters: { objectTypes: [] }
    }
  });

  const graphPath = path.join(fixture.rootPath, graph.relativePath);
  const legacySource = JSON.parse(readFileSync(graphPath, "utf8"));
  delete legacySource.content.proposals;
  writeFileSync(graphPath, `${JSON.stringify(legacySource, null, 2)}\n`, "utf8");
  const legacyGraph = readVisualDocument(fixture.rootPath, graph.relativePath);
  assert.deepEqual(legacyGraph.content.proposals, []);
  assert.deepEqual(legacyGraph.content.edges, graph.content.edges);
  const created = createRelationProposal({
    document: legacyGraph,
    anchorObjectId: fixture.character.id,
    targetObjectId: fixture.location.id,
    relation: "守护",
    direction: "forward",
    placement: "right",
    origin: "tree",
    sourceDocumentId: "tree.guard"
  });
  const pending = updateVisualDocument(fixture.rootPath, {
    relativePath: graph.relativePath,
    expectedContentHash: legacyGraph.contentHash,
    document: created.document
  });

  assert.equal(pending.conflict, false);
  assert.equal(pending.document.content.edges.length, 0);
  assert.equal(pending.document.content.proposals.length, 1);
  assert.equal(pending.document.content.proposals[0].origin, "tree");
  const accepted = acceptRelationProposal(pending.document, pending.document.content.proposals[0].id);
  assert.equal(accepted.document.content.edges.length, 1);
  assert.equal(accepted.document.content.proposals.length, 0);
  assert.equal(rejectRelationProposal(pending.document, pending.document.content.proposals[0].id).content.edges.length, 0);
  assert.equal(rejectRelationProposal(pending.document, pending.document.content.proposals[0].id).content.proposals.length, 0);
});

test("Graph 2.0 path and focus queries use confirmed relationships only", () => {
  const fixture = createFixture();
  const secondCharacter = createWorkspaceNote(fixture.rootPath, {
    id: "character.a-lan",
    type: "character",
    title: "阿岚",
    status: "active",
    body: "# 阿岚\n"
  });
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "路径图谱",
    content: {
      nodes: [
        { id: "node.lin", objectId: fixture.character.id, x: 0, y: 0 },
        { id: "node.lighthouse", objectId: fixture.location.id, x: 220, y: 0 },
        { id: "node.alan", objectId: secondCharacter.id, x: 440, y: 0 }
      ],
      edges: [{ id: "edge.guard", source: "node.lin", target: "node.lighthouse", relation: "守护", direction: "forward" }],
      proposals: [{ id: "proposal.1", source: "node.lighthouse", target: "node.alan", relation: "知道", direction: "forward", origin: "tree", sourceDocumentId: "tree.guard" }],
      filters: { objectTypes: [] }
    }
  });

  assert.deepEqual([...immediateNeighborhood(graph, fixture.character.id)].sort(), ["node.lighthouse", "node.lin"]);
  assert.deepEqual([...immediateNeighborhood(graph, fixture.location.id)].sort(), ["node.lighthouse"]);
  assert.deepEqual([...immediateNeighborhood(graph, fixture.location.id, undefined, "undirected")].sort(), ["node.lighthouse", "node.lin"]);
  assert.equal(shortestRelationshipPath(graph, fixture.character.id, secondCharacter.id), null);
  const accepted = acceptRelationProposal(graph, "proposal.1").document;
  assert.deepEqual(shortestRelationshipPath(accepted, fixture.character.id, secondCharacter.id), {
    nodeIds: ["node.lin", "node.lighthouse", "node.alan"],
    edgeIds: ["edge.guard", "edge.1"]
  });
  const validObjects = new Set([fixture.character.id, fixture.location.id]);
  assert.equal(shortestRelationshipPath(accepted, fixture.character.id, secondCharacter.id, validObjects), null);
  assert.deepEqual([...immediateNeighborhood(accepted, fixture.location.id, validObjects, "undirected")], ["node.lighthouse", "node.lin"]);
});
