import { AuthorChangeSetApplyError, type createStoryStudioAuthorControl } from "./storyStudioAuthorControl.ts";
import type {
  createStoryStudioWorkspaceOperations,
  StoryStudioWorldObject
} from "./storyStudioWorkspaceOperations.ts";
import { createStoryStudioWorkVersionAuthority } from "../storyWorkspace/workVersionAuthority.ts";

export type StoryStudioCanonReadFailureKind =
  | "authority-failure"
  | "parse-failure"
  | "invalid-record"
  | "repository-io"
  | "project-boundary";

export type StoryStudioCanonReadFailure = {
  kind: StoryStudioCanonReadFailureKind;
  message: string;
};

export type StoryStudioVerifiedCanonListRead =
  | { status: "ready"; eventIds: string[]; invalidRecordCount: number }
  | { status: "error"; error: StoryStudioCanonReadFailure };

export type StoryStudioVerifiedCanonDetailRead =
  | { status: "ready"; event: StoryStudioWorldObject & { canonicalReadVerified: true } }
  | { status: "error"; error: StoryStudioCanonReadFailure };

type StoryStudioEventCanonAuthorityClass = "canon" | "derived-canon" | "unverified";

type StoryStudioEventCanonAdmissionResult =
  | { status: "admitted"; code: "verified-owner-admission" }
  | { status: "rejected"; code: "owner-rejected" | "work-version-mismatch" | "revision-mismatch" }
  | { status: "error"; error: StoryStudioCanonReadFailure };

type StoryStudioEventCanonReadCertification = {
  projectId: string;
  workVersionId: string;
  ownerKind: "event";
  entityId: string;
  revision: string | null;
  authorityClass: StoryStudioEventCanonAuthorityClass;
  admissionResult: StoryStudioEventCanonAdmissionResult;
};

type WorkspaceOperations = ReturnType<typeof createStoryStudioWorkspaceOperations>;
type AuthorControl = ReturnType<typeof createStoryStudioAuthorControl>;

/**
 * Product-facing read projection only. It delegates admission to the existing
 * AuthorControl gates and never writes, repairs, or claims Canon records.
 */
export function createStoryStudioCanonReadProjection(input: {
  workspace: WorkspaceOperations;
  authorControl: AuthorControl;
}) {
  return {
    certifyEventRead(readInput: {
      projectId: string;
      workVersionId: string;
      eventId: string;
      expectedRevision?: string;
    }): StoryStudioEventCanonReadCertification {
      const base = {
        projectId: readInput.projectId,
        workVersionId: readInput.workVersionId,
        ownerKind: "event" as const,
        entityId: readInput.eventId
      };
      try {
        const projectPath = input.workspace.resolveProjectWorkspacePath({ projectId: readInput.projectId });
        const workVersions = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath });
        const workVersion = workVersions.getVersion(readInput.workVersionId);
        workVersions.verifyVersionIntegrity(readInput.workVersionId);

        const before = input.workspace.readWorldObject({ projectId: readInput.projectId, objectId: readInput.eventId });
        if (!input.authorControl.verifyCanonEventRead({
          projectId: readInput.projectId,
          eventId: readInput.eventId,
          workVersionId: readInput.workVersionId
        })) {
          const rejection = input.authorControl.verifyCanonEventRead({
            projectId: readInput.projectId,
            eventId: readInput.eventId
          })
            ? "work-version-mismatch"
            : "owner-rejected";
          return rejectedEventCertification(base, before.revisionToken, rejection);
        }

        const after = input.workspace.readWorldObject({ projectId: readInput.projectId, objectId: readInput.eventId });
        if (
          before.revisionToken !== after.revisionToken
          || (readInput.expectedRevision !== undefined && after.revisionToken !== readInput.expectedRevision)
        ) {
          return rejectedEventCertification(base, after.revisionToken, "revision-mismatch");
        }
        return {
          ...base,
          revision: after.revisionToken,
          authorityClass: workVersion.identity.kind === "derived" ? "derived-canon" : "canon",
          admissionResult: { status: "admitted", code: "verified-owner-admission" }
        };
      } catch (cause) {
        return {
          ...base,
          revision: null,
          authorityClass: "unverified",
          admissionResult: { status: "error", error: classifyCanonReadFailure(cause) }
        };
      }
    },

    listVerifiedCanonEvents(readInput: { projectId: string; workVersionId?: string | null }): StoryStudioVerifiedCanonListRead {
      try {
        const events = input.workspace.listWorldObjects({ projectId: readInput.projectId, type: "event" });
        const eventIds = input.authorControl.listVerifiedCanonEventIds({
          projectId: readInput.projectId,
          ...(readInput.workVersionId !== undefined ? { workVersionId: readInput.workVersionId } : {})
        });
        const verifiedIds = new Set(eventIds);
        const invalidRecordCount = events.filter((event) =>
          claimsCanonIdentity(event.status, event.tags) && !verifiedIds.has(event.id)
        ).length;
        return { status: "ready", eventIds, invalidRecordCount };
      } catch (cause) {
        return { status: "error", error: classifyCanonReadFailure(cause) };
      }
    },

    readVerifiedCanonEvent(readInput: { projectId: string; eventId: string; workVersionId?: string | null }): StoryStudioVerifiedCanonDetailRead {
      try {
        if (!input.authorControl.verifyCanonEventRead(readInput)) {
          return {
            status: "error",
            error: {
              kind: "invalid-record",
              message: "这条事件未通过作者确认链验证，未作为正式事实读取。"
            }
          };
        }
        const event = input.workspace.readWorldObject({ projectId: readInput.projectId, objectId: readInput.eventId });
        return { status: "ready", event: { ...event, canonicalReadVerified: true } };
      } catch (cause) {
        return { status: "error", error: classifyCanonReadFailure(cause) };
      }
    }
  };
}

