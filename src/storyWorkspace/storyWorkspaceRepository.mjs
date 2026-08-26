import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { publishFileNoReplace } from "../storyControlSurface/atomicNoReplaceFile.ts";

const WORKSPACE_VERSION = "story-workspace/v1";
const INDEX_VERSION = "story-workspace-index/v1";
const STATE_VERSION = "story-workspace-state/v1";
const NOTE_TYPES = new Set([
  "project",
  "chapter",
  "scene",
  "character",
  "location",
  "event",
  "item",
  "faction",
  "rule",
  "thread",
  "story-unit",
  "artifact",
  "keyframe",
  "review"
]);
const NOTE_DIRECTORIES = {
  project: "",
  chapter: "chapters",
  scene: "scenes",
  character: "world/characters",
  location: "world/locations",
  event: "world/events",
  item: "world/items",
  faction: "world/factions",
  rule: "world/rules",
  thread: "world/threads",
  "story-unit": "story-units",
  artifact: "artifacts",
  keyframe: "planning",
  review: "reviews"
};
const WORKSPACE_DIRECTORIES = [
  "chapters",
  "scenes",
  "world/characters",
  "world/locations",
  "world/events",
  "world/rules",
  "world/threads",
  "planning",
  "reviews",
  "assets/images",
  "assets/references",
  ".world-os/cache",
  ".world-os/locks",
  ".world-os/runs"
];

const VISUAL_WORKSPACE_DIRECTORIES = [
  "assets/maps",
  "assets/audio",
  "documents/maps",
  "documents/graphs",
  "documents/canvases",
  "documents/timelines",
  "documents/trees",
  "manuscripts/chapters",
  "manuscripts/scenes"
];
const FRONTMATTER_KNOWN_ORDER = [
  "world_os",
  "id",
  "type",
  "title",
  "status",
  "genre",
  "ambience",
  "chapter",
  "characters",
  "location",
  "events",
  "rules",
  "threads",
  "aliases",
  "tags",
  "card_layout",
  "card_blocks",
  "cover",
  "media"
];

export function createStoryWorkspace({ rootPath, title, genre, ambience }) {
  const root = prepareWorkspaceRoot(rootPath, { create: true });
  const projectPath = path.join(root, "project.md");
  if (existsSync(projectPath)) throw new Error(`Workspace already exists: ${root}`);

  for (const directory of WORKSPACE_DIRECTORIES) {
    ensureDirectoryInsideRoot(root, directory);
  }
  for (const directory of VISUAL_WORKSPACE_DIRECTORIES) {
    ensureDirectoryInsideRoot(root, directory);
  }

  const project = writeNewNote(root, {
    id: `project.${safeIdSegment(title)}`,
    type: "project",
    title,
    status: "active",
    frontmatter: {
      ...pickDefined({ genre, ambience }, ["genre", "ambience"]),
      tags: ["story-world"]
    },
    body: `# ${title}\n\n## 世界简介\n\n`
  });
  writeStableJson(path.join(root, ".world-os", "state.json"), createDefaultState());
  rebuildWorkspaceIndex(root);
  appendOperation(root, "workspace-created", "project.md", 1);

  return openStoryWorkspace(root);
}

export function openStoryWorkspace(rootPath) {
  const root = prepareWorkspaceRoot(rootPath);
  const project = readWorkspaceNote(root, "project.md");
  if (project.type !== "project") throw new Error("project.md must be a project note.");
  const index = ensureWorkspaceIndex(root);
  const state = readWorkspaceState(root);

  return clone({
    rootPath: root,
    project,
    index,
    state,
    summary: getWorkspaceProjectSummary(root)
  });
}

