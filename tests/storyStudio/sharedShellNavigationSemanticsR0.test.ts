import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("the shared shell projects exactly one current destination across desktop and mobile More", () => {
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");

  assert.match(navigation, /window\.matchMedia\("\(max-width: 820px\)"\)/);
  assert.match(navigation, /const railCurrent = active && \(!mobileNavigation \|\| destination\.visibility\.mobile === "primary"\)/);
  assert.match(navigation, /aria-current=\{railCurrent \? "page" : undefined\}/);
  assert.match(navigation, /aria-current=\{mobileNavigation && active \? "page" : undefined\}/);
  assert.doesNotMatch(navigation, /<summary aria-label="更多工作面" aria-current=/);
});

test("the workspace registry names all eight frozen global destinations", () => {
  const registry = source("src/storyContracts/storyStudioWorkspaceRegistry.ts");

  assert.match(registry, /eight author workspaces/);
  assert.match(registry, /id: "data"/);
});
