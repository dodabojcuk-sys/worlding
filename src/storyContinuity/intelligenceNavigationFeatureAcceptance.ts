export const INTELLIGENCE_NAVIGATION_FEATURE_VERSION = "story-studio-intelligence-operating-model-navigation-v1" as const;

export const INTELLIGENCE_NAVIGATION_FEATURE_STATES = [
  "01-independent-feature-bootstrap-and-legacy-state-migration",
  "02-five-workspace-desktop-routing",
  "03-five-workspace-mobile-routing",
  "04-top-right-only-tianyi-and-single-nuwa-destination",
  "05-localization-honest-no-write-placeholder",
  "06-normal-session-persisted-and-resumed",
  "07-temporary-session-zero-persistence",
  "08-archive-recall-exact-message-and-source",
  "09-missed-memory-candidate-author-decision",
  "10-cross-project-archive-and-memory-default-deny",
  "11-current-context-and-receipt-exactness",
  "12-bounded-brief-created-from-explicit-sources",
  "13-temporary-message-explicit-retention-before-handoff",
  "14-brief-revision-invalidates-old-approval",
  "15-approved-brief-enters-only-nuwa-workspace",
  "16-existing-planner-runner-repository-used",
  "17-variable-bounded-candidate-routes-and-dedup",
  "18-result-receipt-exact-provenance",
  "19-partial-result-not-impact-review-eligible",
  "20-stale-result-not-impact-review-eligible",
  "21-return-to-original-tianyi-session-and-source",
  "22-return-to-writing-stable-id-selection-and-scroll",
  "23-restart-offline-and-missing-owner-recovery",
  "24-final-feature-acceptance-summary"
] as const;

export const INTELLIGENCE_NAVIGATION_FEATURE_HARD_COUNTERS = [
  "modelCalls",
  "externalNetworkCalls",
  "codexProcessLaunches",
  "providerFallbackCount",
  "backgroundContinuationCount",
  "automaticMemoryWriteCount",
  "temporarySessionPersistenceCount",
  "temporaryTranscriptInBriefCount",
  "temporaryTranscriptInRunPackCount",
  "fullTranscriptTransferCount",
  "hiddenReasoningPersistedCount",
  "crossProjectArchiveLeakCount",
  "crossProjectMemoryLeakCount",
  "unauthorizedGlobalMemoryUseCount",
  "staleGrantAcceptedCount",
  "unapprovedBriefExecutionCount",
  "staleBriefExecutionCount",
  "briefHashMismatchAcceptedCount",
  "sourceSetHashMismatchAcceptedCount",
  "duplicateOperationRunCount",
  "secondNuwaWorkspaceCount",
  "secondNuwaPlannerCount",
  "secondNuwaOrchestratorCount",
  "secondNuwaRunRepositoryCount",
  "topRightNuwaLauncherCount",
  "automaticRouteSelectionCount",
  "automaticImpactReviewOpenCount",
  "automaticChangeSetCreationCount",
  "canonicalStoryWriteBeforeAuthorDecisionCount",
  "markdownWriteFromTianyiCount",
  "markdownWriteFromNuwaCount",
  "visualDocumentWriteFromTianyiCount",
  "visualDocumentWriteFromNuwaCount",
  "staleResultImpactEligibilityCount",
  "partialResultImpactEligibilityCount",
  "unverifiedResultImpactEligibilityCount",
  "resultReceiptUnusedSourceCount",
  "resultReceiptUnauthorizedSourceCount",
  "resultReceiptWrongBriefRevisionCount",
  "resultReceiptFullTranscriptCopyCount",
  "resultReceiptStoryProseCopyCount",
  "localizationCanonicalWriteCount",
  "localizationProjectScanCount",
  "localizationModelCallCount",
  "visibleFixturePrefixCount",
  "unlocalizedAuthorFacingLabelCount",
  "rawInternalSchemaLabelCount",
  "misleadingSourceCountCount",
  "currentContextOmittedFromSourceSummaryCount",
  "fixedCandidateRouteAssumptionCount",
  "ghostSelectionCount",
  "falseExactReturnCount",
  "silentTitleFallbackCount",
  "copiedCanonicalProseInWorkspaceStateCount",
  "forcedClickCount",
  "coveredControlCount",
  "horizontalOverflowCount",
  "keyboardTrapCount",
  "consoleErrors"
] as const;

export const INTELLIGENCE_NAVIGATION_FEATURE_ASSERTIONS = [
  "fiveWorkspaceNavigationPassed",
  "topRightOnlyTianyiPassed",
  "singleNuwaWorkspacePassed",
  "normalSessionRecallPassed",
  "temporarySessionBoundaryPassed",
  "archiveRecallExactSourcePassed",
  "memoryConsentPassed",
  "briefRevisionApprovalPassed",
  "existingNuwaPathReusePassed",
  "variableBoundedCandidateRoutesPassed",
  "variableBoundedCandidateRouteEvidence",
  "resultReceiptExactProvenancePassed",
  "partialAndStaleBoundaryPassed",
  "tianyiReturnPassed",
  "writingSelectionScrollReturnPassed",
  "restartRecoveryPassed",
  "mobileFlowPassed",
  "manualScreenshotReviewPassed"
] as const;

export const INTELLIGENCE_NAVIGATION_FORMAL_EVIDENCE_KEYS = [
  "checkpointA",
  "checkpointB",
  "tianyiFeature",
  "tianyiGate",
  "aiShellFeature",
  "aiShellGate",
  "authorControlNuwa",
  "unifiedWorkspace",
  "characterFeature",
  "characterGate",
  "timelineFeature",
  "timelineGate",
  "graphTreeFeature",
  "graphTreeGate",
  "mapFeature",
  "mapGate"
] as const;

