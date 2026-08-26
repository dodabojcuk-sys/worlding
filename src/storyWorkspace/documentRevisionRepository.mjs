import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { replaceFileAtomically } from "../storyControlSurface/atomicNoReplaceFile.ts";
import { listWorkspaceNotes, openStoryWorkspace, parseStoryMarkdown } from "./storyWorkspaceRepository.mjs";
import { listVisualDocuments } from "./visualDocumentRepository.mjs";
import { parseStoryCardSections } from "../storyCardPresentation/storyCardSectionAnchors.ts";

const HISTORY_VERSION = "story-document-history/v1";
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_CHARS = 8_000;

export function recordDocumentRevision(rootPath, input) {
  const root = prepareRoot(rootPath);
  const ref = normalizeRef(input.ref);
  const source = requireSnapshot(input.source);
  const sourceHash = hash(source);
  const historyRoot = documentHistoryRoot(root, ref, { allowMissing: true });
  const manifest = readManifest(root, ref);
  const operationId = input.operationId == null ? null : requireText(input.operationId, "Revision operation", 180);
  const completedOperation = operationId ? manifest.revisions.find((revision) => revision.operationId === operationId) : null;
  if (completedOperation) {
    if (completedOperation.contentHash === sourceHash) return clone({ created: false, revision: completedOperation, history: projectHistory(manifest) });
  }
  const latest = manifest.revisions.at(-1) || null;
  if (latest?.contentHash === sourceHash) return clone({ created: false, revision: latest, history: projectHistory(manifest) });

  const sequence = manifest.nextSequence;
  const revision = {
    id: `revision.${String(sequence).padStart(6, "0")}`,
    sequence,
    contentHash: sourceHash,
    byteLength: Buffer.byteLength(source, "utf8"),
    source: requireRevisionSource(input.revisionSource),
    recordedAt: requireRecordedAt(input.recordedAt),
    restoredFromRevisionId: input.restoredFromRevisionId == null ? null : requireText(input.restoredFromRevisionId, "Restored revision", 80),
    operationId
  };
  mkdirSync(path.join(historyRoot, "revisions"), { recursive: true });
  writeAtomic(root, path.join(historyRoot, "revisions", `${revision.id}.snapshot`), source);
  const next = {
    ...manifest,
    nextSequence: sequence + 1,
    document: { ...ref, relativePath: requireRelativePath(input.relativePath) },
    revisions: [...manifest.revisions, revision]
  };
  writeManifest(root, historyRoot, next);
  return clone({ created: true, revision, history: projectHistory(next) });
}

export function listDocumentRevisions(rootPath, input) {
  const root = prepareRoot(rootPath);
  return clone(projectHistory(readManifest(root, normalizeRef(input.ref))));
}

export function createDocumentMilestone(rootPath, input) {
  const root = prepareRoot(rootPath);
  const ref = normalizeRef(input.ref);
  const historyRoot = documentHistoryRoot(root, ref, { allowMissing: false });
  const manifest = readManifest(root, ref);
  const revisionId = requireText(input.revisionId, "Milestone revision", 80);
  if (!manifest.revisions.some((revision) => revision.id === revisionId)) throw new Error("Milestone revision does not exist.");
  const title = requireText(input.title, "Milestone title", 80);
  const sequence = manifest.milestones.length + 1;
  const milestone = { id: `milestone.${String(sequence).padStart(4, "0")}`, title, revisionId, sequence };
  const next = { ...manifest, milestones: [...manifest.milestones, milestone] };
  writeManifest(root, historyRoot, next);
  return clone({ milestone, history: projectHistory(next) });
}

export function previewDocumentRevision(rootPath, input) {
  const root = prepareRoot(rootPath);
  const ref = normalizeRef(input.ref);
  const manifest = readManifest(root, ref);
  const revisionId = requireText(input.revisionId, "Revision", 80);
  const revision = manifest.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error("Revision does not exist.");
  const source = readSnapshot(root, ref, revisionId);
  const currentSource = typeof input.currentSource === "string" ? input.currentSource : "";
  const semanticChanges = ref.kind === "visual"
    ? summarizeVisualSemanticChanges(root, currentSource, source)
    : ref.kind === "object"
      ? summarizeMarkdownSemanticChanges(currentSource, source)
    : ref.kind === "card"
      ? summarizeCardSemanticChanges(currentSource, source)
      : ref.kind === "template"
        ? summarizeTemplateSemanticChanges(currentSource, source)
      : [];
  return clone({
    revision,
    milestoneTitles: manifest.milestones.filter((item) => item.revisionId === revisionId).map((item) => item.title),
    changedFromCurrent: currentSource ? hash(currentSource) !== revision.contentHash : true,
    summary: summarizeChange(currentSource, source, ref.kind),
    semanticChanges,
    preview: source.slice(0, MAX_PREVIEW_CHARS),
    previewTruncated: source.length > MAX_PREVIEW_CHARS
  });
}