export function validateStoryWorkspace(rootPath) {
  const errors = [];
  let root;
  try {
    root = prepareWorkspaceRoot(rootPath);
  } catch (error) {
    return { valid: false, errors: [messageOf(error)] };
  }

  for (const directory of WORKSPACE_DIRECTORIES) {
    const absolute = safePath(root, directory, { allowMissing: true, requireMarkdown: false });
    if (!existsSync(absolute) || !lstatSync(absolute).isDirectory()) errors.push(`Missing directory: ${directory}`);
  }
  if (!existsSync(path.join(root, ".world-os"))) errors.push("Missing directory: .world-os");
  if (!existsSync(path.join(root, "project.md"))) errors.push("Missing file: project.md");

  const ids = new Map();
  if (errors.length === 0) {
    for (const relativePath of listMarkdownPaths(root)) {
      try {
        const note = readWorkspaceNote(root, relativePath);
        if (!NOTE_TYPES.has(note.type)) errors.push(`Invalid note type in ${relativePath}: ${note.type}`);
        if (!note.id) errors.push(`Missing id in ${relativePath}`);
        if (ids.has(note.id)) errors.push(`Duplicate note id: ${note.id}`);
        ids.set(note.id, relativePath);
        if (!isNoteInExpectedDirectory(note.type, relativePath)) {
          errors.push(`Note path does not match type in ${relativePath}`);
        }
      } catch (error) {
        errors.push(`${relativePath}: ${messageOf(error)}`);
      }
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
}

export function listWorkspaceNotes(rootPath) {
  const root = prepareWorkspaceRoot(rootPath);
  return listMarkdownPaths(root).map((relativePath) => readWorkspaceNote(root, relativePath));
}

export function readWorkspaceNote(rootPath, relativePath) {
  const root = prepareWorkspaceRoot(rootPath);
  const absolutePath = safePath(root, relativePath);
  if (!existsSync(absolutePath)) throw new Error(`Workspace note does not exist: ${relativePath}`);
  if (lstatSync(absolutePath).isSymbolicLink()) throw new Error(`Workspace note cannot be a symlink: ${relativePath}`);

  const source = readFileSync(absolutePath, "utf8");
  const parsed = parseStoryMarkdown(source);
  const type = requireScalar(parsed.frontmatter, "type", relativePath);
  const id = requireScalar(parsed.frontmatter, "id", relativePath);
  const title = requireScalar(parsed.frontmatter, "title", relativePath);
  const status = scalarValue(parsed.frontmatter.status) || "drafting";
  const indexEntry = readIndexEntry(root, relativePath);

  return clone({
    relativePath: normalizeRelativePath(relativePath),
    id,
    type,
    title,
    status,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    references: parsed.references,
    contentHash: contentHash(source),
    logicalRevision: indexEntry?.logicalRevision ?? 0
  });
}

export function createWorkspaceNote(rootPath, input) {
  const root = prepareWorkspaceRoot(rootPath);
  const type = requireNoteType(input.type);
  const relativePath = input.relativePath
    ? normalizeRelativePath(input.relativePath)
    : defaultRelativePath(type, input.title);
  validateNotePathForType(type, relativePath);
  if (existsSync(safePath(root, relativePath, { allowMissing: true }))) {
    throw new Error(`Workspace note already exists: ${relativePath}`);
  }

  const note = writeNewNote(root, {
    ...input,
    type,
    relativePath,
    status: input.status || defaultStatusForType(type)
  });
  const index = rebuildWorkspaceIndex(root);
  appendOperation(root, "note-created", note.relativePath, entryRevision(index, note.relativePath));
  return readWorkspaceNote(root, note.relativePath);
}

export function createWorkspaceNoteOnce(rootPath, input) {
  const root = prepareWorkspaceRoot(rootPath);
  const type = requireNoteType(input.type);
  const relativePath = input.relativePath
    ? normalizeRelativePath(input.relativePath)
    : defaultRelativePath(type, input.title);
  validateNotePathForType(type, relativePath);
  const frontmatter = {
    world_os: WORKSPACE_VERSION,
    id: String(input.id),
    type,
    title: String(input.title),
    status: String(input.status || defaultStatusForType(type)),
    ...(input.frontmatter || {})
  };
  const content = serializeStoryMarkdown({ frontmatter, body: input.body || `# ${input.title}\n\n` });
  const target = safePath(root, relativePath, { allowMissing: true });
  const publication = publishFileNoReplace({
    rootPath: root,
    targetPath: target,
    content,
    onBoundary: input.onPublishBoundary
  });
  if (publication === "exists" && readFileSync(target, "utf8") !== content) {
    return clone({ created: false, conflict: true, note: null });
  }

  const index = rebuildWorkspaceIndex(root);
  input.onProjectionBoundary?.("index-persisted");
  appendOperationOnce(
    root,
    "note-created",
    relativePath,
    entryRevision(index, relativePath),
    String(input.operationId)
  );
  input.onProjectionBoundary?.("operation-persisted");
  return clone({
    created: publication === "created",
    conflict: false,
    note: readWorkspaceNote(root, relativePath)
  });
}

export function updateWorkspaceNote(rootPath, input) {
  const root = prepareWorkspaceRoot(rootPath);
  const current = readWorkspaceNote(root, input.relativePath);
  if (input.expectedContentHash && input.expectedContentHash !== current.contentHash) {
    return clone({ ok: false, conflict: true, note: current });
  }

  const frontmatter = { ...current.frontmatter, ...(input.frontmatter || {}) };
  if (input.removeFrontmatterKeys != null) {
    if (!Array.isArray(input.removeFrontmatterKeys) || input.removeFrontmatterKeys.length > 256) {
      throw new Error("Frontmatter removal keys are invalid.");
    }
    for (const rawKey of input.removeFrontmatterKeys) {
      const key = String(rawKey || "");
      if ((!/^[a-z][a-z0-9_]{0,63}$/u.test(key) && key !== "agentTypeId") || ["world_os", "id", "type", "title", "status"].includes(key)) {
        throw new Error("Frontmatter removal key is not allowed.");
      }
      delete frontmatter[key];
    }
  }
  frontmatter.world_os = WORKSPACE_VERSION;
  frontmatter.id = current.id;
  frontmatter.type = current.type;
  frontmatter.title = scalarValue(frontmatter.title) || current.title;
  frontmatter.status = scalarValue(frontmatter.status) || current.status;
  const body = typeof input.body === "string" ? input.body : current.body;
  const content = serializeStoryMarkdown({ frontmatter, body });
  writeAtomicUtf8(root, current.relativePath, content);
  const index = rebuildWorkspaceIndex(root);
  appendOperation(root, "note-updated", current.relativePath, entryRevision(index, current.relativePath));

  return clone({ ok: true, conflict: false, note: readWorkspaceNote(root, current.relativePath) });
}

export function restoreWorkspaceNoteSource(rootPath, input) {
  const root = prepareWorkspaceRoot(rootPath);
  const current = readWorkspaceNote(root, input.relativePath);
  if (input.expectedContentHash !== current.contentHash) {
    return clone({ ok: false, conflict: true, note: current });
  }
  if (typeof input.source !== "string" || Buffer.byteLength(input.source, "utf8") > 2 * 1024 * 1024) {
    throw new Error("Workspace note restore source is invalid.");
  }
  const parsed = parseStoryMarkdown(input.source);
  if (scalarValue(parsed.frontmatter.id) !== current.id || scalarValue(parsed.frontmatter.type) !== current.type) {
    throw new Error("Restored note identity does not match the canonical document.");
  }
  parsed.frontmatter.world_os = WORKSPACE_VERSION;
  parsed.frontmatter.id = current.id;
  parsed.frontmatter.type = current.type;
  const content = serializeStoryMarkdown({ frontmatter: parsed.frontmatter, body: parsed.body });
  writeAtomicUtf8(root, current.relativePath, content);
  const index = rebuildWorkspaceIndex(root);
  appendOperation(root, "note-restored", current.relativePath, entryRevision(index, current.relativePath));
  return clone({ ok: true, conflict: false, note: readWorkspaceNote(root, current.relativePath) });
}

export function renameWorkspaceNote(rootPath, input) {
  const root = prepareWorkspaceRoot(rootPath);
  const current = readWorkspaceNote(root, input.relativePath);
  if (current.type === "project") throw new Error("The project note cannot be renamed.");
  const nextRelativePath = input.nextRelativePath
    ? normalizeRelativePath(input.nextRelativePath)
    : defaultRelativePath(current.type, input.title || current.title);
  validateNotePathForType(current.type, nextRelativePath);
  const currentPath = safePath(root, current.relativePath);
  const nextPath = safePath(root, nextRelativePath, { allowMissing: true });
  if (current.relativePath !== nextRelativePath && existsSync(nextPath)) {
    throw new Error(`Workspace note already exists: ${nextRelativePath}`);
  }

  const nextFrontmatter = { ...current.frontmatter, title: input.title || current.title };
  const nextContent = serializeStoryMarkdown({ frontmatter: nextFrontmatter, body: current.body });
  if (current.relativePath === nextRelativePath) {
    writeAtomicUtf8(root, current.relativePath, nextContent);
  } else {
    writeAtomicUtf8(root, nextRelativePath, nextContent);
    rmSync(currentPath, { force: true });
  }
  const index = rebuildWorkspaceIndex(root);
  appendOperation(root, "note-renamed", nextRelativePath, entryRevision(index, nextRelativePath));
  return readWorkspaceNote(root, nextRelativePath);
}

export function deleteWorkspaceNote(rootPath, relativePath) {
  const root = prepareWorkspaceRoot(rootPath);
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === "project.md") throw new Error("The project note cannot be deleted.");
  const target = safePath(root, normalized);
  if (!existsSync(target)) throw new Error(`Workspace note does not exist: ${normalized}`);
  if (lstatSync(target).isSymbolicLink()) throw new Error(`Workspace note cannot be a symlink: ${normalized}`);
  rmSync(target, { force: true });
  rebuildWorkspaceIndex(root);
  appendOperation(root, "note-deleted", normalized, 0);
}

export function rebuildWorkspaceIndex(rootPath) {
  const root = prepareWorkspaceRoot(rootPath);
  const previous = readWorkspaceIndex(root);
  const previousEntries = new Map((previous?.entries || []).map((entry) => [entry.relativePath, entry]));
  let nextRevision = Math.max(0, ...(previous?.entries || []).map((entry) => entry.logicalRevision || 0)) + 1;
  const entries = listMarkdownPaths(root).map((relativePath) => {
    const note = readWorkspaceNoteWithoutIndex(root, relativePath);
    const previousEntry = previousEntries.get(relativePath);
    const logicalRevision = previousEntry?.contentHash === note.contentHash
      ? previousEntry.logicalRevision
      : nextRevision++;
    return {
      id: note.id,
      type: note.type,
      title: note.title,
      relativePath: note.relativePath,
      status: note.status,
      aliases: stringListValue(note.frontmatter.aliases),
      tags: stringListValue(note.frontmatter.tags),
      references: note.references,
      contentHash: note.contentHash,
      logicalRevision
    };
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const index = { version: INDEX_VERSION, entries };
  writeStableJson(path.join(root, ".world-os", "index.json"), index);
  return clone(index);
}

export function getWorkspaceProjectSummary(rootPath) {
  const root = prepareWorkspaceRoot(rootPath);
  const index = ensureWorkspaceIndex(root);
  const projectEntry = index.entries.find((entry) => entry.type === "project");
  if (!projectEntry) throw new Error("Workspace is missing project.md.");
  const project = readWorkspaceNote(root, projectEntry.relativePath);
  const state = readWorkspaceState(root);
  const byType = countBy(index.entries, (entry) => entry.type);
  const chapters = index.entries.filter((entry) => entry.type === "chapter");
  const scenes = index.entries.filter((entry) => entry.type === "scene");
  const threads = index.entries.filter((entry) => entry.type === "thread");
  const lockedRules = index.entries.filter((entry) => entry.type === "rule" && entry.status === "locked");
  const currentChapterPath = state.currentChapterPath || chapters[0]?.relativePath || null;
  const currentScenePath = state.currentScenePath || scenes[0]?.relativePath || null;
  const currentChapter = chapters.find((entry) => entry.relativePath === currentChapterPath) || null;
  const currentScene = scenes.find((entry) => entry.relativePath === currentScenePath) || null;
  const latestChangedNote = [...index.entries].sort((left, right) => (
    right.logicalRevision - left.logicalRevision || left.relativePath.localeCompare(right.relativePath)
  ))[0] || null;

  return clone({
    projectTitle: project.title,
    projectStatus: project.status,
    genre: scalarValue(project.frontmatter.genre) || null,
    ambience: scalarValue(project.frontmatter.ambience) || null,
    projectPath: project.relativePath,
    currentChapterPath,
    currentChapterTitle: currentChapter?.title || null,
    currentScenePath,
    currentSceneTitle: currentScene?.title || null,
    chapterCount: byType.chapter || 0,
    sceneCount: byType.scene || 0,
    characterCount: byType.character || 0,
    locationCount: byType.location || 0,
    eventCount: byType.event || 0,
    itemCount: byType.item || 0,
    factionCount: byType.faction || 0,
    ruleCount: byType.rule || 0,
    objectCount: (byType.character || 0) + (byType.location || 0) + (byType.event || 0) +
      (byType.item || 0) + (byType.faction || 0) + (byType.rule || 0) + (byType.thread || 0),
    lockedRuleCount: lockedRules.length,
    lockedRules: lockedRules.map((entry) => entry.title),
    unresolvedThreads: threads.filter((entry) => !["closed", "resolved"].includes(entry.status)).map((entry) => entry.title),
    latestChangedNote: latestChangedNote ? {
      title: latestChangedNote.title,
      relativePath: latestChangedNote.relativePath,
      logicalRevision: latestChangedNote.logicalRevision
    } : null,
    state: clone(state)
  });
}

export function getWorkspaceTree(rootPath) {
  const root = prepareWorkspaceRoot(rootPath);
  const entries = ensureWorkspaceIndex(root).entries;
  const groups = {
    project: [],
    chapters: [],
    scenes: [],
    characters: [],
    locations: [],
    events: [],
    items: [],
    factions: [],
    rules: [],
    threads: [],
    storyUnits: [],
    artifacts: [],
    keyframes: [],
    reviews: []
  };
  const groupForType = {
    project: "project",
    chapter: "chapters",
    scene: "scenes",
    character: "characters",
    location: "locations",
    event: "events",
    item: "items",
    faction: "factions",
    rule: "rules",
    thread: "threads",
    "story-unit": "storyUnits",
    artifact: "artifacts",
    keyframe: "keyframes",
    review: "reviews"
  };
  for (const entry of entries) groups[groupForType[entry.type]].push(clone(entry));
  for (const entriesForGroup of Object.values(groups)) {
    entriesForGroup.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
  return clone({ groups });
}

export function getWorkspaceLinkedNotes(rootPath, relativePath) {
  const root = prepareWorkspaceRoot(rootPath);
  const note = readWorkspaceNote(root, relativePath);
  const linked = new Map();
  for (const reference of note.references) {
    const target = resolveReferencedNote(root, note.relativePath, reference);
    if (target && target.relativePath !== note.relativePath) linked.set(target.relativePath, target);
  }
  return [...linked.values()]
    .sort((left, right) => left.title.localeCompare(right.title) || left.relativePath.localeCompare(right.relativePath))
    .map((item) => clone(item));
}

export function getWorkspaceBacklinks(rootPath, relativePath) {
  const root = prepareWorkspaceRoot(rootPath);
  const target = readWorkspaceNote(root, relativePath);
  return listWorkspaceNotes(root)
    .filter((candidate) => candidate.relativePath !== target.relativePath)
    .filter((candidate) => candidate.references.some((reference) => {
      const resolved = resolveReferencedNote(root, candidate.relativePath, reference);
      return resolved?.relativePath === target.relativePath;
    }))
    .sort((left, right) => left.title.localeCompare(right.title) || left.relativePath.localeCompare(right.relativePath))
    .map((item) => clone(item));
}

export function getWorkspaceNoteGuard(rootPath, relativePath) {
  const root = prepareWorkspaceRoot(rootPath);
  const note = readWorkspaceNote(root, relativePath);
  const linkedNotesByPath = new Map();
  for (const reference of note.references) {
    const linked = resolveReferencedNote(root, note.relativePath, reference);
    if (linked) linkedNotesByPath.set(linked.relativePath, linked);
  }
  for (const rule of listWorkspaceNotes(root).filter((item) => item.type === "rule" && item.status === "locked")) {
    linkedNotesByPath.set(rule.relativePath, rule);
  }
  const linkedNotes = [...linkedNotesByPath.values()];
  const chapter = linkedNotes.find((item) => item.type === "chapter") || null;
  return clone({
    note: {
      relativePath: note.relativePath,
      title: note.title,
      type: note.type,
      body: note.body,
      contentHash: note.contentHash,
      frontmatter: note.frontmatter
    },
    guard: {
      chapter: chapter ? { relativePath: chapter.relativePath, title: chapter.title } : null,
      characters: linkedNotes.filter((item) => item.type === "character").map((item) => summarizeLinkedNote(item, "角色")),
      locations: linkedNotes.filter((item) => item.type === "location").map((item) => summarizeLinkedNote(item, "地点")),
      events: linkedNotes.filter((item) => item.type === "event").map((item) => summarizeLinkedNote(item, "事件")),
      rules: linkedNotes.filter((item) => item.type === "rule").map((item) => summarizeLinkedNote(item, "规则")),
      threads: linkedNotes.filter((item) => item.type === "thread").map((item) => summarizeLinkedNote(item, "线索")),
      linkedNotes: linkedNotes.map((item) => ({ relativePath: item.relativePath, title: item.title, type: item.type }))
    }
  });
}

export function readWorkspaceState(rootPath) {
  const root = prepareWorkspaceRoot(rootPath);
  const statePath = path.join(root, ".world-os", "state.json");
  if (!existsSync(statePath)) return clone(createDefaultState());
  assertNoSymlink(root, statePath);
  return clone(JSON.parse(readFileSync(statePath, "utf8")));
}

export function updateWorkspaceState(rootPath, patch) {
  const root = prepareWorkspaceRoot(rootPath);
  const current = readWorkspaceState(root);
  const next = {
    ...current,
    ...pickDefined(patch, ["currentChapterPath", "currentScenePath", "selectedObjectPath", "activeSurface", "localPreferences"])
  };
  writeStableJson(path.join(root, ".world-os", "state.json"), next);
  return clone(next);
}

export function parseStoryMarkdown(source) {
  const normalized = String(source).replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("Story Markdown requires YAML frontmatter.");
  const closing = normalized.indexOf("\n---", 4);
  if (closing < 0) throw new Error("Story Markdown frontmatter is not closed.");
  const frontmatterSource = normalized.slice(4, closing);
  const afterClosing = normalized.slice(closing + 4);
  const body = afterClosing.startsWith("\n") ? afterClosing.slice(1) : afterClosing;
  const frontmatter = parseFlatFrontmatter(frontmatterSource);

  return {
    frontmatter,
    body,
    references: parseStoryLinks(body, frontmatter)
  };
}

export function serializeStoryMarkdown({ frontmatter, body }) {
  const lines = ["---"];
  const orderedKeys = [
    ...FRONTMATTER_KNOWN_ORDER.filter((key) => Object.hasOwn(frontmatter, key)),
    ...Object.keys(frontmatter).filter((key) => !FRONTMATTER_KNOWN_ORDER.includes(key)).sort()
  ];
  for (const key of orderedKeys) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${formatYamlScalar(item)}`);
    } else {
      lines.push(`${key}: ${formatYamlScalar(value)}`);
    }
  }
  lines.push("---", String(body).replace(/\r\n/g, "\n").replace(/\n*$/, ""));
  return `${lines.join("\n")}\n`;
}

export function parseStoryLinks(body, frontmatter = {}) {
  const references = [];
  const add = (value) => {
    const normalized = String(value || "").trim();
    if (normalized) references.push(normalized);
  };
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  const wikiPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of String(body).matchAll(linkPattern)) add(decodeReference(match[1]));
  for (const match of String(body).matchAll(wikiPattern)) add(match[1]);
  for (const value of Object.values(frontmatter)) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      const source = String(candidate);
      for (const match of source.matchAll(wikiPattern)) add(match[1]);
      if (source.endsWith(".md")) add(decodeReference(source));
    }
  }
  return [...new Set(references)].sort((left, right) => left.localeCompare(right));
}

function writeNewNote(root, input) {
  const type = requireNoteType(input.type);
  const relativePath = input.relativePath ? normalizeRelativePath(input.relativePath) : defaultRelativePath(type, input.title);
  validateNotePathForType(type, relativePath);
  const frontmatter = {
    world_os: WORKSPACE_VERSION,
    id: String(input.id),
    type,
    title: String(input.title),
    status: String(input.status || defaultStatusForType(type)),
    ...(input.frontmatter || {})
  };
  const content = serializeStoryMarkdown({ frontmatter, body: input.body || `# ${input.title}\n\n` });
  writeAtomicUtf8(root, relativePath, content);
  return readWorkspaceNoteWithoutIndex(root, relativePath);
}

function readWorkspaceNoteWithoutIndex(root, relativePath) {
  const absolutePath = safePath(root, relativePath);
  if (lstatSync(absolutePath).isSymbolicLink()) throw new Error(`Workspace note cannot be a symlink: ${relativePath}`);
  const source = readFileSync(absolutePath, "utf8");
  const parsed = parseStoryMarkdown(source);
  return {
    relativePath: normalizeRelativePath(relativePath),
    id: requireScalar(parsed.frontmatter, "id", relativePath),
    type: requireScalar(parsed.frontmatter, "type", relativePath),
    title: requireScalar(parsed.frontmatter, "title", relativePath),
    status: scalarValue(parsed.frontmatter.status) || "drafting",
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    references: parsed.references,
    contentHash: contentHash(source),
    logicalRevision: 0
  };
}

function ensureWorkspaceIndex(root) {
  const indexPath = path.join(root, ".world-os", "index.json");
  if (!existsSync(indexPath)) return rebuildWorkspaceIndex(root);
  const index = readWorkspaceIndex(root);
  if (!index || !workspaceIndexMatchesDisk(root, index)) return rebuildWorkspaceIndex(root);
  return index;
}

function workspaceIndexMatchesDisk(root, index) {
  const diskPaths = listMarkdownPaths(root);
  if (diskPaths.length !== index.entries.length) return false;
  const entriesByPath = new Map(index.entries.map((entry) => [entry.relativePath, entry]));
  return diskPaths.every((relativePath) => {
    const entry = entriesByPath.get(relativePath);
    if (!entry) return false;
    return entry.contentHash === contentHash(readFileSync(safePath(root, relativePath), "utf8"));
  });
}

function readWorkspaceIndex(root) {
  const indexPath = path.join(root, ".world-os", "index.json");
  if (!existsSync(indexPath)) return null;
  assertNoSymlink(root, indexPath);
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  if (index?.version !== INDEX_VERSION || !Array.isArray(index.entries)) return null;
  return index;
}

function readIndexEntry(root, relativePath) {
  return readWorkspaceIndex(root)?.entries.find((entry) => entry.relativePath === normalizeRelativePath(relativePath));
}

function entryRevision(index, relativePath) {
  return index.entries.find((entry) => entry.relativePath === relativePath)?.logicalRevision || 0;
}

function appendOperation(root, operation, relativePath, logicalRevision) {
  const operationsPath = path.join(root, ".world-os", "operations.jsonl");
  assertNoSymlink(root, operationsPath, { allowMissing: true });
  const line = stableJsonStringify({ operation, relativePath, logicalRevision }).trimEnd();
  const existing = existsSync(operationsPath) ? readFileSync(operationsPath, "utf8") : "";
  writeAtomicAbsolute(root, operationsPath, `${existing}${line}\n`);
}

function appendOperationOnce(root, operation, relativePath, logicalRevision, operationId) {
  const operationsPath = path.join(root, ".world-os", "operations.jsonl");
  assertNoSymlink(root, operationsPath, { allowMissing: true });
  const existing = existsSync(operationsPath) ? readFileSync(operationsPath, "utf8") : "";
  const alreadyRecorded = existing.includes(`"operationId": ${JSON.stringify(operationId)}`);
  if (alreadyRecorded) return;
  const line = stableJsonStringify({ operation, operationId, relativePath, logicalRevision }).trimEnd();
  writeAtomicAbsolute(root, operationsPath, `${existing}${line}\n`);
}

function resolveReferencedNote(root, sourceRelativePath, reference) {
  const isRootRelative = /^(chapters|scenes|world|planning|reviews|story-units|artifacts)\//.test(reference);
  const direct = reference.endsWith(".md")
    ? isRootRelative
      ? reference
      : path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelativePath), reference))
    : null;
  if (direct && direct !== ".." && !direct.startsWith("../")) {
    try {
      return readWorkspaceNote(root, direct);
    } catch {
      return null;
    }
  }
  const title = reference.replace(/\.md$/, "");
  return listWorkspaceNotes(root).find((candidate) => candidate.title === title) || null;
}

function firstPlainLine(body) {
  return String(body)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^[-*+]\s+/, "").trim())
    .find(Boolean) || "";
}

