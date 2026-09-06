import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { directoryWorkspaceStorageKey, resolveDirectoryPresentation } from "../../apps/story-studio/src/product-shell/project-directory/directoryWorkspaceState.ts";

const source = (file: string) => readFileSync(file, "utf8");

test("R4 separates persistent directory intent from temporary presentation suppression", () => {
  assert.equal(directoryWorkspaceStorageKey("project.r4"), "tianyan:directory-workspace:project.r4");
  assert.equal(resolveDirectoryPresentation({ preferredOpen: true, temporarySurface: "none" }), true);
  assert.equal(resolveDirectoryPresentation({ preferredOpen: true, temporarySurface: "right-inspector" }), false);
  assert.equal(resolveDirectoryPresentation({ preferredOpen: true, temporarySurface: "none" }), true);
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  assert.match(shell, /directoryPreferredOpen/u);
  assert.match(shell, /directoryPresented/u);
  assert.doesNotMatch(shell, /rightWorkSurface\.mode === "TIANYI" && focusLayout !== "wide"\) \{\s*setDirectoryOpen\(false\)/u);
  assert.doesNotMatch(shell, /characterInspectorOpen/u);
  const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const eventInspectorActions = workbench.match(/const openEvent[\s\S]*?const returnToPreviousCausalEvent/u)?.[0] ?? "";
  assert.doesNotMatch(eventInspectorActions, /story-studio-close-project-directory/u, "1195px 事件检查器必须与目录协调，不能静默关闭作者入口");
});

test("R4 persists per-project directory path, search, selection, and scroll", () => {
  const tree = source("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryTree.tsx");
  assert.match(tree, /projectId/u);
  assert.match(tree, /initialState/u);
  assert.match(tree, /onStateChange/u);
  assert.match(tree, /scrollTop/u);
  const character = source("apps/story-studio/src/product-shell/project-directory/character/CharacterDirectoryPanel.tsx");
  assert.match(character, /directoryState\.character/u);
  assert.match(character, /selectedIds/u);
  assert.match(character, /tagFilter/u);
  assert.match(character, /scrollTop/u);
});

test("R4 role handoff uses a stable SubjectRef and blocks author Agent ContextPack reuse", () => {
  const handoff = source("src/storyContracts/characterKnowledgeHandoff.ts");
  const sidebar = source("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx");
  const server = source("apps/story-studio/server/server.mjs");
  assert.match(handoff, /contextAccess: "character"/u);
  assert.match(handoff, /subjectRef/u);
  assert.match(sidebar, /accessMode: roleContext \? "character" : "author"/u);
  assert.match(server, /不能进入作者 Agent ContextPack/u);
});

test("R4 exposes zero-model character drag from the actual dedicated character directory", () => {
  const panel = source("apps/story-studio/src/product-shell/project-directory/character/CharacterDirectoryPanel.tsx");
  assert.match(panel, /CHARACTER_OBSERVATION_MIME/u);
  assert.match(panel, /createCharacterObservationDragPayload/u);
  assert.match(panel, /revisionToken/u);
  assert.match(panel, /draggable/u);
  assert.match(panel, /可拖入角色观察/u);
});

test("R4 keeps one compact event header and exposes the 1-5 person author comparison", () => {
  const workspace = source("apps/story-studio/src/components/event-observation/StoryProgressionWorkspace.tsx");
  const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const observationContract = source("src/storyContracts/eventObservation.ts");
  assert.match(workspace, /联合对照/u);
  assert.match(workspace, /1–5/u);
  assert.match(workspace, /data-provider-calls="0"/u);
  assert.doesNotMatch(workspace, /只显示所有已选人物共同可见/u);
  assert.doesNotMatch(workbench, /characterCount=\{0\}/u);
  assert.doesNotMatch(workbench, /slice\(0, 3\)/u);
  assert.doesNotMatch(observationContract, /slice\(0, 3\)/u);
});

