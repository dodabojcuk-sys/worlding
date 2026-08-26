export const STORY_OBSERVATION_PROPOSAL_PATCH_VERSION = "story-observation-proposal-patch/v1" as const;

export type StoryObservationProjectionMode = "event-line" | "timeline";
export type StoryObservationClueSource = "causality" | "character" | "object" | "location" | "foreshadow" | "custom";
export type StoryObservationProposalOperationKind = "add-event" | "add-relation" | "change-time" | "flag-conflict";

export type StoryObservationSelectionContext = {
  projection: StoryObservationProjectionMode;
  nodeIds: string[];
  relationIds: string[];
  timeWindow: null | { startLabel: string; endLabel: string };
  clueSources: StoryObservationClueSource[];
  observer: string;
};

export type StoryObservationProposalOperation = {
  operationId: string;
  kind: StoryObservationProposalOperationKind;
  title: string;
  change: string;
  after: string;
  rationale: string;
  confidence: number;
  risk: string;
  affectedNodeIds: string[];
  evidence: string[];
  conflicts: string[];
  timeEstimate: null | { label: string; precision: "exact" | "approximate" | "range" | "unknown" };
};

export type StoryObservationProposalPatch = {
  version: typeof STORY_OBSERVATION_PROPOSAL_PATCH_VERSION;
  patchId: string;
  projectId: string;
  baseCanonVersion: string;
  contextId: string;
  selection: StoryObservationSelectionContext;
  sources: Array<{ id: string; type: string; label: string; excerpt: string }>;
  unknowns: string[];
  prohibitedChanges: string[];
  operations: StoryObservationProposalOperation[];
  adapter: { kind: "development-deterministic"; providerCalls: 0 };
  createdAt: string;
};

export type StoryObservationCandidateResult = {
  version: "tianyan-golden-loop-candidate/v1";
  status: "candidate";
  contextPack: {
    version: "tianyan-golden-loop-context-pack/v1";
    id: string;
    contextReceiptId: string;
    project: { id: string; title: string };
    authorIntent: string;
    sources: Array<{ id: string; type: string; label: string; content: string }>;
    unknowns: string[];
    budgets: { maximumSources: number; maximumCharacters: number };
    excluded: Array<{ id: string; reason: string }>;
  };
  contextReceiptId: string;
  nuwaRunId: string;
  tianyi: {
    version: "tianyan-tianyi-alignment/v1";
    facts: Array<{ statement: string; evidence: string }>;
    inferences: string[];
    unknowns: string[];
    suggestions: string[];
    simulationTask: { goal: string; mustPreserve: string[]; questions: string[] };
  };
  nuwa: {
    version: "tianyan-nuwa-simulation/v1";
    knownFacts: string[];
    assumptions: string[];
    causalSteps: string[];
    actorResponses: Array<{ actor: string; response: string }>;
    conflicts: string[];
    unknowns: string[];
    candidates: Array<{
      id: string;
      title: string;
      change: string;
      after: string;
      causes: string[];
      evidence: string[];
      affectedObjects: string[];
      uncertainty: string;
      impact: string;
      risk: string;
    }>;
  };
  provider: { profileId: "deterministic.story-observation-r0"; calls: [] };
  review?: { id: string; status: "awaiting" | "rejected" | "accepted" | "abandoned" };
};

const PROJECTION_MODES = new Set<StoryObservationProjectionMode>(["event-line", "timeline"]);
const CLUE_SOURCES = new Set<StoryObservationClueSource>(["causality", "character", "object", "location", "foreshadow", "custom"]);
const OPERATION_KINDS = new Set<StoryObservationProposalOperationKind>(["add-event", "add-relation", "change-time", "flag-conflict"]);
const TIME_PRECISIONS = new Set(["exact", "approximate", "range", "unknown"] as const);