function summarizeLinkedNote(note, label) {
  const detail = firstPlainLine(note.body);
  return detail ? `${note.title}：${detail}` : `已关联${label}：${note.title}`;
}

function prepareWorkspaceRoot(rootPath, { create = false } = {}) {
  if (typeof rootPath !== "string" || !rootPath.trim()) throw new Error("Workspace root path is required.");
  const absolute = path.resolve(rootPath);
  if (existsSync(absolute)) {
    if (lstatSync(absolute).isSymbolicLink()) throw new Error("Workspace root cannot be a symlink.");
  } else if (create) {
    mkdirSync(absolute, { recursive: true });
  } else {
    throw new Error(`Workspace root does not exist: ${absolute}`);
  }
  if (!lstatSync(absolute).isDirectory()) throw new Error(`Workspace root is not a directory: ${absolute}`);
  return realpathSync(absolute);
}

function ensureDirectoryInsideRoot(root, relativeDirectory) {
  const absolute = safePath(root, relativeDirectory, { allowMissing: true, requireMarkdown: false });
  mkdirSync(absolute, { recursive: true });
  assertNoSymlink(root, absolute);
}

function safePath(root, relativePath, { allowMissing = false, requireMarkdown = true } = {}) {
  const normalized = normalizeRelativePath(relativePath, { requireMarkdown });
  const absolute = path.resolve(root, normalized);
  if (!isInside(root, absolute)) throw new Error(`Path is outside workspace: ${relativePath}`);
  assertNoSymlink(root, absolute, { allowMissing });
  return absolute;
}

