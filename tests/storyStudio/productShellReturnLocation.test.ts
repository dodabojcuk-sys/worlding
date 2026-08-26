import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveProductShellReturnLocation,
  type ProductShellLocationSnapshot
} from "../../apps/story-studio/src/product-shell/location/productShellReturnLocation.ts";

const snapshot: ProductShellLocationSnapshot = {
  version: "story-studio-product-shell-location/v1",
  projectId: "mist-lighthouse",
  destination: "writing",
  workspaceMode: "library",
  showWorldHome: false,
  target: { kind: "writing-document", id: "scene.one", revision: "sha256:one" },
  selectionAnchor: { objectId: "character.lin", source: "writing-mention", documentId: "scene.one", blockId: null, relationId: null },
  editorSelection: { start: 64, end: 83 },
  scrollTop: 460,
  focusToken: "writing-editor"
};

test("product shell returns exactly by stable document ID and revision", () => {
  assert.deepEqual(resolveProductShellReturnLocation({
    snapshot,
    currentProjectId: "mist-lighthouse",
    availableTargets: [{ kind: "writing-document", id: "scene.one", revision: "sha256:one" }]
  }), { state: "exact", snapshot });
});

test("deleted targets fall back to the stable parent without same-title aliasing", () => {
  assert.deepEqual(resolveProductShellReturnLocation({
    snapshot,
    currentProjectId: "mist-lighthouse",
    availableTargets: [{ kind: "writing-document", id: "scene.same-title", revision: "sha256:one" }]
  }), { state: "nearest-stable-parent", reason: "target-missing", snapshot });
});

test("stale revisions are reported honestly and never restore an obsolete selection", () => {
  assert.deepEqual(resolveProductShellReturnLocation({
    snapshot,
    currentProjectId: "mist-lighthouse",
    availableTargets: [{ kind: "writing-document", id: "scene.one", revision: "sha256:two" }]
  }), { state: "nearest-stable-parent", reason: "revision-stale", snapshot });
});

test("a snapshot cannot cross project ownership", () => {
  assert.equal(resolveProductShellReturnLocation({
    snapshot,
    currentProjectId: "another-world",
    availableTargets: []
  }).state, "project-mismatch");
});

test("Impact Review returns through the Nuwa route without a generic writing jump", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  assert.match(app, /onReturnWriting=\{returnFromImpactReview\}/u);
  assert.match(app, /function returnFromImpactReview\(\)[\s\S]*?restoreProductWorkspace\("nuwa"\)/u);
  assert.doesNotMatch(app, /onReturnWriting=\{\(\) => void chooseProductMode\("writing"\)\}/u);
});