const ROOT_FIELDS = [
  "version",
  "completedStates",
  "counters",
  "consoleErrors",
  "assertions",
  "candidateRouteEvidence",
  "manualScreenshotReview",
  "formalEvidenceHashes",
  "packageFiles"
] as const;

export type IntelligenceNavigationFeatureTruth = {
  checkpointAccepted: boolean;
  implementationComplete: boolean;
  featureAccepted: boolean;
  releaseGateAccepted: false;
  publicReadinessImplied: false;
};

export function reduceIntelligenceNavigationFeature(value: unknown): IntelligenceNavigationFeatureTruth {
  const accepted = acceptsFeatureEvidence(value);
  return {
    checkpointAccepted: accepted,
    implementationComplete: accepted,
    featureAccepted: accepted,
    releaseGateAccepted: false,
    publicReadinessImplied: false
  };
}

function acceptsFeatureEvidence(value: unknown): boolean {
  if (!plainExact(value, ROOT_FIELDS)) return false;
  const input = value as Record<string, unknown>;
  if (input.version !== INTELLIGENCE_NAVIGATION_FEATURE_VERSION) return false;
  if (!Array.isArray(input.completedStates) || !sameOrderedStates(input.completedStates)) return false;
  if (!zeroCounterRecord(input.counters)) return false;
  if (!Array.isArray(input.consoleErrors) || input.consoleErrors.length !== 0) return false;
  if (!exactBooleanRecord(input.assertions, INTELLIGENCE_NAVIGATION_FEATURE_ASSERTIONS)) return false;
  if (!validCandidateRouteEvidence(input.candidateRouteEvidence)) return false;
  if (!validManualReview(input.manualScreenshotReview)) return false;
  if (!matchingFormalEvidence(input.formalEvidenceHashes)) return false;
  return matchingPackageFiles(input.packageFiles);
}

function sameOrderedStates(value: unknown[]): boolean {
  return value.length === INTELLIGENCE_NAVIGATION_FEATURE_STATES.length
    && value.every((state, index) => state === INTELLIGENCE_NAVIGATION_FEATURE_STATES[index])
    && new Set(value).size === value.length;
}

function zeroCounterRecord(value: unknown): boolean {
  if (!plainExact(value, INTELLIGENCE_NAVIGATION_FEATURE_HARD_COUNTERS)) return false;
  const counters = value as Record<string, unknown>;
  return INTELLIGENCE_NAVIGATION_FEATURE_HARD_COUNTERS.every((counter) => counters[counter] === 0);
}

function exactBooleanRecord(value: unknown, keys: readonly string[]): boolean {
  if (!plainExact(value, keys)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => record[key] === true);
}

function validCandidateRouteEvidence(value: unknown): boolean {
  if (!plainExact(value, ["runs"])) return false;
  const runs = (value as Record<string, unknown>).runs;
  if (!Array.isArray(runs) || runs.length < 2 || runs.length > 8) return false;
  const normalized = runs.flatMap((run) => {
    if (!plainExact(run, ["goalFingerprint", "count"])) return [];
    const record = run as Record<string, unknown>;
    if (typeof record.goalFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(record.goalFingerprint)) return [];
    if (!Number.isInteger(record.count) || (record.count as number) < 1 || (record.count as number) > 5) return [];
    return [{ goalFingerprint: record.goalFingerprint, count: record.count as number }];
  });
  return normalized.length === runs.length
    && new Set(normalized.map((run) => run.goalFingerprint)).size === normalized.length
    && new Set(normalized.map((run) => run.count)).size >= 2;
}

function validManualReview(value: unknown): boolean {
  if (!plainExact(value, ["reviewed", "captureCount", "captureHashesReverified"])) return false;
  const review = value as Record<string, unknown>;
  return review.reviewed === true
    && Number.isInteger(review.captureCount)
    && (review.captureCount as number) >= 20
    && review.captureHashesReverified === true;
}

function matchingFormalEvidence(value: unknown): boolean {
  if (!plainExact(value, ["before", "after"])) return false;
  const hashes = value as Record<string, unknown>;
  if (!hashRecord(hashes.before, INTELLIGENCE_NAVIGATION_FORMAL_EVIDENCE_KEYS)) return false;
  if (!hashRecord(hashes.after, INTELLIGENCE_NAVIGATION_FORMAL_EVIDENCE_KEYS)) return false;
  return INTELLIGENCE_NAVIGATION_FORMAL_EVIDENCE_KEYS.every((key) => (
    (hashes.before as Record<string, unknown>)[key] === (hashes.after as Record<string, unknown>)[key]
  ));
}

function matchingPackageFiles(value: unknown): boolean {
  if (!plainExact(value, ["before", "after"])) return false;
  const files = value as Record<string, unknown>;
  if (!hashRecord(files.before, ["packageJson", "packageLock"])) return false;
  if (!hashRecord(files.after, ["packageJson", "packageLock"])) return false;
  const before = files.before as Record<string, unknown>;
  const after = files.after as Record<string, unknown>;
  return before.packageJson === after.packageJson && before.packageLock === after.packageLock;
}

function hashRecord(value: unknown, keys: readonly string[]): boolean {
  if (!plainExact(value, keys)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === "string" && /^[a-f0-9]{64}$/u.test(record[key] as string));
}

function plainExact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