export function readDocumentRevisionSnapshot(rootPath, input) {
  const root = prepareRoot(rootPath);
  return readSnapshot(root, normalizeRef(input.ref), requireText(input.revisionId, "Revision", 80));
}

function readManifest(root, ref) {
  const historyRoot = documentHistoryRoot(root, ref, { allowMissing: true });
  const manifestPath = path.join(historyRoot, "manifest.json");
  if (!existsSync(manifestPath)) return defaultManifest(ref);
  assertRegularFile(manifestPath, "History manifest");
  const value = JSON.parse(readFileSync(manifestPath, "utf8"));
  rejectDangerousKeys(value);
  if (value.version !== HISTORY_VERSION) throw new Error("Unsupported document history version.");
  const document = normalizeRef(value.document);
  if (document.kind !== ref.kind || document.id !== ref.id) throw new Error("History manifest document mismatch.");
  return {
    version: HISTORY_VERSION,
    document: { ...document, relativePath: value.document.relativePath ? requireRelativePath(value.document.relativePath) : null },
    nextSequence: requirePositiveInteger(value.nextSequence, "Next revision sequence"),
    revisions: Array.isArray(value.revisions) ? value.revisions.map(normalizeRevision) : [],
    milestones: Array.isArray(value.milestones) ? value.milestones.map(normalizeMilestone) : []
  };
}

function defaultManifest(ref) {
  return { version: HISTORY_VERSION, document: { ...ref, relativePath: null }, nextSequence: 1, revisions: [], milestones: [] };
}

function projectHistory(manifest) {
  return {
    version: HISTORY_VERSION,
    document: { kind: manifest.document.kind, id: manifest.document.id },
    revisions: [...manifest.revisions].reverse(),
    milestones: [...manifest.milestones].reverse()
  };
}

function normalizeRevision(value) {
  return {
    id: requireText(value?.id, "Revision id", 80),
    sequence: requirePositiveInteger(value?.sequence, "Revision sequence"),
    contentHash: requireHash(value?.contentHash),
    byteLength: requireNonNegativeInteger(value?.byteLength, "Revision size"),
    source: requireRevisionSource(value?.source),
    recordedAt: requireRecordedAt(value?.recordedAt),
    restoredFromRevisionId: value?.restoredFromRevisionId == null ? null : requireText(value.restoredFromRevisionId, "Restored revision", 80),
    operationId: value?.operationId == null ? null : requireText(value.operationId, "Revision operation", 180)
  };
}

function normalizeMilestone(value) {
  return {
    id: requireText(value?.id, "Milestone id", 80),
    title: requireText(value?.title, "Milestone title", 80),
    revisionId: requireText(value?.revisionId, "Milestone revision", 80),
    sequence: requirePositiveInteger(value?.sequence, "Milestone sequence")
  };
}

function readSnapshot(root, ref, revisionId) {
  const manifest = readManifest(root, ref);
  if (!manifest.revisions.some((revision) => revision.id === revisionId)) throw new Error("Revision does not exist.");
  const snapshotPath = path.join(documentHistoryRoot(root, ref, { allowMissing: false }), "revisions", `${revisionId}.snapshot`);
  assertRegularFile(snapshotPath, "Revision snapshot");
  const source = readFileSync(snapshotPath, "utf8");
  if (Buffer.byteLength(source, "utf8") > MAX_SNAPSHOT_BYTES) throw new Error("Revision snapshot is too large.");
  return source;
}

function documentHistoryRoot(root, ref, options) {
  const key = `${safeSegment(ref.kind)}-${safeSegment(ref.id).slice(0, 80)}-${hash(`${ref.kind}:${ref.id}`).slice(0, 10)}`;
  const relativePath = `history/documents/${key}`;
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("History path escapes the project.");
  let cursor = target;
  while (!existsSync(cursor)) {
    if (!options.allowMissing) throw new Error("Document history does not exist.");
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("History path is invalid.");
    cursor = parent;
  }
  if (lstatSync(cursor).isSymbolicLink()) throw new Error("History path cannot contain a symlink.");
  const real = realpathSync(cursor);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new Error("History path escapes the project.");
  return target;
}

function writeManifest(root, historyRoot, manifest) {
  mkdirSync(historyRoot, { recursive: true });
  writeAtomic(root, path.join(historyRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeAtomic(root, target, source) {
  replaceFileAtomically({ rootPath: root, targetPath: target, content: source });
}

function assertRegularFile(target, label) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isFile()) throw new Error(`${label} is invalid.`);
}

function prepareRoot(rootPath) {
  return realpathSync(openStoryWorkspace(rootPath).rootPath);
}

function normalizeRef(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Document reference is invalid.");
  const kind = value.kind === "object" || value.kind === "visual" || value.kind === "card" || value.kind === "template" || value.kind === "artifact" ? value.kind : null;
  if (!kind) throw new Error("Document reference kind is invalid.");
  return { kind, id: requireText(value.id, "Document id", 180) };
}

function requireSnapshot(value) {
  if (typeof value !== "string") throw new Error("Revision source must be text.");
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes === 0 || bytes > MAX_SNAPSHOT_BYTES) throw new Error("Revision source is outside the allowed size.");
  return value.replace(/\r\n/gu, "\n");
}

