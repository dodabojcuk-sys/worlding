import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { agentTypeFieldFrontmatterKey } from "../../src/storyWorkspace/agentTypeCatalog.ts";

function fixture(name: string) {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), `story-agent-type-authoring-${name}-`));
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".studio-state.json") });
  const project = operations.createProject({ title: "钟楼外寻找阿岚", folderSlug: "clocktower" });
  return { rootPath, projectPath: path.join(rootPath, project.id), projectId: project.id, operations };
}

test("author-created types stay draft until an explicit activation and keep a stable type id", () => {
  const input = fixture("lifecycle");
  const created = input.operations.createAgentType({ projectId: input.projectId, label: "旅伴", baseCapability: "role", expectedCatalogRevision: 0 });
  assert.equal(created.type.status, "draft");
  const activated = input.operations.activateAgentType({ projectId: input.projectId, typeId: created.type.typeId, expectedTypeRevision: created.type.revision, expectedCatalogRevision: created.catalogRevision });
  assert.equal(activated.type.status, "active");
  const renamed = input.operations.updateAgentType({ projectId: input.projectId, typeId: created.type.typeId, label: "同行者", expectedTypeRevision: activated.type.revision, expectedCatalogRevision: activated.catalogRevision });
  assert.equal(renamed.type.typeId, created.type.typeId);
  assert.equal(renamed.type.label, "同行者");
  assert.throws(() => input.operations.updateAgentType({ projectId: input.projectId, typeId: created.type.typeId, label: "过期覆盖", expectedTypeRevision: activated.type.revision, expectedCatalogRevision: activated.catalogRevision }), /stale|revision/i);
});

test("unused drafts delete, while bound active types only retire and keep existing objects readable", () => {
  const input = fixture("guards");
  const unused = input.operations.createAgentType({ projectId: input.projectId, label: "草稿类型", baseCapability: "item", expectedCatalogRevision: 0 });
  input.operations.deleteAgentType({ projectId: input.projectId, typeId: unused.type.typeId, expectedTypeRevision: unused.type.revision, expectedCatalogRevision: unused.catalogRevision });
  const draft = input.operations.createAgentType({ projectId: input.projectId, label: "关键道具", baseCapability: "item", expectedCatalogRevision: 2 });
  const active = input.operations.activateAgentType({ projectId: input.projectId, typeId: draft.type.typeId, expectedTypeRevision: draft.type.revision, expectedCatalogRevision: draft.catalogRevision });
  const object = input.operations.createWorldObject({ projectId: input.projectId, type: "item", title: "旧钥匙", agentTypeId: active.type.typeId });
  assert.throws(() => input.operations.deleteAgentType({ projectId: input.projectId, typeId: active.type.typeId, expectedTypeRevision: active.type.revision, expectedCatalogRevision: active.catalogRevision }), /draft|delete|bound/i);
  const retired = input.operations.retireAgentType({ projectId: input.projectId, typeId: active.type.typeId, expectedTypeRevision: active.type.revision, expectedCatalogRevision: active.catalogRevision });
  assert.equal(retired.type.status, "retired");
  assert.equal(input.operations.readWorldObject({ projectId: input.projectId, objectId: object.id }).agentTypeId, active.type.typeId);
});

test("explicit binding and custom field values live only in WorldObject frontmatter", () => {
  const input = fixture("binding");
  const draft = input.operations.createAgentType({
    projectId: input.projectId,
    label: "调查员",
    baseCapability: "role",
    expectedCatalogRevision: 0,
    fieldDefinitions: [
      { fieldId: "field.custom.rank", label: "阶位", kind: "enum", description: "", required: true, defaultValue: null, status: "active", displayOrder: 0, options: ["见习", "正式"] },
      { fieldId: "field.custom.note", label: "备注", kind: "text", description: "", required: false, defaultValue: "未确认", status: "active", displayOrder: 1 }
    ]
  });
  const active = input.operations.activateAgentType({ projectId: input.projectId, typeId: draft.type.typeId, expectedTypeRevision: draft.type.revision, expectedCatalogRevision: draft.catalogRevision });
  assert.throws(() => input.operations.createWorldObject({ projectId: input.projectId, type: "character", title: "缺少字段", agentTypeId: active.type.typeId }), /required|阶位/i);
  const object = input.operations.createWorldObject({ projectId: input.projectId, type: "character", title: "林远", agentTypeId: active.type.typeId, agentTypeFieldValues: { "field.custom.rank": "见习" } });
  const sourcePath = path.join(input.projectPath, object.relativeId);
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, new RegExp(`agentTypeId: ${active.type.typeId.replaceAll(".", "\\.")}`));
  assert.match(source, /agent_field_field_custom_rank: 见习/);
  assert.doesNotMatch(source, /agent_field_field_custom_note/);
  const catalogSource = readFileSync(path.join(input.projectPath, ".world-os/agent-types/catalog.json"), "utf8");
  assert.doesNotMatch(catalogSource, /character\.linyuan|林远/);
  const layoutPath = path.join(input.projectPath, "documents/workspace/library.workspace.json");
  const layoutSource = existsSync(layoutPath) ? readFileSync(layoutPath, "utf8") : "";
  assert.doesNotMatch(layoutSource, new RegExp(active.type.typeId.replaceAll(".", "\\.")));
});

