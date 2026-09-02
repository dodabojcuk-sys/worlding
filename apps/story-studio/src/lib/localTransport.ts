import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import type { CharacterCardWorldProjection, CharacterRelationGroupConfig } from "../../../../src/storyCardPresentation/characterCardWorldProjection";
import type { StoryStudioEventReference } from "../../../../src/storyContracts/storyStudioEventReference";
import type { StoryObservationProposalPatch } from "../../../../src/storyContracts/storyObservationProposalPatch.ts";
import type { StoryStudioObjectProfile } from "../../../../src/storyContracts/storyStudioObjectProfile.ts";
import type { StoryStudioAgentDraftMode } from "../../../../src/storyContracts/storyStudioAgentDraft.ts";
import type { GoldenLoopCandidateReview, GoldenLoopCandidateReviewHistoryEntry, GoldenLoopResult } from "./goldenLoopContract";
import type { NuwaSceneCandidateR0, NuwaSceneComparisonR0, NuwaSceneReplayR0, NuwaSceneSimulationReadModelR0 } from "../../../../src/nuwaSceneRuntimeContracts.ts";
import type { NuwaBoundedProjection } from "./nuwaBoundedContract";
import type { NuwaDirectorPermissionKindR1, NuwaDirectorStateR1 } from "../../../../src/storyContracts/nuwaDirectorR1.ts";
import type { SourceImportCandidateR0, SourceImportDocumentR0, SourceImportHandoffR0 } from "../../../../src/storyContracts/sourceImportReviewR0.ts";
import type {
  RelationDirectionR0,
  RelationEvidenceRefR0,
  RelationEvidenceStatusR0,
  RelationMutationResultR0,
  RelationReadProjectionR0,
  RelationReceiptR0,
  RelationReviewStateR0,
  RelationTypeDefinitionR0,
  RelationTypeMutationResultR0
} from "../../../../src/storyControlSurface/storyStudioRelationOperations.ts";

export type { GoldenLoopCandidate, GoldenLoopCandidateReviewHistoryEntry, GoldenLoopResult } from "./goldenLoopContract";
export type { SourceImportCandidateR0, SourceImportDocumentR0, SourceImportHandoffR0 } from "../../../../src/storyContracts/sourceImportReviewR0.ts";
export type { NuwaDirectorPermissionKindR1, NuwaDirectorStateR1 } from "../../../../src/storyContracts/nuwaDirectorR1.ts";
export type { NuwaBoundedProjection } from "./nuwaBoundedContract";

export type StoryStudioIntelligenceMode = "world" | "writing" | "intelligence" | "localization" | "publish";
export type CuratedCreationPlugin = {
  manifest: {
    pluginId: string;
    displayName: string;
    pluginVersion: string;
    releaseSequence: number;
    description: string;
    publisher: string;
    upstreamRepository: string;
    upstreamCommitOrRelease: string;
    licenseSpdx: string;
    licenseNotice: string;
    capabilities: string[];
    pluginKind: string;
    supportedPlatforms: string[];
    packageSha256: string;
    entrypoint: string;
    runtime: string;
    runtimeClass: "safe_transform" | "external_executable";
    permissions: string[];
    resourceLimits: Record<string, unknown>;
    expectedArtifacts: string[];
    healthCheck: string;
    minimumTianyanVersion: string;
    installMode: string;
    updateChannel: string;
    externalServiceRequired: boolean;
    modelManagedByTianyan: false;
  };
  installState: "unavailable" | "installable" | "installed" | "disabled" | "update-available" | "incompatible" | "quarantined";
  executionState: "runnable" | "unavailable" | "quarantined";
  installed: { pluginVersion: string; releaseSequence: number; enabled: boolean; packageSha256: string; runtimeClass: "safe_transform" | "external_executable" } | null;
  packageAvailable: boolean;
  packageSizeBytes: number | null;
  compatible: boolean;
  integrity: { quarantined: boolean; reason: string | null } | null;
};
export type NuwaCandidateAuthorViewModel = {
  direction: string;
  keyAction: string;
  directResult: string;
  downstreamImpact: string;
  causalDifference: string;
  risks: string[];
  unknowns: string[];
  knowledgeBoundary: string;
};
export type NuwaAttentionContext = {
  capsuleHash?: string;
  authorQuestion: string;
  focus: { sceneTitle: string };
  pinnedSourceIds: string[];
  actorKnowledge: Array<{ actorId: string; label: string; knownFacts: string[]; unknowns: string[] }>;
  confirmedFacts: string[];
  unresolvedClues: string[];
  includedSources: Array<{ sourceId: string; label: string; reason: string }>;
  excludedSources: Array<{ sourceId: string; label: string; reason: string }>;
};
export type TianyiNuwaExecutionBrief = {
  version: "story-studio-tianyi-nuwa-execution-brief/v1";
  briefId: string;
  revision: number;
  authorGoal: string;
  sourceQuestion?: string;
  sourceProject: { projectId: string; projectRevision: string };
  currentContext: { mode: StoryStudioIntelligenceMode; documentId: string; objectIds: string[]; selectionRef: string };
  selectedContextReceiptIds: string[];
  selectedArchiveMessageRefs: Array<{ sessionId: string; messageId: string }>;
  approvedMemoryRefs: string[];
  mustKeep: string[];
  mustAvoid: string[];
  unresolvedQuestions: string[];
  expectedOutputKind: "candidate-routes";
  requestedRunCount?: number;
  fixedSeeds?: number[];
  allowedAgents: string[];
  allowedSkills: string[];
  capabilityBudget: { maxAgentRuns: number; maxSkillCalls: number; maxTokens: number; timeoutSeconds: number };
  sensitivity: "project-private" | "personal-sensitive";
  authorApprovalState: "draft" | "approved";
  expectedHashes: { brief: string; sourceSet: string };
  operationId: string;
  originatingTianyiSessionId: string;
  returnDestination: { mode: StoryStudioIntelligenceMode; documentId: string; selectionRef: string };
  attentionContext?: NuwaAttentionContext;
};
export type NuwaResultReceipt = {
  version: "story-studio-nuwa-result-receipt/v1";
  resultReceiptId: string;
  briefId: string;
  briefRevision: number;
  operationId: string;
  agentsUsed: string[];
  skillsUsed: string[];
  sourceRefs: string[];
  candidateRouteIds: string[];
  disagreements: string[];
  unresolvedQuestions: string[];
  staleState: "current" | "stale" | "partial";
  impactReviewEligible: boolean;
  returnDestination: { tianyiSessionId: string; mode: StoryStudioIntelligenceMode; documentId: string; selectionRef: string };
};
export type IntelligenceBridgeResume = {
  brief: TianyiNuwaExecutionBrief | null;
  exploration: StoryExploration | null;
  resultReceipt: NuwaResultReceipt | null;
};
export type ExecutionBriefDraftInput = Omit<TianyiNuwaExecutionBrief, "version" | "briefId" | "revision" | "sourceProject" | "authorApprovalState" | "expectedHashes"> & { projectId: string };
export type ExecutionBriefChanges = Partial<Pick<ExecutionBriefDraftInput,
  "authorGoal" | "currentContext" | "selectedContextReceiptIds" | "selectedArchiveMessageRefs" |
  "approvedMemoryRefs" | "mustKeep" | "mustAvoid" | "unresolvedQuestions" | "expectedOutputKind" |
  "allowedAgents" | "allowedSkills" | "capabilityBudget" | "sensitivity" | "returnDestination"
>>;

export type StoryStudioProject = {
  id: string;
  title: string;
  status: string;
  genre: string | null;
  ambience: string | null;
  counts: { chapters: number; scenes: number; objects: number };
  source: "markdown";
};

export type StoryStudioBootstrap = {
  activeProject: StoryStudioProject | null;
  recentProjects: StoryStudioProject[];
  projects: StoryStudioProject[];
  recovery?: { code: string; message: string };
};

export type StorageProviderConnection = {
  providerId: "local-folder";
  kind: "local-folder";
  label: string;
  status: "ready";
  locationSelection: "managed";
};

export type StorageTransparency = {
  version: "story-studio-storage-transparency/v1";
  providerId: "local-folder";
  kind: "local-folder";
  label: string;
  status: "ready";
  locationSelection: "managed";
  projectId: string;
  libraryPath: string;
  projectPath: string;
  persistenceState: "verified-local" | "unavailable";
  revealSupported: boolean;
  revealLabel: string;
  backupMode: "configured-separate-directory" | "manual-folder-copy";
  fullExportState: "available" | "blocked-backup-root-required";
};

export type WorkspaceExportReceipt = { packageName: string; packagePath: string; fileCount: number; exportedAt: string };
export type WorkspaceImportReceipt = { projectId: string; fileCount: number; importedAt: string };

export type AgentPermissionProfile = "general" | "auto-review" | "full-access";
export type AgentActionKind = "read-context" | "draft-write" | "library-write" | "temporary-character" | "rehearsal-run" | "event-impact-review" | "confirmed-event" | "permanent-delete" | "branch-merge" | "external-action";
export type AgentActivityReceipt = { id: string; recordedAt: string; actor: "tianyi" | "nuwa" | "author"; action: AgentActionKind; targets: string[]; outcome: "allowed" | "requires-author" | "blocked"; reason: string; reversible: boolean; checkpointId: string | null; actionClass: "read" | "draft" | "persistent" | "review" | "protected" | "external"; projectScope: string; targetType: string; riskLevel: "low" | "medium" | "high" | "critical"; estimatedProviderCost: number; requiredPermission: AgentPermissionProfile | "author-confirmation" };
export type AgentPermissionState = { version: "story-studio-action-permission-broker/v1"; profile: AgentPermissionProfile; updatedAt: string; receipts: AgentActivityReceipt[] };

export type ModelServiceStatus = {
  version: "story-studio-model-service/v1";
  providers: Array<{
    id: string;
    configured: boolean;
    callCount: number;
    lastLatencyMs: number | null;
    lastUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    lastTraceId: string | null;
  }>;
  models: Array<{ providerId: string; id: string; label: string; capabilities: string[] }>;
  profiles: Array<{
    id: string;
    label: string;
    purpose: string;
    providerId: string;
    modelId: string;
    maxOutputTokens: number;
    streaming: true;
  }>;
  profile: ProviderProfileProjection;
  livePilot?: {
    version: string;
    candidateCount: number;
    maxCalls: number;
    maxCostUsd: number;
    priceStatus: "verified" | "unverified";
    fixtureStatus: "configured" | "unconfigured";
    seedSupport: "unsupported" | "supported";
  };
  tianyiDialogue: {
    ready: boolean;
    reason: "provider-unconfigured" | "provider-disabled" | "model-unselected" | null;
  };
  agentRuntime?: {
    state: "active" | "disabled" | "missing" | "incompatible" | "initialization-failed" | "fallback";
    requestedPluginId: string | null;
    activePluginId: string | null;
    fallbackFromPluginId: string | null;
    message: string | null;
    manifest: {
      id: string;
      pluginVersion: string;
      upstreamVersion: string;
      hostApiRange: string;
      capabilities: string[];
    } | null;
    health: {
      status: "healthy" | "degraded" | "unavailable";
      message: string | null;
    };
  };
};

export type ProviderProfileProjection = {
  schemaVersion: 2;
  revision: number;
  activeProfileId: string;
  profile: {
    id: string;
    provider: "siliconflow" | "radeon-cloud";
    displayName: string;
    baseUrl: string;
    modelId: string;
    enabled: boolean;
    credentialRef: string;
    connectionStatus: "unknown" | "verified" | "failed" | "disabled";
    lastVerifiedAt: string | null;
    lastError: string | null;
    availableModels: string[];
    lastModelDiscoveryAt: string | null;
    updatedAt: string;
  } | null;
  history: ProviderOperationHistoryEntry[];
  credential: {
    configured: boolean;
    backend: "macos-keychain" | "local-file-development-only" | "process-memory" | "unknown" | string;
  };
  storage: {
    scope: "authoritative" | "development-isolated" | "test-isolated";
    smokeCompatibleByDefault: boolean;
    compatibilityNotice: string | null;
  };
};

export type ProviderOperationHistoryEntry = {
  id: string;
  kind: "save" | "reload" | "models" | "connection" | "credential" | "disable" | "inference";
  status: "success" | "failed";
  occurredAt: string;
  modelId: string | null;
  modelCount: number | null;
  latencyMs: number | null;
  error: string | null;
  traceId: string | null;
};

export type ProviderSessionConnection = {
  version: "story-studio-provider-session/v1";
  connected: true;
  providerId: "siliconflow" | "radeon-cloud";
  modelId: string;
  profileId: string;
  availableModelCount: number;
  profile?: ProviderProfileProjection;
};

export type TianyiObjectContextRef = {
  version: "story-tianyi-object-context-ref/v1";
  ownerType: "markdown-object" | "markdown-writing" | "visual-map" | "visual-timeline";
  objectType: "character" | "location" | "event" | "item" | "rule" | "chapter" | "scene" | "selection" | "map-marker" | "map-region" | "timeline-event";
  stableId: string;
  projectId: string;
  ownerId: string;
  contentHash: string;
  state: "current" | "stale" | "missing" | "unauthorized";
  inclusion: "included" | "excluded";
  label: string;
};

export type TianyiGroundedAccessSelection =
  | { accessMode: "author"; subjectRef: null }
  | { accessMode: "character"; subjectRef: TianyiObjectContextRef };

export type TianyiGroundedContextRequest = {
  version: "story-tianyi-grounded-context-request/v1";
  projectId: string;
  sessionId: string;
  taskKind: "grounded-answer";
  accessMode: "author" | "character";
  subjectRef: TianyiObjectContextRef | null;
  sceneRef: TianyiObjectContextRef | null;
  explicitRefs: TianyiObjectContextRef[];
  eventRefs?: StoryStudioEventReference[];
};

export type TianyiGroundedSourceManifestEntry = {
  sourceType: "writing" | "scene" | "world-object" | "rule" | "memory";
  projectId: string;
  sourceId: string;
  sourceKey: string;
  contentHash: string;
  wireContentHash: string;
  lane: "scene" | "subject" | "constraint" | "memory" | "evidence";
  decision: "included" | "excluded" | "budget-omitted" | "conflicting";
  reasonCode: string | null;
  deterministicOrder: number;
  estimatedBudget: number;
};

export type TianyiGroundedSourceManifest = {
  version: "story-tianyi-grounded-source-manifest/v1";
  request: {
    projectId: string;
    sessionId: string;
    taskKind: "grounded-answer";
    accessMode: "author" | "character";
    subjectRef: string | null;
    sceneRef: string | null;
    explicitRefs: string[];
  };
  hardBudget: number;
  included: TianyiGroundedSourceManifestEntry[];
  excluded: TianyiGroundedSourceManifestEntry[];
  budgetOmitted: TianyiGroundedSourceManifestEntry[];
  conflicting: TianyiGroundedSourceManifestEntry[];
  digest: string;
};

export type TianyiGroundedAnswer = {
  summary: string;
  claims: Array<{ statement: string; status: "fact" | "candidate" | "inference" | "unknown"; sourceRefs: string[]; uncertaintyReason: string | null }>;
  status: "fact" | "candidate" | "inference" | "unknown";
  sourceRefs: string[];
  uncertaintyReason: string | null;
  includedSources: string[];
  excludedSources: Array<{ sourceRef: string; reason: string }>;
};

export type TianyiGroundedAnswerResult = {
  status: "current" | "partial";
  partialState: "PREPARED" | "PROVIDER_UNCERTAIN" | "RESULT_STAGED" | "RECEIPT_COMMITTED_UNACKNOWLEDGED" | "COMPLETED";
  retryRequired: boolean;
  sessionId: string;
  submissionId: string;
  questionAttemptKey: string;
  authorMessageId: string;
  responseMessageId: string | null;
  receiptId: string;
  answer: TianyiGroundedAnswer | null;
  sourceManifest: TianyiGroundedSourceManifest;
  includedSources: TianyiGroundedSourceManifestEntry[];
  excludedSources: TianyiGroundedSourceManifestEntry[];
  attemptCount: number;
  providerDispatchCount: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  alreadyCompleted: boolean;
};

export class LocalTransportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "LocalTransportError";
  }
}

export type WorldObjectType = "character" | "location" | "event" | "item" | "faction" | "rule" | "thread";

export type WorldObjectSummary = {
  id: string;
  relativeId: string;
  title: string;
  type: WorldObjectType;
  status: string;
  tags: string[];
  aliases: string[];
  revisionToken: string;
  /** Read-only source-note timestamp used by the Library recent projection. */
  updatedAt?: string;
  source: "markdown";
  agentTypeId?: string | null;
};

export type AgentTypeBaseCapability = "role" | "item" | "location" | "organization";
export type AgentTypeFieldKind = "text" | "longText" | "number" | "boolean" | "date" | "enum";
export type AgentTypeDefinition = {
  typeId: string;
  label: string;
  description: string;
  baseCapability: AgentTypeBaseCapability;
  fieldDefinitions: Array<{
    fieldId: string;
    label: string;
    kind: AgentTypeFieldKind;
    description: string;
    required: boolean;
    defaultValue: string | number | boolean | null;
    status: "active" | "retired";
    displayOrder: number;
    options?: string[];
  }>;
  status: "draft" | "active" | "retired";
  revision: number;
  provenance: { kind: "author" | "migration" | "system"; sourceRef?: string };
  createdAt: string;
  updatedAt: string;
  builtin: boolean;
};
export type AgentTypeObjectReference = { objectId: string; objectRevision: string; relativePath: string; title: string; sourceType: string; typeId: string; typeRevision: number };
export type AgentTypeResolution = {
  objectId: string;
  objectRevision: string;
  relativePath: string;
  title: string;
  sourceType: string;
  state: "classified" | "uncertain";
  typeId: string | null;
  typeRevision: number | null;
  explicitBinding: boolean;
  reason: string | null;
};
export type AgentTypeDirectory = { typeId: string; label: string; description: string; baseCapability: AgentTypeBaseCapability; status: "draft" | "active" | "retired"; typeRevision: number; count: number; objects: AgentTypeObjectReference[] };
export type ClassifiedAgentLibraryProjection = { version: "story-agent-library-projection/v1"; catalogRevision: number; directories: AgentTypeDirectory[] };
export type UncertainAgentLibraryProjection = { version: "story-agent-library-projection/v1"; catalogRevision: number; items: Array<
  | { kind: "world-object"; objectId: string; objectRevision: string; relativePath: string; title: string; sourceType: string; reason: string }
  | { kind: "agent-recognition-proposal"; proposalId: string; revision: number; objectKind: string; suggestedName: string; status: string; sourceEventId: string }
> };

export type WorldObject = WorldObjectSummary & {
  canonicalReadVerified?: boolean;
  body: string;
  revisionToken: string;
  properties: Record<string, string | string[]>;
  agentTypeFieldValues?: Record<string, string | number | boolean>;
  knowledgeSubjects: string[];
  subtype: string;
  typedProperties: CharacterProperty[];
  propertyDiagnostics: Array<{ code: string; propertyKey: string | null; message: string }>;
  profile: StoryStudioObjectProfile | null;
  linkedObjects: WorldObjectSummary[];
  backlinks: WorldObjectSummary[];
  card: ObjectCardComposition;
  visualReferences: ObjectVisualReference[];
  worldProjection: CharacterCardWorldProjection | null;
};

/** Browser transport projection of the durable, pre-confirmation Agent proposal owner. */
export type AgentRecognitionProposalValue = null | boolean | number | string | AgentRecognitionProposalValue[] | { [key: string]: AgentRecognitionProposalValue };
export type AgentRecognitionProposalStatus = "pending" | "edited" | "confirming" | "confirmed" | "merging" | "merged" | "ignored";
export type AgentRecognitionProposal = {
  proposalId: string;
  projectId: string;
  storyId: string;
  tianyiSessionId: string;
  sourceEventId: string;
  sourceReceiptId: string;
  sourceWorkspace: string;
  objectKind: "character" | "location" | "item" | "rule" | "custom_object";
  suggestedName: string;
  suggestedFields: Record<string, AgentRecognitionProposalValue>;
  evidence: Array<{ sourceRef: string; excerpt: string }>;
  uncertainties: string[];
  duplicateMatches: Array<{ objectId: string; objectKind: string; displayName: string; reason: string }>;
  status: AgentRecognitionProposalStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  targetObjectRef: { projectId: string; objectId: string; objectKind: string } | null;
  applicationReceipt: { operationId: string; mode: "confirm" | "merge"; appliedAt: string } | null;
  activeApplication: { operationId: string; mode: "confirm" | "merge"; targetObjectId: string } | null;
  lastError: { code: string; message: string; operationId: string; occurredAt: string } | null;
};

export type AgentProposalCharacterApplication = {
  title: string;
  status: string;
  tags: string[];
  aliases: string[];
  body: string;
  profile?: StoryStudioObjectProfile | null;
};

export type AgentProposalObjectApplication = AgentProposalCharacterApplication & {
  objectType: "character" | "item" | "location";
};

export type CharacterPropertyType = "text" | "number" | "boolean" | "date-like-text" | "object-reference" | "object-reference-list" | "enum";
export type CharacterProperty = {
  key: string;
  label: string;
  type: CharacterPropertyType;
  enumOptions: string[];
  value: string | number | boolean | string[] | null;
  references: Array<{ id: string; title: string | null; type: WorldObjectType | null; missing: boolean }>;
};

