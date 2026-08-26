import assert from "node:assert/strict";
import test from "node:test";

import {
  TIANYI_OBJECT_CONTEXT_REF_VERSION,
  describeTianyiGroundedValidationFailure,
  normalizeTianyiGroundedAnswer,
  normalizeTianyiObjectContextRefs,
  parseAndNormalizeTianyiGroundedAnswer,
  tianyiObjectContextRefKey
} from "../../src/storyContinuity/index.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function objectRef(overrides: Record<string, unknown> = {}) {
  return {
    version: TIANYI_OBJECT_CONTEXT_REF_VERSION,
    ownerType: "markdown-object",
    objectType: "character",
    stableId: "character.lin-lan",
    projectId: "gray-tower",
    ownerId: "character.lin-lan",
    contentHash: HASH_A,
    state: "current",
    inclusion: "included",
    label: "林岚",
    ...overrides
  };
}

test("Object Context references dedupe identical entry paths without copying content", () => {
  const values = normalizeTianyiObjectContextRefs([objectRef(), objectRef()]);
  assert.equal(values.length, 1);
  assert.equal(tianyiObjectContextRefKey(values[0]), "gray-tower:markdown-object:character.lin-lan:character:character.lin-lan");
  assert.equal("body" in values[0], false);
  assert.equal("content" in values[0], false);
});

test("Grounded repair diagnostic reports only field/type and bounded source differences", () => {
  const expected = "gray-tower:markdown-object:item.old-seal:item:item.old-seal";
  const unexpected = "old seal evidence";
  const raw = JSON.stringify({
    summary: "旧印章来自父亲。",
    claims: [{ statement: "旧印章存在。", status: "fact", sourceRefs: [unexpected], uncertaintyReason: null }],
    status: "fact",
    sourceRefs: [unexpected],
    uncertaintyReason: null,
    includedSources: [unexpected],
    excludedSources: []
  });
  const diagnostic = describeTianyiGroundedValidationFailure(raw, { includedSourceRefs: [expected], excludedSources: [] }, new Error("source mismatch"));
  assert.equal(diagnostic.stage, "source-set");
  assert.equal(diagnostic.fieldPath, "$.includedSources");
  assert.deepEqual(diagnostic.missingSourceRefs, [expected]);
  assert.deepEqual(diagnostic.unexpectedSourceRefs, [unexpected]);
  assert.equal(JSON.stringify(diagnostic).includes("旧印章来自父亲"), false);
});

test("Object Context rejects more than four explicit sources and disagreeing duplicates", () => {
  assert.throws(() => normalizeTianyiObjectContextRefs(Array.from({ length: 5 }, (_, index) => objectRef({ stableId: `character.${index}`, ownerId: `character.${index}` }))));
  assert.throws(() => normalizeTianyiObjectContextRefs([objectRef(), objectRef({ contentHash: HASH_B })]), /disagree/);
});

test("Object Context accepts a bounded item reference without copying evidence prose", () => {
  const [item] = normalizeTianyiObjectContextRefs([objectRef({
    objectType: "item",
    stableId: "item.father-seal",
    ownerId: "item.father-seal",
    label: "父亲的旧印章"
  })]);
  assert.equal(item.objectType, "item");
  assert.equal("body" in item, false);
});

test("Grounded answer accepts a confirmed fake-betrayal fact with exact current source", () => {
  const sourceRef = "gray-tower:markdown-object:character.lin-lan:character:character.lin-lan";
  const answer = normalizeTianyiGroundedAnswer({
    summary: "林岚的背叛是与顾寒共同确认的假背叛计划。",
    claims: [{ statement: "假背叛已经由两人确认。", status: "fact", sourceRefs: [sourceRef], uncertaintyReason: null }],
    status: "fact",
    sourceRefs: [sourceRef],
    uncertaintyReason: null,
    includedSources: [sourceRef],
    excludedSources: []
  }, { includedSourceRefs: [sourceRef], excludedSources: [] });
  assert.equal(answer.status, "fact");
});

