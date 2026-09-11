import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  advanceNuwaN1Run,
  cancelNuwaN1Run,
  compileNuwaN1Context,
  createNuwaN1Run,
  createNuwaPlan,
  createNuwaRunPack,
  cueNuwaN1Run,
  pauseNuwaN1Run,
  prepareNuwaN1CandidateHandoff,
  recordNuwaN1ProviderDispatch,
  recordNuwaN1ProviderPreflightFailure,
  recordNuwaN1ProviderReservation,
  readNuwaN1Run,
  resolveNuwaN1ProviderDispatch,
  resumeNuwaN1Run,
  startNuwaN1Run,
  buildStorySnapshot,
  type NuwaN1Actor,
  type NuwaN1ExecutionAdapter,
  type NuwaN1Run
} from "../../src/storyIntelligence/index.ts";

const sourceFixture = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const revision = "a".repeat(64);

function fixtureActors(): NuwaN1Actor[] {
  return [
    {
      character: { id: "character.林昭", revision }, displayName: "林昭", coreSummary: "守夜人，谨慎而执着。", localGoal: "确认钟声来源。",
      knownFacts: [{ factId: "fact.守夜钟失踪", summary: "自己亲眼见到守夜钟失踪。", sourceRef: { id: "event.钟声中断", revision }, visibility: "experienced" }], beliefs: [{ beliefId: "belief.有人带走钟", summary: "相信有人故意带走钟。", stance: "believed", sourceRef: { id: "event.钟声中断", revision } }], unknownFactIds: ["secret.author-canary"], allowedActions: ["speak", "observe"]
    },
    {
      character: { id: "character.阿芜", revision }, displayName: "林昭", coreSummary: "码头工人，只掌握传闻。", localGoal: "判断是否该同行。",
      knownFacts: [{ factId: "fact.传闻", summary: "从码头工人处听说守夜钟不见了。", sourceRef: { id: "event.码头传闻", revision }, visibility: "heard" }], beliefs: [{ beliefId: "belief.顾澜可疑", summary: "怀疑顾澜与此有关。", stance: "suspected", sourceRef: { id: "event.码头传闻", revision } }], unknownFactIds: ["fact.守夜钟失踪", "secret.author-canary"], allowedActions: ["speak", "observe"]
    }
  ];
}

function withRun(runTest: (fixture: { root: string; workspace: string; run: NuwaN1Run }) => Promise<void> | void, actors = fixtureActors()) {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-n1-"));
  const workspace = path.join(root, "project");
  cpSync(sourceFixture, workspace, { recursive: true });
  const snapshot = buildStorySnapshot({ workspacePath: workspace });
  const plan = createNuwaPlan({ snapshot, authorGoal: "有界双角色钟声排演" });
  createNuwaRunPack({ workspacePath: workspace, plan, snapshot });
  const run = createNuwaN1Run({ workspacePath: workspace, runId: plan.runId, sourceSnapshotHash: snapshot.snapshotHash, scene: { storyUnit: { id: "story-unit.雨夜追查", revision }, sceneRef: { id: "scene.雾港灯塔外", revision }, observedAt: "world-time.23:00", label: "雾港灯塔外" }, authorGoal: "让两位角色只依据各自可知内容决定是否同行。", actors, operationId: "operation.n1.create", now: "2026-09-07T00:00:00.000Z" });
  return Promise.resolve(runTest({ root, workspace, run })).finally(() => rmSync(root, { recursive: true, force: true }));
}