export type ObjectCardBlockType = "text" | "secret" | "character-arc" | "property-group" | "relation-group" | "properties" | "connections" | "media" | "map" | "graph" | "timeline" | "tree" | "canvas";
export type ObjectCardBlock = {
  id: string;
  kind: ObjectCardBlockType;
  contentRef?: string;
  presentationRef?: string;
  label?: string;
  propertyKeys?: string[];
  relationConfig?: CharacterRelationGroupConfig;
  collapsed: boolean;
  size: "small" | "medium" | "large";
};
export type ObjectCardImage = { assetRef: string; fit: "cover" | "contain"; position: { x: number; y: number } };
export type ObjectCardComposition = {
  version: "story-card-presentation/v2";
  objectId: string;
  preset: "character";
  layout: "vertical" | "horizontal";
  portrait: ObjectCardImage | null;
  cover: ObjectCardImage | null;
  templateRef: string | null;
  blocks: ObjectCardBlock[];
  visual: { density: "comfortable" | "compact"; mediaAssets: string[] };
  revisionToken: string | null;
  source: "virtual-v1" | "presentation-json";
  diagnostics: Array<{ code: string; message: string; blockId?: string; contentRef?: string; sectionId?: string }>;
  migration: { required: boolean; cleanupPending: boolean };
};
export type ObjectVisualReference = { type: VisualDocumentType; title: string; relativePath: string };

export type CardTemplate = {
  version: "story-card-template/v1";
  id: string;
  label: string;
  targetType: "character";
  preset: "character";
  sections: Array<{ slot: string; kind: "text" | "secret" | "character-arc"; label: string; repeatable: boolean }>;
  propertyDefinitions: Array<{ key: string; label: string; type: CharacterPropertyType; enumOptions: string[] }>;
  blocks: Array<{ slot: string; kind: ObjectCardBlockType; sectionSlot?: string; label?: string; propertyKeys?: string[]; collapsed: boolean; size: "small" | "medium" | "large" }>;
  visualDefaults: { layout: "horizontal" | "vertical"; density: "comfortable" | "compact"; portraitSlot: boolean; coverSlot: boolean };
  revisionToken: string;
};

export type CharacterTemplateDiff = {
  version: "story-card-template-diff/v1";
  templateId: string;
  missingSections: Array<{ slot: string; kind: "text" | "secret" | "character-arc"; label: string; sectionId: string; contentRef: string }>;
  missingPropertyDefinitions: CardTemplate["propertyDefinitions"];
  propertyTypeConflicts: Array<{ key: string; existingType: string; templateType: string }>;
  missingBlocks: ObjectCardBlock[];
  templateOverwriteCount: 0;
  hasChanges: boolean;
};

export type WorldLibraryBootstrap = {
  project: StoryStudioProject;
  objects: WorldObjectSummary[];
  visualDocuments: Array<{ id: string; relativePath: string; title: string; type: VisualDocumentType; source: "visual-json" }>;
  folders: WorkspaceFolder[];
  placements: WorkspacePlacement[];
  folderRevision: string;
  counts: Record<WorldObjectType, number>;
  tabs: string[];
  activeObject: WorldObject | null;
  selection: WorkspaceSelection;
  source: "markdown";
};

export type ObjectCatalogRecord = {
  projectId: string; workVersionId: string; objectType: string; objectId: string; categoryId: string | null;
  trashedAt: string | null; trashedFrom: "active" | "archived" | null; displayOrder: number | null; createdAt: string; updatedAt: string;
};
export type ObjectCatalogState = { schemaVersion: "tianyan-object-catalog/v1"; projectId: string; workVersionId: string; revision: number; records: ObjectCatalogRecord[] };

export type CanonReadFailureKind = "authority-failure" | "parse-failure" | "invalid-record" | "repository-io" | "project-boundary";
export type CanonReadFailure = { kind: CanonReadFailureKind; message: string };
export type VerifiedCanonEventListRead =
  | { status: "ready"; eventIds: string[]; invalidRecordCount: number }
  | { status: "error"; error: CanonReadFailure };
export type VerifiedCanonEventDetailRead =
  | { status: "ready"; event: WorldObject }
  | { status: "error"; error: CanonReadFailure };

export type WorkspaceFolder = { id: string; title: string; parentId: string | null; kind: "folder" | "custom-category"; order: number };
export type WorkspacePlacement = { documentId: string; folderId: string; order: number };
export type R9AWorkflowTask = { id: string; title: string; lane: "library" | "relationship" | "event" | "nuwa" | "creation" | "recovery" | "multiverse"; state: "queued" | "active" | "blocked" | "done"; sourceRefs: string[]; createdAt: string; updatedAt: string };
export type R9AWorkflowState = { version: "story-studio-r9a-workflow/v1"; tasks: R9AWorkflowTask[]; updatedAt: string; contentHash: string };
export type R9AProjectBackup = { id: string; title: string; kind: "backup" | "pre-restore-checkpoint"; createdAt: string; fileCount: number; totalBytes: number; fingerprint: string };
export type RevisionDocumentRef = { kind: "object" | "visual" | "card" | "template" | "artifact"; id: string };
export type DocumentRevision = { id: string; sequence: number; source: "create" | "save" | "restore" | "external-baseline"; recordedAt: string; restoredFromRevisionId: string | null; operationId?: string | null };
export type DocumentMilestone = { id: string; title: string; revisionId: string; sequence: number };
export type DocumentRevisionHistory = { version: "story-document-history/v1"; document: RevisionDocumentRef; revisions: DocumentRevision[]; milestones: DocumentMilestone[] };
export type DocumentRevisionPreview = { revision: DocumentRevision; milestoneTitles: string[]; changedFromCurrent: boolean; summary: string; semanticChanges: Array<{ kind: string; label: string; detail: string }>; preview: string; previewTruncated: boolean };

export type WritingDocumentSummary = {
  id: string;
  relativeId: string;
  title: string;
  type: "chapter" | "scene";
  status: string;
  chapterId: string | null;
  source: "markdown";
};

export type WritingGuard = {
  characters: WorldObjectSummary[];
  locations: WorldObjectSummary[];
  events: WorldObjectSummary[];
  rules: Array<{ id: string; title: string; status: string; summary: string }>;
  threads: Array<{ id: string; title: string; status: string; summary: string }>;
};

export type WritingDocument = WritingDocumentSummary & {
  body: string;
  revisionToken: string;
  knowledgeSubjects: string[];
  linkedRuleIds: string[];
  guard: WritingGuard;
  mentionedObjects: WorldObjectSummary[];
};

export type WritingBootstrap = {
  chapters: Array<WritingDocumentSummary & { scenes: WritingDocumentSummary[] }>;
  activeDocument: WritingDocument | null;
  selection: WorkspaceSelection;
  source: "markdown";
};

export type StoryUnitSourceKind = "event-line" | "nuwa-run" | "nuwa-candidate" | "tianyi-intent" | "story-workspace" | "writing-selection" | "library" | "import";
export type NarrativeAuthority = "canon" | "author-intent" | "candidate" | "inference" | "belief" | "unknown" | "conflict" | "derived";
export type OutputArtifactType = "novel" | "screenplay" | "storyboard" | "comic" | "motion-comic" | "interactive-drama";
export type StoryUnitSourceRef = { sourceKind: StoryUnitSourceKind; ownerId: string; entityId: string; entityVersion?: string; capturedAt: string; staleState?: "fresh" | "stale" | "missing" };
export type StoryUnitItem = { id: string; kind: string; authority: NarrativeAuthority; possibilityStatus?: "proposed" | "compared" | "selected-for-output" | "rejected" | "paused" | "abandoned"; content: Record<string, unknown>; sourceRefs: StoryUnitSourceRef[]; evidenceRefs?: string[]; subjectRef?: string; createdBy: "author" | "system" | "ai" };
export type StoryCollectionPoint = { id: string; title: string; eventIds: string[]; order: number; collapsed: boolean; sourceVersionRef: string; revision: number; layout: { x: number; y: number; pinned: boolean }; lastOperationId: string };
export type StoryCollectionPointReceipt = { operationId: string; action: "created" | "updated" | "dissolved"; unitId: string; collectionPointId: string; eventIds: string[]; formalEventWrites: 0; formalRelationWrites: 0 };
export type StoryUnitKind = "main" | "branch";
export type StoryUnitStatus = "draft" | "active" | "candidate" | "conflict" | "archived";
export type StoryUnit = { id: string; relativeId: string; title: string; summary: string; kind: StoryUnitKind; parentUnitId: string | null; branchPointEventId: string | null; mergeTargetUnitId: string | null; order: number; sourceVersionRef: string | null; status: StoryUnitStatus; objective: string; coreConflict: string; turningPoint: string; openHook: string; lifecycle: "draft" | "active" | "frozen" | "superseded" | "archived"; sourceRefs: StoryUnitSourceRef[]; items: StoryUnitItem[]; collectionPoints: StoryCollectionPoint[]; linkedEntityIds: string[]; unresolvedQuestionIds: string[]; generationConstraints: Record<string, unknown>; version: string; createdAt: string; updatedAt: string; source: "markdown" };
export type OutputSourceUnitRef = { unitId: string; unitVersion: string; role: "primary" | "supporting"; includedItemIds: string[] };
export type CreationSourceReconciliationReceipt = { schemaVersion: "tianyan-creation-source-reconciliation-receipt/r0"; artifactId: string; originalArtifactRevisionId: string; newArtifactRevisionId: string; sourceWorkVersionId: string; fromRevision: number; fromManifestDigest: string; toRevision: number; toManifestDigest: string; semanticDiffDigest: `sha256:${string}`; bodyDigestBefore: `sha256:${string}`; bodyDigestAfter: `sha256:${string}`; confirmedDifferenceIds: string[]; unresolvedDifferenceIds: string[]; idempotencyKey: string; executionStage: "artifact_revision_appended"; expectedWorkVersionReceiptId: string; blockedReason: null; createdAt: string };
export type WorkVersionOutputArtifactSource = { schemaVersion: "tianyan-work-version-output-artifact-source/r0"; sourceKind: "work-version"; projectId: string; workVersionId: string; workVersionKind: "root"; pinnedRevision: number; manifestId: string; manifestDigest: string; selectedStoryUnitRefs: Array<{ unitId: string; unitVersion: string }>; selectedEventRefs: Array<{ eventId: string; eventRevision: string }>; sourceAnchorRefs: string[]; neutralStoryPackageId: string; neutralStoryPackageDigest: `sha256:${string}`; sourceOwnerReceiptRefs: string[]; creationOperationReceipt: { operationId: string; idempotencyKey: string; payloadDigest: `sha256:${string}` }; sourceReconciliationReceipt?: CreationSourceReconciliationReceipt; createdAt: string };
export type OutputArtifact = { schemaVersion: "story-studio-output-artifact/v2"; id: string; relativeId: string; type: OutputArtifactType; title: string; sourceUnits: OutputSourceUnitRef[]; generationBrief: Record<string, unknown> | null; content: string; structure: Record<string, unknown>; lifecycle: "draft" | "queued" | "generating" | "review" | "approved" | "archived"; currentRevisionId: string; provenance: { sourceArtifactId: string | null; sourceArtifactVersion: string | null; migratedFromVersion: string | null; workVersionSource: WorkVersionOutputArtifactSource | null }; version: string; createdAt: string; updatedAt: string; source: "markdown" };
export type CreationSourceSemanticDifference = { id: string; kind: "added" | "removed" | "changed" | "unchanged" | "unknown" | "conflict" | "missing"; state: "changed" | "unchanged" | "unknown" | "conflict" | "stale" | "insufficient" | "integrated"; dimension: string; ownerKind: string; summary: string; sourceRefs: string[]; affectsArtifact: boolean; authorConfirmable: boolean };
export type CreationSourceDriftCompare = { schemaVersion: "tianyan-owner-referenced-semantic-compare/r0"; version: "tianyan-creation-source-drift-compare/r0"; status: "ready" | "blocked_concurrency" | "blocked_missing_reference" | "blocked_corrupt_reference"; sourceStatus: "historical_valid"; baseRevision: number; currentRevision: number; baseManifestDigest: string; currentManifestDigest: string; ownerDigestChanges: Array<{ ownerKind: string; changed: boolean }>; differences: CreationSourceSemanticDifference[]; artifactImpactDifferenceIds: string[]; confirmableDifferenceIds: string[]; unresolvedDifferenceIds: string[]; blockerMessage: string | null };
export type CreationSourcePortState = { version: "tianyan-project-scoped-creation-source-port/r0" | "tianyan-work-version-bound-creation-fixture-r0/v1"; project: { id: string; title: string }; root: { id: string; name: string; kind: "root"; revision: number; status: "active" | "archived"; manifestId: string; manifestDigest: string } | null; derivedVersionCount: number; storyUnit: { id: string; title: string; version: string; summary: string; itemCount: number }; events: Array<{ id: string; title: string; revision: string; status: string }>; package: { id: string; digest: string; scope: { kind: string; unitIds: string[]; label: string }; sourceAnchors: Array<{ anchorId: string; sourceKind: string; ownerId: string; entityId: string; entityVersion: string | null; capturedAt: string; staleState: string }>; warnings: string[]; storyMarkdown: string } | null; artifact: OutputArtifact | null; authorText: string; legacyArtifact: OutputArtifact | null; revisionHistory: DocumentRevisionHistory | null; sourceValidation: { status: "current" | "historical_valid" | "archived_valid" | "unverifiable_missing" | "unverifiable_corrupt"; sourceReadable: true; sourceDependentOperationsAllowed: boolean; authorMessage: string; technicalReason: string | null } | null; sourceCompare: CreationSourceDriftCompare | null; reconciliation: { status: "completed" | "artifact_revision_appended"; receipt: CreationSourceReconciliationReceipt; bodyUnchanged: boolean; workVersionReceiptVerified: boolean } | null; recovery: { pendingAppend: boolean; artifactSourcePinnedRevision: number | null }; writes: { outputArtifactRevisions: number; workVersionRevisions: number; provider: 0; plugin: 0; canon: 0; event: 0; worldState: 0; character: 0; relation: 0; session: 0; archive: 0; memory: 0 }; multiverseExpansion: "HOLD" };
export type WorkVersionBoundCreationFixture = CreationSourcePortState;
export type NormalEventCreationState = {
  version: "tianyan-normal-event-creation-port/r0";
  project: { id: string; title: string };
  storyUnits: Array<{ id: string; title: string; summary: string; version: string }>;
  selectedStoryUnitId: string | null;
  planning: { id: string; title: string; body: string; revision: string } | null;
  candidate: { id: string; status: string; candidates: Array<{ id: string; title: string; summary: string; status: string }> } | null;
  impact: { id: string; status: string; impact?: { evidenceCoverage?: string }; options: Array<{ id: string; label: string; summary: string }> } | null;
  changeSet: { id: string; status: string; application: { appliedEventId: string | null } } | null;
  confirmedEvents: Array<{ id: string; title: string; revision: string }>;
  writeBoundary: { canon: 0; worldState: 0; character: 0; relation: 0; memory: 0; provider: 0; plugin: 0 };
};
export type CreationMediaAsset = { id: string; fileName: string; kind: "image" | "audio" | "video" | "reference"; mimeType: string; size: number; width: number | null; height: number | null; durationMs: number | null; source: string; license: string; generatedBy: string; tags: string[]; relativePath: string; createdAt: string; updatedAt: string; backlinks: Array<{ artifactId: string; artifactTitle: string; structurePath: string }> };
export type CreationMediaCatalog = { version: "story-studio-media-catalog/v1"; assets: CreationMediaAsset[]; contentHash: string | null; source: "creation-media-json" };

export type WritingContinuity = {
  version: "story-studio-writing-continuity-product/v1";
  state: "exact" | "target-missing" | "revision-stale";
  activeDestination: "world" | "tianyi" | "event-line" | "nuwa" | "multiverse" | "library" | "writing";
  returnDestination: "world" | "tianyi" | "event-line" | "nuwa" | "multiverse" | "library" | "writing";
  workspaceMode: string;
  showWorldHome: boolean;
  documentId: string;
  revisionToken: string;
  selection: WorkspaceSelection;
  editorSelection: { start: number; end: number } | null;
  scrollTop: number;
  focus: "writing-editor" | "workspace";
};

export type UpdateWorldObjectResult = {
  conflict: boolean;
  markdownConflict: boolean;
  presentationConflict: boolean;
  characterContentSaved: boolean;
  presentationSaved: boolean;
  unplacedContentCreated: boolean;
  migrationCleanupPending: boolean;
  object: WorldObject;
};

export type VisualDocumentType = "map" | "graph" | "canvas" | "timeline" | "tree";
export type VisualViewport = { x: number; y: number; zoom: number };
export type VisualOverlay = Record<string, string | number | boolean>;

export type MapAsset = { assetPath: string; mimeType: string; width: number; height: number };
export type MapBackground = MapAsset & { id: string; title: string; opacity: number; visible: boolean };
export type MapLayer = { id: string; title: string; visible: boolean; locked: boolean };
export type MapMarker = { id: string; objectId: string; layerId: string; x: number; y: number; color: string; labelMode: "always" | "hover" | "hidden" };
export type MapRegion = { id: string; title: string; layerId: string; points: Array<{ x: number; y: number }>; strokeColor: string; fillColor: string; fillOpacity: number; objectId: string | null };
export type MapLabel = { id: string; text: string; layerId: string; x: number; y: number; fontSize: number; fontWeight: 400 | 500 | 600 | 700; align: "left" | "center" | "right"; rotation: number; visible: boolean; treatment: "none" | "outline" | "plate" };
export type MapContent = {
  baseImage: MapAsset | null;
  backgrounds: MapBackground[];
  activeBackgroundId: string | null;
  layers: MapLayer[];
  markers: MapMarker[];
  regions: MapRegion[];
  labels: MapLabel[];
};

export type GraphNode = { id: string; objectId: string; x: number; y: number };
export type GraphEdge = { id: string; relationId?: string | null; source: string; target: string; relation: string; direction: "forward" | "reverse" | "both" | "none" };
export type GraphRelationProposal = GraphEdge & {
  origin: "graph" | "tree";
  sourceDocumentId: string | null;
};
export type GraphRelationRef = { relationId: string; visualId: string; source: string; target: string; kind: "confirmed" | "candidate" };
export type GraphContent = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  proposals: GraphRelationProposal[];
  relationRefs?: GraphRelationRef[];
  relationAuthority?: { version: string; status: "ready" | "legacy-readonly"; repositoryRevision?: number; migrationRequired?: boolean };
  filters: { objectTypes: string[] };
};
export type RelationRecord = RelationReadProjectionR0;
export type RelationTypeDefinition = RelationTypeDefinitionR0;
export type RelationEvidence = RelationEvidenceRefR0;
export type RelationEvidenceStatus = RelationEvidenceStatusR0;
export type RelationReceipt = RelationReceiptR0;
export type RelationTemporalMetadata = import("../../../../src/storyControlSurface/storyStudioRelationOperations.ts").RelationTemporalMetadataR0;
export type RelationListResponse = { repositoryVersion: string; repositoryRevision: number; relations: RelationReadProjectionR0[] };
export type RelationTypeListResponse = { repositoryRevision: number; types: RelationTypeDefinitionR0[] };
export type RelationDuplicateSuggestions = { version: string; suggestions: RelationReadProjectionR0[]; history: RelationReadProjectionR0[] };
export type CanvasNode = { id: string; kind: "object" | "text" | "image" | "excerpt"; objectId: string; text: string; assetPath: string; x: number; y: number; width: number; height: number };
export type CanvasEdge = { id: string; source: string; target: string; label: string };
export type CanvasGroup = { id: string; title: string; nodeIds: string[] };
export type CanvasContent = { nodes: CanvasNode[]; edges: CanvasEdge[]; groups: CanvasGroup[] };
export type TimelineLane = { id: string; title: string; color: string; order?: number };
export type TimelineEntry = { id: string; eventId: string; laneId: string; order: number };
export type TimelineTrackView = {
  id: string;
  kind: "canon" | "planning" | "character" | "location" | "custom";
  refId: string | null;
  order: number;
  visible: boolean;
  collapsed: boolean;
};
export type TimelineDependency = { id: string; fromEventId: string; toEventId: string; kind: "requires" };
export type TimelineContent = {
  lanes: TimelineLane[];
  entries: TimelineEntry[];
  trackViews: TimelineTrackView[];
  dependencies: TimelineDependency[];
  filters: { mode: "all" | "canon" | "planning"; objectIds: string[] };
  viewport: { focusedTrackId: string | null; density: "compact" | "comfortable" };
};
export type TimelineDiagnostics = {
  entryStates: Array<{ entryId: string; eventId: string; status: "canonical" | "planned" | "missing" | "ineligible" }>;
  projectedEntries: Array<{
    entryId: string;
    eventId: string;
    trackIds: string[];
    characterIds: string[];
    locationIds: string[];
    plannedFromEventId: string | null;
  }>;
  canonicalLinks: Array<{ planningEventId: string; canonicalEventId: string }>;
  issues: Array<{ code: string; key: string; sourceId: string; targetId: string }>;
};
export type PlanningEventTimelineResult = {
  planningNoteCreated: boolean;
  planningEventId: string;
  timelineEntryAdded: boolean;
  timelineConflict: boolean;
  noteConflict: boolean;
  recoveryAction: null | { kind: "reload-and-add-existing-planning-event"; planningEventId: string; timelineRelativePath: string };
  document: TimelineDocument;
};
export type AddPlanningEventResult = {
  planningEventId: string;
  timelineEntryAdded: boolean;
  timelineConflict: boolean;
  document: TimelineDocument;
};
export type PlanningEventResult = { conflict: boolean; object: WorldObject };
export type TimelineValidationResult = { valid: boolean; conflict: boolean; reason: string | null };
export type TreeContent = {
  sourceGraphPath: string;
  includedEdgeIds: string[];
  rootObjectIds: string[];
  collapsedObjectIds: string[];
  direction: "LR" | "TB";
};

type VisualDocumentBase = {
  version: "story-visual-document/v1";
  id: string;
  title: string;
  objectRefs: string[];
  viewport: VisualViewport;
  overlays: { evidence: VisualOverlay[]; risks: VisualOverlay[]; candidateChanges: VisualOverlay[] };
  relativePath: string;
  contentHash: string;
  source: "visual-json";
};

