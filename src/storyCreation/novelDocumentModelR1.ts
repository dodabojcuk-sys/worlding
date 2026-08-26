export const NOVEL_DOCUMENT_MODEL_R1_VERSION = "tianyan-novel-document-model/r1" as const;
export const NOVEL_DOCUMENT_AUTHORITY_R1 = "document-model-r1" as const;
export const NOVEL_MIGRATION_RECEIPT_R1_VERSION = "tianyan-novel-migration/r1" as const;

export type NovelBlockKind = "volume" | "chapter" | "scene" | "paragraph";
export type NovelObjectType = "character" | "location" | "event";
export type NovelDocumentRevisionSource = "create" | "edit" | "migration" | "restore" | "proposal";

export type NovelObjectReference = {
  id: string;
  type: NovelObjectType;
  label: string;
  revision: string | null;
  provenance: { sourceKind: "world-object"; sourceId: string };
};

export type NovelInline =
  | { kind: "text"; text: string }
  | { kind: "object-ref"; ref: NovelObjectReference };

export type NovelBlock = {
  id: string;
  kind: NovelBlockKind;
  parentId: string | null;
  title?: string;
  inlines: NovelInline[];
  childIds: string[];
};

export type NovelDocumentRevision = {
  id: string;
  sequence: number;
  baseRevisionId: string | null;
  source: NovelDocumentRevisionSource;
  createdAt: string;
};

export type NovelDocumentProvenance = {
  sourceArtifactId: string | null;
  sourceArtifactVersion: string | null;
  importedFrom: "native" | "markdown" | "legacy" | "fixture";
  migrationVersion: string | null;
  sourceContentHash: string | null;
};

export type NovelDocumentModelR1 = {
  version: typeof NOVEL_DOCUMENT_MODEL_R1_VERSION;
  documentId: string;
  title: string;
  rootIds: string[];
  blocks: Record<string, NovelBlock>;
  revision: NovelDocumentRevision;
  provenance: NovelDocumentProvenance;
};

export type NovelMigrationReceiptR1 = {
  version: typeof NOVEL_MIGRATION_RECEIPT_R1_VERSION;
  sourceArtifactVersion: string;
  sourceContentHash: string;
  parserVersion: typeof NOVEL_DOCUMENT_MODEL_R1_VERSION;
  confirmedAt: string;
  originalContentPreserved: true;
};

export type NovelReferenceResolver = ReadonlyMap<string, { type: NovelObjectType; label?: string; revision?: string | null }>; 

export const novelReferenceFixture: NovelObjectReference[] = [
  { id: "character.lin-hai", type: "character", label: "林海", revision: "fixture-v1", provenance: { sourceKind: "world-object", sourceId: "character.lin-hai" } },
  { id: "location.linwu-city", type: "location", label: "临武城", revision: "fixture-v1", provenance: { sourceKind: "world-object", sourceId: "location.linwu-city" } },
  { id: "event.bell-three", type: "event", label: "钟楼三响", revision: "fixture-v1", provenance: { sourceKind: "world-object", sourceId: "event.bell-three" } }
];

/** Creates a new, valid R1 document without touching OutputArtifact persistence. */
export function createEmptyNovelDocumentModelR1(documentId: string, title: string, createdAt: string, provenance: Partial<NovelDocumentProvenance> = {}): NovelDocumentModelR1 {
  const safeId = normalizeIdSegment(documentId);
  const volumeId = `${safeId}.volume.1`;
  const chapterId = `${safeId}.chapter.1`;
  const sceneId = `${safeId}.scene.1`;
  const paragraphId = `${safeId}.paragraph.1`;
  return validateNovelDocumentModelR1({
    version: NOVEL_DOCUMENT_MODEL_R1_VERSION,
    documentId,
    title,
    rootIds: [volumeId],
    blocks: {
      [volumeId]: block(volumeId, "volume", null, "卷一", [], [chapterId]),
      [chapterId]: block(chapterId, "chapter", volumeId, "第一章", [], [sceneId]),
      [sceneId]: block(sceneId, "scene", chapterId, "开场", [], [paragraphId]),
      [paragraphId]: block(paragraphId, "paragraph", sceneId, undefined, [text("")])
    },
    revision: { id: `${safeId}.revision.1`, sequence: 1, baseRevisionId: null, source: "create", createdAt },
    provenance: {
      sourceArtifactId: provenance.sourceArtifactId ?? null,
      sourceArtifactVersion: provenance.sourceArtifactVersion ?? null,
      importedFrom: provenance.importedFrom ?? "native",
      migrationVersion: provenance.migrationVersion ?? null,
      sourceContentHash: provenance.sourceContentHash ?? null
    }
  });
}