function adapter(observed: { contexts: unknown[]; calls: number[] }): NuwaN1ExecutionAdapter {
  return {
    adapterId: "local-fake.nuwa-n1",
    async request(context) {
      observed.contexts.push(structuredClone(context)); observed.calls.push(1);
      return { type: "tool-request", toolName: "read_role_context", requestId: `tool.${context.step}`, actor: context.actor };
    },
    async executeTool({ context, request }) {
      observed.calls.push(2);
      return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context };
    },
    async continueAfterTool({ context, toolResult }) {
      assert.equal(toolResult.context.actor.id, context.actor.id, "tool result must remain in the same actor scope");
      observed.calls.push(3);
      return { type: "actor-result", actor: context.actor, intent: "先核对可见线索，再决定是否同行。", speech: context.actor.id === "character.林昭" ? "我亲眼看见钟不见了，先别靠近塔门。" : "我只听说钟不见了；我愿意先观察。", heardByActorIds: context.actor.id === "character.林昭" ? ["character.阿芜"] : [], action: { action: "speak", targetId: null }, observableResult: "在场角色都能听到这句谨慎的提醒。", usage: { inputTokens: 120, outputTokens: 44 } };
    }
  };
}

test("N1 persists a derived IF source identity without collapsing it into mainline", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-derived-source-"));
  const workspace = path.join(root, "project");
  try {
    cpSync(sourceFixture, workspace, { recursive: true });
    const snapshot = buildStorySnapshot({ workspacePath: workspace });
    const plan = createNuwaPlan({ snapshot, authorGoal: "IF 铜钥匙交接" });
    createNuwaRunPack({ workspacePath: workspace, plan, snapshot });
    const run = createNuwaN1Run({ workspacePath: workspace, runId: plan.runId, sourceSnapshotHash: snapshot.snapshotHash, sourceIdentity: { kind: "derived", workVersionId: "work-version.derived.north-gate", revision: "2" }, scene: { storyUnit: { id: "story-unit.雨夜追查", revision }, sceneRef: { id: "scene.雾港灯塔外", revision }, observedAt: "world-time.23:00", label: "雾港灯塔外" }, authorGoal: "只在 IF 中决定钥匙去向。", actors: fixtureActors(), operationId: "operation.n1.derived.create", now: "2026-09-09T12:00:00.000Z" });
    assert.deepEqual(run.sourceIdentity, { kind: "derived", workVersionId: "work-version.derived.north-gate", revision: "2" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("N1 compiles role-local context by stable ID and never leaks author secret material", async () => {
  await withRun(({ workspace, run }) => {
    const first = compileNuwaN1Context(run, run.actors[0]!, "operation.n1.context");
    const second = compileNuwaN1Context(run, run.actors[1]!, "operation.n1.context");
    assert.equal(first.actor.id, "character.林昭");
    assert.equal(second.actor.id, "character.阿芜", "same display names cannot merge character identities");
    assert.notDeepEqual(first.knownFacts, second.knownFacts);
    assert.equal(JSON.stringify(first).includes("AUTHOR_SECRET_CANARY"), false);
    assert.equal(JSON.stringify(second).includes("AUTHOR_SECRET_CANARY"), false);
    assert.equal(JSON.stringify(first).includes("顾澜"), false, "another actor's belief does not enter the request");
    assert.equal(readNuwaN1Run(workspace, run.runId)?.revision, 1);
  });
});

test("N1 durably records a local Provider validation failure without reserving or consuming a send", async () => {
  await withRun(async ({ workspace, run }) => {
    const started = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.preflight.start" });
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    const base = adapter(observed);
    const blocked = await advanceNuwaN1Run({
      workspacePath: workspace,
      runId: run.runId,
      expectedRevision: started.revision,
      operationId: "operation.n1.preflight",
      adapter: {
        ...base,
        async continueAfterTool({ context }) {
          recordNuwaN1ProviderPreflightFailure({
            workspacePath: workspace,
            runId: run.runId,
            operationId: "operation.n1.preflight",
            providerCall: 2,
            requestKey: "nuwa-n1.fixture.preflight.2",
            detail: "request-validation:tool-result-id",
            provider: { providerId: "fixture", profileId: "fixture.default", modelId: "fixture-model" },
            now: "2026-09-09T14:00:00.000Z"
          });
          throw new Error("当前模型请求内容无效。");
        }
      }
    });
    const persisted = readNuwaN1Run(workspace, run.runId)!;
    const providerDispatch = persisted.attempts[0]!.dispatches.find((item) => item.phase === "provider");

    assert.equal(blocked.lifecycle, "blocked");
    assert.equal(persisted.providerDispatches, 0, "a local validation rejection cannot consume the real Provider send budget");
    assert.deepEqual(providerDispatch, {
      phase: "provider",
      status: "failed",
      recordedAt: "2026-09-09T14:00:00.000Z",
      detail: "request-validation:tool-result-id",
      providerCall: 2,
      requestKey: "nuwa-n1.fixture.preflight.2",
      reservationId: null,
      receiptEnvelopeId: null,
      provider: { providerId: "fixture", profileId: "fixture.default", modelId: "fixture-model" }
    });
  });
});

test("N2B sends an early goal-relevant clue instead of the full authorized history", async () => {
  const attentionActors = fixtureActors();
  attentionActors[0]!.unknownFactIds = ["event.secret-unrevealed-title"];
  attentionActors[0]!.knownFacts = [
    { factId: "fact.current-scene", summary: "当前场景雾港断桥正在震动。", sourceRef: { id: "event.current-scene", revision }, visibility: "experienced", attentionRequired: true },
    ...Array.from({ length: 28 }, (_, index) => ({ factId: `fact.long-history-${index}`, summary: `无关集市历史 ${index}：${"旧货摊位与天气记录。".repeat(6)}`, sourceRef: { id: `event.long-history-${index}`, revision }, visibility: "informed" as const })),
    { factId: "fact.early-bell", summary: "很早以前听到桥下钟声来自废塔的机械装置。", sourceRef: { id: "event.early-bell", revision }, visibility: "informed" }
  ];
  attentionActors[0]!.localGoal = "核实桥下钟声来源。";
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n2b.start" });
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n2b.step", adapter: adapter(observed) });
    const sent = observed.contexts[0] as ReturnType<typeof compileNuwaN1Context>;
    assert.equal(stepped.steps.length, 1);
    assert.equal(sent.knownFacts.some((fact) => fact.factId === "fact.current-scene"), true, "current-scene required content is retained");
    assert.equal(sent.knownFacts.some((fact) => fact.factId === "fact.early-bell"), true, "the older clue matching the actor goal reaches the actual adapter input");
    assert.ok(sent.knownFacts.length < attentionActors[0]!.knownFacts.length, "the full long history is not sent");
    assert.ok(sent.attention.budget.selectedSourceBytes <= sent.attention.budget.sourceBudgetBytes);
    assert.equal(JSON.stringify(sent).includes("secret-unrevealed-title"), false, "permission-excluded identity is represented only as a count");
  }, attentionActors);
});

test("N1 embeds its lifecycle ledger in the existing RunPack and projects its active status", async () => {
  await withRun(({ workspace, run }) => {
    const runFile = path.join(workspace, ".world-os", "runs", "nuwa", run.runId, "run.json");
    const created = JSON.parse(readFileSync(runFile, "utf8"));
    assert.equal(created.status, "ready");
    assert.equal(created.nuwaN1.lifecycle, "ready");
    assert.equal(existsSync(path.join(path.dirname(runFile), "nuwa-n1.json")), false);
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.runpack-start" });
    const active = JSON.parse(readFileSync(runFile, "utf8"));
    assert.equal(active.status, "running");
    assert.equal(active.nuwaN1.lifecycle, "running");
    assert.equal(active.nuwaN1.revision, running.revision);
  });
});

test("N1 reads the former sibling ledger once and migrates it on its next write", async () => {
  await withRun(({ workspace, run }) => {
    const runFile = path.join(workspace, ".world-os", "runs", "nuwa", run.runId, "run.json");
    const legacyFile = path.join(path.dirname(runFile), "nuwa-n1.json");
    const pack = JSON.parse(readFileSync(runFile, "utf8"));
    writeFileSync(legacyFile, `${JSON.stringify(pack.nuwaN1)}\n`, "utf8");
    delete pack.nuwaN1;
    writeFileSync(runFile, `${JSON.stringify(pack)}\n`, "utf8");
    assert.equal(readNuwaN1Run(workspace, run.runId)?.lifecycle, "ready");
    startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.migrate" });
    assert.equal(JSON.parse(readFileSync(runFile, "utf8")).nuwaN1.lifecycle, "running");
  });
});

test("N1 requires a role-context tool round trip before committing a structured scene step", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.n1.start" });
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.step.one", adapter: adapter(observed) });
    assert.deepEqual(observed.calls, [1, 2, 3]);
    assert.equal(stepped.steps.length, 1);
    assert.equal(stepped.steps[0]?.actor.id, "character.林昭");
    assert.equal(stepped.steps[0]?.action.action, "speak");
    assert.deepEqual(stepped.steps[0]?.execution, { adapterId: "local-fake.nuwa-n1", attemptId: "operation.n1.step.one", contextVersion: "tianyan-nuwa-n1-role-context/v1", tool: { name: "read_role_context", requestId: "tool.1", status: "completed" } });
    assert.equal(stepped.dispatches, 2);
    assert.equal(stepped.receipts.at(-1)?.kind, "step");
  });
});

