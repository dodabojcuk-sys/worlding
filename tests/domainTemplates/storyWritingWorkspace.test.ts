import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { createStoryAuthorIntent } from "../../src/domainTemplates/storyWorld/intent/index.ts";
import { analyzeStoryImpactReport } from "../../src/domainTemplates/storyWorld/analysis/index.ts";
import {
  createStoryDecisionWorkspace,
  resolveAuthorDecision,
  type StoryCommitCandidate
} from "../../src/domainTemplates/storyWorld/decision/index.ts";
import { commitStoryEvent } from "../../src/domainTemplates/storyWorld/commit/index.ts";
import {
  planStoryScene,
  reviewStoryScenePlan,
  type StoryScenePlan
} from "../../src/domainTemplates/storyWorld/scene/index.ts";
import {
  createChapterDraftRequest,
  createStoryWritingWorkspace,
  validateStoryWritingChange,
  validateStoryWritingWorkspace
} from "../../src/domainTemplates/storyWorld/writing/index.ts";

test("StoryWritingWorkspace starts from accepted scene plans and exposes author working state", () => {
  const { project, acceptedScene } = createAcceptedScene();
  const workspaceA = createStoryWritingWorkspace(project, [acceptedScene]);
  const workspaceB = createStoryWritingWorkspace(project, [acceptedScene]);

  assert.deepEqual(workspaceA, workspaceB);
  assert.equal(workspaceA.version, "world-os-story-writing-workspace-v1");
  assert.equal(workspaceA.projectId, "mist-lighthouse");
  assert.equal(workspaceA.chapterId, "chapter-3");
  assert.deepEqual(workspaceA.chapterState, {
    chapterId: "chapter-3",
    status: "drafting",
    sceneIds: ["scene-story-commit-writing-intent-1"]
  });
  assert.equal(workspaceA.activeSceneId, "scene-story-commit-writing-intent-1");
  assert.equal(workspaceA.draftStatus, "drafting");
  assert.deepEqual(workspaceA.authorNotes, []);
  assert.deepEqual(workspaceA.aiSuggestions, []);
  assert.equal(workspaceA.reviewStatus, "pending");
  assert.deepEqual(workspaceA.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    status: scene.status,
    notes: scene.notes,
    lockedElements: scene.lockedElements,
    editableElements: scene.editableElements
  })), [
    {
      sceneId: "scene-story-commit-writing-intent-1",
      status: "ready_for_draft",
      notes: ["确认场景计划。"],
      lockedElements: {
        committedEvents: ["story-commit-writing-intent-1", "story-event-writing-intent-1"],
        characterFacts: ["a-lan:missing", "lin-yuan:drafting"],
        worldRules: ["潮门不能主动开启", "灯塔只在海雾中显影", "工业时代技术水平不得自动跃迁"],
        approvedDecisions: ["scene-story-commit-writing-intent-1:accepted"]
      },
      editableElements: ["wording", "pacing", "description", "scene_expansion"]
    }
  ]);
});

test("StoryWritingWorkspace prepares structured draft requests without prose generation", () => {
  const { project, acceptedScene } = createAcceptedScene();
  const workspace = createStoryWritingWorkspace(project, [acceptedScene]);
  const request = createChapterDraftRequest(workspace, "scene-story-commit-writing-intent-1");

  assert.deepEqual(request, {
    version: "world-os-chapter-draft-request-v1",
    projectId: "mist-lighthouse",
    chapterId: "chapter-3",
    sceneId: "scene-story-commit-writing-intent-1",
    sourceScenePlanId: "scene-story-commit-writing-intent-1",
    sourceCommitId: "story-commit-writing-intent-1",
    purpose: "Transform story-event-writing-intent-1 into a draft-ready scene structure.",
    beats: acceptedScene.beats,
    lockedElements: workspace.scenes[0].lockedElements,
    editableElements: ["wording", "pacing", "description", "scene_expansion"],
    authorNotes: ["确认场景计划。"],
    constraints: [
      "Do not change committed events.",
      "Do not change character facts.",
      "Do not change world rules.",
      "Do not change approved decisions."
    ],
    requestedOutput: "chapter_draft_structure_only"
  });
  assert.equal("chapterText" in request, false);
  assert.equal("draftText" in request, false);
  assert.equal(JSON.stringify(request).includes("3000"), false);
});

