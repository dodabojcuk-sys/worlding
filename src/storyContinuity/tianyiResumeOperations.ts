import { listStoppingPoints } from "./receiptStoppingRepositories.ts";
import type { ContinuityContext } from "./continuityFilesystem.ts";

export type TianyiSourceReturnTarget = { kind: "writing-document" | "world-object" | "visual-document"; id: string };

export function createTianyiResumeOperations(options: {
  rootPath: string;
  agentId?: string;
  readSource(projectId: string, sourceId: string): Promise<{ id: string; hash: string; label: string; target: TianyiSourceReturnTarget } | null>;
  readUnresolvedThreadIds?(projectId: string): Promise<string[]>;
}) {
  const agentId = requireId(options.agentId ?? "agent.tianyi");

  async function getTianyiProjectResume(input: { projectId: string; agentId: string }) {
    const projectId = requireProjectId(input.projectId);
    if (requireId(input.agentId) !== agentId) throw new Error("Agent identifier is not available.");
    const context: ContinuityContext = { rootPath: options.rootPath, agentId, scope: "project", projectId };
    const points = (await listStoppingPoints(context)).sort((left, right) => right.value.id.localeCompare(left.value.id));
    const latest = points[0];
    if (!latest) return { status: "none" as const, statement: "暂无由作者确认的创作停点。", sourceId: null, sourceTarget: null, unresolvedThreadIds: [] };
    if (latest.value.state === "revoked") return { status: "revoked" as const, statement: "The latest stopping point was revoked by the author.", sourceId: latest.value.source_id, sourceTarget: null, unresolvedThreadIds: [] };
    const source = await options.readSource(projectId, latest.value.source_id);
    const unresolvedThreadIds = [...new Set(await options.readUnresolvedThreadIds?.(projectId) ?? [])].sort();
    if (!source) return { status: "missing-source" as const, statement: "The saved stopping point source is no longer available.", sourceId: latest.value.source_id, sourceTarget: null, unresolvedThreadIds };
    if (source.hash !== latest.value.source_hash) return { status: "stale" as const, statement: `The saved stopping point for ${source.label} changed after the session closed.`, sourceId: source.id, sourceTarget: source.target, unresolvedThreadIds };
    return { status: "current" as const, statement: latest.value.body, sourceId: source.id, sourceTarget: source.target, unresolvedThreadIds };
  }

  return { getTianyiProjectResume };
}

function requireId(value: unknown): string { if (typeof value !== "string" || value.length > 96 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)) throw new Error("Product identifier is invalid."); return value; }
function requireProjectId(value: unknown): string { if (typeof value !== "string" || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) throw new Error("Project identifier is invalid."); return value; }