/** Strictly validates the development adapter payload before it can enter Candidate Review. */
export function parseStoryObservationProposalPatch(value: unknown): StoryObservationProposalPatch {
  const input = requireRecord(value, "Story Observation Proposal Patch");
  requireExactKeys(input, [
    "version", "patchId", "projectId", "baseCanonVersion", "contextId", "selection", "sources",
    "unknowns", "prohibitedChanges", "operations", "adapter", "createdAt"
  ], "Story Observation Proposal Patch");
  if (input.version !== STORY_OBSERVATION_PROPOSAL_PATCH_VERSION) throw new Error("Story Observation Proposal Patch version is invalid.");
  const selectionInput = requireRecord(input.selection, "Selection context");
  requireExactKeys(selectionInput, ["projection", "nodeIds", "relationIds", "timeWindow", "clueSources", "observer"], "Selection context");
  const projection = requireEnum(selectionInput.projection, PROJECTION_MODES, "Projection mode");
  const timeWindow = selectionInput.timeWindow === null
    ? null
    : parseTimeWindow(selectionInput.timeWindow);
  const adapter = requireRecord(input.adapter, "Proposal adapter");
  requireExactKeys(adapter, ["kind", "providerCalls"], "Proposal adapter");
  if (adapter.kind !== "development-deterministic" || adapter.providerCalls !== 0) {
    throw new Error("Only the zero-call deterministic Story Observation adapter is accepted.");
  }
  const operations = requireArray(input.operations, "Proposal operations", 2, 6).map(parseOperation);
  if (new Set(operations.map((operation) => operation.operationId)).size !== operations.length) {
    throw new Error("Proposal operation identifiers must be unique.");
  }
  const createdAt = requireText(input.createdAt, "Created timestamp", 80);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("Created timestamp is invalid.");
  return {
    version: STORY_OBSERVATION_PROPOSAL_PATCH_VERSION,
    patchId: requireIdentifier(input.patchId, "Patch identifier", 160),
    projectId: requireIdentifier(input.projectId, "Project identifier", 160),
    baseCanonVersion: requireText(input.baseCanonVersion, "Base Canon version", 200),
    contextId: requireIdentifier(input.contextId, "Context identifier", 180),
    selection: {
      projection,
      nodeIds: uniqueIdentifiers(selectionInput.nodeIds, "Selected node identifiers", 64),
      relationIds: uniqueIdentifiers(selectionInput.relationIds, "Selected relation identifiers", 128),
      timeWindow,
      clueSources: uniqueEnums(selectionInput.clueSources, CLUE_SOURCES, "Clue sources", 6),
      observer: requireText(selectionInput.observer, "Observer", 120)
    },
    sources: requireArray(input.sources, "Proposal sources", 1, 16).map(parseSource),
    unknowns: textList(input.unknowns, "Proposal unknowns", 16, 500),
    prohibitedChanges: textList(input.prohibitedChanges, "Prohibited changes", 16, 500),
    operations,
    adapter: { kind: "development-deterministic", providerCalls: 0 },
    createdAt
  };
}

/** Projects a validated patch into the existing Candidate Review input contract. */
export function storyObservationPatchToCandidateResult(
  patch: StoryObservationProposalPatch,
  projectTitle: string
): StoryObservationCandidateResult {
  const sourceLabels = patch.sources.map((source) => source.label);
  const selectionLabel = patch.selection.timeWindow
    ? `${patch.selection.timeWindow.startLabel} 至 ${patch.selection.timeWindow.endLabel}`
    : `${patch.selection.nodeIds.length} 个节点`;
  return {
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack: {
      version: "tianyan-golden-loop-context-pack/v1",
      id: patch.contextId,
      contextReceiptId: patch.contextId,
      project: { id: patch.projectId, title: requireText(projectTitle, "Project title", 160) },
      authorIntent: `审查故事观测画布中的${patch.selection.projection === "timeline" ? "时间窗口" : "节点选区"}：${selectionLabel}。`,
      sources: patch.sources.map((source) => ({ id: source.id, type: source.type, label: source.label, content: source.excerpt })),
      unknowns: patch.unknowns,
      budgets: { maximumSources: 16, maximumCharacters: 16_000 },
      excluded: []
    },
    contextReceiptId: patch.contextId,
    nuwaRunId: `observation-review-${storyObservationStableHash(patch.patchId).slice(0, 16)}`,
    tianyi: {
      version: "tianyan-tianyi-alignment/v1",
      facts: sourceLabels.map((label) => ({ statement: `候选只依据已选来源：${label}`, evidence: label })),
      inferences: ["这是隔离 R0 的结构化开发适配器输出，不是已确认事实。"],
      unknowns: patch.unknowns,
      suggestions: patch.operations.map((operation) => operation.title),
      simulationTask: {
        goal: "比较可审查的后续节点、关系或时间调整，不直接改写 Canon。",
        mustPreserve: ["稳定 Event ID", "当前 Canon 版本", ...patch.prohibitedChanges],
        questions: patch.unknowns
      }
    },
    nuwa: {
      version: "tianyan-nuwa-simulation/v1",
      knownFacts: sourceLabels,
      assumptions: ["未经作者确认的操作始终保持 Candidate 状态。"],
      causalSteps: patch.operations.map((operation) => operation.rationale),
      actorResponses: [],
      conflicts: patch.operations.flatMap((operation) => operation.conflicts),
      unknowns: patch.unknowns,
      candidates: patch.operations.map((operation) => ({
        id: operation.operationId,
        title: operation.title,
        change: operation.change,
        after: operation.after,
        causes: [operation.rationale],
        evidence: operation.evidence,
        affectedObjects: operation.affectedNodeIds,
        uncertainty: operation.timeEstimate?.precision === "unknown"
          ? "时间仍未确定"
          : `置信度 ${Math.round(operation.confidence * 100)}%`,
        impact: operation.conflicts.length > 0 ? `需复核：${operation.conflicts.join("；")}` : "仅建立待评审变更，当前故事不变。",
        risk: operation.risk
      }))
    },
    provider: { profileId: "deterministic.story-observation-r0", calls: [] }
  };
}

