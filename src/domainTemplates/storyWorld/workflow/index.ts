import type { StoryWorldEvent, StoryWorldProject } from "../index.ts";

export type StoryAuthoringStage =
  | "AuthorInput"
  | "AuthorIntent"
  | "ImpactAnalysis"
  | "AuthorDecision"
  | "StoryEventCommit"
  | "ChapterDraft"
  | "WorldUpdate";

export type StoryWorldObservation = {
  worldTitle: string;
  currentChapterId: string;
  currentChapterTitle: string;
  eventCount: number;
  openLoopCount: number;
  ruleCount: number;
};

export type StoryAuthoringFlow = {
  version: "world-os-story-authoring-flow-v1";
  projectId: string;
  lifecycle: StoryAuthoringStage[];
  currentStage: StoryAuthoringStage;
  observation: StoryWorldObservation;
  deterministic: true;
};

export type StoryChangeType = "character" | "relationship" | "time" | "rule";

export type StoryProposedChange = {
  type: StoryChangeType;
  targetId: string;
  summary: string;
};

export type StoryAuthorIntent = {
  version: "world-os-story-author-intent-v1";
  id: string;
  chapterId: string;
  text: string;
  proposedChanges: StoryProposedChange[];
  createdBy: "author";
};

export type StoryProposal = {
  id: string;
  source: "ai_suggestion";
  intentId: string;
  chapterId: string;
  text: string;
  proposedChanges: StoryProposedChange[];
};

export type StoryAuthorChoice =
  | {
      choice: "pending";
    }
  | {
      choice: "accept" | "reject";
      note: string;
    }
  | {
      choice: "modify";
      note: string;
      modifiedProposal: string;
    };

export type StoryDecisionModel = {
  version: "world-os-story-decision-model-v1";
  id: string;
  proposal: StoryProposal;
  affectedCharacters: string[];
  affectedEvents: string[];
  risks: string[];
  alternatives: string[];
  authorChoice: StoryAuthorChoice;
};

export type StoryEventCommit = {
  version: "world-os-story-event-commit-v1";
  id: string;
  projectId: string;
  chapterId: string;
  event: StoryWorldEvent;
  source: {
    intentId: string;
    decisionId: string;
    authorChoice: "accept" | "modify";
  };
  trace: StoryAuthoringStage[];
};

export type StoryChapterState = {
  version: "world-os-story-chapter-state-v1";
  chapterId: string;
  status: "event_committed";
  relatedEvents: string[];
  involvedCharacters: string[];
  openThreads: string[];
  draftState: {
    status: "ready_for_draft";
    sourceCommitId: string;
    requiredAuthorReview: true;
  };
};

export type StoryWorldUpdate = {
  version: "world-os-story-world-update-v1";
  project: StoryWorldProject;
  source: {
    commitId: string;
    eventId: string;
    decisionId: string;
    intentId: string;
  };
  changes: {
    addedEventIds: string[];
    affectedCharacterIds: string[];
    openThreadIds: string[];
  };
};

export type StoryWorkflowDashboardModel = {
  version: "world-os-story-workflow-dashboard-v1";
  happening: string;
  nextStep: StoryAuthoringStage;
  waitingForAuthor: string;
  currentStage: StoryAuthoringStage;
  visibleItems: Array<"proposal" | "affectedCharacters" | "risks" | "commit" | "chapterState">;
};

export type BuildStoryWorkflowDashboardInput = {
  flow: StoryAuthoringFlow;
  decision?: StoryDecisionModel;
  commit?: StoryEventCommit;
  chapterState?: StoryChapterState;
  worldUpdate?: StoryWorldUpdate;
};

export function createStoryAuthoringFlow(project: StoryWorldProject): StoryAuthoringFlow {
  return cloneData({
    version: "world-os-story-authoring-flow-v1",
    projectId: project.projectId,
    lifecycle: lifecycle(),
    currentStage: "AuthorInput",
    observation: observeWorld(project),
    deterministic: true
  });
}

export function createAuthorIntent(input: {
  id: string;
  chapterId: string;
  text: string;
  proposedChanges: StoryProposedChange[];
}): StoryAuthorIntent {
  return cloneData({
    version: "world-os-story-author-intent-v1",
    id: input.id,
    chapterId: input.chapterId,
    text: input.text,
    proposedChanges: input.proposedChanges,
    createdBy: "author"
  });
}

