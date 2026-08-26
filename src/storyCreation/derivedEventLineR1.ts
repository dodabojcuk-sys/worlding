export const DERIVED_EVENT_LINE_R1_VERSION = "story-studio-derived-event-line-r1/v1" as const;
export const DERIVED_EVENT_LINE_R1_KEY = "derivedEventLineR1" as const;

export type DerivedTransformKindR1 = "translation" | "pov" | "if" | "adaptation";
export type DerivedLineReviewStateR1 = "draft" | "generated" | "review" | "ready-for-creation" | "archived";
export type DerivedAlignmentReviewR1 = "pending" | "accepted" | "returned";
export type PovKnowledgeStateR1 = "visible" | "heard" | "inferred" | "unknown" | "misunderstood";
export type DerivedSourceKindR1 = "event-line" | "nuwa-run" | "nuwa-candidate" | "tianyi-intent" | "story-workspace" | "writing-selection" | "library" | "import";

export type DerivedSourceRefR1 = {
  sourceKind: DerivedSourceKindR1;
  ownerId: string;
  entityId: string;
  entityVersion?: string;
  capturedAt: string;
  staleState?: "fresh" | "stale" | "missing";
};

export type DerivedSourceItemR1 = {
  id: string;
  kind: string;
  authority: string;
  content: Record<string, unknown>;
  sourceRefs: DerivedSourceRefR1[];
};

export type DerivedSourceUnitR1 = {
  id: string;
  title: string;
  summary: string;
  version: string;
  items: DerivedSourceItemR1[];
  sourceRefs: DerivedSourceRefR1[];
};

export type DerivedEventAlignmentR1 = {
  alignmentId: string;
  sourceItemId: string;
  sourceRevision: string;
  sourceKind: string;
  sourceText: string;
  derivedText: string;
  review: DerivedAlignmentReviewR1;
  knowledgeState: PovKnowledgeStateR1 | null;
  differences: {
    omissions: string[];
    additions: string[];
    lockedTermViolations: string[];
    causalChanges: string[];
  };
  gapProposal: { kind: "dialogue" | "memory" | "thought" | "transition"; text: string; provenance: string } | null;
};

export type PovEligibilityR1 = {
  actorRef: string;
  actorLabel: string;
  threshold: number;
  score: number;
  eligible: boolean;
  metrics: {
    eventCoverage: number;
    knowledgeCoverage: number;
    causalCentrality: number;
    motivationContinuity: number;
    emotionContinuity: number;
    leakageRisk: number;
    gapCost: number;
  };
  explanation: string[];
};

export type DerivedEventLineR1 = {
  version: typeof DERIVED_EVENT_LINE_R1_VERSION;
  derivedLineId: string;
  sourceLineId: string;
  sourceRevision: string;
  sourceTitle: string;
  transformKind: DerivedTransformKindR1;
  branchPoint: string | null;
  targetLanguage: string | null;
  glossary: Array<{ source: string; target: string }>;
  lockedNames: string[];
  tone: string;
  preservationContract: string[];
  changeContract: string[];
  alignment: DerivedEventAlignmentR1[];
  povEligibility: PovEligibilityR1 | null;
  provenanceReceipts: Array<{ kind: string; sourceId: string; sourceRevision: string; createdAt: string }>;
  reviewState: DerivedLineReviewStateR1;
  staleSourceState: "fresh" | "stale";
  creationHandoffs: Array<{ artifactId: string; artifactVersion: string; outputType: string; createdAt: string }>;
};

export type DerivedStoryUnitWriteR1 = {
  title: string;
  summary: string;
  sourceRefs: DerivedSourceRefR1[];
  items: Array<{
    id: string;
    kind: string;
    authority: "derived";
    possibilityStatus: "proposed" | "selected-for-output" | "rejected";
    content: Record<string, unknown>;
    sourceRefs: DerivedSourceRefR1[];
    createdBy: "system";
  }>;
  generationConstraints: Record<string, unknown>;
};

