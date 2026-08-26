import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  GraphDocument,
  TimelineDocument,
  WorldObject,
  WorldObjectSummary
} from "../../apps/story-studio/src/lib/localTransport.ts";
import { createStoryObservationDevelopmentPatch } from "../../apps/story-studio/src/components/story-observation/storyObservationDevelopmentAdapter.ts";
import {
  buildStoryObservationModel,
  createStoryObservationSelectionContext,
  layoutStoryObservationNodes,
  storyObservationHiddenDescendants,
  storyObservationTimeFromEvent,
  timeWindowFromPercents,
  visibleStoryObservationRelations
} from "../../apps/story-studio/src/components/story-observation/storyObservationProjection.ts";
import {
  parseStoryObservationProposalPatch,
  storyObservationPatchToCandidateResult
} from "../../src/storyContracts/storyObservationProposalPatch.ts";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";

const eventA = summary("event-a", "守夜人藏起印章", ["作者确认", "Unit: 第一单元", "Character: 守夜人", "Location: 钟楼"]);
const eventB = summary("event-b", "顾沉在雨中等待", ["作者确认", "Unit: 第一单元", "Character: 顾沉", "Location: 北渡口"]);
const eventC = summary("event-c", "钟声暴露秘密", ["作者确认", "Unit: 第二单元", "Foreshadow: 铜钟"]);

test("Story Observation gives the React Flow parent an explicit render size", () => {
  const styles = readFileSync("apps/story-studio/src/styles/story-observation-r0.css", "utf8");
  assert.match(styles, /\.story-observation-canvas-panel \{[^}]*width: 100%;[^}]*height: 100%;/u);
  assert.match(styles, /data-canvas-scale="overview"/u);
  assert.match(styles, /page-context-dock-panel \{ display: none; \}/u);
});

test("overview uses semantic compact nodes while focus preserves the reading card scale", () => {
  const model = buildStoryObservationModel({
    events: [eventA, eventB, eventC],
    detailsById: { "event-a": detail(eventA, {}, []), "event-b": detail(eventB, {}, []), "event-c": detail(eventC, {}, []) },
    visualDocuments: [],
    proposalPatch: null
  });
  const overview = layoutStoryObservationNodes(model, "event-line", "overview");
  const focus = layoutStoryObservationNodes(model, "event-line", "focus");
  assert.equal(overview.every((node) => node.width < 264), true);
  assert.equal(focus.every((node) => node.width >= 264), true);
});

test("Event Line and Timeline reuse the same stable Event IDs without mutating Canon inputs", () => {
  const events = [eventA, eventB, eventC];
  const timeline = timelineFixture();
  const graph = graphFixture();
  const before = JSON.stringify({ events, timeline, graph });
  const model = buildStoryObservationModel({
    events,
    detailsById: {
      "event-a": detail(eventA, { world_time: "18:40", duration_minutes: "35" }, [eventB]),
      "event-b": detail(eventB, { world_time: "19:20" }, [eventC]),
      "event-c": detail(eventC, {}, [])
    },
    visualDocuments: [timeline, graph],
    proposalPatch: null
  });

  assert.deepEqual(model.nodes.map((node) => node.id), ["event-a", "event-b", "event-c"]);
  assert.deepEqual(layoutStoryObservationNodes(model, "event-line").map((node) => node.id).sort(), ["event-a", "event-b", "event-c"]);
  assert.deepEqual(layoutStoryObservationNodes(model, "timeline").map((node) => node.id).sort(), ["event-a", "event-b", "event-c"]);
  assert.equal(JSON.stringify({ events, timeline, graph }), before);
  assert.equal(model.nodes.every((node) => node.eventId === node.id), true);
});

