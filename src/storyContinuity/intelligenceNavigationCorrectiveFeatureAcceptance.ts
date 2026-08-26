import {
  INTELLIGENCE_NAVIGATION_FEATURE_ASSERTIONS,
  INTELLIGENCE_NAVIGATION_FEATURE_HARD_COUNTERS,
  INTELLIGENCE_NAVIGATION_FEATURE_STATES,
  INTELLIGENCE_NAVIGATION_FORMAL_EVIDENCE_KEYS
} from "./intelligenceNavigationFeatureAcceptance.ts";

export const INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_VERSION = "story-studio-intelligence-operating-model-navigation-v1-feature-corrective-v1" as const;
export const INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_STATES = INTELLIGENCE_NAVIGATION_FEATURE_STATES;

export const INTELLIGENCE_NAVIGATION_CORRECTIVE_FORMAL_EVIDENCE_KEYS = [
  "historicalFeature",
  ...INTELLIGENCE_NAVIGATION_FORMAL_EVIDENCE_KEYS,
  "worldLibrary",
  "foundation"
] as const;

export const CORRECTIVE_MEASUREMENT_METHODS = [
  "browser-dom",
  "browser-geometry",
  "http-probe",
  "repository-inspection",
  "canonical-tree-hash",
  "artifact-inspection",
  "git-integrity",
  "regression-result"
] as const;

export const INTELLIGENCE_NAVIGATION_CORRECTIVE_HARD_COUNTERS = [...new Set([
  ...INTELLIGENCE_NAVIGATION_FEATURE_HARD_COUNTERS,
  "missingMeasurementCount",
  "defaultedRequiredCounterCount",
  "hardcodedAcceptanceFieldCount",
  "blanketPositiveAssertionCount",
  "uncommittedProductSourceAtSmokeCount",
  "productTreeHashMismatchCount",
  "unlocalizedDynamicValueCount",
  "resultReceiptMissingUsedSourceCount",
  "excludedSourceMissingReasonCount",
  "excludedSourceReasonMismatchCount",
  "provenanceGeneralizationCount",
  "copiedCanonicalStoryProseCount",
  "canonicalStoryWritesFromTianyi",
  "canonicalStoryWritesFromNuwa"
])] as readonly string[];

export const INTELLIGENCE_NAVIGATION_CORRECTIVE_ASSERTIONS = [...new Set([
  ...INTELLIGENCE_NAVIGATION_FEATURE_ASSERTIONS.filter((name) => name !== "manualScreenshotReviewPassed"),
  "manualScreenshotReviewPassed",
  "measurementIntegrityPassed",
  "dynamicAuthorLanguagePassed",
  "resultReceiptProvenancePassed",
  "excludedSourceReasonsPassed",
  "historicalFeatureTagUnchanged",
  "historicalFeatureEvidenceUnchanged",
  "historicalFeatureAcceptanceSuperseded",
  "unauthorizedGateCommitReverted",
  "nonFormalGateEvidenceRejected",
  "productTreeHashMatches"
])] as readonly string[];

export type CorrectiveMeasurement = {
  field: string;
  value: number | boolean | string | string[];
  method: typeof CORRECTIVE_MEASUREMENT_METHODS[number];
  evidenceRefs: string[];
  derivation: string;
};

export type IntelligenceNavigationCorrectiveFeatureTruth = {
  checkpointAccepted: boolean;
  implementationComplete: boolean;
  featureAccepted: boolean;
  releaseGateAccepted: false;
  acceptanceReducerPassed: boolean;
  publicReadinessImplied: false;
  correctiveAcceptance: boolean;
  completedStates: number;
  remainingStates: string[];
  counters: Record<string, number>;
  assertions: Record<string, boolean>;
  testedProductTreeHash: string | null;
  finalProductTreeHash: string | null;
  productTreeHashMatches: boolean;
};

const ROOT_FIELDS = [
  "version",
  "completedStates",
  "measurements",
  "candidateRouteEvidence",
  "consoleErrors",
  "captures",
  "manualScreenshotReview",
  "formalEvidenceHashes",
  "packageFiles",
  "productTree",
  "provenance",
  "historicalIntegrity",
  "sourcePackage"
] as const;

const REQUIRED_CORRECTIVE_CAPTURE_IDS = [
  "corrective-dynamic-language-archive-and-receipt",
  "corrective-dynamic-language-status-and-object-types",
  "corrective-exact-result-receipt-provenance",
  "corrective-mobile-language-and-provenance"
] as const;