export type MapDocument = VisualDocumentBase & { type: "map"; content: MapContent };
export type GraphDocument = VisualDocumentBase & { type: "graph"; content: GraphContent };
export type CanvasDocument = VisualDocumentBase & { type: "canvas"; content: CanvasContent };
export type TimelineDocument = VisualDocumentBase & { type: "timeline"; content: TimelineContent; diagnostics: { timeline: TimelineDiagnostics } };
export type TreeDocument = VisualDocumentBase & { type: "tree"; content: TreeContent };
export type VisualDocument = MapDocument | GraphDocument | CanvasDocument | TimelineDocument | TreeDocument;

export type VisualWorkbenchBootstrap = {
  documents: VisualDocument[];
  primaryDocument: VisualDocument | null;
  secondaryDocument: VisualDocument | null;
  tabs: string[];
  splitView: boolean;
  active: boolean;
  source: "visual-json";
};

export type VisualAsset = { relativePath: string; mimeType: string; size: number; source: "local-asset" };

export type ImpactReview = {
  version: "story-studio-impact-review-product/v1";
  id: string;
  status: "pending" | "selected" | "rejected" | "stale";
  source: {
    kind: "scene" | "planning-event";
    id: string;
    title: string;
    sceneId: string;
    sceneTitle: string;
    planningEventId: string | null;
    authorGoal: string;
    involvedObjects: Array<{ id: string; title: string; type: string }>;
    lockedRules: string[];
    originLabel: string;
  };
  impact: {
    characters: Array<{ id: string; summary: string }>;
    events: Array<{ id: string; summary: string }>;
    relationships: Array<{ id: string; summary: string }>;
    rulesAndLocations: Array<{ id: string; summary: string }>;
    risks: string[];
    opportunities: string[];
    evidenceCoverage: string;
    evidenceCount: number;
  };
  options: Array<{ id: string; label: string; summary: string; consequence: string; riskLevel: "low" | "medium" | "high"; selected: boolean }>;
  evidence: Array<{ title: string; explanation: string; sources: string[] }>;
  preview: null | { before: string[]; change: string[]; after: string[]; longTermPressure: string[]; preservedMysteries: string[]; assumptions: string[] };
  authorChoice: null | { label: string; status: "selected" | "rejected" };
  canCreateChangeSet: boolean;
  mutatesMarkdown: false;
};

export type AuthorChangeSet = {
  version: "story-studio-author-change-set-product/v1";
  id: string;
  reviewId: string;
  status: "pending" | "applying" | "applied" | "abandoned" | "stale";
  source: { sceneId: string; sceneTitle: string };
  affectedNoteIds: string[];
  changes: Array<{ id: string; summary: string; evidenceCount: number }>;
  before: string[];
  change: string[];
  after: string[];
  authorDecision: { label: string; status: "accepted" | "modified" };
  application: { canApply: boolean; reason: string; eventRecorded: boolean; appliedEventId: string | null; markdownWrites: number; sceneProseChanged: false; objectNotesChanged: false; projectedEffects: string[] };
};

export type CharacterStateImpactFixture = {
  version: "tianyan-character-event-impact-fixture/v1";
  stage: "initial" | "candidate" | "awaiting_author" | "confirmed" | "rejected";
  candidateReviewId: string | null;
  candidateId: string;
  candidateStatus: string;
  impactReviewId: string | null;
  impactStatus: string | null;
  changeSetId: string | null;
  appliedEventId: string | null;
  formalEventWrites: 0 | 1;
  characterWrites: 0;
  worldStateWrites: 0;
  relationWrites: 0;
  providerCalls: 0;
  preview: {
    title: string;
    sources: string[];
    affectedCharacters: string[];
    before: string[];
    after: string[];
    newKnowledge: string[];
    remainsUnknown: string[];
    beliefChanges: string[];
    goalChanges: string[];
    relationshipChanges: string[];
    affectedEvents: string[];
    affectedFatePoints: string[];
    conflicts: string[];
    openQuestions: string[];
    ownerWritePlan: string[];
    safeToApply: boolean;
  };
};

export type NuwaBoundedFixture = {
  version: "tianyan-nuwa-bounded-scenario-fixture-r0/v1";
  run: NuwaBoundedProjection;
  review: {
    stage: "simulation" | "handoff-prepared" | "candidate-review" | "impact-review" | "rejected" | "integrated";
    candidateReviewId: string | null;
    candidateStatus: string;
    impactReviewId: string | null;
    impactStatus: string | null;
    changeSetId: string | null;
    changeSetStatus: string | null;
    appliedEventId: string | null;
    eventWrites: 0 | 1;
    characterWrites: 0;
    worldStateWrites: 0;
    relationWrites: 0;
    memoryWrites: 0;
    providerCalls: 0;
    pluginCalls: 0;
    impactPreview: {
      title: string;
      sourceRun: string;
      sourceBranch: string | null;
      sourceStep: string | null;
      baselineDiff: string[];
      affectedEvents: string[];
      affectedCharacters: string[];
      characterStateBefore: string[];
      characterStateAfter: string[];
      characterFateBefore: string[];
      characterFateAfter: string[];
      worldStateCandidates: string[];
      relationCandidates: string[];
      unresolvedConflicts: string[];
      rollback: string;
      ownerWritePlan: string[];
    };
  };
  providerLedger: { setup: 3; generation: 6; total: 9 };
  realProviderCalls: 0;
  newGenerationCalls: 0;
};

export type MultiverseSingleDerivedFixture = {
  version: "tianyan-multiverse-single-derived-fixture-r0/v1";
  project: { id: string; title: string };
  root: { id: string; name: string; kind: "root"; revision: number; manifestId: string; receiptId: string; createdAt: string } | null;
  derived: ({
    id: string;
    name: string;
    kind: "derived";
    revision: number;
    manifestId: string;
    receiptId: string;
    createdAt: string;
    pinnedRootRevision: number;
    sourceRootVersionId: string;
    sourceManifestId: string;
    status: "ready" | "source-updated" | "integrated";
  }) | null;
  nuwa: {
    run: NuwaBoundedProjection;
    saveConfirmation: { versionName: string; sourceRevision: number | null; sourcePath: string; eventCandidate: string; currentStoryChanged: false };
  } | null;
  compare: {
    version: "tianyan-multiverse-semantic-compare-r0/v1";
    base: { label: string; revision: number };
    current: { label: string; revision: number };
    derived: { label: string; pinnedRevision: number };
    rows: Array<{ owner: "Event" | "Character" | "WorldState" | "Relation"; state: "changed" | "unchanged" | "unknown" | "conflict" | "stale" | "insufficient" | "integrated"; base: string; current: string; derived: string; selectable: boolean; changeId: string | null; sourceRefs: string[] }>;
    signals: Array<{ dimension: "Event hierarchy" | "Narrative order" | "World time" | "Character action" | "Character State" | "Character knowledge" | "Character Fate" | "WorldState" | "Relation" | "Items and places" | "Source and evidence" | "Open questions" | "Conflict" | "Stale source" | "Missing evidence" | "Creation regeneration"; state: "changed" | "unchanged" | "unknown" | "conflict" | "stale" | "insufficient" | "integrated"; summary: string }>;
  } | null;
  review: {
    stage: "not-started" | "compare" | "candidate-review" | "impact-review" | "rejected" | "integrated";
    candidateReviewId: string | null;
    candidateStatus: string | null;
    impactReviewId: string | null;
    impactStatus: string | null;
    changeSetId: string | null;
    changeSetStatus: string | null;
    appliedEventId: string | null;
  };
  writes: { confirmedEvents: number; rootRevisionAppends: number; derivedRevisions: number; character: 0; worldState: 0; relation: 0; canonBody: 0; session: 0; archive: 0; memory: 0; provider: 0; plugin: 0 };
  history: string[];
  blockers: { missingSource: boolean; staleSelection: boolean };
};

export type ReviewHistory = {
  version: "story-studio-review-history-product/v1";
  entries: Array<{
    reviewId: string;
    changeSetId: string | null;
    sourceScene: string;
    sourceKind: "作者想法" | "女娲候选路线" | "规划事件";
    authorGoal: string;
    authorChoice: string;
    evidenceCoverage: string;
    changeStatus: string;
    eventStatus: "世界事件已记录" | "尚未写入世界事件" | "已放弃";
    stale: boolean;
  }>;
};

export type TianyiResponseClassification = "confirmed-fact" | "inference" | "candidate-suggestion" | "unavailable-evidence";
export type TianyiMemoryScope = "author-global" | "project";
export type TianyiMemorySensitivity = "ordinary" | "personal" | "sensitive" | "restricted";
export type TianyiMemoryKind = "working-preference" | "shared-decision" | "unresolved-thread" | "author-provided-fact" | "continuity-note";
export type TianyiArchiveMessageRef = { sessionId: string; eventId: string; contentHash: string };
export type TianyiContextRequest = {
  productMode: "world" | "writing" | "intelligence" | "localization" | "publish";
  activeOwner: { kind: "project" | "writing-document" | "world-object" | "visual-document"; id: string | null };
  selection: { documentId: string | null; objectId: string | null; timelinePointId: string | null };
  sourceRefs: Array<{ id: string; kind: string; origin: string }>;
  memorySelections: Array<{ id: string; scope: TianyiMemoryScope }>;
  enabledSkillRefs: Array<{ id: string; version: string }>;
  /** Optional only so persisted pre-Phase 1B requests remain readable. */
  eventRefs?: StoryStudioEventReference[];
};
export type TianyiIdentity = {
  agentId: string;
  displayName: string;
  personaRevision: number;
  relationshipPolicyRevision: number;
  workingStyle: string;
  refusalBoundaries: string[];
  exitControls: string[];
  aiIdentityDisclosure: true;
  runtime: { mode: "deterministic"; adapterId: "tianyi.fixture"; adapterVersion: string };
  networkTransfer: "none";
  modelCalls: 0;
  persisted: boolean;
  globalMemoryCount: number;
  activeProjectGrantCount: number;
};
export type TianyiProjectResume = { status: "none" | "current" | "stale" | "missing-source" | "revoked"; statement: string; sourceId: string | null; sourceTarget: null | { kind: "writing-document" | "world-object" | "visual-document"; id: string }; unresolvedThreadIds: string[] };
export type TianyiOwnerResult = { owner: string; attempted: boolean; saved: boolean; conflicted: boolean; rejected: boolean; alreadyCompleted: boolean; currentHash: string | null; expectedHash: string | null; recoveryAction: string | null };
export type TianyiMemoryCandidate = { version: "tianyi-memory-candidate/v1"; candidateId: string; statement: string; scope: TianyiMemoryScope; kind: TianyiMemoryKind; sensitivity: TianyiMemorySensitivity; sources: Array<{ id: string; hash: string; kind?: "story-source" | "archive-message"; sessionId?: string | null; state?: "current" | "stale" | "deleted" | "missing" }>; runtimeInvolvement: "deterministic-fixture"; sessionId: string; operationId: string; personaRevision: number; relationshipPolicyRevision: number; currentState?: "current" | "stale" };
export type TianyiStoppingPointCandidate = { version: "tianyi-stopping-point-candidate/v1"; candidateId: string; sourceId: string; sourceHash: string; statement: string; unresolvedThreadIds: string[]; sessionId: string; operationId: string };
export type TianyiVisibleMessage = { eventId: string; sequence: number; actor: "author" | "tianyi"; recordedAt: string; visibleContent: string; receiptId: string | null };
export type TianyiSessionMetadata = { id: string; contentHash: string | null; eventCount: number; openedAt: string; closed: boolean; retentionMode: "normal" | "temporary"; recoverable: boolean; packEligible: boolean; candidateCount: number; memoryCandidates: TianyiMemoryCandidate[]; stoppingPointCandidates: TianyiStoppingPointCandidate[]; decidedCandidateIds: string[]; visibleMessages: TianyiVisibleMessage[]; groundedAttempts: Array<{ submissionId: string; questionAttemptKey: string; question: string; profileId: string; state: "PREPARED" | "PROVIDER_UNCERTAIN" | "RESULT_STAGED" | "RECEIPT_COMMITTED_UNACKNOWLEDGED" | "COMPLETED"; retryRequired: boolean }> };
export type TianyiQuestionOperation = { status: "current" | "stale" | "blocked" | "partial"; ownerResults: TianyiOwnerResult[]; receiptId: string; question: null | { status: "current" | "stale" | "blocked"; projectionFingerprint: string; currentProjectionFingerprint: string; currentVisibleResponse: string | null; visibleResponse: string; classifications: TianyiResponseClassification[]; memoryCandidates: Array<{ statement: string; scope: TianyiMemoryScope; kind: TianyiMemoryKind; sensitivity: TianyiMemorySensitivity; sourceRefs: string[] }>; failure: null | string; receipt: TianyiContextReceipt } };
export type TianyiMemoryItem = { world_os: string; id: string; type: "tianyi-memory"; agent_id: string; scope: TianyiMemoryScope; project_id: string; kind: TianyiMemoryKind; sensitivity: TianyiMemorySensitivity; approval_state: "candidate" | "author-approved" | "rejected"; model_involvement: string; created_revision: number; last_confirmed_revision: number; review_after: string; expires_after: string; state: "active" | "revoked"; source_refs: string[]; knowledge_subject_refs: string[]; body: string };
export type TianyiMemoryRecord = { value: TianyiMemoryItem; contentHash: string; byteLength: number };
export type TianyiGrantRecord = { value: { id: string; agentId: string; memoryId: string; memoryContentHash: string; projectId: string; state: "active" | "revoked"; approvedRevision: number }; contentHash: string; byteLength: number };
export type TianyiContextReceipt = { version: string; id: string; sessionId: string; agentId: string; personaRevision: number; relationshipPolicyRevision: number; runtime: { mode: "deterministic"; adapterId: "tianyi.fixture"; adapterVersion: string }; project: { id: string; surface: string }; selection: { documentId: string | null; objectId: string | null; timelinePointId: string | null }; sources: Array<{ id: string; kind: string; hash: string; range: { startLine: number; endLine: number }; excerpt: string; transfer: "local-only"; redactions: string[] }>; archiveMessageRefs?: Array<{ projectId: string; sessionId: string; eventId: string; sequence: number; actor: "author" | "tianyi"; recordedAt: string; contentHash: string }>; approvedMemoryIds: string[]; enabledSkillRefs: Array<{ id: string; version: string }>; excludedSources: Array<{ id: string; reason: string }>; generationTimestamp: string; stale: boolean; responseClassifications: TianyiResponseClassification[] };
export type TianyiArchiveMessageDetail = { projectId: string; sessionId: string; eventId: string; sequence: number | null; actor: "author" | "tianyi" | null; recordedAt: string | null; contentHash: string | null; state: "current" | "stale" | "deleted" | "missing"; excerpt: string | null };
export type TianyiReceiptRead = { receipt: TianyiContextReceipt; contentHash: string; currentStatus: "current" | "stale"; sourceDetails: Array<{ id: string; label: string; currentState: string; target: TianyiProjectResume["sourceTarget"] }>; archiveMessageDetails: TianyiArchiveMessageDetail[] };
export type TianyiReceiptSummary = { id: string; sessionId: string; generatedAt: string; sourceCount: number; archiveMessageCount: number; approvedMemoryCount: number; classifications: TianyiResponseClassification[]; historicalStale: boolean };
export type TianyiArchiveRecallResult = { rank: number; projectId: string; sessionId: string; eventId: string; sequence: number; recordedAt: string; actor: "author" | "tianyi"; eventType: string; contentHash: string; relatedReceiptId: string | null; sourceRefs: string[]; responseClassifications: TianyiResponseClassification[]; memoryCandidateState: "none" | "pending" | "accepted" | "rejected"; sensitivity: TianyiMemorySensitivity; memoryCreated: boolean; excerpt: string; sourceState: "current"; openTarget: { projectId: string; sessionId: string; eventId: string } };
export type TianyiArchiveRecallSearch = { status: "current" | "missing" | "corrupt" | "invalid"; results: TianyiArchiveRecallResult[] };
export type TianyiRevisionHistory = Array<{ id: string; sequence: number; contentHash: string; byteLength: number; source: string; recordedAt: string; restoredFromRevisionId: string | null; operationId: string | null }>;
export type TianyiStoppingPointRecord = { id: string; statement: string; state: "active" | "revoked"; sourceId: string; sourceLabel: string; sourceStatus: "current" | "stale" | "missing"; sourceTarget: TianyiProjectResume["sourceTarget"]; sourceHash: string; contentHash: string; revision: number };
export type TianyiPackSummary = { packId: string; createdAt: string; projectIds: string[]; includes: string[]; fileCount: number; byteSize: number; manifestHash: string; integrityStatus: "valid" };
export type TianyiStagingInventory = { importId: string; integrityStatus: "valid"; sensitivitySummary: Record<TianyiMemorySensitivity, number>; validationErrors: string[]; canonicalOverwriteCount: 0; importedSkillAuthorityCount: 0; entries: Array<{ kind: string; id: string; scope: TianyiMemoryScope; projectId: string | null; sensitivity: TianyiMemorySensitivity | null }> };

export type StoryExploration = {
  version: "story-studio-exploration-product/v1";
  id: string;
  status: "planned" | "running" | "ready-to-synthesize" | "ready-for-review" | "submitted-to-impact" | "cancelled" | "stale";
  source: { kind?: "scene" | "standalone"; sceneId: string; sceneTitle: string; authorGoal: string };
  supervisor: { label: "女娲"; role: string; authorDecisionRequired: true };
  specialists: Array<{ label: string; purpose: string; requirement: "required" | "optional"; status: "等待" | "检查中" | "已核验" | "不可用" }>;
  progress: { completed: number; total: number; coverage: "完整" | "部分" | "尚未开始" };
  routes: Array<{ id: string; title: string; summary: string; immediateConsequence: string; mediumTermConsequence: string; longTermPressure: string; preservedMysteries: string[]; risks: string[]; assumptions: string[]; affectedObjectIds: string[]; selected: boolean; candidateStatus?: "candidate" | "rejected" | "selected" | "promoted"; authorView?: NuwaCandidateAuthorViewModel; candidateRun?: { candidateId: string; runId: string; seed: number; startingRevision: string; actorDecisionSequence: string[]; beatEvolution: string[]; stateDiff: string[]; causalChain: string[]; checkpoint: string; unresolvedRisks: string[]; sourceRefs: string[]; traceHash: string; knowledgeBoundary: { rule: string; unknownBeforeCheckpoint: string[] }; cost: { modelCalls: 0; provider: "deterministic"; estimatedUsd: 0 } } }>;
  capability: { label: string; detail: string };
  primaryAction: "开始推演" | "整理候选路线" | "选择候选路线" | "查看影响评审" | "重新规划";
  canRun: boolean;
  canSynthesize: boolean;
  canSubmitRoute: boolean;
  /** Existing Run Pack execution log, projected without inventing character dialogue. */
  activity?: Array<{
    unitId: string;
    runId: string;
    sequence: number;
    actor: string;
    eventType: string;
    summary: string;
    sourceLabel: "本单元执行记录";
  }>;
  /** Existing immutable RunPack rehearsal history. Missing on legacy runs. */
  rehearsal?: StoryNuwaRehearsalReadModel;
  mutatesMarkdown: false;
  modelCalls: 0;
  standaloneSandbox?: {
    story: string;
    depth: "short" | "medium" | "long";
    agents: Array<{ id: string; displayName: string; kind: "existing-character" | "temporary-character"; objectId: string | null }>;
  };
};

export type StoryNuwaRehearsalAgentRef = {
  objectId: string;
  objectKind: "character";
  displayName: string;
  sourceRevision: string;
};

type StoryNuwaRehearsalEventBase<T extends string, P> = {
  eventId: string;
  unitId: string;
  runId: string;
  runRevision: number;
  sequence: number;
  eventType: T;
  actorAgentRef: StoryNuwaRehearsalAgentRef | null;
  targetRefs: string[];
  source: { kind: "provider" | "director" | "system"; sourceRef: string };
  payload: P;
  createdAt: string;
};

export type StoryNuwaRehearsalEvent =
  | StoryNuwaRehearsalEventBase<"agent_speech", { text: string }>
  | StoryNuwaRehearsalEventBase<"agent_action", { description: string }>
  | StoryNuwaRehearsalEventBase<"conscious_thought", { text: string }>
  | StoryNuwaRehearsalEventBase<"inner_monologue", { text: string }>
  | StoryNuwaRehearsalEventBase<"subconscious_tendency", { text: string }>
  | StoryNuwaRehearsalEventBase<"psychological_state", { text: string }>
  | StoryNuwaRehearsalEventBase<"environment_change", { description: string }>
  | StoryNuwaRehearsalEventBase<"narration", { text: string }>
  | StoryNuwaRehearsalEventBase<"agent_coordination", { description: string }>
  | StoryNuwaRehearsalEventBase<"memory_delta", { deltaId: string }>
  | StoryNuwaRehearsalEventBase<"relationship_delta", { deltaId: string }>
  | StoryNuwaRehearsalEventBase<"temporary_variable_applied", { variableId: string }>
  | StoryNuwaRehearsalEventBase<"creative_boost_applied", { boostId: string }>
  | StoryNuwaRehearsalEventBase<"intervention_proposed", { interventionId: string }>
  | StoryNuwaRehearsalEventBase<"intervention_applied", { interventionId: string; operationId: string }>
  | StoryNuwaRehearsalEventBase<"candidate_emitted", { candidateRef: string }>
  | StoryNuwaRehearsalEventBase<"system_checkpoint", { label: string }>
  | StoryNuwaRehearsalEventBase<"run_note", { text: string }>;

