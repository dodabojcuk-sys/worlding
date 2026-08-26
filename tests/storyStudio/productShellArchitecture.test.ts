import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PRODUCT_WORKSPACE_MODES,
  TOP_LEVEL_DESTINATION_REGISTRY,
  resolveStoryStudioWorkspaceLocation,
  storyStudioWorkspaceDisplayName,
  storyStudioWorkspaceRoute
} from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";

const productShellRoot = "apps/story-studio/src/product-shell";

test("one typed registry exposes eight independent author workspaces in Founder navigation order", () => {
  assert.deepEqual(PRODUCT_WORKSPACE_MODES, ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]);
  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.map((destination) => destination.id), PRODUCT_WORKSPACE_MODES);
  assert.equal(new Set(TOP_LEVEL_DESTINATION_REGISTRY.map((destination) => destination.id)).size, TOP_LEVEL_DESTINATION_REGISTRY.length);
  assert.equal(new Set(TOP_LEVEL_DESTINATION_REGISTRY.map((destination) => destination.route)).size, TOP_LEVEL_DESTINATION_REGISTRY.length);
  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.map((destination) => destination.order), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.every((destination) => destination.enabled), true);
  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.filter((destination) => destination.authorNavigation === "global").map((destination) => destination.id), PRODUCT_WORKSPACE_MODES);
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "event-line")?.displayName, "事件线");
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "nuwa")?.authorNavigation, "global");
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "nuwa")?.displayName, "女娲");
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "multiverse")?.displayName, "多元");
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.some((destination) => /script|comic|video|interactive/u.test(destination.id)), false);
});

test("mobile navigation keeps five primary destinations plus one reachable More menu", () => {
  const navigation = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  const styles = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");
  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.filter((destination) => destination.visibility.mobile === "primary").map((destination) => destination.id), ["world", "tianyi", "event-line", "nuwa", "writing"]);
  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.filter((destination) => destination.visibility.mobile === "more").map((destination) => destination.id), ["multiverse", "library"]);
  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.filter((destination) => destination.visibility.mobile === "hidden").map((destination) => destination.id), ["data"]);
  assert.match(navigation, /aria-label="更多工作面"/);
  assert.match(navigation, /mobileMoreDestinations\.map/);
  assert.match(styles, /\.story-studio-shell > \.product-shell-navigation,[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
});

test("routes, display labels, and legacy creation links resolve through the same registry", () => {
  for (const workspace of TOP_LEVEL_DESTINATION_REGISTRY) {
    assert.equal(storyStudioWorkspaceRoute(workspace.id), workspace.route);
    assert.equal(storyStudioWorkspaceDisplayName(workspace.id), workspace.displayName);
    assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: workspace.route, search: "?skipIntro=1" }), { id: workspace.id, migrated: false });
  }
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/creation", search: "" }), { id: "writing", migrated: false });
  for (const pathname of ["/creation/novel", "/creation/screenplay", "/creation/comic", "/creation/interactive", "/creation/translation-adaptation", "/creation/plugins"]) {
    assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname, search: "?artifact=existing" }), { id: "writing", migrated: false });
  }
  for (const pathname of ["/multiverse/translation", "/multiverse/pov", "/multiverse/if", "/multiverse/fan-localization"]) {
    assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname, search: "" }), { id: "multiverse", migrated: false });
  }
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/writing", search: "" }), { id: "writing", migrated: true });
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/", search: "?workspace=creation" }), { id: "writing", migrated: true });
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/", search: "?skipIntro=1" }), { id: "library", migrated: false });
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/tianyi-v2", search: "" }), { id: "tianyi", migrated: true });
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.some((destination) => destination.id === "tianyi-v2"), false);
});

test("explicit Story deep links outrank the saved continuity destination", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  assert.match(app, /const requestedLocation = currentWorkspaceLocation\(\)/);
  assert.match(app, /window\.location\.pathname === "\/" \|\| requestedLocation\.migrated/);
  assert.match(app, /if \(restoreSavedDestination\) restoreProductWorkspace\(exactContinuity\.activeDestination\)/);
  assert.match(app, /requestedLocation\.migrated/);
  assert.match(app, /normalizeRetiredUiLocation/);
  assert.match(app, /clearRetiredTianyiUiPreferencesFromBrowser/);
  assert.doesNotMatch(app, /tianyiSurfaceVariant/);
});

test("feature workbenches do not import or render a second top-level navigator", () => {
  const files = [
    "CardWorkbench.tsx",
    "EventLineWorkbench.tsx",
    "IntelligenceWorkbench.tsx",
    "NuwaPrimaryWorkspace.tsx",
    "VisualWorkbench.tsx",
    "WorldHomeWorkbench.tsx",
    "WritingWorkbench.tsx"
  ];
  for (const file of files) {
    const imports = importSpecifiers(`apps/story-studio/src/components/${file}`);
    assert.equal(imports.some((specifier) => /WorkspaceModeNav|ProductShellNavigation/.test(specifier)), false, file);
  }
  const tianyiImports = importSpecifiers("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx");
  assert.equal(tianyiImports.some((specifier) => /WorkspaceModeNav|ProductShellNavigation/.test(specifier)), false);
});

test("the product shell dependency boundary excludes business writers, providers, repositories, and prototypes", () => {
  const forbidden = /(?:provider|model-sdk|canon.*write|eventLine.*write|filesystem|ContextPacket|privateStore|story-product-prototype)/i;
  for (const file of recursiveFiles(productShellRoot).filter((item) => /\.tsx?$/.test(item))) {
    for (const specifier of importSpecifiers(file)) assert.doesNotMatch(specifier, forbidden, `${file}: ${specifier}`);
  }
});

test("App owns one global navigator while context panels remain page-specific", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  assert.equal([...app.matchAll(/<ProductShellNavigation\b/g)].length, 1);
  assert.match(app, /<ProductShellNavigation[\s\S]*?story-studio-workspace-stage/);
  for (const file of ["WorldLibraryPanel.tsx", "WritingNavigator.tsx"]) {
    const source = readFileSync(`apps/story-studio/src/components/${file}`, "utf8");
    const imports = importSpecifiers(`apps/story-studio/src/components/${file}`);
    assert.equal(imports.includes("../product-shell/navigation/ProductShellNavigation"), false, file);
    assert.doesNotMatch(source, /<ProductShellNavigation\b/);
  }
});

function importSpecifiers(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/^import(?:[\s\S]*?from\s*)?["']([^"']+)["'];?$/gm)]
    .map((match) => match[1]);
}

function recursiveFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? recursiveFiles(target) : [target];
  });
}
