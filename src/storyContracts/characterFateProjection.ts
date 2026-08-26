export const CHARACTER_FATE_PROJECTION_VERSION = "tianyan-character-fate-projection/v1" as const;

export type CharacterFateAuthority = "confirmed" | "author_planned" | "candidate" | "inferred" | "unknown" | "conflicted" | "stale";
export type CharacterFateTrajectoryKind = "actual" | "planned" | "candidate";
export type CharacterFateWorldTime = {
  kind: "exact" | "relative" | "range" | "unknown";
  label: string;
  sortKey: string | null;
};

export type CharacterFateObservation = {
  observationId: string;
  characterId: string;
  eventId: string;
  unitId: string;
  unitLabel: string;
  setPointId: string;
  setPointLabel: string;
  storylineIds: readonly string[];
  narrativeOrder: number;
  worldTime: CharacterFateWorldTime;
  stateDimension: string;
  stateDimensionLabel: string;
  valueBefore: string | null;
  valueAfter: string | null;
  changeKind: "set" | "gain" | "loss" | "transfer" | "knowledge" | "relation" | "constraint" | "unknown";
  trajectory: CharacterFateTrajectoryKind;
  authority: CharacterFateAuthority;
  sourceAnchorIds: readonly string[];
  explanation: string;
  confidence: "author" | "rule" | "model" | "unknown";
  stale: boolean;
  conflictGroupId: string | null;
  knowledgeBoundary: string | null;
  branchId: string;
  scope: string;
};

export type CharacterFatePoint = CharacterFateObservation & {
  pointId: string;
};

export type CharacterFateConflictRecord = {
  conflictGroupId: string;
  pointIds: readonly string[];
  eventIds: readonly string[];
  explanation: string;
};

export type CharacterFateProjection = {
  version: typeof CHARACTER_FATE_PROJECTION_VERSION;
  characterId: string;
  characterName: string;
  characterRevision: string;
  projectId: string;
  projectVersion: string;
  branchId: string;
  scope: string;
  actualTrajectory: readonly CharacterFatePoint[];
  plannedTrajectory: readonly CharacterFatePoint[];
  candidateTrajectory: readonly CharacterFatePoint[];
  unknownIntervals: readonly { pointId: string; eventId: string; reason: string }[];
  conflictRecords: readonly CharacterFateConflictRecord[];
  projectionRevision: string;
  generatedAt: string;
};

export type CharacterFateProjectionInput = {
  project: { id: string; version: string };
  character: { id: string; revision: string; name: string };
  branchId: string;
  scope: string;
  knownEventIds: readonly string[];
  observations: readonly CharacterFateObservation[];
  generatedAt: string;
};

/**
 * Builds a read-only Character Fate projection from stable owner references.
 * It does not infer missing points, mutate an owner or promote authority.
 */
export function projectCharacterFate(input: CharacterFateProjectionInput): CharacterFateProjection {
  const projectId = requiredId(input.project?.id, "project id");
  const projectVersion = requiredText(input.project?.version, 240, "project version");
  const characterId = requiredId(input.character?.id, "character id");
  const characterRevision = requiredText(input.character?.revision, 240, "character revision");
  const characterName = requiredText(input.character?.name, 160, "character name");
  const branchId = requiredId(input.branchId, "branch id");
  const scope = requiredText(input.scope, 160, "scope");
  const generatedAt = requiredTimestamp(input.generatedAt);
  const knownEventIds = new Set(unique(input.knownEventIds.map((id) => requiredId(id, "Event id"))));
  const observations = input.observations
    .filter((item) => item.characterId === characterId && item.branchId === branchId && item.scope === scope)
    .map((item) => validateObservation(item, knownEventIds))
    .sort(compareObservation);
  const pointIds = new Set<string>();
  const points = observations.map((observation) => {
    const pointId = `fate-point.${stableToken([characterId, observation.observationId, observation.eventId, observation.stateDimension, observation.trajectory].join("|"))}`;
    if (pointIds.has(pointId)) throw new TypeError(`Duplicate Character Fate point: ${pointId}`);
    pointIds.add(pointId);
    return Object.freeze({ ...observation, pointId });
  });
  const actualTrajectory = points.filter((point) => point.trajectory === "actual");
  const plannedTrajectory = points.filter((point) => point.trajectory === "planned");
  const candidateTrajectory = points.filter((point) => point.trajectory === "candidate");
  const unknownIntervals = points
    .filter((point) => point.worldTime.kind === "unknown" || point.authority === "unknown")
    .map((point) => ({ pointId: point.pointId, eventId: point.eventId, reason: point.worldTime.kind === "unknown" ? "World time is unknown; narrative order is preserved without interpolation." : "State evidence is unknown." }));
  const conflictGroups = new Map<string, CharacterFatePoint[]>();
  for (const point of points) {
    if (!point.conflictGroupId) continue;
    const group = conflictGroups.get(point.conflictGroupId) ?? [];
    group.push(point);
    conflictGroups.set(point.conflictGroupId, group);
  }
  const conflictRecords = [...conflictGroups.entries()].map(([conflictGroupId, entries]) => ({
    conflictGroupId,
    pointIds: entries.map((point) => point.pointId),
    eventIds: unique(entries.map((point) => point.eventId)),
    explanation: "Multiple valid source anchors disagree; the projection preserves every claim for author review."
  }));
  const projectionRevision = `character-fate-r0.${stableToken(JSON.stringify({ projectId, projectVersion, characterId, characterRevision, branchId, scope, points }))}`;
  return Object.freeze({
    version: CHARACTER_FATE_PROJECTION_VERSION,
    characterId,
    characterName,
    characterRevision,
    projectId,
    projectVersion,
    branchId,
    scope,
    actualTrajectory: Object.freeze(actualTrajectory),
    plannedTrajectory: Object.freeze(plannedTrajectory),
    candidateTrajectory: Object.freeze(candidateTrajectory),
    unknownIntervals: Object.freeze(unknownIntervals),
    conflictRecords: Object.freeze(conflictRecords),
    projectionRevision,
    generatedAt
  });
}

