import { parseStoryCardSections, readStoryCardContent } from "../../../../../../src/storyCardPresentation/storyCardSectionAnchors.ts";

export type CharacterDirectorySort = "manual" | "name-asc" | "name-desc" | "recent" | "appearance-asc" | "appearance-desc" | "role-level";

export type SummaryCharacter = {
  body: string;
  profile?: { fields?: Record<string, { value?: unknown }> } | null;
};

export type SortableCharacter = {
  object: { id: string; title: string; subtype: string; updatedAt?: string | null };
  eventCount: number;
  manualOrder: number | null;
};

/**
 * Directory summaries are display-only projections. They deliberately use the
 * shared section parser and never expose section anchors or content references.
 */
export function getCharacterDirectorySummary(character: SummaryCharacter, fallback: string): string {
  const profile = userText(character.profile?.fields?.summary?.value);
  if (profile) return profile;

  const background = readStoryCardContent(character.body, "markdown-section.background");
  const sectionContent = userText(background.found ? background.content : "");
  if (sectionContent) return sectionContent;

  const body = readStoryCardContent(character.body, "markdown-body");
  const paragraph = firstUserParagraph(body.content);
  return paragraph || fallback;
}

export function getCharacterDetailSections(body: string): Array<{ heading: string; content: string }> {
  return parseStoryCardSections(body).sections
    .map((section) => ({ heading: userText(section.heading), content: userText(section.content) }))
    .filter((section) => Boolean(section.heading) && Boolean(section.content));
}

export function compareDirectoryCharacters(left: SortableCharacter, right: SortableCharacter, sort: CharacterDirectorySort): number {
  const stable = () => left.object.title.localeCompare(right.object.title, "zh-CN", { numeric: true }) || left.object.id.localeCompare(right.object.id);
  if (sort === "name-asc") return stable();
  if (sort === "name-desc") return -stable();
  if (sort === "recent") return String(right.object.updatedAt || "").localeCompare(String(left.object.updatedAt || "")) || stable();
  if (sort === "appearance-asc") return left.eventCount - right.eventCount || stable();
  if (sort === "appearance-desc") return right.eventCount - left.eventCount || stable();
  if (sort === "role-level") return roleOrder(left.object.subtype) - roleOrder(right.object.subtype) || left.object.subtype.localeCompare(right.object.subtype, "zh-CN") || stable();
  return (left.manualOrder ?? Number.MAX_SAFE_INTEGER) - (right.manualOrder ?? Number.MAX_SAFE_INTEGER) || stable();
}

export function validateCustomRoleLevel(value: string, existing: readonly string[]): { value: string } | { error: "empty" | "length" | "dangerous" | "duplicate" } {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalized) return { error: "empty" };
  if (normalized.length > 48) return { error: "length" };
  if (/[\u0000-\u001F<>/&\\]/u.test(normalized) || /world-os:|contentref|sectionid/iu.test(normalized)) return { error: "dangerous" };
  if (existing.some((item) => item.normalize("NFKC").trim().toLocaleLowerCase("und") === normalized.toLocaleLowerCase("und"))) return { error: "duplicate" };
  return { value: normalized };
}

function userText(value: unknown): string {
  const source = typeof value === "string" ? value : "";
  if (!source || /world-os:section|contentref|sectionid|<!--|-->/iu.test(source)) return "";
  return source
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function firstUserParagraph(value: string): string {
  const withoutComments = String(value ?? "").replace(/<!--[^]*?-->/gu, "");
  for (const paragraph of withoutComments.split(/\n\s*\n/gu)) {
    if (/^\s{0,3}#{1,6}\s+/u.test(paragraph)) continue;
    const candidate = userText(paragraph);
    if (candidate) return candidate;
  }
  return "";
}

function roleOrder(value: string): number {
  if (value === "main" || value === "主要角色") return 0;
  if (value === "supporting" || value === "配角") return 1;
  if (value === "minor" || value === "次要角色") return 2;
  return 3;
}
