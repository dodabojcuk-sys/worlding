import { createCharacterKnowledgeHandoff, type CharacterKnowledgeHandoff } from "./characterKnowledgeHandoff.ts";
import {
  knowledgeStateLabel,
  type EventKnowledgeState,
  type EventStoryCrossingKnowledgeProjection
} from "./eventStoryCrossingKnowledge.ts";
import type { PerspectiveObjectRef } from "./eventPerspectiveProjection.ts";
import { selectNuwaN1Attention } from "./nuwaN1Attention.ts";
import type { NuwaN1Belief, NuwaN1Context, NuwaN1KnownFact, NuwaN1Scene } from "../storyIntelligence/nuwaN1Runtime.ts";

export const CHARACTER_CONTEXT_GATEWAY_VERSION = "tianyan-character-context-gateway/r0" as const;

export type CharacterContextExclusionReason = "author-note" | "rumor" | "character-unknown";

export type NuwaN1ProviderProjectionMode = "run" | "preview";

export type CharacterGatewayPreparation = {
  version: typeof CHARACTER_CONTEXT_GATEWAY_VERSION;
  handoff: CharacterKnowledgeHandoff;
  context: NuwaN1Context | null;
  providerSafeContext: ReturnType<typeof projectNuwaN1ProviderSafeContext> | null;
  authorPreviewCanonicalJson: string | null;
  providerSafeContextCanonicalJson: string | null;
  previewDigest: string | null;
  projectionRevision: string | null;
  asOf: null;
  asOfText: "无世界时间依据";
  missingConditions: Array<"scene" | "goal" | "world-time" | "provider">;
  blockedReason: "context-access-not-character" | "stable-actor-mismatch" | null;
  providerCalls: 0;
  writes: 0;
};

const KNOWLEDGE_STATES: readonly EventKnowledgeState[] = ["experienced", "witnessed", "informed"];
const BELIEF_STATES: readonly EventKnowledgeState[] = ["believes", "suspects", "misled", "denied", "contradicted"];
const REASON_ORDER: readonly CharacterContextExclusionReason[] = ["author-note", "character-unknown", "rumor"];
const MISSING_SCENE: NuwaN1Scene = {
  storyUnit: { id: "story-unit.unselected", revision: "unselected" },
  sceneRef: { id: "scene.unselected", revision: "unselected" },
  observedAt: "无世界时间依据",
  label: "未选择场景"
};

/**
 * The read-only Character surface gateway. Permission is decided before any
 * Nuwa context is assembled. It returns the existing NuwaN1Context shape and
 * never creates a Run, sends a Provider request, or writes story state.
 */
