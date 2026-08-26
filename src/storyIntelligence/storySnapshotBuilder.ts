import { createHash } from "node:crypto";
import { listWorkspaceNotes, getWorkspaceNoteGuard, getWorkspaceProjectSummary } from "../storyWorkspace/index.mjs";

import type { StorySnapshot, StorySnapshotNote, StorySnapshotNoteType } from "./storyIntelligenceTypes.ts";

type WorkspaceNote = {
  id: string;
  relativePath: string;
  type: StorySnapshotNoteType;
  title: string;
  status: string;
  references: string[];
  body: string;
};

export function buildStorySnapshot(input: {
  workspacePath: string;
  selectedScenePath?: string;
  supplementalNotes?: StorySnapshotNote[];
  /**
   * Server-resolved note identities that must remain visible to a bounded
   * inference plan. This only changes the snapshot's selection set: it never
   * copies note bodies or creates another event/source authority.
   */
  explicitNoteIds?: string[];
}): StorySnapshot {
  const summary = getWorkspaceProjectSummary(input.workspacePath);
  const canonicalNotes = (listWorkspaceNotes(input.workspacePath) as WorkspaceNote[])
    .map(toSnapshotNote)
    .sort(compareNotes);
  const supplementalNotes = normalizeSupplementalNotes(input.supplementalNotes ?? []);
  const notes = [...canonicalNotes, ...supplementalNotes].sort(compareNotes);
  const byPath = new Map(notes.map((note) => [note.relativePath, note]));
  const project = byPath.get(summary.projectPath);

  if (!project) {
    throw new Error("Story Snapshot requires project.md.");
  }

  const selectedScenePath = input.selectedScenePath ?? summary.currentScenePath ?? null;
  const currentScene = selectedScenePath ? byPath.get(selectedScenePath) ?? null : null;
  const currentChapter = summary.currentChapterPath ? byPath.get(summary.currentChapterPath) ?? null : null;
  const selectedNoteRefs = currentScene
    ? selectedRefs(input.workspacePath, currentScene.relativePath, currentScene)
    : [];
  selectedNoteRefs.push(...supplementalNotes.map((note) => note.relativePath));
  const explicitNoteIds = normalizeExplicitNoteIds(input.explicitNoteIds ?? []);
  const explicitNotes = canonicalNotes.filter((note) => explicitNoteIds.has(note.id));
  if (explicitNotes.length !== explicitNoteIds.size) {
    throw new Error("Story Snapshot explicit source is unavailable.");
  }
  selectedNoteRefs.push(...explicitNotes.map((note) => note.relativePath));
  selectedNoteRefs.sort();
  const uniqueSelectedNoteRefs = [...new Set(selectedNoteRefs)];
  const snapshotWithoutHash = {
    version: "world-os-story-snapshot-v1" as const,
    project,
    currentChapter,
    currentScene,
    notes,
    selectedNoteRefs: uniqueSelectedNoteRefs,
    openThreads: notes.filter((note) => note.type === "thread" && !["closed", "resolved"].includes(note.status)),
    lockedRules: notes.filter((note) => note.type === "rule" && note.status === "locked"),
    recentAcceptedChanges: notes.filter((note) => ["accepted", "committed"].includes(note.status))
  };

  return {
    ...snapshotWithoutHash,
    snapshotHash: stableHash(snapshotWithoutHash),
    deterministic: true
  };
}

function normalizeExplicitNoteIds(value: string[]): Set<string> {
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("Story Snapshot explicit source references are invalid.");
  }
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u.test(id)) {
      throw new Error("Story Snapshot explicit source reference is invalid.");
    }
    ids.add(id);
  }
  return ids;
}

function normalizeSupplementalNotes(notes: StorySnapshotNote[]): StorySnapshotNote[] {
  const ids = new Set<string>();
  const paths = new Set<string>();
  return notes.map((note) => {
    if (!note || note.type !== "review" || !note.id || !note.relativePath.startsWith(".world-os/brief-sources/") || ids.has(note.id) || paths.has(note.relativePath)) {
      throw new Error("Story Snapshot supplemental Brief source is invalid or duplicated.");
    }
    ids.add(note.id);
    paths.add(note.relativePath);
    return {
      id: note.id,
      relativePath: note.relativePath,
      type: "review" as const,
      title: note.title.slice(0, 160),
      status: "current",
      links: [],
      evidenceExcerpt: note.evidenceExcerpt.slice(0, 240)
    };
  });
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function toSnapshotNote(note: WorkspaceNote): StorySnapshotNote {
  return {
    id: note.id,
    relativePath: note.relativePath,
    type: note.type,
    title: note.title,
    status: note.status,
    links: [...new Set(note.references)].sort(),
    evidenceExcerpt: firstEvidenceExcerpt(note.body)
  };
}

function selectedRefs(workspacePath: string, relativePath: string, currentScene: StorySnapshotNote): string[] {
  const guard = getWorkspaceNoteGuard(workspacePath, relativePath) as {
    guard: { linkedNotes: Array<{ relativePath: string }> };
  };
  return [...new Set([currentScene.relativePath, ...guard.guard.linkedNotes.map((note) => note.relativePath)])].sort();
}

function firstEvidenceExcerpt(body: string): string {
  const line = String(body)
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item !== "" && !/^#{1,6}\s/.test(item))
    .map((item) => item.replace(/^[-*+]\s+/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))
    .find(Boolean) ?? "";

  return line.slice(0, 240);
}

function compareNotes(left: StorySnapshotNote, right: StorySnapshotNote): number {
  return left.relativePath.localeCompare(right.relativePath);
}
