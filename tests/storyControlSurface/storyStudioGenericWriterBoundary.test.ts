import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { eventWorkspaceProjectionSummaries } from "../../apps/story-studio/src/components/eventLineCommittedEvents.ts";

test("generic create and update cannot manufacture planning or Canon identity", () => {
  const fixture = createFixture("ordinary");
  try {
    assert.throws(() => fixture.workspace.createGenericWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "伪造确认",
      status: "committed",
      tags: ["作者确认"]
    }), /作者确认|Author Control/);

    const ordinary = fixture.workspace.createGenericWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "普通事件",
      status: "active",
      tags: ["线索"]
    });
    assert.throws(() => fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: ordinary.id,
      expectedHash: ordinary.revisionToken,
      title: ordinary.title,
      status: "committed",
      tags: ["线索", "作者确认"],
      aliases: ordinary.aliases,
      body: ordinary.body,
      card: ordinary.card
    }), /作者确认|Author Control/);
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: ordinary.id }).status, "active");

    const ordinarySaved = fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: ordinary.id,
      expectedHash: ordinary.revisionToken,
      title: ordinary.title,
      status: "active",
      tags: ["线索", "普通元数据"],
      aliases: ordinary.aliases,
      body: `${ordinary.body}\n普通事件仍可编辑。\n`,
      card: ordinary.card
    });
    assert.equal(ordinarySaved.conflict, false);
    assert.deepEqual(ordinarySaved.object.tags, ["线索", "普通元数据"]);

    const nonEvent = fixture.workspace.createGenericWorldObject({
      projectId: fixture.projectId,
      type: "character",
      title: "状态词属于普通元数据的人物",
      status: "committed",
      tags: ["作者确认"]
    });
    assert.equal(nonEvent.status, "committed");
    assert.deepEqual(nonEvent.tags, ["作者确认"]);

    const legacyClaim = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "旧确认外观记录",
      status: "committed",
      tags: ["作者确认"]
    });
    assert.throws(() => fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: legacyClaim.id,
      expectedHash: legacyClaim.revisionToken,
      title: legacyClaim.title,
      status: legacyClaim.status,
      tags: legacyClaim.tags,
      aliases: legacyClaim.aliases,
      body: `${legacyClaim.body}\n不能保留伪确认身份继续保存。\n`,
      card: legacyClaim.card
    }), /通用卡片不能写入规划或作者确认身份/);
    const demoted = fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: legacyClaim.id,
      expectedHash: legacyClaim.revisionToken,
      title: legacyClaim.title,
      status: "active",
      tags: ["历史导入"],
      aliases: legacyClaim.aliases,
      body: `${legacyClaim.body}\n已安全降级。\n`,
      card: legacyClaim.card
    });
    assert.equal(demoted.conflict, false);
    assert.equal(demoted.object.status, "active");
    assert.deepEqual(demoted.object.tags, ["历史导入"]);
  } finally {
    fixture.cleanup();
  }
});

test("an author may persist an ordinary event draft without entering Canon", () => {
  const fixture = createFixture("author-draft-event");
  try {
    const draft = fixture.workspace.createGenericWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "作者先记下的事件",
      status: "draft",
      tags: ["作者草稿", "地点：旧仓库"],
      body: "# 作者先记下的事件\n\n这只是草稿。\n"
    });
    assert.equal(draft.status, "draft");
    assert.equal(draft.tags.includes("作者确认"), false);
    assert.deepEqual(fixture.authorControl.listVerifiedCanonEventIds({ projectId: fixture.projectId }), []);
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: draft.id }).body.includes("这只是草稿。"), true);
  } finally {
    fixture.cleanup();
  }
});

test("the unified Event projection includes author drafts but leaves planning records in review", () => {
  const fixture = createFixture("projection-boundary");
  try {
    const draft = fixture.workspace.createGenericWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "作者事件草稿",
      status: "draft",
      tags: ["作者草稿"]
    });
    fixture.workspace.createPlanningEvent({
      projectId: fixture.projectId,
      title: "规划中的事件",
      tags: ["待作者审查"]
    });
    const projected = eventWorkspaceProjectionSummaries(
      fixture.workspace.listWorldObjects({ projectId: fixture.projectId }),
      fixture.authorControl.listVerifiedCanonEventIds({ projectId: fixture.projectId })
    );
    assert.deepEqual(projected.map((event) => event.id), [draft.id]);
  } finally {
    fixture.cleanup();
  }
});

test("generic Full Card preserves authority fields while retaining ordinary event metadata edits", () => {
  const fixture = createFixture("protected");
  try {
    const planning = fixture.workspace.createPlanningEvent({ projectId: fixture.projectId, title: "受保护事件" });
    const review = fixture.authorControl.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: planning.id });
    fixture.authorControl.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
    const changeSet = fixture.authorControl.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });
    fixture.authorControl.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
    const canon = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" })
      .map((event) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }))
      .find((event) => event.properties.source_change_set_id === changeSet.id)!;
    assert.ok(canon);

    const base = {
      projectId: fixture.projectId,
      objectId: canon.id,
      expectedHash: canon.revisionToken,
      title: canon.title,
      status: canon.status,
      tags: canon.tags,
      aliases: canon.aliases,
      body: canon.body,
      card: canon.card
    };
    assert.throws(() => fixture.workspace.updateWorldObject({ ...base, status: "active" }), /权威字段|作者确认/);
    assert.throws(() => fixture.workspace.updateWorldObject({ ...base, tags: ["普通标签"] }), /权威字段|作者确认/);

    const saved = fixture.workspace.updateWorldObject({
      ...base,
      tags: [...canon.tags, "普通标签"],
      aliases: ["作者补充别名"],
      body: `${canon.body}\n作者补充说明。\n`
    });
    assert.equal(saved.conflict, false);
    assert.equal(saved.object.tags.includes("作者确认"), true);
    assert.equal(saved.object.tags.includes("普通标签"), true);
    assert.equal(saved.object.properties.source_change_set_id, changeSet.id);
    assert.deepEqual(fixture.authorControl.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [canon.id]);
  } finally {
    fixture.cleanup();
  }
});

function createFixture(name: string) {
  const root = mkdtempSync(path.join(tmpdir(), `story-studio-generic-writer-${name}-`));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "mist-lighthouse";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: projectId });
  return { root, rootPath, stateFilePath, projectId, workspace, authorControl, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
