import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import type { NuwaResultReceipt, StoryExploration, TianyiNuwaExecutionBrief } from "../../apps/story-studio/src/lib/localTransport.ts";

test("the formal Nuwa workspace renders a bound Brief as one current unit without falling back to Golden Loop", async () => {
  const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent" });
  try {
    const module = await server.ssrLoadModule("/apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx") as {
      NuwaPrimaryWorkspace(props: Record<string, unknown>): ReturnType<typeof createElement>;
    };
    const markup = renderToStaticMarkup(createElement(module.NuwaPrimaryWorkspace, props()));
    assert.match(markup, /女娲 · 单元排演/);
    assert.match(markup, /当前单元/);
    assert.match(markup, /简报第 4 版/);
    assert.match(markup, /本单元排演记录/);
    assert.match(markup, /排演播放器控制/);
    assert.match(markup, /重置本版回放/);
    assert.match(markup, /单步推进/);
    assert.match(markup, /快进到本版末尾/);
    assert.match(markup, /印章的事还不能现在说/);
    assert.match(markup, /顾沉把旧印泥推到桌面中央/);
    assert.match(markup, /data-event-type="agent_speech"/);
    assert.match(markup, /data-event-type="agent_action"/);
    assert.match(markup, /在右栏查看/);
    assert.match(markup, /向天意询问本单元/);
    assert.match(markup, /aria-label="女娲运行详情" role="tablist"/);
    for (const stage of ["排演现场", "候选比较", "候选审查", "历史排演"]) assert.match(markup, new RegExp(`>${stage}<`));
    for (const lens of ["上下文", "观察", "分支", "评审", "控制"]) assert.match(markup, new RegExp(`aria-label="${lens}"`));
    assert.doesNotMatch(markup, /aria-label="天意"/);
    assert.doesNotMatch(markup, /aria-label="女娲流程"|nuwa-workflow-rail/);
    assert.doesNotMatch(markup, /女娲导演层|nuwa-director-workspace|nuwa-comparison-workspace/);
    assert.doesNotMatch(markup, /女娲五阶段/);
    assert.doesNotMatch(markup, /普通 Golden Loop/);
    assert.doesNotMatch(markup, /data-stage-id=/);
    const source = readFileSync("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx", "utf8");
    assert.match(source, /onSubmit\(props\.selected!\.id\)/);
    assert.match(source, /PageContextDock/);
    assert.match(source, /event\.key !== "Escape"/);
    assert.match(source, /所有操作只作用于当前单元/);
    assert.doesNotMatch(source, /WorkflowRail|const workflow =|setSurface\("director"\)|setSurface\("comparison"\)/);
    assert.doesNotMatch(source, /function (?:Goal|Plan|Run|Compare|Review)Stage/);

    const branchMarkup = renderToStaticMarkup(createElement(module.NuwaPrimaryWorkspace, {
      ...props(),
      dockState: { open: true, activeLens: "branch" }
    }));
    assert.match(branchMarkup, /role="dialog" aria-modal="false" aria-label="分支工具"/);
    assert.match(branchMarkup, /不可变版本/);
    assert.match(branchMarkup, /候选路线/);
    assert.match(branchMarkup, /class="nuwa-rehearsal-surface"/);
    assert.doesNotMatch(branchMarkup, /nuwa-comparison-workspace|nuwa-director-workspace/);

    const comparisonMarkup = renderToStaticMarkup(createElement(module.NuwaPrimaryWorkspace, { ...props(), stage: "comparison" }));
    assert.match(comparisonMarkup, /只比较本 Unit 的可逆候选/);
    assert.match(comparisonMarkup, /保留沉默/);
    assert.match(comparisonMarkup, /候选仍不是故事事实/);
    assert.doesNotMatch(comparisonMarkup, /普通 Golden Loop/);

    const historyMarkup = renderToStaticMarkup(createElement(module.NuwaPrimaryWorkspace, { ...props(), stage: "history" }));
    assert.match(historyMarkup, /已保存的记录/);
    assert.match(historyMarkup, /查看历史不会重新执行 Provider/);

    const noUnitMarkup = renderToStaticMarkup(createElement(module.NuwaPrimaryWorkspace, {
      ...props(),
      boundBrief: null,
      boundExploration: null,
      boundResultReceipt: null,
      stage: "rehearsal"
    }));
    assert.match(noUnitMarkup, /从一个故事开始/);
    assert.match(noUnitMarkup, /选择一个故事来源，说明你想观察的问题/);
    assert.match(noUnitMarkup, /选择故事来源/);
    assert.equal((noUnitMarkup.match(/primary-action/g) || []).length, 1, "the no-unit Nuwa surface has one primary action");
    assert.match(noUnitMarkup, /排演结果不会自动成为故事事实/);
    assert.doesNotMatch(noUnitMarkup, /Provider 试验/);
    assert.doesNotMatch(noUnitMarkup, /Project does not exist|普通 Golden Loop/);
  } finally {
    await server.close();
  }
});

