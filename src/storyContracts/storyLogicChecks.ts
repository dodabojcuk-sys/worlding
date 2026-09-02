import type { StoryLogicFinding } from "./storyModeling.ts";

export type LocalLogicEvent = { id: string; revisionToken: string; status: string; tags: readonly string[] };
export type LocalLogicRelation = { relationId: string; sourceEventId: string; targetEventId: string; reviewState: string; relationTypeId?: string | null; relationTypeResolution?: string | null };

/** Deterministic, network-free integrity checks for the current Event projection. */
export function runLocalStoryLogicChecks(input: {
  events: readonly LocalLogicEvent[];
  relations: readonly LocalLogicRelation[];
  unitIds?: readonly string[];
  cachedEventRevisions?: Readonly<Record<string, string>>;
}): StoryLogicFinding[] {
  const findings: StoryLogicFinding[] = [];
  const eventIds = new Set(input.events.map((event) => event.id));
  const duplicateIds = duplicated(input.events.map((event) => event.id));
  for (const eventId of duplicateIds) findings.push(finding("duplicate-id", "blocker", [eventId], [], [`event:${eventId}`], "同一事件身份在当前投影中出现多次。", "继续连线或建模会产生歧义。"));
  for (const relation of input.relations) {
    const missing = [relation.sourceEventId, relation.targetEventId].filter((eventId) => !eventIds.has(eventId));
    if (missing.length) findings.push(finding("dangling-relation", "blocker", missing, [], [`relation:${relation.relationId}`], "关系端点在当前事件投影中不存在。", "关系无法被可靠定位。"));
    if (relation.reviewState === "candidate" && (!relation.relationTypeId || relation.relationTypeResolution === "unresolved")) findings.push(finding("unresolved-relation-type", "warning", [relation.sourceEventId, relation.targetEventId].filter((id) => eventIds.has(id)), [], [`relation:${relation.relationId}`], "候选关系尚未确定类型。", "作者确认前必须选择或补充关系类型。"));
  }
  for (const event of input.events) {
    const cached = input.cachedEventRevisions?.[event.id];
    if (cached && cached !== event.revisionToken) findings.push(finding("stale-version", "warning", [event.id], [], [`event:${event.id}`], "缓存引用的事件版本已变化。", "依赖旧版本的候选需要重新检查。"));
    const unit = taggedValue(event.tags, ["Story Unit", "Unit", "故事单元", "单元"]);
    if (unit && input.unitIds?.length && !input.unitIds.includes(unit)) findings.push(finding("orphan-unit-reference", "warning", [event.id], [unit], [`event:${event.id}`], "事件引用了当前目录中不存在的单元。", "故事结构投影可能遗漏该事件。"));
  }
  const confirmed = input.relations.filter((relation) => relation.reviewState === "confirmed" && eventIds.has(relation.sourceEventId) && eventIds.has(relation.targetEventId));
  for (const cycle of directedCycles(confirmed)) findings.push(finding("temporal-cycle", "blocker", cycle, [], cycle.map((id) => `event:${id}`), "严格先后关系形成循环。", "这些事件不能同时满足当前时间顺序。"));
  return dedupeFindings(findings);
}

function finding(kind: StoryLogicFinding["kind"], severity: StoryLogicFinding["severity"], eventIds: string[], unitIds: string[], evidenceRefs: string[], rationale: string, impact: string): StoryLogicFinding {
  const identity = [kind, ...eventIds, ...unitIds].join(".").replace(/[^\p{L}\p{N}._:-]+/gu, "-");
  return { findingId: `logic-finding.local.${identity}`, kind, source: "local", severity, confidence: 1, affectedEventIds: [...new Set(eventIds)], affectedUnitIds: [...new Set(unitIds)], affectedAgentIds: [], evidenceRefs: [...new Set(evidenceRefs)], rationale, impact, authorStatus: "pending" };
}
function duplicated(values: readonly string[]): string[] { const seen = new Set<string>(), repeated = new Set<string>(); for (const value of values) { if (seen.has(value)) repeated.add(value); else seen.add(value); } return [...repeated]; }
function taggedValue(tags: readonly string[], prefixes: readonly string[]): string | null { for (const tag of tags) for (const prefix of prefixes) { const value = new RegExp(`^${prefix}[\uff1a:]\\s*(.+)$`, "iu").exec(tag)?.[1]?.trim(); if (value) return value; } return null; }
function directedCycles(relations: readonly LocalLogicRelation[]): string[][] {
  const outgoing = new Map<string, string[]>();
  for (const relation of relations) outgoing.set(relation.sourceEventId, [...(outgoing.get(relation.sourceEventId) ?? []), relation.targetEventId]);
  const cycles: string[][] = [], visiting = new Set<string>(), visited = new Set<string>(), stack: string[] = [];
  const visit = (id: string) => { if (visiting.has(id)) { const start = stack.indexOf(id); if (start >= 0) cycles.push(stack.slice(start)); return; } if (visited.has(id)) return; visiting.add(id); stack.push(id); for (const next of outgoing.get(id) ?? []) visit(next); stack.pop(); visiting.delete(id); visited.add(id); };
  for (const id of outgoing.keys()) visit(id);
  return cycles;
}
function dedupeFindings(findings: StoryLogicFinding[]): StoryLogicFinding[] { return [...new Map(findings.map((finding) => [finding.findingId, finding])).values()]; }
