import assert from "node:assert/strict";
import test from "node:test";

import {
  CHARACTER_OBSERVATION_DRAG_VERSION,
  applyCharacterObservationDrop,
  createCharacterObservationDragPayload,
  moveCharacterObservation
} from "../../src/storyContracts/characterObservationSelection.ts";

const available = [
  { id: "character.a", version: "a1", type: "character" as const },
  { id: "character.b", version: "b1", type: "character" as const },
  { id: "character.c", version: "c1", type: "character" as const },
  { id: "character.d", version: "d1", type: "character" as const },
  { id: "character.e", version: "e1", type: "character" as const }
];

const reference = (objectId: string, version = `${objectId.at(-1)}1`, projectId = "project.r4") => ({
  objectId,
  version,
  sourceId: null,
  projectId,
  workVersionId: "work.r4",
  objectType: "character"
});

test("R4 character drop keeps stable identities, deduplicates, and preserves order", () => {
  const payload = createCharacterObservationDragPayload({ projectId: "project.r4", workVersionId: "work.r4", references: [reference("character.a"), reference("character.b"), reference("character.a")] });
  assert.equal(payload.version, CHARACTER_OBSERVATION_DRAG_VERSION);
  const applied = applyCharacterObservationDrop({ currentIds: ["character.c"], payload, projectId: "project.r4", workVersionId: "work.r4", available });
  assert.deepEqual(applied, { ok: true, ids: ["character.c", "character.a", "character.b"] });
  assert.deepEqual(moveCharacterObservation(applied.ids, "character.b", -1), ["character.c", "character.b", "character.a"]);
});

test("R4 character drop fails honestly for wrong project, stale or candidate references, and overflow", () => {
  const wrongProject = applyCharacterObservationDrop({ currentIds: [], payload: createCharacterObservationDragPayload({ projectId: "other", workVersionId: "work.r4", references: [reference("character.a", "a1", "other")] }), projectId: "project.r4", workVersionId: "work.r4", available });
  assert.deepEqual(wrongProject, { ok: false, code: "cross-project", message: "所拖角色来自另一个项目，没有改变当前观察范围。" });

  const stale = applyCharacterObservationDrop({ currentIds: [], payload: createCharacterObservationDragPayload({ projectId: "project.r4", workVersionId: "work.r4", references: [reference("character.a", "old")] }), projectId: "project.r4", workVersionId: "work.r4", available });
  assert.deepEqual(stale, { ok: false, code: "stale", message: "角色版本已经变化，请从目录重新拖入。" });

  const candidate = applyCharacterObservationDrop({ currentIds: [], payload: { version: CHARACTER_OBSERVATION_DRAG_VERSION, projectId: "project.r4", workVersionId: "work.r4", references: [{ ...reference("character.a"), objectType: "candidate" }] }, projectId: "project.r4", workVersionId: "work.r4", available });
  assert.deepEqual(candidate, { ok: false, code: "candidate", message: "候选人物尚未成为正式角色，不能承担观察视角。" });

  const overflow = applyCharacterObservationDrop({ currentIds: available.map((item) => item.id), payload: createCharacterObservationDragPayload({ projectId: "project.r4", workVersionId: "work.r4", references: [reference("character.extra", "x1")] }), projectId: "project.r4", workVersionId: "work.r4", available: [...available, { id: "character.extra", version: "x1", type: "character" }] });
  assert.deepEqual(overflow, { ok: false, code: "max-five", message: "一次最多比较 5 位正式人物；请先移除一位。" });
});
