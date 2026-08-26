import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("M4 World primary action projects the existing writing state without creating story data", () => {
  const world = readFileSync("apps/story-studio/src/components/WorldHomeWorkbench.tsx", "utf8");
  assert.match(world, /props\.activeWritingDocument[\s\S]*label: "继续写作"/);
  assert.match(world, /props\.activeWritingChapter[\s\S]*label: "选择章节"/);
  assert.match(world, /label: "开始写作"/);
  assert.match(world, /data-testid="world-pulse-continue-writing"/);
  assert.doesNotMatch(world, /createWritingDocument|createStoryUnit|createWorldObject/);
});

test("M4 Library empty state and hierarchy stay inside existing Library owners", () => {
  const home = readFileSync("apps/story-studio/src/components/LibraryHomeWorkbench.tsx", "utf8");
  const css = readFileSync("apps/story-studio/src/styles/app.css", "utf8");
  assert.match(home, /新建第一份资料/);
  assert.match(home, /onClick=\{props\.onCreateObject\}/);
  assert.match(home, /资料结构/);
  assert.match(css, /library-home-empty \.secondary-action/);
  assert.match(css, /library-home-type-button, \.library-home-organize-button[\s\S]*border: 1px solid transparent/);
});
