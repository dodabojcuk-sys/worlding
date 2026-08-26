import type { WorkVersionOutputArtifactSourceR0 } from "./workVersionBoundOutputArtifact.ts";

export const LEGACY_NUWA_CREATION_BLOCKED_MESSAGE = "这个历史排演没有完整作品版本来源，请重新选择当前作品主线。";

export type StableCreationSourceSelectionR0 = {
  projectId: string;
  workVersionId: string;
  workVersionRevision: number;
  manifestId: string;
  manifestDigest: string;
  storyUnitRefs: Array<{ unitId: string; unitVersion: string }>;
  eventRefs: Array<{ eventId: string; eventRevision: string }>;
  sourceAnchorRefs: string[];
};

export type LegacyNuwaCreationHandoffR0 = {
  projectId?: string;
  runId?: string;
  runPackId?: string;
  temporaryBranchId?: string;
  rehearsalStepId?: string;
  simulationReceiptId?: string;
  stableSource?: StableCreationSourceSelectionR0;
};

export type LegacyNuwaCreationHandoffResultR0 =
  | { status: "adapted"; source: StableCreationSourceSelectionR0; removedLegacyIdentityCount: number }
  | { status: "blocked_incomplete_source"; authorMessage: typeof LEGACY_NUWA_CREATION_BLOCKED_MESSAGE; removedLegacyIdentityCount: 0 };

/**
 * Converts a legacy rehearsal handoff into stable owner references. This pure
 * adapter owns no data and deliberately drops every Nuwa runtime identity.
 */
export function adaptLegacyNuwaCreationHandoff(input: LegacyNuwaCreationHandoffR0): LegacyNuwaCreationHandoffResultR0 {
  const source = input.stableSource;
  if (!source || !isCompleteStableSource(source)) {
    return { status: "blocked_incomplete_source", authorMessage: LEGACY_NUWA_CREATION_BLOCKED_MESSAGE, removedLegacyIdentityCount: 0 };
  }
  const removedLegacyIdentityCount = [input.runId, input.runPackId, input.temporaryBranchId, input.rehearsalStepId, input.simulationReceiptId]
    .filter((value) => typeof value === "string" && value.trim()).length;
  return {
    status: "adapted",
    source: {
      projectId: source.projectId.trim(),
      workVersionId: source.workVersionId.trim(),
      workVersionRevision: source.workVersionRevision,
      manifestId: source.manifestId.trim(),
      manifestDigest: source.manifestDigest.trim(),
      storyUnitRefs: source.storyUnitRefs.map((ref) => ({ unitId: ref.unitId.trim(), unitVersion: ref.unitVersion.trim() })),
      eventRefs: source.eventRefs.map((ref) => ({ eventId: ref.eventId.trim(), eventRevision: ref.eventRevision.trim() })),
      sourceAnchorRefs: source.sourceAnchorRefs.map((ref) => ref.trim()).sort()
    },
    removedLegacyIdentityCount
  };
}

export function stableSelectionFromArtifactSource(source: WorkVersionOutputArtifactSourceR0): StableCreationSourceSelectionR0 {
  return {
    projectId: source.projectId,
    workVersionId: source.workVersionId,
    workVersionRevision: source.pinnedRevision,
    manifestId: source.manifestId,
    manifestDigest: source.manifestDigest,
    storyUnitRefs: source.selectedStoryUnitRefs,
    eventRefs: source.selectedEventRefs,
    sourceAnchorRefs: source.sourceAnchorRefs
  };
}

function isCompleteStableSource(value: StableCreationSourceSelectionR0): boolean {
  return Boolean(
    text(value.projectId)
    && text(value.workVersionId)
    && Number.isInteger(value.workVersionRevision)
    && value.workVersionRevision > 0
    && text(value.manifestId)
    && /^[a-f0-9]{64}$/u.test(String(value.manifestDigest || ""))
    && Array.isArray(value.storyUnitRefs)
    && value.storyUnitRefs.length > 0
    && value.storyUnitRefs.every((ref) => text(ref.unitId) && text(ref.unitVersion))
    && Array.isArray(value.eventRefs)
    && value.eventRefs.length > 0
    && value.eventRefs.every((ref) => text(ref.eventId) && text(ref.eventRevision))
    && Array.isArray(value.sourceAnchorRefs)
    && value.sourceAnchorRefs.length > 0
    && value.sourceAnchorRefs.every(text)
  );
}

function text(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
