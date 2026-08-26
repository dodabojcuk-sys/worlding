import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("R9A makes Creation a direct global workspace instead of a rail-adjacent type menu", () => {
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(navigation, /writing: BookOpenText/);
  assert.match(navigation, /props\.onMode\(destination\.id\)/);
  assert.doesNotMatch(navigation, /data-testid="creation-type-menu"/);
  assert.doesNotMatch(navigation, /creationTypeMenuOpen/);
  assert.doesNotMatch(app, /selectCreationType/);
  assert.match(app, /createOutputArtifactFromCurrentStory/);
  assert.match(app, /openCreationFromEvent/);
  assert.doesNotMatch(app, /workspaceMode === "story-units"/);
});

test("R9A presents six distinct author surfaces without a raw structure editor", () => {
  const artifact = source("apps/story-studio/src/components/OutputArtifactWorkbench.tsx");
  const markdown = source("apps/story-studio/src/components/MarkdownEditorAdapter.tsx");
  assert.match(markdown, /data-creation-surface="novel"/);
  assert.match(artifact, /data-creation-surface="screenplay"/);
  for (const type of ["storyboard", "comic", "motion-comic"]) assert.match(artifact, new RegExp(`props\\.artifact\\.type === "${type}"`));
  assert.match(artifact, /MarkdownEditorAdapter = lazy/);
  assert.match(artifact, /ScreenplayEditor/);
  assert.match(artifact, /ComicEditor/);
  assert.match(artifact, /互动叙事正在准备中/);
  assert.doesNotMatch(artifact, /aria-label="结构提纲"/);
  assert.doesNotMatch(artifact, /结构提纲/);
  assert.match(artifact, /window\.setTimeout\(\(\) => void save\(input\), 700\)/);
});

test("R9A removes Story Unit from the normal library presenter while preserving the existing owner contract", () => {
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  const owner = source("src/storyControlSurface/storyStudioWorkspaceOperations.ts");
  assert.doesNotMatch(library, /故事单元/);
  assert.doesNotMatch(app, /StoryUnitWorkbench/);
  assert.match(owner, /createStoryUnit/);
  assert.match(owner, /createOutputArtifact/);
  assert.match(owner, /updateOutputArtifact/);
});

test("R9A routes stable sources through Creation and quarantines legacy Nuwa runtime identity", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const eventLine = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const nuwa = source("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx");
  assert.match(eventLine, /创作所选内容/);
  assert.match(nuwa, /用这个可能性创作/);
  for (const handler of ["openCreationFromEvent", "openCreationFromPossibility"]) assert.match(app, new RegExp(handler));
  assert.match(app, /adaptLegacyNuwaCreationHandoff/);
  assert.match(app, /searchParams\.set\("legacySource", "blocked"\)/);
  assert.doesNotMatch(app, /sourceKind: "nuwa-candidate"/);
  assert.doesNotMatch(app, /ownerId: "nuwa-runpack"/);
  assert.doesNotMatch(eventLine, /建立故事单元/);
});