export function storyObservationStableHash(value: unknown): string {
  const text = JSON.stringify(sortJson(value));
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseOperation(value: unknown, index: number): StoryObservationProposalOperation {
  const input = requireRecord(value, `Proposal operation ${index + 1}`);
  requireExactKeys(input, [
    "operationId", "kind", "title", "change", "after", "rationale", "confidence", "risk",
    "affectedNodeIds", "evidence", "conflicts", "timeEstimate"
  ], `Proposal operation ${index + 1}`);
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Proposal confidence must be between zero and one.");
  const timeEstimate = input.timeEstimate === null ? null : parseTimeEstimate(input.timeEstimate);
  return {
    operationId: requireIdentifier(input.operationId, "Operation identifier", 120),
    kind: requireEnum(input.kind, OPERATION_KINDS, "Operation kind"),
    title: requireText(input.title, "Operation title", 160),
    change: requireText(input.change, "Operation change", 800),
    after: requireText(input.after, "Operation result", 800),
    rationale: requireText(input.rationale, "Operation rationale", 800),
    confidence,
    risk: requireText(input.risk, "Operation risk", 500),
    affectedNodeIds: uniqueIdentifiers(input.affectedNodeIds, "Affected node identifiers", 64),
    evidence: textList(input.evidence, "Operation evidence", 16, 500),
    conflicts: textList(input.conflicts, "Operation conflicts", 16, 500),
    timeEstimate
  };
}

function parseSource(value: unknown, index: number): StoryObservationProposalPatch["sources"][number] {
  const input = requireRecord(value, `Proposal source ${index + 1}`);
  requireExactKeys(input, ["id", "type", "label", "excerpt"], `Proposal source ${index + 1}`);
  return {
    id: requireIdentifier(input.id, "Source identifier", 180),
    type: requireText(input.type, "Source type", 80),
    label: requireText(input.label, "Source label", 180),
    excerpt: requireText(input.excerpt, "Source excerpt", 1_200)
  };
}

function parseTimeWindow(value: unknown): NonNullable<StoryObservationSelectionContext["timeWindow"]> {
  const input = requireRecord(value, "Time window");
  requireExactKeys(input, ["startLabel", "endLabel"], "Time window");
  return {
    startLabel: requireText(input.startLabel, "Time window start", 80),
    endLabel: requireText(input.endLabel, "Time window end", 80)
  };
}

function parseTimeEstimate(value: unknown): NonNullable<StoryObservationProposalOperation["timeEstimate"]> {
  const input = requireRecord(value, "Time estimate");
  requireExactKeys(input, ["label", "precision"], "Time estimate");
  return {
    label: requireText(input.label, "Time estimate label", 120),
    precision: requireEnum(input.precision, TIME_PRECISIONS, "Time precision")
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain between ${minimum} and ${maximum} items.`);
  }
  return value;
}

function requireExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = keys.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) throw new Error(`${label} shape is invalid.`);
}

function requireText(value: unknown, label: string, maximum: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new Error(`${label} is invalid.`);
  return text;
}

function requireIdentifier(value: unknown, label: string, maximum: number): string {
  const text = requireText(value, label, maximum);
  if (!/^[A-Za-z0-9._:@/-]+$/u.test(text)) throw new Error(`${label} contains unsupported characters.`);
  return text;
}

function requireEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function uniqueIdentifiers(value: unknown, label: string, maximum: number): string[] {
  const values = requireArray(value, label, 0, maximum).map((item) => requireIdentifier(item, label, 180));
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  return values;
}

function uniqueEnums<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string, maximum: number): T[] {
  const values = requireArray(value, label, 1, maximum).map((item) => requireEnum(item, allowed, label));
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  return values;
}

function textList(value: unknown, label: string, maximumItems: number, maximumText: number): string[] {
  return requireArray(value, label, 0, maximumItems).map((item) => requireText(item, label, maximumText));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, sortJson(item)]));
}