test("representative seven-event projection keeps readable cards and stable timeline positions when a time window is selected", () => {
  const events = [
    summary("event-1", "雨夜失印", ["作者确认", "Character: 顾沉"]),
    summary("event-2", "钟楼密会", ["作者确认", "Character: 守夜人"]),
    summary("event-3", "渡口封锁", ["作者确认", "Location: 北渡口"]),
    summary("event-4", "换印暗号", ["作者确认", "Foreshadow: 铜钟"]),
    summary("event-5", "追查旧账", ["作者确认", "Object: 铜印"]),
    summary("event-6", "守夜人被迫传讯", ["作者确认", "Character: 守夜人"]),
    summary("event-7", "黎明前的合流", ["作者确认", "Unit: 第二单元"])
  ];
  const model = buildStoryObservationModel({
    events,
    detailsById: Object.fromEntries(events.map((event, index) => [event.id, detail(event, index === 6 ? {} : { world_time: `${String(18 + index).padStart(2, "0")}:00` }, index < 6 ? [events[index + 1]!] : [])])),
    visualDocuments: [],
    proposalPatch: null
  });
  const before = layoutStoryObservationNodes(model, "timeline");
  const selectedWindow = timeWindowFromPercents(.18, .72);
  const after = layoutStoryObservationNodes(model, "timeline");
  assert.equal(model.nodes.length, 7);
  assert.equal(before.every((node) => node.width >= 264), true);
  assert.deepEqual(after.map((node) => ({ id: node.id, position: node.position })), before.map((node) => ({ id: node.id, position: node.position })));
  assert.match(selectedWindow.startLabel, /^\d{2}:\d{2}$/u);
  assert.match(selectedWindow.endLabel, /^\d{2}:\d{2}$/u);
  assert.equal(before.find((node) => node.id === "event-7")?.laneLabel, "时间未定");
  assert.equal(layoutStoryObservationNodes(model, "timeline", "overview").find((node) => node.id === "event-7")?.laneLabel, "时间未定");
});

test("clue sources are overlays and recursive branches can merge collapse and cycle safely", () => {
  const model = buildStoryObservationModel({
    events: [eventA, eventB, eventC],
    detailsById: {
      "event-a": detail(eventA, {}, [eventB]),
      "event-b": detail(eventB, {}, [eventC]),
      "event-c": detail(eventC, {}, [eventA])
    },
    visualDocuments: [timelineFixture(), graphFixture()],
    proposalPatch: null
  });
  const allIds = model.nodes.map((node) => node.id);
  const causalityOnly = visibleStoryObservationRelations(model.relations, new Set(["causality"]));
  const withoutCausality = visibleStoryObservationRelations(model.relations, new Set(["character"]));
  assert.equal(causalityOnly.some((relation) => relation.kind === "causality"), true);
  assert.equal(withoutCausality.some((relation) => relation.kind === "causality"), false);
  assert.deepEqual(model.nodes.map((node) => node.id), allIds);
  assert.deepEqual([...storyObservationHiddenDescendants(new Set(["event-a"]), model.relations)].sort(), ["event-b", "event-c"]);
  assert.equal(model.relations.some((relation) => relation.source === "event-a" && relation.target === "event-b"), true);
  assert.equal(model.relations.some((relation) => relation.source === "event-b" && relation.target === "event-c"), true);
});

test("world-time projection preserves exact duration range approximate and unknown semantics", () => {
  const exact = storyObservationTimeFromEvent(detail(eventA, { world_time: "18:40", duration_minutes: "35" }, []));
  const range = storyObservationTimeFromEvent(detail(eventA, { world_time_range: "20:00 ~ 22:30" }, []));
  const approximate = storyObservationTimeFromEvent(detail(eventA, { world_time: "~21:30", time_precision: "approximate" }, []));
  const unknown = storyObservationTimeFromEvent(detail(eventA, {}, []));
  assert.equal(exact.start, 18 * 60 + 40);
  assert.equal(exact.end, 19 * 60 + 15);
  assert.equal(exact.precision, "range");
  assert.deepEqual(range, { label: "20:00 ~ 22:30", start: 1_200, end: 1_350, precision: "range", sourceKey: "world_time_range" });
  assert.equal(approximate.precision, "approximate");
  assert.deepEqual(unknown, { label: "时间未定", start: null, end: null, precision: "unknown", sourceKey: null });
});