test("Grounded answer recovers a fenced provider JSON object before applying the same strict source checks", () => {
  const sourceRef = "gray-tower:markdown-object:character.lin-lan:character:character.lin-lan";
  const payload = {
    summary: "林岚的背叛是与顾寒共同确认的假背叛计划。",
    claims: [{ statement: "假背叛已经由两人确认。", status: "fact", sourceRefs: [sourceRef], uncertaintyReason: null }],
    status: "fact",
    sourceRefs: [sourceRef],
    uncertaintyReason: null,
    includedSources: [sourceRef],
    excludedSources: []
  };
  const answer = parseAndNormalizeTianyiGroundedAnswer(`说明如下：\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``, { includedSourceRefs: [sourceRef], excludedSources: [] });
  assert.equal(answer.status, "fact");
  assert.throws(() => parseAndNormalizeTianyiGroundedAnswer("前言 {\"summary\":\"缺字段\"}", { includedSourceRefs: [sourceRef], excludedSources: [] }));
});

test("Grounded answer rejects facts without evidence and citations to excluded sources", () => {
  const current = "gray-tower:markdown-object:location.black-forest:location:location.black-forest";
  const excluded = "gray-tower:visual-map:map.main:map-region:region.black-forest";
  const value = {
    summary: "黑森林适合伏击。",
    claims: [{ statement: "重骑兵可以安全撤退。", status: "fact", sourceRefs: [excluded], uncertaintyReason: null }],
    status: "fact",
    sourceRefs: [excluded],
    uncertaintyReason: null,
    includedSources: [current],
    excludedSources: [{ sourceRef: excluded, reason: "source-stale" }]
  };
  assert.throws(() => normalizeTianyiGroundedAnswer(value, {
    includedSourceRefs: [current],
    excludedSources: [{ sourceRef: excluded, reason: "source-stale" }]
  }), /not included|excluded/);
});

test("Removing necessary evidence requires an explicit unknown result", () => {
  const missing = "gray-tower:markdown-object:character.lin-lan:character:character.lin-lan";
  const answer = normalizeTianyiGroundedAnswer({
    summary: "现有来源不足以确认林岚背叛的原因。",
    claims: [{ statement: "无法确认背叛原因。", status: "unknown", sourceRefs: [], uncertaintyReason: "必要人物资料未包含。" }],
    status: "unknown",
    sourceRefs: [],
    uncertaintyReason: "必要人物资料未包含。",
    includedSources: [],
    excludedSources: [{ sourceRef: missing, reason: "source-missing" }]
  }, { includedSourceRefs: [], excludedSources: [{ sourceRef: missing, reason: "source-missing" }] });
  assert.equal(answer.status, "unknown");
  assert.throws(() => normalizeTianyiGroundedAnswer({ ...answer, status: "fact", uncertaintyReason: null }, {
    includedSourceRefs: [],
    excludedSources: [{ sourceRef: missing, reason: "source-missing" }]
  }));
});

test("Black Forest ambush remains conditional and preserves the heavy-cavalry retreat constraint", () => {
  const location = "gray-tower:markdown-object:location.black-forest:location:location.black-forest";
  const map = "gray-tower:visual-map:map.main:map-region:region.black-forest";
  const answer = normalizeTianyiGroundedAnswer({
    summary: "黑森林可用于轻装小队伏击，但前提是预先控制河谷出口；道路狭窄，不适合重骑兵撤退。",
    claims: [
      { statement: "在控制出口并采用轻装小队时，黑森林是伏击候选。", status: "candidate", sourceRefs: [location, map], uncertaintyReason: "敌方侦察路线仍未确认。" },
      { statement: "狭窄道路不适合重骑兵撤退。", status: "fact", sourceRefs: [location], uncertaintyReason: null }
    ],
    status: "candidate",
    sourceRefs: [location, map],
    uncertaintyReason: "是否采用该方案仍取决于出口控制和敌方侦察路线。",
    includedSources: [location, map],
    excludedSources: []
  }, { includedSourceRefs: [location, map], excludedSources: [] });
  assert.equal(answer.status, "candidate");
  assert.match(answer.summary, /不适合重骑兵撤退/u);
  assert.match(answer.summary, /前提/u);
});

test("Selection references carry only a stable owner range and content hash", () => {
  const [selection] = normalizeTianyiObjectContextRefs([objectRef({
    ownerType: "markdown-writing",
    objectType: "selection",
    stableId: "selection.12.28",
    ownerId: "scene.opening",
    label: "当前选区 · 开场"
  })]);
  assert.equal(selection.stableId, "selection.12.28");
  assert.equal("selectedText" in selection, false);
  assert.equal("content" in selection, false);
});
