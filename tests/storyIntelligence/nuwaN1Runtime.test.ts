import { createNuwaN1PiAdapter } from "../../apps/story-studio/server/nuwaN1PiAdapter.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  advanceNuwaN1Run,
  beginNuwaN1DirectorSuggestion,
  cancelNuwaN1Run,
  compileNuwaN1Context,
  completeNuwaN1DirectorSuggestion,
  createNuwaN1Run,
  createNuwaPlan,
  createNuwaRunPack,
  cueNuwaN1Run,
  decideNuwaN1DirectorSuggestion,
  directorBrief,
  failNuwaN1DirectorSuggestion,
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

function withRun(runTest: (fixture: { root: string; workspace: string; run: NuwaN1Run }) => Promise<void> | void, actors = fixtureActors(), scope?: NuwaN1Run["scope"]) {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-n1-"));
  const workspace = path.join(root, "project");
  cpSync(sourceFixture, workspace, { recursive: true });
  const snapshot = buildStorySnapshot({ workspacePath: workspace });
  const plan = createNuwaPlan({ snapshot, authorGoal: "有界双角色钟声排演" });
  createNuwaRunPack({ workspacePath: workspace, plan, snapshot });
  const scene = { storyUnit: { id: "story-unit.雨夜追查", revision }, sceneRef: { id: "scene.雾港灯塔外", revision }, observedAt: "world-time.23:00", label: "雾港灯塔外" };
  const run = createNuwaN1Run({ workspacePath: workspace, runId: plan.runId, sourceSnapshotHash: snapshot.snapshotHash, scene, scope, authorGoal: "让两位角色只依据各自可知内容决定是否同行。", actors, operationId: "operation.n1.create", now: "2026-09-07T00:00:00.000Z" });
  return Promise.resolve(runTest({ root, workspace, run })).finally(() => rmSync(root, { recursive: true, force: true }));
}

test("N1 director may be adopted before the first actor step with real dispatch accounting", async () => {
  await withRun(async ({ workspace, run }) => {
    const base = { workspacePath: workspace, runId: run.runId };
    const pending = beginNuwaN1DirectorSuggestion({ ...base, expectedRevision: run.revision, operationId: "ready.director", instruction: "优先观察", adapterId: "local-pi" });
    const dispatch = { ...base, operationId: "ready.director", providerCall: 1, requestKey: "ready.request", reservationId: "ready.reservation", receiptEnvelopeId: null, provider: { providerId: "local", profileId: "local.profile", modelId: "local-model" } };
    assert.equal(pending.lifecycle, "ready");
    recordNuwaN1ProviderReservation(dispatch);
    recordNuwaN1ProviderDispatch(dispatch);
    resolveNuwaN1ProviderDispatch({ ...dispatch, status: "completed" });
    const suggestion = completeNuwaN1DirectorSuggestion({ ...base, operationId: "ready.director", suggestion: { understood: "先观察", proposedAdjustment: "先观察", scope: "当前场景", focus: ["advance-observation"], unsupported: [] } });
    assert.equal(suggestion.providerDispatches, 1);
    assert.deepEqual(compileNuwaN1Context(suggestion, suggestion.actors[0]!, "before.adopt").directorFocus, []);
    const adopted = decideNuwaN1DirectorSuggestion({ ...base, expectedRevision: suggestion.revision, operationId: "ready.adopt", decision: "adopt" });
    assert.equal(adopted.lifecycle, "ready");
    assert.equal(adopted.steps.length, 0);
    assert.equal(adopted.directorAdjustment?.status, "adopted");
    const started = startNuwaN1Run({ ...base, expectedRevision: adopted.revision, operationId: "ready.start" });
    assert.deepEqual(compileNuwaN1Context(started, started.actors[0]!, "first.step").directorFocus, ["advance-observation"]);
  });
});

