import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createNormalEventCreationPort } from "../../apps/story-studio/server/normalEventCreationPort.mjs";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioCanonReadProjection } from "../../src/storyControlSurface/storyStudioCanonReadProjection.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("ordinary project reaches one author-confirmed Event and a recoverable root-bound artifact without Fixture or Nuwa", async () => {
  const value = fixture("complete");
  try {
    assert.equal(value.normal.state(value.projectId).storyUnits.length, 0);

    const storyUnit = value.normal.createStoryUnit(value.projectId, { title: "雨夜的守夜记录" });
    const candidate = value.normal.createCandidate(value.projectId, {
      storyUnitId: storyUnit.id,
      title: "旧名线索被保留",
      body: "沈砚决定保留旧名线索，并在天亮前核对守夜记录。"
    });
    assert.equal(value.workspace.listWorldObjects({ projectId: value.projectId, type: "event" }).filter((item) => item.status === "committed").length, 0);
    assert.equal(candidate.planning.tags.includes("普通事件线"), true);

    value.normal.beginImpact(value.projectId, { planningEventId: candidate.planning.id });
    const firstConfirmation = value.normal.confirm(value.projectId, { planningEventId: candidate.planning.id });
    const replayedConfirmation = value.normal.confirm(value.projectId, { planningEventId: candidate.planning.id });
    assert.equal(firstConfirmation.state.confirmedEvents.length, 1);
    assert.equal(replayedConfirmation.state.confirmedEvents.length, 1);
    assert.equal(value.workspace.listWorldObjects({ projectId: value.projectId, type: "event" }).filter((item) => item.status === "committed").length, 1);
    assert.equal(value.normal.state(value.projectId).candidate?.status, "accepted");
    assert.deepEqual(value.projection.listVerifiedCanonEvents({ projectId: value.projectId }).status, "ready");
    const linkedUnit = value.workspace.listStoryUnits({ projectId: value.projectId }).find((unit) => unit.id === storyUnit.id);
    assert.deepEqual(linkedUnit?.linkedEntityIds, [firstConfirmation.state.confirmedEvents[0].id], "The formal Unit owner must link the confirmed Event identity instead of relying on an Event tag.");

    value.creation.createRoot(value.projectId);
    const artifact = await value.creation.createArtifact(value.projectId, {
      storyUnitId: storyUnit.id,
      eventIds: [firstConfirmation.state.confirmedEvents[0].id]
    });
    const saved = value.creation.saveArtifact(value.projectId, "雨声停在窗沿，沈砚把守夜记录压在灯下。");
    const current = await value.creation.read(value.projectId, {
      storyUnitId: storyUnit.id,
      eventIds: [firstConfirmation.state.confirmedEvents[0].id]
    });
    assert.equal(artifact.id, saved.id);
    assert.equal(current.root?.revision, 2);
    assert.equal(current.artifact?.id, artifact.id);
    assert.equal(current.derivedVersionCount, 0);

    const restarted = restartedPorts(value);
    const recovered = await restarted.creation.read(value.projectId, {
      storyUnitId: storyUnit.id,
      eventIds: [firstConfirmation.state.confirmedEvents[0].id]
    });
    assert.equal(recovered.root?.revision, 2);
    assert.equal(recovered.artifact?.id, artifact.id);
    assert.equal(recovered.artifact?.currentRevisionId, saved.currentRevisionId);
    assert.equal(restarted.normal.state(value.projectId).confirmedEvents.length, 1);
  } finally {
    value.cleanup();
  }
});

test("ordinary Event rejection records a candidate decision but writes no confirmed Event", () => {
  const value = fixture("reject");
  try {
    const storyUnit = value.normal.createStoryUnit(value.projectId);
    const candidate = value.normal.createCandidate(value.projectId, {
      storyUnitId: storyUnit.id,
      title: "未采纳的转折",
      body: "作者决定不让这条候选进入当前故事事实。"
    });
    const rejected = value.normal.reject(value.projectId, { planningEventId: candidate.planning.id });
    assert.equal(rejected.candidate?.status, "rejected");
    assert.equal(rejected.confirmedEvents.length, 0);
    assert.equal(value.workspace.listWorldObjects({ projectId: value.projectId, type: "event" }).filter((item) => item.status === "committed").length, 0);
  } finally {
    value.cleanup();
  }
});

function fixture(name: string) {
  const root = mkdtempSync(path.join(tmpdir(), `normal-project-world-event-${name}-`));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = `normal-project-${name}`;
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  workspace.createProject({ title: "普通项目事件创作闭环", folderSlug: projectId });
  const projection = createStoryStudioCanonReadProjection({ workspace, authorControl });
  return {
    root,
    rootPath,
    stateFilePath,
    projectId,
    workspace,
    authorControl,
    projection,
    normal: createNormalEventCreationPort({ operations: workspace, authorControl }),
    creation: createCreationSourceSelectionPort({ operations: workspace, canonReadProjection: projection }),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function restartedPorts(value: ReturnType<typeof fixture>) {
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
  const projection = createStoryStudioCanonReadProjection({ workspace, authorControl });
  return {
    normal: createNormalEventCreationPort({ operations: workspace, authorControl }),
    creation: createCreationSourceSelectionPort({ operations: workspace, canonReadProjection: projection })
  };
}
