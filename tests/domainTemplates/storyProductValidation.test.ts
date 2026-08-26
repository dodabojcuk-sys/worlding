import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { simulateManualStoryInput } from "../../src/domainTemplates/storyWorld/simulation/manualStorySimulation.ts";

const scenarios = {
  simpleOpening: [
    "林远住在海边灯塔。",
    "一天，他收到一封来自十年前的旧信。"
  ].join("\n"),
  directionChange: "林远决定告诉阿岚关于地下室的秘密。",
  longTermChange: "第五章林远失去了守塔人的身份。"
};

test("StoryProductValidation Scenario A verifies a simple story opening can be understood", () => {
  const result = simulateManualStoryInput(scenarios.simpleOpening);

  assert.deepEqual(result.worldObjects.characters.map((character) => character.id), ["lin-yuan"]);
  assert.deepEqual(result.worldObjects.locations.map((location) => location.id), ["old-lighthouse"]);
  assert.deepEqual(result.worldObjects.events.map((event) => event.summary), [
    "林远住在海边灯塔",
    "一天，他收到一封来自十年前的旧信"
  ]);
  assert.deepEqual(result.worldObjects.clues.map((clue) => clue.id), ["clue-old-letter"]);
  assert.equal(result.intent.source, "author");
  assert.equal(result.impactReport.affectedCharacters[0].characterId, "lin-yuan");
  assert.equal(result.uiProjection.currentWorkspace, "writing");
});

test("StoryProductValidation Scenario B verifies direction changes expose impact and author choice", () => {
  const result = simulateManualStoryInput(scenarios.directionChange);

  assert.deepEqual(result.worldObjects.characters.map((character) => character.id), ["a-lan", "lin-yuan"]);
  assert.deepEqual(result.intent.relatedEvents, ["event-2", "event-3"]);
  assert.deepEqual(result.impactReport.affectedCharacters.map((impact) => impact.characterId), [
    "a-lan",
    "lin-yuan"
  ]);
  assert.deepEqual(result.impactReport.affectedRelationships.map((impact) => impact.category), ["trust", "trust"]);
  assert.deepEqual(result.impactReport.alternatives.map((alternative) => alternative.label), [
    "immediate reveal",
    "partial clue",
    "delayed reveal"
  ]);
  assert.equal(result.decisionState.authorDecisionRequired, true);
  assert.equal(result.decisionState.workspace.status, "pending");
  assert.equal(result.decisionState.resolution.canCommit, true);
  assert.equal(result.uiProjection.aiDecisionPanel.status, "decision_ready");
});

test("StoryProductValidation Scenario C verifies long-term changes surface consistency pressure", () => {
  const result = simulateManualStoryInput(scenarios.longTermChange);

  assert.deepEqual(result.worldObjects.characters.map((character) => character.id), ["lin-yuan"]);
  assert.equal(result.intent.targetScope, "character");
  assert.deepEqual(result.impactReport.affectedCharacters.map((impact) => impact.category), ["status_change"]);
  assert.deepEqual(result.impactReport.affectedEvents, []);
  assert.equal(result.uiProjection.consistencyPanel.consistency.unresolvedThreads, 2);
  assert.deepEqual(result.scenePlan.characters, ["lin-yuan"]);
  assert.match(result.scenePlan.informationReveal, /Accept partial clue/);
});

test("StoryProductValidation scenario outputs remain deterministic and writer-facing", () => {
  for (const input of Object.values(scenarios)) {
    const first = simulateManualStoryInput(input);
    const second = simulateManualStoryInput(input);

    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first).includes("gateway"), false);
    assert.equal(JSON.stringify(first).includes("runtime"), false);
    assert.equal(JSON.stringify(first).includes("skillRuntime"), false);
    assert.equal(JSON.stringify(first).includes("plugin"), false);
    assert.equal(JSON.stringify(first).includes("draftText"), false);
  }
});