/** A real-length fixture used by unit tests and the browser review surface. */
export function createNovelDocumentModelR1Fixture(): NovelDocumentModelR1 {
  const createdAt = "2026-08-17T00:00:00.000Z";
  const blocks: Record<string, NovelBlock> = {
    "volume.mist": block("volume.mist", "volume", null, "卷一 · 雾落临武", [], ["chapter.rain", "chapter.bell"]),
    "chapter.rain": block("chapter.rain", "chapter", "volume.mist", "第一章 · 雨夜", [], ["scene.roof", "scene.gate"]),
    "scene.roof": block("scene.roof", "scene", "chapter.rain", "瓦檐", [], ["paragraph.roof.1", "paragraph.roof.2"]),
    "paragraph.roof.1": block("paragraph.roof.1", "paragraph", "scene.roof", undefined, [text("雨水沿着瓦檐一滴滴坠下，"), reference("character.lin-hai"), text("站在灯下，听见城门外的马蹄声。")]),
    "paragraph.roof.2": block("paragraph.roof.2", "paragraph", "scene.roof", undefined, [text("他没有回头，只把掌心按在旧信上。")]),
    "scene.gate": block("scene.gate", "scene", "chapter.rain", "城门", [], ["paragraph.gate.1"]),
    "paragraph.gate.1": block("paragraph.gate.1", "paragraph", "scene.gate", undefined, [text("雾从"), reference("location.linwu-city"), text("的河面漫上来，把远处的人影吞成一笔淡墨。")]),
    "chapter.bell": block("chapter.bell", "chapter", "volume.mist", "第二章 · 钟声", [], ["scene.tower"]),
    "scene.tower": block("scene.tower", "scene", "chapter.bell", "钟楼", [], ["paragraph.tower.1"]),
    "paragraph.tower.1": block("paragraph.tower.1", "paragraph", "scene.tower", undefined, [text("第三声钟响落下时，"), reference("event.bell-three"), text("像一枚迟到的判词，越过整座城。")])
  };
  return validateNovelDocumentModelR1({
    version: NOVEL_DOCUMENT_MODEL_R1_VERSION,
    documentId: "novel.r1.fixture.mist",
    title: "雾落临武",
    rootIds: ["volume.mist"],
    blocks,
    revision: { id: "novel.r1.fixture.mist.revision.1", sequence: 1, baseRevisionId: null, source: "create", createdAt },
    provenance: { sourceArtifactId: null, sourceArtifactVersion: null, importedFrom: "fixture", migrationVersion: null, sourceContentHash: null }
  });
}

export function blockText(block: NovelBlock): string {
  return block.inlines.map((inline) => inline.kind === "text" ? inline.text : `@${inline.ref.label}`).join("");
}

export function childBlocks(document: NovelDocumentModelR1, id: string | null): NovelBlock[] {
  const ids = id === null ? document.rootIds : document.blocks[id]?.childIds || [];
  return ids.map((childId) => document.blocks[childId]).filter((candidate): candidate is NovelBlock => Boolean(candidate));
}

export function modelUsesDocumentAuthority(value: unknown): value is NovelDocumentModelR1 {
  return Boolean(value && typeof value === "object" && (value as { version?: unknown }).version === NOVEL_DOCUMENT_MODEL_R1_VERSION);
}

