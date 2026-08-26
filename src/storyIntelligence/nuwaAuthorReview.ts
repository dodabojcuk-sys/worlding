import { buildWorkspaceRuntimeState } from "../productWorkspaceRuntime/index.ts";
import { analyzeStoryImpactReport } from "../domainTemplates/storyWorld/analysis/index.ts";
import { buildStoryChangePreview } from "../domainTemplates/storyWorld/changePreview/index.ts";
import { createStoryDecisionWorkspace, resolveAuthorDecision } from "../domainTemplates/storyWorld/decision/index.ts";
import { projectStoryEvidenceForAuthor, resolveStoryEvidenceBundle } from "../domainTemplates/storyWorld/evidence/index.ts";
import { createStoryAuthorIntent } from "../domainTemplates/storyWorld/intent/index.ts";
import type { StoryWorldProject } from "../domainTemplates/storyWorld/index.ts";

import type { NuwaAuthorReview, StoryPredictionBranch, StoryPredictionBundle, StorySnapshot } from "./storyIntelligenceTypes.ts";

export function buildNuwaAuthorReview(input: {
  snapshot: StorySnapshot;
  bundle: StoryPredictionBundle;
  branchId: string;
}): NuwaAuthorReview {
  const branch = requireBranch(input.bundle, input.branchId);
  const context = buildNuwaReviewContext(input.snapshot, input.bundle, branch);

  return {
    version: "world-os-nuwa-author-review-v1",
    runId: input.bundle.runId,
    branchId: branch.id,
    snapshotHash: input.bundle.snapshotHash,
    status: "awaiting-author-decision",
    authorDecisionRequired: true,
    decisionWorkspace: context.decisionWorkspace,
    impactReport: context.impactReport,
    evidenceProjection: context.evidenceProjection,
    changePreview: null,
    mutatesMarkdown: false
  };
}

export function buildNuwaAuthorChangePreview(input: {
  snapshot: StorySnapshot;
  bundle: StoryPredictionBundle;
  branchId: string;
  decisionOptionId: string;
  authorNotes?: string[];
}) {
  const branch = requireBranch(input.bundle, input.branchId);
  const context = buildNuwaReviewContext(input.snapshot, input.bundle, branch);
  const resolution = resolveAuthorDecision({
    workspace: context.decisionWorkspace,
    selectedOptionId: input.decisionOptionId,
    status: "accepted",
    authorNotes: input.authorNotes ?? []
  });
  if (!resolution.commitCandidate) throw new Error("Nuwa author review did not create a change preview candidate.");

  return buildStoryChangePreview({
    project: context.project,
    candidate: resolution.commitCandidate,
    authorDecision: resolution.commitCandidate.selectedDecision,
    evidenceBundle: context.evidenceBundle,
    previousSnapshotId: input.snapshot.snapshotHash
  });
}

export function buildNuwaReviewContext(snapshot: StorySnapshot, bundle: StoryPredictionBundle, branch: StoryPredictionBranch) {
  if (bundle.snapshotHash !== snapshot.snapshotHash) {
    throw new Error("Nuwa author review rejected a stale Story Prediction Bundle.");
  }
  const project = buildStoryProjectFromSnapshot(snapshot);
  const intent = createStoryAuthorIntent({
    id: `nuwa-intent-${bundle.runId}-${branch.strategy}`,
    content: bundle.authorGoal,
    source: "author",
    targetScope: targetScopeFor(bundle.authorGoal),
    createdAtLogical: snapshot.notes.length,
    relatedCharacters: referencedIds(snapshot, branch, "character"),
    relatedEvents: referencedIds(snapshot, branch, "event"),
    relatedLocations: referencedIds(snapshot, branch, "location")
  });
  const impactReport = analyzeStoryImpactReport(project, intent);
  const evidenceBundle = resolveStoryEvidenceBundle(project, impactReport);
  const decisionWorkspace = createStoryDecisionWorkspace(impactReport);

  return {
    project,
    intent,
    impactReport,
    evidenceBundle,
    evidenceProjection: projectStoryEvidenceForAuthor(evidenceBundle),
    decisionWorkspace
  };
}

