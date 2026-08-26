export const TIANYI_CHECKPOINT_B_VERSION = "story-studio-tianyi-context-companion-v1-checkpoint-b" as const;

export const TIANYI_CHECKPOINT_B_STATES = [
  "01-context-projection-exact-allowlist-and-default-deny",
  "02-project-resume-current-stale-and-missing",
  "03-deterministic-response-and-classifications",
  "04-context-receipt-exact-used-sources-and-redaction",
  "05-context-change-invalidates-current-response",
  "06-memory-candidate-reject-writes-zero-memory",
  "07-memory-candidate-accept-scope-and-global-grant",
  "08-memory-edit-revoke-restore-delete",
  "09-independent-owner-conflicts-and-partial-success",
  "10-session-close-candidates-require-author-confirmation",
  "11-restart-offline-and-cross-project-isolation",
  "12-final-checkpoint-b-summary"
] as const;

export const TIANYI_CHECKPOINT_B_BOUNDARY_COUNTERS = [
  "implicitMemoryWriteCount", "rejectedCandidateDurableMemoryCount", "sessionCloseAutoMemoryWriteCount", "stoppingPointAutoWriteCount",
  "crossProjectMemoryLeakCount", "unauthorizedGlobalMemoryUseCount", "staleGrantAcceptedCount", "revokedMemoryProjectionCount",
  "deletedMemoryProjectionCount", "sensitiveMemoryDefaultProjectionCount", "restrictedMemoryPersistedCount", "archiveLoadedAsDefaultContextCount",
  "fullProjectSilentScanCount", "rawSecretCopiedToReceiptCount", "personalSensitiveExcerptCopiedCount", "receiptExcerptLimitViolationCount",
  "receiptSourceNotActuallyUsedCount", "adapterSourceNotRecordedInReceiptCount", "receiptMutationAcceptedCount", "staleAnswerPresentedAsCurrentCount",
  "silentContextRegenerationCount", "silentProviderFallbackCount", "providerTransferAllowedCount", "archiveSequenceViolationAcceptedCount",
  "duplicateCandidateDecisionCount", "duplicateMemoryCreatedOnRetryCount", "duplicateStoppingPointCreatedOnRetryCount", "destructiveRollbackAttemptCount",
  "canonicalWritesFromTianyi", "markdownWritesFromTianyi", "visualDocumentWritesFromTianyi", "workspaceStateProseCopyCount",
  "absolutePathLeakCount", "tokenLeakCount", "backgroundActivityCount", "backgroundModelCallCount", "fixtureModelCalls",
  "fixtureExternalNetworkCalls", "fixtureClockReads", "fixtureRandomReads", "fixtureRepositoryReads", "fixtureWriteCount",
  "fixtureNondeterministicOutputCount", "manipulativeRelationshipPatternCount", "intimacyPatternCount", "offlineHistoryReadFailureCount",
  "restartContinuityLossCount", "existingStoryMemoryRecallRegressionCount", "existingAiShellEvidenceMutationCount", "modelCalls",
  "externalNetworkCalls", "codexProcessLaunches"
] as const;

export type TianyiCheckpointBResult = {
  version: typeof TIANYI_CHECKPOINT_B_VERSION;
  checkpoint: "B";
  checkpointAccepted: boolean;
  implementationComplete: false;
  featureAccepted: false;
  releaseGateAccepted: false;
  completedStates: number;
  remainingStates: string[];
  states: Array<{ state: string; passed: boolean; evidence: string }>;
  counters: Record<string, number>;
  checkpointAEvidence: { baseline: Record<string, string>; current: Record<string, string> };
  focusedTestsPassed: boolean;
};

export function reduceTianyiCheckpointBAcceptance(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const result = value as Partial<TianyiCheckpointBResult>;
  if (result.version !== TIANYI_CHECKPOINT_B_VERSION || result.checkpoint !== "B") return false;
  if (result.implementationComplete !== false || result.featureAccepted !== false || result.releaseGateAccepted !== false) return false;
  if (result.focusedTestsPassed !== true || !Array.isArray(result.states) || result.states.length !== TIANYI_CHECKPOINT_B_STATES.length) return false;
  if (result.states.some((item, index) => !item || item.state !== TIANYI_CHECKPOINT_B_STATES[index] || item.passed !== true || typeof item.evidence !== "string" || !item.evidence)) return false;
  if (new Set(result.states.map((item) => item.state)).size !== TIANYI_CHECKPOINT_B_STATES.length) return false;
  if (result.completedStates !== TIANYI_CHECKPOINT_B_STATES.length || !Array.isArray(result.remainingStates) || result.remainingStates.length !== 0) return false;
  if (!result.counters || Object.keys(result.counters).length !== TIANYI_CHECKPOINT_B_BOUNDARY_COUNTERS.length) return false;
  for (const counter of TIANYI_CHECKPOINT_B_BOUNDARY_COUNTERS) if (result.counters[counter] !== 0) return false;
  const evidence = result.checkpointAEvidence;
  if (!evidence || !sameRecord(evidence.baseline, evidence.current) || Object.keys(evidence.baseline).sort().join(",") !== "capture-results.json,report") return false;
  return true;
}

function sameRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left).sort();
  return keys.length === Object.keys(right).length && keys.every((key) => typeof left[key] === "string" && /^[a-f0-9]{64}$/u.test(left[key]) && left[key] === right[key]);
}
