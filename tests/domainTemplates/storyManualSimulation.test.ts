import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { simulateManualStoryInput } from "../../src/domainTemplates/storyWorld/simulation/manualStorySimulation.ts";

const rawStoryText = [
  "林远是一名守塔人，三年没有离开灯塔。",
  "某夜听见地下声音。",
  "第二天发现一封写着自己名字的旧信。"
].join("\n");

test("StoryManualSimulation turns raw author material into deterministic story product flow", () => {
  const resultA = simulateManualStoryInput(rawStoryText);
  const resultB = simulateManualStoryInput(rawStoryText);

  assert.deepEqual(resultA, resultB);
  assert.equal(resultA.input.rawText, rawStoryText);
  assert.equal(resultA.input.source, "author");

  assert.deepEqual(resultA.worldObjects.characters.map((character) => character.id), ["lin-yuan"]);
  assert.deepEqual(resultA.worldObjects.locations.map((location) => location.id), ["old-lighthouse"]);
  assert.deepEqual(resultA.worldObjects.events.map((event) => event.summary), [
    "林远是一名守塔人，三年没有离开灯塔",
    "某夜听见地下声音",
    "第二天发现一封写着自己名字的旧信"
  ]);
  assert.deepEqual(resultA.worldObjects.clues.map((clue) => clue.id), [
    "clue-underground-sound",
    "clue-old-letter"
  ]);

  assert.equal(resultA.intent.source, "author");
  assert.equal(resultA.intent.targetScope, "event");
  assert.deepEqual(resultA.intent.relatedCharacters, ["lin-yuan"]);
  assert.deepEqual(resultA.intent.relatedEvents, ["event-1", "event-3"]);
  assert.deepEqual(resultA.intent.relatedLocations, ["old-lighthouse"]);

  assert.equal(resultA.impactReport.intentId, resultA.intent.id);
  assert.deepEqual(resultA.impactReport.affectedCharacters.map((impact) => impact.characterId), ["lin-yuan"]);
  assert.deepEqual(resultA.impactReport.affectedEvents.map((impact) => impact.eventId), ["event-1", "event-3"]);
  assert.equal(resultA.impactReport.alternatives.length, 3);
});

test("StoryManualSimulation keeps author decision as an explicit gate before projection", () => {
  const result = simulateManualStoryInput(rawStoryText);

  assert.equal(result.decisionState.authorDecisionRequired, true);
  assert.equal(result.decisionState.workspace.status, "pending");
  assert.equal(result.decisionState.workspace.selectedOption, undefined);
  assert.equal(result.decisionState.resolution.canCommit, true);
  assert.equal(result.decisionState.resolution.workspace.status, "accepted");
  assert.match(result.decisionState.resolution.decisionHistory.authorChoice.optionId, /^decision-/);

  assert.equal(result.scenePlan.version, "world-os-story-scene-plan-v1");
  assert.equal(result.scenePlan.review.status, "accepted");
  assert.equal(result.scenePlan.characters.includes("lin-yuan"), true);
  assert.equal(JSON.stringify(result.scenePlan).includes("draftText"), false);
  assert.equal(JSON.stringify(result.scenePlan).includes("chapterText"), false);

  assert.equal(result.uiProjection.version, "world-os-story-product-ui-state-v1");
  assert.equal(result.uiProjection.currentWorkspace, "writing");
  assert.equal(result.uiProjection.aiDecisionPanel.status, "decision_ready");
  assert.equal(result.uiProjection.nextAction.id, "prepare-draft-request");
});

test("StoryManualSimulation creates no world mutation on the source project", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const before = structuredClone(project);
  const result = simulateManualStoryInput({
    rawText: rawStoryText,
    project
  });

  assert.deepEqual(project, before);
  assert.equal(result.uiProjection.worldSummary.events.includes(`story-event-${result.intent.id}`), false);
});

test("StoryManualSimulation stays deterministic, local, and outside lower systems", () => {
  const source = readSourceTree("src/domainTemplates/storyWorld/simulation");
  const imports = [...new Set([...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]))].sort();

  assert.deepEqual(imports, [
    "../analysis/index.ts",
    "../decision/index.ts",
    "../index.ts",
    "../intent/index.ts",
    "../productUI/storyUIProjection.ts",
    "../productUI/storyUIState.ts",
    "../scene/index.ts",
    "../writing/index.ts",
    "./simulationProjection.ts",
    "./simulationTypes.ts"
  ]);

  const forbidden = [
    ["gate", "way"],
    ["exec", "ution"],
    ["run", "time"],
    ["skill", "Runtime"],
    ["plugin"],
    ["memory", "core"],
    ["fig", "ma"],
    ["React"],
    ["agent"],
    ["automatic", "story", "generation"],
    ["fetch", "("],
    ["XML", "Http", "Request"],
    ["Date", ".now"],
    ["Math", ".random"]
  ].map((parts) => parts.join(""));

  for (const term of forbidden) {
    assert.equal(source.includes(term), false, `forbidden simulation source term leaked: ${term}`);
  }
});


function readSourceTree(root: string): string {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = `${root}/${entry}`;
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return readSourceTree(path);
      }

      return path.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}