export function createDerivedEventLineR1(input: {
  derivedLineId: string;
  source: DerivedSourceUnitR1;
  kind: DerivedTransformKindR1;
  title: string;
  createdAt: string;
  targetLanguage?: string;
  glossary?: Array<{ source: string; target: string }>;
  lockedNames?: string[];
  tone?: string;
  branchPoint?: string;
  preservationContract?: string[];
  changeContract?: string[];
  pov?: { actorRef: string; actorLabel: string; threshold: number; metrics?: Partial<PovEligibilityR1["metrics"]> };
}): DerivedStoryUnitWriteR1 {
  const source = validateSourceUnit(input.source);
  const derivedLineId = stableId(input.derivedLineId, "derived line");
  const title = requiredText(input.title, "derived line title", 120);
  const glossary = normalizeGlossary(input.glossary || []);
  const lockedNames = uniqueTexts(input.lockedNames || [], 64);
  const preservationContract = uniqueTexts(input.preservationContract || defaultPreservation(input.kind), 64);
  const changeContract = uniqueTexts(input.changeContract || defaultChanges(input.kind), 64);
  const povEligibility = input.kind === "pov" ? scorePovCandidateR1({
    actorRef: requiredText(input.pov?.actorRef, "POV actor reference", 160),
    actorLabel: requiredText(input.pov?.actorLabel, "POV actor label", 100),
    threshold: input.pov?.threshold ?? 90,
    metrics: input.pov?.metrics
  }) : null;
  const sourceItems = source.items.length ? source.items : [{
    id: `${source.id}.summary`, kind: "node", authority: "derived", content: { title: source.title, text: source.summary || source.title }, sourceRefs: source.sourceRefs
  }];
  const alignment = sourceItems.map((item, index) => buildAlignment({ item, index, source, kind: input.kind, targetLanguage: input.targetLanguage, glossary, branchPoint: input.branchPoint, pov: povEligibility }));
  const model: DerivedEventLineR1 = {
    version: DERIVED_EVENT_LINE_R1_VERSION,
    derivedLineId,
    sourceLineId: source.id,
    sourceRevision: source.version,
    sourceTitle: source.title,
    transformKind: input.kind,
    branchPoint: input.kind === "if" ? requiredText(input.branchPoint, "IF branch point", 200) : null,
    targetLanguage: input.kind === "translation" ? requiredText(input.targetLanguage, "target language", 64) : null,
    glossary,
    lockedNames,
    tone: optionalText(input.tone, 120) || "保持来源作品语气",
    preservationContract,
    changeContract,
    alignment,
    povEligibility,
    provenanceReceipts: [{ kind: "derived-line-created", sourceId: source.id, sourceRevision: source.version, createdAt: requireIso(input.createdAt) }],
    reviewState: "review",
    staleSourceState: "fresh",
    creationHandoffs: []
  };
  return writeFromModel(title, model, source);
}

export function readDerivedEventLineR1(unit: { generationConstraints: Record<string, unknown> }): DerivedEventLineR1 | null {
  const candidate = unit.generationConstraints?.[DERIVED_EVENT_LINE_R1_KEY];
  if (candidate == null) return null;
  return validateDerivedEventLineR1(candidate);
}

export function reviewDerivedAlignmentR1(input: {
  unit: DerivedSourceUnitR1 & { generationConstraints: Record<string, unknown> };
  alignmentId: string;
  decision: "accept" | "return";
}): Pick<DerivedStoryUnitWriteR1, "items" | "generationConstraints"> {
  const model = currentModel(input.unit);
  if (model.staleSourceState !== "fresh") throw new Error("Source revision is stale; realign before review.");
  const index = model.alignment.findIndex((item) => item.alignmentId === input.alignmentId);
  if (index < 0) throw new Error("Derived alignment does not exist.");
  model.alignment[index] = { ...model.alignment[index], review: input.decision === "accept" ? "accepted" : "returned" };
  model.reviewState = "review";
  return projectionUpdate(model, input.unit);
}

export function markDerivedLineReadyR1(unit: DerivedSourceUnitR1 & { generationConstraints: Record<string, unknown> }): Pick<DerivedStoryUnitWriteR1, "items" | "generationConstraints"> {
  const model = currentModel(unit);
  if (model.staleSourceState !== "fresh") throw new Error("Stale derived lines cannot enter Creation.");
  if (!model.alignment.length || model.alignment.some((item) => item.review !== "accepted")) throw new Error("Every event alignment requires author acceptance.");
  if (model.povEligibility && !model.povEligibility.eligible) throw new Error("POV score has not reached the author threshold.");
  model.reviewState = "ready-for-creation";
  return projectionUpdate(model, unit);
}

