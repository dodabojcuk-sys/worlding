import { STORY_STUDIO_SHELL_NAVIGATION_REGISTRY } from "../../../../../src/storyContracts/storyStudioWorkspaceRegistry.ts";

import type {
  GlobalSearchContext,
  GlobalSearchObjectRecord,
  GlobalSearchProjectReadModel,
  GlobalSearchProjectContext,
  GlobalSearchReadAdapter,
  GlobalSearchResult,
  GlobalSearchScope,
  GlobalSearchSourceRecord,
  GlobalSearchStableReference
} from "./globalSearchTypes";

const objectTypeLabels: Record<GlobalSearchObjectRecord["type"], string> = {
  character: "角色",
  item: "物品",
  location: "地点",
  faction: "组织",
  rule: "规则",
  event: "事件",
  thread: "故事线"
};

export type GlobalSearchRequest = {
  query: string;
  scope: GlobalSearchScope;
  context: GlobalSearchContext;
};

export type GlobalSearchEngine = { search(request: GlobalSearchRequest): Promise<readonly GlobalSearchResult[]> };

/**
 * The sole R0.6 search engine. It only aggregates existing route and read
 * projections; it neither writes data nor builds an index or embedding store.
 */
export function createGlobalSearchEngine(readAdapter: GlobalSearchReadAdapter): GlobalSearchEngine {
  return {
    async search(request) {
      const context = requireSearchContext(request.context);
      const normalized = normalize(request.query);
      const includeProject = request.scope !== "global" || Boolean(context.projectId);
      const projectContext = context.projectId && context.workVersionId
        ? { projectId: context.projectId, workVersionId: context.workVersionId }
        : null;
      const project = includeProject && projectContext
        ? await readAdapter.read(projectContext)
        : null;
      if (project && (project.context.projectId !== context.projectId || project.context.workVersionId !== context.workVersionId)) {
        throw new Error("Global search rejected a read projection from another project or work version.");
      }
      const routeResults = request.scope === "global" ? searchRoutes(normalized, context) : [];
      const commandResults = request.scope === "global" ? searchNavigationCommands(normalized, context) : [];
      const objectResults = project ? searchObjects(project, normalized, request.scope) : [];
      const sourceResults = project && request.scope !== "characters" ? searchSources(project, normalized) : [];
      return [...routeResults, ...objectResults, ...sourceResults, ...commandResults].slice(0, 60);
    }
  };
}

function requireSearchContext(context: GlobalSearchContext): GlobalSearchContext {
  if ((context.projectId === null) !== (context.workVersionId === null)) throw new Error("Global search requires project and work-version context together.");
  return context;
}

function searchRoutes(query: string, context: GlobalSearchContext): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];
  for (const destination of STORY_STUDIO_SHELL_NAVIGATION_REGISTRY) {
    if (!destination.enabled) continue;
    const match = matchText(query, [
      { value: destination.displayName, reason: "title" },
      { value: destination.id, reason: "type" },
      { value: destination.route, reason: "type" }
    ]);
    if (!match) continue;
    results.push({
      id: `workspace:${destination.id}`,
      title: destination.displayName,
      type: "workspace" as const,
      typeLabel: "工作空间",
      breadcrumb: ["天衍", destination.kind === "derived" ? "派生产物" : "工作空间"],
      stableReference: contextReference(context),
      target: { route: destination.route },
      matchReason: match.reason
    });
  }
  return results;
}

function searchNavigationCommands(query: string, context: GlobalSearchContext): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];
  for (const destination of STORY_STUDIO_SHELL_NAVIGATION_REGISTRY) {
    if (!destination.enabled) continue;
    const match = matchText(query, ["前往", "navigate", destination.displayName, destination.id, destination.route].map((value) => ({ value, reason: "command" as const })));
    if (!match) continue;
    results.push({
      id: `command:navigate:${destination.id}`,
      title: `前往 ${destination.displayName}`,
      type: "command" as const,
      typeLabel: "导航命令",
      breadcrumb: ["命令", "导航"],
      stableReference: contextReference(context),
      target: { route: destination.route },
      matchReason: "command"
    });
  }
  return results;
}

