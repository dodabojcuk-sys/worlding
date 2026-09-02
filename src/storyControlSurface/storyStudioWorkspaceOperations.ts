import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import {
  createNovelDocumentStructure,
  migrateCreationStructure,
  NOVEL_DOCUMENT_AUTHORITY_KEY,
  NOVEL_DOCUMENT_MODEL_KEY,
  NOVEL_MIGRATION_RECEIPT_KEY,
  readNovelDocumentModel,
  OUTPUT_ARTIFACT_SCHEMA_VERSION
} from "../storyCreation/creationArtifactModel.ts";
import {
  serializeNovelDocumentModelToMarkdown,
  validateNovelDocumentModelR1,
  type NovelDocumentModelR1,
  type NovelReferenceResolver
} from "../storyCreation/novelDocumentModelR1.ts";
import {
  normalizeWorkVersionOutputArtifactSource,
  projectWorkVersionOutputArtifactSourceValidation,
  type WorkVersionOutputArtifactSourceR0
} from "../storyCreation/workVersionBoundOutputArtifact.ts";
import { stableJson } from "../storyContinuity/continuityValidation.ts";
import { createStoryStudioWorkVersionAuthority } from "../storyWorkspace/workVersionAuthority.ts";
import { createObjectCatalog, type CatalogLifecycleSource } from "../storyWorkspace/objectCatalog.ts";
import type { DraftCreationReceipt } from "../storyContracts/multiNodePrediction.ts";

import {
  createWorkspaceNote,
  createWorkspaceNoteOnce,
  createStoryWorkspace,
  deleteWorkspaceNote,
  getWorkspaceBacklinks,
  getWorkspaceLinkedNotes,
  getWorkspaceNoteGuard,
  getWorkspaceTree,
  listWorkspaceNotes,
  readWorkspaceNote,
  readWorkspaceState,
  restoreWorkspaceNoteSource,
  serializeStoryMarkdown,
  openStoryWorkspace,
  updateWorkspaceNote,
  updateWorkspaceState,
  validateStoryWorkspace
} from "../storyWorkspace/storyWorkspaceRepository.mjs";
import {
  createVisualDocument as createVisualDocumentFile,
  importVisualAsset as importVisualAssetFile,
  listVisualDocuments as listVisualDocumentFiles,
  readVisualDocument as readVisualDocumentFile,
  restoreVisualDocumentSource,
  resolveVisualAsset as resolveVisualAssetFile,
  updateVisualDocument as updateVisualDocumentFile
  , validateVisualDocumentUpdate as validateVisualDocumentUpdateFile
} from "../storyWorkspace/visualDocumentRepository.mjs";
import {
  createWorkspaceFolder as createWorkspaceFolderFile,
  readWorkspaceLayout,
  updateWorkspaceLayout
} from "../storyWorkspace/workspaceLayoutRepository.mjs";
import {
  createCreationMediaAsset as createCreationMediaAssetFile,
  deleteCreationMediaAsset as deleteCreationMediaAssetFile,
  readCreationMediaCatalog,
  updateCreationMediaAsset as updateCreationMediaAssetFile
} from "../storyWorkspace/creationMediaRepository.mjs";
import {
  createR9AProjectBackup,
  createR9AWorkflowTask,
  listR9AProjectBackups,
  readR9AWorkflowState,
  restoreR9AProjectBackup,
  updateR9AWorkflowTask,
  type R9AWorkflowTask
} from "../storyWorkspace/r9aWorkflowRepository.ts";
import {
  createDocumentMilestone as createDocumentMilestoneFile,
  listDocumentRevisions as listDocumentRevisionsFile,
  previewDocumentRevision as previewDocumentRevisionFile,
  readDocumentRevisionSnapshot,
  recordDocumentRevision
} from "../storyWorkspace/documentRevisionRepository.mjs";
import { buildCharacterCardWorldProjection, type CharacterCardWorldProjection, type CharacterRelationGroupConfig } from "../storyCardPresentation/characterCardWorldProjection.ts";
import {
  readCardPresentation,
  restoreCardPresentationSource,
  saveCardPresentation,
  serializeCardPresentation,
  validateCardPresentation
} from "../storyWorkspace/cardPresentationRepository.mjs";
import {
  deleteCardTemplate as deleteCardTemplateFile,
  listCardTemplates as listCardTemplateFiles,
  readCardTemplate as readCardTemplateFile,
  restoreCardTemplateSource,
  saveCardTemplate as saveCardTemplateFile,
  serializeCardTemplate
} from "../storyWorkspace/cardTemplateRepository.mjs";
import {
  createWorkspaceSelection,
  type WorkspaceSelection
} from "../productWorkspace/storyStudioWorkspaceSelection.ts";
import { parseStoryCardSections } from "../storyCardPresentation/storyCardSectionAnchors.ts";
import {
  CHARACTER_PROPERTY_PREFIX,
  CHARACTER_SUBTYPE_FIELD,
  listCharacterPropertyFrontmatterKeys,
  normalizeCharacterProperties,
  normalizeCharacterSubtype,
  parseCharacterProperties,
  serializeCharacterProperties,
  type CharacterProperty,
  type CharacterPropertyDiagnostic
} from "../storyCardPresentation/characterProperties.ts";
import {
  applyCharacterTemplateDiff,
  buildCharacterTemplateDiff,
  createCardTemplateFromCharacter as extractCardTemplateFromCharacter,
  type CharacterCardDocument,
  type CharacterTemplateDiff
} from "../storyCardPresentation/characterTemplate.ts";
import { createCharacterPreset, type CharacterCreationMode } from "../storyCardPresentation/characterPreset.ts";
import { normalizeCardTemplate, type CardTemplate } from "../storyCardPresentation/cardTemplateSchema.ts";
import {
  normalizeStoryStudioObjectProfile,
  readStoryStudioObjectProfile,
  serializeStoryStudioObjectProfile,
  type StoryStudioObjectProfile,
  type StoryStudioObjectProfileInput
} from "../storyContracts/storyStudioObjectProfile.ts";
import {
  extractSourceCandidatesR0,
  importSourceDocumentR0,
  listSourceImportDocumentsR0,
  readSourceImportR0,
  type SourceImportDocumentR0,
  type SourceImportKnownObjectR0
} from "./sourceImportReviewR0.ts";
import {
  activateAgentType as activateAgentTypeFile,
  addAgentTypeField as addAgentTypeFieldFile,
  agentTypeFieldFrontmatterKey,
  countWorldObjectsByAgentType as countWorldObjectsByAgentTypeFile,
  createAgentType as createAgentTypeFile,
  deleteAgentType as deleteAgentTypeFile,
  getAgentType as getAgentTypeFile,
  listAgentTypes as listAgentTypesFile,
  listClassifiedLibraryProjection as listClassifiedLibraryProjectionFile,
  listUncertainLibraryProjection as listUncertainLibraryProjectionFile,
  listWorldObjectsByAgentType as listWorldObjectsByAgentTypeFile,
  readAgentTypeCatalog,
  resolveAgentTypeForWorldObject as resolveAgentTypeForWorldObjectFile,
  retireAgentType as retireAgentTypeFile,
  retireAgentTypeField as retireAgentTypeFieldFile,
  updateAgentType as updateAgentTypeFile,
  updateAgentTypeField as updateAgentTypeFieldFile,
  type AgentTypeBaseCapability,
  type AgentTypeDefinition,
  type AgentTypeFieldDefinition,
  type AgentTypeFieldKind,
  type AgentTypeProvenance,
  type AgentTypeStatus
} from "../storyWorkspace/agentTypeCatalog.ts";

const APP_STATE_VERSION = "story-studio-state/v1";
const PROJECT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const WORLD_OBJECT_TYPES = ["character", "location", "event", "item", "faction", "rule", "thread"] as const;
const WORLD_OBJECT_TYPE_SET = new Set<string>(WORLD_OBJECT_TYPES);
const OBJECT_CARD_BLOCK_TYPES = ["text", "secret", "character-arc", "property-group", "relation-group", "properties", "connections", "media", "map", "graph", "timeline", "tree", "canvas"] as const;
const OBJECT_CARD_BLOCK_TYPE_SET = new Set<string>(OBJECT_CARD_BLOCK_TYPES);
const OBJECT_PROFILE_FRONTMATTER_KEY = "story_profile_v1";
const EDITABLE_FRONTMATTER_KEYS = new Set(["title", "status", "tags", "aliases", "card_layout", "card_blocks", "cover", "media", OBJECT_PROFILE_FRONTMATTER_KEY]);
const RESERVED_FRONTMATTER_KEYS = new Set(["world_os", "id", "type"]);
const EVENT_AUTHORITY_STATUSES = new Set(["planned", "committed"]);
const EVENT_AUTHORITY_TAGS = new Set(["作者规划", "作者确认"]);
const CANON_PROVENANCE_KEYS = [
  "source_change_set_id",
  "source_change_set_revision",
  "author_decision_ref",
  "apply_operation_key",
  "apply_intent_hash"
] as const;

export type StoryStudioWorldObjectType = typeof WORLD_OBJECT_TYPES[number];
export type StoryStudioObjectCardBlockType = typeof OBJECT_CARD_BLOCK_TYPES[number];

export type StoryStudioObjectCardBlock = {
  id: string;
  kind: StoryStudioObjectCardBlockType;
  contentRef?: string;
  presentationRef?: string;
  label?: string;
  propertyKeys?: string[];
  relationConfig?: CharacterRelationGroupConfig;
  collapsed: boolean;
  size: "small" | "medium" | "large";
};

export type StoryStudioCardImage = {
  assetRef: string;
  fit: "cover" | "contain";
  position: { x: number; y: number };
};

export type StoryStudioObjectCard = {
  version: "story-card-presentation/v2";
  objectId: string;
  preset: "character";
  layout: "vertical" | "horizontal";
  portrait: StoryStudioCardImage | null;
  cover: StoryStudioCardImage | null;
  templateRef: string | null;
  blocks: StoryStudioObjectCardBlock[];
  visual: { density: "comfortable" | "compact"; mediaAssets: string[] };
  revisionToken: string | null;
  source: "virtual-v1" | "presentation-json";
  diagnostics: Array<{ code: string; message: string; blockId?: string; contentRef?: string; sectionId?: string }>;
  migration: { required: boolean; cleanupPending: boolean };
};

export type StoryStudioObjectVisualReference = {
  type: StoryStudioVisualDocumentType;
  title: string;
  relativePath: string;
};

export type StoryStudioWorldObjectSummary = {
  id: string;
  relativeId: string;
  title: string;
  type: StoryStudioWorldObjectType;
  status: string;
  tags: string[];
  aliases: string[];
  revisionToken: string;
  /** Filesystem-backed source timestamp; presentation-only, never a domain owner. */
  updatedAt?: string;
  source: "markdown";
  agentTypeId: string | null;
};

export type StoryStudioWorldObject = StoryStudioWorldObjectSummary & {
  body: string;
  revisionToken: string;
  properties: Record<string, string | string[]>;
  agentTypeFieldValues: Record<string, string | number | boolean>;
  knowledgeSubjects: string[];
  subtype: string;
  typedProperties: StoryStudioCharacterProperty[];
  propertyDiagnostics: CharacterPropertyDiagnostic[];
  profile: StoryStudioObjectProfile | null;
  linkedObjects: StoryStudioWorldObjectSummary[];
  backlinks: StoryStudioWorldObjectSummary[];
  card: StoryStudioObjectCard;
  visualReferences: StoryStudioObjectVisualReference[];
  worldProjection: CharacterCardWorldProjection | null;
};

export type StoryStudioVisualDocumentType = "map" | "graph" | "canvas" | "timeline" | "tree";

export type StoryStudioWorkspaceFolder = {
  id: string;
  title: string;
  parentId: string | null;
  kind: "folder" | "custom-category";
  order: number;
};

/** A library placement is presentation metadata only. It never changes a
 * Markdown object's authority, lifecycle, or source location. */
export type StoryStudioWorkspacePlacement = {
  documentId: string;
  folderId: string;
  order: number;
};

export type StoryStudioBulkLibraryResult = {
  updatedObjectIds: string[];
  skippedObjectIds: string[];
};

export type StoryStudioRevisionDocumentRef = {
  kind: "object" | "visual" | "card" | "template" | "artifact";
  id: string;
};

export type StoryStudioCharacterProperty = CharacterProperty & {
  references: Array<{ id: string; title: string | null; type: StoryStudioWorldObjectType | null; missing: boolean }>;
};

export type StoryStudioCardTemplate = CardTemplate & {
  revisionToken: string;
};

export type StoryStudioVisualDocument = {
  version: "story-visual-document/v1";
  id: string;
  type: StoryStudioVisualDocumentType;
  title: string;
  objectRefs: string[];
  viewport: { x: number; y: number; zoom: number };
  content: Record<string, unknown>;
  overlays: { evidence: unknown[]; risks: unknown[]; candidateChanges: unknown[] };
  relativePath: string;
  contentHash: string;
  source: "visual-json";
};

export type StoryStudioVisualWorkbenchBootstrap = {
  documents: StoryStudioVisualDocument[];
  primaryDocument: StoryStudioVisualDocument | null;
  secondaryDocument: StoryStudioVisualDocument | null;
  tabs: string[];
  splitView: boolean;
  active: boolean;
  source: "visual-json";
};

export type StoryStudioPlanningEventTimelineResult = {
  planningNoteCreated: boolean;
  planningEventId: string;
  timelineEntryAdded: boolean;
  timelineConflict: boolean;
  noteConflict: boolean;
  recoveryAction: null | {
    kind: "reload-and-add-existing-planning-event";
    planningEventId: string;
    timelineRelativePath: string;
  };
  document: StoryStudioVisualDocument;
};

export type StoryStudioAddPlanningEventResult = {
  planningEventId: string;
  timelineEntryAdded: boolean;
  timelineConflict: boolean;
  document: StoryStudioVisualDocument;
};

export type StoryStudioPlanningEventResult = {
  conflict: boolean;
  object: StoryStudioWorldObject;
};

export type StoryStudioWritingDocumentSummary = {
  id: string;
  relativeId: string;
  title: string;
  type: "chapter" | "scene";
  status: string;
  chapterId: string | null;
  source: "markdown";
};

export type StoryStudioWritingGuard = {
  characters: StoryStudioWorldObjectSummary[];
  locations: StoryStudioWorldObjectSummary[];
  events: StoryStudioWorldObjectSummary[];
  rules: Array<{ id: string; title: string; status: string; summary: string }>;
  threads: Array<{ id: string; title: string; status: string; summary: string }>;
};

export type StoryStudioWritingDocument = StoryStudioWritingDocumentSummary & {
  body: string;
  revisionToken: string;
  knowledgeSubjects: string[];
  linkedRuleIds: string[];
  guard: StoryStudioWritingGuard;
  mentionedObjects: StoryStudioWorldObjectSummary[];
};

export type StoryStudioWritingBootstrap = {
  chapters: Array<StoryStudioWritingDocumentSummary & { scenes: StoryStudioWritingDocumentSummary[] }>;
  activeDocument: StoryStudioWritingDocument | null;
  selection: WorkspaceSelection;
  source: "markdown";
};

/** Format-neutral, source-bound narrative material. It is stored by the
 * existing workspace document owner and never asserts authority over its
 * source owners. */
export type StoryUnitSourceKind = "event-line" | "nuwa-run" | "nuwa-candidate" | "tianyi-intent" | "story-workspace" | "writing-selection" | "library" | "import";
export type NarrativeAuthority = "canon" | "author-intent" | "candidate" | "inference" | "belief" | "unknown" | "conflict" | "derived";
export type StoryUnitLifecycle = "draft" | "active" | "frozen" | "superseded" | "archived";
export type StoryUnitKind = "main" | "branch";
export type StoryUnitStatus = "draft" | "active" | "candidate" | "conflict" | "archived";
export type OutputArtifactType = "novel" | "screenplay" | "storyboard" | "comic" | "motion-comic" | "interactive-drama";
export type OutputArtifactLifecycle = "draft" | "queued" | "generating" | "review" | "approved" | "archived";

export type StoryUnitSourceRef = {
  sourceKind: StoryUnitSourceKind;
  ownerId: string;
  entityId: string;
  entityVersion?: string;
  capturedAt: string;
  staleState?: "fresh" | "stale" | "missing";
};

export type StoryUnitItem = {
  id: string;
  kind: string;
  authority: NarrativeAuthority;
  possibilityStatus?: "proposed" | "compared" | "selected-for-output" | "rejected" | "paused" | "abandoned";
  content: Record<string, unknown>;
  sourceRefs: StoryUnitSourceRef[];
  evidenceRefs?: string[];
  subjectRef?: string;
  createdBy: "author" | "system" | "ai";
};

export type StoryStudioStoryUnit = {
  id: string;
  relativeId: string;
  title: string;
  summary: string;
  kind: StoryUnitKind;
  parentUnitId: string | null;
  branchPointEventId: string | null;
  mergeTargetUnitId: string | null;
  order: number;
  sourceVersionRef: string | null;
  status: StoryUnitStatus;
  objective: string;
  coreConflict: string;
  turningPoint: string;
  openHook: string;
  lifecycle: StoryUnitLifecycle;
  sourceRefs: StoryUnitSourceRef[];
  items: StoryUnitItem[];
  linkedEntityIds: string[];
  unresolvedQuestionIds: string[];
  generationConstraints: Record<string, unknown>;
  version: string;
  createdAt: string;
  updatedAt: string;
  source: "markdown";
};

export type StoryStudioOutputSourceUnitRef = {
  unitId: string;
  unitVersion: string;
  role: "primary" | "supporting";
  includedItemIds: string[];
};

export type StoryStudioOutputArtifact = {
  schemaVersion: typeof OUTPUT_ARTIFACT_SCHEMA_VERSION;
  id: string;
  relativeId: string;
  type: OutputArtifactType;
  title: string;
  sourceUnits: StoryStudioOutputSourceUnitRef[];
  generationBrief: Record<string, unknown> | null;
  content: string;
  structure: Record<string, unknown>;
  lifecycle: OutputArtifactLifecycle;
  currentRevisionId: string;
  provenance: {
    sourceArtifactId: string | null;
    sourceArtifactVersion: string | null;
    migratedFromVersion: string | null;
    workVersionSource: WorkVersionOutputArtifactSourceR0 | null;
  };
  version: string;
  createdAt: string;
  updatedAt: string;
  source: "markdown";
};

export type StoryStudioMediaAsset = {
  id: string;
  fileName: string;
  kind: "image" | "audio" | "video" | "reference";
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  source: string;
  license: string;
  generatedBy: string;
  tags: string[];
  relativePath: string;
  createdAt: string;
  updatedAt: string;
  backlinks: Array<{ artifactId: string; artifactTitle: string; structurePath: string }>;
};

export type StoryStudioMediaCatalog = {
  version: "story-studio-media-catalog/v1";
  assets: StoryStudioMediaAsset[];
  contentHash: string | null;
  source: "creation-media-json";
};