export function prepareCharacterContextGateway(input: {
  projectId: string;
  projection: EventStoryCrossingKnowledgeProjection | null;
  characters: readonly PerspectiveObjectRef[];
  actor: {
    id: string;
    revision: string;
    profileCore: string | null;
    boundaries: string | null;
  };
  scene: NuwaN1Scene | null;
  localGoal: string | null;
  allowedActions?: readonly string[];
  excludedReasonCounts?: Partial<Record<CharacterContextExclusionReason, number>>;
  providerConfigured?: boolean;
}): CharacterGatewayPreparation {
  const handoff = createCharacterKnowledgeHandoff({
    projectId: input.projectId,
    projection: input.projection,
    characters: input.characters
  });
  const projectionRevision = input.projection?.characterStateProjectionRevision ?? null;
  const missingConditions: CharacterGatewayPreparation["missingConditions"] = [
    ...(input.scene ? [] : ["scene" as const]),
    ...(input.localGoal?.trim() ? [] : ["goal" as const]),
    ...(input.scene?.observedAt ? [] : ["world-time" as const]),
    ...(input.providerConfigured === true ? [] : ["provider" as const])
  ];

  if (handoff.contextAccess !== "character") {
    return blockedPreparation(handoff, projectionRevision, missingConditions, "context-access-not-character");
  }
  if (handoff.subjectRef?.stableId !== input.actor.id || input.projection?.observer.id !== input.actor.id) {
    return blockedPreparation(handoff, projectionRevision, missingConditions, "stable-actor-mismatch");
  }

  const visibleEvents = input.projection.visibleEvents;
  const knownFacts = visibleEvents
    .filter((event) => KNOWLEDGE_STATES.includes(event.knowledgeState))
    .map((event): NuwaN1KnownFact => ({
      factId: event.eventId,
      summary: `${knowledgeStateLabel(event.knowledgeState)}：${event.title}`,
      sourceRef: { id: event.eventId, revision: event.revisionToken },
      visibility: event.knowledgeState as NuwaN1KnownFact["visibility"]
    }));
  const beliefs = visibleEvents
    .filter((event) => BELIEF_STATES.includes(event.knowledgeState))
    .map((event): NuwaN1Belief => ({
      beliefId: event.eventId,
      summary: `${knowledgeStateLabel(event.knowledgeState)}：${event.title}`,
      stance: beliefStance(event.knowledgeState),
      sourceRef: { id: event.eventId, revision: event.revisionToken }
    }));
  const reasonCounts = normalizeReasonCounts(input.excludedReasonCounts, handoff.hiddenEventCount);
  const excludedKnowledgeReasonCodes = REASON_ORDER.filter((reason) => (reasonCounts[reason] ?? 0) > 0);
  const excludedKnowledgeCount = excludedKnowledgeReasonCodes.reduce((total, reason) => total + (reasonCounts[reason] ?? 0), 0);
  const scene = input.scene ? cloneScene(input.scene) : structuredClone(MISSING_SCENE);
  if (!scene.observedAt) scene.observedAt = "无世界时间依据";
  const localGoal = input.localGoal?.trim() || "";
  const profileSources: NuwaN1Context["profileBasis"]["sources"] = [
    ...(input.actor.profileCore ? [{ field: "character_core" as const, source: "author-profile" as const }] : []),
    ...(input.actor.boundaries ? [{ field: "boundaries" as const, source: "author-profile" as const }] : [])
  ];
  const profileBasis = {
    core: input.actor.profileCore,
    boundaries: input.actor.boundaries,
    sourceRevision: input.actor.revision,
    sources: profileSources
  };
  // Attention needs a bounded sizing envelope, but a preview has no Run and
  // therefore no committed-step or Provider-dispatch allowance of its own.
  const remaining: NuwaN1Context["remaining"] = {
    committedSteps: 0,
    dispatches: 0,
    inputTokenBudget: 4096,
    outputTokenBudget: 1024
  };
  const fixedContext = {
    version: "tianyan-nuwa-n1-role-context/v1" as const,
    previewMode: true as const,
    runId: "",
    attemptId: "",
    step: 0,
    actor: { id: input.actor.id, revision: input.actor.revision },
    scene,
    localGoal,
    coreSummary: input.actor.profileCore ?? `角色稳定标识：${input.actor.id}`,
    profileBasis,
    excludedKnowledgeCount,
    excludedKnowledgeReasonCodes,
    recentDialogue: [],
    allowedActions: [...new Set((input.allowedActions ?? []).map((action) => action.trim()).filter(Boolean))],
    remaining,
    authorCue: null,
    stateProjection: {
      projectionRevision,
      asOf: null,
      asOfText: "无世界时间依据" as const,
      sourceAnchors: [...knownFacts.map((fact) => `event:${fact.sourceRef.id}`), ...beliefs.map((belief) => `event:${belief.sourceRef.id}`)]
    }
  };
  const baseBytes = utf8Bytes(canonicalJson({ ...fixedContext, knownFacts: [], beliefs: [], attention: null }));
  const candidates = [
    ...knownFacts.map((fact) => ({ key: `knowledge:${fact.factId}`, kind: "knowledge" as const, sourceId: fact.sourceRef.id, summary: fact.summary, required: false, serializedBytes: utf8Bytes(canonicalJson(fact)) + 192 })),
    ...beliefs.map((belief) => ({ key: `belief:${belief.beliefId}`, kind: "belief" as const, sourceId: belief.sourceRef.id, summary: belief.summary, required: false, serializedBytes: utf8Bytes(canonicalJson(belief)) + 192 }))
  ];
  const attention = selectNuwaN1Attention({
    goal: localGoal,
    sceneLabel: scene.label,
    candidates,
    baseBytes,
    maxInputTokens: remaining.inputTokenBudget,
    outputReserveTokens: remaining.outputTokenBudget
  });
  const selected = new Set(attention.selected.map((item) => item.key));
  const context: NuwaN1Context = {
    ...fixedContext,
    knownFacts: knownFacts.filter((fact) => selected.has(`knowledge:${fact.factId}`)).map((fact) => ({
      factId: fact.factId,
      summary: fact.summary,
      sourceId: fact.sourceRef.id,
      sourceRevision: fact.sourceRef.revision,
      visibility: fact.visibility
    })),
    beliefs: beliefs.filter((belief) => selected.has(`belief:${belief.beliefId}`)).map((belief) => ({
      ...belief,
      sourceId: belief.sourceRef.id,
      sourceRevision: belief.sourceRef.revision
    })),
    attention
  };
  const providerSafeContext = projectNuwaN1ProviderSafeContext(context, { mode: "preview" });
  const canonical = canonicalJson(providerSafeContext);
  return {
    version: CHARACTER_CONTEXT_GATEWAY_VERSION,
    handoff,
    context,
    providerSafeContext,
    authorPreviewCanonicalJson: canonical,
    providerSafeContextCanonicalJson: canonical,
    previewDigest: stableTextDigest(canonical),
    projectionRevision,
    asOf: null,
    asOfText: "无世界时间依据",
    missingConditions,
    blockedReason: null,
    providerCalls: 0,
    writes: 0
  };
}

