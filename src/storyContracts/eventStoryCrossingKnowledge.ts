import {
  createCharacterStateProjectionPort,
  type CharacterCognitiveAuthority,
  type CharacterStateEvidence
} from "./characterStateProjection.ts";

export const EVENT_STORY_CROSSING_KNOWLEDGE_VERSION = "tianyan-event-story-crossing-knowledge/v2" as const;

export type EventKnowledgeState =
  | "experienced"
  | "witnessed"
  | "informed"
  | "believes"
  | "suspects"
  | "misled"
  | "unknown"
  | "denied"
  | "contradicted";

export type KnowledgeObserver = {
  id: string;
  label: string;
  kind: "author" | "character" | "reader";
};

export type StorylineProjection = {
  id: string;
  label: string;
  kind: "main" | "character" | "investigation" | "location" | "custom";
  eventIds: string[];
};

export type StoryCrossingEventInput = {
  id: string;
  title: string;
  status: string;
  revisionToken: string;
  relativeId?: string;
  tags?: readonly string[];
  /** Stable Character owner ids that are allowed to know this Event. */
  knowledgeSubjectIds?: readonly string[];
  body?: string;
};

export type StoryCrossingKnowledgeInput = {
  projectId: string;
  observerId: string;
  /** Two to five formal characters form one safe, read-only comparison range. */
  observerIds?: readonly string[];
  events: readonly StoryCrossingEventInput[];
  characters: readonly { id: string; label: string; revisionToken: string }[];
};

export type SafeKnowledgeEvent = {
  eventId: string;
  title: string;
  status: string;
  revisionToken: string;
  relativeId: string;
  storylineIds: string[];
  storylineLabels: string[];
  knowledgeState: EventKnowledgeState;
  knowledgeLabel: string;
  sourceEventIds: string[];
  body: string | null;
  perspectives: Array<{ observerId: string; observerLabel: string; state: EventKnowledgeState; stateLabel: string }>;
};

export type EventStoryCrossingKnowledgeProjection = {
  version: typeof EVENT_STORY_CROSSING_KNOWLEDGE_VERSION;
  owner: "Event+NarrativeArrangement+CharacterStateProjectionPort";
  writes: 0;
  providerCalls: 0;
  projectId: string;
  observer: KnowledgeObserver;
  observers: KnowledgeObserver[];
  mode: "single" | "compare";
  /** Compare is an author-only union. Role-facing requests always use a single filtered observer. */
  audience: "author" | "author-comparison" | "role";
  storylines: StorylineProjection[];
  visibleEvents: SafeKnowledgeEvent[];
  hiddenEventIds: string[];
  hiddenCount: number;
  characterStateProjectionRevision: string | null;
};

const AUTHOR: KnowledgeObserver = { id: "author", label: "作者全知", kind: "author" };
const READER: KnowledgeObserver = { id: "reader", label: "当前读者", kind: "reader" };

/**
 * Builds a read-only projection over the Event owner. Hidden Event text is
 * discarded before the projection crosses the API/DOM/ContextPack boundary.
 */
