export const STORY_CARD_SECTION_KINDS = ["text", "secret", "character-arc"] as const;

export type StoryCardSectionKind = typeof STORY_CARD_SECTION_KINDS[number];

export type StoryCardSection = {
  id: string;
  kind: StoryCardSectionKind;
  heading: string;
  content: string;
  anchorStart: number;
  contentStart: number;
  contentEnd: number;
};

export type StoryCardSectionDiagnostic = {
  code: "duplicate-section-id" | "invalid-section-anchor" | "missing-content-ref";
  message: string;
  sectionId?: string;
  contentRef?: string;
};

const SECTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/u;
const CONTENT_REF_PATTERN = /^markdown-section\.([a-z][a-z0-9-]{0,62})$/u;
const ANCHOR_LINE_PATTERN = /^<!-- world-os:section id="([a-z][a-z0-9-]{0,62})" kind="(text|secret|character-arc)" -->$/u;
const MAX_SECTION_COUNT = 96;

/**
 * Parses only the frozen World OS card-section comment followed immediately by
 * one ATX heading. Other HTML comments remain ordinary authored Markdown.
 */
export function parseStoryCardSections(body: string): {
  sections: StoryCardSection[];
  diagnostics: StoryCardSectionDiagnostic[];
} {
  const source = String(body ?? "");
  const lines = source.match(/.*(?:\n|$)/gu) || [];
  const anchors: Array<Omit<StoryCardSection, "content" | "contentEnd">> = [];
  const diagnostics: StoryCardSectionDiagnostic[] = [];
  let offset = 0;

  for (let index = 0; index < lines.length && anchors.length < MAX_SECTION_COUNT; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/\r?\n$/u, "");
    if (!line.startsWith("<!-- world-os:section")) {
      offset += rawLine.length;
      continue;
    }
    const match = ANCHOR_LINE_PATTERN.exec(line);
    const headingLine = lines[index + 1]?.replace(/\r?\n$/u, "") || "";
    const headingMatch = /^(#{1,6}) ([^\r\n]{1,120})$/u.exec(headingLine);
    if (!match || !headingMatch) {
      diagnostics.push({ code: "invalid-section-anchor", message: "卡片内容锚点格式无效；该注释仍按普通 Markdown 保留。" });
      offset += rawLine.length;
      continue;
    }
    const anchorStart = offset;
    const contentStart = offset + rawLine.length + (lines[index + 1]?.length || 0);
    anchors.push({
      id: match[1],
      kind: match[2] as StoryCardSectionKind,
      heading: headingMatch[2],
      anchorStart,
      contentStart
    });
    offset += rawLine.length;
  }

  const counts = new Map<string, number>();
  for (const anchor of anchors) counts.set(anchor.id, (counts.get(anchor.id) || 0) + 1);
  for (const [sectionId, count] of counts) {
    if (count > 1) diagnostics.push({
      code: "duplicate-section-id",
      message: `Markdown 内容锚点 ${sectionId} 重复；修复前禁止保存卡片构成。`,
      sectionId
    });
  }

  const sections = anchors.map((anchor, index) => {
    const contentEnd = anchors[index + 1]?.anchorStart ?? source.length;
    return { ...anchor, contentEnd, content: source.slice(anchor.contentStart, contentEnd) };
  });
  return { sections, diagnostics };
}

export function requireStoryCardSectionId(value: string): string {
  const id = String(value ?? "").normalize("NFC");
  if (!SECTION_ID_PATTERN.test(id)) throw new Error("Card section identifier is invalid.");
  return id;
}

export function contentRefForSection(sectionId: string): string {
  return `markdown-section.${requireStoryCardSectionId(sectionId)}`;
}

export function sectionIdFromContentRef(contentRef: string): string | null {
  const match = CONTENT_REF_PATTERN.exec(String(contentRef ?? ""));
  return match?.[1] || null;
}

