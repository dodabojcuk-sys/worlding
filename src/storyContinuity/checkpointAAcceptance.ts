export const TIANYI_CHECKPOINT_A_STATES = [
  "01-reserved-root-and-project-scan-exclusion",
  "02-strict-schema-and-owner-path-validation",
  "03-persona-policy-independent-history",
  "04-project-global-memory-grant-default-deny",
  "05-archive-append-sequence-and-conflict",
  "06-receipt-immutable-and-bounded-schema",
  "07-independent-owner-conflicts-and-partial-success",
  "08-revoke-restore-append-only",
  "09-hard-delete-purge-and-minimal-tombstone",
  "10-pack-export-integrity-sensitivity-and-credential-boundary",
  "11-hostile-import-staging-isolated",
  "12-deterministic-fixture-and-final-summary"
] as const;

export const TIANYI_CHECKPOINT_A_BOUNDARY_COUNTERS = [
  "projectScanContinuityLeakCount",
  "pathEscapeAcceptedCount",
  "symlinkAcceptedCount",
  "encodedTraversalAcceptedCount",
  "ownerPathMismatchAcceptedCount",
  "unicodeCollisionAcceptedCount",
  "dangerousKeyAcceptedCount",
  "unknownFieldAcceptedCount",
  "oversizedOwnerAcceptedCount",
  "duplicateIdAcceptedCount",
  "restrictedMemoryPersistedCount",
  "rejectedCandidateDurableMemoryCount",
  "crossProjectMemoryReadCount",
  "unauthorizedGlobalMemoryUseCount",
  "staleGrantAcceptedCount",
  "archiveSequenceViolationAcceptedCount",
  "receiptMutationAcceptedCount",
  "receiptExcerptLimitViolationCount",
  "destructiveRollbackAttemptCount",
  "hardDeletedContentResidueCount",
  "deletedMemoryActiveCount",
  "deletedMemoryContentRevisionCount",
  "tombstoneContentLeakCount",
  "credentialExportCount",
  "providerCredentialExportCount",
  "importCanonicalOverwriteCount",
  "importedSkillAuthorityCount",
  "importStagingResidueAfterFailureCount",
  "fixtureModelCalls",
  "fixtureExternalNetworkCalls",
  "fixtureClockReads",
  "fixtureRandomReads",
  "fixtureRepositoryReads",
  "fixtureWriteCount",
  "fixtureNondeterministicOutputCount",
  "manipulativeRelationshipPatternCount",
  "intimacyPatternCount",
  "existingDocumentHistoryRegressionCount",
  "modelCalls",
  "externalNetworkCalls",
  "codexProcessLaunches"
] as const;

export type TianyiCheckpointAState = typeof TIANYI_CHECKPOINT_A_STATES[number];
export type TianyiCheckpointABoundaryCounter = typeof TIANYI_CHECKPOINT_A_BOUNDARY_COUNTERS[number];
export type TianyiCheckpointACounters = Record<TianyiCheckpointABoundaryCounter, number>;

export type TianyiCheckpointAAcceptance = {
  checkpointAccepted: boolean;
  implementationComplete: false;
  featureAccepted: false;
  releaseGateAccepted: false;
  completedStates: number;
  remainingStates: TianyiCheckpointAState[];
  nonZeroBoundaryCounters: TianyiCheckpointABoundaryCounter[];
};

/**
 * Reduces observable state completion and machine boundary counters into the
 * narrow Checkpoint A truth. Later implementation and release gates remain
 * false even when this repository-only checkpoint passes.
 */
export function reduceTianyiCheckpointAAcceptance(input: {
  completedStates: readonly string[];
  counters: Readonly<Record<string, number>>;
}): TianyiCheckpointAAcceptance {
  const completed = new Set(input.completedStates);
  const statesInOrder = TIANYI_CHECKPOINT_A_STATES.filter((state) => completed.has(state));
  const sequenceMatches = input.completedStates.length === statesInOrder.length
    && input.completedStates.every((state, index) => state === statesInOrder[index]);
  const remainingStates = TIANYI_CHECKPOINT_A_STATES.filter((state) => !completed.has(state));
  const nonZeroBoundaryCounters = TIANYI_CHECKPOINT_A_BOUNDARY_COUNTERS.filter((counter) => {
    const value = input.counters[counter];
    return typeof value !== "number" || !Number.isSafeInteger(value) || value !== 0;
  });
  const checkpointAccepted = sequenceMatches
    && statesInOrder.length === TIANYI_CHECKPOINT_A_STATES.length
    && remainingStates.length === 0
    && nonZeroBoundaryCounters.length === 0;

  return {
    checkpointAccepted,
    implementationComplete: false,
    featureAccepted: false,
    releaseGateAccepted: false,
    completedStates: statesInOrder.length,
    remainingStates,
    nonZeroBoundaryCounters
  };
}
