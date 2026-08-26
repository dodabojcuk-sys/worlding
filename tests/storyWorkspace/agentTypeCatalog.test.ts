import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addAgentTypeField,
  agentTypeFieldFrontmatterKey,
  createAgentType,
  deleteAgentType,
  getAgentType,
  listAgentTypes,
  listClassifiedLibraryProjection,
  listUncertainLibraryProjection,
  listWorldObjectsByAgentType,
  readAgentTypeCatalog,
  resolveAgentTypeForWorldObject,
  retireAgentType,
  retireAgentTypeField,
  updateAgentType,
  updateAgentTypeField
} from "../../src/storyWorkspace/agentTypeCatalog.ts";
import { createStoryWorkspace, createWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import { createWorkspaceFolder, readWorkspaceLayout } from "../../src/storyWorkspace/workspaceLayoutRepository.mjs";
import { createAgentRecognitionProposal } from "../../src/storyIntelligence/agentRecognitionProposalRepository.ts";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-agent-type-catalog-"));
  createStoryWorkspace({ rootPath, title: "钟楼外寻找阿岚" });
  return rootPath;
}

function note(rootPath: string, type: "character" | "item" | "location" | "faction" | "event" | "rule" | "thread", id: string, title: string, frontmatter: Record<string, unknown> = {}) {
  return createWorkspaceNote(rootPath, { id, type, title, frontmatter, body: `# ${title}\n\n` });
}

test("catalog reads as a virtual builtin projection without creating a file", () => {
  const rootPath = fixture();
  const catalogPath = path.join(rootPath, ".world-os/agent-types/catalog.json");
  assert.equal(existsSync(catalogPath), false);
  const catalog = readAgentTypeCatalog(rootPath);
  assert.equal(catalog.source, "virtual");
  assert.equal(catalog.revision, 0);
  assert.deepEqual(catalog.types.map((type) => [type.typeId, type.label]), [
    ["agent.role", "角色"],
    ["agent.item", "物品"],
    ["agent.location", "地点"],
    ["agent.organization", "组织"]
  ]);
  assert.equal(existsSync(catalogPath), false);
});

test("builtin mappings are deterministic and event/rule/thread remain uncertain", () => {
  const rootPath = fixture();
  const objects = [
    note(rootPath, "character", "character.linyuan", "林远"),
    note(rootPath, "item", "item.key", "旧钥匙"),
    note(rootPath, "location", "location.clocktower", "钟楼外侧"),
    note(rootPath, "faction", "faction.order", "守钟人组织"),
    note(rootPath, "event", "event.arrival", "抵达"),
    note(rootPath, "rule", "rule.lock", "锁门规则"),
    note(rootPath, "thread", "thread.secret", "秘密线索")
  ];
  assert.deepEqual(objects.slice(0, 4).map((object) => resolveAgentTypeForWorldObject(rootPath, object.id).typeId), [
    "agent.role", "agent.item", "agent.location", "agent.organization"
  ]);
  assert.equal(resolveAgentTypeForWorldObject(rootPath, objects[0].id).state, "classified");
  for (const object of objects.slice(4)) {
    const resolved = resolveAgentTypeForWorldObject(rootPath, object.id);
    assert.equal(resolved.state, "uncertain");
    assert.equal(resolved.typeId, null);
  }
  assert.equal(listClassifiedLibraryProjection(rootPath).directories.some((directory) => directory.label === "人物"), false);
});

