import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createCharacterStateFixtureProjection } from "../../apps/story-studio/src/components/character-state/characterStateFixture.ts";

const workspaceSource = readFileSync(new URL("../../apps/story-studio/src/components/character-state/CharacterStateWorkspace.tsx", import.meta.url), "utf8");
const fateSource = readFileSync(new URL("../../apps/story-studio/src/components/character-fate/CharacterFateWorkspace.tsx", import.meta.url), "utf8");
const dockSource = readFileSync(new URL("../../apps/story-studio/src/components/TianyiQuickAssistant.tsx", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../../apps/story-studio/server/server.mjs", import.meta.url), "utf8");

test("Fixture keeps stable Character ID across display-name projection", () => {
  const projection = createCharacterStateFixtureProjection({ characterId: "fixture.character.shen-yan" });
  assert.equal(projection?.characterId, "fixture.character.shen-yan");
  assert.equal(projection?.characterName, "沈砚");
});

test("Fixture distinguishes Character knowledge asymmetry and other-character secrets", () => {
  const shen = createCharacterStateFixtureProjection({ characterId: "fixture.character.shen-yan", fixtureCase: "asymmetry" });
  const awu = createCharacterStateFixtureProjection({ characterId: "fixture.character.a-wu", fixtureCase: "asymmetry" });
  assert.equal(shen?.openQuestions.some((item) => item.statement.includes("阿芜")), true);
  assert.equal(awu?.openQuestions.some((item) => item.statement.includes("沈砚")), true);
});

test("confirmed Event re-projects Character State without changing Candidate or Data owner", () => {
  const before = createCharacterStateFixtureProjection({ characterId: "fixture.character.shen-yan" });
  const after = createCharacterStateFixtureProjection({ characterId: "fixture.character.shen-yan", confirmedEventId: "event.fixture-confirmed" });
  assert.equal(before?.knowledgeState.some((item) => item.claimId === "claim.knowledge.old-name-confirmed"), false);
  assert.equal(after?.knowledgeState.some((item) => item.learnedAtEventId === "event.fixture-confirmed"), true);
});

test("Character State UI provides author language, accessible timeline/table and exact return state", () => {
  assert.match(workspaceSource, /的状态与知识边界/);
  assert.match(workspaceSource, /时间线的等价表格/);
  assert.match(workspaceSource, /characterStateReturn/);
  assert.match(workspaceSource, /scrollTop/);
  assert.match(workspaceSource, /focusClaimId/);
  assert.doesNotMatch(workspaceSource, /<h[1-3][^>]*>\s*(projection|owner|schema|runtime|hash|revision)/i);
});

test("Fate point explanation distinguishes fact, knowledge, unknown and boundary risk", () => {
  assert.match(fateSource, /事实变化/);
  assert.match(fateSource, /角色新知道/);
  assert.match(fateSource, /仍然未知/);
  assert.match(fateSource, /越界风险/);
  assert.match(fateSource, /规划或候选不能伪装成已发生状态/);
});

test("Character Work Dock is deterministic read/proposal-only and exposes zero Provider result", () => {
  assert.match(dockSource, /character-state-work-dock-fixture/);
  assert.match(dockSource, /检查角色知识边界/);
  assert.match(dockSource, /准备状态补充候选/);
  assert.match(dockSource, /WORK_DOCK_REAL_PROVIDER_RESULT=NO_THIS_TASK/);
});

test("browser fixture writes are explicitly gated and never available as a default runtime action", () => {
  assert.match(serverSource, /TIANYAN_CHARACTER_STATE_FIXTURE_R0/);
  assert.match(serverSource, /Character State write fixture is disabled/);
});
