import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveRuntimeIdentity } from "../../apps/story-studio/src/product-shell/runtimeIdentity.ts";
import { resolveEventObservationView } from "../../apps/story-studio/src/components/event-observation/eventObservationRoute.ts";

const source = (path: string) => readFileSync(path, "utf8");
const identity = JSON.stringify({
  head: "d3d66659e3a4541425ede0404503c79bbf9f181b",
  branch: "codex/tianyan-runtime-legacy-cleanup-r6",
  previewPort: "4895",
  buildTime: "2026-08-16T00:00:00+08:00",
  providerMode: "mock/deterministic"
});

test("runtime identity is opt-in and development-only, without exposing a filesystem root", () => {
  assert.equal(resolveRuntimeIdentity({ dev: false, search: "?runtimeIdentity=1", rawIdentity: identity }), null);
  assert.equal(resolveRuntimeIdentity({ dev: true, search: "", rawIdentity: identity }), null);
  assert.equal(resolveRuntimeIdentity({ dev: true, search: "?runtimeIdentity=1", rawIdentity: "not-json" }), null);
  assert.deepEqual(resolveRuntimeIdentity({ dev: true, search: "?runtimeIdentity=1", rawIdentity: identity }), JSON.parse(identity));
});

test("the formal event route keeps one host and canonicalizes the former Story Observation query", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const host = source("apps/story-studio/src/components/EventObservationWorkspace.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");

  assert.equal([...app.matchAll(/<EventObservationWorkspace\b/g)].length, 1);
  assert.equal([...app.matchAll(/<ProductShellNavigation\b/g)].length, 1);
  assert.match(header, /data-testid="tianyi-quick-launcher"/);
  assert.match(host, /window\.history\.replaceState/);
  assert.deepEqual(resolveEventObservationView("?storyCanvas=successor-r0"), { view: "canvas", legacyCanvas: true, explicit: false });
  assert.deepEqual(resolveEventObservationView("?view=timeline&storyCanvas=successor-r0"), { view: "timeline", legacyCanvas: false, explicit: true });
});
