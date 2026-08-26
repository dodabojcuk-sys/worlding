import { stableHash } from "./storySnapshotBuilder.ts";
import type { StorySnapshot, StorySnapshotNote } from "./storyIntelligenceTypes.ts";

export const NUWA_ATTENTION_CONTEXT_VERSION = "story-studio-nuwa-attention-context/v1" as const;

export type NuwaAttentionSource = {
  sourceId: string;
  sourceKind: "story-note" | "context-receipt" | "archive-message" | "approved-memory";
  label: string;
  revision: string;
  contentHash: string;
  decision: "included" | "excluded";
  reason: string;
  excerpt?: string;
};

export type NuwaActorKnowledgeSlice = {
  actorId: string;
  label: string;
  knownSourceIds: string[];
  knownFacts: string[];
  unknowns: string[];
};

export type NuwaAttentionContext = {
  version: typeof NUWA_ATTENTION_CONTEXT_VERSION;
  project: { projectId: string; title: string; revision: string };
  focus: { unitId: string; beatId: string; sceneId: string; blockId: string | null; sceneTitle: string };
  authorQuestion: string;
  pinnedSourceIds: string[];
  participatingActors: string[];
  actorKnowledge: NuwaActorKnowledgeSlice[];
  confirmedFacts: string[];
  unresolvedClues: string[];
  constraints: { mustKeep: string[]; mustAvoid: string[]; success: string[]; failure: string[] };
  includedSources: NuwaAttentionSource[];
  excludedSources: NuwaAttentionSource[];
  budget: { maxSources: number; maxCharacters: number; maxAgentRuns: number; maxSkillCalls: number; maxTokens: number };
  snapshotHash: string;
  capsuleHash: string;
  deterministic: true;
  readOnly: true;
};

export type NuwaAttentionBriefInput = {
  briefId: string;
  sourceProject: { projectId: string; projectRevision: string };
  currentContext: { documentId: string; objectIds: string[]; selectionRef: string };
  startingPoint?: { beatId: string; checkpoint: string };
  authorGoal: string;
  sourceQuestion?: string;
  selectedContextReceiptIds: string[];
  selectedArchiveMessageRefs: Array<{ sessionId: string; messageId: string }>;
  approvedMemoryRefs: string[];
  mustKeep: string[];
  mustAvoid: string[];
  unresolvedQuestions: string[];
  participatingActorIds?: string[];
  observationCriteria?: { success: string[]; failure: string[] };
  capabilityBudget: { maxAgentRuns: number; maxSkillCalls: number; maxTokens: number };
};

export type NuwaResolvedAttentionSource = {
  kind: "context-receipt" | "archive-message" | "approved-memory";
  id: string;
  hash: string;
  label?: string;
  excerpt?: string;
};

export function buildNuwaAttentionContext(input: {
  brief: NuwaAttentionBriefInput;
  snapshot: StorySnapshot;
  resolvedSources?: NuwaResolvedAttentionSource[];
}): NuwaAttentionContext {
  const { brief, snapshot } = input;
  if (brief.sourceProject.projectRevision !== snapshot.snapshotHash) throw new Error("Nuwa Attention Context cannot use a stale Story Snapshot.");
  const selected = new Set(snapshot.selectedNoteRefs);
  const noteSources = snapshot.notes.map((note) => {
    const included = note.relativePath === snapshot.project.relativePath
      || note.relativePath === snapshot.currentScene?.relativePath
      || selected.has(note.relativePath)
      || note.type === "rule" && note.status === "locked"
      || note.type === "thread" && !["closed", "resolved"].includes(note.status)
      || note.type === "event" && ["accepted", "committed"].includes(note.status);
    return sourceFromNote(note, snapshot.snapshotHash, included ? inclusionReason(note, snapshot) : "与当前焦点无直接关系");
  });
  const externalSources = (input.resolvedSources ?? []).map((source) => ({
    sourceId: source.id,
    sourceKind: source.kind,
    label: source.label || externalLabel(source.kind),
    revision: source.hash,
    contentHash: source.hash,
    decision: "included" as const,
    reason: "作者明确钉住并通过当前 Brief 核验",
    ...(source.excerpt ? { excerpt: source.excerpt.slice(0, 240) } : {})
  }));
  // Explicit author pins always win the bounded source budget; ambient notes
  // are then added deterministically by snapshot order.
  const allSources = [...externalSources, ...noteSources];
  const maxSources = Math.max(1, Math.min(64, brief.capabilityBudget.maxAgentRuns * 8));
  const includedSources = allSources.filter((source) => source.decision === "included").slice(0, maxSources);
  const excludedSources = allSources.filter((source) => source.decision === "excluded").concat(
    allSources.filter((source) => source.decision === "included").slice(maxSources).map((source) => ({ ...source, decision: "excluded" as const, reason: "超过本次来源预算" }))
  );
  const actorIds = [...new Set(brief.participatingActorIds ?? brief.currentContext.objectIds)].slice(0, 16);
  const actorKnowledge = actorIds.map((actorId) => actorSlice(actorId, snapshot, includedSources));
  const payload = {
    version: NUWA_ATTENTION_CONTEXT_VERSION,
    project: { projectId: brief.sourceProject.projectId, title: snapshot.project.title, revision: snapshot.snapshotHash },
    focus: { unitId: brief.briefId, beatId: brief.startingPoint?.beatId || brief.currentContext.selectionRef, sceneId: brief.currentContext.documentId, blockId: brief.currentContext.selectionRef || null, sceneTitle: snapshot.currentScene?.title || snapshot.project.title },
    authorQuestion: (brief.sourceQuestion || brief.authorGoal).trim().slice(0, 2_000),
    pinnedSourceIds: [...brief.selectedContextReceiptIds, ...brief.selectedArchiveMessageRefs.map((ref) => `${ref.sessionId}:${ref.messageId}`), ...brief.approvedMemoryRefs].sort(),
    participatingActors: actorIds,
    actorKnowledge,
    confirmedFacts: snapshot.recentAcceptedChanges.map((note) => note.title).slice(0, 24),
    unresolvedClues: [...snapshot.openThreads.map((note) => note.title), ...brief.unresolvedQuestions].slice(0, 24),
    constraints: { mustKeep: [...brief.mustKeep], mustAvoid: [...brief.mustAvoid], success: [...(brief.observationCriteria?.success ?? [])], failure: [...(brief.observationCriteria?.failure ?? [])] },
    includedSources,
    excludedSources,
    budget: { maxSources, maxCharacters: brief.capabilityBudget.maxTokens * 4, maxAgentRuns: brief.capabilityBudget.maxAgentRuns, maxSkillCalls: brief.capabilityBudget.maxSkillCalls, maxTokens: brief.capabilityBudget.maxTokens },
    snapshotHash: snapshot.snapshotHash,
    deterministic: true as const,
    readOnly: true as const
  };
  return { ...payload, capsuleHash: stableHash(payload) };
}

