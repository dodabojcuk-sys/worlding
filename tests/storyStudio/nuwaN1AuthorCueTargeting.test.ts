import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  startNuwaN1Run,
  type NuwaN1Actor,
  type NuwaN1Context,
  type NuwaN1CueAddressee,
  type NuwaN1ExecutionAdapter,
  type NuwaN1Run
} from "../../src/storyIntelligence/index.ts";
import { createNuwaN1PiAdapter } from "../../apps/story-studio/server/nuwaN1PiAdapter.mjs";
import { createPiTextAgentAdapter, type PiTextProviderEvent } from "../../src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts";

const revision = "b".repeat(64);
const LIN = "character.林昭";
const AWU = "character.阿芜";
const GU = "character.顾澜";
const AUTHOR_GOAL = "作者全局意图：让三人在灯塔下当面对质。";
const LIN_CUE = "只定向给林昭：先确认钟楼上方的声音。";
const GROUP_CUE = "定向给角色组：把旧桥的见闻说清楚。";
const ALL_CUE = "显式全体：下一步所有人都先停一步。";
const NUWA_CUE = "给女娲的规划：把这段走向准备成候选，不要让任何角色知道。";
const LEGACY_CUE = "历史遗留的无对象提示。";

function actors(): NuwaN1Actor[] {
  return [
    {
      character: { id: LIN, revision }, displayName: "林昭", coreSummary: "守夜人，谨慎而执着。", localGoal: "确认钟声来源。",
      knownFacts: [{ factId: "fact.守夜钟失踪", summary: "亲眼看见守夜钟从挂钩上消失。", sourceRef: { id: "event.钟声中断", revision }, visibility: "experienced" }],
      beliefs: [{ beliefId: "belief.有人带走钟", summary: "相信有人故意带走钟。", stance: "believed", sourceRef: { id: "event.钟声中断", revision } }],
      unknownFactIds: ["event.作者密灯塔用途"], allowedActions: ["speak", "observe", "ask"]
    },
    {
      character: { id: AWU, revision }, displayName: "阿芜", coreSummary: "码头工人，只掌握传闻。", localGoal: "判断是否该同行。",
      knownFacts: [{ factId: "fact.码头传闻", summary: "从码头工人处听说守夜钟不见了。", sourceRef: { id: "event.码头传闻", revision }, visibility: "heard" }],
      beliefs: [{ beliefId: "belief.顾澜可疑", summary: "怀疑顾澜私下卖过塔钟钥匙。", stance: "suspected", sourceRef: { id: "event.码头传闻", revision } }],
      unknownFactIds: ["event.作者密灯塔用途"], allowedActions: ["speak", "observe", "ask"]
    },
    {
      character: { id: GU, revision }, displayName: "顾澜", coreSummary: "灯塔文书，回避旧账。", localGoal: "不让名录被公开。",
      knownFacts: [{ factId: "fact.登记簿缺页", summary: "记得登记簿少了两页。", sourceRef: { id: "event.登记簿缺页", revision }, visibility: "witnessed" }],
      beliefs: [], unknownFactIds: ["event.作者密灯塔用途"], allowedActions: ["speak", "observe", "write"]
    }
  ];
}

