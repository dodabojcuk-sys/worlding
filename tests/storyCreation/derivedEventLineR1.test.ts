import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDerivedHandoffReceiptR1,
  buildDerivedCreationBriefR1,
  createDerivedEventLineR1,
  markDerivedLineReadyR1,
  projectDerivedLineStalenessR1,
  readDerivedEventLineR1,
  reviewDerivedAlignmentR1,
  scorePovCandidateR1,
  type DerivedSourceUnitR1
} from "../../src/storyCreation/derivedEventLineR1.ts";

const now = "2026-08-18T01:00:00.000Z";
const source: DerivedSourceUnitR1 = {
  id: "unit.clocktower",
  title: "钟楼外寻找阿岚",
  summary: "林远在钟楼外寻找阿岚。",
  version: "sha256:source-r1",
  sourceRefs: [{ sourceKind: "event-line", ownerId: "canon-event-read", entityId: "event.clocktower", entityVersion: "sha256:event-r1", capturedAt: now }],
  items: [
    { id: "node.arrive", kind: "node", authority: "canon", content: { title: "林远到达钟楼外" }, sourceRefs: [] },
    { id: "beat.clue", kind: "beat", authority: "canon", content: { title: "守门人给出线索" }, sourceRefs: [] },
    { id: "node.meet", kind: "node", authority: "canon", content: { title: "阿岚现身" }, sourceRefs: [] }
  ]
};

function create(kind: "translation" | "pov" | "if" | "adaptation") {
  return createDerivedEventLineR1({
    derivedLineId: `derived.${kind}.clocktower`, source, kind, title: `${source.title}·${kind}`, createdAt: now,
    targetLanguage: kind === "translation" ? "English" : undefined,
    glossary: kind === "translation" ? [{ source: "林远", target: "Lin Yuan" }] : undefined,
    branchPoint: kind === "if" ? "守门人没有给出线索" : undefined,
    pov: kind === "pov" ? { actorRef: "character.alan", actorLabel: "阿岚", threshold: 90 } : undefined,
    preservationContract: ["角色核心", "关键事件"], changeContract: ["叙事视角"]
  });
}

test("translation keeps exact event alignment and source revision", () => {
  const write = create("translation");
  const model = readDerivedEventLineR1({ generationConstraints: write.generationConstraints })!;
  assert.equal(model.alignment.length, source.items.length);
  assert.deepEqual(model.alignment.map((item) => item.sourceItemId), source.items.map((item) => item.id));
  assert.ok(model.alignment[0].derivedText.includes("Lin Yuan"));
  assert.equal(model.sourceRevision, source.version);
  assert.equal(model.reviewState, "review");
});

test("review must accept every node before Creation handoff", () => {
  let unit = { ...source, ...create("translation"), id: "unit.translation", version: "sha256:derived-r1" };
  assert.throws(() => markDerivedLineReadyR1(unit), /Every event alignment/);
  for (const alignment of readDerivedEventLineR1(unit)!.alignment) {
    const update = reviewDerivedAlignmentR1({ unit, alignmentId: alignment.alignmentId, decision: "accept" });
    unit = { ...unit, ...update };
  }
  unit = { ...unit, ...markDerivedLineReadyR1(unit) };
  const brief = buildDerivedCreationBriefR1(unit);
  assert.equal((brief.derivedEventLine as Record<string, unknown>).unitVersion, unit.version);
  assert.equal(brief.derivation, "translation");
  const receipt = appendDerivedHandoffReceiptR1({ unit, artifactId: "artifact.translation", artifactVersion: "sha256:artifact-r1", outputType: "novel", createdAt: now });
  assert.equal(readDerivedEventLineR1({ generationConstraints: receipt.generationConstraints })!.creationHandoffs.length, 1);
});

test("source drift fails closed and cannot remain ready", () => {
  const unit = { ...source, ...create("translation"), id: "unit.translation", version: "sha256:derived-r1" };
  const stale = projectDerivedLineStalenessR1(unit, "sha256:source-r2");
  assert.equal(stale.staleSourceState, "stale");
  assert.throws(() => buildDerivedCreationBriefR1({ ...unit, generationConstraints: { derivedEventLineR1: stale } }), /not ready/);
});

test("POV scoring is explainable and knowledge reconstruction never copies private memory", () => {
  const score = scorePovCandidateR1({ actorRef: "character.alan", actorLabel: "阿岚", threshold: 90 });
  assert.equal(score.score, 91);
  assert.equal(score.eligible, true);
  assert.equal(score.explanation.length, 7);
  const model = readDerivedEventLineR1({ generationConstraints: create("pov").generationConstraints })!;
  assert.deepEqual(model.alignment.map((item) => item.knowledgeState), ["visible", "heard", "inferred"]);
  assert.equal(JSON.stringify(model).includes("privateMemory"), false);
});

test("IF and adaptation use explicit contracts and never masquerade as prediction", () => {
  const ifLine = readDerivedEventLineR1({ generationConstraints: create("if").generationConstraints })!;
  const adaptation = readDerivedEventLineR1({ generationConstraints: create("adaptation").generationConstraints })!;
  assert.equal(ifLine.transformKind, "if");
  assert.equal(ifLine.branchPoint, "守门人没有给出线索");
  assert.equal(JSON.stringify(ifLine).includes("prediction"), false);
  assert.deepEqual(adaptation.preservationContract, ["角色核心", "关键事件"]);
  assert.deepEqual(adaptation.changeContract, ["叙事视角"]);
});

