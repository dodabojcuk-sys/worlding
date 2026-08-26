import { createHash } from "node:crypto";

import {
  normalizeCardTemplate,
  type CardTemplate,
  type CardTemplateBlock,
  type CardTemplatePropertyDefinition,
  type CardTemplateSection
} from "./cardTemplateSchema.ts";
import {
  normalizeCharacterProperties,
  type CharacterProperty
} from "./characterProperties.ts";
import {
  appendStoryCardSection,
  parseStoryCardSections,
  type StoryCardSectionKind
} from "./storyCardSectionAnchors.ts";
import type { CharacterRelationGroupConfig } from "./characterCardWorldProjection.ts";

export type CharacterCardBlock = {
  id: string;
  kind: "text" | "secret" | "character-arc" | "property-group" | "relation-group" | "properties" | "connections" | "media" | "map" | "graph" | "timeline" | "tree" | "canvas";
  contentRef?: string;
  presentationRef?: string;
  label?: string;
  propertyKeys?: string[];
  relationConfig?: CharacterRelationGroupConfig;
  collapsed: boolean;
  size: "small" | "medium" | "large";
};

export type CharacterCardDocument = {
  version: "story-card-presentation/v2";
  objectId: string;
  preset: "character";
  layout: "horizontal" | "vertical";
  portrait: { assetRef: string; fit: "cover" | "contain"; position: { x: number; y: number } } | null;
  cover: { assetRef: string; fit: "cover" | "contain"; position: { x: number; y: number } } | null;
  templateRef: string | null;
  blocks: CharacterCardBlock[];
  visual: { density: "comfortable" | "compact"; mediaAssets: string[] };
};

export type CharacterTemplateDiff = {
  version: "story-card-template-diff/v1";
  templateId: string;
  missingSections: Array<CardTemplateSection & { sectionId: string; contentRef: string }>;
  missingPropertyDefinitions: CardTemplatePropertyDefinition[];
  propertyTypeConflicts: Array<{ key: string; existingType: string; templateType: string }>;
  missingBlocks: CharacterCardBlock[];
  missingPortraitSlot: boolean;
  missingCoverSlot: boolean;
  preserved: {
    prose: true;
    propertyValues: true;
    blockIds: true;
    blockOrder: true;
    groups: true;
    portrait: true;
    cover: true;
    layout: true;
    visualSettings: true;
  };
  templateOverwriteCount: 0;
  hasChanges: boolean;
};

const DEFAULT_PRESENTATION_REFS: Record<string, string> = {
  properties: "object.properties",
  connections: "object.connections",
  media: "object.media",
  map: "projection.map-appearances",
  graph: "projection.graph-relations",
  timeline: "projection.timeline-participation",
  tree: "projection.tree-appearances",
  canvas: "projection.canvas-appearances"
};