export type StoryStudioWritingContinuity = {
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

export type StoryStudioProject = {
  id: string;
  title: string;
  status: string;
  genre: string | null;
  ambience: string | null;
  counts: {
    chapters: number;
    scenes: number;
    objects: number;
  };
  source: "markdown";
};

export type StoryStudioBootstrap = {
  activeProject: StoryStudioProject | null;
  recentProjects: StoryStudioProject[];
  projects: StoryStudioProject[];
  recovery?: {
    code: "active-project-missing" | "active-project-invalid";
    message: string;
  };
};

export type StoryStudioWorkspaceOperations = ReturnType<typeof createStoryStudioWorkspaceOperations>;

export function createStoryStudioWorkspaceOperations(input: {
  rootPath: string;
  stateFilePath: string;
  beforeCardPresentationSave?: (context: { projectPath: string; objectId: string; operationId: string }) => void;
  beforeLegacyCardCleanup?: (context: { projectPath: string; objectId: string; operationId: string }) => void;
  beforeTemplateSave?: (context: { projectPath: string; templateId: string; operationId: string }) => void;
  beforeInitialWritingSceneCreate?: (context: { projectPath: string; chapterId: string }) => void;
  beforeInitialWritingBootstrap?: (context: { projectPath: string; chapterId: string; sceneId: string }) => void;
}) {
  const rootPath = prepareConfiguredRoot(input.rootPath);
  const stateFilePath = path.resolve(input.stateFilePath);

  return {
    resolveProjectWorkspacePath(projectInput: { projectId: string }): string {
      return resolveProjectPath(rootPath, projectInput.projectId);
    },

    listProjects(): StoryStudioProject[] {
      return listProjectIds(rootPath).flatMap((projectId) => {
        try {
          return [readProductProject(rootPath, projectId)];
        } catch {
          return [];
        }
      });
    },

    createProject(projectInput: {
      title: string;
      folderSlug: string;
      genre?: string;
      ambience?: string;
    }): StoryStudioProject {
      const title = requireText(projectInput.title, "World title", 80);
      const projectId = requireProjectId(projectInput.folderSlug);
      const projectPath = resolveProjectPath(rootPath, projectId, { allowMissing: true });
      if (existsSync(projectPath)) throw new Error("Project folder already exists.");

      const genre = optionalMachineValue(projectInput.genre, "genre");
      const ambience = optionalMachineValue(projectInput.ambience, "ambience");
      createStoryWorkspace({ rootPath: projectPath, title, genre, ambience });
      const project = readProductProject(rootPath, projectId);
      rememberProject(stateFilePath, projectId);
      return project;
    },

    openProject(projectInput: { projectId: string }): StoryStudioProject {
      const projectId = requireProjectId(projectInput.projectId);
      const project = readProductProject(rootPath, projectId);
      rememberProject(stateFilePath, projectId);
      return project;
    },

    getBootstrap(): StoryStudioBootstrap {
      const state = readAppState(stateFilePath);
      const projects = this.listProjects();
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      let activeProject = state.activeProject ? projectsById.get(state.activeProject) || null : null;
      let recovery: StoryStudioBootstrap["recovery"];

      if (state.activeProject && !activeProject) {
        const candidate = resolveProjectPath(rootPath, state.activeProject, { allowMissing: true });
        recovery = existsSync(candidate)
          ? { code: "active-project-invalid", message: "上次打开的世界暂时无法读取，可以选择其他世界。" }
          : { code: "active-project-missing", message: "上次打开的世界已不在项目目录中。" };
        const nextRecent = state.recentProjects.filter((id) => projectsById.has(id));
        writeAppState(stateFilePath, { activeProject: null, recentProjects: nextRecent });
      }

      const recentProjects = state.recentProjects
        .map((id) => projectsById.get(id))
        .filter((project): project is StoryStudioProject => Boolean(project));

      return clone({ activeProject, recentProjects, projects, ...(recovery ? { recovery } : {}) });
    },

    listWorldObjects(objectInput: {
      projectId: string;
      type?: StoryStudioWorldObjectType;
    }): StoryStudioWorldObjectSummary[] {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const type = objectInput.type ? requireWorldObjectType(objectInput.type) : null;
      return listObjectSummaries(projectPath)
        .filter((object) => !type || object.type === type)
        .sort(compareWorldObjects);
    },

    listAgentTypes(agentTypeInput: { projectId: string }): { catalogRevision: number; types: AgentTypeDefinition[]; boundCounts: Record<string, number> } {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      const catalog = readAgentTypeCatalog(projectPath);
      const boundCounts = Object.fromEntries(catalog.customTypes.map((type) => [type.typeId, listWorkspaceNotes(projectPath).filter((note) => note.frontmatter.agentTypeId === type.typeId).length]));
      return clone({ catalogRevision: catalog.revision, types: listAgentTypesFile(projectPath), boundCounts });
    },

    getAgentType(agentTypeInput: { projectId: string; typeId: string }): AgentTypeDefinition | null {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(getAgentTypeFile(projectPath, agentTypeInput.typeId));
    },

    resolveAgentTypeForWorldObject(agentTypeInput: { projectId: string; objectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(resolveAgentTypeForWorldObjectFile(projectPath, agentTypeInput.objectId));
    },

    listWorldObjectsByAgentType(agentTypeInput: { projectId: string; typeId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(listWorldObjectsByAgentTypeFile(projectPath, agentTypeInput.typeId));
    },

    countWorldObjectsByAgentType(agentTypeInput: { projectId: string; typeId: string }): number {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return countWorldObjectsByAgentTypeFile(projectPath, agentTypeInput.typeId);
    },

    listClassifiedLibraryProjection(agentTypeInput: { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(listClassifiedLibraryProjectionFile(projectPath));
    },

    async listUncertainLibraryProjection(agentTypeInput: { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(await listUncertainLibraryProjectionFile(projectPath, agentTypeInput.projectId));
    },

    createAgentType(agentTypeInput: {
      projectId: string;
      label: string;
      description?: string;
      baseCapability: AgentTypeBaseCapability;
      fieldDefinitions?: Array<Partial<AgentTypeFieldDefinition> & { label: string; kind: AgentTypeFieldKind }>;
      status?: AgentTypeStatus;
      provenance?: AgentTypeProvenance;
      expectedCatalogRevision?: number;
      expectedRevision?: number;
      now?: string;
    }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(createAgentTypeFile(projectPath, agentTypeInput));
    },

    activateAgentType(agentTypeInput: Parameters<typeof activateAgentTypeFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(activateAgentTypeFile(projectPath, agentTypeInput));
    },

    updateAgentType(agentTypeInput: Parameters<typeof updateAgentTypeFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(updateAgentTypeFile(projectPath, agentTypeInput));
    },

    retireAgentType(agentTypeInput: Parameters<typeof retireAgentTypeFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(retireAgentTypeFile(projectPath, agentTypeInput));
    },

    deleteAgentType(agentTypeInput: Parameters<typeof deleteAgentTypeFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(deleteAgentTypeFile(projectPath, agentTypeInput));
    },

    addAgentTypeField(agentTypeInput: Parameters<typeof addAgentTypeFieldFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(addAgentTypeFieldFile(projectPath, agentTypeInput));
    },

    updateAgentTypeField(agentTypeInput: Parameters<typeof updateAgentTypeFieldFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(updateAgentTypeFieldFile(projectPath, agentTypeInput));
    },

    retireAgentTypeField(agentTypeInput: Parameters<typeof retireAgentTypeFieldFile>[1] & { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, agentTypeInput.projectId);
      return clone(retireAgentTypeFieldFile(projectPath, agentTypeInput));
    },

    searchWorldObjects(searchInput: {
      projectId: string;
      query: string;
      type?: StoryStudioWorldObjectType;
    }): StoryStudioWorldObjectSummary[] {
      const query = String(searchInput.query || "").trim().toLocaleLowerCase("zh-CN");
      return this.listWorldObjects({ projectId: searchInput.projectId, ...(searchInput.type ? { type: searchInput.type } : {}) })
        .filter((object) => !query || [object.title, ...object.tags, ...object.aliases]
          .some((value) => value.toLocaleLowerCase("zh-CN").includes(query)));
    },

    listCardTemplates(templateInput: { projectId: string }): StoryStudioCardTemplate[] {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      return listCardTemplateFiles(projectPath).map(projectCardTemplate);
    },

    createCardTemplate(templateInput: { projectId: string; template: CardTemplate }): { conflict: boolean; template: StoryStudioCardTemplate | null } {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      const template = normalizeCardTemplate(templateInput.template);
      const operationId = createCardOperationId(template.id, { action: "create-template", template });
      input.beforeTemplateSave?.({ projectPath, templateId: template.id, operationId });
      const saved = saveCardTemplateFile(projectPath, { templateId: template.id, expectedContentHash: null, document: template });
      if (saved.conflict) return clone({ conflict: true, template: saved.template?.missing ? null : projectCardTemplate(saved.template) });
      recordCanonicalRevision(projectPath, { kind: "template", id: template.id }, "create", null, operationId);
      return clone({ conflict: false, template: projectCardTemplate(saved.template) });
    },

    updateCardTemplate(templateInput: { projectId: string; templateId: string; expectedHash: string; template: CardTemplate }): { conflict: boolean; template: StoryStudioCardTemplate | null } {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      const template = normalizeCardTemplate(templateInput.template);
      if (template.id !== templateInput.templateId) throw new Error("Card template identity cannot be renamed.");
      const expectedHash = requireCardHash(templateInput.expectedHash);
      const operationId = createCardOperationId(template.id, { action: "update-template", expectedHash, template });
      input.beforeTemplateSave?.({ projectPath, templateId: template.id, operationId });
      const saved = saveCardTemplateFile(projectPath, { templateId: template.id, expectedContentHash: expectedHash, document: template });
      if (saved.conflict) return clone({ conflict: true, template: saved.template?.missing ? null : projectCardTemplate(saved.template) });
      recordCanonicalRevision(projectPath, { kind: "template", id: template.id }, "save", null, operationId);
      return clone({ conflict: false, template: projectCardTemplate(saved.template) });
    },

    createCardTemplateFromCharacter(templateInput: { projectId: string; objectId: string; templateId: string; label: string; expectedHash: string; presentationExpectedHash: string | null }): { conflict: boolean; template: StoryStudioCardTemplate | null } {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      const note = findObjectNote(projectPath, requireText(templateInput.objectId, "Object identifier", 160));
      if (note.type !== "character") throw new Error("Only character cards can create Character Preset templates.");
      const parsed = requireValidCharacterProperties(note.frontmatter);
      const legacyCard = readLegacyObjectCard(projectPath, note.type, note.frontmatter);
      const presentation = readCardPresentation(projectPath, { objectId: note.id, legacyCard: { ...legacyCard, hasLegacyFields: hasLegacyCardFields(note.frontmatter) }, markdownBody: note.body });
      if (note.contentHash !== requireCardHash(templateInput.expectedHash) || presentation.contentHash !== normalizeExpectedHash(templateInput.presentationExpectedHash)) {
        return clone({ conflict: true, template: null });
      }
      const template = extractCardTemplateFromCharacter({
        templateId: templateInput.templateId,
        label: templateInput.label,
        body: note.body,
        properties: parsed.properties,
        card: presentation.document as CharacterCardDocument
      });
      const operationId = createCardOperationId(template.id, { action: "extract-template", objectId: note.id, markdownHash: note.contentHash, presentationHash: presentation.contentHash });
      input.beforeTemplateSave?.({ projectPath, templateId: template.id, operationId });
      const saved = saveCardTemplateFile(projectPath, { templateId: template.id, expectedContentHash: null, document: template });
      if (saved.conflict) return clone({ conflict: true, template: saved.template?.missing ? null : projectCardTemplate(saved.template) });
      recordCanonicalRevision(projectPath, { kind: "template", id: template.id }, "create", null, operationId);
      return clone({ conflict: false, template: projectCardTemplate(saved.template) });
    },

    deleteCardTemplate(templateInput: { projectId: string; templateId: string; expectedHash: string }): { conflict: boolean; deleted: boolean } {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      const templateId = requireText(templateInput.templateId, "Card template", 120);
      const current = readCardTemplateFile(projectPath, { templateId });
      if (!current.missing) recordCanonicalRevision(projectPath, { kind: "template", id: templateId }, "external-baseline");
      const result = deleteCardTemplateFile(projectPath, { templateId, expectedContentHash: requireCardHash(templateInput.expectedHash) });
      return clone({ conflict: result.conflict, deleted: result.deleted });
    },

    previewCharacterTemplateApply(templateInput: {
      projectId: string;
      objectId: string;
      templateId: string;
      templateExpectedHash: string;
      markdownExpectedHash: string;
      presentationExpectedHash: string | null;
    }): { conflict: boolean; templateConflict: boolean; markdownConflict: boolean; presentationConflict: boolean; templateReadValid: boolean; diff: CharacterTemplateDiff | null } {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      const context = readCharacterTemplateContext(projectPath, templateInput.objectId, templateInput.templateId);
      const conflicts = characterTemplateConflicts(context, templateInput);
      if (conflicts.conflict) return clone({ ...conflicts, templateReadValid: true, diff: null });
      const diff = buildCharacterTemplateDiff({ objectId: context.note.id, template: context.template.template, body: context.note.body, properties: context.properties, card: context.presentation.document as CharacterCardDocument });
      return clone({ ...conflicts, templateReadValid: true, diff });
    },

    applyCharacterTemplate(templateInput: {
      projectId: string;
      objectId: string;
      templateId: string;
      templateExpectedHash: string;
      markdownExpectedHash: string;
      presentationExpectedHash: string | null;
    }) {
      const projectPath = resolveProjectPath(rootPath, templateInput.projectId);
      const context = readCharacterTemplateContext(projectPath, templateInput.objectId, templateInput.templateId);
      const conflicts = characterTemplateConflicts(context, templateInput);
      if (conflicts.conflict) return clone({
        ...conflicts,
        templateReadValid: true,
        characterStructureSaved: false,
        presentationSaved: false,
        unplacedSectionsCreated: 0,
        unplacedPropertiesCreated: 0,
        templateOverwriteCount: 0,
        diff: null,
        object: readProductObject(projectPath, context.note.id)
      });
      const diff = buildCharacterTemplateDiff({ objectId: context.note.id, template: context.template.template, body: context.note.body, properties: context.properties, card: context.presentation.document as CharacterCardDocument });
      const applied = applyCharacterTemplateDiff({ body: context.note.body, properties: context.properties, card: context.presentation.document as CharacterCardDocument, template: context.template.template, diff });
      const serialized = serializeCharacterProperties(applied.properties, context.subtype);
      const frontmatter = { ...serialized.frontmatter };
      const removeFrontmatterKeys = listRemovedCharacterFields(context.note.frontmatter, frontmatter);
      const markdownChanged = applied.body !== context.note.body || !sameCharacterFrontmatter(context.note.frontmatter, frontmatter);
      const presentationChanged = serializeCardPresentation(applied.card) !== serializeCardPresentation(context.presentation.document);
      const operationId = createCardOperationId(context.note.id, { action: "apply-template", templateId: context.template.template.id, templateHash: context.template.contentHash, markdownHash: context.note.contentHash, presentationHash: context.presentation.contentHash, diff });
      let characterStructureSaved = false;
      let presentationSaved = false;
      let presentationConflict = false;
      if (markdownChanged) {
        const result = updateWorkspaceNote(projectPath, {
          relativePath: context.note.relativePath,
          expectedContentHash: context.note.contentHash,
          frontmatter,
          removeFrontmatterKeys,
          body: applied.body
        });
        if (result.conflict) return clone({ ...conflicts, conflict: true, markdownConflict: true, templateReadValid: true, characterStructureSaved: false, presentationSaved: false, unplacedSectionsCreated: 0, unplacedPropertiesCreated: 0, templateOverwriteCount: 0, diff, object: readProductObject(projectPath, context.note.id) });
        characterStructureSaved = true;
        recordCanonicalRevision(projectPath, { kind: "object", id: context.note.id }, "save", null, operationId);
      }
      if (presentationChanged) {
        input.beforeCardPresentationSave?.({ projectPath, objectId: context.note.id, operationId });
        const result = saveCardPresentation(projectPath, { objectId: context.note.id, expectedContentHash: context.presentation.contentHash, document: applied.card, markdownBody: applied.body, legacyCard: context.legacyCard });
        if (result.conflict) presentationConflict = true;
        else {
          presentationSaved = true;
          recordCanonicalRevision(projectPath, { kind: "card", id: context.note.id }, "save", null, operationId);
        }
      }
      rememberObject(projectPath, context.note.relativePath);
      return clone({
        conflict: presentationConflict,
        templateConflict: false,
        markdownConflict: false,
        presentationConflict,
        templateReadValid: true,
        characterStructureSaved,
        presentationSaved,
        unplacedSectionsCreated: characterStructureSaved && presentationConflict ? diff.missingSections.length : 0,
        unplacedPropertiesCreated: characterStructureSaved && presentationConflict ? diff.missingPropertyDefinitions.length : 0,
        templateOverwriteCount: 0,
        diff,
        object: readProductObject(projectPath, context.note.id)
      });
    },

    createCharacterCard(characterInput: {
      projectId: string;
      title: string;
      mode: CharacterCreationMode | "template";
      subtype?: string;
      status?: string;
      tags?: string[];
      aliases?: string[];
      background?: string;
      personality?: string;
      appearance?: string;
      properties?: CharacterProperty[];
      portrait?: CharacterCardDocument["portrait"];
      cover?: CharacterCardDocument["cover"];
      templateId?: string;
      templateExpectedHash?: string;
      agentTypeId?: string;
      agentTypeFieldValues?: Record<string, unknown>;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }) {
      const projectPath = resolveProjectPath(rootPath, characterInput.projectId);
      const title = requireText(characterInput.title, "Character title", 80);
      const existing = listObjectSummaries(projectPath);
      const objectId = uniqueObjectId("character", title, new Set(existing.map((item) => item.id)));
      const subtype = normalizeCharacterSubtype(characterInput.subtype);
      const requestedProperties = normalizeCharacterProperties(characterInput.properties || []);
      let preset = createCharacterPreset({
        objectId,
        title,
        mode: characterInput.mode === "guided" ? "guided" : "freeform",
        background: characterInput.background,
        personality: characterInput.personality,
        appearance: characterInput.appearance,
        properties: requestedProperties,
        portrait: characterInput.portrait,
        cover: characterInput.cover
      });
      let templateId: string | null = null;
      let templateHash: string | null = null;
      if (characterInput.mode === "template") {
        const template = readCardTemplateFile(projectPath, { templateId: requireText(characterInput.templateId, "Card template", 120) });
        if (template.missing) throw new Error("Card template does not exist.");
        if (template.contentHash !== requireCardHash(characterInput.templateExpectedHash)) throw new Error("Card template changed before character creation.");
        const diff = buildCharacterTemplateDiff({ objectId, template: template.template, body: preset.body, properties: preset.properties, card: preset.card });
        const applied = applyCharacterTemplateDiff({ body: preset.body, properties: preset.properties, card: preset.card, template: template.template, diff });
        preset = {
          ...applied,
          card: {
            ...applied.card,
            layout: template.template.visualDefaults.layout,
            visual: { ...applied.card.visual, density: template.template.visualDefaults.density }
          }
        };
        templateId = template.template.id;
        templateHash = template.contentHash;
      }
      preset = {
        ...preset,
        card: validateCardPresentation(projectPath, { objectId, document: preset.card, operation: "write" }) as CharacterCardDocument
      };
      const serialized = serializeCharacterProperties(preset.properties, subtype);
      const profile = normalizeOptionalObjectProfile(characterInput.profile, "character");
      const agentTypeFrontmatter = prepareAgentTypeBindingFrontmatter(projectPath, "character", null, characterInput.agentTypeId, characterInput.agentTypeFieldValues, true);
      const operationId = createCardOperationId(objectId, { action: "create-character", mode: characterInput.mode, templateId, templateHash, title, subtype, properties: preset.properties, body: preset.body, card: preset.card });
      const note = createWorkspaceNote(projectPath, {
        id: objectId,
        type: "character",
        title,
        status: optionalText(characterInput.status, "status", 64) || defaultObjectStatus("character"),
        frontmatter: {
          aliases: requireStringList(characterInput.aliases, "aliases"),
          tags: requireStringList(characterInput.tags, "tags"),
          ...serialized.frontmatter,
          ...(profile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(profile) } : {}),
          ...agentTypeFrontmatter.frontmatter
        },
        body: preset.body
      });
      recordCanonicalRevision(projectPath, { kind: "object", id: note.id }, "create", null, operationId);
      input.beforeCardPresentationSave?.({ projectPath, objectId: note.id, operationId });
      const saved = saveCardPresentation(projectPath, { objectId: note.id, expectedContentHash: null, document: preset.card, markdownBody: preset.body, legacyCard: null });
      const presentationConflict = saved.conflict === true;
      if (!presentationConflict) recordCanonicalRevision(projectPath, { kind: "card", id: note.id }, "create", null, operationId);
      rememberObject(projectPath, note.relativePath);
      return clone({
        conflict: presentationConflict,
        characterContentSaved: true,
        presentationSaved: !presentationConflict,
        presentationConflict,
        orphanCreated: false,
        templateReadValid: characterInput.mode === "template" ? true : null,
        object: readProductObject(projectPath, note.id)
      });
    },

    createWorldObject(objectInput: {
      projectId: string;
      type: StoryStudioWorldObjectType;
      title: string;
      status?: string;
      tags?: string[];
      aliases?: string[];
      body?: string;
      plannedFrom?: string;
      agentTypeId?: string;
      agentTypeFieldValues?: Record<string, unknown>;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }): StoryStudioWorldObject {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const type = requireWorldObjectType(objectInput.type);
      const title = requireText(objectInput.title, "Object title", 80);
      const existing = listObjectSummaries(projectPath);
      const id = uniqueObjectId(type, title, new Set(existing.map((item) => item.id)));
      const plannedFrom = objectInput.plannedFrom == null ? null : requirePlanningSource(projectPath, objectInput.plannedFrom);
      if (plannedFrom && type !== "event") throw new Error("Only event notes can reference a planning event.");
      const agentTypeFrontmatter = prepareAgentTypeBindingFrontmatter(projectPath, type, null, objectInput.agentTypeId, objectInput.agentTypeFieldValues, true);
      const profile = normalizeOptionalObjectProfile(objectInput.profile, type);
      const note = createWorkspaceNote(projectPath, {
        id,
        type,
        title,
        status: optionalText(objectInput.status, "status", 64) || defaultObjectStatus(type),
        frontmatter: {
          aliases: requireStringList(objectInput.aliases, "aliases"),
          tags: requireStringList(objectInput.tags, "tags"),
          card_layout: "horizontal",
          card_blocks: defaultObjectCardBlocks(type),
          ...agentTypeFrontmatter.frontmatter,
          ...(profile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(profile) } : {}),
          ...(plannedFrom ? { planned_from: plannedFrom.id } : {})
        },
        body: typeof objectInput.body === "string" ? objectInput.body : `# ${title}\n\n`
      });
      rememberObject(projectPath, note.relativePath);
      recordCanonicalRevision(projectPath, { kind: "object", id: note.id }, "create");
      return readProductObject(projectPath, note.id);
    },

    createPredictionDraftEventsOnce(input: { projectId: string; runId: string; pathId: string; selectedCandidateNodeIds: string[]; operationId: string }): DraftCreationReceipt {
      const projectPath = resolveProjectPath(rootPath, input.projectId);
      const runId = requireArtifactId(input.runId, "Prediction Run identifier");
      const operationId = requireArtifactId(input.operationId, "Prediction acceptance operation");
      const pathId = requireArtifactId(input.pathId, "Prediction path identifier");
      const receiptsDirectory = path.join(projectPath, ".world-os", "workspace", "prediction-draft-receipts");
      const receiptPath = path.join(receiptsDirectory, `${operationId}.json`);
      const existingReceipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) as Partial<DraftCreationReceipt> : null;
      const runPath = path.join(projectPath, ".world-os", "tianyi", "multi-node-predictions", `${runId}.json`);
      if (!existsSync(runPath)) throw new Error("Prediction Run does not exist.");
      const run = JSON.parse(readFileSync(runPath, "utf8")) as any;
      if (run.projectId !== input.projectId || run.runId !== runId || run.status !== "ready" || !run.bundle) throw new Error("Prediction Run is not ready for draft creation.");
      if (existingReceipt) return clone({ ...existingReceipt, operationId, runId, bundleId: existingReceipt.bundleId ?? run.bundle.bundleId, pathId, items: existingReceipt.items ?? [], relationItems: existingReceipt.relationItems ?? [] } as DraftCreationReceipt);
      for (const reference of run.sourceSnapshot as Array<{ eventId: string; revisionToken: string }>) {
        const event = this.readWorldObject({ projectId: input.projectId, objectId: reference.eventId });
        if (event.revisionToken !== reference.revisionToken) throw new Error("Prediction source is stale.");
      }
      const pathEntry = run.bundle.paths.find((item: any) => item.id === pathId);
      if (!pathEntry) throw new Error("Prediction path does not exist.");
      const selected = [...new Set(input.selectedCandidateNodeIds.map((id) => requireText(id, "Prediction node identifier", 160)))];
      if (!selected.length || selected.some((id) => !pathEntry.candidateNodeIds.includes(id))) throw new Error("Prediction selection must belong to its selected path.");
      const nodes = selected.map((id) => run.bundle.nodes.find((node: any) => node.id === id)).filter(Boolean);
      if (nodes.length !== selected.length) throw new Error("Prediction node does not exist.");
      for (const node of nodes) {
        if (node.timeConsistency?.kind === "conflict") throw new Error("Prediction node has a time conflict.");
        if (node.identityResolution?.kind === "unresolved") throw new Error("Prediction node identity is unresolved.");
        if (node.identityResolution?.kind === "create-new-with-difference" && !String(node.identityResolution.differenceReason || "").trim()) throw new Error("Prediction node requires a difference reason.");
      }
      const items = nodes.map((node: any) => {
        if (node.identityResolution.kind === "reference-existing") return { candidateNodeId: node.id, action: "referenced-existing" as const, draftEventId: null, existingEventId: node.identityResolution.existingEventId };
        if (node.identityResolution.kind === "merge-review") return { candidateNodeId: node.id, action: "merge-review" as const, draftEventId: null, existingEventId: node.identityResolution.existingEventId };
        const created = this.createWorldObject({ projectId: input.projectId, type: "event", title: node.title, status: "draft", tags: ["作者草稿", `Prediction Run：${runId}`, `Prediction Path：${pathId}`, `Prediction Candidate：${node.id}`], body: `# ${node.title}\n\n${node.summary}\n\n来源：${runId} / ${pathId} / ${node.id}\n` });
        return { candidateNodeId: node.id, action: "draft-created" as const, draftEventId: created.id, existingEventId: null };
      });
      mkdirSync(receiptsDirectory, { recursive: true });
      const receipt: DraftCreationReceipt = { operationId, runId, bundleId: requireArtifactId(run.bundle.bundleId, "Prediction Bundle identifier"), pathId, items, relationItems: [] };
      const temporary = `${receiptPath}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
      renameSync(temporary, receiptPath);
      return clone(receipt);
    },

    updateWorldObjectAgentType(objectInput: {
      projectId: string;
      objectId: string;
      expectedHash: string;
      agentTypeId: string | null;
      agentTypeFieldValues?: Record<string, unknown>;
    }): { conflict: boolean; object: StoryStudioWorldObject } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      const currentTypeId = typeof current.frontmatter.agentTypeId === "string" ? current.frontmatter.agentTypeId : null;
      const prepared = prepareAgentTypeBindingFrontmatter(
        projectPath,
        requireWorldObjectType(current.type),
        currentTypeId,
        objectInput.agentTypeId,
        objectInput.agentTypeFieldValues,
        currentTypeId !== objectInput.agentTypeId
      );
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: requireText(objectInput.expectedHash, "Revision token", 128),
        frontmatter: prepared.frontmatter,
        removeFrontmatterKeys: prepared.removeFrontmatterKeys,
        body: current.body
      });
      if (!result.conflict) {
        rememberObject(projectPath, current.relativePath);
        recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save");
      }
      return clone({ conflict: Boolean(result.conflict), object: readProductObject(projectPath, current.id) });
    },

    createGenericWorldObject(objectInput: {
      projectId: string;
      type: StoryStudioWorldObjectType;
      title: string;
      status?: string;
      tags?: string[];
      aliases?: string[];
      body?: string;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }): StoryStudioWorldObject {
      assertGenericObjectCreationAuthorityBoundary(objectInput);
      return this.createWorldObject(objectInput);
    },

    createCharacterFromAgentProposalOnce(objectInput: {
      projectId: string;
      targetObjectId: string;
      proposalId: string;
      proposalRevision: number;
      operationId: string;
      title: string;
      status?: string;
      tags?: string[];
      aliases?: string[];
      body?: string;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }): { created: boolean; conflict: boolean; object: StoryStudioWorldObject | null } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const targetObjectId = requireAgentProposalCharacterId(objectInput.targetObjectId);
      const proposalId = requireText(objectInput.proposalId, "Agent proposal identifier", 160);
      const proposalRevision = requirePositiveInteger(objectInput.proposalRevision, "Agent proposal revision");
      const operationId = requireText(objectInput.operationId, "Agent proposal application operation", 180);
      const title = requireText(objectInput.title, "Object title", 80);
      const profile = normalizeOptionalObjectProfile(objectInput.profile, "character");
      const result = createWorkspaceNoteOnce(projectPath, {
        id: targetObjectId,
        type: "character",
        title,
        status: optionalText(objectInput.status, "status", 64) || "active",
        relativePath: `world/characters/${targetObjectId}.md`,
        frontmatter: {
          aliases: requireStringList(objectInput.aliases, "aliases"),
          tags: requireStringList(objectInput.tags, "tags"),
          card_layout: "horizontal",
          card_blocks: defaultObjectCardBlocks("character"),
          agent_proposal_ids: [proposalId],
          agent_proposal_revisions: [String(proposalRevision)],
          agent_proposal_operation_ids: [operationId],
          ...(profile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(profile) } : {})
        },
        body: typeof objectInput.body === "string" ? objectInput.body : `# ${title}\n\n`,
        operationId
      });
      if (result.conflict || !result.note) return { created: false, conflict: true, object: null };
      rememberObject(projectPath, result.note.relativePath);
      recordCanonicalRevision(projectPath, { kind: "object", id: result.note.id }, "create", null, operationId);
      return { created: result.created, conflict: false, object: readProductObject(projectPath, result.note.id) };
    },

    createWorldObjectFromAgentProposalOnce(objectInput: {
      projectId: string;
      targetObjectId: string;
      objectType: Extract<StoryStudioWorldObjectType, "item" | "location">;
      proposalId: string;
      proposalRevision: number;
      operationId: string;
      title: string;
      status?: string;
      tags?: string[];
      aliases?: string[];
      body?: string;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }): { created: boolean; conflict: boolean; object: StoryStudioWorldObject | null } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const objectType = objectInput.objectType;
      const targetObjectId = requireAgentProposalObjectId(objectInput.targetObjectId, objectType);
      const proposalId = requireText(objectInput.proposalId, "Agent proposal identifier", 160);
      const proposalRevision = requirePositiveInteger(objectInput.proposalRevision, "Agent proposal revision");
      const operationId = requireText(objectInput.operationId, "Agent proposal application operation", 180);
      const title = requireText(objectInput.title, "Object title", 80);
      const profile = normalizeOptionalObjectProfile(objectInput.profile, objectType);
      const result = createWorkspaceNoteOnce(projectPath, {
        id: targetObjectId,
        type: objectType,
        title,
        status: optionalText(objectInput.status, "status", 64) || "active",
        relativePath: `world/${objectType === "item" ? "items" : "locations"}/${targetObjectId}.md`,
        frontmatter: {
          aliases: requireStringList(objectInput.aliases, "aliases"),
          tags: requireStringList(objectInput.tags, "tags"),
          card_layout: "horizontal",
          card_blocks: defaultObjectCardBlocks(objectType),
          agent_proposal_ids: [proposalId],
          agent_proposal_revisions: [String(proposalRevision)],
          agent_proposal_operation_ids: [operationId],
          ...(profile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(profile) } : {})
        },
        body: typeof objectInput.body === "string" ? objectInput.body : `# ${title}\n\n`,
        operationId
      });
      if (result.conflict || !result.note) return { created: false, conflict: true, object: null };
      rememberObject(projectPath, result.note.relativePath);
      recordCanonicalRevision(projectPath, { kind: "object", id: result.note.id }, "create", null, operationId);
      return { created: result.created, conflict: false, object: readProductObject(projectPath, result.note.id) };
    },

    mergeAgentProposalIntoCharacterOnce(objectInput: {
      projectId: string;
      targetObjectId: string;
      expectedHash: string;
      proposalId: string;
      proposalRevision: number;
      operationId: string;
      title: string;
      status: string;
      tags: string[];
      aliases: string[];
      body: string;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }): { applied: boolean; conflict: boolean; object: StoryStudioWorldObject } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const targetObjectId = requireText(objectInput.targetObjectId, "Target object identifier", 160);
      const current = findObjectNote(projectPath, targetObjectId);
      if (current.type !== "character") throw new Error("Agent recognition merge target must be an existing character.");
      const proposalId = requireText(objectInput.proposalId, "Agent proposal identifier", 160);
      const proposalRevision = requirePositiveInteger(objectInput.proposalRevision, "Agent proposal revision");
      const operationId = requireText(objectInput.operationId, "Agent proposal application operation", 180);
      const profile = normalizeOptionalObjectProfile(objectInput.profile, "character");
      const appliedOperations = requireBoundedFrontmatterStringList(current.frontmatter.agent_proposal_operation_ids, "Agent proposal operation history", 128);
      if (appliedOperations.includes(operationId)) {
        return { applied: false, conflict: false, object: readProductObject(projectPath, current.id) };
      }
      const proposalIds = requireBoundedFrontmatterStringList(current.frontmatter.agent_proposal_ids, "Agent proposal history", 128);
      const proposalRevisions = requireBoundedFrontmatterStringList(current.frontmatter.agent_proposal_revisions, "Agent proposal revision history", 128);
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: requireText(objectInput.expectedHash, "Revision token", 128),
        frontmatter: {
          title: requireText(objectInput.title, "Object title", 80),
          status: requireText(objectInput.status, "Object status", 64),
          tags: requireStringList(objectInput.tags, "tags"),
          aliases: requireStringList(objectInput.aliases, "aliases"),
          agent_proposal_ids: [...proposalIds, proposalId],
          agent_proposal_revisions: [...proposalRevisions, String(proposalRevision)],
          agent_proposal_operation_ids: [...appliedOperations, operationId],
          ...(profile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(profile) } : {})
        },
        body: String(objectInput.body ?? "")
      });
      if (result.conflict) return { applied: false, conflict: true, object: readProductObject(projectPath, current.id) };
      rememberObject(projectPath, current.relativePath);
      recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save", null, operationId);
      return { applied: true, conflict: false, object: readProductObject(projectPath, current.id) };
    },

    createConfirmedEventOnce(eventInput: {
      projectId: string;
      targetEventRef: string;
      title: string;
      body: string;
      plannedFrom?: string;
      provenance: {
        sourceChangeSetId: string;
        sourceChangeSetRevision: string;
        authorDecisionRef: string;
        applyOperationKey: string;
        intentHash: string;
      };
      operationId: string;
      onBoundary?: (boundary:
        | "event-temporary-durable"
        | "event-final-published"
        | "event-index-persisted"
        | "event-operation-persisted"
        | "event-state-persisted"
        | "event-revision-persisted"
      ) => void;
    }): { created: boolean; conflict: boolean; event: StoryStudioWorldObject | null } {
      const projectPath = resolveProjectPath(rootPath, eventInput.projectId);
      const targetEventRef = requireStableConfirmedEventRef(eventInput.targetEventRef);
      const plannedFrom = eventInput.plannedFrom == null ? null : requirePlanningSource(projectPath, eventInput.plannedFrom);
      const result = createWorkspaceNoteOnce(projectPath, {
        id: targetEventRef,
        type: "event",
        title: requireText(eventInput.title, "Event title", 80),
        status: "committed",
        relativePath: `world/events/${targetEventRef}.md`,
        frontmatter: {
          aliases: [],
          tags: ["作者确认"],
          card_layout: "horizontal",
          card_blocks: defaultObjectCardBlocks("event"),
          ...(plannedFrom ? { planned_from: plannedFrom.id } : {}),
          source_change_set_id: requireText(eventInput.provenance.sourceChangeSetId, "Source Change Set", 160),
          source_change_set_revision: requireHash(eventInput.provenance.sourceChangeSetRevision, "Source Change Set revision"),
          author_decision_ref: requireText(eventInput.provenance.authorDecisionRef, "Author decision", 160),
          apply_operation_key: requireText(eventInput.provenance.applyOperationKey, "Apply operation", 160),
          apply_intent_hash: requireHash(eventInput.provenance.intentHash, "Apply intent")
        },
        body: eventInput.body,
        operationId: requireText(eventInput.operationId, "Event operation", 180),
        onPublishBoundary: (boundary: "temporary-durable" | "final-published") => {
          eventInput.onBoundary?.(boundary === "temporary-durable" ? "event-temporary-durable" : "event-final-published");
        },
        onProjectionBoundary: (boundary: "index-persisted" | "operation-persisted") => {
          eventInput.onBoundary?.(boundary === "index-persisted" ? "event-index-persisted" : "event-operation-persisted");
        }
      });
      if (result.conflict || !result.note) return { created: false, conflict: true, event: null };
      rememberObject(projectPath, result.note.relativePath);
      eventInput.onBoundary?.("event-state-persisted");
      recordCanonicalRevision(projectPath, { kind: "object", id: result.note.id }, "create", null, eventInput.operationId);
      eventInput.onBoundary?.("event-revision-persisted");
      return { created: result.created, conflict: false, event: readProductObject(projectPath, result.note.id) };
    },

    readWorldObject(objectInput: { projectId: string; objectId: string }): StoryStudioWorldObject {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      return readProductObject(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
    },

    openWorldObject(objectInput: { projectId: string; objectId: string }): StoryStudioWorldObject {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const object = readProductObject(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      rememberObject(projectPath, object.relativeId);
      return readProductObject(projectPath, object.id);
    },

    updateWorldObject(objectInput: {
      projectId: string;
      objectId: string;
      expectedHash: string;
      presentationExpectedHash?: string | null;
      writeMarkdown?: boolean;
      writePresentation?: boolean;
      title: string;
      status: string;
      tags: string[];
      aliases: string[];
      body: string;
      subtype?: string;
      typedProperties?: CharacterProperty[];
      card?: StoryStudioObjectCard;
      profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
    }): {
      conflict: boolean;
      markdownConflict: boolean;
      presentationConflict: boolean;
      characterContentSaved: boolean;
      presentationSaved: boolean;
      unplacedContentCreated: boolean;
      migrationCleanupPending: boolean;
      object: StoryStudioWorldObject;
    } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      assertGenericEventAuthorityUpdate(current, objectInput.status, objectInput.tags);
      if (current.type !== "character") {
        const currentProfile = readObjectProfileFromNote(current);
        const nextProfile = objectInput.profile === undefined ? currentProfile : normalizeOptionalObjectProfile(objectInput.profile, current.type);
        const result = updateWorkspaceNote(projectPath, {
          relativePath: current.relativePath,
          expectedContentHash: requireText(objectInput.expectedHash, "Revision token", 128),
          frontmatter: {
            title: requireText(objectInput.title, "Object title", 80),
            status: requireText(objectInput.status, "Object status", 64),
            tags: requireStringList(objectInput.tags, "tags"),
            aliases: requireStringList(objectInput.aliases, "aliases"),
            ...(nextProfile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(nextProfile) } : {}),
            ...(objectInput.card ? projectObjectCardFrontmatter(requireLegacyObjectCard(projectPath, objectInput.card)) : {})
          },
          removeFrontmatterKeys: nextProfile ? [] : [OBJECT_PROFILE_FRONTMATTER_KEY],
          body: String(objectInput.body ?? "")
        });
        if (!result.conflict) {
          rememberObject(projectPath, current.relativePath);
          recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save");
        }
        return clone({
          conflict: Boolean(result.conflict),
          markdownConflict: Boolean(result.conflict),
          presentationConflict: false,
          characterContentSaved: !result.conflict,
          presentationSaved: false,
          unplacedContentCreated: false,
          migrationCleanupPending: false,
          object: readProductObject(projectPath, current.id)
        });
      }

      const expectedMarkdownHash = requireText(objectInput.expectedHash, "Revision token", 128);
      const currentCharacter = parseCharacterProperties(current.frontmatter);
      const currentProfile = readObjectProfileFromNote(current);
      const nextProfile = objectInput.profile === undefined ? currentProfile : normalizeOptionalObjectProfile(objectInput.profile, "character");
      const candidateSubtype = objectInput.subtype === undefined ? currentCharacter.subtype : normalizeCharacterSubtype(objectInput.subtype);
      const candidateProperties = objectInput.typedProperties === undefined ? currentCharacter.properties : normalizeCharacterProperties(objectInput.typedProperties);
      const serializedCharacter = serializeCharacterProperties(candidateProperties, candidateSubtype);
      const removedCharacterFields = listRemovedCharacterFields(current.frontmatter, serializedCharacter.frontmatter);
      const legacyCard = readLegacyObjectCard(projectPath, current.type, current.frontmatter);
      const currentPresentation = readCardPresentation(projectPath, {
        objectId: current.id,
        legacyCard: { ...legacyCard, hasLegacyFields: hasLegacyCardFields(current.frontmatter) },
        markdownBody: current.body
      });
      const expectedPresentationHash = objectInput.presentationExpectedHash === undefined
        ? objectInput.card?.revisionToken ?? null
        : objectInput.presentationExpectedHash;
      const requestedMarkdownWrite = objectInput.writeMarkdown !== false;
      const requestedPresentationWrite = objectInput.writePresentation !== false;
      const candidateDocument = requestedPresentationWrite && objectInput.card
        ? requireObjectCard(projectPath, current.id, objectInput.card)
        : currentPresentation.document;
      const candidateBody = requestedMarkdownWrite ? String(objectInput.body ?? "") : current.body;
      const sectionDiagnostics = parseStoryCardSections(candidateBody).diagnostics;
      if (sectionDiagnostics.some((item) => item.code === "duplicate-section-id")) {
        throw new Error("Duplicate card section identifiers must be repaired before writing.");
      }
      const normalizedExpectedPresentation = expectedPresentationHash == null ? null : requireCardHash(expectedPresentationHash);
      const title = requireText(objectInput.title, "Object title", 80);
      const status = requireText(objectInput.status, "Object status", 64);
      const tags = requireStringList(objectInput.tags, "tags");
      const aliases = requireStringList(objectInput.aliases, "aliases");
      const profileChanged = serializeOptionalObjectProfile(currentProfile) !== serializeOptionalObjectProfile(nextProfile);
      const markdownChanged = requestedMarkdownWrite && (title !== current.title || status !== current.status || !sameStringList(tags, stringList(current.frontmatter.tags)) ||
        !sameStringList(aliases, stringList(current.frontmatter.aliases)) || candidateBody !== current.body || !sameCharacterFrontmatter(current.frontmatter, serializedCharacter.frontmatter) || profileChanged);
      const presentationChanged = requestedPresentationWrite && (currentPresentation.virtual || serializeCardPresentation(candidateDocument) !== serializeCardPresentation(currentPresentation.document));
      if ((markdownChanged || (presentationChanged && currentPresentation.virtual)) && expectedMarkdownHash !== current.contentHash) {
        return clone({
          conflict: true,
          markdownConflict: true,
          presentationConflict: false,
          characterContentSaved: false,
          presentationSaved: false,
          unplacedContentCreated: false,
          migrationCleanupPending: currentPresentation.migration.cleanupPending,
          object: readProductObject(projectPath, current.id)
        });
      }
      if (presentationChanged && normalizedExpectedPresentation !== currentPresentation.contentHash) {
        return clone({
          conflict: true,
          markdownConflict: false,
          presentationConflict: true,
          characterContentSaved: false,
          presentationSaved: false,
          unplacedContentCreated: false,
          migrationCleanupPending: currentPresentation.migration.cleanupPending,
          object: readProductObject(projectPath, current.id)
        });
      }
      const operationId = createCardOperationId(current.id, {
        currentMarkdownHash: current.contentHash,
        currentPresentationHash: currentPresentation.contentHash,
        nextMarkdown: { title, status, tags, aliases, subtype: candidateSubtype, typedProperties: candidateProperties, body: candidateBody, profile: nextProfile },
        nextPresentation: candidateDocument
      });
      let characterContentSaved = false;
      let presentationSaved = false;
      let presentationConflict = false;
      let migrationCleanupPending = false;

      if (markdownChanged) {
        const markdownResult = updateWorkspaceNote(projectPath, {
          relativePath: current.relativePath,
          expectedContentHash: expectedMarkdownHash,
          frontmatter: { title, status, tags, aliases, ...serializedCharacter.frontmatter, ...(nextProfile ? { [OBJECT_PROFILE_FRONTMATTER_KEY]: serializeStoryStudioObjectProfile(nextProfile) } : {}) },
          removeFrontmatterKeys: [...removedCharacterFields, ...(nextProfile ? [] : [OBJECT_PROFILE_FRONTMATTER_KEY])],
          body: candidateBody
        });
        if (markdownResult.conflict) {
          return clone({ conflict: true, markdownConflict: true, presentationConflict: false, characterContentSaved: false, presentationSaved: false, unplacedContentCreated: false, migrationCleanupPending: currentPresentation.migration.cleanupPending, object: readProductObject(projectPath, current.id) });
        }
        characterContentSaved = true;
        recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save", null, operationId);
      }

      if (presentationChanged) {
        input.beforeCardPresentationSave?.({ projectPath, objectId: current.id, operationId });
        const cardResult = saveCardPresentation(projectPath, {
          objectId: current.id,
          expectedContentHash: normalizedExpectedPresentation,
          document: candidateDocument,
          markdownBody: candidateBody,
          legacyCard
        });
        if (cardResult.conflict) {
          presentationConflict = true;
        } else {
          presentationSaved = true;
          assertPresentationParity(candidateDocument, cardResult.presentation.document);
          recordCanonicalRevision(projectPath, { kind: "card", id: current.id }, "save", null, operationId);
        }
      }

      if ((presentationSaved || !currentPresentation.virtual) && hasLegacyCardFields(current.frontmatter)) {
        const latestNote = findObjectNote(projectPath, current.id);
        input.beforeLegacyCardCleanup?.({ projectPath, objectId: current.id, operationId });
        const cleanup = updateWorkspaceNote(projectPath, {
          relativePath: latestNote.relativePath,
          expectedContentHash: markdownChanged ? latestNote.contentHash : expectedMarkdownHash,
          removeFrontmatterKeys: ["card_layout", "card_blocks", "cover", "media"]
        });
        if (cleanup.conflict) {
          migrationCleanupPending = true;
        } else {
          recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save", null, operationId);
        }
      }

      if (characterContentSaved || presentationSaved) rememberObject(projectPath, current.relativePath);
      const unplacedContentCreated = characterContentSaved && presentationConflict && countAnchoredSections(candidateBody) > countAnchoredSections(current.body);
      return clone({
        conflict: presentationConflict,
        markdownConflict: false,
        presentationConflict,
        characterContentSaved,
        presentationSaved,
        unplacedContentCreated,
        migrationCleanupPending,
        object: readProductObject(projectPath, current.id)
      });
    },

    getWorldObjectBacklinks(objectInput: { projectId: string; objectId: string }): StoryStudioWorldObjectSummary[] {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      return getWorkspaceBacklinks(projectPath, current.relativePath)
        .filter((note) => WORLD_OBJECT_TYPE_SET.has(note.type))
        .map(projectObjectSummary)
        .sort(compareWorldObjects);
    },

    /**
     * Library lifecycle deliberately stays on the existing workspace note owner.
     * Archive is reversible metadata; confirmed Canon events never take this
     * route because their lifecycle remains exclusively Author Control's job.
     */
    archiveWorldObject(objectInput: { projectId: string; objectId: string; expectedHash: string }): StoryStudioWorldObject {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      assertLibraryLifecycleAllowed(current, "archive");
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: requireText(objectInput.expectedHash, "Revision token", 128),
        frontmatter: { status: "archived", library_previous_status: current.status },
        body: current.body
      });
      if (result.conflict) throw new Error("资料已在磁盘中变化；归档未执行。");
      rememberObject(projectPath, current.relativePath);
      recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save");
      return readProductObject(projectPath, current.id);
    },

    restoreWorldObject(objectInput: { projectId: string; objectId: string; expectedHash: string }): StoryStudioWorldObject {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      assertLibraryLifecycleAllowed(current, "restore");
      if (current.status !== "archived") throw new Error("只有已归档资料可以恢复。");
      const previousStatus = optionalText(current.frontmatter.library_previous_status, "Previous library status", 64) || defaultObjectStatus(current.type as StoryStudioWorldObjectType);
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: requireText(objectInput.expectedHash, "Revision token", 128),
        frontmatter: { status: previousStatus },
        removeFrontmatterKeys: ["library_previous_status"],
        body: current.body
      });
      if (result.conflict) throw new Error("资料已在磁盘中变化；恢复未执行。");
      rememberObject(projectPath, current.relativePath);
      recordCanonicalRevision(projectPath, { kind: "object", id: current.id }, "save");
      return readProductObject(projectPath, current.id);
    },

    readObjectCatalog(input: { projectId: string; workVersionId: string }) {
      const projectPath = resolveProjectPath(rootPath, input.projectId);
      return clone(createObjectCatalog(projectPath).read(input.projectId, input.workVersionId));
    },

    updateObjectCatalog(input: { projectId: string; workVersionId: string; expectedRevision: number; operation: "set-category" | "trash" | "restore"; objectType: string; objectIds: string[]; categoryId?: string | null; trashedFrom?: CatalogLifecycleSource }) {
      const projectPath = resolveProjectPath(rootPath, input.projectId);
      const catalog = createObjectCatalog(projectPath);
      if (input.operation === "set-category") return clone(catalog.setCategory({ ...input, categoryId: input.categoryId ?? null }));
      if (input.operation === "trash") {
        if (input.trashedFrom !== "active" && input.trashedFrom !== "archived") throw new Error("Trash source state is required.");
        return clone(catalog.moveToTrash({ ...input, trashedFrom: input.trashedFrom }));
      }
      return clone(catalog.restoreFromTrash(input));
    },

    duplicateWorldObject(objectInput: { projectId: string; objectId: string }): StoryStudioWorldObject {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      assertLibraryLifecycleAllowed(current, "duplicate");
      const tags = stringList(current.frontmatter.tags).filter((tag) => !EVENT_AUTHORITY_TAGS.has(tag));
      return this.createGenericWorldObject({
        projectId: objectInput.projectId,
        type: requireWorldObjectType(current.type),
        title: `${current.title} 副本`,
        status: current.type === "event" ? "possible" : "active",
        tags,
        aliases: stringList(current.frontmatter.aliases),
        body: current.body
      });
    },

    previewWorldObjectDelete(objectInput: { projectId: string; objectId: string }): { object: StoryStudioWorldObjectSummary; backlinks: StoryStudioWorldObjectSummary[]; visualReferences: StoryStudioObjectVisualReference[]; deletable: boolean; reason: string | null } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      const object = readProductObject(projectPath, current.id);
      const reason = libraryLifecycleBlockReason(current, "delete");
      return clone({ object: projectObjectSummary(current), backlinks: object.backlinks, visualReferences: object.visualReferences, deletable: reason == null, reason });
    },

    deleteWorldObject(objectInput: { projectId: string; objectId: string; expectedHash: string; confirmed: boolean }): { deleted: boolean; impactedBacklinks: StoryStudioWorldObjectSummary[]; impactedVisualReferences: StoryStudioObjectVisualReference[] } {
      const projectPath = resolveProjectPath(rootPath, objectInput.projectId);
      const current = findObjectNote(projectPath, requireText(objectInput.objectId, "Object identifier", 160));
      assertLibraryLifecycleAllowed(current, "delete");
      if (objectInput.confirmed !== true) throw new Error("删除资料前必须明确确认受影响引用。");
      if (current.contentHash !== requireText(objectInput.expectedHash, "Revision token", 128)) throw new Error("资料已在磁盘中变化；删除未执行。");
      const object = readProductObject(projectPath, current.id);
      deleteWorkspaceNote(projectPath, current.relativePath);
      return clone({ deleted: true, impactedBacklinks: object.backlinks, impactedVisualReferences: object.visualReferences });
    },

    getStoryStudioWorldLibraryBootstrap(libraryInput: { projectId: string }) {
      const projectId = requireProjectId(libraryInput.projectId);
      const projectPath = resolveProjectPath(rootPath, projectId);
      const project = readProductProject(rootPath, projectId);
      const objects = listObjectSummaries(projectPath).sort(compareWorldObjects);
      const state = readWorkspaceState(projectPath);
      const tabs = readObjectTabs(state)
        .filter((relativeId) => objects.some((object) => object.relativeId === relativeId))
        .slice(0, 5);
      const activeSummary = objects.find((object) => object.relativeId === state.selectedObjectPath) ||
        objects.find((object) => object.relativeId === tabs[0]) || null;
      const visualDocuments = listVisualDocumentFiles(projectPath) as StoryStudioVisualDocument[];
      const workspaceLayout = readWorkspaceLayout(projectPath);
      return clone({
        project,
        objects,
        visualDocuments: visualDocuments.map((document) => ({
          id: document.id,
          relativePath: document.relativePath,
          title: document.title,
          type: document.type,
          source: document.source
        })),
        folders: workspaceLayout.folders,
        placements: workspaceLayout.placements,
        folderRevision: workspaceLayout.contentHash,
        counts: Object.fromEntries(WORLD_OBJECT_TYPES.map((type) => [type, objects.filter((object) => object.type === type).length])),
        tabs,
        activeObject: activeSummary ? readProductObject(projectPath, activeSummary.id) : null,
        selection: readWorkspaceSelection(projectPath),
        source: "markdown" as const
      });
    },

    createWorkspaceFolder(folderInput: { projectId: string; title: string; parentId?: string | null; kind?: "folder" | "custom-category" }) {
      const projectPath = resolveProjectPath(rootPath, folderInput.projectId);
      return createWorkspaceFolderFile(projectPath, {
        title: requireText(folderInput.title, "Folder title", 80),
        parentId: folderInput.parentId || null,
        kind: folderInput.kind === "custom-category" ? "custom-category" : "folder"
      });
    },

    updateWorkspaceFolders(folderInput: { projectId: string; expectedContentHash: string; folders: StoryStudioWorkspaceFolder[] }) {
      const projectPath = resolveProjectPath(rootPath, folderInput.projectId);
      const current = readWorkspaceLayout(projectPath);
      const requested = Array.isArray(folderInput.folders) ? folderInput.folders : [];
      if (requested.length !== current.folders.length) throw new Error("Workspace folder set is invalid.");
      const currentById = new Map(current.folders.map((folder) => [folder.id, folder]));
      const folders = requested.map((folder) => {
        const existing = currentById.get(requireText(folder.id, "Folder id", 120));
        if (!existing) throw new Error("Workspace folder is invalid.");
        if (folder.parentId !== existing.parentId || folder.kind !== existing.kind) throw new Error("Workspace folder ownership cannot change.");
        return {
          id: existing.id,
          title: requireText(folder.title, "Folder title", 80),
          parentId: existing.parentId,
          kind: existing.kind,
          order: requireNonNegativeInteger(folder.order, "Folder order")
        };
      });
      return updateWorkspaceLayout(projectPath, {
        expectedContentHash: requireText(folderInput.expectedContentHash, "Workspace layout revision", 128),
        layout: { ...current, folders }
      });
    },

    /** Applies one reversible library action to an explicit, currently readable
     * selection. Canon-confirmed events retain their existing AuthorControl
     * protection even when selected with ordinary library material. */
    bulkUpdateWorldObjects(bulkInput: {
      projectId: string;
      objectIds: string[];
      operation: "add-tags" | "remove-tags" | "archive" | "restore";
      tags?: string[];
    }): StoryStudioBulkLibraryResult {
      const projectPath = resolveProjectPath(rootPath, bulkInput.projectId);
      const objectIds = uniqueObjectIds(bulkInput.objectIds);
      if (objectIds.length === 0) throw new Error("Select at least one library item.");
      const tags = bulkInput.operation === "add-tags" || bulkInput.operation === "remove-tags"
        ? requireStringList(bulkInput.tags || [], "tags")
        : [];
      if ((bulkInput.operation === "add-tags" || bulkInput.operation === "remove-tags") && tags.length === 0) {
        throw new Error("At least one tag is required.");
      }
      const notes = objectIds.map((objectId) => findObjectNote(projectPath, objectId));
      for (const note of notes) {
        if (bulkInput.operation === "archive" || bulkInput.operation === "restore") {
          assertLibraryLifecycleAllowed(note, bulkInput.operation);
          if (bulkInput.operation === "archive" && note.status === "archived") throw new Error("Only active library items can be archived.");
          if (bulkInput.operation === "restore" && note.status !== "archived") throw new Error("Only archived library items can be restored.");
        }
      }
      for (const note of notes) {
        if (bulkInput.operation === "archive") {
          const result = updateWorkspaceNote(projectPath, {
            relativePath: note.relativePath,
            expectedContentHash: note.contentHash,
            frontmatter: { status: "archived", library_previous_status: note.status },
            body: note.body
          });
          if (result.conflict) throw new Error("Library changed during bulk archive; no further items were changed.");
        } else if (bulkInput.operation === "restore") {
          const previousStatus = optionalText(note.frontmatter.library_previous_status, "Previous library status", 64) || defaultObjectStatus(note.type as StoryStudioWorldObjectType);
          const result = updateWorkspaceNote(projectPath, {
            relativePath: note.relativePath,
            expectedContentHash: note.contentHash,
            frontmatter: { status: previousStatus },
            removeFrontmatterKeys: ["library_previous_status"],
            body: note.body
          });
          if (result.conflict) throw new Error("Library changed during bulk restore; no further items were changed.");
        } else {
          const currentTags = stringList(note.frontmatter.tags);
          const nextTags = bulkInput.operation === "add-tags"
            ? [...new Set([...currentTags, ...tags])]
            : currentTags.filter((tag) => !tags.includes(tag));
          assertGenericEventAuthorityUpdate(note, note.status, nextTags);
          const result = updateWorkspaceNote(projectPath, {
            relativePath: note.relativePath,
            expectedContentHash: note.contentHash,
            frontmatter: { tags: nextTags },
            body: note.body
          });
          if (result.conflict) throw new Error("Library changed during bulk tag update; no further items were changed.");
        }
        recordCanonicalRevision(projectPath, { kind: "object", id: note.id }, "save");
      }
      const state = readWorkspaceState(projectPath);
      const selected = notes.at(-1)?.relativePath || state.selectedObjectPath;
      updateWorkspaceState(projectPath, { selectedObjectPath: selected });
      return clone({ updatedObjectIds: notes.map((note) => note.id), skippedObjectIds: [] });
    },

    moveWorldObjectsToFolder(moveInput: { projectId: string; objectIds: string[]; folderId: string | null }): { conflict: boolean; placements: StoryStudioWorkspacePlacement[] } {
      const projectPath = resolveProjectPath(rootPath, moveInput.projectId);
      const objectIds = uniqueObjectIds(moveInput.objectIds);
      if (objectIds.length === 0) throw new Error("Select at least one library item.");
      for (const objectId of objectIds) findObjectNote(projectPath, objectId);
      const layout = readWorkspaceLayout(projectPath);
      const folderId = moveInput.folderId == null ? null : requireText(moveInput.folderId, "Folder id", 120);
      if (folderId && !layout.folders.some((folder) => folder.id === folderId)) throw new Error("Library folder does not exist.");
      const retained = layout.placements.filter((placement) => !objectIds.includes(placement.documentId));
      const placed = folderId
        ? [...retained, ...objectIds.map((documentId, index) => ({ documentId, folderId, order: retained.filter((item) => item.folderId === folderId).length + index }))]
        : retained;
      const result = updateWorkspaceLayout(projectPath, {
        expectedContentHash: layout.contentHash,
        layout: { ...layout, placements: placed }
      });
      return clone({ conflict: result.conflict, placements: result.layout.placements });
    },

    stageTextImport(importInput: { projectId: string; filename: string; title?: string; content: string; folderId?: string | null }): StoryStudioWorldObject {
      const filename = requireText(importInput.filename, "Import filename", 180);
      if (!/\.(?:txt|md|markdown)$/iu.test(filename)) throw new Error("Only TXT and Markdown imports are supported.");
      const content = String(importInput.content ?? "");
      if (!content.trim() || content.length > 1_000_000) throw new Error("Imported text is invalid.");
      const title = importInput.title?.trim() || filename.replace(/\.(?:txt|md|markdown)$/iu, "");
      const object = this.createGenericWorldObject({
        projectId: importInput.projectId,
        type: "item",
        title,
        status: "draft",
        tags: ["导入候选", `来源:${filename}`],
        aliases: [],
        body: content
      });
      if (importInput.folderId) this.moveWorldObjectsToFolder({ projectId: importInput.projectId, objectIds: [object.id], folderId: importInput.folderId });
      return object;
    },

    /**
     * Source import keeps the original text in an immutable, project-local
     * receipt while the existing library note remains a navigable reference.
     * The receipt is the only source-of-truth for import/review state; it does
     * not grant authority to any world object or story owner.
     */
    importSourceDocument(input: { projectId: string; filename: string; title?: string; content: string; folderId?: string | null; mode?: "reference-only" | "extract-review" }): SourceImportDocumentR0 {
      const projectPath = resolveProjectPath(rootPath, input.projectId);
      const staged = importSourceDocumentR0({
        projectPath,
        projectId: input.projectId,
        filename: input.filename,
        ...(input.title ? { title: input.title } : {}),
        content: input.content,
        mode: input.mode ?? "reference-only"
      });
      let document = staged.document;
      if (!document.libraryObjectId) {
        const object = this.stageTextImport({
          projectId: input.projectId,
          filename: input.filename,
          ...(input.title ? { title: input.title } : {}),
          content: input.content,
          ...(input.folderId ? { folderId: input.folderId } : {})
        });
        document = importSourceDocumentR0({
          projectPath,
          projectId: input.projectId,
          filename: input.filename,
          ...(input.title ? { title: input.title } : {}),
          content: input.content,
          mode: input.mode ?? "reference-only",
          libraryObjectId: object.id
        }).document;
      } else if (input.folderId) {
        this.moveWorldObjectsToFolder({ projectId: input.projectId, objectIds: [document.libraryObjectId], folderId: input.folderId });
      }
      return document;
    },

    listSourceImportDocuments(input: { projectId: string }): SourceImportDocumentR0[] {
      return listSourceImportDocumentsR0(resolveProjectPath(rootPath, input.projectId), input.projectId);
    },

    readSourceImportDocument(input: { projectId: string; sourceDocumentId: string }): SourceImportDocumentR0 | null {
      const document = readSourceImportR0(resolveProjectPath(rootPath, input.projectId), input.sourceDocumentId);
      if (document && document.projectId !== input.projectId) throw new Error("Source document belongs to another project.");
      return document;
    },

    extractSourceImportCandidates(input: { projectId: string; sourceDocumentId: string }): SourceImportDocumentR0 {
      const projectPath = resolveProjectPath(rootPath, input.projectId);
      const knownObjects: SourceImportKnownObjectR0[] = listObjectSummaries(projectPath)
        .map((object) => ({ id: object.id, type: object.type, title: object.title, aliases: object.aliases }));
      return extractSourceCandidatesR0({ projectPath, projectId: input.projectId, sourceDocumentId: input.sourceDocumentId, knownObjects });
    },

    getR9AWorkflowState(workflowInput: { projectId: string }) {
      return readR9AWorkflowState(resolveProjectPath(rootPath, workflowInput.projectId));
    },

    createR9AWorkflowTask(workflowInput: { projectId: string; title: string; lane: R9AWorkflowTask["lane"]; sourceRefs?: string[]; state?: R9AWorkflowTask["state"] }) {
      return createR9AWorkflowTask(resolveProjectPath(rootPath, workflowInput.projectId), {
        title: workflowInput.title,
        lane: workflowInput.lane,
        sourceRefs: workflowInput.sourceRefs || [],
        ...(workflowInput.state ? { state: workflowInput.state } : {})
      });
    },

    updateR9AWorkflowTask(workflowInput: { projectId: string; taskId: string; expectedHash: string; state: R9AWorkflowTask["state"] }) {
      return updateR9AWorkflowTask(resolveProjectPath(rootPath, workflowInput.projectId), workflowInput);
    },

    listR9AProjectBackups(backupInput: { projectId: string }) {
      return listR9AProjectBackups(resolveProjectPath(rootPath, backupInput.projectId));
    },

    createR9AProjectBackup(backupInput: { projectId: string; title: string }) {
      return createR9AProjectBackup(resolveProjectPath(rootPath, backupInput.projectId), { title: backupInput.title });
    },

    restoreR9AProjectBackup(backupInput: { projectId: string; backupId: string; confirmed: boolean }) {
      return restoreR9AProjectBackup(resolveProjectPath(rootPath, backupInput.projectId), backupInput);
    },

    getDocumentRevisionHistory(historyInput: { projectId: string; ref: StoryStudioRevisionDocumentRef }) {
      const projectPath = resolveProjectPath(rootPath, historyInput.projectId);
      const ref = requireRevisionRef(historyInput.ref);
      recordCanonicalRevision(projectPath, ref, "external-baseline");
      return projectRevisionHistory(listDocumentRevisionsFile(projectPath, { ref }));
    },

    createDocumentMilestone(milestoneInput: { projectId: string; ref: StoryStudioRevisionDocumentRef; revisionId: string; title: string }) {
      const projectPath = resolveProjectPath(rootPath, milestoneInput.projectId);
      const ref = requireRevisionRef(milestoneInput.ref);
      const result = createDocumentMilestoneFile(projectPath, {
        ref,
        revisionId: requireText(milestoneInput.revisionId, "Revision", 80),
        title: requireText(milestoneInput.title, "Milestone title", 80)
      });
      return clone({ milestone: result.milestone, history: projectRevisionHistory(result.history) });
    },

    previewDocumentRevision(previewInput: { projectId: string; ref: StoryStudioRevisionDocumentRef; revisionId: string }) {
      const projectPath = resolveProjectPath(rootPath, previewInput.projectId);
      const ref = requireRevisionRef(previewInput.ref);
      const current = readCanonicalRevisionSource(projectPath, ref);
      const result = previewDocumentRevisionFile(projectPath, {
        ref,
        revisionId: requireText(previewInput.revisionId, "Revision", 80),
        currentSource: current.source
      });
      return clone({
        revision: projectRevision(result.revision),
        milestoneTitles: result.milestoneTitles,
        changedFromCurrent: result.changedFromCurrent,
        summary: result.summary,
        semanticChanges: result.semanticChanges,
        preview: result.preview,
        previewTruncated: result.previewTruncated
      });
    },

    restoreDocumentRevision(restoreInput: { projectId: string; ref: StoryStudioRevisionDocumentRef; revisionId: string; expectedHash: string }) {
      const projectPath = resolveProjectPath(rootPath, restoreInput.projectId);
      const ref = requireRevisionRef(restoreInput.ref);
      const revisionId = requireText(restoreInput.revisionId, "Revision", 80);
      const expectedHash = requireText(restoreInput.expectedHash, "Current document revision", 128);
      recordCanonicalRevision(projectPath, ref, "external-baseline");
      const current = readCanonicalRevisionSource(projectPath, ref);
      const snapshot = readDocumentRevisionSnapshot(projectPath, { ref, revisionId });
      const result = ref.kind === "object"
        ? restoreWorkspaceNoteSource(projectPath, { relativePath: current.relativePath, expectedContentHash: expectedHash, source: snapshot })
        : ref.kind === "artifact"
          ? restoreWorkspaceNoteSource(projectPath, { relativePath: current.relativePath, expectedContentHash: expectedHash, source: snapshot })
        : ref.kind === "card"
          ? restoreCardPresentationSource(projectPath, { objectId: ref.id, expectedContentHash: expectedHash, source: snapshot, markdownBody: findObjectNote(projectPath, ref.id).body })
          : ref.kind === "template"
            ? restoreCardTemplateSource(projectPath, { templateId: ref.id, expectedContentHash: expectedHash, source: snapshot })
          : restoreVisualDocumentSource(projectPath, { relativePath: current.relativePath, expectedContentHash: expectedHash, source: snapshot });
      if (result.conflict) {
        return clone({ conflict: true, history: projectRevisionHistory(listDocumentRevisionsFile(projectPath, { ref })) });
      }
      recordCanonicalRevision(projectPath, ref, "restore", revisionId);
      if (ref.kind === "object" || ref.kind === "card") rememberObject(projectPath, findObjectNote(projectPath, ref.id).relativePath);
      else if (ref.kind === "visual") rememberVisualDocument(projectPath, current.relativePath, "primary");
      return clone({ conflict: false, history: projectRevisionHistory(listDocumentRevisionsFile(projectPath, { ref })) });
    },

    closeWorldObject(closeInput: { projectId: string; objectId: string }) {
      const projectPath = resolveProjectPath(rootPath, closeInput.projectId);
      const object = findObjectNote(projectPath, requireText(closeInput.objectId, "Object identifier", 160));
      const state = readWorkspaceState(projectPath);
      const tabs = readObjectTabs(state).filter((relativeId) => relativeId !== object.relativePath);
      updateWorkspaceState(projectPath, {
        selectedObjectPath: state.selectedObjectPath === object.relativePath ? tabs[0] || null : state.selectedObjectPath,
        localPreferences: { ...(state.localPreferences || {}), storyStudioTabs: tabs }
      });
      return this.getStoryStudioWorldLibraryBootstrap({ projectId: closeInput.projectId });
    },

    closeVisualDocument(closeInput: { projectId: string; relativePath: string }) {
      const projectPath = resolveProjectPath(rootPath, closeInput.projectId);
      const relativePath = requireRelativeDocumentPath(closeInput.relativePath);
      const state = readWorkspaceState(projectPath);
      const current = readVisualViewState(state);
      const tabs = current.tabs.filter((item) => item !== relativePath);
      const primary = current.primary === relativePath ? tabs[0] || null : current.primary;
      let secondary = current.secondary === relativePath ? null : current.secondary;
      if (secondary === primary) secondary = null;
      updateWorkspaceState(projectPath, {
        localPreferences: {
          ...(state.localPreferences || {}),
          storyStudioVisual: { ...current, tabs, primary, secondary, splitView: current.splitView && Boolean(primary && secondary) }
        }
      });
      return this.getVisualWorkbenchBootstrap({ projectId: closeInput.projectId });
    },

    swapVisualPanes(swapInput: { projectId: string }) {
      const projectPath = resolveProjectPath(rootPath, swapInput.projectId);
      const state = readWorkspaceState(projectPath);
      const current = readVisualViewState(state);
      if (!current.primary || !current.secondary) throw new Error("Two open visual documents are required.");
      updateWorkspaceState(projectPath, {
        localPreferences: {
          ...(state.localPreferences || {}),
          storyStudioVisual: { ...current, primary: current.secondary, secondary: current.primary, splitView: true }
        }
      });
      return this.getVisualWorkbenchBootstrap({ projectId: swapInput.projectId });
    },

    setWorkspaceSelection(selectionInput: { projectId: string; selection: WorkspaceSelection }): WorkspaceSelection {
      const projectPath = resolveProjectPath(rootPath, selectionInput.projectId);
      const selection = createWorkspaceSelection(selectionInput.selection);
      if (selection.objectId && !listObjectSummaries(projectPath).some((object) => object.id === selection.objectId)) {
        throw new Error("Workspace selection references a missing object.");
      }
      if (selection.documentId && !listVisualDocumentFiles(projectPath).some((document) => document.id === selection.documentId)) {
        throw new Error("Workspace selection references a missing document.");
      }
      const state = readWorkspaceState(projectPath);
      updateWorkspaceState(projectPath, {
        localPreferences: { ...(state.localPreferences || {}), storyStudioSelection: selection }
      });
      return clone(selection);
    },

    getWritingBootstrap(writingInput: { projectId: string }): StoryStudioWritingBootstrap {
      const projectPath = resolveProjectPath(rootPath, writingInput.projectId);
      return buildWritingBootstrap(projectPath);
    },

    listStoryUnits(unitInput: { projectId: string; includeArchived?: boolean } ): StoryStudioStoryUnit[] {
      const projectPath = resolveProjectPath(rootPath, unitInput.projectId);
      return listStoryUnits(projectPath, unitInput.includeArchived === true);
    },

    readStoryUnit(unitInput: { projectId: string; unitId: string }): StoryStudioStoryUnit {
      const projectPath = resolveProjectPath(rootPath, unitInput.projectId);
      return readStoryUnit(projectPath, requireText(unitInput.unitId, "Story Unit identifier", 160));
    },

    createStoryUnit(unitInput: {
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
      linkedEntityIds?: string[];
      unresolvedQuestionIds?: string[];
      generationConstraints?: Record<string, unknown>;
    }): StoryStudioStoryUnit {
      const projectPath = resolveProjectPath(rootPath, unitInput.projectId);
      const title = requireText(unitInput.title, "Story Unit title", 100);
      const current = listStoryUnits(projectPath, true);
      const id = uniqueStoryUnitId(title, new Set(current.map((unit) => unit.id)));
      const now = new Date().toISOString();
      assertStoryUnitStructure(projectPath, { ...unitInput, id });
      const payload = createStoryUnitPayload({ ...unitInput, id, title, order: unitInput.order ?? nextStoryUnitOrder(current), now });
      const note = createWorkspaceNote(projectPath, {
        id,
        type: "story-unit",
        title,
        status: "draft",
        frontmatter: { story_unit_payload: serializeStructuredPayload(payload) },
        body: storyUnitBody(payload)
      });
      return projectStoryUnit(note);
    },

    updateStoryUnit(unitInput: {
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
      lifecycle?: StoryUnitLifecycle;
      sourceRefs?: StoryUnitSourceRef[];
      items?: StoryUnitItem[];
      linkedEntityIds?: string[];
      unresolvedQuestionIds?: string[];
      generationConstraints?: Record<string, unknown>;
    }): { conflict: boolean; unit: StoryStudioStoryUnit } {
      const projectPath = resolveProjectPath(rootPath, unitInput.projectId);
      const current = findStoryUnitNote(projectPath, requireText(unitInput.unitId, "Story Unit identifier", 160));
      if (current.contentHash !== requireText(unitInput.expectedVersion, "Story Unit version", 128)) return { conflict: true, unit: projectStoryUnit(current) };
      const previous = parseStoryUnitPayload(current);
      if (previous.lifecycle === "archived" && unitInput.lifecycle !== "archived") throw new Error("Archived Story Unit must be restored explicitly.");
      assertStoryUnitStructure(projectPath, { ...previous, ...unitInput, id: previous.id });
      const payload = createStoryUnitPayload({
        ...previous,
        ...unitInput,
        id: previous.id,
        title: unitInput.title === undefined ? previous.title : requireText(unitInput.title, "Story Unit title", 100),
        now: new Date().toISOString(),
        createdAt: previous.createdAt
      });
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: current.contentHash,
        frontmatter: { title: payload.title, status: payload.lifecycle, story_unit_payload: serializeStructuredPayload(payload) },
        body: storyUnitBody(payload)
      });
      return { conflict: result.conflict, unit: projectStoryUnit(result.note) };
    },

    archiveStoryUnit(unitInput: { projectId: string; unitId: string; expectedVersion: string }): { conflict: boolean; unit: StoryStudioStoryUnit } {
      return this.updateStoryUnit({ projectId: unitInput.projectId, unitId: unitInput.unitId, expectedVersion: unitInput.expectedVersion, lifecycle: "archived" });
    },

    listOutputArtifacts(artifactInput: { projectId: string; includeArchived?: boolean }): StoryStudioOutputArtifact[] {
      const projectPath = resolveProjectPath(rootPath, artifactInput.projectId);
      return listOutputArtifacts(projectPath, artifactInput.includeArchived === true);
    },

    readOutputArtifact(artifactInput: { projectId: string; artifactId: string }): StoryStudioOutputArtifact {
      const projectPath = resolveProjectPath(rootPath, artifactInput.projectId);
      return readOutputArtifact(projectPath, requireText(artifactInput.artifactId, "Output artifact identifier", 160));
    },

    createOutputArtifact(artifactInput: {
      projectId: string;
      type: OutputArtifactType;
      title: string;
      sourceUnits?: StoryStudioOutputSourceUnitRef[];
      generationBrief?: Record<string, unknown>;
      content?: string;
      structure?: Record<string, unknown>;
      workVersionSource?: WorkVersionOutputArtifactSourceR0;
      createdAt?: string;
    }): StoryStudioOutputArtifact {
      const projectPath = resolveProjectPath(rootPath, artifactInput.projectId);
      const type = requireOutputArtifactType(artifactInput.type);
      const title = requireText(artifactInput.title, "Output artifact title", 100);
      const sourceUnits = normalizeOutputSourceUnits(projectPath, artifactInput.sourceUnits || []);
      const current = listOutputArtifacts(projectPath, true);
      const workVersionSource = normalizeWorkVersionOutputArtifactSource(artifactInput.workVersionSource);
      if (workVersionSource) {
        if (workVersionSource.projectId !== openStoryWorkspace(projectPath).project.id) throw new Error("OutputArtifact WorkVersion source Project does not match.");
        const payloadDigest = outputArtifactCreationPayloadDigest({ ...artifactInput, sourceUnits, workVersionSource });
        if (workVersionSource.creationOperationReceipt.payloadDigest !== payloadDigest) throw new Error("OutputArtifact creation payload digest does not match its receipt.");
        const existing = current.find((artifact) => artifact.provenance.workVersionSource?.creationOperationReceipt.idempotencyKey === workVersionSource.creationOperationReceipt.idempotencyKey);
        if (existing) {
          if (existing.provenance.workVersionSource?.creationOperationReceipt.payloadDigest !== payloadDigest) throw new Error("OutputArtifact creation idempotency key was reused with a different payload.");
          return existing;
        }
        assertCurrentRootWorkVersionArtifactSource(projectPath, workVersionSource);
      }
      const id = uniqueOutputArtifactId(type, title, new Set(current.map((artifact) => artifact.id)));
      const now = artifactInput.createdAt == null ? new Date().toISOString() : requireIsoDate(artifactInput.createdAt, "Output artifact creation time");
      const structure = type === "novel" ? createNovelDocumentStructure({ artifactId: id, title, createdAt: now, structure: artifactInput.structure }) : artifactInput.structure;
      const model = type === "novel" ? readNovelDocumentModel(structure) : null;
      const content = model ? serializeNovelDocumentModelToMarkdown(model) : artifactInput.content;
      const payload = createOutputArtifactPayload({ id, type, title, sourceUnits, generationBrief: artifactInput.generationBrief ?? null, content, structure, provenance: workVersionSource ? { workVersionSource } : undefined, now });
      assertNovelArtifactReferences(projectPath, payload);
      const note = createWorkspaceNote(projectPath, {
        id,
        type: "artifact",
        title,
        status: payload.lifecycle,
        frontmatter: { artifact_payload: serializeStructuredPayload(payload), artifact_type: type },
        body: outputArtifactBody(payload)
      });
      recordCanonicalRevision(projectPath, { kind: "artifact", id: note.id }, "create");
      return projectOutputArtifact(note);
    },

    updateOutputArtifact(artifactInput: {
      projectId: string;
      artifactId: string;
      expectedVersion: string;
      title?: string;
      sourceUnits?: StoryStudioOutputSourceUnitRef[];
      generationBrief?: Record<string, unknown> | null;
      content?: string;
      structure?: Record<string, unknown>;
      lifecycle?: OutputArtifactLifecycle;
      revisionOperationId?: string;
      workVersionSource?: WorkVersionOutputArtifactSourceR0;
    }): { conflict: boolean; artifact: StoryStudioOutputArtifact } {
      const projectPath = resolveProjectPath(rootPath, artifactInput.projectId);
      const current = readOutputArtifactNote(projectPath, requireText(artifactInput.artifactId, "Output artifact identifier", 160));
      const previous = parseOutputArtifactPayload(current);
      const revisionOperationId = artifactInput.revisionOperationId == null ? null : requireText(artifactInput.revisionOperationId, "Output artifact revision operation", 180);
      if (revisionOperationId && previous.currentRevisionId === artifactRevisionId(revisionOperationId)) {
        if (!outputArtifactRequestedStateMatches(previous, artifactInput)) throw new Error("OutputArtifact revision idempotency key was reused with a different payload.");
        return { conflict: false, artifact: projectOutputArtifact(current) };
      }
      if (current.contentHash !== requireText(artifactInput.expectedVersion, "Output artifact version", 128)) return { conflict: true, artifact: projectOutputArtifact(current) };
      const workVersionSource = artifactInput.workVersionSource === undefined
        ? previous.provenance.workVersionSource
        : normalizeWorkVersionOutputArtifactSource(artifactInput.workVersionSource);
      if (artifactInput.workVersionSource !== undefined) {
        assertOutputArtifactSourceReconciliation(projectPath, previous, workVersionSource, revisionOperationId);
      }
      if (previous.lifecycle === "archived" && artifactInput.lifecycle !== "archived") throw new Error("Archived output artifact must be restored explicitly.");
      const previousModel = previous.type === "novel" ? readNovelDocumentModel(previous.structure) : null;
      const suppliedStructure = artifactInput.structure === undefined ? previous.structure : artifactInput.structure;
      const suppliedModel = previous.type === "novel" ? readNovelDocumentModel(suppliedStructure) : null;
      if (previousModel && artifactInput.structure === undefined) throw new Error("这份小说需要通过自然编辑保存；原文会自动生成可逆的 Markdown 投影。");
      if (previousModel && !suppliedModel) throw new Error("这份小说的编辑结构无法识别，请回到兼容模式恢复原文。");
      if (!previousModel && suppliedModel) assertNovelMigrationReceipt(previous, current.contentHash, suppliedStructure);
      if (suppliedModel) {
        validateNovelDocumentModelR1(suppliedModel);
      }
      const payload = createOutputArtifactPayload({
        ...previous,
        ...artifactInput,
        id: previous.id,
        type: previous.type,
        title: artifactInput.title === undefined ? previous.title : requireText(artifactInput.title, "Output artifact title", 100),
        sourceUnits: artifactInput.sourceUnits === undefined ? previous.sourceUnits : normalizeOutputSourceUnits(projectPath, artifactInput.sourceUnits),
        generationBrief: artifactInput.generationBrief === undefined ? previous.generationBrief : artifactInput.generationBrief,
        content: suppliedModel ? serializeNovelDocumentModelToMarkdown(suppliedModel) : artifactInput.content === undefined ? previous.content : artifactInput.content,
        structure: suppliedStructure,
        lifecycle: artifactInput.lifecycle === undefined ? previous.lifecycle : artifactInput.lifecycle,
        provenance: { ...previous.provenance, workVersionSource },
        createdAt: previous.createdAt,
        currentRevisionId: revisionOperationId ? artifactRevisionId(revisionOperationId) : `${previous.id}.revision.${new Date().toISOString()}`,
        now: new Date().toISOString()
      });
      assertNovelArtifactReferences(projectPath, payload);
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: current.contentHash,
        frontmatter: { title: payload.title, status: payload.lifecycle, artifact_type: payload.type, artifact_payload: serializeStructuredPayload(payload) },
        body: outputArtifactBody(payload)
      });
      if (!result.conflict) recordCanonicalRevision(projectPath, { kind: "artifact", id: previous.id }, "save", null, revisionOperationId);
      return { conflict: result.conflict, artifact: projectOutputArtifact(result.note) };
    },

    archiveOutputArtifact(artifactInput: { projectId: string; artifactId: string; expectedVersion: string }): { conflict: boolean; artifact: StoryStudioOutputArtifact } {
      return this.updateOutputArtifact({ ...artifactInput, lifecycle: "archived" });
    },

    getCreationMediaCatalog(mediaInput: { projectId: string }): StoryStudioMediaCatalog {
      const projectPath = resolveProjectPath(rootPath, mediaInput.projectId);
      return projectCreationMediaCatalog(projectPath);
    },

    createCreationMediaAsset(mediaInput: {
      projectId: string;
      expectedCatalogHash: string | null;
      asset: Omit<StoryStudioMediaAsset, "id" | "createdAt" | "updatedAt" | "backlinks"> & { id?: string };
    }): { conflict: false; catalog: StoryStudioMediaCatalog; asset: StoryStudioMediaAsset } {
      const projectPath = resolveProjectPath(rootPath, mediaInput.projectId);
      const result = createCreationMediaAssetFile(projectPath, { expectedCatalogHash: mediaInput.expectedCatalogHash, asset: mediaInput.asset, now: new Date().toISOString() });
      const catalog = projectCreationMediaCatalog(projectPath);
      const asset = catalog.assets.find((candidate) => candidate.id === result.asset.id);
      if (!asset) throw new Error("Created media asset could not be projected.");
      return { conflict: false, catalog, asset };
    },

    updateCreationMediaAsset(mediaInput: {
      projectId: string;
      assetId: string;
      expectedCatalogHash: string | null;
      patch: Partial<Omit<StoryStudioMediaAsset, "id" | "createdAt" | "updatedAt" | "backlinks">>;
    }): { conflict: boolean; catalog: StoryStudioMediaCatalog; asset: StoryStudioMediaAsset | null } {
      const projectPath = resolveProjectPath(rootPath, mediaInput.projectId);
      const result = updateCreationMediaAssetFile(projectPath, { assetId: mediaInput.assetId, expectedCatalogHash: mediaInput.expectedCatalogHash, patch: mediaInput.patch, now: new Date().toISOString() });
      const catalog = projectCreationMediaCatalog(projectPath);
      return { conflict: result.conflict, catalog, asset: catalog.assets.find((candidate) => candidate.id === mediaInput.assetId) || null };
    },

    deleteCreationMediaAsset(mediaInput: { projectId: string; assetId: string; expectedCatalogHash: string | null }): { conflict: boolean; catalog: StoryStudioMediaCatalog } {
      const projectPath = resolveProjectPath(rootPath, mediaInput.projectId);
      const assetId = requireText(mediaInput.assetId, "Media asset identifier", 160);
      const backlinks = collectMediaAssetBacklinks(projectPath, assetId);
      if (backlinks.length) throw new Error(`Media asset is still used by ${backlinks.length} creation location(s).`);
      const result = deleteCreationMediaAssetFile(projectPath, { assetId, expectedCatalogHash: mediaInput.expectedCatalogHash });
      return { conflict: result.conflict, catalog: projectCreationMediaCatalog(projectPath) };
    },

    readWritingContinuity(continuityInput: { projectId: string }): StoryStudioWritingContinuity | null {
      const projectPath = resolveProjectPath(rootPath, continuityInput.projectId);
      return readWritingContinuity(projectPath);
    },

    saveWritingContinuity(continuityInput: {
      projectId: string;
      activeDestination: StoryStudioWritingContinuity["activeDestination"];
      returnDestination: StoryStudioWritingContinuity["returnDestination"];
      workspaceMode: string;
      showWorldHome: boolean;
      documentId: string;
      revisionToken: string;
      selection: WorkspaceSelection;
      editorSelection: { start: number; end: number } | null;
      scrollTop: number;
      focus: StoryStudioWritingContinuity["focus"];
    }): StoryStudioWritingContinuity {
      const projectPath = resolveProjectPath(rootPath, continuityInput.projectId);
      const document = readWritingDocument(projectPath, requireText(continuityInput.documentId, "Writing continuity document", 160));
      if (document.revisionToken !== requireText(continuityInput.revisionToken, "Writing continuity revision", 200)) {
        throw new Error("Writing continuity revision changed; stale editor offsets were not saved.");
      }
      const state = readWorkspaceState(projectPath);
      const maximumOffset = document.body.length;
      const editorSelection = continuityInput.editorSelection
        ? normalizeEditorSelection(continuityInput.editorSelection, maximumOffset)
        : null;
      const stored = {
        version: "story-studio-writing-continuity/v1" as const,
        activeDestination: requireProductDestination(continuityInput.activeDestination),
        returnDestination: requireProductDestination(continuityInput.returnDestination),
        workspaceMode: requireText(continuityInput.workspaceMode, "Writing continuity workspace mode", 80),
        showWorldHome: continuityInput.showWorldHome === true,
        documentId: document.id,
        revisionToken: document.revisionToken,
        selection: createWorkspaceSelection(continuityInput.selection),
        editorSelection,
        scrollTop: normalizeEditorOffset(continuityInput.scrollTop, 10_000_000),
        focus: continuityInput.focus === "writing-editor" ? "writing-editor" as const : "workspace" as const
      };
      updateWorkspaceState(projectPath, {
        localPreferences: { ...(state.localPreferences || {}), storyStudioWritingContinuity: stored }
      });
      return clone({ ...stored, version: "story-studio-writing-continuity-product/v1" as const, state: "exact" as const });
    },

    createWritingDocument(writingInput: {
      projectId: string;
      type: "chapter" | "scene";
      title: string;
      chapterId?: string;
    }): StoryStudioWritingDocument {
      const projectPath = resolveProjectPath(rootPath, writingInput.projectId);
      return createWritingDocumentInProject(projectPath, writingInput);
    },

    startWriting(writingInput: { projectId: string }): {
      chapter: StoryStudioWritingDocument;
      scene: StoryStudioWritingDocument;
      writing: StoryStudioWritingBootstrap;
    } {
      const projectPath = resolveProjectPath(rootPath, writingInput.projectId);
      const documentsBefore = listWritingDocuments(projectPath);
      if (documentsBefore.length > 0) {
        throw new Error("Writing has already started for this project.");
      }

      const previousState = readWorkspaceState(projectPath);
      try {
        const chapter = createWritingDocumentInProject(projectPath, {
          type: "chapter",
          title: "未命名章节"
        });
        input.beforeInitialWritingSceneCreate?.({ projectPath, chapterId: chapter.id });
        const scene = createWritingDocumentInProject(projectPath, {
          type: "scene",
          title: "新场景",
          chapterId: chapter.id
        });
        input.beforeInitialWritingBootstrap?.({ projectPath, chapterId: chapter.id, sceneId: scene.id });
        return clone({
          chapter,
          scene,
          writing: buildWritingBootstrap(projectPath)
        });
      } catch (cause) {
        const rollbackFailures: unknown[] = [];
        let createdPaths: string[] = [];
        try {
          const previousPaths = new Set(documentsBefore.map((document) => document.relativeId));
          createdPaths = listWritingDocuments(projectPath)
            .filter((document) => !previousPaths.has(document.relativeId))
            .sort((left, right) => Number(right.type === "scene") - Number(left.type === "scene"))
            .map((document) => document.relativeId);
        } catch (rollbackCause) {
          rollbackFailures.push(rollbackCause);
        }
        for (const relativePath of createdPaths) {
          try {
            deleteWorkspaceNote(projectPath, relativePath);
          } catch (rollbackCause) {
            rollbackFailures.push(rollbackCause);
          }
        }
        try {
          updateWorkspaceState(projectPath, {
            currentChapterPath: previousState.currentChapterPath,
            currentScenePath: previousState.currentScenePath,
            selectedObjectPath: previousState.selectedObjectPath,
            activeSurface: previousState.activeSurface,
            localPreferences: previousState.localPreferences
          });
        } catch (rollbackCause) {
          rollbackFailures.push(rollbackCause);
        }
        if (rollbackFailures.length > 0) {
          throw new Error("Initial writing creation failed and rollback was incomplete.", { cause });
        }
        throw cause;
      }
    },

    openWritingDocument(writingInput: { projectId: string; documentId: string }): StoryStudioWritingDocument {
      const projectPath = resolveProjectPath(rootPath, writingInput.projectId);
      const document = readWritingDocument(projectPath, requireText(writingInput.documentId, "Writing document", 160));
      const chapter = document.type === "scene"
        ? listWritingDocuments(projectPath).find((candidate) => candidate.id === document.chapterId)
        : document;
      rememberWritingDocument(projectPath, document.relativeId, document.type, chapter?.relativeId || null);
      return readWritingDocument(projectPath, document.id);
    },

    readWritingDocument(writingInput: { projectId: string; documentId: string }): StoryStudioWritingDocument {
      const projectPath = resolveProjectPath(rootPath, writingInput.projectId);
      return readWritingDocument(projectPath, requireText(writingInput.documentId, "Writing document", 160));
    },

    updateWritingDocument(writingInput: {
      projectId: string;
      documentId: string;
      expectedHash: string;
      status: string;
      body: string;
    }): { conflict: boolean; document: StoryStudioWritingDocument } {
      const projectPath = resolveProjectPath(rootPath, writingInput.projectId);
      const current = findWritingNote(projectPath, requireText(writingInput.documentId, "Writing document", 160));
      const result = updateWorkspaceNote(projectPath, {
        relativePath: current.relativePath,
        expectedContentHash: requireText(writingInput.expectedHash, "Revision token", 128),
        frontmatter: { status: requireText(writingInput.status, "Writing status", 64) },
        body: String(writingInput.body ?? "")
      });
      if (!result.conflict) {
        const summary = listWritingDocuments(projectPath).find((document) => document.id === current.id)!;
        const chapter = summary.type === "scene" ? listWritingDocuments(projectPath).find((candidate) => candidate.id === summary.chapterId) : summary;
        rememberWritingDocument(projectPath, summary.relativeId, summary.type, chapter?.relativeId || null);
      }
      return clone({ conflict: Boolean(result.conflict), document: readWritingDocument(projectPath, current.id) });
    },

    listVisualDocuments(documentInput: { projectId: string }): StoryStudioVisualDocument[] {
      const projectPath = resolveProjectPath(rootPath, documentInput.projectId);
      return listVisualDocumentFiles(projectPath) as StoryStudioVisualDocument[];
    },

    createVisualDocument(documentInput: {
      projectId: string;
      type: StoryStudioVisualDocumentType;
      title: string;
    }): StoryStudioVisualDocument {
      const projectPath = resolveProjectPath(rootPath, documentInput.projectId);
      if (!(["map", "graph", "canvas", "timeline", "tree"] as string[]).includes(documentInput.type)) throw new Error("Visual editor is not available yet.");
      const document = createVisualDocumentFile(projectPath, {
        type: documentInput.type,
        title: requireText(documentInput.title, "Visual document title", 100)
      }) as StoryStudioVisualDocument;
      rememberVisualDocument(projectPath, document.relativePath, "primary");
      recordCanonicalRevision(projectPath, { kind: "visual", id: document.id }, "create");
      return document;
    },

    readVisualDocument(documentInput: { projectId: string; relativePath: string }): StoryStudioVisualDocument {
      const projectPath = resolveProjectPath(rootPath, documentInput.projectId);
      return readVisualDocumentFile(projectPath, requireRelativeDocumentPath(documentInput.relativePath)) as StoryStudioVisualDocument;
    },

    openVisualDocument(documentInput: {
      projectId: string;
      relativePath: string;
      pane?: "primary" | "secondary";
    }): StoryStudioVisualDocument {
      const projectPath = resolveProjectPath(rootPath, documentInput.projectId);
      const document = readVisualDocumentFile(projectPath, requireRelativeDocumentPath(documentInput.relativePath)) as StoryStudioVisualDocument;
      rememberVisualDocument(projectPath, document.relativePath, documentInput.pane || "primary");
      return document;
    },

    updateVisualDocument(documentInput: {
      projectId: string;
      relativePath: string;
      expectedHash: string;
      document: StoryStudioVisualDocument;
    }): { conflict: boolean; document: StoryStudioVisualDocument } {
      const projectPath = resolveProjectPath(rootPath, documentInput.projectId);
      const result = updateVisualDocumentFile(projectPath, {
        relativePath: requireRelativeDocumentPath(documentInput.relativePath),
        expectedContentHash: requireText(documentInput.expectedHash, "Visual document revision", 128),
        document: documentInput.document
      });
      if (!result.conflict) {
        rememberVisualDocument(projectPath, result.document.relativePath, "primary");
        recordCanonicalRevision(projectPath, { kind: "visual", id: result.document.id }, "save");
      }
      return clone({ conflict: Boolean(result.conflict), document: result.document as StoryStudioVisualDocument });
    },

    validateTimelineDocument(documentInput: {
      projectId: string;
      relativePath: string;
      expectedHash: string;
      document: StoryStudioVisualDocument;
    }): { valid: boolean; conflict: boolean; reason: string | null } {
      const projectPath = resolveProjectPath(rootPath, documentInput.projectId);
      if (documentInput.document.type !== "timeline") throw new Error("Only Timeline documents use this validation operation.");
      return validateVisualDocumentUpdateFile(projectPath, {
        relativePath: requireRelativeDocumentPath(documentInput.relativePath),
        expectedContentHash: requireText(documentInput.expectedHash, "Timeline revision", 128),
        document: documentInput.document
      });
    },

    createPlanningEvent(planningInput: {
      projectId: string;
      title: string;
      body?: string;
      tags?: string[];
    }): StoryStudioWorldObject {
      const title = requireText(planningInput.title, "Planning event title", 100);
      const tags = [
        "作者规划",
        ...requireStringList(planningInput.tags, "Planning event tags")
          .filter((tag) => tag !== "作者规划" && tag !== "作者确认")
      ];
      return this.createWorldObject({
        projectId: planningInput.projectId,
        type: "event",
        title,
        status: "planned",
        tags,
        body: typeof planningInput.body === "string" ? planningInput.body : `# ${title}\n\n`
      });
    },

    abandonPlanningEvent(planningInput: {
      projectId: string;
      planningEventId: string;
      expectedHash: string;
    }): StoryStudioPlanningEventResult {
      const projectPath = resolveProjectPath(rootPath, planningInput.projectId);
      const planning = requirePlanningSource(projectPath, planningInput.planningEventId);
      const result = updateWorkspaceNote(projectPath, {
        relativePath: planning.relativePath,
        expectedContentHash: requireText(planningInput.expectedHash, "Planning event revision", 128),
        frontmatter: { ...planning.frontmatter, status: "abandoned" },
        body: planning.body
      });
      if (!result.conflict) {
        rememberObject(projectPath, planning.relativePath);
        recordCanonicalRevision(projectPath, { kind: "object", id: planning.id }, "save");
      }
      return clone({ conflict: Boolean(result.conflict), object: readProductObject(projectPath, planning.id) });
    },

    pausePlanningEvent(planningInput: { projectId: string; planningEventId: string; expectedHash: string }): StoryStudioPlanningEventResult {
      const projectPath = resolveProjectPath(rootPath, planningInput.projectId);
      const planning = requirePlanningLifecycleSource(projectPath, planningInput.planningEventId, ["planned"]);
      const result = updateWorkspaceNote(projectPath, {
        relativePath: planning.relativePath,
        expectedContentHash: requireText(planningInput.expectedHash, "Planning event revision", 128),
        frontmatter: { ...planning.frontmatter, status: "paused", planning_previous_status: planning.status },
        body: planning.body
      });
      if (!result.conflict) {
        rememberObject(projectPath, planning.relativePath);
        recordCanonicalRevision(projectPath, { kind: "object", id: planning.id }, "save");
      }
      return clone({ conflict: Boolean(result.conflict), object: readProductObject(projectPath, planning.id) });
    },

    resumePlanningEvent(planningInput: { projectId: string; planningEventId: string; expectedHash: string }): StoryStudioPlanningEventResult {
      const projectPath = resolveProjectPath(rootPath, planningInput.projectId);
      const planning = requirePlanningLifecycleSource(projectPath, planningInput.planningEventId, ["paused", "abandoned"]);
      const result = updateWorkspaceNote(projectPath, {
        relativePath: planning.relativePath,
        expectedContentHash: requireText(planningInput.expectedHash, "Planning event revision", 128),
        frontmatter: { ...planning.frontmatter, status: "planned" },
        removeFrontmatterKeys: ["planning_previous_status"],
        body: planning.body
      });
      if (!result.conflict) {
        rememberObject(projectPath, planning.relativePath);
        recordCanonicalRevision(projectPath, { kind: "object", id: planning.id }, "save");
      }
      return clone({ conflict: Boolean(result.conflict), object: readProductObject(projectPath, planning.id) });
    },

    createPlanningEventAndAddToTimeline(planningInput: {
      projectId: string;
      timelineRelativePath: string;
      timelineExpectedHash: string;
      title: string;
      body?: string;
      tags?: string[];
    }): StoryStudioPlanningEventTimelineResult {
      const projectPath = resolveProjectPath(rootPath, planningInput.projectId);
      const timelineRelativePath = requireRelativeDocumentPath(planningInput.timelineRelativePath);
      const preflight = readVisualDocumentFile(projectPath, timelineRelativePath);
      if (preflight.type !== "timeline") throw new Error("Planning events can only be added to a Timeline document.");
      const planning = this.createPlanningEvent({
        projectId: planningInput.projectId,
        title: planningInput.title,
        body: planningInput.body,
        tags: planningInput.tags
      });
      const added = this.addPlanningEventToTimeline({
        projectId: planningInput.projectId,
        timelineRelativePath: planningInput.timelineRelativePath,
        timelineExpectedHash: planningInput.timelineExpectedHash,
        planningEventId: planning.id
      });
      return clone({
        planningNoteCreated: true,
        planningEventId: planning.id,
        timelineEntryAdded: added.timelineEntryAdded,
        timelineConflict: added.timelineConflict,
        noteConflict: false,
        recoveryAction: added.timelineConflict ? {
          kind: "reload-and-add-existing-planning-event" as const,
          planningEventId: planning.id,
          timelineRelativePath
        } : null,
        document: added.document
      });
    },

    addPlanningEventToTimeline(planningInput: {
      projectId: string;
      timelineRelativePath: string;
      timelineExpectedHash: string;
      planningEventId: string;
    }): StoryStudioAddPlanningEventResult {
      const projectPath = resolveProjectPath(rootPath, planningInput.projectId);
      const planning = requirePlanningSource(projectPath, planningInput.planningEventId);
      const relativePath = requireRelativeDocumentPath(planningInput.timelineRelativePath);
      const timeline = readVisualDocumentFile(projectPath, relativePath) as StoryStudioVisualDocument;
      if (timeline.type !== "timeline") throw new Error("Planning events can only be added to a Timeline document.");
      const content = requireTimelineOperationContent(timeline.content);
      if (content.entries.some((entry) => entry.eventId === planning.id)) {
        return clone({ planningEventId: planning.id, timelineEntryAdded: false, timelineConflict: false, document: timeline });
      }
      const entry = {
        id: nextTimelineEntryId(content.entries.map((item) => item.id)),
        eventId: planning.id,
        laneId: content.lanes[0]?.id || "lane.canon",
        order: content.entries.length
      };
      const result = updateVisualDocumentFile(projectPath, {
        relativePath,
        expectedContentHash: requireText(planningInput.timelineExpectedHash, "Timeline revision", 128),
        document: { ...timeline, content: { ...content, entries: [...content.entries, entry] } }
      });
      if (!result.conflict) {
        rememberVisualDocument(projectPath, result.document.relativePath, "primary");
        recordCanonicalRevision(projectPath, { kind: "visual", id: result.document.id }, "save");
      }
      return clone({
        planningEventId: planning.id,
        timelineEntryAdded: !result.conflict,
        timelineConflict: Boolean(result.conflict),
        document: result.document as StoryStudioVisualDocument
      });
    },

    projectConfirmedEventToTimeline(projectionInput: {
      projectId: string;
      eventId: string;
    }): { timelineRelativePath: string; timelineEntryAdded: boolean; document: StoryStudioVisualDocument } {
      const projectPath = resolveProjectPath(rootPath, projectionInput.projectId);
      const event = findObjectNote(projectPath, requireText(projectionInput.eventId, "Confirmed Event", 160));
      if (event.type !== "event" || !hasCompleteCanonProvenance(event.frontmatter)) {
        throw new Error("Timeline auto projection only accepts an author-confirmed Canon event.");
      }
      let timeline = (listVisualDocumentFiles(projectPath) as StoryStudioVisualDocument[])
        .filter((document) => document.type === "timeline")
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath))[0];
      if (!timeline) {
        timeline = createVisualDocumentFile(projectPath, { type: "timeline", title: "故事时间线" }) as StoryStudioVisualDocument;
        recordCanonicalRevision(projectPath, { kind: "visual", id: timeline.id }, "create");
      }
      const content = requireTimelineOperationContent(timeline.content);
      if (content.entries.some((entry) => entry.eventId === event.id)) {
        return clone({ timelineRelativePath: timeline.relativePath, timelineEntryAdded: false, document: timeline });
      }
      const entry = {
        id: `entry.auto.${event.id}`.slice(0, 120),
        eventId: event.id,
        laneId: content.lanes.find((lane) => lane.id === "lane.canon")?.id || content.lanes[0]?.id || "lane.canon",
        order: content.entries.length
      };
      const result = updateVisualDocumentFile(projectPath, {
        relativePath: timeline.relativePath,
        expectedContentHash: timeline.contentHash,
        document: { ...timeline, content: { ...content, entries: [...content.entries, entry] } }
      });
      if (result.conflict) {
        const current = readVisualDocumentFile(projectPath, timeline.relativePath) as StoryStudioVisualDocument;
        const currentContent = requireTimelineOperationContent(current.content);
        if (currentContent.entries.some((candidate) => candidate.eventId === event.id)) {
          return clone({ timelineRelativePath: current.relativePath, timelineEntryAdded: false, document: current });
        }
        throw new Error("Timeline changed during automatic Canon projection; retry is safe.");
      }
      rememberVisualDocument(projectPath, result.document.relativePath, "primary");
      recordCanonicalRevision(projectPath, { kind: "visual", id: result.document.id }, "save");
      return clone({ timelineRelativePath: result.document.relativePath, timelineEntryAdded: true, document: result.document as StoryStudioVisualDocument });
    },

    importVisualAsset(assetInput: {
      projectId: string;
      category: "maps" | "images";
      filename: string;
      mimeType: string;
      base64: string;
    }) {
      const projectPath = resolveProjectPath(rootPath, assetInput.projectId);
      return importVisualAssetFile(projectPath, {
        category: assetInput.category,
        filename: requireText(assetInput.filename, "Asset filename", 180),
        mimeType: requireText(assetInput.mimeType, "Asset MIME type", 80),
        base64: assetInput.base64
      });
    },

    resolveVisualAsset(assetInput: { projectId: string; relativePath: string }) {
      const projectPath = resolveProjectPath(rootPath, assetInput.projectId);
      return resolveVisualAssetFile(projectPath, assetInput.relativePath);
    },

    setVisualSplitView(splitInput: { projectId: string; enabled: boolean }): StoryStudioVisualWorkbenchBootstrap {
      const projectPath = resolveProjectPath(rootPath, splitInput.projectId);
      const state = readWorkspaceState(projectPath);
      const current = readVisualViewState(state);
      updateWorkspaceState(projectPath, {
        activeSurface: "visual-workbench",
        localPreferences: {
          ...(state.localPreferences || {}),
          storyStudioVisual: { ...current, splitView: splitInput.enabled === true }
        }
      });
      return this.getVisualWorkbenchBootstrap({ projectId: splitInput.projectId });
    },

    setStoryStudioSurface(surfaceInput: { projectId: string; surface: "world-library" | "visual-workbench" }) {
      const projectPath = resolveProjectPath(rootPath, surfaceInput.projectId);
      if (!(["world-library", "visual-workbench"] as string[]).includes(surfaceInput.surface)) throw new Error("Story Studio surface is invalid.");
      updateWorkspaceState(projectPath, { activeSurface: surfaceInput.surface });
      return clone({ surface: surfaceInput.surface });
    },

    getVisualWorkbenchBootstrap(workbenchInput: { projectId: string }): StoryStudioVisualWorkbenchBootstrap {
      const projectPath = resolveProjectPath(rootPath, workbenchInput.projectId);
      const documents = listVisualDocumentFiles(projectPath) as StoryStudioVisualDocument[];
      const byPath = new Map(documents.map((document) => [document.relativePath, document]));
      const visualState = readVisualViewState(readWorkspaceState(projectPath));
      const tabs = visualState.tabs.filter((relativePath) => byPath.has(relativePath)).slice(0, 8);
      const primaryDocument = byPath.get(visualState.primary || "") || byPath.get(tabs[0] || "") || null;
      const secondaryDocument = byPath.get(visualState.secondary || "") || null;
      return clone({
        documents,
        primaryDocument,
        secondaryDocument,
        tabs,
        splitView: visualState.splitView && Boolean(primaryDocument && secondaryDocument),
        active: readWorkspaceState(projectPath).activeSurface === "visual-workbench",
        source: "visual-json" as const
      });
    }
  };
}