async function withRun(runTest: (fixture: { workspace: string; run: NuwaN1Run }) => Promise<void> | void) {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-n1-cue-target-"));
  const workspace = path.join(root, "project");
  try {
    cpSync(path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1"), workspace, { recursive: true });
    const snapshot = buildStorySnapshot({ workspacePath: workspace });
    const plan = createNuwaPlan({ snapshot, authorGoal: AUTHOR_GOAL });
    createNuwaRunPack({ workspacePath: workspace, plan, snapshot });
    const scene = { storyUnit: { id: "story-unit.雨夜追查", revision }, sceneRef: { id: "scene.雾港灯塔外", revision }, observedAt: "2026-09-07T15:00:00.000Z", label: "雾港灯塔外" };
    const run = createNuwaN1Run({ workspacePath: workspace, runId: plan.runId, sourceSnapshotHash: snapshot.snapshotHash, scene, authorGoal: AUTHOR_GOAL, actors: actors(), operationId: "operation.n1.cue.create", now: "2026-09-07T15:00:00.000Z" });
    await runTest({ workspace, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function cue(workspace: string, run: NuwaN1Run, expectedRevision: number, instruction: string, addressee?: unknown, operationId = "operation.n1.cue.rejected") {
  return cueNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision, instruction, ...(addressee === undefined ? {} : { addressee }), operationId, now: "2026-09-07T15:01:00.000Z" });
}

function authorCues(run: NuwaN1Run): Record<string, string | null> {
  return Object.fromEntries(run.actors.map((actor, index) => [actor.character.id, compileNuwaN1Context(run, actor, `operation.n1.inspect.${index}`).authorCue]));
}

/**
 * Crosses the production serialization boundary (Nuwa N1 Pi adapter -> real Pi
 * tool loop -> captured Provider messages) so a claim about who receives the
 * instruction is read from the actual constructed request. No Provider is
 * contacted; the stream below is a local fake.
 */
async function providerRequestFor(context: NuwaN1Context) {
  const captured: Array<Array<Record<string, unknown>>> = [];
  const adapter = createNuwaN1PiAdapter({
    runtime: createPiTextAgentAdapter(),
    projectId: "project.n1-cue-target",
    runId: context.runId,
    actorIds: [LIN, AWU, GU],
    provider: { providerId: "local-provider", profileId: "local-profile", modelId: "local-model" },
    sourceIdentity: { kind: "root", workVersionId: "work.main", revision: "1" },
    async openProviderStream(input) {
      captured.push(structuredClone(input.messages));
      if (input.providerCall === 1) {
        return { traceId: `trace.${input.agentRunId}.1`, events: stream([
          { type: "tool-call-start", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0 },
          { type: "tool-call-delta", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0, argumentsDelta: "{}" },
          { type: "tool-call-end", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0, argumentsJson: "{}", arguments: {} },
          { type: "done" }
        ]) };
      }
      return { traceId: `trace.${input.agentRunId}.2`, events: stream([
        { type: "chunk", text: JSON.stringify({ intent: "只按本角色可知内容行动。", speech: null, action: { action: "observe", targetId: null }, observableResult: "完成一次受限观察。" }), finishReason: "stop", usage: { promptTokens: 40, completionTokens: 18, totalTokens: 58 } },
        { type: "done" }
      ]) };
    }
  });
  const request = await adapter.request(context);
  const toolResult = await adapter.executeTool({ context, request });
  await adapter.continueAfterTool({ context, toolResult });
  const messages = captured.at(-1)!;
  const systemUser = messages.filter((message) => message.role === "system" || message.role === "user").map((message) => String(message.content ?? "")).join("\n");
  return { wire: JSON.stringify(messages), rolePayload: JSON.parse(String(messages.find((message) => message.role === "tool")?.content)), systemUser };
}

async function* stream(values: PiTextProviderEvent[]): AsyncGenerator<PiTextProviderEvent> { for (const value of values) yield value; }

function recordingAdapter(observed: { contexts: NuwaN1Context[] }): NuwaN1ExecutionAdapter {
  return {
    adapterId: "local-fake.nuwa-n1-cue",
    async request(context) { observed.contexts.push(structuredClone(context)); return { type: "tool-request", toolName: "read_role_context", requestId: `tool.${context.step}`, actor: context.actor }; },
    async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
    async continueAfterTool({ context }) {
      return {
        type: "actor-result", actor: context.actor,
        intent: "先按亲眼所见说明处境。",
        speech: context.actor.id === LIN ? "我亲眼看见钟不见了。" : "我只转述码头上的说法。",
        heardByActorIds: [context.actor.id === LIN ? AWU : LIN],
        action: { action: "speak", targetId: null },
        observableResult: "在场角色都听到这句提醒。",
        usage: { inputTokens: 120, outputTokens: 44 }
      };
    }
  };
}

test("作者提示没有对象时整份拒绝：不写入、不广播、不改修订", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    assert.throws(() => cue(workspace, run, started.revision, LIN_CUE), /必须指定接收对象/u);
    assert.throws(() => cue(workspace, run, started.revision, LIN_CUE, { kind: "actors", actorIds: [] }), /至少需要一位接收角色/u);
    assert.throws(() => cue(workspace, run, started.revision, LIN_CUE, "全体角色"), /接收对象无效/u);
    const after = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(after.pendingCue, null, "a rejected cue leaves no half-written instruction behind");
    assert.equal(after.revision, started.revision, "a rejected cue does not advance the Run revision");
    assert.deepEqual(after.receipts.filter((receipt) => receipt.kind === "cue"), [], "no cue receipt is recorded for a rejected instruction");
  });
});

