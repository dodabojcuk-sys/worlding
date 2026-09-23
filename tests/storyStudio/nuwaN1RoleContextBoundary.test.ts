import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  advanceNuwaN1Run,
  buildStorySnapshot,
  compileNuwaN1Context,
  createNuwaN1Run,
  createNuwaPlan,
  createNuwaRunPack,
  cueNuwaN1Run,
  readNuwaN1Run,
  selectNuwaN1Attention,
  startNuwaN1Run,
  type NuwaN1Actor,
  type NuwaN1Context,
  type NuwaN1ExecutionAdapter,
  type NuwaN1Run
} from "../../src/storyIntelligence/index.ts";
import { createNuwaN1PiAdapter } from "../../apps/story-studio/server/nuwaN1PiAdapter.mjs";
import { createPiTextAgentAdapter, type PiTextProviderEvent } from "../../src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts";
import { buildEventStoryCrossingKnowledgeProjection } from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import { buildCharacterMemoryQueryProjection } from "../../src/storyContinuity/characterMemoryQuery.ts";
import {
  listRecallableCharacterMemories,
  readCharacterMemoryLedger,
  synchronizeCharacterHeardMemories,
  type ContinuityContext
} from "../../src/storyContinuity/index.ts";
import type { CharacterMemoryLedger, CharacterMemorySourceIdentity } from "../../src/storyContinuity/continuityTypes.ts";

const revision = "a".repeat(64);
const LIN = "character.林昭";
const AWU = "character.阿芜";
const AUTHOR_GOAL = "作者全局意图：让两人最终在灯塔下和解。";
const OTHER_ACTOR_SECRET = "怀疑顾澜私下卖过塔钟钥匙。";
const OWN_FACT = "亲眼看见守夜钟从挂钩上消失。";
const AUTHOR_ONLY_EVENT = "event.作者密灯塔用途";
const AUTHOR_ONLY_TITLE = "作者密：灯塔真正用途是封存名录";
const CUE_TEXT = "作者提示：不要提及塔内的名录。";

function actors(): NuwaN1Actor[] {
  return [
    {
      character: { id: LIN, revision }, displayName: "林昭", coreSummary: "守夜人，谨慎而执着。", localGoal: "确认钟声来源。",
      knownFacts: [{ factId: "fact.守夜钟失踪", summary: OWN_FACT, sourceRef: { id: "event.钟声中断", revision }, visibility: "experienced" }],
      beliefs: [{ beliefId: "belief.有人带走钟", summary: "相信有人故意带走钟。", stance: "believed", sourceRef: { id: "event.钟声中断", revision } }],
      unknownFactIds: [AUTHOR_ONLY_EVENT], allowedActions: ["speak", "observe", "ask"]
    },
    {
      character: { id: AWU, revision }, displayName: "阿芜", coreSummary: "码头工人，只掌握传闻。", localGoal: "判断是否该同行。",
      knownFacts: [{ factId: "fact.码头传闻", summary: "从码头工人处听说守夜钟不见了。", sourceRef: { id: "event.码头传闻", revision }, visibility: "heard" }],
      beliefs: [{ beliefId: "belief.顾澜可疑", summary: OTHER_ACTOR_SECRET, stance: "suspected", sourceRef: { id: "event.码头传闻", revision } }],
      unknownFactIds: [AUTHOR_ONLY_EVENT], allowedActions: ["speak", "observe", "ask"]
    }
  ];
}