test("R4 advanced perspective receives stable Owner evidence rather than display labels", () => {
  const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const contract = source("src/storyContracts/eventPerspectiveProjection.ts");
  assert.match(workbench, /getEventStoryCrossingKnowledgeProjection\(props\.projectId, "author", \[\]\)/u);
  assert.match(workbench, /knowledgeProjection=\{perspectiveOwnerProjection\}/u);
  assert.match(workbench, /perspectiveEventsFromKnowledgeProjection\(props\.events, props\.knowledgeProjection\)/u);
  assert.match(contract, /participantSubjectIds/u);
  assert.match(contract, /knowledgeBySubjectId/u);
  assert.doesNotMatch(contract, /perspectiveEvidenceKey/u);
  assert.doesNotMatch(contract, /sameLabel/u);
});

test("R4-R1 makes Work a durable global lane and moves Story Intake review into the unified inbox", () => {
  const workspace = source("apps/story-studio/src/components/tianyi/workspace/TianyiConversationWorkspace.tsx");
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  const topbar = source("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx");
  const pending = source("apps/story-studio/src/product-shell/project-directory/PendingReviewPanel.tsx");

  assert.match(workspace, /requested === "review" \|\| requested === "work"/u, "旧批次深链仍必须恢复到原审阅任务");
  assert.doesNotMatch(workspace, /role="tab" aria-selected=\{lane === "review"\}/u, "审阅不是永久顶层模式");
  assert.match(workspace, /onClick=\{\(\) => changeLane\("work"\)\}/u, "没有候选时 Work 仍必须可进入");
  assert.match(workspace, /data-global-work=\{lane === "work" && !activeIntakeCandidate/u);
  assert.match(workspace, /发送到当前工作/u);
  assert.match(workspace, /不会因没有候选而中断/u);
  assert.match(workspace, /getWorldLibrary\(project\.id\)/u, "全局 Work 必须读取既有正式 Event 投影，而不是凭空构造上下文");
  assert.match(workspace, /createStoryStudioEventReference/u);
  assert.match(workspace, /globalWorkEventRefs/u);
  assert.match(workspace, /eventRefs: globalWorkEventRefs/u, "明确发送时必须把选择的版本化 Event 引用交给 grounded context");
  assert.match(workspace, /lane === "review" \|\| hasExplicitIntakeTarget/u, "普通 Work 不得因为没有 Intake 批次报恢复错误");
  assert.match(workspace, /tianyiEnvelope/u, "精确候选入口必须带 Envelope 身份");
  assert.match(workspace, /onOpenPendingReview/u);
  assert.match(topbar, /data-panel-toggle="pending-review"/u, "目录关闭后也必须保留固定待确认入口");
  assert.match(shell, /onOpenPendingReview=\{\(\) => openPendingReview\(null\)\}/u);
  assert.match(shell, /tianyiEnvelope: target\.envelopeId/u, "导航边界不得丢失严格 Story Intake target 的第六字段");
  assert.match(pending, /getTianyiStoryIntakeRuns/u, "统一待确认必须读取同一批持久 Story Intake Envelope");
  assert.match(pending, /hasAuthoritativeStoryIntake/u);
  assert.match(pending, /proposal\.sourceWorkspace === "tianyi-story-intake"/u, "中央待确认必须和目录聚合一样排除旧兼容候选的第二确认路径");
  assert.match(pending, /onOpenStoryIntakeReview/u, "统一待确认只能定位回原批次，不得复制候选仓库");
  assert.match(pending, /打开本批审阅/u);
});

test("R4-R1 reserves 1195 canvas space for the preserved directory and checks geometry in the browser smoke", () => {
  const styles = source("apps/story-studio/src/styles/tianyan-r0-shell.css");
  const smoke = source("apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs");
  assert.match(styles, /@media \(min-width: 64\.0625rem\) and \(max-width: 76rem\)/u);
  assert.match(styles, /data-directory-visible="true"/u);
  assert.match(styles, /--directory-current: var\(--directory-width\)/u);
  assert.match(smoke, /directoryBox\.x \+ directoryBox\.width <= flowBox\.x/u);
});
