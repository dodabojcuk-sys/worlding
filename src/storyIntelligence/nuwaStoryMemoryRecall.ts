import {
  executeStoryMemoryRecallSkill,
  projectStoryMemoryRecallForCompiler,
  projectStoryMemoryRecallForProduct,
  type ExecuteStoryMemoryRecallInput,
  type StoryMemoryRecallCapabilityResult
} from "../skillRuntime/storyMemoryRecallSkillAdapter.ts";
import type { NuwaAgentResult, NuwaAgentTask, NuwaEvidenceReference } from "./storyIntelligenceTypes.ts";
import type { NuwaTaskContextPack } from "./nuwaTaskContextPack.ts";

export type NuwaStoryMemoryRecallOptions = Omit<ExecuteStoryMemoryRecallInput, "request">;

export type NuwaStoryMemoryRecallDiagnostic = {
  version: "world-os-nuwa-story-memory-recall-diagnostic-v1";
  taskId: string;
  status: StoryMemoryRecallCapabilityResult["status"];
  reducedCoverage: boolean;
  product: ReturnType<typeof projectStoryMemoryRecallForProduct>;
  compiler: ReturnType<typeof projectStoryMemoryRecallForCompiler>;
  candidateEvidenceIds: string[];
  acceptedEvidenceIds: string[];
  rejectedReferenceCount: number;
};

export async function recallNuwaEvidenceWithSkill(input: {
  task: NuwaAgentTask;
  context: NuwaTaskContextPack;
  options?: NuwaStoryMemoryRecallOptions;
}): Promise<{
  evidence: NuwaEvidenceReference[];
  diagnostic: NuwaStoryMemoryRecallDiagnostic;
}> {
  if (input.task.role !== "evidence-critic") {
    throw new Error("Story memory recall is limited to the Nuwa evidence-critic task.");
  }
  const result = await executeStoryMemoryRecallSkill({
    request: {
      operationId: `${input.context.runId}:${input.context.taskId}:story-memory-recall`,
      nuwaTaskId: input.context.taskId,
      projectId: input.context.current.projectId,
      ...(input.context.current.chapterId ? { chapterId: input.context.current.chapterId } : {}),
      ...(input.context.current.sceneId ? { sceneId: input.context.current.sceneId } : {}),
      query: input.context.authorGoal,
      taskPurpose: input.task.purpose,
      allowedReferences: input.context.allowedNotes,
      openThreadIds: input.context.openThreads.map((item) => item.noteId),
      lockedRuleIds: input.context.lockedRules.map((item) => item.noteId)
    },
    ...input.options
  });
  const canonicalByKey = new Map(input.context.allowedNotes.map((reference) => [referenceKey(reference), reference]));
  const candidateEvidenceIds = result.references.map((reference) => reference.evidenceId).sort();
  const accepted = result.references.flatMap((reference) => {
    const canonical = canonicalByKey.get(referenceKey(reference));
    if (!canonical || canonical.excerpt.slice(0, result.limits.maxExcerptChars) !== reference.excerpt) return [];
    return [structuredClone(canonical)];
  });
  const rejectedReferenceCount = result.rejectedReferenceCount + Math.max(0, result.references.length - accepted.length);
  const reducedCoverage = result.status !== "completed" || rejectedReferenceCount > 0;

  return {
    evidence: accepted,
    diagnostic: {
      version: "world-os-nuwa-story-memory-recall-diagnostic-v1",
      taskId: input.task.taskId,
      status: rejectedReferenceCount > 0 ? "invalid-reference" : result.status,
      reducedCoverage,
      product: projectStoryMemoryRecallForProduct({
        ...result,
        status: rejectedReferenceCount > 0 ? "invalid-reference" : result.status,
        rejectedReferenceCount
      }),
      compiler: projectStoryMemoryRecallForCompiler({
        ...result,
        status: rejectedReferenceCount > 0 ? "invalid-reference" : result.status,
        rejectedReferenceCount
      }),
      candidateEvidenceIds,
      acceptedEvidenceIds: accepted.map((reference) => reference.evidenceId).sort(),
      rejectedReferenceCount
    }
  };
}

export function applyStoryMemoryRecallToNuwaResult(input: {
  result: NuwaAgentResult;
  recalledEvidence: NuwaEvidenceReference[];
}): NuwaAgentResult {
  if (input.result.role !== "evidence-critic" || input.recalledEvidence.length === 0) {
    return structuredClone(input.result);
  }
  const evidence = input.recalledEvidence
    .map((reference) => structuredClone(reference))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const affectedNoteRefs = evidence.map((item) => item.relativePath);
  return {
    ...structuredClone(input.result),
    evidence,
    findings: input.result.findings.map((finding) => finding.category === "evidence"
      ? { ...structuredClone(finding), evidenceIds: [...evidenceIds], affectedNoteRefs: [...affectedNoteRefs], support: "supported" as const }
      : structuredClone(finding))
  };
}

function referenceKey(reference: Pick<NuwaEvidenceReference, "evidenceId" | "noteId" | "relativePath">): string {
  return `${reference.evidenceId}|${reference.noteId}|${reference.relativePath}`;
}