function listObjectSummaries(projectPath: string): StoryStudioWorldObjectSummary[] {
  const tree = getWorkspaceTree(projectPath);
  const groups = [tree.groups.characters, tree.groups.locations, tree.groups.events, tree.groups.items, tree.groups.factions, tree.groups.rules, tree.groups.threads];
  return groups.flat().map((entry) => clone({
    id: entry.id,
    relativeId: entry.relativePath,
    title: entry.title,
    type: requireWorldObjectType(entry.type),
    status: entry.status,
    tags: stringList(entry.tags),
    aliases: stringList(entry.aliases),
    revisionToken: String(entry.contentHash),
    updatedAt: statSync(path.join(projectPath, entry.relativePath)).mtime.toISOString(),
    source: "markdown" as const
  }));
}

function findObjectNote(projectPath: string, objectId: string) {
  const summary = listObjectSummaries(projectPath).find((item) => item.id === objectId);
  if (!summary) throw new Error("World object does not exist.");
  return readWorkspaceNote(projectPath, summary.relativeId);
}

function requirePlanningSource(projectPath: string, objectId: string) {
  const note = findObjectNote(projectPath, requireText(objectId, "Planning event identifier", 160));
  if (!isPlanningNote(note)) throw new Error("Planning source must be an author-owned planned event.");
  return note;
}

