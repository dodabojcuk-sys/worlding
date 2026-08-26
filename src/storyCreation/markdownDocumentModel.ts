export type MarkdownOutlineItem = {
  id: string;
  depth: number;
  title: string;
  start: number;
  end: number;
};

const HEADING = /^(#{1,6})[ \t]+(.+?)\s*$/gmu;

export function markdownOutline(source: string): MarkdownOutlineItem[] {
  const matches = [...source.matchAll(HEADING)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const depth = match[1].length;
    const next = matches.slice(index + 1).find((candidate) => candidate[1].length <= depth);
    return {
      id: `heading.${start}.${depth}`,
      depth,
      title: match[2].trim(),
      start,
      end: next?.index ?? source.length
    };
  });
}

export function markdownWordCount(source: string): { characters: number; words: number } {
  const visible = source.normalize("NFC").replace(/^#{1,6}[ \t]+/gmu, "").replace(/[`*_>\[\]()!-]/gu, " ");
  const characters = [...visible].filter((character) => !/\s/u.test(character)).length;
  const latinWords = visible.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  return { characters, words: latinWords.length };
}

export function renameMarkdownHeading(source: string, itemId: string, title: string): string {
  const item = requireOutlineItem(source, itemId);
  const lineEnd = source.indexOf("\n", item.start);
  const end = lineEnd < 0 ? source.length : lineEnd;
  return `${source.slice(0, item.start)}${"#".repeat(item.depth)} ${title.normalize("NFC").trim()}${source.slice(end)}`;
}

export function removeMarkdownSection(source: string, itemId: string): string {
  const item = requireOutlineItem(source, itemId);
  const next = `${source.slice(0, item.start)}${source.slice(item.end)}`;
  return next.replace(/\n{3,}/gu, "\n\n").trimEnd();
}

export function reorderMarkdownSection(source: string, itemId: string, beforeItemId: string | null): string {
  const item = requireOutlineItem(source, itemId);
  const segment = source.slice(item.start, item.end);
  const without = `${source.slice(0, item.start)}${source.slice(item.end)}`;
  if (beforeItemId === null) return `${without.trimEnd()}\n\n${segment.trim()}\n`;
  const target = requireOutlineItem(without, remapItemId(source, without, beforeItemId, item));
  return `${without.slice(0, target.start)}${segment.trimEnd()}\n\n${without.slice(target.start)}`;
}

export function appendMarkdownHeading(source: string, depth: number, title: string): string {
  const normalizedDepth = Math.min(6, Math.max(1, Math.round(depth)));
  return `${source.trimEnd()}${source.trim() ? "\n\n" : ""}${"#".repeat(normalizedDepth)} ${title.normalize("NFC").trim()}\n\n`;
}

export function markdownHeadingAtOffset(source: string, offset: number): MarkdownOutlineItem | null {
  return markdownOutline(source).filter((item) => item.start <= offset && offset <= item.end).sort((left, right) => right.depth - left.depth || right.start - left.start)[0] ?? null;
}

function requireOutlineItem(source: string, itemId: string): MarkdownOutlineItem {
  const item = markdownOutline(source).find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("Markdown heading no longer exists.");
  return item;
}

function remapItemId(original: string, without: string, itemId: string, removed: MarkdownOutlineItem): string {
  const target = requireOutlineItem(original, itemId);
  if (target.start >= removed.start && target.start < removed.end) throw new Error("A section cannot be moved inside itself.");
  const nextStart = target.start > removed.start ? target.start - (removed.end - removed.start) : target.start;
  return markdownOutline(without).find((candidate) => candidate.start === nextStart && candidate.depth === target.depth)?.id ?? itemId;
}