export function buildEventStoryCrossingKnowledgeProjection(input: StoryCrossingKnowledgeInput): EventStoryCrossingKnowledgeProjection {
  const requested = unique(input.observerIds ?? []);
  const comparisonObservers = requested
    .map((observerId) => resolveObserver(observerId, input.characters))
    .filter((observer): observer is KnowledgeObserver => observer.kind === "character")
    .slice(0, 5);
  const mode = comparisonObservers.length >= 2 ? "compare" : "single";
  const observer = mode === "compare" ? comparisonObservers[0]! : resolveObserver(input.observerId, input.characters);
  const observers = mode === "compare" ? comparisonObservers : [observer];
  const memberships = new Map(input.events.map((event) => [event.id, storylineLabels(event.tags ?? [])]));
  const storylineMap = new Map<string, StorylineProjection>();
  for (const [eventId, labels] of memberships) {
    for (const label of labels) {
      const id = stableRef("storyline", label);
      const current = storylineMap.get(id) ?? { id, label, kind: storylineKind(label), eventIds: [] };
      current.eventIds.push(eventId);
      storylineMap.set(id, current);
    }
  }
  const evidence = observer.kind === "character"
    ? input.events.map((event, index) => knowledgeEvidence(event, observer, input.characters, index)).filter((item): item is CharacterStateEvidence => Boolean(item))
    : [];
  const characterProjection = observer.kind === "character"
    ? createCharacterStateProjectionPort().projectCharacterState({
      character: { id: observer.id, name: observer.label, revision: input.characters.find((item) => item.id === observer.id)?.revisionToken ?? "unknown" },
      scope: {
        projectId: input.projectId,
        projectVersion: "current",
        branchId: "main",
        narrativePosition: input.events.length,
        worldTime: { kind: "unknown", label: "当前编排范围", sortKey: null },
        sceneId: null,
        sourceRevision: EVENT_STORY_CROSSING_KNOWLEDGE_VERSION
      },
      evidence
    })
    : null;
  const visibleEvents: SafeKnowledgeEvent[] = [];
  const hiddenEventIds: string[] = [];
  for (const event of input.events) {
    const states = observers.map((candidate) => ({ observer: candidate, state: knowledgeStateForEvent(event, candidate, input.characters) }));
    const state = states[0]!.state;
    // Author comparison deliberately carries the union so differences remain
    // visible. Role-facing API/ContextPack requests use a single observer and
    // still discard unknown Event identity and prose before crossing the port.
    const visibleToRange = mode === "compare"
      ? states.some((item) => canSeeEvent(item.state, item.observer))
      : canSeeEvent(state, observer);
    if (!visibleToRange) {
      hiddenEventIds.push(event.id);
      continue;
    }
    const labels = memberships.get(event.id) ?? ["主故事线"];
    visibleEvents.push({
      eventId: event.id,
      title: event.title,
      status: event.status,
      revisionToken: event.revisionToken,
      relativeId: event.relativeId ?? event.id,
      storylineIds: labels.map((label) => stableRef("storyline", label)),
      storylineLabels: labels,
      knowledgeState: state,
      knowledgeLabel: knowledgeStateLabel(state),
      sourceEventIds: evidence.filter((item) => item.learnedAtEventId === event.id).flatMap((item) => item.sourceAnchorIds),
      // The event-line needs no prose in its knowledge projection.  Keeping
      // it out for non-author ranges also makes the API boundary conservative.
      body: observer.kind === "author" ? event.body ?? null : null,
      perspectives: mode === "compare"
        ? states.map((item) => ({ observerId: item.observer.id, observerLabel: item.observer.label, state: item.state, stateLabel: knowledgeStateLabel(item.state) }))
        : observer.kind === "author"
        ? [READER, ...input.characters.map((character): KnowledgeObserver => ({ id: character.id, label: character.label, kind: "character" }))]
          .map((candidate) => { const candidateState = knowledgeStateForEvent(event, candidate, input.characters); return { observerId: candidate.id, observerLabel: candidate.label, state: candidateState, stateLabel: knowledgeStateLabel(candidateState) }; })
        : [{ observerId: observer.id, observerLabel: observer.label, state, stateLabel: knowledgeStateLabel(state) }]
    });
  }
  return {
    version: EVENT_STORY_CROSSING_KNOWLEDGE_VERSION,
    owner: "Event+NarrativeArrangement+CharacterStateProjectionPort",
    writes: 0,
    providerCalls: 0,
    projectId: input.projectId,
    observer,
    observers,
    mode,
    audience: mode === "compare" ? "author-comparison" : observer.kind === "author" ? "author" : "role",
    storylines: [...storylineMap.values()]
      .map((line) => ({ ...line, eventIds: unique(line.eventIds).filter((eventId) => observer.kind === "author" || visibleEvents.some((event) => event.eventId === eventId)) }))
      .filter((line) => observer.kind === "author" || line.eventIds.length > 0)
      .sort(compareStorylines),
    visibleEvents,
    hiddenEventIds,
    hiddenCount: hiddenEventIds.length,
    characterStateProjectionRevision: characterProjection?.projectionRevision ?? null
  };
}