async function withRun(runTest: (fixture: { workspace: string; run: NuwaN1Run }) => Promise<void> | void, overrideActors?: NuwaN1Actor[]) {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-n1-boundary-"));
  const workspace = path.join(root, "project");
  try {
    cpSync(path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1"), workspace, { recursive: true });
    const snapshot = buildStorySnapshot({ workspacePath: workspace });
    const plan = createNuwaPlan({ snapshot, authorGoal: AUTHOR_GOAL });
    createNuwaRunPack({ workspacePath: workspace, plan, snapshot });
    const scene = { storyUnit: { id: "story-unit.雨夜追查", revision }, sceneRef: { id: "scene.雾港灯塔外", revision }, observedAt: "2026-09-07T15:00:00.000Z", label: "雾港灯塔外" };
    const run = createNuwaN1Run({ workspacePath: workspace, runId: plan.runId, sourceSnapshotHash: snapshot.snapshotHash, scene, authorGoal: AUTHOR_GOAL, actors: overrideActors ?? actors(), operationId: "operation.n1.boundary.create", now: "2026-09-07T15:00:00.000Z" });
    await runTest({ workspace, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

/**
 * Sends a compiled role context through the production serialization boundary:
 * Nuwa N1 Pi adapter -> real Pi tool loop -> the message array handed to the
 * host Provider bridge. Assertions below therefore read the actual constructed
 * Provider request, not an intermediate object. No Provider is contacted.
 */
async function providerRequestFor(context: NuwaN1Context) {
  const captured: Array<{ messages: Array<Record<string, unknown>>; tools: unknown }> = [];
  const adapter = createNuwaN1PiAdapter({
    runtime: createPiTextAgentAdapter(),
    projectId: "project.n1-boundary",
    runId: context.runId,
    actorIds: [LIN, AWU],
    provider: { providerId: "local-provider", profileId: "local-profile", modelId: "local-model" },
    sourceIdentity: { kind: "root", workVersionId: "work.main", revision: "1" },
    async openProviderStream(input) {
      captured.push({ messages: structuredClone(input.messages), tools: input.tools });
      if (input.providerCall === 1) {
        return { traceId: `trace.${input.agentRunId}.1`, events: stream([
          { type: "tool-call-start", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0 },
          { type: "tool-call-delta", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0, argumentsDelta: "{}" },
          { type: "tool-call-end", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0, argumentsJson: "{}", arguments: {} },
          { type: "done" }
        ]) };
      }
      return { traceId: `trace.${input.agentRunId}.2`, events: stream([
        { type: "chunk", text: JSON.stringify({ intent: "只按本角色可知内容行动。", speech: null, action: { action: "observe", targetId: null }, observableResult: "完成一次受限观察。" }), finishReason: "stop", usage: { promptTokens: 48, completionTokens: 21, totalTokens: 69 } },
        { type: "done" }
      ]) };
    }
  });
  const request = await adapter.request(context);
  const toolResult = await adapter.executeTool({ context, request });
  await adapter.continueAfterTool({ context, toolResult });
  const last = captured.at(-1)!;
  const toolMessage = last.messages.find((message) => message.role === "tool");
  const systemMessage = last.messages.find((message) => message.role === "system");
  const userMessage = last.messages.find((message) => message.role === "user");
  return {
    wire: JSON.stringify(last.messages),
    rolePayload: (JSON.parse(String(toolMessage!.content)) as { context: Record<string, unknown> }).context,
    instructions: `${String(systemMessage?.content ?? "")}\n${String(userMessage?.content ?? "")}`
  };
}

function fakeAdapter(observed: { contexts: NuwaN1Context[] }): NuwaN1ExecutionAdapter {
  return {
    adapterId: "local-fake.nuwa-n1",
    async request(context) { observed.contexts.push(structuredClone(context)); return { type: "tool-request", toolName: "read_role_context", requestId: `tool.${context.step}`, actor: context.actor }; },
    async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
    async continueAfterTool({ context }) {
      return {
        type: "actor-result", actor: context.actor,
        intent: "先把亲眼所见告诉同行者。",
        speech: context.actor.id === LIN ? "我亲眼看见钟不见了，先别靠近塔门。" : null,
        heardByActorIds: context.actor.id === LIN ? [AWU] : [],
        action: { action: "speak" as const, targetId: null },
        observableResult: "在场角色都听到这句提醒。",
        usage: { inputTokens: 120, outputTokens: 44 }
      };
    }
  };
}

async function* stream(values: PiTextProviderEvent[]): AsyncGenerator<PiTextProviderEvent> { for (const value of values) yield value; }

test("边界1: 作者独有内容不进入实际 Provider 请求", async () => {
  await withRun(async ({ run }) => {
    const { wire, rolePayload } = await providerRequestFor(compileNuwaN1Context(run, run.actors[0]!, "operation.n1.boundary.author"));
    assert.equal(wire.includes(AUTHOR_GOAL), false, "the author-wide goal must not reach the role request");
    assert.equal(wire.includes(AUTHOR_ONLY_TITLE), false, "author-only event content must not reach the role request");
    assert.equal(wire.includes(AUTHOR_ONLY_EVENT), false, "permission-excluded identities must stay author-side");
    assert.equal(rolePayload.authorGoal, undefined, "the role payload carries no author goal field");
    assert.equal(wire.includes("hiddenEventCount"), false, "author comparison counters must not travel with the role payload");
  });
});

test("边界1补充: 角色身份、现场与行动约束确实进入请求（允许项）", async () => {
  await withRun(async ({ run }) => {
    const { wire, rolePayload, instructions } = await providerRequestFor(compileNuwaN1Context(run, run.actors[0]!, "operation.n1.boundary.allowed"));
    assert.equal(wire.includes(OWN_FACT), true, "the role's own experienced content must be delivered");
    assert.equal((rolePayload.actor as { id: string }).id, LIN);
    assert.equal(rolePayload.localGoal, "确认钟声来源。");
    assert.deepEqual(rolePayload.allowedActions, ["speak", "observe", "ask"]);
    assert.match(String((rolePayload.scene as { label: string }).label), /雾港灯塔外/u);
    assert.match(instructions, /heardByActorIds/u, "the recipient allowlist is part of the turn contract");
    assert.equal(instructions.includes(AUTHOR_GOAL), false, "the instruction text carries no author-wide goal");
  });
});

test("边界1修复: 注意力诊断不再进入角色消息；作者提示仍按现契约下发", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.boundary.start" });
    const cued = cueNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: started.revision, operationId: "operation.n1.boundary.cue", instruction: CUE_TEXT, addressee: { kind: "actors", actorIds: [LIN, AWU] } });
    const context = compileNuwaN1Context(readNuwaN1Run(workspace, run.runId) ?? cued, cued.actors[0]!, "operation.n1.boundary.cued");
    assert.ok(context.attention.selected.length > 0, "the author-side attention audit is still produced");
    const { wire, rolePayload } = await providerRequestFor(context);
    assert.equal("attention" in rolePayload, false, "selection diagnostics are author-side only after the serialization boundary");
    assert.equal(wire.includes("permission-first-lexical-utf8"), false, "the ranking algorithm name cannot reach the model");
    assert.equal(wire.includes("utf8-byte-upper-bound"), false, "the byte estimator identity cannot reach the model");
    assert.equal(wire.includes("lower-relevance-within-budget"), false, "a budget exclusion must not be phrased as something the character is aware of");
    assert.equal(wire.includes(String(context.attention.budget.sourceBudgetBytes)), false, "byte arithmetic stays author-side");
    assert.equal(rolePayload.excluded.reasonCodes?.[0], "not-known-by-actor", "the role keeps its own blind-spot marker, which is not an attention diagnostic");
    assert.equal(rolePayload.authorCue, CUE_TEXT, "open product question: the author cue is still delivered verbatim");
    assert.equal(rolePayload.remaining.inputTokenBudget, 4096, "remaining step and token budget stay, as required by the R4 composition rule");
  });
});

