import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  applyNuwaInterventionToNextRevision,
  buildStorySnapshot,
  computeExecutionBriefHash,
  computeExecutionSourceSetHash,
  createNuwaPlan,
  createNuwaRunPack,
  parseNuwaRehearsalRevision,
  readLatestNuwaRehearsalRevision,
  readNuwaRehearsalHistory,
  readNuwaRunPack,
  writeExecutionBriefRevision,
  writeExecutionBriefRunBinding,
  writeNuwaRehearsalRevision,
  type NuwaRehearsalAgentRef,
  type NuwaRehearsalRevision,
  type TianyiNuwaExecutionBrief
} from "../../src/storyIntelligence/index.ts";

const PROJECT_ID = "mist-lighthouse";
const UNIT_ID = "exploration.unit-001";
const T0 = "2026-08-14T11:00:00.000Z";
const T1 = "2026-08-14T11:01:00.000Z";

test("legacy Run Packs project an empty rehearsal state without migration writes", () => {
  const fixture = createFixture("legacy");
  try {
    const before = readFileSync(path.join(fixture.runPath, "run.json"), "utf8");
    const statBefore = readFileSync(path.join(fixture.runPath, "snapshot.json"), "utf8");
    const loaded = readNuwaRunPack(fixture.projectPath, fixture.runId);
    assert.deepEqual(loaded.rehearsal, {
      version: "story-studio-nuwa-rehearsal-read-model/v1",
      runId: fixture.runId,
      latestRevision: null,
      revisions: []
    });
    assert.equal(existsSync(path.join(fixture.runPath, "rehearsal")), false);
    assert.equal(readFileSync(path.join(fixture.runPath, "run.json"), "utf8"), before);
    assert.equal(readFileSync(path.join(fixture.runPath, "snapshot.json"), "utf8"), statBefore);
  } finally {
    fixture.cleanup();
  }
});