test("N1 director suggestion is separate from role cues, adopts once at a safe boundary, and survives reload", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "director.start" });
    const begun = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "director.suggest", instruction: "暂缓揭露幕后人 SECRET_DIRECTOR_CANARY，先推进角色之间的试探。", adapterId: "fake-director" });
    assert.equal(begun.pendingCue, null, "a director request never occupies the role cue slot");
    const suggested = completeNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "director.suggest", suggestion: { understood: "先保留揭露，推进试探。", proposedAdjustment: "先以行动和对话推进试探。", scope: "仅未开始步骤。", focus: ["defer-reveal", "prioritize-character-interaction"], unsupported: [] } });
    assert.equal(suggested.directorAdjustment?.status, "suggested");
    const beforeAdopt = compileNuwaN1Context(suggested, suggested.actors[0]!, "director.before-adopt");
    assert.deepEqual(beforeAdopt.directorFocus, [], "an unadopted suggestion cannot change a later turn");
    assert.equal(JSON.stringify(beforeAdopt).includes("SECRET_DIRECTOR_CANARY"), false, "the author director instruction never enters a role context");
    const adopted = decideNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: suggested.revision, operationId: "director.adopt", decision: "adopt" });
    assert.equal(adopted.directorAdjustment?.status, "adopted");
    assert.equal(adopted.directorAdjustment?.appliesFromStep, 1);
    const paused = pauseNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: adopted.revision, operationId: "director.pause" });
    assert.equal(readNuwaN1Run(workspace, run.runId)?.directorAdjustment?.status, "adopted", "a paused and reloaded Run preserves its accepted adjustment before it can take effect");
    const resumed = resumeNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: paused.revision, operationId: "director.resume" });
    const actualRoleContext = compileNuwaN1Context(resumed, resumed.actors[0]!, "director.after-adopt");
    assert.deepEqual(actualRoleContext.directorFocus, ["defer-reveal", "prioritize-character-interaction"]);
    assert.equal(JSON.stringify(actualRoleContext).includes("SECRET_DIRECTOR_CANARY"), false);
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: resumed.revision, operationId: "director.step", adapter: adapter(observed) });
    assert.ok(stepped.directorAdjustment?.appliedStepId, "the first subsequent committed step records where the adoption took effect");
    assert.equal(readNuwaN1Run(workspace, run.runId)?.directorAdjustment?.appliedStepId, stepped.directorAdjustment?.appliedStepId, "RunPack reload preserves the adoption and effective step");
    const stale = decideNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: stepped.revision, operationId: "director.repeat-adopt", decision: "adopt" });
    assert.equal(stale.revision, stepped.revision + 1, "a repeated adoption is a receipt only and cannot duplicate the adjustment");
    assert.equal(stale.directorAdjustment?.appliedStepId, stepped.directorAdjustment?.appliedStepId);
  });
});

test("N1 director failures retain input and stale or old completions cannot mutate a newer decision", async () => {
  await withRun(({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "director-failure.start" });
    const begun = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "director-failure.first", instruction: "保留这条导演要求。", adapterId: "fake-director" });
    const failed = failNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "director-failure.first", detail: "模型暂不可用" });
    assert.deepEqual(failed.directorAdjustment && { status: failed.directorAdjustment.status, instruction: failed.directorAdjustment.instruction }, { status: "failed", instruction: "保留这条导演要求。" });
    const retried = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: failed.revision, operationId: "director-failure.retry", instruction: "新的导演要求。", adapterId: "fake-director" });
    const ignoredLate = completeNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "director-failure.first", suggestion: { understood: "旧", proposedAdjustment: "旧", scope: "旧", focus: ["advance-observation"], unsupported: [] } });
    assert.equal(ignoredLate.directorAdjustment?.operationId, "director-failure.retry", "an old response cannot overwrite the newer request");
    const discarded = decideNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: retried.revision, operationId: "director-failure.discard", decision: "discard" });
    assert.equal(discarded.directorAdjustment?.status, "discarded");
  });
});

test("a failed optional director suggestion leaves the basic role step available", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "director-optional.start" });
    const begun = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "director-optional.suggest", instruction: "先观察。", adapterId: "fake-director" });
    const failed = failNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "director-optional.suggest", detail: "模型暂不可用" });
    const observed = { contexts: [] as unknown[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: failed.revision, operationId: "director-optional.step", adapter: adapter(observed) });
    assert.equal(stepped.steps.length, 1);
    assert.equal(stepped.directorAdjustment?.status, "failed");
    assert.equal(stepped.directorAdjustment?.instruction, begun.directorAdjustment?.instruction);
    assert.deepEqual((observed.contexts[0] as { directorFocus: string[] }).directorFocus, []);
  });
});