export function projectDerivedLineStalenessR1(unit: { generationConstraints: Record<string, unknown> }, currentSourceVersion: string): DerivedEventLineR1 {
  const model = currentModel(unit);
  model.staleSourceState = model.sourceRevision === currentSourceVersion ? "fresh" : "stale";
  if (model.staleSourceState === "stale" && model.reviewState === "ready-for-creation") model.reviewState = "review";
  return model;
}

export function appendDerivedHandoffReceiptR1(input: {
  unit: DerivedSourceUnitR1 & { generationConstraints: Record<string, unknown> };
  artifactId: string;
  artifactVersion: string;
  outputType: string;
  createdAt: string;
}): Pick<DerivedStoryUnitWriteR1, "items" | "generationConstraints"> {
  const model = currentModel(input.unit);
  if (model.reviewState !== "ready-for-creation" || model.staleSourceState !== "fresh") throw new Error("Only a current reviewed line can create an artifact.");
  if (!model.creationHandoffs.some((receipt) => receipt.artifactId === input.artifactId)) model.creationHandoffs.push({ artifactId: stableId(input.artifactId, "artifact"), artifactVersion: requiredText(input.artifactVersion, "artifact version", 160), outputType: requiredText(input.outputType, "output type", 40), createdAt: requireIso(input.createdAt) });
  return projectionUpdate(model, input.unit);
}

export function buildDerivedCreationBriefR1(unit: DerivedSourceUnitR1 & { generationConstraints: Record<string, unknown> }): Record<string, unknown> {
  const model = currentModel(unit);
  if (model.reviewState !== "ready-for-creation" || model.staleSourceState !== "fresh") throw new Error("Derived line is not ready for Creation.");
  return {
    derivation: model.transformKind === "if" ? "branch" : model.transformKind,
    derivedEventLine: { id: model.derivedLineId, unitId: unit.id, unitVersion: unit.version, sourceLineId: model.sourceLineId, sourceRevision: model.sourceRevision, reviewState: model.reviewState },
    provenance: model.provenanceReceipts
  };
}

export function scorePovCandidateR1(input: {
  actorRef: string;
  actorLabel: string;
  threshold?: number;
  metrics?: Partial<PovEligibilityR1["metrics"]>;
}): PovEligibilityR1 {
  const defaults: PovEligibilityR1["metrics"] = { eventCoverage: .92, knowledgeCoverage: .9, causalCentrality: .88, motivationContinuity: .94, emotionContinuity: .9, leakageRisk: .08, gapCost: .12 };
  const metrics = Object.fromEntries(Object.entries({ ...defaults, ...(input.metrics || {}) }).map(([key, value]) => [key, boundedRatio(value)])) as PovEligibilityR1["metrics"];
  const score = Math.max(0, Math.min(100, Math.round(metrics.eventCoverage * 25 + metrics.knowledgeCoverage * 20 + metrics.causalCentrality * 20 + metrics.motivationContinuity * 15 + metrics.emotionContinuity * 10 + (1 - metrics.leakageRisk) * 5 + (1 - metrics.gapCost) * 5)));
  const threshold = Math.max(0, Math.min(100, Math.round(input.threshold ?? 90)));
  return {
    actorRef: stableId(input.actorRef, "POV actor"), actorLabel: requiredText(input.actorLabel, "POV actor label", 100), threshold, score, eligible: score >= threshold, metrics,
    explanation: [`事件覆盖 ${percent(metrics.eventCoverage)}`, `已知信息覆盖 ${percent(metrics.knowledgeCoverage)}`, `因果中心度 ${percent(metrics.causalCentrality)}`, `动机连续性 ${percent(metrics.motivationContinuity)}`, `情绪连续性 ${percent(metrics.emotionContinuity)}`, `知识泄漏风险 ${percent(metrics.leakageRisk)}`, `缺口缝补成本 ${percent(metrics.gapCost)}`]
  };
}

