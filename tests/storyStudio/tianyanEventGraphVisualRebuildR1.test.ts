import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const projection = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const prediction = readFileSync("apps/story-studio/src/components/tianyi/sidebar/MultiNodePredictionPanel.tsx", "utf8");
const tianyi = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
const translations = readFileSync("apps/story-studio/src/product-shell/i18n/translations.ts", "utf8");

test("event graph R1 keeps global and focus in one projection component", () => {
  assert.match(graph, /data-event-graph-owner="projection"/u);
  assert.match(graph, /view, focusId, depth/u);
  assert.match(graph, /function deriveGraph/u);
  assert.match(graph, /returnGlobal/u);
  assert.match(graph, /展开一层/u);
  assert.match(graph, /tianyan-event-graph-layout\/v2/u);
  assert.match(graph, /localStorage/u);
});

test("event line distinguishes loading, missing project, and recoverable connection failure", () => {
  assert.match(projection, /loadState === "loading"/u);
  assert.match(projection, /t\("eventLine\.noProject"\)/u);
  assert.match(projection, /data-testid="event-line-no-project"/u);
  assert.match(projection, /t\("eventLine\.unavailable"\)/u);
  assert.match(translations, /"eventLine\.noProject": "尚未打开作品"/u);
  assert.match(translations, /"eventLine\.unavailable": "事件线暂时无法打开"/u);
  assert.match(projection, /props\.runtime\.retryConnection\(\)/u);
  assert.doesNotMatch(projection, /Loading event line/u);
  assert.match(projection, /\[props\.runtime\.project\]/u);
});

test("event graph R1 distinguishes formal, pending, and remote relationship projections", () => {
  assert.match(graph, /待确认 · /u);
  assert.match(graph, /strokeDasharray: "7 5"/u);
  assert.match(graph, /远端投影/u);
  assert.match(graph, /strokeDasharray: "3 5"/u);
  assert.match(graph, /正式关系/u);
  assert.match(graph, /关系图图例/u);
});

test("event graph R1 only calls existing Relation owner operations", () => {
  assert.match(projection, /createRelationCandidate/u);
  assert.match(projection, /confirmRelationCandidate/u);
  assert.match(projection, /updateRelationCandidate/u);
  assert.match(projection, /rejectRelationCandidate/u);
  assert.match(graph, /尚未成为正式关系/u);
  assert.match(graph, /通过并保存/u);
  assert.match(graph, /修改后通过/u);
  assert.match(graph, /暂不处理/u);
  assert.doesNotMatch(graph, /createStoryStudioRelationOperations/u);
});

test("event graph R1 uses one contextual inspector rather than the spine page dock", () => {
  assert.match(graph, /事件检查器/u);
  assert.match(graph, /待确认关系检查器/u);
  assert.match(graph, /正式关系检查器/u);
  assert.match(workspace, /projectionMode !== "graph" \? <PageContextDock/u);
  assert.match(workspace, /onClearSelection/u);
});

test("event graph R2 keeps the canvas primary and translates implementation terms", () => {
  const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");
  assert.match(graph, /useWorkspaceDockSlot/u);
  assert.match(graph, /openInspector\("RELATION_REVIEW"\)/u);
  assert.doesNotMatch(graph, /setInspectorOpen|useState\(Boolean\(props\.selectedEventId\)\)/u);
  assert.doesNotMatch(styles, /tianyan-r0-shell:has\(.event-graph-workspace\)[\s\S]*--directory-current/u);
  assert.match(styles, /event-line-workbench\[data-projection-mode="graph"\] .event-line-spine-toolbar/u);
  assert.match(styles, /event-graph-workspace\.has-inspector .event-graph-main/u);
  assert.doesNotMatch(graph, /尚未写入正式 Relation/u);
  assert.doesNotMatch(graph, /Relation owner/u);
});

test("multi-node productization keeps Unit, active path, overlay, and Tianyi contracts aligned", () => {
  const graphStyles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");
  const tianyiStyles = readFileSync("apps/story-studio/src/styles/tianyi-sidebar.css", "utf8");
  assert.match(graph, /aria-label="单元目录"/u);
  assert.match(graph, /集点 ·/u);
  assert.match(graph, /的直接节点/u);
  assert.match(graph, /title=\{event\.title\}/u);
  assert.match(graph, /aria-label=\{`\$\{event\.title\}，\$\{semantic\.time\.label\}`\}/u);
  assert.doesNotMatch(graph, /第 X 卷/u);
  assert.match(graph, /story-studio-prediction-review-selection/u);
  assert.match(graph, /fitPredictionProjection/u);
  assert.match(graph, /尚未写入事件线/u);
  assert.match(prediction, /条路径可同时比较/u);
  assert.match(prediction, /按 Escape 返回全部路径/u);
  assert.match(prediction, /summarizeAdoption/u);
  assert.match(prediction, /采纳 \$\{summary\.selected\} 个节点 · 新建 \$\{summary\.drafts\} 个草稿/u);
  assert.match(prediction, /这次采纳已保存/u);
  assert.match(prediction, /作者草稿已保存 · 尚未进入正式故事/u);
  assert.match(tianyi, /data-tianyi-mode=\{mode\}/u);
  assert.match(tianyi, /mode === "dialogue" \? <TianyiDialoguePanel[\s\S]*<TianyiAgentPanel/u);
  assert.match(tianyiStyles, /min-inline-size: var\(--tianyi-sidebar-width\)/u);
  assert.match(graphStyles, /event-graph-prediction-node\.is-review-excluded/u);
  assert.match(graph, /predictionSourceSummary/u);
  assert.match(graph, /3 个推演依据|个推演依据/u);
  assert.match(graph, /const sourceIds = predictionVisible && predictionRun \? new Set\(predictionRun\.sourceSnapshot/u);
  assert.doesNotMatch(graph, /: predictionSelectionIds\.size \? new Set\(predictionSelectionIds\)/u);
  assert.match(graphStyles, /event-graph-prediction-source-summary/u);
});

test("candidate overlay renders the validated path edge set with automatic routing and shared roots", () => {
  assert.match(graph, /candidateEdgeIds = new Set\(paths\.flatMap/);
  assert.match(graph, /candidateEdgeIds\.has\(edge\.id\)/);
  assert.match(graph, /type: "smoothstep"/);
  assert.match(graph, /relationTypeHint[\s\S]*关系类型待确认/);
  assert.match(graph, /const roots = \[\.\.\.new Set\(paths\.map/);
  assert.match(graph, /共同推演依据/);
  assert.doesNotMatch(graph, /const first = pathNodes\[0\]/);
});

test("story spine keeps direct Unit nodes separate from optional collection points", () => {
  assert.match(workspace, /group\.direct\.length/u);
  assert.match(workspace, /直接属于单元/u);
  assert.match(workspace, /if \(setPoint\) group\.setPoints\.set/u);
  assert.match(workspace, /else group\.direct\.push/u);
  assert.doesNotMatch(workspace, /"未指定集点"/u);
});