test("N1 director suggestion becomes stale when its Run advances before adoption", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "director-stale.start" });
    const begun = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "director-stale.suggest", instruction: "先观察。", adapterId: "fake-director" });
    const suggested = completeNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "director-stale.suggest", suggestion: { understood: "观察", proposedAdjustment: "观察后再推进", scope: "仅未开始步骤", focus: ["advance-observation"], unsupported: [] } });
    const advanced = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: suggested.revision, operationId: "director-stale.step", adapter: adapter({ contexts: [], calls: [] }) });
    const stale = decideNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: advanced.revision, operationId: "director-stale.adopt", decision: "adopt" });
    assert.equal(stale.directorAdjustment?.status, "stale");
    assert.deepEqual(compileNuwaN1Context(stale, stale.actors[1]!, "director-stale.context").directorFocus, [], "a stale suggestion cannot reach a role context");
  });
});

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
    // The canary below really exists upstream: both fixture actors carry it in
    // `unknownFactIds`, while the compiled context may only expose a count.
    assert.ok(run.actors.every((actor) => actor.unknownFactIds.includes("secret.author-canary")), "the author-only identity must be present upstream or this check proves nothing");
    assert.equal(JSON.stringify(first).includes("secret.author-canary"), false, "an author-only identity stays author-side");
    assert.equal(JSON.stringify(second).includes("secret.author-canary"), false, "an author-only identity stays author-side");
    assert.equal(JSON.stringify(first).includes("顾澜"), false, "another actor's belief does not enter the request");
    assert.equal(first.excludedKnowledgeCount, 1, "the blind spot survives as a count instead of an identity");
    assert.ok(JSON.stringify(first).includes("亲眼见到守夜钟失踪"), "the role keeps its own evidence, so an emptied context cannot pass");
    assert.ok(JSON.stringify(second).includes("从码头工人处听说守夜钟不见了"), "the other role keeps its own evidence");
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

test("N1 advances a frozen multi-unit range internally without asking the author to create a Run per unit", async () => {
  const firstScene = { storyUnit: { id: "story-unit.雨夜追查", revision }, sceneRef: { id: "scene.雾港灯塔外", revision }, observedAt: "world-time.23:00", label: "雾港灯塔外" };
  const secondScene = { storyUnit: { id: "story-unit.钟楼之后", revision }, sceneRef: { id: "scene.钟楼内", revision }, observedAt: "world-time.23:30", label: "钟楼之后" };
  const scope: NuwaN1Run["scope"] = { version: "tianyan-nuwa-n1-scope/v1", mode: "bounded", storylineKey: "primary", storylineLabel: "主线", scenes: [firstScene, secondScene], currentSceneIndex: 0 };
  const actors = [...fixtureActors(), {
    ...fixtureActors()[0]!,
    character: { id: "character.陆衍", revision },
    displayName: "陆衍",
    localGoal: "只依据自己获知的信息观察。"
  }];
  await withRun(async ({ workspace, run }) => {
    const observed = { contexts: [] as Array<ReturnType<typeof compileNuwaN1Context>>, calls: [] as number[] };
    let current = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "operation.range.start" });
    for (let index = 0; index < 4; index += 1) current = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: `operation.range.step.${index}`, adapter: adapter(observed) });
    assert.equal(current.lifecycle, "completed");
    assert.deepEqual(current.steps.map((step) => step.scene.storyUnit.id), [firstScene.storyUnit.id, firstScene.storyUnit.id, secondScene.storyUnit.id, secondScene.storyUnit.id]);
    assert.equal(current.scope.currentSceneIndex, 1);
    assert.deepEqual(observed.contexts.map((context) => context.scene.label), ["雾港灯塔外", "雾港灯塔外", "钟楼之后", "钟楼之后"]);
    assert.deepEqual(current.steps.map((step) => step.actor.id), ["character.林昭", "character.阿芜", "character.陆衍", "character.林昭"], "actor rotation continues across scene boundaries so a selected third actor is not starved");
    assert.equal(readNuwaN1Run(workspace, run.runId)?.scope.scenes.length, 2, "the selected range survives a read from the durable RunPack");
  }, actors, scope);
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
    const cued = cueNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: paused.revision, operationId: "operation.n1.cue", instruction: "后续只讨论可见的钟声线索。", addressee: { kind: "all-actors" } });
    const resumed = resumeNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: cued.revision, operationId: "operation.n1.resume" });
    const observed = { contexts: [] as any[], calls: [] as number[] };
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: resumed.revision, operationId: "operation.n1.step.after-cue", adapter: adapter(observed) });
    assert.equal(observed.contexts[0].authorCue, "后续只讨论可见的钟声线索。");
    assert.deepEqual(stepped.pendingCue, { operationId: "operation.n1.cue", instruction: "后续只讨论可见的钟声线索。", addressee: { kind: "all-actors" }, consumedByActorIds: ["character.林昭"] }, "the first receiver's committed turn records progress; the cue waits for the remaining recipients");
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