function requirePlanningLifecycleSource(projectPath: string, objectId: string, allowedStatuses: readonly string[]) {
  const note = findObjectNote(projectPath, requireText(objectId, "Planning event identifier", 160));
  const ownedByPlanning = note.type === "event" && stringList(note.frontmatter.tags).includes("作者规划") && !stringList(note.frontmatter.tags).includes("作者确认");
  if (!ownedByPlanning || !allowedStatuses.includes(note.status)) throw new Error("事件当前状态不能执行这个候选生命周期操作。");
  return note;
}

function isPlanningNote(note: { type: string; status: string; frontmatter: Record<string, unknown> }): boolean {
  return note.type === "event" && note.status === "planned" && stringList(note.frontmatter.tags).includes("作者规划");
}

function assertGenericObjectCreationAuthorityBoundary(input: {
  type: StoryStudioWorldObjectType;
  status?: string;
  tags?: string[];
}): void {
  if (input.type !== "event") return;
  const status = optionalText(input.status, "status", 64) || defaultObjectStatus("event");
  const tags = requireStringList(input.tags, "tags");
  if (EVENT_AUTHORITY_STATUSES.has(status) || authorityTags(tags).length > 0) {
    throw new Error("事件的规划与作者确认身份只能通过专用 Planning / Author Control 流程建立。");
  }
}

