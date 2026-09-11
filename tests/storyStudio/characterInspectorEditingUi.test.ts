import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("character quick inspector delegates complete reading and editing to the central workspace without a second write path", () => {
  const inspector = readFileSync("apps/story-studio/src/product-shell/project-directory/character/CharacterInspectorCard.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/product-shell/project-directory/character/CharacterWorkspace.tsx", "utf8");
  const styles = readFileSync("apps/story-studio/src/styles/character-directory.css", "utf8");

  assert.match(inspector, /Pencil/);
  assert.match(inspector, /展开角色工作面/);
  assert.match(inspector, /edit\(t\("character\.name"\)\)/);
  assert.match(workspace, /<CharacterMemoryQuery/);
  assert.match(workspace, /onClick=\{props\.onEdit\}/);
  assert.match(workspace, /listRelations\(\{ projectId, workVersionId: runtime\.workVersionId/);
  assert.match(workspace, /characterReturn/);
  assert.match(inspector, /character-inspector-header-actions/);
  assert.match(inspector, /listRelations\(\{ projectId, workVersionId: props\.runtime\.workVersionId, objectId: props\.objectId, reviewState: "confirmed" \}\)/);
  assert.match(inspector, /快速查看/);
  assert.match(styles, /\.character-inspector-edit[\s\S]*border: 1px solid transparent/);
  assert.match(styles, /\.character-inspector-header-actions > button[\s\S]*background: transparent[\s\S]*border: 1px solid var\(--color-border\)/);
  assert.match(styles, /\.character-inspector \{[\s\S]*width: min\(19rem/);
  assert.match(styles, /\.character-workspace-grid \{ display: grid/);
  assert.match(styles, /\.character-inspector\[data-expanded="true"\] \{ width: min\(25rem/);
  assert.doesNotMatch(inspector, /updateWorldObject/);
  assert.doesNotMatch(workspace, /updateWorldObject/);
});
