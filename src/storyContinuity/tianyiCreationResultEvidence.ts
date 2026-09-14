export interface TianyiCreationIdeaEvidence {
  title: string;
  body: string;
  bodyCharacterCount: number;
  hasConcreteConflict: boolean;
}

export interface TianyiCreationResultEvidence {
  recognitionSource: "rendered-list" | "rendered-headings" | "markdown-list" | "markdown-headings";
  characterCountMethod: string;
  ideas: TianyiCreationIdeaEvidence[];
}

export const TIAN_YI_BODY_CHARACTER_COUNT_METHOD = "Unicode code points after removing the title, list marker, Markdown format markers, whitespace, punctuation, symbols, and format characters";

export function countTianyiCreationBodyCharacters(value: string): number {
  return [...stripInlineMarkdown(value).normalize("NFC").replace(/[\p{White_Space}\p{P}\p{S}\p{Cf}]/gu, "")].length;
}

export function recognizeTianyiCreationIdeas(input: {
  renderedListItems?: string[];
  renderedHeadingBlocks?: Array<{ title: string; body: string }>;
  markdown?: string;
}): TianyiCreationResultEvidence | null {
  const renderedList = normalizeListItems(input.renderedListItems || []);
  if (renderedList.length > 0) return result("rendered-list", renderedList);
  const renderedHeadings = normalizeHeadingBlocks(input.renderedHeadingBlocks || []);
  if (renderedHeadings.length > 0) return result("rendered-headings", renderedHeadings);
  const markdownList = parseMarkdownList(input.markdown || "");
  if (markdownList.length > 0) return result("markdown-list", markdownList);
  const markdownHeadings = parseMarkdownHeadings(input.markdown || "");
  if (markdownHeadings.length > 0) return result("markdown-headings", markdownHeadings);
  return null;
}

function result(recognitionSource: TianyiCreationResultEvidence["recognitionSource"], ideas: Array<{ title: string; body: string }>): TianyiCreationResultEvidence {
  return { recognitionSource, characterCountMethod: TIAN_YI_BODY_CHARACTER_COUNT_METHOD, ideas: ideas.map(({ title, body }) => ({ title, body, bodyCharacterCount: countTianyiCreationBodyCharacters(body), hasConcreteConflict: /冲突|两难|必须|不得不|否则|却|拒绝|阻止|阻拦|封锁|争夺|对峙|僵持|威胁/u.test(body) })) };
}

function normalizeListItems(items: string[]): Array<{ title: string; body: string }> {
  return items.map((item) => splitTitleAndBody(item)).filter(isComplete);
}

function normalizeHeadingBlocks(items: Array<{ title: string; body: string }>): Array<{ title: string; body: string }> {
  return items.map(({ title, body }) => ({ title: cleanTitle(title), body: cleanBody(body) })).filter(isComplete);
}

function parseMarkdownList(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const entries: string[] = [];
  let current = "";
  for (const line of lines) {
    const marker = line.match(/^\s*(?:\d+[.)、]|[一二三四五六七八九十]+[、.)])\s+(.+)$/u);
    if (marker) {
      if (current.trim()) entries.push(current.trim());
      current = marker[1] || "";
    } else if (current && line.trim()) current += `\n${line.trim()}`;
  }
  if (current.trim()) entries.push(current.trim());
  return normalizeListItems(entries);
}

function parseMarkdownHeadings(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const entries: Array<{ title: string; body: string }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = line.match(/^\s*#{1,4}\s+(.+?)\s*$/u);
    if (heading) {
      if (current) entries.push({ title: current.title, body: current.body.join("\n") });
      current = { title: heading[1] || "", body: [] };
    } else if (current && line.trim()) current.body.push(line.trim());
  }
  if (current) entries.push({ title: current.title, body: current.body.join("\n") });
  return normalizeHeadingBlocks(entries);
}

function splitTitleAndBody(value: string): { title: string; body: string } {
  const normalized = value.trim();
  const separator = normalized.match(/^\s*(?:\*{1,2}|_{1,2})?(?:《([^》\n]+)》|([^：:\n]+?))(?:\*{1,2}|_{1,2})?\s*[：:]\s*([\s\S]+)$/u);
  if (separator) return { title: cleanTitle(separator[1] || separator[2] || ""), body: cleanBody(separator[3] || "") };
  const [firstLine = "", ...rest] = normalized.split("\n");
  return { title: cleanTitle(firstLine), body: cleanBody(rest.join("\n")) };
}

function cleanTitle(value: string): string {
  return stripInlineMarkdown(value).replace(/^构想\s*[一二三四五六七八九十\d]*\s*[：:]?\s*/u, "").trim();
}

function cleanBody(value: string): string {
  return value.replace(/^\s*[-*+]\s+/gmu, "").trim();
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/[`*_~]/gu, "").replace(/\[([^\]]+)\]\([^\)]+\)/gu, "$1");
}

function isComplete(entry: { title: string; body: string }): boolean {
  return Boolean(entry.title && entry.body);
}