function rejectedEventCertification(
  base: Pick<StoryStudioEventCanonReadCertification, "projectId" | "workVersionId" | "ownerKind" | "entityId">,
  revision: string,
  code: Extract<StoryStudioEventCanonAdmissionResult, { status: "rejected" }>["code"]
): StoryStudioEventCanonReadCertification {
  return {
    ...base,
    revision,
    authorityClass: "unverified",
    admissionResult: { status: "rejected", code }
  };
}

export function classifyCanonReadFailure(cause: unknown): StoryStudioCanonReadFailure {
  const message = cause instanceof Error ? cause.message : "Canon 读取失败。";
  if (isProjectBoundaryFailure(message)) {
    return {
      kind: "project-boundary",
      message: "当前项目边界无效或已变化，事件线未读取其他项目的记录。"
    };
  }
  if (cause instanceof SyntaxError) {
    return {
      kind: "parse-failure",
      message: "作者确认记录无法解析，事件线未将解析故障显示为空列表。"
    };
  }
  if (isInvalidAuthorityRecord(message)) {
    return {
      kind: "invalid-record",
      message: "作者确认记录无法解析或结构无效，事件线未将其显示为空列表。"
    };
  }
  if (cause instanceof AuthorChangeSetApplyError) {
    return {
      kind: "authority-failure",
      message: "作者确认链发生权威冲突，事件线已停止读取。"
    };
  }
  if (isRepositoryIoFailure(cause)) {
    return {
      kind: "repository-io",
      message: "本地 Canon 仓库读取失败，事件线未将故障显示为空列表。"
    };
  }
  return {
    kind: "authority-failure",
    message: "作者确认链无法完成验证，事件线已按失败关闭处理。"
  };
}

function claimsCanonIdentity(status: string, tags: readonly string[]): boolean {
  return status === "committed" || tags.includes("作者确认");
}

function isProjectBoundaryFailure(message: string): boolean {
  return /Project (?:does not exist|identifier|folder)|configured root|当前项目|项目边界/i.test(message);
}

function isInvalidAuthorityRecord(message: string): boolean {
  return /(?:Change Set|Impact Review|Apply Intent|author decision|确认记录).*(?:invalid|无法解析|不完整)/i.test(message);
}

function isRepositoryIoFailure(cause: unknown): boolean {
  const code = typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as NodeJS.ErrnoException).code || "")
    : "";
  return new Set(["EACCES", "EBUSY", "EIO", "EISDIR", "EMFILE", "ENFILE", "ENOENT", "ENOSPC", "ENOTDIR", "EPERM", "EROFS"]).has(code);
}