export function analyzeStoryImpact(project: StoryWorldProject, intent: StoryAuthorIntent): StoryDecisionModel {
  const affectedEvents = affectedEventIds(project, intent);

  return cloneData({
    version: "world-os-story-decision-model-v1",
    id: `decision-${intent.id}`,
    proposal: {
      id: `proposal-${intent.id}`,
      source: "ai_suggestion",
      intentId: intent.id,
      chapterId: intent.chapterId,
      text: intent.text,
      proposedChanges: intent.proposedChanges
    },
    affectedCharacters: affectedCharacterIds(project, intent, affectedEvents),
    affectedEvents,
    risks: riskStatements(intent),
    alternatives: alternativeStatements(intent),
    authorChoice: {
      choice: "pending"
    }
  });
}

export function applyAuthorDecision(
  decision: StoryDecisionModel,
  authorChoice: Exclude<StoryAuthorChoice, { choice: "pending" }>
): StoryDecisionModel {
  return cloneData({
    ...decision,
    authorChoice
  });
}

export function commitStoryEvent(project: StoryWorldProject, decision: StoryDecisionModel): StoryEventCommit {
  if (decision.authorChoice.choice === "pending") {
    throw new Error("AuthorDecision required before StoryEventCommit.");
  }

  if (decision.authorChoice.choice === "reject") {
    throw new Error("Only accepted or modified author decisions can be committed.");
  }

  const event: StoryWorldEvent = {
    id: `story-event-${decision.proposal.intentId}`,
    chapter: decision.proposal.chapterId,
    timelinePosition: nextTimelinePosition(project),
    participants: [...decision.affectedCharacters],
    consequences: consequenceList(decision)
  };

  return cloneData({
    version: "world-os-story-event-commit-v1",
    id: `commit-${decision.proposal.intentId}`,
    projectId: project.projectId,
    chapterId: decision.proposal.chapterId,
    event,
    source: {
      intentId: decision.proposal.intentId,
      decisionId: decision.id,
      authorChoice: decision.authorChoice.choice
    },
    trace: ["AuthorInput", "AuthorIntent", "ImpactAnalysis", "AuthorDecision", "StoryEventCommit"]
  });
}

export function buildStoryChapterState(project: StoryWorldProject, commit: StoryEventCommit): StoryChapterState {
  return cloneData({
    version: "world-os-story-chapter-state-v1",
    chapterId: commit.chapterId,
    status: "event_committed",
    relatedEvents: [...project.events.filter((event) => event.chapter === commit.chapterId).map((event) => event.id), commit.event.id],
    involvedCharacters: [...commit.event.participants],
    openThreads: project.openLoops.map((loop) => loop.id).sort(),
    draftState: {
      status: "ready_for_draft",
      sourceCommitId: commit.id,
      requiredAuthorReview: true
    }
  });
}

export function applyStoryWorldUpdate(project: StoryWorldProject, commit: StoryEventCommit): StoryWorldUpdate {
  const nextProject = cloneData(project);
  nextProject.events.push(cloneData(commit.event));

  return cloneData({
    version: "world-os-story-world-update-v1",
    project: nextProject,
    source: {
      commitId: commit.id,
      eventId: commit.event.id,
      decisionId: commit.source.decisionId,
      intentId: commit.source.intentId
    },
    changes: {
      addedEventIds: [commit.event.id],
      affectedCharacterIds: [...commit.event.participants],
      openThreadIds: project.openLoops.map((loop) => loop.id).sort()
    }
  });
}

