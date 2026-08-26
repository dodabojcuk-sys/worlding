export const INTELLIGENCE_NAVIGATION_CHECKPOINT_A_VERSION = "story-studio-intelligence-operating-model-navigation-v1-checkpoint-a" as const;

/**
 * The ordered states are the minimum complete proof set for the frozen
 * Conversation Composer & Archive Recall Foundation scope. The count is a
 * consequence of the required product truths, not an acceptance constant.
 */
export const INTELLIGENCE_NAVIGATION_CHECKPOINT_A_STATES = [
  "01-normal-session-author-message-archived",
  "02-fixture-response-and-receipt-archived",
  "03-normal-session-restart-recovery",
  "04-temporary-session-zero-retention",
  "05-temporary-exact-selection-retained",
  "06-session-rollover-bidirectional-links",
  "07-keyword-unicode-bounded-recall",
  "08-time-session-actor-source-recall-filters",
  "09-current-project-default-deny-and-offline-recall",
  "10-missing-corrupt-invalid-index-honest-degradation",
  "11-exact-archive-message-receipt-provenance",
  "12-exact-source-return-to-original-message",
  "13-missed-memory-reject-zero-durable-memory",
  "14-missed-memory-accept-edit-existing-owner",
  "15-single-message-delete-and-index-invalidation",
  "16-session-delete-and-deterministic-rebuild",
  "17-loopback-transport-and-input-boundaries",
  "18-desktop-composer-recall-and-memory-reachability",
  "19-mobile-composer-recall-and-memory-reachability",
  "20-navigation-evidence-and-canonical-no-write-regression"
] as const;

export const INTELLIGENCE_NAVIGATION_CHECKPOINT_A_HARD_COUNTERS = [
  "modelCalls",
  "externalNetworkCalls",
  "nuwaExecutionCount",
  "codexProcessLaunches",
  "canonicalMarkdownWrites",
  "canonicalVisualWrites",
  "implicitMemoryWriteCount",
  "rejectedCandidateDurableMemoryCount",
  "temporaryArchiveWriteCount",
  "temporaryReceiptWriteCount",
  "temporaryPackEntryCount",
  "temporaryRecoverableCount",
  "sourceLessRecallCount",
  "crossProjectArchiveLeakCount",
  "unboundedTranscriptInjectionCount",
  "omittedReceiptMessageCount",
  "sourceReturnMismatchCount",
  "deletedContentResidueCount",
  "indexFallbackProviderCallCount",
  "fixedCandidateRouteCountConstantCount",
  "navigationMutationCount",
  "existingFormalEvidenceMutationCount"
] as const;

export const INTELLIGENCE_NAVIGATION_CHECKPOINT_A_ASSERTIONS = [
  "normalSessionVisibleEventsPersisted",
  "normalSessionRestartReadable",
  "temporaryDisclosureVisibleBeforeUse",
  "temporarySessionNeverPersisted",
  "temporaryExactSelectionOnly",
  "temporaryClosedAndRestartUnavailable",
  "rolloverRequiresExplicitAction",
  "recallIndexDerivedAndRebuildable",
  "recallResultsBoundedAndDeterministic",
  "recallFiltersCovered",
  "currentProjectAuthorizationExact",
  "indexFailureDoesNotScanFallback",
  "receiptListsEveryUsedArchiveMessage",
  "sourceReturnTargetsExactEvent",
  "candidateRejectCreatesNoMemory",
  "candidateAcceptUsesExistingMemoryOwner",
  "deletedMessageKeepsStableEventIdentity",
  "deletedContentPurgedFromRebuild",
  "retainedMemorySurvivesSourceDelete",
  "desktopControlsReachable",
  "mobileControlsReachable",
  "currentNavigationUnchanged",
  "offlineArchiveRecallReadable",
  "formalEvidenceDirectoriesUnchanged",
  "screenshotsIndividuallyInspected"
] as const;

const ROOT_FIELDS = ["version", "completedStates", "counters", "consoleErrors", "assertions"] as const;

export function reduceIntelligenceNavigationCheckpointA(value: unknown): boolean {
  if (!plainExact(value, ROOT_FIELDS)) return false;
  const input = value as Record<string, unknown>;
  if (input.version !== INTELLIGENCE_NAVIGATION_CHECKPOINT_A_VERSION) return false;
  if (!Array.isArray(input.completedStates) || !sameOrderedStates(input.completedStates)) return false;
  if (!plainExact(input.counters, INTELLIGENCE_NAVIGATION_CHECKPOINT_A_HARD_COUNTERS)) return false;
  const counters = input.counters as Record<string, unknown>;
  if (INTELLIGENCE_NAVIGATION_CHECKPOINT_A_HARD_COUNTERS.some((counter) => counters[counter] !== 0)) return false;
  if (!Array.isArray(input.consoleErrors) || input.consoleErrors.length !== 0) return false;
  return exactBooleanRecord(input.assertions, INTELLIGENCE_NAVIGATION_CHECKPOINT_A_ASSERTIONS);
}

function sameOrderedStates(value: unknown[]): boolean {
  return value.length === INTELLIGENCE_NAVIGATION_CHECKPOINT_A_STATES.length
    && value.every((state, index) => state === INTELLIGENCE_NAVIGATION_CHECKPOINT_A_STATES[index])
    && new Set(value).size === value.length;
}

function exactBooleanRecord(value: unknown, keys: readonly string[]): boolean {
  if (!plainExact(value, keys)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => record[key] === true);
}

function plainExact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
