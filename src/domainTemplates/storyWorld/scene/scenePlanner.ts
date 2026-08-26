import type { StoryEventCommit } from "../commit/index.ts";
import type { StoryWorldProject } from "../index.ts";
import type {
  StoryScenePlan,
  StorySceneReviewInput,
  StorySceneReviewResult
} from "./sceneTypes.ts";

export function planStoryScene(project: StoryWorldProject, commit: StoryEventCommit): StoryScenePlan {
  const location = selectLocation(project, commit);
  const characters = [...commit.event.participants].sort();

  return cloneData({
    version: "world-os-story-scene-plan-v1",
    sceneId: `scene-${commit.id}`,
    chapterId: commit.chapterId,
    sourceCommitId: commit.id,
    purpose: `Transform ${commit.event.id} into a draft-ready scene structure.`,
    characters,
    location,
    conflict: "Reveal the committed change while preserving unresolved story pressure.",
    beats: [
      {
        type: "opening",
        summary: `Establish ${location} and the immediate chapter situation.`
      },
      {
        type: "development",
        summary: `Show ${characters.join(" and ")} reacting to ${commit.event.id}.`
      },
      {
        type: "conflict",
        summary: `Put the committed change against ${openLoopIds(project).join(" and ")}.`
      },
      {
        type: "turning_point",
        summary: `Surface: ${informationReveal(commit)}`
      },
      {
        type: "resolution",
        summary: "End with a draft handoff, not finished prose."
      }
    ],
    emotionalGoal: "Controlled discovery with suspense preserved.",
    informationReveal: informationReveal(commit),
    risks: riskStatements(commit),
    review: {
      status: "pending",
      authorNotes: []
    }
  });
}

export function reviewStoryScenePlan(plan: StoryScenePlan, input: StorySceneReviewInput): StorySceneReviewResult {
  if (input.status === "modified" && (input.authorNotes === undefined || input.authorNotes.length === 0)) {
    throw new Error("Modified scene review requires author notes.");
  }

  const nextPlan: StoryScenePlan = cloneData({
    ...plan,
    review: {
      status: input.status,
      authorNotes: [...(input.authorNotes ?? [])]
    }
  });

  return cloneData({
    version: "world-os-story-scene-review-result-v1",
    plan: nextPlan,
    sourceCommit: {
      id: nextPlan.sourceCommitId,
      chapterId: nextPlan.chapterId
    },
    canDraft: input.status === "accepted" || input.status === "modified"
  });
}

function selectLocation(project: StoryWorldProject, commit: StoryEventCommit): string {
  const source = [project.currentChapter.title, ...commit.event.consequences].join(" ");
  const lighthouseLocation = project.locations.find((location) =>
    source.includes("灯塔") && (location.id.includes("lighthouse") || location.name.includes("灯塔"))
  );

  if (lighthouseLocation !== undefined) {
    return lighthouseLocation.id;
  }

  const directLocation = [...project.locations]
    .sort(byId)
    .find((location) => source.includes(location.id) || source.includes(location.name));

  return directLocation?.id ?? project.locations[0]?.id ?? "unknown-location";
}

function informationReveal(commit: StoryEventCommit): string {
  return commit.event.consequences.find((consequence) => !consequence.startsWith("Risk level:")) ?? commit.event.id;
}

function riskStatements(commit: StoryEventCommit): string[] {
  return commit.event.consequences.filter((consequence) => consequence.startsWith("Risk level:"));
}

function openLoopIds(project: StoryWorldProject): string[] {
  return project.openLoops.map((loop) => loop.id).sort();
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