export function buildStoryWorkflowDashboard(input: BuildStoryWorkflowDashboardInput): StoryWorkflowDashboardModel {
  if (input.decision?.authorChoice.choice === "pending") {
    return cloneData({
      version: "world-os-story-workflow-dashboard-v1",
      happening: "Impact analysis is waiting for author decision.",
      nextStep: "AuthorDecision",
      waitingForAuthor: `Choose accept, modify, or reject for ${input.decision.proposal.id}.`,
      currentStage: "ImpactAnalysis",
      visibleItems: ["proposal", "affectedCharacters", "risks"]
    });
  }

  if (input.commit !== undefined && input.chapterState === undefined) {
    return cloneData({
      version: "world-os-story-workflow-dashboard-v1",
      happening: "Story event has been committed.",
      nextStep: "ChapterDraft",
      waitingForAuthor: `Review draft source ${input.commit.id}.`,
      currentStage: "StoryEventCommit",
      visibleItems: ["commit"]
    });
  }

  if (input.chapterState !== undefined && input.worldUpdate === undefined) {
    return cloneData({
      version: "world-os-story-workflow-dashboard-v1",
      happening: "Chapter draft state is ready.",
      nextStep: "WorldUpdate",
      waitingForAuthor: `Review chapter ${input.chapterState.chapterId}.`,
      currentStage: "ChapterDraft",
      visibleItems: ["chapterState"]
    });
  }

  return cloneData({
    version: "world-os-story-workflow-dashboard-v1",
    happening: "World is ready for author intent.",
    nextStep: "AuthorIntent",
    waitingForAuthor: `Add intent for ${input.flow.observation.currentChapterId}.`,
    currentStage: input.flow.currentStage,
    visibleItems: ["proposal"]
  });
}

function observeWorld(project: StoryWorldProject): StoryWorldObservation {
  return {
    worldTitle: project.world.title,
    currentChapterId: project.currentChapter.id,
    currentChapterTitle: project.currentChapter.title,
    eventCount: project.events.length,
    openLoopCount: project.openLoops.length,
    ruleCount: project.rules.worldRules.length
  };
}

function lifecycle(): StoryAuthoringStage[] {
  return [
    "AuthorInput",
    "AuthorIntent",
    "ImpactAnalysis",
    "AuthorDecision",
    "StoryEventCommit",
    "ChapterDraft",
    "WorldUpdate"
  ];
}

function affectedEventIds(project: StoryWorldProject, intent: StoryAuthorIntent): string[] {
  const ids = new Set<string>();

  for (const event of project.events) {
    if (event.chapter === intent.chapterId) {
      ids.add(event.id);
    }
  }

  for (const change of intent.proposedChanges) {
    if (change.type === "time" && project.events.some((event) => event.id === change.targetId)) {
      ids.add(change.targetId);
    }
  }

  return [...ids].sort();
}

function affectedCharacterIds(
  project: StoryWorldProject,
  intent: StoryAuthorIntent,
  affectedEvents: string[]
): string[] {
  const ids = new Set<string>();
  const characterIds = new Set(project.characters.map((character) => character.id));

  for (const change of intent.proposedChanges) {
    if (characterIds.has(change.targetId)) {
      ids.add(change.targetId);
    }
  }

  if (ids.size > 0) {
    return [...ids].sort();
  }

  for (const event of project.events) {
    if (affectedEvents.includes(event.id)) {
      for (const participant of event.participants) {
        if (characterIds.has(participant)) {
          ids.add(participant);
        }
      }
    }
  }

  return [...ids].sort();
}

function riskStatements(intent: StoryAuthorIntent): string[] {
  const risks = new Set<string>();

  for (const change of intent.proposedChanges) {
    if (change.type === "character") {
      risks.add("Character changes require continuity check.");
    }

    if (change.type === "relationship") {
      risks.add("Relationship changes require author confirmation.");
    }

    if (change.type === "time") {
      risks.add("Timeline changes must preserve chapter order.");
    }

    if (change.type === "rule") {
      risks.add("World rule impact requires author confirmation.");
    }
  }

  return [...risks].sort();
}

function alternativeStatements(intent: StoryAuthorIntent): string[] {
  return [
    `Keep as note only: ${intent.text}`,
    `Move to later draft: ${intent.chapterId}`,
    "Reject and preserve current world state."
  ];
}

function nextTimelinePosition(project: StoryWorldProject): number {
  return Math.max(...project.events.map((event) => event.timelinePosition), 0) + 1;
}

function consequenceList(decision: StoryDecisionModel): string[] {
  if (decision.authorChoice.choice === "modify") {
    return [decision.authorChoice.modifiedProposal];
  }

  return decision.proposal.proposedChanges.map((change) => change.summary);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