test("无效接收对象（名单外角色）整份拒绝且不部分发送", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    assert.throws(() => cue(workspace, run, started.revision, LIN_CUE, { kind: "actors", actorIds: [LIN, "character.不在名单"] }), /不在本次排演的冻结名单内/u);
    const after = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(after.pendingCue, null);
    assert.equal(after.revision, started.revision);
    const delivered = cue(workspace, run, after.revision, LIN_CUE, { kind: "actors", actorIds: [LIN] });
    assert.deepEqual(delivered.pendingCue?.addressee, { kind: "actors", actorIds: [LIN] }, "the same request succeeds once the recipient is inside the frozen roster");
  });
});

test("指定单人、角色组与显式全体分别只送达所选对象", async () => {
  await withRun(async ({ workspace, run }) => {
    const cases: Array<{ addressee: NuwaN1CueAddressee; instruction: string; recipients: string[] }> = [
      { addressee: { kind: "actors", actorIds: [LIN] }, instruction: LIN_CUE, recipients: [LIN] },
      { addressee: { kind: "actors", actorIds: [AWU, GU] }, instruction: GROUP_CUE, recipients: [AWU, GU] },
      { addressee: { kind: "all-actors" }, instruction: ALL_CUE, recipients: [LIN, AWU, GU] }
    ];
    let revisionNow = run.revision;
    for (const item of cases) {
      const cued = cue(workspace, run, revisionNow, item.instruction, item.addressee, `operation.n1.cue.${item.recipients.length}`);
      revisionNow = cued.revision;
      const delivered = authorCues(cued);
      assert.deepEqual(
        Object.entries(delivered).filter(([, text]) => text !== null).map(([id]) => id).sort(),
        [...item.recipients].sort(),
        `${item.instruction} reaches exactly the selected recipients`
      );
      for (const [index, actor] of cued.actors.entries()) {
        const context = compileNuwaN1Context(cued, actor, `operation.n1.cue.case${index}`);
        assert.equal(context.authorCue, item.recipients.includes(actor.character.id) ? item.instruction : null, `${actor.character.id} sees ${item.recipients.includes(actor.character.id) ? "its own instruction" : "nothing"}`);
      }
    }
  });
});

test("给女娲的规划不进入任何角色消息，也不被角色回合消费", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const cued = cue(workspace, run, started.revision, NUWA_CUE, { kind: "nuwa" }, "operation.n1.cue.nuwa");
    assert.deepEqual(cued.pendingCue?.addressee, { kind: "nuwa" });
    assert.deepEqual(authorCues(cued), { [LIN]: null, [AWU]: null, [GU]: null }, "no role context carries the 女娲 plan");
    const { wire, rolePayload, systemUser } = await providerRequestFor(compileNuwaN1Context(cued, cued.actors[0]!, "operation.n1.cue.nuwa.wire"));
    assert.equal(wire.includes(NUWA_CUE), false, "the 女娲 plan never crosses the serialization boundary");
    assert.equal(rolePayload.context.authorCue, null, "the role payload keeps the field but carries nothing for the role to act on");
    assert.equal(systemUser.includes(NUWA_CUE), false, "the plan is not folded into the turn instructions either");
    const observed = { contexts: [] as NuwaN1Context[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.cue.nuwa.step", adapter: recordingAdapter(observed) });
    assert.equal(observed.contexts[0]!.authorCue, null, "the first role turn is compiled without the 女娲 plan");
    assert.deepEqual(stepped.pendingCue?.addressee, { kind: "nuwa" }, "a turn that could not deliver the instruction does not claim to have consumed it");
    assert.equal(stepped.steps.length, 1);
  });
});

