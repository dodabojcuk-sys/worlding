#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const confirmed = process.argv.includes("--confirm-real-provider");
if (!confirmed) {
  print({
    verdict: "REAL_PROVIDER_SMOKE_NOT_STARTED_CONFIRMATION_REQUIRED",
    adapter: "READY_NOT_CALLED",
    realProviderCalls: 0,
    acceptedCandidates: 0,
    formalEventWrites: 0,
    formalRelationWrites: 0,
    canonWrites: 0,
    worldStateWrites: 0,
    next: "确认可能产生费用后，按冻结命令形状显式运行；不要把密钥传给脚本。"
  });
  process.exit(0);
}

const limits = requireExplicitSmokeContract();
const [{ createStoryStudioWorkspaceOperations }, { createStoryStudioMultiNodePredictionOperations }, { createStoryStudioEventReference }, { createAiProviderGateway }, { createSiliconFlowAdapter }, { createProviderCredentialBackend, defaultProviderAppDataRoot }, { createPersistentProviderProfileStore }, { createProviderRequestBudgetLedger, zeroProviderBudgetBaseline }, { createRealProviderMultiNodePredictionGateway }] = await Promise.all([
  import("../src/storyControlSurface/storyStudioWorkspaceOperations.ts"),
  import("../src/storyControlSurface/storyStudioMultiNodePredictionOperations.ts"),
  import("../src/storyContracts/storyStudioEventReference.ts"),
  import("../apps/story-studio/server/providerGateway/aiProviderGateway.mjs"),
  import("../apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs"),
  import("../apps/story-studio/server/providerGateway/providerCredentialBackend.mjs"),
  import("../apps/story-studio/server/providerGateway/persistentProviderProfileStore.mjs"),
  import("../apps/story-studio/server/providerGateway/providerRequestBudgetLedger.mjs"),
  import("../apps/story-studio/server/providerGateway/multiNodePredictionProviderAdapter.mjs")
]);

const appDataRoot = path.resolve(process.env.TIANYAN_PROVIDER_APP_DATA_ROOT || defaultProviderAppDataRoot());
const profileStore = createPersistentProviderProfileStore({ appDataRoot });
const profileState = profileStore.read();
const activeProfile = profileState.profiles.find((item) => item.id === profileState.activeProfileId) || null;
const credentialBackend = createProviderCredentialBackend({ appDataRoot, environment: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" } });
const credential = credentialBackend.read();
if (!credential || activeProfile?.enabled === false) {
  print({ verdict: "REAL_PROVIDER_SMOKE_BLOCKED_LOCAL_CREDENTIAL_UNAVAILABLE", adapter: "READY_NOT_CALLED", realProviderCalls: 0, acceptedCandidates: 0, formalEventWrites: 0, formalRelationWrites: 0, canonWrites: 0, worldStateWrites: 0 });
  process.exit(0);
}
assertOfficialProviderProfile(activeProfile);

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "tianyan-real-provider-smoke-r1-"));
const stateFilePath = path.join(fixtureRoot, ".story-studio", "state.json");
const projectId = "long-night-real-provider-smoke";
let providerGateway = null;

