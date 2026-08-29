import assert from "node:assert/strict";
import test from "node:test";

import { createGlobalSearchEngine } from "../../apps/story-studio/src/product-shell/global-search/globalSearchEngine.ts";
import { globalSearchResultId, moveGlobalSearchActiveIndex } from "../../apps/story-studio/src/product-shell/global-search/globalSearchKeyboard.ts";
import type { GlobalSearchProjectReadModel, GlobalSearchReadAdapter } from "../../apps/story-studio/src/product-shell/global-search/globalSearchTypes.ts";

const context = { projectId: "project.r06", workVersionId: "version.r06" };
const readModel: GlobalSearchProjectReadModel = {
  context,
  objects: [
    { id: "character.lin-zhao", title: "林昭", type: "character", aliases: ["阿昭"], tags: ["主角"], revision: "obj-char-r2", sourceId: "characters/lin-zhao.md" },
    { id: "item.bell", title: "铜铃", type: "item", aliases: [], tags: ["线索"], revision: "obj-item-r1", sourceId: "items/bell.md" }
  ],
  sources: [{ id: "source.chapter-one", title: "第一章原稿", filename: "chapter-one.md", revision: "source-r3", mode: "extract-review" }]
};

function adapter(model = readModel): GlobalSearchReadAdapter {
  return { read: async (requested) => {
    assert.deepEqual(requested, context, "project reads must receive the exact active project/work-version context");
    return model;
  } };
}

test("R0.6 global search uses one engine for route, object, source, and navigation-command results", async () => {
  const engine = createGlobalSearchEngine(adapter());
  const [route, object, source, command] = await Promise.all([
    engine.search({ query: "world", scope: "global", context }),
    engine.search({ query: "阿昭", scope: "global", context }),
    engine.search({ query: "chapter-one", scope: "global", context }),
    engine.search({ query: "world", scope: "global", context })
  ]);
  assert.ok(route.some((result) => result.type === "workspace" && result.target.route === "/world"));
  const character = object.find((result) => result.id.includes("character.lin-zhao"));
  assert.ok(character);
  assert.equal(character.stableReference.projectId, context.projectId);
  assert.equal(character.stableReference.workVersionId, context.workVersionId);
  assert.deepEqual(character.stableReference.directoryReference, { objectId: "character.lin-zhao", version: "obj-char-r2", sourceId: "characters/lin-zhao.md", projectId: context.projectId, workVersionId: context.workVersionId, objectType: "character" });
  assert.ok(source.some((result) => result.type === "source" && result.target.query?.directorySource === "source.chapter-one"));
  assert.ok(command.some((result) => result.type === "command" && result.target.route === "/world"));
});

test("R0.6 scopes restrict existing projections without creating a second index", async () => {
  const engine = createGlobalSearchEngine(adapter());
  const characters = await engine.search({ query: "", scope: "characters", context });
  const directory = await engine.search({ query: "", scope: "directory", context });
  assert.deepEqual(characters.map((result) => result.type), ["object"]);
  assert.deepEqual(characters.map((result) => result.title), ["林昭"]);
  assert.ok(directory.every((result) => result.type === "object" || result.type === "source"));
  assert.ok(directory.some((result) => result.type === "source"));
});

test("R0.6 rejects cross-project or cross-version read models", async () => {
  const engine = createGlobalSearchEngine({ read: async () => ({ ...readModel, context: { projectId: context.projectId, workVersionId: "version.other" } }) });
  await assert.rejects(() => engine.search({ query: "林昭", scope: "global", context }), /another project or work version/);
});

test("R0.6 keyboard controller wraps options and creates stable active-descendant ids", () => {
  assert.equal(moveGlobalSearchActiveIndex({ activeIndex: -1, resultCount: 3 }, "ArrowDown"), 0);
  assert.equal(moveGlobalSearchActiveIndex({ activeIndex: 0, resultCount: 3 }, "ArrowUp"), 2);
  assert.equal(moveGlobalSearchActiveIndex({ activeIndex: 2, resultCount: 3 }, "ArrowDown"), 0);
  assert.equal(moveGlobalSearchActiveIndex({ activeIndex: 1, resultCount: 3 }, "Home"), 0);
  assert.equal(moveGlobalSearchActiveIndex({ activeIndex: 1, resultCount: 3 }, "End"), 2);
  assert.equal(moveGlobalSearchActiveIndex({ activeIndex: 0, resultCount: 0 }, "ArrowDown"), -1);
  assert.equal(globalSearchResultId("object:角色/1"), "global-search-result-object----1");
});