export function buildCharacterTemplateDiff(input: {
  objectId: string;
  template: CardTemplate;
  body: string;
  properties: CharacterProperty[];
  card: CharacterCardDocument;
}): CharacterTemplateDiff {
  const template = normalizeCardTemplate(input.template);
  const properties = normalizeCharacterProperties(input.properties);
  const sections = parseStoryCardSections(input.body).sections;
  const existingProperties = new Map(properties.map((property) => [property.key, property]));
  const missingSections = template.sections
    .filter((section) => !sections.some((current) => current.id === section.slot))
    .map((section) => ({ ...section, sectionId: section.slot, contentRef: `markdown-section.${section.slot}` }));
  const missingPropertyDefinitions: CardTemplatePropertyDefinition[] = [];
  const propertyTypeConflicts: CharacterTemplateDiff["propertyTypeConflicts"] = [];
  for (const definition of template.propertyDefinitions) {
    const existing = existingProperties.get(definition.key);
    if (!existing) {
      missingPropertyDefinitions.push({ ...definition, enumOptions: [...definition.enumOptions] });
      continue;
    }
    if (existing.type !== definition.type || (existing.type === "enum" && !sameStrings(existing.enumOptions, definition.enumOptions))) {
      propertyTypeConflicts.push({ key: definition.key, existingType: existing.type, templateType: definition.type });
    }
  }
  const conflictingKeys = new Set(propertyTypeConflicts.map((conflict) => conflict.key));
  const existingBlockIds = new Set(input.card.blocks.map((block) => block.id));
  const existingContentRefs = new Set(input.card.blocks.flatMap((block) => block.contentRef ? [block.contentRef] : []));
  const existingKinds = new Set(input.card.blocks.map((block) => block.kind));
  const missingBlocks: CharacterCardBlock[] = [];
  for (const block of template.blocks) {
    const id = stableTemplateBlockId(input.objectId, template.id, block.slot);
    if (existingBlockIds.has(id)) continue;
    if (block.sectionSlot) {
      const contentRef = `markdown-section.${block.sectionSlot}`;
      if (existingContentRefs.has(contentRef)) continue;
      missingBlocks.push({ id, kind: block.kind as CharacterCardBlock["kind"], contentRef, collapsed: block.collapsed, size: block.size });
      continue;
    }
    if (block.kind === "property-group") {
      const propertyKeys = (block.propertyKeys || []).filter((key) => !conflictingKeys.has(key));
      missingBlocks.push({ id, kind: "property-group", label: block.label, propertyKeys, collapsed: block.collapsed, size: block.size });
      continue;
    }
    if (block.kind === "relation-group") {
      missingBlocks.push({ id, kind: "relation-group", label: block.label, relationConfig: emptyRelationGroupConfig(), collapsed: block.collapsed, size: block.size });
      continue;
    }
    if (existingKinds.has(block.kind)) continue;
    const presentationRef = DEFAULT_PRESENTATION_REFS[block.kind];
    if (!presentationRef) throw new Error("Card template block cannot be applied in Checkpoint B.");
    missingBlocks.push({ id, kind: block.kind as CharacterCardBlock["kind"], presentationRef, collapsed: block.collapsed, size: block.size });
  }

  return {
    version: "story-card-template-diff/v1",
    templateId: template.id,
    missingSections,
    missingPropertyDefinitions,
    propertyTypeConflicts,
    missingBlocks,
    missingPortraitSlot: false,
    missingCoverSlot: false,
    preserved: {
      prose: true,
      propertyValues: true,
      blockIds: true,
      blockOrder: true,
      groups: true,
      portrait: true,
      cover: true,
      layout: true,
      visualSettings: true
    },
    templateOverwriteCount: 0,
    hasChanges: missingSections.length > 0 || missingPropertyDefinitions.length > 0 || missingBlocks.length > 0 || input.card.templateRef == null
  };
}

export function applyCharacterTemplateDiff(input: {
  body: string;
  properties: CharacterProperty[];
  card: CharacterCardDocument;
  template: CardTemplate;
  diff: CharacterTemplateDiff;
}): {
  body: string;
  properties: CharacterProperty[];
  card: CharacterCardDocument;
  templateOverwriteCount: 0;
} {
  const template = normalizeCardTemplate(input.template);
  if (input.diff.templateId !== template.id) throw new Error("Template diff does not match the selected template.");
  let body = String(input.body);
  for (const section of input.diff.missingSections) {
    body = appendStoryCardSection(body, {
      id: section.sectionId,
      kind: section.kind as StoryCardSectionKind,
      heading: section.label,
      content: ""
    });
  }
  const properties = normalizeCharacterProperties(input.properties);
  const existingKeys = new Set(properties.map((property) => property.key));
  const nextProperties = [...properties];
  for (const definition of input.diff.missingPropertyDefinitions) {
    if (existingKeys.has(definition.key)) continue;
    nextProperties.push({ ...definition, enumOptions: [...definition.enumOptions], value: null });
    existingKeys.add(definition.key);
  }
  const existingBlockIds = new Set(input.card.blocks.map((block) => block.id));
  const appendedBlocks = input.diff.missingBlocks.filter((block) => !existingBlockIds.has(block.id)).map(cloneBlock);
  const card: CharacterCardDocument = {
    ...input.card,
    templateRef: input.card.templateRef || template.id,
    blocks: [...input.card.blocks.map(cloneBlock), ...appendedBlocks],
    visual: { ...input.card.visual, mediaAssets: [...input.card.visual.mediaAssets] },
    portrait: input.card.portrait ? { ...input.card.portrait, position: { ...input.card.portrait.position } } : null,
    cover: input.card.cover ? { ...input.card.cover, position: { ...input.card.cover.position } } : null
  };
  return { body, properties: nextProperties, card, templateOverwriteCount: 0 };
}