const REVIEW_CHECKS = [
  "sessionsEnglishAbsent",
  "contextReceiptsEnglishAbsent",
  "receiptEnglishAbsent",
  "storyEnglishAbsent",
  "archiveEnglishAbsent",
  "stoppingPointsEnglishAbsent",
  "memoryNoneEnglishAbsent",
  "rawStatusEnglishAbsent",
  "rawObjectTypeEnglishAbsent",
  "sourceCountsAccurate",
  "excludedReasonAccurate",
  "fixturePrefixAbsent",
  "secretOrStackAbsent",
  "controlsUncovered",
  "overflowAndFocusPassed"
] as const;

export function reduceIntelligenceNavigationCorrectiveFeature(value: unknown): IntelligenceNavigationCorrectiveFeatureTruth {
  const empty = emptyTruth();
  if (!plainExact(value, ROOT_FIELDS)) return empty;
  const input = value as Record<string, unknown>;
  if (input.version !== INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_VERSION) return empty;
  const states = validOrderedStates(input.completedStates) ? input.completedStates as string[] : [];
  const measurementResult = readMeasurements(input.measurements);
  const productTree = validProductTree(input.productTree) ? input.productTree as Record<string, unknown> : null;
  const counters = measurementResult?.counters ?? empty.counters;
  const assertions = measurementResult?.assertions ?? empty.assertions;
  const accepted = Boolean(
    states.length === INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_STATES.length
    && measurementResult
    && Object.values(counters).every((number) => number === 0)
    && Object.values(assertions).every(Boolean)
    && validCandidateRouteEvidence(input.candidateRouteEvidence)
    && Array.isArray(input.consoleErrors)
    && input.consoleErrors.length === 0
    && validManualReview(input.captures, input.manualScreenshotReview)
    && matchingFormalEvidence(input.formalEvidenceHashes)
    && matchingPackageFiles(input.packageFiles)
    && productTree
    && productTree.testedProductTreeHash === productTree.finalProductTreeHash
    && productTree.productTreeHashMatches === true
    && productTree.uncommittedProductSourceAtSmokeCount === 0
    && validProvenance(input.provenance, counters)
    && validHistoricalIntegrity(input.historicalIntegrity)
    && validSourcePackage(input.sourcePackage)
  );
  return {
    checkpointAccepted: accepted,
    implementationComplete: accepted,
    featureAccepted: accepted,
    releaseGateAccepted: false,
    acceptanceReducerPassed: accepted,
    publicReadinessImplied: false,
    correctiveAcceptance: accepted,
    completedStates: states.length,
    remainingStates: INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_STATES.filter((state) => !states.includes(state)),
    counters,
    assertions,
    testedProductTreeHash: typeof productTree?.testedProductTreeHash === "string" ? productTree.testedProductTreeHash : null,
    finalProductTreeHash: typeof productTree?.finalProductTreeHash === "string" ? productTree.finalProductTreeHash : null,
    productTreeHashMatches: Boolean(productTree?.productTreeHashMatches)
  };
}

function readMeasurements(value: unknown): { counters: Record<string, number>; assertions: Record<string, boolean> } | null {
  if (!Array.isArray(value)) return null;
  const expectedFields = [
    ...INTELLIGENCE_NAVIGATION_CORRECTIVE_HARD_COUNTERS.map((name) => `counter.${name}`),
    ...INTELLIGENCE_NAVIGATION_CORRECTIVE_ASSERTIONS.map((name) => `assertion.${name}`)
  ];
  if (value.length !== expectedFields.length) return null;
  const byField = new Map<string, CorrectiveMeasurement>();
  const methods = new Set<string>();
  const assertionRefs = new Set<string>();
  const assertionDerivations = new Set<string>();
  for (const item of value) {
    if (!plainExact(item, ["field", "value", "method", "evidenceRefs", "derivation"])) return null;
    const measurement = item as unknown as CorrectiveMeasurement;
    if (typeof measurement.field !== "string" || byField.has(measurement.field) || !expectedFields.includes(measurement.field)) return null;
    if (!(CORRECTIVE_MEASUREMENT_METHODS as readonly string[]).includes(measurement.method)) return null;
    if (!Array.isArray(measurement.evidenceRefs) || measurement.evidenceRefs.length === 0 || measurement.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim())) return null;
    if (typeof measurement.derivation !== "string" || measurement.derivation.length < 8 || /\b(?:default(?:ed)?|blanket|hardcoded?)\s+(?:value|zero|true|pass)/iu.test(measurement.derivation)) return null;
    byField.set(measurement.field, measurement);
    methods.add(measurement.method);
    if (measurement.field.startsWith("assertion.")) {
      assertionRefs.add(measurement.evidenceRefs[0]);
      assertionDerivations.add(measurement.derivation);
    }
  }
  if (methods.size < 5 || assertionRefs.size < INTELLIGENCE_NAVIGATION_CORRECTIVE_ASSERTIONS.length || assertionDerivations.size < INTELLIGENCE_NAVIGATION_CORRECTIVE_ASSERTIONS.length) return null;
  const counters: Record<string, number> = {};
  const assertions: Record<string, boolean> = {};
  for (const name of INTELLIGENCE_NAVIGATION_CORRECTIVE_HARD_COUNTERS) {
    const measurement = byField.get(`counter.${name}`);
    if (!measurement || !Number.isInteger(measurement.value) || (measurement.value as number) < 0) return null;
    counters[name] = measurement.value as number;
  }
  for (const name of INTELLIGENCE_NAVIGATION_CORRECTIVE_ASSERTIONS) {
    const measurement = byField.get(`assertion.${name}`);
    if (!measurement || typeof measurement.value !== "boolean") return null;
    assertions[name] = measurement.value;
  }
  return { counters, assertions };
}