export function validateNovelDocumentModelR1(value: unknown, options: { references?: NovelReferenceResolver } = {}): NovelDocumentModelR1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Novel DocumentModel must be an object.");
  const input = value as Record<string, unknown>;
  if (input.version !== NOVEL_DOCUMENT_MODEL_R1_VERSION) throw new Error("Novel DocumentModel version is unsupported.");
  const documentId = requireString(input.documentId, "Novel document identifier");
  const title = requireString(input.title, "Novel document title");
  const rootIds = requireIdList(input.rootIds, "Novel document roots");
  const rawBlocks = input.blocks;
  if (!rawBlocks || typeof rawBlocks !== "object" || Array.isArray(rawBlocks)) throw new Error("Novel document blocks are invalid.");
  const blocks: Record<string, NovelBlock> = {};
  const seenRoots = new Set<string>();
  for (const [key, raw] of Object.entries(rawBlocks as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Novel document block is invalid.");
    const item = raw as Record<string, unknown>;
    const id = requireString(item.id, "Novel block identifier");
    if (key !== id || blocks[id]) throw new Error("Novel document block IDs must be unique and keyed by ID.");
    const kind = requireBlockKind(item.kind);
    const parentId = item.parentId === null ? null : requireString(item.parentId, "Novel block parent");
    const childIds = requireIdList(item.childIds, "Novel block children");
    if (new Set(childIds).size !== childIds.length) throw new Error("Novel block child order contains duplicate IDs.");
    const inlines = requireInlines(item.inlines, options.references);
    const titleValue = item.title === undefined ? undefined : requireString(item.title, "Novel block title");
    if (kind === "paragraph" && childIds.length > 0) throw new Error("Novel paragraph blocks cannot have children.");
    if (kind !== "paragraph" && inlines.length > 0) throw new Error("Novel container blocks cannot have inline content.");
    blocks[id] = block(id, kind, parentId, titleValue, inlines, childIds);
  }
  for (const rootId of rootIds) {
    if (seenRoots.has(rootId)) throw new Error("Novel document root order contains duplicate IDs.");
    seenRoots.add(rootId);
    if (!blocks[rootId]) throw new Error("Novel document contains a missing root block.");
    if (blocks[rootId].parentId !== null) throw new Error("Novel root block parent is invalid.");
  }
  const visited = new Set<string>();
  const walk = (id: string, parentId: string | null) => {
    if (visited.has(id)) throw new Error("Novel document block graph contains a cycle or duplicate path.");
    const current = blocks[id];
    if (!current || current.parentId !== parentId) throw new Error("Novel document contains an orphan or mismatched parent.");
    visited.add(id);
    for (const childId of current.childIds) {
      const child = blocks[childId];
      if (!child) throw new Error("Novel document contains a missing child block.");
      if (!isAllowedNovelParent(current.kind, child.kind)) throw new Error("Novel block parent hierarchy is invalid.");
      walk(childId, id);
    }
  };
  rootIds.forEach((rootId) => walk(rootId, null));
  if (visited.size !== Object.keys(blocks).length) throw new Error("Novel document contains an orphan block.");
  const revision = requireRevision(input.revision);
  const provenance = requireProvenance(input.provenance);
  return { version: NOVEL_DOCUMENT_MODEL_R1_VERSION, documentId, title, rootIds: [...rootIds], blocks, revision, provenance };
}

export function replaceBlockText(document: NovelDocumentModelR1, blockId: string, value: string): NovelDocumentModelR1 {
  const target = document.blocks[blockId];
  if (!target || target.kind !== "paragraph") return document;
  return withBlock(document, { ...target, inlines: [text(value)] });
}

export function replaceBlockInlines(document: NovelDocumentModelR1, blockId: string, inlines: NovelInline[]): NovelDocumentModelR1 {
  const target = document.blocks[blockId];
  if (!target || target.kind !== "paragraph") return document;
  return withBlock(document, { ...target, inlines: cloneInlines(inlines) });
}

/** Applies a reviewed proposal while retaining known semantic references. */
export function replaceBlockTextPreservingReferences(document: NovelDocumentModelR1, blockId: string, value: string): NovelDocumentModelR1 {
  const target = document.blocks[blockId];
  if (!target || target.kind !== "paragraph") return document;
  const retained = target.inlines.filter((inline): inline is Extract<NovelInline, { kind: "object-ref" }> => inline.kind === "object-ref").map((inline) => inline.ref);
  const inlines: NovelInline[] = [];
  let remaining = value;
  while (remaining) {
    const next = retained.map((ref) => ({ ref, index: remaining.indexOf(`@${ref.label}`) })).filter((candidate) => candidate.index >= 0).sort((left, right) => left.index - right.index)[0];
    if (!next) { inlines.push(text(remaining)); break; }
    if (next.index > 0) inlines.push(text(remaining.slice(0, next.index)));
    inlines.push({ kind: "object-ref", ref: next.ref });
    remaining = remaining.slice(next.index + next.ref.label.length + 1);
  }
  return withBlock(document, { ...target, inlines: inlines.length ? inlines : [text("")] });
}

export function appendObjectReference(document: NovelDocumentModelR1, blockId: string, ref: NovelObjectReference): NovelDocumentModelR1 {
  const target = document.blocks[blockId];
  if (!target || target.kind !== "paragraph") return document;
  return withBlock(document, { ...target, inlines: [...target.inlines, { kind: "object-ref", ref: cloneReference(ref) }] });
}

