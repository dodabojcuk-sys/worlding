import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("Library uses one author-facing type resolver and one current navigation marker", () => {
  const catalog = source("apps/story-studio/src/worldObjectCatalog.ts");
  const app = source("apps/story-studio/src/App.tsx");
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  assert.match(catalog, /character", label: "角色"/);
  assert.match(catalog, /faction", label: "组织"/);
  assert.match(catalog, /thread", label: "线索"/);
  assert.match(catalog, /authorFacingObjectTypeLabel/);
  assert.match(catalog, /authorFacingObjectTags/);
  assert.match(catalog, /!== "fixture"/);
  assert.match(app, /authorFacingObjectTypeLabel\(\{ sourceType: object\.type/);
  assert.match(rail, /data-library-current=/);
  assert.match(rail, /active=\{!props\.home && !props\.searchQuery/);
  assert.doesNotMatch(rail, /props\.tab === "classified" \? "is-active"/);
});

test("custom type management is a stable Library URL state backed by Catalog operations", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const management = source("apps/story-studio/src/components/AgentTypeManagementWorkbench.tsx");
  const server = source("apps/story-studio/server/server.mjs");
  assert.match(app, /rawDirectory === "agent-types"/);
  assert.match(app, /libraryDirectory === "agent-types"/);
  assert.match(app, /expectedCatalogRevision: agentTypeCatalogRevision/);
  assert.match(management, /新建类型/);
  assert.match(management, /保存草稿/);
  assert.match(management, /启用类型/);
  assert.match(management, /停用类型/);
  assert.match(management, /上移/);
  assert.match(management, /下移/);
  assert.doesNotMatch(management, /object-reference|对象引用/);
  assert.match(server, /agent-types\/activate/);
});

test("WorldObject binding uses expected hash and never creates a second map or field store", () => {
  const operations = source("src/storyControlSurface/storyStudioWorkspaceOperations.ts");
  const binding = source("apps/story-studio/src/components/AgentTypeObjectBinding.tsx");
  assert.match(operations, /updateWorldObjectAgentType/);
  assert.match(operations, /expectedContentHash: requireText\(objectInput\.expectedHash/);
  assert.match(operations, /agentTypeId: type\.typeId/);
  assert.match(operations, /agentTypeFieldFrontmatterKey\(fieldId\)/);
  assert.match(binding, /使用内置类型/);
  assert.match(binding, /待填写/);
  assert.match(binding, /来源与技术详情/);
  assert.doesNotMatch(operations, /objectTypeMap|agentTypeBindings\.json|customFieldValues\.json/);
});

test("custom type creation reuses the existing WorldObject creator with explicit binding", () => {
  const dialog = source("apps/story-studio/src/components/NewObjectDialog.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(dialog, /自定义资料类型/);
  assert.match(dialog, /默认值仅作建议/);
  assert.match(app, /createWorldObject\(\{ projectId: library\.project\.id, type: newObjectType, title: newObjectTitle\.trim\(\), agentTypeId:/);
  assert.match(app, /createCharacterCard\(\{/);
  assert.match(app, /agentTypeFieldValues: agentTypeInput\.fieldValues/);
});

test("responsive Library contract avoids the 1024 five-column squeeze and floating Context overlap", () => {
  const css = source("apps/story-studio/src/styles/app.css");
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(css, /@media \(min-width: 821px\) and \(max-width: 1120px\)/);
  assert.match(css, /\.library-home-organize-grid \{ display: grid; grid-template-columns: repeat\(3/);
  assert.match(css, /library-home-organize-button strong[\s\S]*white-space: normal/);
  assert.match(app, /hasContextSidebar && productMode !== "library"/);
  assert.match(css, /library-rail-scroll \{ padding-bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\)/);
});

test("Library object deep link is established before the detail state is mounted", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const routeWrite = app.indexOf("writeLibraryRouteState({ tab: libraryTab, directory: libraryDirectory, query: searchQuery, objectId: object.id }, routeMode)");
  const detailMount = app.indexOf("applyObject(opened)", routeWrite);
  assert.ok(routeWrite >= 0 && detailMount > routeWrite, "The route synchronizer must not clear a newly opened object before its URL identity exists.");
});