function validateObservation(value: CharacterFateObservation, knownEventIds: Set<string>): CharacterFateObservation {
  const eventId = requiredId(value.eventId, "Event id");
  if (!knownEventIds.has(eventId)) throw new TypeError(`Character Fate must reuse an existing Event ID: ${eventId}`);
  const authority = value.authority;
  if (!["confirmed", "author_planned", "candidate", "inferred", "unknown", "conflicted", "stale"].includes(authority)) throw new TypeError("Character Fate authority is invalid.");
  if (value.trajectory === "actual" && !["confirmed", "conflicted", "stale", "unknown"].includes(authority)) throw new TypeError("Actual trajectory cannot contain planned, candidate or inferred authority.");
  if (value.trajectory === "planned" && !["author_planned", "conflicted", "stale", "unknown"].includes(authority)) throw new TypeError("Planned trajectory authority is invalid.");
  if (value.trajectory === "candidate" && !["candidate", "inferred", "conflicted", "stale", "unknown"].includes(authority)) throw new TypeError("Candidate trajectory authority is invalid.");
  if (authority === "confirmed" && value.sourceAnchorIds.length === 0) throw new TypeError("Confirmed Character Fate points require a source anchor.");
  if (authority === "stale" && !value.stale) throw new TypeError("Stale authority must remain visibly stale.");
  const worldTime = validateWorldTime(value.worldTime);
  return Object.freeze({
    ...value,
    observationId: requiredId(value.observationId, "observation id"),
    characterId: requiredId(value.characterId, "character id"),
    eventId,
    unitId: requiredId(value.unitId, "Story Unit id"),
    unitLabel: requiredText(value.unitLabel, 160, "Story Unit label"),
    setPointId: requiredId(value.setPointId, "Set Point id"),
    setPointLabel: requiredText(value.setPointLabel, 160, "Set Point label"),
    storylineIds: unique(value.storylineIds.map((id) => requiredId(id, "Storyline id"))),
    narrativeOrder: boundedInteger(value.narrativeOrder, 0, 1_000_000, "narrative order"),
    worldTime,
    stateDimension: requiredId(value.stateDimension, "state dimension"),
    stateDimensionLabel: requiredText(value.stateDimensionLabel, 120, "state dimension label"),
    valueBefore: optionalText(value.valueBefore, 240),
    valueAfter: optionalText(value.valueAfter, 240),
    sourceAnchorIds: unique(value.sourceAnchorIds.map((id) => requiredId(id, "source anchor id"))),
    explanation: requiredText(value.explanation, 600, "explanation"),
    conflictGroupId: value.conflictGroupId ? requiredId(value.conflictGroupId, "conflict group id") : null,
    knowledgeBoundary: optionalText(value.knowledgeBoundary, 400),
    branchId: requiredId(value.branchId, "branch id"),
    scope: requiredText(value.scope, 160, "scope")
  });
}

function validateWorldTime(value: CharacterFateWorldTime): CharacterFateWorldTime {
  if (!value || !["exact", "relative", "range", "unknown"].includes(value.kind)) throw new TypeError("Character Fate world time is invalid.");
  const label = requiredText(value.label, 120, "world time label");
  const sortKey = value.kind === "unknown" ? null : optionalText(value.sortKey, 120);
  if (value.kind !== "unknown" && !sortKey) throw new TypeError("Known Character Fate world time requires an explicit sort key.");
  return Object.freeze({ kind: value.kind, label, sortKey });
}

function compareObservation(left: CharacterFateObservation, right: CharacterFateObservation): number {
  return left.narrativeOrder - right.narrativeOrder || left.observationId.localeCompare(right.observationId);
}

function requiredId(value: unknown, label: string): string {
  const result = requiredText(value, 240, label);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(result)) throw new TypeError(`${label} is invalid.`);
  return result;
}

function requiredText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new TypeError(`${label} is invalid.`);
  return value.trim();
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value == null || value === "") return null;
  return requiredText(value, maximum, "optional text");
}

function requiredTimestamp(value: unknown): string {
  const result = requiredText(value, 80, "timestamp");
  if (!Number.isFinite(Date.parse(result))) throw new TypeError("Timestamp is invalid.");
  return result;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError(`${label} is invalid.`);
  return value as number;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function stableToken(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ (code + index), 0x85ebca6b);
  }
  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0).toString(16).padStart(8, "0")}`;
}