export function moveSiblingBefore(document: NovelDocumentModelR1, movedId: string, targetId: string): NovelDocumentModelR1 {
  const moved = document.blocks[movedId];
  const target = document.blocks[targetId];
  if (!moved || !target || moved.id === target.id || moved.parentId !== target.parentId) return document;
  const parentId = moved.parentId;
  const siblings = parentId === null ? document.rootIds : document.blocks[parentId]?.childIds;
  if (!siblings) return document;
  const remaining = siblings.filter((id) => id !== movedId);
  const targetIndex = remaining.indexOf(targetId);
  if (targetIndex < 0) return document;
  const nextIds = [...remaining.slice(0, targetIndex), movedId, ...remaining.slice(targetIndex)];
  if (parentId === null) return { ...document, rootIds: nextIds };
  return withBlock(document, { ...document.blocks[parentId], childIds: nextIds });
}

/** Portable, deterministic projection for readers, export, and legacy recovery. */
export function serializeNovelDocumentModelToMarkdown(document: NovelDocumentModelR1): string {
  const validated = validateNovelDocumentModelR1(document);
  const lines = [`<!-- tianyan:novel-document version=${validated.version} id=${validated.documentId} revision=${validated.revision.id} -->`, ""];
  const visit = (id: string, depth: number) => {
    const current = validated.blocks[id];
    if (!current) return;
    lines.push(`<!-- tianyan:block id=${current.id} kind=${current.kind} -->`);
    if (current.kind === "paragraph") lines.push(serializeInlines(current.inlines), "");
    else lines.push(`${"#".repeat(Math.min(depth, 6))} ${current.title || "未命名"}`, "");
    current.childIds.forEach((childId) => visit(childId, depth + 1));
  };
  validated.rootIds.forEach((id) => visit(id, 1));
  return `${lines.join("\n").trimEnd()}\n`;
}

export function migrateMarkdownToNovelDocumentModelR1(source: string, input: { documentId: string; title: string; createdAt: string; sourceArtifactId?: string | null; sourceArtifactVersion?: string | null; sourceContentHash?: string | null; references?: NovelReferenceResolver }): NovelDocumentModelR1 {
  const chunks = source.replace(/\r\n?/gu, "\n").split(/\n{2,}/u).map((chunk) => chunk.trim()).filter(Boolean);
  const blocks: Record<string, NovelBlock> = {};
  const rootIds: string[] = [];
  const stack: Array<{ depth: number; id: string }> = [];
  let sequence = 0;
  const generatedId = (prefix: string) => {
    let candidate = `${prefix}.${++sequence}`;
    while (blocks[candidate]) candidate = `${prefix}.${++sequence}`;
    return candidate;
  };
  const ensureParagraphParent = () => {
    const current = stack.at(-1);
    if (current && current.depth === 3) return current.id;
    if (current && current.depth === 2) {
      const sceneId = generatedId("scene");
      blocks[sceneId] = block(sceneId, "scene", current.id, "场景", [], []);
      blocks[current.id].childIds.push(sceneId);
      stack.push({ depth: 3, id: sceneId });
      return sceneId;
    }
    if (current && current.depth === 1) {
      const chapterId = generatedId("chapter");
      const sceneId = generatedId("scene");
      blocks[chapterId] = block(chapterId, "chapter", current.id, "第一章", [], [sceneId]);
      blocks[sceneId] = block(sceneId, "scene", chapterId, "开场", [], []);
      blocks[current.id].childIds.push(chapterId);
      stack.push({ depth: 2, id: chapterId }, { depth: 3, id: sceneId });
      return sceneId;
    }
    if (!current) {
      const volumeId = generatedId("volume");
      const chapterId = generatedId("chapter");
      const sceneId = generatedId("scene");
      blocks[volumeId] = block(volumeId, "volume", null, "卷一", [], [chapterId]);
      blocks[chapterId] = block(chapterId, "chapter", volumeId, "第一章", [], [sceneId]);
      blocks[sceneId] = block(sceneId, "scene", chapterId, "开场", [], []);
      rootIds.push(volumeId);
      stack.push({ depth: 1, id: volumeId }, { depth: 2, id: chapterId }, { depth: 3, id: sceneId });
      return sceneId;
    }
    const sceneId = generatedId("scene");
    blocks[sceneId] = block(sceneId, "scene", current.id, "场景", [], []);
    blocks[current.id].childIds.push(sceneId);
    stack.push({ depth: 3, id: sceneId });
    return sceneId;
  };
  for (const chunk of chunks) {
    if (/^<!--\s*tianyan:novel-document\b/u.test(chunk)) continue;
    const identity = chunk.match(/^<!--\s*tianyan:block\s+id=([^\s]+)\s+kind=(volume|chapter|scene|paragraph)\s*-->\s*/u);
    const body = chunk.replace(/^<!--[^>]+-->\s*/u, "").trim();
    const heading = body.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) {
      const depth = Math.max(1, Math.min(3, heading[1].length));
      const kind: NovelBlockKind = depth === 1 ? "volume" : depth === 2 ? "chapter" : "scene";
      while (stack.length && stack.at(-1)!.depth >= depth) stack.pop();
      const parentId = stack.at(-1)?.id || null;
      const id = identity?.[1] || `${kind}.${++sequence}`;
      if (blocks[id]) throw new Error(`Migration contains duplicate block ID: ${id}`);
      blocks[id] = block(id, kind, parentId, heading[2].trim(), [], []);
      if (parentId) blocks[parentId].childIds.push(id); else rootIds.push(id);
      stack.push({ depth, id });
      continue;
    }
    const parentId = ensureParagraphParent();
    const id = identity?.[1] || `paragraph.${++sequence}`;
    if (blocks[id]) throw new Error(`Migration contains duplicate block ID: ${id}`);
    blocks[id] = block(id, "paragraph", parentId, undefined, parseInlineReferences(body, input.references), []);
    blocks[parentId].childIds.push(id);
  }
  if (!rootIds.length) ensureParagraphParent();
  return validateNovelDocumentModelR1({
    version: NOVEL_DOCUMENT_MODEL_R1_VERSION,
    documentId: input.documentId,
    title: input.title,
    rootIds,
    blocks,
    revision: { id: `${normalizeIdSegment(input.documentId)}.revision.1`, sequence: 1, baseRevisionId: null, source: "migration", createdAt: input.createdAt },
    provenance: { sourceArtifactId: input.sourceArtifactId ?? null, sourceArtifactVersion: input.sourceArtifactVersion ?? null, importedFrom: "legacy", migrationVersion: NOVEL_MIGRATION_RECEIPT_R1_VERSION, sourceContentHash: input.sourceContentHash ?? null }
  }, { references: input.references });
}

