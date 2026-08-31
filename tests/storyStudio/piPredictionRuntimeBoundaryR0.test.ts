import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("server and browser transport expose only Tianyi-owned execution projections", () => {
  const server = source("apps/story-studio/server/server.mjs");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  assert.match(server, /"prediction\/execution"/u);
  assert.match(transport, /TianyiPredictionExecutionProjection/u);
  assert.match(transport, /tianyiAgentMode\.ts/u);
  assert.doesNotMatch(transport, /@earendil-works\/pi-/u);
});

test("Pi package imports remain outside every browser source module", () => {
  const browserFiles = walk("apps/story-studio/src").filter((file) => /\.(?:ts|tsx)$/u.test(file));
  for (const file of browserFiles) assert.doesNotMatch(source(file), /@earendil-works\/pi-/u, `Pi SDK leaked into ${file}`);
});

test("prediction runtime implementation contains no ambient network, filesystem, shell, database, or formal writer tool", () => {
  const gateway = source("src/storyAgent/piMultiNodePredictionGateway.ts");
  assert.match(gateway, /TIAN_YI_PREDICTION_TOOL_ALLOWLIST/u);
  assert.match(gateway, /openProviderStream/u);
  assert.doesNotMatch(gateway, /\bfetch\s*\(|node:fs|node:child_process|execFile|spawn\s*\(|createConfirmedEventOnce|createPredictionDraftEventsOnce/u);
});

function walk(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const child = path.join(root, entry);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}