test("rehearsal V1 persists two formal Agents and ordered speech/action events", () => {
  const fixture = createFixture("roundtrip");
  try {
    const revision = baseRevision(fixture);
    const written = writeNuwaRehearsalRevision({ workspacePath: fixture.projectPath, runId: fixture.runId, revision, resolveAgent: fixture.resolveAgent });
    const loaded = readNuwaRunPack(fixture.projectPath, fixture.runId).rehearsal;
    assert.equal(written.unitId, UNIT_ID);
    assert.equal(written.unitId, written.explorationId);
    assert.equal(loaded.latestRevision, 1);
    assert.deepEqual(loaded.revisions[0], written);
    assert.deepEqual(written.roster.map((agent) => agent.objectId), fixture.roster.map((agent) => agent.objectId));
    assert.deepEqual(written.orderedEvents.slice(0, 2).map((event) => event.eventType), ["agent_speech", "agent_action"]);
    assert.deepEqual(written.orderedEvents.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(existsSync(path.join(fixture.runPath, "rehearsal", "revisions", "revision-000001.json")), true);
    assert.equal(existsSync(path.join(fixture.projectPath, ".world-os", "author-control")), false);
  } finally {
    fixture.cleanup();
  }
});

test("roster duplicates, missing objects, and stale source revisions fail before persistence", () => {
  const fixture = createFixture("roster");
  try {
    const duplicate = baseRevision(fixture);
    duplicate.roster = [fixture.roster[0], fixture.roster[0]];
    assert.throws(() => writeNuwaRehearsalRevision({ workspacePath: fixture.projectPath, runId: fixture.runId, revision: duplicate, resolveAgent: fixture.resolveAgent }), /duplicate Agents/i);
    const missing = baseRevision(fixture);
    missing.roster[1] = { ...missing.roster[1], objectId: "character.missing" };
    assert.throws(() => writeNuwaRehearsalRevision({ workspacePath: fixture.projectPath, runId: fixture.runId, revision: missing, resolveAgent: fixture.resolveAgent }), /does not exist/i);
    const stale = baseRevision(fixture);
    stale.roster[1] = { ...stale.roster[1], sourceRevision: "0".repeat(64) };
    assert.throws(() => writeNuwaRehearsalRevision({ workspacePath: fixture.projectPath, runId: fixture.runId, revision: stale, resolveAgent: fixture.resolveAgent }), /source revision is stale/i);
    assert.equal(readNuwaRehearsalHistory(fixture.projectPath, fixture.runId).latestRevision, null);
  } finally {
    fixture.cleanup();
  }
});

test("event parser rejects duplicate sequence, foreign actors, cross-unit events, and unknown side effects", () => {
  const fixture = createFixture("events");
  try {
    const duplicate = baseRevision(fixture);
    duplicate.orderedEvents[1] = { ...duplicate.orderedEvents[1], sequence: 1 };
    assert.throws(() => parseRevision(duplicate, fixture), /sequence/i);
    const foreign = baseRevision(fixture);
    foreign.orderedEvents[0] = { ...foreign.orderedEvents[0], actorAgentRef: { ...fixture.roster[0], objectId: "character.foreign" } };
    assert.throws(() => parseRevision(foreign, fixture), /outside the current roster/i);
    const crossUnit = baseRevision(fixture);
    crossUnit.orderedEvents[0] = { ...crossUnit.orderedEvents[0], unitId: "exploration.other" };
    assert.throws(() => parseRevision(crossUnit, fixture), /crosses its unit/i);
    const unknown = structuredClone(baseRevision(fixture)) as unknown as { orderedEvents: Array<Record<string, unknown>> };
    unknown.orderedEvents[0].eventType = "write_canon";
    assert.throws(() => parseNuwaRehearsalRevision({ source: JSON.stringify(unknown), expectedRunId: fixture.runId }), /event type is invalid/i);
  } finally {
    fixture.cleanup();
  }
});

test("one rehearsal stream accepts explicit narrative psychology, coordination, narration, and checkpoints", () => {
  const fixture = createFixture("mixed-stream");
  try {
    const revision = baseRevision(fixture);
    const source = revision.orderedEvents[0];
    const actor = fixture.roster[0];
    const event = (sequence: number, eventType: NuwaRehearsalRevision["orderedEvents"][number]["eventType"], payload: Record<string, string>, withActor = true) => ({
      ...source,
      eventId: `event.mixed-${sequence}`,
      sequence,
      eventType,
      actorAgentRef: withActor ? actor : null,
      targetRefs: [],
      payload
    }) as NuwaRehearsalRevision["orderedEvents"][number];
    revision.orderedEvents = [
      event(1, "conscious_thought", { text: "他知道自己正在推迟回答。" }),
      event(2, "inner_monologue", { text: "现在还不能承认。" }),
      event(3, "subconscious_tendency", { text: "他本能地避开印章。" }),
      event(4, "psychological_state", { text: "警惕正在上升。" }),
      event(5, "narration", { text: "雨声盖住了短暂的停顿。" }, false),
      event(6, "agent_coordination", { description: "女娲请求人物 Agent 检查沉默动机。" }, false),
      event(7, "system_checkpoint", { label: "沉默动机形成分歧" }, false)
    ];
    revision.temporaryVariables = [];
    revision.creativeBoosts = [];
    revision.interventionProposals = [];
    revision.memoryDeltas = [];
    revision.relationshipDeltas = [];
    revision.candidateRefs = [];
    const parsed = parseRevision(revision, fixture);
    assert.deepEqual(parsed.orderedEvents.map((item) => item.eventType), [
      "conscious_thought", "inner_monologue", "subconscious_tendency", "psychological_state", "narration", "agent_coordination", "system_checkpoint"
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("rehearsal transport parser enforces bounded JSON size, depth, and exact fields", () => {
  const fixture = createFixture("parser-bounds");
  try {
    assert.throws(() => parseNuwaRehearsalRevision({ source: "x".repeat(512 * 1024 + 1), expectedRunId: fixture.runId }), /size|large|limit/i);
    const unknown = { ...baseRevision(fixture), providerPayload: { secret: "not allowed" } };
    assert.throws(() => parseNuwaRehearsalRevision({ source: JSON.stringify(unknown), expectedRunId: fixture.runId }), /fields are invalid/i);
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 14; index += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const nested = structuredClone(baseRevision(fixture)) as unknown as { orderedEvents: Array<{ payload: unknown }> };
    nested.orderedEvents[0].payload = deep;
    assert.throws(() => parseNuwaRehearsalRevision({ source: JSON.stringify(nested), expectedRunId: fixture.runId }), /deep|structural limit/i);
  } finally {
    fixture.cleanup();
  }
});

test("immutable revisions append, latest pointer recovers, and old bytes never change", () => {
  const fixture = createFixture("revision");
  try {
    const first = writeRevision(fixture, baseRevision(fixture));
    const firstPath = path.join(fixture.runPath, "rehearsal", "revisions", "revision-000001.json");
    const firstBytes = readFileSync(firstPath, "utf8");
    const second = nextRevision(first, {
      temporaryVariables: [{ ...first.temporaryVariables[0], enabled: false, revokedAtRevision: 2 }],
      creativeBoosts: [],
      inheritance: { temporaryVariables: true, creativeBoosts: false },
      orderedEvents: []
    });
    writeRevision(fixture, second);
    assert.equal(readFileSync(firstPath, "utf8"), firstBytes);
    assert.throws(() => writeRevision(fixture, { ...second, status: "failed" }), /different content/i);
    const latestPath = path.join(fixture.runPath, "rehearsal", "latest.json");
    writeFileSync(latestPath, JSON.stringify({ version: "story-studio-nuwa-rehearsal-latest/v1", runId: fixture.runId, runRevision: 999 }), "utf8");
    assert.equal(readLatestNuwaRehearsalRevision(fixture.projectPath, fixture.runId)?.runRevision, 2);
    assert.equal(readLatestNuwaRehearsalRevision(fixture.projectPath, fixture.runId)?.temporaryVariables[0].enabled, false);
    assert.equal(second.orderedEvents.some((event) => event.eventType === "temporary_variable_applied" || event.eventType === "creative_boost_applied"), false);
  } finally {
    fixture.cleanup();
  }
});

test("temporary variables and creative boosts are visible, scoped, disableable, and never Canon", () => {
  const fixture = createFixture("scopes");
  try {
    const first = writeRevision(fixture, baseRevision(fixture));
    assert.equal(first.temporaryVariables[0].scope, "current_unit");
    assert.equal(first.creativeBoosts[0].scope, "current_run");
    assert.equal(first.orderedEvents.some((event) => event.eventType === "temporary_variable_applied"), true);
    assert.equal(first.orderedEvents.some((event) => event.eventType === "creative_boost_applied"), true);
    const invalidGlobal = structuredClone(first) as unknown as { temporaryVariables: Array<Record<string, unknown>> };
    invalidGlobal.temporaryVariables[0].scope = "global";
    assert.throws(() => parseNuwaRehearsalRevision({ source: JSON.stringify(invalidGlobal), expectedRunId: fixture.runId }), /scope is invalid/i);
    assert.equal(existsSync(path.join(fixture.projectPath, ".world-os", "author-control")), false);
    assert.equal(readFileSync(path.join(fixture.runPath, "rehearsal", "revisions", "revision-000001.json"), "utf8").includes("system_prompt"), false);
  } finally {
    fixture.cleanup();
  }
});

test("pending intervention has no side effect and approved apply is durable-idempotent", () => {
  const fixture = createFixture("intervention");
  try {
    const pending = baseRevision(fixture);
    assert.equal(pending.interventionProposals[0].status, "pending");
    assert.equal(pending.orderedEvents.some((event) => event.eventType === "intervention_applied"), false);
    const first = writeRevision(fixture, pending);
    const approved = nextRevision(first, {
      interventionProposals: [{ ...first.interventionProposals[0], status: "approved", approvedForRevision: 3 }],
      orderedEvents: []
    });
    writeRevision(fixture, approved);
    const command = {
      workspacePath: fixture.projectPath,
      runId: fixture.runId,
      expectedLatestRevision: 2,
      interventionId: approved.interventionProposals[0].interventionId,
      operationId: "intervention-apply.0001",
      eventId: "rehearsal-event.intervention-0001",
      now: T1,
      resolveAgent: fixture.resolveAgent
    };
    const applied = applyNuwaInterventionToNextRevision(command);
    const retry = applyNuwaInterventionToNextRevision(command);
    assert.equal(applied.runRevision, 3);
    assert.deepEqual(retry, applied);
    assert.equal(applied.interventionProposals[0].status, "applied_to_run_revision");
    assert.equal(applied.orderedEvents.length, 1);
    assert.equal(applied.orderedEvents[0].eventType, "intervention_applied");
    assert.equal(readNuwaRehearsalHistory(fixture.projectPath, fixture.runId).revisions.length, 3);
  } finally {
    fixture.cleanup();
  }
});

test("memory and relationship changes remain reviewable unit deltas only", () => {
  const fixture = createFixture("deltas");
  try {
    const revision = writeRevision(fixture, baseRevision(fixture));
    assert.equal(revision.memoryDeltas[0].reviewStatus, "pending");
    assert.equal(revision.relationshipDeltas[0].reviewStatus, "pending");
    assert.equal(revision.orderedEvents.some((event) => event.eventType === "memory_delta"), true);
    assert.equal(revision.orderedEvents.some((event) => event.eventType === "relationship_delta"), true);
    assert.equal(existsSync(path.join(fixture.projectPath, "continuity")), false);
    assert.equal(existsSync(path.join(fixture.projectPath, ".world-os", "author-control")), false);
  } finally {
    fixture.cleanup();
  }
});

function createFixture(name: string) {
  const rootPath = mkdtempSync(path.join(tmpdir(), `nuwa-rehearsal-${name}-`));
  const stateFilePath = path.join(rootPath, ".studio-state.json");
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: PROJECT_ID });
  const writing = workspace.startWriting({ projectId: PROJECT_ID });
  const firstObject = workspace.createWorldObject({ projectId: PROJECT_ID, type: "character", title: "林峤" });
  const secondObject = workspace.createWorldObject({ projectId: PROJECT_ID, type: "character", title: "顾沉" });
  const projectPath = path.join(rootPath, PROJECT_ID);
  const snapshot = buildStorySnapshot({ workspacePath: projectPath, selectedScenePath: writing.scene.relativeId });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林峤与顾沉围绕印章交换线索", runKey: name });
  createNuwaRunPack({ workspacePath: projectPath, plan, snapshot });
  const brief = approvedBrief({ snapshotHash: snapshot.snapshotHash, documentId: writing.scene.id, objectIds: [firstObject.id, secondObject.id] });
  writeExecutionBriefRevision(projectPath, brief);
  writeExecutionBriefRunBinding(projectPath, {
    version: "story-studio-tianyi-nuwa-run-binding/v1",
    briefId: brief.briefId,
    briefRevision: brief.revision,
    operationId: brief.operationId,
    explorationId: UNIT_ID,
    runId: plan.runId
  });
  const roster: NuwaRehearsalAgentRef[] = [firstObject, secondObject].map((object) => ({
    objectId: object.id,
    objectKind: "character",
    displayName: object.title,
    sourceRevision: object.revisionToken
  }));
  const resolveAgent = (ref: Pick<NuwaRehearsalAgentRef, "objectId" | "objectKind">) => {
    try {
      const object = workspace.readWorldObject({ projectId: PROJECT_ID, objectId: ref.objectId });
      return object.type === ref.objectKind ? { displayName: object.title, sourceRevision: object.revisionToken } : null;
    } catch {
      return null;
    }
  };
  return {
    rootPath,
    projectPath,
    runPath: path.join(projectPath, ".world-os", "runs", "nuwa", plan.runId),
    runId: plan.runId,
    brief,
    roster,
    resolveAgent,
    cleanup: () => rmSync(rootPath, { recursive: true, force: true })
  };
}

function baseRevision(fixture: ReturnType<typeof createFixture>): NuwaRehearsalRevision {
  const [lin, gu] = fixture.roster;
  const source = { kind: "provider" as const, sourceRef: "receipt.000001" };
  const event = (sequence: number, value: Omit<NuwaRehearsalRevision["orderedEvents"][number], "eventId" | "unitId" | "runId" | "runRevision" | "sequence" | "source" | "createdAt">) => ({
    eventId: `rehearsal-event.${String(sequence).padStart(4, "0")}`,
    unitId: UNIT_ID,
    runId: fixture.runId,
    runRevision: 1,
    sequence,
    source,
    createdAt: T0,
    ...value
  }) as NuwaRehearsalRevision["orderedEvents"][number];
  return {
    version: "story-studio-nuwa-rehearsal-revision/v1",
    unitId: UNIT_ID,
    explorationId: UNIT_ID,
    briefId: fixture.brief.briefId,
    briefRevision: fixture.brief.revision,
    runId: fixture.runId,
    runRevision: 1,
    parentRunRevision: null,
    status: "ready-for-candidate-review",
    roster: structuredClone(fixture.roster),
    temporaryVariables: [{ variableId: "variable.rain", name: "雨势", value: "增强", scope: "current_unit", enabled: true, source: "director.input-001", introducedAtRevision: 1, expiresAfterRevision: null, revokedAtRevision: null }],
    creativeBoosts: [{ boostId: "boost.tension", label: "提高谈判张力", instruction: "让双方都保留一个未说出口的条件。", scope: "current_run", enabled: true, source: "director.input-002", introducedAtRevision: 1, disabledAtRevision: null }],
    interventionProposals: [{ interventionId: "intervention.lin-choice", targetAgentRef: lin, reason: "验证不同沉默动机", proposedChange: "让林峤暂缓承认", expectedImpact: "顾沉将继续施压", risk: "medium", status: "pending", source: "director.input-003", createdAt: T0, approvedForRevision: null, applicationOperationId: null, applicationReceipt: null }],
    orderedEvents: [
      event(1, { eventType: "agent_speech", actorAgentRef: lin, targetRefs: [gu.objectId], payload: { text: "印章的事还不能现在说。" } }),
      event(2, { eventType: "agent_action", actorAgentRef: gu, targetRefs: [lin.objectId], payload: { description: "顾沉把旧印泥推到桌面中央。" } }),
      event(3, { eventType: "temporary_variable_applied", actorAgentRef: null, targetRefs: [], payload: { variableId: "variable.rain" } }),
      event(4, { eventType: "creative_boost_applied", actorAgentRef: null, targetRefs: [], payload: { boostId: "boost.tension" } }),
      event(5, { eventType: "memory_delta", actorAgentRef: lin, targetRefs: [], payload: { deltaId: "memory-delta.lin-001" } }),
      event(6, { eventType: "relationship_delta", actorAgentRef: lin, targetRefs: [gu.objectId], payload: { deltaId: "relationship-delta.lin-gu-001" } }),
      event(7, { eventType: "intervention_proposed", actorAgentRef: null, targetRefs: [lin.objectId], payload: { interventionId: "intervention.lin-choice" } }),
      event(8, { eventType: "candidate_emitted", actorAgentRef: null, targetRefs: [], payload: { candidateRef: "candidate.route-001" } })
    ],
    memoryDeltas: [{ deltaId: "memory-delta.lin-001", agentRef: lin, before: "", proposedAfter: "顾沉掌握了旧印泥。", reason: "排演中公开了证据", sourceEventId: "rehearsal-event.0002", reviewStatus: "pending" }],
    relationshipDeltas: [{ deltaId: "relationship-delta.lin-gu-001", sourceAgentRef: lin, targetAgentRef: gu, before: "互相试探", proposedAfter: "信任下降", reason: "林峤拒绝解释", sourceEventId: "rehearsal-event.0001", reviewStatus: "pending" }],
    candidateRefs: ["candidate.route-001"],
    inheritance: { temporaryVariables: false, creativeBoosts: false },
    createdAt: T0,
    updatedAt: T0
  };
}

function nextRevision(previous: NuwaRehearsalRevision, changes: Partial<NuwaRehearsalRevision>): NuwaRehearsalRevision {
  const nextRevision = previous.runRevision + 1;
  return {
    ...structuredClone(previous),
    runRevision: nextRevision,
    parentRunRevision: previous.runRevision,
    status: "planned",
    temporaryVariables: previous.temporaryVariables.filter((variable) => variable.scope === "current_unit"),
    creativeBoosts: previous.creativeBoosts.filter((boost) => boost.scope === "current_unit"),
    orderedEvents: [],
    memoryDeltas: [],
    relationshipDeltas: [],
    candidateRefs: [],
    inheritance: { temporaryVariables: true, creativeBoosts: true },
    updatedAt: T1,
    ...changes
  };
}

function writeRevision(fixture: ReturnType<typeof createFixture>, revision: NuwaRehearsalRevision) {
  return writeNuwaRehearsalRevision({ workspacePath: fixture.projectPath, runId: fixture.runId, revision, resolveAgent: fixture.resolveAgent });
}

function parseRevision(revision: NuwaRehearsalRevision, fixture: ReturnType<typeof createFixture>) {
  return parseNuwaRehearsalRevision({ source: JSON.stringify(revision), expectedRunId: fixture.runId, expectedUnitId: UNIT_ID, resolveAgent: fixture.resolveAgent });
}

function approvedBrief(input: { snapshotHash: string; documentId: string; objectIds: string[] }): TianyiNuwaExecutionBrief {
  const seed: TianyiNuwaExecutionBrief = {
    version: "story-studio-tianyi-nuwa-execution-brief/v1",
    briefId: "brief.mist-lighthouse.rehearsal",
    revision: 1,
    authorGoal: "让两个角色围绕印章展开可审查的排演。",
    sourceProject: { projectId: PROJECT_ID, projectRevision: input.snapshotHash },
    currentContext: { mode: "intelligence", documentId: input.documentId, objectIds: input.objectIds, selectionRef: "selection.nuwa.unit" },
    selectedContextReceiptIds: [],
    selectedArchiveMessageRefs: [],
    approvedMemoryRefs: [],
    mustKeep: ["印章事实仍未进入 Canon。"],
    mustAvoid: ["不得替作者确认事件。"],
    unresolvedQuestions: ["林峤是同谋还是被胁迫？"],
    expectedOutputKind: "candidate-routes",
    allowedAgents: ["nuwa.supervisor", "nuwa.character-arc", "nuwa.causality"],
    allowedSkills: [],
    capabilityBudget: { maxAgentRuns: 2, maxSkillCalls: 1, maxTokens: 8_000, timeoutSeconds: 120 },
    sensitivity: "project-private",
    authorApprovalState: "approved",
    expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) },
    operationId: "operation.nuwa.rehearsal-001",
    originatingTianyiSessionId: "session.000001",
    returnDestination: { mode: "intelligence", documentId: input.documentId, selectionRef: "selection.nuwa.unit" }
  };
  const briefHash = computeExecutionBriefHash(seed);
  const withBrief = { ...seed, expectedHashes: { brief: briefHash, sourceSet: seed.expectedHashes.sourceSet } };
  return { ...withBrief, expectedHashes: { brief: briefHash, sourceSet: computeExecutionSourceSetHash(withBrief, []) } };
}