test("binding is capability-safe, expected-hash guarded, and unbinding preserves field values", () => {
  const input = fixture("revision");
  const itemDraft = input.operations.createAgentType({ projectId: input.projectId, label: "载具", baseCapability: "item", expectedCatalogRevision: 0, fieldDefinitions: [{ fieldId: "field.custom.color", label: "颜色", kind: "text", description: "", required: false, defaultValue: null, status: "active", displayOrder: 0 }] });
  const itemType = input.operations.activateAgentType({ projectId: input.projectId, typeId: itemDraft.type.typeId, expectedTypeRevision: itemDraft.type.revision, expectedCatalogRevision: itemDraft.catalogRevision });
  const character = input.operations.createWorldObject({ projectId: input.projectId, type: "character", title: "阿岚" });
  assert.throws(() => input.operations.updateWorldObjectAgentType({ projectId: input.projectId, objectId: character.id, expectedHash: character.revisionToken, agentTypeId: itemType.type.typeId }), /incompatible/i);
  const item = input.operations.createWorldObject({ projectId: input.projectId, type: "item", title: "渡船" });
  const bound = input.operations.updateWorldObjectAgentType({ projectId: input.projectId, objectId: item.id, expectedHash: item.revisionToken, agentTypeId: itemType.type.typeId, agentTypeFieldValues: { "field.custom.color": "蓝" } });
  assert.equal(bound.conflict, false);
  const stale = input.operations.updateWorldObjectAgentType({ projectId: input.projectId, objectId: item.id, expectedHash: item.revisionToken, agentTypeId: null });
  assert.equal(stale.conflict, true);
  const unbound = input.operations.updateWorldObjectAgentType({ projectId: input.projectId, objectId: item.id, expectedHash: bound.object.revisionToken, agentTypeId: null });
  assert.equal(unbound.object.agentTypeId, null);
  assert.equal(unbound.object.agentTypeFieldValues[agentTypeFieldFrontmatterKey("field.custom.color")], "蓝");
});

test("event rule and thread cannot be mapped into the four Agent capabilities", () => {
  const input = fixture("non-agent");
  const draft = input.operations.createAgentType({ projectId: input.projectId, label: "任务角色", baseCapability: "role", expectedCatalogRevision: 0 });
  const type = input.operations.activateAgentType({ projectId: input.projectId, typeId: draft.type.typeId, expectedTypeRevision: draft.type.revision, expectedCatalogRevision: draft.catalogRevision });
  for (const sourceType of ["event", "rule", "thread"] as const) {
    assert.throws(() => input.operations.createWorldObject({ projectId: input.projectId, type: sourceType, title: sourceType, agentTypeId: type.type.typeId }), /incompatible/i);
  }
  assert.equal(input.operations.listWorldObjects({ projectId: input.projectId }).length, 0);
});

test("custom-type creation produces exactly one WorldObject and no second object owner", () => {
  const input = fixture("single-owner");
  const draft = input.operations.createAgentType({ projectId: input.projectId, label: "地点分区", baseCapability: "location", expectedCatalogRevision: 0 });
  const active = input.operations.activateAgentType({ projectId: input.projectId, typeId: draft.type.typeId, expectedTypeRevision: draft.type.revision, expectedCatalogRevision: draft.catalogRevision });
  const created = input.operations.createWorldObject({ projectId: input.projectId, type: "location", title: "钟楼外侧", agentTypeId: active.type.typeId });
  assert.equal(input.operations.listWorldObjects({ projectId: input.projectId }).length, 1);
  assert.equal(input.operations.listWorldObjectsByAgentType({ projectId: input.projectId, typeId: active.type.typeId }).map((item) => item.objectId).join(), created.id);
  assert.equal(readdirSync(path.join(input.projectPath, "world", "locations")).filter((entry) => entry.endsWith(".md")).length, 1);
});