export type StoryNuwaRehearsalRevision = {
  version: "story-studio-nuwa-rehearsal-revision/v1";
  unitId: string;
  explorationId: string;
  briefId: string;
  briefRevision: number;
  runId: string;
  runRevision: number;
  parentRunRevision: number | null;
  status: "planned" | "running" | "completed" | "failed" | "cancelled" | "ready-for-candidate-review";
  roster: StoryNuwaRehearsalAgentRef[];
  temporaryVariables: Array<{ variableId: string; name: string; value: string; scope: "current_run" | "current_unit"; enabled: boolean; source: string; introducedAtRevision: number; expiresAfterRevision: number | null; revokedAtRevision: number | null }>;
  creativeBoosts: Array<{ boostId: string; label: string; instruction: string; scope: "current_run" | "current_unit"; enabled: boolean; source: string; introducedAtRevision: number; disabledAtRevision: number | null }>;
  interventionProposals: Array<{ interventionId: string; targetAgentRef: StoryNuwaRehearsalAgentRef; reason: string; proposedChange: string; expectedImpact: string; risk: "low" | "medium" | "high"; status: "pending" | "approved" | "rejected" | "applied_to_run_revision"; source: string; createdAt: string; approvedForRevision: number | null; applicationOperationId: string | null; applicationReceipt: { runId: string; runRevision: number; eventId: string; operationId: string; appliedAt: string } | null }>;
  orderedEvents: StoryNuwaRehearsalEvent[];
  memoryDeltas: Array<{ deltaId: string; agentRef: StoryNuwaRehearsalAgentRef; before: string; proposedAfter: string; reason: string; sourceEventId: string; reviewStatus: "pending" | "approved" | "rejected" }>;
  relationshipDeltas: Array<{ deltaId: string; sourceAgentRef: StoryNuwaRehearsalAgentRef; targetAgentRef: StoryNuwaRehearsalAgentRef; before: string; proposedAfter: string; reason: string; sourceEventId: string; reviewStatus: "pending" | "approved" | "rejected" }>;
  candidateRefs: string[];
  inheritance: { temporaryVariables: boolean; creativeBoosts: boolean };
  createdAt: string;
  updatedAt: string;
};

export type StoryNuwaRehearsalReadModel = {
  version: "story-studio-nuwa-rehearsal-read-model/v1";
  runId: string;
  latestRevision: number | null;
  revisions: StoryNuwaRehearsalRevision[];
};

export type IntelligenceOverlay = {
  version: "story-studio-intelligence-overlay-product/v1";
  explorationId: string;
  routeId: string;
  evidence: Array<{ objectId: string; label: string }>;
  risks: Array<{ objectId: string; label: string; level: string }>;
  candidateChanges: Array<{ objectId: string; label: string; changeType: "candidate" }>;
  mapProjection: { hasSpatialChanges: boolean; message: string };
  source: "validated-prediction-bundle";
  readOnly: true;
};

const basePath = "/__local/story-studio";
export { createTianyiGroundedContextRequest } from "./tianyiGroundedContextRequest";

export async function getBootstrap(): Promise<StoryStudioBootstrap> {
  return request<StoryStudioBootstrap>(`${basePath}/bootstrap`);
}

export async function openManagedStorageSession(): Promise<StorageProviderConnection> {
  return request<StorageProviderConnection>(`${basePath}/storage/session`);
}

export async function getStorageTransparency(projectId: string): Promise<StorageTransparency> {
  return request<StorageTransparency>(`${basePath}/storage/status?projectId=${encodeURIComponent(projectId)}`);
}

export async function revealStorageProject(projectId: string): Promise<void> {
  await request<{ revealed: true }>(`${basePath}/storage/reveal`, { method: "POST", body: { projectId } });
}

export async function exportStorageProject(input: { projectId: string; workVersionIds?: string[]; token: string }): Promise<WorkspaceExportReceipt> {
  return request<WorkspaceExportReceipt>(`${basePath}/storage/export`, { method: "POST", token: input.token, body: { projectId: input.projectId, workVersionIds: input.workVersionIds ?? [] } });
}

export async function importStorageProject(input: { packageText: string; token: string }): Promise<WorkspaceImportReceipt> {
  return request<WorkspaceImportReceipt>(`${basePath}/storage/import`, { method: "POST", token: input.token, body: { packageText: input.packageText } });
}

export async function getModelServiceStatus(token: string): Promise<ModelServiceStatus> {
  return request<ModelServiceStatus>(`${basePath}/model-service/status`, { token });
}

export async function getProviderProfile(token: string): Promise<ProviderProfileProjection> {
  return request<ProviderProfileProjection>(`${basePath}/model-service/profile`, { token });
}

export async function saveProviderProfile(input: {
  expectedRevision: number;
  provider: "siliconflow" | "radeon-cloud";
  displayName: string;
  baseUrl: string;
  modelId: string;
  enabled: boolean;
  apiKey?: string;
  token: string;
}): Promise<ProviderProfileProjection> {
  const { token, ...body } = input;
  return request<ProviderProfileProjection>(`${basePath}/model-service/profile/save`, { method: "POST", token, body });
}

export async function reloadProviderProfile(token: string): Promise<ProviderProfileProjection> {
  return request<ProviderProfileProjection>(`${basePath}/model-service/profile/reload`, { method: "POST", token, body: {} });
}

export async function disableProviderProfile(input: { expectedRevision: number; token: string }): Promise<ProviderProfileProjection> {
  const { token, ...body } = input;
  return request<ProviderProfileProjection>(`${basePath}/model-service/profile/disable`, { method: "POST", token, body });
}

export async function clearProviderCredential(token: string): Promise<ProviderProfileProjection> {
  return request<ProviderProfileProjection>(`${basePath}/model-service/profile/clear-credential`, { method: "POST", token, body: { confirmed: true } });
}

export async function discoverProviderModels(token: string): Promise<{ providerId: "siliconflow" | "radeon-cloud"; models: string[]; profile: ProviderProfileProjection }> {
  return request<{ providerId: "siliconflow" | "radeon-cloud"; models: string[]; profile: ProviderProfileProjection }>(`${basePath}/model-service/models`, { method: "POST", token, body: {} });
}

export async function testProviderConnection(token: string, modelId?: string): Promise<{ gate: "connection"; providerId: string; modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }> {
  return request<{ gate: "connection"; providerId: string; modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>(`${basePath}/model-service/test`, { method: "POST", token, body: modelId?.trim() ? { modelId: modelId.trim() } : {} });
}

export async function runProviderMinimalInference(token: string): Promise<{ gate: "minimal-inference"; modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }> {
  return request<{ gate: "minimal-inference"; modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }>(`${basePath}/model-service/minimal-inference`, { method: "POST", token, body: {} });
}

export async function configureProviderSession(apiKey: string, token: string): Promise<ProviderSessionConnection> {
  return request<ProviderSessionConnection>(`${basePath}/model-service/session-key`, {
    method: "POST",
    token,
    body: { apiKey }
  });
}

export async function clearProviderSession(token: string): Promise<void> {
  await request<{ cleared: true }>(`${basePath}/model-service/session-key/clear`, {
    method: "POST",
    token,
    body: {}
  });
}

export async function runGoldenLoop(input: {
  projectId: string;
  profileId: string;
  authorIntent: string;
  focus: {
    mode: string;
    document: {
      id: string;
      revision: string;
      selection: { coordinate: "utf16-code-unit"; start: number; end: number };
    };
    eventRef: StoryStudioEventReference | null;
  };
  contextRefs: TianyiObjectContextRef[];
  executionMode?: "legacy" | "live-pilot-r2";
  token: string;
  signal?: AbortSignal;
}): Promise<GoldenLoopResult> {
  const { token, signal, ...body } = input;
  return request<GoldenLoopResult>(`${basePath}/model-service/golden-loop/run`, { method: "POST", token, body, signal });
}

export async function getGoldenLoopCandidateReview(projectId: string, reviewId?: string): Promise<GoldenLoopCandidateReview | null> {
  return request<GoldenLoopCandidateReview | null>(`${basePath}/author-control/candidate-review?projectId=${encodeURIComponent(projectId)}${reviewId ? `&reviewId=${encodeURIComponent(reviewId)}` : ""}`);
}

/** Query-gated R0 adapter: persists only a Candidate Review through the existing owner. */
export async function createStoryObservationCandidateReview(input: {
  projectId: string;
  patch: StoryObservationProposalPatch;
  token: string;
}): Promise<{ result: GoldenLoopResult; review: GoldenLoopCandidateReview }> {
  const { token, ...body } = input;
  return request<{ result: GoldenLoopResult; review: GoldenLoopCandidateReview }>(
    `${basePath}/author-control/candidate-review/from-story-observation`,
    { method: "POST", token, body }
  );
}

export async function listGoldenLoopCandidateReviews(projectId: string): Promise<GoldenLoopCandidateReviewHistoryEntry[]> {
  return request<GoldenLoopCandidateReviewHistoryEntry[]>(`${basePath}/author-control/candidate-reviews?projectId=${encodeURIComponent(projectId)}`);
}

export async function abandonGoldenLoopCandidateReview(input: { projectId: string; reviewId: string; token: string }): Promise<GoldenLoopCandidateReview> {
  const { token, ...body } = input;
  return request<GoldenLoopCandidateReview>(`${basePath}/author-control/candidate-review/abandon`, { method: "POST", token, body });
}

export async function decideGoldenLoopCandidateReview(input: {
  projectId: string;
  reviewId: string;
  candidateId: string;
  decision: "rejected" | "accepted";
  reason?: string;
  confirmationReceipt?: { planningEventId?: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string };
  token: string;
}): Promise<GoldenLoopCandidateReview> {
  const { token, ...body } = input;
  return request<GoldenLoopCandidateReview>(`${basePath}/author-control/candidate-review/decide`, { method: "POST", token, body });
}

export async function resolveTianyiObjectContextRefs(
  projectId: string,
  objectContextRefs: TianyiObjectContextRef[],
  token: string
): Promise<TianyiObjectContextRef[]> {
  return request<TianyiObjectContextRef[]>(`${basePath}/model-service/tianyi-object-context/resolve`, {
    method: "POST",
    token,
    body: { projectId, objectContextRefs }
  });
}

export async function streamTianyiGroundedAnswer(input: {
  operationId: string;
  submissionId: string;
  explicitRetry?: boolean;
  profileId: string;
  question: string;
  contextRequest: TianyiGroundedContextRequest;
  token: string;
  signal?: AbortSignal;
  onDraft?(event: { attempt: number; text: string }): void;
}): Promise<TianyiGroundedAnswerResult> {
  const { token: _token, signal, onDraft, ...body } = input;
  const response = await fetch(`${basePath}/model-service/tianyi-grounded-answer`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "text/event-stream", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok || !response.body) throw new LocalTransportError("天意真实回答请求无法开始。", response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      buffer += decoder.decode(item.value, { stream: true }).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const source = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseLocalSseEvent(source);
        if (parsed.event === "draft") onDraft?.(parsed.data as { attempt: number; text: string });
        if (parsed.event === "error") {
          const error = parsed.data as { error?: string; code?: string };
          throw new LocalTransportError(error.error || "天意真实回答失败。", error.code === "cancelled" ? 499 : 502);
        }
        if (parsed.event === "complete") return parsed.data as TianyiGroundedAnswerResult;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new LocalTransportError("天意真实回答流提前结束。", 502);
}


function parseLocalSseEvent(source: string): { event: string; data: unknown } {
  const lines = source.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  try { return { event, data: JSON.parse(data) as unknown }; } catch { throw new LocalTransportError("天意真实回答流格式无效。", 502); }
}

export async function createProject(input: {
  title: string;
  folderSlug: string;
  genre?: string;
  ambience?: string;
  token: string;
}): Promise<StoryStudioProject> {
  const { token, ...body } = input;
  return request<StoryStudioProject>(`${basePath}/projects/create`, { method: "POST", token, body });
}

export async function openProject(projectId: string, token: string): Promise<StoryStudioProject> {
  return request<StoryStudioProject>(`${basePath}/projects/open`, { method: "POST", token, body: { projectId } });
}

export async function getWorldLibrary(projectId: string): Promise<WorldLibraryBootstrap> {
  return request<WorldLibraryBootstrap>(`${basePath}/world-library?projectId=${encodeURIComponent(projectId)}`);
}

export async function getObjectCatalog(projectId: string, workVersionId: string): Promise<ObjectCatalogState> {
  return request<ObjectCatalogState>(`${basePath}/object-catalog?projectId=${encodeURIComponent(projectId)}&workVersionId=${encodeURIComponent(workVersionId)}`);
}

export async function updateObjectCatalog(input: { projectId: string; workVersionId: string; expectedRevision: number; operation: "set-category" | "trash" | "restore"; objectType: string; objectIds: string[]; categoryId?: string | null; trashedFrom?: "active" | "archived"; token: string }): Promise<ObjectCatalogState> {
  const { token, ...body } = input;
  return request<ObjectCatalogState>(`${basePath}/object-catalog/update`, { method: "POST", token, body });
}

export async function listRelations(input: { projectId: string; includeArchived?: boolean; reviewState?: RelationReviewStateR0; objectId?: string; relationTypeId?: string; direction?: RelationDirectionR0; text?: string }): Promise<RelationListResponse> {
  const params = new URLSearchParams({ projectId: input.projectId });
  if (input.includeArchived) params.set("includeArchived", "true");
  if (input.reviewState) params.set("reviewState", input.reviewState);
  if (input.objectId) params.set("objectId", input.objectId);
  if (input.relationTypeId) params.set("relationTypeId", input.relationTypeId);
  if (input.direction) params.set("direction", input.direction);
  if (input.text) params.set("text", input.text);
  return request<RelationListResponse>(`${basePath}/relations?${params.toString()}`);
}

export async function readRelation(projectId: string, relationId: string): Promise<{ relation: RelationReadProjectionR0; receipts: RelationReceiptR0[] }> {
  return request(`${basePath}/relations/relation?projectId=${encodeURIComponent(projectId)}&relationId=${encodeURIComponent(relationId)}`);
}

export async function listRelationTypes(projectId: string): Promise<RelationTypeListResponse> {
  return request<RelationTypeListResponse>(`${basePath}/relations/types?projectId=${encodeURIComponent(projectId)}`);
}

export async function resolveRelationType(projectId: string, relationTypeId: string): Promise<RelationTypeDefinitionR0 | null> {
  return request<RelationTypeDefinitionR0 | null>(`${basePath}/relations/types/type?projectId=${encodeURIComponent(projectId)}&relationTypeId=${encodeURIComponent(relationTypeId)}`);
}

export async function getRelationDuplicateSuggestions(input: { projectId: string; sourceObjectId: string; targetObjectId: string; relationTypeId: string; direction: RelationDirectionR0; relationLabelSnapshot: string }): Promise<{ version: string; suggestions: RelationReadProjectionR0[]; history: RelationReadProjectionR0[] }> {
  const params = new URLSearchParams({
    projectId: input.projectId,
    sourceObjectId: input.sourceObjectId,
    targetObjectId: input.targetObjectId,
    relationTypeId: input.relationTypeId,
    direction: input.direction,
    relationLabelSnapshot: input.relationLabelSnapshot
  });
  return request(`${basePath}/relations/duplicates?${params.toString()}`);
}

export async function getRelationEvidence(projectId: string, relationId: string): Promise<{ relationId: string; statuses: RelationEvidenceStatusR0[]; warnings: RelationEvidenceStatusR0[] }> {
  return request(`${basePath}/relations/evidence?projectId=${encodeURIComponent(projectId)}&relationId=${encodeURIComponent(relationId)}`);
}

export async function previewLegacyRelationTypeAdoption(projectId: string, relationTypeId: string): Promise<{ version: string; relationTypeId: string; label: string; relationIds: string[]; repositoryRevision: number; previewHash: string; readOnly: true }> {
  return request(`${basePath}/relations/types/legacy-preview?projectId=${encodeURIComponent(projectId)}&relationTypeId=${encodeURIComponent(relationTypeId)}`);
}

export async function createRelationType(input: { projectId: string; label: string; description?: string | null; expectedRepositoryRevision?: number; operationId: string; sourceRef?: string; now?: string; token: string }): Promise<RelationTypeMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/types/create`, { method: "POST", token, body });
}

export async function updateRelationType(input: { projectId: string; relationTypeId: string; expectedTypeRevision: number; expectedRepositoryRevision: number; label?: string; description?: string | null; operationId: string; now?: string; token: string }): Promise<RelationTypeMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/types/update`, { method: "POST", token, body });
}

export async function retireRelationType(input: { projectId: string; relationTypeId: string; expectedTypeRevision: number; expectedRepositoryRevision: number; operationId: string; now?: string; token: string }): Promise<RelationTypeMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/types/retire`, { method: "POST", token, body });
}

export async function adoptLegacyRelationType(input: { projectId: string; relationTypeId: string; previewHash: string; expectedRepositoryRevision: number; label?: string; description?: string | null; operationId: string; now?: string; token: string }): Promise<RelationTypeMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/types/adopt-legacy`, { method: "POST", token, body });
}

export async function createRelationCandidate(input: { projectId: string; relationId?: string; sourceObjectId: string; targetObjectId: string; relationTypeId: string; relationLabelSnapshot?: string; direction?: RelationDirectionR0; evidenceRefs?: RelationEvidenceRefR0[]; sourceRevision?: string; sourceRef?: string; temporal?: RelationTemporalMetadata | null; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/create`, { method: "POST", token, body });
}

export async function updateRelationCandidate(input: { projectId: string; relationId: string; expectedRelationRevision: number; relationTypeId?: string; direction?: RelationDirectionR0; evidenceRefs?: RelationEvidenceRefR0[]; temporal?: RelationTemporalMetadata | null; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/update`, { method: "POST", token, body });
}

export async function confirmRelationCandidate(input: { projectId: string; relationId: string; expectedRelationRevision: number; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/confirm`, { method: "POST", token, body });
}

export async function rejectRelationCandidate(input: { projectId: string; relationId: string; expectedRelationRevision: number; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/reject`, { method: "POST", token, body });
}

export async function archiveConfirmedRelation(input: { projectId: string; relationId: string; expectedRelationRevision: number; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/archive`, { method: "POST", token, body });
}

export async function appendRelationEvidence(input: { projectId: string; relationId: string; expectedRelationRevision: number; evidenceRefs: RelationEvidenceRefR0[]; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/evidence/append`, { method: "POST", token, body });
}

export async function createRelationCorrectionCandidate(input: { projectId: string; relationId: string; supersedesRelationId?: string; correctionRelationId?: string; expectedRelationRevision: number; sourceObjectId: string; targetObjectId: string; relationTypeId: string; relationLabelSnapshot?: string; direction?: RelationDirectionR0; evidenceRefs?: RelationEvidenceRefR0[]; sourceRevision?: string; sourceRef?: string; operationId: string; now?: string; token: string }): Promise<RelationMutationResultR0> {
  const { token, ...body } = input;
  return request(`${basePath}/relations/correction/create`, { method: "POST", token, body });
}

export async function listAgentTypes(projectId: string): Promise<{ catalogRevision: number; types: AgentTypeDefinition[]; boundCounts: Record<string, number> }> {
  return request(`${basePath}/agent-types?projectId=${encodeURIComponent(projectId)}`);
}

export async function createAgentType(input: {
  projectId: string;
  label: string;
  description?: string;
  baseCapability: AgentTypeBaseCapability;
  fieldDefinitions?: AgentTypeDefinition["fieldDefinitions"];
  expectedCatalogRevision: number;
  token: string;
}): Promise<{ catalogRevision: number; type: AgentTypeDefinition }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-types/create`, { method: "POST", token, body });
}

export async function updateAgentType(input: {
  projectId: string;
  typeId: string;
  expectedTypeRevision: number;
  expectedCatalogRevision: number;
  label?: string;
  description?: string;
  baseCapability?: AgentTypeBaseCapability;
  fieldDefinitions?: AgentTypeDefinition["fieldDefinitions"];
  token: string;
}): Promise<{ catalogRevision: number; type: AgentTypeDefinition }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-types/update`, { method: "POST", token, body });
}

export async function activateAgentType(input: { projectId: string; typeId: string; expectedTypeRevision: number; expectedCatalogRevision: number; token: string }): Promise<{ catalogRevision: number; type: AgentTypeDefinition }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-types/activate`, { method: "POST", token, body });
}

export async function retireAgentType(input: { projectId: string; typeId: string; expectedTypeRevision: number; expectedCatalogRevision: number; token: string }): Promise<{ catalogRevision: number; type: AgentTypeDefinition }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-types/retire`, { method: "POST", token, body });
}

export async function deleteAgentType(input: { projectId: string; typeId: string; expectedTypeRevision: number; expectedCatalogRevision: number; token: string }): Promise<{ catalogRevision: number; deletedTypeId: string }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-types/delete`, { method: "POST", token, body });
}

export async function getAgentType(projectId: string, typeId: string): Promise<AgentTypeDefinition | null> {
  return request(`${basePath}/agent-types/type?projectId=${encodeURIComponent(projectId)}&typeId=${encodeURIComponent(typeId)}`);
}

export async function resolveAgentTypeForWorldObject(projectId: string, objectId: string): Promise<AgentTypeResolution> {
  return request(`${basePath}/agent-types/object?projectId=${encodeURIComponent(projectId)}&objectId=${encodeURIComponent(objectId)}`);
}

export async function listWorldObjectsByAgentType(projectId: string, typeId: string): Promise<AgentTypeObjectReference[]> {
  return request(`${basePath}/agent-types/objects?projectId=${encodeURIComponent(projectId)}&typeId=${encodeURIComponent(typeId)}`);
}

export async function countWorldObjectsByAgentType(projectId: string, typeId: string): Promise<number> {
  return request(`${basePath}/agent-types/count?projectId=${encodeURIComponent(projectId)}&typeId=${encodeURIComponent(typeId)}`);
}

export async function listClassifiedLibraryProjection(projectId: string): Promise<ClassifiedAgentLibraryProjection> {
  return request(`${basePath}/agent-types/classified?projectId=${encodeURIComponent(projectId)}`);
}

export async function listUncertainLibraryProjection(projectId: string): Promise<UncertainAgentLibraryProjection> {
  return request(`${basePath}/agent-types/uncertain?projectId=${encodeURIComponent(projectId)}`);
}

export async function listAgentRecognitionProposals(projectId: string, token: string): Promise<AgentRecognitionProposal[]> {
  return request<AgentRecognitionProposal[]>(`${basePath}/agent-recognition/proposals?projectId=${encodeURIComponent(projectId)}`, { token });
}

export async function createAgentDraftProposal(input: {
  projectId: string;
  operationId: string;
  requestedObjectType: "character" | "item" | "location";
  mode: StoryStudioAgentDraftMode;
  authorIntent: string;
  sourceScope: string;
  sourceText: string;
  existingObjectSummaries: Array<{ id: string; title: string; type: string; aliases: string[] }>;
  allowedFieldSchema: string[];
  fixtureMode?: "deterministic";
  token: string;
}): Promise<{ created: boolean; proposal: AgentRecognitionProposal; output: Record<string, unknown> }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-recognition/drafts/create`, { method: "POST", token, body: { ...body, noWritePolicy: true, fixtureMode: body.fixtureMode || "deterministic" } });
}