function assertNoSymlink(root, target, { allowMissing = false } = {}) {
  const relative = path.relative(root, target);
  if (relative === "") return;
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path is outside workspace.");
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) {
      if (allowMissing) return;
      continue;
    }
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink escape is not allowed: ${path.relative(root, cursor)}`);
  }
}

function writeAtomicUtf8(root, relativePath, content) {
  const target = safePath(root, relativePath, { allowMissing: true });
  writeAtomicAbsolute(root, target, content);
}

function writeAtomicAbsolute(root, target, content) {
  assertNoSymlink(root, target, { allowMissing: true });
  const directory = path.dirname(target);
  const relativeDirectory = path.relative(root, directory);
  if (relativeDirectory) ensureDirectoryInsideRoot(root, relativeDirectory);
  const temporary = path.join(directory, `.${path.basename(target)}.world-os-tmp-${process.pid}`);
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, target);
}

function writeStableJson(target, value) {
  const root = path.dirname(path.dirname(target));
  writeAtomicAbsolute(root, target, stableJsonStringify(value));
}

function stableJsonStringify(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

function listMarkdownPaths(root) {
  return walkMarkdown(root).sort((left, right) => left.localeCompare(right));
}

function walkMarkdown(root, relativeDirectory = "") {
  const directory = relativeDirectory ? safePath(root, relativeDirectory, { requireMarkdown: false }) : root;
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".world-os" || entry.name === ".obsidian") continue;
    if (!relativeDirectory && entry.name === "continuity") continue;
    const relative = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink escape is not allowed: ${relative}`);
    if (entry.isDirectory()) result.push(...walkMarkdown(root, relative));
    if (entry.isFile() && entry.name.endsWith(".md")) result.push(relative);
  }
  return result;
}

