export const TIANYI_CONTEXT_COMPANION_RELEASE_GATE_VERSION = "story-studio-tianyi-context-companion-v1-release-gate-v1" as const;

export const TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES = [
  "01-independent-bootstrap-and-feature-isolation",
  "02-canonical-roots-owner-separation-and-scan-exclusion",
  "03-resume-receipt-exact-source-and-bounded-copy",
  "04-memory-consent-scope-and-default-deny-grant",
  "05-independent-owner-conflicts-and-partial-success",
  "06-revoke-restore-hard-delete-and-tombstone",
  "07-cross-project-and-stale-grant-isolation",
  "08-persona-policy-runtime-disclosure-and-safe-refusal",
  "09-stale-context-offline-history-and-no-fallback",
  "10-pack-export-import-adversarial-staging",
  "11-restart-desktop-mobile-focus-and-conflict-independence",
  "12-final-independent-release-gate-summary"
] as const;

export const TIANYI_CONTEXT_COMPANION_RELEASE_GATE_REQUIRED_BOOLEANS = [
  "independentProject",
  "independentContinuityRoot",
  "independentAgentIdentity",
  "independentPersona",
  "independentPolicy",
  "independentMemorySet",
  "independentGrantSet",
  "independentPack",
  "independentRuntimeConfig",
  "independentStateFile",
  "independentServerPort",
  "independentBrowserContext",
  "independentFixtureCorpus",
  "independentEvidenceDirectory",
  "featureEvidenceUnchanged",
  "featureTagUnchanged",
  "packageLockUnchanged",
  "acceptedEvidenceUnchanged",
  "directCanonicalInspectionPassed",
  "browserInspectionPassed",
  "httpAdversarialInspectionPassed",
  "packAdversarialInspectionPassed",
  "embeddedRegressionsPassed",
  "screenshotsPresent",
  "screenshotsIndividuallyInspected",
  "mobileScrollObserved",
  "acceptanceSourceIntegrityPassed"
] as const;

export const TIANYI_CONTEXT_COMPANION_RELEASE_GATE_FALSE_BOOLEANS = [
  "publicReadinessImplied",
  "realModelQualityProven",
  "publicComprehensionProven",
  "regulatoryComplianceProven",
  "publicReleaseReady",
  "cloudSyncReady",
  "encryptionAtRestProvided"
] as const;

export const TIANYI_CONTEXT_COMPANION_RELEASE_GATE_COUNTERS = [
  "featureEvidenceImportedCount",
  "featureScreenshotsCopiedCount",
  "featureContinuityFilesCopiedCount",
  "featureAcceptanceFieldInputCount",
  "featureReducerImportCount",
  "hardcodedAcceptanceCount",
  "projectScanContinuityLeakCount",
  "authorGlobalRootMisownedCount",
  "pathEscapeAcceptedCount",
  "encodedTraversalAcceptedCount",
  "absolutePathAcceptedCount",
  "symlinkAcceptedCount",
  "ownerPathMismatchAcceptedCount",
  "unicodeCollisionAcceptedCount",
  "dangerousKeyAcceptedCount",
  "unknownFieldAcceptedCount",
  "oversizedBodyAcceptedCount",
  "unsupportedOriginAcceptedCount",
  "invalidTokenAcceptedCount",
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
  "fixtureNondeterministicOutputCount",
  "fullProjectSilentScanCount",
  "personalSensitiveExcerptCopiedCount",
  "hardDeletedContentResidueCount",
  "tombstoneContentLeakCount",
  "importedRuntimeAuthorityCount",
  "humanIdentityClaimCount",
  "relationshipExitObstructionCount"
] as const;

const ROOT_FIELDS = [
  "version",
  "states",
  "completedStates",
  "remainingStates",
  "captures",
  "booleans",
  "falseBooleans",
  "counters",
  "consoleErrors"
] as const;
const CAPTURE_FIELDS = ["state", "file", "sha256", "bytes", "viewport", "browserInspectionPassed"] as const;

export function reduceTianyiContextCompanionReleaseGate(value: unknown): boolean {
  if (!plainExact(value, ROOT_FIELDS)) return false;
  const input = value as Record<string, unknown>;
  if (input.version !== TIANYI_CONTEXT_COMPANION_RELEASE_GATE_VERSION) return false;
  if (!Array.isArray(input.states) || !sameOrderedStates(input.states)) return false;
  if (input.completedStates !== input.states.length || input.completedStates !== TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES.length) return false;
  if (!Array.isArray(input.remainingStates) || !sameRemainingStates(input.states, input.remainingStates)) return false;
  if (!Array.isArray(input.captures) || input.captures.length !== TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES.length) return false;
  for (let index = 0; index < input.captures.length; index += 1) {
    const capture = input.captures[index];
    if (!plainExact(capture, CAPTURE_FIELDS)) return false;
    const expected = TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES[index];
    if (capture.state !== expected || capture.file !== `${expected}.png`) return false;
    if (typeof capture.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(capture.sha256)) return false;
    if (!Number.isSafeInteger(capture.bytes) || Number(capture.bytes) <= 0) return false;
    if (typeof capture.viewport !== "string" || !/^\d+x\d+$/u.test(capture.viewport)) return false;
    if (capture.browserInspectionPassed !== true) return false;
  }
  if (!exactBooleanRecord(input.booleans, TIANYI_CONTEXT_COMPANION_RELEASE_GATE_REQUIRED_BOOLEANS, true)) return false;
  if (!exactBooleanRecord(input.falseBooleans, TIANYI_CONTEXT_COMPANION_RELEASE_GATE_FALSE_BOOLEANS, false)) return false;
  if (!plainExact(input.counters, TIANYI_CONTEXT_COMPANION_RELEASE_GATE_COUNTERS)) return false;
  const counters = input.counters as Record<string, unknown>;
  if (TIANYI_CONTEXT_COMPANION_RELEASE_GATE_COUNTERS.some((counter) => counters[counter] !== 0)) return false;
  return Array.isArray(input.consoleErrors) && input.consoleErrors.length === 0;
}

function sameOrderedStates(value: unknown[]): boolean {
  return value.length === TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES.length
    && value.every((state, index) => state === TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES[index])
    && new Set(value).size === value.length;
}

function sameRemainingStates(states: unknown[], remaining: unknown[]): boolean {
  const completed = new Set(states);
  const expected = TIANYI_CONTEXT_COMPANION_RELEASE_GATE_STATES.filter((state) => !completed.has(state));
  return remaining.length === expected.length && remaining.every((state, index) => state === expected[index]);
}

function exactBooleanRecord(value: unknown, keys: readonly string[], expected: boolean): boolean {
  if (!plainExact(value, keys)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => record[key] === expected);
}

function plainExact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
