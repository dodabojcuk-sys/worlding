import { createHash } from "node:crypto";

export type TianyiSimulationIntent = "PAYOFF" | "FORECAST" | "INFERENCE" | "DIVERGENCE" | "DIAGNOSIS";
export type TianyiSimulationSourceRole = "ANCHOR" | "EVIDENCE" | "CONSTRAINT" | "INSPIRATION" | "EXCLUDED";
export type TianyiSimulationAuthority = "canon" | "confirmed-event" | "formal-relation" | "draft" | "candidate" | "creation-projection" | "derived-branch" | "author-input" | "ai-signal";
export type TianyiSimulationEntryPoint = "tianyi" | "event-line" | "creation";
export type TianyiSimulationSourceState = "READY" | "AMBIGUOUS" | "INSUFFICIENT" | "CONFLICTED";

export type TianyiSimulationSource = {
  sourceId: string;
  sourceType: string;
  sourceRole: TianyiSimulationSourceRole;
  authorityLevel: TianyiSimulationAuthority;
  revisionOrDigest: string;
  displayTitle: string;
  inclusionReason: string;
  entryPoint: TianyiSimulationEntryPoint;
  branchOrUniverse: string | null;
  authorSelected: boolean;
};

export type TianyiSimulationContextPack = {
  version: "tianyi-simulation-context-pack/v1";
  snapshotId: string;
  intent: TianyiSimulationIntent;
  sourceState: TianyiSimulationSourceState;
  entryPoint: TianyiSimulationEntryPoint;
  sources: TianyiSimulationSource[];
  omitted: Array<{ sourceId: string; reason: string }>;
  estimatedTokens: number;
  maxProviderCalls: 1;
};

export function inferTianyiSimulationIntent(authorIntent: string): TianyiSimulationIntent {
  const text = authorIntent.trim();
  if (/(?:伏笔|线索|回收|悬念|承诺)/u.test(text)) return "PAYOFF";
  if (/(?:隐藏|推测|谁最可能|依据.*证据)/u.test(text)) return "INFERENCE";
  if (/(?:不同(?:的)?思路|新思路|创意|发散|新设定)/u.test(text)) return "DIVERGENCE";
  if (/(?:问题|断裂|冲突|诊断|缺口)/u.test(text)) return "DIAGNOSIS";
  return "FORECAST";
}

/** Deterministic, application-owned selection. Pi receives only `sources`. */
export function buildTianyiSimulationContextPack(input: {
  entryPoint: TianyiSimulationEntryPoint;
  intent: TianyiSimulationIntent;
  sources: readonly Omit<TianyiSimulationSource, "sourceRole" | "entryPoint" | "authorSelected">[];
  anchorId?: string | null;
  strict?: boolean;
  maxSources?: number;
}): TianyiSimulationContextPack {
  const maxSources = input.maxSources ?? 16;
  const seen = new Set<string>();
  const included: TianyiSimulationSource[] = [];
  const omitted: Array<{ sourceId: string; reason: string }> = [];
  for (const candidate of input.sources) {
    if (seen.has(candidate.sourceId)) continue;
    seen.add(candidate.sourceId);
    const explicitlySelected = candidate.sourceId === input.anchorId;
    // Default isolation applies only to material the author did not select for
    // this run. A draft, pending candidate, or creation projection can be the
    // declared starting point without acquiring confirmed authority.
    const excluded = !explicitlySelected && (candidate.authorityLevel === "derived-branch" || candidate.authorityLevel === "candidate");
    if (excluded) { omitted.push({ sourceId: candidate.sourceId, reason: "默认隔离的派生或未确认内容" }); continue; }
    if (included.length >= maxSources) { omitted.push({ sourceId: candidate.sourceId, reason: "超出本次来源预算" }); continue; }
    included.push({ ...candidate, sourceRole: explicitlySelected ? "ANCHOR" : roleFor(candidate.authorityLevel), entryPoint: input.entryPoint, authorSelected: explicitlySelected });
  }
  const hasAnchor = included.some((source) => source.sourceRole === "ANCHOR");
  const sourceState: TianyiSimulationSourceState = input.strict && !hasAnchor ? "INSUFFICIENT" : hasAnchor ? "READY" : "AMBIGUOUS";
  const estimatedTokens = included.reduce((total, source) => total + Math.ceil((source.displayTitle.length + source.inclusionReason.length) / 4), 0);
  const snapshot = { entryPoint: input.entryPoint, intent: input.intent, sources: included.map(({ sourceId, sourceRole, revisionOrDigest }) => [sourceId, sourceRole, revisionOrDigest]), omitted };
  return { version: "tianyi-simulation-context-pack/v1", snapshotId: `simulation-source-${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 24)}`, intent: input.intent, sourceState, entryPoint: input.entryPoint, sources: included, omitted, estimatedTokens, maxProviderCalls: 1 };
}

function roleFor(authority: TianyiSimulationAuthority): TianyiSimulationSourceRole {
  return authority === "canon" || authority === "confirmed-event" || authority === "formal-relation" ? "CONSTRAINT" : authority === "creation-projection" ? "INSPIRATION" : "EVIDENCE";
}
