import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPendingReviewAggregation, selectStoryIntakeReviewTarget } from "../../apps/story-studio/src/product-shell/project-directory/pendingReviewAggregation.ts";

test("G1 pending entry counts only unresolved source items and keeps source batches traceable", () => {
  const aggregation = buildPendingReviewAggregation({
    projectId: "project.a",
    workVersionId: "work-version.a",
    imports: [{ sourceDocumentId: "source.a", title: "雾港原稿", candidates: [{ candidateId: "source-pending", displayName: "守夜钟", summary: "失踪", status: "pending" }, { candidateId: "source-done", displayName: "旧记录", summary: "已采纳", status: "accepted" }] }],
    golden: { id: "golden.a", candidates: [{ id: "decision.a", title: "确认误解", summary: "阿芜的认知仍待作者决定", status: "awaiting" }] },
    proposals: [{ proposalId: "proposal.a", suggestedName: "阿芜", sourceWorkspace: "对话批次 A", status: "pending", uncertainties: [], duplicateMatches: [], suggestedFields: { proposedCustomTypes: ["码头工"] } }],
    relations: [{ relationId: "relation.a", currentTypeLabel: "误解", relationLabelSnapshot: "误解", sourceObjectId: "阿芜", targetObjectId: "顾澜", evidenceWarnings: [], reviewState: "candidate" }],
    storyIntakeRuns: [{ projectId: "project.a", workVersionId: "work-version.a", sessionId: "session.a", runId: "run.a", updatedAt: "2026-09-05T00:00:00.000Z", storyIntakeEnvelope: { envelopeId: "envelope.a", projectId: "project.a", sessionId: "session.a", runId: "run.a", baseVersion: { workVersionId: "work-version.a" }, candidates: [{ candidateId: "intake.pending", type: "event", proposedName: null, proposedTitle: "守夜钟失踪", summary: "林昭亲历的失踪事件。", lifecycleStatus: "pending-review" }, { candidateId: "intake.done", type: "character", proposedName: "林昭", proposedTitle: null, summary: "已处理。", lifecycleStatus: "confirmed" }] } }]
  });

  assert.equal(aggregation.pendingCount, 5, "未处理计数必须包含当前故事版本的 Story Intake，且不能把已处理记录算进去");
  assert.deepEqual(aggregation.categoryCounts, { source: 1, candidate: 3, decision: 1, adoption: 0, processed: 2 });
  assert.deepEqual(aggregation.items.filter((item) => item.pending).map((item) => item.id), ["source:source.a:source-pending", "decision:golden.a:decision.a", "candidate:proposal.a", "candidate:relation.a", "story-intake:envelope.a:intake.pending"]);
  assert.equal(aggregation.items.find((item) => item.id === "source:source.a:source-pending")?.sourceBatch.label, "雾港原稿");
  assert.equal(aggregation.items.find((item) => item.id === "candidate:proposal.a")?.sourceBatch.label, "对话批次 A");
  assert.equal(aggregation.items.find((item) => item.id === "story-intake:envelope.a:intake.pending")?.sourceBatch.label, "天意 Story Intake · 会话 session.a · 运行 run.a");
  assert.equal(aggregation.storyIntakeTargets.length, 1, "同一持久 Envelope/candidate 只能保持一个引用入口，不复制候选");
});