test("边界2: 他人秘密、其他分支与未来获知不进入角色范围", async () => {
  await withRun(async ({ run }) => {
    const { wire } = await providerRequestFor(compileNuwaN1Context(run, run.actors[0]!, "operation.n1.boundary.other"));
    assert.equal(wire.includes(OTHER_ACTOR_SECRET), false, "another actor's private belief must not enter this role's request");
    assert.equal(wire.includes("顾澜"), false, "even the private belief's subject name must not cross");
    assert.equal(wire.includes("码头传闻"), false, "the other actor's source identity must not cross either");
  });

  const root = mkdtempSync(path.join(tmpdir(), "tianyan-n1-boundary-ledger-"));
  try {
    const context = continuityContext(root, "story-a");
    await synchronizeCharacterHeardMemories(context, rumorRun("2026-09-09T10:00:00.000Z"));
    const laterScene = "2026-09-09T12:00:00.000Z";
    assert.equal((await listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: rootIdentity("2"), observedAt: laterScene })).length, 1, "same-work-version recall baseline");
    assert.equal((await listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: { kind: "derived", workVersionId: "work.if.lighthouse", revision: "2" }, observedAt: laterScene })).length, 0, "a main-line heard memory cannot drift into an IF branch recall");
    assert.equal((await listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: rootIdentity("2"), observedAt: "2026-09-09T09:59:59.000Z" })).length, 0, "information learned after the recall point stays unavailable");
    assert.equal((await listRecallableCharacterMemories(context, { recipientId: LIN, sourceIdentity: rootIdentity("2"), observedAt: laterScene })).length, 0, "a non-recipient remains unaware");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("边界3: 传闻纠正前后的认知差异与召回时钟语义", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-n1-boundary-belief-"));
  try {
    const context = continuityContext(root, "story-a");
    await synchronizeCharacterHeardMemories(context, correctionRuns()[0]!);
    await synchronizeCharacterHeardMemories(context, correctionRuns()[1]!);

    const beforeCorrection = await listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: rootIdentity("2"), observedAt: "2026-09-09T10:30:00.000Z" });
    const afterCorrection = await listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: rootIdentity("2"), observedAt: "2026-09-09T13:00:00.000Z" });
    assert.deepEqual(beforeCorrection.map((record) => record.statement), ["塔钟是外人偷走的。"], "before the correction the role holds only the rumor");
    assert.equal(afterCorrection.length, 2, "the correction is additive");
    assert.deepEqual(afterCorrection.map((record) => record.statement).sort(), ["塔钟是外人偷走的。", "勘验记录显示钟仍在塔内。"].sort());
    assert.equal(afterCorrection.every((record) => Object.hasOwn(record, "supersededBy") === false), true, "current gap: the retracted rumor carries no supersession marker, so both lines reach the role with equal status");
    assert.equal(afterCorrection.every((record) => record.validity.state === "active"), true, "neither line is invalidated; only wall-clock order differs");

    await assert.rejects(listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: rootIdentity("2"), observedAt: "world-time.23:00" }), /recall timestamp is invalid/u,
      "the recall clock is a strict real timestamp, so a story-time point cannot be supplied as asOf");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("边界4: 接收对象与在场传递进入角色上下文，保留内容不被删除", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.boundary.dialogue.start" });
    const observed = { contexts: [] as NuwaN1Context[] };
    await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: started.revision, operationId: "operation.n1.boundary.dialogue.step", adapter: fakeAdapter(observed) });
    const after = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(after.steps.length, 1);
    assert.deepEqual(after.steps[0]!.heardByActorIds, [AWU], "the recipient list is durable on the committed step");

    const receiver = await providerRequestFor(compileNuwaN1Context(after, after.actors[1]!, "operation.n1.boundary.receiver"));
    assert.deepEqual(receiver.rolePayload.recentDialogue, [{ speakerId: LIN, text: "我亲眼看见钟不见了，先别靠近塔门。", observedStep: 1 }], "the heard utterance reaches the receiver");
    assert.equal(receiver.wire.includes(AWU), true, "the receiver's own identity is part of the request");

    const sender = await providerRequestFor(compileNuwaN1Context(after, after.actors[0]!, "operation.n1.boundary.sender"));
    assert.equal((sender.rolePayload.knownFacts as unknown[]).length, 1, "the sender keeps its own memory after speaking");
    assert.equal(JSON.stringify(sender.rolePayload.knownFacts).includes(OWN_FACT), true);
  });

  const root = mkdtempSync(path.join(tmpdir(), "tianyan-n1-boundary-secret-"));
  try {
    const context = continuityContext(root, "story-a");
    await synchronizeCharacterHeardMemories(context, rumorRun("2026-09-09T10:00:00.000Z"));
    const before = await readCharacterMemoryLedger(context, AWU);
    assert.equal(before?.value.records.length, 1);
    const secretEvent = { id: "event.lighthouse.name", title: "阿芜独自记住灯塔名录位置", status: "confirmed", revisionToken: "e1", tags: ["知情：character.阿芜=已亲历"], knowledgeSubjectIds: [AWU] };
    const characters = [{ id: LIN, label: "林昭", revisionToken: "r1" }, { id: AWU, label: "阿芜", revisionToken: "r2" }];
    const knowledge = buildEventStoryCrossingKnowledgeProjection({ projectId: "story-a", observerId: AWU, characters, events: [secretEvent] });
    const asOther = buildEventStoryCrossingKnowledgeProjection({ projectId: "story-a", observerId: LIN, characters, events: [secretEvent] });
    assert.equal(knowledge.visibleEvents.some((event) => event.title.includes("灯塔名录")), true, "the owner keeps her own experience available to recall");
    assert.equal(asOther.hiddenCount, 1, "the same Event stays hidden from another character");
    assert.equal(JSON.stringify(asOther.visibleEvents).includes("灯塔名录"), false, "input condition only: no withholding behaviour is claimed here");
    for (let index = 0; index < 3; index += 1) {
      const projection = buildCharacterMemoryQueryProjection({ projectId: "story-a", characterId: AWU, sourceIdentity: rootIdentity("2"), knowledge, ledger: before!.value });
      assert.equal(projection.writes, 0);
      assert.equal(projection.providerCalls, 0);
      assert.equal(projection.records.some((record) => record.title.includes("灯塔名录")), true, "the author query sees the secret; it is retained, not erased");
      assert.equal(projection.records.some((record) => record.kind === "heard"), true, "heard provenance remains present for the author");
    }
    assert.deepEqual((await readCharacterMemoryLedger(context, AWU))!.value, before!.value, "an author query must not mutate the character ledger");
    assert.equal((await listRecallableCharacterMemories(context, { recipientId: AWU, sourceIdentity: rootIdentity("2"), observedAt: "2026-09-09T12:00:00.000Z" }))[0]!.statement, "塔钟是外人偷走的。", "the secret is still recallable by its holder, not erased to make withholding work");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("边界5: 作者查档前后角色本轮上下文逐字节一致", async () => {
  await withRun(async ({ workspace, run }) => {
    const before = JSON.stringify(compileNuwaN1Context(readNuwaN1Run(workspace, run.runId)!, run.actors[0]!, "operation.n1.boundary.sideeffect"));
    const characters = [{ id: LIN, label: "林昭", revisionToken: "r1" }, { id: AWU, label: "阿芜", revisionToken: "r2" }];
    const knowledge = buildEventStoryCrossingKnowledgeProjection({ projectId: "project.n1-boundary", observerId: LIN, characters, events: [{ id: "event.钟声中断", title: "守夜钟失踪", status: "confirmed", revisionToken: "e1", tags: ["知情：character.林昭=已亲历"], knowledgeSubjectIds: [LIN] }] });
    const emptyLedger: CharacterMemoryLedger = { version: "story-continuity-character-memory-ledger/v1", ownerId: "character-memory-ledger.probe", projectId: "project.n1-boundary", recipientId: LIN, state: "active", records: [] };
    const treeBefore = hashTree(workspace);
    for (let index = 0; index < 5; index += 1) {
      const query = buildCharacterMemoryQueryProjection({ projectId: "project.n1-boundary", characterId: LIN, sourceIdentity: rootIdentity("1"), knowledge, ledger: emptyLedger });
      assert.equal(query.records.length, 1);
      assert.equal(query.hiddenEventCount, 0);
    }
    const after = JSON.stringify(compileNuwaN1Context(readNuwaN1Run(workspace, run.runId)!, run.actors[0]!, "operation.n1.boundary.sideeffect"));
    assert.equal(after, before, "five author queries change neither the compiled role context nor its evidence counters");
    assert.equal(hashTree(workspace), treeBefore, "the author query path writes nothing into the Run workspace");
  });
});

test("边界6: 预算排除、从未获知与暂未唤起是否可分别表达", async () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    key: `knowledge:fact.long-${index}`, kind: "knowledge" as const, sourceId: `event.long-${index}`,
    summary: `旧集市记录 ${index}：摊位、天气与船期。`, required: false, serializedBytes: 180
  }));
  const generous = selectNuwaN1Attention({ goal: "核对钟声", sceneLabel: "雾港灯塔外", candidates, baseBytes: 1_000, maxInputTokens: 40_000, outputReserveTokens: 1_024 });
  assert.equal(generous.selected.length, candidates.length, "current behaviour: with room to spare every authorized candidate is selected");
  assert.equal(generous.excluded.count, 0, "current behaviour: there is no relevance threshold, so 'remembered but not recalled this turn' cannot be expressed");

  const tight = selectNuwaN1Attention({ goal: "核对钟声", sceneLabel: "雾港灯塔外", candidates, baseBytes: 200, maxInputTokens: 1_500, outputReserveTokens: 1_024 });
  assert.ok(tight.selected.length > 0 && tight.selected.length < candidates.length);
  assert.deepEqual(tight.excluded.reasonCounts, [{ reason: "lower-relevance-within-budget", count: candidates.length - tight.selected.length }], "budget exclusion is its own reason code");

  const overflowing = selectNuwaN1Attention({
    goal: "核对钟声", sceneLabel: "雾港灯塔外",
    candidates: [{ key: "knowledge:fact.required", kind: "knowledge", sourceId: "event.required", summary: "当前场景必需内容。", required: true, serializedBytes: 4_000 }, ...candidates],
    baseBytes: 1_000, maxInputTokens: 3_000, outputReserveTokens: 1_024
  });
  assert.equal(overflowing.selected.length, 0, "current behaviour: required overflow drops every candidate, so 'nothing fits' and 'nothing authorized' look alike downstream");
  assert.equal(overflowing.budget.requiredOverflow, true);

  await withRun(async ({ run }) => {
    const context = compileNuwaN1Context(run, run.actors[0]!, "operation.n1.boundary.causes");
    const { rolePayload } = await providerRequestFor(context);
    assert.deepEqual(rolePayload.excluded, { count: 1, reasonCodes: ["not-known-by-actor"] }, "never-learned is a separate, count-only channel");
    assert.equal(rolePayload.knownFacts.length, 1, "this fixture has no budget exclusion; nothing authorized was dropped");
    assert.equal("attention" in rolePayload, false, "budget exclusion is reported to the author only, so the three causes cannot merge inside the role message");
    assert.equal(context.attention.excluded.count, 0, "the author-side audit still records the budget outcome");
  });
});