test("N1 next actor receives actual prior dialogue but not the other actor's beliefs or hidden facts", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const observed = { contexts: [] as any[], calls: [] as number[] };
    const first = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.step.one", adapter: adapter(observed) });
    await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: first.revision, operationId: "operation.n1.step.two", adapter: adapter(observed) });
    const secondContext = observed.contexts[1];
    assert.equal(secondContext.actor.id, "character.阿芜");
    assert.match(secondContext.recentDialogue[0].text, /亲眼看见/u);
    assert.equal(JSON.stringify(secondContext).includes("相信有人故意带走钟"), false);
    assert.equal(JSON.stringify(secondContext).includes("AUTHOR_SECRET_CANARY"), false);
  });
});

test("N1 pause, resume, and author cue preserve a bounded future-only control point", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const paused = pauseNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.pause", reason: "等待作者补充范围" });
    const runFile = path.join(workspace, ".world-os", "runs", "nuwa", run.runId, "run.json");
    assert.equal(JSON.parse(readFileSync(runFile, "utf8")).status, "paused", "RunPack projects the exact N1 pause lifecycle for every consumer");
    assert.throws(() => cueNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.stale-cue", instruction: "不应写入" }), /revision conflict/u);
    const cued = cueNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: paused.revision, operationId: "operation.n1.cue", instruction: "后续只讨论可见的钟声线索。" });
    const resumed = resumeNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.resume" });
    const observed = { contexts: [] as any[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: resumed.revision, operationId: "operation.n1.step.after-cue", adapter: adapter(observed) });
    assert.equal(observed.contexts[0].authorCue, "后续只讨论可见的钟声线索。");
    assert.equal(stepped.pendingCue, null);
  });
});