function parseFlatFrontmatter(source) {
  const frontmatter = {};
  let currentListKey = null;
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch) {
      if (!currentListKey) throw new Error("YAML list item has no property key.");
      frontmatter[currentListKey].push(parseYamlScalar(listMatch[1]));
      continue;
    }
    if (/^\s/.test(line)) throw new Error("Nested YAML properties are not supported in Story Markdown.");
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s?(.*))?$/);
    if (!match) throw new Error(`Invalid YAML property: ${line}`);
    const [, key, rawValue = ""] = match;
    if (Object.hasOwn(frontmatter, key)) throw new Error(`Duplicate YAML property: ${key}`);
    if (rawValue === "") {
      frontmatter[key] = [];
      currentListKey = key;
    } else {
      frontmatter[key] = parseYamlScalar(rawValue);
      currentListKey = null;
    }
  }
  return frontmatter;
}

function parseYamlScalar(value) {
  const trimmed = String(value).trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1).replace(/''/g, "'");
    }
  }
  return trimmed;
}

function formatYamlScalar(value) {
  const text = String(value ?? "");
  if (text === "" || /[:#\n\r]/.test(text) || /^\s|\s$/.test(text) || text.includes("[[") || text.includes("]]") || text.includes("'") || text.includes('"')) {
    return JSON.stringify(text);
  }
  return text;
}

function normalizeRelativePath(value, { requireMarkdown = true } = {}) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Workspace path is required.");
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid workspace path: ${value}`);
  }
  if (requireMarkdown && !normalized.endsWith(".md")) throw new Error(`Workspace note must be Markdown: ${value}`);
  return normalized;
}

function defaultRelativePath(type, title) {
  const directory = NOTE_DIRECTORIES[type];
  const filename = type === "project" ? "project.md" : `${safeFilename(title)}.md`;
  return directory ? `${directory}/${filename}` : filename;
}

function validateNotePathForType(type, relativePath) {
  const expectedDirectory = NOTE_DIRECTORIES[type];
  if (type === "project") {
    if (relativePath !== "project.md") throw new Error("Project note must be project.md.");
    return;
  }
  if (!relativePath.startsWith(`${expectedDirectory}/`)) {
    throw new Error(`Note path must be inside ${expectedDirectory}/ for type ${type}.`);
  }
}

function isNoteInExpectedDirectory(type, relativePath) {
  try {
    validateNotePathForType(type, relativePath);
    return true;
  } catch {
    return false;
  }
}

function requireNoteType(type) {
  if (!NOTE_TYPES.has(type)) throw new Error(`Invalid workspace note type: ${type}`);
  return type;
}

function defaultStatusForType(type) {
  if (type === "project") return "active";
  if (type === "rule") return "locked";
  if (type === "thread") return "open";
  return "drafting";
}

function safeFilename(value) {
  const source = String(value || "").normalize("NFC").trim();
  const cleaned = source
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 96)
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") throw new Error("A safe filename is required.");
  return cleaned;
}

function safeIdSegment(value) {
  return safeFilename(value).replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]/gu, "-");
}

function requireScalar(frontmatter, key, relativePath) {
  const value = scalarValue(frontmatter[key]);
  if (!value) throw new Error(`Missing ${key} in ${relativePath}`);
  return value;
}

function scalarValue(value) {
  return Array.isArray(value) ? "" : String(value || "");
}

function stringListValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  const scalar = scalarValue(value);
  return scalar ? [scalar] : [];
}

function createDefaultState() {
  return {
    version: STATE_VERSION,
    currentChapterPath: null,
    currentScenePath: null,
    selectedObjectPath: null,
    activeSurface: "project-home",
    localPreferences: {}
  };
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function pickDefined(value, keys) {
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

function contentHash(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function decodeReference(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function clone(value) {
  return structuredClone(value);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