export function createCardTemplateFromCharacter(input: {
  templateId: string;
  label: string;
  body: string;
  properties: CharacterProperty[];
  card: CharacterCardDocument;
}): CardTemplate {
  const sections = parseStoryCardSections(input.body).sections;
  const sectionSlots = new Map<string, string>();
  const templateSections: CardTemplateSection[] = sections.map((section, index) => {
    const slot = safeSlot(section.id, `${section.kind}-${index + 1}`);
    sectionSlots.set(section.id, slot);
    return { slot, kind: section.kind, label: structuralSectionLabel(section.kind, section.id), repeatable: section.kind === "text" || section.kind === "secret" || section.kind === "character-arc" };
  });
  const properties = normalizeCharacterProperties(input.properties);
  const propertyDefinitions = properties.map(({ key, label, type, enumOptions }) => ({ key, label, type, enumOptions: [...enumOptions] }));
  const definedPropertyKeys = new Set(propertyDefinitions.map((property) => property.key));
  const kindCounts = new Map<string, number>();
  const blocks: CardTemplateBlock[] = input.card.blocks.flatMap((block) => {
    const ordinal = (kindCounts.get(block.kind) || 0) + 1;
    kindCounts.set(block.kind, ordinal);
    const base = { slot: safeSlot(`${block.kind}-${ordinal}`, `block-${ordinal}`), kind: block.kind, collapsed: block.collapsed, size: block.size };
    if (block.contentRef?.startsWith("markdown-section.")) {
      const sectionId = block.contentRef.slice("markdown-section.".length);
      const sectionSlot = sectionSlots.get(sectionId);
      return sectionSlot ? [{ ...base, sectionSlot }] : [];
    }
    if (block.kind === "text" && block.contentRef === "markdown-body") {
      return [];
    }
    if (block.kind === "property-group") {
      return [{ ...base, label: block.label || "属性组", propertyKeys: (block.propertyKeys || []).filter((key) => definedPropertyKeys.has(key)) }];
    }
    if (block.kind === "relation-group") {
      return [{ ...base, label: block.label || "已确认关系" }];
    }
    return [{ ...base }];
  });
  return normalizeCardTemplate({
    version: "story-card-template/v1",
    id: input.templateId,
    label: input.label,
    targetType: "character",
    preset: "character",
    sections: templateSections,
    propertyDefinitions,
    blocks,
    visualDefaults: {
      layout: input.card.layout,
      density: input.card.visual.density,
      portraitSlot: true,
      coverSlot: true
    }
  });
}

export function stableTemplateBlockId(objectId: string, templateId: string, slot: string): string {
  const digest = createHash("sha256").update(`story-card-template/v1:${objectId}:${templateId}:${slot}`).digest("hex").slice(0, 20);
  return `card-block.template.${digest}`;
}

function structuralSectionLabel(kind: string, sectionId: string): string {
  if (kind === "secret") return "秘密";
  if (kind === "character-arc") return "人物弧线";
  return ({
    background: "背景与出身",
    personality: "性格",
    appearance: "外观",
    goals: "目标",
    motivations: "动机",
    fears: "恐惧",
    weaknesses: "弱点",
    voice: "声音",
    "knowledge-boundaries": "知识边界",
    "current-state": "当前状态"
  } as Record<string, string>)[sectionId] || "自定义正文";
}

function safeSlot(value: string, fallback: string): string {
  const normalized = String(value).normalize("NFC").toLowerCase().replace(/[^a-z0-9-]/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "").slice(0, 48);
  if (/^[a-z][a-z0-9-]{0,47}$/u.test(normalized)) return normalized;
  const digest = createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
  return `${fallback.replace(/[^a-z0-9-]/gu, "-").slice(0, 30) || "section"}-${digest}`;
}

function cloneBlock(block: CharacterCardBlock): CharacterCardBlock {
  return {
    ...block,
    ...(block.propertyKeys ? { propertyKeys: [...block.propertyKeys] } : {}),
    ...(block.relationConfig ? { relationConfig: {
      sourceDocumentIds: [...block.relationConfig.sourceDocumentIds],
      directions: [...block.relationConfig.directions],
      relationTypes: [...block.relationConfig.relationTypes],
      edgeIds: [...block.relationConfig.edgeIds]
    } } : {})
  };
}

function emptyRelationGroupConfig(): CharacterRelationGroupConfig {
  return { sourceDocumentIds: [], directions: [], relationTypes: [], edgeIds: [] };
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