function assertGenericEventAuthorityUpdate(
  current: { type: string; status: string; frontmatter: Record<string, unknown> },
  rawStatus: string,
  rawTags: string[]
): void {
  if (current.type !== "event") return;
  const nextStatus = requireText(rawStatus, "Object status", 64);
  const nextTags = requireStringList(rawTags, "tags");
  const currentTags = stringList(current.frontmatter.tags);
  const currentAuthorityTags = authorityTags(currentTags);
  const nextAuthorityTags = authorityTags(nextTags);
  const planningIdentity = currentAuthorityTags.includes("作者规划") && !currentAuthorityTags.includes("作者确认") &&
    (current.status === "planned" || current.status === "abandoned");

  if (planningIdentity) {
    if (nextStatus !== current.status || !sameStringList(currentAuthorityTags, nextAuthorityTags)) {
      throw new Error("规划事件必须保留规划权威字段；进入正史需要经过影响评审和作者确认。");
    }
    return;
  }

  if (hasCompleteCanonProvenance(current.frontmatter)) {
    if (nextStatus !== current.status || !sameStringList(currentAuthorityTags, nextAuthorityTags)) {
      throw new Error("作者确认事件的权威字段由 Author Control 管理，通用卡片只能编辑普通元数据与正文。");
    }
    return;
  }

  if (EVENT_AUTHORITY_STATUSES.has(nextStatus) || nextAuthorityTags.length > 0) {
    throw new Error("通用卡片不能写入规划或作者确认身份；请使用 Planning / Impact Review / Author Control 流程。");
  }
}

