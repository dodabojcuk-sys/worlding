import type { ContextReceiptSource, TianyiResponseClassification } from "./continuityTypes.ts";
import { graphemeCount, TIANYI_MAX_ACTUAL_SOURCES, TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES, TIANYI_MAX_SOURCE_LINES, TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES } from "./boundedSourceMaterial.ts";
import {
  TIANYI_CONTEXT_PROJECTION_VERSION,
  normalizeTianyiContextProjection,
  type TianyiContextProjection
} from "./tianyiContextProjection.ts";

export { TIANYI_CONTEXT_PROJECTION_VERSION } from "./tianyiContextProjection.ts";
export type { TianyiContextProjection } from "./tianyiContextProjection.ts";

export const TIANYI_FIXTURE_ADAPTER_ID = "tianyi.fixture" as const;
export const TIANYI_FIXTURE_ADAPTER_VERSION = "1.0.0" as const;

export type TianyiFixtureAction =
  | "fixture.current"
  | "fixture.stale"
  | "fixture.missing-source"
  | "fixture.memory-candidate"
  | "fixture.candidate-rejection"
  | "fixture.policy-denied"
  | "fixture.offline"
  | "fixture.session-close";

export type TianyiRuntimeInput = {
  agent: { id: string; personaRevision: number; relationshipPolicyRevision: number };
  context: TianyiContextProjection;
  sourceMaterials: ContextReceiptSource[];
  archiveMessages: Array<{
    projectId: string;
    sessionId: string;
    eventId: string;
    sequence: number;
    actor: "author" | "tianyi";
    recordedAt: string;
    contentHash: string;
    excerpt: string;
  }>;
  request: { authorQuery?: string; boundedAction?: TianyiFixtureAction };
  approvedMemoryRefs: Array<{ id: string; contentHash: string }>;
  enabledSkillRefs: Array<{ id: string; version: string }>;
  providerTransferDecision: "deny";
  outputBudget: { maxVisibleChars: number; maxMemoryCandidates: number };
};

export type TianyiRuntimeOutput = {
  visibleResponse: string;
  classifications: TianyiResponseClassification[];
  memoryCandidates: Array<{
    statement: string;
    scope: "author-global" | "project";
    kind: string;
    sensitivity: "ordinary" | "personal" | "sensitive" | "restricted";
    sourceRefs: string[];
  }>;
  contextReceiptDraft: { usedSourceIds: string[]; usedMemoryIds: string[]; usedSkillRefs: string[]; usedArchiveMessageRefs: string[] };
  runtimeProvenance: { mode: "deterministic"; adapterId: typeof TIANYI_FIXTURE_ADAPTER_ID; adapterVersion: typeof TIANYI_FIXTURE_ADAPTER_VERSION };
  failure: null | "offline" | "invalid-context" | "stale-context" | "policy-denied" | "execution-failed";
};

export interface TianyiRuntimeAdapter {
  run(input: TianyiRuntimeInput): Promise<TianyiRuntimeOutput>;
}

