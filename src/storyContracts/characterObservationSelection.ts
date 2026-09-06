import type { ProjectDirectoryStableReference } from "./projectDirectoryContract.ts";

export const CHARACTER_OBSERVATION_DRAG_VERSION = "tianyan-character-observation-drag/v1" as const;
export const CHARACTER_OBSERVATION_MIME = "application/x-tianyan-character-observation+json" as const;
export const CHARACTER_OBSERVATION_MAX = 5;

export type CharacterObservationDragPayload = {
  version: typeof CHARACTER_OBSERVATION_DRAG_VERSION;
  projectId: string;
  workVersionId: string | null;
  references: ProjectDirectoryStableReference[];
};

export type CharacterObservationDropFailure = {
  ok: false;
  code: "invalid" | "cross-project" | "cross-version" | "candidate" | "stale" | "missing" | "max-five";
  message: string;
};

export type CharacterObservationDropResult = { ok: true; ids: string[] } | CharacterObservationDropFailure;

export function createCharacterObservationDragPayload(input: Omit<CharacterObservationDragPayload, "version">): CharacterObservationDragPayload {
  return {
    version: CHARACTER_OBSERVATION_DRAG_VERSION,
    projectId: input.projectId,
    workVersionId: input.workVersionId,
    references: uniqueReferences(input.references)
  };
}

export function parseCharacterObservationDragPayload(value: string): CharacterObservationDragPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<CharacterObservationDragPayload>;
    if (parsed.version !== CHARACTER_OBSERVATION_DRAG_VERSION || typeof parsed.projectId !== "string" || !Array.isArray(parsed.references)) return null;
    if (parsed.workVersionId !== null && typeof parsed.workVersionId !== "string") return null;
    if (!parsed.references.every(isStableReference)) return null;
    return createCharacterObservationDragPayload({ projectId: parsed.projectId, workVersionId: parsed.workVersionId ?? null, references: parsed.references });
  } catch {
    return null;
  }
}

export function applyCharacterObservationDrop(input: {
  currentIds: readonly string[];
  payload: CharacterObservationDragPayload;
  projectId: string;
  workVersionId: string | null;
  available: readonly { id: string; version: string; type: string }[];
}): CharacterObservationDropResult {
  if (input.payload.version !== CHARACTER_OBSERVATION_DRAG_VERSION) return failure("invalid", "拖入内容无法识别，没有改变当前观察范围。");
  if (input.payload.projectId !== input.projectId || input.payload.references.some((reference) => reference.projectId !== input.projectId)) return failure("cross-project", "所拖角色来自另一个项目，没有改变当前观察范围。");
  if (input.payload.workVersionId !== input.workVersionId || input.payload.references.some((reference) => reference.workVersionId !== input.workVersionId)) return failure("cross-version", "所拖角色来自另一个作品版本，请切回原版本或重新选择。");
  if (input.payload.references.some((reference) => reference.objectType !== "character")) return failure("candidate", "候选人物尚未成为正式角色，不能承担观察视角。");
  const available = new Map(input.available.filter((item) => item.type === "character").map((item) => [item.id, item]));
  for (const reference of input.payload.references) {
    const current = available.get(reference.objectId);
    if (!current) return failure("missing", "角色已不存在或不在当前正式目录中，没有改变观察范围。");
    if (current.version !== reference.version) return failure("stale", "角色版本已经变化，请从目录重新拖入。");
  }
  const ids = [...new Set([...input.currentIds, ...input.payload.references.map((reference) => reference.objectId)])];
  if (ids.length > CHARACTER_OBSERVATION_MAX) return failure("max-five", "一次最多比较 5 位正式人物；请先移除一位。");
  return { ok: true, ids };
}

export function moveCharacterObservation(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const next = [...new Set(ids)];
  const index = next.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function failure(code: CharacterObservationDropFailure["code"], message: string): CharacterObservationDropFailure { return { ok: false, code, message }; }
function uniqueReferences(values: readonly ProjectDirectoryStableReference[]): ProjectDirectoryStableReference[] { return values.filter((value, index) => values.findIndex((candidate) => candidate.objectId === value.objectId) === index).map((value) => ({ ...value })); }
function isStableReference(value: unknown): value is ProjectDirectoryStableReference {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.objectId === "string" && typeof record.version === "string" && typeof record.projectId === "string" && typeof record.objectType === "string" && (record.sourceId === null || typeof record.sourceId === "string") && (record.workVersionId === null || typeof record.workVersionId === "string");
}
