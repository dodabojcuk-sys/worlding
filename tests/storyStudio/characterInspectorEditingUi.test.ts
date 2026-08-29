import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("character inspector exposes one consistent edit affordance without a second write path", () => {
  const inspector = readFileSync("apps/story-studio/src/product-shell/project-directory/character/CharacterInspectorCard.tsx", "utf8");
  const styles = readFileSync("apps/story-studio/src/styles/character-directory.css", "utf8");

  assert.match(inspector, /Pencil/);
  assert.match(inspector, /const edit = \(label: string\).*props\.onOpenFull/s);
  assert.match(inspector, /edit\(t\("character\.name"\)\)/);
  assert.match(inspector, /edit\(t\("character\.profileBody"\)\)/);
  assert.match(inspector, /edit\(t\("character\.aliases"\)\)/);
  assert.match(inspector, /edit\(t\("character\.tag"\)\)/);
  assert.match(inspector, /character-inspector-header-actions/);
  assert.match(styles, /\.character-inspector-edit[\s\S]*border: 1px solid transparent/);
  assert.match(styles, /\.character-inspector-header-actions > button[\s\S]*background: transparent[\s\S]*border: 1px solid var\(--color-border\)/);
  assert.doesNotMatch(inspector, /updateWorldObject|set[A-Z]\w*\(.*title/);
});