test("G1 pending aggregation refuses cross-project or cross-version records before they reach the entry", () => {
  const aggregation = buildPendingReviewAggregation({
    projectId: "project.a",
    workVersionId: "work-version.a",
    imports: [{ sourceDocumentId: "source.a", title: "A", candidates: [{ candidateId: "a", displayName: "A", summary: "A", status: "pending" }] }],
    golden: null,
    proposals: [{ proposalId: "proposal.b", projectId: "project.b", suggestedName: "B", sourceWorkspace: "B 批次", status: "pending", uncertainties: [], duplicateMatches: [], suggestedFields: {} }],
    relations: [{ relationId: "relation.b", workVersionId: "work-version.b", currentTypeLabel: "B", relationLabelSnapshot: "B", sourceObjectId: "B", targetObjectId: "B", evidenceWarnings: [], reviewState: "candidate" }],
    storyIntakeRuns: [{ projectId: "project.b", workVersionId: "work-version.b", sessionId: "session.b", runId: "run.b", updatedAt: "2026-09-05T00:00:00.000Z", storyIntakeEnvelope: { envelopeId: "envelope.b", projectId: "project.b", sessionId: "session.b", runId: "run.b", baseVersion: { workVersionId: "work-version.b" }, candidates: [{ candidateId: "b", type: "event", proposedName: null, proposedTitle: "B", summary: "B", lifecycleStatus: "pending-review" }] } }]
  });

  assert.equal(aggregation.pendingCount, 1);
  assert.deepEqual(aggregation.items.map((item) => item.id), ["source:source.a:a"]);
});

test("R2 E07 does not count the legacy Tianyi recognition projection beside its authoritative Story Intake batch", () => {
  const aggregation = buildPendingReviewAggregation({
    projectId: "project.a",
    workVersionId: "work-version.a",
    imports: [],
    golden: null,
    proposals: [
      { proposalId: "legacy.intake", suggestedName: "林昭", sourceWorkspace: "tianyi-story-intake", status: "pending", uncertainties: [], duplicateMatches: [], suggestedFields: {} },
      { proposalId: "other.source", suggestedName: "船工", sourceWorkspace: "手稿识别", status: "pending", uncertainties: [], duplicateMatches: [], suggestedFields: {} }
    ],
    relations: [],
    storyIntakeRuns: [{ projectId: "project.a", workVersionId: "work-version.a", sessionId: "session.a", runId: "run.a", updatedAt: "2026-09-05T00:00:00.000Z", storyIntakeEnvelope: { envelopeId: "envelope.a", projectId: "project.a", sessionId: "session.a", runId: "run.a", baseVersion: { workVersionId: "work-version.a" }, candidates: [{ candidateId: "intake.pending", type: "character", proposedName: "林昭", proposedTitle: null, summary: "亲历失踪。", lifecycleStatus: "pending-review" }] } }]
  });

  assert.equal(aggregation.pendingCount, 2, "当 Story Intake Envelope 可用时，同来源的旧识别投影不应再把总数加一");
  assert.deepEqual(aggregation.items.filter((item) => item.pending).map((item) => item.id), ["candidate:other.source", "story-intake:envelope.a:intake.pending"]);
});

test("R1-02 discovers the persisted current Story Intake envelope before a browser session hint and keeps its review identity", () => {
  const target = selectStoryIntakeReviewTarget({
    projectId: "project.a",
    workVersionId: "work-version.a",
    runs: [
      { projectId: "project.b", workVersionId: "work-version.a", sessionId: "session.b", runId: "run.b", updatedAt: "2026-09-05T00:03:00.000Z", storyIntakeEnvelope: { envelopeId: "envelope.b", projectId: "project.b", sessionId: "session.b", runId: "run.b", baseVersion: { workVersionId: "work-version.a" }, candidates: [{ candidateId: "candidate.b", type: "event", proposedName: null, proposedTitle: "B", summary: "cross project", lifecycleStatus: "pending-review" }] } },
      { projectId: "project.a", workVersionId: "work-version.old", sessionId: "session.old", runId: "run.old", updatedAt: "2026-09-05T00:02:00.000Z", storyIntakeEnvelope: { envelopeId: "envelope.old", projectId: "project.a", sessionId: "session.old", runId: "run.old", baseVersion: { workVersionId: "work-version.old" }, candidates: [{ candidateId: "candidate.old", type: "event", proposedName: null, proposedTitle: "旧版", summary: "cross version", lifecycleStatus: "pending-review" }] } },
      { projectId: "project.a", workVersionId: "work-version.a", sessionId: "session.current", runId: "run.current", updatedAt: "2026-09-05T00:01:00.000Z", storyIntakeEnvelope: { envelopeId: "envelope.current", projectId: "project.a", sessionId: "session.current", runId: "run.current", baseVersion: { workVersionId: "work-version.a" }, candidates: [{ candidateId: "candidate.current", type: "event", proposedName: null, proposedTitle: "守夜钟", summary: "current", lifecycleStatus: "pending-review" }] } }
    ]
  });

  assert.deepEqual(target, {
    projectId: "project.a",
    workVersionId: "work-version.a",
    sessionId: "session.current",
    runId: "run.current",
    envelopeId: "envelope.current",
    candidateId: "candidate.current"
  }, "目录必须从持久运行投影定位同一 Envelope/candidate，而不是依赖当前 sessionStorage 指针");
});