const MACHINE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MANIPULATIVE_COPY_PATTERNS = [
  /\b(?:you owe me|do not leave me|don't leave me|only need me|choose me over)\b/iu,
  /\b(?:jealous|possessive|exclusive relationship|romantic partner|intimate partner)\b/iu,
  /\b(?:streak|absence punishment|missed me|i need you|i was waiting for you)\b/iu,
  /(?:别离开我|你只需要我|我在等你|我想念你|我需要你|连续陪伴|关系分数)/u
] as const;

export const tianyiFixtureAdapter: TianyiRuntimeAdapter = {
  async run(input) {
    const normalized = normalizeTianyiRuntimeInput(input);
    const scenario = normalized.request.boundedAction ?? "fixture.current";
    const result = fixtureResult(normalized, scenario);
    assertRelationshipSafeCopy(result.visibleResponse);
    return normalizeTianyiRuntimeOutput(result, normalized.outputBudget);
  }
};

export function normalizeTianyiRuntimeInput(value: unknown): TianyiRuntimeInput {
  const input = requireObject(value, "Tianyi runtime input");
  exact(input, ["agent", "context", "sourceMaterials", "request", "approvedMemoryRefs", "enabledSkillRefs", "providerTransferDecision", "outputBudget"], "Tianyi runtime input", ["archiveMessages"]);
  const agent = requireObject(input.agent, "Tianyi runtime Agent");
  exact(agent, ["id", "personaRevision", "relationshipPolicyRevision"], "Tianyi runtime Agent");
  const request = requireObject(input.request, "Tianyi runtime request");
  for (const key of Object.keys(request)) if (key !== "authorQuery" && key !== "boundedAction") throw new Error("Tianyi runtime request contains an unknown field.");
  if (("authorQuery" in request) === ("boundedAction" in request)) throw new Error("Tianyi runtime request requires exactly one query or bounded action.");
  const context = normalizeTianyiContextProjection(input.context);
  const sourceMaterials = normalizeSourceMaterials(input.sourceMaterials, context);
  const archiveMessages = normalizeArchiveMessages(input.archiveMessages ?? [], context.projectId);
  const approvedMemoryRefs = array(input.approvedMemoryRefs, "Approved Memory references", 32).map((item) => {
    const ref = requireObject(item, "Approved Memory reference");
    exact(ref, ["id", "contentHash"], "Approved Memory reference");
    return { id: id(ref.id, "Approved Memory identifier"), contentHash: hash(ref.contentHash, "Approved Memory hash") };
  });
  const enabledSkillRefs = array(input.enabledSkillRefs, "Enabled Skill references", 32).map((item) => {
    const ref = requireObject(item, "Enabled Skill reference");
    exact(ref, ["id", "version"], "Enabled Skill reference");
    return { id: id(ref.id, "Skill identifier"), version: text(ref.version, "Skill version", 40) };
  });
  const outputBudget = requireObject(input.outputBudget, "Tianyi runtime output budget");
  exact(outputBudget, ["maxVisibleChars", "maxMemoryCandidates"], "Tianyi runtime output budget");
  if (input.providerTransferDecision !== "deny") throw new Error("The deterministic fixture denies provider transfer.");
  if (agent.personaRevision !== context.persona.revision || agent.relationshipPolicyRevision !== context.relationshipPolicy.revision) throw new Error("Tianyi runtime Agent revisions do not match the projection.");
  if (JSON.stringify(approvedMemoryRefs) !== JSON.stringify(context.approvedMemoryRefs.map((memory) => ({ id: memory.id, contentHash: memory.contentHash })))) throw new Error("Tianyi approved Memory does not match the projection.");
  if (JSON.stringify(enabledSkillRefs) !== JSON.stringify(context.enabledSkillRefs)) throw new Error("Tianyi enabled Skills do not match the projection.");
  return {
    agent: {
      id: id(agent.id, "Tianyi Agent identifier"),
      personaRevision: positive(agent.personaRevision, "Tianyi Persona revision"),
      relationshipPolicyRevision: positive(agent.relationshipPolicyRevision, "Tianyi policy revision")
    },
    context,
    request: "authorQuery" in request
      ? { authorQuery: text(request.authorQuery, "Author query", 4_000) }
      : { boundedAction: oneOf(request.boundedAction, ["fixture.current", "fixture.stale", "fixture.missing-source", "fixture.memory-candidate", "fixture.candidate-rejection", "fixture.policy-denied", "fixture.offline", "fixture.session-close"] as const, "Tianyi fixture action") },
    sourceMaterials,
    archiveMessages,
    approvedMemoryRefs,
    enabledSkillRefs,
    providerTransferDecision: "deny",
    outputBudget: {
      maxVisibleChars: boundedInteger(outputBudget.maxVisibleChars, "Visible response budget", 1, 8_000),
      maxMemoryCandidates: boundedInteger(outputBudget.maxMemoryCandidates, "Memory candidate budget", 0, 8)
    }
  } satisfies TianyiRuntimeInput;
}

export function normalizeTianyiRuntimeOutput(value: unknown, budget: TianyiRuntimeInput["outputBudget"]): TianyiRuntimeOutput {
  const output = requireObject(value, "Tianyi runtime output");
  exact(output, ["visibleResponse", "classifications", "memoryCandidates", "contextReceiptDraft", "runtimeProvenance", "failure"], "Tianyi runtime output");
  const visibleResponse = text(output.visibleResponse, "Tianyi visible response", budget.maxVisibleChars);
  assertRelationshipSafeCopy(visibleResponse);
  const classifications = array(output.classifications, "Tianyi classifications", 4).map((item) => oneOf(item, ["confirmed-fact", "inference", "candidate-suggestion", "unavailable-evidence"] as const, "Tianyi classification"));
  const memoryCandidates = array(output.memoryCandidates, "Tianyi Memory candidates", budget.maxMemoryCandidates).map((item) => {
    const candidate = requireObject(item, "Tianyi Memory candidate");
    exact(candidate, ["statement", "scope", "kind", "sensitivity", "sourceRefs"], "Tianyi Memory candidate");
    return {
      statement: text(candidate.statement, "Memory candidate statement", 2_000),
      scope: oneOf(candidate.scope, ["author-global", "project"] as const, "Memory candidate scope"),
      kind: oneOf(candidate.kind, ["working-preference", "shared-decision", "unresolved-thread", "author-provided-fact", "continuity-note"] as const, "Memory candidate kind"),
      sensitivity: oneOf(candidate.sensitivity, ["ordinary", "personal", "sensitive", "restricted"] as const, "Memory candidate sensitivity"),
      sourceRefs: array(candidate.sourceRefs, "Memory candidate sources", 32).map((item) => id(item, "Memory candidate source identifier"))
    };
  });
  const draft = requireObject(output.contextReceiptDraft, "Context Receipt draft");
  exact(draft, ["usedSourceIds", "usedMemoryIds", "usedSkillRefs"], "Context Receipt draft", ["usedArchiveMessageRefs"]);
  const provenance = requireObject(output.runtimeProvenance, "Tianyi runtime provenance");
  exact(provenance, ["mode", "adapterId", "adapterVersion"], "Tianyi runtime provenance");
  if (provenance.mode !== "deterministic" || provenance.adapterId !== TIANYI_FIXTURE_ADAPTER_ID || provenance.adapterVersion !== TIANYI_FIXTURE_ADAPTER_VERSION) throw new Error("Tianyi runtime provenance is invalid.");
  return {
    visibleResponse,
    classifications,
    memoryCandidates,
    contextReceiptDraft: {
      usedSourceIds: array(draft.usedSourceIds, "Receipt draft sources", 8).map((item) => id(item, "Receipt draft source identifier")),
      usedMemoryIds: array(draft.usedMemoryIds, "Receipt draft Memories", 64).map((item) => id(item, "Receipt draft Memory identifier")),
      usedSkillRefs: array(draft.usedSkillRefs, "Receipt draft Skills", 32).map((item) => text(item, "Receipt draft Skill reference", 140)),
      usedArchiveMessageRefs: array(draft.usedArchiveMessageRefs ?? [], "Receipt draft Archive messages", 8).map((item) => id(item, "Receipt draft Archive event identifier"))
    },
    runtimeProvenance: { mode: "deterministic", adapterId: TIANYI_FIXTURE_ADAPTER_ID, adapterVersion: TIANYI_FIXTURE_ADAPTER_VERSION },
    failure: output.failure === null ? null : oneOf(output.failure, ["offline", "invalid-context", "stale-context", "policy-denied", "execution-failed"] as const, "Tianyi failure")
  };
}

export function assertRelationshipSafeCopy(value: string): void {
  for (const pattern of MANIPULATIVE_COPY_PATTERNS) if (pattern.test(value)) throw new Error("Tianyi copy violates the Relationship Policy.");
  if (/\b(?:i am conscious|i am human|i have feelings|i love you)\b/iu.test(value) || /(?:我有意识|我是人类|我爱你)/u.test(value)) throw new Error("Tianyi copy makes a prohibited identity or intimacy claim.");
}

function fixtureResult(input: TianyiRuntimeInput, scenario: TianyiFixtureAction): TianyiRuntimeOutput {
  const base = {
    contextReceiptDraft: {
      usedSourceIds: input.sourceMaterials.map((item) => item.id),
      usedMemoryIds: input.approvedMemoryRefs.map((item) => item.id),
      usedSkillRefs: input.enabledSkillRefs.map((item) => `${item.id}@${item.version}`),
      usedArchiveMessageRefs: input.archiveMessages.map((item) => item.eventId)
    },
    runtimeProvenance: { mode: "deterministic" as const, adapterId: TIANYI_FIXTURE_ADAPTER_ID, adapterVersion: TIANYI_FIXTURE_ADAPTER_VERSION }
  };
  if (scenario === "fixture.stale") return { ...base, visibleResponse: "所选上下文已经变化，请先核对来源再继续。", classifications: ["unavailable-evidence"], memoryCandidates: [], failure: "stale-context" };
  if (scenario === "fixture.missing-source") return { ...base, visibleResponse: "当前项目上下文中无法读取所选来源。", classifications: ["unavailable-evidence"], memoryCandidates: [], failure: "invalid-context" };
  if (scenario === "fixture.policy-denied") return { ...base, visibleResponse: "这项请求超出了当前关系策略允许的边界。", classifications: ["unavailable-evidence"], memoryCandidates: [], failure: "policy-denied" };
  if (scenario === "fixture.offline") return { ...base, visibleResponse: "可选运行能力当前离线，本地连续性记录仍可读取。", classifications: ["unavailable-evidence"], memoryCandidates: [], failure: "offline" };
  if (scenario === "fixture.session-close") return { ...base, visibleResponse: "本次创作可以交由作者收口；系统没有自动保存记忆或创作停点。", classifications: ["confirmed-fact", "candidate-suggestion"], memoryCandidates: [], failure: null };
  if (scenario === "fixture.memory-candidate") return {
    ...base,
    visibleResponse: "当前证据支持提出一条可审阅的工作偏好候选。",
    classifications: ["inference", "candidate-suggestion"],
    memoryCandidates: [{ statement: "作者倾向于先核对来源证据，再修改当前场景。", scope: "project", kind: "working-preference", sensitivity: "ordinary", sourceRefs: (base.contextReceiptDraft.usedArchiveMessageRefs.length > 0 ? base.contextReceiptDraft.usedArchiveMessageRefs : base.contextReceiptDraft.usedSourceIds).slice(0, 1) }],
    failure: null
  };
  if (scenario === "fixture.candidate-rejection") return { ...base, visibleResponse: "这条候选已被拒绝，没有创建持久记忆。", classifications: ["confirmed-fact"], memoryCandidates: [], failure: null };
  return { ...base, visibleResponse: input.archiveMessages.length > 0 ? "所选历史消息与当前来源共同确认了这份有界上下文。" : "当前来源确认了所选上下文。", classifications: ["confirmed-fact"], memoryCandidates: [], failure: null };
}

function normalizeArchiveMessages(value: unknown, projectId: string): TianyiRuntimeInput["archiveMessages"] {
  const seen = new Set<string>();
  let total = 0;
  return array(value, "Tianyi Archive messages", 8).map((item) => {
    const input = requireObject(item, "Tianyi Archive message");
    exact(input, ["projectId", "sessionId", "eventId", "sequence", "actor", "recordedAt", "contentHash", "excerpt"], "Tianyi Archive message");
    if (input.projectId !== projectId) throw new Error("Tianyi Archive message project does not match the current projection.");
    const eventId = id(input.eventId, "Tianyi Archive event identifier");
    const sessionId = id(input.sessionId, "Tianyi Archive Session identifier");
    const key = `${sessionId}:${eventId}`;
    if (seen.has(key)) throw new Error("Tianyi Archive messages must be unique.");
    seen.add(key);
    const excerpt = excerptText(input.excerpt, "Tianyi Archive excerpt", TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES);
    total += [...excerpt].length;
    if (total > TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES) throw new Error("Tianyi Archive excerpts exceed the total limit.");
    if (input.actor !== "author" && input.actor !== "tianyi") throw new Error("Tianyi Archive actor is invalid.");
    return {
      projectId,
      sessionId,
      eventId,
      sequence: boundedInteger(input.sequence, "Tianyi Archive event sequence", 1, Number.MAX_SAFE_INTEGER),
      actor: input.actor,
      recordedAt: timestamp(input.recordedAt, "Tianyi Archive recorded time"),
      contentHash: hash(input.contentHash, "Tianyi Archive content hash"),
      excerpt
    };
  });
}

function normalizeSourceMaterials(value: unknown, context: TianyiContextProjection): ContextReceiptSource[] {
  const projected = new Map(context.sources.map((source) => [source.id, source]));
  const seen = new Set<string>();
  let totalCodePoints = 0;
  return array(value, "Tianyi bounded source material", TIANYI_MAX_ACTUAL_SOURCES).map((item) => {
    const source = requireObject(item, "Tianyi bounded source");
    exact(source, ["id", "kind", "hash", "range", "excerpt", "transfer", "redactions"], "Tianyi bounded source");
    const sourceId = id(source.id, "Bounded source identifier");
    if (seen.has(sourceId)) throw new Error("Tianyi bounded source identifiers must be unique.");
    seen.add(sourceId);
    const projection = projected.get(sourceId);
    const sourceHash = hash(source.hash, "Bounded source hash");
    if (!projection || projection.state !== "current" || projection.exclusionReason || projection.hash !== sourceHash) throw new Error("Tianyi bounded source does not match the current projection.");
    const range = requireObject(source.range, "Tianyi bounded source range");
    exact(range, ["startLine", "endLine"], "Tianyi bounded source range");
    const startLine = boundedInteger(range.startLine, "Bounded source start line", 1, Number.MAX_SAFE_INTEGER);
    const endLine = boundedInteger(range.endLine, "Bounded source end line", startLine, startLine + TIANYI_MAX_SOURCE_LINES - 1);
    const excerpt = excerptText(source.excerpt, "Bounded source excerpt", TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES);
    totalCodePoints += [...excerpt].length;
    if (totalCodePoints > TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES) throw new Error("Tianyi bounded source total exceeds its limit.");
    if (source.transfer !== "local-only") throw new Error("Tianyi bounded source transfer is invalid.");
    return {
      id: sourceId,
      kind: text(source.kind, "Bounded source kind", 80),
      hash: sourceHash,
      range: { startLine, endLine },
      excerpt,
      transfer: "local-only" as const,
      redactions: array(source.redactions, "Bounded source redactions", 16).map((value) => text(value, "Bounded source redaction", 80))
    };
  });
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  for (const key of Object.keys(value)) if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`${label} contains a dangerous key.`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string, optionalKeys: readonly string[] = []): void {
  for (const key of Object.keys(value)) if (!keys.includes(key) && !optionalKeys.includes(key)) throw new Error(`${label} contains an unknown field.`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing a required field.`);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > maximum || /[\u0000-\u001F\u007F]/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function excerptText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.normalize("NFC");
  if (!normalized || graphemeCount(normalized) > maximum || [...normalized].length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function id(value: unknown, label: string): string {
  const normalized = text(value, label, 96);
  if (!MACHINE_ID_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function positive(value: unknown, label: string): number {
  return boundedInteger(value, label, 1, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new Error(`${label} is invalid.`);
  return value as T[number];
}