export function buildStoryProjectFromSnapshot(snapshot: StorySnapshot): StoryWorldProject {
  const chapter = snapshot.currentChapter ?? {
    id: "markdown-chapter-none",
    title: "未选择章节",
    status: "drafting"
  };
  const characterNotes = snapshot.notes.filter((note) => note.type === "character");
  const locationNotes = snapshot.notes.filter((note) => note.type === "location");
  const eventNotes = snapshot.notes.filter((note) => note.type === "event");
  const selectedObject = characterNotes[0] ?? snapshot.project;

  return {
    version: "world-os-story-world-project-v1",
    projectId: snapshot.project.id,
    world: {
      title: snapshot.project.title,
      genre: "markdown-story-workspace",
      rules: snapshot.lockedRules.map((note) => note.evidenceExcerpt || note.title),
      era: "author-defined",
      themes: []
    },
    currentChapter: {
      id: chapter.id,
      title: chapter.title,
      status: chapter.status === "reviewing" || chapter.status === "revising" || chapter.status === "final" ? chapter.status : "drafting"
    },
    characters: characterNotes.map((note) => ({
      id: note.id,
      name: note.title,
      role: note.evidenceExcerpt || "Markdown character",
      traits: [],
      relationships: [],
      status: note.status
    })),
    locations: locationNotes.map((note) => ({
      id: note.id,
      name: note.title,
      description: note.evidenceExcerpt,
      connections: []
    })),
    events: eventNotes.map((note, index) => ({
      id: note.id,
      chapter: chapter.id,
      timelinePosition: index + 1,
      participants: [],
      consequences: note.evidenceExcerpt === "" ? [] : [note.evidenceExcerpt]
    })),
    rules: {
      worldRules: snapshot.lockedRules.map((note) => note.evidenceExcerpt || note.title),
      narrativeRules: [],
      constraints: snapshot.lockedRules.map((note) => note.title)
    },
    keyframes: snapshot.notes
      .filter((note) => note.type === "keyframe")
      .map((note, index) => ({
        id: note.id,
        timelinePosition: index + 1,
        majorMoment: note.evidenceExcerpt || note.title,
        authorDecision: note.status
      })),
    openLoops: snapshot.openThreads.map((note) => ({
      id: note.id,
      unresolvedConflict: note.evidenceExcerpt || note.title,
      pendingThread: note.title
    })),
    workspaceRuntime: buildWorkspaceRuntimeState({
      activeProject: { id: snapshot.project.id, title: snapshot.project.title, kind: "creation-project" },
      currentChapter: {
        id: chapter.id,
        title: chapter.title,
        status: chapter.status === "reviewing" || chapter.status === "revising" || chapter.status === "final" ? chapter.status : "drafting"
      },
      currentObject: {
        id: selectedObject.id,
        label: selectedObject.title,
        type: selectedObject.type === "character" ? "character" : "world"
      }
    })
  };
}

function referencedIds(snapshot: StorySnapshot, branch: StoryPredictionBranch, type: "character" | "event" | "location"): string[] {
  const paths = new Set(branch.affectedObjects);
  return snapshot.notes
    .filter((note) => note.type === type && paths.has(note.relativePath))
    .map((note) => note.id)
    .sort();
}

function targetScopeFor(goal: string): "character" | "event" | "relationship" | "world_rule" | "new_scene" {
  if (/规则|不得|必须|潮门/.test(goal)) return "world_rule";
  if (/关系|信任|怀疑|告诉|透露|背叛/.test(goal)) return "relationship";
  if (/角色|人物|身份|死亡|受伤|失踪/.test(goal)) return "character";
  if (/场景|地点|进入|来到/.test(goal)) return "new_scene";
  return "event";
}

function requireBranch(bundle: StoryPredictionBundle, branchId: string): StoryPredictionBranch {
  const branch = bundle.branches.find((candidate) => candidate.id === branchId);
  if (!branch) throw new Error(`Unknown Nuwa prediction branch: ${branchId}.`);
  return branch;
}