function libraryLifecycleBlockReason(
  current: { type: string; status: string; frontmatter: Record<string, unknown> },
  action: "archive" | "restore" | "duplicate" | "delete"
): string | null {
  if (current.type !== "event") return null;
  if (hasCompleteCanonProvenance(current.frontmatter) || stringList(current.frontmatter.tags).includes("作者确认")) {
    return "已确认事件不能在资料库中变更生命周期；请通过影响确认与 Author Control 处理。";
  }
  if (stringList(current.frontmatter.tags).includes("作者规划") && (current.status === "planned" || current.status === "abandoned")) {
    return action === "duplicate"
      ? null
      : "作者规划事件保留其影响确认记录；请在事件线中放弃、恢复或从它建立新分支。";
  }
  return null;
}

function assertLibraryLifecycleAllowed(
  current: { type: string; status: string; frontmatter: Record<string, unknown> },
  action: "archive" | "restore" | "duplicate" | "delete"
): void {
  const reason = libraryLifecycleBlockReason(current, action);
  if (reason) throw new Error(reason);
}

function hasCompleteCanonProvenance(frontmatter: Record<string, unknown>): boolean {
  return CANON_PROVENANCE_KEYS.every((key) => typeof frontmatter[key] === "string" && String(frontmatter[key]).trim().length > 0);
}

function authorityTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => EVENT_AUTHORITY_TAGS.has(tag));
}

function requireTimelineOperationContent(value: Record<string, unknown>): Record<string, unknown> & {
  lanes: Array<{ id: string }>;
  entries: Array<{ id: string; eventId: string; laneId: string; order: number }>;
} {
  const lanes = Array.isArray(value.lanes) ? value.lanes : [];
  const entries = Array.isArray(value.entries) ? value.entries : [];
  if (lanes.some((lane) => !lane || typeof lane !== "object" || typeof lane.id !== "string")) throw new Error("Timeline lanes are invalid.");
  if (entries.some((entry) => !entry || typeof entry !== "object" || typeof entry.id !== "string" || typeof entry.eventId !== "string")) {
    throw new Error("Timeline entries are invalid.");
  }
  return value as Record<string, unknown> & {
    lanes: Array<{ id: string }>;
    entries: Array<{ id: string; eventId: string; laneId: string; order: number }>;
  };
}

function nextTimelineEntryId(existing: string[]): string {
  for (let index = 1; index < 100_000; index += 1) {
    const id = `entry.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error("Could not create a Timeline entry identifier.");
}

function readProductObject(projectPath: string, objectId: string): StoryStudioWorldObject {
  const note = findObjectNote(projectPath, objectId);
  const parsedCharacter = note.type === "character" ? parseCharacterProperties(note.frontmatter) : { subtype: "", properties: [], diagnostics: [] };
  const summaries = listObjectSummaries(projectPath);
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const typedProperties: StoryStudioCharacterProperty[] = parsedCharacter.properties.map((property) => ({
    ...property,
    references: characterPropertyReferences(property).map((id) => {
      const target = summaryById.get(id);
      return { id, title: target?.title || null, type: target?.type || null, missing: !target };
    })
  }));
  const linkedNotes = getWorkspaceLinkedNotes(projectPath, note.relativePath);
  const backlinkNotes = getWorkspaceBacklinks(projectPath, note.relativePath);
  const linkedObjects = linkedNotes
    .filter((item) => WORLD_OBJECT_TYPE_SET.has(item.type))
    .map(projectObjectSummary)
    .sort(compareWorldObjects);
  const backlinks = backlinkNotes
    .filter((item) => WORLD_OBJECT_TYPE_SET.has(item.type))
    .map(projectObjectSummary)
    .sort(compareWorldObjects);
  const properties = Object.fromEntries(Object.entries(note.frontmatter)
    .filter(([key]) => !RESERVED_FRONTMATTER_KEYS.has(key) && !EDITABLE_FRONTMATTER_KEYS.has(key) && key !== "agentTypeId" && !key.startsWith("agent_field_") && key !== CHARACTER_SUBTYPE_FIELD && !key.startsWith(CHARACTER_PROPERTY_PREFIX))
    .map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]));
  const agentTypeFieldValues = Object.fromEntries(Object.entries(note.frontmatter)
    .filter(([key, value]) => key.startsWith("agent_field_") && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")));
  const profile = readObjectProfileFromNote(note);
  const visualDocuments = listVisualDocumentFiles(projectPath) as StoryStudioVisualDocument[];
  const visualReferences = visualDocuments
    .filter((document) => document.objectRefs.includes(note.id))
    .map((document) => ({ type: document.type as StoryStudioVisualDocumentType, title: document.title, relativePath: document.relativePath }))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN") || left.relativePath.localeCompare(right.relativePath));
  const legacyCard = readLegacyObjectCard(projectPath, note.type, note.frontmatter);
  const presentation = readCardPresentation(projectPath, {
    objectId: note.id,
    legacyCard: { ...legacyCard, hasLegacyFields: hasLegacyCardFields(note.frontmatter) },
    markdownBody: note.body
  });
  const cardDiagnostics = [...presentation.diagnostics];
  if (presentation.document.templateRef) {
    const referencedTemplate = readCardTemplateFile(projectPath, { templateId: presentation.document.templateRef });
    if (referencedTemplate.missing) cardDiagnostics.push({ code: "missing-template-ref", message: "卡片引用的本地模板已缺失；已有内容与构成仍保留。" });
  }
  const worldProjection = note.type === "character" ? buildCharacterCardWorldProjection({
    characterId: note.id,
    notes: listWorkspaceNotes(projectPath).map((item) => ({ id: item.id, title: item.title, type: item.type, status: item.status, body: item.body })),
    linkedNoteIds: linkedNotes.map((item) => item.id),
    backlinkNoteIds: backlinkNotes.map((item) => item.id),
    documents: visualDocuments,
    relationGroups: presentation.document.blocks.flatMap((block) => block.kind === "relation-group" && block.relationConfig
      ? [{ blockId: block.id, label: block.label || "已确认关系", config: block.relationConfig }]
      : [])
  }) : null;
  return clone({
    ...projectObjectSummary(note),
    body: note.body,
    revisionToken: note.contentHash,
    properties,
    agentTypeFieldValues,
    profile,
    knowledgeSubjects: stringList(note.frontmatter.knowledge_subjects),
    subtype: parsedCharacter.subtype,
    typedProperties,
    propertyDiagnostics: parsedCharacter.diagnostics,
    linkedObjects,
    backlinks,
    card: {
      ...presentation.document,
      revisionToken: presentation.contentHash,
      source: presentation.source,
      diagnostics: cardDiagnostics,
      migration: presentation.migration
    },
    visualReferences,
    worldProjection
  });
}

function listWritingDocuments(projectPath: string): StoryStudioWritingDocumentSummary[] {
  const tree = getWorkspaceTree(projectPath);
  const chapterByPath = new Map(tree.groups.chapters.map((entry) => [entry.relativePath, entry.id]));
  const chapterIds = new Set(tree.groups.chapters.map((entry) => entry.id));
  const chapters = tree.groups.chapters.map((entry) => ({
    id: entry.id,
    relativeId: entry.relativePath,
    title: entry.title,
    type: "chapter" as const,
    status: entry.status,
    chapterId: null,
    source: "markdown" as const
  }));
  const scenes = tree.groups.scenes.map((entry) => {
    const note = readWorkspaceNote(projectPath, entry.relativePath);
    const chapterRef = Array.isArray(note.frontmatter.chapter) ? "" : String(note.frontmatter.chapter || "");
    const chapterId = chapterByPath.get(chapterRef) || (chapterIds.has(chapterRef) ? chapterRef : null);
    return {
      id: entry.id,
      relativeId: entry.relativePath,
      title: entry.title,
      type: "scene" as const,
      status: entry.status,
      chapterId,
      source: "markdown" as const
    };
  });
  return [...chapters, ...scenes].sort((left, right) => left.relativeId.localeCompare(right.relativeId));
}

function buildWritingBootstrap(projectPath: string): StoryStudioWritingBootstrap {
  const documents = listWritingDocuments(projectPath);
  const chapters = documents.filter((document) => document.type === "chapter").map((chapter) => ({
    ...chapter,
    scenes: documents.filter((scene) => scene.type === "scene" && scene.chapterId === chapter.id)
  }));
  const state = readWorkspaceState(projectPath);
  const activeSummary = documents.find((document) => document.relativeId === state.currentScenePath)
    || documents.find((document) => document.relativeId === state.currentChapterPath)
    || documents.find((document) => document.type === "scene")
    || documents.find((document) => document.type === "chapter")
    || null;
  return clone({
    chapters,
    activeDocument: activeSummary ? readWritingDocument(projectPath, activeSummary.id) : null,
    selection: readWorkspaceSelection(projectPath),
    source: "markdown" as const
  });
}

function createWritingDocumentInProject(projectPath: string, writingInput: {
  type: "chapter" | "scene";
  title: string;
  chapterId?: string;
}): StoryStudioWritingDocument {
  if (writingInput.type !== "chapter" && writingInput.type !== "scene") throw new Error("Writing document type is not supported.");
  const title = requireText(writingInput.title, "Writing document title", 100);
  const existing = listWritingDocuments(projectPath);
  const chapter = writingInput.type === "scene"
    ? existing.find((document) => document.type === "chapter" && document.id === requireText(writingInput.chapterId || "", "Chapter", 160))
    : null;
  if (writingInput.type === "scene" && !chapter) throw new Error("Scene requires an existing chapter.");
  const id = uniqueWritingId(writingInput.type, title, new Set(existing.map((document) => document.id)));
  const note = createWorkspaceNote(projectPath, {
    id,
    type: writingInput.type,
    title,
    status: "drafting",
    frontmatter: writingInput.type === "scene" ? { chapter: chapter!.relativeId, tags: ["scene"] } : { tags: ["chapter"] },
    body: writingInput.type === "scene"
      ? `# ${title}\n\n## 场景目标\n\n\n\n## 正文\n\n`
      : `# ${title}\n\n## 章节目标\n\n`
  });
  rememberWritingDocument(projectPath, note.relativePath, note.type, chapter?.relativeId || null);
  return readWritingDocument(projectPath, note.id);
}

function findWritingNote(projectPath: string, documentId: string) {
  const summary = listWritingDocuments(projectPath).find((document) => document.id === documentId);
  if (!summary) throw new Error("Writing document does not exist.");
  return readWorkspaceNote(projectPath, summary.relativeId);
}

function readWritingDocument(projectPath: string, documentId: string): StoryStudioWritingDocument {
  const summary = listWritingDocuments(projectPath).find((document) => document.id === documentId);
  if (!summary) throw new Error("Writing document does not exist.");
  const note = readWorkspaceNote(projectPath, summary.relativeId);
  const guardProjection = getWorkspaceNoteGuard(projectPath, summary.relativeId);
  const linkedNotes = getWorkspaceLinkedNotes(projectPath, summary.relativeId);
  const mentionedObjects = linkedNotes
    .filter((linked) => WORLD_OBJECT_TYPE_SET.has(linked.type))
    .map(projectObjectSummary)
    .sort(compareWorldObjects);
  const guardNotePaths = new Set(guardProjection.guard.linkedNotes.map((linked: { relativePath: string }) => linked.relativePath));
  const guardNotes = [...guardNotePaths].map((relativePath) => readWorkspaceNote(projectPath, relativePath));
  const contextualObjects = guardNotes
    .filter((linked) => WORLD_OBJECT_TYPE_SET.has(linked.type))
    .map(projectObjectSummary)
    .sort(compareWorldObjects);
  return clone({
    ...summary,
    body: note.body,
    revisionToken: note.contentHash,
    knowledgeSubjects: stringList(note.frontmatter.knowledge_subjects),
    linkedRuleIds: linkedNotes.filter((linked) => linked.type === "rule").map((linked) => linked.id).sort(),
    mentionedObjects,
    guard: {
      characters: contextualObjects.filter((object) => object.type === "character"),
      locations: contextualObjects.filter((object) => object.type === "location"),
      events: contextualObjects.filter((object) => object.type === "event"),
      rules: guardNotes.filter((linked) => linked.type === "rule").map((linked) => ({ id: linked.id, title: linked.title, status: linked.status, summary: firstWritingSummary(linked.body) })),
      threads: guardNotes.filter((linked) => linked.type === "thread").map((linked) => ({ id: linked.id, title: linked.title, status: linked.status, summary: firstWritingSummary(linked.body) }))
    }
  });
}

function rememberWritingDocument(projectPath: string, relativeId: string, type: string, chapterRelativeId: string | null): void {
  updateWorkspaceState(projectPath, {
    ...(type === "chapter" ? { currentChapterPath: relativeId } : { currentScenePath: relativeId, ...(chapterRelativeId ? { currentChapterPath: chapterRelativeId } : {}) }),
    activeSurface: "writing-workspace"
  });
}

function uniqueWritingId(type: "chapter" | "scene", title: string, existing: Set<string>): string {
  const segment = title.normalize("NFC").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/g, "-").slice(0, 96) || "untitled";
  const base = `${type}.${segment}`;
  if (!existing.has(base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    if (!existing.has(`${base}-${index}`)) return `${base}-${index}`;
  }
  throw new Error("Could not create a unique writing identifier.");
}

function firstWritingSummary(body: string): string {
  return String(body).split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))[0] || "暂无摘要";
}

type StoryUnitPayload = Omit<StoryStudioStoryUnit, "relativeId" | "version" | "source">;
type OutputArtifactPayload = Omit<StoryStudioOutputArtifact, "relativeId" | "version" | "source">;

const STORY_UNIT_SOURCE_KINDS = new Set<StoryUnitSourceKind>(["event-line", "nuwa-run", "nuwa-candidate", "tianyi-intent", "story-workspace", "writing-selection", "library", "import"]);
const NARRATIVE_AUTHORITIES = new Set<NarrativeAuthority>(["canon", "author-intent", "candidate", "inference", "belief", "unknown", "conflict", "derived"]);
const STORY_UNIT_LIFECYCLES = new Set<StoryUnitLifecycle>(["draft", "active", "frozen", "superseded", "archived"]);
const STORY_UNIT_KINDS = new Set<StoryUnitKind>(["main", "branch"]);
const STORY_UNIT_STATUSES = new Set<StoryUnitStatus>(["draft", "active", "candidate", "conflict", "archived"]);
const OUTPUT_ARTIFACT_TYPES = new Set<OutputArtifactType>(["novel", "screenplay", "storyboard", "comic", "motion-comic", "interactive-drama"]);
const OUTPUT_ARTIFACT_LIFECYCLES = new Set<OutputArtifactLifecycle>(["draft", "queued", "generating", "review", "approved", "archived"]);
const POSSIBILITY_STATUSES = new Set<NonNullable<StoryUnitItem["possibilityStatus"]>>(["proposed", "compared", "selected-for-output", "rejected", "paused", "abandoned"]);

function listStoryUnits(projectPath: string, includeArchived: boolean): StoryStudioStoryUnit[] {
  return getWorkspaceTree(projectPath).groups.storyUnits
    .map((entry) => projectStoryUnit(readWorkspaceNote(projectPath, entry.relativePath)))
    .filter((unit) => includeArchived || unit.lifecycle !== "archived")
    .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title));
}

function findStoryUnitNote(projectPath: string, unitId: string) {
  const entry = getWorkspaceTree(projectPath).groups.storyUnits.find((candidate) => candidate.id === unitId);
  if (!entry) throw new Error("Story Unit does not exist.");
  return readWorkspaceNote(projectPath, entry.relativePath);
}

function readStoryUnit(projectPath: string, unitId: string): StoryStudioStoryUnit {
  return projectStoryUnit(findStoryUnitNote(projectPath, unitId));
}

function projectStoryUnit(note: ReturnType<typeof readWorkspaceNote>): StoryStudioStoryUnit {
  if (note.type !== "story-unit") throw new Error("Story Unit note type is invalid.");
  const payload = parseStoryUnitPayload(note);
  return clone({ ...payload, relativeId: note.relativePath, version: note.contentHash, source: "markdown" as const });
}

function createStoryUnitPayload(input: {
  id: string;
  title: string;
  summary?: unknown;
  kind?: unknown;
  parentUnitId?: unknown;
  branchPointEventId?: unknown;
  mergeTargetUnitId?: unknown;
  order?: unknown;
  sourceVersionRef?: unknown;
  status?: unknown;
  objective?: unknown;
  coreConflict?: unknown;
  turningPoint?: unknown;
  openHook?: unknown;
  lifecycle?: unknown;
  sourceRefs?: unknown;
  items?: unknown;
  linkedEntityIds?: unknown;
  unresolvedQuestionIds?: unknown;
  generationConstraints?: unknown;
  createdAt?: unknown;
  now: string;
}): StoryUnitPayload {
  const createdAt = input.createdAt == null ? input.now : requireIsoDate(input.createdAt, "Story Unit creation time");
  return {
    id: requireText(input.id, "Story Unit identifier", 160),
    title: requireText(input.title, "Story Unit title", 100),
    summary: optionalText(input.summary, "Story Unit summary", 2_000) || "",
    kind: requireStoryUnitKind(input.kind ?? "main"),
    parentUnitId: optionalStableId(input.parentUnitId, "Story Unit parent"),
    branchPointEventId: optionalStableId(input.branchPointEventId, "Story Unit branch point Event"),
    mergeTargetUnitId: optionalStableId(input.mergeTargetUnitId, "Story Unit merge target"),
    order: requireBoundedInteger(input.order ?? 0, 0, 100_000, "Story Unit order"),
    sourceVersionRef: optionalText(input.sourceVersionRef, "Story Unit source version", 240) || null,
    status: requireStoryUnitStatus(input.status ?? lifecycleToStoryUnitStatus(input.lifecycle)),
    objective: optionalText(input.objective, "Story Unit objective", 600) || "",
    coreConflict: optionalText(input.coreConflict, "Story Unit core conflict", 600) || "",
    turningPoint: optionalText(input.turningPoint, "Story Unit turning point", 600) || "",
    openHook: optionalText(input.openHook, "Story Unit open hook", 600) || "",
    lifecycle: requireStoryUnitLifecycle(input.lifecycle ?? "draft"),
    sourceRefs: normalizeStoryUnitSourceRefs(input.sourceRefs ?? []),
    items: normalizeStoryUnitItems(input.items ?? []),
    linkedEntityIds: normalizeStableIds(input.linkedEntityIds ?? [], "Story Unit linked entity", 512),
    unresolvedQuestionIds: normalizeStableIds(input.unresolvedQuestionIds ?? [], "Story Unit unresolved question", 256),
    generationConstraints: normalizeStructuredRecord(input.generationConstraints ?? {}, "Story Unit generation constraints"),
    createdAt,
    updatedAt: input.now,
    source: "markdown"
  };
}

function parseStoryUnitPayload(note: ReturnType<typeof readWorkspaceNote>): StoryUnitPayload {
  const value = parseStructuredPayload(note.frontmatter.story_unit_payload, "Story Unit payload") as Record<string, unknown>;
  if (value.id !== note.id) throw new Error("Story Unit payload identity does not match its workspace document.");
  return createStoryUnitPayload({ ...value, id: note.id, title: note.title, now: requireIsoDate(value.updatedAt, "Story Unit update time") });
}

function storyUnitBody(payload: StoryUnitPayload): string {
  const sources = payload.sourceRefs.length ? payload.sourceRefs.map((source) => `- ${source.sourceKind}: ${source.entityId}${source.entityVersion ? ` @ ${source.entityVersion}` : ""}`).join("\n") : "- 尚未关联来源";
  return `# ${payload.title}\n\n${payload.summary || "此故事单元仍在整理中。"}\n\n## 来源\n\n${sources}\n`;
}

function nextStoryUnitOrder(units: StoryStudioStoryUnit[]): number {
  return units.reduce((highest, unit) => Math.max(highest, unit.order), -1) + 1;
}

function assertStoryUnitStructure(projectPath: string, input: {
  id: string;
  kind?: StoryUnitKind;
  parentUnitId?: string | null;
  branchPointEventId?: string | null;
  mergeTargetUnitId?: string | null;
}): void {
  const kind = requireStoryUnitKind(input.kind ?? "main");
  const units = listStoryUnits(projectPath, true);
  const unitIds = new Set(units.map((unit) => unit.id));
  const parentUnitId = optionalStableId(input.parentUnitId, "Story Unit parent");
  const mergeTargetUnitId = optionalStableId(input.mergeTargetUnitId, "Story Unit merge target");
  const branchPointEventId = optionalStableId(input.branchPointEventId, "Story Unit branch point Event");
  if (kind === "main" && (parentUnitId || branchPointEventId)) throw new Error("Main Story Unit cannot declare a branch parent or branch point.");
  if (kind === "branch" && (!parentUnitId || !branchPointEventId)) throw new Error("Branch Story Unit requires a parent Unit and branch point Event.");
  if (parentUnitId && (!unitIds.has(parentUnitId) || parentUnitId === input.id)) throw new Error("Story Unit parent does not exist or is recursive.");
  if (mergeTargetUnitId && (!unitIds.has(mergeTargetUnitId) || mergeTargetUnitId === input.id)) throw new Error("Story Unit merge target does not exist or is recursive.");
  if (branchPointEventId) {
    const event = getWorkspaceTree(projectPath).groups.events.find((entry) => entry.id === branchPointEventId);
    if (!event || readWorkspaceNote(projectPath, event.relativePath).type !== "event") throw new Error("Story Unit branch point Event does not exist.");
  }
}

function listOutputArtifacts(projectPath: string, includeArchived: boolean): StoryStudioOutputArtifact[] {
  return getWorkspaceTree(projectPath).groups.artifacts
    .map((entry) => projectOutputArtifact(readWorkspaceNote(projectPath, entry.relativePath)))
    .filter((artifact) => includeArchived || artifact.lifecycle !== "archived")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
}

function readOutputArtifactNote(projectPath: string, artifactId: string) {
  const entry = getWorkspaceTree(projectPath).groups.artifacts.find((candidate) => candidate.id === artifactId);
  if (!entry) throw new Error("Output artifact does not exist.");
  return readWorkspaceNote(projectPath, entry.relativePath);
}

function readOutputArtifact(projectPath: string, artifactId: string): StoryStudioOutputArtifact {
  return projectOutputArtifact(readOutputArtifactNote(projectPath, artifactId));
}

function projectOutputArtifact(note: ReturnType<typeof readWorkspaceNote>): StoryStudioOutputArtifact {
  if (note.type !== "artifact") throw new Error("Output artifact note type is invalid.");
  const payload = parseOutputArtifactPayload(note);
  return clone({ ...payload, relativeId: note.relativePath, version: note.contentHash, source: "markdown" as const });
}

