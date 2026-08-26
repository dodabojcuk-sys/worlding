export const INTELLIGENCE_NAVIGATION_CHECKPOINT_B_VERSION = "story-studio-intelligence-operating-model-navigation-v1-checkpoint-b" as const;

export const INTELLIGENCE_NAVIGATION_CHECKPOINT_B_STATES = [
  "01-legacy-navigation-migrated",
  "02-five-workspace-routing-and-localization-truth",
  "03-top-right-only-tianyi",
  "04-all-nuwa-entries-converge",
  "05-bounded-brief-created",
  "06-temporary-handoff-default-deny",
  "07-brief-revision-requires-reapproval",
  "08-brief-and-source-hash-enforced",
  "09-agent-skill-budget-enforced",
  "10-no-full-transcript-or-unauthorized-memory",
  "11-approved-brief-starts-existing-nuwa-run",
  "12-run-status-restart-recovered",
  "13-partial-run-not-impact-review-eligible",
  "14-stale-run-not-impact-review-eligible",
  "15-result-receipt-exact-provenance",
  "16-variable-bounded-candidate-routes",
  "17-return-to-tianyi-session",
  "18-return-to-writing-selection-and-scroll",
  "19-mobile-navigation-handoff-and-return",
  "20-final-checkpoint-b-summary"
] as const;

export const INTELLIGENCE_NAVIGATION_CHECKPOINT_B_HARD_COUNTERS = [
  "modelCalls",
  "externalNetworkCalls",
  "codexProcessLaunches",
  "providerFallbackCount",
  "localizationWriteCount",
  "canonicalMarkdownWrites",
  "canonicalVisualWrites",
  "unapprovedCanonicalWriteCount",
  "fullTranscriptCopyCount",
  "canonicalProseInWorkspaceStateCount",
  "implicitMemoryWriteCount",
  "temporaryDurableBriefCount",
  "temporaryTranscriptRunPackCount",
  "temporaryOrphanArtifactCount",
  "crossProjectSourceLeakCount",
  "unauthorizedGlobalMemoryUseCount",
  "deletedSourceAcceptedCount",
  "staleContextReceiptAcceptedCount",
  "unknownAgentAcceptedCount",
  "unknownSkillAcceptedCount",
  "budgetOverrunAcceptedCount",
  "unapprovedBriefExecutionCount",
  "staleApprovalExecutionCount",
  "briefHashMismatchAcceptedCount",
  "sourceSetHashMismatchAcceptedCount",
  "duplicateOperationRunCount",
  "parallelNuwaPlannerCount",
  "parallelNuwaRouteCount",
  "parallelNuwaRepositoryCount",
  "parallelImpactReviewCount",
  "resultUnusedSourceRefCount",
  "resultWrongBriefRevisionCount",
  "staleImpactReviewEligibleCount",
  "partialImpactReviewEligibleCount",
  "candidateAutoSelectionCount",
  "changeSetAutoCreationCount",
  "returnDestinationMismatchCount",
  "selectionReturnFalsePositiveCount",
  "scrollViewportReturnFalsePositiveCount",
  "missingDestinationSilentFallbackCount",
  "topRightNuwaLauncherCount",
  "navigationStateRemapCount",
  "fixedCandidateRouteCountConstantCount",
  "browserFilesystemPathExposureCount",
  "tokenOrCredentialExposureCount",
  "forcedClickCount",
  "coveredControlCount",
  "horizontalOverflowCount",
  "formalEvidenceMutationCount",
  "packageManifestMutationCount"
] as const;

export const INTELLIGENCE_NAVIGATION_CHECKPOINT_B_ASSERTIONS = [
  "legacyModesPreserveIdentity",
  "fiveWorkspaceRoutesReachable",
  "localizationUnavailableIsHonest",
  "activeLabelUniqueAndInactiveAccessible",
  "tianyiIsOnlyTopRightLauncher",
  "allNuwaEntriesUseSingleWorkspace",
  "executionBriefSchemaExactAndBounded",
  "briefRevisionInvalidatesApproval",
  "briefAndSourceHashesRechecked",
  "agentSkillAndBudgetAllowlisted",
  "temporaryHandoffRequiresExplicitRetention",
  "approvedBriefUsesExistingPlannerAndRepository",
  "duplicateOperationIsIdempotent",
  "runStatusRecoversAfterRestart",
  "partialAndStaleResultsRemainIneligible",
  "resultReceiptSchemaAndProvenanceExact",
  "candidateRoutesVariableAndBounded",
  "nuwaResultReturnsToOriginalTianyiSession",
  "returnDestinationUsesStableIdsOnly",
  "writingSelectionAndScrollRestored",
  "visualViewportAndSplitRestored",
  "missingDestinationReportedWithoutAliasFallback",
  "renamedDestinationResolvesByStableId",
  "desktopNavigationAndHandoffReachable",
  "mobileNavigationAndHandoffReachable",
  "saveAndConflictOwnershipUnchanged",
  "noProviderOrCanonicalAuthorityIntroduced",
  "formalEvidenceDirectoriesUnchanged",
  "packageFilesUnchanged",
  "screenshotsIndividuallyInspected"
] as const;

const ROOT_FIELDS = ["version", "completedStates", "counters", "consoleErrors", "assertions"] as const;

export function reduceIntelligenceNavigationCheckpointB(value: unknown): boolean {
  if (!plainExact(value, ROOT_FIELDS)) return false;
  const input = value as Record<string, unknown>;
  if (input.version !== INTELLIGENCE_NAVIGATION_CHECKPOINT_B_VERSION) return false;
  if (!Array.isArray(input.completedStates) || !sameOrderedStates(input.completedStates)) return false;
  if (!plainExact(input.counters, INTELLIGENCE_NAVIGATION_CHECKPOINT_B_HARD_COUNTERS)) return false;
  const counters = input.counters as Record<string, unknown>;
  if (INTELLIGENCE_NAVIGATION_CHECKPOINT_B_HARD_COUNTERS.some((counter) => counters[counter] !== 0)) return false;
  if (!Array.isArray(input.consoleErrors) || input.consoleErrors.length !== 0) return false;
  return exactBooleanRecord(input.assertions, INTELLIGENCE_NAVIGATION_CHECKPOINT_B_ASSERTIONS);
}

function sameOrderedStates(value: unknown[]): boolean {
  return value.length === INTELLIGENCE_NAVIGATION_CHECKPOINT_B_STATES.length
    && value.every((state, index) => state === INTELLIGENCE_NAVIGATION_CHECKPOINT_B_STATES[index])
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