export function storylineLabels(tags: readonly string[]): string[] {
  const values = tags.flatMap((tag) => taggedValues(tag, ["故事线", "Storyline", "Story Line"]));
  return unique(values.length ? values : ["主故事线"]);
}

export function knowledgeState(tags: readonly string[], observer: KnowledgeObserver): EventKnowledgeState {
  if (observer.kind === "author") return "experienced";
  // Formal characters are always matched by stable id.  Display labels are
  // deliberately excluded: two people may legitimately share the same name.
  const names = observer.kind === "reader" ? ["读者", "当前读者", observer.id] : [observer.id];
  for (const tag of tags) {
    const explicit = parseExplicitKnowledge(tag, names);
    if (explicit) return explicit;
  }
  if (tags.some((tag) => /^(?:作者秘密|仅作者|author[- ]?only)$/iu.test(tag.trim()))) return "unknown";
  if (observer.kind === "reader" && tags.some((tag) => /^(?:读者未知|reader[- ]?hidden)$/iu.test(tag.trim()))) return "unknown";
  if (observer.kind === "character") {
    if (taggedNames(tags, ["人物", "角色", "参与"]).some((name) => matchesObserver(name, names))) return "experienced";
    if (taggedNames(tags, ["目击", "见证"]).some((name) => matchesObserver(name, names))) return "witnessed";
    if (taggedNames(tags, ["听闻", "得知"]).some((name) => matchesObserver(name, names))) return "informed";
    if (taggedNames(tags, ["相信"]).some((name) => matchesObserver(name, names))) return "believes";
    if (taggedNames(tags, ["推测", "怀疑"]).some((name) => matchesObserver(name, names))) return "suspects";
    if (taggedNames(tags, ["误导", "被误导"]).some((name) => matchesObserver(name, names))) return "misled";
    return "unknown";
  }
  return tags.some((tag) => /^(?:读者已知|reader[- ]?visible)$/iu.test(tag.trim())) ? "informed" : "unknown";
}

export function canSeeEvent(state: EventKnowledgeState, observer: KnowledgeObserver): boolean {
  return observer.kind === "author" || state !== "unknown";
}

export function knowledgeStateLabel(state: EventKnowledgeState): string {
  return ({
    experienced: "已亲历",
    witnessed: "已目击",
    informed: "已得知",
    believes: "相信",
    suspects: "怀疑",
    misled: "被误导",
    unknown: "未知",
    denied: "已否定",
    contradicted: "存在矛盾"
  } as const)[state];
}

function resolveObserver(observerId: string, characters: StoryCrossingKnowledgeInput["characters"]): KnowledgeObserver {
  if (observerId === "author") return AUTHOR;
  if (observerId === "reader") return READER;
  const character = characters.find((item) => item.id === observerId);
  return character ? { id: character.id, label: character.label, kind: "character" } : READER;
}

function knowledgeStateForEvent(event: StoryCrossingEventInput, observer: KnowledgeObserver, characters: StoryCrossingKnowledgeInput["characters"]): EventKnowledgeState {
  if (observer.kind === "character" && event.knowledgeSubjectIds?.includes(observer.id)) {
    const explicit = (event.tags ?? []).map((tag) => parseExplicitKnowledge(tag, [observer.id])).find((state) => state !== null) ?? null;
    return explicit ?? "experienced";
  }
  return knowledgeState(event.tags ?? [], observer);
}