test("custom type lifecycle keeps ids stable and blocks unsafe changes after binding", () => {
  const rootPath = fixture();
  const created = createAgentType(rootPath, {
    label: "宠物",
    description: "可被作者归类的陪伴角色",
    baseCapability: "role",
    status: "active",
    now: "2026-08-18T00:00:00.000Z"
  });
  const second = createAgentType(rootPath, { label: "飞船", baseCapability: "item", status: "active", expectedCatalogRevision: created.catalogRevision });
  assert.notEqual(created.type.typeId, second.type.typeId);
  assert.throws(() => createAgentType(rootPath, { label: "宠物", baseCapability: "role", expectedCatalogRevision: second.catalogRevision }), /conflicts/i);

  const renamed = updateAgentType(rootPath, {
    typeId: created.type.typeId,
    label: "伙伴",
    expectedTypeRevision: created.type.revision,
    expectedCatalogRevision: second.catalogRevision
  });
  assert.equal(renamed.type.typeId, created.type.typeId);
  assert.equal(renamed.type.label, "伙伴");

  const object = note(rootPath, "character", "character.pet", "小灰", { agentTypeId: created.type.typeId });
  assert.equal(resolveAgentTypeForWorldObject(rootPath, object.id).typeId, created.type.typeId);
  assert.throws(() => updateAgentType(rootPath, {
    typeId: created.type.typeId,
    baseCapability: "item",
    expectedTypeRevision: renamed.type.revision,
    expectedCatalogRevision: renamed.catalogRevision
  }), /immutable/i);

  const retired = retireAgentType(rootPath, {
    typeId: created.type.typeId,
    expectedTypeRevision: renamed.type.revision,
    expectedCatalogRevision: renamed.catalogRevision
  });
  assert.equal(retired.type.status, "retired");
  assert.equal(resolveAgentTypeForWorldObject(rootPath, object.id).state, "classified");
  assert.throws(() => deleteAgentType(rootPath, {
    typeId: created.type.typeId,
    expectedTypeRevision: retired.type.revision,
    expectedCatalogRevision: retired.catalogRevision
  }), /draft|delete/i);
});

test("draft types can be deleted only before an object binds them", () => {
  const rootPath = fixture();
  const draft = createAgentType(rootPath, { label: "家具", baseCapability: "item" });
  const deleted = deleteAgentType(rootPath, {
    typeId: draft.type.typeId,
    expectedTypeRevision: draft.type.revision,
    expectedCatalogRevision: draft.catalogRevision
  });
  assert.equal(deleted.deletedTypeId, draft.type.typeId);
  assert.equal(getAgentType(rootPath, draft.type.typeId), null);

  const boundDraft = createAgentType(rootPath, { label: "坐骑", baseCapability: "role", expectedCatalogRevision: deleted.catalogRevision });
  note(rootPath, "character", "character.mount", "青骢", { agentTypeId: boundDraft.type.typeId });
  assert.throws(() => deleteAgentType(rootPath, {
    typeId: boundDraft.type.typeId,
    expectedTypeRevision: boundDraft.type.revision,
    expectedCatalogRevision: boundDraft.catalogRevision
  }), /bound|retire/i);
});

test("fields are versioned, object-reference is rejected, and used fields retire without rewriting objects", () => {
  const rootPath = fixture();
  const created = createAgentType(rootPath, {
    label: "载具",
    baseCapability: "item",
    status: "active",
    fieldDefinitions: [{ label: "颜色", kind: "enum", options: ["红", "蓝"], defaultValue: "红" }]
  });
  const field = created.type.fieldDefinitions[0];
  assert.ok(field);
  assert.throws(() => createAgentType(rootPath, {
    label: "坏类型",
    baseCapability: "item",
    fieldDefinitions: [{ label: "拥有者", kind: "object-reference" as never }],
    expectedCatalogRevision: created.catalogRevision
  }), /unsupported|kind/i);
  const added = addAgentTypeField(rootPath, {
    typeId: created.type.typeId,
    field: { label: "重量", kind: "number", defaultValue: 0 },
    expectedTypeRevision: created.type.revision,
    expectedCatalogRevision: created.catalogRevision
  });
  const renamed = updateAgentTypeField(rootPath, {
    typeId: created.type.typeId,
    fieldId: field.fieldId,
    label: "涂装",
    expectedTypeRevision: added.type.revision,
    expectedCatalogRevision: added.catalogRevision
  });
  assert.equal(renamed.type.fieldDefinitions.find((candidate) => candidate.fieldId === field.fieldId)?.label, "涂装");
  const object = note(rootPath, "item", "item.vehicle", "渡船", {
    agentTypeId: created.type.typeId,
    [agentTypeFieldFrontmatterKey(field.fieldId)]: "蓝"
  });
  assert.throws(() => updateAgentType(rootPath, {
    typeId: created.type.typeId,
    fieldDefinitions: renamed.type.fieldDefinitions.filter((candidate) => candidate.fieldId !== field.fieldId),
    expectedTypeRevision: renamed.type.revision,
    expectedCatalogRevision: renamed.catalogRevision
  }), /in use|retire/i);
  const retired = retireAgentTypeField(rootPath, {
    typeId: created.type.typeId,
    fieldId: field.fieldId,
    expectedTypeRevision: renamed.type.revision,
    expectedCatalogRevision: renamed.catalogRevision
  });
  assert.equal(retired.type.fieldDefinitions.find((candidate) => candidate.fieldId === field.fieldId)?.status, "retired");
  assert.equal(resolveAgentTypeForWorldObject(rootPath, object.id).typeId, created.type.typeId);
});

