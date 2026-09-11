import type { EventKnowledgeState, EventStoryCrossingKnowledgeProjection } from "../storyContracts/eventStoryCrossingKnowledge.ts";
import type { CharacterHeardMemoryRecord, CharacterMemoryLedger, CharacterMemorySourceIdentity } from "./continuityTypes.ts";
import { isCharacterMemoryVisibleInSource } from "./characterMemoryRepository.ts";

export const CHARACTER_MEMORY_QUERY_VERSION = "tianyan-character-memory-query/v1" as const;

export type CharacterMemoryRecordKind = "experienced" | "witnessed" | "informed" | "belief" | "heard";
export type CharacterMemoryQueryRecord = {
  id: string;
  kind: CharacterMemoryRecordKind;
  label: string;
  title: string;
  summary: string;
  /** Heard records carry their durable receipt time; Event time remains unknown unless the Event Owner supplies it. */
  occurredAt: string | null;
  recordedAt: string;
  validity: "active" | "invalidated";
  source: { eventId?: string; eventRevision?: string; runId?: string; stepId?: string; sceneId?: string; sceneRevision?: string };
};

export type CharacterMemoryQueryProjection = {
  version: typeof CHARACTER_MEMORY_QUERY_VERSION;
  owner: "Event+NarrativeArrangement+CharacterStateProjectionPort+CharacterMemoryLedger";
  writes: 0;
  providerCalls: 0;
  scope: { projectId: string; characterId: string; sourceIdentity: CharacterMemorySourceIdentity };
  records: CharacterMemoryQueryRecord[];
  counts: { experienced: number; witnessed: number; informed: number; belief: number; heard: number; invalidated: number };
  hiddenEventCount: number;
};

/** Builds a read-only author query without promoting heard lines into facts. */
export function buildCharacterMemoryQueryProjection(input: {
  projectId: string;
  characterId: string;
  sourceIdentity: CharacterMemorySourceIdentity;
  knowledge: EventStoryCrossingKnowledgeProjection;
  ledger: CharacterMemoryLedger | null;
}): CharacterMemoryQueryProjection {
  if (input.knowledge.projectId !== input.projectId || input.knowledge.observer.id !== input.characterId) throw new Error("Character Memory query scope does not match the knowledge projection.");
  const formal = input.knowledge.visibleEvents.map((event) => {
    const kind = formalKind(event.knowledgeState);
    return {
      id: `event:${event.eventId}`,
      kind,
      label: formalLabel(kind),
      title: event.title,
      summary: event.knowledgeLabel,
      occurredAt: null,
      recordedAt: event.revisionToken,
      validity: "active" as const,
      source: { eventId: event.eventId, eventRevision: event.revisionToken }
    };
  });
  const heard = (input.ledger?.records ?? [])
    .filter((record) => isCharacterMemoryVisibleInSource(record.sourceIdentity, input.sourceIdentity))
    .map(memoryRecord);
  const records = [...formal, ...heard].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || left.id.localeCompare(right.id));
  const counts = { experienced: 0, witnessed: 0, informed: 0, belief: 0, heard: 0, invalidated: 0 };
  for (const record of records) {
    counts[record.kind] += 1;
    if (record.validity === "invalidated") counts.invalidated += 1;
  }
  return {
    version: CHARACTER_MEMORY_QUERY_VERSION,
    owner: "Event+NarrativeArrangement+CharacterStateProjectionPort+CharacterMemoryLedger",
    writes: 0,
    providerCalls: 0,
    scope: { projectId: input.projectId, characterId: input.characterId, sourceIdentity: input.sourceIdentity },
    records,
    counts,
    hiddenEventCount: input.knowledge.hiddenCount
  };
}

function memoryRecord(record: CharacterHeardMemoryRecord): CharacterMemoryQueryRecord {
  return {
    id: record.id,
    kind: "heard",
    label: "听闻",
    title: `听 ${record.speakerId} 所述`,
    summary: record.statement,
    occurredAt: record.recordedAt,
    recordedAt: record.recordedAt,
    validity: record.validity.state,
    source: { runId: record.sourceRunId, stepId: record.sourceStepId, sceneId: record.sourceScene.id, sceneRevision: record.sourceScene.revision }
  };
}

function formalKind(state: EventKnowledgeState): Exclude<CharacterMemoryRecordKind, "heard"> {
  if (state === "experienced") return "experienced";
  if (state === "witnessed") return "witnessed";
  if (state === "informed") return "informed";
  return "belief";
}

function formalLabel(kind: Exclude<CharacterMemoryRecordKind, "heard">): string {
  return kind === "experienced" ? "亲历" : kind === "witnessed" ? "目击" : kind === "informed" ? "获知" : "信念";
}