try {
  const siliconFlow = createSiliconFlowAdapter({ apiKeyProvider: () => credential, baseUrlProvider: () => activeProfile.baseUrl });
  const budgetLedger = createProviderRequestBudgetLedger({ appDataRoot: path.join(fixtureRoot, ".provider-gateway"), initialSnapshot: zeroProviderBudgetBaseline() });
  providerGateway = createAiProviderGateway({ adapters: [siliconFlow], budgetLedger });
  if (activeProfile.modelId) providerGateway.selectDiscoveredModel([activeProfile.modelId]);
  const predictionGateway = createRealProviderMultiNodePredictionGateway({ gateway: providerGateway, maxPredictionRuns: 1, maxProviderCalls: limits.maxProviderCalls, maxOutputTokens: limits.maxOutputTokens });
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: fixtureRoot, stateFilePath });
  workspace.createProject({ title: limits.seed, folderSlug: projectId });
  const events = ["暗号传递", "仓库对峙", "旧仓库封锁"].map((title, index) => workspace.createPlanningEvent({ projectId, title, tags: [`时间：第 ${index + 1} 夜`, "单元：雾港"] }));
  const sourceEventRefs = events.map((event) => createStoryStudioEventReference({ projectId, event, requestedUse: "constraint" }));
  const before = fingerprintProtectedProjectFiles(path.join(fixtureRoot, projectId));
  const operations = createStoryStudioMultiNodePredictionOperations({ rootPath: fixtureRoot, stateFilePath, gateway: predictionGateway, executionTimeoutMs: limits.timeoutMs });
  const runId = `prediction-run.real-smoke.${randomUUID()}`;
  operations.createPredictionRun({ request: { projectId, sourceEventRefs, authorGoal: "结合所选节点，推演后续可能发生的连续事件路径。", predictionMode: "forward-development", operationId: `prediction-operation.real-smoke.${randomUUID()}` }, runId });
  const result = await operations.executePredictionRun({ projectId, runId });
  const after = fingerprintProtectedProjectFiles(path.join(fixtureRoot, projectId));
  if (result.status !== "ready" || !result.bundle || result.bundle.paths.length < 1) throw new Error("Real Provider prediction did not produce a ready candidate bundle.");
  if (before !== after) throw new Error("Protected story files changed during candidate-only prediction smoke.");
  const providerCalls = Number(providerGateway.metadata().providers.find((item) => item.id === "siliconflow")?.callCount || 0);
  print({
    verdict: "REAL_PROVIDER_SMOKE_PASS_CANDIDATE_ONLY",
    adapter: "REAL_PROVIDER_ADAPTER",
    runId,
    status: result.status,
    candidatePaths: result.bundle.paths.length,
    candidateNodes: result.bundle.nodes.length,
    realProviderCalls: providerCalls,
    acceptedCandidates: 0,
    formalEventWrites: 0,
    formalRelationWrites: 0,
    canonWrites: 0,
    worldStateWrites: 0,
    protectedProjectFingerprintUnchanged: true
  });
} catch (error) {
  const providerCalls = Number(providerGateway?.metadata().providers.find((item) => item.id === "siliconflow")?.callCount || 0);
  print({ verdict: "REAL_PROVIDER_SMOKE_FAIL", adapter: "REAL_PROVIDER_ADAPTER", realProviderCalls: providerCalls, acceptedCandidates: 0, formalEventWrites: 0, formalRelationWrites: 0, canonWrites: 0, worldStateWrites: 0, error: safeError(error) });
  process.exitCode = 1;
} finally {
  if (path.basename(fixtureRoot).startsWith("tianyan-real-provider-smoke-r1-")) rmSync(fixtureRoot, { recursive: true, force: true });
}

function requireExplicitSmokeContract() {
  if (process.env.TIANYAN_REAL_PROVIDER_SMOKE !== "1") throw new Error("TIANYAN_REAL_PROVIDER_SMOKE=1 is required.");
  const seed = String(process.env.TIANYAN_REAL_PROVIDER_SMOKE_SEED || "").trim();
  if (seed !== "长夜将明") throw new Error("The isolated smoke seed must be 长夜将明.");
  if (requiredInteger("TIANYAN_REAL_PROVIDER_SMOKE_MAX_RUNS", 1) !== 1 || requiredInteger("TIANYAN_REAL_PROVIDER_SMOKE_MAX_ATTEMPTS", 1) !== 1) throw new Error("Smoke is limited to one Run and one attempt.");
  if (process.env.TIANYAN_REAL_PROVIDER_SMOKE_ACCEPT !== "0") throw new Error("Smoke acceptance must remain disabled.");
  return {
    seed,
    maxProviderCalls: optionalBoundedInteger("TIANYAN_REAL_PROVIDER_SMOKE_MAX_PROVIDER_CALLS", 8, 2, 8),
    maxOutputTokens: requiredInteger("TIANYAN_REAL_PROVIDER_SMOKE_MAX_OUTPUT_TOKENS", 256),
    timeoutMs: requiredInteger("TIANYAN_REAL_PROVIDER_SMOKE_TIMEOUT_MS", 30_000)
  };
}

function requiredInteger(name, expected) {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value !== expected) throw new Error(`${name} must equal ${expected}.`);
  return value;
}

function optionalBoundedInteger(name, fallback, minimum, maximum) {
  const value = process.env[name] ? Number(process.env[name]) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return value;
}

function assertOfficialProviderProfile(profile) {
  if (!profile || profile.provider !== "siliconflow") throw new Error("The active Provider profile must be SiliconFlow.");
  if (String(profile.baseUrl || "").replace(/\/$/u, "") !== "https://api.siliconflow.cn/v1") throw new Error("Real smoke only allows the official SiliconFlow HTTPS endpoint.");
}

function fingerprintProtectedProjectFiles(projectPath) {
  const entries = walk(projectPath)
    .filter((file) => !file.includes(`${path.sep}.world-os${path.sep}tianyi${path.sep}multi-node-predictions${path.sep}`))
    .map((file) => `${path.relative(projectPath, file)}\0${createHash("sha256").update(readFileSync(file)).digest("hex")}`)
    .sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

function walk(root) {
  return readdirSync(root).flatMap((entry) => { const target = path.join(root, entry); return statSync(target).isDirectory() ? walk(target) : [target]; });
}

function safeError(error) { return (error instanceof Error ? error.message : "Real Provider smoke failed.").replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 300); }
function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
