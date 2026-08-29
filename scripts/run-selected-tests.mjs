import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const integrationTests = new Set([
  "tests/storyControlSurface/storyStudioGenericWriterBoundary.test.ts",
  "tests/storyControlSurface/storyStudioWorkspaceLifecycle.test.ts",
  "tests/storyStudio/phase1bEventReferenceAndWorkspaceRegistry.test.ts",
  "tests/storyStudio/storyStudioProviderGateway.test.ts",
  "tests/storyStudio/persistentProviderServer.test.ts",
  "tests/storyStudio/storyStudioStorageProvider.test.ts",
  "tests/storyStudio/storyStudioTianyiTransport.test.ts",
  "tests/storyStudio/tianyiAgentRuntimeTransportR0.test.ts"
]);

const trackedTests = execFileSync("git", ["ls-files", "tests/**/*.test.ts"], { encoding: "utf8" })
  .split("\n")
  .map((entry) => entry.trim())
  .filter((entry) => entry && existsSync(path.join(root, entry)));
const unitTests = trackedTests.filter((entry) => !integrationTests.has(entry));
const integrationTestFiles = trackedTests.filter((entry) => integrationTests.has(entry));

const mode = process.argv[2] || "unit";
if (mode === "lint") {
  const forbidden = [
    "_research",
    "apps/world-os-ui",
    "apps/world-os-product",
    "apps/story-product-prototype",
    "src/agentRuntime",
    "src/agentRuntimeEngine",
    "src/app",
    "src/audit",
    "src/authoring",
    "src/authoringContext",
    "src/authoringExecution",
    "src/authoringKeyframes",
    "src/authoringPersistence",
    "src/authoringProduct",
    "src/capabilityRuntime",
    "src/cognition",
    "src/core",
    "src/demo",
    "src/director",
    "src/entities",
    "src/entryFlow",
    "src/experience",
    "src/experienceRuntime",
    "src/gateway",
    "src/governance",
    "src/integration",
    "src/modelShadowV2",
    "src/narrative",
    "src/persistence",
    "src/prediction",
    "src/predictionEngine",
    "src/product",
    "src/productExperience",
    "src/productInteraction",
    "src/productPlugin",
    "src/prompt",
    "src/runtimeOrchestration",
    "src/scenario",
    "src/semantic",
    "src/session",
    "src/simulation",
    "src/storyCognition",
    "src/system",
    "src/trace",
    "src/ui",
    "src/uiContract",
    "src/uiRendering",
    "src/uiRuntime",
    "src/visualization",
    "src/workbench",
    "src/world",
    "src/worldBranching",
    "src/worldFileSystem",
    "src/worldGraphEngine"
  ];
  const trackedPaths = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const candidate of forbidden) {
    if (trackedPaths.some((entry) => entry === candidate || entry.startsWith(`${candidate}/`))) {
      throw new Error(`retired source must stay absent: ${candidate}`);
    }
  }
  const allowedStoryStudioScripts = new Set([
    "apps/story-studio/scripts/bounded-process-teardown.mjs",
    "apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs"
  ]);
  const trackedStoryStudioScripts = execFileSync("git", ["ls-files", "apps/story-studio/scripts"], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry && existsSync(path.join(root, entry)));
  const unexpectedScripts = trackedStoryStudioScripts.filter((entry) => !allowedStoryStudioScripts.has(entry));
  if (unexpectedScripts.length > 0) {
    throw new Error(`retired Story Studio scripts must stay absent: ${unexpectedScripts.join(", ")}`);
  }
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const keys = Object.keys(packageJson.scripts);
  const expected = ["dev", "build", "serve", "typecheck", "lint", "test", "test:unit", "test:integration", "test:e2e", "verify"];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`package scripts must be exactly ${expected.join(", ")}`);
  }
  execFileSync(process.execPath, ["scripts/validate-feature-index.mjs"], { cwd: root, stdio: "inherit" });
  console.log(`lint PASS: ${keys.length} package scripts; retired-source and feature-index invariants verified`);
  process.exit(0);
}

const selected = mode === "integration" ? integrationTestFiles : unitTests;
if (!['unit', 'integration'].includes(mode)) throw new Error(`unknown test mode: ${mode}`);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...selected], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, REAL_PROVIDER_CREDENTIALS_USED: "0", PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY" }
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`${mode} PASS: ${selected.length} test files`);