test("concurrent events align horizontally while missing time remains in the undetermined region", () => {
  const model = buildStoryObservationModel({
    events: [eventA, eventB, eventC],
    detailsById: {
      "event-a": detail(eventA, { world_time: "20:00" }, []),
      "event-b": detail(eventB, { world_time: "20:00" }, []),
      "event-c": detail(eventC, {}, [])
    },
    visualDocuments: [],
    proposalPatch: null
  });
  const layout = layoutStoryObservationNodes(model, "timeline");
  assert.equal(layout.find((node) => node.id === "event-a")?.position.x, layout.find((node) => node.id === "event-b")?.position.x);
  assert.notEqual(layout.find((node) => node.id === "event-a")?.position.y, layout.find((node) => node.id === "event-b")?.position.y);
  assert.equal(layout.find((node) => node.id === "event-c")?.laneLabel, "时间未定");
});

test("clock-only Timeline keeps post-midnight events after the preceding evening", () => {
  const model = buildStoryObservationModel({
    events: [eventA, eventB, eventC],
    detailsById: {
      "event-a": detail(eventA, { world_time: "18:40" }, []),
      "event-b": detail(eventB, { world_time: "23:10" }, []),
      "event-c": detail(eventC, { world_time: "00:10" }, [])
    },
    visualDocuments: [],
    proposalPatch: null
  });
  const layout = layoutStoryObservationNodes(model, "timeline");
  const eveningX = layout.find((node) => node.id === "event-a")?.position.x ?? -1;
  const lateX = layout.find((node) => node.id === "event-b")?.position.x ?? -1;
  const afterMidnightX = layout.find((node) => node.id === "event-c")?.position.x ?? -1;
  assert.equal(eveningX < lateX, true);
  assert.equal(lateX < afterMidnightX, true);
});

test("selection and time-window context retain stable IDs filters and observer", () => {
  const selection = createStoryObservationSelectionContext({
    projection: "timeline",
    nodeIds: ["event-b", "event-a", "event-a"],
    relationIds: ["relation-b", "relation-a"],
    timeWindow: timeWindowFromPercents(0.75, 0.25),
    clueSources: ["character", "causality", "character"],
    observer: "characters-only"
  });
  assert.deepEqual(selection.nodeIds, ["event-a", "event-b"]);
  assert.deepEqual(selection.relationIds, ["relation-a", "relation-b"]);
  assert.deepEqual(selection.timeWindow, { startLabel: "20:00", endLabel: "00:00" });
  assert.deepEqual(selection.clueSources, ["causality", "character"]);
  assert.equal(selection.observer, "characters-only");
});

test("deterministic adapter produces a strict reviewable patch with zero Provider and Canon writes", () => {
  const model = buildStoryObservationModel({
    events: [eventA, eventB],
    detailsById: {
      "event-a": detail(eventA, { world_time: "18:40" }, [eventB]),
      "event-b": detail(eventB, { world_time: "19:20" }, [])
    },
    visualDocuments: [timelineFixture()],
    proposalPatch: null
  });
  const selection = createStoryObservationSelectionContext({
    projection: "event-line",
    nodeIds: ["event-a", "event-b"],
    relationIds: [],
    timeWindow: null,
    clueSources: ["causality", "character"],
    observer: "author-omniscient"
  });
  const patch = createStoryObservationDevelopmentPatch({ projectId: "story-observation-test", model, selection, createdAt: "2026-08-15T00:00:00.000Z" });
  const parsed = parseStoryObservationProposalPatch(JSON.parse(JSON.stringify(patch)));
  const result = storyObservationPatchToCandidateResult(parsed, "测试世界");
  assert.equal(parsed.operations.length, 3);
  assert.equal(parsed.adapter.providerCalls, 0);
  assert.equal(result.provider.calls.length, 0);
  assert.equal(result.nuwa.candidates.length, 3);
  assert.equal(result.nuwa.candidates.every((candidate) => candidate.affectedObjects.every((id) => selection.nodeIds.includes(id))), true);
  assert.match(result.tianyi.inferences[0], /不.*已确认事实/);
});

test("Proposal Patch parser rejects extra fields Provider calls and an invalid review matrix", () => {
  const patch = minimalPatch();
  assert.throws(() => parseStoryObservationProposalPatch({ ...patch, directCanonWrite: true }), /shape is invalid/);
  assert.throws(() => parseStoryObservationProposalPatch({ ...patch, adapter: { kind: "development-deterministic", providerCalls: 1 } }), /zero-call deterministic/);
  assert.throws(() => parseStoryObservationProposalPatch({ ...patch, operations: patch.operations.slice(0, 1) }), /between 2 and 6/);
});