function knowledgeEvidence(event: StoryCrossingEventInput, observer: KnowledgeObserver, characters: StoryCrossingKnowledgeInput["characters"], index: number): CharacterStateEvidence | null {
  if (observer.kind !== "character") return null;
  const state = knowledgeStateForEvent(event, observer, characters);
  const authority: CharacterCognitiveAuthority = ({
    experienced: "confirmed_knowledge",
    witnessed: "confirmed_knowledge",
    informed: "confirmed_knowledge",
    believes: "belief",
    suspects: "suspicion",
    misled: "misinformation",
    unknown: "unknown",
    denied: "belief",
    contradicted: "contradiction"
  } as const)[state];
  return {
    claimId: `knowledge-view:${observer.id}:${event.id}`,
    characterId: observer.id,
    category: state === "believes" || state === "suspects" || state === "misled" || state === "denied" ? "belief" : "knowledge",
    statement: canSeeEvent(state, observer) ? event.title : "当前观察者不知道这里的事实正文",
    value: knowledgeStateLabel(state),
    authority,
    learnedAtEventId: event.id,
    sourceAnchorIds: canSeeEvent(state, observer) ? [`event:${event.id}`] : [],
    sourceRevision: event.revisionToken,
    branchId: "main",
    narrativePosition: index + 1,
    worldTime: { kind: "unknown", label: "当前编排范围", sortKey: null },
    sceneId: null,
    scope: state === "unknown" ? "author_only" : "character_private",
    stale: false,
    conflictGroupId: state === "contradicted" ? `knowledge-conflict:${observer.id}:${event.id}` : null
  };
}

function parseExplicitKnowledge(tag: string, names: readonly string[]): EventKnowledgeState | null {
  const match = tag.match(/^(?:知情|Knowledge)[：:]\s*([^=：:]+)\s*[=：:]\s*(.+)$/iu);
  if (!match || !matchesObserver(match[1]!, names)) return null;
  const value = match[2]!.trim();
  const pairs: Array<[RegExp, EventKnowledgeState]> = [
    [/(?:已亲历|亲历|experienced)/iu, "experienced"],
    [/(?:已得知|得知|informed)/iu, "informed"],
    [/(?:相信|believes?)/iu, "believes"],
    [/(?:怀疑|suspects?)/iu, "suspects"],
    [/(?:被误导|误导|misled)/iu, "misled"],
    [/(?:已否定|否定|denied)/iu, "denied"],
    [/(?:矛盾|contradict)/iu, "contradicted"],
    [/(?:未知|unknown)/iu, "unknown"]
  ];
  return pairs.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

function taggedNames(tags: readonly string[], prefixes: readonly string[]): string[] {
  return tags.flatMap((tag) => taggedValues(tag, prefixes));
}

function taggedValues(tag: string, prefixes: readonly string[]): string[] {
  const match = tag.match(/^([^：:]+)[：:]\s*(.+)$/u);
  if (!match || !prefixes.some((prefix) => prefix.toLocaleLowerCase() === match[1]!.trim().toLocaleLowerCase())) return [];
  return match[2]!.split(/[|、,，;/；]/u).map((value) => value.trim()).filter(Boolean);
}

function matchesObserver(value: string, names: readonly string[]): boolean {
  const normalized = value.trim().normalize("NFC").toLocaleLowerCase();
  return names.some((name) => name.trim().normalize("NFC").toLocaleLowerCase() === normalized);
}

function storylineKind(label: string): StorylineProjection["kind"] {
  if (/(?:主故事|主线|main)/iu.test(label)) return "main";
  if (/(?:人物|角色|character)/iu.test(label)) return "character";
  if (/(?:调查|investigation)/iu.test(label)) return "investigation";
  if (/(?:地点|location)/iu.test(label)) return "location";
  return "custom";
}

function compareStorylines(left: StorylineProjection, right: StorylineProjection): number {
  const order = { main: 0, character: 1, investigation: 2, location: 3, custom: 4 } as const;
  return order[left.kind] - order[right.kind] || left.label.localeCompare(right.label, "zh-CN");
}

function stableRef(prefix: string, value: string): string {
  return `${prefix}.${value.normalize("NFC").toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/gu, "") || "unknown"}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
