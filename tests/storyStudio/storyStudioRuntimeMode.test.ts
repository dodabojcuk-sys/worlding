import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { STORY_STUDIO_RUNTIME_MODE_ENV, resolveStoryStudioRuntimeMode } from "../../apps/story-studio/server/runtimeMode.mjs";

test("Story Studio runtime modes default safely and reject ambiguous static hosting", () => {
  assert.deepEqual(resolveStoryStudioRuntimeMode({}), { mode: "api-only", staticSiteEnabled: false });
  assert.deepEqual(resolveStoryStudioRuntimeMode({ [STORY_STUDIO_RUNTIME_MODE_ENV]: "api-only" }), { mode: "api-only", staticSiteEnabled: false });
  assert.deepEqual(resolveStoryStudioRuntimeMode({ [STORY_STUDIO_RUNTIME_MODE_ENV]: "combined-static" }), { mode: "combined-static", staticSiteEnabled: true });
  assert.throws(() => resolveStoryStudioRuntimeMode({ [STORY_STUDIO_RUNTIME_MODE_ENV]: "development" }), /api-only or combined-static/);
});

test("development and production commands explicitly select one Story Studio entry contract", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const development = readFileSync("scripts/start-story-studio-dev.mjs", "utf8");
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const vite = readFileSync("apps/story-studio/vite.config.ts", "utf8");

  assert.match(development, /TIANYAN_STORY_STUDIO_RUNTIME_MODE: "api-only"/);
  assert.match(development, /DEV_UI=http:\/\/127\.0\.0\.1:\$\{vitePort\}/);
  assert.match(development, /ACCEPTANCE_ENTRY=http:\/\/127\.0\.0\.1:\$\{vitePort\}/);
  assert.match(packageJson.scripts.serve, /^TIANYAN_STORY_STUDIO_RUNTIME_MODE=combined-static /);
  assert.match(vite, /"\/__local\/story-studio": `http:\/\/127\.0\.0\.1:\$\{Number\(process\.env\.PORT \|\| 4192\)\}`/);
  assert.match(server, /if \(runtimeMode\.staticSiteEnabled\) serveStatic\(response, url\.pathname\);/);
  assert.match(server, /else sendApiOnlyDiagnostic\(request, response, url\.pathname\);/);
  assert.match(server, /pathname === "\/__local\/story-studio\/health"/);
});