function searchObjects(project: GlobalSearchProjectReadModel, query: string, scope: GlobalSearchScope): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];
  for (const object of project.objects) {
    if (scope === "characters" && object.type !== "character") continue;
    const match = matchText(query, [
      { value: object.title, reason: "title" },
      ...object.aliases.map((value) => ({ value, reason: "alias" as const })),
      ...object.tags.map((value) => ({ value, reason: "tag" as const })),
      { value: objectTypeLabels[object.type], reason: "type" },
      { value: object.type, reason: "type" }
    ]);
    if (!match) continue;
    const route = object.type === "event" || object.type === "thread" ? "/event-line" : "/library";
    const queryParams: Record<string, string> = {
      directoryObject: object.id,
      directoryProject: project.context.projectId,
      directoryVersion: object.revision,
      directoryType: object.type
    };
    if (object.type === "character") queryParams.directoryView = "characters";
    results.push({
      id: `object:${project.context.projectId}:${project.context.workVersionId}:${object.id}`,
      title: object.title,
      type: "object" as const,
      typeLabel: objectTypeLabels[object.type],
      breadcrumb: ["资料", objectTypeLabels[object.type]],
      stableReference: objectReference(project.context, object),
      target: { route, query: queryParams },
      matchReason: match.reason
    });
  }
  return results;
}

function searchSources(project: GlobalSearchProjectReadModel, query: string): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];
  for (const source of project.sources) {
    const match = matchText(query, [
      { value: source.title, reason: "title" },
      { value: source.filename, reason: "title" },
      { value: source.mode, reason: "type" },
      { value: "资料", reason: "type" },
      { value: "来源", reason: "type" }
    ]);
    if (!match) continue;
    results.push({
      id: `source:${project.context.projectId}:${project.context.workVersionId}:${source.id}`,
      title: source.title,
      type: "source" as const,
      typeLabel: "来源资料",
      breadcrumb: ["资料", "来源"],
      stableReference: sourceReference(project.context, source),
      target: {
        route: "/library",
        query: {
          directorySource: source.id,
          directoryProject: project.context.projectId,
          directoryWorkVersion: project.context.workVersionId,
          directoryVersion: source.revision
        }
      },
      matchReason: match.reason
    });
  }
  return results;
}

function contextReference(context: GlobalSearchContext): GlobalSearchStableReference {
  return { projectId: context.projectId, workVersionId: context.workVersionId, objectId: null, objectType: null, version: null, sourceId: null, directoryReference: null };
}

function objectReference(context: GlobalSearchProjectContext, object: GlobalSearchObjectRecord): GlobalSearchStableReference {
  const directoryReference = { objectId: object.id, version: object.revision, sourceId: object.sourceId, projectId: context.projectId, workVersionId: context.workVersionId, objectType: object.type };
  return { ...directoryReference, directoryReference };
}

function sourceReference(context: GlobalSearchProjectContext, source: GlobalSearchSourceRecord): GlobalSearchStableReference {
  return { projectId: context.projectId, workVersionId: context.workVersionId, objectId: source.id, objectType: "source-document", version: source.revision, sourceId: source.id, directoryReference: null };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

type MatchReason = GlobalSearchResult["matchReason"];
function matchText(query: string, candidates: readonly { value: string; reason: MatchReason }[]): { reason: MatchReason } | null {
  if (!query) return { reason: candidates[0]?.reason ?? "title" };
  const exact = candidates.find((candidate) => normalize(candidate.value) === query);
  if (exact) return { reason: exact.reason };
  const partial = candidates.find((candidate) => normalize(candidate.value).includes(query));
  if (partial) return { reason: partial.reason };
  return null;
}