test("定向提示只在该角色自己的回合生效并被消费", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const cued = cue(workspace, run, started.revision, LIN_CUE, { kind: "actors", actorIds: [LIN] }, "operation.n1.cue.lin");
    const firstObserved = { contexts: [] as NuwaN1Context[] };
    const afterFirst = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.cue.turn-one", adapter: recordingAdapter(firstObserved) });
    assert.equal(firstObserved.contexts[0]!.actor.id, LIN, "the first turn belongs to the addressed role");
    assert.equal(firstObserved.contexts[0]!.authorCue, LIN_CUE);
    assert.equal(afterFirst.pendingCue, null, "the addressed role's committed turn consumes the instruction");
    const secondObserved = { contexts: [] as NuwaN1Context[] };
    const afterSecond = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: afterFirst.revision, operationId: "operation.n1.cue.turn-two", adapter: recordingAdapter(secondObserved) });
    assert.equal(secondObserved.contexts[0]!.actor.id, AWU);
    assert.equal(secondObserved.contexts[0]!.authorCue, null, "a cue addressed to 林昭 is not silently reused for the next role");
    assert.equal(afterSecond.pendingCue, null);
  });
});

test("未送达的定向提示保留到接收者的回合，且不会被写成角色经历", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const cued = cue(workspace, run, started.revision, GROUP_CUE, { kind: "actors", actorIds: [GU] }, "operation.n1.cue.gu");
    const beforeTurn = { contexts: [] as NuwaN1Context[] };
    const afterLinTurn = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.cue.lin-turn", adapter: recordingAdapter(beforeTurn) });
    assert.equal(beforeTurn.contexts[0]!.authorCue, null);
    assert.deepEqual(afterLinTurn.pendingCue?.addressee, { kind: "actors", actorIds: [GU] }, "the instruction waits for its own recipient instead of being consumed by another role");
    const afterAwuTurn = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: afterLinTurn.revision, operationId: "operation.n1.cue.awu-turn", adapter: recordingAdapter(beforeTurn) });
    assert.equal(beforeTurn.contexts[1]!.authorCue, null);
    assert.deepEqual(afterAwuTurn.pendingCue?.addressee, { kind: "actors", actorIds: [GU] });
    const guTurn = { contexts: [] as NuwaN1Context[] };
    const delivered = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: afterAwuTurn.revision, operationId: "operation.n1.cue.gu-turn", adapter: recordingAdapter(guTurn) });
    assert.equal(guTurn.contexts[0]!.actor.id, GU);
    assert.equal(guTurn.contexts[0]!.authorCue, GROUP_CUE);
    assert.equal(delivered.pendingCue, null, "only the recipient's committed turn consumes it");
    const committed = JSON.stringify(delivered.steps);
    assert.equal(committed.includes(GROUP_CUE), false, "an author instruction to a role is not recorded as a spoken or observed event");
    assert.equal(JSON.stringify(delivered.steps.flatMap((step) => step.heardStatements)).includes(GROUP_CUE), false, "the instruction is not delivered as something the role heard in the story");
    assert.deepEqual(delivered.actors.map((actor) => actor.knownFacts), cued.actors.map((actor) => actor.knownFacts), "no knowledge entry is created from the author instruction");
  });
});

