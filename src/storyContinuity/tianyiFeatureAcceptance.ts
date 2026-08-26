export const TIANYI_CONTEXT_COMPANION_FEATURE_VERSION = "story-studio-tianyi-context-companion-v1" as const;

export const TIANYI_CONTEXT_COMPANION_FEATURE_STATES = [
  "01-project-resume-from-approved-stopping-point",
  "02-context-receipt-exact-sources",
  "03-memory-candidate-review-and-reject",
  "04-memory-candidate-accept-with-scope",
  "05-memory-edit-revoke-delete",
  "06-cross-project-memory-isolation",
  "07-persona-version-and-runtime-disclosure",
  "08-stale-context-invalidates-answer",
  "09-model-offline-local-history-readable",
  "10-continuity-pack-export-import-roundtrip",
  "11-no-manipulative-or-intimacy-copy",
  "12-mobile-memory-and-receipt-controls"
] as const;

export const TIANYI_CONTEXT_COMPANION_BOUNDARY_COUNTERS = [
  "implicitMemoryWriteCount",
  "rejectedCandidateDurableMemoryCount",
  "crossProjectMemoryLeakCount",
  "unauthorizedGlobalMemoryUseCount",
  "canonicalWritesFromTianyi",
  "markdownWritesFromTianyi",
  "visualDocumentWritesFromTianyi",
  "backgroundModelCallCount",
  "providerCredentialExportCount",
  "staleAnswerPresentedAsCurrentCount",
  "manipulativeRelationshipPatternCount",
  "intimacyPatternCount",
  "rawSecretCopiedToReceiptCount",
  "receiptExcerptLimitViolationCount",
  "deletedMemoryActiveCount",
  "deletedMemoryContentRevisionCount",
  "offlineHistoryReadFailureCount",
  "personaRuntimeDriftUndisclosedCount",
  "forcedClickCount",
  "coveredControlCount",
  "horizontalOverflowCount",
  "modelCalls",
  "externalNetworkCalls",
  "codexProcessLaunches",
  "sessionCloseAutoMemoryWriteCount",
  "stoppingPointAutoWriteCount",
  "archiveLoadedAsDefaultContextCount",
  "receiptSourceNotActuallyUsedCount",
  "adapterSourceNotRecordedInReceiptCount",
  "receiptMutationAcceptedCount",
  "silentContextRegenerationCount",
  "silentProviderFallbackCount",
  "providerTransferAllowedCount",
  "staleGrantAcceptedCount",
  "revokedMemoryProjectionCount",
  "deletedMemoryProjectionCount",
  "sensitiveMemoryDefaultProjectionCount",
  "restrictedMemoryPersistedCount",
  "duplicateCandidateDecisionCount",
  "duplicateMemoryCreatedOnRetryCount",
  "duplicateStoppingPointCreatedOnRetryCount",
  "destructiveRollbackAttemptCount",
  "importCanonicalOverwriteCount",
  "importedSkillAuthorityCount",
  "importStagingResidueAfterFailureCount",
  "credentialExportCount",
  "absolutePathLeakCount",
  "tokenLeakCount",
  "workspaceStateProseCopyCount",
  "drawerResizedWorkspaceCount",
  "drawerChangedVisualViewportCount",
  "focusReturnFailureCount",
  "keyboardTrapCount",
  "unlabeledControlCount",
  "mobileFocusedControlCoveredCount",
  "existingAiShellAcceptedEvidenceMutationCount",
  "existingStoryMemoryRecallRegressionCount",
  "fixtureModelCalls",
  "fixtureExternalNetworkCalls",
  "fixtureClockReads",
  "fixtureRandomReads",
  "fixtureRepositoryReads",
  "fixtureWriteCount",
  "fixtureNondeterministicOutputCount"
] as const;

export const TIANYI_CONTEXT_COMPANION_ASSERTIONS = [
  "defaultOpenZeroWrites",
  "resumeSourceReturnExact",
  "classificationsVisible",
  "receiptActualSourcesMatch",
  "receiptImmutable",
  "candidateRejectArchived",
  "candidateAcceptExactFinalValue",
  "grantDefaultFalse",
  "sensitiveSecondConfirmationVisible",
  "hardDeleteMinimalTombstone",
  "crossProjectIsolationVisible",
  "personaPolicyRuntimeVisible",
  "personaRuntimeDriftDisclosed",
  "staleExplicitRerunOnly",
  "offlineLocalHistoryReadable",
  "packExportIntegrityValid",
  "packImportReadOnly",
  "packPlaintextWarningVisible",
  "safeRelationshipCopy",
  "desktopOverlayStable",
  "mobileBottomSheet",
  "mobileScrollTopPositive",
  "mobileLastControlReachable",
  "focusReturnedToLauncher",
  "screenshotsIndividuallyInspected"
] as const;

const ROOT_FIELDS = ["version", "completedStates", "captures", "counters", "consoleErrors", "assertions"] as const;
const CAPTURE_FIELDS = ["state", "file", "sha256", "bytes"] as const;

export function reduceTianyiContextCompanionFeature(value: unknown): boolean {
  if (!plainExact(value, ROOT_FIELDS)) return false;
  const input = value as Record<string, unknown>;
  if (input.version !== TIANYI_CONTEXT_COMPANION_FEATURE_VERSION) return false;
  if (!Array.isArray(input.completedStates) || !sameOrderedStates(input.completedStates)) return false;
  if (!Array.isArray(input.captures) || input.captures.length !== TIANYI_CONTEXT_COMPANION_FEATURE_STATES.length) return false;
  for (let index = 0; index < input.captures.length; index += 1) {
    const capture = input.captures[index];
    if (!plainExact(capture, CAPTURE_FIELDS)) return false;
    const expected = TIANYI_CONTEXT_COMPANION_FEATURE_STATES[index];
    if (capture.state !== expected || capture.file !== `${expected}.png`) return false;
    if (typeof capture.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(capture.sha256)) return false;
    if (!Number.isSafeInteger(capture.bytes) || Number(capture.bytes) <= 0) return false;
  }
  if (!plainExact(input.counters, TIANYI_CONTEXT_COMPANION_BOUNDARY_COUNTERS)) return false;
  const counters = input.counters as Record<string, unknown>;
  if (TIANYI_CONTEXT_COMPANION_BOUNDARY_COUNTERS.some((counter) => counters[counter] !== 0)) return false;
  if (!Array.isArray(input.consoleErrors) || input.consoleErrors.length !== 0) return false;
  return exactBooleanRecord(input.assertions, TIANYI_CONTEXT_COMPANION_ASSERTIONS);
}

function sameOrderedStates(value: unknown[]): boolean {
  return value.length === TIANYI_CONTEXT_COMPANION_FEATURE_STATES.length
    && value.every((state, index) => state === TIANYI_CONTEXT_COMPANION_FEATURE_STATES[index])
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