function validOrderedStates(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length === INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_STATES.length
    && value.every((state, index) => state === INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_STATES[index])
    && new Set(value).size === value.length;
}

function validCandidateRouteEvidence(value: unknown): boolean {
  if (!plainExact(value, ["runs"])) return false;
  const runs = (value as Record<string, unknown>).runs;
  if (!Array.isArray(runs) || runs.length < 2 || runs.length > 8) return false;
  const normalized = runs.flatMap((run) => {
    if (!plainExact(run, ["goalFingerprint", "count", "routeIds", "measurementRef"])) return [];
    const item = run as Record<string, unknown>;
    if (typeof item.goalFingerprint !== "string" || !hash(item.goalFingerprint)) return [];
    if (!Number.isInteger(item.count) || (item.count as number) < 1 || (item.count as number) > 5) return [];
    if (!Array.isArray(item.routeIds) || item.routeIds.length !== item.count || new Set(item.routeIds).size !== item.routeIds.length) return [];
    if (item.routeIds.some((id) => typeof id !== "string" || !id)) return [];
    if (typeof item.measurementRef !== "string" || !item.measurementRef) return [];
    return [{ goalFingerprint: item.goalFingerprint, count: item.count as number }];
  });
  return normalized.length === runs.length
    && new Set(normalized.map((run) => run.goalFingerprint)).size === normalized.length
    && new Set(normalized.map((run) => run.count)).size >= 2;
}

function validManualReview(capturesValue: unknown, reviewValue: unknown): boolean {
  if (!Array.isArray(capturesValue) || capturesValue.length < 24) return false;
  const captures = capturesValue.flatMap((capture) => {
    if (!plainExact(capture, ["id", "file", "viewport", "sha256", "bytes"])) return [];
    const item = capture as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.file !== "string" || typeof item.viewport !== "string" || typeof item.sha256 !== "string" || !hash(item.sha256) || !Number.isInteger(item.bytes) || (item.bytes as number) <= 0) return [];
    return [item as { id: string; file: string; viewport: string; sha256: string; bytes: number }];
  });
  if (captures.length !== capturesValue.length || new Set(captures.map((item) => item.id)).size !== captures.length) return false;
  if (REQUIRED_CORRECTIVE_CAPTURE_IDS.some((id) => !captures.some((capture) => capture.id === id))) return false;
  if (!plainExact(reviewValue, ["reviewed", "captureCount", "captureHashesReverified", "records"])) return false;
  const review = reviewValue as Record<string, unknown>;
  if (review.reviewed !== true || review.captureHashesReverified !== true || review.captureCount !== captures.length || !Array.isArray(review.records) || review.records.length !== captures.length) return false;
  const byId = new Map(captures.map((capture) => [capture.id, capture]));
  return review.records.every((record) => {
    if (!plainExact(record, ["id", "sha256", "reviewed", "findings", "checklist"])) return false;
    const item = record as Record<string, unknown>;
    const capture = typeof item.id === "string" ? byId.get(item.id) : null;
    return Boolean(capture)
      && item.sha256 === capture?.sha256
      && item.reviewed === true
      && Array.isArray(item.findings)
      && item.findings.length === 0
      && plainExact(item.checklist, REVIEW_CHECKS)
      && REVIEW_CHECKS.every((check) => (item.checklist as Record<string, unknown>)[check] === true);
  });
}

