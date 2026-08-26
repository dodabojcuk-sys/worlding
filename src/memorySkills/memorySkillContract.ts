export type MemoryEntryKind =
  | "character_state"
  | "story_fact"
  | "world_rule"
  | "timeline"
  | "open_loop"
  | "reader_promise"
  | "relationship";

export type MemoryWriteInput = {
  projectId: string;
  chapterId?: string;
  sourceRef: string;
  entries: {
    kind: MemoryEntryKind;
    text: string;
    tags?: string[];
    importance?: number;
    metadata?: Record<string, unknown>;
  }[];
};

export type MemoryEntry = {
  id: string;
  projectId: string;
  chapterId?: string;
  sourceRef: string;
  kind: MemoryEntryKind;
  text: string;
  tags: string[];
  importance: number;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type MemoryWriteResult = {
  adapterId: string;
  entries: MemoryEntry[];
};

export type MemorySearchInput = {
  projectId: string;
  query?: string;
  tags?: string[];
  chapterId?: string;
  kind?: MemoryEntryKind;
  limit?: number;
};

export type MemorySearchHit = {
  entry: MemoryEntry;
  score: number;
  matchedBy: string[];
};

export type MemorySearchResult = {
  results: MemorySearchHit[];
  diagnostics: {
    adapterId: string;
    queryMode: "keyword" | "filters";
    matchedCount: number;
    truncated: boolean;
  };
};

export type MemorySnapshot = {
  adapterId: string;
  entries: MemoryEntry[];
};

export type MemorySkillAdapter = {
  adapterId: string;
  writeMemory: (input: MemoryWriteInput) => MemoryWriteResult;
  searchMemory: (input: MemorySearchInput) => MemorySearchResult;
  getMemory: (id: string) => MemoryEntry | undefined;
  exportMemorySnapshot: () => MemorySnapshot;
};