test("existing Candidate Review owner stores the patch idempotently without creating Event or World owners", () => {
  const rootPath = mkdtempSync(path.join(tmpdir(), "story-observation-review-"));
  const stateFilePath = path.join(rootPath, ".story-studio", "state.json");
  try {
    const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    workspace.createProject({ title: "观测测试", folderSlug: "story-observation-test" });
    const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
    const result = storyObservationPatchToCandidateResult(parseStoryObservationProposalPatch(minimalPatch()), "观测测试");
    const beforeEvents = workspace.listWorldObjects({ projectId: "story-observation-test", type: "event" });
    const first = authorControl.createCandidateReview({ projectId: "story-observation-test", result, createdAt: "2026-08-15T00:00:00.000Z" });
    const retry = authorControl.createCandidateReview({ projectId: "story-observation-test", result, createdAt: "2026-08-15T00:01:00.000Z" });
    const afterEvents = workspace.listWorldObjects({ projectId: "story-observation-test", type: "event" });
    assert.equal(first.id, retry.id);
    assert.equal(first.status, "awaiting");
    assert.equal(first.candidates.length, 2);
    assert.deepEqual(afterEvents, beforeEvents);
    assert.equal(authorControl.listCandidateReviews({ projectId: "story-observation-test" }).length, 1);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("development-only transport submits through the existing Candidate Review owner without Event writes", async () => {
  const rootPath = mkdtempSync(path.join(tmpdir(), "story-observation-transport-"));
  const stateFilePath = path.join(rootPath, ".story-studio", "state.json");
  const port = 46_000 + (process.pid % 1_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = "story-observation-transport-token";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "观测传输测试", folderSlug: "story-observation-test" });
  const beforeEvents = workspace.listWorldObjects({ projectId: "story-observation-test", type: "event" });
  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      STORY_OBSERVATION_SUCCESSOR_R0: "1",
      WORLD_OS_STORY_STUDIO_ROOT: rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(baseUrl, server);
    const response = await fetch(`${baseUrl}/__local/story-studio/author-control/candidate-review/from-story-observation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-world-os-local-control-token": token
      },
      body: JSON.stringify({ projectId: "story-observation-test", patch: minimalPatch() })
    });
    assert.equal(response.status, 201);
    const payload = await response.json() as { data?: { review?: { status?: string }; result?: { provider?: { calls?: unknown[] } } } };
    assert.equal(payload.data?.review?.status, "awaiting");
    assert.deepEqual(payload.data?.result?.provider?.calls, []);
    assert.deepEqual(workspace.listWorldObjects({ projectId: "story-observation-test", type: "event" }), beforeEvents);
    const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
    assert.equal(authorControl.listCandidateReviews({ projectId: "story-observation-test" }).length, 1);
  } finally {
    await terminateChildProcess(server, {
      label: "Story Observation R0 transport server",
      gracefulTimeoutMs: 2_000,
      forceTimeoutMs: 2_000
    });
    rmSync(rootPath, { recursive: true, force: true });
  }
});

function summary(id: string, title: string, tags: string[]): WorldObjectSummary {
  return {
    id,
    relativeId: `world/events/${id}.md`,
    title,
    type: "event",
    status: "committed",
    tags,
    aliases: [],
    revisionToken: `${id}-revision`,
    source: "markdown"
  };
}

function detail(base: WorldObjectSummary, properties: Record<string, string>, linkedObjects: WorldObjectSummary[]): WorldObject {
  return {
    ...base,
    canonicalReadVerified: true,
    body: `# ${base.title}\n\n这是用于隔离测试的已确认事件摘要。`,
    properties,
    knowledgeSubjects: [],
    subtype: "",
    typedProperties: [],
    propertyDiagnostics: [],
    linkedObjects,
    backlinks: [],
    card: {} as WorldObject["card"],
    visualReferences: [],
    worldProjection: null
  };
}

function timelineFixture(): TimelineDocument {
  return {
    version: "story-visual-document/v1",
    id: "timeline-story-observation",
    type: "timeline",
    title: "故事观测时间线",
    objectRefs: [eventA.id, eventB.id, eventC.id],
    viewport: { x: 0, y: 0, zoom: 1 },
    overlays: { evidence: [], risks: [], candidateChanges: [] },
    relativePath: "documents/timelines/story-observation.timeline.json",
    contentHash: "timeline-hash",
    source: "visual-json",
    content: {
      lanes: [{ id: "lane-main", title: "主线", color: "#5e8ff4", order: 0 }],
      entries: [
        { id: "entry-a", eventId: eventA.id, laneId: "lane-main", order: 0 },
        { id: "entry-b", eventId: eventB.id, laneId: "lane-main", order: 1 },
        { id: "entry-c", eventId: eventC.id, laneId: "lane-main", order: 2 }
      ],
      trackViews: [{ id: "track-canon", kind: "canon", refId: null, order: 0, visible: true, collapsed: false }],
      dependencies: [{ id: "dependency-a-b", fromEventId: eventA.id, toEventId: eventB.id, kind: "requires" }],
      filters: { mode: "canon", objectIds: [] },
      viewport: { focusedTrackId: null, density: "comfortable" }
    },
    diagnostics: { timeline: { entryStates: [], projectedEntries: [], canonicalLinks: [], issues: [] } }
  };
}

function graphFixture(): GraphDocument {
  return {
    version: "story-visual-document/v1",
    id: "graph-story-observation",
    type: "graph",
    title: "故事关系",
    objectRefs: [eventA.id, eventB.id, eventC.id],
    viewport: { x: 0, y: 0, zoom: 1 },
    overlays: { evidence: [], risks: [], candidateChanges: [] },
    relativePath: "documents/graphs/story-observation.graph.json",
    contentHash: "graph-hash",
    source: "visual-json",
    content: {
      nodes: [
        { id: "node-a", objectId: eventA.id, x: 0, y: 0 },
        { id: "node-b", objectId: eventB.id, x: 200, y: 0 },
        { id: "node-c", objectId: eventC.id, x: 400, y: 0 }
      ],
      edges: [
        { id: "edge-character", source: "node-a", target: "node-c", relation: "角色认知", direction: "forward" },
        { id: "edge-foreshadow", source: "node-b", target: "node-c", relation: "伏笔兑现", direction: "forward" }
      ],
      proposals: [],
      filters: { objectTypes: ["event"] }
    }
  };
}

function minimalPatch() {
  return {
    version: "story-observation-proposal-patch/v1",
    patchId: "story-observation-patch-test",
    projectId: "story-observation-test",
    baseCanonVersion: "canon-projection-test",
    contextId: "story-observation-context-test",
    selection: {
      projection: "event-line",
      nodeIds: ["event-a"],
      relationIds: [],
      timeWindow: null,
      clueSources: ["causality"],
      observer: "author-omniscient"
    },
    sources: [{ id: "event-a", type: "verified-canon-event", label: "事件 A", excerpt: "已确认来源。" }],
    unknowns: ["后续仍需作者判断。"],
    prohibitedChanges: ["不直接写入 Canon"],
    operations: [
      {
        operationId: "operation-a",
        kind: "add-event",
        title: "候选 A",
        change: "新增候选事件 A。",
        after: "候选仍待评审。",
        rationale: "用于比较。",
        confidence: 0.6,
        risk: "可能过早收束。",
        affectedNodeIds: ["event-a"],
        evidence: ["事件 A"],
        conflicts: [],
        timeEstimate: { label: "时间未定", precision: "unknown" }
      },
      {
        operationId: "operation-b",
        kind: "flag-conflict",
        title: "候选 B",
        change: "只标记冲突。",
        after: "故事事实不变。",
        rationale: "避免伪造。",
        confidence: 0.9,
        risk: "推进暂缓。",
        affectedNodeIds: ["event-a"],
        evidence: ["事件 A"],
        conflicts: ["未决问题"],
        timeEstimate: null
      }
    ],
    adapter: { kind: "development-deterministic", providerCalls: 0 },
    createdAt: "2026-08-15T00:00:00.000Z"
  };
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Story Observation R0 transport server exited early.");
    try {
      if ((await fetch(`${baseUrl}/__local/story-studio/bootstrap`)).ok) return;
    } catch {
      // Startup is retried only within the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Story Observation R0 transport server did not start.");
}