export async function createNuwaTemporaryCharacterProposal(input: { projectId: string; explorationId: string; displayName: string; goal?: string; disposition?: string; token: string }): Promise<{ created: boolean; proposal: AgentRecognitionProposal }> {
  const { token, ...body } = input;
  return request(`${basePath}/nuwa/temporary-characters/create`, { method: "POST", token, body });
}

export async function editAgentRecognitionProposal(input: {
  projectId: string; proposalId: string; expectedRevision: number; suggestedName: string;
  suggestedFields: Record<string, AgentRecognitionProposalValue>; uncertainties: string[];
  duplicateMatches: AgentRecognitionProposal["duplicateMatches"]; token: string;
}): Promise<AgentRecognitionProposal> {
  const { token, ...body } = input;
  return request<AgentRecognitionProposal>(`${basePath}/agent-recognition/proposals/edit`, { method: "POST", token, body });
}

export async function ignoreAgentRecognitionProposal(input: { projectId: string; proposalId: string; expectedRevision: number; token: string }): Promise<AgentRecognitionProposal> {
  const { token, ...body } = input;
  return request<AgentRecognitionProposal>(`${basePath}/agent-recognition/proposals/ignore`, { method: "POST", token, body });
}

export async function confirmAgentRecognitionProposal(input: {
  projectId: string; proposalId: string; expectedProposalRevision: number; operationId: string;
  character: AgentProposalCharacterApplication; token: string;
}): Promise<{ proposal: AgentRecognitionProposal; receipt: NonNullable<AgentRecognitionProposal["applicationReceipt"]> }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-recognition/proposals/confirm`, { method: "POST", token, body });
}

export async function confirmAgentRecognitionObject(input: {
  projectId: string; proposalId: string; expectedProposalRevision: number; operationId: string;
  object: AgentProposalObjectApplication; token: string;
}): Promise<{ proposal: AgentRecognitionProposal; receipt: NonNullable<AgentRecognitionProposal["applicationReceipt"]> }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-recognition/proposals/confirm`, { method: "POST", token, body });
}

export async function mergeAgentRecognitionProposal(input: {
  projectId: string; proposalId: string; expectedProposalRevision: number; operationId: string;
  targetObjectId: string; expectedTargetRevision: string; character: AgentProposalCharacterApplication; token: string;
}): Promise<{ proposal: AgentRecognitionProposal; receipt: NonNullable<AgentRecognitionProposal["applicationReceipt"]> }> {
  const { token, ...body } = input;
  return request(`${basePath}/agent-recognition/proposals/merge`, { method: "POST", token, body });
}

export async function getVerifiedCanonEventList(projectId: string): Promise<VerifiedCanonEventListRead> {
  return request<VerifiedCanonEventListRead>(`${basePath}/event-line/verified-events?projectId=${encodeURIComponent(projectId)}`);
}

export async function getVerifiedCanonEvent(projectId: string, eventId: string): Promise<VerifiedCanonEventDetailRead> {
  return request<VerifiedCanonEventDetailRead>(`${basePath}/event-line/event?projectId=${encodeURIComponent(projectId)}&eventId=${encodeURIComponent(eventId)}`);
}

export async function createWorkspaceFolder(input: { projectId: string; title: string; parentId?: string | null; kind?: WorkspaceFolder["kind"]; token: string }): Promise<{ folder: WorkspaceFolder }> {
  return request("/__local/story-studio/workspace/folders/create", {
    method: "POST",
    token: input.token,
    body: { projectId: input.projectId, title: input.title, parentId: input.parentId || null, kind: input.kind || "folder" }
  });
}

export async function updateWorkspaceFolders(input: { projectId: string; expectedContentHash: string; folders: WorkspaceFolder[]; token: string }): Promise<{ conflict: boolean; layout: { folders: WorkspaceFolder[]; contentHash: string } }> {
  return request("/__local/story-studio/workspace/folders/update", {
    method: "POST",
    token: input.token,
    body: { projectId: input.projectId, expectedContentHash: input.expectedContentHash, folders: input.folders }
  });
}

export async function getDocumentRevisionHistory(projectId: string, ref: RevisionDocumentRef, token: string): Promise<DocumentRevisionHistory> {
  return request<DocumentRevisionHistory>(`${basePath}/document-history`, { method: "POST", token, body: { projectId, ref } });
}

export async function previewDocumentRevision(projectId: string, ref: RevisionDocumentRef, revisionId: string): Promise<DocumentRevisionPreview> {
  return request<DocumentRevisionPreview>(`${basePath}/document-history/preview`, { method: "POST", body: { projectId, ref, revisionId } });
}

export async function createDocumentMilestone(input: { projectId: string; ref: RevisionDocumentRef; revisionId: string; title: string; token: string }): Promise<{ milestone: DocumentMilestone; history: DocumentRevisionHistory }> {
  const { token, ...body } = input;
  return request(`${basePath}/document-history/milestone`, { method: "POST", token, body });
}

export async function restoreDocumentRevision(input: { projectId: string; ref: RevisionDocumentRef; revisionId: string; expectedHash: string; token: string }): Promise<{ conflict: boolean; history: DocumentRevisionHistory }> {
  const { token, ...body } = input;
  return request(`${basePath}/document-history/restore`, { method: "POST", token, body });
}

export async function getWritingBootstrap(projectId: string): Promise<WritingBootstrap> {
  return request<WritingBootstrap>(`${basePath}/writing?projectId=${encodeURIComponent(projectId)}`);
}

export async function getAgentPermissionState(projectId: string): Promise<AgentPermissionState> {
  return request<AgentPermissionState>(`${basePath}/agent-permissions?projectId=${encodeURIComponent(projectId)}`);
}

export async function setAgentPermissionProfile(input: { projectId: string; profile: AgentPermissionProfile; token: string }): Promise<AgentPermissionState> {
  const { token, ...body } = input;
  return request<AgentPermissionState>(`${basePath}/agent-permissions/profile`, { method: "POST", token, body });
}

export async function recordAgentActivity(input: { projectId: string; actor: AgentActivityReceipt["actor"]; action: AgentActionKind; targets?: string[]; targetType?: string; checkpointId?: string | null; estimatedProviderCost?: number; authorConfirmed?: boolean; token: string }): Promise<AgentActivityReceipt> {
  const { token, ...body } = input;
  return request<AgentActivityReceipt>(`${basePath}/agent-permissions/activity`, { method: "POST", token, body });
}

export async function listStoryUnits(projectId: string, includeArchived = false): Promise<StoryUnit[]> {
  return request<StoryUnit[]>(`${basePath}/story-units?projectId=${encodeURIComponent(projectId)}${includeArchived ? "&includeArchived=true" : ""}`);
}

export async function getStoryUnit(projectId: string, unitId: string): Promise<StoryUnit> {
  return request<StoryUnit>(`${basePath}/story-unit?projectId=${encodeURIComponent(projectId)}&unitId=${encodeURIComponent(unitId)}`);
}

export async function createStoryUnit(input: {
  projectId: string;
  title: string;
  summary?: string;
  kind?: StoryUnitKind;
  parentUnitId?: string | null;
  branchPointEventId?: string | null;
  mergeTargetUnitId?: string | null;
  order?: number;
  sourceVersionRef?: string | null;
  status?: StoryUnitStatus;
  objective?: string;
  coreConflict?: string;
  turningPoint?: string;
  openHook?: string;
  sourceRefs?: StoryUnitSourceRef[];
  items?: StoryUnitItem[];
  collectionPoints?: StoryCollectionPoint[];
  linkedEntityIds?: string[];
  unresolvedQuestionIds?: string[];
  generationConstraints?: Record<string, unknown>;
  token: string;
}): Promise<StoryUnit> {
  const { token, ...body } = input;
  return request<StoryUnit>(`${basePath}/story-units/create`, { method: "POST", token, body });
}

export async function updateStoryUnit(input: {
  projectId: string;
  unitId: string;
  expectedVersion: string;
  title?: string;
  summary?: string;
  kind?: StoryUnitKind;
  parentUnitId?: string | null;
  branchPointEventId?: string | null;
  mergeTargetUnitId?: string | null;
  order?: number;
  sourceVersionRef?: string | null;
  status?: StoryUnitStatus;
  objective?: string;
  coreConflict?: string;
  turningPoint?: string;
  openHook?: string;
  lifecycle?: StoryUnit["lifecycle"];
  sourceRefs?: StoryUnitSourceRef[];
  items?: StoryUnitItem[];
  collectionPoints?: StoryCollectionPoint[];
  linkedEntityIds?: string[];
  unresolvedQuestionIds?: string[];
  generationConstraints?: Record<string, unknown>;
  token: string;
}): Promise<{ conflict: boolean; unit: StoryUnit }> {
  const { token, ...body } = input;
  return request(`${basePath}/story-units/update`, { method: "POST", token, body });
}

export async function archiveStoryUnit(input: { projectId: string; unitId: string; expectedVersion: string; token: string }): Promise<{ conflict: boolean; unit: StoryUnit }> {
  const { token, ...body } = input;
  return request(`${basePath}/story-units/archive`, { method: "POST", token, body });
}

export async function createStoryCollectionPoint(input: { projectId: string; unitId: string; expectedUnitVersion: string; operationId: string; title: string; eventIds: string[]; sourceVersionRef: string; order?: number; collapsed?: boolean; layout?: { x: number; y: number; pinned?: boolean }; token: string }): Promise<{ conflict: boolean; unit: StoryUnit; collectionPoint: StoryCollectionPoint | null; receipt: StoryCollectionPointReceipt | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/story-collection-points/create`, { method: "POST", token, body });
}

export async function updateStoryCollectionPoint(input: { projectId: string; unitId: string; collectionPointId: string; expectedUnitVersion: string; expectedRevision: number; operationId: string; title?: string; eventIds?: string[]; collapsed?: boolean; order?: number; layout?: { x: number; y: number; pinned?: boolean }; token: string }): Promise<{ conflict: boolean; unit: StoryUnit; collectionPoint: StoryCollectionPoint | null; receipt: StoryCollectionPointReceipt | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/story-collection-points/update`, { method: "POST", token, body });
}

export async function dissolveStoryCollectionPoint(input: { projectId: string; unitId: string; collectionPointId: string; expectedUnitVersion: string; expectedRevision: number; operationId: string; token: string }): Promise<{ conflict: boolean; unit: StoryUnit; receipt: StoryCollectionPointReceipt | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/story-collection-points/dissolve`, { method: "POST", token, body });
}

export async function listOutputArtifacts(projectId: string, includeArchived = false): Promise<OutputArtifact[]> {
  return request<OutputArtifact[]>(`${basePath}/output-artifacts?projectId=${encodeURIComponent(projectId)}${includeArchived ? "&includeArchived=true" : ""}`);
}

export async function getOutputArtifact(projectId: string, artifactId: string): Promise<OutputArtifact> {
  return request<OutputArtifact>(`${basePath}/output-artifact?projectId=${encodeURIComponent(projectId)}&artifactId=${encodeURIComponent(artifactId)}`);
}

export async function createOutputArtifact(input: { projectId: string; type: OutputArtifactType; title: string; sourceUnits?: OutputSourceUnitRef[]; generationBrief?: Record<string, unknown>; content?: string; structure?: Record<string, unknown>; workVersionSource?: WorkVersionOutputArtifactSource; createdAt?: string; token: string }): Promise<OutputArtifact> {
  const { token, ...body } = input;
  return request<OutputArtifact>(`${basePath}/output-artifacts/create`, { method: "POST", token, body });
}

export async function updateOutputArtifact(input: { projectId: string; artifactId: string; expectedVersion: string; title?: string; sourceUnits?: OutputSourceUnitRef[]; generationBrief?: Record<string, unknown> | null; content?: string; structure?: Record<string, unknown>; lifecycle?: OutputArtifact["lifecycle"]; revisionOperationId?: string; token: string }): Promise<{ conflict: boolean; artifact: OutputArtifact }> {
  const { token, ...body } = input;
  return request(`${basePath}/output-artifacts/update`, { method: "POST", token, body });
}

export type CreationSourcePortAction = "create-root" | "create-artifact" | "save-artifact" | "reconcile-source" | "recover-source";

export async function getCreationSourcePortState(input: { projectId: string; workVersionId?: string; storyUnitId?: string; eventIds?: string[] }): Promise<CreationSourcePortState> {
  const query = new URLSearchParams({ projectId: input.projectId });
  if (input.workVersionId) query.set("workVersionId", input.workVersionId);
  if (input.storyUnitId) query.set("storyUnitId", input.storyUnitId);
  for (const eventId of input.eventIds || []) query.append("eventId", eventId);
  return request<CreationSourcePortState>(`${basePath}/creation/source?${query.toString()}`);
}

export async function runCreationSourcePortAction(input: { projectId: string; action: CreationSourcePortAction; workVersionId?: string; storyUnitId?: string; eventIds?: string[]; title?: string; text?: string; selectedDifferenceIds?: string[]; expectedRootRevision?: number; token: string }): Promise<CreationSourcePortState> {
  const { token, action, ...body } = input;
  return request<CreationSourcePortState>(`${basePath}/creation/source/${action}`, { method: "POST", token, body });
}

export async function getNormalEventCreationState(input: { projectId: string; storyUnitId?: string; planningEventId?: string }): Promise<NormalEventCreationState> {
  const query = new URLSearchParams({ projectId: input.projectId });
  if (input.storyUnitId) query.set("storyUnitId", input.storyUnitId);
  if (input.planningEventId) query.set("planningEventId", input.planningEventId);
  return request<NormalEventCreationState>(`${basePath}/event-line/normal-creation?${query.toString()}`);
}

export async function runNormalEventCreationAction(input: { projectId: string; action: "create-story-unit" | "create-candidate" | "begin-impact" | "reject" | "confirm"; storyUnitId?: string; planningEventId?: string; title?: string; summary?: string; body?: string; token: string }): Promise<{ result: unknown; state: NormalEventCreationState }> {
  const { token, action, ...body } = input;
  return request(`${basePath}/event-line/normal-creation/${action}`, { method: "POST", token, body });
}

export async function advanceCreationSourceRootForE2E(input: { projectId: string; token: string }): Promise<CreationSourcePortState> {
  const { token, ...body } = input;
  return request<CreationSourcePortState>(`${basePath}/creation/source-e2e/advance-root`, { method: "POST", token, body });
}

export async function getWorkVersionBoundCreationFixture(projectId: string, fixtureCase?: "missing" | "corrupt" | "concurrency"): Promise<WorkVersionBoundCreationFixture> {
  return request<WorkVersionBoundCreationFixture>(`${basePath}/creation/work-version-source-fixture?projectId=${encodeURIComponent(projectId)}${fixtureCase ? `&case=${fixtureCase}` : ""}`);
}

export async function runWorkVersionBoundCreationFixture(input: { projectId: string; action: "create-root" | "create-artifact" | "save-artifact" | "reconcile" | "advance-root" | "archive-root" | "reconcile-source"; text?: string; selectedDifferenceIds?: string[]; expectedRootRevision?: number; token: string }): Promise<WorkVersionBoundCreationFixture> {
  const { token, action, ...body } = input;
  return request<WorkVersionBoundCreationFixture>(`${basePath}/creation/work-version-source-fixture/${action}`, { method: "POST", token, body });
}

export async function archiveOutputArtifact(input: { projectId: string; artifactId: string; expectedVersion: string; token: string }): Promise<{ conflict: boolean; artifact: OutputArtifact }> {
  const { token, ...body } = input;
  return request(`${basePath}/output-artifacts/archive`, { method: "POST", token, body });
}

export async function listCuratedCreationPlugins(): Promise<CuratedCreationPlugin[]> {
  return request<CuratedCreationPlugin[]>(`${basePath}/creation/plugins`);
}

export async function listCuratedCreationPluginAdapters(): Promise<unknown[]> { return request<unknown[]>(`${basePath}/creation/plugins/adapters`); }
export async function executeCuratedCreationPlugin(input: { adapterId: string; packageValue: unknown; capability: string; authorConfirmation: unknown; idempotencyKey: string; beforeHash: string; token: string }): Promise<{ receipt: unknown; content: string }> {
  const { token, ...body } = input; return request(`${basePath}/creation/plugins/execute`, { method: "POST", token, body });
}

export async function operateCuratedCreationPlugin(input: { pluginId: string; operation: "install" | "update" | "rollback" | "enable" | "disable" | "uninstall"; token: string }): Promise<CuratedCreationPlugin | { pluginId: string; uninstalled: boolean; preserved: string[] }> {
  const { token, operation, ...body } = input;
  return request(`${basePath}/creation/plugins/${operation}`, { method: "POST", token, body });
}

export async function getCreationMediaCatalog(projectId: string): Promise<CreationMediaCatalog> {
  return request<CreationMediaCatalog>(`${basePath}/creation-media?projectId=${encodeURIComponent(projectId)}`);
}

export async function createCreationMediaAsset(input: { projectId: string; expectedCatalogHash: string | null; asset: Omit<CreationMediaAsset, "id" | "createdAt" | "updatedAt" | "backlinks"> & { id?: string }; token: string }): Promise<{ conflict: false; catalog: CreationMediaCatalog; asset: CreationMediaAsset }> {
  const { token, ...body } = input;
  return request(`${basePath}/creation-media/create`, { method: "POST", token, body });
}

export async function updateCreationMediaAsset(input: { projectId: string; assetId: string; expectedCatalogHash: string | null; patch: Partial<Omit<CreationMediaAsset, "id" | "createdAt" | "updatedAt" | "backlinks">>; token: string }): Promise<{ conflict: boolean; catalog: CreationMediaCatalog; asset: CreationMediaAsset | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/creation-media/update`, { method: "POST", token, body });
}

export async function deleteCreationMediaAsset(input: { projectId: string; assetId: string; expectedCatalogHash: string | null; token: string }): Promise<{ conflict: boolean; catalog: CreationMediaCatalog }> {
  const { token, ...body } = input;
  return request(`${basePath}/creation-media/delete`, { method: "POST", token, body });
}

export async function getWritingContinuity(projectId: string): Promise<WritingContinuity | null> {
  return request<WritingContinuity | null>(`${basePath}/writing/continuity?projectId=${encodeURIComponent(projectId)}`);
}

export async function saveWritingContinuity(input: Omit<WritingContinuity, "version" | "state"> & { projectId: string; token: string }): Promise<WritingContinuity> {
  const { token, ...body } = input;
  return request<WritingContinuity>(`${basePath}/writing/continuity`, { method: "POST", token, body });
}

export async function getImpactReview(projectId: string, reviewId?: string): Promise<ImpactReview | null> {
  return request<ImpactReview | null>(`${basePath}/author-control/impact-review?projectId=${encodeURIComponent(projectId)}${reviewId ? `&reviewId=${encodeURIComponent(reviewId)}` : ""}`);
}

export async function getCharacterStateImpactFixture(projectId: string): Promise<CharacterStateImpactFixture> {
  return request<CharacterStateImpactFixture>(`${basePath}/author-control/character-state-fixture?projectId=${encodeURIComponent(projectId)}`);
}

export async function runCharacterStateImpactFixture(input: { projectId: string; action: "prepare" | "reject" | "confirm"; token: string }): Promise<CharacterStateImpactFixture> {
  const { token, action, ...body } = input;
  return request<CharacterStateImpactFixture>(`${basePath}/author-control/character-state-fixture/${action}`, { method: "POST", token, body });
}

export async function getNuwaBoundedFixture(projectId: string, fixtureCase?: "missing-source" | "stale"): Promise<NuwaBoundedFixture> {
  return request<NuwaBoundedFixture>(`${basePath}/author-control/nuwa-bounded-fixture?projectId=${encodeURIComponent(projectId)}${fixtureCase ? `&case=${encodeURIComponent(fixtureCase)}` : ""}`);
}

export async function runNuwaBoundedFixture(input: {
  projectId: string;
  action: "start" | "step" | "play" | "pause" | "resume" | "cancel" | "fork" | "select-branch" | "view" | "handoff" | "replay" | "prepare-review" | "prepare-impact" | "reject" | "confirm";
  token: string;
  operationId?: string;
  sourceBranchId?: string;
  sequence?: number;
  instruction?: string;
  branchId?: string;
  activeTool?: "observation" | "branch" | "compare" | "review" | "controls";
  view?: Partial<NuwaBoundedProjection["viewState"]>;
}): Promise<NuwaBoundedFixture> {
  const { token, action, ...body } = input;
  return request<NuwaBoundedFixture>(`${basePath}/author-control/nuwa-bounded-fixture/${action}`, { method: "POST", token, body });
}

export async function getMultiverseSingleDerivedFixture(projectId: string, options: { surface?: "nuwa"; fixtureCase?: "missing-source" | "stale" } = {}): Promise<MultiverseSingleDerivedFixture> {
  const query = new URLSearchParams({ projectId });
  if (options.surface) query.set("surface", options.surface);
  if (options.fixtureCase) query.set("case", options.fixtureCase);
  return request<MultiverseSingleDerivedFixture>(`${basePath}/author-control/multiverse-single-derived-fixture?${query.toString()}`);
}