test("G1 keeps the directory as a compact entry and opens detailed review in the central workspace", () => {
  const directory = readFileSync("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryPanel.tsx", "utf8");
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const projection = readFileSync("apps/story-studio/src/product-shell/project-directory/useProjectDirectoryProjection.ts", "utf8");

  assert.match(directory, /PendingReviewEntry/u);
  assert.match(directory, /onOpenPendingReview/u);
  assert.doesNotMatch(directory, /<PendingReviewPanel/u);
  assert.match(shell, /PendingReviewWorkspace/u);
  assert.match(shell, /openPendingReview/u);
  assert.match(shell, /directoryReview.*pending/u);
  assert.match(shell, /tianyiLane.*review/u);
  assert.match(shell, /tianyiSession/u);
  assert.match(shell, /tianyiCandidate/u);
  assert.match(shell, /window\.dispatchEvent\(new Event\("tianyan-location-change"\)\)/u, "same-page pending navigation must notify the mounted central workspace");
  const pendingNavigation = shell.match(/const openPendingReview[\s\S]*?const closePendingReview/u)?.[0] ?? "";
  assert.match(pendingNavigation, /setActiveTianyiCandidateId\(null\)/u, "opening Story Intake review must clear any stale legacy EventLine candidate");
  assert.doesNotMatch(pendingNavigation, /setActiveTianyiCandidateId\(target\.candidateId\)/u, "Story Intake references must not enter the legacy EventLine candidate slot");
  assert.match(shell, /destination\.id === "event-line"\) props\.runtime\.setActiveTianyiCandidateId\(null\)/u, "the global EventLine entry must always open the formal projection without a stale candidate overlay");
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/workspace/TianyiConversationWorkspace.tsx", "utf8");
  assert.match(workspace, /addEventListener\("tianyan-location-change", restoreRequestedLane\)/u);
  assert.doesNotMatch(projection, /sessionStorage\.getItem\(tianyiStoryIntakeRunStorageKey/u, "目录发现不得把浏览器 sessionStorage 当成唯一持久入口");
});

test("R2 E07 lists every persisted Story Intake batch and makes each exact batch reachable", () => {
  const directory = readFileSync("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryPanel.tsx", "utf8");
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const projection = readFileSync("apps/story-studio/src/product-shell/project-directory/useProjectDirectoryProjection.ts", "utf8");
  const transport = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");

  assert.match(projection, /getTianyiStoryIntakeRuns/u, "目录必须读取当前作品版本的所有持久批次，不能只取最新一批");
  assert.match(transport, /tianyi-agent\/run\/story-intakes/u);
  assert.match(server, /listStoryIntakeRuns/u);
  assert.match(directory, /storyIntakeBatches\.map\(\(batch\)/u);
  assert.match(directory, /onOpenPendingReview\(batch\.target\)/u, "每个批次必须用自己的 project\/workVersion\/session\/run\/envelope\/candidate 精确进入审阅");
  assert.match(directory, /onOpenRelationReview/u, "总数里的事件关系候选也必须有可达处理入口");
  assert.match(shell, /eventAdvanced: "graph"/u, "关系候选入口必须打开事件线既有的关系 Owner 工作面");
  assert.match(shell, /eventPending: "relations"/u, "关系 Owner 工作面必须定位到待确认关系，而不是落到空图");
});