function continuityContext(rootPath: string, projectId: string): ContinuityContext {
  mkdirSync(path.join(rootPath, projectId), { recursive: true });
  writeFileSync(path.join(rootPath, projectId, "project.md"), `---\nid: ${projectId}\n---\n`, "utf8");
  return { rootPath, agentId: "agent.nuwa", scope: "project", projectId };
}

function rootIdentity(revisionValue: string): CharacterMemorySourceIdentity {
  return { kind: "root", workVersionId: "work.main", revision: revisionValue };
}

function rumorRun(committedAt: string) {
  return {
    runId: `nuwa-n1.rumor-${committedAt.slice(11, 19).replace(/:/g, "")}`,
    sourceIdentity: { kind: "root" as const, workVersionId: "work.main", revision: "1" },
    scene: { sceneRef: { id: "story-unit.dock", revision: "1" }, observedAt: committedAt },
    steps: [{
      stepId: `nuwa-n1-step.${committedAt.slice(11, 19).replace(/:/g, "")}`, committedAt,
      heardStatements: [{ recipientId: AWU, speakerId: "character.码头主人", statement: "塔钟是外人偷走的。", sourceStepId: `nuwa-n1-step.${committedAt.slice(11, 19).replace(/:/g, "")}`, sourceRevision: `revision.${committedAt.slice(11, 19).replace(/:/g, "")}` }]
    }]
  };
}

function correctionRuns() {
  return [rumorRun("2026-09-09T10:00:00.000Z"), {
    runId: "nuwa-n1.corrected-130000",
    sourceIdentity: { kind: "root" as const, workVersionId: "work.main", revision: "2" },
    scene: { sceneRef: { id: "story-unit.lighthouse", revision: "2" }, observedAt: "2026-09-09T12:00:00.000Z" },
    steps: [{
      stepId: "nuwa-n1-step.120000", committedAt: "2026-09-09T12:00:00.000Z",
      heardStatements: [{ recipientId: AWU, speakerId: LIN, statement: "勘验记录显示钟仍在塔内。", sourceStepId: "nuwa-n1-step.120000", sourceRevision: "revision.120000" }]
    }]
  }];
}

function hashTree(root: string): string {
  const lines: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) lines.push(`${path.relative(root, full)}:${createHash("sha256").update(readFileSync(full)).digest("hex").slice(0, 16)}`);
    }
  };
  walk(root);
  return lines.join("\n");
}
