import type { ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";

export type GlobalSearchScope = "global" | "directory" | "characters";
export type GlobalSearchResultType = "workspace" | "object" | "source" | "command";

/**
 * Every result carries the project/work-version context in which it was read.
 * `directoryReference` is present only when the existing directory contract
 * can represent the target as an object reference.
 */
export type GlobalSearchStableReference = {
  projectId: string | null;
  workVersionId: string | null;
  objectId: string | null;
  objectType: string | null;
  version: string | null;
  sourceId: string | null;
  directoryReference: ProjectDirectoryStableReference | null;
};

export type GlobalSearchNavigationTarget = {
  route: string;
  query?: Readonly<Record<string, string>>;
};

export type GlobalSearchResult = {
  id: string;
  title: string;
  type: GlobalSearchResultType;
  typeLabel: string;
  breadcrumb: readonly string[];
  stableReference: GlobalSearchStableReference;
  target: GlobalSearchNavigationTarget;
  matchReason: string;
};

export type GlobalSearchContext = {
  projectId: string | null;
  workVersionId: string | null;
};

export type GlobalSearchProjectContext = {
  projectId: string;
  workVersionId: string;
};

export type GlobalSearchObjectRecord = {
  id: string;
  title: string;
  type: "character" | "location" | "event" | "item" | "faction" | "rule" | "thread";
  aliases: readonly string[];
  tags: readonly string[];
  revision: string;
  sourceId: string | null;
};

export type GlobalSearchSourceRecord = {
  id: string;
  title: string;
  filename: string;
  revision: string;
  mode: "reference-only" | "extract-review";
};

export type GlobalSearchProjectReadModel = {
  context: GlobalSearchProjectContext;
  objects: readonly GlobalSearchObjectRecord[];
  sources: readonly GlobalSearchSourceRecord[];
};

export type GlobalSearchReadAdapter = {
  read(context: GlobalSearchProjectContext): Promise<GlobalSearchProjectReadModel>;
};

export type GlobalSearchLabels = {
  trigger: string;
  placeholder: string;
  dialogLabel: string;
  close: string;
  noResults: string;
  scopeGlobal: string;
  scopeDirectory: string;
  scopeCharacters: string;
  resultCount: (count: number) => string;
  resultType: Record<GlobalSearchResultType, string>;
  matchReason: Record<"title" | "alias" | "tag" | "type" | "command", string>;
};