export function validateDerivedEventLineR1(value: unknown): DerivedEventLineR1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Derived Event Line must be an object.");
  const model = structuredClone(value as DerivedEventLineR1);
  if (model.version !== DERIVED_EVENT_LINE_R1_VERSION) throw new Error("Unsupported Derived Event Line version.");
  stableId(model.derivedLineId, "derived line"); stableId(model.sourceLineId, "source line"); requiredText(model.sourceRevision, "source revision", 160);
  if (!["translation", "pov", "if", "adaptation"].includes(model.transformKind)) throw new Error("Invalid transform kind.");
  if (!["draft", "generated", "review", "ready-for-creation", "archived"].includes(model.reviewState)) throw new Error("Invalid review state.");
  if (model.staleSourceState !== "fresh" && model.staleSourceState !== "stale") throw new Error("Invalid stale state.");
  if (!Array.isArray(model.alignment) || !model.alignment.length) throw new Error("Derived Event Line requires event alignment.");
  const ids = new Set<string>();
  for (const item of model.alignment) {
    if (ids.has(item.alignmentId)) throw new Error("Duplicate derived alignment identifier.");
    ids.add(item.alignmentId);
    stableId(item.alignmentId, "alignment"); stableId(item.sourceItemId, "source item"); requiredText(item.sourceRevision, "alignment source revision", 160);
    if (!["pending", "accepted", "returned"].includes(item.review)) throw new Error("Invalid alignment review state.");
  }
  return model;
}

function buildAlignment(input: { item: DerivedSourceItemR1; index: number; source: DerivedSourceUnitR1; kind: DerivedTransformKindR1; targetLanguage?: string; glossary: Array<{ source: string; target: string }>; branchPoint?: string; pov: PovEligibilityR1 | null }): DerivedEventAlignmentR1 {
  const sourceText = itemText(input.item);
  let derivedText = sourceText;
  let knowledgeState: PovKnowledgeStateR1 | null = null;
  let gapProposal: DerivedEventAlignmentR1["gapProposal"] = null;
  const differences = { omissions: [] as string[], additions: [] as string[], lockedTermViolations: [] as string[], causalChanges: [] as string[] };
  if (input.kind === "translation") derivedText = deterministicTranslation(sourceText, requiredText(input.targetLanguage, "target language", 64), input.glossary);
  if (input.kind === "pov") {
    knowledgeState = (["visible", "heard", "inferred", "unknown", "misunderstood"] as PovKnowledgeStateR1[])[input.index % 5];
    derivedText = `${input.pov?.actorLabel || "新视角"}视角·${knowledgeLabel(knowledgeState)}：${sourceText}`;
    if (knowledgeState === "unknown" || knowledgeState === "misunderstood") gapProposal = { kind: knowledgeState === "unknown" ? "transition" : "thought", text: `补缀提案：不复制原主角私有记忆，为「${sourceText}」建立可审核的信息途径。`, provenance: `${input.source.id}@${input.source.version}:${input.item.id}` };
  }
  if (input.kind === "if" && input.index === 0) { derivedText = `反事实前提「${requiredText(input.branchPoint, "IF branch point", 200)}」之后：${sourceText}`; differences.causalChanges.push("分岔点后的因果链需重新审核"); }
  if (input.kind === "adaptation") { derivedText = `改编投影：${sourceText}`; differences.additions.push("只添加变换合同内容"); }
  return { alignmentId: `${stableId(input.item.id, "source item")}.alignment.${input.index + 1}`, sourceItemId: input.item.id, sourceRevision: input.source.version, sourceKind: input.item.kind, sourceText, derivedText, review: "pending", knowledgeState, differences, gapProposal };
}

function writeFromModel(title: string, model: DerivedEventLineR1, source: DerivedSourceUnitR1): DerivedStoryUnitWriteR1 {
  return {
    title,
    summary: `${transformLabel(model.transformKind)}派生事件线 · 来源 ${source.title} @ ${source.version.slice(0, 12)}`,
    sourceRefs: [{ sourceKind: "event-line", ownerId: "story-unit", entityId: source.id, entityVersion: source.version, capturedAt: model.provenanceReceipts[0]?.createdAt || new Date(0).toISOString(), staleState: "fresh" }],
    items: model.alignment.map((alignment) => ({ id: `${model.derivedLineId}.${alignment.alignmentId}`, kind: alignment.sourceKind || "node", authority: "derived", possibilityStatus: alignment.review === "accepted" ? "selected-for-output" : alignment.review === "returned" ? "rejected" : "proposed", content: { title: alignment.derivedText, alignmentId: alignment.alignmentId, sourceItemId: alignment.sourceItemId, knowledgeState: alignment.knowledgeState, gapProposal: alignment.gapProposal }, sourceRefs: [{ sourceKind: "event-line", ownerId: "story-unit", entityId: source.id, entityVersion: source.version, capturedAt: model.provenanceReceipts[0]?.createdAt || new Date(0).toISOString(), staleState: model.staleSourceState }], createdBy: "system" })),
    generationConstraints: { [DERIVED_EVENT_LINE_R1_KEY]: model }
  };
}

