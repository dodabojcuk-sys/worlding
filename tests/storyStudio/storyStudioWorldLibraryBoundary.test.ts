import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import test from "node:test";

test("Story Studio World Library keeps canonical boundaries", () => {
  const clientFiles = walk("apps/story-studio/src");
  const preferenceFile = "apps/story-studio/src/lib/controlCenterPreferences.ts";
  const canonicalClient = clientFiles.filter((file) => file !== preferenceFile).map((file) => readFileSync(file, "utf8")).join("\n");
  const preferences = readFileSync(preferenceFile, "utf8");
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const operations = readFileSync("src/storyControlSurface/storyStudioWorkspaceOperations.ts", "utf8");

  for (const forbidden of ["node:fs", "node:path", "storyWorkspaceRepository", "story-product-prototype", "storyIntelligence", "gateway", "capabilityRuntime", "localStorage"]) {
    assert.equal(canonicalClient.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.match(preferences, /story-studio:ai-control-center:v1/);
  assert.match(preferences, /window\.localStorage/);
  assert.doesNotMatch(preferences, /markdown|storyTruth|chapterBody|sceneBody|worldObject/i);
  const sessionStorageFiles = clientFiles.filter((file) => readFileSync(file, "utf8").includes("sessionStorage"));
  assert.deepEqual(sessionStorageFiles.sort(), [
      "apps/story-studio/src/App.tsx",
      "apps/story-studio/src/components/OutputArtifactWorkbench.tsx",
      "apps/story-studio/src/components/tianyi/TianyiCreativeWorkspace.tsx",
      "apps/story-studio/src/components/tianyi/useTianyiSessionController.ts",
      "apps/story-studio/src/components/work-version-creation/WorkVersionBoundCreationWorkspace.tsx"
  ].sort());
  assert.match(readFileSync("apps/story-studio/src/components/OutputArtifactWorkbench.tsx", "utf8"), /story-studio:creation-recovery:/);
  assert.match(server, /createStoryStudioWorkspaceOperations/);
  assert.doesNotMatch(server, /parseStoryMarkdown|serializeStoryMarkdown|createWorkspaceNote\s*\(/);
  assert.doesNotMatch(operations, /function\s+parseStoryMarkdown|function\s+serializeStoryMarkdown/);
  assert.match(operations, /activeDestination:.*nuwa/);
  assert.equal((server.match(/from "\.\.\/\.\.\/\.\.\/src\/storyIntelligence\/index\.ts"/g) || []).length, 1);
  assert.match(server, /readNuwaRunPack/);
  assert.doesNotMatch(operations, /gateway/i);
  assert.match(server, /createAiProviderGateway/);
});

function walk(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = join(root, entry.name);
    if (entry.isDirectory()) return walk(file);
    return [".ts", ".tsx", ".css"].includes(extname(entry.name)) ? [file] : [];
  });
}