function props(): Record<string, unknown> {
  const exploration: StoryExploration = {
    version: "story-studio-exploration-product/v1",
    id: "exploration.bound",
    status: "ready-for-review",
    source: { sceneId: "scene.03", sceneTitle: "雨夜前的公寓", authorGoal: "验证守夜人的沉默" },
    supervisor: { label: "女娲", role: "整理候选", authorDecisionRequired: true },
    specialists: [
      { label: "人物弧光", purpose: "检查人物动机", requirement: "required", status: "已核验" },
      { label: "因果推演", purpose: "检查后果", requirement: "required", status: "已核验" }
    ],
    progress: { completed: 2, total: 2, coverage: "完整" },
    routes: [{
      id: "route-1",
      title: "保留沉默",
      summary: "守夜人暂时不承认印章被调换。",
      immediateConsequence: "悬念保留。",
      mediumTermConsequence: "角色关系承压。",
      longTermPressure: "必须解释沉默动机。",
      preservedMysteries: ["印章去向"],
      risks: ["动机不清"],
      assumptions: ["守夜人知情"],
      affectedObjectIds: [],
      selected: false
    }],
    capability: { label: "证据回忆", detail: "已核验" },
    primaryAction: "选择候选路线",
    canRun: false,
    canSynthesize: false,
    canSubmitRoute: true,
    rehearsal: {
      version: "story-studio-nuwa-rehearsal-read-model/v1",
      runId: "nuwa-run.bound",
      latestRevision: 1,
      revisions: [{
        version: "story-studio-nuwa-rehearsal-revision/v1",
        unitId: "exploration.bound",
        explorationId: "exploration.bound",
        briefId: "brief.bound",
        briefRevision: 4,
        runId: "nuwa-run.bound",
        runRevision: 1,
        parentRunRevision: null,
        status: "ready-for-candidate-review",
        roster: [
          { objectId: "character.lin", objectKind: "character", displayName: "林峤", sourceRevision: "1".repeat(64) },
          { objectId: "character.gu", objectKind: "character", displayName: "顾沉", sourceRevision: "2".repeat(64) }
        ],
        temporaryVariables: [],
        creativeBoosts: [],
        interventionProposals: [],
        orderedEvents: [
          { eventId: "event.1", unitId: "exploration.bound", runId: "nuwa-run.bound", runRevision: 1, sequence: 1, eventType: "agent_speech", actorAgentRef: { objectId: "character.lin", objectKind: "character", displayName: "林峤", sourceRevision: "1".repeat(64) }, targetRefs: ["character.gu"], source: { kind: "provider", sourceRef: "receipt.1" }, payload: { text: "印章的事还不能现在说。" }, createdAt: "2026-08-15T00:00:00.000Z" },
          { eventId: "event.2", unitId: "exploration.bound", runId: "nuwa-run.bound", runRevision: 1, sequence: 2, eventType: "agent_action", actorAgentRef: { objectId: "character.gu", objectKind: "character", displayName: "顾沉", sourceRevision: "2".repeat(64) }, targetRefs: ["character.lin"], source: { kind: "provider", sourceRef: "receipt.1" }, payload: { description: "顾沉把旧印泥推到桌面中央。" }, createdAt: "2026-08-15T00:00:01.000Z" },
          { eventId: "event.3", unitId: "exploration.bound", runId: "nuwa-run.bound", runRevision: 1, sequence: 3, eventType: "inner_monologue", actorAgentRef: { objectId: "character.lin", objectKind: "character", displayName: "林峤", sourceRevision: "1".repeat(64) }, targetRefs: [], source: { kind: "provider", sourceRef: "receipt.1" }, payload: { text: "现在承认只会把顾沉也拖进来。" }, createdAt: "2026-08-15T00:00:02.000Z" },
          { eventId: "event.4", unitId: "exploration.bound", runId: "nuwa-run.bound", runRevision: 1, sequence: 4, eventType: "system_checkpoint", actorAgentRef: null, targetRefs: [], source: { kind: "system", sourceRef: "checkpoint.1" }, payload: { label: "沉默动机已形成分歧" }, createdAt: "2026-08-15T00:00:03.000Z" }
        ],
        memoryDeltas: [],
        relationshipDeltas: [],
        candidateRefs: ["route-1"],
        inheritance: { temporaryVariables: false, creativeBoosts: false },
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:01.000Z"
      }]
    },
    activity: [{ unitId: "exploration.bound", runId: "nuwa-run.bound", sequence: 1, actor: "因果推演", eventType: "task-started", summary: "开始受限检查", sourceLabel: "本单元执行记录" }],
    mutatesMarkdown: false,
    modelCalls: 0
  };
  const brief: TianyiNuwaExecutionBrief = {
    version: "story-studio-tianyi-nuwa-execution-brief/v1",
    briefId: "brief.bound",
    revision: 4,
    authorGoal: "验证守夜人的沉默",
    sourceProject: { projectId: "project.bound", projectRevision: "revision.bound" },
    currentContext: { mode: "writing", documentId: "scene.03", objectIds: [], selectionRef: "selection.bound" },
    selectedContextReceiptIds: [],
    selectedArchiveMessageRefs: [],
    approvedMemoryRefs: [],
    mustKeep: ["保留悬念"],
    mustAvoid: ["确认事实"],
    unresolvedQuestions: ["他为何沉默？"],
    expectedOutputKind: "candidate-routes",
    allowedAgents: [],
    allowedSkills: [],
    capabilityBudget: { maxAgentRuns: 2, maxSkillCalls: 0, maxTokens: 100, timeoutSeconds: 1 },
    sensitivity: "project-private",
    authorApprovalState: "approved",
    expectedHashes: { brief: "brief-hash", sourceSet: "source-hash" },
    operationId: "operation.bound",
    originatingTianyiSessionId: "session.bound",
    returnDestination: { mode: "writing", documentId: "scene.03", selectionRef: "selection.bound" }
  };
  const receipt: NuwaResultReceipt = {
    version: "story-studio-nuwa-result-receipt/v1",
    resultReceiptId: "result.bound",
    briefId: brief.briefId,
    briefRevision: brief.revision,
    operationId: brief.operationId,
    agentsUsed: ["nuwa"],
    skillsUsed: [],
    sourceRefs: [],
    candidateRouteIds: ["route-1"],
    disagreements: [],
    unresolvedQuestions: [],
    staleState: "current",
    impactReviewEligible: true,
    returnDestination: { tianyiSessionId: brief.originatingTianyiSessionId, mode: "writing", documentId: "scene.03", selectionRef: "selection.bound" }
  };
  return {
    projectTitle: "雾中灯塔",
    contextLabel: "雨夜前的公寓",
    contextDetail: "当前场景",
    sourceLabel: "天意",
    approvedBriefAvailable: true,
    boundBrief: brief,
    boundExploration: exploration,
    boundResultReceipt: receipt,
    boundBusy: false,
    boundError: "",
    providerReady: false,
    result: null,
    history: [],
    rejectedCandidateIds: [],
    acceptedCandidateIds: [],
    busy: false,
    error: "",
    goal: "",
    onGoal: () => {},
    onStartNew: () => {},
    onRun: () => {},
    onCancel: () => {},
    onRunBound: () => {},
    onSynthesizeBound: () => {},
    onSubmitBoundRoute: () => {},
    onCancelBound: () => {},
    onReject: () => {},
    onReview: () => {},
    onAbandonReview: () => {},
    onOpenHistory: () => {},
    onReopenImpactReview: () => {},
    onPrepareBrief: () => {},
    onReturnSource: () => {},
    dockState: { open: false, activeLens: "context" },
    onDockState: () => {},
    onOpenTianyi: () => {},
    onOpenEventLine: () => {},
    onOpenLibrary: () => {},
    onChooseUnit: () => {}
  };
}