test("N1 cancellation wins over a late adapter result and repeated operation IDs do not dispatch again", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let firstRequestSeen: (() => void) | null = null;
    const firstTool = new Promise<void>((resolve) => { firstRequestSeen = resolve; });
    const delayed: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.delayed",
      async request(context) { firstRequestSeen?.(); return { type: "tool-request", toolName: "read_role_context", requestId: "tool.delayed", actor: context.actor }; },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool({ context }) { await held; return { type: "actor-result", actor: context.actor, intent: "迟到结果", speech: "迟到台词", action: { action: "speak", targetId: null }, observableResult: "迟到结果不应提交。" }; }
    };
    const inFlight = advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.late", adapter: delayed });
    await firstTool;
    const cancelled = cancelNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.cancel" });
    release?.();
    assert.equal((await inFlight).lifecycle, "cancelled");
    const recovered = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(cancelled.lifecycle, "cancelled");
    const runFile = path.join(workspace, ".world-os", "runs", "nuwa", run.runId, "run.json");
    assert.equal(JSON.parse(readFileSync(runFile, "utf8")).status, "cancelled", "RunPack keeps cancellation as its authoritative lifecycle");
    assert.equal(recovered.lifecycle, "cancelled");
    assert.equal(recovered.steps.length, 0);
    assert.equal(recovered.dispatches, 1);
    assert.equal(recovered.attempts[0]?.outcome, "cancelled");
    assert.equal(cancelNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cancelled.revision, operationId: "operation.n1.cancel" }).revision, recovered.revision);
  });
});

