import { ArrowRight, Check, ChevronLeft, FolderOpen, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";

import { CardWorkbench, type ObjectAuthorityMode, type ObjectDraft } from "./components/CardWorkbench";
import { NewObjectDialog, type AgentDraftApplication, type AgentDraftEditInput, type AgentDraftRequestInput, type AgentTypeCreationInput, type CharacterCreationInput } from "./components/NewObjectDialog";
import { profileFieldDefinitions } from "./components/ObjectProfileEditor";
import type { StoryStudioObjectProfile } from "../../../src/storyContracts/storyStudioObjectProfile.ts";
import { EventObservationWorkspace, type EventObservationView } from "./components/EventObservationWorkspace";
import { createEventLineFixture, createMultiverseConfirmedEventLineFixture, createNuwaConfirmedEventLineFixture, readEventLineFixture } from "./components/event-observation/eventLineFixture";
import { EventAuthoringDialog, type EventAuthoringDraft } from "./components/EventAuthoringDialog";
import { verifiedCanonEventSummaries } from "./components/eventLineCommittedEvents";
import { IntelligenceWorkbench, type IntelligenceDocument } from "./components/IntelligenceWorkbench";
import { NuwaPrimaryWorkspace, type NuwaPageDockLens } from "./components/NuwaPrimaryWorkspace";
import { NuwaBoundedScenarioWorkspace } from "./components/nuwa-bounded/NuwaBoundedScenarioWorkspace";
import { resolveNuwaRouteRequest, resolveNuwaWorkspaceStage, type NuwaWorkspaceStage } from "./components/nuwaRouteState";
import { VisualDocumentDialog } from "./components/VisualDocumentDialog";
import { VisualWorkbench } from "./components/VisualWorkbench";
import { WorldLibraryPanel } from "./components/WorldLibraryPanel";
import { LibraryHomeWorkbench } from "./components/LibraryHomeWorkbench";
import { LibraryDirectoryWorkbench, type LibraryDirectoryId, type LibraryListItem, type LibraryUncertainItem, type LibraryViewTab } from "./components/LibraryDirectoryWorkbench";
import { RelationAuthoringWorkbench, type RelationPresentation, type RelationView } from "./components/RelationAuthoringWorkbench";
import { AgentTypeManagementWorkbench } from "./components/AgentTypeManagementWorkbench";
import { SourceImportReviewWorkspace } from "./components/SourceImportReviewWorkspace";
import { WorkspaceFolderDialog } from "./components/WorkspaceFolderDialog";
import type { WorldDocumentTab } from "./components/WorldDocumentTabs";
import { DocumentRevisionPanel } from "./components/DocumentRevisionPanel";
import { CharacterCardHistoryPanel } from "./components/CharacterCardHistoryPanel";
import type { CharacterHistoryOwner } from "../../../src/storyCardPresentation/characterCardHistoryProjection";
import { WorldHomeWorkbench } from "./components/WorldHomeWorkbench";
import { WritingDocumentDialog } from "./components/WritingDocumentDialog";
import { WritingNavigator } from "./components/WritingNavigator";
import { type WritingEditorInteraction, type WritingEditorRestoreSnapshot } from "./components/WritingWorkbench";
import { CreationStartDialog } from "./components/CreationStartDialog";
import { CreationHome, type SaveExternalCreationArtifactInput } from "./components/CreationHome";
import { CreationPluginCenter } from "./components/CreationPluginCenter";
import { DataWorkspace } from "./components/DataWorkspace";
import { CharacterStateWorkspace, type CharacterStateReturnSnapshot } from "./components/character-state/CharacterStateWorkspace";
import { SettingsPage } from "./components/SettingsPage";
import { MultiverseWorkbench } from "./components/MultiverseWorkbench";
import { MultiverseSingleDerivedWorkspace } from "./components/multiverse-r0/MultiverseSingleDerivedWorkspace";
import { WorkVersionBoundCreationWorkspace, type CreationReturnSnapshot } from "./components/work-version-creation/WorkVersionBoundCreationWorkspace";
import { NormalEventCreationWorkspace } from "./components/NormalEventCreationWorkspace";
import { migrateProductWorkspaceMode } from "./components/workspaceModeNavigation";
import {
  resolveStoryStudioWorkspaceLocation,
  storyStudioWorkspaceDisplayName,
  storyStudioWorkspaceRoute,
  type ProductWorkspaceMode
} from "./product-shell/navigation/topLevelDestinationRegistry";
import {
  createStoryStudioEventReference,
  storyStudioEventReferenceKey,
  type StoryStudioEventReference
} from "../../../src/storyContracts/storyStudioEventReference";
import {
  resolveProductShellReturnLocation,
  type ProductShellAvailableTarget,
  type ProductShellLocationSnapshot
} from "./product-shell/location/productShellReturnLocation";
import { TianyiWorkspace, type TianyiCollaborationMode } from "./components/tianyi/TianyiWorkspace";
import type { TianyiV2Operations } from "./components/tianyi/useTianyiSessionController";
import { type TianyiDockMode } from "./components/TianyiQuickAssistant";
import { createTianyiOperationId } from "./components/tianyi/tianyiOperationId";
import { tianyiObjectContextKey, visualContextRefs, worldObjectContextRef, writingContextRef, writingSelectionContextRef } from "./components/tianyiObjectContext";
import type { TianyiQuickPlacement } from "./components/tianyiShellPresentation";
import { StorageTransparencyPanel } from "./components/StorageTransparencyPanel";
import { OutputArtifactWorkbench } from "./components/OutputArtifactWorkbench";
import { CreationMediaManager, type CreationMediaDraft } from "./components/CreationMediaManager";
import { R9AWorkflowCenter } from "./components/R9AWorkflowCenter";
import { AgentPermissionStatus } from "./components/AgentPermissionStatus";
import { AIControlCenter, type ContextBudgetSnapshot } from "./components/AIControlCenter";
import { AppShell } from "./product-shell/AppShell";
import { GlobalHeader } from "./product-shell/GlobalHeader";
import { GlobalTianyiDockHost } from "./product-shell/GlobalTianyiDockHost";
import { useWorkspaceDockSlot, workspaceDockCoordinator } from "./product-shell/WorkspaceDockCoordinator";
import { ModuleSidebarHost } from "./product-shell/ModuleSidebarHost";
import { ModuleContextSidebar } from "./product-shell/ModuleContextSidebar";
import { creationRouteForMode, multiverseRouteForMode, readCreationRouteMode, readMultiverseRouteMode, type CreationRouteMode, type MultiverseRouteMode } from "./product-shell/authoringRouteState";
import type { AuthorContextCounts, AuthorContextTarget } from "./product-shell/AuthorLibraryHierarchy";
import { ProjectCenter } from "./product-shell/ProjectCenter";
import { projectDisplayTitle } from "./product-shell/projectTitleProjection";
import { ProductShellProfilePanel } from "./product-shell/ProductShellProfilePanel";
import { ProductShellNavigation } from "./product-shell/navigation/ProductShellNavigation";
import { isSettingsRoute, readSettingsRouteState, settingsRouteForLeaf, type SettingsRouteLeaf, type SettingsRouteSection } from "./product-shell/settingsRouteState";
import { RuntimeIdentityBanner } from "./product-shell/RuntimeIdentityBanner";
import { StatusToastLayer } from "./product-shell/StatusToastLayer";
import { deriveTianyiContextRequest, deriveTianyiShellContext, unavailableTianyiContext } from "./components/tianyiShellContext";
import { NOVEL_DOCUMENT_MODEL_KEY, NOVEL_EVENT_PROPOSAL_KEY, readNovelDocumentModel } from "../../../src/storyCreation/creationArtifactModel";
import {
  appendDerivedHandoffReceiptR1,
  buildDerivedCreationBriefR1,
  createDerivedEventLineR1,
  markDerivedLineReadyR1,
  reviewDerivedAlignmentR1,
  type DerivedTransformKindR1
} from "../../../src/storyCreation/derivedEventLineR1";
import type { NovelDocumentModelR1 } from "../../../src/storyCreation/novelDocumentModelR1";
import { createNovelEventProposal, validateNovelEventProposal } from "../../../src/storyCreation/novelEventProposal";
import { adaptLegacyNuwaCreationHandoff } from "../../../src/storyCreation/legacyNuwaCreationHandoffAdapter";
import type { NuwaSceneComparisonR0, NuwaSceneReplayR0, NuwaSceneSimulationReadModelR0 } from "../../../src/nuwaSceneRuntimeContracts.ts";
import type { NuwaDirectorStateR1 } from "../../../src/storyContracts/nuwaDirectorR1.ts";
import { authorFacingObjectTypeLabel, objectTypeLabel } from "./worldObjectCatalog";

/** Development-only Founder review surface. It must not become a production route or bundle dependency. */
const NovelAuthoringKernelPrototype = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import(/* @vite-ignore */ "./prototypes/NovelAuthoringKernelPrototype.tsx");
      return { default: module.NovelAuthoringKernelPrototype };
    })
  : null;
const CREATION_SOURCE_PORT_VIEWS = new Set([
  "source",
  "root-confirm",
  "scope",
  "confirm",
  "created",
  "editor",
  "revisions",
  "source-details",
  "source-compare",
  "keep-old-source",
  "source-reconciliation-confirm",
  "source-reconciliation-completed",
  "source-history",
  "legacy"
]);
import { LocalFolderProvider } from "./lib/storageProvider";
import { getBrowserPreferenceStorage, readControlCenterPreferences, saveControlCenterPreferences, type ControlCenterPreferences } from "./lib/controlCenterPreferences";
import { clearRetiredTianyiUiPreferencesFromBrowser, normalizeRetiredUiLocation } from "./lib/retiredUiReachability";
import { resolveSidebarWidthPx, sidebarPreferenceFromPixels } from "./lib/sidebarLayout";
import { createInitialWritingPair } from "./lib/initialWritingFlow";
import { projectStoryStudioSystemSkills } from "./lib/skillRegistryProjection";
import { createWorkspaceSelection, EMPTY_WORKSPACE_SELECTION, type WorkspaceSelection, type WorkspaceSelectionSource } from "../../../src/productWorkspace/storyStudioWorkspaceSelection";
import { createLocalDiagnosticService } from "./storyDiagnostics/localDiagnosticService";
import {
  createWritingDocument,
  createImpactReview,
  createPlanningEventImpactReview,
  createAuthorChangeSet,
  chooseImpactRoute,
  dryRunAuthorChangeSet,
  abandonAuthorChangeSet,
  applyAuthorChangeSet,
  runExecutionBrief,
  synthesizeExecutionBrief,
  submitExecutionBriefRouteToImpact,
  rejectStoryExplorationRoute,
  cancelStoryExploration,
  createVisualDocument,
  createPlanningEventAndAddToTimeline,
  addPlanningEventToTimeline,
  createWorkspaceFolder,
  updateWorkspaceFolders,
  createDocumentMilestone,
  createProject,
  createPlanningEvent,
  abandonPlanningEvent,
  pausePlanningEvent,
  resumePlanningEvent,
  createWorldObject,
  archiveWorldObject,
  restoreWorldObject,
  bulkUpdateWorldObjects,
  moveWorldObjectsToFolder,
  listSourceImportReviews,
  importSourceDocument,
  extractSourceImportCandidates,
  decideSourceImportCandidate,
  handoffSourceImportUnit,
  getR9AWorkflowState,
  createR9AWorkflowTask,
  updateR9AWorkflowTask,
  listR9AProjectBackups,
  createR9AProjectBackup,
  restoreR9AProjectBackup,
  createNuwaTemporaryCharacterProposal,
  duplicateWorldObject,
  deleteWorldObject,
  createCharacterCard,
  listCardTemplates,
  createCardTemplateFromCharacter,
  previewCharacterTemplateApply,
  applyCharacterTemplate,
  getBootstrap,
  getModelServiceStatus,
  saveProviderProfile,
  reloadProviderProfile,
  discoverProviderModels,
  revealProviderCredential,
  testProviderConnection,
  runProviderMinimalInference,
  disableProviderProfile,
  clearProviderCredential,
  runGoldenLoop,
  getGoldenLoopCandidateReview,
  createStoryObservationCandidateReview,
  listGoldenLoopCandidateReviews,
  abandonGoldenLoopCandidateReview,
  decideGoldenLoopCandidateReview,
  getDocumentRevisionHistory,
  getWritingBootstrap,
  listStoryUnits,
  listOutputArtifacts,
  listCuratedCreationPlugins,
  listCuratedCreationPluginAdapters,
  executeCuratedCreationPlugin,
  operateCuratedCreationPlugin,
  archiveOutputArtifact,
  getCreationMediaCatalog,
  createCreationMediaAsset,
  updateCreationMediaAsset,
  deleteCreationMediaAsset,
  createStoryUnit,
  updateStoryUnit,
  createOutputArtifact,
  updateOutputArtifact,
  getWritingContinuity,
  getImpactReview,
  getCharacterStateImpactFixture,
  runCharacterStateImpactFixture,
  getNuwaBoundedFixture,
  runNuwaBoundedFixture,
  getMultiverseSingleDerivedFixture,
  runMultiverseSingleDerivedFixture,
  getWorkVersionBoundCreationFixture,
  runWorkVersionBoundCreationFixture,
  getCreationSourcePortState,
  runCreationSourcePortAction,
  getNormalEventCreationState,
  runNormalEventCreationAction,
  getAuthorChangeSet,
  getStoryExploration,
  getNuwaSceneSimulation,
  createNuwaSceneSimulation,
  stepNuwaSceneSimulation,
  playNuwaSceneSimulation,
  pauseNuwaSceneSimulation,
  stopNuwaSceneSimulation,
  checkpointNuwaSceneSimulation,
  interveneNuwaSceneSimulation,
  forkNuwaSceneSimulation,
  compareNuwaSceneSimulation,
  replayNuwaSceneSimulation,
  buildNuwaSceneCandidate,
  getNuwaDirectorStateR1,
  updateNuwaDirectorStateR1,
  type NuwaDirectorActionR1,
  createStandaloneStoryExploration,
  runStoryExploration,
  synthesizeStoryExploration,
  getIntelligenceOverlay,
  getReviewHistory,
  getVisualWorkbench,
  getWorldLibrary,
  listRelations,
  listRelationTypes,
  createRelationCandidate,
  confirmRelationCandidate,
  rejectRelationCandidate,
  archiveConfirmedRelation,
  appendRelationEvidence,
  createRelationCorrectionCandidate,
  getRelationDuplicateSuggestions,
  listAgentTypes,
  createAgentType,
  updateAgentType,
  activateAgentType,
  retireAgentType,
  deleteAgentType,
  listClassifiedLibraryProjection,
  listUncertainLibraryProjection,
  createAgentDraftProposal,
  editAgentRecognitionProposal,
  ignoreAgentRecognitionProposal,
  confirmAgentRecognitionObject,
  getVerifiedCanonEventList,
  getVerifiedCanonEvent,
  importVisualAsset,
  openProject,
  openTianyiSession,
  captureTianyiCreativeAuthorSource,
  extractTianyiCreativeProjection,
  getTianyiCreativeProjection,
  decideTianyiCreativeCandidate,
  handoffTianyiCreativeCandidate,
  editTianyiCreativeCandidate,
  pauseTianyiCreativeSession,
  markTianyiCreativeProviderUnavailable,
  recoverTianyiCreativeSession,
  completeTianyiCreativeSession,
  createTianyiGroundedContextRequest,
  streamTianyiGroundedAnswer,
  getTianyiSessionMetadata,
  readTianyiReceipt,
  startTianyiAgentRun,
  continueTianyiAgentRun,
  approveTianyiAgentStep,
  rejectTianyiAgentStep,
  steerTianyiAgentRun,
  pauseTianyiAgentRun,
  resumeTianyiAgentRun,
  cancelTianyiAgentRun,
  recoverTianyiAgentRun,
  getTianyiAgentRunProjection,
  handoffTianyiAgentCandidate,
  type TianyiAgentRunProjection,
  createExecutionBrief,
  reviseExecutionBrief,
  approveExecutionBrief,
  startExecutionBrief,
  readLatestExecutionBridge,
  openWritingDocument,
  openVisualDocument,
  closeVisualDocument,
  closeWorldObject,
  readWorldObject,
  resolveTianyiObjectContextRefs,
  previewDocumentRevision,
  rememberWorldObject,
  searchWorldObjects,
  startWriting,
  setStoryStudioSurface,
  setWorkspaceSelection,
  setVisualSplitView,
  swapVisualPanes,
  restoreDocumentRevision,
  updateVisualDocument,
  validateTimelineDocument,
  updateWritingDocument,
  saveWritingContinuity,
  updateWorldObject,
  updateWorldObjectAgentType,
  type VisualAsset,
  type VisualDocument,
  type TimelineDocument,
  type PlanningEventTimelineResult,
  type AddPlanningEventResult,
  type TimelineValidationResult,
  type VisualDocumentType,
  type VisualWorkbenchBootstrap,
  type WritingBootstrap,
  type WritingDocument,
  type WritingDocumentSummary,
  type ImpactReview,
  type AuthorChangeSet,
  type StoryExploration,
  type IntelligenceOverlay,
  type ReviewHistory,
  type ObjectVisualReference,
  type StoryStudioBootstrap,
  type StoryStudioProject,
  type StorageTransparency,
  type WorldLibraryBootstrap,
  type AgentTypeDefinition,
  type ClassifiedAgentLibraryProjection,
  type UncertainAgentLibraryProjection,
  type WorkspaceFolder,
  type WorldObject,
  type WorldObjectSummary,
  type WorldObjectType,
  type RelationRecord,
  type RelationTypeDefinition,
  type RelationEvidence,
  type CardTemplate,
  type CharacterTemplateDiff,
  type DocumentRevisionHistory
  , type DocumentRevisionPreview
  , type RevisionDocumentRef
  , type TianyiProjectResume
  , type TianyiNuwaExecutionBrief
  , type NuwaResultReceipt
  , type StoryStudioIntelligenceMode
  , type TianyiObjectContextRef
  , type TianyiGroundedAccessSelection
  , type VerifiedCanonEventListRead
  , type VerifiedCanonEventDetailRead
  , type ModelServiceStatus
  , type ProviderProfileProjection
  , type ProviderSessionConnection
  , type GoldenLoopCandidate
  , type GoldenLoopCandidateReviewHistoryEntry
  , type GoldenLoopResult
  , type StoryUnit
  , type OutputArtifact
  , type OutputArtifactType
  , type CreationMediaAsset
  , type CreationMediaCatalog
  , type R9AWorkflowState
  , type R9AWorkflowTask
  , type R9AProjectBackup
  , type SourceImportDocumentR0
  , type SourceImportCandidateR0
  , type AgentRecognitionProposal
  , type AgentRecognitionProposalValue
} from "./lib/localTransport";

type OnboardingStep = "genre" | "ambience" | "identity" | "creating";
type SaveState = "saved" | "unsaved" | "saving" | "conflict";
type WorkspaceMode = "library" | VisualDocumentType;
type WritingSaveState = "saved" | "unsaved" | "saving" | "conflict";
type TianyiSurface = "companion" | "intelligence";
type TianyiSourceMode = "world" | "library" | "writing";

const storageProvider = new LocalFolderProvider();
const storyStudioSystemSkills = projectStoryStudioSystemSkills();

const genres = [
  ["fantasy", "奇幻"], ["science-fiction", "科幻"], ["modern", "现代"],
  ["horror", "恐怖"], ["history", "历史"], ["dark-fantasy", "黑暗奇幻"],
  ["alternate-history", "架空历史"], ["dystopia", "反乌托邦"], ["mystery", "悬疑"],
  ["western", "西部"], ["cyberpunk", "赛博朋克"], ["solarpunk", "太阳朋克"]
] as const;

const ambienceOptions = [
  ["rain-lighthouse", "雨夜灯塔", "细雨与远处潮声"],
  ["forest-glow", "深林微光", "安静、潮湿、缓慢"],
  ["old-radio", "旧城电台", "微弱电流与旧日回声"],
  ["distant-sea", "远海低鸣", "开阔、孤独、低沉"]
] as const;