function parseInlineReferences(value: string, references?: NovelReferenceResolver): NovelInline[] {
  const result: NovelInline[] = [];
  const pattern = /\[([^\]]+)\]\(tianyan:\/\/object\/(character|location|event)\/([^\)]+)\)/gu;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(text(value.slice(cursor, index)));
    const id = match[3];
    const resolved = references?.get(id);
    if (references && !resolved) throw new Error(`Migration reference does not exist: ${id}`);
    if (resolved && resolved.type !== match[2]) throw new Error(`Migration reference type mismatch: ${id}`);
    result.push({ kind: "object-ref", ref: { id, type: match[2] as NovelObjectType, label: resolved?.label || match[1], revision: resolved?.revision ?? null, provenance: { sourceKind: "world-object", sourceId: id } } });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) result.push(text(value.slice(cursor)));
  return result.length ? result : [text(value)];
}

function requireInlines(value: unknown, references?: NovelReferenceResolver): NovelInline[] {
  if (!Array.isArray(value) || value.length > 2048) throw new Error("Novel block inlines are invalid.");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Novel inline is invalid.");
    const item = raw as Record<string, unknown>;
    if (item.kind === "text") return text(requireTextRun(item.text));
    if (item.kind !== "object-ref" || !item.ref || typeof item.ref !== "object" || Array.isArray(item.ref)) throw new Error("Novel object reference inline is invalid.");
    const ref = item.ref as Record<string, unknown>;
    const id = requireString(ref.id, "Novel reference ID");
    const type = requireObjectType(ref.type);
    const label = requireString(ref.label, "Novel reference label");
    const resolved = references?.get(id);
    if (references && !resolved) throw new Error(`Novel object reference does not exist: ${id}`);
    if (resolved && resolved.type !== type) throw new Error(`Novel object reference type mismatch: ${id}`);
    return { kind: "object-ref", ref: { id, type, label, revision: ref.revision === null || ref.revision === undefined ? resolved?.revision ?? null : requireString(ref.revision, "Novel reference revision"), provenance: { sourceKind: "world-object", sourceId: requireString((ref.provenance as Record<string, unknown> | undefined)?.sourceId || id, "Novel reference provenance") } } };
  });
}

