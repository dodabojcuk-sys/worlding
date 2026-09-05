import type { StoryIntakeCandidate, StoryIntakeEnvelope } from "../../../../../../src/storyContracts/storyIntakeEnvelope.ts";

export const ACTIVE_STORY_INTAKE_CANDIDATE_REF_VERSION = "tianyan-active-story-intake-candidate-ref/v1" as const;

export type ActiveStoryIntakeCandidateRef = {
  version: typeof ACTIVE_STORY_INTAKE_CANDIDATE_REF_VERSION;
  projectId: string;
  workVersionId: string;
  sessionId: string;
  runId: string;
  envelopeId: string;
  candidateId: string;
  baseRevision: number;
};

export type ActiveStoryIntakeCandidateResolution =
  | { status: "ready"; candidate: StoryIntakeCandidate }
  | { status: "project-mismatch" | "session-mismatch" | "run-mismatch" | "work-version-mismatch" | "base-version-stale" | "envelope-mismatch" | "candidate-missing"; candidate: null };

export function createActiveStoryIntakeCandidateRef(envelope: StoryIntakeEnvelope, candidateId: string): ActiveStoryIntakeCandidateRef {
  if (!envelope.candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("所选候选不存在于当前批次。");
  return {
    version: ACTIVE_STORY_INTAKE_CANDIDATE_REF_VERSION,
    projectId: envelope.projectId,
    workVersionId: envelope.baseVersion.workVersionId,
    sessionId: envelope.sessionId,
    runId: envelope.runId,
    envelopeId: envelope.envelopeId,
    candidateId,
    baseRevision: envelope.baseVersion.revision
  };
}

export function resolveActiveStoryIntakeCandidate(input: {
  projectId: string;
  workVersionId: string;
  sessionId: string;
  envelope: StoryIntakeEnvelope;
  ref: ActiveStoryIntakeCandidateRef;
}): ActiveStoryIntakeCandidateResolution {
  const { envelope, ref } = input;
  if (ref.projectId !== input.projectId || envelope.projectId !== input.projectId) return missing("project-mismatch");
  if (ref.sessionId !== input.sessionId || envelope.sessionId !== input.sessionId) return missing("session-mismatch");
  if (ref.runId !== envelope.runId) return missing("run-mismatch");
  if (ref.workVersionId !== input.workVersionId || envelope.baseVersion.workVersionId !== input.workVersionId) return missing("work-version-mismatch");
  if (ref.baseRevision !== envelope.baseVersion.revision) return missing("base-version-stale");
  if (ref.envelopeId !== envelope.envelopeId) return missing("envelope-mismatch");
  const candidate = envelope.candidates.find((item) => item.candidateId === ref.candidateId) ?? null;
  return candidate ? { status: "ready", candidate } : missing("candidate-missing");
}

export function selectStoryIntakeCandidateScope(envelope: StoryIntakeEnvelope, candidateIds: readonly string[]): StoryIntakeCandidate[] {
  const uniqueIds = [...new Set(candidateIds)];
  if (uniqueIds.length !== candidateIds.length) throw new Error("候选范围包含重复项。");
  if (uniqueIds.length === 0) throw new Error("请至少选择一个候选。");
  const byId = new Map(envelope.candidates.map((candidate) => [candidate.candidateId, candidate]));
  return uniqueIds.map((candidateId) => {
    const candidate = byId.get(candidateId);
    if (!candidate) throw new Error(`所选候选不存在：${candidateId}`);
    return candidate;
  });
}

export function filterStoryIntakeSelection(envelope: StoryIntakeEnvelope, candidateIds: readonly string[]): string[] {
  const available = new Set(envelope.candidates.map((candidate) => candidate.candidateId));
  return [...new Set(candidateIds)].filter((candidateId) => available.has(candidateId));
}

export function serializeActiveStoryIntakeCandidateRef(ref: ActiveStoryIntakeCandidateRef): string {
  return JSON.stringify(ref);
}

export function parseActiveStoryIntakeCandidateRef(serialized: string | null, projectId: string): ActiveStoryIntakeCandidateRef | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as Partial<ActiveStoryIntakeCandidateRef>;
    if (value.version !== ACTIVE_STORY_INTAKE_CANDIDATE_REF_VERSION || value.projectId !== projectId) return null;
    for (const key of ["projectId", "workVersionId", "sessionId", "runId", "envelopeId", "candidateId"] as const) {
      if (typeof value[key] !== "string" || !value[key]) return null;
    }
    if (!Number.isSafeInteger(value.baseRevision) || Number(value.baseRevision) < 0) return null;
    return value as ActiveStoryIntakeCandidateRef;
  } catch {
    return null;
  }
}

/**
 * A focused candidate belongs to one TianyiConversation, not merely to its
 * project. Keeping the session in this browser-only key lets a new
 * conversation in the same project start cleanly instead of restoring an
 * incompatible Work reference from an older conversation.
 */
export function storyIntakeCandidateRefStorageKey(projectId: string, sessionId: string): string {
  return `tianyi-story-intake-active-candidate:${projectId}:${sessionId}`;
}

export function storyIntakeSelectionStorageKey(projectId: string, sessionId: string, runId: string): string {
  return `tianyi-story-intake-selection:${projectId}:${sessionId}:${runId}`;
}

export function storyIntakeRecoveryMessage(status: ActiveStoryIntakeCandidateResolution["status"]): string {
  return ({
    ready: "候选已从同一批次恢复。",
    "project-mismatch": "这项候选属于另一项目；已停止进入工作，请返回当前项目重新选择。",
    "session-mismatch": "原会话已变化；请返回审阅重新选择候选。",
    "run-mismatch": "候选批次已更新；请返回审阅核对新批次。",
    "work-version-mismatch": "工作版本已切换；请在当前版本重新整理或选择。",
    "base-version-stale": "候选所基于的版本已过期；未写入任何内容，请刷新影响后再确认。",
    "envelope-mismatch": "候选批次身份已变化；请返回审阅重新选择。",
    "candidate-missing": "原候选已丢失或不在当前批次；未写入任何内容，请返回审阅恢复。"
  } satisfies Record<ActiveStoryIntakeCandidateResolution["status"], string>)[status];
}

function missing(status: Exclude<ActiveStoryIntakeCandidateResolution["status"], "ready">): ActiveStoryIntakeCandidateResolution {
  return { status, candidate: null };
}
