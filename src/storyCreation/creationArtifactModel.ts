import {
  createEmptyNovelDocumentModelR1,
  modelUsesDocumentAuthority,
  NOVEL_DOCUMENT_AUTHORITY_R1,
  type NovelDocumentModelR1,
  validateNovelDocumentModelR1
} from "./novelDocumentModelR1.ts";

export const CREATION_STRUCTURE_VERSION = "story-studio-creation-structure/v1" as const;
export const OUTPUT_ARTIFACT_SCHEMA_VERSION = "story-studio-output-artifact/v2" as const;

export type CreationArtifactType = "novel" | "screenplay" | "storyboard" | "comic" | "motion-comic" | "interactive-drama";

export type CreationStructure = Record<string, unknown> & {
  version: typeof CREATION_STRUCTURE_VERSION;
  kind: CreationArtifactType;
};

/**
 * Additive migration for the existing OutputArtifact owner. The source text is
 * never rewritten here; legacy structure keys are retained after validation so
 * an old artifact can be opened read-only and migrated on its next author save.
 */
export function migrateCreationStructure(type: CreationArtifactType, value: unknown, content = ""): CreationStructure {
  const current = structuredRecord(value);
  const base: CreationStructure = {
    ...current,
    version: CREATION_STRUCTURE_VERSION,
    kind: type
  };
  if (type === "novel") {
    return { ...base, view: structuredRecord(current.view), legacyChapters: structuredList(current.chapters) };
  }
  if (type === "screenplay") {
    return { ...base, view: structuredRecord(current.view), legacyBlocks: structuredList(current.blocks), format: "fountain-r0" };
  }
  if (type === "storyboard" || type === "motion-comic") {
    return { ...base, pages: migratePages(current.pages, current.shots, content, type) };
  }
  if (type === "comic") {
    return { ...base, pages: migratePages(current.pages, current.panels, content, type) };
  }
  return { ...base, scenes: structuredList(current.scenes) };
}

export function creationStructureNeedsMigration(value: unknown): boolean {
  return structuredRecord(value).version !== CREATION_STRUCTURE_VERSION;
}

export const NOVEL_DOCUMENT_MODEL_KEY = "novelDocumentModel" as const;
export const NOVEL_DOCUMENT_AUTHORITY_KEY = "novelAuthority" as const;
export const NOVEL_MIGRATION_RECEIPT_KEY = "novelMigration" as const;
export const NOVEL_EVENT_PROPOSAL_KEY = "novelEventProposal" as const;

/** Returns the persisted neutral model, if this artifact has been explicitly migrated or created on R1. */
export function readNovelDocumentModel(value: unknown): NovelDocumentModelR1 | null {
  const record = structuredRecord(value);
  const candidate = record[NOVEL_DOCUMENT_MODEL_KEY];
  return modelUsesDocumentAuthority(candidate) ? validateNovelDocumentModelR1(candidate) : null;
}

/** Creates the additive structure for a new model-backed novel. It is only called on explicit creation. */
export function createNovelDocumentStructure(input: {
  artifactId: string;
  title: string;
  createdAt: string;
  structure?: unknown;
}): CreationStructure {
  const base = migrateCreationStructure("novel", input.structure ?? {});
  const existing = readNovelDocumentModel(base);
  const model = existing || createEmptyNovelDocumentModelR1(input.artifactId, input.title, input.createdAt, {
    sourceArtifactId: input.artifactId,
    importedFrom: "native"
  });
  return {
    ...base,
    [NOVEL_DOCUMENT_AUTHORITY_KEY]: NOVEL_DOCUMENT_AUTHORITY_R1,
    [NOVEL_DOCUMENT_MODEL_KEY]: validateNovelDocumentModelR1(model)
  };
}

export function structuredRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export function structuredList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({ ...item }))
    : [];
}

function migratePages(pagesValue: unknown, legacyRowsValue: unknown, content: string, type: CreationArtifactType): Record<string, unknown>[] {
  const pages = structuredList(pagesValue);
  if (pages.length) return pages.map((page, pageIndex) => ({
    ...page,
    id: text(page.id) || `page.${pageIndex + 1}`,
    title: text(page.title) || `第 ${pageIndex + 1} 页`,
    layoutTemplate: normalizeLayout(page.layoutTemplate),
    panels: structuredList(page.panels).map((panel, panelIndex) => normalizePanel(panel, pageIndex, panelIndex))
  }));
  const legacyRows = structuredList(legacyRowsValue);
  const rows = legacyRows.length ? legacyRows : [{ image: content, frame: content, visual: content }];
  return [{
    id: "page.1",
    title: type === "motion-comic" ? "序列 1" : "第 1 页",
    layoutTemplate: "single",
    panels: rows.map((row, panelIndex) => normalizePanel(row, 0, panelIndex))
  }];
}

function normalizePanel(value: Record<string, unknown>, pageIndex: number, panelIndex: number): Record<string, unknown> {
  return {
    ...value,
    id: text(value.id) || `panel.${pageIndex + 1}.${panelIndex + 1}`,
    assetId: text(value.assetId),
    shotSize: text(value.shotSize ?? value.size),
    camera: text(value.camera),
    characters: stringList(value.characters),
    locationId: text(value.locationId),
    action: text(value.action),
    dialogue: text(value.dialogue ?? value.sound ?? value.voice),
    caption: text(value.caption),
    prompt: text(value.prompt ?? value.image ?? value.frame ?? value.visual),
    continuityNotes: text(value.continuityNotes ?? value.note),
    sourceRefs: structuredList(value.sourceRefs)
  };
}

function normalizeLayout(value: unknown): "single" | "two-column" | "three-strip" | "hero-two" {
  return value === "two-column" || value === "three-strip" || value === "hero-two" ? value : "single";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 32) : [];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