function validProductTree(value: unknown): boolean {
  if (!plainExact(value, ["testedProductTreeHash", "finalProductTreeHash", "productTreeHashMatches", "testedHead", "uncommittedProductSourceAtSmokeCount", "includedRoots"])) return false;
  const tree = value as Record<string, unknown>;
  return hash(tree.testedProductTreeHash)
    && hash(tree.finalProductTreeHash)
    && tree.productTreeHashMatches === true
    && typeof tree.testedHead === "string"
    && hash(tree.testedHead)
    && tree.uncommittedProductSourceAtSmokeCount === 0
    && Array.isArray(tree.includedRoots)
    && tree.includedRoots.length >= 8
    && tree.includedRoots.every((root) => typeof root === "string" && root.length > 0);
}

function validProvenance(value: unknown, counters: Record<string, number>): boolean {
  if (!plainExact(value, ["resultReceipt", "excludedSources", "runtime", "sourceSummary", "briefIntegrity", "contentBoundaries"])) return false;
  const provenance = value as Record<string, unknown>;
  if (!plainExact(provenance.resultReceipt, ["receiptSourceRefs", "actualUsedSourceRefs", "selectedSourceRefs"])) return false;
  const receipt = provenance.resultReceipt as Record<string, unknown>;
  if (![receipt.receiptSourceRefs, receipt.actualUsedSourceRefs, receipt.selectedSourceRefs].every((item) => Array.isArray(item) && item.every((ref) => typeof ref === "string"))) return false;
  const receiptRefs = receipt.receiptSourceRefs as string[];
  const actualRefs = receipt.actualUsedSourceRefs as string[];
  if (new Set(receiptRefs).size !== receiptRefs.length || new Set(actualRefs).size !== actualRefs.length) return false;
  if (difference(receiptRefs, actualRefs).length !== counters.resultReceiptUnusedSourceCount) return false;
  if (difference(actualRefs, receiptRefs).length !== counters.resultReceiptMissingUsedSourceCount) return false;
  if (!Array.isArray(provenance.excludedSources)) return false;
  const exclusions = provenance.excludedSources as unknown[];
  const allowedReasons = new Set(["not-selected", "not-authorized", "stale", "deleted", "scope-mismatch", "duplicate", "sensitivity-redacted", "unsupported"]);
  const missingReasons = exclusions.filter((item) => !plainExact(item, ["sourceRef", "reason", "expectedReason"]) || !(item as Record<string, unknown>).reason).length;
  const mismatchedReasons = exclusions.filter((item) => plainExact(item, ["sourceRef", "reason", "expectedReason"]) && (item as Record<string, unknown>).reason !== (item as Record<string, unknown>).expectedReason).length;
  if (exclusions.some((item) => plainExact(item, ["sourceRef", "reason", "expectedReason"]) && !allowedReasons.has(String((item as Record<string, unknown>).reason)))) return false;
  if (missingReasons !== counters.excludedSourceMissingReasonCount || mismatchedReasons !== counters.excludedSourceReasonMismatchCount) return false;
  if (!plainExact(provenance.runtime, ["recordedAdapterId", "observedAdapterId", "recordedAdapterVersion", "observedAdapterVersion"])) return false;
  const runtime = provenance.runtime as Record<string, unknown>;
  if (runtime.recordedAdapterId !== runtime.observedAdapterId || runtime.recordedAdapterVersion !== runtime.observedAdapterVersion) return false;
  if (!plainExact(provenance.sourceSummary, ["currentContext", "actualCurrentContext", "contextReceipts", "actualContextReceipts", "archiveMessages", "actualArchiveMessages", "authorizedMemories", "actualAuthorizedMemories"])) return false;
  const summary = provenance.sourceSummary as Record<string, unknown>;
  if (Object.values(summary).some((number) => !Number.isInteger(number) || (number as number) < 0)) return false;
  if (summary.currentContext !== summary.actualCurrentContext || summary.contextReceipts !== summary.actualContextReceipts || summary.archiveMessages !== summary.actualArchiveMessages || summary.authorizedMemories !== summary.actualAuthorizedMemories) return false;
  if (summary.currentContext === 0) return false;
  if (!plainExact(provenance.briefIntegrity, ["briefRevisionMatches", "briefHashMatches", "sourceSetHashMatches"])) return false;
  if (!Object.values(provenance.briefIntegrity as Record<string, unknown>).every(Boolean)) return false;
  if (!plainExact(provenance.contentBoundaries, ["fullTranscriptCopies", "canonicalStoryProseCopies"])) return false;
  const boundaries = provenance.contentBoundaries as Record<string, unknown>;
  return boundaries.fullTranscriptCopies === counters.fullTranscriptTransferCount
    && boundaries.canonicalStoryProseCopies === counters.copiedCanonicalStoryProseCount;
}

