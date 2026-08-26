import type { SkillManifest } from "../skillControl/skillManifest.ts";
import type {
  MemoryEntry,
  MemorySearchHit,
  MemorySearchInput,
  MemorySearchResult,
  MemorySkillAdapter,
  MemorySnapshot,
  MemoryWriteInput,
  MemoryWriteResult
} from "./memorySkillContract.ts";

const MEMORY_PALACE_ADAPTER_ID = "memory_palace";
const STABLE_CREATED_AT = "1970-01-01T00:00:00.000Z";

export const MEMORY_PALACE_SKILL_MANIFEST: SkillManifest = {
  id: MEMORY_PALACE_ADAPTER_ID,
  name: "Memory Palace",
  domain: "memory",
  providerType: "builtin",
  description: "Built-in deterministic local memory for authoring projects.",
  version: "1.0.0",
  adapterStatus: "executable",
  capabilities: ["writeMemory", "searchMemory", "getMemory", "exportMemorySnapshot"],
  entrypoints: ["createMemoryPalaceSkill"],
  permissions: {
    readProject: true,
    writeProject: false,
    readMemory: true,
    writeMemory: true,
    useNetwork: false,
    useApiKey: false,
    executeLocalCommand: false
  },
  defaultEnabled: true,
  userConfigurable: true
};

export type MemoryPalaceOptions = {
  entries?: MemoryEntry[];
};

export function createMemoryPalaceSkill(options: MemoryPalaceOptions = {}): MemorySkillAdapter {
  const entries: MemoryEntry[] = (options.entries ?? []).map(cloneEntry).sort(compareEntries);

  return {
    adapterId: MEMORY_PALACE_ADAPTER_ID,
    writeMemory(input: MemoryWriteInput): MemoryWriteResult {
      const written = input.entries.map((entry, index) => {
        const memoryEntry: MemoryEntry = {
          id: createMemoryId(input.projectId, input.sourceRef, nextSourceIndex(entries, input.projectId, input.sourceRef) + index),
          projectId: input.projectId,
          chapterId: input.chapterId,
          sourceRef: input.sourceRef,
          kind: entry.kind,
          text: entry.text,
          tags: normalizeTags(entry.tags ?? []),
          importance: entry.importance ?? 1,
          createdAt: STABLE_CREATED_AT,
          metadata: cloneRecord(entry.metadata ?? {})
        };
        return memoryEntry;
      });

      entries.push(...written.map(cloneEntry));
      entries.sort(compareEntries);

      return {
        adapterId: MEMORY_PALACE_ADAPTER_ID,
        entries: written.map(cloneEntry)
      };
    },
    searchMemory(input: MemorySearchInput): MemorySearchResult {
      const limit = input.limit ?? entries.length;
      const hits = entries
        .filter((entry) => entry.projectId === input.projectId)
        .map((entry) => toSearchHit(entry, input))
        .filter((hit): hit is MemorySearchHit => hit !== undefined)
        .sort(compareHits);
      const limited = hits.slice(0, limit);

      return {
        results: limited.map((hit) => ({
          entry: cloneEntry(hit.entry),
          score: hit.score,
          matchedBy: [...hit.matchedBy]
        })),
        diagnostics: {
          adapterId: MEMORY_PALACE_ADAPTER_ID,
          queryMode: input.query ? "keyword" : "filters",
          matchedCount: hits.length,
          truncated: hits.length > limited.length
        }
      };
    },
    getMemory(id: string): MemoryEntry | undefined {
      const found = entries.find((entry) => entry.id === id);
      return found ? cloneEntry(found) : undefined;
    },
    exportMemorySnapshot(): MemorySnapshot {
      return {
        adapterId: MEMORY_PALACE_ADAPTER_ID,
        entries: entries.map(cloneEntry).sort(compareEntries)
      };
    }
  };
}

function toSearchHit(entry: MemoryEntry, input: MemorySearchInput): MemorySearchHit | undefined {
  const matchedBy: string[] = [];
  const queryTerms = splitQuery(input.query ?? "");
  const tags = normalizeTags(input.tags ?? []);

  if (input.chapterId && entry.chapterId !== input.chapterId) {
    return undefined;
  }
  if (input.kind && entry.kind !== input.kind) {
    return undefined;
  }
  if (tags.some((tag) => !entry.tags.includes(tag))) {
    return undefined;
  }

  if (queryTerms.length > 0) {
    const normalizedText = entry.text.toLocaleLowerCase();
    const queryMatch = queryTerms.some((term) => normalizedText.includes(term));
    const tagMatch = queryTerms.some((term) => entry.tags.some((tag) => tag.toLocaleLowerCase().includes(term)));
    if (!queryMatch && !tagMatch) {
      return undefined;
    }
    matchedBy.push("keyword");
  }
  if (tags.length > 0) {
    matchedBy.push("tag");
  }
  if (input.chapterId) {
    matchedBy.push("chapter");
  }
  if (input.kind) {
    matchedBy.push("kind");
  }

  return {
    entry,
    score: entry.importance,
    matchedBy: matchedBy.length > 0 ? matchedBy : ["project"]
  };
}

function nextSourceIndex(entries: MemoryEntry[], projectId: string, sourceRef: string): number {
  return entries.filter((entry) => entry.projectId === projectId && entry.sourceRef === sourceRef).length + 1;
}

function createMemoryId(projectId: string, sourceRef: string, index: number): string {
  return `memory-${safeSegment(projectId)}-${safeSegment(sourceRef)}-${String(index).padStart(3, "0")}`;
}

function safeSegment(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
}

function splitQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean)
    .sort();
}

function cloneEntry(entry: MemoryEntry): MemoryEntry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    chapterId: entry.chapterId,
    sourceRef: entry.sourceRef,
    kind: entry.kind,
    text: entry.text,
    tags: [...entry.tags],
    importance: entry.importance,
    createdAt: entry.createdAt,
    metadata: cloneRecord(entry.metadata)
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

function compareEntries(left: MemoryEntry, right: MemoryEntry): number {
  return left.id.localeCompare(right.id);
}

function compareHits(left: MemorySearchHit, right: MemorySearchHit): number {
  return left.entry.id.localeCompare(right.entry.id);
}
