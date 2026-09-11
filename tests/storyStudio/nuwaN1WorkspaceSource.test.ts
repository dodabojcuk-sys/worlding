import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("Nuwa N1 mounts a bounded author rehearsal surface at the real Nuwa workspace", () => {
  const outlet = source("apps/story-studio/src/product-shell/workspace/ShellWorkspaceOutlet.tsx");
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  const styles = source("apps/story-studio/src/styles/nuwa-n1.css");

  assert.match(outlet, /props\.destination\.id === "nuwa"/u);
  assert.match(outlet, /<NuwaN1Workspace runtime=\{props\.runtime\}/u);
  assert.match(workspace, /选择 2–3 位正式角色/u);
  assert.match(workspace, /本地工程演练 · 0 Provider/u);
  assert.match(workspace, /上下文检查器/u);
  assert.match(workspace, /送入待确认/u);
  assert.match(workspace, /加入后续步骤/u);
  assert.match(workspace, /开始第一步/u, "a newly-created ready Run has a reachable first transition");
  assert.match(workspace, /新建排演/u, "a terminal Run can be preserved while the author starts another selected-range rehearsal");
  assert.match(workspace, /disabled=\{interrupting\}[^>]*onClick=\{\(\) => runAction\("stop"\)\}/u, "stop remains reachable while a long step request is busy");
  assert.match(workspace, /技术详情/u, "稳定 Run identity only appears in progressive disclosure");
  assert.match(workspace, /props\.runtime\.withConnection/u);
  assert.doesNotMatch(workspace, /fetch\(|Provider Gateway|apiKey|Authorization/u);
  assert.match(transport, /\/nuwa-n1\/bootstrap/u);
  assert.match(transport, /\/nuwa-n1\/latest/u);
  assert.match(transport, /\/nuwa-n1\/read/u, "a Relation receipt can return to the exact originating Run");
  assert.match(transport, /\/nuwa-n1\/candidate/u);
  assert.match(transport, /operationId: string/u, "mutating Nuwa operations carry an idempotency identity");
  assert.match(transport, /selectedStepIds/u, "candidate handoff is limited to author-selected results");
  assert.match(transport, /providerCalls: 0/u);
  assert.match(styles, /\.nuwa-n1-composer \{ position: sticky/u);
  assert.match(styles, /@media \(max-width: 84rem\)/u);
});

test("MULTI-B1 lets an author bind a Nuwa Run to an explicit active IF version", () => {
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  const server = source("apps/story-studio/server/server.mjs");
  const runtime = source("src/storyIntelligence/nuwaN1Runtime.ts");

  assert.match(workspace, /作品版本/u);
  assert.match(workspace, /getMultiverseWorkVersions/u);
  assert.match(workspace, /version\.identity\.kind === "root" \|\| version\.identity\.kind === "derived"/u, "synthetic unversioned records never cross the strict WorkVersion boundary");
  assert.match(workspace, /尚未建立正式版本 · 仅候选排演/u, "a candidate-only project keeps the version request null instead of inventing a formal version");
  assert.match(workspace, /workVersionId: workVersionId \|\| null/u);
  assert.match(transport, /workVersionId\?: string \| null/u);
  assert.match(server, /"workVersionId"/u);
  assert.match(server, /resolveWorkVersion\(projectId, requestedWorkVersionId\)/u);
  assert.match(source("apps/story-studio/server/nuwaN1Port.mjs"), /const ownerWorkVersionId = \["root", "derived"\]\.includes\(sourceIdentity\?\.kind\)/u, "candidate-only RunPack identity is normalized before formal Owner reads");
  assert.match(source("apps/story-studio/server/nuwaN1Port.mjs"), /listRelations\(\{ projectId, workVersionId: ownerWorkVersionId, reviewState: "confirmed" \}\)/u, "role context reads Relation Owner through the selected version scope");
  assert.match(runtime, /"root" \| "derived" \| "unversioned-draft"/u);
  assert.match(source("apps/story-studio/server/nuwaN1Port.mjs"), /正式 Event\/Relation 仍未具备版本作用域/u, "derived automatic apply must fail closed until those Owners are version-scoped");
});

test("Nuwa N1 follow-up derives completion copy from returned state and revalidates durable authorization", () => {
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");
  const port = source("apps/story-studio/server/nuwaN1Port.mjs");

  assert.match(workspace, /next\.run\?\.status !== "completed"/u);
  assert.match(workspace, /next\.automaticApplication\?\.status === "applied"/u);
  assert.match(port, /authorizationExpired/u);
  assert.match(port, /expiresAt <= Date\.parse\(now\(\)\)/u);
  assert.doesNotMatch(port, /decisionSource: "nuwa-scope-rollback"/u);
  assert.match(port, /rollbackTag = `nuwa-auto-rollback:/u);
});

test("Nuwa N1 discards operation completions after the active project scope changes", () => {
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");

  assert.match(workspace, /const projectIdRef = useRef\(projectId\)/u);
  assert.match(workspace, /operationGeneration\.current \+= 1/u);
  assert.match(workspace, /if \(!isCurrentOperation\(scope\)\) return/u);
  assert.match(workspace, /if \(isCurrentOperation\(scope\)\) setBusy\(false\)/u);
});

test("Nuwa N1 keeps a role handoff queued until the author starts a new run", () => {
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");

  assert.match(workspace, /const \[queuedParticipantId, setQueuedParticipantId\]/u);
  assert.match(workspace, /const queuedParticipant = latest\.run \? requestedParticipant : null/u);
  assert.match(workspace, /setParticipantIds\(\[queuedParticipantId\]\)/u);
  assert.match(workspace, /window\.sessionStorage\.removeItem\(`tianyan-nuwa-n1-preselect:/u, "the one-shot handoff is consumed only after it is applied to a setup");
});

test("Nuwa N2A exposes author-owned character basis and per-character scene goals without a second profile store", () => {
  const editor = source("apps/story-studio/src/product-shell/project-directory/character/CharacterProfileEditor.tsx");
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");
  const runtime = source("src/storyIntelligence/nuwaN1Runtime.ts");
  const adapter = source("apps/story-studio/server/nuwaN1PiAdapter.mjs");

  assert.match(editor, /profile: characterProfileWithAuthorBasis\(object\.profile/u, "the existing WorldObject update remains the only character-profile write");
  assert.match(editor, /character_core/u);
  assert.match(editor, /boundaries/u);
  assert.match(workspace, /逐角色本场目标/u);
  assert.match(workspace, /participantIds\.every\(\(id\) => Boolean\(participantGoals\[id\]\?\.trim\(\)\)\)/u);
  assert.match(runtime, /profileBasis: structuredClone\(canonicalActor\.profileBasis\)/u, "the frozen Run actor is the role-context source");
  assert.match(adapter, /profileBasis: context\.profileBasis/u, "the inspected basis crosses the actual Provider tool boundary");
  assert.doesNotMatch(adapter, /private_notes|profile\.fields/u, "the adapter cannot inspect unrelated author profile fields");
});

test("Nuwa N2B keeps attention permission-first, deterministic and visible at the actual tool boundary", () => {
  const attention = source("src/storyIntelligence/nuwaN1Attention.ts");
  const runtime = source("src/storyIntelligence/nuwaN1Runtime.ts");
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");
  const adapter = source("apps/story-studio/server/nuwaN1PiAdapter.mjs");

  assert.match(attention, /already-authorized role source set/u);
  assert.match(attention, /current-scene-required/u);
  assert.match(runtime, /required attention sources exceed budget before dispatch/u);
  assert.match(runtime, /excludedKnowledgeCount: canonicalActor\.unknownFactIds\.length/u);
  assert.match(adapter, /attention: context\.attention/u);
  assert.match(workspace, /UTF-8 保守估算/u);
  assert.match(workspace, /权限排除（身份隐藏）/u);
});

test("Nuwa N2C shows cross-scene heard provenance without making the RunPack its permanent owner", () => {
  const continuity = source("src/storyContinuity/characterMemoryRepository.ts");
  const runtime = source("src/storyIntelligence/nuwaN1Runtime.ts");
  const port = source("apps/story-studio/server/nuwaN1Port.mjs");
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");

  assert.match(continuity, /epistemicState: "heard"/u);
  assert.match(continuity, /sourceScene/u);
  assert.match(continuity, /sourceIdentity/u);
  assert.match(continuity, /invalidateCharacterMemoriesByRun/u);
  assert.match(port, /synchronizeCharacterHeardMemories/u);
  assert.match(port, /listRecallableCharacterMemories/u);
  assert.match(runtime, /fact\.memorySource/u, "the Run keeps only a frozen recall projection");
  assert.match(workspace, /听闻 · 与正式关系、已确认事实分开/u);
  assert.match(workspace, /当前有效/u);
});

test("Nuwa N3A keeps author content primary while preserving exact permission and receipt boundaries", () => {
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");

  assert.match(workspace, /本轮上下文预览/u);
  assert.match(workspace, /本步骤使用的依据/u);
  assert.match(workspace, /假服务用于验证数据流；真实 Provider 0 次/u);
  assert.match(workspace, /已授权自动应用/u);
  assert.match(workspace, /普通候选/u);
  assert.match(workspace, /发生的结果/u);
  assert.match(workspace, /查看本步骤依据与执行详情/u);
  assert.match(workspace, /不是实际计费 token/u);
  assert.match(workspace, /本次排演方式/u);
  assert.match(workspace, /本批未配置合法关系类型，没有补造关系/u);
  assert.match(workspace, /查看并下载固定稿/u);
  assert.match(workspace, /事件线/u);
  assert.match(workspace, /从单元开始/u);
  assert.match(workspace, /持续推演（N1 预算内）/u);
  assert.match(workspace, /新建排演/u);
  assert.match(workspace, /nuwaRunId=\$\{encodeURIComponent\(run\.run\.runId\)\}/u, "the relation handoff preserves the exact Nuwa Run identity");
});