test("历史无对象 pendingCue 仍可读、不广播，补选对象后恢复送达", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const cued = cue(workspace, run, started.revision, LEGACY_CUE, { kind: "all-actors" }, "operation.n1.cue.legacy");
    const runFile = path.join(workspace, ".world-os", "runs", "nuwa", run.runId, "run.json");
    const pack = JSON.parse(readFileSync(runFile, "utf8")) as { nuwaN1: { pendingCue: { addressee?: unknown } } };
    delete pack.nuwaN1.pendingCue.addressee;
    writeFileSync(runFile, JSON.stringify(pack));
    const legacy = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(legacy.pendingCue?.instruction, LEGACY_CUE, "a Run written before targeting stays readable");
    assert.equal(legacy.pendingCue?.addressee, null);
    assert.deepEqual(authorCues(legacy), { [LIN]: null, [AWU]: null, [GU]: null }, "a cue without a recipient is not reinterpreted as a broadcast");
    const retargeted = cue(workspace, legacy, legacy.revision, LEGACY_CUE, { kind: "actors", actorIds: [AWU] }, "operation.n1.cue.legacy-retarget");
    assert.deepEqual(authorCues(retargeted), { [LIN]: null, [AWU]: LEGACY_CUE, [GU]: null }, "naming the recipient delivers the same preserved text");
    assert.deepEqual(retargeted.receipts.filter((receipt) => receipt.kind === "cue").length, 2, "the recovery is an ordinary audited cue operation");
  });
});

test("定向提示不会冒称已被本回合使用：执行期间加入的提示留给下一步", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const observed = { contexts: [] as NuwaN1Context[] };
    const adapter: NuwaN1ExecutionAdapter = {
      ...recordingAdapter(observed),
      async request(context) {
        observed.contexts.push(structuredClone(context));
        const live = readNuwaN1Run(workspace, run.runId)!;
        cue(workspace, live, live.revision, LIN_CUE, { kind: "actors", actorIds: [GU] }, "operation.n1.cue.mid-flight");
        return { type: "tool-request", toolName: "read_role_context", requestId: `tool.${context.step}`, actor: context.actor };
      }
    };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: started.revision, operationId: "operation.n1.cue.mid-flight.step", adapter });
    assert.equal(stepped.steps.length, 0, "the in-flight turn is not committed as if it had used the new instruction");
    assert.equal(stepped.attempts.at(-1)?.outcome, "blocked");
    assert.match(stepped.attempts.at(-1)!.dispatches.at(-1)!.detail ?? "", /不会冒称已使用该提示/u);
    assert.deepEqual(stepped.pendingCue, { operationId: "operation.n1.cue.mid-flight", instruction: LIN_CUE, addressee: { kind: "actors", actorIds: [GU] }, consumedByActorIds: [] }, "a blocked turn records no delivery progress");
    const nextTurn = { contexts: [] as NuwaN1Context[] };
    const afterNext = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: stepped.revision, operationId: "operation.n1.cue.mid-flight.next", adapter: recordingAdapter(nextTurn) });
    assert.equal(nextTurn.contexts[0]!.actor.id, LIN);
    assert.equal(nextTurn.contexts[0]!.authorCue, null, "the held instruction still waits for its own recipient");
    assert.deepEqual(afterNext.pendingCue?.addressee, { kind: "actors", actorIds: [GU] });
  });
});

test("连续运行下多接收者逐步消费：一位提交不丢其他人的提示", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const cued = cue(workspace, run, started.revision, ALL_CUE, { kind: "all-actors" }, "operation.n1.cue.abc");
    // Turn 1 (林昭) commits against the cue; 阿芜 and 顾澜 must keep theirs.
    const firstTurn = { contexts: [] as NuwaN1Context[] };
    const afterLin = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.cue.abc.lin", adapter: recordingAdapter(firstTurn) });
    assert.equal(firstTurn.contexts[0]!.actor.id, LIN);
    assert.equal(firstTurn.contexts[0]!.authorCue, ALL_CUE);
    assert.deepEqual(afterLin.pendingCue, { operationId: "operation.n1.cue.abc", instruction: ALL_CUE, addressee: { kind: "all-actors" }, consumedByActorIds: [LIN] }, "the first receiver's commit records progress instead of dropping the cue");
    assert.equal(compileNuwaN1Context(afterLin, afterLin.actors[0]!, "operation.n1.cue.abc.lin-recheck").authorCue, null, "a receiver who already committed is not handed the same instruction again");
    // Turn 2 (阿芜) in the same continuously advancing Run still receives it.
    const secondTurn = { contexts: [] as NuwaN1Context[] };
    const afterAwu = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: afterLin.revision, operationId: "operation.n1.cue.abc.awu", adapter: recordingAdapter(secondTurn) });
    assert.equal(secondTurn.contexts[0]!.actor.id, AWU);
    assert.equal(secondTurn.contexts[0]!.authorCue, ALL_CUE, "the second receiver still reads the full instruction on their own turn");
    assert.deepEqual(afterAwu.pendingCue?.consumedByActorIds, [LIN, AWU]);
    // Turn 3 (顾澜) completes the delivery; only now does the cue end.
    const thirdTurn = { contexts: [] as NuwaN1Context[] };
    const afterGu = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: afterAwu.revision, operationId: "operation.n1.cue.abc.gu", adapter: recordingAdapter(thirdTurn) });
    assert.equal(thirdTurn.contexts[0]!.actor.id, GU);
    assert.equal(thirdTurn.contexts[0]!.authorCue, ALL_CUE);
    assert.equal(afterGu.pendingCue, null, "the cue is cleared only after every recipient has committed");
  });
});