test("catalog and category identities stay separate; reads do not copy objects or write state", async () => {
  const rootPath = fixture();
  const category = createWorkspaceFolder(rootPath, { title: "宠物", kind: "custom-category" });
  const type = createAgentType(rootPath, { label: "宠物", baseCapability: "role", status: "active" });
  assert.notEqual(category.folder.id, type.type.typeId);
  assert.equal(readWorkspaceLayout(rootPath).folders[0]?.kind, "custom-category");
  note(rootPath, "character", "character.linyuan", "林远");
  note(rootPath, "event", "event.one", "一次事件");
  const catalogPath = path.join(rootPath, ".world-os/agent-types/catalog.json");
  const catalogSource = readFileSync(catalogPath, "utf8");
  assert.doesNotMatch(catalogSource, /character\.linyuan|林远/);
  const statePath = path.join(rootPath, ".world-os/state.json");
  const indexPath = path.join(rootPath, ".world-os/index.json");
  const before = [readFileSync(statePath, "utf8"), readFileSync(indexPath, "utf8")];
  const classified = listClassifiedLibraryProjection(rootPath);
  assert.equal(classified.directories.find((directory) => directory.typeId === "agent.role")?.count, 1);
  assert.equal(listWorldObjectsByAgentType(rootPath, "agent.role").length, 1);
  const uncertainBefore = JSON.stringify(await listUncertainLibraryProjection(rootPath, "test"));
  const after = [readFileSync(statePath, "utf8"), readFileSync(indexPath, "utf8")];
  assert.deepEqual(after, before);
  assert.match(uncertainBefore, /event\.one|world-object/);
});

test("unknown explicit bindings and existing recognition proposals share the uncertain read projection", async () => {
  const rootPath = fixture();
  note(rootPath, "character", "character.unknown", "未知角色", { agentTypeId: "agent.custom.missing-type" });
  await createAgentRecognitionProposal({
    workspacePath: rootPath,
    proposal: {
      projectId: "test",
      storyId: "story.test",
      tianyiSessionId: "session.test",
      sourceEventId: "event.test",
      sourceReceiptId: "receipt.test",
      sourceWorkspace: "library",
      objectKind: "character",
      suggestedName: "待审核角色",
      suggestedFields: {},
      evidence: [{ sourceRef: "fixture", excerpt: "原文证据" }],
      uncertainties: ["需要作者确认类型"],
      duplicateMatches: [],
      now: "2026-08-18T00:00:00.000Z"
    }
  });
  const projection = await listUncertainLibraryProjection(rootPath, "test");
  assert.equal(projection.items.some((item) => item.kind === "world-object" && item.objectId === "character.unknown"), true);
  assert.equal(projection.items.some((item) => item.kind === "agent-recognition-proposal" && item.suggestedName === "待审核角色"), true);
});

test("stale catalog and type revisions fail closed", () => {
  const rootPath = fixture();
  const created = createAgentType(rootPath, { label: "宠物", baseCapability: "role" });
  assert.throws(() => createAgentType(rootPath, { label: "坐骑", baseCapability: "role", expectedCatalogRevision: 0 }), /stale|revision/i);
  assert.throws(() => updateAgentType(rootPath, { typeId: created.type.typeId, label: "伙伴", expectedTypeRevision: 99, expectedCatalogRevision: created.catalogRevision }), /stale|revision/i);
});

test("catalog parser is strict and writes are atomic", () => {
  const rootPath = fixture();
  const created = createAgentType(rootPath, { label: "宠物", baseCapability: "role" });
  const catalogPath = path.join(rootPath, ".world-os/agent-types/catalog.json");
  const valid = readFileSync(catalogPath, "utf8");
  assert.ok(valid.endsWith("\n"));
  assert.equal(readdirSync(path.dirname(catalogPath)).some((name) => name.includes("agent-type-tmp")), false);
  writeFileSync(catalogPath, JSON.stringify({ version: "story-agent-type-catalog/v999", revision: created.catalogRevision, types: [] }));
  assert.throws(() => readAgentTypeCatalog(rootPath), /version/i);
  writeFileSync(catalogPath, JSON.stringify({ version: "story-agent-type-catalog/v1", revision: created.catalogRevision, types: [{ ...created.type, builtin: false, unexpected: true }] }));
  assert.throws(() => readAgentTypeCatalog(rootPath), /unknown|field/i);
});