function createOutputArtifactPayload(input: {
  id: string;
  type: unknown;
  title: string;
  sourceUnits?: unknown;
  generationBrief?: unknown;
  content?: unknown;
  structure?: unknown;
  lifecycle?: unknown;
  currentRevisionId?: unknown;
  schemaVersion?: unknown;
  provenance?: unknown;
  createdAt?: unknown;
  now: string;
}): OutputArtifactPayload {
  const createdAt = input.createdAt == null ? input.now : requireIsoDate(input.createdAt, "Output artifact creation time");
  const type = requireOutputArtifactType(input.type);
  const content = optionalText(input.content, "Output artifact content", 128 * 1024) || "";
  const generationBrief = input.generationBrief == null ? null : normalizeStructuredRecord(input.generationBrief, "Generation brief");
  return {
    schemaVersion: OUTPUT_ARTIFACT_SCHEMA_VERSION,
    id: requireText(input.id, "Output artifact identifier", 160),
    type,
    title: requireText(input.title, "Output artifact title", 100),
    sourceUnits: normalizeOutputSourceUnits(null, input.sourceUnits ?? []),
    generationBrief,
    content,
    structure: migrateCreationStructure(type, normalizeStructuredRecord(input.structure ?? {}, "Output artifact structure"), content),
    lifecycle: requireOutputArtifactLifecycle(input.lifecycle ?? "draft"),
    currentRevisionId: optionalText(input.currentRevisionId, "Output artifact revision", 160) || `artifact-revision.${createdAt}`,
    provenance: normalizeOutputArtifactProvenance(input.provenance, generationBrief, input.schemaVersion),
    createdAt,
    updatedAt: input.now,
    source: "markdown"
  };
}

function normalizeOutputArtifactProvenance(value: unknown, generationBrief: Record<string, unknown> | null, schemaVersion: unknown): StoryStudioOutputArtifact["provenance"] {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const sourceArtifactId = optionalText(record.sourceArtifactId ?? generationBrief?.sourceArtifactId, "Source artifact identifier", 160) || null;
  const sourceArtifactVersion = optionalText(record.sourceArtifactVersion ?? generationBrief?.sourceArtifactVersion, "Source artifact version", 160) || null;
  const migratedFromVersion = optionalText(record.migratedFromVersion, "Output artifact migration version", 160)
    || (schemaVersion === OUTPUT_ARTIFACT_SCHEMA_VERSION ? null : "story-studio-output-artifact/legacy");
  const workVersionSource = normalizeWorkVersionOutputArtifactSource(record.workVersionSource);
  return { sourceArtifactId, sourceArtifactVersion, migratedFromVersion, workVersionSource };
}

function outputArtifactCreationPayloadDigest(input: {
  type: OutputArtifactType;
  title: string;
  sourceUnits: StoryStudioOutputSourceUnitRef[];
  generationBrief?: Record<string, unknown>;
  content?: string;
  structure?: Record<string, unknown>;
  workVersionSource: WorkVersionOutputArtifactSourceR0;
}): `sha256:${string}` {
  const { payloadDigest: _payloadDigest, ...receipt } = input.workVersionSource.creationOperationReceipt;
  const canonical = stableJson({
    type: input.type,
    title: input.title,
    sourceUnits: input.sourceUnits,
    generationBrief: input.generationBrief ?? null,
    content: input.content ?? "",
    structure: input.structure ?? {},
    workVersionSource: { ...input.workVersionSource, creationOperationReceipt: receipt }
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function assertCurrentRootWorkVersionArtifactSource(projectPath: string, binding: WorkVersionOutputArtifactSourceR0): void {
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath });
  authority.verifyVersionIntegrity(binding.workVersionId);
  const version = authority.getVersion(binding.workVersionId);
  const manifest = authority.getSnapshotManifest(binding.manifestId);
  const validation = projectWorkVersionOutputArtifactSourceValidation({
    binding,
    currentVersion: {
      projectId: version.identity.projectId,
      workVersionId: version.identity.workVersionId,
      kind: version.identity.kind,
      status: version.identity.status,
      currentRevision: version.identity.currentRevision
    },
    pinnedManifest: {
      manifestId: manifest.manifestId,
      projectId: manifest.projectId,
      workVersionId: manifest.workVersionId,
      versionRevision: manifest.versionRevision,
      canonicalDigest: manifest.canonicalDigest,
      stableReferenceIds: manifest.ownerSnapshotRefs.flatMap((item) => item.stableReferenceIds),
      provenanceReceiptIds: manifest.ownerSnapshotRefs.flatMap((item) => item.provenanceReceiptIds)
    },
    integrity: "verified"
  });
  if (version.identity.kind !== "root" || version.identity.status !== "active" || version.identity.currentRevision !== binding.pinnedRevision || validation.status !== "current") {
    throw new Error("OutputArtifact creation requires the current active root WorkVersion revision as source.");
  }
}

function artifactRevisionId(operationId: string): string {
  return `artifact-revision.${createHash("sha256").update(operationId, "utf8").digest("hex").slice(0, 32)}`;
}

function outputArtifactRequestedStateMatches(previous: OutputArtifactPayload, input: {
  title?: string;
  sourceUnits?: StoryStudioOutputSourceUnitRef[];
  generationBrief?: Record<string, unknown> | null;
  content?: string;
  structure?: Record<string, unknown>;
  lifecycle?: OutputArtifactLifecycle;
  workVersionSource?: WorkVersionOutputArtifactSourceR0;
}): boolean {
  return stableJson({
    title: input.title ?? previous.title,
    sourceUnits: input.sourceUnits ?? previous.sourceUnits,
    generationBrief: input.generationBrief === undefined ? previous.generationBrief : input.generationBrief,
    content: input.content ?? previous.content,
    structure: input.structure ?? previous.structure,
    lifecycle: input.lifecycle ?? previous.lifecycle,
    workVersionSource: input.workVersionSource ?? previous.provenance.workVersionSource
  }) === stableJson({
    title: previous.title,
    sourceUnits: previous.sourceUnits,
    generationBrief: previous.generationBrief,
    content: previous.content,
    structure: previous.structure,
    lifecycle: previous.lifecycle,
    workVersionSource: previous.provenance.workVersionSource
  });
}

function assertOutputArtifactSourceReconciliation(
  projectPath: string,
  previous: OutputArtifactPayload,
  nextSource: WorkVersionOutputArtifactSourceR0 | null,
  revisionOperationId: string | null
): void {
  const prior = previous.provenance.workVersionSource;
  if (!prior || !nextSource || !revisionOperationId) throw new Error("Source reconciliation requires an existing WorkVersion source and explicit operation identity.");
  const receipt = nextSource.sourceReconciliationReceipt;
  if (!receipt) throw new Error("Source reconciliation receipt is required.");
  if (stableJson(nextSource.creationOperationReceipt) !== stableJson(prior.creationOperationReceipt)) throw new Error("Source reconciliation cannot replace the artifact creation receipt.");
  if (nextSource.projectId !== prior.projectId || nextSource.workVersionId !== prior.workVersionId || nextSource.workVersionKind !== "root") {
    throw new Error("Source reconciliation cannot change Project, WorkVersion identity, or root-only source kind.");
  }
  if (receipt.artifactId !== previous.id || receipt.originalArtifactRevisionId !== previous.currentRevisionId || receipt.newArtifactRevisionId !== artifactRevisionId(revisionOperationId)) {
    throw new Error("Source reconciliation artifact revision receipt does not match the requested append.");
  }
  if (receipt.sourceWorkVersionId !== prior.workVersionId || receipt.fromRevision !== prior.pinnedRevision || receipt.fromManifestDigest !== prior.manifestDigest) {
    throw new Error("Source reconciliation origin does not match the current artifact source.");
  }
  if (receipt.toRevision !== nextSource.pinnedRevision || receipt.toManifestDigest !== nextSource.manifestDigest || receipt.idempotencyKey !== revisionOperationId) {
    throw new Error("Source reconciliation target does not match the new source binding.");
  }
  const bodyDigest = outputArtifactBodyDigest(previous);
  if (receipt.bodyDigestBefore !== bodyDigest || receipt.bodyDigestAfter !== bodyDigest) throw new Error("Source reconciliation cannot auto-rewrite artifact prose.");
  if (!receipt.expectedWorkVersionReceiptId.startsWith("work-version-receipt.")) {
    throw new Error("Source reconciliation WorkVersion receipt reference is invalid.");
  }
  assertCurrentRootWorkVersionArtifactSource(projectPath, nextSource);
}

function outputArtifactBodyDigest(artifact: Pick<OutputArtifactPayload, "content" | "structure">): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson({ content: artifact.content, structure: artifact.structure }), "utf8").digest("hex")}`;
}

function parseOutputArtifactPayload(note: ReturnType<typeof readWorkspaceNote>): OutputArtifactPayload {
  const value = parseStructuredPayload(note.frontmatter.artifact_payload, "Output artifact payload") as Record<string, unknown>;
  if (value.id !== note.id) throw new Error("Output artifact payload identity does not match its workspace document.");
  return createOutputArtifactPayload({ ...value, id: note.id, title: note.title, now: requireIsoDate(value.updatedAt, "Output artifact update time") });
}

function outputArtifactBody(payload: OutputArtifactPayload): string {
  const sources = payload.sourceUnits.length ? payload.sourceUnits.map((source) => `- ${source.role === "primary" ? "主" : "补充"} Story Unit: ${source.unitId} @ ${source.unitVersion}`).join("\n") : "- 当前为无来源空白成品";
  return `# ${payload.title}\n\n${payload.content || `这是${outputArtifactLabel(payload.type)}的可编辑制作稿；它不会反向确认任何来源候选。`}\n\n## Story Unit 来源\n\n${sources}\n`;
}

function projectCreationMediaCatalog(projectPath: string): StoryStudioMediaCatalog {
  const catalog = readCreationMediaCatalog(projectPath) as Omit<StoryStudioMediaCatalog, "assets"> & { assets: Array<Omit<StoryStudioMediaAsset, "backlinks">> };
  return clone({
    ...catalog,
    assets: catalog.assets.map((asset) => ({ ...asset, backlinks: collectMediaAssetBacklinks(projectPath, asset.id) }))
  });
}

function collectMediaAssetBacklinks(projectPath: string, assetId: string): StoryStudioMediaAsset["backlinks"] {
  return listOutputArtifacts(projectPath, true).flatMap((artifact) => findMediaAssetPaths(artifact.structure, assetId).map((structurePath) => ({
    artifactId: artifact.id,
    artifactTitle: artifact.title,
    structurePath
  })));
}

function findMediaAssetPaths(value: unknown, assetId: string, currentPath = "structure", depth = 0): string[] {
  if (depth > 16 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => findMediaAssetPaths(entry, assetId, `${currentPath}[${index}]`, depth + 1));
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const nextPath = `${currentPath}.${key}`;
    if ((key === "assetId" || key === "mediaAssetId") && child === assetId) return [nextPath];
    if ((key === "assetIds" || key === "mediaAssetIds") && Array.isArray(child) && child.includes(assetId)) return [nextPath];
    return findMediaAssetPaths(child, assetId, nextPath, depth + 1);
  });
}

function normalizeStoryUnitSourceRefs(value: unknown): StoryUnitSourceRef[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error("Story Unit source references are invalid.");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Story Unit source reference is invalid.");
    const record = item as Record<string, unknown>;
    const sourceKind = requireStoryUnitSourceKind(record.sourceKind);
    const ref: StoryUnitSourceRef = {
      sourceKind,
      ownerId: requireText(record.ownerId, "Story Unit source owner", 160),
      entityId: requireText(record.entityId, "Story Unit source entity", 160),
      ...(optionalText(record.entityVersion, "Story Unit source version", 160) ? { entityVersion: optionalText(record.entityVersion, "Story Unit source version", 160) } : {}),
      capturedAt: requireIsoDate(record.capturedAt, "Story Unit source capture time"),
      ...(record.staleState === undefined ? {} : { staleState: requireStaleState(record.staleState) })
    };
    const key = `${ref.sourceKind}:${ref.ownerId}:${ref.entityId}:${ref.entityVersion || ""}`;
    if (seen.has(key)) throw new Error("Story Unit source reference is duplicated.");
    seen.add(key);
    return ref;
  });
}

function normalizeStoryUnitItems(value: unknown): StoryUnitItem[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error("Story Unit items are invalid.");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Story Unit item is invalid.");
    const record = item as Record<string, unknown>;
    const id = requireText(record.id, "Story Unit item identifier", 160);
    if (ids.has(id)) throw new Error("Story Unit item identifier is duplicated.");
    ids.add(id);
    const possibility = record.possibilityStatus === undefined ? undefined : requirePossibilityStatus(record.possibilityStatus);
    return {
      id,
      kind: requireText(record.kind, "Story Unit item kind", 80),
      authority: requireNarrativeAuthority(record.authority),
      ...(possibility ? { possibilityStatus: possibility } : {}),
      content: normalizeStructuredRecord(record.content, "Story Unit item content"),
      sourceRefs: normalizeStoryUnitSourceRefs(record.sourceRefs),
      ...(record.evidenceRefs === undefined ? {} : { evidenceRefs: normalizeStableIds(record.evidenceRefs, "Story Unit evidence reference", 128) }),
      ...(optionalText(record.subjectRef, "Story Unit item subject", 160) ? { subjectRef: optionalText(record.subjectRef, "Story Unit item subject", 160) } : {}),
      createdBy: requireCreatedBy(record.createdBy)
    };
  });
}

function normalizeOutputSourceUnits(projectPath: string | null, value: unknown): StoryStudioOutputSourceUnitRef[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error("Output artifact source units are invalid.");
  const seen = new Set<string>();
  let primaryCount = 0;
  const refs = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Output artifact source Unit is invalid.");
    const record = item as Record<string, unknown>;
    const unitId = requireText(record.unitId, "Output source Unit", 160);
    const role = record.role === "primary" ? "primary" as const : record.role === "supporting" ? "supporting" as const : (() => { throw new Error("Output source Unit role is invalid."); })();
    if (role === "primary") primaryCount += 1;
    if (seen.has(unitId)) throw new Error("Output artifact source Unit is duplicated.");
    seen.add(unitId);
    const unitVersion = requireText(record.unitVersion, "Output source Unit version", 128);
    const includedItemIds = normalizeStableIds(record.includedItemIds ?? [], "Output source Unit item", 512);
    if (projectPath) {
      const current = readStoryUnit(projectPath, unitId);
      if (current.version !== unitVersion) throw new Error("Output source Unit is stale; choose its current version explicitly.");
      const availableItemIds = new Set(current.items.map((item) => item.id));
      if (includedItemIds.some((itemId) => !availableItemIds.has(itemId))) throw new Error("Output source Unit item does not exist in the selected Unit version.");
    }
    return { unitId, unitVersion, role, includedItemIds };
  });
  if (refs.length > 0 && primaryCount !== 1) throw new Error("Output artifact must have exactly one primary Story Unit.");
  return refs;
}

function assertNovelArtifactReferences(projectPath: string, payload: OutputArtifactPayload): void {
  if (payload.type !== "novel") return;
  const structure = payload.structure;
  const model = readNovelDocumentModel(structure);
  if (!model) return;
  if (structure[NOVEL_DOCUMENT_AUTHORITY_KEY] !== "document-model-r1") throw new Error("Novel DocumentModel authority marker is missing.");
  const referenceMap: NovelReferenceResolver = new Map(
    listObjectSummaries(projectPath)
      .filter((object) => object.type === "character" || object.type === "location" || object.type === "event")
      .map((object) => [object.id, { type: object.type, label: object.title, revision: object.revisionToken }])
  );
  validateNovelDocumentModelR1(model, { references: referenceMap });
}

function assertNovelMigrationReceipt(previous: OutputArtifactPayload, currentVersion: string, structureValue: unknown): void {
  const structure = normalizeStructuredRecord(structureValue, "Novel migration structure");
  const receipt = structure[NOVEL_MIGRATION_RECEIPT_KEY];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("A confirmed migration receipt is required before a legacy novel can adopt DocumentModel authority.");
  const record = receipt as Record<string, unknown>;
  if (record.sourceArtifactVersion !== currentVersion) throw new Error("Novel migration receipt does not match the legacy source revision.");
  if (record.sourceContentHash !== hashText(previous.content)) throw new Error("Novel migration receipt source hash does not match the legacy source content.");
  if (record.originalContentPreserved !== true) throw new Error("Novel migration receipt must preserve the original Markdown snapshot.");
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function normalizeStructuredRecord(value: unknown, label: string, maximumDepth = 16): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const source = JSON.stringify(value);
  if (Buffer.byteLength(source, "utf8") > 2 * 1024 * 1024 || structuredDepth(value) > maximumDepth) throw new Error(`${label} exceeds safety limits.`);
  return JSON.parse(source) as Record<string, unknown>;
}

function serializeStructuredPayload(value: unknown): string {
  const record = normalizeStructuredRecord(value, "Structured workspace payload");
  return JSON.stringify(record);
}

function parseStructuredPayload(value: unknown, label: string): unknown {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 2 * 1024 * 1024) throw new Error(`${label} is missing or invalid.`);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function structuredDepth(value: unknown, depth = 0): number {
  if (!value || typeof value !== "object") return depth;
  return Math.max(depth, ...Object.values(value).map((item) => structuredDepth(item, depth + 1)));
}

function normalizeStableIds(value: unknown, label: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} list is invalid.`);
  return [...new Set(value.map((item) => requireText(item, label, 160)))].sort((left, right) => left.localeCompare(right));
}

function requireStoryUnitSourceKind(value: unknown): StoryUnitSourceKind { if (typeof value === "string" && STORY_UNIT_SOURCE_KINDS.has(value as StoryUnitSourceKind)) return value as StoryUnitSourceKind; throw new Error("Story Unit source kind is invalid."); }
function requireNarrativeAuthority(value: unknown): NarrativeAuthority { if (typeof value === "string" && NARRATIVE_AUTHORITIES.has(value as NarrativeAuthority)) return value as NarrativeAuthority; throw new Error("Narrative authority is invalid."); }
function requireStoryUnitLifecycle(value: unknown): StoryUnitLifecycle { if (typeof value === "string" && STORY_UNIT_LIFECYCLES.has(value as StoryUnitLifecycle)) return value as StoryUnitLifecycle; throw new Error("Story Unit lifecycle is invalid."); }
function requireStoryUnitKind(value: unknown): StoryUnitKind { if (typeof value === "string" && STORY_UNIT_KINDS.has(value as StoryUnitKind)) return value as StoryUnitKind; throw new Error("Story Unit kind is invalid."); }
function requireStoryUnitStatus(value: unknown): StoryUnitStatus { if (typeof value === "string" && STORY_UNIT_STATUSES.has(value as StoryUnitStatus)) return value as StoryUnitStatus; throw new Error("Story Unit status is invalid."); }
function lifecycleToStoryUnitStatus(value: unknown): StoryUnitStatus { return value === "archived" ? "archived" : value === "active" || value === "frozen" ? "active" : "draft"; }
function optionalStableId(value: unknown, label: string): string | null { return value == null || value === "" ? null : requireText(value, label, 160); }
function requireBoundedInteger(value: unknown, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(`${label} is invalid.`); return value as number; }
function requireOutputArtifactType(value: unknown): OutputArtifactType { if (typeof value === "string" && OUTPUT_ARTIFACT_TYPES.has(value as OutputArtifactType)) return value as OutputArtifactType; throw new Error("Output artifact type is invalid."); }
function requireOutputArtifactLifecycle(value: unknown): OutputArtifactLifecycle { if (typeof value === "string" && OUTPUT_ARTIFACT_LIFECYCLES.has(value as OutputArtifactLifecycle)) return value as OutputArtifactLifecycle; throw new Error("Output artifact lifecycle is invalid."); }
function requirePossibilityStatus(value: unknown): NonNullable<StoryUnitItem["possibilityStatus"]> { if (typeof value === "string" && POSSIBILITY_STATUSES.has(value as NonNullable<StoryUnitItem["possibilityStatus"]>)) return value as NonNullable<StoryUnitItem["possibilityStatus"]>; throw new Error("Story Unit possibility status is invalid."); }
function requireStaleState(value: unknown): "fresh" | "stale" | "missing" { if (value === "fresh" || value === "stale" || value === "missing") return value; throw new Error("Story Unit source stale state is invalid."); }
function requireCreatedBy(value: unknown): StoryUnitItem["createdBy"] { if (value === "author" || value === "system" || value === "ai") return value; throw new Error("Story Unit item creator is invalid."); }
function requireIsoDate(value: unknown, label: string): string { const text = requireText(value, label, 64); if (Number.isNaN(Date.parse(text))) throw new Error(`${label} is invalid.`); return text; }
function uniqueStoryUnitId(title: string, existing: Set<string>): string { return uniqueWorkspaceDomainId("story-unit", title, existing); }
function uniqueOutputArtifactId(type: OutputArtifactType, title: string, existing: Set<string>): string { return uniqueWorkspaceDomainId(type, title, existing); }
function uniqueWorkspaceDomainId(prefix: string, title: string, existing: Set<string>): string { const segment = title.normalize("NFC").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/g, "-").slice(0, 96) || "untitled"; const base = `${prefix}.${segment}`; if (!existing.has(base)) return base; for (let index = 2; index < 10_000; index += 1) if (!existing.has(`${base}-${index}`)) return `${base}-${index}`; throw new Error("Could not create a unique workspace domain identifier."); }
function outputArtifactLabel(type: OutputArtifactType): string { return ({ novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动剧" } as const)[type]; }

function projectCardTemplate(entry: { template: CardTemplate; contentHash: string }): StoryStudioCardTemplate {
  return clone({ ...entry.template, revisionToken: entry.contentHash });
}

function requireValidCharacterProperties(frontmatter: Record<string, unknown>) {
  const parsed = parseCharacterProperties(frontmatter);
  if (parsed.diagnostics.length > 0) throw new Error("人物 Markdown 属性定义存在诊断，修复后才能应用模板。");
  return parsed;
}

function readCharacterTemplateContext(projectPath: string, objectIdInput: string, templateIdInput: string) {
  const note = findObjectNote(projectPath, requireText(objectIdInput, "Object identifier", 160));
  if (note.type !== "character") throw new Error("Character templates can only be applied to character cards.");
  const parsed = requireValidCharacterProperties(note.frontmatter);
  const legacyCard = readLegacyObjectCard(projectPath, note.type, note.frontmatter);
  const presentation = readCardPresentation(projectPath, {
    objectId: note.id,
    legacyCard: { ...legacyCard, hasLegacyFields: hasLegacyCardFields(note.frontmatter) },
    markdownBody: note.body
  });
  const template = readCardTemplateFile(projectPath, { templateId: requireText(templateIdInput, "Card template", 120) });
  if (template.missing) throw new Error("Card template does not exist.");
  return { note, subtype: parsed.subtype, properties: parsed.properties, legacyCard, presentation, template };
}

function characterTemplateConflicts(context: ReturnType<typeof readCharacterTemplateContext>, input: {
  templateExpectedHash: string;
  markdownExpectedHash: string;
  presentationExpectedHash: string | null;
}) {
  const templateConflict = context.template.contentHash !== requireCardHash(input.templateExpectedHash);
  const markdownConflict = context.note.contentHash !== requireCardHash(input.markdownExpectedHash);
  const presentationConflict = context.presentation.contentHash !== normalizeExpectedHash(input.presentationExpectedHash);
  return { conflict: templateConflict || markdownConflict || presentationConflict, templateConflict, markdownConflict, presentationConflict };
}

function normalizeExpectedHash(value: string | null | undefined): string | null {
  return value == null ? null : requireCardHash(value);
}

function listRemovedCharacterFields(current: Record<string, unknown>, next: Record<string, string | string[]>): string[] {
  return listCharacterPropertyFrontmatterKeys(current).filter((key) => !Object.hasOwn(next, key));
}

function sameCharacterFrontmatter(current: Record<string, unknown>, next: Record<string, string | string[]>): boolean {
  const currentKeys = listCharacterPropertyFrontmatterKeys(current).sort();
  const nextKeys = Object.keys(next).sort();
  if (!sameStringList(currentKeys, nextKeys)) return false;
  return nextKeys.every((key) => {
    const before = current[key];
    const after = next[key];
    return Array.isArray(after) ? Array.isArray(before) && sameStringList(before.map(String), after) : !Array.isArray(before) && String(before ?? "") === after;
  });
}

function readObjectProfileFromNote(note: { type: string; frontmatter: Record<string, unknown> }): StoryStudioObjectProfile | null {
  return readStoryStudioObjectProfile(note.frontmatter[OBJECT_PROFILE_FRONTMATTER_KEY], WORLD_OBJECT_TYPE_SET.has(note.type) ? note.type as StoryStudioWorldObjectType : undefined);
}

function normalizeOptionalObjectProfile(value: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null | undefined, objectType: StoryStudioWorldObjectType): StoryStudioObjectProfile | null {
  if (value == null) return null;
  const profile = normalizeStoryStudioObjectProfile(value);
  if (profile.objectType !== objectType) throw new Error("Object profile type does not match its World Object.");
  return profile;
}

function serializeOptionalObjectProfile(value: StoryStudioObjectProfile | null): string | null {
  return value ? serializeStoryStudioObjectProfile(value) : null;
}

function characterPropertyReferences(property: CharacterProperty): string[] {
  if (property.type === "object-reference" && typeof property.value === "string") return [property.value];
  if (property.type === "object-reference-list" && Array.isArray(property.value)) return [...property.value];
  return [];
}

type LegacyObjectCard = {
  layout: "vertical" | "horizontal";
  blocks: Exclude<StoryStudioObjectCardBlockType, "secret" | "character-arc" | "property-group" | "relation-group">[];
  coverAsset: string | null;
  mediaAssets: string[];
};

function readLegacyObjectCard(projectPath: string, type: string, frontmatter: Record<string, unknown>): LegacyObjectCard {
  const layout = frontmatter.card_layout === "vertical" ? "vertical" : "horizontal";
  const requestedBlocks = stringList(frontmatter.card_blocks)
    .filter((block): block is Exclude<StoryStudioObjectCardBlockType, "secret" | "character-arc" | "property-group" | "relation-group"> => OBJECT_CARD_BLOCK_TYPE_SET.has(block) && block !== "secret" && block !== "character-arc" && block !== "property-group" && block !== "relation-group");
  const blocks = requestedBlocks.length ? [...new Set(requestedBlocks)] : defaultObjectCardBlocks(requireWorldObjectType(type));
  const coverAsset = safeImageAssetPath(projectPath, frontmatter.cover);
  const mediaAssets = [...new Set(stringList(frontmatter.media).flatMap((value) => {
    const safe = safeImageAssetPath(projectPath, value);
    return safe ? [safe] : [];
  }))].slice(0, 24);
  return { layout, blocks, coverAsset, mediaAssets };
}

function requireObjectCard(projectPath: string, objectId: string, value: StoryStudioObjectCard) {
  if (!value || typeof value !== "object") throw new Error("Object card configuration is required.");
  const candidate = {
    version: value.version,
    objectId: value.objectId,
    preset: value.preset,
    layout: value.layout,
    portrait: value.portrait,
    cover: value.cover,
    templateRef: value.templateRef,
    blocks: value.blocks,
    visual: value.visual
  };
  return validateCardPresentation(projectPath, { objectId, document: candidate, operation: "write" });
}

function requireLegacyObjectCard(projectPath: string, value: StoryStudioObjectCard): LegacyObjectCard {
  if (!value || typeof value !== "object") throw new Error("Object card configuration is required.");
  if (value.layout !== "vertical" && value.layout !== "horizontal") throw new Error("Object card layout is not supported.");
  if (!Array.isArray(value.blocks) || value.blocks.length === 0) throw new Error("Object card requires at least one block.");
  const blocks = [...new Set(value.blocks.map((block) => {
    const kind = typeof block === "string" ? block : block?.kind;
    if (!OBJECT_CARD_BLOCK_TYPE_SET.has(kind) || kind === "secret" || kind === "character-arc" || kind === "property-group" || kind === "relation-group") throw new Error("Object card block is not supported.");
    return kind;
  }))] as Exclude<StoryStudioObjectCardBlockType, "secret" | "character-arc" | "property-group" | "relation-group">[];
  const coverValue = "coverAsset" in value ? String((value as StoryStudioObjectCard & { coverAsset?: string }).coverAsset || "") : value.cover?.assetRef || "";
  const mediaValue = "mediaAssets" in value ? (value as StoryStudioObjectCard & { mediaAssets?: string[] }).mediaAssets || [] : value.visual?.mediaAssets || [];
  const coverAsset = coverValue ? requireImageAssetPath(projectPath, coverValue) : null;
  const mediaAssets = [...new Set(requireStringList(mediaValue, "Object card media").map((asset) => requireImageAssetPath(projectPath, asset)))].slice(0, 24);
  return { layout: value.layout, blocks, coverAsset, mediaAssets };
}

function projectObjectCardFrontmatter(card: LegacyObjectCard): Record<string, string | string[]> {
  return {
    card_layout: card.layout,
    card_blocks: card.blocks,
    cover: card.coverAsset || "",
    media: card.mediaAssets
  };
}

function defaultObjectCardBlocks(type: StoryStudioWorldObjectType): Exclude<StoryStudioObjectCardBlockType, "secret" | "character-arc" | "property-group" | "relation-group">[] {
  if (type === "character") return ["text", "properties", "media", "connections", "graph"];
  if (type === "location") return ["text", "properties", "media", "map", "connections"];
  return ["text", "properties", "connections"];
}

function hasLegacyCardFields(frontmatter: Record<string, unknown>): boolean {
  return ["card_layout", "card_blocks", "cover", "media"].some((key) => Object.prototype.hasOwnProperty.call(frontmatter, key));
}

function requireImageAssetPath(projectPath: string, value: string): string {
  const normalized = requireText(value, "Object card image", 280).replaceAll("\\", "/");
  if (!/^assets\/images\/[\p{L}\p{N}._ -]+\.(?:png|jpe?g|webp|gif)$/iu.test(normalized) || normalized.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Object card image must be a local assets/images file.");
  }
  resolveVisualAssetFile(projectPath, normalized);
  return normalized;
}

function safeImageAssetPath(projectPath: string, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return requireImageAssetPath(projectPath, value);
  } catch {
    return null;
  }
}

function createCardOperationId(objectId: string, input: Record<string, unknown>): string {
  const stableObject = objectId.normalize("NFC").replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 80);
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 20);
  return `card-operation.${stableObject}.${digest}`;
}

function requireCardHash(value: string): string {
  const hash = String(value || "");
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error("Card presentation revision is invalid.");
  return hash;
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function countAnchoredSections(body: string): number {
  return parseStoryCardSections(body).sections.length;
}

function assertPresentationParity(expected: Record<string, unknown>, actual: Record<string, unknown>): void {
  if (serializeCardPresentation(expected) !== serializeCardPresentation(actual)) {
    throw new Error("Saved card presentation did not preserve the prepared composition.");
  }
}

function projectObjectSummary(note: {
  id: string;
  relativePath: string;
  title: string;
  type: string;
  status: string;
  frontmatter?: Record<string, unknown>;
  tags?: unknown;
  aliases?: unknown;
}): StoryStudioWorldObjectSummary {
  return clone({
    id: note.id,
    relativeId: note.relativePath,
    title: note.title,
    type: requireWorldObjectType(note.type),
    status: note.status,
    tags: stringList(note.frontmatter?.tags ?? note.tags),
    aliases: stringList(note.frontmatter?.aliases ?? note.aliases),
    agentTypeId: typeof note.frontmatter?.agentTypeId === "string" ? note.frontmatter.agentTypeId : null,
    source: "markdown" as const
  });
}

function prepareAgentTypeBindingFrontmatter(
  projectPath: string,
  sourceType: StoryStudioWorldObjectType,
  currentTypeId: string | null,
  requestedTypeId: string | null | undefined,
  rawValues: Record<string, unknown> | undefined,
  requireCompleteRequiredFields: boolean
): { frontmatter: Record<string, unknown>; removeFrontmatterKeys: string[] } {
  if (requestedTypeId === undefined || requestedTypeId === null) {
    if (rawValues && Object.keys(rawValues).length > 0) throw new Error("Custom field values require an active Agent Type binding.");
    return { frontmatter: {}, removeFrontmatterKeys: currentTypeId ? ["agentTypeId"] : [] };
  }
  const catalog = readAgentTypeCatalog(projectPath);
  const type = catalog.customTypes.find((candidate) => candidate.typeId === requestedTypeId);
  if (!type) throw new Error("Custom Agent Type does not exist.");
  if (type.status !== "active") throw new Error("Only an active custom Agent Type can be bound.");
  const capabilityBySource: Partial<Record<StoryStudioWorldObjectType, AgentTypeBaseCapability>> = {
    character: "role",
    item: "item",
    location: "location",
    faction: "organization"
  };
  if (capabilityBySource[sourceType] !== type.baseCapability) throw new Error("Custom Agent Type is incompatible with this WorldObject source type.");
  if (rawValues !== undefined && (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues))) throw new Error("Custom field values are invalid.");
  const values = rawValues || {};
  const activeFields = type.fieldDefinitions.filter((field) => field.status === "active");
  const fieldById = new Map(activeFields.map((field) => [field.fieldId, field]));
  for (const fieldId of Object.keys(values)) {
    if (!fieldById.has(fieldId)) throw new Error("Custom field is missing or retired.");
  }
  if (requireCompleteRequiredFields) {
    const missing = activeFields.filter((field) => field.required && isEmptyAgentFieldValue(values[field.fieldId]));
    if (missing.length > 0) throw new Error(`Required custom fields are missing: ${missing.map((field) => field.label).join("、")}.`);
  }
  const frontmatter: Record<string, unknown> = { agentTypeId: type.typeId };
  const removeFrontmatterKeys: string[] = [];
  for (const [fieldId, rawValue] of Object.entries(values)) {
    const field = fieldById.get(fieldId)!;
    const key = agentTypeFieldFrontmatterKey(fieldId);
    if (isEmptyAgentFieldValue(rawValue)) {
      removeFrontmatterKeys.push(key);
      continue;
    }
    frontmatter[key] = normalizeAgentFieldValue(field, rawValue);
  }
  return { frontmatter, removeFrontmatterKeys };
}

function isEmptyAgentFieldValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function normalizeAgentFieldValue(field: AgentTypeFieldDefinition, value: unknown): string | number | boolean {
  if ((field.kind === "text" || field.kind === "longText" || field.kind === "date" || field.kind === "enum") && typeof value !== "string") throw new Error(`Custom field ${field.label} has the wrong value type.`);
  if (field.kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Custom field ${field.label} must be a number.`);
  if (field.kind === "boolean" && typeof value !== "boolean") throw new Error(`Custom field ${field.label} must be true or false.`);
  if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/u.test(String(value))) throw new Error(`Custom field ${field.label} must be YYYY-MM-DD.`);
  if (field.kind === "enum" && !field.options?.includes(String(value))) throw new Error(`Custom field ${field.label} must use a current option.`);
  if (typeof value === "string" && value.length > (field.kind === "longText" ? 20_000 : 512)) throw new Error(`Custom field ${field.label} is too long.`);
  return value as string | number | boolean;
}