export async function runMultiverseSingleDerivedFixture(input: {
  projectId: string;
  action: "create-root" | "save-derived" | "prepare-review" | "prepare-impact" | "reject" | "confirm";
  token: string;
  versionName?: string;
  sourceRevision?: number;
  changeId?: string;
  selectedChangeIds?: string[];
}): Promise<MultiverseSingleDerivedFixture> {
  const { token, action, ...body } = input;
  return request<MultiverseSingleDerivedFixture>(`${basePath}/author-control/multiverse-single-derived-fixture/${action}`, { method: "POST", token, body });
}

export async function createImpactReview(input: {
  projectId: string;
  sceneId: string;
  authorGoal: string;
  selectedObjectIds?: string[];
  token: string;
}): Promise<ImpactReview> {
  const { token, ...body } = input;
  return request<ImpactReview>(`${basePath}/author-control/impact-review/create`, { method: "POST", token, body });
}

export async function createPlanningEventImpactReview(projectId: string, planningEventId: string, token: string): Promise<ImpactReview> {
  return request<ImpactReview>(`${basePath}/author-control/impact-review/create-from-planning-event`, {
    method: "POST",
    token,
    body: { projectId, planningEventId }
  });
}

export async function chooseImpactRoute(input: {
  projectId: string;
  reviewId: string;
  optionId: string;
  action: "adopt" | "adjust" | "preserve";
  authorContent?: string;
  token: string;
}): Promise<ImpactReview> {
  const { token, ...body } = input;
  return request<ImpactReview>(`${basePath}/author-control/impact-review/choose`, { method: "POST", token, body });
}

export async function getAuthorChangeSet(projectId: string, changeSetId?: string): Promise<AuthorChangeSet | null> {
  return request<AuthorChangeSet | null>(`${basePath}/author-control/change-set?projectId=${encodeURIComponent(projectId)}${changeSetId ? `&changeSetId=${encodeURIComponent(changeSetId)}` : ""}`);
}

export async function createAuthorChangeSet(projectId: string, reviewId: string, token: string): Promise<AuthorChangeSet> {
  return request<AuthorChangeSet>(`${basePath}/author-control/change-set/create`, { method: "POST", token, body: { projectId, reviewId } });
}

export async function dryRunAuthorChangeSet(projectId: string, changeSetId: string, token: string): Promise<AuthorChangeSet> {
  return request<AuthorChangeSet>(`${basePath}/author-control/change-set/dry-run`, { method: "POST", token, body: { projectId, changeSetId } });
}

export async function abandonAuthorChangeSet(projectId: string, changeSetId: string, token: string): Promise<AuthorChangeSet> {
  return request<AuthorChangeSet>(`${basePath}/author-control/change-set/abandon`, { method: "POST", token, body: { projectId, changeSetId } });
}

export async function applyAuthorChangeSet(projectId: string, changeSetId: string, token: string): Promise<AuthorChangeSet> {
  return request<AuthorChangeSet>(`${basePath}/author-control/change-set/apply`, { method: "POST", token, body: { projectId, changeSetId } });
}

export async function getStoryExploration(projectId: string, explorationId?: string): Promise<StoryExploration | null> {
  return request<StoryExploration | null>(`${basePath}/author-control/exploration?projectId=${encodeURIComponent(projectId)}${explorationId ? `&explorationId=${encodeURIComponent(explorationId)}` : ""}`);
}

export async function createStoryExploration(projectId: string, sceneId: string, authorGoal: string, token: string): Promise<StoryExploration> {
  return request<StoryExploration>(`${basePath}/author-control/exploration/create`, { method: "POST", token, body: { projectId, sceneId, authorGoal } });
}

export async function createStandaloneStoryExploration(input: {
  projectId: string;
  story: string;
  authorGoal: string;
  characterNames?: string[];
  preservedFacts?: string[];
  boundaries?: string[];
  depth?: "short" | "medium" | "long";
  token: string;
}): Promise<StoryExploration> {
  const { token, ...body } = input;
  return request<StoryExploration>(`${basePath}/author-control/exploration/create-standalone`, { method: "POST", token, body });
}

export async function runStoryExploration(projectId: string, explorationId: string, token: string): Promise<StoryExploration> {
  return request<StoryExploration>(`${basePath}/author-control/exploration/run`, { method: "POST", token, body: { projectId, explorationId } });
}

export async function synthesizeStoryExploration(projectId: string, explorationId: string, token: string): Promise<StoryExploration> {
  return request<StoryExploration>(`${basePath}/author-control/exploration/synthesize`, { method: "POST", token, body: { projectId, explorationId } });
}

export async function submitStoryExplorationRoute(projectId: string, explorationId: string, routeId: string, token: string): Promise<{ exploration: StoryExploration; review: ImpactReview; overlay: IntelligenceOverlay }> {
  return request(`${basePath}/author-control/exploration/submit-route`, { method: "POST", token, body: { projectId, explorationId, routeId } });
}

export async function rejectStoryExplorationRoute(projectId: string, explorationId: string, routeId: string, reason: string, token: string): Promise<StoryExploration> {
  return request<StoryExploration>(`${basePath}/author-control/exploration/reject-route`, { method: "POST", token, body: { projectId, explorationId, routeId, reason } });
}

export async function cancelStoryExploration(projectId: string, explorationId: string, token: string): Promise<StoryExploration> {
  return request<StoryExploration>(`${basePath}/author-control/exploration/cancel`, { method: "POST", token, body: { projectId, explorationId } });
}

export async function getNuwaSceneSimulation(projectId: string, runId: string): Promise<NuwaSceneSimulationReadModelR0 | null> {
  return request<NuwaSceneSimulationReadModelR0 | null>(`${basePath}/author-control/exploration/scene-runtime?projectId=${encodeURIComponent(projectId)}&runId=${encodeURIComponent(runId)}`);
}

export async function createNuwaSceneSimulation(projectId: string, explorationId: string, runId: string, token: string): Promise<NuwaSceneSimulationReadModelR0> {
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/create`, { method: "POST", token, body: { projectId, explorationId, runId } });
}

export async function stepNuwaSceneSimulation(projectId: string, runId: string, token: string): Promise<NuwaSceneSimulationReadModelR0> {
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/step`, { method: "POST", token, body: { projectId, runId } });
}

export async function playNuwaSceneSimulation(projectId: string, runId: string, token: string, steps?: number): Promise<NuwaSceneSimulationReadModelR0> {
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/play`, { method: "POST", token, body: { projectId, runId, ...(steps === undefined ? {} : { steps }) } });
}

export async function pauseNuwaSceneSimulation(projectId: string, runId: string, token: string): Promise<NuwaSceneSimulationReadModelR0> {
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/pause`, { method: "POST", token, body: { projectId, runId } });
}

export async function stopNuwaSceneSimulation(projectId: string, runId: string, token: string): Promise<NuwaSceneSimulationReadModelR0> {
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/stop`, { method: "POST", token, body: { projectId, runId } });
}

export async function checkpointNuwaSceneSimulation(projectId: string, runId: string, token: string, checkpointId?: string): Promise<NuwaSceneSimulationReadModelR0> {
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/checkpoint`, { method: "POST", token, body: { projectId, runId, ...(checkpointId ? { checkpointId } : {}) } });
}

export async function interveneNuwaSceneSimulation(input: { projectId: string; runId: string; checkpointId: string; instruction: string; modifiedSoftGoal?: string; injectSecretTo?: string[]; token: string }): Promise<NuwaSceneSimulationReadModelR0> {
  const { token, ...body } = input;
  return request<NuwaSceneSimulationReadModelR0>(`${basePath}/author-control/exploration/scene-runtime/intervene`, { method: "POST", token, body });
}

export async function forkNuwaSceneSimulation(projectId: string, runId: string, checkpointId: string, token: string): Promise<{ parent: NuwaSceneSimulationReadModelR0; child: NuwaSceneSimulationReadModelR0 }> {
  return request<{ parent: NuwaSceneSimulationReadModelR0; child: NuwaSceneSimulationReadModelR0 }>(`${basePath}/author-control/exploration/scene-runtime/fork`, { method: "POST", token, body: { projectId, runId, checkpointId } });
}

export async function compareNuwaSceneSimulation(projectId: string, parentRunId: string, childRunId: string): Promise<NuwaSceneComparisonR0> {
  return request<NuwaSceneComparisonR0>(`${basePath}/author-control/exploration/scene-runtime/compare`, { method: "POST", token: "", body: { projectId, runId: childRunId, parentRunId, childRunId } });
}

export async function replayNuwaSceneSimulation(projectId: string, runId: string): Promise<NuwaSceneReplayR0> {
  return request<NuwaSceneReplayR0>(`${basePath}/author-control/exploration/scene-runtime/replay`, { method: "POST", token: "", body: { projectId, runId } });
}

export async function buildNuwaSceneCandidate(projectId: string, runId: string, token: string): Promise<{ candidate: NuwaSceneCandidateR0; review: GoldenLoopCandidateReview }> {
  return request(`${basePath}/author-control/exploration/scene-runtime/candidate`, { method: "POST", token, body: { projectId, runId } });
}

export async function getNuwaDirectorStateR1(projectId: string, runId: string): Promise<NuwaDirectorStateR1> {
  return request<NuwaDirectorStateR1>(`${basePath}/author-control/exploration/director-r1?projectId=${encodeURIComponent(projectId)}&runId=${encodeURIComponent(runId)}`);
}

export type NuwaDirectorActionR1 =
  | { action: "set-permission"; kind: NuwaDirectorPermissionKindR1; granted: boolean; reason: string }
  | { action: "create-temporary-agent"; displayName: string; purpose: string }
  | { action: "end-temporary-agent"; agentId: string; agentStatus: "completed" | "cancelled" }
  | { action: "create-longform-job"; title: string }
  | { action: "advance-longform-job"; confirmCreativeBrief?: boolean; confirmAuthorCheckpoint?: boolean }
  | { action: "pause-longform-job" | "resume-longform-job" | "cancel-longform-job" };

export async function updateNuwaDirectorStateR1(projectId: string, runId: string, action: NuwaDirectorActionR1, token: string): Promise<NuwaDirectorStateR1> {
  return request<NuwaDirectorStateR1>(`${basePath}/author-control/exploration/director-r1`, { method: "POST", token, body: { projectId, runId, ...action } });
}

export async function getIntelligenceOverlay(projectId: string): Promise<IntelligenceOverlay | null> {
  return request<IntelligenceOverlay | null>(`${basePath}/author-control/intelligence-overlay?projectId=${encodeURIComponent(projectId)}`);
}

export async function getReviewHistory(projectId: string): Promise<ReviewHistory> {
  return request<ReviewHistory>(`${basePath}/author-control/review-history?projectId=${encodeURIComponent(projectId)}`);
}

export async function createWritingDocument(input: {
  projectId: string;
  type: "chapter" | "scene";
  title: string;
  chapterId?: string;
  token: string;
}): Promise<WritingDocument> {
  const { token, ...body } = input;
  return request<WritingDocument>(`${basePath}/writing/create`, { method: "POST", token, body });
}

export async function startWriting(projectId: string, token: string): Promise<{
  chapter: WritingDocument;
  scene: WritingDocument;
  writing: WritingBootstrap;
}> {
  return request(`${basePath}/writing/start`, {
    method: "POST",
    token,
    body: { projectId }
  });
}

export async function openWritingDocument(projectId: string, documentId: string, token: string): Promise<WritingDocument> {
  return request<WritingDocument>(`${basePath}/writing/open`, { method: "POST", token, body: { projectId, documentId } });
}

export async function updateWritingDocument(input: {
  projectId: string;
  documentId: string;
  expectedHash: string;
  status: string;
  body: string;
  token: string;
}): Promise<{ conflict: boolean; document: WritingDocument }> {
  const { token, ...body } = input;
  return request<{ conflict: boolean; document: WritingDocument }>(`${basePath}/writing/update`, { method: "POST", token, body });
}

export async function searchWorldObjects(projectId: string, query: string, type?: WorldObjectType): Promise<WorldObjectSummary[]> {
  return request<WorldObjectSummary[]>(`${basePath}/world-objects/search`, {
    method: "POST",
    body: { projectId, query, ...(type ? { type } : {}) }
  });
}

export async function createWorldObject(input: {
  projectId: string;
  type: WorldObjectType;
  title: string;
  /** Ordinary event drafts stay outside the Author Control confirmation path. */
  status?: string;
  tags?: string[];
  aliases?: string[];
  body?: string;
  agentTypeId?: string;
  agentTypeFieldValues?: Record<string, string | number | boolean | null>;
  profile?: StoryStudioObjectProfile | null;
  token: string;
}): Promise<WorldObject> {
  const { token, ...body } = input;
  return request<WorldObject>(`${basePath}/world-objects/create`, { method: "POST", token, body });
}

export async function updateWorldObjectAgentType(input: {
  projectId: string;
  objectId: string;
  expectedHash: string;
  agentTypeId: string | null;
  agentTypeFieldValues?: Record<string, string | number | boolean | null>;
  token: string;
}): Promise<{ conflict: boolean; object: WorldObject }> {
  const { token, ...body } = input;
  return request(`${basePath}/world-objects/agent-type`, { method: "POST", token, body });
}

export async function listCardTemplates(projectId: string): Promise<CardTemplate[]> {
  return request<CardTemplate[]>(`${basePath}/card-templates?projectId=${encodeURIComponent(projectId)}`);
}

export async function createCardTemplate(input: { projectId: string; template: Omit<CardTemplate, "revisionToken">; token: string }): Promise<{ conflict: boolean; template: CardTemplate | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/card-templates/create`, { method: "POST", token, body });
}

export async function updateCardTemplate(input: { projectId: string; templateId: string; expectedHash: string; template: Omit<CardTemplate, "revisionToken">; token: string }): Promise<{ conflict: boolean; template: CardTemplate | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/card-templates/update`, { method: "POST", token, body });
}

export async function createCardTemplateFromCharacter(input: { projectId: string; objectId: string; templateId: string; label: string; expectedHash: string; presentationExpectedHash: string | null; token: string }): Promise<{ conflict: boolean; template: CardTemplate | null }> {
  const { token, ...body } = input;
  return request(`${basePath}/card-templates/from-character`, { method: "POST", token, body });
}

export async function deleteCardTemplate(input: { projectId: string; templateId: string; expectedHash: string; token: string }): Promise<{ conflict: boolean; deleted: boolean }> {
  const { token, ...body } = input;
  return request(`${basePath}/card-templates/delete`, { method: "POST", token, body });
}

export async function previewCharacterTemplateApply(input: { projectId: string; objectId: string; templateId: string; templateExpectedHash: string; markdownExpectedHash: string; presentationExpectedHash: string | null }): Promise<{ conflict: boolean; templateConflict: boolean; markdownConflict: boolean; presentationConflict: boolean; templateReadValid: boolean; diff: CharacterTemplateDiff | null }> {
  return request(`${basePath}/character-templates/preview`, { method: "POST", body: input });
}

export async function applyCharacterTemplate(input: { projectId: string; objectId: string; templateId: string; templateExpectedHash: string; markdownExpectedHash: string; presentationExpectedHash: string | null; token: string }): Promise<UpdateWorldObjectResult & { templateReadValid: boolean; characterStructureSaved: boolean; unplacedSectionsCreated: number; unplacedPropertiesCreated: number; templateOverwriteCount: 0; diff: CharacterTemplateDiff }> {
  const { token, ...body } = input;
  return request(`${basePath}/character-templates/apply`, { method: "POST", token, body });
}

export async function createCharacterCard(input: {
  projectId: string;
  title: string;
  mode: "guided" | "freeform" | "template";
  subtype?: string;
  status?: string;
  tags?: string[];
  aliases?: string[];
  background?: string;
  personality?: string;
  appearance?: string;
  properties?: Array<Omit<CharacterProperty, "references">>;
  portrait?: ObjectCardImage | null;
  cover?: ObjectCardImage | null;
  templateId?: string;
  templateExpectedHash?: string;
  agentTypeId?: string;
  agentTypeFieldValues?: Record<string, string | number | boolean | null>;
  profile?: StoryStudioObjectProfile | null;
  token: string;
}): Promise<{ conflict: boolean; characterContentSaved: boolean; presentationSaved: boolean; presentationConflict: boolean; orphanCreated: false; templateReadValid: boolean | null; object: WorldObject }> {
  const { token, ...body } = input;
  return request(`${basePath}/characters/create`, { method: "POST", token, body });
}

export async function readWorldObject(projectId: string, objectId: string): Promise<WorldObject> {
  return request<WorldObject>(`${basePath}/world-object?projectId=${encodeURIComponent(projectId)}&objectId=${encodeURIComponent(objectId)}`);
}

export async function rememberWorldObject(projectId: string, objectId: string, token: string): Promise<WorldObject> {
  return request<WorldObject>(`${basePath}/world-objects/open`, { method: "POST", token, body: { projectId, objectId } });
}

export async function closeWorldObject(projectId: string, objectId: string, token: string): Promise<WorldLibraryBootstrap> {
  return request<WorldLibraryBootstrap>(`${basePath}/world-objects/close`, { method: "POST", token, body: { projectId, objectId } });
}

export async function updateWorldObject(input: {
  projectId: string;
  objectId: string;
  expectedHash: string;
  presentationExpectedHash: string | null;
  writeMarkdown: boolean;
  writePresentation: boolean;
  title: string;
  status: string;
  tags: string[];
  aliases: string[];
  body: string;
  subtype?: string;
  typedProperties?: Array<Omit<CharacterProperty, "references">>;
  profile?: StoryStudioObjectProfile | null;
  card: ObjectCardComposition;
  token: string;
}): Promise<UpdateWorldObjectResult> {
  const { token, ...body } = input;
  return request<UpdateWorldObjectResult>(`${basePath}/world-objects/update`, { method: "POST", token, body });
}

export async function duplicateWorldObject(input: { projectId: string; objectId: string; token: string }): Promise<WorldObject> {
  const { token, ...body } = input;
  return request<WorldObject>(`${basePath}/world-objects/duplicate`, { method: "POST", token, body });
}

export async function archiveWorldObject(input: { projectId: string; objectId: string; expectedHash: string; token: string }): Promise<WorldObject> {
  const { token, ...body } = input;
  return request<WorldObject>(`${basePath}/world-objects/archive`, { method: "POST", token, body });
}

export async function restoreWorldObject(input: { projectId: string; objectId: string; expectedHash: string; token: string }): Promise<WorldObject> {
  const { token, ...body } = input;
  return request<WorldObject>(`${basePath}/world-objects/restore`, { method: "POST", token, body });
}

export async function bulkUpdateWorldObjects(input: { projectId: string; objectIds: string[]; operation: "add-tags" | "remove-tags" | "archive" | "restore"; tags?: string[]; token: string }): Promise<{ updatedObjectIds: string[]; skippedObjectIds: string[] }> {
  const { token, ...body } = input;
  return request(`${basePath}/world-objects/bulk`, { method: "POST", token, body });
}

export async function moveWorldObjectsToFolder(input: { projectId: string; objectIds: string[]; folderId: string | null; token: string }): Promise<{ conflict: boolean; placements: WorkspacePlacement[] }> {
  const { token, ...body } = input;
  return request(`${basePath}/world-objects/move-to-folder`, { method: "POST", token, body });
}

export async function stageTextImport(input: { projectId: string; filename: string; title?: string; content: string; folderId?: string | null; token: string }): Promise<WorldObject> {
  const { token, ...body } = input;
  return request(`${basePath}/library/import-text`, { method: "POST", token, body });
}

export async function listSourceImportReviews(projectId: string): Promise<SourceImportDocumentR0[]> {
  return request<SourceImportDocumentR0[]>(`${basePath}/source-import/reviews?projectId=${encodeURIComponent(projectId)}`);
}

export async function readSourceImportReview(projectId: string, sourceDocumentId: string): Promise<SourceImportDocumentR0 | null> {
  return request<SourceImportDocumentR0 | null>(`${basePath}/source-import/review?projectId=${encodeURIComponent(projectId)}&sourceDocumentId=${encodeURIComponent(sourceDocumentId)}`);
}

export async function importSourceDocument(input: { projectId: string; filename: string; title?: string; content: string; folderId?: string | null; mode?: "reference-only" | "extract-review"; token: string }): Promise<SourceImportDocumentR0> {
  const { token, ...body } = input;
  return request<SourceImportDocumentR0>(`${basePath}/source-import/import`, { method: "POST", token, body });
}

export async function extractSourceImportCandidates(projectId: string, sourceDocumentId: string, token: string): Promise<SourceImportDocumentR0> {
  return request<SourceImportDocumentR0>(`${basePath}/source-import/extract`, { method: "POST", token, body: { projectId, sourceDocumentId } });
}

export async function decideSourceImportCandidate(input: { projectId: string; sourceDocumentId: string; candidateId: string; decision: "accepted" | "rejected" | "merged"; targetObjectId?: string | null; token: string }): Promise<{ document: SourceImportDocumentR0; authorControl?: { reviewId?: string; status?: string } }> {
  const { token, ...body } = input;
  return request(`${basePath}/source-import/candidate/decide`, { method: "POST", token, body });
}

export async function handoffSourceImportUnit(input: { projectId: string; sourceDocumentId: string; unitCandidateId: string; authorQuestion: string; token: string }): Promise<{ handoff: SourceImportHandoffR0; brief: TianyiNuwaExecutionBrief }> {
  const { token, ...body } = input;
  return request(`${basePath}/source-import/handoff`, { method: "POST", token, body });
}

export async function getR9AWorkflowState(projectId: string): Promise<R9AWorkflowState> {
  return request(`${basePath}/r9a-workflow?projectId=${encodeURIComponent(projectId)}`);
}