/**
 * Single safe-field projector for author preview and Provider-bound tool
 * results. Preview mode deliberately omits execution identity and Run budget;
 * those fields exist only after the runtime has created a real Nuwa Run.
 */
export function projectNuwaN1ProviderSafeContext(
  context: NuwaN1Context,
  options: { mode?: NuwaN1ProviderProjectionMode } = {}
) {
  const mode = options.mode ?? "run";
  if (mode === "run" && context.previewMode === true) {
    throw new Error("A Character context preview cannot be projected as a Nuwa Run payload.");
  }
  const reasonCodes = context.excludedKnowledgeReasonCodes?.length
    ? [...new Set(context.excludedKnowledgeReasonCodes)].sort()
    : context.excludedKnowledgeCount ? ["not-known-by-actor"] : [];
  const safeContext = {
    version: context.version,
    ...(mode === "run" ? { runId: context.runId, step: context.step } : { previewMode: true as const }),
    actor: context.actor,
    ...(context.scene.sceneRef.id === MISSING_SCENE.sceneRef.id ? {} : { scene: context.scene }),
    ...(context.localGoal ? { localGoal: context.localGoal } : {}),
    coreSummary: context.coreSummary,
    profileBasis: context.profileBasis,
    knownFacts: context.knownFacts,
    beliefs: context.beliefs,
    attention: context.attention,
    excluded: { count: context.excludedKnowledgeCount, reasonCodes },
    recentDialogue: context.recentDialogue,
    allowedActions: context.allowedActions,
    ...(mode === "run" ? { remaining: context.remaining } : {}),
    authorCue: context.authorCue,
    ...(context.stateProjection ? { stateProjection: context.stateProjection } : {})
  };
  return structuredClone(safeContext);
}

export function serializeNuwaN1ProviderSafeContext(
  context: NuwaN1Context,
  options: { mode?: NuwaN1ProviderProjectionMode } = {}
): string {
  return canonicalJson(projectNuwaN1ProviderSafeContext(context, options));
}

/**
 * The current Dock candidate set is exactly the role-filtered Event knowledge
 * projection. Project-global World references are not candidates and cannot
 * affect this count. Future source selectors must add their own scoped counts
 * only after they become part of the concrete operation candidate set.
 */
export function projectCharacterContextExclusionCounts(
  projection: EventStoryCrossingKnowledgeProjection | null
): Record<CharacterContextExclusionReason, number> {
  return {
    "author-note": 0,
    rumor: 0,
    "character-unknown": safeCount(projection?.hiddenEventIds.length ?? 0)
  };
}

function blockedPreparation(
  handoff: CharacterKnowledgeHandoff,
  projectionRevision: string | null,
  missingConditions: CharacterGatewayPreparation["missingConditions"],
  blockedReason: NonNullable<CharacterGatewayPreparation["blockedReason"]>
): CharacterGatewayPreparation {
  return {
    version: CHARACTER_CONTEXT_GATEWAY_VERSION,
    handoff,
    context: null,
    providerSafeContext: null,
    authorPreviewCanonicalJson: null,
    providerSafeContextCanonicalJson: null,
    previewDigest: null,
    projectionRevision,
    asOf: null,
    asOfText: "无世界时间依据",
    missingConditions,
    blockedReason,
    providerCalls: 0,
    writes: 0
  };
}

function normalizeReasonCounts(
  counts: Partial<Record<CharacterContextExclusionReason, number>> | undefined,
  hiddenEventCount: number
): Record<CharacterContextExclusionReason, number> {
  if (!counts) return { "author-note": 0, rumor: 0, "character-unknown": safeCount(hiddenEventCount) };
  return {
    "author-note": safeCount(counts["author-note"]),
    rumor: safeCount(counts.rumor),
    "character-unknown": safeCount(counts["character-unknown"])
  };
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 0;
}

function beliefStance(state: EventKnowledgeState): NuwaN1Belief["stance"] {
  if (state === "believes") return "believed";
  if (state === "suspects") return "suspected";
  return "misunderstood";
}

function cloneScene(scene: NuwaN1Scene): NuwaN1Scene {
  return {
    storyUnit: { ...scene.storyUnit },
    sceneRef: { ...scene.sceneRef },
    observedAt: scene.observedAt,
    label: scene.label
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function stableTextDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