export function normalizeNuwaAttentionContext(value: unknown): NuwaAttentionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Nuwa Attention Context is invalid.");
  const context = value as NuwaAttentionContext;
  if (context.version !== NUWA_ATTENTION_CONTEXT_VERSION || context.deterministic !== true || context.readOnly !== true) throw new Error("Nuwa Attention Context version or authority is invalid.");
  if (!context.snapshotHash || !context.capsuleHash || [...context.includedSources, ...context.excludedSources].some((source) => !source.revision || source.revision === "latest" || source.sourceId.includes("*"))) throw new Error("Nuwa Attention Context requires exact source revisions.");
  const { capsuleHash: _capsuleHash, ...payload } = context;
  if (stableHash(payload) !== context.capsuleHash) throw new Error("Nuwa Attention Context capsule hash is invalid.");
  return structuredClone(context);
}

export function assertNuwaAttentionContextCurrent(context: NuwaAttentionContext, snapshotHash: string): void {
  normalizeNuwaAttentionContext(context);
  if (context.snapshotHash !== snapshotHash) throw new Error("Nuwa Attention Context is stale.");
}

export function projectNuwaAttentionForAuthor(context: NuwaAttentionContext | null | undefined) {
  if (!context) return null;
  return {
    question: context.authorQuestion,
    focus: context.focus.sceneTitle,
    pinned: context.includedSources.filter((source) => context.pinnedSourceIds.includes(source.sourceId)).map((source) => source.label),
    actors: context.actorKnowledge.map((actor) => ({ label: actor.label, knownFacts: actor.knownFacts, unknowns: actor.unknowns })),
    confirmedFacts: context.confirmedFacts,
    unresolvedClues: context.unresolvedClues,
    included: context.includedSources.map((source) => ({ label: source.label, reason: source.reason })),
    excluded: context.excludedSources.map((source) => ({ label: source.label, reason: source.reason }))
  };
}

function sourceFromNote(note: StorySnapshotNote, snapshotHash: string, reason: string): NuwaAttentionSource {
  const included = reason !== "与当前焦点无直接关系";
  return { sourceId: note.id, sourceKind: "story-note", label: note.title, revision: snapshotHash, contentHash: stableHash(note), decision: included ? "included" : "excluded", reason, excerpt: note.evidenceExcerpt };
}

function inclusionReason(note: StorySnapshotNote, snapshot: StorySnapshot): string {
  if (note.relativePath === snapshot.currentScene?.relativePath) return "当前场景";
  if (snapshot.selectedNoteRefs.includes(note.relativePath)) return "当前场景关联资料";
  if (note.type === "rule") return "锁定规则";
  if (note.type === "thread") return "未解线索";
  if (note.type === "event") return "已确认事件";
  return "项目基础资料";
}

function actorSlice(actorId: string, snapshot: StorySnapshot, includedSources: NuwaAttentionSource[]): NuwaActorKnowledgeSlice {
  const note = snapshot.notes.find((item) => item.id === actorId || item.title === actorId || item.type === "character" && item.id === actorId);
  if (!note) return { actorId, label: actorId, knownSourceIds: [], knownFacts: [], unknowns: ["本次快照没有记录该角色的额外背景或关系。"] };
  const knownSourceIds = includedSources.filter((source) => source.sourceId === note.id || source.sourceId === note.links.find((link) => link === source.sourceId)).map((source) => source.sourceId);
  return { actorId, label: note.title, knownSourceIds, knownFacts: [note.evidenceExcerpt || `${note.title}是本次场景参与者。`], unknowns: ["未进入本次快照的背景与关系保持未知。"] };
}

function externalLabel(kind: NuwaResolvedAttentionSource["kind"]): string {
  return ({ "context-receipt": "作者钉住的上下文回执", "archive-message": "作者钉住的历史消息", "approved-memory": "作者授权的长期记忆" })[kind];
}