export async function createR9AWorkflowTask(input: { projectId: string; title: string; lane: R9AWorkflowTask["lane"]; sourceRefs?: string[]; state?: R9AWorkflowTask["state"]; token: string }): Promise<R9AWorkflowState> {
  const { token, ...body } = input;
  return request(`${basePath}/r9a-workflow/tasks/create`, { method: "POST", token, body });
}

export async function updateR9AWorkflowTask(input: { projectId: string; taskId: string; expectedHash: string; state: R9AWorkflowTask["state"]; token: string }): Promise<{ conflict: boolean; state: R9AWorkflowState }> {
  const { token, ...body } = input;
  return request(`${basePath}/r9a-workflow/tasks/update`, { method: "POST", token, body });
}

export async function listR9AProjectBackups(projectId: string): Promise<R9AProjectBackup[]> {
  return request(`${basePath}/r9a-recovery/backups?projectId=${encodeURIComponent(projectId)}`);
}

export async function createR9AProjectBackup(input: { projectId: string; title: string; token: string }): Promise<R9AProjectBackup> {
  const { token, ...body } = input;
  return request(`${basePath}/r9a-recovery/backups/create`, { method: "POST", token, body });
}

export async function restoreR9AProjectBackup(input: { projectId: string; backupId: string; confirmed: boolean; token: string }): Promise<{ restored: boolean; checkpoint: R9AProjectBackup; backup: R9AProjectBackup }> {
  const { token, ...body } = input;
  return request(`${basePath}/r9a-recovery/backups/restore`, { method: "POST", token, body });
}

export type WorldObjectDeletePreview = {
  object: WorldObjectSummary;
  backlinks: WorldObjectSummary[];
  visualReferences: ObjectVisualReference[];
  deletable: boolean;
  reason: string | null;
};

export async function previewWorldObjectDelete(projectId: string, objectId: string): Promise<WorldObjectDeletePreview> {
  return request<WorldObjectDeletePreview>(`${basePath}/world-objects/delete-preview`, { method: "POST", body: { projectId, objectId } });
}

export async function deleteWorldObject(input: { projectId: string; objectId: string; expectedHash: string; confirmed: boolean; token: string }): Promise<{ deleted: boolean; impactedBacklinks: WorldObjectSummary[]; impactedVisualReferences: ObjectVisualReference[] }> {
  const { token, ...body } = input;
  return request(`${basePath}/world-objects/delete`, { method: "POST", token, body });
}

export async function createPlanningEvent(input: {
  projectId: string;
  title: string;
  body?: string;
  tags?: string[];
  token: string;
}): Promise<WorldObject> {
  const { token, ...body } = input;
  return request<WorldObject>(`${basePath}/planning-events/create`, { method: "POST", token, body });
}

export async function abandonPlanningEvent(input: {
  projectId: string;
  planningEventId: string;
  expectedHash: string;
  token: string;
}): Promise<PlanningEventResult> {
  const { token, ...body } = input;
  return request<PlanningEventResult>(`${basePath}/planning-events/abandon`, { method: "POST", token, body });
}

export async function pausePlanningEvent(input: { projectId: string; planningEventId: string; expectedHash: string; token: string }): Promise<PlanningEventResult> {
  const { token, ...body } = input;
  return request<PlanningEventResult>(`${basePath}/planning-events/pause`, { method: "POST", token, body });
}

export async function resumePlanningEvent(input: { projectId: string; planningEventId: string; expectedHash: string; token: string }): Promise<PlanningEventResult> {
  const { token, ...body } = input;
  return request<PlanningEventResult>(`${basePath}/planning-events/resume`, { method: "POST", token, body });
}

export async function setWorkspaceSelection(projectId: string, selection: WorkspaceSelection, token: string): Promise<WorkspaceSelection> {
  return request<WorkspaceSelection>(`${basePath}/workspace/selection`, { method: "POST", token, body: { projectId, selection } });
}

export async function getVisualWorkbench(projectId: string): Promise<VisualWorkbenchBootstrap> {
  return request<VisualWorkbenchBootstrap>(`${basePath}/visual-workbench?projectId=${encodeURIComponent(projectId)}`);
}

export async function readVisualDocument(projectId: string, relativePath: string): Promise<VisualDocument> {
  return request<VisualDocument>(`${basePath}/visual-document?projectId=${encodeURIComponent(projectId)}&relativePath=${encodeURIComponent(relativePath)}`);
}

export async function createVisualDocument(input: {
  projectId: string;
  type: VisualDocumentType;
  title: string;
  token: string;
}): Promise<VisualDocument> {
  const { token, ...body } = input;
  return request<VisualDocument>(`${basePath}/visual-documents/create`, { method: "POST", token, body });
}

export async function openVisualDocument(input: {
  projectId: string;
  relativePath: string;
  pane: "primary" | "secondary";
  token: string;
}): Promise<VisualDocument> {
  const { token, ...body } = input;
  return request<VisualDocument>(`${basePath}/visual-documents/open`, { method: "POST", token, body });
}

export async function closeVisualDocument(projectId: string, relativePath: string, token: string): Promise<VisualWorkbenchBootstrap> {
  return request<VisualWorkbenchBootstrap>(`${basePath}/visual-documents/close`, { method: "POST", token, body: { projectId, relativePath } });
}

export async function updateVisualDocument(input: {
  projectId: string;
  relativePath: string;
  expectedHash: string;
  document: VisualDocument;
  token: string;
}): Promise<{ conflict: boolean; document: VisualDocument }> {
  const { token, ...body } = input;
  return request<{ conflict: boolean; document: VisualDocument }>(`${basePath}/visual-documents/update`, { method: "POST", token, body });
}

export async function validateTimelineDocument(input: {
  projectId: string;
  relativePath: string;
  expectedHash: string;
  document: TimelineDocument;
  token: string;
}): Promise<TimelineValidationResult> {
  const { token, ...body } = input;
  return request<TimelineValidationResult>(`${basePath}/timeline/validate`, { method: "POST", token, body });
}

export async function createPlanningEventAndAddToTimeline(input: {
  projectId: string;
  timelineRelativePath: string;
  timelineExpectedHash: string;
  title: string;
  body?: string;
  tags?: string[];
  token: string;
}): Promise<PlanningEventTimelineResult> {
  const { token, ...body } = input;
  return request<PlanningEventTimelineResult>(`${basePath}/timeline/planning-event/create-and-add`, { method: "POST", token, body });
}

export async function addPlanningEventToTimeline(input: {
  projectId: string;
  timelineRelativePath: string;
  timelineExpectedHash: string;
  planningEventId: string;
  token: string;
}): Promise<AddPlanningEventResult> {
  const { token, ...body } = input;
  return request<AddPlanningEventResult>(`${basePath}/timeline/planning-event/add-existing`, { method: "POST", token, body });
}

export async function setVisualSplitView(projectId: string, enabled: boolean, token: string): Promise<VisualWorkbenchBootstrap> {
  return request<VisualWorkbenchBootstrap>(`${basePath}/visual-workbench/split`, { method: "POST", token, body: { projectId, enabled } });
}

export async function swapVisualPanes(projectId: string, token: string): Promise<VisualWorkbenchBootstrap> {
  return request<VisualWorkbenchBootstrap>(`${basePath}/visual-workbench/swap`, { method: "POST", token, body: { projectId } });
}

export async function setStoryStudioSurface(projectId: string, surface: "world-library" | "visual-workbench", token: string): Promise<void> {
  await request<{ surface: string }>(`${basePath}/workspace/surface`, { method: "POST", token, body: { projectId, surface } });
}

export async function importVisualAsset(input: {
  projectId: string;
  category: "maps" | "images";
  filename: string;
  mimeType: string;
  base64: string;
  token: string;
}): Promise<VisualAsset> {
  const { token, ...body } = input;
  return request<VisualAsset>(`${basePath}/visual-assets/import`, { method: "POST", token, body });
}

export function visualAssetUrl(projectId: string, relativePath: string): string {
  return `${basePath}/visual-asset?projectId=${encodeURIComponent(projectId)}&relativePath=${encodeURIComponent(relativePath)}`;
}

export async function getTianyiIdentity(projectId: string, token: string): Promise<TianyiIdentity> {
  return tianyiRequest("identity", token, { projectId });
}

export type MultiNodePredictionRunProjection = import("../../../../src/storyContracts/multiNodePrediction.ts").PredictionRun;
export type TianyiPredictionExecutionProjection = import("../../../../src/storyContracts/tianyiAgentMode.ts").TianyiAgentExecutionProjection;
// Keep the browser transport boundary structural. Importing the server-side
// AuthorControl implementation here pulls its Node-only dependency graph into
// the Vite typecheck even though the client only consumes this read model.
export type MultiNodePredictionReviewProjection = {
  version: "story-studio-prediction-review/v1";
  id: string;
  projectId: string;
  runId: string;
  pathId: string;
  selectedCandidateNodeIds: string[];
  status: "reviewing" | "drafted";
  receipt: unknown | null;
  updatedAt: string;
};
export async function createMultiNodePredictionRun(input: { request: import("../../../../src/storyContracts/multiNodePrediction.ts").MultiNodePredictionRequest; runId: string; token: string }): Promise<MultiNodePredictionRunProjection> { const { token, ...body } = input; return tianyiRequest("prediction/create", token, body); }
export async function executeMultiNodePredictionRun(input: { projectId: string; runId: string; token: string }): Promise<MultiNodePredictionRunProjection> { const { token, ...body } = input; return tianyiRequest("prediction/execute", token, body); }
export async function getMultiNodePredictionRun(input: { projectId: string; runId: string; token: string }): Promise<MultiNodePredictionRunProjection | null> { const { token, ...body } = input; return tianyiRequest("prediction/read", token, body); }
export async function getMultiNodePredictionExecution(input: { projectId: string; runId: string; token: string }): Promise<TianyiPredictionExecutionProjection | null> { const { token, ...body } = input; return tianyiRequest("prediction/execution", token, body); }
export async function listMultiNodePredictionRuns(projectId: string, token: string): Promise<MultiNodePredictionRunProjection[]> { return tianyiRequest("prediction/list", token, { projectId }); }
export async function stopMultiNodePredictionRun(input: { projectId: string; runId: string; reason: string; token: string }): Promise<MultiNodePredictionRunProjection> { const { token, ...body } = input; return tianyiRequest("prediction/stop", token, body); }
export async function retryMultiNodePredictionRun(input: { projectId: string; runId: string; token: string }): Promise<MultiNodePredictionRunProjection> { const { token, ...body } = input; return tianyiRequest("prediction/retry", token, body); }
export async function abandonMultiNodePredictionRun(input: { projectId: string; runId: string; token: string }): Promise<MultiNodePredictionRunProjection> { const { token, ...body } = input; return tianyiRequest("prediction/abandon", token, body); }
export type TemporalProjectionRunProjection = import("../../../../src/storyContracts/temporalProjection.ts").TemporalProjectionRun;
export async function getTemporalGraphRevision(input: { projectId: string; eventRefs: import("../../../../src/storyContracts/storyStudioEventReference.ts").StoryStudioEventReference[]; token: string }): Promise<{ graphRevisionHash: string; eventCount: number; relationCount: number }> { const { token, ...body } = input; return tianyiRequest("temporal-projection/revision", token, body); }
export async function createTemporalProjectionRun(input: { request: import("../../../../src/storyContracts/temporalProjection.ts").TemporalProjectionRequest; runId: string; token: string }): Promise<TemporalProjectionRunProjection> { const { token, ...body } = input; return tianyiRequest("temporal-projection/create", token, body); }
export async function executeTemporalProjectionRun(input: { projectId: string; runId: string; token: string }): Promise<TemporalProjectionRunProjection> { const { token, ...body } = input; return tianyiRequest("temporal-projection/execute", token, body); }
export async function getTemporalProjectionRun(input: { projectId: string; runId: string; token: string }): Promise<TemporalProjectionRunProjection | null> { const { token, ...body } = input; return tianyiRequest("temporal-projection/read", token, body); }
export async function getTemporalProjectionByRevision(input: { projectId: string; graphRevisionHash: string; token: string }): Promise<TemporalProjectionRunProjection | null> { const { token, ...body } = input; return tianyiRequest("temporal-projection/read-revision", token, body); }
export async function listTemporalProjectionRuns(projectId: string, token: string): Promise<TemporalProjectionRunProjection[]> { return tianyiRequest("temporal-projection/list", token, { projectId }); }
export async function stopTemporalProjectionRun(input: { projectId: string; runId: string; token: string }): Promise<TemporalProjectionRunProjection> { const { token, ...body } = input; return tianyiRequest("temporal-projection/stop", token, body); }
export async function retryTemporalProjectionRun(input: { projectId: string; runId: string; token: string }): Promise<TemporalProjectionRunProjection> { const { token, ...body } = input; return tianyiRequest("temporal-projection/retry", token, body); }
export type StoryModelingRunProjection = import("../../../../src/storyContracts/storyModeling.ts").StoryModelingRun;
export type StoryLogicReviewProjection = import("../../../../src/storyContracts/storyModeling.ts").StoryLogicReviewRecord;
export type StoryModelingPlanProjection = { manifest: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingSourceManifest; scope: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingScope; modelingBasis: "original-sources" | "event-only"; recommendation: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingRecommendation; estimate: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingEstimate };
export async function planStoryModeling(input: { projectId: string; tool: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingTool; scope: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingScope; eventRefs: import("../../../../src/storyContracts/storyStudioEventReference.ts").StoryStudioEventReference[]; previousManifestDigest?: string | null; structuralChange?: boolean; token: string }): Promise<StoryModelingPlanProjection> { const { token, ...body } = input; return tianyiRequest("story-modeling/plan", token, body); }
export async function createStoryModelingRunTransport(input: { request: import("../../../../src/storyContracts/storyModeling.ts").StoryModelingRequest; runId: string; token: string }): Promise<StoryModelingRunProjection> { const { token, ...body } = input; return tianyiRequest("story-modeling/create", token, body); }
export async function executeStoryModelingRunTransport(input: { projectId: string; runId: string; token: string }): Promise<StoryModelingRunProjection> { const { token, ...body } = input; return tianyiRequest("story-modeling/execute", token, body); }
export async function getStoryModelingRun(input: { projectId: string; runId: string; token: string }): Promise<StoryModelingRunProjection | null> { const { token, ...body } = input; return tianyiRequest("story-modeling/read", token, body); }
export async function listStoryModelingRuns(projectId: string, token: string): Promise<StoryModelingRunProjection[]> { return tianyiRequest("story-modeling/list", token, { projectId }); }
export async function stopStoryModelingRunTransport(input: { projectId: string; runId: string; token: string }): Promise<StoryModelingRunProjection> { const { token, ...body } = input; return tianyiRequest("story-modeling/stop", token, body); }
export async function listStoryLogicReviews(projectId: string, token: string): Promise<StoryLogicReviewProjection[]> { return tianyiRequest("story-modeling/logic-reviews/list", token, { projectId }); }
export async function reviewStoryLogicFinding(input: { projectId: string; findingId: string; source: "local" | "ai"; evidenceRefs: string[]; authorStatus: "ignored" | "resolved"; token: string }): Promise<StoryLogicReviewProjection> { const { token, ...body } = input; return tianyiRequest("story-modeling/logic-reviews/review", token, body); }
export async function getMultiNodePredictionReview(projectId: string, reviewId: string): Promise<MultiNodePredictionReviewProjection | null> { return request(`${basePath}/author-control/prediction-review?projectId=${encodeURIComponent(projectId)}&reviewId=${encodeURIComponent(reviewId)}`); }
export async function listMultiNodePredictionReviews(projectId: string, runId: string): Promise<MultiNodePredictionReviewProjection[]> { return request(`${basePath}/author-control/prediction-review?projectId=${encodeURIComponent(projectId)}&runId=${encodeURIComponent(runId)}`); }
export async function createMultiNodePredictionReview(input: { projectId: string; runId: string; pathId: string; selectedCandidateNodeIds: string[]; decidedAt: string; token: string }): Promise<MultiNodePredictionReviewProjection> { const { token, ...body } = input; return request(`${basePath}/author-control/prediction-review/create`, { method: "POST", token, body }); }
export async function acceptMultiNodePredictionReview(input: { projectId: string; reviewId: string; operationId: string; decidedAt: string; token: string }): Promise<MultiNodePredictionReviewProjection> { const { token, ...body } = input; return request(`${basePath}/author-control/prediction-review/accept`, { method: "POST", token, body }); }

export async function getTianyiProjectResume(projectId: string, agentId: string, token: string): Promise<TianyiProjectResume> {
  return tianyiRequest("project-resume", token, { projectId, agentId });
}

export async function openTianyiSession(projectId: string, operationId: string, token: string, retentionMode: "normal" | "temporary" = "normal"): Promise<{ sessionId: string; contentHash: string | null; alreadyCompleted: boolean; conflict?: boolean; retentionMode: "normal" | "temporary"; archiveWriteCount: number }> {
  return tianyiRequest("session/open", token, { projectId, operationId, retentionMode });
}

export async function runTianyiQuestion(input: { projectId: string; sessionId: string; operationId: string; request: { authorQuery: string } | { boundedAction: string }; contextRequest: TianyiContextRequest; archiveMessageRefs?: TianyiArchiveMessageRef[]; token: string }): Promise<TianyiQuestionOperation & { retentionMode?: "temporary"; archiveWriteCount?: number; receiptWriteCount?: number }> {
  const { token, ...body } = input;
  return tianyiRequest("question", token, body);
}

