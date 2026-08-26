import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createStoryControlSurface,
  createInitialStoryControlState
} from "../../src/storyControlSurface/storyControlSurface.ts";
import type { StoryControlPathId } from "../../src/storyControlSurface/storyControlTypes.ts";

const directionChangeText = "林远决定告诉阿岚关于地下室的秘密。";
const draftText = "林远没有说出全部真相，只把旧地图推到阿岚面前。";

test("StoryControlSurface runs the full author loop as deterministic product actions", () => {
  const first = runFullLoop();
  const second = runFullLoop();

  assert.deepEqual(first, second);
  assert.equal(first.stage, "draft-workspace");
  assert.equal(first.selectedPathId, "partial_clue");
  assert.equal(first.authorDecision.status, "accepted");
  assert.equal(first.rawStoryText, directionChangeText);
  assert.equal(first.draft.text, draftText);
  assert.equal(first.ui.prototypeModel.authorLoop.activeStage, "draft-workspace");
  assert.equal(first.ui.prototypeModel.authorLoop.projectHome.continueWriting.primaryAction, "继续当前创作");
  assert.ok(first.analysis.worldObjects.characters.some((character) => character.name === "阿岚"));
  assert.ok(first.analysis.impactReview.decisionRequired);
  assert.ok(first.worldUpdate.confirmedChanges.length > 0);
});

test("StoryControlSurface keeps world updates behind author decisions", () => {
  const surface = createStoryControlSurface();

  surface.analyzeStoryInput({ text: directionChangeText });
  surface.chooseStoryPath({ pathId: "keep_current_world" });

  assert.throws(
    () => surface.applyWorldUpdatePreview(),
    /requires an accepted author path/
  );

  const snapshot = surface.getCurrentStoryState().state;

  assert.equal(snapshot.authorDecision.status, "rejected");
  assert.equal(snapshot.stage, "impact-review");
  assert.deepEqual(snapshot.worldUpdate.confirmedChanges, []);
});

test("StoryControlSurface exposes a UI-consumable prototype state without lower system vocabulary", () => {
  const surface = createStoryControlSurface();

  surface.getProjectHome();
  surface.continueCurrentWriting();
  surface.analyzeStoryInput({ text: directionChangeText });
  surface.chooseStoryPath({ pathId: "partial_clue" });
  surface.applyWorldUpdatePreview();
  surface.enterDraftWorkspace();
  surface.updateDraftText({ text: draftText });
  const result = surface.checkDraftConsistency();

  assert.equal(result.state.ui.prototypeModel.project.title, "雾中灯塔");
  assert.equal(result.state.ui.prototypeModel.authorLoop.activeStage, "draft-workspace");
  assert.match(JSON.stringify(result.state.ui.prototypeModel), /继续当前创作/);
  assert.doesNotMatch(JSON.stringify(result.state), /gateway|router|ExecutionGateway|executeIntent|skill runtime|plugin runtime|OpenAI|Claude/i);
});

test("StoryControlSurface CLI can run a full author loop across persisted local state", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "story-control-surface-"));
  const stateFile = join(tempDir, "story-control-state.json");

  try {
    const home = runCli(stateFile, "home");
    assert.equal(home.state.stage, "project-home");

    const analyzed = runCli(stateFile, "analyze", "--text", directionChangeText);
    assert.equal(analyzed.state.stage, "impact-review");
    assert.equal(analyzed.state.rawStoryText, directionChangeText);

    const chosen = runCli(stateFile, "choose", "--path", "partial_clue");
    assert.equal(chosen.state.authorDecision.status, "accepted");

    const preview = runCli(stateFile, "update-preview");
    assert.equal(preview.state.stage, "world-update");
    assert.ok(preview.state.worldUpdate.confirmedChanges.length > 0);

    const draft = runCli(stateFile, "draft", "--text", draftText);
    assert.equal(draft.state.stage, "draft-workspace");
    assert.equal(draft.state.draft.text, draftText);

    const checked = runCli(stateFile, "check-draft");
    assert.equal(checked.state.draft.consistency.status, "has_issues");
    assert.ok(checked.state.draft.consistency.issues.length > 0);

    const snapshot = runCli(stateFile, "snapshot");
    assert.deepEqual(snapshot.state, checked.state);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

test("StoryControlSurface source stays deterministic and outside lower systems", () => {
  const state = createInitialStoryControlState();

  assert.equal(state.version, "world-os-story-control-state-v1");
  assert.equal(state.logicalStep, 0);

  const forbidden = [
    "gateway",
    "router",
    "executeIntent",
    "ExecutionGateway",
    "runtimeOrchestration",
    "skillRuntime",
    "plugin runtime",
    "fetch(",
    "XMLHttpRequest",
    "Date.now",
    "Math.random",
    "OpenAI",
    "Claude"
  ];
  const sources = [
    "src/storyControlSurface/storyControlTypes.ts",
    "src/storyControlSurface/storyControlSurface.ts",
    "src/storyControlSurface/storyControlState.ts",
    "src/storyControlSurface/storyControlSerializer.ts",
    "bin/world-os-story.mjs"
  ].map((path) => execFileSync("sed", ["-n", "1,260p", path], { encoding: "utf8" }));
  const combinedSource = sources.join("\n");
  const normalizedSource = combinedSource.toLowerCase();

  for (const term of forbidden) {
    assert.equal(normalizedSource.includes(term.toLowerCase()), false, term);
  }
});

function runFullLoop() {
  const surface = createStoryControlSurface();

  surface.getProjectHome();
  surface.continueCurrentWriting();
  surface.analyzeStoryInput({ text: directionChangeText });
  surface.chooseStoryPath({ pathId: "partial_clue" satisfies StoryControlPathId });
  surface.applyWorldUpdatePreview();
  surface.enterDraftWorkspace();
  surface.updateDraftText({ text: draftText });

  return surface.checkDraftConsistency().state;
}

function runCli(stateFile: string, command: string, ...args: string[]) {
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "bin/world-os-story.mjs", "--state-file", stateFile, command, ...args],
    { encoding: "utf8" }
  );

  return JSON.parse(output);
}
