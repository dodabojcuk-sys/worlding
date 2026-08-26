import type { StoryWorldProject } from "../index.ts";
import type { StoryScenePlan } from "../scene/index.ts";
import type {
  ChapterDraftRequest,
  StoryEditableElement,
  StoryLockedElements,
  StorySceneWorkState,
  StoryWritingWorkspace
} from "./writingTypes.ts";
import { validateStoryWritingWorkspace } from "./writingValidator.ts";

const editableElements: StoryEditableElement[] = ["wording", "pacing", "description", "scene_expansion"];

export function createStoryWritingWorkspace(
  project: StoryWorldProject,
  scenes: StoryScenePlan[]
): StoryWritingWorkspace {
  for (const scene of scenes) {
    if (!isApprovedScene(scene)) {
      throw new Error("Scene must be accepted or modified before writing workspace.");
    }
  }

  const sceneStates = scenes.map((scene) => sceneWorkState(project, scene));
  const activeSceneId = sceneStates[0]?.sceneId ?? "";
  const workspace: StoryWritingWorkspace = {
    version: "world-os-story-writing-workspace-v1",
    projectId: project.projectId,
    chapterId: project.currentChapter.id,
    chapterState: {
      chapterId: project.currentChapter.id,
      status: "drafting",
      sceneIds: sceneStates.map((scene) => scene.sceneId)
    },
    scenes: sceneStates,
    activeSceneId,
    draftStatus: "drafting",
    authorNotes: [],
    aiSuggestions: [],
    reviewStatus: "pending"
  };
  const validation = validateStoryWritingWorkspace(workspace);

  if (!validation.valid) {
    throw new Error(validation.violations.join(" "));
  }

  return cloneData(workspace);
}

export function createChapterDraftRequest(workspace: StoryWritingWorkspace, sceneId: string): ChapterDraftRequest {
  const validation = validateStoryWritingWorkspace(workspace);

  if (!validation.valid) {
    throw new Error(validation.violations.join(" "));
  }

  const scene = workspace.scenes.find((candidate) => candidate.sceneId === sceneId);

  if (scene === undefined) {
    throw new Error(`Unknown writing scene: ${sceneId}.`);
  }

  return cloneData({
    version: "world-os-chapter-draft-request-v1",
    projectId: workspace.projectId,
    chapterId: workspace.chapterId,
    sceneId: scene.sceneId,
    sourceScenePlanId: scene.plan.sceneId,
    sourceCommitId: scene.plan.sourceCommitId,
    purpose: scene.plan.purpose,
    beats: scene.plan.beats,
    lockedElements: scene.lockedElements,
    editableElements: scene.editableElements,
    authorNotes: scene.notes,
    constraints: [
      "Do not change committed events.",
      "Do not change character facts.",
      "Do not change world rules.",
      "Do not change approved decisions."
    ],
    requestedOutput: "chapter_draft_structure_only"
  });
}

function sceneWorkState(project: StoryWorldProject, scene: StoryScenePlan): StorySceneWorkState {
  return {
    sceneId: scene.sceneId,
    plan: cloneData(scene),
    status: "ready_for_draft",
    notes: [...scene.review.authorNotes],
    lockedElements: lockedElements(project, scene),
    editableElements: [...editableElements]
  };
}

function lockedElements(project: StoryWorldProject, scene: StoryScenePlan): StoryLockedElements {
  return {
    committedEvents: [scene.sourceCommitId, eventIdFromCommitId(scene.sourceCommitId)],
    characterFacts: scene.characters.map((characterId) => characterFact(project, characterId)).sort(),
    worldRules: [...project.rules.worldRules],
    approvedDecisions: [`${scene.sceneId}:${scene.review.status}`]
  };
}

function characterFact(project: StoryWorldProject, characterId: string): string {
  const character = project.characters.find((candidate) => candidate.id === characterId);
  return `${characterId}:${character?.status ?? "unknown"}`;
}

function eventIdFromCommitId(commitId: string): string {
  return commitId.replace("story-commit-", "story-event-");
}

function isApprovedScene(scene: StoryScenePlan): boolean {
  return scene.review.status === "accepted" || scene.review.status === "modified";
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