test("N1 refuses a different operation while a persisted Provider attempt is still pending", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start.pending-fence" });
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let requestSeen: (() => void) | null = null;
    const seen = new Promise<void>((resolve) => { requestSeen = resolve; });
    const delayed: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.pending-fence",
      async request(context) { requestSeen?.(); await held; return { type: "tool-request", toolName: "read_role_context", requestId: "tool.pending-fence", actor: context.actor }; },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool({ context }) { return { type: "actor-result", actor: context.actor, intent: "完成原操作", speech: null, action: { action: "observe", targetId: null }, observableResult: "原操作完成。" }; }
    };
    const inFlight = advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.pending.original", adapter: delayed });
    await seen;
    const persisted = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(persisted.attempts[0]?.outcome, "pending");
    let secondAdapterCalls = 0;
    const second: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.must-not-dispatch",
      async request() { secondAdapterCalls += 1; throw new Error("must not dispatch"); },
      async executeTool() { throw new Error("must not execute"); },
      async continueAfterTool() { throw new Error("must not continue"); }
    };
    await assert.rejects(() => advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: persisted.revision, operationId: "operation.n1.pending.second", adapter: second }), /persisted pending attempt/u);
    assert.equal(secondAdapterCalls, 0);
    release?.();
    await inFlight;
  });
});

test("N1 cold reads replay no dispatch and selected steps build candidate-only handoff", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.step", adapter: adapter(observed) });
    const cold = readNuwaN1Run(workspace, run.runId)!;
    assert.equal(cold.dispatches, 2);
    assert.deepEqual(observed.calls, [1, 2, 3], "recovery itself cannot re-dispatch the adapter");
    const { run: handed, handoff } = prepareNuwaN1CandidateHandoff({ workspacePath: workspace, runId: run.runId, expectedRevision: stepped.revision, operationId: "operation.n1.handoff", selectedStepIds: [stepped.steps[0]!.stepId] });
    assert.equal(handoff.formalWrites, 0);
    assert.equal(handoff.status, "candidate");
    assert.equal(handoff.candidates[0]?.speech, stepped.steps[0]?.speech, "A selected handoff retains the actual dialogue rather than reducing it to an intent summary.");
    assert.equal(handoff.candidates[0]?.action, stepped.steps[0]?.action.action, "A selected handoff retains the actual action for the downstream formal source.");
    assert.equal(handed.receipts.at(-1)?.kind, "handoff");
  });
});

test("N1 records cross-character tools as failed attempts and stops at the six-step/twelve-dispatch bound", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const invalid: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.invalid-tool",
      async request(context) { return { type: "tool-request", toolName: "read_role_context", requestId: "tool.cross-role", actor: { id: "character.阿芜", revision: context.actor.revision } }; },
      async executeTool() { throw new Error("must not execute cross-character tool"); },
      async continueAfterTool() { throw new Error("must not reach adapter completion"); }
    };
    const rejected = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.invalid-tool", adapter: invalid });
    assert.equal(rejected.lifecycle, "blocked");
    assert.equal(rejected.steps.length, 0);
    assert.equal(rejected.attempts[0]?.outcome, "failed");
  });
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start.bound" });
    let current = running;
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    for (let index = 0; index < 6; index += 1) current = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: `operation.n1.step.${index}`, adapter: adapter(observed) });
    assert.equal(current.steps.length, 6);
    assert.equal(current.dispatches, 12);
    assert.equal(current.lifecycle, "completed");
  });
});