function validHistoricalIntegrity(value: unknown): boolean {
  if (!plainExact(value, ["historicalFeatureTag", "historicalFeatureTagTarget", "expectedHistoricalFeatureTagTarget", "historicalFeatureEvidenceUnchanged", "historicalFeatureAcceptanceSuperseded", "unauthorizedGateCommit", "additiveRevertCommit", "unauthorizedGateCommitReverted", "nonFormalGateEvidenceAccepted"])) return false;
  const integrity = value as Record<string, unknown>;
  return integrity.historicalFeatureTag === "world-os-story-studio-intelligence-operating-model-navigation-v1"
    && integrity.historicalFeatureTagTarget === "4005c4adbbda4ccf3e5b24c52c299a37500b993b"
    && integrity.historicalFeatureTagTarget === integrity.expectedHistoricalFeatureTagTarget
    && integrity.historicalFeatureEvidenceUnchanged === true
    && integrity.historicalFeatureAcceptanceSuperseded === true
    && integrity.unauthorizedGateCommit === "5df9139"
    && typeof integrity.additiveRevertCommit === "string"
    && /^63a0308[0-9a-f]*$/u.test(integrity.additiveRevertCommit)
    && integrity.unauthorizedGateCommitReverted === true
    && integrity.nonFormalGateEvidenceAccepted === false;
}

function validSourcePackage(value: unknown): boolean {
  return plainExact(value, ["kind", "historicalFeatureResultImported", "nonFormalGateResultImported", "fixtureCorpusId"])
    && (value as Record<string, unknown>).kind === "fresh-corrective-fixture"
    && (value as Record<string, unknown>).historicalFeatureResultImported === false
    && (value as Record<string, unknown>).nonFormalGateResultImported === false
    && typeof (value as Record<string, unknown>).fixtureCorpusId === "string"
    && String((value as Record<string, unknown>).fixtureCorpusId).startsWith("corrective-v1-");
}

function matchingFormalEvidence(value: unknown): boolean {
  if (!plainExact(value, ["before", "after"])) return false;
  const hashes = value as Record<string, unknown>;
  if (!hashRecord(hashes.before, INTELLIGENCE_NAVIGATION_CORRECTIVE_FORMAL_EVIDENCE_KEYS) || !hashRecord(hashes.after, INTELLIGENCE_NAVIGATION_CORRECTIVE_FORMAL_EVIDENCE_KEYS)) return false;
  return INTELLIGENCE_NAVIGATION_CORRECTIVE_FORMAL_EVIDENCE_KEYS.every((key) => (hashes.before as Record<string, unknown>)[key] === (hashes.after as Record<string, unknown>)[key]);
}

function matchingPackageFiles(value: unknown): boolean {
  if (!plainExact(value, ["before", "after"])) return false;
  const files = value as Record<string, unknown>;
  if (!hashRecord(files.before, ["packageJson", "packageLock"]) || !hashRecord(files.after, ["packageJson", "packageLock"])) return false;
  return (files.before as Record<string, unknown>).packageJson === (files.after as Record<string, unknown>).packageJson
    && (files.before as Record<string, unknown>).packageLock === (files.after as Record<string, unknown>).packageLock;
}

function emptyTruth(): IntelligenceNavigationCorrectiveFeatureTruth {
  return {
    checkpointAccepted: false,
    implementationComplete: false,
    featureAccepted: false,
    releaseGateAccepted: false,
    acceptanceReducerPassed: false,
    publicReadinessImplied: false,
    correctiveAcceptance: false,
    completedStates: 0,
    remainingStates: [...INTELLIGENCE_NAVIGATION_CORRECTIVE_FEATURE_STATES],
    counters: Object.fromEntries(INTELLIGENCE_NAVIGATION_CORRECTIVE_HARD_COUNTERS.map((name) => [name, -1])),
    assertions: Object.fromEntries(INTELLIGENCE_NAVIGATION_CORRECTIVE_ASSERTIONS.map((name) => [name, false])),
    testedProductTreeHash: null,
    finalProductTreeHash: null,
    productTreeHashMatches: false
  };
}

function difference(left: string[], right: string[]): string[] { const allowed = new Set(right); return left.filter((item) => !allowed.has(item)); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{40,64}$/u.test(value); }
function hashRecord(value: unknown, keys: readonly string[]): boolean { return plainExact(value, keys) && keys.every((key) => hash((value as Record<string, unknown>)[key])); }
function plainExact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
