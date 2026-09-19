import type { ProjectProjectionInvalidationMode } from "./projectProjectionInvalidation.ts";
import {
  emitStoryStudioProjectionChangeCompleted,
  type StoryStudioProjectionChangeCompletedDetail,
  type StoryStudioProjectionChangeCompletedInput,
} from "./storyStudioProjectionChangeEvent.ts";

/**
 * Converts a completed localTransport write boundary into the one typed
 * browser completion signal. It owns no facts and only copies authoritative
 * identities from the request or successful result.
 */
export function completeProjectProjectionTransport(input: {
  pathname: string;
  body?: Record<string, unknown>;
  data: unknown;
  invalidationMode: ProjectProjectionInvalidationMode;
}): StoryStudioProjectionChangeCompletedDetail | null {
  const completion = projectionChangeCompletionForRequest(input);
  return completion ? emitStoryStudioProjectionChangeCompleted(completion) : null;
}

export function projectionChangeCompletionForRequest(input: {
  pathname: string;
  body?: Record<string, unknown>;
  data: unknown;
  invalidationMode: ProjectProjectionInvalidationMode;
}): StoryStudioProjectionChangeCompletedInput | null {
  if (input.invalidationMode === "none" || !input.body) return null;
  const projectId = identity(input.body.projectId);
  if (!projectId) return null;
  const operationPath = input.pathname.replace(/^\/__local\/story-studio/u, "");
  if (!projectionWriteCompleted(operationPath, input.data)) return null;
  const operationId = identity(input.body.operationId);
  const authoritative = authoritativeProjectionCompletionIdentities(operationPath, input.body, input.data);
  return {
    projectId,
    operationPath,
    ...(authoritative.workVersionId ? { workVersionId: authoritative.workVersionId } : {}),
    ...(operationId ? { operationId } : {}),
    ...(authoritative.changeId ? { changeId: authoritative.changeId } : {}),
  };
}

function projectionWriteCompleted(operationPath: string, data: unknown): boolean {
  if (!isRecord(data)) return false;
  // Planning Events are review candidates, not completed formal projection
  // changes. They share the cache boundary because their creation can affect
  // pending-review reads, but must not wake a Character Dock as if Canon had
  // changed.
  if (/^\/(?:planning-events|timeline\/planning-event)\//u.test(operationPath)) return false;
  if (operationPath === "/author-control/change-set/apply") {
    return data.status === "applied" && isRecord(data.application) && data.application.eventRecorded === true;
  }
  if (operationPath === "/event-line/normal-creation/confirm") {
    const applied = isRecord(data.result) && isRecord(data.result.applied) ? data.result.applied : null;
    return applied?.status === "applied" && isRecord(applied.application) && applied.application.eventRecorded === true;
  }
  if (operationPath === "/tianyi/creative/candidate/event-review/confirm") {
    return isRecord(data.adoptionReceipt) && data.adoptionReceipt.status === "active" && isRecord(data.changeSet) && data.changeSet.status === "applied";
  }
  if (operationPath === "/tianyi/creative/candidate/event-review/undo") {
    return isRecord(data.adoptionReceipt) && data.adoptionReceipt.status === "undone" && isRecord(data.adoptionReceipt.compensation);
  }
  if (operationPath === "/nuwa-n1/auto-apply" || operationPath === "/nuwa-n1/continuous") {
    return isRecord(data.automaticApplication) && data.automaticApplication.status === "applied" && Boolean(identity(data.automaticApplication.eventId));
  }
  if (operationPath === "/nuwa-n1/auto-rollback") {
    return isRecord(data.automaticApplication)
      && data.automaticApplication.status === "rolled-back"
      && isRecord(data.automaticApplication.rollback)
      && data.automaticApplication.rollback.status === "active"
      && data.automaticApplication.rollback.failure === null;
  }
  return !hasExplicitProjectionWriteFailure(data);
}

function authoritativeProjectionCompletionIdentities(operationPath: string, body: Record<string, unknown>, data: unknown): { workVersionId?: string; changeId?: string } {
  const bodyWorkVersionId = identity(body.workVersionId);
  if (!isRecord(data)) return bodyWorkVersionId ? { workVersionId: bodyWorkVersionId } : {};
  if (operationPath === "/author-control/change-set/apply") {
    return optionalIdentities(null, identity(data.id) ?? identity(body.changeSetId));
  }
  if (operationPath === "/event-line/normal-creation/confirm") {
    const applied = isRecord(data.result) && isRecord(data.result.applied) ? data.result.applied : null;
    return optionalIdentities(null, identity(applied?.id));
  }
  if (operationPath === "/tianyi/creative/candidate/event-review/confirm" && isRecord(data.adoptionReceipt)) {
    const resultVersion = isRecord(data.adoptionReceipt.resultVersion) ? data.adoptionReceipt.resultVersion : null;
    return optionalIdentities(identity(resultVersion?.workVersionId), identity(data.adoptionReceipt.receiptId));
  }
  if (operationPath === "/tianyi/creative/candidate/event-review/undo" && isRecord(data.adoptionReceipt)) {
    const compensation = isRecord(data.adoptionReceipt.compensation) ? data.adoptionReceipt.compensation : null;
    const resultVersion = compensation && isRecord(compensation.resultVersion) ? compensation.resultVersion : null;
    return optionalIdentities(identity(resultVersion?.workVersionId), identity(data.adoptionReceipt.receiptId));
  }
  if ((operationPath === "/nuwa-n1/auto-apply" || operationPath === "/nuwa-n1/continuous") && isRecord(data.automaticApplication)) {
    const resultVersion = isRecord(data.automaticApplication.resultVersion) ? data.automaticApplication.resultVersion : null;
    return optionalIdentities(identity(resultVersion?.workVersionId), identity(data.automaticApplication.receiptId));
  }
  if (operationPath === "/nuwa-n1/auto-rollback" && isRecord(data.automaticApplication)) {
    const rollback = isRecord(data.automaticApplication.rollback) ? data.automaticApplication.rollback : null;
    const resultVersion = rollback && isRecord(rollback.resultVersion) ? rollback.resultVersion : null;
    return optionalIdentities(identity(resultVersion?.workVersionId), identity(data.automaticApplication.receiptId));
  }
  return optionalIdentities(bodyWorkVersionId, identity(body.changeSetId));
}

function optionalIdentities(workVersionId?: string | null, changeId?: string | null): { workVersionId?: string; changeId?: string } {
  return {
    ...(workVersionId ? { workVersionId } : {}),
    ...(changeId ? { changeId } : {}),
  };
}

function hasExplicitProjectionWriteFailure(data: Record<string, unknown>): boolean {
  if (data.conflict === true || data.stale === true) return true;
  if (typeof data.status === "string" && ["stale", "abandoned", "conflict", "recovery-required"].includes(data.status)) return true;
  if (isRecord(data.result) && (data.result.conflict === true || data.result.stale === true)) return true;
  return false;
}

function identity(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