test("定向角色组的失败回合不标记送达，提示原样保留给接收者", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.cue.start" });
    const cued = cue(workspace, run, started.revision, GROUP_CUE, { kind: "actors", actorIds: [LIN, GU] }, "operation.n1.cue.group");
    const failing: NuwaN1ExecutionAdapter = {
      ...recordingAdapter({ contexts: [] as NuwaN1Context[] }),
      async continueAfterTool() { throw new Error("模拟本回合执行失败。"); }
    };
    const failed = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.cue.group.fail", adapter: failing });
    assert.equal(failed.steps.length, 0, "a failed turn commits no step");
    assert.equal(failed.lifecycle, "blocked", "the runtime surfaces the failure instead of pretending the turn succeeded");
    const expectedCue = { operationId: "operation.n1.cue.group", instruction: GROUP_CUE, addressee: { kind: "actors", actorIds: [LIN, GU] }, consumedByActorIds: [] as string[] };
    assert.deepEqual(failed.pendingCue, expectedCue, "an uncommitted turn never counts as delivered");
    assert.deepEqual(readNuwaN1Run(workspace, run.runId)!.pendingCue, expectedCue, "the held cue survives durably for the recipients' later turns");
  });
});

test("作者侧接口把接收对象一路回传：端口、读取模型与 composer", () => {
  const portSource = readFileSync(path.join(process.cwd(), "apps", "story-studio", "server", "nuwaN1Port.mjs"), "utf8");
  assert.match(portSource, /addressee: input\.addressee/u, "the cue route forwards the recipient instead of dropping it");
  assert.match(portSource, /addressee: run\.pendingCue\.addressee \?\? null/u, "the read model reports the stored recipient, including a legacy null one");
  const workspaceSource = readFileSync(path.join(process.cwd(), "apps", "story-studio", "src", "components", "nuwa", "NuwaN1Workspace.tsx"), "utf8");
  assert.match(workspaceSource, /必须选择对象/u, "the composer starts without a recipient so nothing can be sent by accident");
  assert.match(workspaceSource, /!cueAddressee/u, "the submit control is disabled while the recipient is missing");
  assert.match(workspaceSource, /作者提示已进入当前 Run 的后续步骤，只会发送给/u, "the success notice names the recipients it will reach");
  assert.match(workspaceSource, /已保存，暂未执行/u, "a 女娲 instruction is reported as saved-but-not-executed in product language instead of a fake success");
  assert.doesNotMatch(workspaceSource, /消费路径/u, "the author never sees implementation vocabulary in the cue notice");
  assert.match(workspaceSource, /补选对象/u, "a legacy untargeted cue exposes a recovery action");
  const serverSource = readFileSync(path.join(process.cwd(), "apps", "story-studio", "server", "server.mjs"), "utf8");
  assert.match(serverSource, /\["projectId", "runId", "expectedRevision", "operationId", "instruction", "addressee"\]/u, "the HTTP cue route accepts the recipient field");
});