function requireRevisionSource(value) {
  if (!["create", "save", "restore", "external-baseline"].includes(value)) throw new Error("Revision source is invalid.");
  return value;
}

function requireRecordedAt(value) {
  const text = requireText(value, "Revision time", 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(text)) throw new Error("Revision time is invalid.");
  return text;
}

function requireRelativePath(value) {
  const text = requireText(value, "Canonical document path", 320).replaceAll("\\", "/");
  if (text.startsWith("/") || text.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Canonical document path is invalid.");
  return text;
}

function requireHash(value) {
  const text = String(value || "");
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error("Revision hash is invalid.");
  return text;
}

function requireText(value, label, maxLength) {
  const text = String(value || "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} is invalid.`);
  return number;
}

function requireNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} is invalid.`);
  return number;
}

function safeSegment(value) {
  return String(value).normalize("NFC").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/gu, "-") || "document";
}

function summarizeChange(currentSource, revisionSource, kind) {
  if (!currentSource) return kind === "object" ? "这是此文档最早保存的内容。" : kind === "artifact" ? "这是此创作成品最早保存的内容。" : kind === "card" ? "这是此卡片最早保存的构成。" : kind === "template" ? "这是此本地模板最早保存的结构。" : "这是此视觉文档最早保存的布局。";
  const currentLines = currentSource.split("\n");
  const revisionLines = revisionSource.split("\n");
  const changedLines = Math.abs(currentLines.length - revisionLines.length) + revisionLines.filter((line, index) => line !== currentLines[index]).length;
  return kind === "object" ? `与当前卡片内容相比约有 ${changedLines} 行变化。` : kind === "artifact" ? `与当前创作成品相比约有 ${changedLines} 行变化。` : kind === "card" ? `与当前卡片构成相比约有 ${changedLines} 行结构变化。` : kind === "template" ? `与当前本地模板相比约有 ${changedLines} 行结构变化。` : `与当前视觉文档相比约有 ${changedLines} 行结构变化。`;
}

function summarizeTemplateSemanticChanges(currentSource, revisionSource) {
  const before = parseTemplateRevision(currentSource);
  const after = parseTemplateRevision(revisionSource);
  if (!after) return [];
  const changes = [];
  if (before?.label && before.label !== after.label) changes.push({ kind: "label", label: "模板名称", detail: `${before.label} → ${after.label}` });
  compareTemplateKeys(changes, "section", "内容槽位", before?.sections || [], after.sections, "slot");
  compareTemplateKeys(changes, "property", "属性定义", before?.propertyDefinitions || [], after.propertyDefinitions, "key");
  compareTemplateKeys(changes, "block", "卡片区块", before?.blocks || [], after.blocks, "slot");
  if (before && JSON.stringify(before.visualDefaults) !== JSON.stringify(after.visualDefaults)) changes.push({ kind: "visual", label: "视觉默认值", detail: "方向、密度或图像槽位已调整" });
  return changes.slice(0, 40);
}

function parseTemplateRevision(source) {
  if (!source) return null;
  try {
    const value = JSON.parse(source);
    return value?.version === "story-card-template/v1" && Array.isArray(value.sections) && Array.isArray(value.propertyDefinitions) && Array.isArray(value.blocks) ? value : null;
  } catch {
    return null;
  }
}

function compareTemplateKeys(changes, kind, label, before, after, key) {
  const previous = new Set(before.map((item) => item?.[key]).filter(Boolean));
  const next = new Set(after.map((item) => item?.[key]).filter(Boolean));
  for (const value of next) if (!previous.has(value)) changes.push({ kind, label: `新增${label}`, detail: String(value) });
  for (const value of previous) if (!next.has(value)) changes.push({ kind, label: `移除${label}`, detail: String(value) });
}

function summarizeCardSemanticChanges(currentSource, revisionSource) {
  const current = parseCardRevision(currentSource);
  const revision = parseCardRevision(revisionSource);
  if (!revision) return [];
  const before = current || { layout: null, portrait: null, cover: null, blocks: [] };
  const changes = [];
  if (before.layout && before.layout !== revision.layout) changes.push({ kind: "layout", label: "卡片方向", detail: `${cardLayoutLabel(before.layout)} → ${cardLayoutLabel(revision.layout)}` });
  if (assetRefOf(before.portrait) !== assetRefOf(revision.portrait)) changes.push({ kind: "portrait", label: "人物肖像", detail: assetChangeLabel(before.portrait, revision.portrait) });
  if (assetRefOf(before.cover) !== assetRefOf(revision.cover)) changes.push({ kind: "cover", label: "卡片封面", detail: assetChangeLabel(before.cover, revision.cover) });
  const beforeById = new Map(before.blocks.map((block) => [block.id, block]));
  const afterById = new Map(revision.blocks.map((block) => [block.id, block]));
  for (const block of revision.blocks) {
    const previous = beforeById.get(block.id);
    const label = cardBlockLabel(block.kind);
    if (!previous) changes.push({ kind: "block", label: `新增${label}区块`, detail: block.kind === "secret" ? "内容仍保存在人物 Markdown" : "加入卡片构成" });
    else {
      if (previous.collapsed !== block.collapsed) changes.push({ kind: "collapse", label: `${block.collapsed ? "收起" : "展开"}${label}区块`, detail: "显示状态已调整" });
      if (previous.size !== block.size) changes.push({ kind: "size", label: `调整${label}区块`, detail: `${cardSizeLabel(previous.size)} → ${cardSizeLabel(block.size)}` });
      if (block.kind === "relation-group" && (previous.label !== block.label || JSON.stringify(previous.relationConfig) !== JSON.stringify(block.relationConfig))) changes.push({ kind: "projection", label: "修改关系组", detail: "分组名称或已确认关系投影范围已调整" });
    }
  }
  for (const block of before.blocks) if (!afterById.has(block.id)) changes.push({ kind: "block", label: `移除${cardBlockLabel(block.kind)}区块`, detail: "Markdown 内容未删除" });
  const beforeOrder = before.blocks.map((block) => block.id).filter((id) => afterById.has(id));
  const afterOrder = revision.blocks.map((block) => block.id).filter((id) => beforeById.has(id));
  if (beforeOrder.join("|") !== afterOrder.join("|")) changes.push({ kind: "order", label: "调整区块顺序", detail: "稳定区块身份保持不变" });
  return changes.slice(0, 40);
}

function summarizeMarkdownSemanticChanges(currentSource, revisionSource) {
  const before = parseMarkdownRevision(currentSource);
  const after = parseMarkdownRevision(revisionSource);
  if (!after) return [];
  const changes = [];
  if (!before || before.frontmatter.title !== after.frontmatter.title) changes.push({ kind: "identity", label: "人物身份", detail: "标题已调整" });
  if (!before || before.frontmatter.status !== after.frontmatter.status) changes.push({ kind: "status", label: "人物状态", detail: "状态已调整" });
  if (!before || JSON.stringify(before.frontmatter.aliases || []) !== JSON.stringify(after.frontmatter.aliases || [])) changes.push({ kind: "aliases", label: "人物别名", detail: "别名列表已调整" });
  const beforeProperties = before ? characterPropertyKeys(before.frontmatter) : [];
  const afterProperties = characterPropertyKeys(after.frontmatter);
  if (beforeProperties.join("|") !== afterProperties.join("|")) changes.push({ kind: "property", label: "类型化属性", detail: `属性定义 ${beforeProperties.length} → ${afterProperties.length}` });
  const beforeSections = before ? parseStoryCardSections(before.body).sections : [];
  const afterSections = parseStoryCardSections(after.body).sections;
  for (const kind of ["text", "secret", "character-arc"]) {
    const previous = beforeSections.filter((section) => section.kind === kind).length;
    const next = afterSections.filter((section) => section.kind === kind).length;
    if (previous !== next) changes.push({ kind: "section", label: `${markdownSectionLabel(kind)}段落`, detail: `结构 ${previous} → ${next}` });
  }
  if (!before || before.body !== after.body) changes.push({ kind: "prose", label: "人物正文", detail: "Markdown 内容已调整；秘密文字未在摘要中显示" });
  return changes.slice(0, 40);
}

function parseMarkdownRevision(source) {
  if (!source) return null;
  try {
    const value = parseStoryMarkdown(source);
    return { frontmatter: value.frontmatter || {}, body: String(value.body || "") };
  } catch {
    return null;
  }
}

function characterPropertyKeys(frontmatter) {
  return [...new Set(Object.keys(frontmatter).flatMap((key) => {
    const match = key.match(/^character_property_([a-z][a-z0-9-]{0,31})_(?:type|label|options|value)$/u);
    return match ? [match[1]] : [];
  }))].sort();
}

function markdownSectionLabel(kind) {
  return kind === "secret" ? "秘密" : kind === "character-arc" ? "人物弧线" : "正文";
}

function parseCardRevision(source) {
  if (!source) return null;
  try {
    const value = JSON.parse(source);
    if (value?.version !== "story-card-presentation/v2" || !Array.isArray(value.blocks)) return null;
    return { layout: value.layout, portrait: value.portrait, cover: value.cover, blocks: value.blocks };
  } catch {
    return null;
  }
}

function cardBlockLabel(kind) {
  return ({ text: "正文", secret: "秘密", "character-arc": "人物弧线", "property-group": "属性组", "relation-group": "关系组", properties: "属性", connections: "关系", media: "媒体", map: "地图", graph: "图谱", timeline: "时间线", tree: "关系树", canvas: "画布" })[kind] || "内容";
}

function cardLayoutLabel(value) {
  return value === "vertical" ? "纵向" : "横向";
}

function cardSizeLabel(value) {
  return ({ small: "紧凑", medium: "标准", large: "宽幅" })[value] || "默认";
}

function assetRefOf(value) {
  return value && typeof value.assetRef === "string" ? value.assetRef : "";
}

function assetChangeLabel(before, after) {
  return !before && after ? "已添加" : before && !after ? "已移除" : "本地资源引用已更换";
}

function summarizeVisualSemanticChanges(root, currentSource, revisionSource) {
  const current = parseVisualRevision(currentSource);
  const revision = parseVisualRevision(revisionSource);
  if (!revision) return [];
  const context = buildSemanticContext(root);
  if (revision.type === "graph") return summarizeGraphSemanticChanges(current?.type === "graph" ? current.content : emptyGraphContent(), revision.content, context);
  if (revision.type === "tree") return summarizeTreeSemanticChanges(current?.type === "tree" ? current.content : emptyTreeContent(), revision.content, context);
  if (revision.type === "timeline") return summarizeTimelineSemanticChanges(current?.type === "timeline" ? current.content : emptyTimelineContent(), revision.content, context);
  if (revision.type !== "map") return [];
  const before = current?.type === "map" ? current.content : emptyMapContent();
  const after = revision.content;
  const changes = [];
  compareById(changes, "背景", before.backgrounds, after.backgrounds, describeBackgroundChange);
  compareById(changes, "图层", before.layers, after.layers, describeLayerChange);
  compareById(changes, "标记", before.markers, after.markers, describeMarkerChange);
  compareById(changes, "区域", before.regions, after.regions, describeRegionChange);
  compareById(changes, "文字", before.labels, after.labels, describeLabelChange);
  if (before.activeBackgroundId !== after.activeBackgroundId) changes.unshift({ kind: "background", label: "当前背景", detail: `${before.activeBackgroundId || "无"} → ${after.activeBackgroundId || "无"}` });
  if (before.layers.map((item) => item.id).join("|") !== after.layers.map((item) => item.id).join("|")) changes.push({ kind: "layer", label: "图层顺序", detail: "叠放顺序不同" });
  return changes.slice(0, 40);
}

function parseVisualRevision(source) {
  if (!source) return null;
  try {
    const value = JSON.parse(source);
    if (!value || !value.content) return null;
    const content = value.content;
    if (value.type === "graph") return {
      type: "graph",
      content: {
        nodes: Array.isArray(content.nodes) ? content.nodes : [],
        edges: Array.isArray(content.edges) ? content.edges : [],
        proposals: Array.isArray(content.proposals) ? content.proposals : [],
        filters: content.filters && typeof content.filters === "object" ? content.filters : { objectTypes: [] }
      }
    };
    if (value.type === "tree") return {
      type: "tree",
      content: {
        sourceGraphPath: String(content.sourceGraphPath || ""),
        includedEdgeIds: Array.isArray(content.includedEdgeIds) ? content.includedEdgeIds : [],
        rootObjectIds: Array.isArray(content.rootObjectIds) ? content.rootObjectIds : [],
        collapsedObjectIds: Array.isArray(content.collapsedObjectIds) ? content.collapsedObjectIds : [],
        direction: content.direction === "TB" ? "TB" : "LR"
      }
    };
    if (value.type === "timeline") return {
      type: "timeline",
      content: {
        lanes: Array.isArray(content.lanes) ? content.lanes : [],
        entries: Array.isArray(content.entries) ? content.entries : [],
        trackViews: Array.isArray(content.trackViews) ? content.trackViews : [],
        dependencies: Array.isArray(content.dependencies) ? content.dependencies : [],
        filters: content.filters && typeof content.filters === "object" ? content.filters : { mode: "all", objectIds: [] },
        viewport: content.viewport && typeof content.viewport === "object" ? content.viewport : { focusedTrackId: null, density: "comfortable" }
      }
    };
    if (value.type !== "map") return null;
    const legacy = content.baseImage && (!Array.isArray(content.backgrounds) || content.backgrounds.length === 0)
      ? [{ id: "background.main", title: "主背景", ...content.baseImage, opacity: 1, visible: true }]
      : [];
    return {
      type: "map",
      content: {
        backgrounds: Array.isArray(content.backgrounds) ? content.backgrounds : legacy,
        activeBackgroundId: content.activeBackgroundId || legacy[0]?.id || null,
        layers: Array.isArray(content.layers) ? content.layers : [],
        markers: Array.isArray(content.markers) ? content.markers : [],
        regions: Array.isArray(content.regions) ? content.regions : [],
        labels: Array.isArray(content.labels) ? content.labels : []
      }
    };
  } catch {
    return null;
  }
}

function summarizeGraphSemanticChanges(before, after, context) {
  const changes = [];
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id);
    const title = context.objectTitle(node.objectId);
    if (!previous) changes.push({ kind: "node", label: `新增节点：${title}`, detail: "加入图谱" });
    else if (previous.objectId !== node.objectId) changes.push({ kind: "node", label: `替换节点：${title}`, detail: `原对象为 ${context.objectTitle(previous.objectId)}` });
    else if (previous.x !== node.x || previous.y !== node.y) changes.push({ kind: "node", label: `移动节点：${title}`, detail: `位置 ${coordinate(previous)} → ${coordinate(node)}` });
  }
  for (const [id, node] of beforeNodes) if (!afterNodes.has(id)) changes.push({ kind: "node", label: `移除节点：${context.objectTitle(node.objectId)}`, detail: "从图谱移除" });
  compareRelationships(changes, "edge", "关系", before.edges, after.edges, beforeNodes, afterNodes, context);
  compareRelationships(changes, "proposal", "关系提案", before.proposals, after.proposals, beforeNodes, afterNodes, context);
  if (JSON.stringify(before.filters || {}) !== JSON.stringify(after.filters || {})) changes.push({ kind: "filter", label: "图谱筛选", detail: "对象或关系筛选不同" });
  return changes.slice(0, 40);
}

function summarizeTreeSemanticChanges(before, after, context) {
  const changes = [];
  if (before.sourceGraphPath !== after.sourceGraphPath) changes.push({ kind: "source-graph", label: "来源图谱", detail: `${context.graphTitle(before.sourceGraphPath)} → ${context.graphTitle(after.sourceGraphPath)}` });
  compareAuthorSet(changes, "included-range", "关系范围", before.includedEdgeIds, after.includedEdgeIds, (id) => context.edgeTitle(after.sourceGraphPath || before.sourceGraphPath, id));
  compareAuthorSet(changes, "root", "根对象", before.rootObjectIds, after.rootObjectIds, context.objectTitle);
  compareAuthorSet(changes, "collapse", "收起分支", before.collapsedObjectIds, after.collapsedObjectIds, context.objectTitle);
  if (before.direction !== after.direction) changes.push({ kind: "direction", label: "阅读方向", detail: `${directionTitle(before.direction)} → ${directionTitle(after.direction)}` });
  return changes.slice(0, 40);
}

function summarizeTimelineSemanticChanges(before, after, context) {
  const changes = [];
  const beforeEntries = new Map(before.entries.map((entry) => [entry.id, entry]));
  const afterEntries = new Map(after.entries.map((entry) => [entry.id, entry]));
  for (const [id, entry] of afterEntries) {
    const previous = beforeEntries.get(id);
    const title = context.objectTitle(entry.eventId);
    if (!previous) changes.push({ kind: "entry", label: `加入时间线：${title}`, detail: "新增事件引用" });
    else if (previous.eventId !== entry.eventId) changes.push({ kind: "entry", label: `替换时间线事件：${title}`, detail: "事件引用不同" });
    else if (previous.order !== entry.order) changes.push({ kind: "reorder", label: `移动事件：${title}`, detail: `顺序 ${previous.order + 1} → ${entry.order + 1}` });
    else if (previous.laneId !== entry.laneId) changes.push({ kind: "custom-lane", label: `调整展示轨：${title}`, detail: "展示位置已改变" });
  }
  for (const [id, entry] of beforeEntries) if (!afterEntries.has(id)) changes.push({ kind: "entry", label: `移除时间线事件：${context.objectTitle(entry.eventId)}`, detail: "仅移除时间线引用" });

  const beforeLanes = new Map(before.lanes.map((lane) => [lane.id, lane]));
  const afterLanes = new Map(after.lanes.map((lane) => [lane.id, lane]));
  for (const [id, lane] of afterLanes) {
    const previous = beforeLanes.get(id);
    if (!previous) changes.push({ kind: "custom-lane", label: `新建展示轨：${lane.title || "未命名轨道"}`, detail: "用于组织时间线视图" });
    else if (previous.title !== lane.title) changes.push({ kind: "custom-lane", label: `重命名展示轨：${lane.title || "未命名轨道"}`, detail: `原名称：${previous.title || "未命名轨道"}` });
    else if (previous.order !== lane.order) changes.push({ kind: "custom-lane", label: `调整展示轨顺序：${lane.title || "未命名轨道"}`, detail: "展示顺序已改变" });
  }
  for (const [id, lane] of beforeLanes) if (!afterLanes.has(id)) changes.push({ kind: "custom-lane", label: `删除展示轨：${lane.title || "未命名轨道"}`, detail: "事件 Markdown 保持不变" });

  const beforeDependencies = new Map(before.dependencies.map((dependency) => [dependency.id, dependency]));
  const afterDependencies = new Map(after.dependencies.map((dependency) => [dependency.id, dependency]));
  for (const [id, dependency] of afterDependencies) if (!beforeDependencies.has(id)) changes.push({ kind: "dependency", label: `添加前置事件：${context.objectTitle(dependency.fromEventId)} → ${context.objectTitle(dependency.toEventId)}`, detail: "事件顺序约束" });
  for (const [id, dependency] of beforeDependencies) if (!afterDependencies.has(id)) changes.push({ kind: "dependency", label: `移除前置事件：${context.objectTitle(dependency.fromEventId)} → ${context.objectTitle(dependency.toEventId)}`, detail: "事件顺序约束已移除" });

  const beforeTracks = new Map(before.trackViews.map((track) => [track.id, track]));
  const afterTracks = new Map(after.trackViews.map((track) => [track.id, track]));
  for (const [id, track] of afterTracks) {
    const previous = beforeTracks.get(id);
    const title = timelineTrackTitle(track, context);
    if (!previous) changes.push({ kind: "track", label: `显示轨道：${title}`, detail: "加入当前视图" });
    else if (previous.visible !== track.visible) changes.push({ kind: "track", label: `${track.visible ? "显示" : "隐藏"}轨道：${title}`, detail: "当前视图设置" });
    else if (previous.collapsed !== track.collapsed) changes.push({ kind: "track", label: `${track.collapsed ? "折叠" : "展开"}轨道：${title}`, detail: "当前视图设置" });
  }
  if (before.viewport.focusedTrackId !== after.viewport.focusedTrackId) changes.push({ kind: "track", label: "聚焦轨道", detail: after.viewport.focusedTrackId ? timelineTrackTitle(afterTracks.get(after.viewport.focusedTrackId), context) : "取消聚焦" });
  if (before.viewport.density !== after.viewport.density) changes.push({ kind: "density", label: "时间线密度", detail: after.viewport.density === "compact" ? "紧凑" : "舒适" });
  if (JSON.stringify(before.filters) !== JSON.stringify(after.filters)) changes.push({ kind: "filter", label: "时间线筛选", detail: "筛选条件已改变" });
  return changes.slice(0, 40);
}

function timelineTrackTitle(track, context) {
  if (!track) return "当前视图";
  if (track.kind === "canon") return "正史";
  if (track.kind === "planning") return "规划";
  if (track.kind === "character" || track.kind === "location") return context.objectTitle(track.refId);
  return "展示轨道";
}

function compareRelationships(changes, kind, label, beforeItems, afterItems, beforeNodes, afterNodes, context) {
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  const after = new Map(afterItems.map((item) => [item.id, item]));
  for (const [id, item] of after) {
    const previous = before.get(id);
    const title = relationshipTitle(item, afterNodes, context);
    if (!previous) changes.push({ kind, label: `新增${label}：${title}`, detail: kind === "proposal" ? "等待作者决定" : "进入正式关系" });
    else {
      const detail = describeRelationshipChange(previous, item);
      if (detail) changes.push({ kind, label: `调整${label}：${title}`, detail });
    }
  }
  for (const [id, item] of before) if (!after.has(id)) changes.push({ kind, label: `移除${label}：${relationshipTitle(item, beforeNodes, context)}`, detail: kind === "proposal" ? "不再等待决定" : "从正式关系移除" });
}

function relationshipTitle(edge, nodes, context) {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  return `${context.objectTitle(source?.objectId)} → ${context.objectTitle(target?.objectId)} · ${edge.relation || "未命名关系"}`;
}

function buildSemanticContext(root) {
  const objectTitles = new Map(listWorkspaceNotes(root).map((note) => [note.id, note.title]));
  const graphs = new Map(listVisualDocuments(root).filter((document) => document.type === "graph").map((document) => [document.relativePath, document]));
  const objectTitle = (id) => objectTitles.get(id) || "对象已缺失";
  return {
    objectTitle,
    graphTitle(relativePath) {
      if (!relativePath) return "未选择";
      return graphs.get(relativePath)?.title || "来源图谱已缺失";
    },
    edgeTitle(relativePath, edgeId) {
      const graph = graphs.get(relativePath);
      const edge = graph?.content.edges.find((item) => item.id === edgeId);
      if (!graph || !edge) return "关系已缺失";
      const nodes = new Map(graph.content.nodes.map((node) => [node.id, node]));
      return relationshipTitle(edge, nodes, { objectTitle });
    }
  };
}

function compareAuthorSet(changes, kind, label, beforeItems, afterItems, resolveTitle) {
  const before = new Set(beforeItems || []);
  const after = new Set(afterItems || []);
  const added = [...after].filter((item) => !before.has(item)).map(resolveTitle);
  const removed = [...before].filter((item) => !after.has(item)).map(resolveTitle);
  if (added.length > 0) changes.push({ kind, label: `${label}增加`, detail: added.join("、") });
  if (removed.length > 0) changes.push({ kind, label: `${label}移除`, detail: removed.join("、") });
}

function directionTitle(value) {
  return value === "TB" ? "纵向" : "横向";
}

function describeRelationshipChange(before, after) {
  const details = [];
  if (before.source !== after.source || before.target !== after.target) details.push("关系端点不同");
  if (before.relation !== after.relation) details.push(`${before.relation || "未命名"} → ${after.relation || "未命名"}`);
  if (before.direction !== after.direction) details.push(`方向 ${before.direction || "none"} → ${after.direction || "none"}`);
  if (before.origin !== after.origin) details.push(`来源 ${before.origin || "author"} → ${after.origin || "author"}`);
  return details.join(" · ");
}

function compareTextSet(changes, kind, label, beforeItems, afterItems) {
  const before = new Set(beforeItems || []);
  const after = new Set(afterItems || []);
  const added = [...after].filter((item) => !before.has(item));
  const removed = [...before].filter((item) => !after.has(item));
  if (added.length > 0) changes.push({ kind, label: `${label}增加`, detail: added.join("、") });
  if (removed.length > 0) changes.push({ kind, label: `${label}移除`, detail: removed.join("、") });
}

function emptyMapContent() {
  return { backgrounds: [], activeBackgroundId: null, layers: [], markers: [], regions: [], labels: [] };
}

function emptyGraphContent() {
  return { nodes: [], edges: [], proposals: [], filters: { objectTypes: [] } };
}

function emptyTreeContent() {
  return { sourceGraphPath: "", includedEdgeIds: [], rootObjectIds: [], collapsedObjectIds: [], direction: "LR" };
}

function emptyTimelineContent() {
  return { lanes: [], entries: [], trackViews: [], dependencies: [], filters: { mode: "all", objectIds: [] }, viewport: { focusedTrackId: null, density: "comfortable" } };
}

function compareById(changes, label, beforeItems, afterItems, describe) {
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  const after = new Map(afterItems.map((item) => [item.id, item]));
  for (const [id, item] of after) {
    if (!before.has(id)) changes.push({ kind: labelKind(label), label: `${label}新增`, detail: item.title || item.text || item.objectId || id });
    else {
      const detail = describe(before.get(id), item);
      if (detail) changes.push({ kind: labelKind(label), label: item.title || item.text || item.objectId || id, detail });
    }
  }
  for (const [id, item] of before) {
    if (!after.has(id)) changes.push({ kind: labelKind(label), label: `${label}移除`, detail: item.title || item.text || item.objectId || id });
  }
}

function describeBackgroundChange(before, after) {
  const details = [];
  if (before.title !== after.title) details.push("名称不同");
  if (before.assetPath !== after.assetPath) details.push("资源不同");
  if (before.opacity !== after.opacity) details.push(`透明度 ${percent(before.opacity)} → ${percent(after.opacity)}`);
  if (before.visible !== after.visible) details.push(after.visible === false ? "已隐藏" : "已显示");
  return details.join(" · ");
}

function describeLayerChange(before, after) {
  const details = [];
  if (before.title !== after.title) details.push(`改名为 ${after.title}`);
  if (before.visible !== after.visible) details.push(after.visible === false ? "已隐藏" : "已显示");
  if (before.locked !== after.locked) details.push(after.locked ? "已锁定" : "已解锁");
  return details.join(" · ");
}

function describeMarkerChange(before, after) {
  const details = [];
  if (before.x !== after.x || before.y !== after.y) details.push(`位置 ${coordinate(before)} → ${coordinate(after)}`);
  if (before.layerId !== after.layerId) details.push(`移至 ${after.layerId}`);
  if (before.labelMode !== after.labelMode) details.push(`标签 ${before.labelMode || "always"} → ${after.labelMode || "always"}`);
  if (before.color !== after.color) details.push("颜色不同");
  return details.join(" · ");
}

function describeRegionChange(before, after) {
  const details = [];
  if (before.title !== after.title) details.push(`改名为 ${after.title}`);
  if (JSON.stringify(before.points) !== JSON.stringify(after.points)) details.push(`边界 ${before.points?.length || 0} → ${after.points?.length || 0} 顶点`);
  if (before.layerId !== after.layerId) details.push(`移至 ${after.layerId}`);
  if ((before.strokeColor || before.color) !== (after.strokeColor || after.color) || (before.fillColor || before.color) !== (after.fillColor || after.color) || before.fillOpacity !== after.fillOpacity) details.push("样式不同");
  if ((before.objectId || null) !== (after.objectId || null)) details.push("对象关联不同");
  return details.join(" · ");
}

function describeLabelChange(before, after) {
  const details = [];
  if (before.text !== after.text) details.push(`文字改为「${after.text}」`);
  if (before.x !== after.x || before.y !== after.y) details.push(`位置 ${coordinate(before)} → ${coordinate(after)}`);
  if (before.layerId !== after.layerId) details.push(`移至 ${after.layerId}`);
  if (before.fontSize !== after.fontSize || before.fontWeight !== after.fontWeight || before.align !== after.align || before.rotation !== after.rotation || before.treatment !== after.treatment) details.push("排版不同");
  if (before.visible !== after.visible) details.push(after.visible === false ? "已隐藏" : "已显示");
  return details.join(" · ");
}

function coordinate(value) {
  return `${Number(value.x || 0).toFixed(1)}, ${Number(value.y || 0).toFixed(1)}`;
}

function percent(value) {
  return `${Math.round(Number(value ?? 1) * 100)}%`;
}

function labelKind(label) {
  return ({ "背景": "background", "图层": "layer", "标记": "marker", "区域": "region", "文字": "label", "节点": "node", "关系": "edge", "提案": "proposal" })[label] || "document";
}

function rejectDangerousKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("History manifest contains a dangerous key.");
    rejectDangerousKeys(child);
  }
}

function hash(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function clone(value) {
  return structuredClone(value);
}
