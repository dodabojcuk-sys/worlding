import { createHash } from "node:crypto";

import { normalizeCharacterProperties, type CharacterProperty } from "./characterProperties.ts";
import { appendStoryCardSection } from "./storyCardSectionAnchors.ts";
import type { CharacterCardDocument } from "./characterTemplate.ts";

export type CharacterCreationMode = "guided" | "freeform";

export function createCharacterPreset(input: {
  objectId: string;
  title: string;
  mode: CharacterCreationMode;
  background?: string;
  personality?: string;
  appearance?: string;
  properties?: CharacterProperty[];
  portrait?: CharacterCardDocument["portrait"];
  cover?: CharacterCardDocument["cover"];
}): { body: string; properties: CharacterProperty[]; card: CharacterCardDocument } {
  const title = requireText(input.title, "Character title", 80);
  const properties = normalizeCharacterProperties(input.properties || []);
  let body = `# ${title}\n\n`;
  const blocks: CharacterCardDocument["blocks"] = [
    { id: presetBlockId(input.objectId, "overview"), kind: "text", contentRef: "markdown-body", collapsed: false, size: "large" },
    { id: presetBlockId(input.objectId, "core-properties"), kind: "property-group", label: "核心信息", propertyKeys: properties.map((property) => property.key), collapsed: false, size: "medium" },
    { id: presetBlockId(input.objectId, "metadata"), kind: "properties", presentationRef: "object.properties", collapsed: false, size: "medium" }
  ];

  if (input.mode === "guided") {
    const guidedSections = [
      { id: "background", heading: "背景与出身", content: String(input.background || "") },
      { id: "personality", heading: "性格", content: String(input.personality || "") },
      { id: "appearance", heading: "外观", content: String(input.appearance || "") }
    ];
    for (const section of guidedSections) {
      body = appendStoryCardSection(body, { id: section.id, kind: "text", heading: section.heading, content: section.content });
      blocks.push({
        id: presetBlockId(input.objectId, section.id),
        kind: "text",
        contentRef: `markdown-section.${section.id}`,
        collapsed: section.content.trim().length === 0,
        size: "large"
      });
    }
  }

  blocks.push({ id: presetBlockId(input.objectId, "connections"), kind: "connections", presentationRef: "object.connections", collapsed: true, size: "medium" });
  const card: CharacterCardDocument = {
    version: "story-card-presentation/v2",
    objectId: input.objectId,
    preset: "character",
    layout: "horizontal",
    portrait: input.portrait || null,
    cover: input.cover || null,
    templateRef: null,
    blocks,
    visual: { density: "comfortable", mediaAssets: [] }
  };
  return { body, properties, card };
}

export function presetBlockId(objectId: string, role: string): string {
  const digest = createHash("sha256").update(`character-preset/v1:${objectId}:${role}`).digest("hex").slice(0, 20);
  return `card-block.preset.${digest}`;
}

function requireText(value: unknown, label: string, maximum: number): string {
  const text = String(value || "").normalize("NFC").trim();
  if (!text || text.length > maximum || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}
