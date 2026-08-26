export type FountainTokenType = "scene-heading" | "character" | "parenthetical" | "dialogue" | "transition" | "action" | "blank";

export type FountainToken = {
  type: FountainTokenType;
  text: string;
  start: number;
  end: number;
  sceneNumber: string | null;
};

export type FountainScene = {
  id: string;
  title: string;
  sceneNumber: string | null;
  start: number;
  end: number;
};

export type FountainDocument = {
  version: "story-studio-fountain-r0/v1";
  source: string;
  tokens: FountainToken[];
  scenes: FountainScene[];
  unsupported: string[];
};

const SCENE_HEADING = /^(?:\.(?=\S)|(?:INT|EXT|INT\/EXT|I\/E|EST)\.?\b)/iu;
const SCENE_NUMBER = /\s+#([^#\n]+)#\s*$/u;
const TRANSITION = /(?:TO:|^>[^<]*$)/u;
const CHARACTER = /^(?:[\p{Lu}\p{N}][\p{Lu}\p{N} ._'’()\-]{1,48}|[\p{Script=Han}]{1,12})(?:\^)?$/u;

/** Parses a deliberately bounded Fountain subset while retaining UTF-16 source offsets. */
export function parseFountain(source: string): FountainDocument {
  const lines = source.split(/(?<=\n)/u);
  const tokens: FountainToken[] = [];
  const unsupported = new Set<string>();
  let offset = 0;
  let dialogueOpen = false;
  for (const rawLine of lines) {
    const hasNewline = rawLine.endsWith("\n");
    const line = (hasNewline ? rawLine.slice(0, -1) : rawLine).replace(/\r$/u, "");
    const trimmed = line.trim();
    const start = offset;
    const end = offset + line.length;
    offset += rawLine.length;
    if (!trimmed) {
      tokens.push({ type: "blank", text: "", start, end, sceneNumber: null });
      dialogueOpen = false;
      continue;
    }
    if (/^(?:Title|Credit|Author|Source|Draft date|Contact):/iu.test(trimmed)) unsupported.add("title-page");
    if (/^\[\[/u.test(trimmed)) unsupported.add("notes");
    if (/^#{1,6}\s/u.test(trimmed)) unsupported.add("sections");
    if (/^=/u.test(trimmed)) unsupported.add("synopsis-or-page-break");
    if (/^~/u.test(trimmed)) unsupported.add("lyrics");
    if (/\^$/u.test(trimmed)) unsupported.add("dual-dialogue");
    if (SCENE_HEADING.test(trimmed)) {
      const number = trimmed.match(SCENE_NUMBER)?.[1]?.trim() || null;
      const title = trimmed.replace(SCENE_NUMBER, "").replace(/^\./u, "").trim();
      tokens.push({ type: "scene-heading", text: title, start, end, sceneNumber: number });
      dialogueOpen = false;
      continue;
    }
    if (TRANSITION.test(trimmed)) {
      tokens.push({ type: "transition", text: trimmed.replace(/^>/u, "").trim(), start, end, sceneNumber: null });
      dialogueOpen = false;
      continue;
    }
    if (CHARACTER.test(trimmed) && !/[.!?。！？]$/u.test(trimmed)) {
      tokens.push({ type: "character", text: trimmed.replace(/\^$/u, ""), start, end, sceneNumber: null });
      dialogueOpen = true;
      continue;
    }
    if (dialogueOpen && /^(?:\(.+\)|（.+）)$/u.test(trimmed)) {
      tokens.push({ type: "parenthetical", text: trimmed, start, end, sceneNumber: null });
      continue;
    }
    if (dialogueOpen) {
      tokens.push({ type: "dialogue", text: line.trim(), start, end, sceneNumber: null });
      continue;
    }
    tokens.push({ type: "action", text: line, start, end, sceneNumber: null });
  }
  const sceneTokens = tokens.filter((token) => token.type === "scene-heading");
  const scenes = sceneTokens.map((token, index) => ({
    id: `scene.${token.start}`,
    title: token.text,
    sceneNumber: token.sceneNumber,
    start: token.start,
    end: sceneTokens[index + 1]?.start ?? source.length
  }));
  return { version: "story-studio-fountain-r0/v1", source, tokens, scenes, unsupported: [...unsupported].sort() };
}

export function fountainRoundTrip(source: string): string {
  return parseFountain(source).source;
}