test("N1 records an invalid post-result delivery contract as a terminal failed attempt", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start.invalid-result" });
    const invalidDelivery: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.invalid-delivery",
      async request(context) { return { type: "tool-request", toolName: "read_role_context", requestId: "tool.invalid-delivery", actor: context.actor }; },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool({ context }) {
        for (const providerCall of [1, 2]) {
          const requestKey = `nuwa-n1.fixture.invalid-delivery.${providerCall}`;
          recordNuwaN1ProviderReservation({ workspacePath: workspace, runId: run.runId, operationId: "operation.n1.invalid-result", providerCall, requestKey, reservationId: `reservation.${providerCall}`, receiptEnvelopeId: `envelope.${providerCall}`, provider: { providerId: "fixture", profileId: "fixture.default", modelId: "fixture-model" } });
          recordNuwaN1ProviderDispatch({ workspacePath: workspace, runId: run.runId, operationId: "operation.n1.invalid-result", requestKey });
          resolveNuwaN1ProviderDispatch({ workspacePath: workspace, runId: run.runId, operationId: "operation.n1.invalid-result", requestKey, status: "completed" });
        }
        return { type: "actor-result", actor: context.actor, intent: "静默", speech: null, heardByActorIds: ["character.阿芜"], action: { action: "observe", targetId: null }, observableResult: "不应提交。", usage: { inputTokens: 20, outputTokens: 20 } };
      }
    };
    const blocked = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.invalid-result", adapter: invalidDelivery });
    assert.equal(blocked.lifecycle, "blocked");
    assert.equal(blocked.steps.length, 0);
    assert.equal(blocked.attempts[0]?.outcome, "failed");
    assert.notEqual(blocked.attempts[0]?.outcome, "pending");
    assert.deepEqual(blocked.attempts[0]?.usage, { inputTokens: 20, outputTokens: 20, source: "reported" });
    assert.equal(blocked.providerDispatches, 2, "completed Provider sends remain accounted for after a later result-contract rejection");
    assert.deepEqual(blocked.attempts[0]?.dispatches.map((dispatch) => [dispatch.phase, dispatch.status]), [["request", "dispatched"], ["continue-after-tool", "failed"], ["provider", "completed"], ["provider", "completed"]]);
    assert.match(blocked.attempts[0]?.dispatches.find((dispatch) => dispatch.phase === "continue-after-tool")?.detail || "", /statement delivery requires a completed spoken statement/u);
  });
});

test("N1 pause wins over an in-flight continuation from its pre-dispatch revision", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let continuationSeen: (() => void) | null = null;
    const continuation = new Promise<void>((resolve) => { continuationSeen = resolve; });
    const delayed: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.paused",
      async request(context) { return { type: "tool-request", toolName: "read_role_context", requestId: "tool.pause", actor: context.actor }; },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool({ context }) { continuationSeen?.(); await held; return { type: "actor-result", actor: context.actor, intent: "迟到", speech: "迟到", action: { action: "speak", targetId: null }, observableResult: "不得提交", usage: { inputTokens: 20, outputTokens: 20 } }; }
    };
    const inFlight = advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.pause-race", adapter: delayed });
    await continuation;
    const paused = pauseNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.pause-race.pause" });
    release?.();
    assert.equal((await inFlight).lifecycle, "paused");
    assert.equal(paused.lifecycle, "paused");
    assert.equal(readNuwaN1Run(workspace, run.runId)?.steps.length, 0);
  });
});