export function App() {
  const currentUrl = new URL(window.location.href);
  const isNovelKernelPrototypeRoute = currentUrl.pathname.replace(/\/+$/u, "") === "/creation" && currentUrl.searchParams.get("prototype") === "novel-kernel-r1";
  if (import.meta.env.DEV && NovelAuthoringKernelPrototype && isNovelKernelPrototypeRoute) return <Suspense fallback={<LoadingScreen />}><NovelAuthoringKernelPrototype /></Suspense>;
  const diagnosticService = useRef(createLocalDiagnosticService({ storage: getBrowserPreferenceStorage() })).current;
  const [, setRouteRevision] = useState(0);
  const [bootstrap, setBootstrap] = useState<StoryStudioBootstrap | null>(null);
  const [library, setLibrary] = useState<WorldLibraryBootstrap | null>(null);
  const initialLibraryRoute = readLibraryRouteState(window.location.href);
  const [libraryHome, setLibraryHome] = useState(initialLibraryRoute.home);
  const [librarySearchOriginHome, setLibrarySearchOriginHome] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryViewTab>(initialLibraryRoute.tab);
  const [libraryDirectory, setLibraryDirectory] = useState<LibraryDirectoryId>(initialLibraryRoute.directory);
  const [relationView, setRelationView] = useState<RelationView>(initialLibraryRoute.relationView);
  const [relationPresentation, setRelationPresentation] = useState<RelationPresentation>(initialLibraryRoute.relationPresentation);
  const [relationId, setRelationId] = useState<string | null>(initialLibraryRoute.relationId);
  const [relationRecords, setRelationRecords] = useState<RelationRecord[]>([]);
  const [relationTypes, setRelationTypes] = useState<RelationTypeDefinition[]>([]);
  const [relationBusy, setRelationBusy] = useState(false);
  const [libraryFocusRequest, setLibraryFocusRequest] = useState(0);
  const [agentTypeDefinitions, setAgentTypeDefinitions] = useState<AgentTypeDefinition[]>([]);
  const [agentTypeCatalogRevision, setAgentTypeCatalogRevision] = useState(0);
  const [agentTypeBoundCounts, setAgentTypeBoundCounts] = useState<Record<string, number>>({});
  const [agentTypeBusy, setAgentTypeBusy] = useState(false);
  const [agentTypeError, setAgentTypeError] = useState("");
  const [objectAgentTypeBusy, setObjectAgentTypeBusy] = useState(false);
  const [objectAgentTypeError, setObjectAgentTypeError] = useState("");
  const [classifiedLibraryProjection, setClassifiedLibraryProjection] = useState<ClassifiedAgentLibraryProjection | null>(null);
  const [uncertainLibraryProjection, setUncertainLibraryProjection] = useState<UncertainAgentLibraryProjection | null>(null);
  const [sourceImportDocuments, setSourceImportDocuments] = useState<SourceImportDocumentR0[]>([]);
  const [sourceImportActiveId, setSourceImportActiveId] = useState<string | null>(null);
  const [sourceImportView, setSourceImportView] = useState(() => new URL(window.location.href).searchParams.get("view") === "source-review");
  const [sourceImportBusy, setSourceImportBusy] = useState(false);
  const [sourceImportError, setSourceImportError] = useState("");
  const [eventLineRead, setEventLineRead] = useState<VerifiedCanonEventListRead | { status: "loading" }>({ status: "loading" });
  const [visualWorkbench, setVisualWorkbench] = useState<VisualWorkbenchBootstrap | null>(null);
  const [writing, setWriting] = useState<WritingBootstrap | null>(null);
  const [storyUnits, setStoryUnits] = useState<StoryUnit[]>([]);
  const [outputArtifacts, setOutputArtifacts] = useState<OutputArtifact[]>([]);
  const [activeOutputArtifactId, setActiveOutputArtifactId] = useState<string | null>(null);
  const [creationView, setCreationView] = useState<"center" | "artifact" | "media">(() => new URL(window.location.href).searchParams.get("view") === "media" ? "media" : new URL(window.location.href).searchParams.has("artifact") ? "artifact" : "center");
  const [creationMedia, setCreationMedia] = useState<CreationMediaCatalog>({ version: "story-studio-media-catalog/v1", assets: [], contentHash: null, source: "creation-media-json" });
  const [creationMediaBusy, setCreationMediaBusy] = useState(false);
  const [creationMediaError, setCreationMediaError] = useState("");
  const [creationType, setCreationType] = useState<OutputArtifactType>("novel");
  const [creationStartOpen, setCreationStartOpen] = useState(false);
  const [creationSourceUnitId, setCreationSourceUnitId] = useState<string | null>(null);
  const [creationRouteMode, setCreationRouteMode] = useState<CreationRouteMode>(() => readCreationRouteMode(window.location.pathname));
  const [multiverseRouteMode, setMultiverseRouteMode] = useState<MultiverseRouteMode>(() => readMultiverseRouteMode(window.location.pathname));
  const [productMode, setProductMode] = useState<ProductWorkspaceMode>(() => currentWorkspaceLocation().id);
  const initialSettingsRoute = readSettingsRouteState(window.location.pathname, window.location.search);
  const [settingsSection, setSettingsSection] = useState<SettingsRouteSection>(() => initialSettingsRoute.section);
  const [settingsLeaf, setSettingsLeaf] = useState<SettingsRouteLeaf>(() => initialSettingsRoute.leaf);
  const settingsReturnLocationRef = useRef<string | null>(null);
  const [projectCenterOpen, setProjectCenterOpen] = useState(() => isProjectCenterPath());
  const [projectCenterReturnLocation, setProjectCenterReturnLocation] = useState<string | null>(null);
  const [tianyiSurface, setTianyiSurface] = useState<TianyiSurface>("companion");
  // A direct /tianyi load has no transient navigation origin. Keep that fact
  // distinct from an explicit world origin so the persisted active scene can
  // be recovered as the formal source once the writing workspace hydrates.
  const [tianyiSourceMode, setTianyiSourceMode] = useState<TianyiSourceMode | null>(() => currentWorkspaceLocation().id === "writing" ? "writing" : currentWorkspaceLocation().id === "library" ? "library" : null);
  const [tianyiQuickPlacement, setTianyiQuickPlacement] = useState<TianyiQuickPlacement>("closed");
  const [tianyiDockMode, setTianyiDockMode] = useState<TianyiDockMode>("dialogue");
  const [tianyiWorkspaceMode, setTianyiWorkspaceMode] = useState<TianyiCollaborationMode>(() => readTianyiRouteMode());
  const [nuwaPageDockState, setNuwaPageDockState] = useState<{ open: boolean; activeLens: NuwaPageDockLens }>({ open: false, activeLens: "context" });
  const sharedDockSlot = useWorkspaceDockSlot();
  const visibleTianyiQuickPlacement: TianyiQuickPlacement = tianyiQuickPlacement;
  const [sharedTianyiSessionId, setSharedTianyiSessionId] = useState<string | null>(null);
  /** App-owned, session-keyed presentation state shared by full and quick Tianyi. */
  const [tianyiDrafts, setTianyiDrafts] = useState<Record<string, string>>({});
  const [tianyiObjectContextRefs, setTianyiObjectContextRefs] = useState<TianyiObjectContextRef[]>([]);
  const [tianyiEventReferences, setTianyiEventReferences] = useState<StoryStudioEventReference[]>([]);
  const [tianyiGroundedAccess, setTianyiGroundedAccess] = useState<TianyiGroundedAccessSelection>({ accessMode: "author", subjectRef: null });
  const tianyiPointerSnapshotCapturedRef = useRef(false);
  const tianyiReturnSnapshotRef = useRef<ProductShellLocationSnapshot | null>(null);
  const nuwaHydrationRef = useRef<{ projectId: string; promise: Promise<void> } | null>(null);
  const eventLineReadSequenceRef = useRef(0);
  const writingContinuityHydratedProjectRef = useRef<string | null>(null);
  const mobileDrawerTriggerRef = useRef<HTMLElement | null>(null);
  const [showWorldHome, setShowWorldHome] = useState(() => new URLSearchParams(window.location.search).get("skipIntro") !== "1");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("library");
  const [selection, setSelection] = useState<WorkspaceSelection>(EMPTY_WORKSPACE_SELECTION);
  const [activeObject, setActiveObject] = useState<WorldObject | null>(null);
  const [visualObject, setVisualObject] = useState<WorldObject | null>(null);
  const [cardReturnTarget, setCardReturnTarget] = useState<{ workbench: VisualWorkbenchBootstrap; workspaceMode: Exclude<WorkspaceMode, "library">; selection: WorkspaceSelection } | null>(null);
  const [tabs, setTabs] = useState<WorldObjectSummary[]>([]);
  const [draft, setDraft] = useState<ObjectDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflictObject, setConflictObject] = useState<WorldObject | null>(null);
  const [objectConflictKind, setObjectConflictKind] = useState<"markdown" | "presentation" | "partial" | null>(null);
  const [objectDirtyOwners, setObjectDirtyOwners] = useState({ markdown: false, presentation: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [onboarding, setOnboarding] = useState<OnboardingStep | null>(null);
  const [genre, setGenre] = useState("");
  const [ambience, setAmbience] = useState("");
  const [title, setTitle] = useState("");
  const [folderSlug, setFolderSlug] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);

  const [token, setToken] = useState("");
  const [storageTransparency, setStorageTransparency] = useState<StorageTransparency | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageSettingsOpen, setStorageSettingsOpen] = useState(false);
  const [storageActionBusy, setStorageActionBusy] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [projectManagementOpen, setProjectManagementOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [modelServiceStatus, setModelServiceStatus] = useState<ModelServiceStatus | null>(null);
  const [providerConnection, setProviderConnection] = useState<ProviderSessionConnection | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [goldenLoopResult, setGoldenLoopResult] = useState<GoldenLoopResult | null>(null);
  const [rejectedGoldenLoopCandidateIds, setRejectedGoldenLoopCandidateIds] = useState<string[]>([]);
  const [acceptedGoldenLoopCandidateIds, setAcceptedGoldenLoopCandidateIds] = useState<string[]>([]);
  const [goldenLoopBusy, setGoldenLoopBusy] = useState(false);
  const [goldenLoopError, setGoldenLoopError] = useState("");
  const goldenLoopControllerRef = useRef<AbortController | null>(null);
  const [nuwaGoal, setNuwaGoal] = useState("比较当前上下文之后最小且可逆的世界变化；保留未确认信息为未知。" );
  const [nuwaEventReference, setNuwaEventReference] = useState<StoryStudioEventReference | null>(null);
  const [candidateReviewHistory, setCandidateReviewHistory] = useState<GoldenLoopCandidateReviewHistoryEntry[]>([]);
  const [nuwaSourceLabel, setNuwaSourceLabel] = useState("来源页面");
  const [nuwaStage, setNuwaStage] = useState<NuwaWorkspaceStage>("rehearsal");
  const [nuwaRecoveryNotice, setNuwaRecoveryNotice] = useState<string | null>(null);
  const [controlCenterPreferences, setControlCenterPreferences] = useState<ControlCenterPreferences>(() => readControlCenterPreferences(getBrowserPreferenceStorage()));

  useEffect(() => {
    diagnosticService.record({
      category: "navigation",
      route: window.location.pathname,
      summary: "作者工作区导航",
      metadata: { workspace: productMode }
    });
  }, [diagnosticService, productMode]);

  const [newObjectOpen, setNewObjectOpen] = useState(false);
  const [newObjectType, setNewObjectType] = useState<WorldObjectType>("character");
  const [newObjectTitle, setNewObjectTitle] = useState("");
  const [newObjectAgentTypeId, setNewObjectAgentTypeId] = useState<string | null>(null);
  const [newObjectBusy, setNewObjectBusy] = useState(false);
  const [newObjectError, setNewObjectError] = useState("");
  const [cardTemplates, setCardTemplates] = useState<CardTemplate[]>([]);

  const [searchQuery, setSearchQuery] = useState(initialLibraryRoute.query);
  const [typeFilter, setTypeFilter] = useState<WorldObjectType | null>(() => libraryDirectoryObjectType(initialLibraryRoute.directory));
  const [visibleObjects, setVisibleObjects] = useState<WorldObjectSummary[]>([]);
  const [bulkSelectedObjectIds, setBulkSelectedObjectIds] = useState<string[]>([]);
  const [r9aWorkflow, setR9AWorkflow] = useState<R9AWorkflowState | null>(null);
  const [r9aBackups, setR9ABackups] = useState<R9AProjectBackup[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [libraryMobileOpen, setLibraryMobileOpen] = useState(false);
  const [libraryRailWidthPx, setLibraryRailWidthPx] = useState(224);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderTitle, setFolderTitle] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [revisionTarget, setRevisionTarget] = useState<{ ref: RevisionDocumentRef; title: string; expectedHash: string } | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<DocumentRevisionHistory | null>(null);
  const [revisionPreview, setRevisionPreview] = useState<DocumentRevisionPreview | null>(null);
  const [revisionSourceDrift, setRevisionSourceDrift] = useState<string[]>([]);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [cardHistoryOpen, setCardHistoryOpen] = useState(false);
  const [cardHistoryLedgers, setCardHistoryLedgers] = useState<{ markdown: DocumentRevisionHistory; presentation: DocumentRevisionHistory } | null>(null);
  const [cardHistoryPreview, setCardHistoryPreview] = useState<{ owner: CharacterHistoryOwner; value: DocumentRevisionPreview } | null>(null);
  const [cardHistoryBusy, setCardHistoryBusy] = useState(false);
  const [cardHistoryError, setCardHistoryError] = useState("");
  const [visualDocumentOpen, setVisualDocumentOpen] = useState(false);
  const [visualDocumentType, setVisualDocumentType] = useState<VisualDocumentType>("map");
  const [visualDocumentTitle, setVisualDocumentTitle] = useState("");
  const [visualDocumentBusy, setVisualDocumentBusy] = useState(false);
  const [visualDocumentError, setVisualDocumentError] = useState("");
  const [writingSaveState, setWritingSaveState] = useState<WritingSaveState>("saved");
  const [writingConflict, setWritingConflict] = useState<WritingDocument | null>(null);
  const [writingDocumentOpen, setWritingDocumentOpen] = useState(false);
  const [writingDocumentType, setWritingDocumentType] = useState<"chapter" | "scene">("chapter");
  const [writingDocumentChapterId, setWritingDocumentChapterId] = useState<string | null>(null);
  const [writingDocumentTitle, setWritingDocumentTitle] = useState("");
  const [writingDocumentBusy, setWritingDocumentBusy] = useState(false);
  const [writingDocumentError, setWritingDocumentError] = useState("");
  const [writingStartBusy, setWritingStartBusy] = useState(false);
  const [writingStartError, setWritingStartError] = useState("");
  const [writingEditorFocusRequest, setWritingEditorFocusRequest] = useState(0);
  const [writingEditorInteraction, setWritingEditorInteraction] = useState<WritingEditorInteraction | null>(null);
  const [writingEditorRestoreSnapshot, setWritingEditorRestoreSnapshot] = useState<WritingEditorRestoreSnapshot | null>(null);
  const [intelligenceDocument, setIntelligenceDocument] = useState<IntelligenceDocument>("impact-review");
  const [impactReview, setImpactReview] = useState<ImpactReview | null>(null);
  const [authorChangeSet, setAuthorChangeSet] = useState<AuthorChangeSet | null>(null);
  const [eventAuthoringOpen, setEventAuthoringOpen] = useState(false);
  const [eventAuthoringConfirmation, setEventAuthoringConfirmation] = useState<AuthorChangeSet | null>(null);
  const [eventAuthoringBusy, setEventAuthoringBusy] = useState(false);
  const [eventAuthoringError, setEventAuthoringError] = useState("");
  const [storyExploration, setStoryExploration] = useState<StoryExploration | null>(null);
  const [nuwaSceneRuntime, setNuwaSceneRuntime] = useState<NuwaSceneSimulationReadModelR0 | null>(null);
  const [nuwaSceneComparison, setNuwaSceneComparison] = useState<NuwaSceneComparisonR0 | null>(null);
  const [nuwaSceneReplay, setNuwaSceneReplay] = useState<NuwaSceneReplayR0 | null>(null);
  const [nuwaSceneBusy, setNuwaSceneBusy] = useState(false);
  const [nuwaSceneError, setNuwaSceneError] = useState("");
  const [nuwaDirectorState, setNuwaDirectorState] = useState<NuwaDirectorStateR1 | null>(null);
  const nuwaDirectorRequestRef = useRef(0);
  const [nuwaDirectorBusy, setNuwaDirectorBusy] = useState(false);
  const [nuwaDirectorError, setNuwaDirectorError] = useState("");
  const [executionBrief, setExecutionBrief] = useState<TianyiNuwaExecutionBrief | null>(null);
  const [nuwaResultReceipt, setNuwaResultReceipt] = useState<NuwaResultReceipt | null>(null);
  const [bridgeExplorationId, setBridgeExplorationId] = useState<string | null>(null);
  const [intelligenceOverlay, setIntelligenceOverlay] = useState<IntelligenceOverlay | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistory | null>(null);
  const [impactBusy, setImpactBusy] = useState(false);
  const [impactError, setImpactError] = useState("");
  const [writingScrollTop, setWritingScrollTop] = useState(0);

  useEffect(() => { void refreshWorkspace(); }, []);

  useEffect(() => {
    const onPopState = () => {
      setRouteRevision((current) => current + 1);
      setProjectCenterOpen(isProjectCenterPath());
      setProductMode(currentWorkspaceLocation().id);
      const nextSettingsRoute = readSettingsRouteState(window.location.pathname, window.location.search);
      setSettingsSection(nextSettingsRoute.section);
      setSettingsLeaf(nextSettingsRoute.leaf);
      setCreationRouteMode(readCreationRouteMode(window.location.pathname));
      setMultiverseRouteMode(readMultiverseRouteMode(window.location.pathname));
      if (window.location.pathname.replace(/\/+$/u, "") === "/library") {
        const next = readLibraryRouteState(window.location.href);
        setLibraryHome(next.home);
        setLibrarySearchOriginHome(false);
        setLibraryTab(next.tab);
        setLibraryDirectory(next.directory);
        setRelationView(next.relationView);
        setRelationPresentation(next.relationPresentation);
        setRelationId(next.relationId);
        setSearchQuery(next.query);
      }
      syncTianyiRouteState();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    syncTianyiRouteState();
  }, []);

  useEffect(() => {
    if (productMode !== "library" || !library || window.location.pathname.replace(/\/+$/u, "") !== "/library") return;
    const route = readLibraryRouteState(window.location.href);
    if (route.objectId && !activeObject) {
      const object = library.objects.find((candidate) => candidate.id === route.objectId);
      if (object) void openObject(object, "library", "replace");
      else writeLibraryRouteState({ objectId: null }, "replace");
    } else if (!route.objectId && activeObject) {
      setActiveObject(null);
      setDraft(null);
      setTabs([]);
      setSaveState("saved");
    }
  }, [activeObject, library, productMode]);

  useEffect(() => {
    if (productMode === "library" && libraryHome && !activeObject && !sourceImportView && workspaceMode !== "library") {
      setWorkspaceMode("library");
    }
  }, [activeObject, libraryHome, productMode, sourceImportView, workspaceMode]);

  useEffect(() => {
    document.title = `${isSettingsRoute(window.location.pathname) ? "设置" : storyStudioWorkspaceDisplayName(productMode)} · 天衍故事工作室`;
  }, [productMode, settingsSection]);

  useEffect(() => {
    if (projectCenterOpen) return;
    const location = currentWorkspaceLocation();
    if (!isSettingsRoute(window.location.pathname) && (location.id !== productMode || location.migrated)) {
      const url = new URL(window.location.href);
      url.pathname = storyStudioWorkspaceRoute(productMode);
      url.searchParams.delete("workspace");
      url.searchParams.delete("mode");
      window.history.replaceState({ workspace: productMode }, "", `${url.pathname}${url.search}${url.hash}`);
    }
    // Tianyi/Nuwa retain their source until an author returns. All other
    // workspaces can safely re-establish their source semantics from the
    // canonical workspace identity.
    if (productMode === "world") {
      setShowWorldHome(true);
      setTianyiSourceMode("world");
    } else if (productMode === "library") {
      setShowWorldHome(false);
      setTianyiSourceMode("library");
    } else if (productMode === "writing") {
      setTianyiSourceMode("writing");
    }
  }, [projectCenterOpen, productMode]);

  useEffect(() => {
    if (productMode !== "nuwa" || !library) return;
    void hydrateNuwaWorkspace();
  }, [library?.project.id, productMode]);

  useEffect(() => {
    const routeRequest = resolveNuwaRouteRequest(window.location.search);
    const requestedRunId = routeRequest.runId;
    const runScopedControlStage = routeRequest.stage === "director" || routeRequest.stage === "longform";
    const runId = requestedRunId || storyExploration?.rehearsal?.runId;
    if (productMode !== "nuwa" || !library || !runId) {
      setNuwaSceneRuntime(null);
      return;
    }
    let cancelled = false;
    void getNuwaSceneSimulation(library.project.id, runId)
      .then((runtime) => {
        if (cancelled) return;
        if (!runtime) {
          if (requestedRunId && !runScopedControlStage) replaceNuwaRouteParameters(["run"]);
          setNuwaSceneRuntime(null);
          if (requestedRunId && !runScopedControlStage) setNuwaRecoveryNotice("该场景 Run 已不存在或不属于当前作品；已返回主 Run。");
          return;
        }
        setNuwaSceneRuntime(runtime);
      })
      .catch(() => {
        if (!cancelled) setNuwaSceneRuntime(null);
      });
    return () => { cancelled = true; };
  }, [library?.project.id, nuwaStage, productMode, storyExploration?.id, storyExploration?.rehearsal?.runId]);

  useEffect(() => {
    const runId = resolveNuwaRouteRequest(window.location.search).runId || storyExploration?.rehearsal?.runId;
    if (productMode !== "nuwa" || !library || !runId) {
      nuwaDirectorRequestRef.current += 1;
      setNuwaDirectorState(null);
      return;
    }
    let cancelled = false;
    const request = ++nuwaDirectorRequestRef.current;
    void getNuwaDirectorStateR1(library.project.id, runId).then((state) => {
      if (!cancelled && request === nuwaDirectorRequestRef.current) setNuwaDirectorState(state);
    }).catch((cause) => {
      if (!cancelled && request === nuwaDirectorRequestRef.current) setNuwaDirectorError(messageOf(cause));
    });
    return () => { cancelled = true; };
  }, [library?.project.id, nuwaStage, productMode, storyExploration?.id, storyExploration?.rehearsal?.runId, nuwaSceneRuntime?.runId]);

  useEffect(() => {
    const routeWantsWorkDock = productMode === "tianyi" && new URL(window.location.href).searchParams.get("dock") === "work";
    if (routeWantsWorkDock) {
      if (sharedDockSlot.kind !== "quick-tianyi") workspaceDockCoordinator.openQuickTianyi();
      setTianyiDockMode("work");
      setTianyiQuickPlacement("pinned");
      return;
    }
    if (sharedDockSlot.kind === "quick-tianyi") {
      setTianyiQuickPlacement((current) => current === "closed" ? "pinned" : current);
      return;
    }
    setTianyiQuickPlacement("closed");
  }, [productMode, sharedDockSlot]);

  useEffect(() => {
    if (productMode !== "nuwa" || !library || !bootstrap) return;
    const request = resolveNuwaRouteRequest(window.location.search);
    const routeParameters = new URLSearchParams(window.location.search);
    const malformedProject = routeParameters.has("project") && !request.projectId;
    if (malformedProject) {
      replaceNuwaRouteParameters(["project"]);
      setNuwaRecoveryNotice("原工作上下文已失效，已返回当前作品。");
    } else if (request.projectId && request.projectId !== library.project.id) {
      const requestedProject = bootstrap.projects.find((project) => project.id === request.projectId);
      if (requestedProject) {
        void switchProject(requestedProject, "nuwa");
        return;
      }
      replaceNuwaRouteParameters(["project"]);
      setNuwaRecoveryNotice("原工作上下文已失效，已返回当前作品。");
    }
    const currentUnit = executionBrief?.authorApprovalState === "approved" && storyExploration && bridgeExplorationId === storyExploration.id
      ? storyExploration
      : null;
    const invalidUnit = Boolean((routeParameters.has("unit") && !request.unitId) || (request.unitId && (!currentUnit || request.unitId !== currentUnit.id)));
    const knownSceneRunIds = new Set([
      ...(currentUnit?.rehearsal?.runId ? [currentUnit.rehearsal.runId] : []),
      ...(nuwaSceneRuntime ? [nuwaSceneRuntime.runId, ...nuwaSceneRuntime.children.map((child) => child.runId)] : []),
      ...(request.runId ? [request.runId] : [])
    ]);
    const invalidRun = Boolean((routeParameters.has("run") && !request.runId) || (request.runId && !knownSceneRunIds.has(request.runId)));
    const knownReviewIds = new Set([
      ...candidateReviewHistory.map((entry) => entry.id),
      ...(goldenLoopResult?.review ? [goldenLoopResult.review.id] : [])
    ]);
    const invalidReview = Boolean((routeParameters.has("review") && !request.reviewId) || (request.reviewId && !knownReviewIds.has(request.reviewId)));
    if (invalidUnit || invalidRun || invalidReview) {
      replaceNuwaRouteParameters([
        ...(invalidUnit ? ["unit"] : []),
        ...(invalidRun ? ["run"] : []),
        ...(invalidReview ? ["review"] : [])
      ]);
      setNuwaRecoveryNotice("该记录已不存在或不属于当前作品；已返回当前 Unit。");
    }
    const nextStage = invalidUnit || invalidRun || invalidReview
      ? "rehearsal"
      : resolveNuwaWorkspaceStage(request, readNuwaStage(library.project.id));
    if (nextStage !== nuwaStage) setNuwaStage(nextStage);
  }, [bootstrap, bridgeExplorationId, candidateReviewHistory, executionBrief?.authorApprovalState, goldenLoopResult?.review?.id, library?.project.id, nuwaSceneRuntime, nuwaStage, productMode, storyExploration]);

  useEffect(() => {
    if (!controlCenterOpen) return;
    void refreshModelServiceStatus();
  }, [controlCenterOpen]);

  useEffect(() => {
    if (!library) return;
    let cancelled = false;
    void runWithConnection((connectedToken) => getModelServiceStatus(connectedToken))
      .then((status) => { if (!cancelled) setModelServiceStatus(status); })
      .catch(() => { if (!cancelled) setModelServiceStatus(null); });
    return () => { cancelled = true; };
  }, [library?.project.id]);

  useEffect(() => {
    if (productMode === "data" || !library || !writing?.activeDocument || writingContinuityHydratedProjectRef.current !== library.project.id) return;
    const timer = window.setTimeout(() => {
      const sourceSnapshot = productMode === "nuwa" || productMode === "tianyi" ? tianyiReturnSnapshotRef.current : null;
      const sourceWritingTarget = sourceSnapshot?.target.kind === "writing-document" ? sourceSnapshot : null;
      const editorSelection = sourceWritingTarget?.editorSelection || (writingEditorInteraction ? { start: writingEditorInteraction.selectionStart, end: writingEditorInteraction.selectionEnd } : null);
      const focus = sourceWritingTarget?.focusToken === "writing-editor" || writingEditorInteraction?.focused ? "writing-editor" as const : "workspace" as const;
      const continuityDestination = productMode as Exclude<ProductWorkspaceMode, "data">;
      const returnDestination = sourceSnapshot?.destination && sourceSnapshot.destination !== "data" ? sourceSnapshot.destination : continuityDestination;
      void runWithConnection((connectedToken) => saveWritingContinuity({
        projectId: library.project.id,
        activeDestination: continuityDestination,
        returnDestination,
        workspaceMode: sourceSnapshot?.workspaceMode || String(workspaceMode),
        showWorldHome: sourceSnapshot?.showWorldHome ?? showWorldHome,
        documentId: sourceWritingTarget?.target.id || writing.activeDocument!.id,
        revisionToken: sourceWritingTarget?.target.revision || writing.activeDocument!.revisionToken,
        selection: sourceSnapshot?.selectionAnchor || selection,
        editorSelection,
        scrollTop: sourceWritingTarget?.scrollTop ?? writingEditorInteraction?.scrollTop ?? writingScrollTop,
        focus,
        token: connectedToken
      })).catch(() => {
        // Continuity is convenience state and must not interrupt writing or create a global error loop.
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [library?.project.id, writing?.activeDocument?.id, writing?.activeDocument?.revisionToken, productMode, selection, writingScrollTop, writingEditorInteraction, workspaceMode, showWorldHome]);

  useEffect(() => {
    setSharedTianyiSessionId(null);
    setTianyiDrafts({});
    setTianyiObjectContextRefs([]);
    setTianyiEventReferences([]);
    setTianyiGroundedAccess({ accessMode: "author", subjectRef: null });
    if (new URL(window.location.href).searchParams.get("dock") === "work" && window.location.pathname.replace(/\/+$/u, "") === "/tianyi") {
      workspaceDockCoordinator.openQuickTianyi();
      setTianyiDockMode("work");
      setTianyiQuickPlacement("pinned");
    } else {
      setTianyiQuickPlacement("closed");
    }
    tianyiReturnSnapshotRef.current = null;
    setWritingStartError("");
  }, [bootstrap?.activeProject?.id]);

  useEffect(() => {
    if (!libraryMobileOpen) return;
    const drawer = document.querySelector<HTMLElement>("aside.world-library.is-mobile-open, aside.writing-navigator.is-mobile-open, aside.module-context-sidebar.is-mobile-open");
    const shell = drawer?.closest<HTMLElement>(".story-studio-shell");
    if (!drawer || !shell) return;
    const background: HTMLElement[] = [];
    for (const element of [...shell.children]) {
      if (!(element instanceof HTMLElement) || element.classList.contains("sidebar-mobile-backdrop")) continue;
      if (element.contains(drawer)) {
        for (const nested of [...element.children]) {
          if (nested instanceof HTMLElement && !nested.contains(drawer) && !nested.classList.contains("sidebar-mobile-backdrop")) background.push(nested);
        }
      } else if (element !== drawer) {
        background.push(element);
      }
    }
    const previousBackground = background.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert")
    }));
    const previousBodyOverflow = document.body.style.overflow;
    for (const element of background) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";

    const focusable = () => [...drawer.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    drawer.querySelector<HTMLElement>('button[aria-label^="关闭"]')?.focus();

    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!drawer.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => {
      window.removeEventListener("keydown", containFocus);
      document.body.style.overflow = previousBodyOverflow;
      for (const previous of previousBackground) {
        if (!previous.inert) previous.element.removeAttribute("inert");
        if (previous.ariaHidden === null) previous.element.removeAttribute("aria-hidden");
        else previous.element.setAttribute("aria-hidden", previous.ariaHidden);
      }
      const trigger = mobileDrawerTriggerRef.current;
      mobileDrawerTriggerRef.current = null;
      window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
    };
  }, [libraryMobileOpen]);

  useEffect(() => {
    const close = () => setLibraryMobileOpen(false);
    window.addEventListener("story-studio-close-mobile-context", close);
    return () => window.removeEventListener("story-studio-close-mobile-context", close);
  }, []);

  function closeMobileTransientOverlays(): void {
    document.querySelectorAll<HTMLDetailsElement>("details.product-shell-more[open]").forEach((element) => element.removeAttribute("open"));
    workspaceDockCoordinator.closePageInspector("event-line");
    workspaceDockCoordinator.closePageInspector("story-observation");
    workspaceDockCoordinator.closeQuickTianyi();
    window.dispatchEvent(new Event("story-studio-close-mobile-overlays"));
  }

  function openMobileDrawer(): void {
    closeMobileTransientOverlays();
    mobileDrawerTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLibraryMobileOpen(true);
  }

  function closeMobileDrawer(): void {
    setLibraryMobileOpen(false);
  }

  useEffect(() => {
    const projectId = bootstrap?.activeProject?.id;
    if (!projectId) {
      setStorageTransparency(null);
      setStorageLoading(false);
      setStorageError("");
      return;
    }
    let cancelled = false;
    setStorageLoading(true);
    setStorageError("");
    void storageProvider.getProjectStatus(projectId)
      .then((status) => { if (!cancelled) setStorageTransparency(status); })
      .catch((cause) => { if (!cancelled) { setStorageTransparency(null); setStorageError(messageOf(cause)); } })
      .finally(() => { if (!cancelled) setStorageLoading(false); });
    return () => { cancelled = true; };
  }, [bootstrap?.activeProject?.id]);

  useEffect(() => {
    if (!library) return;
    let cancelled = false;
    const query = searchQuery.trim();
    const builtinDirectory = libraryDirectory === "character" || libraryDirectory === "item" || libraryDirectory === "location" || libraryDirectory === "faction";
    const effectiveTypeFilter = libraryDirectoryObjectType(libraryDirectory) || (libraryDirectory === "all" ? typeFilter : null);
    const customDirectory = libraryDirectory.startsWith("agent:") ? classifiedLibraryProjection?.directories.find((directory) => directory.typeId === libraryDirectory.slice("agent:".length)) : null;
    const folderDirectory = libraryDirectory.startsWith("folder:") ? library.folders.find((folder) => folder.kind === "folder" && folder.id === libraryDirectory.slice("folder:".length)) : null;
    const recentObjects = library.objects.filter((object) => Boolean(object.updatedAt)).sort(compareLibraryUpdatedObjects);
    const unfiledObjects = library.objects.filter((object) => !library.placements.some((placement) => placement.documentId === object.id));
    const folderObjects = folderDirectory ? library.objects.filter((object) => library.placements.some((placement) => placement.documentId === object.id && placement.folderId === folderDirectory.id)) : [];
    const nextObjects = () => {
      if (libraryDirectory === "recent") return query ? recentObjects.filter((object) => libraryObjectMatchesQuery(object, query)) : recentObjects;
      if (libraryDirectory === "unfiled") return query ? unfiledObjects.filter((object) => libraryObjectMatchesQuery(object, query)) : unfiledObjects;
      if (folderDirectory) return query ? folderObjects.filter((object) => libraryObjectMatchesQuery(object, query)) : folderObjects;
      if (query || libraryTab === "uncertain") return null;
      if (builtinDirectory) return library.objects.filter((object) => object.type === libraryDirectory);
      if (effectiveTypeFilter) return library.objects.filter((object) => object.type === effectiveTypeFilter);
      if (customDirectory) return customDirectory.objects.map((reference) => summaryForAgentReference(reference, library.objects));
      if (libraryDirectory === "all") return library.objects;
      return [];
    };
    const localObjects = nextObjects();
    if (localObjects) {
      setVisibleObjects(localObjects);
      setHighlightedIndex(0);
      return () => { cancelled = true; };
    }
    if (libraryTab === "uncertain" && !query) {
      setVisibleObjects([]);
      setHighlightedIndex(0);
      return () => { cancelled = true; };
    }
    void searchWorldObjects(library.project.id, query, effectiveTypeFilter || undefined)
      .then((objects) => { if (!cancelled) { setVisibleObjects(objects); setHighlightedIndex(0); } })
      .catch((cause) => { if (!cancelled) setError(messageOf(cause)); });
    return () => { cancelled = true; };
  }, [classifiedLibraryProjection, library?.folders, library?.objects, library?.placements, library?.project.id, libraryDirectory, libraryTab, searchQuery, typeFilter]);

  async function refreshWorkspace(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const nextBootstrap = await getBootstrap();
      setBootstrap(nextBootstrap);
      if (nextBootstrap.activeProject) await loadLibrary(nextBootstrap.activeProject.id);
      else clearLibrary();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }

  async function loadLibrary(projectId: string): Promise<void> {
    if (executionBrief && executionBrief.sourceProject.projectId !== projectId) {
      setExecutionBrief(null);
      setNuwaResultReceipt(null);
      setBridgeExplorationId(null);
    }
    const eventLineReadPromise = refreshEventLineRead(projectId);
    const requestedLocation = currentWorkspaceLocation();
    const restoreSavedDestination = window.location.pathname === "/" || requestedLocation.migrated;
    const shouldHydrateContinuity = writingContinuityHydratedProjectRef.current !== projectId;
    const [next, nextVisualWorkbench, initialWriting, nextTemplates, candidateReview, candidateHistory, persistedContinuity, nextStoryUnits, nextOutputArtifacts, nextCreationMedia, nextSourceImportDocuments, nextAgentTypes, nextClassifiedProjection, nextUncertainProjection, nextRelations, nextRelationTypes] = await Promise.all([
      getWorldLibrary(projectId),
      getVisualWorkbench(projectId),
      getWritingBootstrap(projectId),
      listCardTemplates(projectId),
      getGoldenLoopCandidateReview(projectId),
      listGoldenLoopCandidateReviews(projectId),
      shouldHydrateContinuity ? getWritingContinuity(projectId) : Promise.resolve(null),
      listStoryUnits(projectId),
      listOutputArtifacts(projectId, true),
      getCreationMediaCatalog(projectId),
      listSourceImportReviews(projectId),
      listAgentTypes(projectId),
      listClassifiedLibraryProjection(projectId),
      listUncertainLibraryProjection(projectId),
      listRelations({ projectId, includeArchived: true }),
      listRelationTypes(projectId)
    ]);
    let nextWriting = initialWriting;
    const continuity = shouldHydrateContinuity ? persistedContinuity : null;
    if (continuity?.state === "exact" && nextWriting.activeDocument?.id !== continuity.documentId) {
      try {
        const reopened = await runWithConnection((connectedToken) => openWritingDocument(projectId, continuity.documentId, connectedToken));
        nextWriting = { ...nextWriting, activeDocument: reopened };
      } catch {
        // The durable state is advisory; the current server-selected document remains the safe fallback.
      }
    }
    const exactContinuity = continuity?.state === "exact" && nextWriting.activeDocument?.id === continuity.documentId && nextWriting.activeDocument.revisionToken === continuity.revisionToken
      ? continuity
      : null;
    setLibrary(next);
    setAgentTypeDefinitions(nextAgentTypes.types);
    setAgentTypeCatalogRevision(nextAgentTypes.catalogRevision);
    setAgentTypeBoundCounts(nextAgentTypes.boundCounts);
    setClassifiedLibraryProjection(nextClassifiedProjection);
    setUncertainLibraryProjection(nextUncertainProjection);
    setRelationRecords(nextRelations.relations);
    setRelationTypes(nextRelationTypes.types);
    setVisualWorkbench(nextVisualWorkbench);
    setWriting(nextWriting);
    setStoryUnits(nextStoryUnits);
    setOutputArtifacts(nextOutputArtifacts);
    setCreationMedia(nextCreationMedia);
    setSourceImportDocuments(nextSourceImportDocuments);
    const requestedSourceDocumentId = new URL(window.location.href).searchParams.get("sourceDocumentId");
    setSourceImportActiveId(requestedSourceDocumentId || nextSourceImportDocuments[0]?.sourceDocumentId || null);
    const creationSearch = new URL(window.location.href).searchParams;
    const requestedArtifactId = creationSearch.get("artifact");
    const requestedArtifact = requestedArtifactId ? nextOutputArtifacts.find((artifact) => artifact.id === requestedArtifactId) || null : null;
    const latestEditableArtifact = nextOutputArtifacts.find((artifact) => artifact.lifecycle !== "archived") || null;
    const sourcePortRoute = window.location.pathname === "/creation" && creationSearch.get("fixture") !== "work-version-creation" && Boolean(creationSearch.get("view") && CREATION_SOURCE_PORT_VIEWS.has(creationSearch.get("view")!));
    const shouldResumeCreation = window.location.pathname === "/creation" && !sourcePortRoute && creationSearch.get("view") !== "center" && creationSearch.get("view") !== "media";
    const restoredArtifact = sourcePortRoute ? null : requestedArtifact || (shouldResumeCreation ? latestEditableArtifact : null);
    setActiveOutputArtifactId(restoredArtifact?.id || null);
    if (restoredArtifact) setCreationType(restoredArtifact.type);
    setCreationView(creationSearch.get("view") === "media" ? "media" : restoredArtifact ? "artifact" : "center");
    if (exactContinuity) {
      if (restoreSavedDestination) restoreProductWorkspace(exactContinuity.activeDestination);
      setSelection(exactContinuity.selection);
      setWritingScrollTop(exactContinuity.scrollTop);
      const editorInteraction = {
        focused: exactContinuity.focus === "writing-editor",
        selectionStart: exactContinuity.editorSelection?.start || 0,
        selectionEnd: exactContinuity.editorSelection?.end || 0,
        scrollTop: exactContinuity.scrollTop
      };
      setWritingEditorInteraction(editorInteraction);
      setWritingEditorRestoreSnapshot({ ...editorInteraction, requestId: Date.now() });
      if (exactContinuity.activeDestination === "nuwa" || exactContinuity.activeDestination === "tianyi") {
        tianyiReturnSnapshotRef.current = {
          version: "story-studio-product-shell-location/v1",
          projectId,
          destination: exactContinuity.returnDestination,
          workspaceMode: exactContinuity.workspaceMode,
          showWorldHome: exactContinuity.showWorldHome,
          target: { kind: "writing-document", id: exactContinuity.documentId, revision: exactContinuity.revisionToken },
          selectionAnchor: exactContinuity.selection,
          editorSelection: exactContinuity.editorSelection,
          scrollTop: exactContinuity.scrollTop,
          focusToken: exactContinuity.focus
        };
        setNuwaSourceLabel(productModeLabel(exactContinuity.returnDestination));
      }
    } else if (continuity?.state === "revision-stale") {
      restoreProductWorkspace("writing");
      setSelection(EMPTY_WORKSPACE_SELECTION);
      setWritingScrollTop(0);
      setError("上次写作位置对应的文档已经修订；已打开当前版本，未恢复旧选区和滚动位置。");
    } else if (continuity?.state === "target-missing") {
      restoreProductWorkspace("writing");
      setSelection(EMPTY_WORKSPACE_SELECTION);
      setWritingScrollTop(0);
      setError("上次写作文档已不存在；已回到当前可用文档，没有按同名内容猜测位置。");
    } else if (continuity?.state === "exact") {
      restoreProductWorkspace("writing");
      setSelection(EMPTY_WORKSPACE_SELECTION);
      setWritingScrollTop(0);
      setError("上次写作文档暂时无法重新打开；已保留项目事实并回到当前可用文档。");
    }
    setGoldenLoopResult(candidateReview ? { ...candidateReview.result, review: { id: candidateReview.id, status: candidateReview.status } } : null);
    setRejectedGoldenLoopCandidateIds(candidateReview?.candidates.filter((candidate) => candidate.status === "rejected").map((candidate) => candidate.id) || []);
    setAcceptedGoldenLoopCandidateIds(candidateReview?.candidates.filter((candidate) => candidate.status === "accepted").map((candidate) => candidate.id) || []);
    setCandidateReviewHistory(candidateHistory);
    setCardTemplates(nextTemplates);
    if (!continuity) {
      setSelection(next.selection);
    }
    setWorkspaceMode(nextVisualWorkbench.active && nextVisualWorkbench.primaryDocument ? nextVisualWorkbench.primaryDocument.type : "library");
    setVisibleObjects(next.objects);
    setBulkSelectedObjectIds([]);
    void refreshR9AWorkflow(projectId);
    const nextTabs = next.tabs.flatMap((relativeId) => {
      const match = next.objects.find((item) => item.relativeId === relativeId);
      return match ? [match] : [];
    });
    setTabs(nextTabs);
    if (next.activeObject) applyObject(next.activeObject, nextTabs);
    else {
      setActiveObject(null);
      setDraft(null);
      setSaveState("saved");
      setConflictObject(null);
      setObjectConflictKind(null);
      setObjectDirtyOwners({ markdown: false, presentation: false });
    }
    setWritingSaveState("saved");
    setWritingConflict(null);
    setNuwaResultReceipt(null);
    setBridgeExplorationId(null);
    setNuwaPageDockState({ open: false, activeLens: "context" });
    setNuwaStage("rehearsal");
    setNuwaRecoveryNotice(null);
    setImpactReview(null);
    setAuthorChangeSet(null);
    setStoryExploration(null);
    setIntelligenceOverlay(null);
    setReviewHistory(null);
    setImpactBusy(false);
    setImpactError("");
    writingContinuityHydratedProjectRef.current = projectId;
    await eventLineReadPromise;
  }

  async function refreshEventLineRead(projectId: string): Promise<void> {
    const sequence = ++eventLineReadSequenceRef.current;
    setEventLineRead({ status: "loading" });
    try {
      const next = await getVerifiedCanonEventList(projectId);
      if (sequence === eventLineReadSequenceRef.current) setEventLineRead(next);
    } catch {
      if (sequence === eventLineReadSequenceRef.current) {
        setEventLineRead({
          status: "error",
          error: {
            kind: "repository-io",
            message: "无法连接本地 Canon 读取服务，事件线未将故障显示为空列表。"
          }
        });
      }
    }
  }

  function clearLibrary() {
    eventLineReadSequenceRef.current += 1;
    setEventLineRead({ status: "loading" });
    setLibrary(null);
    setAgentTypeDefinitions([]);
    setAgentTypeCatalogRevision(0);
    setAgentTypeBoundCounts({});
    setClassifiedLibraryProjection(null);
    setUncertainLibraryProjection(null);
    setRelationRecords([]);
    setRelationTypes([]);
    setRelationId(null);
    setActiveObject(null);
    setTabs([]);
    setDraft(null);
    setVisibleObjects([]);
    setVisualWorkbench(null);
    setWriting(null);
    setStoryUnits([]);
    setOutputArtifacts([]);
    setActiveOutputArtifactId(null);
    setCardTemplates([]);
    restoreProductWorkspace("world");
    setTianyiQuickPlacement("closed");
    setTianyiSurface("companion");
    setTianyiSourceMode("world");
    setWorkspaceMode("library");
    setVisualObject(null);
    setSelection(EMPTY_WORKSPACE_SELECTION);
    setWritingSaveState("saved");
    setWritingConflict(null);
    setImpactReview(null);
    setAuthorChangeSet(null);
    setStoryExploration(null);
    setIntelligenceOverlay(null);
    setShowWorldHome(true);
    setStorageTransparency(null);
    setStorageError("");
    setStorageSettingsOpen(false);
  }

  function applyObject(object: WorldObject, currentTabs = tabs) {
    setActiveObject(object);
    setDraft(toDraft(object));
    setSaveState("saved");
    setConflictObject(null);
    setObjectConflictKind(null);
    setObjectDirtyOwners({ markdown: false, presentation: false });
    setTabs([object, ...currentTabs.filter((item) => item.id !== object.id)].slice(0, 5));
  }

  async function runWithConnection<T>(action: (connectedToken: string) => Promise<T>): Promise<T> {
    return storageProvider.withWriteAccess(async (transportContext) => {
      if (!token) setToken(transportContext);
      return action(transportContext);
    });
  }

  async function refreshStoryUnitData(projectId = library?.project.id): Promise<void> {
    if (!projectId) return;
    const [units, artifacts, media] = await Promise.all([listStoryUnits(projectId), listOutputArtifacts(projectId, true), getCreationMediaCatalog(projectId)]);
    setStoryUnits(units);
    setOutputArtifacts(artifacts);
    setCreationMedia(media);
  }

  async function openCreationFromEvent(event: { id: string; title: string; revisionToken: string }): Promise<void> {
    if (!library) return;
    const detail = await getVerifiedCanonEvent(library.project.id, event.id);
    if (detail.status !== "ready" || detail.event.id !== event.id) throw new Error("只有已确认且可验证的 Event 才能生成小说局部建议。");
    const currentUnits = await listStoryUnits(library.project.id);
    const existing = currentUnits.find((unit) => unit.sourceRefs.some((source) => source.sourceKind === "event-line" && source.entityId === event.id && source.entityVersion === event.revisionToken));
    const unit = existing || await runWithConnection((connectedToken) => createStoryUnit({
      projectId: library.project.id,
      title: `事件 · ${event.title}`,
      summary: `创作范围：${event.title}`,
      sourceRefs: [{ sourceKind: "event-line", ownerId: "story-studio-verified-event-read", entityId: event.id, entityVersion: event.revisionToken, capturedAt: new Date().toISOString(), staleState: "fresh" }],
      items: [{ id: `event.${event.id}`, kind: "event", authority: "canon", content: { title: event.title, eventId: event.id }, sourceRefs: [{ sourceKind: "event-line", ownerId: "story-studio-verified-event-read", entityId: event.id, entityVersion: event.revisionToken, capturedAt: new Date().toISOString(), staleState: "fresh" }], createdBy: "system" }],
      token: connectedToken
    }));
    let artifacts = await listOutputArtifacts(library.project.id, true);
    let artifact = artifacts.find((candidate) => candidate.type === "novel" && candidate.sourceUnits.some((source) => source.unitId === unit.id));
    if (!artifact) {
      artifact = await runWithConnection((connectedToken) => createOutputArtifact({
        projectId: library.project.id,
        type: "novel",
        title: `${event.title} · 小说`,
        sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: unit.items.map((item) => item.id) }],
        generationBrief: { origin: "confirmed-event", sourceEventId: event.id, sourceEventRevision: event.revisionToken, notice: "仅生成局部 proposal；不会自动覆盖正文。" },
        token: connectedToken
      }));
      artifacts = [artifact, ...artifacts];
    }
    const model = readNovelDocumentModel(artifact.structure);
    if (model) {
      const targetBlockId = firstNovelParagraphId(model);
      if (targetBlockId) {
        const existingProposal = (() => { try { return artifact!.structure[NOVEL_EVENT_PROPOSAL_KEY] ? validateNovelEventProposal(artifact!.structure[NOVEL_EVENT_PROPOSAL_KEY]) : null; } catch { return null; } })();
        const proposal = existingProposal && existingProposal.sourceEventId === event.id && existingProposal.sourceEventRevision === event.revisionToken
          ? existingProposal
          : createNovelEventProposal({
            proposalId: `novel-event-proposal-${event.id}-${event.revisionToken.slice(0, 16)}`,
            sourceEventId: event.id,
            sourceEventRevision: event.revisionToken,
            targetDocumentId: model.documentId,
            targetBlockId,
            before: model.blocks[targetBlockId] ? model.blocks[targetBlockId].inlines.map((inline) => inline.kind === "text" ? inline.text : `@${inline.ref.label}`).join("") : "",
            eventTitle: detail.event.title,
            eventBody: detail.event.body || detail.event.properties.summary?.toString() || "确认事件已进入事件线。",
            generatedAt: new Date().toISOString()
          });
        if (!existingProposal || existingProposal.sourceEventId !== event.id || existingProposal.sourceEventRevision !== event.revisionToken) {
          const updated = await runWithConnection((connectedToken) => updateOutputArtifact({
            projectId: library.project.id,
            artifactId: artifact!.id,
            expectedVersion: artifact!.version,
            content: artifact!.content,
            structure: { ...artifact!.structure, [NOVEL_DOCUMENT_MODEL_KEY]: model, [NOVEL_EVENT_PROPOSAL_KEY]: proposal },
            token: connectedToken
          }));
          if (updated.conflict) throw new Error("小说产物已被其他位置更新，请重新打开后生成事件建议。");
          artifact = updated.artifact;
        }
      }
    }
    await refreshStoryUnitData(library.project.id);
    setCreationSourceUnitId(unit.id);
    await chooseProductMode("writing");
    openCreationArtifact(artifact);
  }

  async function openCreationFromPossibility(candidate: GoldenLoopCandidate): Promise<void> {
    if (!library) return;
    await openLegacyNuwaCreationHandoff({ projectId: library.project.id, runPackId: "nuwa-runpack" });
  }

  async function sendStandalonePossibilityToCreation(input: { id: string; title: string; summary: string }, type: OutputArtifactType): Promise<void> {
    if (!library || !storyExploration || storyExploration.source.kind !== "standalone") return;
    const runId = storyExploration.source.sceneId.replace(/^standalone:/u, "");
    await openLegacyNuwaCreationHandoff({ projectId: library.project.id, runId, runPackId: "nuwa-runpack" });
  }

  async function openLegacyNuwaCreationHandoff(input: Parameters<typeof adaptLegacyNuwaCreationHandoff>[0]): Promise<void> {
    const result = adaptLegacyNuwaCreationHandoff(input);
    await chooseProductMode("writing");
    setActiveOutputArtifactId(null);
    setCreationView("center");
    setCreationRouteMode("hub");
    const next = new URL(window.location.href);
    next.pathname = "/creation";
    next.search = "";
    if (result.status === "blocked_incomplete_source") next.searchParams.set("legacySource", "blocked");
    else {
      next.searchParams.set("workVersionId", result.source.workVersionId);
      next.searchParams.set("storyUnitId", result.source.storyUnitRefs[0].unitId);
      for (const event of result.source.eventRefs) next.searchParams.append("eventId", event.eventId);
    }
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "writing", legacyNuwaHandoff: result.status }, "", `${next.pathname}${next.search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function openCreationFromTianyi(): Promise<void> {
    if (!library) return;
    const idea = sharedTianyiDraft.trim() || "当前天意记录";
    const unit = await runWithConnection((connectedToken) => createStoryUnit({
      projectId: library.project.id,
      title: "天意想法",
      summary: "创作范围：天意当前想法",
      sourceRefs: [{ sourceKind: "tianyi-intent", ownerId: "tianyi-session", entityId: sharedTianyiSessionId || "pending", entityVersion: "current", capturedAt: new Date().toISOString(), staleState: "fresh" }],
      items: [{ id: `intent.${Date.now()}`, kind: "intent", authority: "author-intent", content: { text: idea }, sourceRefs: [], createdBy: "author" }],
      token: connectedToken
    }));
    await refreshStoryUnitData(library.project.id);
    setCreationSourceUnitId(unit.id);
    await chooseProductMode("writing");
  }

  async function saveOutputArtifactFromWriting(artifact: OutputArtifact, input: { title: string; content: string; structure: Record<string, unknown> }): Promise<void> {
    if (!library) return;
    const result = await runWithConnection((connectedToken) => updateOutputArtifact({ projectId: library.project.id, artifactId: artifact.id, expectedVersion: artifact.version, ...input, token: connectedToken }));
    if (result.conflict) throw new Error("这份制作稿已在其他位置更新；请重新打开后再保存。");
    await refreshStoryUnitData(library.project.id);
  }

  async function saveExternalCreationArtifact(input: SaveExternalCreationArtifactInput): Promise<void> {
    if (!library) return;
    const outputType: OutputArtifactType | null = ({
      novel: "novel",
      screenplay: "screenplay",
      comic: "comic",
      motion_comic: "motion-comic",
      interactive_story: "interactive-drama",
      visual_novel: "interactive-drama",
      translation_adaptation: "novel",
      document_export: "novel"
    } as const)[input.capability] || null;
    if (!outputType) throw new Error("当前外部工具没有可保存的输出类型。");
    const sourceUnits = input.packageValue.scope.unitIds.flatMap((unitId) => {
      const unit = storyUnits.find((candidate) => candidate.id === unitId);
      return unit ? [{ unitId: unit.id, unitVersion: unit.version, role: "primary" as const, includedItemIds: unit.items.map((item) => item.id) }] : [];
    });
    const labels: Record<OutputArtifactType, string> = { novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动叙事" };
    await runWithConnection((connectedToken) => createOutputArtifact({
      projectId: library.project.id,
      type: outputType,
      title: `${input.packageValue.projectRef.title} · ${labels[outputType]}`,
      sourceUnits,
      content: input.content,
      generationBrief: {
        origin: "external-creation-adapter",
        adapterId: input.receipt.adapterId,
        adapterVersion: input.receipt.adapterVersion,
        inputPackageHash: input.receipt.inputPackageHash,
        receiptId: input.receipt.jobId,
        sourceRevision: input.packageValue.sourceRevision.revisionId
      },
      token: connectedToken
    }));
    await refreshStoryUnitData(library.project.id);
  }

  async function operateCreationPlugin(pluginId: string, operation: "install" | "update" | "rollback" | "enable" | "disable" | "uninstall"): Promise<void> {
    await runWithConnection(async (connectedToken) => {
      await operateCuratedCreationPlugin({ pluginId, operation, token: connectedToken });
    });
  }

  async function executeInstalledCreationPlugin(input: { adapterId: string; packageValue: unknown; capability: string; authorConfirmation: unknown; idempotencyKey: string; beforeHash: string }): Promise<{ receipt: unknown; content: string }> {
    return runWithConnection((connectedToken) => executeCuratedCreationPlugin({ ...input, token: connectedToken }));
  }

  function openCreationCenter(): void {
    setActiveOutputArtifactId(null);
    setCreationView("center");
    setCreationRouteMode("hub");
    updateCreationLocation({ artifactId: null, view: "center", routeMode: "hub" });
  }

  function openCreationArtifact(artifact: OutputArtifact): void {
    setCreationType(artifact.type);
    setActiveOutputArtifactId(artifact.id);
    setCreationView("artifact");
    updateCreationLocation({ artifactId: artifact.id, view: null });
  }

  function openCreationMedia(): void {
    setActiveOutputArtifactId(null);
    setCreationView("media");
    updateCreationLocation({ artifactId: null, view: "media" });
  }

  function openCreationRoute(mode: CreationRouteMode): void {
    setActiveOutputArtifactId(null);
    setCreationView("center");
    setCreationRouteMode(mode);
    navigateAuthoringRoute(creationRouteForMode(mode), "writing");
  }

  function openMultiverseRoute(mode: MultiverseRouteMode): void {
    setMultiverseRouteMode(mode);
    navigateAuthoringRoute(multiverseRouteForMode(mode), "multiverse");
  }

  function openSettingsRoute(section: SettingsRouteSection = "home", returnContext?: string, leaf?: SettingsRouteLeaf): void {
    const nextSection: SettingsRouteSection = section === "home" ? "ai" : section;
    if (!isSettingsRoute(window.location.pathname)) {
      const current = new URL(window.location.href);
      settingsReturnLocationRef.current = `${current.pathname}${current.search}${current.hash}`;
    }
    const url = new URL(window.location.href);
    url.pathname = settingsRouteForLeaf(nextSection, leaf);
    if (returnContext) url.searchParams.set("returnContext", returnContext);
    else if (nextSection !== "plugins") url.searchParams.delete("returnContext");
    window.history.pushState({ settings: nextSection, leaf }, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setControlCenterOpen(false);
    closeMobileDrawer();
  }

  function returnFromSettings(): void {
    const url = new URL(window.location.href);
    const returnContext = url.searchParams.get("returnContext");
    const target = returnContext === "creation" ? "/creation" : settingsReturnLocationRef.current || "/world";
    const targetUrl = new URL(target, window.location.origin);
    targetUrl.searchParams.delete("returnContext");
    settingsReturnLocationRef.current = null;
    window.history.pushState({ workspace: targetUrl.pathname === "/creation" ? "writing" : "world" }, "", `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function renameCreationArtifact(artifact: OutputArtifact, title: string): Promise<void> {
    if (!library || !title.trim()) return;
    const result = await runWithConnection((connectedToken) => updateOutputArtifact({ projectId: library.project.id, artifactId: artifact.id, expectedVersion: artifact.version, title: title.trim(), token: connectedToken }));
    if (result.conflict) throw new Error("这份创作项目已在其他位置更新。");
    await refreshStoryUnitData(library.project.id);
  }

  async function archiveCreationArtifact(artifact: OutputArtifact): Promise<void> {
    if (!library || artifact.lifecycle === "archived") return;
    const result = await runWithConnection((connectedToken) => archiveOutputArtifact({ projectId: library.project.id, artifactId: artifact.id, expectedVersion: artifact.version, token: connectedToken }));
    if (result.conflict) throw new Error("这份创作项目已在其他位置更新。");
    await refreshStoryUnitData(library.project.id);
  }

  async function createMediaRecord(asset: CreationMediaDraft): Promise<void> {
    if (!library) return;
    setCreationMediaBusy(true); setCreationMediaError("");
    try { const result = await runWithConnection((connectedToken) => createCreationMediaAsset({ projectId: library.project.id, expectedCatalogHash: creationMedia.contentHash, asset, token: connectedToken })); setCreationMedia(result.catalog); }
    catch (cause) { setCreationMediaError(messageOf(cause)); throw cause; }
    finally { setCreationMediaBusy(false); }
  }

  async function replaceMediaRecord(asset: CreationMediaAsset, patch: Partial<CreationMediaDraft>): Promise<void> {
    if (!library) return;
    setCreationMediaBusy(true); setCreationMediaError("");
    try { const result = await runWithConnection((connectedToken) => updateCreationMediaAsset({ projectId: library.project.id, assetId: asset.id, expectedCatalogHash: creationMedia.contentHash, patch, token: connectedToken })); if (result.conflict) throw new Error("媒体目录已更新，请重试。"); setCreationMedia(result.catalog); }
    catch (cause) { setCreationMediaError(messageOf(cause)); throw cause; }
    finally { setCreationMediaBusy(false); }
  }

  async function deleteMediaRecord(asset: CreationMediaAsset): Promise<void> {
    if (!library) return;
    if (asset.backlinks.length) { setCreationMediaError("该媒体仍被创作产物引用，不能删除。"); return; }
    setCreationMediaBusy(true); setCreationMediaError("");
    try { const result = await runWithConnection((connectedToken) => deleteCreationMediaAsset({ projectId: library.project.id, assetId: asset.id, expectedCatalogHash: creationMedia.contentHash, token: connectedToken })); if (result.conflict) throw new Error("媒体目录已更新，请重试。"); setCreationMedia(result.catalog); }
    catch (cause) { setCreationMediaError(messageOf(cause)); throw cause; }
    finally { setCreationMediaBusy(false); }
  }

  async function createBlankOutputArtifactFromWriting(type: OutputArtifactType): Promise<void> {
    if (!library) return;
    const labels: Record<OutputArtifactType, string> = { novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动剧" };
    const artifact = await runWithConnection((connectedToken) => createOutputArtifact({ projectId: library.project.id, type, title: `新${labels[type]}制作稿`, token: connectedToken }));
    await refreshStoryUnitData(library.project.id);
    setCreationType(type);
    setCreationStartOpen(false);
    openCreationArtifact(artifact);
  }

  async function createDerivedEventLine(input: { kind: DerivedTransformKindR1; source: StoryUnit; title: string; notes: string; targetLanguage: string; actorLabel: string; threshold: number }): Promise<void> {
    if (!library) throw new Error("请先打开一个作品。");
    const terms = input.notes.split("\n").map((line) => line.split(/[=：]/u).map((part) => part.trim())).filter((parts) => parts.length === 2 && parts[0] && parts[1]).map(([source, target]) => ({ source, target }));
    const write = createDerivedEventLineR1({
      derivedLineId: `derived.${input.kind}.${Date.now()}`,
      source: input.source,
      kind: input.kind,
      title: input.title,
      createdAt: new Date().toISOString(),
      targetLanguage: input.targetLanguage,
      glossary: terms,
      lockedNames: library.objects.filter((object) => object.type === "character" || object.type === "location").map((object) => object.title).slice(0, 64),
      tone: input.kind === "translation" ? input.notes || "保持来源体裁与语气" : undefined,
      branchPoint: input.kind === "if" ? input.notes : undefined,
      preservationContract: input.kind === "adaptation" ? ["角色核心", "关系与关键事件", "来源权利与版本"] : undefined,
      changeContract: input.kind === "adaptation" ? input.notes.split(/[\n，,]/u).map((item) => item.trim()).filter(Boolean).slice(0, 12) : undefined,
      pov: input.kind === "pov" ? { actorRef: library.objects.find((object) => object.type === "character" && object.title === input.actorLabel)?.id || `character.${input.actorLabel}`, actorLabel: input.actorLabel, threshold: input.threshold } : undefined
    });
    await runWithConnection((connectedToken) => createStoryUnit({ projectId: library.project.id, ...write, token: connectedToken }));
    await refreshStoryUnitData(library.project.id);
  }

  async function reviewDerivedEventAlignment(unit: StoryUnit, alignmentId: string, decision: "accept" | "return"): Promise<void> {
    if (!library) throw new Error("请先打开一个作品。");
    const update = reviewDerivedAlignmentR1({ unit, alignmentId, decision });
    const result = await runWithConnection((connectedToken) => updateStoryUnit({ projectId: library.project.id, unitId: unit.id, expectedVersion: unit.version, ...update, token: connectedToken }));
    if (result.conflict) throw new Error("派生线已在别处更新，请重新打开后审核。");
    await refreshStoryUnitData(library.project.id);
  }

  async function markDerivedEventLineReady(unit: StoryUnit): Promise<void> {
    if (!library) throw new Error("请先打开一个作品。");
    const update = markDerivedLineReadyR1(unit);
    const result = await runWithConnection((connectedToken) => updateStoryUnit({ projectId: library.project.id, unitId: unit.id, expectedVersion: unit.version, ...update, lifecycle: "frozen", token: connectedToken }));
    if (result.conflict) throw new Error("派生线版本冲突，未批准。");
    await refreshStoryUnitData(library.project.id);
  }

  async function handoffDerivedEventLine(unit: StoryUnit, type: OutputArtifactType): Promise<void> {
    if (!library) throw new Error("请先打开一个作品。");
    const brief = buildDerivedCreationBriefR1(unit);
    const labels: Record<OutputArtifactType, string> = { novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动剧" };
    const artifact = await runWithConnection((connectedToken) => createOutputArtifact({ projectId: library.project.id, type, title: `${unit.title} · ${labels[type]}`, sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: unit.items.filter((item) => item.possibilityStatus === "selected-for-output").map((item) => item.id) }], generationBrief: brief, token: connectedToken }));
    const receipt = appendDerivedHandoffReceiptR1({ unit, artifactId: artifact.id, artifactVersion: artifact.version, outputType: type, createdAt: new Date().toISOString() });
    const result = await runWithConnection((connectedToken) => updateStoryUnit({ projectId: library.project.id, unitId: unit.id, expectedVersion: unit.version, ...receipt, token: connectedToken }));
    if (result.conflict) throw new Error("成品已创建，但派生线输出回执冲突；请保留成品并刷新。");
    await refreshStoryUnitData(library.project.id);
    await chooseProductMode("writing");
    openCreationArtifact(artifact);
  }

  async function createOutputArtifactFromCurrentStory(type: OutputArtifactType, requestedSourceUnitId = creationSourceUnitId, fullProject = false): Promise<void> {
    if (!library) return;
    const currentTitle = fullProject ? activeProject?.title || library.project.title : writing?.activeDocument?.title || activeObject?.title || activeProject?.title || "当前故事";
    const units = requestedSourceUnitId ? await listStoryUnits(library.project.id) : storyUnits;
    const selectedSource = requestedSourceUnitId ? units.find((unit) => unit.id === requestedSourceUnitId) || null : null;
    const existing = selectedSource || units.find((unit) => unit.lifecycle !== "archived" && unit.summary === `创作范围：${currentTitle}`);
    const unit = existing || await runWithConnection((connectedToken) => createStoryUnit({
      projectId: library.project.id,
      title: `创作范围 · ${currentTitle}`,
      summary: `创作范围：${currentTitle}`,
      sourceRefs: [],
      items: [{ id: `author.intent.${Date.now()}`, kind: "intent", authority: "author-intent", content: { text: `从${currentTitle}开始创作。` }, sourceRefs: [], createdBy: "author" }],
      token: connectedToken
    }));
    const labels: Record<OutputArtifactType, string> = { novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动剧" };
    const artifact = await runWithConnection((connectedToken) => createOutputArtifact({
      projectId: library.project.id,
      type,
      title: `${currentTitle} · ${labels[type]}`,
      sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: unit.items.map((item) => item.id) }],
      token: connectedToken
    }));
    await refreshStoryUnitData(library.project.id);
    setCreationType(type);
    setCreationStartOpen(false);
    setCreationSourceUnitId(null);
    openCreationArtifact(artifact);
  }

  async function refreshStorageTransparency(): Promise<void> {
    const projectId = bootstrap?.activeProject?.id;
    if (!projectId) return;
    setStorageLoading(true);
    setStorageError("");
    try {
      setStorageTransparency(await storageProvider.getProjectStatus(projectId));
    } catch (cause) {
      setStorageTransparency(null);
      setStorageError(messageOf(cause));
    } finally {
      setStorageLoading(false);
    }
  }

  async function revealCurrentProject(): Promise<void> {
    const projectId = bootstrap?.activeProject?.id;
    if (!projectId) return;
    setStorageActionBusy(true);
    setStorageError("");
    try {
      await storageProvider.openProjectLocation(projectId);
    } catch (cause) {
      setStorageError(messageOf(cause));
    } finally {
      setStorageActionBusy(false);
    }
  }

  function updateTitle(value: string) {
    setTitle(value);
    if (!folderEdited) setFolderSlug(suggestSlug(value));
  }

  async function submitProject(): Promise<void> {
    if (!title.trim() || !folderSlug.trim()) return;
    if (bootstrap?.projects.some((project) => project.id === folderSlug.trim().toLowerCase())) {
      setError("这个项目文件夹已经存在，请换一个名称。");
      setOnboarding("identity");
      return;
    }
    await runWithConnection(async (connectedToken) => {
      setOnboarding("creating");
      setError("");
      try {
        await createProject({ title: title.trim(), folderSlug: folderSlug.trim(), ...(genre ? { genre } : {}), ...(ambience ? { ambience } : {}), token: connectedToken });
        await refreshWorkspace();
        setOnboarding(null);
        resetOnboarding();
      } catch (cause) {
        setError(messageOf(cause));
        setOnboarding("identity");
      }
    });
  }

  async function switchProject(project: StoryStudioProject, destination: ProductWorkspaceMode = "world"): Promise<void> {
    await runWithConnection(async (connectedToken) => {
      try {
        await openProject(project.id, connectedToken);
        setSearchQuery("");
        setTypeFilter(null);
        setShowWorldHome(true);
        restoreProductWorkspace(destination);
        setTianyiSurface("companion");
        setTianyiSourceMode("world");
        await refreshWorkspace();
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  async function rememberSelection(next: Partial<WorkspaceSelection>): Promise<void> {
    if (!library) return;
    const normalized = createWorkspaceSelection(next);
    setSelection(normalized);
    if (token) {
      try {
        setSelection(await setWorkspaceSelection(library.project.id, normalized, token));
      } catch (cause) {
        setError(messageOf(cause));
      }
    }
  }

  async function openObject(object: WorldObjectSummary, source: WorkspaceSelectionSource = "library", routeMode: "push" | "replace" | "none" = "push"): Promise<void> {
    if (!library) return;
    setCardReturnTarget(null);
    setError("");
    try {
      const opened = await readWorldObject(library.project.id, object.id);
      if ((source === "library" || source === "card") && routeMode !== "none") {
        writeLibraryRouteState({ tab: libraryTab, directory: libraryDirectory, query: searchQuery, objectId: object.id }, routeMode);
      }
      applyObject(opened);
      await rememberSelection({ objectId: object.id, source });
      setLibraryHome(false);
      setLibrarySearchOriginHome(false);
      restoreProductWorkspace("library");
      setTianyiSourceMode("library");
      setShowWorldHome(false);
      setWorkspaceMode("library");
      setVisualObject(null);
      closeMobileDrawer();
      if (token) {
        await rememberWorldObject(library.project.id, object.id, token);
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function inspectVisualObject(object: WorldObjectSummary, source: WorkspaceSelectionSource = "library", documentId: string | null = null, blockId: string | null = null): Promise<void> {
    if (!library) return;
    setError("");
    try {
      setVisualObject(await readWorldObject(library.project.id, object.id));
      await rememberSelection({ objectId: object.id, source, documentId, blockId });
      closeMobileDrawer();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function openFullObject(object: WorldObject): Promise<void> {
    if (visualWorkbench?.primaryDocument && workspaceMode !== "library") setCardReturnTarget({ workbench: visualWorkbench, workspaceMode, selection });
    applyObject(object);
    setVisualObject(null);
    await rememberSelection({ objectId: object.id, source: "card" });
    restoreProductWorkspace("library");
    setTianyiSourceMode("library");
    setWorkspaceMode("library");
    if (library && token) await rememberWorldObject(library.project.id, object.id, token);
  }

  async function closeFullObject(): Promise<void> {
    if (cardReturnTarget) {
      const target = cardReturnTarget;
      setCardReturnTarget(null);
      setWorkspaceMode(target.workspaceMode);
      setVisualWorkbench(target.workbench);
      setSelection(target.selection);
      setVisualObject(null);
      if (library && token) {
        if (target.workbench.primaryDocument) await openVisualDocument({ projectId: library.project.id, relativePath: target.workbench.primaryDocument.relativePath, pane: "primary", token });
        if (target.workbench.splitView && target.workbench.secondaryDocument) {
          await openVisualDocument({ projectId: library.project.id, relativePath: target.workbench.secondaryDocument.relativePath, pane: "secondary", token });
          await setVisualSplitView(library.project.id, true, token);
        }
        setSelection(await setWorkspaceSelection(library.project.id, target.selection, token));
      }
      return;
    }
    if (activeObject) {
      await closeWorldTab({ kind: "object", id: activeObject.id, title: activeObject.title, type: activeObject.type });
      writeLibraryRouteState({ objectId: null }, "replace");
    }
  }

  function openVisualDialog(type: VisualDocumentType) {
    setVisualDocumentType(type);
    setVisualDocumentTitle("");
    setVisualDocumentError("");
    setVisualDocumentOpen(true);
  }

  async function submitVisualDocument(): Promise<void> {
    if (!library || !visualDocumentTitle.trim()) return;
    setVisualDocumentBusy(true);
    setVisualDocumentError("");
    try {
      const created = await runWithConnection((connectedToken) => createVisualDocument({
        projectId: library.project.id,
        type: visualDocumentType,
        title: visualDocumentTitle.trim(),
        token: connectedToken
      }));
      const next = await getVisualWorkbench(library.project.id);
      setVisualWorkbench({ ...next, primaryDocument: created, tabs: [created.relativePath, ...next.tabs.filter((item) => item !== created.relativePath)] });
      restoreProductWorkspace("library");
      setTianyiSourceMode("library");
      setWorkspaceMode(visualDocumentType);
      setShowWorldHome(false);
      setVisualDocumentOpen(false);
      setVisualDocumentTitle("");
    } catch (cause) {
      setVisualDocumentError(messageOf(cause));
    } finally {
      setVisualDocumentBusy(false);
    }
  }

  async function chooseVisualMode(mode: WorkspaceMode): Promise<void> {
    restoreProductWorkspace("library");
    setTianyiSourceMode("library");
    setWorkspaceMode(mode);
    if (!library || !visualWorkbench) return;
    if (mode === "library") {
      setShowWorldHome(false);
      if (token) await setStoryStudioSurface(library.project.id, "world-library", token);
      return;
    }
    const activeMatches = visualWorkbench.primaryDocument?.type === mode;
    if (activeMatches) return;
    const document = visualWorkbench.documents.find((item) => item.type === mode);
    if (!document) return;
    setShowWorldHome(false);
    const swappedSecondary = visualWorkbench.splitView && visualWorkbench.secondaryDocument?.relativePath === document.relativePath
      ? visualWorkbench.primaryDocument
      : visualWorkbench.secondaryDocument;
    setVisualWorkbench({ ...visualWorkbench, primaryDocument: document, secondaryDocument: swappedSecondary, tabs: [document.relativePath, ...visualWorkbench.tabs.filter((item) => item !== document.relativePath)] });
    if (token) {
      await openVisualDocument({ projectId: library.project.id, relativePath: document.relativePath, pane: "primary", token });
      if (swappedSecondary && swappedSecondary.relativePath !== document.relativePath) {
        await openVisualDocument({ projectId: library.project.id, relativePath: swappedSecondary.relativePath, pane: "secondary", token });
      }
    }
  }

  function captureTianyiReturnSnapshot(preserveEditorOrigin = false): void {
    if (productMode === "tianyi" || productMode === "nuwa" || !bootstrap?.activeProject) return;
    const previous = tianyiReturnSnapshotRef.current;
    const activeElement = document.activeElement;
    const mountedWritingEditor = productMode === "writing"
      ? document.querySelector<HTMLTextAreaElement>(".draft-markdown-editor")
      : null;
    const writingEditor = activeElement instanceof HTMLTextAreaElement && activeElement.classList.contains("draft-markdown-editor")
      ? activeElement
      : preserveEditorOrigin ? mountedWritingEditor : null;
    const currentEditorSelection = writingEditor
      ? { start: writingEditor.selectionStart, end: writingEditor.selectionEnd }
      : null;
    const editorSelection = currentEditorSelection && currentEditorSelection.start !== currentEditorSelection.end
      ? currentEditorSelection
      : productMode === "writing" && writing?.activeDocument
        ? previous?.destination === "writing" && previous.target.kind === "writing-document" && previous.target.id === writing.activeDocument.id && previous.editorSelection
          ? previous.editorSelection
          : { start: 0, end: writing.activeDocument.body.length }
        : null;
    const selectedTextRef = editorSelection && writing?.activeDocument && bootstrap?.activeProject
      ? writingSelectionContextRef(bootstrap.activeProject.id, writing.activeDocument, editorSelection.start, editorSelection.end)
      : null;
    if (selectedTextRef) addTianyiObjectContextRef(selectedTextRef);
    const target = productMode === "writing" && writing?.activeDocument
      ? { kind: "writing-document" as const, id: writing.activeDocument.id, revision: writing.activeDocument.revisionToken }
      : productMode === "library" && workspaceMode === "library" && activeObject
        ? { kind: "world-object" as const, id: activeObject.id, revision: activeObject.revisionToken }
        : productMode === "library" && workspaceMode !== "library" && visualWorkbench?.primaryDocument
          ? { kind: "visual-document" as const, id: visualWorkbench.primaryDocument.id, revision: visualWorkbench.primaryDocument.contentHash }
          : { kind: "project" as const, id: bootstrap.activeProject.id, revision: null };
    const preservedWritingOrigin = preserveEditorOrigin
      && productMode === "writing"
      && previous?.destination === "writing"
      && previous.target.kind === "writing-document"
      && previous.target.id === target.id;
    tianyiReturnSnapshotRef.current = {
      version: "story-studio-product-shell-location/v1",
      projectId: bootstrap.activeProject.id,
      destination: productMode,
      workspaceMode: String(workspaceMode),
      showWorldHome,
      target,
      selectionAnchor: selection,
      scrollTop: writingEditor?.scrollTop ?? writingScrollTop,
      editorSelection: editorSelection ?? (preservedWritingOrigin ? previous.editorSelection : null),
      focusToken: writingEditor
        ? "writing-editor"
        : preservedWritingOrigin && previous.focusToken === "writing-editor"
          ? "writing-editor"
          : activeElement === document.querySelector("[data-testid='tianyi-quick-launcher']")
            ? "tianyi-launcher"
            : "workspace"
    };
  }

  function syncTianyiRouteState(): void {
    const pathname = window.location.pathname.replace(/\/+$/u, "") || "/";
    if (pathname !== "/tianyi") return;
    const url = new URL(window.location.href);
    const requestedMode = url.searchParams.get("mode");
    const wantsWork = requestedMode === "agent" || url.searchParams.get("dock") === "work";
    const nextMode: TianyiCollaborationMode = requestedMode === "creative" && !wantsWork ? "creative" : "conversation";
    setTianyiWorkspaceMode(nextMode);
    setTianyiDockMode(wantsWork ? "work" : "dialogue");
    if (!wantsWork) return;
    url.searchParams.set("mode", "conversation");
    url.searchParams.set("dock", "work");
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "tianyi", tianyiDock: "work" }, "", `${url.pathname}${url.search}${url.hash}`);
    workspaceDockCoordinator.openQuickTianyi();
    setTianyiQuickPlacement("pinned");
  }

  function openWorkTianyi(task?: string): void {
    captureTianyiReturnSnapshot();
    if (task) updateSharedTianyiDraft(task);
    setTianyiWorkspaceMode("conversation");
    setTianyiDockMode("work");
    const url = new URL(window.location.href);
    if (productMode === "tianyi") {
      url.searchParams.set("mode", "conversation");
      url.searchParams.set("dock", "work");
      window.history.replaceState({ ...(window.history.state ?? {}), workspace: "tianyi", tianyiDock: "work" }, "", `${url.pathname}${url.search}${url.hash}`);
    }
    workspaceDockCoordinator.openQuickTianyi();
    setTianyiQuickPlacement("pinned");
  }

  function openFullTianyi(sourceMode?: TianyiSourceMode, collaborationMode?: TianyiCollaborationMode): void {
    captureTianyiReturnSnapshot(true);
    const nextMode = collaborationMode
      ?? (sharedDockSlot.kind === "quick-tianyi" ? tianyiWorkspaceModeFromDockMode(tianyiDockMode) : "conversation");
    const nextSourceMode = isTianyiSourceMode(sourceMode)
      ? sourceMode
      : productMode === "nuwa" && writing?.activeDocument?.type === "scene"
        ? "writing"
        : tianyiSourceForMode(productMode);
    setTianyiWorkspaceMode(nextMode);
    setTianyiDockMode(tianyiDockModeFromWorkspaceMode(nextMode));
    setTianyiSourceMode(nextSourceMode);
    workspaceDockCoordinator.closeQuickTianyi();
    setTianyiQuickPlacement("closed");
    setTianyiSurface("companion");
    restoreProductWorkspace("tianyi");
  }

  function openQuickTianyi(): void {
    if (!tianyiPointerSnapshotCapturedRef.current) captureTianyiReturnSnapshot();
    tianyiPointerSnapshotCapturedRef.current = false;
    setTianyiDockMode(tianyiWorkspaceMode === "conversation" && tianyiDockMode === "work" ? "work" : "dialogue");
    workspaceDockCoordinator.openQuickTianyi();
    setTianyiQuickPlacement((current) => current === "pinned" ? current : "floating");
  }

  function activateGlobalTianyi(): void {
    if (sharedDockSlot.kind === "quick-tianyi") {
      closeQuickTianyi();
      return;
    }
    captureTianyiReturnSnapshot();
    tianyiPointerSnapshotCapturedRef.current = false;
    setTianyiDockMode(tianyiDockMode === "work" ? "work" : "dialogue");
    workspaceDockCoordinator.openQuickTianyi();
    setTianyiQuickPlacement("pinned");
  }

  function captureQuickTianyiPointerOrigin(): void {
    captureTianyiReturnSnapshot();
    tianyiPointerSnapshotCapturedRef.current = true;
  }

  function closeQuickTianyi(): void {
    workspaceDockCoordinator.closeQuickTianyi();
  }

  /** Presentation-only continuity. The current Project remains the sole
   * authority for Unit, Run, Candidate Review, and every promotion action. */
  function selectNuwaStage(stage: NuwaWorkspaceStage): void {
    setNuwaStage(stage);
    if (!library) return;
    if (stage === "director" || stage === "longform") {
      const requestedRunId = resolveNuwaRouteRequest(window.location.search).runId;
      const runId = requestedRunId || storyExploration?.rehearsal?.runId;
      if (runId) {
        const request = ++nuwaDirectorRequestRef.current;
        void getNuwaDirectorStateR1(library.project.id, runId)
          .then((state) => {
            if (request !== nuwaDirectorRequestRef.current) return;
            setNuwaDirectorState(state);
            setNuwaDirectorError("");
          })
          .catch((cause) => {
            if (request === nuwaDirectorRequestRef.current) setNuwaDirectorError(messageOf(cause));
          });
      }
    }
    rememberNuwaStage(library.project.id, stage);
    const url = new URL(window.location.href);
    url.searchParams.set("stage", stage);
    window.history.replaceState({ workspace: "nuwa", stage }, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function chooseProductMode(mode: ProductWorkspaceMode): Promise<void> {
    setProjectCenterOpen(false);
    if (mode === "tianyi" && productMode !== "tianyi") {
      captureTianyiReturnSnapshot(true);
      setTianyiSourceMode(tianyiSourceForMode(productMode));
    }
    if (mode === "event-line" && productMode === "writing") captureTianyiReturnSnapshot();
    if (mode === "nuwa" && productMode !== "nuwa") {
      captureTianyiReturnSnapshot(true);
      setNuwaSourceLabel(productModeLabel(productMode === "tianyi" ? tianyiReturnSnapshotRef.current?.destination || "tianyi" : productMode));
    }
    navigateProductWorkspace(mode);
    if (mode === "library") {
      setLibraryHome(true);
      setLibrarySearchOriginHome(false);
      setLibraryTab("classified");
      setLibraryDirectory("all");
      setSearchQuery("");
      setTypeFilter(null);
      writeLibraryRouteState({ home: true }, "replace");
    }
    closeMobileDrawer();
    if (mode === "tianyi") setTianyiSurface("companion");
    if (mode === "nuwa") {
      setTianyiSurface("companion");
      await hydrateNuwaWorkspace();
      return;
    }
    if (mode === "world") {
      setShowWorldHome(true);
      setTianyiSourceMode("world");
    }
    if (mode === "library") {
      setShowWorldHome(false);
      setTianyiSourceMode("library");
    }
    if (mode === "writing") {
      setTianyiSourceMode("writing");
      setActiveOutputArtifactId(null);
      setCreationView("center");
      setCreationRouteMode("hub");
      updateCreationLocation({ artifactId: null, view: null, routeMode: "hub" });
    }
    if (!library) return;
    if (mode === "writing") {
      try {
        setWriting(await getWritingBootstrap(library.project.id));
        setWritingSaveState("saved");
        setWritingConflict(null);
      } catch (cause) {
        setError(messageOf(cause));
      }
      return;
    }
    if ((mode === "world" || mode === "library") && token) {
      await setStoryStudioSurface(library.project.id, workspaceMode === "library" ? "world-library" : "visual-workbench", token);
    }
  }

  function openProjectCenter(): void {
    const url = new URL(window.location.href);
    setProjectCenterReturnLocation(`${url.pathname}${url.search}${url.hash}`);
    url.pathname = "/projects";
    url.search = "";
    window.history.pushState({ workspace: "projects" }, "", `${url.pathname}${url.search}`);
    setProjectCenterOpen(true);
  }

  function returnFromProjectCenter(): void {
    setProjectCenterOpen(false);
    if (projectCenterReturnLocation) {
      window.history.pushState({ workspace: productMode }, "", projectCenterReturnLocation);
      setProductMode(currentWorkspaceLocation().id);
      return;
    }
    restoreProductWorkspace(productMode);
  }

  function handoffTianyiV2ToNuwa(brief: TianyiNuwaExecutionBrief, exploration: StoryExploration): void {
    rememberExecutionBrief(brief, null, exploration);
    const attentionQuestion = brief.attentionContext?.authorQuestion || brief.sourceQuestion || brief.authorGoal;
    if (attentionQuestion.trim()) setNuwaGoal(attentionQuestion.trim());
    setNuwaEventReference(null);
    void openNuwaWorkspace(brief, exploration, "tianyi");
  }

  async function loadIntelligenceWorkspace(): Promise<void> {
    if (!library) return;
    setImpactBusy(true);
    try {
      const [review, changeSet, exploration, overlay, history, bridgeResume] = await Promise.all([
        getImpactReview(library.project.id),
        getAuthorChangeSet(library.project.id),
        getStoryExploration(library.project.id),
        getIntelligenceOverlay(library.project.id),
        getReviewHistory(library.project.id),
        runWithConnection((connectedToken) => readLatestExecutionBridge(library.project.id, connectedToken))
      ]);
      setImpactReview(review);
      setAuthorChangeSet(changeSet && (!review || changeSet.reviewId === review.id) ? changeSet : null);
      // A direct /nuwa reload must restore the existing Brief-bound unit rather
      // than silently falling back to the unrelated latest exploration.
      setExecutionBrief(bridgeResume.brief);
      setNuwaResultReceipt(bridgeResume.resultReceipt);
      setStoryExploration(bridgeResume.exploration || exploration);
      setBridgeExplorationId(bridgeResume.exploration?.id || null);
      const attentionQuestion = bridgeResume.brief?.attentionContext?.authorQuestion || bridgeResume.brief?.sourceQuestion || bridgeResume.brief?.authorGoal;
      if (attentionQuestion?.trim()) setNuwaGoal(attentionQuestion.trim());
      setIntelligenceOverlay(overlay);
      setReviewHistory(history);
      setImpactError("");
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function hydrateNuwaWorkspace(): Promise<void> {
    if (!library) return;
    const existing = nuwaHydrationRef.current;
    if (existing?.projectId === library.project.id) return existing.promise;
    const promise = Promise.all([
      loadIntelligenceWorkspace(),
      refreshCandidateReviewHistory()
    ]).then(() => undefined);
    nuwaHydrationRef.current = { projectId: library.project.id, promise };
    try {
      await promise;
    } finally {
      if (nuwaHydrationRef.current?.promise === promise) nuwaHydrationRef.current = null;
    }
  }

  async function reopenImpactReview(reviewId: string, changeSetId: string | null): Promise<void> {
    if (!library) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      const history = await getReviewHistory(library.project.id);
      const resolvedChangeSetId = changeSetId || history.entries.find((entry) => entry.reviewId === reviewId)?.changeSetId || null;
      const [review, changeSet] = await Promise.all([
        getImpactReview(library.project.id, reviewId),
        resolvedChangeSetId ? getAuthorChangeSet(library.project.id, resolvedChangeSetId) : Promise.resolve(null)
      ]);
      if (!review) throw new Error("这条评审记录已不可用。");
      setImpactReview(review);
      setAuthorChangeSet(changeSet && changeSet.reviewId === review.id ? changeSet : null);
      setReviewHistory(history);
      setIntelligenceDocument("impact-review");
      setTianyiSurface("intelligence");
      restoreProductWorkspace("nuwa");
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  function openWritingDialog(type: "chapter" | "scene", chapterId: string | null = null) {
    setWritingDocumentType(type);
    setWritingDocumentChapterId(chapterId);
    setWritingDocumentTitle("");
    setWritingDocumentError("");
    setWritingDocumentOpen(true);
  }

  async function startInitialWriting(): Promise<void> {
    if (!library || writingStartBusy || (writing?.chapters.length ?? 0) > 0) return;
    setWritingStartBusy(true);
    setWritingStartError("");
    try {
      const { scene, writing: next } = await runWithConnection((connectedToken) => createInitialWritingPair({
        projectId: library.project.id,
        token: connectedToken,
        startWriting
      }));
      setWriting({ ...next, activeDocument: scene });
      setWritingSaveState("saved");
      setWritingConflict(null);
      setWritingScrollTop(0);
      setWritingEditorFocusRequest((current) => current + 1);
    } catch (cause) {
      setWritingStartError(messageOf(cause));
      try {
        setWriting(await getWritingBootstrap(library.project.id));
      } catch {
        // Keep the original author-facing creation error if refresh also fails.
      }
    } finally {
      setWritingStartBusy(false);
    }
  }

  function focusFullTianyiDialogue(): void {
    setTianyiQuickPlacement("closed");
    setTianyiSurface("companion");
    restoreProductWorkspace("tianyi");
  }

  async function submitWritingDocument(): Promise<void> {
    if (!library || !writingDocumentTitle.trim()) return;
    setWritingDocumentBusy(true);
    setWritingDocumentError("");
    try {
      const created = await runWithConnection((connectedToken) => createWritingDocument({
        projectId: library.project.id,
        type: writingDocumentType,
        title: writingDocumentTitle.trim(),
        ...(writingDocumentType === "scene" && writingDocumentChapterId ? { chapterId: writingDocumentChapterId } : {}),
        token: connectedToken
      }));
      const next = await getWritingBootstrap(library.project.id);
      setWriting({ ...next, activeDocument: created });
      navigateProductWorkspace("writing");
      setTianyiSourceMode("writing");
      setWritingSaveState("saved");
      setWritingConflict(null);
      setWritingDocumentOpen(false);
      setWritingDocumentTitle("");
    } catch (cause) {
      setWritingDocumentError(messageOf(cause));
    } finally {
      setWritingDocumentBusy(false);
    }
  }

  async function chooseWritingDocument(document: WritingDocumentSummary): Promise<void> {
    if (!library) return;
    try {
      const opened = await runWithConnection((connectedToken) => openWritingDocument(library.project.id, document.id, connectedToken));
      setWriting((current) => current ? { ...current, activeDocument: opened } : current);
      setWritingSaveState("saved");
      setWritingConflict(null);
      navigateProductWorkspace("writing");
      setTianyiSourceMode("writing");
      closeMobileDrawer();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function changeWritingDocument(update: Partial<Pick<WritingDocument, "body" | "status">>) {
    setWriting((current) => current?.activeDocument ? { ...current, activeDocument: { ...current.activeDocument, ...update } } : current);
    setWritingSaveState((current) => current === "conflict" ? current : "unsaved");
  }

  async function saveWritingDocument(): Promise<void> {
    if (!library || !writing?.activeDocument) return;
    setWritingSaveState("saving");
    try {
      const active = writing.activeDocument;
      const result = await runWithConnection((connectedToken) => updateWritingDocument({
        projectId: library.project.id,
        documentId: active.id,
        expectedHash: active.revisionToken,
        status: active.status,
        body: active.body,
        token: connectedToken
      }));
      if (result.conflict) {
        setWritingConflict(result.document);
        setWritingSaveState("conflict");
        return;
      }
      const next = await getWritingBootstrap(library.project.id);
      setWriting({ ...next, activeDocument: result.document });
      setWritingConflict(null);
      setWritingSaveState("saved");
    } catch (cause) {
      setWritingSaveState("unsaved");
      setError(messageOf(cause));
    }
  }

  function reloadWritingConflict() {
    if (!writingConflict) return;
    setWriting((current) => current ? { ...current, activeDocument: writingConflict } : current);
    setWritingConflict(null);
    setWritingSaveState("saved");
  }

  async function selectWritingObject(object: WorldObjectSummary): Promise<void> {
    await rememberSelection({ objectId: object.id, source: "writing-mention", documentId: null });
  }

  function openIntelligence(document: IntelligenceDocument) {
    setIntelligenceDocument(document);
    restoreProductWorkspace("nuwa");
    setTianyiSurface("intelligence");
    setImpactError("");
  }

  function returnFromImpactReview(): void {
    setTianyiSurface("companion");
    restoreProductWorkspace("nuwa");
    setImpactError("");
  }

  async function openNuwaWorkspace(brief?: TianyiNuwaExecutionBrief, exploration?: StoryExploration, returnSurface?: "tianyi"): Promise<void> {
    if (productMode !== "tianyi" && productMode !== "nuwa") captureTianyiReturnSnapshot(true);
    setNuwaSourceLabel(productMode === "nuwa" ? nuwaSourceLabel : productModeLabel(tianyiReturnSnapshotRef.current?.destination || productMode));
    restoreProductWorkspace("nuwa", returnSurface);
    setTianyiSurface("companion");
    setTianyiQuickPlacement("pinned");
    await hydrateNuwaWorkspace();
    if (brief) setExecutionBrief(brief);
    if (exploration) {
      setStoryExploration(exploration);
      setBridgeExplorationId(exploration.id);
    }
    setIntelligenceDocument("supervisor");
  }

  async function refreshCandidateReviewHistory(): Promise<void> {
    if (!library) return;
    try {
      setCandidateReviewHistory(await listGoldenLoopCandidateReviews(library.project.id));
    } catch (cause) {
      setGoldenLoopError(messageOf(cause));
    }
  }

  function openCandidateReviewHistory(entry: GoldenLoopCandidateReviewHistoryEntry): void {
    setGoldenLoopResult({ ...entry.result, review: { id: entry.id, status: entry.status } });
    setRejectedGoldenLoopCandidateIds(entry.candidates.filter((candidate) => candidate.status === "rejected").map((candidate) => candidate.id));
    setAcceptedGoldenLoopCandidateIds(entry.candidates.filter((candidate) => candidate.status === "accepted").map((candidate) => candidate.id));
    setGoldenLoopError("");
  }

  function startNewNuwaDraft(source: "approved-brief" | "direct"): void {
    setGoldenLoopResult(null);
    setRejectedGoldenLoopCandidateIds([]);
    setAcceptedGoldenLoopCandidateIds([]);
    setGoldenLoopError("");
    setNuwaEventReference(null);
    if (source === "direct") {
      setExecutionBrief(null);
      setNuwaResultReceipt(null);
      setStoryExploration(null);
      setBridgeExplorationId(null);
      setNuwaSourceLabel("当前项目");
    }
  }

  async function abandonCurrentCandidateReview(): Promise<void> {
    if (!library || !goldenLoopResult?.review) return;
    setGoldenLoopBusy(true);
    setGoldenLoopError("");
    try {
      const review = await runWithConnection((connectedToken) => abandonGoldenLoopCandidateReview({
        projectId: library.project.id,
        reviewId: goldenLoopResult.review!.id,
        token: connectedToken
      }));
      setGoldenLoopResult({ ...review.result, review: { id: review.id, status: review.status } });
      await refreshCandidateReviewHistory();
    } catch (cause) {
      setGoldenLoopError(messageOf(cause));
    } finally {
      setGoldenLoopBusy(false);
    }
  }

  function rememberExecutionBrief(brief: TianyiNuwaExecutionBrief, receipt: NuwaResultReceipt | null = null, exploration: StoryExploration | null = null): void {
    const sameBriefRevision = executionBrief?.briefId === brief.briefId && executionBrief.revision === brief.revision;
    setExecutionBrief(brief);
    setNuwaResultReceipt(receipt);
    if (exploration) {
      setStoryExploration(exploration);
      setBridgeExplorationId(exploration.id);
    } else if (!sameBriefRevision) {
      setStoryExploration(null);
      setBridgeExplorationId(null);
    }
    const key = nuwaReturnStorageKey(brief.sourceProject.projectId, brief.returnDestination.selectionRef);
    const shellSnapshot = tianyiReturnSnapshotRef.current;
    if (exploration || !shellSnapshot || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, JSON.stringify({
      version: "story-studio-nuwa-return-snapshot/v1",
      shellSnapshot
    }));
  }

  async function returnFromNuwaReceipt(receipt: NuwaResultReceipt): Promise<void> {
    if (!library) return;
    if (currentTianyiReturnSurface() === "tianyi") {
      restoreProductWorkspace("tianyi");
      setTianyiSurface("companion");
      setImpactError("");
      return;
    }
    if (tianyiReturnSnapshotRef.current) {
      await returnFromTianyi();
      return;
    }
    const source = sessionStorage.getItem(nuwaReturnStorageKey(library.project.id, receipt.returnDestination.selectionRef));
    if (!source) {
      setImpactError("原创作位置的浏览器恢复快照不可用；结果回执仍保留精确的工作区、文档与选区引用。");
      return;
    }
    try {
      const snapshot = JSON.parse(source) as {
        version: string;
        shellSnapshot: ProductShellLocationSnapshot;
      };
      if (snapshot.version !== "story-studio-nuwa-return-snapshot/v1" || !snapshot.shellSnapshot) throw new Error("invalid snapshot");
      tianyiReturnSnapshotRef.current = snapshot.shellSnapshot;
      await returnFromTianyi();
    } catch {
      setImpactError("原创作位置恢复快照无法读取；未改变当前工作区。");
    }
  }

  async function chooseIntelligenceDocument(document: IntelligenceDocument): Promise<void> {
    setIntelligenceDocument(document);
    if (document !== "review-history" || !library) return;
    try {
      setReviewHistory(await getReviewHistory(library.project.id));
    } catch (cause) {
      setImpactError(messageOf(cause));
    }
  }

  async function submitImpactReview(authorGoal: string): Promise<void> {
    if (!library || !writing?.activeDocument || writing.activeDocument.type !== "scene") {
      setImpactError("请先在写作中选择一个场景。");
      return;
    }
    setImpactBusy(true);
    setImpactError("");
    try {
      const review = await runWithConnection((connectedToken) => createImpactReview({
        projectId: library.project.id,
        sceneId: writing.activeDocument!.id,
        authorGoal,
        selectedObjectIds: selection.objectId ? [selection.objectId] : [],
        token: connectedToken
      }));
      setImpactReview(review);
      setAuthorChangeSet(null);
      setReviewHistory(await getReviewHistory(library.project.id));
      restoreProductWorkspace("nuwa");
      setTianyiSurface("intelligence");
      setIntelligenceDocument("impact-review");
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function openPlanningEventImpactReview(planningEventId: string): Promise<ImpactReview | null> {
    if (!library) return null;
    setImpactBusy(true);
    setImpactError("");
    try {
      const review = await runWithConnection((connectedToken) => createPlanningEventImpactReview(
        library.project.id,
        planningEventId,
        connectedToken
      ));
      setImpactReview(review);
      setAuthorChangeSet(null);
      setReviewHistory(await getReviewHistory(library.project.id));
      restoreProductWorkspace("nuwa");
      setTianyiSurface("intelligence");
      setIntelligenceDocument("impact-review");
      return review;
    } catch (cause) {
      setImpactError(messageOf(cause));
      throw cause;
    } finally {
      setImpactBusy(false);
    }
  }

  function eventAuthoringBody(draft: EventAuthoringDraft): string {
    const details = [
      draft.participants.trim() ? `参与人物：${draft.participants.trim()}` : "",
      draft.place.trim() ? `地点：${draft.place.trim()}` : "",
      draft.timing.trim() ? `时间或相对顺序：${draft.timing.trim()}` : ""
    ].filter(Boolean);
    return [draft.narrative.trim(), details.length ? "" : "", ...details].filter((line, index) => line !== "" || index === 1).join("\n").trim();
  }

  function eventAuthoringTitle(draft: EventAuthoringDraft): string {
    const explicit = draft.title.trim();
    if (explicit) return explicit;
    const firstLine = draft.narrative.split(/[。！？\n]/u).map((item) => item.trim()).find(Boolean) || "新的故事事件";
    return firstLine.slice(0, 80);
  }

  function closeEventAuthoring(): void {
    if (eventAuthoringBusy) return;
    setEventAuthoringOpen(false);
    setEventAuthoringConfirmation(null);
    setEventAuthoringError("");
  }

  async function refreshEventAuthoringRead(): Promise<void> {
    if (!library) return;
    const [nextLibrary, nextWorkbench] = await Promise.all([
      getWorldLibrary(library.project.id),
      getVisualWorkbench(library.project.id)
    ]);
    setLibrary(nextLibrary);
    setVisibleObjects(nextLibrary.objects);
    setVisualWorkbench(nextWorkbench);
    await refreshEventLineRead(library.project.id);
  }

  async function saveEventAsPossibility(draft: EventAuthoringDraft): Promise<void> {
    if (!library) return;
    setEventAuthoringBusy(true);
    setEventAuthoringError("");
    try {
      await runWithConnection((connectedToken) => createPlanningEvent({
        projectId: library.project.id,
        title: eventAuthoringTitle(draft),
        body: eventAuthoringBody(draft),
        tags: ["作者规划", "故事可能"],
        token: connectedToken
      }));
      await refreshEventAuthoringRead();
      setEventAuthoringOpen(false);
    } catch (cause) {
      setEventAuthoringError(messageOf(cause));
    } finally {
      setEventAuthoringBusy(false);
    }
  }

  async function prepareEventConfirmation(draft: EventAuthoringDraft): Promise<void> {
    if (!library) return;
    setEventAuthoringBusy(true);
    setEventAuthoringError("");
    try {
      const changeSet = await runWithConnection(async (connectedToken) => {
        const planning = await createPlanningEvent({
          projectId: library.project.id,
          title: eventAuthoringTitle(draft),
          body: eventAuthoringBody(draft),
          tags: ["作者规划"],
          token: connectedToken
        });
        const review = await createPlanningEventImpactReview(library.project.id, planning.id, connectedToken);
        const selected = await chooseImpactRoute({
          projectId: library.project.id,
          reviewId: review.id,
          optionId: review.options[0]?.id || "",
          action: "adopt",
          token: connectedToken
        });
        if (!selected.canCreateChangeSet) throw new Error("事件影响尚未形成可确认的变更摘要。");
        const pending = await createAuthorChangeSet(library.project.id, selected.id, connectedToken);
        return dryRunAuthorChangeSet(library.project.id, pending.id, connectedToken);
      });
      setEventAuthoringConfirmation(changeSet);
    } catch (cause) {
      setEventAuthoringError(messageOf(cause));
    } finally {
      setEventAuthoringBusy(false);
    }
  }

  async function confirmEventAuthoring(): Promise<void> {
    if (!library || !eventAuthoringConfirmation) return;
    setEventAuthoringBusy(true);
    setEventAuthoringError("");
    try {
      const applied = await runWithConnection((connectedToken) => applyAuthorChangeSet(library.project.id, eventAuthoringConfirmation.id, connectedToken));
      if (!applied.application.appliedEventId) throw new Error("事件没有返回确认回执，未显示为已确认事件。");
      await refreshEventAuthoringRead();
      setAuthorChangeSet(applied);
      setEventAuthoringConfirmation(null);
      setEventAuthoringOpen(false);
    } catch (cause) {
      setEventAuthoringError(messageOf(cause));
    } finally {
      setEventAuthoringBusy(false);
    }
  }

  async function submitImpactChoice(optionId: string, action: "adopt" | "adjust" | "preserve", authorContent?: string): Promise<void> {
    if (!library || !impactReview) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      const review = await runWithConnection((connectedToken) => chooseImpactRoute({
        projectId: library.project.id,
        reviewId: impactReview.id,
        optionId,
        action,
        ...(authorContent ? { authorContent } : {}),
        token: connectedToken
      }));
      setImpactReview(review);
      setAuthorChangeSet(null);
      setReviewHistory(await getReviewHistory(library.project.id));
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function createPendingChangeSet(): Promise<void> {
    if (!library || !impactReview) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      setAuthorChangeSet(await runWithConnection((connectedToken) => createAuthorChangeSet(library.project.id, impactReview.id, connectedToken)));
      setReviewHistory(await getReviewHistory(library.project.id));
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function runChangeSetAction(action: "dry-run" | "apply" | "abandon"): Promise<void> {
    if (!library || !authorChangeSet) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      const nextChangeSet = await runWithConnection((connectedToken) => {
        if (action === "apply") return applyAuthorChangeSet(library.project.id, authorChangeSet.id, connectedToken);
        if (action === "abandon") return abandonAuthorChangeSet(library.project.id, authorChangeSet.id, connectedToken);
        return dryRunAuthorChangeSet(library.project.id, authorChangeSet.id, connectedToken);
      });
      if (action === "apply") {
        if (!nextChangeSet.application.appliedEventId) throw new Error("作者变更单未返回精确事件回执，不能宣称已确认。");
        const [nextLibrary, verifiedEvent] = await Promise.all([
          getWorldLibrary(library.project.id),
          getVerifiedCanonEvent(library.project.id, nextChangeSet.application.appliedEventId)
        ]);
        if (verifiedEvent.status !== "ready" || verifiedEvent.event.id !== nextChangeSet.application.appliedEventId) {
          throw new Error("M0 Canon 读取未能确认精确事件回执；事件线不会伪造成功状态。");
        }
        setLibrary(nextLibrary);
        setVisibleObjects(nextLibrary.objects);
        setVisualWorkbench(await getVisualWorkbench(library.project.id));
        await refreshEventLineRead(library.project.id);
      }
      setAuthorChangeSet(nextChangeSet);
      setReviewHistory(await getReviewHistory(library.project.id));
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function createExploration(authorGoal: string): Promise<void> {
    if (!writing?.activeDocument || writing.activeDocument.type !== "scene") {
      setImpactError("请先在写作中选择一个场景。");
      return;
    }
    restoreProductWorkspace("tianyi");
    setTianyiSurface("companion");
    setImpactError(`请先在天意中为“${authorGoal.trim() || writing.activeDocument.title}”准备并批准执行简报；未绑定简报的旧推演不能进入影响评审。`);
  }

  async function startStandaloneNuwa(input: { story: string; authorGoal: string; characterNames: string[]; depth: "short" | "medium" | "long" }): Promise<void> {
    if (!library) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      const exploration = await runWithConnection((connectedToken) => createStandaloneStoryExploration({
        projectId: library.project.id,
        story: input.story,
        authorGoal: input.authorGoal,
        characterNames: input.characterNames,
        depth: input.depth,
        token: connectedToken
      }));
      setStoryExploration(exploration);
      setBridgeExplorationId(null);
      setNuwaResultReceipt(null);
      setNuwaStage("rehearsal");
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function runExplorationAction(action: "run" | "synthesize" | "cancel"): Promise<void> {
    if (!library || !storyExploration) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      if (storyExploration.source.kind === "standalone" && action !== "cancel") {
        const next = action === "run"
          ? await runWithConnection((connectedToken) => runStoryExploration(library.project.id, storyExploration.id, connectedToken))
          : await runWithConnection((connectedToken) => synthesizeStoryExploration(library.project.id, storyExploration.id, connectedToken));
        setStoryExploration(next);
        return;
      }
      if (executionBrief && bridgeExplorationId === storyExploration.id && action !== "cancel") {
        if (action === "run") {
          setStoryExploration(await runWithConnection((connectedToken) => runExecutionBrief(library.project.id, executionBrief.briefId, executionBrief.revision, storyExploration.id, connectedToken)));
        } else {
          const result = await runWithConnection((connectedToken) => synthesizeExecutionBrief(library.project.id, executionBrief.briefId, executionBrief.revision, storyExploration.id, connectedToken));
          setStoryExploration(result.exploration);
          setNuwaResultReceipt(result.resultReceipt);
        }
      } else {
        if (action !== "cancel") throw new Error("未绑定执行简报的旧推演不能继续执行；请从当前写作场景重新准备执行简报。");
        setStoryExploration(await runWithConnection((connectedToken) => cancelStoryExploration(library.project.id, storyExploration.id, connectedToken)));
      }
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function runNuwaSceneRuntimeAction(action: "start" | "step" | "play" | "pause" | "stop" | "checkpoint" | "intervene" | "fork" | "compare" | "replay" | "candidate", input: { checkpointId?: string; instruction?: string; modifiedSoftGoal?: string; injectSecretTo?: string[] } = {}): Promise<void> {
    if (!library || !storyExploration?.rehearsal?.runId) return;
    setNuwaSceneBusy(true);
    setNuwaSceneError("");
    try {
      const projectId = library.project.id;
      const runId = nuwaSceneRuntime?.runId || storyExploration.rehearsal.runId;
      const next = await runWithConnection(async (connectedToken) => {
        if (action === "start") return createNuwaSceneSimulation(projectId, storyExploration.id, runId, connectedToken);
        if (action === "step") return stepNuwaSceneSimulation(projectId, runId, connectedToken);
        if (action === "play") return playNuwaSceneSimulation(projectId, runId, connectedToken);
        if (action === "pause") return pauseNuwaSceneSimulation(projectId, runId, connectedToken);
        if (action === "stop") return stopNuwaSceneSimulation(projectId, runId, connectedToken);
        if (action === "checkpoint") return checkpointNuwaSceneSimulation(projectId, runId, connectedToken, input.checkpointId);
        if (action === "intervene") return interveneNuwaSceneSimulation({ projectId, runId, checkpointId: input.checkpointId || "", instruction: input.instruction || "作者要求保持当前秘密边界。", ...(input.modifiedSoftGoal ? { modifiedSoftGoal: input.modifiedSoftGoal } : {}), ...(input.injectSecretTo ? { injectSecretTo: input.injectSecretTo } : {}), token: connectedToken });
        if (action === "fork") {
          const forked = await forkNuwaSceneSimulation(projectId, runId, input.checkpointId || "", connectedToken);
          return forked.child;
        }
        if (action === "compare") {
          if (!nuwaSceneRuntime?.parentRunId) throw new Error("当前 Run 没有可比较的父 Run。");
          setNuwaSceneComparison(await compareNuwaSceneSimulation(projectId, nuwaSceneRuntime.parentRunId, runId));
          return nuwaSceneRuntime;
        }
        if (action === "replay") {
          setNuwaSceneReplay(await replayNuwaSceneSimulation(projectId, runId));
          return nuwaSceneRuntime;
        }
        if (action === "candidate") {
          const result = await buildNuwaSceneCandidate(projectId, runId, connectedToken);
          setNuwaRecoveryNotice(`候选已进入现有 Candidate Review：${result.review.id}。仍需影响评审与作者确认。`);
          setCandidateReviewHistory(await listGoldenLoopCandidateReviews(projectId));
          return nuwaSceneRuntime;
        }
        return nuwaSceneRuntime;
      });
      if (next) setNuwaSceneRuntime(next);
      if (action === "start" || action === "fork") setNuwaStage("simulation");
    } catch (cause) {
      setNuwaSceneError(messageOf(cause));
    } finally {
      setNuwaSceneBusy(false);
    }
  }

  async function selectNuwaSceneRuntimeRun(runId: string): Promise<void> {
    if (!library) return;
    setNuwaSceneBusy(true);
    setNuwaSceneError("");
    try {
      const runtime = await getNuwaSceneSimulation(library.project.id, runId);
      if (!runtime) throw new Error("该场景 Run 已不存在或不属于当前作品。");
      setNuwaSceneRuntime(runtime);
      setNuwaSceneComparison(null);
      setNuwaSceneReplay(null);
      setNuwaStage("simulation");
      setNuwaRouteParameter("run", runId);
    } catch (cause) {
      setNuwaSceneError(messageOf(cause));
    } finally {
      setNuwaSceneBusy(false);
    }
  }

  async function runNuwaDirectorAction(action: NuwaDirectorActionR1): Promise<void> {
    if (!library) return;
    const runId = resolveNuwaRouteRequest(window.location.search).runId || nuwaSceneRuntime?.runId || storyExploration?.rehearsal?.runId;
    if (!runId) return;
    const request = ++nuwaDirectorRequestRef.current;
    setNuwaDirectorBusy(true);
    setNuwaDirectorError("");
    try {
      const state = await runWithConnection((connectedToken) => updateNuwaDirectorStateR1(library.project.id, runId, action, connectedToken));
      if (request === nuwaDirectorRequestRef.current) setNuwaDirectorState(state);
    } catch (cause) {
      if (request === nuwaDirectorRequestRef.current) setNuwaDirectorError(messageOf(cause));
    } finally {
      setNuwaDirectorBusy(false);
    }
  }

  async function submitExplorationRoute(routeId: string): Promise<void> {
    if (!library || !storyExploration) return;
    if (!executionBrief || bridgeExplorationId !== storyExploration.id || !nuwaResultReceipt) {
      setImpactError("只有当前执行简报绑定的结果回执可以进入影响评审。");
      return;
    }
    if (!nuwaResultReceipt.impactReviewEligible) {
      setImpactError("当前结果回执已失效、部分完成或不可用，不能进入影响评审。");
      return;
    }
    setImpactBusy(true);
    setImpactError("");
    try {
      const result = await runWithConnection((connectedToken) => submitExecutionBriefRouteToImpact({
        projectId: library.project.id,
        briefId: executionBrief.briefId,
        revision: executionBrief.revision,
        explorationId: storyExploration.id,
        resultReceiptId: nuwaResultReceipt.resultReceiptId,
        routeId,
        token: connectedToken
      }));
      setStoryExploration(result.exploration);
      setImpactReview(result.review);
      setAuthorChangeSet(null);
      setIntelligenceOverlay(result.overlay);
      setIntelligenceDocument("impact-review");
      setTianyiSurface("intelligence");
      setReviewHistory(await getReviewHistory(library.project.id));
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function rejectExplorationRoute(routeId: string): Promise<void> {
    if (!library || !storyExploration) return;
    setImpactBusy(true);
    setImpactError("");
    try {
      const next = await runWithConnection((connectedToken) => rejectStoryExplorationRoute(
        library.project.id,
        storyExploration.id,
        routeId,
        "作者在候选比较阶段淘汰此未来；未写入 Canon、Event、WorldState 或正文。",
        connectedToken
      ));
      setStoryExploration(next);
    } catch (cause) {
      setImpactError(messageOf(cause));
    } finally {
      setImpactBusy(false);
    }
  }

  async function chooseVisualDocument(document: VisualDocument, pane: "primary" | "secondary"): Promise<void> {
    if (!library || !visualWorkbench) return;
    if (pane === "primary") setWorkspaceMode(document.type);
    if (pane === "primary") setShowWorldHome(false);
    setVisualWorkbench({
      ...visualWorkbench,
      ...(pane === "primary" ? { primaryDocument: document } : { secondaryDocument: document }),
      tabs: [document.relativePath, ...visualWorkbench.tabs.filter((item) => item !== document.relativePath)].slice(0, 8)
    });
    if (token) await openVisualDocument({ projectId: library.project.id, relativePath: document.relativePath, pane, token });
  }

  async function openWorldTab(tab: WorldDocumentTab): Promise<void> {
    if (!library || !visualWorkbench) return;
    if (tab.kind === "object") {
      const object = library.objects.find((item) => item.id === tab.id);
      if (object) await openObject(object, "card");
      return;
    }
    const document = visualWorkbench.documents.find((item) => item.id === tab.id);
    if (document) {
      restoreProductWorkspace("library");
      setTianyiSourceMode("library");
      setWorkspaceMode(document.type);
      await chooseVisualDocument(document, "primary");
    }
  }

  async function closeWorldTab(tab: WorldDocumentTab): Promise<void> {
    if (!library) return;
    if (tab.kind === "object" && activeObject?.id === tab.id && saveState !== "saved") {
      setError("请先保存当前卡片，再关闭文档。");
      return;
    }
    await runWithConnection(async (connectedToken) => {
      if (tab.kind === "object") {
        const next = await closeWorldObject(library.project.id, tab.id, connectedToken);
        setLibrary(next);
        setVisibleObjects(next.objects);
        const nextTabs = next.tabs.flatMap((relativeId) => {
          const match = next.objects.find((item) => item.relativeId === relativeId);
          return match ? [match] : [];
        });
        setTabs(nextTabs);
        if (activeObject?.id === tab.id) {
          if (next.activeObject) applyObject(next.activeObject, nextTabs);
          else { setActiveObject(null); setDraft(null); }
        }
        return;
      }
      if (!tab.relativePath) return;
      const next = await closeVisualDocument(library.project.id, tab.relativePath, connectedToken);
      setVisualWorkbench(next);
      if (!next.primaryDocument && workspaceMode !== "library") setWorkspaceMode("library");
    });
  }

  async function openVisualReference(reference: ObjectVisualReference, context?: { objectId: string; source: WorkspaceSelectionSource; documentId: string; blockId?: string | null; relationId?: string | null }): Promise<void> {
    const document = visualWorkbench?.documents.find((item) => item.relativePath === reference.relativePath);
    if (!document) {
      setError("这份视觉文档已经不在当前项目中。");
      return;
    }
    restoreProductWorkspace("library");
    setTianyiSourceMode("library");
    setWorkspaceMode(document.type);
    await chooseVisualDocument(document, "primary");
    if (context) await rememberSelection(context);
  }

  async function selectVisualObject(object: WorldObjectSummary, source: WorkspaceSelectionSource, documentId: string, blockId: string | null = null): Promise<void> {
    await inspectVisualObject(object, source, documentId, blockId);
  }

  async function selectVisualRelation(source: WorkspaceSelectionSource, documentId: string, relationId: string): Promise<void> {
    await rememberSelection({ source, documentId, relationId });
    setVisualObject(null);
  }

  async function saveVisualDocument(document: VisualDocument): Promise<{ conflict: boolean; document: VisualDocument }> {
    if (!library) throw new Error("请先打开一个世界。");
    const result = await runWithConnection((connectedToken) => updateVisualDocument({
      projectId: library.project.id,
      relativePath: document.relativePath,
      expectedHash: document.contentHash,
      document,
      token: connectedToken
    }));
    if (!result.conflict && visualWorkbench) {
      setVisualWorkbench({
        ...visualWorkbench,
        documents: visualWorkbench.documents.map((item) => item.relativePath === result.document.relativePath ? result.document : item),
        primaryDocument: visualWorkbench.primaryDocument?.relativePath === result.document.relativePath ? result.document : visualWorkbench.primaryDocument,
        secondaryDocument: visualWorkbench.secondaryDocument?.relativePath === result.document.relativePath ? result.document : visualWorkbench.secondaryDocument
      });
    }
    return result;
  }

  async function createTimelinePlanningEvent(document: TimelineDocument, title: string, body: string): Promise<PlanningEventTimelineResult> {
    if (!library) throw new Error("请先打开一个世界。");
    const result = await runWithConnection((connectedToken) => createPlanningEventAndAddToTimeline({
      projectId: library.project.id,
      timelineRelativePath: document.relativePath,
      timelineExpectedHash: document.contentHash,
      title,
      body,
      token: connectedToken
    }));
    await refreshTimelinePlanningState(result.document, result.timelineEntryAdded);
    return result;
  }

  async function abandonTimelinePlanningEvent(planningEventId: string): Promise<{ conflict: boolean }> {
    if (!library) throw new Error("请先打开一个世界。");
    const planning = await readWorldObject(library.project.id, planningEventId);
    const result = await runWithConnection((connectedToken) => abandonPlanningEvent({
      projectId: library.project.id,
      planningEventId,
      expectedHash: planning.revisionToken,
      token: connectedToken
    }));
    if (!result.conflict) {
      const [nextLibrary, nextWorkbench] = await Promise.all([
        getWorldLibrary(library.project.id),
        getVisualWorkbench(library.project.id)
      ]);
      setLibrary(nextLibrary);
      setVisibleObjects(nextLibrary.objects);
      setVisualWorkbench(nextWorkbench);
    }
    return result;
  }

  async function abandonPlanningFromCard(object: WorldObject): Promise<void> {
    if (!library) return;
    setSaveState("saving");
    try {
      const result = await runWithConnection((connectedToken) => abandonPlanningEvent({
        projectId: library.project.id,
        planningEventId: object.id,
        expectedHash: object.revisionToken,
        token: connectedToken
      }));
      if (result.conflict) {
        setConflictObject(result.object);
        setSaveState("conflict");
        return;
      }
      applyObject(result.object);
      const [nextLibrary, nextWorkbench] = await Promise.all([getWorldLibrary(library.project.id), getVisualWorkbench(library.project.id)]);
      setLibrary(nextLibrary);
      setVisibleObjects(nextLibrary.objects);
      setVisualWorkbench(nextWorkbench);
    } catch (cause) {
      setSaveState("unsaved");
      setError(messageOf(cause));
    }
  }

  async function addExistingTimelinePlanningEvent(document: TimelineDocument, planningEventId: string): Promise<AddPlanningEventResult> {
    if (!library) throw new Error("请先打开一个世界。");
    const result = await runWithConnection((connectedToken) => addPlanningEventToTimeline({
      projectId: library.project.id,
      timelineRelativePath: document.relativePath,
      timelineExpectedHash: document.contentHash,
      planningEventId,
      token: connectedToken
    }));
    await refreshTimelinePlanningState(result.document, result.timelineEntryAdded);
    return result;
  }

  async function validateTimelineMutation(document: TimelineDocument): Promise<TimelineValidationResult> {
    if (!library) throw new Error("请先打开一个世界。");
    return runWithConnection((connectedToken) => validateTimelineDocument({
      projectId: library.project.id,
      relativePath: document.relativePath,
      expectedHash: document.contentHash,
      document,
      token: connectedToken
    }));
  }

  async function refreshTimelinePlanningState(document: TimelineDocument, replaceDocument: boolean): Promise<void> {
    if (!library) return;
    const nextLibrary = await getWorldLibrary(library.project.id);
    setLibrary(nextLibrary);
    setVisibleObjects(nextLibrary.objects);
    if (!replaceDocument) return;
    setVisualWorkbench((current) => current ? {
      ...current,
      documents: current.documents.map((item) => item.relativePath === document.relativePath ? document : item),
      primaryDocument: current.primaryDocument?.relativePath === document.relativePath ? document : current.primaryDocument,
      secondaryDocument: current.secondaryDocument?.relativePath === document.relativePath ? document : current.secondaryDocument
    } : current);
  }

  async function importMapAsset(file: File): Promise<VisualAsset> {
    return importAsset(file, "maps");
  }

  async function importImageAsset(file: File): Promise<VisualAsset> {
    return importAsset(file, "images");
  }

  async function importAsset(file: File, category: "maps" | "images"): Promise<VisualAsset> {
    if (!library) throw new Error("请先打开一个世界。");
    const base64 = await fileToBase64(file);
    return runWithConnection((connectedToken) => importVisualAsset({
      projectId: library.project.id,
      category,
      filename: file.name,
      mimeType: file.type,
      base64,
      token: connectedToken
    }));
  }

  async function changeSplitView(enabled: boolean, preferredSecondary?: VisualDocument): Promise<void> {
    if (!library || !visualWorkbench) return;
    let secondaryDocument = preferredSecondary && preferredSecondary.relativePath !== visualWorkbench.primaryDocument?.relativePath
      ? preferredSecondary
      : visualWorkbench.secondaryDocument;
    const next = await runWithConnection(async (connectedToken) => {
      if (enabled) {
        secondaryDocument ||= visualWorkbench.documents.find((document) => document.type !== workspaceMode) || null;
        if (secondaryDocument) await openVisualDocument({ projectId: library.project.id, relativePath: secondaryDocument.relativePath, pane: "secondary", token: connectedToken });
      }
      return setVisualSplitView(library.project.id, enabled, connectedToken);
    });
    setVisualWorkbench({ ...next, primaryDocument: visualWorkbench.primaryDocument || next.primaryDocument, secondaryDocument: secondaryDocument || next.secondaryDocument, splitView: enabled && Boolean(secondaryDocument) });
  }

  async function swapSplitView(): Promise<void> {
    if (!library || !visualWorkbench?.splitView) return;
    const next = await runWithConnection((connectedToken) => swapVisualPanes(library.project.id, connectedToken));
    setVisualWorkbench(next);
    if (next.primaryDocument) setWorkspaceMode(next.primaryDocument.type);
  }

  async function submitWorkspaceFolder(): Promise<void> {
    if (!library || !folderTitle.trim()) return;
    setFolderBusy(true);
    setFolderError("");
    try {
      await runWithConnection((connectedToken) => createWorkspaceFolder({ projectId: library.project.id, title: folderTitle.trim(), token: connectedToken }));
      await loadLibrary(library.project.id);
      setFolderDialogOpen(false);
      setFolderTitle("");
    } catch (cause) {
      setFolderError(messageOf(cause));
    } finally {
      setFolderBusy(false);
    }
  }

  async function createCustomLibraryCategory(title: string): Promise<void> {
    if (!library) return;
    try {
      await runWithConnection((connectedToken) => createWorkspaceFolder({
        projectId: library.project.id,
        title,
        kind: "custom-category",
        token: connectedToken
      }));
      await loadLibrary(library.project.id);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function updateCustomLibraryCategories(folders: WorkspaceFolder[]): Promise<void> {
    if (!library) return;
    try {
      const result = await runWithConnection((connectedToken) => updateWorkspaceFolders({
        projectId: library.project.id,
        expectedContentHash: library.folderRevision,
        folders,
        token: connectedToken
      }));
      if (result.conflict) {
        setError("资料分类已在另一处更新；已保留最新版本，请重新操作。");
      }
      await loadLibrary(library.project.id);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function renameCustomLibraryCategory(id: string, title: string): Promise<void> {
    if (!library) return;
    await updateCustomLibraryCategories(library.folders.map((folder) => folder.id === id ? { ...folder, title } : folder));
  }

  async function moveCustomLibraryCategory(id: string, direction: "up" | "down"): Promise<void> {
    if (!library) return;
    const categories = library.folders.filter((folder) => folder.kind === "custom-category").sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const index = categories.findIndex((folder) => folder.id === id);
    const nextIndex = index + (direction === "up" ? -1 : 1);
    if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex]!, reordered[index]!];
    const nextOrder = new Map(reordered.map((folder, order) => [folder.id, order]));
    await updateCustomLibraryCategories(library.folders.map((folder) => folder.kind === "custom-category" ? { ...folder, order: nextOrder.get(folder.id)! } : folder));
  }

  async function deleteCustomLibraryCategory(id: string): Promise<void> {
    if (!library) return;
    await updateCustomLibraryCategories(library.folders.filter((folder) => folder.id !== id));
  }

  async function openRevisionHistory(target: { ref: RevisionDocumentRef; title: string; expectedHash: string }): Promise<void> {
    if (!library) return;
    setRevisionTarget(target);
    setRevisionHistory(null);
    setRevisionPreview(null);
    setRevisionSourceDrift(timelineSourceDrift(target.ref, visualWorkbench, library));
    setRevisionError("");
    setRevisionBusy(true);
    try {
      setRevisionHistory(await runWithConnection((connectedToken) => getDocumentRevisionHistory(library.project.id, target.ref, connectedToken)));
    } catch (cause) {
      setRevisionError(messageOf(cause));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function openCharacterCardHistory(): Promise<void> {
    if (!library || !activeObject || !activeObject.card.revisionToken) return;
    setCardHistoryOpen(true);
    setCardHistoryLedgers(null);
    setCardHistoryPreview(null);
    setCardHistoryError("");
    setCardHistoryBusy(true);
    try {
      const [markdown, presentation] = await runWithConnection((connectedToken) => Promise.all([
        getDocumentRevisionHistory(library.project.id, { kind: "object", id: activeObject.id }, connectedToken),
        getDocumentRevisionHistory(library.project.id, { kind: "card", id: activeObject.id }, connectedToken)
      ]));
      setCardHistoryLedgers({ markdown, presentation });
    } catch (cause) {
      setCardHistoryError(messageOf(cause));
    } finally {
      setCardHistoryBusy(false);
    }
  }

  async function previewCharacterCardRevision(owner: CharacterHistoryOwner, revisionId: string): Promise<void> {
    if (!library || !activeObject) return;
    setCardHistoryBusy(true);
    setCardHistoryError("");
    try {
      const ref: RevisionDocumentRef = { kind: owner === "markdown" ? "object" : "card", id: activeObject.id };
      setCardHistoryPreview({ owner, value: await previewDocumentRevision(library.project.id, ref, revisionId) });
    } catch (cause) {
      setCardHistoryError(messageOf(cause));
    } finally {
      setCardHistoryBusy(false);
    }
  }

  async function milestoneCharacterCardRevision(owner: CharacterHistoryOwner, revisionId: string, milestoneTitle: string): Promise<void> {
    if (!library || !activeObject) return;
    setCardHistoryBusy(true);
    setCardHistoryError("");
    try {
      const ref: RevisionDocumentRef = { kind: owner === "markdown" ? "object" : "card", id: activeObject.id };
      await runWithConnection((connectedToken) => createDocumentMilestone({ projectId: library.project.id, ref, revisionId, title: milestoneTitle, token: connectedToken }));
      await openCharacterCardHistory();
    } catch (cause) {
      setCardHistoryError(messageOf(cause));
    } finally {
      setCardHistoryBusy(false);
    }
  }

  async function restoreCharacterCardRevision(owner: CharacterHistoryOwner, revisionId: string): Promise<void> {
    if (!library || !activeObject) return;
    const expectedHash = owner === "markdown" ? activeObject.revisionToken : activeObject.card.revisionToken;
    if (!expectedHash) return;
    setCardHistoryBusy(true);
    setCardHistoryError("");
    try {
      const ref: RevisionDocumentRef = { kind: owner === "markdown" ? "object" : "card", id: activeObject.id };
      const result = await runWithConnection((connectedToken) => restoreDocumentRevision({ projectId: library.project.id, ref, revisionId, expectedHash, token: connectedToken }));
      if (result.conflict) {
        const conflictMessage = `${owner === "markdown" ? "人物内容" : "卡片构成"}已在磁盘中变化；本次恢复未写入任一所有者。`;
        await openCharacterCardHistory();
        setCardHistoryError(conflictMessage);
        return;
      }
      setCardHistoryOpen(false);
      setCardHistoryPreview(null);
      await loadLibrary(library.project.id);
    } catch (cause) {
      setCardHistoryError(messageOf(cause));
    } finally {
      setCardHistoryBusy(false);
    }
  }

  async function loadRevisionPreview(revisionId: string): Promise<void> {
    if (!library || !revisionTarget) return;
    setRevisionBusy(true);
    setRevisionError("");
    try {
      setRevisionPreview(await previewDocumentRevision(library.project.id, revisionTarget.ref, revisionId));
    } catch (cause) {
      setRevisionError(messageOf(cause));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function submitRevisionMilestone(revisionId: string, milestoneTitle: string): Promise<void> {
    if (!library || !revisionTarget) return;
    setRevisionBusy(true);
    setRevisionError("");
    try {
      const result = await runWithConnection((connectedToken) => createDocumentMilestone({
        projectId: library.project.id,
        ref: revisionTarget.ref,
        revisionId,
        title: milestoneTitle,
        token: connectedToken
      }));
      setRevisionHistory(result.history);
    } catch (cause) {
      setRevisionError(messageOf(cause));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function submitRevisionRestore(revisionId: string): Promise<void> {
    if (!library || !revisionTarget) return;
    setRevisionBusy(true);
    setRevisionError("");
    try {
      const result = await runWithConnection((connectedToken) => restoreDocumentRevision({
        projectId: library.project.id,
        ref: revisionTarget.ref,
        revisionId,
        expectedHash: revisionTarget.expectedHash,
        token: connectedToken
      }));
      if (result.conflict) {
        setRevisionHistory(result.history);
        setRevisionError("磁盘中的文档已经变化。当前版本没有被覆盖，请重新打开修订历史。");
        return;
      }
      setRevisionTarget(null);
      setRevisionPreview(null);
      await loadLibrary(library.project.id);
    } catch (cause) {
      setRevisionError(messageOf(cause));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function requestLibraryAgentDraft(input: AgentDraftRequestInput & { objectType: "character" | "item" | "location" }): Promise<AgentRecognitionProposal> {
    if (!library) throw new Error("请先打开一个项目。");
    const result = await runWithConnection((connectedToken) => createAgentDraftProposal({
      projectId: library.project.id,
      operationId: createTianyiOperationId("library-agent-draft"),
      requestedObjectType: input.objectType,
      mode: input.mode,
      authorIntent: input.authorIntent,
      sourceScope: input.sourceScope,
      sourceText: input.sourceText,
      existingObjectSummaries: library.objects.map((object) => ({ id: object.id, title: object.title, type: object.type, aliases: object.aliases })),
      allowedFieldSchema: profileFieldDefinitions(input.objectType),
      fixtureMode: "deterministic",
      token: connectedToken
    }));
    return result.proposal;
  }

  async function editLibraryAgentDraft(proposal: AgentRecognitionProposal, input: AgentDraftEditInput): Promise<AgentRecognitionProposal> {
    if (!library) throw new Error("请先打开一个项目。");
    const suggestedFields: Record<string, AgentRecognitionProposalValue> = {
      ...proposal.suggestedFields,
      proposedProfile: input.profile as unknown as AgentRecognitionProposalValue,
      proposedAliases: input.aliases as unknown as AgentRecognitionProposalValue
    };
    return runWithConnection((connectedToken) => editAgentRecognitionProposal({
      projectId: library.project.id,
      proposalId: proposal.proposalId,
      expectedRevision: proposal.revision,
      suggestedName: input.suggestedName,
      suggestedFields,
      uncertainties: input.uncertainties,
      duplicateMatches: proposal.duplicateMatches,
      token: connectedToken
    }));
  }

  async function confirmLibraryAgentDraft(proposal: AgentRecognitionProposal, application: AgentDraftApplication): Promise<void> {
    if (!library) throw new Error("请先打开一个项目。");
    const latest = await editLibraryAgentDraft(proposal, {
      suggestedName: application.title,
      aliases: application.aliases,
      profile: application.profile,
      uncertainties: proposal.uncertainties
    });
    const result = await runWithConnection((connectedToken) => confirmAgentRecognitionObject({
      projectId: library.project.id,
      proposalId: latest.proposalId,
      expectedProposalRevision: latest.revision,
      operationId: createTianyiOperationId("library-agent-confirm"),
      object: application,
      token: connectedToken
    }));
    const targetId = result.proposal.targetObjectRef?.objectId;
    if (!targetId) throw new Error("作者确认收据缺少正式资料目标。");
    const created = await readWorldObject(library.project.id, targetId);
    setNewObjectOpen(false);
    setNewObjectTitle("");
    setNewObjectAgentTypeId(null);
    writeLibraryRouteState({ tab: libraryTab, directory: libraryDirectory, query: searchQuery, objectId: targetId }, "replace");
    await loadLibrary(library.project.id);
    applyObject(created);
    setLibraryHome(false);
    setLibrarySearchOriginHome(false);
    setShowWorldHome(false);
  }

  async function ignoreLibraryAgentDraft(proposal: AgentRecognitionProposal): Promise<void> {
    if (!library) throw new Error("请先打开一个项目。");
    await runWithConnection((connectedToken) => ignoreAgentRecognitionProposal({ projectId: library.project.id, proposalId: proposal.proposalId, expectedRevision: proposal.revision, token: connectedToken }));
  }

  async function submitNewObject(characterInput: CharacterCreationInput | null, agentTypeInput: AgentTypeCreationInput, profile: StoryStudioObjectProfile | null): Promise<void> {
    if (!library || !newObjectTitle.trim()) return;
    await runWithConnection(async (connectedToken) => {
      setNewObjectBusy(true);
      setNewObjectError("");
      try {
        const portraitBase64 = characterInput?.portraitFile ? await fileToBase64(characterInput.portraitFile) : null;
        const coverBase64 = characterInput?.coverFile ? await fileToBase64(characterInput.coverFile) : null;
        const portraitAsset = characterInput?.portraitFile && portraitBase64
          ? await importVisualAsset({ projectId: library.project.id, category: "images", filename: characterInput.portraitFile.name, mimeType: characterInput.portraitFile.type, base64: portraitBase64, token: connectedToken })
          : null;
        const coverAsset = characterInput?.coverFile && coverBase64
          ? portraitAsset && portraitBase64 === coverBase64 && characterInput.portraitFile?.type === characterInput.coverFile.type
            ? portraitAsset
            : await importVisualAsset({ projectId: library.project.id, category: "images", filename: characterInput.coverFile.name, mimeType: characterInput.coverFile.type, base64: coverBase64, token: connectedToken })
          : null;
        const created = newObjectType === "character" && characterInput
          ? (await createCharacterCard({
            projectId: library.project.id,
            title: newObjectTitle.trim(),
            mode: characterInput.mode,
            subtype: characterInput.subtype,
            background: characterInput.background,
            personality: characterInput.personality,
            appearance: characterInput.appearance,
            portrait: portraitAsset ? { assetRef: portraitAsset.relativePath, fit: "cover", position: { x: 0.5, y: 0.5 } } : null,
            cover: coverAsset ? { assetRef: coverAsset.relativePath, fit: "cover", position: { x: 0.5, y: 0.5 } } : null,
            templateId: characterInput.templateId,
            templateExpectedHash: characterInput.templateExpectedHash,
            agentTypeId: agentTypeInput.agentTypeId || undefined,
            agentTypeFieldValues: agentTypeInput.fieldValues,
            profile,
            token: connectedToken
          })).object
          : await createWorldObject({ projectId: library.project.id, type: newObjectType, title: newObjectTitle.trim(), agentTypeId: agentTypeInput.agentTypeId || undefined, agentTypeFieldValues: agentTypeInput.fieldValues, profile, token: connectedToken });
        setNewObjectOpen(false);
        setNewObjectTitle("");
        setNewObjectAgentTypeId(null);
        writeLibraryRouteState({ tab: libraryTab, directory: libraryDirectory, query: searchQuery, objectId: created.id }, "replace");
        await loadLibrary(library.project.id);
        applyObject(created);
        setLibraryHome(false);
        setLibrarySearchOriginHome(false);
        setShowWorldHome(false);
      } catch (cause) {
        setNewObjectError(messageOf(cause));
      } finally {
        setNewObjectBusy(false);
      }
    });
  }

  async function saveCurrentCardAsTemplate(label: string): Promise<CardTemplate> {
    if (!library || !activeObject) throw new Error("需要先打开一张人物卡。");
    const templateId = nextLocalTemplateId(label, cardTemplates.map((template) => template.id));
    const result = await runWithConnection((connectedToken) => createCardTemplateFromCharacter({
      projectId: library.project.id,
      objectId: activeObject.id,
      templateId,
      label,
      expectedHash: activeObject.revisionToken,
      presentationExpectedHash: activeObject.card.revisionToken,
      token: connectedToken
    }));
    if (result.conflict || !result.template) throw new Error("卡片或模板已变化，重新读取后再保存为模板。");
    setCardTemplates(await listCardTemplates(library.project.id));
    return result.template;
  }

  async function previewCurrentTemplate(template: CardTemplate): Promise<CharacterTemplateDiff> {
    if (!library || !activeObject) throw new Error("需要先打开一张人物卡。");
    const result = await previewCharacterTemplateApply({
      projectId: library.project.id,
      objectId: activeObject.id,
      templateId: template.id,
      templateExpectedHash: template.revisionToken,
      markdownExpectedHash: activeObject.revisionToken,
      presentationExpectedHash: activeObject.card.revisionToken
    });
    if (result.conflict || !result.diff) throw new Error("人物、卡片构成或模板已在磁盘中变化。");
    return result.diff;
  }

  async function applyCurrentTemplate(template: CardTemplate): Promise<void> {
    if (!library || !activeObject) return;
    await runWithConnection(async (connectedToken) => {
      const result = await applyCharacterTemplate({
        projectId: library.project.id,
        objectId: activeObject.id,
        templateId: template.id,
        templateExpectedHash: template.revisionToken,
        markdownExpectedHash: activeObject.revisionToken,
        presentationExpectedHash: activeObject.card.revisionToken,
        token: connectedToken
      });
      if (result.conflict) {
        setConflictObject(result.object);
        setObjectConflictKind(result.characterStructureSaved && result.presentationConflict ? "partial" : result.presentationConflict ? "presentation" : "markdown");
        setActiveObject(result.object);
        setDraft(toDraft(result.object));
        setObjectDirtyOwners({ markdown: false, presentation: false });
        setSaveState("conflict");
        return;
      }
      applyObject(result.object);
      await loadLibrary(library.project.id);
    });
  }

  async function saveObject(): Promise<void> {
    if (!library || !activeObject || !draft) return;
    await runWithConnection(async (connectedToken) => {
      setSaveState("saving");
      try {
        const result = await updateWorldObject({
          projectId: library.project.id,
          objectId: activeObject.id,
          expectedHash: activeObject.revisionToken,
          presentationExpectedHash: activeObject.card.revisionToken,
          writeMarkdown: objectDirtyOwners.markdown,
          writePresentation: objectDirtyOwners.presentation || activeObject.card.source === "virtual-v1",
          title: draft.title.trim(),
          status: draft.status.trim() || "active",
          tags: splitList(draft.tags),
          aliases: splitList(draft.aliases),
          subtype: draft.subtype,
          typedProperties: draft.typedProperties.map(({ references: _references, ...property }) => property),
          body: draft.body,
          profile: draft.profile,
          card: draft.card,
          token: connectedToken
        });
        if (result.conflict) {
          setConflictObject(result.object);
          setObjectConflictKind(result.characterContentSaved && result.presentationConflict ? "partial" : result.presentationConflict ? "presentation" : "markdown");
          if (result.characterContentSaved && result.presentationConflict) {
            setActiveObject(result.object);
            setDraft(toDraft(result.object));
            setObjectDirtyOwners({ markdown: false, presentation: false });
          }
          setSaveState("conflict");
          return;
        }
        setObjectConflictKind(null);
        await loadLibrary(library.project.id);
      } catch (cause) {
        setSaveState("unsaved");
        setError(messageOf(cause));
      }
    });
  }

  async function duplicateCurrentObject(): Promise<void> {
    if (!library || !activeObject) return;
    await runWithConnection(async (connectedToken) => {
      try {
        const copied = await duplicateWorldObject({ projectId: library.project.id, objectId: activeObject.id, token: connectedToken });
        await loadLibrary(library.project.id);
        await openFullObject(copied);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  async function archiveCurrentObject(): Promise<void> {
    if (!library || !activeObject) return;
    await runWithConnection(async (connectedToken) => {
      try {
        const archived = await archiveWorldObject({ projectId: library.project.id, objectId: activeObject.id, expectedHash: activeObject.revisionToken, token: connectedToken });
        applyObject(archived);
        await loadLibrary(library.project.id);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  async function restoreCurrentObject(): Promise<void> {
    if (!library || !activeObject) return;
    await runWithConnection(async (connectedToken) => {
      try {
        const restored = await restoreWorldObject({ projectId: library.project.id, objectId: activeObject.id, expectedHash: activeObject.revisionToken, token: connectedToken });
        applyObject(restored);
        await loadLibrary(library.project.id);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  function toggleBulkObjectSelection(objectId: string): void {
    setBulkSelectedObjectIds((current) => current.includes(objectId) ? current.filter((id) => id !== objectId) : [...current, objectId]);
  }

  async function applyBulkLibraryOperation(operation: "add-tags" | "remove-tags" | "archive" | "restore", tags?: string[]): Promise<void> {
    if (!library || bulkSelectedObjectIds.length === 0) return;
    await runWithConnection(async (connectedToken) => {
      try {
        await bulkUpdateWorldObjects({ projectId: library.project.id, objectIds: bulkSelectedObjectIds, operation, ...(tags ? { tags } : {}), token: connectedToken });
        await loadLibrary(library.project.id);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  async function moveBulkLibrarySelection(folderId: string | null): Promise<void> {
    if (!library || bulkSelectedObjectIds.length === 0) return;
    await runWithConnection(async (connectedToken) => {
      try {
        const result = await moveWorldObjectsToFolder({ projectId: library.project.id, objectIds: bulkSelectedObjectIds, folderId, token: connectedToken });
        if (result.conflict) throw new Error("资料分类已被其他操作修改；请刷新后重试。");
        await loadLibrary(library.project.id);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  async function importLibraryText(file: File, folderId: string | null): Promise<void> {
    if (!library) return;
    try {
      const content = await file.text();
      await runWithConnection(async (connectedToken) => {
        const document = await importSourceDocument({ projectId: library.project.id, filename: file.name, content, folderId, mode: "reference-only", token: connectedToken });
        const reviews = await listSourceImportReviews(library.project.id);
        setSourceImportDocuments(reviews);
        setSourceImportActiveId(document.sourceDocumentId);
        setSourceImportView(true);
        await loadLibrary(library.project.id);
      });
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function refreshSourceImportReviews(projectId: string, preferredId?: string | null): Promise<void> {
    try {
      const documents = await listSourceImportReviews(projectId);
      setSourceImportDocuments(documents);
      setSourceImportActiveId(preferredId || documents[0]?.sourceDocumentId || null);
      setSourceImportError("");
    } catch (cause) {
      setSourceImportError(messageOf(cause));
    }
  }

  function openSourceImportReview(sourceDocumentId?: string | null): void {
    if (!library) return;
    setSourceImportView(true);
    setSourceImportError("");
    void refreshSourceImportReviews(library.project.id, sourceDocumentId || sourceImportActiveId);
  }

  async function extractSourceImport(document: SourceImportDocumentR0): Promise<void> {
    if (!library) return;
    setSourceImportBusy(true); setSourceImportError("");
    try {
      const next = await runWithConnection((connectedToken) => extractSourceImportCandidates(library.project.id, document.sourceDocumentId, connectedToken));
      setSourceImportDocuments((current) => current.map((item) => item.sourceDocumentId === next.sourceDocumentId ? next : item));
    } catch (cause) {
      setSourceImportError(messageOf(cause));
    } finally { setSourceImportBusy(false); }
  }

  async function decideSourceImport(document: SourceImportDocumentR0, candidate: SourceImportCandidateR0, decision: "accepted" | "rejected" | "merged", targetObjectId?: string | null): Promise<void> {
    if (!library) return;
    setSourceImportBusy(true); setSourceImportError("");
    try {
      const result = await runWithConnection((connectedToken) => decideSourceImportCandidate({ projectId: library.project.id, sourceDocumentId: document.sourceDocumentId, candidateId: candidate.candidateId, decision, ...(targetObjectId ? { targetObjectId } : {}), token: connectedToken }));
      setSourceImportDocuments((current) => current.map((item) => item.sourceDocumentId === result.document.sourceDocumentId ? result.document : item));
      await loadLibrary(library.project.id);
    } catch (cause) {
      setSourceImportError(messageOf(cause));
    } finally { setSourceImportBusy(false); }
  }

  async function handoffSourceImport(document: SourceImportDocumentR0, candidate: SourceImportCandidateR0, authorQuestion: string): Promise<void> {
    if (!library) return;
    setSourceImportBusy(true); setSourceImportError("");
    try {
      const result = await runWithConnection((connectedToken) => handoffSourceImportUnit({ projectId: library.project.id, sourceDocumentId: document.sourceDocumentId, unitCandidateId: candidate.candidateId, authorQuestion, token: connectedToken }));
      setSourceImportError(`已创建女娲执行简报：${result.brief.authorGoal}`);
      setSourceImportView(false);
      await openNuwaWorkspace(result.brief);
    } catch (cause) {
      setSourceImportError(messageOf(cause));
    } finally { setSourceImportBusy(false); }
  }

  async function refreshR9AWorkflow(projectId: string): Promise<void> {
    try {
      const [workflow, backups] = await Promise.all([getR9AWorkflowState(projectId), listR9AProjectBackups(projectId)]);
      setR9AWorkflow(workflow);
      setR9ABackups(backups);
    } catch {
      // Workflow metadata is additive convenience state; a malformed old record must not prevent authoring.
      setR9AWorkflow(null);
      setR9ABackups([]);
    }
  }

  async function createR9ATask(input: { title: string; lane: R9AWorkflowTask["lane"] }): Promise<void> {
    if (!library) return;
    await runWithConnection(async (connectedToken) => {
      const workflow = await createR9AWorkflowTask({ projectId: library.project.id, ...input, token: connectedToken });
      setR9AWorkflow(workflow);
    });
  }

  async function setR9ATaskState(task: R9AWorkflowTask, state: R9AWorkflowTask["state"]): Promise<void> {
    if (!library || !r9aWorkflow) return;
    await runWithConnection(async (connectedToken) => {
      const result = await updateR9AWorkflowTask({ projectId: library.project.id, taskId: task.id, expectedHash: r9aWorkflow.contentHash, state, token: connectedToken });
      if (result.conflict) throw new Error("任务列表已更新；请刷新后重试。");
      setR9AWorkflow(result.state);
    });
  }

  async function createR9ABackup(title: string): Promise<void> {
    if (!library) return;
    await runWithConnection(async (connectedToken) => {
      await createR9AProjectBackup({ projectId: library.project.id, title, token: connectedToken });
      await refreshR9AWorkflow(library.project.id);
    });
  }

  async function restoreR9ABackup(backupId: string): Promise<void> {
    if (!library) return;
    await runWithConnection(async (connectedToken) => {
      await restoreR9AProjectBackup({ projectId: library.project.id, backupId, confirmed: true, token: connectedToken });
      await loadLibrary(library.project.id);
    });
  }

  async function saveTemporaryNuwaCharacter(input: { explorationId: string; displayName: string }): Promise<void> {
    if (!library) return;
    await runWithConnection(async (connectedToken) => {
      await createNuwaTemporaryCharacterProposal({ projectId: library.project.id, ...input, token: connectedToken });
      setError("临时角色已保存为候选。可在天意的候选审查中确认新建或合并到现有角色。");
    });
  }

  async function deleteCurrentObject(): Promise<void> {
    if (!library || !activeObject) return;
    await runWithConnection(async (connectedToken) => {
      try {
        await deleteWorldObject({ projectId: library.project.id, objectId: activeObject.id, expectedHash: activeObject.revisionToken, confirmed: true, token: connectedToken });
        setActiveObject(null);
        setDraft(null);
        setVisualObject(null);
        setSaveState("saved");
        await loadLibrary(library.project.id);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  async function changeCurrentPlanningLifecycle(action: "pause" | "resume" | "abandon"): Promise<void> {
    if (!library || !activeObject) return;
    await runWithConnection(async (connectedToken) => {
      try {
        const result = action === "pause"
          ? await pausePlanningEvent({ projectId: library.project.id, planningEventId: activeObject.id, expectedHash: activeObject.revisionToken, token: connectedToken })
          : action === "resume"
            ? await resumePlanningEvent({ projectId: library.project.id, planningEventId: activeObject.id, expectedHash: activeObject.revisionToken, token: connectedToken })
            : await abandonPlanningEvent({ projectId: library.project.id, planningEventId: activeObject.id, expectedHash: activeObject.revisionToken, token: connectedToken });
        if (result.conflict) {
          setConflictObject(result.object);
          setSaveState("conflict");
          return;
        }
        applyObject(result.object);
        await loadLibrary(library.project.id);
      } catch (cause) {
        setError(messageOf(cause));
      }
    });
  }

  function changeDraft(value: ObjectDraft) {
    if (draft) {
      setObjectDirtyOwners((current) => ({
        markdown: current.markdown || draft.title !== value.title || draft.status !== value.status || draft.tags !== value.tags || draft.aliases !== value.aliases || draft.subtype !== value.subtype || JSON.stringify(draft.typedProperties) !== JSON.stringify(value.typedProperties) || JSON.stringify(draft.profile) !== JSON.stringify(value.profile) || draft.body !== value.body,
        presentation: current.presentation || !sameCardPresentation(draft.card, value.card)
      }));
    }
    setDraft(value);
    setSaveState((current) => current === "conflict" ? "conflict" : "unsaved");
  }

  function reloadConflict() {
    if (!conflictObject) return;
    applyObject(conflictObject);
    setObjectConflictKind(null);
  }

  async function returnFromTianyi(target?: TianyiProjectResume["sourceTarget"]): Promise<void> {
    // The official Tianyi handoff owns its return surface. Resolve it before
    // an older writing snapshot can steal the canonical /tianyi destination.
    if (!target && currentTianyiReturnSurface() === "tianyi") {
      restoreProductWorkspace("tianyi");
      setTianyiSurface("companion");
      setError("");
      return;
    }
    if (!target) {
      const snapshot = tianyiReturnSnapshotRef.current;
      if (!snapshot) {
        await chooseProductMode(tianyiSourceMode ?? (writing?.activeDocument?.type === "scene" ? "writing" : "world"));
        return;
      }
      if (!library) return;
      let availableTarget: ProductShellAvailableTarget | null = null;
      let currentWriting = writing;
      let openedWritingDocument: WritingDocument | null = null;
      let currentLibrary = library;
      let currentVisual = visualWorkbench;
      if (snapshot.target.kind === "writing-document") {
        currentWriting = await getWritingBootstrap(library.project.id);
        try {
          openedWritingDocument = await runWithConnection((connectedToken) => openWritingDocument(library.project.id, snapshot.target.id, connectedToken));
          availableTarget = { kind: "writing-document", id: openedWritingDocument.id, revision: openedWritingDocument.revisionToken };
        } catch {
          availableTarget = null;
        }
      } else if (snapshot.target.kind === "world-object") {
        currentLibrary = await getWorldLibrary(library.project.id);
        const object = currentLibrary.objects.find((item) => item.id === snapshot.target.id);
        if (object) availableTarget = { kind: "world-object", id: object.id, revision: object.revisionToken };
      } else if (snapshot.target.kind === "visual-document") {
        currentVisual = await getVisualWorkbench(library.project.id);
        const visualDocument = currentVisual.documents.find((item) => item.id === snapshot.target.id);
        if (visualDocument) availableTarget = { kind: "visual-document", id: visualDocument.id, revision: visualDocument.contentHash };
      }
      const resolved = resolveProductShellReturnLocation({
        snapshot,
        currentProjectId: library.project.id,
        availableTargets: availableTarget ? [availableTarget] : []
      });
      if (resolved.state === "project-mismatch") {
        setError("天意来源属于另一个世界；未跨项目恢复任何文档或选区。");
        return;
      }
      restoreProductWorkspace(snapshot.destination);
      if (snapshot.destination !== "event-line" && snapshot.destination !== "tianyi") setTianyiSourceMode(tianyiSourceForMode(snapshot.destination));
      setWorkspaceMode(snapshot.workspaceMode as WorkspaceMode);
      setShowWorldHome(snapshot.showWorldHome);
      setLibrary(currentLibrary);
      setVisualWorkbench(currentVisual);
      if (currentWriting) setWriting(openedWritingDocument ? { ...currentWriting, activeDocument: openedWritingDocument } : currentWriting);
      if (resolved.state === "nearest-stable-parent") {
        setSelection(EMPTY_WORKSPACE_SELECTION);
        setWritingScrollTop(0);
        setError(resolved.reason === "target-missing"
          ? "天意来源目标已删除；已返回最近稳定工作区，未跳到同名文档。"
          : "天意来源版本已过期；已返回当前文档的稳定父级，未恢复过期选区。");
        return;
      }
      setSelection(snapshot.selectionAnchor);
      setWritingScrollTop(snapshot.scrollTop);
      if (snapshot.target.kind === "writing-document") {
        setWritingEditorRestoreSnapshot({
          focused: snapshot.focusToken === "writing-editor",
          selectionStart: snapshot.editorSelection?.start || 0,
          selectionEnd: snapshot.editorSelection?.end || 0,
          scrollTop: snapshot.scrollTop,
          requestId: Date.now()
        });
      }
      setError("");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (snapshot.focusToken === "writing-editor" && snapshot.target.kind === "writing-document") {
          const editor = document.querySelector<HTMLTextAreaElement>(".draft-markdown-editor");
          if (editor) {
            editor.scrollTop = snapshot.scrollTop;
            if (snapshot.editorSelection) editor.setSelectionRange(snapshot.editorSelection.start, snapshot.editorSelection.end);
            editor.focus();
          }
        } else if (snapshot.focusToken === "tianyi-launcher") {
          document.querySelector<HTMLElement>("[data-testid='tianyi-quick-launcher']")?.focus();
        }
      }));
      return;
    }
    if (target.kind === "world-object") {
      const object = library?.objects.find((item) => item.id === target.id);
      if (object) await openObject(object, "card");
      else setError("天意指定的世界对象已不存在；未跳转到同名对象。");
    } else if (target.kind === "writing-document") {
      const document = writing?.chapters.flatMap((chapter) => [chapter, ...chapter.scenes]).find((item) => item.id === target.id);
      if (document) await chooseWritingDocument(document);
      else setError("天意指定的写作文档已不存在；未跳转到同名文档。");
    } else {
      const document = visualWorkbench?.documents.find((item) => item.id === target.id);
      if (document) {
        restoreProductWorkspace("library");
        setTianyiSourceMode("library");
        await chooseVisualDocument(document, "primary");
      } else setError("天意指定的视觉文档已不存在；未跳转到同名文档。");
    }
  }

  function resetOnboarding() {
    setGenre("");
    setAmbience("");
    setTitle("");
    setFolderSlug("");
    setFolderEdited(false);
  }

  const activeProject = bootstrap?.activeProject || null;
  const fixtureKind = currentUrl.searchParams.get("fixture");
  const creationSourceView = currentUrl.searchParams.get("view");
  const creationSourceReturn = currentUrl.searchParams.get("returnTo") === "creation-source";
  const normalCreationSourceRoute = !fixtureKind && (
    (productMode === "writing" && ((creationRouteMode === "hub" && !creationSourceView && !currentUrl.searchParams.has("artifact")) || Boolean(creationSourceView && CREATION_SOURCE_PORT_VIEWS.has(creationSourceView))))
    || (productMode === "library" && creationSourceReturn)
  );
  // The ordinary first-use Event Line is intentionally distinct from the
  // existing confirmed-story observation route. A confirmed legacy/Nuwa
  // event must continue to open its read workspace on a direct deep link.
  const hasNormalEventLineDraft = Boolean(library?.objects.some((item) => item.type === "event" && item.status === "planned" && item.tags.includes("普通事件线")));
  const hasVerifiedEventLineHistory = eventLineRead.status === "ready" && eventLineRead.eventIds.length > 0;
  const normalEventCreationRoute = !hasVerifiedEventLineHistory || hasNormalEventLineDraft;
  const eventLineFixtureEnabled = fixtureKind === "event-hierarchy" || fixtureKind === "character-fate" || fixtureKind === "character-state";
  const activeProjectTitle = fixtureKind === "nuwa-bounded" || fixtureKind === "multiverse-single-derived" || fixtureKind === "work-version-creation"
    ? fixtureKind === "multiverse-single-derived" ? "潮痕来信 · 多元隔离演示" : fixtureKind === "work-version-creation" ? "潮痕来信 · 创作来源隔离演示" : "潮痕来信 · 隔离演示"
    : eventLineFixtureEnabled
    ? fixtureKind === "character-fate" || fixtureKind === "character-state" ? "潮痕来信 · 隔离演示" : "潮痕来信 · 事件线演示"
    : projectDisplayTitle(activeProject?.title, Boolean(activeProject));
  const tianyiDraftKey = (sessionId: string | null) => `${activeProject?.id || "no-project"}:${sessionId || "pending"}`;
  const sharedTianyiDraft = tianyiDrafts[tianyiDraftKey(sharedTianyiSessionId)] || "";
  const updateSharedTianyiSessionId = (sessionId: string | null) => {
    if (sessionId && !sharedTianyiSessionId) {
      const pendingKey = tianyiDraftKey(null);
      const targetKey = tianyiDraftKey(sessionId);
      setTianyiDrafts((current) => {
        const pendingDraft = current[pendingKey];
        if (!pendingDraft) return current;
        const next = { ...current, [targetKey]: current[targetKey] || pendingDraft };
        delete next[pendingKey];
        return next;
      });
    }
    setSharedTianyiSessionId(sessionId);
  };
  const updateSharedTianyiDraft = (value: string) => {
    const key = tianyiDraftKey(sharedTianyiSessionId);
    if (value === "") {
      const pendingKey = tianyiDraftKey(null);
      setTianyiDrafts((current) => {
        if (!(key in current) && !(pendingKey in current)) return current;
        const next = { ...current };
        delete next[key];
        delete next[pendingKey];
        return next;
      });
      return;
    }
    setTianyiDrafts((current) => current[key] === value ? current : { ...current, [key]: value });
  };
  const tianyiObjectContextResolutionSignature = tianyiObjectContextRefs
    .map((ref) => `${tianyiObjectContextKey(ref)}:${ref.contentHash}:${ref.state}:${ref.inclusion}`)
    .join("|");

  useEffect(() => {
    if (!activeProject || tianyiObjectContextRefs.length === 0) return;
    if (productMode !== "tianyi" && visibleTianyiQuickPlacement === "closed") return;
    let cancelled = false;
    void runWithConnection((connectedToken) => resolveTianyiObjectContextRefs(activeProject.id, tianyiObjectContextRefs, connectedToken))
      .then((resolved) => {
        if (!cancelled) setTianyiObjectContextRefs(resolved);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeProject?.id, productMode, visibleTianyiQuickPlacement, tianyiObjectContextResolutionSignature]);

  if (loading && !bootstrap) return <LoadingScreen />;
  const worldTabs = buildWorldTabs(tabs, visualWorkbench);
  const resolvedTianyiSourceMode: TianyiSourceMode = tianyiSourceMode
    ?? (writing?.activeDocument?.type === "scene" ? "writing" : "world");
  const tianyiContextMode: StoryStudioIntelligenceMode = productMode === "nuwa"
    ? "intelligence"
    : resolvedTianyiSourceMode === "writing" ? "writing" : "world";
  const tianyiContextEvent = fixtureKind === "work-version-creation" ? null : tianyiContextMode === "world"
    ? activeObject?.type === "event"
      ? activeObject
      : workspaceMode !== "library" && visualObject?.type === "event"
        ? visualObject
        : null
    : null;
  const tianyiHandoffReference = tianyiEventReferences[0] ?? null;
  const tianyiHandoffSummary = tianyiHandoffReference
    ? library?.objects.find((object) => object.id === tianyiHandoffReference.eventId) ?? null
    : null;
  const tianyiContextEventReference = activeProject && tianyiContextEvent
    ? createStoryStudioEventReference({ projectId: activeProject.id, event: tianyiContextEvent, requestedUse: "constraint" })
    : tianyiHandoffReference;
  const tianyiContextInput = activeProject ? {
    mode: tianyiContextMode,
    project: activeProject,
    showWorldHome,
    workspaceMode,
    activeObject,
    visualWorkbench,
    visualObject,
    objects: library?.objects || [],
    selection,
    writingDocument: writing?.activeDocument || null,
    intelligenceDocument,
    impactReview,
    eventReference: tianyiContextEventReference,
    eventLabel: tianyiContextEvent?.title ?? tianyiHandoffSummary?.title ?? null
  } : null;
  const derivedTianyiContext = tianyiContextInput ? deriveTianyiShellContext(tianyiContextInput) : unavailableTianyiContext("world");
  const tianyiContext = tianyiContextInput
    ? productMode === "data"
      ? { ...derivedTianyiContext, contextKind: "project" as const, contextLabel: currentUrl.searchParams.get("view") === "character-fate" ? "沈砚 · 角色命运 K 线" : "当前作品分析", sourceLabels: currentUrl.searchParams.get("view") === "character-fate" ? ["数据", "角色命运", "隔离 Fixture"] : ["数据", "只读投影"] }
      : productMode === "event-line" && !tianyiContextEvent
        ? { ...derivedTianyiContext, contextKind: "project" as const, contextLabel: "事件线", sourceLabels: ["事件线", "当前时间范围"] }
        : productMode === "multiverse"
          ? { ...derivedTianyiContext, contextKind: "project" as const, contextLabel: "多元", sourceLabels: ["多元", "当前派生范围"] }
          : productMode === "library" && currentUrl.searchParams.get("view") === "character-state"
            ? { ...derivedTianyiContext, contextKind: "project" as const, contextLabel: "沈砚 · 当前状态", sourceLabels: ["资料", "角色状态", "隔离 Fixture"] }
            : productMode === "library" && !activeObject
              ? { ...derivedTianyiContext, contextKind: "project" as const, contextLabel: "资料", sourceLabels: ["资料", "当前作品"] }
            : productMode === "writing" && !writing?.activeDocument
              ? { ...derivedTianyiContext, contextKind: "project" as const, contextLabel: "创作", sourceLabels: ["创作", "当前作品"] }
              : derivedTianyiContext
    : unavailableTianyiContext("world");
  const baseTianyiContextRequest = tianyiContextInput ? deriveTianyiContextRequest(tianyiContextInput) : null;
  // The visible event can be selected by the current workspace while other
  // event references were added deliberately by the author. Both remain
  // identity/version references; neither path carries event body content.
  const groundedTianyiEventReferences = (() => {
    const references = new Map<string, StoryStudioEventReference>();
    for (const reference of [...(baseTianyiContextRequest?.eventRefs ?? []), ...tianyiEventReferences]) {
      const key = storyStudioEventReferenceKey(reference);
      if (!references.has(key)) references.set(key, reference);
    }
    return [...references.values()].slice(0, 4);
  })();
  const tianyiContextRequest = baseTianyiContextRequest ? {
    ...baseTianyiContextRequest,
    ...(groundedTianyiEventReferences.length ? { eventRefs: groundedTianyiEventReferences } : {})
  } : null;
  const availableTianyiObjectContextRefs = activeProject ? [
    ...(library?.objects || []).flatMap((object) => {
      const ref = worldObjectContextRef(activeProject.id, object);
      return ref ? [ref] : [];
    }),
    ...(writing?.activeDocument ? [writingContextRef(activeProject.id, writing.activeDocument)] : []),
    ...(visualWorkbench?.documents || []).flatMap((document) => visualContextRefs(activeProject.id, document, library?.objects || []))
  ] : [];
  const activeTianyiObjectContextRef = activeProject
    ? tianyiContextMode === "writing" && writing?.activeDocument
      ? writingContextRef(activeProject.id, writing.activeDocument)
      : activeObject
        ? worldObjectContextRef(activeProject.id, activeObject)
        : null
    : null;
  const groundedActiveTianyiContextRef = tianyiContextRequest?.eventRefs?.length
    ? null
    : activeTianyiObjectContextRef;
  const availableTianyiGroundedSubjects = activeProject
    ? (library?.objects || []).filter((object) => object.type === "character").flatMap((object) => {
        const ref = worldObjectContextRef(activeProject.id, object);
        return ref ? [ref] : [];
      })
    : [];
  const addTianyiObjectContextRef = (ref: TianyiObjectContextRef) => {
    setTianyiObjectContextRefs((current) => {
      const key = tianyiObjectContextKey(ref);
      if (current.some((item) => tianyiObjectContextKey(item) === key)) return current;
      return current.length >= 4 ? current : [...current, ref];
    });
  };
  const removeTianyiObjectContextRef = (ref: TianyiObjectContextRef) => setTianyiObjectContextRefs((current) => current.filter((item) => tianyiObjectContextKey(item) !== tianyiObjectContextKey(ref)));
  const addTianyiEventReference = (event: WorldObjectSummary, requestedUse: StoryStudioEventReference["requestedUse"] = "constraint") => {
    if (!activeProject || event.type !== "event") return;
    const reference = createStoryStudioEventReference({ projectId: activeProject.id, event, requestedUse });
    setTianyiEventReferences((current) => {
      const key = storyStudioEventReferenceKey(reference);
      if (current.some((item) => storyStudioEventReferenceKey(item) === key)) return current;
      return current.length >= 4 ? current : [...current, reference];
    });
  };
  const contextBudgetSnapshot: ContextBudgetSnapshot = {
    sourceCount: tianyiContextRequest
      ? 1 + tianyiContextRequest.sourceRefs.length + tianyiContextRequest.memorySelections.length + tianyiContextRequest.enabledSkillRefs.length
      : 0,
    estimatedSize: "待 Context Layer 提供",
    compressionStatus: "not-enabled"
  };
  const activeWritingChapter = writing?.activeDocument
    ? writing.chapters.find((chapter) => chapter.id === writing.activeDocument?.id || chapter.scenes.some((scene) => scene.id === writing.activeDocument?.id)) || null
    : null;
  const nuwaConfirmedEventId = fixtureKind === "nuwa-bounded" ? currentUrl.searchParams.get("event") : null;
  const multiverseConfirmedEventId = fixtureKind === "multiverse-single-derived" ? currentUrl.searchParams.get("event") : null;
  const multiverseAuthorControlReceiptId = fixtureKind === "multiverse-single-derived" ? currentUrl.searchParams.get("receipt") : null;
  const eventLineFixture = activeProject && multiverseConfirmedEventId && multiverseAuthorControlReceiptId
    ? createMultiverseConfirmedEventLineFixture(activeProject.id, multiverseConfirmedEventId, multiverseAuthorControlReceiptId)
    : activeProject && nuwaConfirmedEventId
    ? createNuwaConfirmedEventLineFixture(activeProject.id, nuwaConfirmedEventId)
    : eventLineFixtureEnabled && activeProject ? createEventLineFixture(activeProject.id) : null;
  const verifiedCanonEvents = eventLineFixture
    ? eventLineFixture.events
    : library && eventLineRead.status === "ready" ? verifiedCanonEventSummaries(library.objects, eventLineRead.eventIds) : [];
  const visibleEventLineRead = eventLineFixture?.listState ?? eventLineRead;
  const readVerifiedCanonEvent = async (eventId: string): Promise<VerifiedCanonEventDetailRead> => {
    if (eventLineFixture) return readEventLineFixture(eventLineFixture, eventId);
    if (!activeProject || !verifiedCanonEvents.some((event) => event.id === eventId)) {
      return { status: "error", error: { kind: "invalid-record", message: "已确认事件已不可用。" } };
    }
    return getVerifiedCanonEvent(activeProject.id, eventId);
  };
  const activeObjectAuthorityMode = resolveObjectAuthorityMode(activeObject, eventLineRead);
  const localAuthorAccount = {
    displayName: "本地作者",
    detail: storageTransparency?.projectPath
      ? `本地工作区 · ${activeProject?.title || "当前项目"}`
      : "本地工作区 · 正在确认故事位置…"
  };
  const sidebarWidthPx = controlCenterPreferences.appearance.sidebarCollapsed
    ? 56
    : resolveSidebarWidthPx(
        controlCenterPreferences.appearance.sidebarWidth,
        controlCenterPreferences.appearance.sidebarCustomWidthPx
      );
  const shellStyle = {
    "--sidebar-width": `${productMode === "library" && !controlCenterPreferences.appearance.sidebarCollapsed ? libraryRailWidthPx : sidebarWidthPx}px`,
    "--tianyi-panel-width": `${controlCenterPreferences.appearance.tianyiPanelWidthPx}px`
  } as CSSProperties;
  const tianyiV2Operations: TianyiV2Operations = {
    getSessionMetadata: getTianyiSessionMetadata,
    readReceipt: readTianyiReceipt,
    readLatestBrief: async (projectId, connectedToken) => (await readLatestExecutionBridge(projectId, connectedToken)).brief,
    openSession: async (projectId, operationId, connectedToken) => openTianyiSession(projectId, operationId, connectedToken),
    captureCreativeSource: captureTianyiCreativeAuthorSource,
    extractCreative: extractTianyiCreativeProjection,
    readCreative: getTianyiCreativeProjection,
    decideCreative: decideTianyiCreativeCandidate,
    handoffCreative: handoffTianyiCreativeCandidate,
    editCreative: editTianyiCreativeCandidate,
    pauseCreative: pauseTianyiCreativeSession,
    markCreativeProviderUnavailable: markTianyiCreativeProviderUnavailable,
    recoverCreative: recoverTianyiCreativeSession,
    completeCreative: completeTianyiCreativeSession,
    startAgentRun: startTianyiAgentRun,
    continueAgentRun: continueTianyiAgentRun,
    approveAgentStep: approveTianyiAgentStep,
    rejectAgentStep: rejectTianyiAgentStep,
    steerAgentRun: steerTianyiAgentRun,
    pauseAgentRun: pauseTianyiAgentRun,
    resumeAgentRun: resumeTianyiAgentRun,
    cancelAgentRun: cancelTianyiAgentRun,
    recoverAgentRun: recoverTianyiAgentRun,
    getAgentRunProjection: getTianyiAgentRunProjection,
    handoffAgentCandidate: handoffTianyiAgentCandidate,
    runGroundedQuestion: async (input) => {
      const modelStatus = await getModelServiceStatus(input.token);
      const profileId = input.profileId || providerConnection?.profileId || modelStatus.profiles[0]?.id;
      if (!profileId) throw new Error("当前没有可用于天意的模型档案；作者输入会保留，请稍后重试。");
      return streamTianyiGroundedAnswer({
        operationId: input.operationId,
        submissionId: input.submissionId,
        explicitRetry: input.explicitRetry,
        profileId,
        question: input.question,
        contextRequest: createTianyiGroundedContextRequest({
          projectId: input.projectId,
          sessionId: input.sessionId,
          access: tianyiGroundedAccess,
          activeContextRef: groundedActiveTianyiContextRef,
          objectContextRefs: tianyiObjectContextRefs,
          eventRefs: groundedTianyiEventReferences
        }),
        token: input.token,
        signal: input.signal,
        onDraft: input.onDraft
      });
    },
    createBrief: (input) => createExecutionBrief(input),
    reviseBrief: (input) => reviseExecutionBrief(input),
    approveBrief: (input) => approveExecutionBrief(input),
    startBrief: (projectId, briefId, revision, connectedToken) => startExecutionBrief(projectId, briefId, revision, connectedToken)
  };
  const resizeSidebar = (widthPx: number) => {
    persistControlCenterPreferences({
      ...controlCenterPreferences,
      appearance: {
        ...controlCenterPreferences.appearance,
        ...sidebarPreferenceFromPixels(widthPx)
      }
    });
  };
  const settingsRouteActive = isSettingsRoute(window.location.pathname);
  // A local rail is navigation only when the workspace owns a real collection.
  // Do not use Library's taxonomy to fill empty author workbenches.
  const hasContextSidebar = !settingsRouteActive && (productMode === "library" || productMode === "writing");
  const contextCounts: AuthorContextCounts = {
    character: library?.counts.character || 0,
    item: library?.counts.item || 0,
    location: library?.counts.location || 0,
    "custom-material": library?.folders.filter((folder) => folder.kind === "custom-category").length || 0,
    node: storyUnits.reduce((count, unit) => count + unit.items.filter((item) => item.kind === "node").length, 0),
    beat: storyUnits.reduce((count, unit) => count + unit.items.filter((item) => item.kind === "beat").length, 0),
    unit: storyUnits.length,
    "event-line": verifiedCanonEvents.length ? 1 : 0,
    worldview: library?.counts.rule || 0,
    background: library?.counts.rule || 0,
    setting: library?.counts.rule || 0,
    "custom-setting": library?.folders.filter((folder) => folder.kind === "custom-category").length || 0,
    idea: 0,
    foreshadow: library?.counts.thread || 0,
    inspiration: 0,
    "custom-other": library?.folders.filter((folder) => folder.kind === "custom-category").length || 0
  };
  const selectAuthorContext = (target: AuthorContextTarget): void => {
    if (target === "character" || target === "item" || target === "location") {
      setTypeFilter(target);
      void chooseProductMode("library");
    } else if (target === "worldview" || target === "background" || target === "setting" || target === "custom-setting") {
      setTypeFilter("rule");
      void chooseProductMode("library");
    } else if (target === "idea" || target === "foreshadow" || target === "inspiration" || target === "custom-other") {
      setTypeFilter("thread");
      void chooseProductMode("library");
    } else if (target === "custom-material") {
      setTypeFilter(null);
      void chooseProductMode("library");
    } else {
      void chooseProductMode(target === "event-line" ? "event-line" : "multiverse");
    }
    closeMobileDrawer();
  };
  const selectLibraryTab = (tab: LibraryViewTab): void => {
    setLibraryHome(false);
    setLibrarySearchOriginHome(false);
    setLibraryTab(tab);
    setLibraryDirectory(tab === "classified" ? "all" : "all");
    setRelationView("all");
    setRelationPresentation("list");
    setRelationId(null);
    setTypeFilter(null);
    setLibraryFocusRequest((value) => value + 1);
    writeLibraryRouteState({ tab, directory: "all", relationView: null, relationId: null }, "push");
    closeMobileDrawer();
  };
  const selectLibraryDirectory = (directory: LibraryDirectoryId): void => {
    setLibraryHome(false);
    setLibrarySearchOriginHome(false);
    setLibraryTab("classified");
    setLibraryDirectory(directory);
    setRelationView(directory === "relation" ? "all" : "all");
    setRelationPresentation("list");
    setRelationId(null);
    setLibraryFocusRequest((value) => value + 1);
    if (directory === "character" || directory === "item" || directory === "location" || directory === "faction") setTypeFilter(directory);
    else setTypeFilter(null);
    setActiveObject(null);
    setDraft(null);
    setTabs([]);
    writeLibraryRouteState({ tab: "classified", directory, objectId: null, relationView: directory === "relation" ? "all" : null, relationId: null }, "push");
    closeMobileDrawer();
  };
  const selectLibraryAuxiliary = (directory: Extract<LibraryDirectoryId, "folders" | "visual">): void => {
    setLibraryHome(false);
    setLibrarySearchOriginHome(false);
    setLibraryTab("classified");
    setLibraryDirectory(directory);
    setRelationView("all");
    setRelationPresentation("list");
    setRelationId(null);
    setLibraryFocusRequest((value) => value + 1);
    setTypeFilter(null);
    setActiveObject(null);
    setDraft(null);
    setTabs([]);
    writeLibraryRouteState({ tab: "classified", directory, objectId: null, relationView: null, relationId: null }, "push");
    closeMobileDrawer();
  };
  const updateLibrarySearch = (query: string): void => {
    setSearchQuery(query);
    const searchStartedAtHome = librarySearchOriginHome || window.history.state?.librarySearchOriginHome === true;
    if (!query.trim() && searchStartedAtHome) {
      setLibrarySearchOriginHome(false);
      setLibraryHome(true);
      setLibraryTab("classified");
      setLibraryDirectory("all");
      setTypeFilter(null);
      writeLibraryRouteState({ home: true }, "replace");
      return;
    }
    if (!query.trim() && libraryHome) {
      writeLibraryRouteState({ home: true }, "replace");
      return;
    }
    if (libraryHome && query.trim()) {
      setLibrarySearchOriginHome(true);
      setLibraryHome(false);
      setLibraryTab("classified");
      setLibraryDirectory("all");
      writeLibraryRouteState({ home: false, tab: "classified", directory: "all", query, searchOriginHome: true }, "replace");
      return;
    }
    setLibrarySearchOriginHome(false);
    writeLibraryRouteState({ query, searchOriginHome: false }, "replace");
  };
  const openLibraryHome = (): void => {
    setLibraryHome(true);
    setLibrarySearchOriginHome(false);
    setLibraryTab("classified");
    setLibraryDirectory("all");
    setRelationView("all");
    setRelationId(null);
    setSearchQuery("");
    setTypeFilter(null);
    setActiveObject(null);
    setDraft(null);
    setTabs([]);
    writeLibraryRouteState({ home: true }, "push");
    closeMobileDrawer();
  };
  const openNewObject = (type?: WorldObjectType, agentTypeId?: string): void => {
    setNewObjectError("");
    if (type) setNewObjectType(type);
    setNewObjectAgentTypeId(agentTypeId || null);
    setNewObjectOpen(true);
  };
  async function runAgentTypeMutation(operation: (token: string) => Promise<unknown>): Promise<void> {
    if (!library) return;
    setAgentTypeBusy(true);
    setAgentTypeError("");
    try {
      await runWithConnection(operation);
      await loadLibrary(library.project.id);
    } catch (cause) {
      const raw = messageOf(cause);
      setAgentTypeError(/stale|revision|updated/i.test(raw) ? "内容已被更新，请重新加载。" : raw);
      throw cause;
    } finally {
      setAgentTypeBusy(false);
    }
  }
  async function runRelationMutation(operation: (token: string) => Promise<unknown>): Promise<void> {
    if (!library) return;
    setRelationBusy(true);
    setError("");
    try {
      await runWithConnection(operation);
      await loadLibrary(library.project.id);
    } catch (cause) {
      setError(messageOf(cause));
      throw cause;
    } finally {
      setRelationBusy(false);
    }
  }
  const relationOperationId = (action: string): string => `relation.ui.${action}.${crypto.randomUUID()}`;
  const openRelationView = (view: RelationView): void => {
    setRelationView(view);
    setRelationId(null);
    writeLibraryRouteState({ tab: "classified", directory: "relation", relationView: view, relationId: null }, "push");
  };
  const openRelationPresentation = (presentation: RelationPresentation): void => {
    setRelationPresentation(presentation);
    if (presentation === "graph") setRelationView("confirmed");
    writeLibraryRouteState({ tab: "classified", directory: "relation", relationView: presentation === "graph" ? "confirmed" : relationView, relationPresentation: presentation, relationId: null }, "push");
  };
  const openRelationDetail = (nextRelationId: string | null): void => {
    const nextView = libraryDirectory === "relation" ? relationView : "pending";
    setLibraryHome(false);
    setLibraryTab("classified");
    setLibraryDirectory("relation");
    setTypeFilter(null);
    setRelationView(nextView);
    setRelationId(nextRelationId);
    writeLibraryRouteState({ tab: "classified", directory: "relation", relationView: nextView, relationId: nextRelationId }, nextRelationId ? "push" : "replace");
  };
  async function saveCurrentObjectAgentType(input: { agentTypeId: string | null; fieldValues: Record<string, string | number | boolean | null> }): Promise<void> {
    if (!library || !activeObject) return;
    setObjectAgentTypeBusy(true);
    setObjectAgentTypeError("");
    try {
      const result = await runWithConnection((connectedToken) => updateWorldObjectAgentType({
        projectId: library.project.id,
        objectId: activeObject.id,
        expectedHash: activeObject.revisionToken,
        agentTypeId: input.agentTypeId,
        agentTypeFieldValues: input.fieldValues,
        token: connectedToken
      }));
      if (result.conflict) {
        setObjectAgentTypeError("内容已被更新，请重新加载。");
        return;
      }
      await loadLibrary(library.project.id);
      applyObject(result.object);
    } catch (cause) {
      const raw = messageOf(cause);
      setObjectAgentTypeError(/stale|revision|updated/i.test(raw) ? "内容已被更新，请重新加载。" : raw);
      throw cause;
    } finally {
      setObjectAgentTypeBusy(false);
    }
  }
  const customAgentTypes = agentTypeDefinitions.filter((type) => !type.builtin);
  const customTypeCounts = { ...agentTypeBoundCounts, ...Object.fromEntries((classifiedLibraryProjection?.directories || []).filter((directory) => customAgentTypes.some((type) => type.typeId === directory.typeId)).map((directory) => [directory.typeId, directory.count])) };
  const currentCustomDirectory = libraryDirectory.startsWith("agent:") ? customAgentTypes.find((type) => type.typeId === libraryDirectory.slice("agent:".length)) : null;
  const recentLibraryObjects = (library?.objects || []).filter((object) => Boolean(object.updatedAt)).sort(compareLibraryUpdatedObjects);
  const recentLibraryObjectsForHome = recentLibraryObjects.slice(0, 6);
  const unfiledLibraryObjects = (library?.objects || []).filter((object) => !(library?.placements || []).some((placement) => placement.documentId === object.id));
  const libraryListItems: LibraryListItem[] = visibleObjects.map((object) => {
    const resolvedDirectory = classifiedLibraryProjection?.directories.find((directory) => directory.objects.some((reference) => reference.objectId === object.id));
    const customType = resolvedDirectory && customAgentTypes.find((type) => type.typeId === resolvedDirectory.typeId);
    return {
      object,
      typeLabel: authorFacingObjectTypeLabel({ sourceType: object.type, agentTypeId: object.agentTypeId, agentTypes: agentTypeDefinitions }).label,
      statusLabel: object.status === "archived" ? "已归档" : undefined,
      sourceLabel: currentCustomDirectory ? currentCustomDirectory.label : undefined,
      retired: customType?.status === "retired" || resolvedDirectory?.status === "retired"
    };
  });
  const uncertainListItems: LibraryUncertainItem[] = [...(uncertainLibraryProjection?.items || []).map((item): LibraryUncertainItem => {
    if (item.kind === "world-object") {
      const object = library ? summaryForAgentReference(item, library.objects) : null;
      return { kind: "world-object", id: item.objectId, title: item.title, subtitle: object ? `${authorFacingObjectTypeLabel({ sourceType: object.type, agentTypeId: object.agentTypeId, agentTypes: agentTypeDefinitions }).label} · 待确定` : "资料 · 待确定", object, reason: item.reason };
    }
    return { kind: "proposal", id: item.proposalId, title: item.suggestedName, subtitle: `${item.objectKind} · ${item.status}`, reason: "存在未完成的识别候选", status: item.status };
  }), ...relationRecords.filter((relation) => relation.reviewState === "candidate" && !relation.archived).map((relation): LibraryUncertainItem => ({
    kind: "relation",
    id: relation.relationId,
    relationId: relation.relationId,
    title: `${library?.objects.find((object) => object.id === relation.sourceObjectId)?.title || "已失效资料引用"} ${relation.currentTypeLabel || relation.relationLabelSnapshot} ${library?.objects.find((object) => object.id === relation.targetObjectId)?.title || "已失效资料引用"}`,
    subtitle: "关系 · 待确认",
    reason: "作者建立的关系候选，仍需明确确认。"
  }))].filter((item) => !searchQuery.trim() || `${item.title}${item.subtitle}${item.reason}`.toLocaleLowerCase("zh-CN").includes(searchQuery.trim().toLocaleLowerCase("zh-CN")));
  const tianyiAgentCapability = productMode === "nuwa"
    ? "Scenario、Run、候选与检查点"
    : productMode === "event-line"
      ? "所选事件、因果与时间窗口"
      : productMode === "library"
        ? "资料对象、关系与规则检查"
        : productMode === "writing"
          ? "当前文稿、叙事单元与修改建议"
          : productMode === "data"
            ? "当前角色、轨迹、Event 与来源缺口"
            : "当前世界状态与来源";
  return <>
    {onboarding ? <Onboarding
      step={onboarding}
      genre={genre}
      ambience={ambience}
      title={title}
      folderSlug={folderSlug}
      error={error}
      onGenre={setGenre}
      onAmbience={setAmbience}
      onTitle={updateTitle}
      onFolderSlug={(value) => { setFolderEdited(true); setFolderSlug(value); }}
      onStep={setOnboarding}
      onCancel={() => { setOnboarding(null); setError(""); resetOnboarding(); }}
      onCreate={() => void submitProject()}
    /> : projectCenterOpen ? <ProjectCenter
      projects={bootstrap?.projects || []}
      activeProjectId={activeProject?.id || null}
      onOpen={(projectId) => {
        const target = bootstrap?.projects.find((project) => project.id === projectId);
        if (target) void switchProject(target);
      }}
      onCreate={() => { resetOnboarding(); setOnboarding("genre"); }}
      onBack={returnFromProjectCenter}
    /> : activeProject && bootstrap && library ? <AppShell
      projectSource={library.source}
      productMode={productMode}
      uiFontSize={controlCenterPreferences.appearance.uiFontSize}
      editorFontSize={controlCenterPreferences.appearance.editorFontSize}
      sidebarWidth={controlCenterPreferences.appearance.sidebarWidth}
      sidebarCollapsed={controlCenterPreferences.appearance.sidebarCollapsed}
      editorWidth={controlCenterPreferences.appearance.editorWidth}
      creationView={productMode === "writing" ? creationView : undefined}
      tianyiQuickPlacement={visibleTianyiQuickPlacement}
      style={shellStyle}
    >
      <ProductShellNavigation
        mode={productMode}
        collapsed={false}
        settingsOpen={settingsRouteActive}
        onMode={(mode) => void chooseProductMode(mode)}
        onOpenControlCenter={() => openSettingsRoute("home")}
        onOpenProfile={() => setProfilePanelOpen(true)}
        onBeforeMoreOpen={closeMobileTransientOverlays}
      />
      <RuntimeIdentityBanner />
      <GlobalHeader
        projectTitle={activeProjectTitle}
        mode={productMode}
        modeLabel={settingsRouteActive ? "设置" : undefined}
        tianyiOpen={visibleTianyiQuickPlacement !== "closed"}
        onToggleTianyi={activateGlobalTianyi}
        projects={bootstrap.projects}
        activeProjectId={activeProject.id}
        onSwitchProject={(projectId) => {
          const target = bootstrap.projects.find((project) => project.id === projectId);
          if (target && target.id !== activeProject.id) void switchProject(target);
        }}
        onOpenSettings={() => openSettingsRoute("home")}
      />
      <div
        className={`story-studio-workspace-stage ${hasContextSidebar ? "has-context-sidebar" : ""}`}
        data-testid="story-studio-workspace-stage"
        data-tianyi-quick-placement={visibleTianyiQuickPlacement}
        data-right-dock-host="shared"
        data-workspace-sidebar-slot={hasContextSidebar ? productMode : "page-owned"}
        data-tianyi-agent-context={tianyiAgentCapability}
      >
      {settingsRouteActive ? <SettingsPage
        projectTitle={activeProjectTitle}
        section={settingsSection}
        leaf={settingsLeaf}
        returnContext={new URL(window.location.href).searchParams.get("returnContext")}
        preferences={controlCenterPreferences}
        skills={storyStudioSystemSkills}
        contextBudget={contextBudgetSnapshot}
        storage={storageTransparency}
        storageLoading={storageLoading}
        storageError={storageError}
        storageActionBusy={storageActionBusy}
        modelServiceStatus={modelServiceStatus}
        providerConnection={providerConnection}
        providerBusy={providerBusy}
        providerError={providerError}
        onSection={openSettingsRoute}
        onLeaf={(section, leaf) => openSettingsRoute(section, new URL(window.location.href).searchParams.get("returnContext") || undefined, leaf)}
        onBack={returnFromSettings}
        onPreferences={persistControlCenterPreferences}
        onRefreshStorage={() => void refreshStorageTransparency()}
        onRevealStorage={() => void revealCurrentProject()}
        onSaveProviderProfile={(input) => saveProviderProfileFromSettings(input)}
        onReloadProviderProfile={() => reloadProviderProfileFromSettings()}
        onDiscoverProviderModels={() => discoverProviderModelsFromSettings()}
        onRevealProviderCredential={() => revealProviderCredentialFromSettings()}
        onTestProvider={() => testProviderFromSettings()}
        onMinimalInference={() => runProviderMinimalInferenceFromSettings()}
        onDisableProvider={() => disableProviderFromSettings()}
        onClearProviderCredential={() => clearProviderCredentialFromSettings()}
        listPlugins={listCuratedCreationPlugins}
        operatePlugin={operateCreationPlugin}
      /> : <>
      {hasContextSidebar && productMode !== "library" && <button type="button" className="mobile-only mobile-context-rail-trigger" aria-label="打开作者上下文" aria-expanded={libraryMobileOpen} onClick={openMobileDrawer}><FolderOpen />上下文</button>}
      {hasContextSidebar ? <ModuleSidebarHost mode={productMode} mobileOpen={libraryMobileOpen}>
        {productMode === "writing" && writing ? <WritingNavigator
          writing={writing}
          mobileOpen={libraryMobileOpen}
          collapsed={controlCenterPreferences.appearance.sidebarCollapsed}
          sidebarWidthPx={sidebarWidthPx}
          activeType={creationType}
          creationMode={creationView === "artifact" ? "editor" : "output"}
          activeArtifactId={activeOutputArtifactId}
          onOpen={(document) => void chooseWritingDocument(document)}
          onCreateChapter={() => openWritingDialog("chapter")}
          onCreateScene={(chapterId) => openWritingDialog("scene", chapterId)}
          outputArtifacts={outputArtifacts}
          contextCounts={contextCounts}
          onOpenOutputArtifact={openCreationArtifact}
          onOpenTypeMenu={() => void chooseProductMode("writing")}
          onOpenCreationOutput={openCreationCenter}
          onCloseMobile={closeMobileDrawer}
          onToggleCollapsed={() => persistControlCenterPreferences({ ...controlCenterPreferences, appearance: { ...controlCenterPreferences.appearance, sidebarCollapsed: !controlCenterPreferences.appearance.sidebarCollapsed } })}
          onSidebarResize={resizeSidebar}
          onSelectContext={selectAuthorContext}
        /> : productMode === "library" ? <WorldLibraryPanel
          home={libraryHome}
          tab={libraryTab}
          directory={libraryDirectory}
          searchQuery={searchQuery}
          customTypes={customAgentTypes}
          customTypeCounts={customTypeCounts}
          folders={library.folders}
          builtinCounts={{ all: library.objects.length, character: library.counts.character, item: library.counts.item, location: library.counts.location, faction: library.counts.faction }}
          relationCount={relationRecords.filter((relation) => !relation.archived).length}
          mobileOpen={libraryMobileOpen}
          collapsed={controlCenterPreferences.appearance.sidebarCollapsed}
          sidebarWidthPx={libraryRailWidthPx}
          onTab={selectLibraryTab}
          onOpenHome={openLibraryHome}
          onDirectory={selectLibraryDirectory}
          onSearch={updateLibrarySearch}
          onToggleCollapsed={() => persistControlCenterPreferences({ ...controlCenterPreferences, appearance: { ...controlCenterPreferences.appearance, sidebarCollapsed: !controlCenterPreferences.appearance.sidebarCollapsed } })}
          onSidebarResize={setLibraryRailWidthPx}
          onCloseMobile={closeMobileDrawer}
        /> : <ModuleContextSidebar mode={productMode} projectTitle={activeProjectTitle} counts={contextCounts} mobileOpen={libraryMobileOpen} onCloseMobile={closeMobileDrawer} onSelect={selectAuthorContext} />}
      </ModuleSidebarHost> : null}
      {libraryMobileOpen && <button type="button" className="sidebar-mobile-backdrop mobile-only" aria-label="点击遮罩关闭侧栏" onClick={closeMobileDrawer} />}
      {fixtureKind === "work-version-creation" && (productMode === "writing" || productMode === "event-line" || productMode === "library") ? <WorkVersionBoundCreationWorkspace
        projectId={activeProject.id}
        routeKind="fixture"
        surface={productMode === "event-line" ? "event" : productMode === "library" ? "story-unit" : "creation"}
        load={(fixtureCase) => getWorkVersionBoundCreationFixture(activeProject.id, fixtureCase)}
        operate={(action, input = {}) => runWithConnection((connectedToken) => runWorkVersionBoundCreationFixture({ projectId: activeProject.id, action, token: connectedToken, ...input }))}
        onOpenEvent={(eventId, snapshot) => {
          void chooseProductMode("event-line").then(() => {
            const next = new URL(window.location.href); next.pathname = "/event-line"; next.search = "";
            next.searchParams.set("fixture", "work-version-creation"); next.searchParams.set("event", eventId); next.searchParams.set("returnTo", "work-version-creation");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "event-line", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenStoryUnit={(storyUnitId, snapshot) => {
          void chooseProductMode("library").then(() => {
            const next = new URL(window.location.href); next.pathname = "/library"; next.search = "";
            next.searchParams.set("fixture", "work-version-creation"); next.searchParams.set("storyUnit", storyUnitId); next.searchParams.set("returnTo", "work-version-creation");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "library", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onReturn={(snapshot: CreationReturnSnapshot) => {
          void chooseProductMode("writing").then(() => {
            const next = new URL(window.location.href); next.pathname = "/creation"; next.search = "";
            next.searchParams.set("fixture", "work-version-creation"); next.searchParams.set("view", snapshot.returnView); if (snapshot.artifactId) next.searchParams.set("artifact", snapshot.artifactId); next.searchParams.set("returned", "1");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "writing", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt)}
      /> : productMode === "event-line" && !fixtureKind && !creationSourceReturn && !currentUrl.searchParams.has("event") && !storyExploration && normalEventCreationRoute ? <NormalEventCreationWorkspace
        projectId={activeProject.id}
        load={(input = {}) => getNormalEventCreationState({ projectId: activeProject.id, ...input })}
        operate={async (action, input = {}) => {
          const result = await runWithConnection((connectedToken) => runNormalEventCreationAction({ projectId: activeProject.id, action, token: connectedToken, ...input }));
          if (action === "confirm") await refreshEventAuthoringRead();
          return result;
        }}
        onOpenCreation={({ storyUnitId, eventId }) => {
          void chooseProductMode("writing").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/creation"; next.search = "";
            next.searchParams.set("view", "source");
            next.searchParams.set("storyUnitId", storyUnitId);
            next.searchParams.append("eventId", eventId);
            window.history.pushState({ ...(window.history.state ?? {}), workspace: "writing" }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
      /> : normalCreationSourceRoute ? <WorkVersionBoundCreationWorkspace
        projectId={activeProject.id}
        routeKind="normal"
        surface={productMode === "library" ? "story-unit" : "creation"}
        load={() => getCreationSourcePortState({
          projectId: activeProject.id,
          workVersionId: currentUrl.searchParams.get("workVersionId") || undefined,
          storyUnitId: currentUrl.searchParams.get("storyUnitId") || undefined,
          eventIds: currentUrl.searchParams.getAll("eventId")
        })}
        operate={(action, input = {}) => runWithConnection((connectedToken) => runCreationSourcePortAction({
          projectId: activeProject.id,
          action: action === "reconcile" || action === "advance-root" || action === "archive-root" ? "recover-source" : action,
          workVersionId: currentUrl.searchParams.get("workVersionId") || undefined,
          storyUnitId: currentUrl.searchParams.get("storyUnitId") || undefined,
          eventIds: currentUrl.searchParams.getAll("eventId"),
          token: connectedToken,
          ...input
        }))}
        onOpenEvent={(eventId, snapshot) => {
          void refreshEventAuthoringRead().then(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))).then(() => {
            const next = new URL(window.location.href); next.pathname = "/event-line"; next.search = "";
            next.searchParams.set("event", eventId); next.searchParams.set("returnTo", "creation-source");
            window.history.pushState({ ...(window.history.state ?? {}), workspace: "event-line", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenStoryUnit={(storyUnitId, snapshot) => {
          const next = new URL(window.location.href); next.pathname = "/library"; next.search = "";
          next.searchParams.set("storyUnit", storyUnitId); next.searchParams.set("returnTo", "creation-source");
          window.history.pushState({ ...(window.history.state ?? {}), workspace: "library", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onReturn={(snapshot: CreationReturnSnapshot) => {
          const next = new URL(window.location.href); next.pathname = "/creation"; next.search = "";
          next.searchParams.set("view", snapshot.returnView); if (snapshot.artifactId) next.searchParams.set("artifact", snapshot.artifactId); next.searchParams.set("returned", "1");
          window.history.pushState({ ...(window.history.state ?? {}), workspace: "writing", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt)}
      /> : productMode === "world" && showWorldHome ? <WorldHomeWorkbench
        project={{ ...activeProject, title: activeProjectTitle }}
        tabs={worldTabs}
        counts={library.counts}
        objects={library.objects}
        activeWritingChapter={activeWritingChapter}
        activeWritingDocument={writing?.activeDocument || null}
        confirmedEvents={verifiedCanonEvents}
        candidateCount={(goldenLoopResult?.nuwa.candidates.length || 0) - rejectedGoldenLoopCandidateIds.length - acceptedGoldenLoopCandidateIds.length}
        providerConnected={Boolean(modelServiceStatus?.providers.find((provider) => provider.id === "siliconflow")?.configured)}
        storage={storageTransparency}
        storageLoading={storageLoading}
        storageError={storageError}
        onOpenLibrary={() => void chooseProductMode("library")}
        onOpen={(tab) => void openWorldTab(tab)}
        onContinueWriting={() => void chooseProductMode("writing")}
        onOpenEventLine={() => void chooseProductMode("event-line")}
        onGiveToTianyi={(object) => {
          if (object) {
            if (object.type === "event") {
              addTianyiEventReference(object);
              openFullTianyi();
              return;
            }
            const ref = worldObjectContextRef(activeProject.id, object);
            if (ref) addTianyiObjectContextRef(ref);
          }
          openFullTianyi();
        }}
        onOpenObject={(object) => void openObject(object, "library")}
        onCreateObject={() => { setNewObjectError(""); setNewObjectOpen(true); }}
        onCreateVisual={openVisualDialog}
        onCreateFolder={() => { setFolderError(""); setFolderTitle(""); setFolderDialogOpen(true); }}
        onStorageSettings={() => setStorageSettingsOpen(true)}
      /> : productMode === "library" && currentUrl.searchParams.get("view") === "character-state" ? <CharacterStateWorkspace
        projectId={activeProject.id}
        projectTitle="潮痕来信 · 隔离演示"
        onBack={() => {
          const next = new URL(window.location.href);
          ["view", "fixture", "character", "branch", "position", "stateCase", "selected", "returned"].forEach((key) => next.searchParams.delete(key));
          window.history.replaceState({ ...(window.history.state ?? {}), workspace: "library" }, "", `/library${next.search}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onOpenFate={(snapshot) => {
          window.history.replaceState({ ...(window.history.state ?? {}), characterStateReturn: snapshot }, "", window.location.href);
          void chooseProductMode("data").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/data";
            next.search = "";
            next.searchParams.set("view", "character-fate"); next.searchParams.set("fixture", "character-fate"); next.searchParams.set("character", snapshot.characterId); next.searchParams.set("trajectory", "all"); next.searchParams.set("axis", "narrative"); next.searchParams.set("case", "complete"); next.searchParams.set("branch", snapshot.branchId); next.searchParams.set("returnTo", "character-state");
            window.history.replaceState({ ...(window.history.state ?? {}), characterStateReturn: snapshot, workspace: "data", returnTo: "character-state" }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenEvent={(eventId, snapshot) => {
          window.history.replaceState({ ...(window.history.state ?? {}), characterStateReturn: snapshot }, "", window.location.href);
          void chooseProductMode("event-line").then(() => {
            const next = new URL(window.location.href); next.searchParams.set("fixture", "character-state"); next.searchParams.set("event", eventId); next.searchParams.set("returnTo", "character-state");
            window.history.replaceState({ ...(window.history.state ?? {}), characterStateReturn: snapshot, workspace: "event-line", selectedEventId: eventId, returnTo: "character-state" }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt)}
        loadImpact={() => getCharacterStateImpactFixture(activeProject.id)}
        runImpact={(action) => runWithConnection((connectedToken) => runCharacterStateImpactFixture({ projectId: activeProject.id, action, token: connectedToken }))}
      /> : productMode === "library" && sourceImportView ? <SourceImportReviewWorkspace
        projectTitle={activeProjectTitle}
        documents={sourceImportDocuments}
        activeDocumentId={sourceImportActiveId}
        busy={sourceImportBusy}
        error={sourceImportError}
        onClose={() => setSourceImportView(false)}
        onSelect={(sourceDocumentId) => setSourceImportActiveId(sourceDocumentId)}
        onImport={async (file) => { await importLibraryText(file, null); }}
        onExtract={extractSourceImport}
        onDecide={decideSourceImport}
        onHandoff={handoffSourceImport}
      /> : productMode === "library" && workspaceMode === "library" && !activeObject && libraryHome ? <LibraryHomeWorkbench
        projectTitle={activeProjectTitle}
        objects={library.objects}
        uncertainCount={uncertainListItems.length}
        unfiledCount={unfiledLibraryObjects.length}
        customTypes={customAgentTypes}
        customTypeCounts={customTypeCounts}
        builtinCounts={{ all: library.objects.length, character: library.counts.character, item: library.counts.item, location: library.counts.location, faction: library.counts.faction }}
        relationCount={relationRecords.filter((relation) => !relation.archived).length}
        recentObjects={recentLibraryObjectsForHome}
        visualDocumentCount={library.visualDocuments.length}
        sourceImportCount={sourceImportDocuments.length}
        foldersCount={library.folders.filter((folder) => folder.kind === "folder").length}
        onCreateObject={() => openNewObject()}
        onOpenDirectory={selectLibraryDirectory}
        onOpenTab={selectLibraryTab}
        onOpenAuxiliary={selectLibraryAuxiliary}
        onOpenImportReview={() => openSourceImportReview()}
        onOpenObject={(object) => void openObject(object, "library")}
        onOpenNavigation={openMobileDrawer}
        focusRequest={libraryFocusRequest}
      /> : productMode === "library" && workspaceMode === "library" && !activeObject && libraryDirectory === "relation" ? <RelationAuthoringWorkbench
        projectTitle={activeProjectTitle}
        objects={library.objects}
        relations={relationRecords}
        relationTypes={relationTypes}
        view={relationView}
        presentation={relationPresentation}
        relationId={relationId}
        query={searchQuery}
        busy={relationBusy}
        onOpenNavigation={openMobileDrawer}
        onView={openRelationView}
        onPresentation={openRelationPresentation}
        onOpenRelation={openRelationDetail}
        onOpenObject={(object) => void openObject(object, "library")}
        onFindDuplicates={(input) => getRelationDuplicateSuggestions({ projectId: activeProject.id, ...input })}
        onCreate={(input) => runRelationMutation((connectedToken) => createRelationCandidate({ projectId: activeProject.id, ...input, operationId: relationOperationId("create"), token: connectedToken }))}
        onConfirm={(relation) => runRelationMutation((connectedToken) => confirmRelationCandidate({ projectId: activeProject.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: relationOperationId("confirm"), token: connectedToken }))}
        onReject={(relation) => runRelationMutation((connectedToken) => rejectRelationCandidate({ projectId: activeProject.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: relationOperationId("reject"), token: connectedToken }))}
        onArchive={(relation) => runRelationMutation((connectedToken) => archiveConfirmedRelation({ projectId: activeProject.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: relationOperationId("archive"), token: connectedToken }))}
        onAppendEvidence={(relation, evidenceRefs) => runRelationMutation((connectedToken) => appendRelationEvidence({ projectId: activeProject.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, evidenceRefs, operationId: relationOperationId("append-evidence"), token: connectedToken }))}
        onCorrect={(relation, input) => runRelationMutation((connectedToken) => createRelationCorrectionCandidate({ projectId: activeProject.id, relationId: relation.relationId, supersedesRelationId: relation.relationId, expectedRelationRevision: relation.revision, ...input, operationId: relationOperationId("correction"), token: connectedToken }))}
      /> : productMode === "library" && workspaceMode === "library" && !activeObject && libraryDirectory === "agent-types" ? <AgentTypeManagementWorkbench
        projectTitle={activeProjectTitle}
        customTypes={customAgentTypes}
        customTypeCounts={customTypeCounts}
        busy={agentTypeBusy}
        error={agentTypeError}
        onOpenNavigation={openMobileDrawer}
        onCreate={(input) => runAgentTypeMutation((connectedToken) => createAgentType({ projectId: activeProject.id, ...input, expectedCatalogRevision: agentTypeCatalogRevision, token: connectedToken }))}
        onUpdate={(type, input) => runAgentTypeMutation((connectedToken) => updateAgentType({ projectId: activeProject.id, typeId: type.typeId, expectedTypeRevision: type.revision, expectedCatalogRevision: agentTypeCatalogRevision, ...input, token: connectedToken }))}
        onActivate={(type) => runAgentTypeMutation((connectedToken) => activateAgentType({ projectId: activeProject.id, typeId: type.typeId, expectedTypeRevision: type.revision, expectedCatalogRevision: agentTypeCatalogRevision, token: connectedToken }))}
        onRetire={(type) => runAgentTypeMutation((connectedToken) => retireAgentType({ projectId: activeProject.id, typeId: type.typeId, expectedTypeRevision: type.revision, expectedCatalogRevision: agentTypeCatalogRevision, token: connectedToken }))}
        onDelete={(type) => runAgentTypeMutation((connectedToken) => deleteAgentType({ projectId: activeProject.id, typeId: type.typeId, expectedTypeRevision: type.revision, expectedCatalogRevision: agentTypeCatalogRevision, token: connectedToken }))}
      /> : productMode === "library" && workspaceMode === "library" && !activeObject ? <LibraryDirectoryWorkbench
        projectTitle={activeProjectTitle}
        tab={libraryTab}
        directory={libraryDirectory}
        searchQuery={searchQuery}
        items={libraryListItems}
        uncertainItems={uncertainListItems}
        classifiedProjection={classifiedLibraryProjection}
        uncertainProjection={uncertainLibraryProjection}
        customTypes={customAgentTypes}
        folders={library.folders}
        visualDocuments={library.visualDocuments}
        sourceImportCount={sourceImportDocuments.length}
        error={error}
        onOpenObject={(object) => void openObject(object, "library")}
        onOpenRelation={(nextRelationId) => openRelationDetail(nextRelationId)}
        onCreateObject={openNewObject}
        onOpenImportReview={() => openSourceImportReview()}
        onImportFile={(file) => importLibraryText(file, null)}
        onCreateFolder={() => { setFolderError(""); setFolderTitle(""); setFolderDialogOpen(true); }}
        onCreateVisual={openVisualDialog}
        onOpenVisual={(document) => {
          const match = visualWorkbench?.documents.find((item) => item.id === document.id);
          if (match) void openWorldTab({ kind: "visual", id: match.id, title: match.title, type: match.type, relativePath: match.relativePath });
        }}
        onCreateCustomCategory={createCustomLibraryCategory}
        onRenameCustomCategory={renameCustomLibraryCategory}
        onMoveCustomCategory={moveCustomLibraryCategory}
        onDeleteCustomCategory={deleteCustomLibraryCategory}
        onOpenNavigation={openMobileDrawer}
        focusRequest={libraryFocusRequest}
      /> : productMode === "library" && workspaceMode === "library" ? <CardWorkbench
        projectId={activeProject.id}
        projectTitle={activeProjectTitle}
        object={activeObject}
        tabs={worldTabs}
        draft={draft}
        objects={library.objects}
        relations={relationRecords}
        visualDocuments={library.visualDocuments}
        templates={cardTemplates}
        saveState={saveState}
        conflictKind={objectConflictKind}
        conflictObject={conflictObject}
        authorityMode={activeObjectAuthorityMode}
        agentTypes={agentTypeDefinitions}
        agentTypeBusy={objectAgentTypeBusy}
        agentTypeError={objectAgentTypeError}
        onDraft={changeDraft}
        onSave={() => void saveObject()}
        onSaveAgentType={saveCurrentObjectAgentType}
        onReloadConflict={reloadConflict}
        onOpenObject={(object) => void openObject(object, "card")}
        onOpenRelation={(nextRelationId) => openRelationDetail(nextRelationId)}
        onOpenWorldTab={(tab) => void openWorldTab(tab)}
        onCloseWorldTab={(tab) => void closeWorldTab(tab)}
        onOpenVisualReference={(reference, context) => void openVisualReference(reference, context)}
        onImportImage={importImageAsset}
        onCreateObject={() => { setNewObjectError(""); setNewObjectOpen(true); }}
        onCreateVisual={openVisualDialog}
        onCreateFolder={() => { setFolderError(""); setFolderTitle(""); setFolderDialogOpen(true); }}
        onRevisionHistory={() => activeObject && (activeObject.type === "character" && activeObject.card.revisionToken ? void openCharacterCardHistory() : void openRevisionHistory({ ref: { kind: "object", id: activeObject.id }, title: activeObject.title, expectedHash: activeObject.revisionToken }))}
        onSaveTemplate={saveCurrentCardAsTemplate}
        onPreviewTemplate={previewCurrentTemplate}
        onApplyTemplate={applyCurrentTemplate}
        onTemplateHistory={(template) => void openRevisionHistory({ ref: { kind: "template", id: template.id }, title: template.label, expectedHash: template.revisionToken })}
        onAbandonPlanning={(object) => void abandonPlanningFromCard(object)}
        onDuplicateObject={() => void duplicateCurrentObject()}
        onArchiveObject={() => void archiveCurrentObject()}
        onRestoreObject={() => void restoreCurrentObject()}
        onDeleteObject={() => void deleteCurrentObject()}
        onPlanningLifecycle={(action) => void changeCurrentPlanningLifecycle(action)}
        onCloseDocument={() => void closeFullObject()}
        onOpenLibrary={openMobileDrawer}
        onMode={(mode) => void chooseVisualMode(mode)}
        onOpenRules={() => setTypeFilter("rule")}
        tianyiContextRef={activeObject ? worldObjectContextRef(activeProject.id, activeObject) : null}
        eventReference={activeObject?.type === "event" ? createStoryStudioEventReference({ projectId: activeProject.id, event: activeObject, requestedUse: "constraint" }) : null}
        onGiveToTianyi={(ref) => {
          addTianyiObjectContextRef(ref);
          openFullTianyi();
        }}
        onGiveEventToTianyi={(reference) => {
          setTianyiEventReferences((current) => current.some((item) => storyStudioEventReferenceKey(item) === storyStudioEventReferenceKey(reference)) ? current : [...current, reference].slice(0, 4));
          openFullTianyi();
        }}
        onOpenCharacterState={activeObject?.type === "character" ? () => {
          const next = new URL(window.location.href); next.pathname = "/library"; next.search = ""; next.searchParams.set("view", "character-state"); next.searchParams.set("fixture", "character-state"); next.searchParams.set("character", activeObject.title === "沈砚" ? "fixture.character.shen-yan" : activeObject.title === "阿芜" ? "fixture.character.a-wu" : activeObject.id); next.searchParams.set("branch", "branch.main"); next.searchParams.set("position", "3"); next.searchParams.set("stateCase", "complete"); window.history.pushState({ ...(window.history.state ?? {}), workspace: "library" }, "", `${next.pathname}${next.search}`); window.dispatchEvent(new PopStateEvent("popstate"));
        } : undefined}
      /> : productMode === "library" && visualWorkbench && workspaceMode !== "library" ? <VisualWorkbench
        projectId={activeProject.id}
        projectTitle={activeProjectTitle}
        mode={workspaceMode}
        worldTabs={worldTabs}
        documents={visualWorkbench.documents}
        primaryDocument={visualWorkbench.primaryDocument}
        secondaryDocument={visualWorkbench.secondaryDocument}
        splitView={visualWorkbench.splitView}
        objects={library.objects}
        inspectedObject={visualObject}
        selection={selection}
        intelligenceOverlay={intelligenceOverlay}
        onMode={(mode) => void chooseVisualMode(mode)}
        onCreate={openVisualDialog}
        onOpen={(document, pane) => void chooseVisualDocument(document, pane)}
        onOpenWorldTab={(tab) => void openWorldTab(tab)}
        onCloseWorldTab={(tab) => void closeWorldTab(tab)}
        onSplit={(enabled, secondaryDocument) => { if (enabled) setVisualObject(null); void changeSplitView(enabled, secondaryDocument); }}
        onSwap={() => void swapSplitView()}
        onSave={saveVisualDocument}
        onCreateTimelinePlanningEvent={createTimelinePlanningEvent}
        onAddExistingTimelinePlanningEvent={addExistingTimelinePlanningEvent}
        onValidateTimelineDocument={validateTimelineMutation}
        onReviewTimelinePlanningEvent={async (planningEventId) => { await openPlanningEventImpactReview(planningEventId); }}
        onAbandonTimelinePlanningEvent={abandonTimelinePlanningEvent}
        onImportAsset={importMapAsset}
        onImportImage={importImageAsset}
        onOpenObject={(object) => void inspectVisualObject(object, "library")}
        onSelectObject={(object, source, documentId, blockId) => void selectVisualObject(object, source, documentId, blockId || null)}
        onSelectRelation={(source, documentId, relationId) => void selectVisualRelation(source, documentId, relationId)}
        onOpenFullObject={(object) => void openFullObject(object)}
        onOpenVisualReference={(reference) => void openVisualReference(reference)}
        onCloseObject={() => setVisualObject(null)}
        onOpenLibrary={openMobileDrawer}
        onCreateFolder={() => { setFolderError(""); setFolderTitle(""); setFolderDialogOpen(true); }}
        onRevisionHistory={(document) => void openRevisionHistory({ ref: { kind: "visual", id: document.id }, title: document.title, expectedHash: document.contentHash })}
        onGiveToTianyi={(input) => {
          if (input.kind === "event") setTianyiEventReferences((current) => current.some((item) => storyStudioEventReferenceKey(item) === storyStudioEventReferenceKey(input.reference)) ? current : [...current, input.reference].slice(0, 4));
          else addTianyiObjectContextRef(input.ref);
          captureTianyiReturnSnapshot();
          openQuickTianyi();
        }}
      /> : productMode === "writing" && creationView === "media" ? <CreationMediaManager catalog={creationMedia} busy={creationMediaBusy} error={creationMediaError} onBack={openCreationCenter} onCreate={createMediaRecord} onReplace={replaceMediaRecord} onDelete={deleteMediaRecord}
      /> : productMode === "writing" && creationView === "artifact" && activeOutputArtifactId && outputArtifacts.find((artifact) => artifact.id === activeOutputArtifactId) ? <OutputArtifactWorkbench
        artifact={outputArtifacts.find((artifact) => artifact.id === activeOutputArtifactId)!}
        mediaAssets={creationMedia.assets}
        references={library.objects.flatMap((object) => object.type === "character" || object.type === "location" || object.type === "event" ? [{ id: object.id, type: object.type, label: object.title, revision: object.revisionToken }] : [])}
        onSave={(input) => saveOutputArtifactFromWriting(outputArtifacts.find((artifact) => artifact.id === activeOutputArtifactId)!, input)}
        onRevisionHistory={() => {
          const artifact = outputArtifacts.find((item) => item.id === activeOutputArtifactId);
          if (artifact) void openRevisionHistory({ ref: { kind: "artifact", id: artifact.id }, title: artifact.title, expectedHash: artifact.version });
        }}
        onOpenTianyi={() => { captureTianyiReturnSnapshot(); openQuickTianyi(); }}
        onOpenDerivedSource={() => void chooseProductMode("multiverse")}
        onBack={openCreationCenter}
      /> : productMode === "writing" ? creationRouteMode === "plugins" ? <CreationPluginCenter onBack={() => openCreationRoute("hub")} list={listCuratedCreationPlugins} operate={operateCreationPlugin} /> : <CreationHome projectId={activeProject.id} projectTitle={activeProjectTitle} storyUnits={storyUnits} artifacts={outputArtifacts} routeMode={creationRouteMode} onRouteMode={openCreationRoute} onOpenPluginCenter={() => openCreationRoute("plugins")} listInstalledAdapters={listCuratedCreationPluginAdapters} onExecuteInstalledPlugin={executeInstalledCreationPlugin} onOpenMultiverse={() => void chooseProductMode("multiverse").then(() => openMultiverseRoute("adaptation"))} onOpenEventLine={() => void chooseProductMode("event-line")} onOpenNuwa={() => void chooseProductMode("nuwa")} onOpenLibrary={() => void chooseProductMode("library")} onOpen={openCreationArtifact} onRename={(artifact, title) => void renameCreationArtifact(artifact, title)} onArchive={(artifact) => void archiveCreationArtifact(artifact)} onOpenMedia={openCreationMedia} onSaveExternalArtifact={saveExternalCreationArtifact}
      /> : productMode === "multiverse" && fixtureKind === "multiverse-single-derived" ? <MultiverseSingleDerivedWorkspace
        projectId={activeProject.id}
        surface="multiverse"
        load={(surface, fixtureCase) => getMultiverseSingleDerivedFixture(activeProject.id, { ...(surface ? { surface } : {}), ...(fixtureCase ? { fixtureCase } : {}) })}
        operate={(action, input = {}) => runWithConnection((connectedToken) => runMultiverseSingleDerivedFixture({ projectId: activeProject.id, action, token: connectedToken, ...input }))}
        onOpenNuwa={() => {
          void chooseProductMode("nuwa").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/nuwa";
            next.search = "";
            next.searchParams.set("fixture", "multiverse-single-derived");
            next.searchParams.set("view", "save-version");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "nuwa" }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onReturnMultiverse={(view) => {
          void chooseProductMode("multiverse").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/multiverse";
            next.search = "";
            next.searchParams.set("fixture", "multiverse-single-derived");
            next.searchParams.set("view", view);
            if (view === "compare") {
              next.searchParams.set("source", "fixture.version.root");
              next.searchParams.set("derived", "fixture.version.old-name-ledger");
            }
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "multiverse" }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenEventLine={(eventId, returnState, authorControlReceiptId) => {
          void refreshEventAuthoringRead().then(() => chooseProductMode("event-line")).then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/event-line";
            next.search = "";
            next.searchParams.set("fixture", "multiverse-single-derived");
            next.searchParams.set("event", eventId);
            next.searchParams.set("receipt", authorControlReceiptId);
            next.searchParams.set("returnTo", "multiverse-single-derived");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "event-line", returnTo: "multiverse-single-derived", selectedEventId: eventId, multiverseReturn: returnState }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt)}
      /> : productMode === "multiverse" ? <MultiverseWorkbench
        projectTitle={activeProjectTitle}
        units={storyUnits}
        artifacts={outputArtifacts}
        routeMode={multiverseRouteMode}
        onRouteMode={openMultiverseRoute}
        onOpenArtifact={(artifact) => { void chooseProductMode("writing").then(() => openCreationArtifact(artifact)); }}
        onCreateLine={createDerivedEventLine}
        onReviewAlignment={reviewDerivedEventAlignment}
        onMarkReady={markDerivedEventLineReady}
        onHandoff={handoffDerivedEventLine}
      /> : productMode === "nuwa" && fixtureKind === "multiverse-single-derived" ? <MultiverseSingleDerivedWorkspace
        projectId={activeProject.id}
        surface="nuwa"
        load={(surface, fixtureCase) => getMultiverseSingleDerivedFixture(activeProject.id, { ...(surface ? { surface } : {}), ...(fixtureCase ? { fixtureCase } : {}) })}
        operate={(action, input = {}) => runWithConnection((connectedToken) => runMultiverseSingleDerivedFixture({ projectId: activeProject.id, action, token: connectedToken, ...input }))}
        onOpenNuwa={() => undefined}
        onReturnMultiverse={(view) => {
          void chooseProductMode("multiverse").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/multiverse";
            next.search = "";
            next.searchParams.set("fixture", "multiverse-single-derived");
            next.searchParams.set("view", view);
            next.searchParams.set("source", "fixture.version.root");
            next.searchParams.set("derived", "fixture.version.old-name-ledger");
            if (view === "compare") next.searchParams.set("selected", "fixture.change.event.old-name-check");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "multiverse" }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onOpenEventLine={() => undefined}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt)}
      /> : productMode === "nuwa" && fixtureKind === "nuwa-bounded" ? <NuwaBoundedScenarioWorkspace
        projectId={activeProject.id}
        projectTitle="潮痕来信 · 隔离演示"
        load={(fixtureCase) => getNuwaBoundedFixture(activeProject.id, fixtureCase)}
        operate={(action, input = {}) => runWithConnection((connectedToken) => runNuwaBoundedFixture({ projectId: activeProject.id, action, token: connectedToken, ...input }))}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt)}
        onOpenEventLine={(eventId) => {
          void chooseProductMode("event-line").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/event-line";
            next.search = "";
            next.searchParams.set("fixture", "nuwa-bounded");
            if (eventId) next.searchParams.set("event", eventId);
            next.searchParams.set("returnTo", "nuwa-bounded");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "event-line", returnTo: "nuwa-bounded", selectedEventId: eventId || null }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
      /> : productMode === "nuwa" && tianyiSurface !== "intelligence" ? <NuwaPrimaryWorkspace
        projectTitle={activeProjectTitle}
        contextLabel={writing?.activeDocument?.title || activeObject?.title || activeProjectTitle}
        contextDetail={`${productModeLabel(tianyiReturnSnapshotRef.current?.destination || "world")} · ${tianyiObjectContextRefs.length} 项显式上下文 · ${verifiedCanonEvents.length} 条已确认事件`}
        sourceLabel={nuwaSourceLabel}
        approvedBriefAvailable={executionBrief?.authorApprovalState === "approved"}
        boundBrief={executionBrief?.authorApprovalState === "approved" ? executionBrief : null}
        boundExploration={executionBrief && storyExploration && bridgeExplorationId === storyExploration.id ? storyExploration : null}
        boundResultReceipt={executionBrief && storyExploration && bridgeExplorationId === storyExploration.id ? nuwaResultReceipt : null}
        boundBusy={impactBusy}
        boundError={nuwaPresentationError(impactError)}
        providerReady={Boolean(modelServiceStatus?.providers.find((provider) => provider.id === "siliconflow")?.configured)}
        providerModelId={providerConnection?.modelId || modelServiceStatus?.profiles[0]?.modelId || null}
        livePilotPriceStatus={modelServiceStatus?.livePilot?.priceStatus || "unverified"}
        livePilotFixtureReady={modelServiceStatus?.livePilot?.fixtureStatus === "configured"}
        attentionContextHash={executionBrief?.attentionContext?.capsuleHash || null}
        result={goldenLoopResult}
        history={candidateReviewHistory}
        rejectedCandidateIds={rejectedGoldenLoopCandidateIds}
        acceptedCandidateIds={acceptedGoldenLoopCandidateIds}
        busy={goldenLoopBusy}
        error={goldenLoopError}
        goal={nuwaGoal}
        onGoal={setNuwaGoal}
        onStartNew={startNewNuwaDraft}
        onRun={() => void submitGoldenLoop(nuwaGoal)}
        onCancel={cancelGoldenLoop}
        onRunBound={() => void runExplorationAction("run")}
        onSynthesizeBound={() => void runExplorationAction("synthesize")}
        onSubmitBoundRoute={(routeId) => void submitExplorationRoute(routeId)}
        onRejectBoundRoute={(routeId) => void rejectExplorationRoute(routeId)}
        onCancelBound={() => void runExplorationAction("cancel")}
        onReject={(candidateId) => void rejectGoldenLoopCandidate(candidateId)}
        onReview={(candidate) => void reviewGoldenLoopCandidate(candidate)}
        onAbandonReview={() => void abandonCurrentCandidateReview()}
        onOpenHistory={openCandidateReviewHistory}
        onReopenImpactReview={(reviewId) => void reopenImpactReview(reviewId, null)}
        onPrepareBrief={openFullTianyi}
        onReturnSource={() => void returnFromTianyi()}
        permissionControl={<AgentPermissionStatus projectId={activeProject.id} withConnection={runWithConnection} />}
        dockState={nuwaPageDockState}
        onDockState={setNuwaPageDockState}
        onOpenTianyi={() => openFullTianyi(writing?.activeDocument ? "writing" : "world", "conversation")}
        onOpenEventLine={() => void chooseProductMode("event-line")}
        onOpenLibrary={openMobileDrawer}
        onChooseUnit={() => void chooseProductMode("writing")}
        standaloneExploration={storyExploration?.source.kind === "standalone" ? storyExploration : null}
        onStartStandalone={(input) => void startStandaloneNuwa(input)}
        onRunStandalone={() => void runExplorationAction("run")}
        onSynthesizeStandalone={() => void runExplorationAction("synthesize")}
        onSendStandaloneToCreation={(route, type) => void sendStandalonePossibilityToCreation(route, type)}
        onSaveTemporaryCharacter={saveTemporaryNuwaCharacter}
        onCreateFromPossibility={(candidate) => void openCreationFromPossibility(candidate)}
        sceneRuntime={nuwaSceneRuntime}
        sceneRuntimeComparison={nuwaSceneComparison}
        sceneRuntimeReplay={nuwaSceneReplay}
        sceneRuntimeBusy={nuwaSceneBusy}
        sceneRuntimeError={nuwaSceneError}
        onSceneRuntimeAction={(action, input) => void runNuwaSceneRuntimeAction(action, input)}
        onSelectSceneRun={(runId) => void selectNuwaSceneRuntimeRun(runId)}
        directorState={nuwaDirectorState}
        directorBusy={nuwaDirectorBusy}
        directorError={nuwaDirectorError}
        onDirectorAction={(action) => void runNuwaDirectorAction(action)}
        stage={nuwaStage}
        onStageChange={selectNuwaStage}
        recoveryNotice={nuwaRecoveryNotice}
        onDismissRecoveryNotice={() => setNuwaRecoveryNotice(null)}
      /> : (productMode === "nuwa" || productMode === "tianyi") && tianyiSurface === "intelligence" ? <IntelligenceWorkbench
        projectTitle={activeProjectTitle}
        currentScene={writing?.activeDocument || null}
        review={impactReview}
        changeSet={authorChangeSet}
        exploration={storyExploration}
        executionBrief={executionBrief}
        resultReceipt={nuwaResultReceipt}
        history={reviewHistory}
        document={intelligenceDocument}
        busy={impactBusy}
        error={impactError}
        onDocument={(document) => void chooseIntelligenceDocument(document)}
        onOpenLibrary={openMobileDrawer}
        onCreateReview={(goal) => void submitImpactReview(goal)}
        onChoose={(optionId, action, authorContent) => void submitImpactChoice(optionId, action, authorContent)}
        onCreateChangeSet={() => void createPendingChangeSet()}
        onDryRunChangeSet={() => void runChangeSetAction("dry-run")}
        onApplyChangeSet={() => void runChangeSetAction("apply")}
        onAbandonChangeSet={() => void runChangeSetAction("abandon")}
        onCreateExploration={(goal) => void createExploration(goal)}
        onRunExploration={() => void runExplorationAction("run")}
        onSynthesizeExploration={() => void runExplorationAction("synthesize")}
        onSubmitExplorationRoute={(routeId) => void submitExplorationRoute(routeId)}
        onCancelExploration={() => void runExplorationAction("cancel")}
        onReturnWriting={returnFromImpactReview}
        onReturnDestination={returnFromNuwaReceipt}
        onReopenReview={(reviewId, changeSetId) => void reopenImpactReview(reviewId, changeSetId)}
      /> : productMode === "data" ? <DataWorkspace
        projectTitle={activeProjectTitle}
        objects={library.objects}
        eventCount={visibleEventLineRead.status === "ready" ? visibleEventLineRead.eventIds.length : 0}
        eventProjection={verifiedCanonEvents}
        eventFixture={Boolean(eventLineFixture)}
        relationCount={relationRecords.filter((relation) => !relation.archived).length}
        storyUnits={eventLineFixture?.storyUnits ?? storyUnits}
        outputArtifacts={outputArtifacts}
        sourceCount={sourceImportDocuments.length}
        providerConfigured={Boolean(modelServiceStatus?.providers.some((provider) => provider.configured))}
        onOpenWorkDock={(prompt) => openWorkTianyi(prompt || "分析当前作品")}
        onOpenTianyi={() => openFullTianyi("world", "conversation")}
        onOpenEventLine={(eventId, returnToCharacterFate) => {
          const returnSnapshot = returnToCharacterFate ? window.history.state?.characterFateReturn ?? null : null;
          void chooseProductMode("event-line").then(() => {
            const next = new URL(window.location.href);
            if (eventId) next.searchParams.set("event", eventId);
            if (returnToCharacterFate) next.searchParams.set("returnTo", "character-fate");
            window.history.replaceState({ ...(window.history.state ?? {}), ...(returnSnapshot ? { characterFateReturn: returnSnapshot } : {}), workspace: "event-line", selectedEventId: eventId || null, returnTo: returnToCharacterFate ? "character-fate" : null }, "", `${next.pathname}${next.search}${next.hash}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
        onReturnCharacterState={() => {
          const snapshot = window.history.state?.characterStateReturn as CharacterStateReturnSnapshot | null;
          void chooseProductMode("library").then(() => {
            const next = new URL(window.location.href); next.pathname = "/library"; next.search = "";
            next.searchParams.set("view", "character-state"); next.searchParams.set("fixture", "character-state"); next.searchParams.set("character", snapshot?.characterId || "fixture.character.shen-yan"); next.searchParams.set("branch", snapshot?.branchId || "branch.main"); next.searchParams.set("position", String(snapshot?.narrativePosition || 3)); next.searchParams.set("stateCase", snapshot?.fixtureCase || "complete"); if (snapshot?.selectedId) next.searchParams.set("selected", snapshot.selectedId); next.searchParams.set("returned", "1");
            window.history.replaceState({ ...(window.history.state ?? {}), ...(snapshot ? { characterStateReturn: snapshot } : {}), workspace: "library", returnedFromFate: true }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        }}
      /> : productMode === "tianyi" ? <TianyiWorkspace
        projectId={activeProject.id}
        projectTitle={activeProjectTitle}
        context={tianyiContext}
        baseContextRequest={tianyiContextRequest}
        token={token}
        withConnection={runWithConnection}
        operations={tianyiV2Operations}
        executionBrief={executionBrief}
        onExecutionBrief={(brief) => rememberExecutionBrief(brief)}
        onOpenNuwa={handoffTianyiV2ToNuwa}
        sharedSessionId={sharedTianyiSessionId}
        onSharedSessionId={updateSharedTianyiSessionId}
        sharedDraft={sharedTianyiDraft}
        onSharedDraft={updateSharedTianyiDraft}
        mode={tianyiWorkspaceMode}
        onMode={(mode) => { setTianyiWorkspaceMode(mode); setTianyiDockMode("dialogue"); }}
        providerStatus={modelServiceStatus}
        onOpenLibrary={openMobileDrawer}
        onOpenWriting={() => void chooseProductMode("writing")}
        onCreateFromTianyi={() => void openCreationFromTianyi()}
        onReturnProject={() => void returnFromTianyi()}
        onOpenWorkDock={() => openWorkTianyi()}
        permissionControl={<AgentPermissionStatus projectId={activeProject.id} withConnection={runWithConnection} />}
      /> : productMode === "event-line" ? <EventObservationWorkspace
        projectId={activeProject.id}
        projectTitle={eventLineFixture?.projectTitle ?? activeProjectTitle}
        events={verifiedCanonEvents}
        listState={visibleEventLineRead}
        visualDocuments={visualWorkbench?.documents ?? []}
        onReadEvent={readVerifiedCanonEvent}
        onRetry={() => void refreshEventLineRead(activeProject.id)}
        goldenLoop={fixtureKind === "nuwa-bounded" ? null : goldenLoopResult}
        rejectedCandidateIds={fixtureKind === "nuwa-bounded" ? [] : rejectedGoldenLoopCandidateIds}
        acceptedCandidateIds={fixtureKind === "nuwa-bounded" ? [] : acceptedGoldenLoopCandidateIds}
        currentFocusLabel={writing?.activeDocument?.title || activeObject?.title || activeProjectTitle}
        currentUnitLabel={activeWritingChapter?.title || null}
        storedView={readEventObservationView(activeProject.id)}
        onViewChange={(view) => rememberEventObservationView(activeProject.id, view)}
        onOpenTianyi={(reference) => {
          if (reference) setTianyiEventReferences((current) => current.some((item) => storyStudioEventReferenceKey(item) === storyStudioEventReferenceKey(reference)) ? current : [...current, reference].slice(0, 4));
          openFullTianyi("world", "conversation");
        }}
        onCreateFromEvent={(event) => void openCreationFromEvent(event)}
        onCreateEvent={() => { setEventAuthoringError(""); setEventAuthoringConfirmation(null); setEventAuthoringOpen(true); }}
        onSubmitProposal={(patch) => runWithConnection((connectedToken) => createStoryObservationCandidateReview({ projectId: activeProject.id, patch, token: connectedToken }))}
        onContinueReview={(result) => {
          if (result) {
            setGoldenLoopResult(result);
            setRejectedGoldenLoopCandidateIds([]);
            setAcceptedGoldenLoopCandidateIds([]);
          }
          void openNuwaWorkspace(executionBrief || undefined, storyExploration || undefined);
        }}
        returnToData={currentUrl.searchParams.get("returnTo") === "creation-source" ? { label: "返回创作", onReturn: () => {
          const historySnapshot = window.history.state?.creationReturn as CreationReturnSnapshot | null;
          const storedSnapshot = (() => {
            try { return JSON.parse(sessionStorage.getItem(`story-studio:work-version-creation-return:${activeProject.id}`) || "null") as CreationReturnSnapshot | null; }
            catch { return null; }
          })();
          const isCreationSnapshot = (value: CreationReturnSnapshot | null): value is CreationReturnSnapshot => value?.version === "tianyan-creation-return-location/r0"
            && value.projectId === activeProject.id
            && ["scope", "confirm", "editor", "source-details"].includes(value.returnView);
          const snapshot = isCreationSnapshot(historySnapshot)
            ? historySnapshot
            : isCreationSnapshot(storedSnapshot)
              ? storedSnapshot
              : null;
          if (!snapshot) return;
          const next = new URL(window.location.href);
          next.pathname = "/creation";
          next.search = "";
          next.searchParams.set("view", snapshot.returnView);
          if (snapshot.artifactId) next.searchParams.set("artifact", snapshot.artifactId);
          next.searchParams.set("returned", "1");
          window.history.pushState({ ...(window.history.state ?? {}), workspace: "writing", creationReturn: snapshot }, "", `${next.pathname}${next.search}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        } } : currentUrl.searchParams.get("returnTo") === "multiverse-single-derived" ? { label: "返回多元 · 版本对照", onReturn: () => {
          const returnState = window.history.state?.multiverseReturn as { url?: string; scrollTop?: number } | null;
          void chooseProductMode("multiverse").then(() => {
            const fallback = "/multiverse?fixture=multiverse-single-derived&view=compare&source=fixture.version.root&derived=fixture.version.old-name-ledger&selected=fixture.change.event.old-name-check";
            const target = returnState?.url || fallback;
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "multiverse", multiverseReturn: { url: target, scrollTop: returnState?.scrollTop || 0 }, returnedFromEvent: true }, "", target);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        } } : currentUrl.searchParams.get("returnTo") === "nuwa-bounded" ? { label: "返回女娲 · 已融入", onReturn: () => {
          void chooseProductMode("nuwa").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/nuwa";
            next.search = "";
            next.searchParams.set("fixture", "nuwa-bounded");
            next.searchParams.set("view", "compare");
            window.history.replaceState({ ...(window.history.state ?? {}), workspace: "nuwa", returnedFromEvent: true }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        } } : currentUrl.searchParams.get("returnTo") === "character-fate" ? { label: "返回沈砚命运线", onReturn: () => {
          const returnSnapshot = window.history.state?.characterFateReturn ?? null;
          void chooseProductMode("data").then(() => {
            const next = new URL(window.location.href);
            next.pathname = "/data";
            next.searchParams.set("view", "character-fate");
            next.searchParams.set("fixture", "character-fate");
            next.searchParams.set("returned", "1");
            next.searchParams.delete("event");
            next.searchParams.delete("returnTo");
            window.history.replaceState({ ...(window.history.state ?? {}), ...(returnSnapshot ? { characterFateReturn: returnSnapshot } : {}), workspace: "data", returnedFromEvent: true }, "", `${next.pathname}${next.search}${next.hash}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        } } : currentUrl.searchParams.get("returnTo") === "character-state" ? { label: "返回沈砚角色状态", onReturn: () => {
          const snapshot = window.history.state?.characterStateReturn as CharacterStateReturnSnapshot | null;
          void chooseProductMode("library").then(() => {
            const next = new URL(window.location.href); next.pathname = "/library"; next.search = "";
            next.searchParams.set("view", "character-state"); next.searchParams.set("fixture", "character-state"); next.searchParams.set("character", snapshot?.characterId || "fixture.character.shen-yan"); next.searchParams.set("branch", snapshot?.branchId || "branch.main"); next.searchParams.set("position", String(snapshot?.narrativePosition || 3)); next.searchParams.set("stateCase", snapshot?.fixtureCase || "complete"); if (snapshot?.selectedId) next.searchParams.set("selected", snapshot.selectedId); next.searchParams.set("returned", "1");
            window.history.replaceState({ ...(window.history.state ?? {}), ...(snapshot ? { characterStateReturn: snapshot } : {}), workspace: "library", returnedFromEvent: true }, "", `${next.pathname}${next.search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
        } } : null}
      /> : null}
      {creationStartOpen && productMode === "writing" ? <CreationStartDialog
        type={creationType}
        projectTitle={activeProjectTitle}
        currentSourceLabel={writing?.activeDocument?.title || activeObject?.title || activeProjectTitle}
        sources={storyUnits.filter((unit) => unit.lifecycle !== "archived").map((unit) => ({ id: unit.id, title: unit.title, summary: unit.summary }))}
        onSource={(unitId) => { setCreationSourceUnitId(unitId); void createOutputArtifactFromCurrentStory(creationType, unitId); }}
        onFullBook={() => void createOutputArtifactFromCurrentStory(creationType, null, true)}
        onCurrentStory={() => void createOutputArtifactFromCurrentStory(creationType)}
        onBlank={() => void createBlankOutputArtifactFromWriting(creationType)}
        onClose={() => setCreationStartOpen(false)}
      /> : null}
      {eventAuthoringOpen && productMode === "event-line" ? <EventAuthoringDialog
        confirmation={eventAuthoringConfirmation}
        busy={eventAuthoringBusy}
        error={eventAuthoringError}
        onSavePossibility={(draft) => void saveEventAsPossibility(draft)}
        onPrepareConfirmation={(draft) => void prepareEventConfirmation(draft)}
        onConfirm={() => void confirmEventAuthoring()}
        onClose={closeEventAuthoring}
      /> : null}
      <GlobalTianyiDockHost
        placement={visibleTianyiQuickPlacement}
        mode={tianyiDockMode}
        workspace={productMode}
        pinnedWidth={controlCenterPreferences.appearance.tianyiPanelWidthPx}
        projectId={activeProject.id}
        token={token}
        context={tianyiContext}
        contextRequest={tianyiContextRequest}
        objectContextRefs={tianyiObjectContextRefs}
        availableContextRefs={availableTianyiObjectContextRefs}
        groundedAccess={tianyiGroundedAccess}
        availableGroundedSubjects={availableTianyiGroundedSubjects}
        sessionId={sharedTianyiSessionId}
        draft={sharedTianyiDraft}
        uiFontSize={controlCenterPreferences.appearance.uiFontSize}
        editorFontSize={controlCenterPreferences.appearance.editorFontSize}
        withConnection={runWithConnection}
        getSessionMetadata={getTianyiSessionMetadata}
        getModelServiceStatus={getModelServiceStatus}
        agentOperations={tianyiV2Operations}
        baseContextRequest={tianyiContextRequest}
        runGroundedQuestion={tianyiV2Operations.runGroundedQuestion}
        onSessionId={updateSharedTianyiSessionId}
        onDraft={updateSharedTianyiDraft}
        onEnsureNormalSession={async (connectedToken) => {
          const opened = await openTianyiSession(activeProject.id, createTianyiOperationId("grounded-session-open"), connectedToken, "normal");
          return opened.sessionId;
        }}
        onAddContextRef={addTianyiObjectContextRef}
        onRemoveContextRef={removeTianyiObjectContextRef}
        onGroundedAccess={setTianyiGroundedAccess}
        onPlacement={(placement) => {
          if (placement === "closed") workspaceDockCoordinator.closeQuickTianyi();
          else workspaceDockCoordinator.openQuickTianyi();
          setTianyiQuickPlacement(placement);
        }}
        onMode={setTianyiDockMode}
        onPinnedWidth={(tianyiPanelWidthPx) => persistControlCenterPreferences({ ...controlCenterPreferences, appearance: { ...controlCenterPreferences.appearance, tianyiPanelWidthPx } })}
        onOpenFull={openFullTianyi}
        onClose={closeQuickTianyi}
      />
      </>}
      </div>
      <StatusToastLayer error={error} onDismiss={() => setError("")} />
    </AppShell> : <NoProject
      projects={bootstrap?.projects || []}
      recovery={bootstrap?.recovery?.message}
      error={error}
      onCreate={() => setOnboarding("genre")}
      onOpen={(project) => void switchProject(project)}
      onRefresh={() => void refreshWorkspace()}
    />}

    {newObjectOpen && <NewObjectDialog
      type={newObjectType}
      title={newObjectTitle}
      templates={cardTemplates}
      agentTypes={agentTypeDefinitions}
      initialAgentTypeId={newObjectAgentTypeId}
      error={newObjectError}
      busy={newObjectBusy}
      onType={setNewObjectType}
      onTitle={setNewObjectTitle}
      onCreate={(input, agentType, profile) => void submitNewObject(input, agentType, profile)}
      onRequestAgentDraft={requestLibraryAgentDraft}
      onEditAgentDraft={editLibraryAgentDraft}
      onConfirmAgentDraft={confirmLibraryAgentDraft}
      onIgnoreAgentDraft={ignoreLibraryAgentDraft}
      onClose={() => { setNewObjectOpen(false); setNewObjectAgentTypeId(null); setNewObjectError(""); }}
    />}
    {visualDocumentOpen && <VisualDocumentDialog type={visualDocumentType} title={visualDocumentTitle} error={visualDocumentError} busy={visualDocumentBusy} onType={setVisualDocumentType} onTitle={setVisualDocumentTitle} onCreate={() => void submitVisualDocument()} onClose={() => { setVisualDocumentOpen(false); setVisualDocumentError(""); }} />}
    <WorkspaceFolderDialog open={folderDialogOpen} title={folderTitle} error={folderError} busy={folderBusy} onTitle={setFolderTitle} onSubmit={() => void submitWorkspaceFolder()} onClose={() => { setFolderDialogOpen(false); setFolderError(""); }} />
    <DocumentRevisionPanel open={Boolean(revisionTarget)} title={revisionTarget?.title || ""} history={revisionHistory} preview={revisionPreview} sourceDrift={revisionSourceDrift} busy={revisionBusy} error={revisionError} onClose={() => { setRevisionTarget(null); setRevisionHistory(null); setRevisionPreview(null); setRevisionSourceDrift([]); setRevisionError(""); }} onPreview={(revisionId) => void loadRevisionPreview(revisionId)} onCreateMilestone={(revisionId, milestoneTitle) => void submitRevisionMilestone(revisionId, milestoneTitle)} onRestore={(revisionId) => void submitRevisionRestore(revisionId)} />
    <CharacterCardHistoryPanel open={cardHistoryOpen} title={activeObject?.title || ""} markdown={cardHistoryLedgers?.markdown || null} presentation={cardHistoryLedgers?.presentation || null} preview={cardHistoryPreview} busy={cardHistoryBusy} error={cardHistoryError} onClose={() => { setCardHistoryOpen(false); setCardHistoryLedgers(null); setCardHistoryPreview(null); setCardHistoryError(""); }} onPreview={(owner, revisionId) => void previewCharacterCardRevision(owner, revisionId)} onMilestone={(owner, revisionId, milestoneTitle) => void milestoneCharacterCardRevision(owner, revisionId, milestoneTitle)} onRestore={(owner, revisionId) => void restoreCharacterCardRevision(owner, revisionId)} />
    {writingDocumentOpen && <WritingDocumentDialog type={writingDocumentType} title={writingDocumentTitle} error={writingDocumentError} busy={writingDocumentBusy} onTitle={setWritingDocumentTitle} onCreate={() => void submitWritingDocument()} onClose={() => { setWritingDocumentOpen(false); setWritingDocumentError(""); }} />}
    <StorageTransparencyPanel open={storageSettingsOpen} status={storageTransparency} loading={storageLoading} revealBusy={storageActionBusy} error={storageError} onClose={() => setStorageSettingsOpen(false)} onRefresh={() => void refreshStorageTransparency()} onReveal={() => void revealCurrentProject()} />
    {activeProject && <R9AWorkflowCenter open={projectManagementOpen} projectTitle={activeProjectTitle} workflow={r9aWorkflow} backups={r9aBackups} onCreateTask={createR9ATask} onSetTaskState={setR9ATaskState} onCreateBackup={createR9ABackup} onRestoreBackup={restoreR9ABackup} onClose={() => setProjectManagementOpen(false)} />}
    <AIControlCenter
      open={controlCenterOpen}
      preferences={controlCenterPreferences}
      skills={storyStudioSystemSkills}
      contextBudget={contextBudgetSnapshot}
      storage={storageTransparency}
      storageLoading={storageLoading}
      storageError={storageError}
      storageActionBusy={storageActionBusy}
      modelServiceStatus={modelServiceStatus}
      providerConnection={providerConnection}
      providerBusy={providerBusy}
      providerError={providerError}
      onPreferences={persistControlCenterPreferences}
      onRefreshStorage={() => void refreshStorageTransparency()}
      onRevealStorage={() => void revealCurrentProject()}
      onSaveProviderProfile={(input) => saveProviderProfileFromSettings(input)}
      onReloadProviderProfile={() => reloadProviderProfileFromSettings()}
      onDiscoverProviderModels={() => discoverProviderModelsFromSettings()}
      onRevealProviderCredential={() => revealProviderCredentialFromSettings()}
      onTestProvider={() => testProviderFromSettings()}
      onMinimalInference={() => runProviderMinimalInferenceFromSettings()}
      onDisableProvider={() => disableProviderFromSettings()}
      onClearProviderCredential={() => clearProviderCredentialFromSettings()}
      onClose={() => setControlCenterOpen(false)}
    />
    {activeProject && <ProductShellProfilePanel open={profilePanelOpen} authorLabel={localAuthorAccount.displayName} projectTitle={activeProjectTitle} onClose={() => setProfilePanelOpen(false)} />}
  </>;

  function persistControlCenterPreferences(preferences: ControlCenterPreferences): void {
    setControlCenterPreferences(saveControlCenterPreferences(getBrowserPreferenceStorage(), preferences));
  }

  async function refreshModelServiceStatus(): Promise<void> {
    try {
      setProviderError("");
      setModelServiceStatus(await runWithConnection((connectedToken) => getModelServiceStatus(connectedToken)));
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "无法读取模型服务状态。");
    }
  }

  async function saveProviderProfileFromSettings(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean; apiKey?: string }): Promise<ProviderProfileProjection> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const result = await runWithConnection((connectedToken) => saveProviderProfile({ ...input, token: connectedToken }));
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "Provider 配置保存失败。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function reloadProviderProfileFromSettings(): Promise<ProviderProfileProjection> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const result = await runWithConnection((connectedToken) => reloadProviderProfile(connectedToken));
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "无法重新载入 Provider 配置。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function discoverProviderModelsFromSettings(): Promise<{ models: string[]; profile: ProviderProfileProjection }> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const result = await runWithConnection((connectedToken) => discoverProviderModels(connectedToken));
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      await refreshModelServiceStatus();
      setProviderError(cause instanceof Error ? cause.message : "无法获取可用模型。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function revealProviderCredentialFromSettings(): Promise<{ credential: string; expiresInMs: number }> {
    return runWithConnection((connectedToken) => revealProviderCredential(connectedToken));
  }

  async function testProviderFromSettings(modelId?: string): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const result = await runWithConnection((connectedToken) => testProviderConnection(connectedToken, modelId));
      setProviderConnection({
        version: "story-studio-provider-session/v1",
        connected: true,
        providerId: "siliconflow",
        modelId: result.modelId,
        profileId: result.profile.profile?.id || "siliconflow-session-structured",
        availableModelCount: result.availableModelCount,
        profile: result.profile
      });
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      await refreshModelServiceStatus();
      setProviderError(cause instanceof Error ? cause.message : "SiliconFlow 连接测试失败。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function runProviderMinimalInferenceFromSettings(): Promise<{ modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const result = await runWithConnection((connectedToken) => runProviderMinimalInference(connectedToken));
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      await refreshModelServiceStatus();
      setProviderError(cause instanceof Error ? cause.message : "最小模型推理失败。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function disableProviderFromSettings(): Promise<ProviderProfileProjection> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const revision = modelServiceStatus?.profile?.revision ?? 0;
      const result = await runWithConnection((connectedToken) => disableProviderProfile({ expectedRevision: revision, token: connectedToken }));
      setProviderConnection(null);
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "无法禁用 Provider。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function clearProviderCredentialFromSettings(): Promise<ProviderProfileProjection> {
    setProviderBusy(true);
    setProviderError("");
    try {
      const result = await runWithConnection((connectedToken) => clearProviderCredential(connectedToken));
      setProviderConnection(null);
      await refreshModelServiceStatus();
      return result;
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "无法清除 Provider 凭据。");
      throw cause;
    } finally {
      setProviderBusy(false);
    }
  }

  async function submitGoldenLoop(authorIntent: string, executionMode: "legacy" | "live-pilot-r2" = "live-pilot-r2"): Promise<void> {
    if (!library) return;
    goldenLoopControllerRef.current?.abort();
    const controller = new AbortController();
    goldenLoopControllerRef.current = controller;
    setGoldenLoopBusy(true);
    setGoldenLoopError("");
    try {
      let status = modelServiceStatus;
      if (!status) status = await runWithConnection((connectedToken) => getModelServiceStatus(connectedToken));
      const provider = status.providers.find((item) => item.id === "siliconflow");
      if (!provider?.configured) throw new Error("请先在设置的 Provider 页面保存并测试 SiliconFlow。");
      const profileId = providerConnection?.profileId || status.profiles[0]?.id;
      if (!profileId) throw new Error("没有可用的结构化创作模型档案。");
      const sourceDocument = writing?.activeDocument;
      if (!sourceDocument) throw new Error("请先打开一份写作文档，再开始受保护推演。");
      const origin = tianyiReturnSnapshotRef.current;
      const originSelection = origin?.projectId === library.project.id
        && origin.target.kind === "writing-document"
        && origin.editorSelection
        && origin.target.id === sourceDocument.id
        && origin.target.revision === sourceDocument.revisionToken
        ? origin.editorSelection
        : null;
      const selection = originSelection || { start: 0, end: sourceDocument.body.length };
      if (selection.start === selection.end) throw new Error("当前写作文档没有可供推演的选区。");
      const result = await runWithConnection((connectedToken) => runGoldenLoop({
        projectId: library.project.id,
        profileId,
        authorIntent,
        focus: {
          mode: "nuwa",
          document: {
            id: sourceDocument.id,
            revision: sourceDocument.revisionToken,
            selection: { coordinate: "utf16-code-unit", start: selection.start, end: selection.end }
          },
          eventRef: nuwaEventReference
        },
        contextRefs: tianyiObjectContextRefs,
        executionMode,
        token: connectedToken,
        signal: controller.signal
      }));
      setGoldenLoopResult(result);
      setRejectedGoldenLoopCandidateIds([]);
      setAcceptedGoldenLoopCandidateIds([]);
      setCandidateReviewHistory(await listGoldenLoopCandidateReviews(library.project.id));
      setModelServiceStatus(await runWithConnection((connectedToken) => getModelServiceStatus(connectedToken)));
    } catch (cause) {
      setGoldenLoopError(controller.signal.aborted
        ? "已取消本轮推演；没有候选进入 Canon、Event Line 或 Writing。"
        : cause instanceof Error ? cause.message : "天意与女娲推演失败。");
    } finally {
      if (goldenLoopControllerRef.current === controller) goldenLoopControllerRef.current = null;
      setGoldenLoopBusy(false);
    }
  }

  function cancelGoldenLoop(): void {
    goldenLoopControllerRef.current?.abort();
  }

  async function rejectGoldenLoopCandidate(candidateId: string): Promise<void> {
    if (!library || !goldenLoopResult?.review) return;
    setGoldenLoopBusy(true);
    setGoldenLoopError("");
    try {
      const review = await runWithConnection((connectedToken) => decideGoldenLoopCandidateReview({
        projectId: library.project.id,
        reviewId: goldenLoopResult.review!.id,
        candidateId,
        decision: "rejected",
        reason: "作者拒绝此候选；保留审计态，但不创建规划事件或故事事实。",
        token: connectedToken
      }));
      setRejectedGoldenLoopCandidateIds(review.candidates.filter((candidate) => candidate.status === "rejected").map((candidate) => candidate.id));
      setAcceptedGoldenLoopCandidateIds(review.candidates.filter((candidate) => candidate.status === "accepted").map((candidate) => candidate.id));
      setGoldenLoopResult({ ...review.result, review: { id: review.id, status: review.status } });
      setCandidateReviewHistory(await listGoldenLoopCandidateReviews(library.project.id));
    } catch (cause) {
      setGoldenLoopError(cause instanceof Error ? cause.message : "无法持久化候选拒绝决定。");
    } finally {
      setGoldenLoopBusy(false);
    }
  }

  async function reviewGoldenLoopCandidate(candidate: GoldenLoopCandidate): Promise<void> {
    if (!library || !goldenLoopResult) return;
    setGoldenLoopBusy(true);
    setGoldenLoopError("");
    try {
      const planning = await runWithConnection((connectedToken) => createPlanningEvent({
        projectId: library.project.id,
        title: candidate.title,
        tags: ["AI 候选", "待作者审查"],
        body: [
          `# ${candidate.title}`,
          "",
          "## Change",
          candidate.change,
          "",
          "## After",
          candidate.after,
          "",
          "## Causes",
          ...candidate.causes.map((item) => `- ${item}`),
          "",
          "## Evidence",
          ...candidate.evidence.map((item) => `- ${item}`),
          "",
          "## Unknown / Risk",
          `- ${candidate.uncertainty}`,
          `- ${candidate.risk}`,
          "",
          `Provider profile: ${goldenLoopResult.provider.profileId}`
        ].join("\n"),
        token: connectedToken
      }));
      const review = await openPlanningEventImpactReview(planning.id);
      if (!review || !goldenLoopResult.review) throw new Error("候选已创建规划事件，但没有得到完整审查回执。");
      const candidateReview = await runWithConnection((connectedToken) => decideGoldenLoopCandidateReview({
        projectId: library.project.id,
        reviewId: goldenLoopResult.review!.id,
        candidateId: candidate.id,
        decision: "accepted",
        confirmationReceipt: { planningEventId: planning.id, impactReviewId: review.id },
        token: connectedToken
      }));
      setRejectedGoldenLoopCandidateIds(candidateReview.candidates.filter((item) => item.status === "rejected").map((item) => item.id));
      setAcceptedGoldenLoopCandidateIds(candidateReview.candidates.filter((item) => item.status === "accepted").map((item) => item.id));
      setGoldenLoopResult({ ...candidateReview.result, review: { id: candidateReview.id, status: candidateReview.status } });
      setCandidateReviewHistory(await listGoldenLoopCandidateReviews(library.project.id));
    } catch (cause) {
      setGoldenLoopError(cause instanceof Error ? cause.message : "无法把候选送入作者审查。");
    } finally {
      setGoldenLoopBusy(false);
    }
  }
}

function buildWorldTabs(objectTabs: WorldObjectSummary[], visualWorkbench: VisualWorkbenchBootstrap | null): WorldDocumentTab[] {
  const objectEntries = objectTabs.map((object) => ({ kind: "object" as const, id: object.id, title: object.title, type: object.type }));
  const visualEntries = (visualWorkbench?.tabs || []).flatMap((relativePath) => {
    const document = visualWorkbench?.documents.find((item) => item.relativePath === relativePath);
    return document ? [{ kind: "visual" as const, id: document.id, title: document.title, type: document.type, relativePath: document.relativePath }] : [];
  });
  return [...objectEntries, ...visualEntries].filter((tab, index, all) => all.findIndex((candidate) => candidate.kind === tab.kind && candidate.id === tab.id) === index).slice(0, 10);
}

function tianyiSourceForMode(mode: ProductWorkspaceMode): TianyiSourceMode {
  return mode === "writing" ? "writing" : mode === "library" ? "library" : "world";
}

function isTianyiSourceMode(value: unknown): value is TianyiSourceMode {
  return value === "writing" || value === "library" || value === "world";
}

function tianyiWorkspaceModeFromDockMode(mode: TianyiDockMode): TianyiCollaborationMode {
  return mode === "work" ? "conversation" : "conversation";
}

function tianyiDockModeFromWorkspaceMode(mode: TianyiCollaborationMode): TianyiDockMode {
  return mode === "conversation" || mode === "creative" ? "dialogue" : "dialogue";
}

function productModeLabel(mode: ProductWorkspaceMode): string {
  return storyStudioWorkspaceDisplayName(mode);
}

function readLibraryRouteState(input: string | URL): { home: boolean; tab: LibraryViewTab; directory: LibraryDirectoryId; query: string; objectId: string | null; relationView: RelationView; relationPresentation: RelationPresentation; relationId: string | null } {
  const url = typeof input === "string" ? new URL(input, window.location.origin) : input;
  const tab = url.searchParams.get("libraryTab") === "uncertain" ? "uncertain" : "classified";
  const rawDirectory = url.searchParams.get("libraryDirectory") || "all";
  const directory: LibraryDirectoryId = rawDirectory === "character" || rawDirectory === "item" || rawDirectory === "location" || rawDirectory === "faction" || rawDirectory === "relation" || rawDirectory === "agent-types" || rawDirectory === "recent" || rawDirectory === "unfiled" || rawDirectory === "import" || rawDirectory === "folders" || rawDirectory === "visual" || rawDirectory === "all" || rawDirectory.startsWith("agent:") || rawDirectory.startsWith("folder:")
    ? rawDirectory as LibraryDirectoryId
    : "all";
  const relationView = url.searchParams.get("relationView") === "pending" ? "pending" : url.searchParams.get("relationView") === "confirmed" ? "confirmed" : url.searchParams.get("relationView") === "history" ? "history" : "all";
  const relationPresentation: RelationPresentation = url.searchParams.get("relationPresentation") === "graph" ? "graph" : "list";
  const home = !["libraryTab", "libraryDirectory", "libraryQuery", "libraryObject", "relationView", "relationPresentation", "relationId"].some((key) => url.searchParams.has(key));
  return { home, tab, directory, query: url.searchParams.get("libraryQuery") || "", objectId: url.searchParams.get("libraryObject") || null, relationView, relationPresentation, relationId: url.searchParams.get("relationId") || null };
}

function writeLibraryRouteState(input: { home?: boolean; tab?: LibraryViewTab; directory?: LibraryDirectoryId; query?: string; objectId?: string | null; relationView?: RelationView | null; relationPresentation?: RelationPresentation | null; relationId?: string | null; searchOriginHome?: boolean }, mode: "push" | "replace" = "replace"): void {
  const url = new URL(window.location.href);
  if (input.home) {
    url.searchParams.delete("libraryTab");
    url.searchParams.delete("libraryDirectory");
    url.searchParams.delete("libraryQuery");
    url.searchParams.delete("libraryObject");
    url.searchParams.delete("relationView");
    url.searchParams.delete("relationPresentation");
    url.searchParams.delete("relationId");
  }
  if (input.tab !== undefined) url.searchParams.set("libraryTab", input.tab);
  if (input.directory !== undefined) url.searchParams.set("libraryDirectory", input.directory);
  if (input.query !== undefined) {
    if (input.query.trim()) url.searchParams.set("libraryQuery", input.query);
    else url.searchParams.delete("libraryQuery");
  }
  if (input.objectId !== undefined) {
    if (input.objectId) url.searchParams.set("libraryObject", input.objectId);
    else url.searchParams.delete("libraryObject");
  }
  if (input.relationView !== undefined) {
    if (input.relationView) url.searchParams.set("relationView", input.relationView);
    else url.searchParams.delete("relationView");
  }
  if (input.relationPresentation !== undefined) {
    if (input.relationPresentation && input.relationPresentation !== "list") url.searchParams.set("relationPresentation", input.relationPresentation);
    else url.searchParams.delete("relationPresentation");
  }
  if (input.relationId !== undefined) {
    if (input.relationId) url.searchParams.set("relationId", input.relationId);
    else url.searchParams.delete("relationId");
  }
  const state = { ...(window.history.state ?? {}), workspace: "library", libraryHome: input.home === true, librarySearchOriginHome: input.searchOriginHome === true, libraryTab: input.tab, libraryDirectory: input.directory, relationView: input.relationView, relationPresentation: input.relationPresentation, relationId: input.relationId };
  if (mode === "push") window.history.pushState(state, "", `${url.pathname}${url.search}${url.hash}`);
  else window.history.replaceState(state, "", `${url.pathname}${url.search}${url.hash}`);
}

function isWorldObjectType(value: string): value is WorldObjectType {
  return ["character", "item", "location", "faction", "event", "rule", "thread"].includes(value);
}

function libraryDirectoryObjectType(directory: LibraryDirectoryId): WorldObjectType | null {
  return directory === "character" || directory === "item" || directory === "location" || directory === "faction" ? directory : null;
}

function compareLibraryUpdatedObjects(left: WorldObjectSummary, right: WorldObjectSummary): number {
  return (right.updatedAt || "").localeCompare(left.updatedAt || "") || left.title.localeCompare(right.title, "zh-CN") || left.id.localeCompare(right.id);
}

function libraryObjectMatchesQuery(object: WorldObjectSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  return !normalized || `${object.title} ${object.type} ${object.tags.join(" ")} ${object.aliases.join(" ")}`.toLocaleLowerCase("zh-CN").includes(normalized);
}

function summaryForAgentReference(reference: { objectId: string; objectRevision: string; relativePath: string; title: string; sourceType: string }, objects: WorldObjectSummary[]): WorldObjectSummary {
  const existing = objects.find((object) => object.id === reference.objectId);
  if (existing) return existing;
  const type = isWorldObjectType(reference.sourceType) ? reference.sourceType : "thread";
  return {
    id: reference.objectId,
    relativeId: reference.relativePath,
    title: reference.title,
    type,
    status: "active",
    tags: [],
    aliases: [],
    revisionToken: reference.objectRevision,
    source: "markdown"
  };
}

function currentWorkspaceLocation() {
  normalizeCreationPluginCompatibilityRoute();
  const normalized = normalizeRetiredUiLocation({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash });
  if (normalized.changed) {
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "tianyi" }, "", `${normalized.pathname}${normalized.search}${normalized.hash}`);
  }
  clearRetiredTianyiUiPreferencesFromBrowser();
  if (isSettingsRoute(normalized.pathname)) return { id: "world" as ProductWorkspaceMode, migrated: false };
  return resolveStoryStudioWorkspaceLocation({ pathname: normalized.pathname, search: normalized.search });
}

function normalizeCreationPluginCompatibilityRoute(): void {
  const pathname = window.location.pathname.replace(/\/+$/u, "") || "/";
  if (pathname !== "/creation/plugins") return;
  const url = new URL(window.location.href);
  url.pathname = "/settings/plugins";
  if (!url.searchParams.has("returnContext")) url.searchParams.set("returnContext", "creation");
  window.history.replaceState({ ...(window.history.state ?? {}), settings: "plugins", returnContext: "creation" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function isProjectCenterPath(): boolean {
  return (window.location.pathname.replace(/\/+$/u, "") || "/") === "/projects";
}

/** Legacy `mode=agent` is accepted only as a compatibility request for the
 * desktop work Dock; the third mode is no longer rendered. */
function legacyTianyiAgentRequest(): boolean {
  return new URLSearchParams(window.location.search).get("mode") === "agent";
}

function readTianyiRouteMode(): TianyiCollaborationMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "creative" ? "creative" : "conversation";
}

function currentTianyiReturnSurface(): "tianyi" | null {
  return new URLSearchParams(window.location.search).get("returnSurface") === "tianyi" ? "tianyi" : null;
}

function eventObservationViewStorageKey(projectId: string): string {
  return `story-studio:event-observation:view:${projectId}`;
}

function readEventObservationView(projectId: string): EventObservationView | null {
  try {
    const value = window.sessionStorage.getItem(eventObservationViewStorageKey(projectId));
    return value === "spine" || value === "canvas" || value === "timeline" ? value : null;
  } catch {
    return null;
  }
}

function rememberEventObservationView(projectId: string, view: EventObservationView): void {
  try {
    window.sessionStorage.setItem(eventObservationViewStorageKey(projectId), view);
  } catch {
    // Last-view continuity is optional presentation state only.
  }
}

function nuwaStageStorageKey(projectId: string): string {
  return `story-studio:nuwa:stage:${projectId}`;
}

function readNuwaStage(projectId: string): NuwaWorkspaceStage | null {
  try {
    const value = window.sessionStorage.getItem(nuwaStageStorageKey(projectId));
    return value === "rehearsal" || value === "simulation" || value === "comparison" || value === "review" || value === "history" ? value : null;
  } catch {
    return null;
  }
}

function rememberNuwaStage(projectId: string, stage: NuwaWorkspaceStage): void {
  try {
    window.sessionStorage.setItem(nuwaStageStorageKey(projectId), stage);
  } catch {
    // The last Nuwa stage is optional presentation continuity, never a Run owner.
  }
}

function replaceNuwaRouteParameters(parameters: readonly string[]): void {
  const url = new URL(window.location.href);
  parameters.forEach((parameter) => url.searchParams.delete(parameter));
  window.history.replaceState({ workspace: "nuwa" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function setNuwaRouteParameter(parameter: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(parameter, value);
  else url.searchParams.delete(parameter);
  window.history.replaceState({ workspace: "nuwa" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function nuwaPresentationError(error: string): string {
  if (/project\s+does\s+not\s+exist/iu.test(error)) return "当前作品上下文已失效；请从当前作品重新打开女娲。";
  return error;
}

function restoreProductWorkspace(mode: ProductWorkspaceMode, returnSurface?: "tianyi"): void {
  const url = new URL(window.location.href);
  url.pathname = storyStudioWorkspaceRoute(mode);
  url.searchParams.delete("workspace");
  url.searchParams.delete("mode");
  if (mode === "nuwa" && returnSurface) url.searchParams.set("returnSurface", returnSurface);
  else url.searchParams.delete("returnSurface");
  if (mode !== "nuwa") ["stage", "project", "unit", "run", "review"].forEach((parameter) => url.searchParams.delete(parameter));
  url.searchParams.delete("storyCanvas");
  url.searchParams.delete("view");
  window.history.replaceState({ workspace: mode }, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateProductWorkspace(mode: ProductWorkspaceMode): void {
  const url = new URL(window.location.href);
  url.pathname = storyStudioWorkspaceRoute(mode);
  url.searchParams.delete("workspace");
  url.searchParams.delete("mode");
  url.searchParams.delete("returnSurface");
  if (mode !== "nuwa") ["stage", "project", "unit", "run", "review"].forEach((parameter) => url.searchParams.delete(parameter));
  url.searchParams.delete("storyCanvas");
  url.searchParams.delete("view");
  window.history.pushState({ workspace: mode }, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Onboarding(props: {
  step: OnboardingStep;
  genre: string;
  ambience: string;
  title: string;
  folderSlug: string;
  error: string;
  onGenre(value: string): void;
  onAmbience(value: string): void;
  onTitle(value: string): void;
  onFolderSlug(value: string): void;
  onStep(value: OnboardingStep): void;
  onCancel(): void;
  onCreate(): void;
}) {
  return <main className="onboarding-shell" data-onboarding-step={props.step}>
    <button className="quiet-close" type="button" onClick={props.onCancel} aria-label="退出创建世界"><X /></button>
    {props.step === "genre" && <section className="onboarding-stage">
      <p className="eyebrow">世界气质</p><h1>这个世界属于哪一种气质？</h1><p className="lede">先确定创作方向，之后仍可随时调整。</p>
      <div className="choice-cloud" role="listbox" aria-label="世界类型">{genres.map(([value, label]) => <button type="button" role="option" aria-selected={props.genre === value} className={props.genre === value ? "is-selected" : ""} onClick={() => props.onGenre(value)} key={value}><Sparkles />{label}</button>)}</div>
      <div className="onboarding-actions"><button type="button" className="text-action" onClick={() => props.onStep("ambience")}>跳过</button><button type="button" className="light-action" onClick={() => props.onStep("ambience")}>继续<ArrowRight /></button></div>
    </section>}
    {props.step === "ambience" && <section className="onboarding-stage">
      <p className="eyebrow">创作氛围</p><h1>选择一种声音，让自己进入世界</h1><p className="lede">这里只记录偏好，不播放或下载外部音频。</p>
      <div className="ambience-console">{ambienceOptions.map(([value, label, detail]) => <button type="button" aria-pressed={props.ambience === value} className={props.ambience === value ? "is-selected" : ""} onClick={() => props.onAmbience(value)} key={value}><span>{label}</span><small>{detail}</small>{props.ambience === value && <Check />}</button>)}</div>
      <div className="onboarding-actions"><button type="button" className="text-action" onClick={() => props.onStep("genre")}><ChevronLeft />返回</button><button type="button" className="light-action" onClick={() => props.onStep("identity")}>继续<ArrowRight /></button></div>
    </section>}
    {props.step === "identity" && <section className="onboarding-stage identity-stage">
      <p className="eyebrow">世界身份</p><h1>给这个世界一个名字</h1><p className="lede">它会成为一个普通、可独立打开的 Markdown 项目。</p>
      <label><span>世界名称</span><input autoFocus value={props.title} maxLength={80} onChange={(event) => props.onTitle(event.target.value)} placeholder="例如：雾中灯塔" /></label>
      <label><span>项目文件夹</span><input value={props.folderSlug} maxLength={64} onChange={(event) => props.onFolderSlug(event.target.value)} placeholder="mist-lighthouse" pattern="[a-z0-9-]+" /><small>使用小写字母、数字和连字符。</small></label>
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      <div className="onboarding-actions"><button type="button" className="text-action" onClick={() => props.onStep("ambience")}><ChevronLeft />返回</button><button type="button" className="light-action" disabled={!props.title.trim() || !props.folderSlug.trim()} onClick={props.onCreate}>创建世界<ArrowRight /></button></div>
    </section>}
    {props.step === "creating" && <section className="onboarding-stage creating-stage"><RefreshCw className="spin" /><h1>正在建立你的世界</h1><p className="lede">创建 Markdown 项目并检查本地结构。</p></section>}
  </main>;
}

function NoProject(props: { projects: StoryStudioProject[]; recovery?: string; error: string; onCreate(): void; onOpen(project: StoryStudioProject): void; onRefresh(): void }) {
  return <main className="entry-shell"><header className="entry-brand"><span>衍</span><strong>Story Studio</strong></header><section className="entry-focus">
    <p className="eyebrow" data-testid="project-selection-label">选择作品</p><h1>{props.projects.length ? "选择一个世界继续" : "从一个真实世界开始"}</h1><p>项目保存在自己的文件夹中，Markdown 是唯一内容真相。</p>
    {props.recovery && <div className="recovery-note">{props.recovery}<button type="button" onClick={props.onRefresh}>重新检查</button></div>}{props.error && <p className="form-error" role="alert">{props.error}</p>}
    {props.projects.length > 0 && <div className="project-picker">{props.projects.map((project) => <button type="button" onClick={() => props.onOpen(project)} key={project.id}><FolderOpen /><span><strong>{projectDisplayTitle(project.title)}</strong><small>{metadataLabel(project)}</small></span><ArrowRight /></button>)}</div>}
    <button className="primary-action" type="button" onClick={props.onCreate}><Plus />新建世界</button>
  </section></main>;
}

function LoadingScreen() {
  return <main className="loading-screen"><RefreshCw className="spin" /><span>正在读取本地世界…</span></main>;
}

function timelineSourceDrift(ref: RevisionDocumentRef, workbench: VisualWorkbenchBootstrap | null, library: WorldLibraryBootstrap | null): string[] {
  if (ref.kind !== "visual" || !workbench || !library) return [];
  const document = workbench.documents.find((item) => item.id === ref.id);
  if (!document || document.type !== "timeline") return [];
  const titles = new Map(library.objects.map((object) => [object.id, object.title]));
  return document.diagnostics.timeline.entryStates
    .filter((entry) => entry.status === "missing" || entry.status === "ineligible")
    .map((entry) => entry.status === "missing"
      ? "事件已缺失，时间线引用仍被保留。"
      : `来源事件不再符合当前投影条件：${titles.get(entry.eventId) || "事件已缺失"}`);
}

function resolveObjectAuthorityMode(
  object: WorldObject | null,
  eventLineRead: VerifiedCanonEventListRead | { status: "loading" }
): ObjectAuthorityMode {
  if (!object || object.type !== "event") return "ordinary";
  if ((object.status === "planned" || object.status === "paused" || object.status === "abandoned") && object.tags.includes("作者规划") && !object.tags.includes("作者确认")) {
    return "planning-event";
  }
  if (eventLineRead.status === "ready" && eventLineRead.eventIds.includes(object.id)) return "verified-canon";
  if (object.status === "committed" || object.tags.includes("作者确认") || object.tags.includes("作者规划")) {
    return eventLineRead.status === "ready" ? "invalid-canon-claim" : "canon-verification-unavailable";
  }
  return "ordinary";
}

function toDraft(object: WorldObject): ObjectDraft {
  return {
    title: object.title,
    status: object.status,
    tags: object.tags.join(", "),
    aliases: object.aliases.join(", "),
    subtype: object.subtype,
    typedProperties: object.typedProperties.map((property) => ({ ...property, enumOptions: [...property.enumOptions], value: Array.isArray(property.value) ? [...property.value] : property.value, references: property.references.map((reference) => ({ ...reference })) })),
    profile: object.profile ? { ...object.profile, fields: Object.fromEntries(Object.entries(object.profile.fields).map(([key, field]) => [key, { ...field, sourceAnchors: [...field.sourceAnchors], value: Array.isArray(field.value) ? [...field.value] : field.value }])), unresolvedQuestions: [...object.profile.unresolvedQuestions], warnings: [...object.profile.warnings] } : null,
    body: object.body,
    card: {
      ...object.card,
      portrait: object.card.portrait ? { ...object.card.portrait, position: { ...object.card.portrait.position } } : null,
      cover: object.card.cover ? { ...object.card.cover, position: { ...object.card.cover.position } } : null,
      blocks: object.card.blocks.map((block) => ({ ...block })),
      visual: { ...object.card.visual, mediaAssets: [...object.card.visual.mediaAssets] },
      diagnostics: object.card.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      migration: { ...object.card.migration }
    }
  };
}

function splitList(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))];
}

function sameCardPresentation(left: WorldObject["card"], right: WorldObject["card"]): boolean {
  return JSON.stringify({
    layout: left.layout,
    portrait: left.portrait,
    cover: left.cover,
    templateRef: left.templateRef,
    blocks: left.blocks,
    visual: left.visual
  }) === JSON.stringify({
    layout: right.layout,
    portrait: right.portrait,
    cover: right.cover,
    templateRef: right.templateRef,
    blocks: right.blocks,
    visual: right.visual
  });
}

function metadataLabel(project: StoryStudioProject): string {
  const genre = genres.find(([value]) => value === project.genre)?.[1];
  const ambience = ambienceOptions.find(([value]) => value === project.ambience)?.[1];
  return [genre, ambience].filter(Boolean).join(" · ") || "未设置类型与氛围";
}

function suggestSlug(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return slug || "story-world";
}

function nextLocalTemplateId(label: string, existing: string[]): string {
  const segment = label.toLowerCase().normalize("NFC").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 72) || "character";
  const base = `card-template.${segment}`;
  if (!existing.includes(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
  throw new Error("Could not create a local template identifier.");
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : "本地项目操作失败。";
}

function updateCreationLocation(input: { artifactId: string | null; view: "center" | "media" | null; routeMode?: CreationRouteMode }): void {
  const url = new URL(window.location.href);
  url.pathname = creationRouteForMode(input.routeMode || readCreationRouteMode(url.pathname));
  if (input.artifactId) url.searchParams.set("artifact", input.artifactId);
  else url.searchParams.delete("artifact");
  if (input.view) url.searchParams.set("view", input.view);
  else url.searchParams.delete("view");
  window.history.replaceState({ workspace: "writing", ...input }, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Route updates only choose a view within an existing workspace. */
function navigateAuthoringRoute(pathname: string, workspace: "writing" | "multiverse"): void {
  const url = new URL(window.location.href);
  url.pathname = pathname;
  url.searchParams.delete("workspace");
  url.searchParams.delete("mode");
  url.searchParams.delete("artifact");
  url.searchParams.delete("view");
  window.history.pushState({ workspace }, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function nuwaReturnStorageKey(projectId: string, selectionRef: string): string {
  return `story-studio:nuwa-return:${projectId}:${selectionRef}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error("无法读取图片。"));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("无法读取图片。"));
    reader.readAsDataURL(file);
  });
}

function firstNovelParagraphId(model: NovelDocumentModelR1): string | null {
  const visit = (id: string): string | null => {
    const block = model.blocks[id];
    if (!block) return null;
    if (block.kind === "paragraph") return block.id;
    for (const childId of block.childIds) {
      const found = visit(childId);
      if (found) return found;
    }
    return null;
  };
  for (const rootId of model.rootIds) {
    const found = visit(rootId);
    if (found) return found;
  }
  return null;
}