function projectionUpdate(model: DerivedEventLineR1, unit: DerivedSourceUnitR1): Pick<DerivedStoryUnitWriteR1, "items" | "generationConstraints"> {
  const source = { ...unit, id: model.sourceLineId, title: model.sourceTitle, version: model.sourceRevision };
  const projected = writeFromModel(unit.title, model, source);
  return { items: projected.items, generationConstraints: projected.generationConstraints };
}

function currentModel(unit: { generationConstraints: Record<string, unknown> }): DerivedEventLineR1 { return validateDerivedEventLineR1(unit.generationConstraints?.[DERIVED_EVENT_LINE_R1_KEY]); }
function validateSourceUnit(source: DerivedSourceUnitR1): DerivedSourceUnitR1 { stableId(source.id, "source line"); requiredText(source.title, "source title", 120); requiredText(source.version, "source version", 160); if (!Array.isArray(source.items) || !Array.isArray(source.sourceRefs)) throw new Error("Source line is invalid."); return structuredClone(source); }
function deterministicTranslation(text: string, targetLanguage: string, glossary: Array<{ source: string; target: string }>): string { let value = text; for (const term of glossary) value = value.split(term.source).join(term.target); return `【${targetLanguage}·确定性翻译草案】${value}`; }
function itemText(item: DerivedSourceItemR1): string { for (const key of ["title", "text", "summary", "content", "action"]) { const value = item.content[key]; if (typeof value === "string" && value.trim()) return value.trim(); } return item.id; }
function normalizeGlossary(value: Array<{ source: string; target: string }>): Array<{ source: string; target: string }> { return value.slice(0, 128).map((item) => ({ source: requiredText(item.source, "glossary source", 80), target: requiredText(item.target, "glossary target", 80) })); }
function defaultPreservation(kind: DerivedTransformKindR1): string[] { return kind === "translation" ? ["事件顺序", "人物与地点稳定引用", "因果关系"] : kind === "pov" ? ["已确认事实", "时间与因果", "角色稳定身份"] : ["来源版本", "来源权利与 provenance"]; }
function defaultChanges(kind: DerivedTransformKindR1): string[] { return kind === "translation" ? ["目标语言与语气"] : kind === "pov" ? ["可知信息", "叙事焦点"] : kind === "if" ? ["分岔点的反事实前提"] : ["时代、地域、媒介或语气"]; }
function transformLabel(kind: DerivedTransformKindR1): string { return ({ translation: "翻译", pov: "视角切换", if: "IF 线", adaptation: "同人／本土化" } as const)[kind]; }
function knowledgeLabel(state: PovKnowledgeStateR1): string { return ({ visible: "可见", heard: "听闻", inferred: "推断", unknown: "未知", misunderstood: "误解" } as const)[state]; }
function uniqueTexts(values: string[], max: number): string[] { return [...new Set(values.map((value) => optionalText(value, 200)).filter(Boolean))].slice(0, max); }
function boundedRatio(value: unknown): number { const numeric = Number(value); if (!Number.isFinite(numeric)) throw new Error("POV metric must be numeric."); return Math.max(0, Math.min(1, numeric)); }
function percent(value: number): string { return `${Math.round(value * 100)}%`; }
function stableId(value: unknown, label: string): string { const result = requiredText(value, `${label} identifier`, 200); if (!/^[\p{L}\p{N}._:-]+$/u.test(result)) throw new Error(`${label} identifier is invalid.`); return result; }
function requiredText(value: unknown, label: string, max: number): string { const result = typeof value === "string" ? value.normalize("NFC").trim() : ""; if (!result || result.length > max) throw new Error(`${label} is invalid.`); return result; }
function optionalText(value: unknown, max: number): string { const result = typeof value === "string" ? value.normalize("NFC").trim() : ""; if (result.length > max) throw new Error("Text exceeds its bounded limit."); return result; }
function requireIso(value: string): string { const result = requiredText(value, "timestamp", 64); if (Number.isNaN(Date.parse(result))) throw new Error("Timestamp is invalid."); return result; }