function requireRevision(value: unknown): NovelDocumentRevision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Novel document revision is invalid.");
  const item = value as Record<string, unknown>;
  const source = item.source;
  if (!["create", "edit", "migration", "restore", "proposal"].includes(String(source))) throw new Error("Novel document revision source is invalid.");
  if (typeof item.sequence !== "number" || !Number.isSafeInteger(item.sequence) || item.sequence < 1) throw new Error("Novel document revision sequence is invalid.");
  return { id: requireString(item.id, "Novel document revision ID"), sequence: item.sequence, baseRevisionId: item.baseRevisionId === null ? null : requireString(item.baseRevisionId, "Novel document base revision"), source: source as NovelDocumentRevisionSource, createdAt: requireIsoDate(item.createdAt, "Novel document revision time") };
}

function requireProvenance(value: unknown): NovelDocumentProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Novel document provenance is invalid.");
  const item = value as Record<string, unknown>;
  const importedFrom = item.importedFrom;
  if (!["native", "markdown", "legacy", "fixture"].includes(String(importedFrom))) throw new Error("Novel document provenance source is invalid.");
  return { sourceArtifactId: item.sourceArtifactId === null ? null : requireString(item.sourceArtifactId, "Novel source artifact"), sourceArtifactVersion: item.sourceArtifactVersion === null ? null : requireString(item.sourceArtifactVersion, "Novel source artifact version"), importedFrom: importedFrom as NovelDocumentProvenance["importedFrom"], migrationVersion: item.migrationVersion === null ? null : requireString(item.migrationVersion, "Novel migration version"), sourceContentHash: item.sourceContentHash === null ? null : requireString(item.sourceContentHash, "Novel source content hash") };
}

function requireBlockKind(value: unknown): NovelBlockKind { if (value === "volume" || value === "chapter" || value === "scene" || value === "paragraph") return value; throw new Error("Novel block kind is invalid."); }
function requireObjectType(value: unknown): NovelObjectType { if (value === "character" || value === "location" || value === "event") return value; throw new Error("Novel object reference type is invalid."); }
function requireString(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid.`); return value; }
function requireTextRun(value: unknown): string { if (typeof value !== "string") throw new Error("Novel text run is invalid."); return value; }
function requireIdList(value: unknown, label: string): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${label} are invalid.`); return [...value]; }
function requireIsoDate(value: unknown, label: string): string { const result = requireString(value, label); if (Number.isNaN(Date.parse(result))) throw new Error(`${label} is invalid.`); return result; }
function normalizeIdSegment(value: string): string { return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "").slice(0, 100) || "novel"; }
function block(id: string, kind: NovelBlockKind, parentId: string | null, title: string | undefined, inlines: NovelInline[], childIds: string[] = []): NovelBlock { return { id, kind, parentId, ...(title ? { title } : {}), inlines, childIds }; }
function isAllowedNovelParent(parent: NovelBlockKind, child: NovelBlockKind): boolean {
  return (parent === "volume" && child === "chapter") || (parent === "chapter" && child === "scene") || (parent === "scene" && child === "paragraph");
}
function text(value: string): NovelInline { return { kind: "text", text: value }; }
function reference(id: string): NovelInline { const ref = novelReferenceFixture.find((candidate) => candidate.id === id); if (!ref) throw new Error(`Unknown novel reference ${id}`); return { kind: "object-ref", ref: cloneReference(ref) }; }
function serializeInlines(inlines: NovelInline[]): string { return inlines.map((inline) => inline.kind === "text" ? inline.text : `[${inline.ref.label}](tianyan://object/${inline.ref.type}/${inline.ref.id})`).join(""); }
function cloneReference(ref: NovelObjectReference): NovelObjectReference { return { ...ref, provenance: { ...ref.provenance } }; }
function cloneInlines(inlines: NovelInline[]): NovelInline[] { return inlines.map((inline) => inline.kind === "text" ? { ...inline } : { kind: "object-ref", ref: cloneReference(inline.ref) }); }
function withBlock(document: NovelDocumentModelR1, next: NovelBlock): NovelDocumentModelR1 {
  return validateNovelDocumentModelR1({ ...document, blocks: { ...document.blocks, [next.id]: next } });
}
export function withRevision(document: NovelDocumentModelR1, source: NovelDocumentRevisionSource, createdAt: string): NovelDocumentModelR1 { return validateNovelDocumentModelR1({ ...document, revision: { id: `${normalizeIdSegment(document.documentId)}.revision.${document.revision.sequence + 1}`, sequence: document.revision.sequence + 1, baseRevisionId: document.revision.id, source, createdAt } }); }
