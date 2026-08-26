import { stableHash } from "./storySnapshotBuilder.ts";
import type { NuwaAgentTask, NuwaEvidenceReference, NuwaPlan, StorySnapshot } from "./storyIntelligenceTypes.ts";

export type NuwaTaskContextPack = {
  version: "world-os-nuwa-task-context-pack-v1";
  taskHash: string;
  runId: string;
  snapshotHash: string;
  taskId: string;
  role: NuwaAgentTask["role"];
  authorGoal: string;
  current: {
    projectId: string;
    chapterId: string | null;
    sceneId: string | null;
    projectTitle: string;
    chapterTitle: string | null;
    sceneTitle: string | null;
  };
  allowedNotes: NuwaEvidenceReference[];
  lockedRules: NuwaEvidenceReference[];
  openThreads: NuwaEvidenceReference[];
  constraints: {
    forbiddenOperations: NuwaAgentTask["forbiddenOperations"];
    expectedOutputSchema: NuwaAgentTask["expectedOutputSchema"];
    maximumBranchProposals: number;
    maximumEvidenceExcerpts: number;
  };
};

/**
 * A task receives only the evidence that its plan explicitly permits. This is
 * intentionally smaller than a workspace export so every external execution
 * can be reviewed from the resulting run pack.
 */
export function buildNuwaTaskContextPack(input: {
  plan: NuwaPlan;
  snapshot: StorySnapshot;
  task: NuwaAgentTask;
}): NuwaTaskContextPack {
  if (input.plan.snapshotHash !== input.snapshot.snapshotHash) {
    throw new Error("Nuwa task context requires the plan snapshot.");
  }

  const notesByPath = new Map(input.snapshot.notes.map((note) => [note.relativePath, note]));
  const toEvidence = (relativePath: string): NuwaEvidenceReference | null => {
    const note = notesByPath.get(relativePath);
    if (!note || !note.evidenceExcerpt) return null;
    return {
      evidenceId: `snapshot-evidence-${note.id}`,
      noteId: note.id,
      relativePath: note.relativePath,
      title: note.title,
      excerpt: note.evidenceExcerpt,
      noteType: note.type
    };
  };
  const allowedNotes = input.task.allowedNoteRefs
    .map(toEvidence)
    .filter((note): note is NuwaEvidenceReference => note !== null)
    .slice(0, input.task.maximumEvidenceExcerpts);
  const allowedPaths = new Set(input.task.allowedNoteRefs);
  const scoped = (paths: string[]) => paths
    .filter((relativePath) => allowedPaths.has(relativePath))
    .map(toEvidence)
    .filter((note): note is NuwaEvidenceReference => note !== null)
    .slice(0, input.task.maximumEvidenceExcerpts);
  const material = {
    runId: input.plan.runId,
    snapshotHash: input.snapshot.snapshotHash,
    taskId: input.task.taskId,
    authorGoal: input.plan.authorGoal,
    allowedNoteRefs: allowedNotes.map((note) => [note.relativePath, note.excerpt]),
    capabilityRequirements: input.task.capabilityRequirements,
    forbiddenOperations: input.task.forbiddenOperations
  };

  return {
    version: "world-os-nuwa-task-context-pack-v1",
    taskHash: stableHash(material),
    runId: input.plan.runId,
    snapshotHash: input.snapshot.snapshotHash,
    taskId: input.task.taskId,
    role: input.task.role,
    authorGoal: input.plan.authorGoal,
    current: {
      projectId: input.snapshot.project.id,
      chapterId: input.snapshot.currentChapter?.id ?? null,
      sceneId: input.snapshot.currentScene?.id ?? null,
      projectTitle: input.snapshot.project.title,
      chapterTitle: input.snapshot.currentChapter?.title ?? null,
      sceneTitle: input.snapshot.currentScene?.title ?? null
    },
    allowedNotes,
    lockedRules: scoped(input.snapshot.lockedRules.map((note) => note.relativePath)),
    openThreads: scoped(input.snapshot.openThreads.map((note) => note.relativePath)),
    constraints: {
      forbiddenOperations: input.task.forbiddenOperations,
      expectedOutputSchema: input.task.expectedOutputSchema,
      maximumBranchProposals: input.task.maximumBranchProposals,
      maximumEvidenceExcerpts: input.task.maximumEvidenceExcerpts
    }
  };
}