test("N1 resumes the same Run after a verified pre-transport task budget block without repeating a committed step", async () => {
  await withRun(async ({ workspace, run }) => {
    const base = { workspacePath: workspace, runId: run.runId };
    const running = startNuwaN1Run({ ...base, expectedRevision: run.revision, operationId: "budget-recovery.start" });
    const first = await advanceNuwaN1Run({ ...base, expectedRevision: running.revision, operationId: "budget-recovery.first", adapter: adapter({ contexts: [], calls: [] }) });
    const firstStepId = first.steps[0]!.stepId;
    const failedOperation = "budget-recovery.second-blocked";
    const blockedAdapter: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.pre-transport-budget",
      async request(context) {
        const requestKey = "budget-recovery.sent-first-round";
        recordNuwaN1ProviderReservation({ ...base, operationId: failedOperation, providerCall: 1, requestKey, reservationId: "budget-recovery.reservation", receiptEnvelopeId: "budget-recovery.envelope", provider: { providerId: "fixture", profileId: "fixture.default", modelId: "fixture-model" } });
        recordNuwaN1ProviderDispatch({ ...base, operationId: failedOperation, requestKey });
        resolveNuwaN1ProviderDispatch({ ...base, operationId: failedOperation, requestKey, status: "completed" });
        return { type: "tool-request", toolName: "read_role_context", requestId: "tool.budget-recovery", actor: context.actor };
      },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool() { throw new Error("Provider request budget is exhausted; dispatch was blocked before transport."); }
    };
    const blocked = await advanceNuwaN1Run({ ...base, expectedRevision: first.revision, operationId: failedOperation, adapter: blockedAdapter });
    assert.equal(blocked.lifecycle, "blocked");
    assert.equal(blocked.steps.length, 1);
    assert.equal(blocked.attempts.at(-1)?.outcome, "failed");
    assert.equal(blocked.attempts.some((attempt) => attempt.outcome === "pending"), false);
    assert.equal(blocked.providerDispatches, 1, "only the first completed Provider send is counted");
    const reloaded = readNuwaN1Run(workspace, run.runId)!;
    const resumed = resumeNuwaN1Run({ ...base, expectedRevision: reloaded.revision, operationId: "budget-recovery.resume" });
    assert.equal(resumed.lifecycle, "running");
    assert.equal(resumed.steps[0]!.stepId, firstStepId);
    assert.equal(resumed.attempts.at(-1)?.outcome, "failed", "the failed attempt remains in the Run ledger");
    const second = await advanceNuwaN1Run({ ...base, expectedRevision: resumed.revision, operationId: "budget-recovery.second-retry", adapter: adapter({ contexts: [], calls: [] }) });
    assert.equal(second.steps.length, 2);
    assert.equal(second.steps[0]!.stepId, firstStepId);
    assert.equal(second.attempts.length, 3);
    assert.equal(resumeNuwaN1Run({ ...base, expectedRevision: reloaded.revision, operationId: "budget-recovery.resume" }).steps.length, 2, "repeated recovery is idempotent");
    const unavailableOperation = "budget-recovery.third-unavailable";
    const unavailableAdapter: NuwaN1ExecutionAdapter = {
      adapterId: "local-fake.transport-unavailable",
      async request(context) {
        const requestKey = "budget-recovery.transport-uncertain";
        recordNuwaN1ProviderReservation({ ...base, operationId: unavailableOperation, providerCall: 1, requestKey, reservationId: "transport-uncertain.reservation", receiptEnvelopeId: "transport-uncertain.envelope", provider: { providerId: "fixture", profileId: "fixture.default", modelId: "fixture-model" } });
        recordNuwaN1ProviderDispatch({ ...base, operationId: unavailableOperation, requestKey });
        resolveNuwaN1ProviderDispatch({ ...base, operationId: unavailableOperation, requestKey, status: "unknown", detail: "当前模型服务暂时不可用。" });
        return { type: "tool-request", toolName: "read_role_context", requestId: "tool.transport-unavailable", actor: context.actor };
      },
      async executeTool({ context, request }) { return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: context.actor, context }; },
      async continueAfterTool() { throw new Error("当前模型服务暂时不可用。"); }
    };
    const unavailable = await advanceNuwaN1Run({ ...base, expectedRevision: second.revision, operationId: unavailableOperation, adapter: unavailableAdapter });
    assert.equal(unavailable.lifecycle, "blocked");
    assert.equal(unavailable.steps.length, 2);
    assert.equal(unavailable.providerDispatches, 2, "the uncertain transport send stays counted");
    assert.throws(() => resumeNuwaN1Run({ ...base, expectedRevision: unavailable.revision, operationId: "budget-recovery.resume-without-proof" }), /verified terminal dispatch failure/u);
    assert.throws(() => resumeNuwaN1Run({ ...base, expectedRevision: unavailable.revision, operationId: "budget-recovery.resume-wrong-proof", terminalFailureProof: { requestKey: "other", reservationId: "transport-uncertain.reservation", receiptEnvelopeId: "transport-uncertain.envelope" } }), /verified terminal dispatch failure/u);
    const recoveredTransport = resumeNuwaN1Run({ ...base, expectedRevision: unavailable.revision, operationId: "budget-recovery.resume-after-unavailable", terminalFailureProof: { requestKey: "budget-recovery.transport-uncertain", reservationId: "transport-uncertain.reservation", receiptEnvelopeId: "transport-uncertain.envelope" } });
    assert.equal(recoveredTransport.lifecycle, "running");
    assert.deepEqual(recoveredTransport.steps.map((step) => step.stepId), second.steps.map((step) => step.stepId));
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


test("director execution reaches the Pi request for consecutive turns, replaces only on adoption, expires and never teaches a secret", async () => {
  await withRun(async ({ workspace, run }) => {
    let current = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "focus.start" });
    const requests: Array<{ prompt: string; payload: any }> = [];
    const pi = createNuwaN1PiAdapter({
      runtime: { async run(input: any) {
        if (input.requiredToolName === "read_director_brief") {
          const { brief } = await input.tools[0].execute({ toolCallId: "director.read", arguments: {} });
          return { text: JSON.stringify({ understood: "理解作者要求", proposedAdjustment: "立即指定角色揭露凶手", scope: "任意场景", focus: brief.instruction.includes("观察") ? ["advance-observation"] : ["preserve-uncertainty"], unsupported: ["指定角色揭露凶手未执行"] }), usage: { promptTokens: 10, completionTokens: 10 } };
        }
        const payload = await input.tools[0].execute({ toolCallId: "role.read", arguments: {} });
        requests.push({ prompt: input.prompt, payload });
        return { text: JSON.stringify({ intent: "观察", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "保持观察" }), usage: { promptTokens: 10, completionTokens: 10 } };
      } },
      projectId: "synthetic", runId: run.runId, actorIds: run.actors.map((a) => a.character.id),
      provider: { providerId: "fake", profileId: "fake", modelId: "fake" },
      sourceIdentity: { kind: "unversioned-draft", workVersionId: "synthetic", revision: "unversioned" },
      async openProviderStream() { throw new Error("local fake runtime only"); }
    });
    const suggest = async (id: string, focus: string[]) => {
      current = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: id, instruction: `${focus.includes("advance-observation") ? "先观察已有可感知内容" : "保留不确定性"}。指定角色揭露凶手 SECRET_DIRECTOR_CANARY`, adapterId: "fake" });
      current = completeNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: id, suggestion: await pi.suggestDirector(directorBrief(current)) });
    };
    const adopt = (id: string) => { current = decideNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: id, decision: "adopt" }); };
    const step = async (id: string) => { current = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: id, adapter: pi }); };
    await suggest("focus.first", ["preserve-uncertainty"]);
    assert.doesNotMatch(current.directorAdjustment!.proposedAdjustment!, /揭露凶手/);
    await step("focus.unadopted");
    assert.match(requests[0]!.prompt, /没有已采纳/);
    // Source step changed, so request a fresh suggestion.
    await suggest("focus.fresh", ["preserve-uncertainty"]);
    adopt("focus.adopt");
    await step("focus.one");
    const firstReceipt = current.directorAdjustment!.appliedStepId;
    await step("focus.two");
    assert.equal(current.directorAdjustment!.appliedStepId, firstReceipt);
    for (const request of requests.slice(1)) assert.match(request.prompt, /对缺少依据的判断保持怀疑或未知/);
    current = pauseNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: "focus.pause" });
    current = readNuwaN1Run(workspace, run.runId)!;
    current = resumeNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: "focus.resume" });
    await suggest("focus.replacement", ["advance-observation"]);
    assert.deepEqual(compileNuwaN1Context(current, current.actors[0]!, "focus.pending").directorFocus, ["preserve-uncertainty"], "unadopted replacement leaves active guidance intact");
    assert.ok(current.directorHistory.some((item) => item.operationId === "focus.fresh"));
    adopt("focus.replace");
    await step("focus.observation");
    assert.match(requests.at(-1)!.prompt, /先观察已有可感知内容/);
    assert.doesNotMatch(requests.at(-1)!.prompt, /对缺少依据的判断保持怀疑或未知/);
    assert.doesNotMatch(JSON.stringify(requests), /SECRET_DIRECTOR_CANARY|揭露凶手|unsupported|understood/);
    await step("focus.five");
    assert.ok(current.dispatches > 12, "local tool bookkeeping is not the actual Provider send budget");
    assert.equal(readNuwaN1Run(workspace, run.runId)!.providerDispatches, 0, "fake runtime never consumes or expands real Provider quota");
    current = cancelNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: "focus.stop" });
    assert.deepEqual(compileNuwaN1Context(current, current.actors[0]!, "focus.ended").directorFocus, []);
  });
});