export function readStoryCardContent(body: string, contentRef: string): {
  found: boolean;
  content: string;
  section: StoryCardSection | null;
  diagnostics: StoryCardSectionDiagnostic[];
} {
  const parsed = parseStoryCardSections(body);
  if (contentRef === "markdown-body") {
    const firstAnchor = parsed.sections[0]?.anchorStart ?? String(body ?? "").length;
    return { found: true, content: String(body ?? "").slice(0, firstAnchor), section: null, diagnostics: parsed.diagnostics };
  }
  const sectionId = sectionIdFromContentRef(contentRef);
  const section = sectionId ? parsed.sections.find((candidate) => candidate.id === sectionId) || null : null;
  if (!section || parsed.diagnostics.some((item) => item.code === "duplicate-section-id" && item.sectionId === sectionId)) {
    return {
      found: false,
      content: "",
      section: null,
      diagnostics: [...parsed.diagnostics, { code: "missing-content-ref", message: "卡片区块引用的 Markdown 内容不存在。", contentRef }]
    };
  }
  return { found: true, content: section.content, section, diagnostics: parsed.diagnostics };
}

export function replaceStoryCardContent(body: string, contentRef: string, content: string): string {
  const source = String(body ?? "");
  const parsed = parseStoryCardSections(source);
  assertNoDuplicateSections(parsed.diagnostics);
  if (contentRef === "markdown-body") {
    const firstAnchor = parsed.sections[0]?.anchorStart ?? source.length;
    return `${String(content ?? "")}${source.slice(firstAnchor)}`;
  }
  const sectionId = sectionIdFromContentRef(contentRef);
  const section = sectionId ? parsed.sections.find((candidate) => candidate.id === sectionId) : null;
  if (!section) throw new Error("Card content reference is missing from Markdown.");
  return `${source.slice(0, section.contentStart)}${String(content ?? "")}${source.slice(section.contentEnd)}`;
}

export function appendStoryCardSection(body: string, input: {
  id: string;
  kind: StoryCardSectionKind;
  heading?: string;
  content?: string;
}): string {
  const source = String(body ?? "");
  const id = requireStoryCardSectionId(input.id);
  if (!STORY_CARD_SECTION_KINDS.includes(input.kind)) throw new Error("Card section kind is invalid.");
  const parsed = parseStoryCardSections(source);
  assertNoDuplicateSections(parsed.diagnostics);
  if (parsed.sections.some((section) => section.id === id)) throw new Error("Card section identifier already exists.");
  if (parsed.sections.length >= MAX_SECTION_COUNT) throw new Error("Card section count is outside the allowed range.");
  const heading = String(input.heading || (input.kind === "secret" ? "秘密" : input.kind === "character-arc" ? "人物弧线" : "自定义正文")).normalize("NFC").trim();
  if (!heading || heading.length > 120 || /[\r\n]/u.test(heading)) throw new Error("Card section heading is invalid.");
  const separator = source.length === 0 || source.endsWith("\n\n") ? "" : source.endsWith("\n") ? "\n" : "\n\n";
  const content = String(input.content ?? "");
  return `${source}${separator}<!-- world-os:section id="${id}" kind="${input.kind}" -->\n## ${heading}\n\n${content}`;
}

export function nextStoryCardSectionId(body: string, kind: StoryCardSectionKind): string {
  const existing = new Set(parseStoryCardSections(body).sections.map((section) => section.id));
  for (let index = 1; index <= MAX_SECTION_COUNT; index += 1) {
    const id = `${kind}-${String(index).padStart(2, "0")}`;
    if (!existing.has(id)) return id;
  }
  throw new Error("Could not create a card section identifier.");
}

export function listUnplacedStoryCardSections(body: string, contentRefs: string[]): StoryCardSection[] {
  const placed = new Set(contentRefs.map(sectionIdFromContentRef).filter((value): value is string => Boolean(value)));
  return parseStoryCardSections(body).sections.filter((section) => !placed.has(section.id));
}

export function stripStoryCardSectionsByKind(body: string, kind: StoryCardSectionKind): string {
  const source = String(body ?? "");
  const sections = parseStoryCardSections(source).sections.filter((section) => section.kind === kind).reverse();
  return sections.reduce((current, section) => `${current.slice(0, section.anchorStart)}${current.slice(section.contentEnd)}`, source);
}

function assertNoDuplicateSections(diagnostics: StoryCardSectionDiagnostic[]): void {
  if (diagnostics.some((item) => item.code === "duplicate-section-id")) {
    throw new Error("Duplicate card section identifiers must be repaired before writing.");
  }
}
