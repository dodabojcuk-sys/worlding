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