test("director focus expires on the scene boundary and unsupported requests never become a default label", async () => {
  const scene = (id: string) => ({ storyUnit: { id, revision }, sceneRef: { id: `scene.${id}`, revision }, observedAt: "world-time.23:00", label: id });
  await withRun(async ({ workspace, run }) => {
    let current = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: run.revision, operationId: "scene.start" });
    current = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: "scene.suggest", instruction: "先观察", adapterId: "fake" });
    current = completeNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "scene.suggest", suggestion: { understood: "观察", proposedAdjustment: "观察", scope: "本场", focus: ["advance-observation"], unsupported: [] } });
    current = decideNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: "scene.adopt", decision: "adopt" });
    const observed = { contexts: [] as any[], calls: [] as number[] };
    for (let i = 0; i < 3; i++) current = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: `scene.step.${i}`, adapter: adapter(observed) });
    assert.deepEqual(observed.contexts.map((context) => context.directorFocus), [["advance-observation"], ["advance-observation"], []]);
    assert.equal(readNuwaN1Run(workspace, run.runId)!.directorAdjustment!.status, "expired");
    current = beginNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, expectedRevision: current.revision, operationId: "scene.unsupported", instruction: "改写角色记忆", adapterId: "fake" });
    current = completeNuwaN1DirectorSuggestion({ workspacePath: workspace, runId: run.runId, operationId: "scene.unsupported", suggestion: { understood: "改记忆", proposedAdjustment: "无", scope: "无", focus: [], unsupported: ["不支持改写角色记忆"] } });
    assert.equal(current.directorAdjustment!.status, "failed");
    assert.match(current.directorAdjustment!.failure!, /未执行.*记忆/);
    assert.deepEqual(compileNuwaN1Context(current, current.actors[0]!, "scene.none").directorFocus, []);
  }, fixtureActors(), { version: "tianyan-nuwa-n1-scope/v1", mode: "bounded", storylineKey: "two-scenes", storylineLabel: "两场", currentSceneIndex: 0, scenes: [scene("unit.first"), scene("unit.second")] });
});