test("StoryWritingWorkspace rejects unaccepted scenes before drafting", () => {
  const { project, pendingScene, rejectedScene } = createUnacceptedScenes();

  assert.throws(
    () => createStoryWritingWorkspace(project, [pendingScene]),
    /Scene must be accepted or modified before writing workspace/
  );
  assert.deepEqual(validateStoryWritingWorkspace({
    version: "world-os-story-writing-workspace-v1",
    projectId: "mist-lighthouse",
    chapterId: "chapter-3",
    chapterState: {
      chapterId: "chapter-3",
      status: "drafting",
      sceneIds: [rejectedScene.sceneId]
    },
    scenes: [
      {
        sceneId: rejectedScene.sceneId,
        plan: rejectedScene,
        status: "ready_for_draft",
        notes: [],
        lockedElements: {
          committedEvents: [],
          characterFacts: [],
          worldRules: [],
          approvedDecisions: []
        },
        editableElements: ["wording"]
      }
    ],
    activeSceneId: rejectedScene.sceneId,
    draftStatus: "drafting",
    authorNotes: [],
    aiSuggestions: [],
    reviewStatus: "pending"
  }), {
    version: "world-os-story-writing-validation-v1",
    valid: false,
    violations: ["Unaccepted scenes cannot enter drafting: scene-story-commit-writing-intent-1."]
  });
});

test("StoryWritingWorkspace protects locked elements and permits editable suggestions", () => {
  const { project, acceptedScene } = createAcceptedScene();
  const workspace = createStoryWritingWorkspace(project, [acceptedScene]);

  assert.deepEqual(validateStoryWritingChange(workspace, {
    sceneId: "scene-story-commit-writing-intent-1",
    target: "committed_events",
    value: "story-event-writing-intent-1"
  }), {
    version: "world-os-writing-change-validation-v1",
    valid: false,
    violations: ["Locked element cannot be modified: committed_events story-event-writing-intent-1."]
  });
  assert.deepEqual(validateStoryWritingChange(workspace, {
    sceneId: "scene-story-commit-writing-intent-1",
    target: "wording",
    value: "Tighten the opening sentence."
  }), {
    version: "world-os-writing-change-validation-v1",
    valid: true,
    violations: []
  });
});

test("StoryWritingWorkspace is deterministic, cloned, and does not mutate world state", () => {
  const { project, acceptedScene } = createAcceptedScene();
  const before = structuredClone(project);
  const workspace = createStoryWritingWorkspace(project, [acceptedScene]);
  const request = createChapterDraftRequest(workspace, workspace.activeSceneId);

  workspace.scenes[0].lockedElements.worldRules.push("mutated outside");

  assert.deepEqual(project, before);
  assert.equal(project.events.length, 4);
  assert.equal(request.lockedElements.worldRules.includes("mutated outside"), false);
});


function createAcceptedScene() {
  const { project, plan } = createScenePlan();
  const accepted = reviewStoryScenePlan(plan, {
    status: "accepted",
    authorNotes: ["确认场景计划。"]
  });

  return {
    project,
    acceptedScene: accepted.plan
  };
}

function createUnacceptedScenes() {
  const { project, plan } = createScenePlan();
  const rejected = reviewStoryScenePlan(plan, {
    status: "rejected",
    authorNotes: ["暂不进入写作。"]
  });

  return {
    project,
    pendingScene: plan,
    rejectedScene: rejected.plan
  };
}

function createScenePlan() {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const candidate = createAcceptedCandidate();
  const result = commitStoryEvent(project, candidate, {
    logicalTimestamp: 61,
    previousSnapshotId: "snapshot-before-writing-61"
  });
  const plan = planStoryScene(result.project, result.commit);

  return {
    project: result.project,
    plan
  };
}

function createAcceptedCandidate(): StoryCommitCandidate {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createStoryAuthorIntent({
    id: "writing-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 61,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
  const report = analyzeStoryImpactReport(project, intent);
  const workspace = createStoryDecisionWorkspace(report);
  const resolved = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-writing-intent-1-a",
    status: "accepted",
    authorNotes: ["接受方案 A，进入写作空间。"]
  });

  assert.notEqual(resolved.commitCandidate, undefined);
  return resolved.commitCandidate;
}

function readSourceTree(root: string): string {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = `${root}/${entry}`;
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return readSourceTree(path);
      }

      return path.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}