export type TianyiAgentRunProjection = {
  version: "tianyi-agent-run-projection/v1";
  runId: string;
  projectId: string;
  workVersionId: string;
  sessionId: string;
  task: string;
  currentPage: string;
  contextRequest: Record<string, unknown> | null;
  status: "idle" | "planning" | "awaiting_author" | "running" | "paused" | "completed" | "failed" | "cancelled";
  contextManifest: {
    version: "tianyi-agent-context-manifest/v1";
    projectId: string;
    workVersionId: string;
    sessionId: string;
    currentPage: string;
    selectedObjectIds: string[];
    sourceRefs: Array<{ id: string; label: string; hash: string; state: "current" | "stale" | "excluded" }>;
    authorSourceRefs: string[];
    excludedRefs: Array<{ id: string; reason: string }>;
    unresolvedQuestions: string[];
    estimatedTokens: number;
    compaction: { state: "none" | "available" | "applied"; summaryVersion: number; preservedAnchors: string[]; receiptId: string | null };
    simulationContextPack?: { snapshotId: string; authorIntent: string; intent: string; sourceState: string; entryPoint: string; sources: Array<{ sourceId: string; sourceRole: string; authorityLevel: string; displayTitle: string }>; omitted: Array<{ sourceId: string; reason: string }>; estimatedTokens: number; maxProviderCalls: 1 } | null;
  } | null;
  resultSummary: string | null;
  model: { providerId: string | null; profileId: string | null; modelId: string | null; runtime: "fixture" | "provider" | "pi" };
  budget: { maxProviderCalls: number; maxOutputTokens: number; providerCalls: number; estimatedTokens: number };
  observability: { traceId: string | null; latencyMs: number | null; promptTokens: number; completionTokens: number; totalTokens: number; streamEventCount: number };
  permissionProfile: "step-by-step" | "conservative" | "proactive";
  plan: Array<{ stepId: string; title: string; kind: string; classification: "read" | "proposal"; requiredPermission: "none" | "author-approval"; status: string; toolName?: string; error?: string | null }>;
  toolCalls: Array<{ callId: string; toolName: string; classification: "read" | "proposal"; status: string; arguments: Record<string, unknown>; output: Record<string, unknown> | null; receiptId: string | null; error: string | null; startedAt: string; completedAt: string | null }>;
  approvals: Array<{ stepId: string; decision: "approved" | "rejected"; operationId: string; receiptId: string; recordedAt: string }>;
  steering: Array<{ instruction: string; operationId: string; recordedAt: string }>;
  candidates: Array<{ candidateId: string; kind: string; title: string; summary: string; sourceRefs: string[]; uncertainties: string[]; targetOwnerKind: string; state: string; ownerReceipt: { owner: string; id: string; revision: number | null } | null }>;
  receipts: Array<{ receiptId: string; kind: string; label: string; operationId: string; recordedAt: string }>;
  stopReason: string | null;
  error: { category: string; code: string; message: string; retryable: boolean; retryBoundary: "none" | "author-explicit" } | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type TianyiAgentStreamEvent =
  | { type: "text-delta"; delta: string; sequence: number; recordedAt: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string; sequence: number; recordedAt: string }
  | { type: "tool-call-end"; toolCallId: string; toolName: string; isError: boolean; sequence: number; recordedAt: string };
export type TianyiAgentRuntimeEvent = { version: "tianyi-agent-runtime-event/v1"; runId: string; workVersionId: string; operationId: string; kind: "snapshot" | "stream" | "tool-call" | "approval" | "steering" | "receipt"; streamEvent?: TianyiAgentStreamEvent; projection: TianyiAgentRunProjection; recordedAt: string };

export async function startTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; task: string; currentPage: string; contextRequest?: Record<string, unknown>; permissionProfile?: "step-by-step" | "conservative" | "proactive"; operationId: string; token: string }): Promise<TianyiAgentRunProjection> {
  const { token, ...body } = input;
  return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/start`, { method: "POST", token, body });
}
export async function continueTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/continue`, { method: "POST", token, body }); }
export async function streamTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; token: string; signal?: AbortSignal; onEvent(event: TianyiAgentStreamEvent): void }): Promise<TianyiAgentRunProjection> {
  const { token: _token, signal, onEvent, ...body } = input;
  const response = await fetch(`${basePath}/tianyi-agent/run/stream`, { method: "POST", credentials: "same-origin", headers: { accept: "application/x-ndjson", "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) throw new LocalTransportError("Agent 流式连接暂时不可用。", response.status);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let projection: TianyiAgentRunProjection | null = null;
  while (true) {
    const { value, done } = await reader.read();
    pending += value ?? "";
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as { type: "event"; data: TianyiAgentStreamEvent } | { type: "projection"; data: TianyiAgentRunProjection } | { type: "error"; error: string };
      if (message.type === "event") onEvent(message.data);
      else if (message.type === "projection") projection = message.data;
      else throw new LocalTransportError(message.error, 500);
    }
    if (done) break;
  }
  if (!projection) throw new LocalTransportError("Agent 流结束时没有可恢复的运行投影。", 502);
  return projection;
}
export async function approveTianyiAgentStep(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; stepId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/approve`, { method: "POST", token, body }); }
export async function rejectTianyiAgentStep(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; stepId: string; reason?: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/reject`, { method: "POST", token, body }); }
export async function steerTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; instruction: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/steer`, { method: "POST", token, body }); }
export async function pauseTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/pause`, { method: "POST", token, body }); }
export async function resumeTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/resume`, { method: "POST", token, body }); }
export async function cancelTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; reason?: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/run/cancel`, { method: "POST", token, body }); }
export async function recoverTianyiAgentRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; token: string }): Promise<TianyiAgentRunProjection | null> { const { token, ...body } = input; return request<TianyiAgentRunProjection | null>(`${basePath}/tianyi-agent/run/recover`, { method: "POST", token, body }); }
export async function getTianyiAgentRunProjection(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; token: string }): Promise<TianyiAgentRunProjection | null> { const { token, projectId, workVersionId, sessionId, runId } = input; return request<TianyiAgentRunProjection | null>(`${basePath}/tianyi-agent/run/projection?projectId=${encodeURIComponent(projectId)}&workVersionId=${encodeURIComponent(workVersionId)}&sessionId=${encodeURIComponent(sessionId)}&runId=${encodeURIComponent(runId)}`, { token }); }
export async function getTianyiAgentRunEvents(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; token: string }): Promise<TianyiAgentRuntimeEvent[]> { const { token, projectId, workVersionId, sessionId, runId } = input; return request<TianyiAgentRuntimeEvent[]>(`${basePath}/tianyi-agent/run/events?projectId=${encodeURIComponent(projectId)}&workVersionId=${encodeURIComponent(workVersionId)}&sessionId=${encodeURIComponent(sessionId)}&runId=${encodeURIComponent(runId)}`, { token }); }
export async function handoffTianyiAgentCandidate(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidateId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection> { const { token, ...body } = input; return request<TianyiAgentRunProjection>(`${basePath}/tianyi-agent/candidate/handoff`, { method: "POST", token, body }); }

export type TianyiCreativeSourceRef = { sessionId: string; eventId: string; contentHash: string };
export type TianyiCreativeProjection = { version: "tianyi-creative-session-projection/v1"; sessionId: string | null; sessionContentHash: string; lifecycle: "idle" | "capturing" | "responding" | "extracting" | "review-ready" | "paused" | "recovering" | "provider-unavailable" | "completed" | "archived"; archived: boolean; originals: Array<TianyiCreativeSourceRef & { text: string; recordedAt: string }>; responses: Array<{ eventId: string; text: string; runtime: "fixture" | "provider"; recordedAt: string }>; summary: string | null; themes: string[]; openQuestions: string[]; summarySourceRefs: TianyiCreativeSourceRef[]; summaryState: "missing" | "current" | "stale"; candidates: Array<{ candidateId: string; kind: string; title: string; summary: string; uncertainties: string[]; sourceExcerpt: string; targetOwnerKind: string; duplicateHints: string[]; reviewStatus: "pending" | "rejected" | "deferred" | "handed-off"; sourceRefs: TianyiCreativeSourceRef[]; state: "pending" | "rejected" | "deferred" | "handed-off"; revision: number; ownerReceipt: { owner: string; id: string; revision: number | null } | null }>; pendingCount: number; pendingCandidateRefs: string[]; unresolvedCount: number; lastSafePoint: { eventId: string; sequence: number; contentHash: string } | null; providerUnavailable: { stage: "response" | "extraction"; message: string; retryable: boolean } | null };
export type TianyiCreativeEventReview = { version: "tianyan-tianyi-event-review-bridge/r0"; proposal: { id: string; title: string; summary: string; origin: { projectId: string; sessionId: string; eventId: string; version: string }; writeTarget: { storyId: string; version: string; owner: string }; evidence: Array<{ sourceRef: string; excerpt: string }>; unknowns: string[] }; reviewContext: { project: { id: string; displayName: string }; source: { displayName: string; versionLabel: string; freshness: "current" }; writeTarget: { id: string; displayName: string }; safety: "候选，不会自动写入故事事实" }; planning: { id: string; title: string; revision: string } | null; candidateReview: GoldenLoopCandidateReview | null; impact: { id: string; status: string; options: Array<{ id: string; label: string; summary: string }> } | null; changeSet: { id: string; status: string; application: { appliedEventId: string | null } } | null; confirmedEvents: Array<{ id: string; title: string; revision: string }>; writeBoundary: { canon: 0; worldState: 0; event: 0; provider: 0; plugin: 0 } };
export async function captureTianyiCreativeAuthorSource(input: { projectId: string; sessionId: string; operationId: string; submissionId: string; text: string; collaborate: boolean; token: string }): Promise<{ source: TianyiCreativeSourceRef; alreadyCompleted: boolean }> { const { token, ...body } = input; return tianyiRequest("creative/capture", token, body); }
export async function extractTianyiCreativeProjection(input: { projectId: string; sessionId: string; operationId: string; source: TianyiCreativeSourceRef; fixture?: unknown; token: string }): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }> { const { token, ...body } = input; return tianyiRequest("creative/extract", token, body); }
export async function getTianyiCreativeProjection(projectId: string, sessionId: string, token: string): Promise<TianyiCreativeProjection | null> { return tianyiRequest("creative/projection", token, { projectId, sessionId }); }
export async function editTianyiCreativeCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; expectedRevision: number; title: string; summary: string; uncertainties: string[]; token: string }): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }> { const { token, ...body } = input; return tianyiRequest("creative/candidate/edit", token, body); }
export async function decideTianyiCreativeCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; decision: "rejected" | "deferred"; token: string }): Promise<{ projection: TianyiCreativeProjection }> { const { token, ...body } = input; return tianyiRequest("creative/candidate/decision", token, body); }
export async function handoffTianyiCreativeCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; token: string }): Promise<{ projection: TianyiCreativeProjection; ownerReceipt: { owner: string; id: string; revision: number | null }; eventReview?: TianyiCreativeEventReview }> { const { token, ...body } = input; return tianyiRequest("creative/candidate/handoff", token, body); }
export async function getTianyiCreativeEventReview(input: { projectId: string; sessionId: string; candidateId: string; token: string }): Promise<TianyiCreativeEventReview> { const { token, ...body } = input; return tianyiRequest("creative/candidate/event-review", token, body); }
export async function beginTianyiCreativeEventImpact(input: { projectId: string; sessionId: string; candidateId: string; token: string }): Promise<TianyiCreativeEventReview> { const { token, ...body } = input; return tianyiRequest("creative/candidate/event-review/begin-impact", token, body); }
export async function rejectTianyiCreativeEvent(input: { projectId: string; sessionId: string; candidateId: string; token: string }): Promise<TianyiCreativeEventReview> { const { token, ...body } = input; return tianyiRequest("creative/candidate/event-review/reject", token, body); }
export async function confirmTianyiCreativeEvent(input: { projectId: string; sessionId: string; candidateId: string; optionId: string; token: string }): Promise<TianyiCreativeEventReview> { const { token, ...body } = input; return tianyiRequest("creative/candidate/event-review/confirm", token, body); }
export async function pauseTianyiCreativeSession(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ projection: TianyiCreativeProjection }> { return tianyiRequest("creative/pause", token, { projectId, sessionId, operationId }); }
export async function markTianyiCreativeProviderUnavailable(input: { projectId: string; sessionId: string; operationId: string; stage: "response" | "extraction"; message?: string; token: string }): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }> { const { token, ...body } = input; return tianyiRequest("creative/provider-unavailable", token, body); }
export async function recoverTianyiCreativeSession(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }> { return tianyiRequest("creative/recover", token, { projectId, sessionId, operationId }); }
export async function completeTianyiCreativeSession(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ projection: TianyiCreativeProjection }> { return tianyiRequest("creative/complete", token, { projectId, sessionId, operationId }); }

export async function getTianyiSessionMetadata(projectId: string, sessionId: string | null, token: string): Promise<TianyiSessionMetadata | TianyiSessionMetadata[] | null> {
  return tianyiRequest("session/metadata", token, { projectId, sessionId });
}

export async function prepareTianyiSessionClose(input: { projectId: string; sessionId: string; operationId: string; contextRequest: TianyiContextRequest; token: string }): Promise<TianyiQuestionOperation & { stoppingPointCandidate: TianyiStoppingPointCandidate | null; alreadyCompleted: boolean }> {
  const { token, ...body } = input;
  return tianyiRequest("session/prepare-close", token, body);
}

export async function finalizeTianyiSessionClose(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ closed: boolean; temporary?: boolean; ownerResult: TianyiOwnerResult; archiveWriteCount?: number }> {
  return tianyiRequest("session/finalize-close", token, { projectId, sessionId, operationId });
}

export async function reviewTianyiMemoryCandidate(input: { projectId: string; sessionId: string; candidateId: string; contextRequest: TianyiContextRequest; token: string }): Promise<TianyiMemoryCandidate> {
  const { token, ...body } = input;
  return tianyiRequest("memory-candidate/review", token, body);
}

export async function decideTianyiMemoryCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; decision: "accepted" | "rejected"; edits: { statement: string; scope: TianyiMemoryScope; kind: TianyiMemoryKind; sensitivity: TianyiMemorySensitivity }; secondConfirmation: boolean; createProjectGrant: boolean; contextRequest: TianyiContextRequest; token: string }): Promise<{ candidate: TianyiMemoryCandidate; finalValue?: TianyiMemoryCandidate; memoryId?: string; ownerResults: TianyiOwnerResult[]; durableMemoryCount: number }> {
  const { token, ...body } = input;
  return tianyiRequest("memory-candidate/decide", token, body);
}

export async function decideTianyiStoppingPointCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; decision: "accepted" | "rejected"; contextRequest: TianyiContextRequest; token: string }): Promise<{ stoppingPointId: string | null; ownerResults: TianyiOwnerResult[] }> {
  const { token, ...body } = input;
  return tianyiRequest("stopping-point/decide", token, body);
}

export async function listTianyiMemories(projectId: string, scope: TianyiMemoryScope, token: string): Promise<TianyiMemoryRecord[]> {
  return tianyiRequest("memory/list", token, { projectId, scope });
}

export async function editTianyiMemory(input: { projectId: string; scope: TianyiMemoryScope; memoryId: string; expectedHash: string; operationId: string; statement: string; kind: TianyiMemoryKind; sensitivity: TianyiMemorySensitivity; token: string }): Promise<TianyiOwnerResult> {
  const { token, ...body } = input;
  return tianyiRequest("memory/edit", token, body);
}

export async function revokeTianyiMemory(projectId: string, scope: TianyiMemoryScope, memoryId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("memory/revoke", token, { projectId, scope, memoryId, expectedHash, operationId });
}

export async function restoreTianyiMemory(projectId: string, scope: TianyiMemoryScope, memoryId: string, expectedHash: string, revisionId: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("memory/restore", token, { projectId, scope, memoryId, expectedHash, revisionId, operationId });
}

export async function hardDeleteTianyiMemory(projectId: string, scope: TianyiMemoryScope, memoryId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult & { tombstone: null | { id: string; ownerScope: TianyiMemoryScope; projectId: string | null; deletedRevision: number; deletedAt: string } }> {
  return tianyiRequest("memory/hard-delete", token, { projectId, scope, memoryId, expectedHash, operationId });
}

export async function getTianyiMemoryRevisions(projectId: string, scope: TianyiMemoryScope, memoryId: string, token: string): Promise<TianyiRevisionHistory> {
  return tianyiRequest("memory/revisions", token, { projectId, scope, memoryId });
}

export async function listTianyiGlobalMemoryGrants(projectId: string, token: string): Promise<TianyiGrantRecord[]> {
  return tianyiRequest("global-memory-grant/list", token, { projectId });
}

export async function createTianyiGlobalMemoryGrant(projectId: string, memoryId: string, memoryContentHash: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("global-memory-grant/create", token, { projectId, memoryId, memoryContentHash, operationId });
}

export async function revokeTianyiGlobalMemoryGrant(projectId: string, memoryId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("global-memory-grant/revoke", token, { projectId, memoryId, expectedHash, operationId });
}

export async function restoreTianyiGlobalMemoryGrant(projectId: string, memoryId: string, expectedHash: string, revisionId: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("global-memory-grant/restore", token, { projectId, memoryId, expectedHash, revisionId, operationId });
}

export async function getTianyiGlobalMemoryGrantRevisions(projectId: string, memoryId: string, token: string): Promise<TianyiRevisionHistory> {
  return tianyiRequest("global-memory-grant/revisions", token, { projectId, memoryId });
}

export async function listTianyiReceipts(projectId: string, token: string): Promise<TianyiReceiptSummary[]> {
  return tianyiRequest("receipt/list", token, { projectId });
}

export async function readTianyiReceipt(projectId: string, receiptId: string, contextRequest: TianyiContextRequest, token: string): Promise<TianyiReceiptRead | null> {
  return tianyiRequest("receipt/read", token, { projectId, receiptId, contextRequest });
}

export async function listTianyiStoppingPoints(projectId: string, token: string): Promise<TianyiStoppingPointRecord[]> {
  return tianyiRequest("stopping-point/list", token, { projectId });
}

export async function revokeTianyiStoppingPoint(projectId: string, stoppingPointId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("stopping-point/revoke", token, { projectId, stoppingPointId, expectedHash, operationId });
}

export async function restoreTianyiStoppingPoint(projectId: string, stoppingPointId: string, expectedHash: string, revisionId: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("stopping-point/restore", token, { projectId, stoppingPointId, expectedHash, revisionId, operationId });
}

export async function hardDeleteTianyiStoppingPoint(projectId: string, stoppingPointId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("stopping-point/hard-delete", token, { projectId, stoppingPointId, expectedHash, operationId });
}

export async function getTianyiStoppingPointRevisions(projectId: string, stoppingPointId: string, token: string): Promise<TianyiRevisionHistory> {
  return tianyiRequest("stopping-point/revisions", token, { projectId, stoppingPointId });
}

export async function listTianyiTombstones(projectId: string, token: string): Promise<Array<{ id: string; ownerKind: "memory" | "stopping-point" | "session"; ownerScope: TianyiMemoryScope; projectId: string | null; state: "hard-deleted"; deletedRevision: number; deletedAt: string }>> {
  return tianyiRequest("tombstone/list", token, { projectId });
}

export async function readTianyiSessionEvents(projectId: string, sessionId: string, token: string): Promise<null | { id: string; contentHash: string; events: Array<{ eventId: string; sequence: number; type: string; recordedAt: string; actor: string; summary: string; visibleContent: string | null; contentHash: string; deleted: boolean; classifications: TianyiResponseClassification[]; memoryCandidateIds: string[]; receiptId: string | null }> }> {
  return tianyiRequest("session/events", token, { projectId, sessionId, startSequence: 1, limit: 200 });
}

export async function retainTemporaryTianyiMessages(projectId: string, sessionId: string, eventIds: string[], operationId: string, token: string): Promise<{ session: TianyiSessionMetadata; retainedEventIds: string[]; archiveWriteCount: number }> {
  return tianyiRequest("session/retain-temporary", token, { projectId, sessionId, eventIds, operationId });
}

export async function rolloverTianyiSession(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ previousSessionId: string; session: TianyiSessionMetadata; archiveWriteCount: number }> {
  return tianyiRequest("session/rollover", token, { projectId, sessionId, operationId });
}

export async function recordTianyiSourceReturn(projectId: string, sessionId: string, target: TianyiArchiveMessageRef, operationId: string, token: string): Promise<{ retentionMode: "normal" | "temporary"; archiveWriteCount: number; recorded: true }> {
  return tianyiRequest("source-return", token, { projectId, sessionId, targetSessionId: target.sessionId, targetEventId: target.eventId, targetContentHash: target.contentHash, operationId });
}

export async function rebuildTianyiArchiveRecall(projectId: string, token: string): Promise<{ status: "current"; builtAt: string; sessionCount: number; messageCount: number }> {
  return tianyiRequest("archive-recall/rebuild", token, { projectId });
}

export async function searchTianyiArchiveRecall(input: { projectId: string; query: string; filters: Record<string, unknown>; limit?: number; token: string }): Promise<TianyiArchiveRecallSearch> {
  const { token, projectId, ...rest } = input;
  return tianyiRequest("archive-recall/search", token, { projectId, authorizedProjectIds: [projectId], ...rest });
}

export async function hardDeleteTianyiArchiveMessage(projectId: string, sessionId: string, eventId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult & { deletedEventId: string }> {
  return tianyiRequest("archive-message/hard-delete", token, { projectId, sessionId, eventId, expectedHash, operationId });
}

export async function hardDeleteTianyiArchiveSession(projectId: string, sessionId: string, expectedHash: string, operationId: string, token: string): Promise<TianyiOwnerResult> {
  return tianyiRequest("session/hard-delete", token, { projectId, sessionId, expectedHash, operationId });
}

export async function exportTianyiPack(input: { projectId: string; packId: string; ownerKinds: string[]; includePersonal: boolean; includeSensitive: boolean; sensitiveSecondConfirmation: boolean; token: string }): Promise<TianyiPackSummary> {
  const { token, ...body } = input;
  return tianyiRequest("pack/export", token, body);
}

export async function stageTianyiPack(projectId: string, sourcePackId: string, importId: string, token: string): Promise<TianyiStagingInventory> {
  return tianyiRequest("pack/stage", token, { projectId, sourcePackId, importId });
}

export async function createExecutionBrief(input: ExecutionBriefDraftInput & { token: string }): Promise<TianyiNuwaExecutionBrief> {
  const { token, ...body } = input;
  return intelligenceBridgeRequest("brief/create", token, body);
}

export async function readLatestExecutionBridge(projectId: string, token: string): Promise<IntelligenceBridgeResume> {
  return intelligenceBridgeRequest("resume", token, { projectId });
}

export async function readExecutionBrief(projectId: string, briefId: string, token: string, revision?: number): Promise<TianyiNuwaExecutionBrief | null> {
  return intelligenceBridgeRequest("brief/read", token, { projectId, briefId, ...(revision === undefined ? {} : { revision }) });
}

export async function reviseExecutionBrief(input: { projectId: string; briefId: string; expectedHash: string; changes: ExecutionBriefChanges; token: string }): Promise<TianyiNuwaExecutionBrief> {
  const { token, ...body } = input;
  return intelligenceBridgeRequest("brief/revise", token, body);
}

export async function approveExecutionBrief(input: { projectId: string; briefId: string; revision: number; expectedHash: string; expectedSourceSetHash: string; token: string }): Promise<TianyiNuwaExecutionBrief> {
  const { token, ...body } = input;
  return intelligenceBridgeRequest("brief/approve", token, body);
}

export async function startExecutionBrief(projectId: string, briefId: string, revision: number, token: string): Promise<StoryExploration> {
  return intelligenceBridgeRequest("brief/start", token, { projectId, briefId, revision });
}

export async function runExecutionBrief(projectId: string, briefId: string, revision: number, explorationId: string, token: string): Promise<StoryExploration> {
  return intelligenceBridgeRequest("brief/run", token, { projectId, briefId, revision, explorationId });
}

export async function synthesizeExecutionBrief(projectId: string, briefId: string, revision: number, explorationId: string, token: string): Promise<{ exploration: StoryExploration; resultReceipt: NuwaResultReceipt }> {
  return intelligenceBridgeRequest("brief/synthesize", token, { projectId, briefId, revision, explorationId });
}

export async function readNuwaResultReceipt(projectId: string, briefId: string, token: string): Promise<NuwaResultReceipt | null> {
  return intelligenceBridgeRequest("result/read", token, { projectId, briefId });
}

export async function submitExecutionBriefRouteToImpact(input: {
  projectId: string;
  briefId: string;
  revision: number;
  explorationId: string;
  resultReceiptId: string;
  routeId: string;
  token: string;
}): Promise<{ exploration: StoryExploration; review: ImpactReview; overlay: IntelligenceOverlay }> {
  const { token, ...body } = input;
  return intelligenceBridgeRequest("result/submit", token, body);
}

async function tianyiRequest<T>(route: string, token: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(`${basePath}/tianyi/${route}`, { method: "POST", token, body });
}

async function intelligenceBridgeRequest<T>(route: string, token: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(`${basePath}/intelligence-bridge/${route}`, { method: "POST", token, body });
}

async function request<T>(
  url: string,
  input: { method?: "POST"; token?: string; body?: Record<string, unknown>; signal?: AbortSignal } = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method || "GET",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {})
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new LocalTransportError("操作已取消；没有新的内容被写入。", 499);
    }
    throw new LocalTransportError("本地服务暂时未连接。当前页面会保留；需要读取或保存时请重新连接。", 0);
  }
  const source = await response.text();
  let payload: { data?: T; error?: string };
  try {
    payload = source ? JSON.parse(source) as { data?: T; error?: string } : {};
  } catch {
    throw new LocalTransportError(
      response.ok ? "本地服务返回了无法读取的数据。" : "本地服务暂时不可用，请确认 Story Studio 已完整启动。",
      response.status
    );
  }
  if (!response.ok || payload.data === undefined) {
    const fallback = response.status >= 500
      ? "本地服务暂时不可用，请确认 Story Studio 已完整启动。"
      : "本地项目操作失败。";
    throw new LocalTransportError(payload.error || fallback, response.status);
  }
  return payload.data;
}
