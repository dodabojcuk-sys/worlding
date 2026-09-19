/**
 * Browser-only completion signal for successful project projection changes.
 * It carries identities only: never prose, object labels, Provider material,
 * credentials, or domain state. It is not a fact owner or persistence layer.
 */
export const STORY_STUDIO_PENDING_REVIEW_CHANGED = "story-studio-pending-review-changed";

export type StoryStudioProjectionChangeCompletedDetail = Readonly<{
  kind: "projection-change-completed";
  projectId: string;
  workVersionId?: string;
  operationPath: string;
  operationId?: string;
  changeId?: string;
}>;

export type StoryStudioProjectionChangeCompletedInput = {
  projectId: string;
  workVersionId?: string | null;
  operationPath: string;
  operationId?: string | null;
  changeId?: string | null;
};

export function createStoryStudioProjectionChangeDetail(input: StoryStudioProjectionChangeCompletedInput): StoryStudioProjectionChangeCompletedDetail {
  const projectId = requiredIdentity(input.projectId, "projectId");
  const operationPath = requiredIdentity(input.operationPath, "operationPath");
  const workVersionId = optionalIdentity(input.workVersionId);
  const operationId = optionalIdentity(input.operationId);
  const changeId = optionalIdentity(input.changeId);
  return Object.freeze({
    kind: "projection-change-completed" as const,
    projectId,
    ...(workVersionId ? { workVersionId } : {}),
    operationPath,
    ...(operationId ? { operationId } : {}),
    ...(changeId ? { changeId } : {}),
  });
}

export function emitStoryStudioProjectionChangeCompleted(input: StoryStudioProjectionChangeCompletedInput): StoryStudioProjectionChangeCompletedDetail {
  const detail = createStoryStudioProjectionChangeDetail(input);
  window.dispatchEvent(new CustomEvent(STORY_STUDIO_PENDING_REVIEW_CHANGED, { detail }));
  return detail;
}

export function readStoryStudioProjectionChangeDetail(event: Event): StoryStudioProjectionChangeCompletedDetail | null {
  if (!(event instanceof CustomEvent)) return null;
  const value = event.detail;
  if (!isRecord(value) || value.kind !== "projection-change-completed") return null;
  try {
    return createStoryStudioProjectionChangeDetail({
      projectId: typeof value.projectId === "string" ? value.projectId : "",
      workVersionId: typeof value.workVersionId === "string" ? value.workVersionId : null,
      operationPath: typeof value.operationPath === "string" ? value.operationPath : "",
      operationId: typeof value.operationId === "string" ? value.operationId : null,
      changeId: typeof value.changeId === "string" ? value.changeId : null,
    });
  } catch {
    return null;
  }
}

function requiredIdentity(value: string, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required for a projection completion event.`);
  return normalized;
}

function optionalIdentity(value: string | null | undefined): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