test("N1 private narration stays available for author candidate review but never enters role context", async () => {
  await withRun(async ({ workspace, run }) => {
    const running = startNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: 1, operationId: "private.start" });
    const fake = adapter({ contexts: [], calls: [] });
    fake.continueAfterTool = async ({ context }) => ({ type: "actor-result", actor: context.actor, intent: "心里藏着青鹭七号", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "蓝匣暗码青鹭七号的事我记在心里，但先不说破。", usage: { inputTokens: 20, outputTokens: 20 } });
    const stepped = await advanceNuwaN1Run({ workspacePath: workspace, runId: run.runId, expectedRevision: running.revision, operationId: "private.step", adapter: fake });
    assert.match(stepped.steps[0]!.observableResult, /青鹭七号/u);
    assert.deepEqual(stepped.steps[0]!.heardStatements, []);
    assert.doesNotMatch(JSON.stringify(compileNuwaN1Context(stepped, stepped.actors[1]!, "private.context")), /青鹭七号/u);
    const { handoff } = prepareNuwaN1CandidateHandoff({ workspacePath: workspace, runId: run.runId, expectedRevision: stepped.revision, operationId: "private.handoff", selectedStepIds: [stepped.steps[0]!.stepId] });
    assert.match(handoff.candidates[0]!.observedResult, /青鹭七号/u);
    assert.doesNotMatch(handoff.candidates[0]!.summary, /青鹭七号/u);
    assert.equal(handoff.candidates[0]!.action, "observe");
  });
});