function rememberObject(projectPath: string, relativeId: string): void {
  const state = readWorkspaceState(projectPath);
  const tabs = [relativeId, ...readObjectTabs(state).filter((item) => item !== relativeId)].slice(0, 5);
  updateWorkspaceState(projectPath, {
    selectedObjectPath: relativeId,
    activeSurface: "world-library",
    localPreferences: { ...(state.localPreferences || {}), storyStudioTabs: tabs }
  });
}

function readObjectTabs(state: { localPreferences?: Record<string, unknown> }): string[] {
  const value = state.localPreferences?.storyStudioTabs;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readWorkspaceSelection(projectPath: string): WorkspaceSelection {
  const state = readWorkspaceState(projectPath);
  const value = state.localPreferences?.storyStudioSelection;
  let selection: WorkspaceSelection;
  try {
    selection = createWorkspaceSelection(value && typeof value === "object" && !Array.isArray(value) ? value as Partial<WorkspaceSelection> : {});
  } catch {
    return createWorkspaceSelection();
  }
  if (selection.objectId && !listObjectSummaries(projectPath).some((object) => object.id === selection.objectId)) {
    return createWorkspaceSelection({ source: selection.source });
  }
  if (selection.documentId && !listVisualDocumentFiles(projectPath).some((document) => document.id === selection.documentId)) {
    return createWorkspaceSelection({ objectId: selection.objectId, source: selection.source });
  }
  return selection;
}

function readWritingContinuity(projectPath: string): StoryStudioWritingContinuity | null {
  const state = readWorkspaceState(projectPath);
  const value = state.localPreferences?.storyStudioWritingContinuity;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== "story-studio-writing-continuity/v1") return null;
  try {
    const activeDestination = requireProductDestination(record.activeDestination);
    const returnDestination = requireProductDestination(record.returnDestination);
    const workspaceMode = requireText(record.workspaceMode, "Writing continuity workspace mode", 80);
    const documentId = requireText(record.documentId, "Writing continuity document", 160);
    const revisionToken = requireText(record.revisionToken, "Writing continuity revision", 200);
    const selection = createWorkspaceSelection(record.selection && typeof record.selection === "object" && !Array.isArray(record.selection) ? record.selection as Partial<WorkspaceSelection> : {});
    const focus = record.focus === "writing-editor" ? "writing-editor" as const : "workspace" as const;
    const scrollTop = normalizeEditorOffset(record.scrollTop, 10_000_000);
    let document: StoryStudioWritingDocument;
    try {
      document = readWritingDocument(projectPath, documentId);
    } catch {
      return clone({ version: "story-studio-writing-continuity-product/v1" as const, state: "target-missing" as const, activeDestination, returnDestination, workspaceMode, showWorldHome: record.showWorldHome === true, documentId, revisionToken, selection: createWorkspaceSelection(), editorSelection: null, scrollTop: 0, focus: "workspace" as const });
    }
    if (document.revisionToken !== revisionToken) {
      return clone({ version: "story-studio-writing-continuity-product/v1" as const, state: "revision-stale" as const, activeDestination, returnDestination, workspaceMode, showWorldHome: record.showWorldHome === true, documentId, revisionToken: document.revisionToken, selection: createWorkspaceSelection(), editorSelection: null, scrollTop: 0, focus: "workspace" as const });
    }
    const editorSelection = record.editorSelection && typeof record.editorSelection === "object" && !Array.isArray(record.editorSelection)
      ? normalizeEditorSelection(record.editorSelection as { start: number; end: number }, document.body.length)
      : null;
    return clone({ version: "story-studio-writing-continuity-product/v1" as const, state: "exact" as const, activeDestination, returnDestination, workspaceMode, showWorldHome: record.showWorldHome === true, documentId, revisionToken, selection, editorSelection, scrollTop, focus });
  } catch {
    return null;
  }
}

function requireProductDestination(value: unknown): StoryStudioWritingContinuity["activeDestination"] {
  if (value === "creation") return "writing";
  if ((["world", "tianyi", "event-line", "nuwa", "multiverse", "library", "writing"] as unknown[]).includes(value)) {
    return value as StoryStudioWritingContinuity["activeDestination"];
  }
  throw new Error("Writing continuity destination is invalid.");
}

function normalizeEditorSelection(value: { start: number; end: number }, maximum: number): { start: number; end: number } {
  const start = normalizeEditorOffset(value.start, maximum);
  const end = normalizeEditorOffset(value.end, maximum);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function normalizeEditorOffset(value: unknown, maximum: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(Math.max(0, numeric), maximum);
}

function rememberVisualDocument(projectPath: string, relativePath: string, pane: "primary" | "secondary"): void {
  const safeRelativePath = requireRelativeDocumentPath(relativePath);
  const state = readWorkspaceState(projectPath);
  const current = readVisualViewState(state);
  const tabs = [safeRelativePath, ...current.tabs.filter((item) => item !== safeRelativePath)].slice(0, 8);
  updateWorkspaceState(projectPath, {
    activeSurface: "visual-workbench",
    localPreferences: {
      ...(state.localPreferences || {}),
      storyStudioVisual: {
        ...current,
        tabs,
        ...(pane === "secondary" ? { secondary: safeRelativePath } : { primary: safeRelativePath })
      }
    }
  });
}

function readVisualViewState(state: { localPreferences?: Record<string, unknown> }) {
  const value = state.localPreferences?.storyStudioVisual;
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    primary: typeof input.primary === "string" ? safeOptionalDocumentPath(input.primary) : null,
    secondary: typeof input.secondary === "string" ? safeOptionalDocumentPath(input.secondary) : null,
    tabs: Array.isArray(input.tabs) ? input.tabs.flatMap((item) => typeof item === "string" && safeOptionalDocumentPath(item) ? [item] : []) : [],
    splitView: input.splitView === true
  };
}

function requireRevisionRef(value: StoryStudioRevisionDocumentRef): StoryStudioRevisionDocumentRef {
  if (!value || !(value.kind === "object" || value.kind === "visual" || value.kind === "card" || value.kind === "template" || value.kind === "artifact")) throw new Error("Revision document kind is invalid.");
  return { kind: value.kind, id: requireText(value.id, "Revision document", 180) };
}

function readCanonicalRevisionSource(projectPath: string, refInput: StoryStudioRevisionDocumentRef) {
  const ref = requireRevisionRef(refInput);
  if (ref.kind === "object") {
    const note = findObjectNote(projectPath, ref.id);
    const source = serializeStoryMarkdown({ frontmatter: note.frontmatter, body: note.body });
    return {
      relativePath: note.relativePath,
      contentHash: note.contentHash,
      source,
      recordedAt: statSync(path.join(projectPath, note.relativePath)).mtime.toISOString()
    };
  }
  if (ref.kind === "card") {
    const note = findObjectNote(projectPath, ref.id);
    const presentation = readCardPresentation(projectPath, {
      objectId: ref.id,
      legacyCard: { ...readLegacyObjectCard(projectPath, note.type, note.frontmatter), hasLegacyFields: hasLegacyCardFields(note.frontmatter) },
      markdownBody: note.body
    });
    if (presentation.virtual || !presentation.contentHash) throw new Error("Card presentation has not been saved yet.");
    const absolutePath = path.join(projectPath, presentation.relativePath);
    return {
      relativePath: presentation.relativePath,
      contentHash: presentation.contentHash,
      source: readFileSync(absolutePath, "utf8"),
      recordedAt: statSync(absolutePath).mtime.toISOString()
    };
  }
  if (ref.kind === "template") {
    const template = readCardTemplateFile(projectPath, { templateId: ref.id });
    if (template.missing || !template.contentHash) throw new Error("Card template does not exist.");
    const absolutePath = path.join(projectPath, template.relativePath);
    return {
      relativePath: template.relativePath,
      contentHash: template.contentHash,
      source: readFileSync(absolutePath, "utf8"),
      recordedAt: statSync(absolutePath).mtime.toISOString()
    };
  }
  if (ref.kind === "artifact") {
    const note = readOutputArtifactNote(projectPath, ref.id);
    return {
      relativePath: note.relativePath,
      contentHash: note.contentHash,
      source: serializeStoryMarkdown({ frontmatter: note.frontmatter, body: note.body }),
      recordedAt: statSync(path.join(projectPath, note.relativePath)).mtime.toISOString()
    };
  }
  const document = (listVisualDocumentFiles(projectPath) as StoryStudioVisualDocument[]).find((item) => item.id === ref.id);
  if (!document) throw new Error("Visual document does not exist.");
  const absolutePath = path.join(projectPath, document.relativePath);
  return {
    relativePath: document.relativePath,
    contentHash: document.contentHash,
    source: readFileSync(absolutePath, "utf8"),
    recordedAt: statSync(absolutePath).mtime.toISOString()
  };
}

function recordCanonicalRevision(projectPath: string, ref: StoryStudioRevisionDocumentRef, revisionSource: "create" | "save" | "restore" | "external-baseline", restoredFromRevisionId: string | null = null, operationId: string | null = null) {
  const current = readCanonicalRevisionSource(projectPath, ref);
  return recordDocumentRevision(projectPath, {
    ref,
    relativePath: current.relativePath,
    source: current.source,
    revisionSource,
    recordedAt: current.recordedAt,
    restoredFromRevisionId,
    operationId
  });
}

function projectRevisionHistory(history: { version: string; document: StoryStudioRevisionDocumentRef; revisions: Array<Record<string, unknown>>; milestones: Array<Record<string, unknown>> }) {
  return clone({
    version: history.version,
    document: history.document,
    revisions: history.revisions.map(projectRevision),
    milestones: history.milestones.map((milestone) => ({
      id: String(milestone.id),
      title: String(milestone.title),
      revisionId: String(milestone.revisionId),
      sequence: Number(milestone.sequence)
    }))
  });
}

function projectRevision(revision: Record<string, unknown>) {
  return {
    id: String(revision.id),
    sequence: Number(revision.sequence),
    source: String(revision.source),
    recordedAt: String(revision.recordedAt),
    restoredFromRevisionId: revision.restoredFromRevisionId == null ? null : String(revision.restoredFromRevisionId),
    operationId: revision.operationId == null ? null : String(revision.operationId)
  };
}

function requireRelativeDocumentPath(value: unknown): string {
  const relativePath = requireText(value, "Visual document path", 280).replaceAll("\\", "/");
  if (relativePath.startsWith("/") || relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..") || !/^documents\/(maps|graphs|canvases|timelines|trees)\/.+\.(map|graph|canvas|timeline|tree)\.json$/u.test(relativePath)) {
    throw new Error("Visual document path is invalid.");
  }
  return relativePath;
}

function safeOptionalDocumentPath(value: string): string | null {
  try {
    return requireRelativeDocumentPath(value);
  } catch {
    return null;
  }
}

function uniqueObjectId(type: StoryStudioWorldObjectType, title: string, existing: Set<string>): string {
  const segment = title.normalize("NFC").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/g, "-").slice(0, 96) || "untitled";
  const base = `${type}.${segment}`;
  if (!existing.has(base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    if (!existing.has(`${base}-${index}`)) return `${base}-${index}`;
  }
  throw new Error("Could not create a unique object identifier.");
}

function requireStableConfirmedEventRef(value: string): string {
  const eventRef = requireText(value, "Confirmed Event identity", 160);
  if (!/^event\.author-confirmed-[a-f0-9]{24}$/u.test(eventRef)) {
    throw new Error("Confirmed Event identity is invalid.");
  }
  return eventRef;
}

function requireAgentProposalCharacterId(value: string): string {
  return requireAgentProposalObjectId(value, "character");
}

function requireAgentProposalObjectId(value: string, objectType: "character" | "item" | "location"): string {
  const objectId = requireText(value, "Agent proposal object identity", 160);
  const pattern = new RegExp(`^${objectType}\\.agent-proposal-[a-f0-9]{24}$`, "u");
  if (!pattern.test(objectId)) throw new Error(`Agent proposal ${objectType} identity is invalid.`);
  return objectId;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is invalid.`);
  return value;
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function requireHash(value: string, label: string): string {
  const hash = requireText(value, label, 64);
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error(`${label} is invalid.`);
  return hash;
}

function requireWorldObjectType(value: string): StoryStudioWorldObjectType {
  if (!WORLD_OBJECT_TYPE_SET.has(value)) throw new Error("World object type is not supported.");
  return value as StoryStudioWorldObjectType;
}

function defaultObjectStatus(type: StoryStudioWorldObjectType): string {
  if (type === "event") return "possible";
  if (type === "rule") return "locked";
  if (type === "thread") return "open";
  return "active";
}

function optionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  return value == null || String(value).trim() === "" ? undefined : requireText(value, label, maxLength);
}

function requireStringList(value: string[] | undefined, label: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  return [...new Set(value.map((item) => requireText(item, label, 80)))].slice(0, 40);
}

function uniqueObjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Library selection is invalid.");
  const ids = value.map((item) => requireText(String(item), "Library object id", 160));
  return [...new Set(ids)];
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value == null || value === "" ? [] : [String(value)];
}

function requireBoundedFrontmatterStringList(value: unknown, label: string, maximumItems: number): string[] {
  const values = stringList(value);
  if (values.length > maximumItems) throw new Error(`${label} is too large.`);
  return values.map((item) => requireText(item, label, 180));
}

function compareWorldObjects(left: StoryStudioWorldObjectSummary, right: StoryStudioWorldObjectSummary): number {
  return left.title.localeCompare(right.title, "zh-CN") || left.id.localeCompare(right.id);
}

function readProductProject(rootPath: string, projectId: string): StoryStudioProject {
  const projectPath = resolveProjectPath(rootPath, projectId);
  const validation = validateStoryWorkspace(projectPath);
  if (!validation.valid) throw new Error(`Project could not be opened: ${validation.errors.join("; ")}`);
  const workspace = openStoryWorkspace(projectPath);
  const summary = workspace.summary;

  return clone({
    id: projectId,
    title: summary.projectTitle,
    status: summary.projectStatus || "active",
    genre: summary.genre || null,
    ambience: summary.ambience || null,
    counts: {
      chapters: summary.chapterCount,
      scenes: summary.sceneCount,
      objects: summary.objectCount
    },
    source: "markdown"
  });
}

function listProjectIds(rootPath: string): string[] {
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.name !== "_continuity")
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && PROJECT_ID_PATTERN.test(entry.name))
    .filter((entry) => existsSync(path.join(rootPath, entry.name, "project.md")))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function prepareConfiguredRoot(rootPath: string): string {
  const resolved = path.resolve(requireText(rootPath, "Story Studio root", 4096));
  mkdirSync(resolved, { recursive: true });
  if (lstatSync(resolved).isSymbolicLink()) throw new Error("Story Studio root cannot be a symlink.");
  return realpathSync(resolved);
}

function resolveProjectPath(rootPath: string, rawProjectId: string, options: { allowMissing?: boolean } = {}): string {
  const projectId = requireProjectId(rawProjectId);
  const candidate = path.resolve(rootPath, projectId);
  if (path.dirname(candidate) !== rootPath) throw new Error("Project identifier escapes the configured root.");
  if (!existsSync(candidate)) {
    if (options.allowMissing) return candidate;
    throw new Error("Project does not exist.");
  }
  if (lstatSync(candidate).isSymbolicLink()) throw new Error("Project folder cannot be a symlink.");
  const real = realpathSync(candidate);
  if (path.dirname(real) !== rootPath) throw new Error("Project folder escapes the configured root.");
  return real;
}

function requireProjectId(value: string): string {
  const projectId = requireText(value, "Project identifier", 64).toLowerCase();
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("Project identifier must use lowercase letters, numbers, and single hyphens.");
  }
  return projectId;
}

function optionalMachineValue(value: string | undefined, label: string): string | undefined {
  if (value == null || value === "") return undefined;
  const normalized = requireText(value, label, 64);
  if (!PROJECT_ID_PATTERN.test(normalized)) throw new Error(`${label} must use a stable machine value.`);
  return normalized;
}

function requireText(value: string, label: string, maxLength: number): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.includes("\0")) throw new Error(`${label} contains an invalid character.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function requireArtifactId(value: string, label: string): string {
  const normalized = requireText(value, label, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) throw new Error(`${label} must use a stable machine value.`);
  return normalized;
}

function readAppState(stateFilePath: string): { activeProject: string | null; recentProjects: string[] } {
  if (!existsSync(stateFilePath)) return { activeProject: null, recentProjects: [] };
  const raw = JSON.parse(readFileSync(stateFilePath, "utf8"));
  const activeProject = typeof raw.activeProject === "string" && PROJECT_ID_PATTERN.test(raw.activeProject)
    ? raw.activeProject
    : null;
  const recentProjects = Array.isArray(raw.recentProjects)
    ? raw.recentProjects.filter((value: unknown): value is string => typeof value === "string" && PROJECT_ID_PATTERN.test(value))
    : [];
  return { activeProject, recentProjects: [...new Set(recentProjects)].slice(0, 12) };
}

function rememberProject(stateFilePath: string, projectId: string): void {
  const current = readAppState(stateFilePath);
  writeAppState(stateFilePath, {
    activeProject: projectId,
    recentProjects: [projectId, ...current.recentProjects.filter((id) => id !== projectId)].slice(0, 12)
  });
}

function writeAppState(
  stateFilePath: string,
  state: { activeProject: string | null; recentProjects: string[] }
): void {
  mkdirSync(path.dirname(stateFilePath), { recursive: true });
  const temporaryPath = `${stateFilePath}.tmp`;
  const payload = {
    version: APP_STATE_VERSION,
    activeProject: state.activeProject,
    recentProjects: state.recentProjects
  };
  writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, stateFilePath);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
