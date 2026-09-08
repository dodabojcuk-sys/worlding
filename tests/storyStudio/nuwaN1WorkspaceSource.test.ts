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
  assert.match(workspace, /新建排演/u, "a terminal Run can be preserved while the author starts another bounded rehearsal");
  assert.match(workspace, /disabled=\{interrupting\}[^>]*onClick=\{\(\) => runAction\("stop"\)\}/u, "stop remains reachable while a long step request is busy");
  assert.match(workspace, /技术详情/u, "稳定 Run identity only appears in progressive disclosure");
  assert.match(workspace, /props\.runtime\.withConnection/u);
  assert.doesNotMatch(workspace, /fetch\(|Provider Gateway|apiKey|Authorization/u);
  assert.match(transport, /\/nuwa-n1\/bootstrap/u);
  assert.match(transport, /\/nuwa-n1\/latest/u);
  assert.match(transport, /\/nuwa-n1\/candidate/u);
  assert.match(transport, /operationId: string/u, "mutating Nuwa operations carry an idempotency identity");
  assert.match(transport, /selectedStepIds/u, "candidate handoff is limited to author-selected results");
  assert.match(transport, /providerCalls: 0/u);
  assert.match(styles, /\.nuwa-n1-composer \{ position: sticky/u);
  assert.match(styles, /@media \(max-width: 84rem\)/u);
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