test("N1 blocks exact and conservatively estimated token overages without committing", async () => {
  const oversizedActors = fixtureActors();
  oversizedActors[0]!.knownFacts = Array.from({ length: 5 }, (_, index) => ({
    factId: `fact.oversized-${index}`,
    summary: `必须保留的角色事实${index}：${"长".repeat(400)}`,
    sourceRef: { id: `event.oversized-${index}`, revision },
    visibility: "experienced" as const,
    attentionRequired: true
  }));
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    let adapterCalls = 0;
    const mustNotDispatch: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.preflight-budget",
      async request() { adapterCalls += 1; throw new Error("input budget gate must run before adapter dispatch"); },
      async executeTool() { throw new Error("must not execute tool"); },
      async continueAfterTool() { throw new Error("must not continue"); }
    };
    const blocked = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.over-input-preflight", adapter: mustNotDispatch });
    assert.equal(adapterCalls, 0);
    assert.equal(blocked.lifecycle, "blocked");
    assert.equal(blocked.dispatches, 0);
    assert.equal(blocked.steps.length, 0);
    assert.equal(blocked.attempts[0]?.outcome, "blocked");
    assert.equal(blocked.attempts[0]?.usage?.source, "estimated");
    assert.ok((blocked.attempts[0]?.usage?.inputTokens || 0) > 0);
    assert.match(blocked.blocker || "", /必需角色依据.*超过输入预算.*没有截断或发送请求/u);
  }, oversizedActors);
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const overExact: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.usage-exact",
      async request(context) { return { type: "tool-request", toolName: "read_role_context", requestId: "tool.exact", actor: context.actor }; },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool({ context }) { return { type: "actor-result", actor: context.actor, intent: "超额", speech: null, action: { action: "observe", targetId: null }, observableResult: "不提交", usage: { inputTokens: 4097, outputTokens: 1 } }; }
    };
    const blocked = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.over-exact", adapter: overExact });
    assert.equal(blocked.lifecycle, "blocked");
    assert.equal(blocked.steps.length, 0);
    assert.deepEqual(blocked.attempts[0]?.usage, { inputTokens: 4097, outputTokens: 1, source: "reported" });
  });
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const overEstimated: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.usage-estimated",
      async request(context) { return { type: "tool-request", toolName: "read_role_context", requestId: "tool.estimated", actor: context.actor }; },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool({ context }) { return { type: "actor-result", actor: context.actor, intent: "估算", speech: "长".repeat(500), action: { action: "speak", targetId: null }, observableResult: "不提交", usage: { inputTokens: null, outputTokens: null } }; }
    };
    const blocked = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.over-estimated", adapter: overEstimated });
    assert.equal(blocked.lifecycle, "blocked");
    assert.equal(blocked.steps.length, 0);
    assert.equal(blocked.attempts[0]?.usage?.source, "estimated");
    assert.ok((blocked.attempts[0]?.usage?.outputTokens || 0) > 1024);
  });
});

test("N1 handoff operation binds its selected-step payload exactly", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "operation.n1.start" });
    const first = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "operation.n1.step.one", adapter: adapter({ contexts: [], calls: [] }) });
    const second = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: first.revision, operationId: "operation.n1.step.two", adapter: adapter({ contexts: [], calls: [] }) });
    const selected = [second.steps[0]!.stepId];
    const handed = prepareNuwaN1CandidateHandoff({ workspacePath: workspace, runId: run.runId, expectedRevision: second.revision, operationId: "operation.n1.handoff.bound", selectedStepIds: selected });
    const replayed = prepareNuwaN1CandidateHandoff({ workspacePath: workspace, runId: run.runId, expectedRevision: handed.run.revision, operationId: "operation.n1.handoff.bound", selectedStepIds: selected });
    assert.deepEqual(replayed.handoff, handed.handoff);
    assert.throws(() => prepareNuwaN1CandidateHandoff({ workspacePath: workspace, runId: run.runId, expectedRevision: handed.run.revision, operationId: "operation.n1.handoff.bound", selectedStepIds: [second.steps[1]!.stepId] }), /payload does not match/u);
  });
});
