import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioIntelligenceBridgeOperations } from "../../src/storyControlSurface/storyStudioIntelligenceBridgeOperations.ts";
import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  readExecutionBriefRunBinding
} from "../../src/storyIntelligence/tianyiNuwaBridgeRepository.ts";
import { NUWA_AUTHOR_LOOP_SEEDS } from "../../src/storyIntelligence/storyIntelligenceTypes.ts";
import { readNuwaRunPack, writeNuwaPredictionBundle } from "../../src/storyIntelligence/nuwaRunPack.ts";

const RECORDED_AT = "2026-07-15T08:00:00.000Z";

test("an approved Execution Brief reuses the Nuwa run repository and returns an author-visible receipt without canon writes", async () => {
  const fixture = await createFixture();
  try {
    const before = canonicalMarkdown(fixture.projectPath);
    const draft = await fixture.bridge.createExecutionBrief(briefInput(fixture));
    assert.equal(draft.authorApprovalState, "draft");
    assert.equal(draft.sourceQuestion, draft.authorGoal);
    assert.deepEqual(draft.startingPoint, { beatId: "selection.writing.current", checkpoint: fixture.sceneId });
    assert.deepEqual(draft.participatingActorIds, [fixture.characterId]);
    assert.equal(draft.observationCriteria?.success.length, 1);
    assert.equal(draft.provenance?.source, "tianyi");
    assert.equal(draft.requestedRunCount, 3);
    assert.deepEqual(draft.fixedSeeds, [...NUWA_AUTHOR_LOOP_SEEDS]);
    await assert.rejects(() => fixture.bridge.startExecutionBrief({ projectId: fixture.projectId, briefId: draft.briefId, revision: draft.revision }), /author approval/);

    const approved = await fixture.bridge.approveExecutionBrief({
      projectId: fixture.projectId,
      briefId: draft.briefId,
      revision: draft.revision,
      expectedHash: draft.expectedHashes.brief,
      expectedSourceSetHash: draft.expectedHashes.sourceSet
    });
    const exploration = await fixture.bridge.startExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision });
    assert.deepEqual(await fixture.bridge.startExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision }), exploration);
    assert.equal(exploration.status, "planned");

    const run = await fixture.bridge.runExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    assert.equal(run.status, "ready-to-synthesize");
    assert.ok(run.activity && run.activity.length > 0);
    assert.deepEqual(run.activity?.map((event) => event.sequence), Array.from({ length: run.activity!.length }, (_value, index) => index + 1));
    assert.equal(run.activity?.every((event) => event.unitId === run.id && event.sourceLabel === "本单元执行记录"), true);
    assert.equal(run.activity?.some((event) => event.eventType === "task-started"), true);
    const result = await fixture.bridge.synthesizeExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    assert.equal(result.exploration.status, "ready-for-review");
    assert.equal(result.resultReceipt.staleState, "current");
    assert.equal(result.resultReceipt.impactReviewEligible, true);
    assert.ok(result.resultReceipt.candidateRouteIds.length > 0);
    const provenance = await fixture.bridge.inspectResultReceiptProvenance({ projectId: fixture.projectId, briefId: approved.briefId });
    assert.deepEqual(provenance.matches, { brief: true, sourceSet: true, runtime: true, sources: true, agents: true, skills: true, routes: true });
    assert.deepEqual(provenance.contentBoundaries, { fullTranscriptCopies: 0, canonicalStoryProseCopies: 0 });
    assert.equal(provenance.sourceSummary.currentContext, 1);
    assert.deepEqual(canonicalMarkdown(fixture.projectPath), before);

    const restarted = createStoryStudioIntelligenceBridgeOperations(fixture.options);
    assert.deepEqual(await restarted.readResultReceipt({ projectId: fixture.projectId, briefId: approved.briefId }), result.resultReceipt);
    assert.deepEqual(await restarted.readLatestExecutionState({ projectId: fixture.projectId }), {
      brief: approved,
      exploration: result.exploration,
      resultReceipt: result.resultReceipt
    });
    const session = await fixture.tianyi.readTianyiSessionEvents({ projectId: fixture.projectId, sessionId: fixture.sessionId, startSequence: 1, limit: 50 });
    const completion = session?.events.find((event) => event.type === "nuwa-result-returned");
    assert.match(completion?.visibleContent ?? "", /不会自动选择路线或进入影响评审/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("revision, source drift, temporary retention, and allowlists fail closed", async () => {
  const fixture = await createFixture();
  try {
    const draft = await fixture.bridge.createExecutionBrief(briefInput(fixture));
    await assert.rejects(() => fixture.bridge.createExecutionBrief({ ...briefInput(fixture), operationId: draft.operationId, authorGoal: "different" }), /different content/);
    const revised = await fixture.bridge.reviseExecutionBrief({ projectId: fixture.projectId, briefId: draft.briefId, expectedHash: draft.expectedHashes.brief, changes: { mustAvoid: ["不得自动修改正文"] } });
    assert.equal(revised.revision, 2);
    assert.equal(revised.authorApprovalState, "draft");
    await assert.rejects(() => fixture.bridge.approveExecutionBrief({ projectId: fixture.projectId, briefId: draft.briefId, revision: 1, expectedHash: draft.expectedHashes.brief, expectedSourceSetHash: draft.expectedHashes.sourceSet }), /stale/);

    await assert.rejects(() => fixture.bridge.createExecutionBrief({ ...briefInput(fixture, "operation.unknown-agent"), allowedAgents: ["nuwa.supervisor", "nuwa.unknown"] }), /unknown Agent/);
    await assert.rejects(() => fixture.bridge.createExecutionBrief({ ...briefInput(fixture, "operation.unknown-skill"), allowedSkills: ["story.memory-recall@999"] }), /unknown Skill/);

    const driftDraft = await fixture.bridge.createExecutionBrief(briefInput(fixture, "operation.drift"));
    const writing = fixture.workspace.getWritingBootstrap({ projectId: fixture.projectId }).activeDocument!;
    fixture.workspace.updateWritingDocument({ projectId: fixture.projectId, documentId: writing.id, expectedHash: writing.revisionToken, status: writing.status, body: writing.body.replace("部分秘密", "新的全部秘密") });
    await assert.rejects(() => fixture.bridge.approveExecutionBrief({ projectId: fixture.projectId, briefId: driftDraft.briefId, revision: 1, expectedHash: driftDraft.expectedHashes.brief, expectedSourceSetHash: driftDraft.expectedHashes.sourceSet }), /stale/);

    const temporary = await fixture.tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.temp-open", retentionMode: "temporary" });
    const tempDraft = await fixture.bridge.createExecutionBrief({ ...briefInput(fixture, "operation.temp-brief"), originatingTianyiSessionId: temporary.sessionId });
    assert.equal(tempDraft.selectedArchiveMessageRefs.length, 0);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Execution Brief binding rejects a mismatched exploration before the deterministic run or synthesis", async () => {
  const fixture = await createFixture();
  try {
    const approved = await approveBrief(fixture);
    const exploration = await fixture.bridge.startExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision });
    await assert.rejects(
      () => fixture.bridge.runExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: "story-exploration-0000000000000000" }),
      /binding/i
    );
    await assert.rejects(
      () => fixture.bridge.synthesizeExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: "story-exploration-0000000000000000" }),
      /binding/i
    );
    assert.equal(exploration.status, "planned");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Candidate bundle and Result Receipt remain write-once across retry and restart", async () => {
  const fixture = await createFixture();
  try {
    const approved = await approveBrief(fixture);
    const exploration = await fixture.bridge.startExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision });
    await fixture.bridge.runExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    const first = await fixture.bridge.synthesizeExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    const binding = readExecutionBriefRunBinding(fixture.projectPath, approved.briefId, approved.revision);
    assert.ok(binding);
    const artifactPaths = [
      path.join(fixture.projectPath, ".world-os", "runs", "nuwa", "briefs", approved.briefId, `run-revision-${String(approved.revision).padStart(4, "0")}.json`),
      path.join(fixture.projectPath, ".world-os", "runs", "nuwa", binding.runId, "report", "prediction-bundle.json"),
      path.join(fixture.projectPath, ".world-os", "runs", "nuwa", binding.runId, "report", "result-receipt.json")
    ];
    const before = artifactPaths.map((target) => readFileSync(target, "utf8"));

    const retried = await fixture.bridge.synthesizeExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    assert.deepEqual(retried.resultReceipt, first.resultReceipt);
    assert.deepEqual(artifactPaths.map((target) => readFileSync(target, "utf8")), before);

    const restarted = createStoryStudioIntelligenceBridgeOperations(fixture.options);
    assert.deepEqual(await restarted.readResultReceipt({ projectId: fixture.projectId, briefId: approved.briefId }), first.resultReceipt);
    assert.deepEqual(artifactPaths.map((target) => readFileSync(target, "utf8")), before);

    const loaded = readNuwaRunPack(fixture.projectPath, binding.runId);
    assert.ok(loaded.bundle);
    await assert.rejects(
      async () => writeNuwaPredictionBundle({ workspacePath: fixture.projectPath, runId: binding.runId, bundle: { ...loaded.bundle!, authorGoal: "different candidate content" } }),
      /different content/i
    );
    assert.equal(readFileSync(artifactPaths[1], "utf8"), before[1]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("only the receipt-bound verifier can submit one route and consumed replay has zero side effects", async () => {
  const fixture = await createFixture();
  try {
    const approved = await approveBrief(fixture);
    const exploration = await fixture.bridge.startExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision });
    await fixture.bridge.runExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    const synthesized = await fixture.bridge.synthesizeExecutionBrief({ projectId: fixture.projectId, briefId: approved.briefId, revision: approved.revision, explorationId: exploration.id });
    const routeId = synthesized.exploration.routes[0]!.id;
    const submission = {
      projectId: fixture.projectId,
      briefId: approved.briefId,
      revision: approved.revision,
      explorationId: exploration.id,
      resultReceiptId: synthesized.resultReceipt.resultReceiptId,
      routeId
    };
    const first = await fixture.bridge.submitExecutionBriefRouteToImpact(submission);
    assert.equal(first.exploration.status, "submitted-to-impact");
    assert.equal(first.candidateReview.status, "accepted");
    assert.equal(first.candidateReview.candidates.find((candidate) => candidate.id === routeId)?.confirmationReceipt?.impactReviewId, first.review.id);
    assert.equal(first.candidateReview.candidates.find((candidate) => candidate.id === routeId)?.confirmationReceipt?.planningEventId, null);
    const beforeReplay = Object.fromEntries(listFiles(path.join(fixture.projectPath, ".world-os", "author-control"))
      .map((target) => [path.relative(fixture.projectPath, target), readFileSync(target, "utf8")]));
    const beforeCanon = canonicalMarkdown(fixture.projectPath);
    await assert.rejects(() => fixture.bridge.submitExecutionBriefRouteToImpact(submission), /consumed|submitted/i);
    const afterReplay = Object.fromEntries(listFiles(path.join(fixture.projectPath, ".world-os", "author-control"))
      .map((target) => [path.relative(fixture.projectPath, target), readFileSync(target, "utf8")]));
    assert.deepEqual(afterReplay, beforeReplay);
    assert.deepEqual(canonicalMarkdown(fixture.projectPath), beforeCanon);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "story-studio-intelligence-bridge-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "mist-lighthouse";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: projectId });
  const character = workspace.createWorldObject({ projectId, type: "character", title: "林远", status: "active" });
  workspace.createWorldObject({ projectId, type: "character", title: "阿岚", status: "missing" });
  workspace.createWorldObject({ projectId, type: "location", title: "旧灯塔" });
  workspace.createWorldObject({ projectId, type: "rule", title: "地下室秘密不可完整公开", status: "locked" });
  const chapter = workspace.createWritingDocument({ projectId, type: "chapter", title: "第三章" });
  const scene = workspace.createWritingDocument({ projectId, type: "scene", title: "铁门前的迟疑", chapterId: chapter.id });
  workspace.updateWritingDocument({ projectId, documentId: scene.id, expectedHash: scene.revisionToken, status: "drafting", body: "# 铁门前的迟疑\n\n[[林远]]在[[旧灯塔]]前决定是否告诉[[阿岚]]部分秘密。\n" });
  workspace.openWritingDocument({ projectId, documentId: scene.id });
  const options = { rootPath, stateFilePath, now: () => RECORDED_AT };
  const tianyi = createStoryStudioTianyiOperations(options);
  const opened = await tianyi.openTianyiSession({ projectId, operationId: "operation.session-open" });
  return { root, rootPath, stateFilePath, projectPath: path.join(rootPath, projectId), projectId, characterId: character.id, sceneId: scene.id, workspace, tianyi, sessionId: opened.sessionId, options, bridge: createStoryStudioIntelligenceBridgeOperations({ ...options, tianyiOperations: tianyi }) };
}

async function approveBrief(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const draft = await fixture.bridge.createExecutionBrief(briefInput(fixture));
  return fixture.bridge.approveExecutionBrief({
    projectId: fixture.projectId,
    briefId: draft.briefId,
    revision: draft.revision,
    expectedHash: draft.expectedHashes.brief,
    expectedSourceSetHash: draft.expectedHashes.sourceSet
  });
}

function briefInput(fixture: Awaited<ReturnType<typeof createFixture>>, operationId = "operation.brief-create") {
  return {
    projectId: fixture.projectId,
    authorGoal: "核验林远是否应向阿岚透露地下室的部分线索，并给出候选路线。",
    currentContext: { mode: "writing" as const, documentId: fixture.sceneId, objectIds: [fixture.characterId], selectionRef: "selection.writing.current" },
    selectedContextReceiptIds: [],
    selectedArchiveMessageRefs: [],
    approvedMemoryRefs: [],
    mustKeep: ["地下室秘密不可完整公开"],
    mustAvoid: ["不得自动选择候选路线"],
    unresolvedQuestions: ["阿岚会如何回应"],
    expectedOutputKind: "candidate-routes" as const,
    allowedAgents: ["nuwa.supervisor", "nuwa.causality", "nuwa.tension", "nuwa.evidence-critic"],
    allowedSkills: ["story-memory-recall@1.0.0"],
    capabilityBudget: { maxAgentRuns: 3, maxSkillCalls: 1, maxTokens: 4_000, timeoutSeconds: 30 },
    sensitivity: "project-private" as const,
    operationId,
    originatingTianyiSessionId: fixture.sessionId,
    returnDestination: { mode: "writing" as const, documentId: fixture.sceneId, selectionRef: "selection.writing.current" }
  };
}

function canonicalMarkdown(root: string): Record<string, string> {
  return Object.fromEntries(listFiles(root)
    .filter((file) => file.endsWith(".md") && !path.relative(root, file).startsWith(`.world-os${path.sep}`))
    .map((file) => [path.relative(root, file), readFileSync(file, "utf8")]));
}

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}
