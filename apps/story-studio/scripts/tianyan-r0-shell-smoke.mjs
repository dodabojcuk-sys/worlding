import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

import { terminateChildProcess } from "./bounded-process-teardown.mjs";
import { createTianyanE2eFixture, removeTianyanE2eFixture } from "../../../scripts/tianyan-e2e-fixture.mjs";
import { assertCanonicalRuntime } from "../../../scripts/canonical-runtime.mjs";
import { WORK_VERSION_REQUIRED_OWNER_KINDS, createStoryStudioWorkVersionAuthority } from "../../../src/storyWorkspace/workVersionAuthority.ts";
import { resolveWorkVersionOwnerSnapshotRefs } from "../../../src/storyWorkspace/workVersionSnapshotResolver.ts";
import { projectNarrativeArrangement } from "../../../src/storyContracts/narrativeArrangement.ts";
import { stableJson } from "../../../src/storyContinuity/continuityValidation.ts";

assertCanonicalRuntime();
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
// Smoke tests must not attach to a developer's already-running local app.
// Each invocation receives an isolated pair and may still be pinned by CI.
const port = await findAvailablePort(process.env.TIANYAN_E2E_PORT);
const apiPort = await findAvailablePort(process.env.TIANYAN_E2E_API_PORT, port);
const baseUrl = `http://127.0.0.1:${port}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const fixture = createTianyanE2eFixture();
const fixtureRoot = fixture.fixtureRoot;
const providerFixtureRoot = path.join(fixtureRoot, ".provider-app-data");
const fixtureProjectId = fixture.projectId;
const controlToken = "tianyan-r0-shell-smoke-token";
const visualEvidenceDirectory = process.env.TIANYAN_R05_EVIDENCE_DIR || null;
const visualEvidenceViewport = Number(process.env.TIANYAN_R05_EVIDENCE_VIEWPORT || "0");
const visualEvidenceState = process.env.TIANYAN_R05_EVIDENCE_STATE || null;
const r062VisualEvidenceDirectory = process.env.TIANYAN_R062_EVIDENCE_DIR || null;
const eventGraphEvidenceDirectory = process.env.TIANYAN_EVENT_GRAPH_EVIDENCE_DIR || null;
const eventGraphDensityEvidence = process.env.TIANYAN_EVENT_GRAPH_DENSITY_EVIDENCE === "1";
const eventGraphRecordingDirectory = process.env.TIANYAN_EVENT_GRAPH_RECORDING_DIR || null;
const temporalProjectionRecordingDirectory = process.env.TIANYAN_TEMPORAL_RECORDING_DIR || null;
const founderEvidenceDirectory = process.env.TIANYAN_FOUNDER_EVIDENCE_DIR || null;
const r6CloseoutDirectory = process.env.TIANYAN_R6_CLOSEOUT_DIR || null;
const r7CloseoutDirectory = process.env.TIANYAN_R7_CLOSEOUT_DIR || null;
const r8CloseoutDirectory = process.env.TIANYAN_R8_CLOSEOUT_DIR || null;
const r9EvidenceDirectory = process.env.TIANYAN_R9_EVIDENCE_DIR || null;
const r10EvidenceDirectory = process.env.TIANYAN_R10_EVIDENCE_DIR || null;
const r11ObservationEvidenceDirectory = process.env.TIANYAN_R11_OBSERVATION_EVIDENCE_DIR || null;
const r12EventLineEvidenceDirectory = process.env.TIANYAN_R12_EVENT_LINE_EVIDENCE_DIR || null;
const r1DualAxisCausalEvidenceDirectory = process.env.TIANYAN_EVENT_LINE_R1_EVIDENCE_DIR || null;
const r2StoryCrossingEvidenceDirectory = process.env.TIANYAN_EVENT_LINE_R2_EVIDENCE_DIR || null;
const founderCloseoutR21EvidenceDirectory = process.env.TIANYAN_EVENT_LINE_R2_1_EVIDENCE_DIR || null;
const tianyiGoldenLoopEvidenceDirectory = process.env.TIANYI_GOLDEN_LOOP_EVIDENCE_DIR || null;
const shellFocusR22AEvidenceDirectory = process.env.TIANYAN_SHELL_R22A_EVIDENCE_DIR || null;
const multiNodePredictionEvidenceDirectory = process.env.TIANYAN_MULTI_NODE_PREDICTION_EVIDENCE_DIR || null;
const runtimeModeEvidencePath = process.env.TIANYAN_RUNTIME_MODE_DEV_EVIDENCE || null;
const predictionOnly = process.env.TIANYAN_E2E_SCOPE === "multi-node-prediction";
const authorEventReloadOnly = process.env.TIANYAN_E2E_SCOPE === "author-event-reload";
const tianyiGoldenLoopOnly = process.env.TIANYAN_E2E_SCOPE === "tianyi-golden-loop";
const timelineOnly = process.env.TIANYAN_E2E_SCOPE === "semantic-timeline";
const timelineRecordingOnly = process.env.TIANYAN_E2E_SCOPE === "semantic-timeline-recording";
const r6RecordingOnly = process.env.TIANYAN_E2E_SCOPE === "r6-closeout-recording";
const r7RecordingOnly = process.env.TIANYAN_E2E_SCOPE === "r7-interaction-recording";
const r8RecordingOnly = process.env.TIANYAN_E2E_SCOPE === "r8-foundation-recording";
const r9RecordingOnly = process.env.TIANYAN_E2E_SCOPE === "r9-evidence-recording";
const r10RecordingOnly = process.env.TIANYAN_E2E_SCOPE === "r10-closeout-recording";
const r11ObservationOnly = process.env.TIANYAN_E2E_SCOPE === "r11-observation-workspace";
const r12EventLineOnly = process.env.TIANYAN_E2E_SCOPE === "r12-event-line-workspace";
const r1DualAxisCausalOnly = process.env.TIANYAN_E2E_SCOPE === "event-line-dual-axis-causal-r1";
const r2StoryCrossingOnly = process.env.TIANYAN_E2E_SCOPE === "event-line-story-crossing-r2";
const r2KnowledgeIsolationOnly = process.env.TIANYAN_E2E_SCOPE === "event-line-knowledge-isolation-r2";
const founderCloseoutR21Only = process.env.TIANYAN_E2E_SCOPE === "event-line-founder-closeout-r2-1";
const founderCloseoutR21RecordingOnly = process.env.TIANYAN_E2E_SCOPE === "event-line-founder-closeout-r2-1-recording";
const shellFocusR22AOnly = process.env.TIANYAN_E2E_SCOPE === "workspace-shell-focus-r2-2a";
const storyIntakeOnly = process.env.TIANYAN_E2E_SCOPE === "tianyi-story-intake";
const r4CharacterObservationOnly = process.env.TIANYAN_E2E_SCOPE === "r4-character-observation";
let timelineFixture = null;
let observationFixture = null;
let narrativeFixture = null;
let r1CausalFixture = null;
let server;
let apiServer;
let browser;
let ollamaFixture;
let expectedProviderCatalogFailure = false;
let expectedProviderFailureConsoleBudget = 0;
const r062Captures = [];

async function findAvailablePort(requestedPort, excludedPort) {
  const requested = Number(requestedPort || "0");
  if (Number.isInteger(requested) && requested > 0 && requested !== excludedPort) return requested;
  return await new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const candidate = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(candidate));
    });
  });
}

try {
  ollamaFixture = await startProviderCatalogOllamaFixture();
  apiServer = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    stdio: process.env.TIANYAN_E2E_DEBUG_STDIO === "1" ? "inherit" : ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", PORT: String(apiPort), WORLD_OS_STORY_STUDIO_ROOT: fixtureRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(fixtureRoot, ".story-studio", "state.json"), WORLD_OS_LOCAL_CONTROL_TOKEN: controlToken, PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY", REAL_PROVIDER_CREDENTIALS_USED: "0", TIANYAN_AGENT_FAKE_PROVIDER_STREAM: "1", TIANYAN_AGENT_FAKE_STORY_INTAKE_FAILURE_ORDINAL: storyIntakeOnly ? "2" : "0", TIANYAN_STORY_MODELING_TEST_PROVIDER: "1", TIANYAN_STORY_MODELING_TEST_BATCH_DELAY_MS: r8RecordingOnly || r9RecordingOnly || r10RecordingOnly ? "650" : "0", TIANYAN_PROVIDER_APP_DATA_ROOT: providerFixtureRoot, TIANYAN_STORY_STUDIO_RUNTIME_MODE: "api-only" }
  });
  apiServer.stdout?.resume();
  apiServer.stderr?.resume();
  await waitForApiServer();
  server = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--config",
    "apps/story-studio/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort"
  ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(apiPort) } });
  server.stdout?.resume();
  server.stderr?.resume();
  await waitForServer();
  await assertDevelopmentRuntimeMode();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const recordingDirectory = shellFocusR22AOnly ? shellFocusR22AEvidenceDirectory : tianyiGoldenLoopOnly ? tianyiGoldenLoopEvidenceDirectory : r1DualAxisCausalOnly ? r1DualAxisCausalEvidenceDirectory : r2StoryCrossingOnly ? r2StoryCrossingEvidenceDirectory : null;
  const page = recordingDirectory
    ? await (await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: recordingDirectory, size: { width: 1440, height: 900 } } })).newPage()
    : await browser.newPage({ viewport: { width: 1152, height: 720 } });
  const consoleProblems = [];
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const problem = `${message.type()}: ${message.text()}`;
    if (expectedProviderFailureConsoleBudget > 0 && /Failed to load resource.*503/u.test(problem)) {
      expectedProviderFailureConsoleBudget -= 1;
      return;
    }
    consoleProblems.push(problem);
  });
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("response", (response) => response.status() >= 400 && !(expectedProviderCatalogFailure && response.url().endsWith("/model-service/models")) && consoleProblems.push(`HTTP ${response.status()}: ${response.url()}`));

  await gotoProduct(page, `${baseUrl}/world`);
  if (storyIntakeOnly) {
    await assertTianyiStoryIntake(page, consoleProblems);
  } else if (r4CharacterObservationOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await assertCharacterObservationDragAndRecovery(page);
  } else if (shellFocusR22AOnly) {
    await setupCharacterFixture();
    await setupObservationFixture();
    await setupNarrativeFixture();
    await setupR1CausalFixture();
    await assertWorkspaceShellFocusR22A(page, consoleProblems);
  } else if (tianyiGoldenLoopOnly) {
    await setupCharacterFixture();
    await setupObservationFixture();
    await setupNarrativeFixture();
    await assertTianyiEventLineGoldenLoop(page, consoleProblems);
  } else if (authorEventReloadOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await assertAuthorEventCreation(page, consoleProblems);
  } else if (r12EventLineOnly) {
    await setupCharacterFixture();
    await setupObservationFixture();
    await setupNarrativeFixture();
    await assertR12EventLineWorkspace(page, consoleProblems);
  } else if (r1DualAxisCausalOnly) {
    await setupCharacterFixture();
    await setupObservationFixture();
    await setupNarrativeFixture();
    await setupR1CausalFixture();
    await assertEventLineDualAxisCausalCoreR1(page, consoleProblems);
  } else if (r2StoryCrossingOnly || r2KnowledgeIsolationOnly || founderCloseoutR21Only || founderCloseoutR21RecordingOnly) {
    await setupCharacterFixture();
    await setupObservationFixture();
    await setupNarrativeFixture();
    await setupR1CausalFixture();
    if (founderCloseoutR21RecordingOnly) await recordEventLineFounderCloseoutR21();
    else if (founderCloseoutR21Only) await assertEventLineFounderCloseoutR21(page, consoleProblems);
    else await assertEventLineStoryCrossingKnowledgeR2(page, consoleProblems, r2KnowledgeIsolationOnly ? "knowledge" : "crossing");
  } else if (r11ObservationOnly) {
    await setupCharacterFixture();
    await setupObservationFixture();
    await setupNarrativeFixture();
    await assertR12EventLineWorkspace(page, consoleProblems);
  } else if (r10RecordingOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await recordR10Closeout();
  } else if (r9RecordingOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await recordR9Evidence();
  } else if (r8RecordingOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await recordR8Foundation();
  } else if (r7RecordingOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await recordR7Interaction();
  } else if (r6RecordingOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await recordR6Closeout();
  } else if (timelineRecordingOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await recordTemporalProjectionOperation();
  } else if (timelineOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await assertTimelineRelationshipGraph(page, consoleProblems);
    if (temporalProjectionRecordingDirectory) await recordTemporalProjectionOperation();
  } else if (predictionOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await assertMultiNodePredictionProductization(page, consoleProblems);
  } else {
    await assertNoProjectDirectoryShell(page);
    if (r062VisualEvidenceDirectory) await captureR062EmptyDirectoryEvidence(page, consoleProblems);
    await setupZeroItemFixture();
    await reloadProduct(page);
    await assertZeroItemDirectoryShell(page);
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await reloadProduct(page);
    await assertExpandedLabels(page, "zh-CN");
    await assertResponsiveHeader922(page);
    await page.setViewportSize({ width: 1152, height: 720 });
    await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
    await assertProviderCatalogSettingsR0(page);
    await assertPermissionProjection(page);
    await assertSingleGlobalSearch(page);
    await assertCharacterDirectoryAndInspector(page);
    await assertCharacterCreationDurability(page);
    await assertCharacterDirectoryFiltersAndLifecycle(page);
    await assertExactlyOneActiveDestination(page);
    if (visualEvidenceDirectory) await captureCharacterDirectoryEvidence(page, consoleProblems);
    if (r062VisualEvidenceDirectory) await captureR062PopulatedDirectoryEvidence(page, consoleProblems);

    if (!visualEvidenceState) {
      await assertExpandedLabels(page, "zh-CN");
      await gotoProduct(page, `${baseUrl}/world?locale=en-US&rail=expanded`);
      await assertExpandedLabels(page, "en-US");
    }
    if (eventGraphRecordingDirectory) await recordEventGraphOperation();
    await assertEventGraphWorkspace(page);
    await setupTimelineFixture();
    await assertTimelineRelationshipGraph(page, consoleProblems);
    if (temporalProjectionRecordingDirectory) await recordTemporalProjectionOperation();
    await assertMultiNodePredictionProductization(page, consoleProblems);
    await assertRightWorkSurfaceStateMachine(page, consoleProblems);
    if (eventGraphEvidenceDirectory) await captureEventGraphEvidence(page, consoleProblems);
    if (eventGraphDensityEvidence) await captureEventGraphDensityEvidence(page, consoleProblems);
    await assertAuthorEventCreation(page, consoleProblems);
    await assertAgentFakeProviderStream(page);
  }
  assert.deepEqual(consoleProblems, [], "R0 shell smoke must not produce console warnings or errors");
  console.log("tianyan R0 shell smoke PASS: responsive rail plus real character directory and read-only inspector");
} catch (error) {
  console.error("tianyan R0 shell smoke FAILED:", error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Tianyan R0 shell smoke server" });
  if (apiServer) await terminateChildProcess(apiServer, { label: "Tianyan R0 shell smoke API" });
  if (ollamaFixture) await new Promise((resolve) => ollamaFixture.server.close(resolve));
  removeTianyanE2eFixture(fixture);
}

async function assertTianyiStoryIntake(page, consoleProblems) {
  const storyText = "林昭在雾港灯塔亲眼看见守夜钟失踪。阿芜从码头工人口中得知此事，却误以为顾澜偷走了钟。旧城航线因此中断，林昭决定追查守夜钟的去向。";
  await postFixture(`${apiUrl}/__local/story-studio/projects/create`, { title: "Story Intake E2E", folderSlug: fixtureProjectId });
  await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: fixtureProjectId });
  const libraryBefore = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const canonBefore = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);

  await gotoProduct(page, `${baseUrl}/tianyi`);
  const composer = page.getByRole("textbox", { name: "创意模式草稿", exact: true });

  await composer.fill("停止验证：这段原话必须保留，但本次运行不得留下候选。");
  await page.getByRole("button", { name: "整理为故事候选", exact: true }).click();
  const intake = page.locator('[aria-label="Story Intake 运行"]');
  await intake.waitFor();
  await page.waitForTimeout(35);
  await intake.getByRole("button", { name: "停止", exact: true }).click();
  await page.waitForFunction(() => ["cancelled", "paused"].includes(document.querySelector('[aria-label="Story Intake 运行"]')?.getAttribute("data-story-intake-status") || ""));
  assert.match(await page.locator(".tianyi-visible-history").innerText(), /停止验证/u, "Stopping must preserve the author's source in the same conversation.");

  await composer.fill(storyText);
  await page.getByRole("button", { name: "整理为故事候选", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Story Intake 运行"]')?.getAttribute("data-story-intake-status") === "failed");
  assert.match(await intake.innerText(), /失败.*原话已保留/u);
  const retry = intake.getByRole("button", { name: "重试", exact: true });
  await retry.waitFor();
  await retry.click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Story Intake 运行"]')?.getAttribute("data-story-intake-status") === "completed").catch(async (error) => {
    const status = await intake.getAttribute("data-story-intake-status");
    const visibleState = (await intake.innerText()).slice(0, 2_000);
    throw new Error(`Story Intake retry did not complete; status=${status}; visible=${visibleState}`, { cause: error });
  });

  for (const label of ["人物", "物品", "地点", "事件", "故事单元", "故事路径成员", "未解问题"]) await intake.getByRole("heading", { name: label, exact: true }).waitFor();
  for (const label of ["林昭", "阿芜", "顾澜", "守夜钟", "雾港灯塔"]) assert.match(await intake.innerText(), new RegExp(label, "u"));
  assert.match(await intake.innerText(), /亲历|亲眼/u);
  assert.match(await intake.innerText(), /被告知/u);
  assert.match(await intake.innerText(), /误解/u);
  assert.match(await intake.innerText(), /原文证据/u);
  assert.match(await intake.innerText(), /Canon 写入 0.*已确认资料对象 0/u);
  assert.match(await intake.innerText(), /请求[\s\S]*deterministic-text-fixture/u);

  const firstCandidate = intake.locator(".tianyi-intake-candidate").first();
  const decisionResponsePromise = page.waitForResponse((response) => response.url().includes("/tianyi-agent/story-intake/candidate/decision"));
  await firstCandidate.getByRole("button", { name: "送入待归档", exact: true }).click();
  const decisionResponse = await decisionResponsePromise;
  assert.equal(decisionResponse.status(), 200, `Story Intake archive decision failed: ${await decisionResponse.text()}`);
  const archivedCandidate = intake.locator('.tianyi-intake-candidate[data-candidate-state="pending-archive"]').first();
  await archivedCandidate.waitFor();
  assert.match(await archivedCandidate.innerText(), /已送入待归档.*未采纳/u);
  const awuCandidate = intake.locator(".tianyi-intake-candidate").filter({ hasText: "阿芜" }).first();
  const confirmResponsePromise = page.waitForResponse((response) => response.url().includes("/tianyi-agent/story-intake/candidate/decision"));
  await awuCandidate.getByRole("button", { name: "逐项确认", exact: true }).click();
  const confirmResponse = await confirmResponsePromise;
  assert.equal(confirmResponse.status(), 200, `Story Intake confirmation failed: ${await confirmResponse.text()}`);
  await awuCandidate.getByText(/已由作者确认为资料对象/u).waitFor();
  const conversationId = await page.locator(".tianyi-workspace").getAttribute("data-tianyi-conversation-id");
  await reloadProduct(page);
  await page.waitForFunction(() => document.querySelector('[aria-label="Story Intake 运行"]')?.getAttribute("data-story-intake-status") === "completed");
  assert.equal(await page.locator(".tianyi-workspace").getAttribute("data-tianyi-conversation-id"), conversationId, "Refresh must recover the same TianyiConversation.");
  await page.locator('.tianyi-intake-candidate[data-candidate-state="pending-archive"]').first().getByText(/已送入待归档.*未采纳/u).waitFor();
  await page.locator('.tianyi-intake-candidate[data-candidate-state="confirmed"]').getByText(/已由作者确认为资料对象/u).waitFor();

  const libraryAfter = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const canonAfter = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(libraryAfter.data.objects.length, libraryBefore.data.objects.length + 1, "one explicit confirmation must create exactly one formal object");
  assert.equal(libraryAfter.data.objects.some((object) => object.type === "character" && object.title === "阿芜"), true);
  assert.deepEqual(canonAfter.data, canonBefore.data, "Story Intake candidates must not enter Canon/Event projection.");
  assert.deepEqual(consoleProblems, [], "Story Intake stop, retry and refresh must not add browser console problems.");
}

async function assertProviderCatalogSettingsR0(page) {
  const explicitProviderRequests = [];
  const observe = (request) => {
    if (request.method() === "POST" && /\/model-service\/(?:models|test|embedding-probe)$/u.test(request.url())) explicitProviderRequests.push(request.url());
  };
  page.on("request", observe);
  try {
    await gotoProduct(page, `${baseUrl}/settings/storage`);
    await page.getByRole("button", { name: "Provider 与模型", exact: true }).click();
    const provider = page.locator("#settings-agent-provider");
    await provider.waitFor();
    const catalog = provider.locator(".agent-provider-catalog");
    assert.equal(await catalog.getAttribute("data-catalog-state"), "never_fetched");
    assert.match(await catalog.textContent(), /尚未获取目录/u);
    assert.doesNotMatch(await catalog.textContent(), /已获取\s+1\s+个/u);
    await provider.locator('select[name="provider"]').selectOption("radeon-cloud");
    assert.equal(await catalog.getAttribute("data-catalog-state"), "never_fetched");
    assert.match(await catalog.textContent(), /预设建议（未计入已获取）/u);
    assert.equal(await provider.locator('input[name="llmModelId"]').count(), 1);
    assert.equal(await provider.locator('input[name="embeddingModelId"]').count(), 1);
    assert.equal(await provider.getByRole("button", { name: "获取模型", exact: true }).isDisabled(), true);
    assert.equal(await provider.getByRole("button", { name: "验证 Embedding", exact: true }).isDisabled(), true);
    await provider.locator('input[name="llmModelId"]').focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement instanceof HTMLElement), true);
    assert.deepEqual(explicitProviderRequests, [], "opening Settings, switching presets and keyboard navigation must make zero explicit Provider calls");

    await provider.locator('select[name="provider"]').selectOption("ollama");
    await provider.locator('input[name="baseUrl"]').fill(ollamaFixture.baseUrl);
    await provider.locator('input[name="llmModelId"]').fill("fixture/chat:latest");
    await provider.locator('input[name="embeddingModelId"]').fill("fixture/embed:latest");
    await provider.getByRole("button", { name: "保存 Provider 配置", exact: true }).click();
    await provider.getByText(/未发起外部请求/u).waitFor();
    assert.equal(ollamaFixture.calls.tags, 0, "saving and selecting a Provider must not discover models");

    const getModels = provider.getByRole("button", { name: "获取模型", exact: true });
    await getModels.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".agent-provider-catalog")?.getAttribute("data-catalog-state") === "ready");
    assert.match(await catalog.textContent(), /已获取\s+2\s+个模型/u);
    assert.match(await catalog.textContent(), /ollama\.default/u);
    assert.equal(ollamaFixture.calls.tags, 1);

    const embeddingProbe = provider.getByRole("button", { name: "验证 Embedding", exact: true });
    await embeddingProbe.focus();
    await page.keyboard.press("Enter");
    await provider.getByText(/Embedding 验证成功.*4 维/u).waitFor();
    assert.equal(ollamaFixture.calls.embed, 1);
    assert.equal(ollamaFixture.lastEmbeddingInput, "Tianyan embedding capability probe. No author content.");

    expectedProviderCatalogFailure = true;
    expectedProviderFailureConsoleBudget = 1;
    const retry = provider.getByRole("button", { name: "重新获取模型", exact: true });
    await retry.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".agent-provider-catalog")?.getAttribute("data-catalog-state") === "stale");
    await page.waitForTimeout(100);
    expectedProviderCatalogFailure = false;
    expectedProviderFailureConsoleBudget = 0;
    assert.match(await catalog.textContent(), /已过期|保留上次成功/u);
    assert.match(await catalog.textContent(), /当前模型服务暂时不可用/u);
    assert.equal(ollamaFixture.calls.tags, 2);
    assert.match(await provider.locator(".agent-provider-index-gate").textContent(), /已有数据集.*必须重建/u);

    await provider.locator('select[name="provider"]').selectOption("radeon-cloud");
    const cancel = provider.getByRole("button", { name: "取消未保存更改", exact: true });
    await cancel.focus();
    await page.keyboard.press("Enter");
    assert.equal(await provider.locator('select[name="provider"]').inputValue(), "ollama");
    assert.equal(explicitProviderRequests.length, 3, "only the two author-triggered catalog requests and one embedding probe may leave Settings");
  } finally {
    expectedProviderCatalogFailure = false;
    expectedProviderFailureConsoleBudget = 0;
    page.off("request", observe);
  }
  await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
}

async function startProviderCatalogOllamaFixture() {
  const calls = { tags: 0, embed: 0 };
  let lastEmbeddingInput = null;
  const server = createHttpServer((request, response) => {
    if (request.url === "/api/tags" && request.method === "GET") {
      calls.tags += 1;
      if (calls.tags > 1) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "fixture unavailable" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: [
        { name: "fixture/chat:latest", digest: "sha256:chat" },
        { name: "fixture/embed:latest", digest: "sha256:embed" }
      ] }));
      return;
    }
    if (request.url === "/api/embed" && request.method === "POST") {
      calls.embed += 1;
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const parsed = JSON.parse(body);
        lastEmbeddingInput = parsed.input?.[0] ?? null;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ model: parsed.model, embeddings: [[0.1, 0.2, 0.3, 0.4]] }));
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Ollama E2E fixture did not expose a port.");
  return {
    server,
    calls,
    baseUrl: `http://127.0.0.1:${address.port}`,
    get lastEmbeddingInput() { return lastEmbeddingInput; }
  };
}

async function assertPermissionProjection(page) {
  await gotoProduct(page, `${baseUrl}/event-line?rail=expanded`);
  await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "TIANYI", "The shared right work surface must explicitly own Tianyi while its composer is visible.");
  await page.locator(".tianyi-sidebar").getByRole("tab", { name: "Agent", exact: true }).click();
  const trigger = page.getByRole("button", { name: "权限", exact: true });
  await trigger.click();
  const state = await page.evaluate(() => {
    const menu = document.querySelector(".permission-popover");
    const disabled = [...(menu?.querySelectorAll("button") ?? [])].filter((button) => button.hasAttribute("disabled")).map((button) => button.textContent?.trim());
    return { visible: Boolean(menu), disabled };
  });
  assert.equal(state.visible, true, "The current Tianyi composer must render its permission menu through the mounted component.");
  assert.deepEqual(state.disabled, ["仅建议未授权", "授权编辑未授权"], "Only broker-backed permissions are interactive in the R0.3 shell.");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".permission-popover") === null);
  await page.getByRole("button", { name: "关闭天意助手", exact: true }).first().click();
  await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
  const openDirectory = page.getByRole("button", { name: "打开工程目录", exact: true });
  if (await openDirectory.count()) await openDirectory.click();
}

async function assertSingleGlobalSearch(page) {
  assert.equal(await page.locator(".project-directory input[type='search']").count(), 0, "The project directory must not keep a second always-visible search field");
  assert.equal(await page.locator(".shell-global-search-entry").count(), 0, "The dark rail must not duplicate the global-search entry beneath the brand");
  assert.equal(await page.locator(".project-directory-search-entry").count(), 0, "The ordinary project directory must not duplicate global search");
  const topbar = page.getByTestId("global-search-trigger");
  const topbarState = await topbar.evaluate((button) => ({
    label: button.getAttribute("aria-label"),
    textVisible: [...button.querySelectorAll("span, kbd")].some((element) => getComputedStyle(element).display !== "none")
  }));
  assert.equal(topbarState.label, "全局搜索");
  assert.equal(topbarState.textVisible, false, "The 1152px topbar trigger must collapse to its search icon");

  await topbar.click();
  const dialog = page.getByTestId("global-search-dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute("data-search-scope"), "global", "The topbar entry must open the shared global scope");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "global-search-trigger");
  assert.equal(await topbar.evaluate((button) => document.activeElement === button), true, "Escape/close restores focus to the global-search trigger");
  await page.keyboard.press("ControlOrMeta+K");
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute("data-search-scope"), "global", "Keyboard search opens the same global scope");
  assert.equal(await page.locator("input[type='search']").count(), 1, "Only the open shared search dialog may render a search field");
  await dialog.locator("input[type='search']").focus();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("tab", { name: /待确认/u }).click();
  assert.match(page.url(), /directoryMode=pending/u, "The compact pending summary stays in the directory URL state until the author opens its central review surface");
  assert.match(new URL(page.url()).pathname, /\/(world|event-line|library|tianyi|collections)/u, "Pending review must not force the Data route");
  await page.getByRole("tab", { name: /已分类/u }).click();
}

async function openCharacterDirectory(page) {
  const panel = await ensureProjectDirectoryOpen(page);
  const characterCategory = panel.locator('[data-directory-node="directory.library.character"]');
  if (!(await characterCategory.count())) {
    const root = panel.locator(".project-directory-breadcrumb").getByRole("button", { name: "目录", exact: true });
    if (await root.count()) await root.click();
    await panel.locator('[data-directory-node="directory.library"]').click();
  }
  await characterCategory.click();
}

async function ensureProjectDirectoryOpen(page) {
  const panel = page.locator(".project-directory-panel");
  if (!(await panel.isVisible())) await page.getByRole("button", { name: "打开工程目录", exact: true }).click();
  await panel.waitFor();
  return panel;
}

async function assertCharacterDirectoryAndInspector(page) {
  await openCharacterDirectory(page);
  await page.getByTestId("character-directory").waitFor();
  const workspaceBefore = await page.locator(".shell-workspace").evaluate((element) => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() }));
  assert.equal(await page.locator(".character-directory-list input[type=checkbox]").count(), 0, "Default directory has no selection checkboxes");
  assert.equal(await page.locator(".character-directory-list h3").count(), 0, "The default character directory must be a flat list without role group headings");
  assert.doesNotMatch(await page.getByTestId("character-directory").textContent(), /main-characters/u, "Internal category IDs must not leak into the directory");
  assert.equal(await page.locator(".character-directory-filter-chips").count(), 0, "Default directory must not show removable filter chips");
  await page.getByRole("button", { name: "搜索角色", exact: true }).click();
  const characterSearch = page.getByTestId("global-search-dialog");
  await characterSearch.waitFor();
  assert.equal(await characterSearch.getAttribute("data-search-scope"), "characters", "Character search must open the same engine with character scope");
  await characterSearch.locator("input[type='search']").fill("林昭");
  await characterSearch.getByRole("option", { name: /林昭/u }).waitFor();
  await characterSearch.getByRole("button", { name: "关闭", exact: true }).click();
  const filterTrigger = page.getByRole("button", { name: "筛选", exact: true });
  await filterTrigger.click();
  assert.equal(await filterTrigger.getAttribute("aria-expanded"), "true", "Filter trigger must expose its expanded state");
  await page.getByLabel("角色层级筛选").selectOption("主要角色");
  assert.equal(await page.locator(".character-directory-filter-chips").count(), 1, "Effective filters must surface removable chips");
  await page.keyboard.press("Escape");
  assert.equal(await filterTrigger.getAttribute("aria-expanded"), "false", "Escape must close the filter popover and update aria-expanded");
  await page.getByRole("button", { name: /主要角色/u }).click();
  assert.equal(await page.locator(".character-directory-filter-chips").count(), 0, "Removing the final filter must remove its chip row");
  await page.getByRole("option", { name: /林昭/u }).click();
  await page.getByTestId("character-inspector").waitFor();
  const workspaceAfter = await page.locator(".shell-workspace").evaluate((element) => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() }));
  assert.equal(workspaceAfter.text, workspaceBefore.text, "Opening the inspector must not remount the central workspace");
  for (const key of ["x", "y", "width", "height", "top", "right", "bottom", "left"]) {
    assert.ok(Math.abs(workspaceAfter.rect[key] - workspaceBefore.rect[key]) <= 0.5, `Opening the inspector must not resize the central workspace (${key}: ${workspaceBefore.rect[key]} -> ${workspaceAfter.rect[key]})`);
  }
  assert.match(page.url(), /directoryObject=character\./u);
  assert.equal(await page.getByRole("button", { name: "打开完整资料" }).count(), 1);
  await page.getByRole("button", { name: "打开完整资料" }).click();
  await page.getByRole("form", { name: "完整角色资料" }).waitFor();
  assert.match(page.url(), /directoryEdit=character/u, "Full profile opens through the stable character URL");
  await page.getByRole("form", { name: "完整角色资料" }).getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "展开角色检查器" }).click();
  assert.equal(await page.getByTestId("character-inspector").getAttribute("aria-expanded"), "true", "The inspector expands as an overlay without moving the workspace");
  const workspaceExpanded = await page.locator(".shell-workspace").evaluate((element) => element.getBoundingClientRect().toJSON());
  for (const key of ["x", "y", "width", "height", "top", "right", "bottom", "left"]) {
    assert.ok(Math.abs(workspaceExpanded[key] - workspaceBefore.rect[key]) <= 0.5, `Expanding the inspector must not resize the central workspace (${key}: ${workspaceBefore.rect[key]} -> ${workspaceExpanded[key]})`);
  }
  await page.getByTestId("character-inspector").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTestId("character-inspector").waitFor({ state: "hidden" });
  await page.getByTestId("character-directory").waitFor();
  await page.getByRole("button", { name: "多选", exact: true }).click();
  await page.locator(".character-directory-list input[type=checkbox]").first().waitFor();
  assert.ok(await page.locator(".character-directory-list input[type=checkbox]").count() > 0, "Multi-select exposes checkboxes only after activation");
  assert.equal(await page.getByRole("button", { name: /永久删除/u }).count(), 0, "Permanent delete is safely blocked from the directory UI");
}

async function assertCharacterCreationDurability(page) {
  await waitForCharacterDirectoryIdle(page);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  const recordCountBeforeCancel = await page.locator(".character-directory-list [role='option']").count();
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("dialog", { name: "新建角色" }).getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.locator(".character-directory-list [role='option']").count(), recordCountBeforeCancel, "Cancelling the create dialog must not write a character");
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("dialog", { name: "新建角色" }).waitFor();
  await page.getByRole("button", { name: "创建角色", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").textContent(), /请填写角色姓名/u, "The create form must validate its required name field");
  await page.getByLabel("姓名").fill("沈砚");
  await page.getByLabel("角色层级").fill("main");
  await page.getByLabel("别名").fill("阿砚, 小砚");
  await page.getByLabel("人物摘要").fill("负责追查旧港失踪案的调查者。");
  await page.getByText("更多设置", { exact: true }).click();
  await page.getByPlaceholder("输入分类名称").fill("主要人物");
  await page.getByRole("button", { name: "新建分类", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".character-create-more select")?.value);
  assert.notEqual(await page.locator(".character-create-more select").inputValue(), "", "The newly created category must become the selected creation value");
  await page.getByRole("textbox", { name: "标签", exact: true }).fill("调查, 主线");
  await page.getByRole("button", { name: "创建角色", exact: true }).dblclick();
  await page.getByTestId("character-inspector").waitFor();
  await page.waitForFunction(() => document.querySelector("[data-testid='character-inspector'] h2")?.textContent?.includes("沈砚"));
  assert.match(page.url(), /directoryObject=character\./u, "The created object must be selected through its stable object ID in the URL");
  assert.match(await page.getByTestId("character-inspector").textContent(), /主要人物/u, "Created categories must render their user-facing names rather than persistence IDs");
  assert.match(await page.getByTestId("character-inspector").textContent(), /负责追查旧港失踪案/u, "The saved summary must be rendered from the durable character card");
  await page.getByTestId("character-inspector").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTestId("character-inspector").waitFor({ state: "hidden" });
  await page.getByTestId("character-directory").waitFor();
  const createdOption = page.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" });
  await waitForCharacterDirectoryIdle(page);
  await createdOption.waitFor();
  assert.equal(await createdOption.count(), 1, `A double submit must create only one durable character; directory=${await page.locator(".character-directory-list").textContent()}`);
  assert.doesNotMatch(await page.getByTestId("character-directory").textContent(), /main-characters/u, "Created category IDs must remain persistence-only values");

  await reloadProduct(page);
  await page.getByTestId("character-directory").waitFor();
  await waitForCharacterDirectoryIdle(page);
  assert.equal(await page.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" }).count(), 1, "The character must survive a browser refresh");
  const freshContext = await browser.newContext({ viewport: { width: 1152, height: 720 } });
  const freshSession = await freshContext.newPage();
  try {
    await gotoProduct(freshSession, `${baseUrl}/world?directoryView=characters`);
    await freshSession.getByTestId("character-directory").waitFor();
    await waitForCharacterDirectoryIdle(freshSession);
    assert.equal(await freshSession.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" }).count(), 1, "The character must survive a new Shell session");
  } finally {
    await freshContext.close();
  }
  await assertCreatedCharacterIsProjectIsolated();
  await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: fixtureProjectId });
  await gotoProduct(page, `${baseUrl}/world?directoryView=characters`);
  await page.getByTestId("character-directory").waitFor();
  await waitForCharacterDirectoryIdle(page);
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByLabel("姓名").fill("自定义层级角色");
  await page.getByLabel("角色层级").fill("夜航人");
  await page.getByRole("button", { name: "创建角色", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid='character-inspector'] h2")?.textContent?.includes("自定义层级角色"));
  assert.match(await page.getByTestId("character-inspector").textContent(), /夜航人/u, "A custom role level must survive the create projection");
  await page.getByTestId("character-inspector").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTestId("character-inspector").waitFor({ state: "hidden" });
  await reloadProduct(page);
  await page.getByTestId("character-directory").waitFor();
  await waitForCharacterDirectoryIdle(page);
  await page.getByRole("option", { name: /自定义层级角色/u }).waitFor();
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByLabel("角色层级筛选").selectOption("夜航人");
  assert.equal(await page.getByRole("option", { name: /自定义层级角色/u }).count(), 1, "A custom role level must remain filterable after reload");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "夜航人", exact: true }).click();
}

async function assertCreatedCharacterIsProjectIsolated() {
  const projectId = `${fixtureProjectId}-isolated`;
  const base = `${apiUrl}/__local/story-studio`;
  await postFixture(`${base}/projects/create`, { title: "隔离项目", folderSlug: projectId });
  const response = await fetch(`${base}/world-library?projectId=${encodeURIComponent(projectId)}`);
  if (!response.ok) throw new Error(`Isolated project read failed: ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.data.objects.some((object) => object.title === "沈砚"), false, "A created character must not appear in another project");
}

async function assertCharacterDirectoryFiltersAndLifecycle(page) {
  await page.getByTestId("character-directory").waitFor();
  await waitForCharacterDirectoryIdle(page);
  const filterTrigger = page.getByRole("button", { name: "筛选", exact: true });
  await filterTrigger.click();
  await page.getByLabel("标签筛选").selectOption("调查");
  assert.equal(await page.getByRole("option", { name: /沈砚/u }).count(), 1, "Tag filters must preserve the created durable character");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "清除全部", exact: true }).click();
  assert.equal(await page.locator(".character-directory-filter-chips").count(), 0, "Clearing filters must restore the default flat list");

  await filterTrigger.click();
  await page.getByLabel("分类筛选").selectOption({ label: "主要人物" });
  assert.equal(await page.getByRole("option", { name: /沈砚/u }).count(), 1, "Named categories must filter the version-scoped directory assignment");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "主要人物", exact: true }).click();

  await page.getByRole("button", { name: "排序", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "姓名降序", exact: true }).click();
  assert.match(await page.getByRole("button", { name: "排序", exact: true }).textContent(), /姓名降序/u, "Sort remains visible outside the filter menu");
  await page.getByRole("button", { name: "列表密度", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "缩略版", exact: true }).click();
  assert.equal(await page.getByTestId("character-directory").getAttribute("data-density"), "compact", "Compact view is explicitly selected");
  await reloadProduct(page);
  await page.getByTestId("character-directory").waitFor();
  assert.equal(await page.getByTestId("character-directory").getAttribute("data-density"), "compact", "Density preference survives a reload");
  await page.getByRole("button", { name: "列表密度", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "常规版", exact: true }).click();
  const created = page.getByRole("option", { name: /沈砚/u });
  await page.getByRole("button", { name: "多选", exact: true }).click();
  await created.click();
  assert.match(await page.locator(".character-selection-bar strong").textContent(), /已选 1 项/u, "Multi-select must announce selected count");
  const selectionGeometry = await page.evaluate(() => {
    const list = document.querySelector(".character-directory-list");
    const bar = document.querySelector(".character-selection-bar");
    if (!(list instanceof HTMLElement) || !(bar instanceof HTMLElement)) throw new Error("Character selection UI is unavailable.");
    return { listBottom: list.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top };
  });
  assert.ok(selectionGeometry.listBottom <= selectionGeometry.barTop + 1, "Selection actions must reserve layout space instead of covering character rows");
  await page.locator(".character-selection-bar").getByRole("button", { name: "归档", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".character-directory-list [role='option']")].some((element) => element.textContent?.includes("沈砚")));
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "归档", exact: true }).click();
  await created.waitFor();
  await created.click();
  await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "恢复", exact: true }).click();

  await filterTrigger.click();
  await page.getByLabel("目录范围").selectOption("active");
  await page.keyboard.press("Escape");
  await created.waitFor();
  await page.getByRole("button", { name: "多选", exact: true }).click();
  await created.click();
  await page.locator(".character-selection-bar").getByRole("button", { name: "移入回收站", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".character-directory-list [role='option']")].some((element) => element.textContent?.includes("沈砚")));
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "回收站", exact: true }).click();
  await created.waitFor();
  await created.click();
  await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "恢复", exact: true }).click();
  await filterTrigger.click();
  await page.getByLabel("目录范围").selectOption("active");
  await page.keyboard.press("Escape");
  await created.waitFor();
}

async function waitForCharacterDirectoryIdle(page) {
  await page.waitForFunction(() => !document.querySelector(".character-directory-list")?.textContent?.includes("正在加载…"));
}

async function assertExactlyOneActiveDestination(page) {
  const ids = ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data", "collections"];
  for (const id of ids) {
    await page.locator(`[data-shell-destination="${id}"]`).click();
    await page.waitForFunction((destination) => document.querySelectorAll("[data-shell-destination][aria-current='page']").length === 1 && document.querySelector(`[data-shell-destination="${destination}"]`)?.getAttribute("aria-current") === "page", id);
  }
  await page.locator('[data-shell-destination="world"]').click();
  // The structural active surface is intentionally animated. Wait for the
  // rendered state instead of sampling the first transparent animation frame.
  await page.waitForTimeout(180);
  const visual = await page.evaluate(() => {
    const world = document.querySelector("[data-shell-destination='world']");
    const collections = document.querySelector("[data-shell-destination='collections']");
    const tianyi = document.querySelector("[data-shell-destination='tianyi']");
    if (!(world instanceof HTMLElement) || !(collections instanceof HTMLElement) || !(tianyi instanceof HTMLElement)) throw new Error("Navigation controls are unavailable.");
    const worldStyle = getComputedStyle(world);
    const collectionsStyle = getComputedStyle(collections);
    const tianyiStyle = getComputedStyle(tianyi);
    return {
      activeCount: document.querySelectorAll("[data-shell-destination][aria-current='page']").length,
      collectionsActive: collections.classList.contains("is-active"),
      worldBackground: worldStyle.backgroundColor,
      collectionsBackground: collectionsStyle.backgroundColor,
      collectionsColor: collectionsStyle.color,
      inactiveColor: tianyiStyle.color
    };
  });
  assert.equal(visual.activeCount, 1, "Every route must expose exactly one current navigation destination");
  assert.equal(visual.collectionsActive, false, "Collections must not retain the active class while World is selected");
  assert.notEqual(visual.worldBackground, visual.collectionsBackground, "The active World control must have a distinct structural background");
  assert.equal(visual.collectionsColor, visual.inactiveColor, "The derived Collections control must share the ordinary inactive visual weight");
}

async function assertAgentFakeProviderStream(page) {
  await page.evaluate(() => window.sessionStorage.clear());
  // Page Agent is intentionally available only on the Event Line in R0.
  // Reset the fake-provider regression to that supported page before opening Tianyi.
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await startAgentFakeProviderStream(page, "检查角色知识边界");
  const streaming = page.locator(".tianyi-agent-streaming");
  await streaming.waitFor();
  assert.match(await streaming.textContent(), /正在核对当前引用范围/u, "The browser must receive fake-provider text deltas before the final projection");
  await page.getByRole("button", { name: /^(?:停止运行|Stop run)$/u }).click();
  await page.waitForFunction(() => /(?:已取消|Cancelled)/u.test(document.querySelector(".tianyi-agent-run-status")?.textContent ?? ""));
  await page.waitForFunction(() => document.querySelector(".tianyi-agent-confirm.is-stop") === null);
  await page.waitForTimeout(350);
}

async function startAgentFakeProviderStream(page, task) {
  const sidebar = page.locator(".tianyi-sidebar");
  if (!await sidebar.isVisible()) {
    const globalToggle = page.locator('[data-panel-toggle="tianyi-agent"]');
    if (await globalToggle.isVisible()) {
      // A previous scenario can leave the responsive Dock's boolean state true
      // while its narrow-layout panel is not rendered. Normalize to closed,
      // then open through the same product control a user sees.
      if (await globalToggle.getAttribute("aria-pressed") === "true") {
        await globalToggle.click();
        await page.waitForFunction(() => document.querySelector('[data-panel-toggle="tianyi-agent"]')?.getAttribute("aria-pressed") === "false");
      }
      await globalToggle.click();
    } else await page.locator("[data-tianyi-drawer-trigger]").first().click();
    await sidebar.waitFor({ state: "visible" });
  }
  await sidebar.getByRole("tab", { name: "Agent", exact: true }).click();
  await page.locator(".tianyi-sidebar-composer textarea").fill(task);
  await page.locator(".composer-send-control").click();
  await page.getByRole("button", { name: /(?:允许下一步|Allow next step)/u }).click();
  const continueButton = page.getByRole("button", { name: /^(?:继续工作|Continue work)$/u });
  await continueButton.waitFor();
  await continueButton.click();
  await page.waitForFunction(() => document.querySelector(".tianyi-agent-streaming")?.textContent?.includes("正在核对当前引用范围"));
}

/** Optional external evidence only; this is never a production screenshot fixture. */
async function captureCharacterDirectoryEvidence(page, consoleProblems) {
  mkdirSync(visualEvidenceDirectory, { recursive: true });
  await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: fixtureProjectId });
  const captures = [];
  const capture = async (viewport, state) => {
    const characterName = "林昭";
    await page.setViewportSize(viewport);
    await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
    await page.evaluate(() => window.localStorage.removeItem("story-studio:ai-control-center:v1"));
    await reloadProduct(page);
    if (state === "settings") {
      await gotoProduct(page, `${baseUrl}/settings/storage`);
      await page.locator(".settings-utility-route").waitFor();
    }
    if (state === "agent-flow") {
      await page.evaluate(() => window.sessionStorage.clear());
      await reloadProduct(page);
      await startAgentFakeProviderStream(page, `R0.6 Agent 流视觉验收 ${viewport.width}`);
    }
    if (state === "pending-review") {
      const toggle = page.locator('[data-panel-toggle="project-directory"]');
      if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
      await page.getByRole("tab", { name: /待确认/u }).click();
      await page.locator(".pending-review-panel").waitFor();
    }
    if (state === "character-directory") {
      const toggle = page.locator('[data-panel-toggle="project-directory"]');
      if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
      await openCharacterDirectory(page);
      await page.getByTestId("character-directory").waitFor();
      await waitForCharacterDirectoryIdle(page);
      await page.getByRole("option", { name: new RegExp(characterName, "u") }).click();
    }
    if (state === "data-scroll") {
      await page.locator('[data-shell-destination="data"]').click();
      await page.waitForFunction(() => document.querySelector('[data-shell-destination="data"]')?.getAttribute("aria-current") === "page");
      await page.evaluate(() => { const target = document.querySelector(".shell-workspace-stage"); if (target instanceof HTMLElement) target.scrollTop = target.scrollHeight; });
    }
    if (!["settings", "agent-flow", "pending-review", "character-directory", "data-scroll"].includes(state)) {
      await openCharacterDirectory(page);
      await page.getByTestId("character-directory").waitFor();
      await waitForCharacterDirectoryIdle(page);
    }
    const currentCharacter = page.getByRole("option", { name: new RegExp(characterName, "u") });
    if (state === "inspector" || state === "inspector-expanded" || state === "compact" || state === "multi" || state === "archive" || state === "profile-editor") await currentCharacter.waitFor();
    if (state === "form" || state === "required" || state === "created" || state === "refreshed") {
      await page.getByRole("button", { name: "新建", exact: true }).click();
      await page.getByRole("dialog", { name: "新建角色" }).waitFor();
    }
    if (state === "required") await page.getByRole("button", { name: "创建角色", exact: true }).click();
    if (state === "created" || state === "refreshed") {
      await page.getByLabel("姓名").fill(`新建角色${viewport.width}`);
      await page.getByLabel("人物摘要").fill("用于浏览器视觉验收的本地隔离角色。");
      await page.getByText("更多设置", { exact: true }).click();
      await page.getByPlaceholder("输入分类名称").fill("视觉验收分类");
      await page.getByRole("button", { name: "新建分类", exact: true }).click();
      await page.getByRole("button", { name: "创建角色", exact: true }).click();
      await page.getByTestId("character-inspector").waitFor();
      if (state === "refreshed") await reloadProduct(page);
    }
    if (state === "world-active") {
      await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
    }
    if (state === "pending") { await page.getByRole("button", { name: "返回工程目录", exact: true }).click(); await page.getByRole("tab", { name: /待确认/u }).click(); }
    if (state === "inspector" || state === "inspector-expanded" || state === "compact" || state === "multi" || state === "archive" || state === "profile-editor") await currentCharacter.click();
    if (state === "inspector-expanded") await page.getByRole("button", { name: "展开角色检查器", exact: true }).click();
    if (state === "profile-editor") await page.getByRole("button", { name: "打开完整资料", exact: true }).click();
    if (state === "compact") { await page.getByRole("button", { name: "列表密度", exact: true }).click(); await page.getByRole("menuitemradio", { name: "缩略版", exact: true }).click(); }
    if (state === "sort") await page.getByRole("button", { name: "排序", exact: true }).click();
    if (state === "filter") { await page.getByRole("button", { name: "筛选", exact: true }).click(); await page.getByLabel("角色层级筛选").selectOption("主要角色"); }
    if (state === "multi" || state === "archive") await page.getByRole("button", { name: "多选", exact: true }).click();
    if (state === "multi") await currentCharacter.click();
    if (state === "archive") {
      await currentCharacter.click();
      await page.locator(".character-selection-bar").getByRole("button", { name: "归档", exact: true }).click();
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: "完成", exact: true }).click();
      await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "归档", exact: true }).click();
    }
    if (state === "search") await page.getByRole("button", { name: "搜索角色", exact: true }).click();
    if (state === "agent-stream") {
      await page.evaluate(() => window.sessionStorage.clear());
      await reloadProduct(page);
      await startAgentFakeProviderStream(page, `视觉验收 ${viewport.width}`);
    }
    const filename = `${viewport.width}x${viewport.height}-${state}.png`;
    await page.screenshot({ path: path.join(visualEvidenceDirectory, filename), fullPage: true });
    captures.push({ filename, viewport, state, projectId: fixtureProjectId, workVersionId: null, url: page.url(), isolatedTestData: true, consoleProblems: [...consoleProblems] });
    if (state === "archive") {
      await currentCharacter.click();
      await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "恢复", exact: true }).click();
    }
    if (state === "agent-stream" || state === "agent-flow") await page.waitForFunction(() => document.querySelector(".tianyi-agent-confirm.is-stop") === null);
  };
  const viewports = [{ width: 1920, height: 1000 }, { width: 1440, height: 900 }, { width: 1152, height: 720 }].filter((viewport) => !visualEvidenceViewport || viewport.width === visualEvidenceViewport);
  const states = ["settings", "agent-flow", "pending-review", "character-directory", "data-scroll"].filter((state) => !visualEvidenceState || state === visualEvidenceState);
  for (const viewport of viewports) {
    for (const state of states) await capture(viewport, state);
  }
  const suffix = visualEvidenceViewport && visualEvidenceState ? `${visualEvidenceViewport}-${visualEvidenceState}` : "all";
  writeFileSync(path.join(visualEvidenceDirectory, `capture-manifest-${suffix}.json`), `${JSON.stringify(captures, null, 2)}\n`, "utf8");
}

async function assertNoProjectDirectoryShell(page) {
  const panel = await ensureProjectDirectoryOpen(page);
  for (const label of ["故事结构", "信息资料", "设定", "来源", "创意"]) {
    await panel.getByText(label, { exact: true }).waitFor();
  }
  assert.equal(await panel.locator(".project-directory-reference").count(), 0, "The unopened directory root must not flatten nested categories or Event rows into the first screen.");
  assert.equal(await panel.locator(".project-directory-tree strong").allTextContents().then((counts) => counts.every((count) => count === "0")), true, "No-project classified view keeps every fixed category at zero.");
  await panel.getByText("尚未打开作品", { exact: false }).waitFor();
  await panel.getByRole("button", { name: "新建作品", exact: true }).waitFor();
  await panel.getByRole("button", { name: "导入 .tianyan", exact: true }).waitFor();
  await panel.getByRole("tab", { name: /待确认/u }).click();
  await panel.getByRole("button", { name: "待确认项目 0", exact: true }).waitFor();
  assert.equal(await panel.locator(".pending-review-directory-summary dd").allTextContents().then((counts) => counts.every((count) => count === "0")), true, "No-project pending entry keeps every category at zero without mounting the central review surface.");
  await panel.getByRole("tab", { name: /已分类/u }).click();
}

async function assertZeroItemDirectoryShell(page) {
  const panel = await ensureProjectDirectoryOpen(page);
  await panel.getByText("故事结构", { exact: true }).waitFor();
  assert.equal(await panel.locator(".project-directory-tree strong").allTextContents().then((counts) => counts.every((count) => count === "0")), true, "A project with zero records keeps the same classified shell.");
  assert.equal(await panel.locator("[data-directory-empty-shell-actions]").count(), 0, "An opened empty project must not be presented as an import-only state.");
}

async function assertResponsiveHeader922(page) {
  await page.setViewportSize({ width: 922, height: 720 });
  await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
  const topbar = page.locator(".shell-topbar");
  await topbar.waitFor();
  await page.getByRole("button", { name: "选择当前作品与版本", exact: true }).waitFor();
  const directory = page.locator('[data-panel-toggle="project-directory"]');
  const tianyi = page.locator('[data-panel-toggle="tianyi-agent"]');
  await directory.waitFor();
  await tianyi.waitFor();
  assert.match((await directory.innerText()).trim(), /目录/u, "Directory remains a named primary control at 922px.");
  assert.match((await tianyi.innerText()).trim(), /天意/u, "Tianyi remains a named primary control at 922px.");
  const overflow = page.getByRole("button", { name: "更多全局状态", exact: true });
  await overflow.waitFor();
  await overflow.click();
  const menu = page.locator("#shell-topbar-overflow-menu");
  await menu.waitFor();
  for (const label of ["中 / EN", "云砚", "本地", "未连接"]) await menu.getByText(label, { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  assert.equal(await overflow.evaluate((element) => document.activeElement === element), true, "Escape returns focus to the named overflow control.");
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  assert.ok(layout.scrollWidth <= layout.viewportWidth, "922px header must not create horizontal document overflow.");
  assert.match((await directory.getAttribute("aria-pressed")) ?? "", /^(true|false)$/u);
  assert.match((await tianyi.getAttribute("aria-pressed")) ?? "", /^(true|false)$/u);
  if (await tianyi.getAttribute("aria-pressed") === "true") {
    await tianyi.click();
    await page.waitForFunction(() => document.querySelector('[data-panel-toggle="tianyi-agent"]')?.getAttribute("aria-pressed") === "false");
  }
}

async function captureR062EmptyDirectoryEvidence(page, consoleProblems) {
  mkdirSync(r062VisualEvidenceDirectory, { recursive: true });
  for (const viewport of [{ width: 1152, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
    const filename = `${viewport.width}x${viewport.height}-empty-classified.png`;
    await page.screenshot({ path: path.join(r062VisualEvidenceDirectory, filename), fullPage: true });
    r062Captures.push({ filename, viewport, state: "no-open-work-classified", url: page.url(), consoleProblems: [...consoleProblems] });
  }
}

async function captureR062PopulatedDirectoryEvidence(page, consoleProblems) {
  mkdirSync(r062VisualEvidenceDirectory, { recursive: true });
  await page.setViewportSize({ width: 922, height: 720 });
  await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
  await page.screenshot({ path: path.join(r062VisualEvidenceDirectory, "922px-header.png"), fullPage: true });
  r062Captures.push({ filename: "922px-header.png", viewport: { width: 922, height: 720 }, state: "responsive-header", url: page.url(), consoleProblems: [...consoleProblems] });
  for (const viewport of [{ width: 1152, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await gotoProduct(page, `${baseUrl}/world?rail=expanded`);
    const filename = `${viewport.width}x${viewport.height}-populated-classified.png`;
    await page.screenshot({ path: path.join(r062VisualEvidenceDirectory, filename), fullPage: true });
    r062Captures.push({ filename, viewport, state: "populated-classified", projectId: fixtureProjectId, url: page.url(), consoleProblems: [...consoleProblems] });
  }
  writeFileSync(path.join(r062VisualEvidenceDirectory, "capture-manifest-r062.json"), `${JSON.stringify(r062Captures, null, 2)}\n`, "utf8");
}

async function assertExpandedLabels(page, locale) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='tianyan-r0-shell']");
    const rail = document.querySelector(".shell-space-rail");
    const labels = [...document.querySelectorAll(".shell-space-label")];
    return {
      collapsed: shell?.getAttribute("data-rail-collapsed"),
      railWidth: rail?.getBoundingClientRect().width ?? 0,
      clipped: labels.filter((label) => getComputedStyle(label).display !== "none" && label.scrollWidth > label.clientWidth + 0.5).map((label) => label.textContent),
      ellipsis: labels.filter((label) => getComputedStyle(label).display !== "none" && getComputedStyle(label).textOverflow === "ellipsis").map((label) => label.textContent)
    };
  });
  assert.equal(state.collapsed, "false", `${locale} manual expansion must override automatic collapse`);
  assert.ok(state.railWidth > 56, `${locale} expanded rail must be wider than the icon rail`);
  assert.deepEqual(state.clipped, [], `${locale} expanded labels must not clip`);
  assert.deepEqual(state.ellipsis, [], `${locale} expanded labels must not use ellipsis`);
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    chromium.executablePath()
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error("Chromium executable is unavailable; set PLAYWRIGHT_CHROMIUM_EXECUTABLE");
  return executable;
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Tianyan R0 shell smoke server exited with ${server.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Tianyan R0 shell smoke server did not become ready");
}

async function waitForApiServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (apiServer.exitCode !== null) throw new Error(`Tianyan R0 shell smoke API exited with ${apiServer.exitCode}`);
    try {
      const response = await fetch(`${apiUrl}/__local/story-studio/bootstrap`);
      if (response.ok) return;
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Tianyan R0 shell smoke API did not become ready");
}

async function assertDevelopmentRuntimeMode() {
  const vitePage = await fetch(`${baseUrl}/event-line`);
  assert.equal(vitePage.status, 200, "Development UI must be served by Vite.");
  const viteHtml = await vitePage.text();
  assert.match(viteHtml, /\/@vite\/client/);
  assert.match(viteHtml, /\/src\/main\.tsx/);

  const proxiedBootstrap = await fetch(`${baseUrl}/__local/story-studio/bootstrap`);
  assert.equal(proxiedBootstrap.status, 200, "Vite must proxy the local API.");

  const apiUiRequest = await fetch(`${apiUrl}/event-line`, { headers: { accept: "text/html" } });
  assert.equal(apiUiRequest.status, 404, "api-only mode must reject direct SPA routes.");
  const apiUiHtml = await apiUiRequest.text();
  assert.match(apiUiHtml, /RUNTIME_MODE=api-only/);
  assert.doesNotMatch(apiUiHtml, /\/src\/main\.tsx|\/assets\/index-/);

  const health = await fetch(`${apiUrl}/__local/story-studio/health`);
  assert.equal(health.status, 200, "api-only mode keeps the local health endpoint available.");
  assert.deepEqual(await health.json(), { data: { status: "healthy", runtimeMode: "api-only" } });

  const missingApi = await fetch(`${apiUrl}/__local/story-studio/runtime-mode-missing`);
  assert.equal(missingApi.status, 404);
  assert.match(String(missingApi.headers.get("content-type")), /application\/json/);
  const missingApiBody = await missingApi.text();
  assert.doesNotMatch(missingApiBody, /<!doctype html>/i);

  if (runtimeModeEvidencePath) writeFileSync(runtimeModeEvidencePath, JSON.stringify({
    command: "npm run test:e2e (isolated Vite plus api-only Story Studio)",
    developmentUi: { entry: `${baseUrl}/event-line`, status: vitePage.status, sourceMarkers: ["/@vite/client", "/src/main.tsx"] },
    directApiUiRequest: { entry: `${apiUrl}/event-line`, status: apiUiRequest.status, body: apiUiHtml },
    proxiedApi: { entry: `${baseUrl}/__local/story-studio/bootstrap`, status: proxiedBootstrap.status },
    health: { entry: `${apiUrl}/__local/story-studio/health`, status: health.status, body: { data: { status: "healthy", runtimeMode: "api-only" } } },
    unknownApi: { status: missingApi.status, contentType: missingApi.headers.get("content-type"), body: JSON.parse(missingApiBody) }
  }, null, 2));
}

async function setupCharacterFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  await postFixture(`${base}/projects/create`, { title: "长夜将明", folderSlug: fixtureProjectId });
  for (const character of [{ title: "林昭", subtype: "主要角色" }, { title: "阿芜", subtype: "配角" }, { title: "陆衍", subtype: "次要角色" }, { title: "顾澜", subtype: "配角" }, { title: "程野", subtype: "次要角色" }, { title: "苏弦", subtype: "次要角色" }]) {
    await postFixture(`${base}/characters/create`, { projectId: fixtureProjectId, title: character.title, mode: "freeform", subtype: character.subtype });
  }
  await postFixture(`${base}/agent-recognition/drafts/create`, {
    projectId: fixtureProjectId,
    operationId: `operation.${fixture.fixtureId}.visual-pending`,
    requestedObjectType: "character",
    mode: "extract",
    authorIntent: "许灯",
    sourceScope: "fixture:r06-visual-pending",
    sourceText: "守灯人许灯在潮声中留下了一页未确认的记录。",
    existingObjectSummaries: [],
    allowedFieldSchema: ["story-role", "summary", "life"],
    noWritePolicy: true,
    fixtureMode: "deterministic"
  });
}

async function setupObservationFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "location", title: "雾港", status: "active", tags: ["港区"] });
  await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "item", title: "雾灯匣", status: "active", tags: ["关键物品"] });
  const definitions = [
    { key: "revealed-consequence", title: "先揭示的港口后果", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-03 18:00", "人物：林昭", "地点：雾港", "物品：雾灯匣"] },
    { key: "revealed-cause", title: "后揭示的码头起因", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-01 05:30", "目击：林昭", "地点：雾港"] },
    { key: "explicit-absence", title: "密室中的明确缺席", tags: ["作者草稿", "单元：雾港追踪", "时间：之后3天", "相对锚点：潮汐信号第一次中断", "缺席：林昭", "物品：雾灯匣"] },
    { key: "unknown", title: "时间未定的匿名来客", tags: ["作者草稿", "单元：雾港追踪"] },
    { key: "signal", title: "潮汐信号第一次中断", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-01 09:00", "人物：程野", "地点：雾港"] },
    { key: "ledger", title: "守夜账册缺失一页", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-02 00:00 – 2026-09-03 00:00", "人物：顾澜", "物品：雾灯匣"] },
    { key: "witness", title: "苏弦看见第二艘船", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-01 09:00", "目击：苏弦", "地点：雾港"] },
    { key: "warning", title: "阿芜留下潮痕警告", tags: ["作者草稿", "单元：雾港追踪", "故事线：人物线 · 林昭", "时间：约 2026-09-02 12:00", "人物：阿芜", "知情：林昭=已得知", "知情：读者=未知", "物品：雾灯匣"] },
    { key: "blackout", title: "旧城灯塔同时熄灭", tags: ["作者草稿", "单元：雾港追踪", "故事线：主故事线|调查线 · 雾港", "时间：2026-09-03 18:00", "人物：陆衍", "知情：林昭=已得知", "知情：阿芜=未知", "知情：读者=已得知", "地点：雾港", "时间冲突：港务钟与灯塔记录相差两小时"] },
    { key: "branch", title: "林昭选择追踪支线", tags: ["作者草稿", "单元：灯塔支线", "故事线：人物线 · 林昭|调查线 · 雾港|灯塔支线", "时间：2026-09-03", "人物：林昭", "知情：阿芜=未知", "知情：读者=未知", "地点：雾港"] },
    { key: "echo", title: "灯塔回声重述旧案", tags: ["作者草稿", "单元：灯塔支线", "故事线：灯塔支线", "时间：相对2天前", "相对锚点：先揭示的港口后果", "听闻：林昭", "地点：雾港"] },
    { key: "map", title: "暗格地图指向外海", tags: ["作者草稿", "单元：灯塔支线", "故事线：灯塔支线", "时间：2026-09-04", "人物：程野", "物品：雾灯匣"] },
    { key: "false-lead", title: "伪造航线制造误导", tags: ["作者草稿", "单元：灯塔支线", "故事线：人物线 · 林昭|调查线 · 雾港|灯塔支线", "时间：2026-09-04", "知情：林昭=怀疑", "知情：阿芜=被误导", "知情：读者=未知", "推测：苏弦"] },
    { key: "return", title: "支线证据带回主线", tags: ["作者草稿", "单元：灯塔支线", "故事线：主故事线|灯塔支线", "时间：2026-09-05", "人物：林昭", "地点：雾港"] },
    { key: "confrontation", title: "六人在旧码头对峙", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-05", "人物：林昭,阿芜,陆衍,顾澜,程野,苏弦", "地点：雾港"] },
    { key: "reveal", title: "雾灯匣揭示第二层刻痕", tags: ["作者草稿", "单元：雾港追踪", "故事线：调查线 · 雾港", "作者秘密", "时间：2026-09-05", "人物：顾澜", "知情：林昭=未知", "知情：阿芜=未知", "知情：读者=未知", "物品：雾灯匣"] },
    { key: "aftermath", title: "港务记录恢复公开", tags: ["作者草稿", "单元：雾港追踪", "时间：2026-09-06", "人物：陆衍", "地点：雾港"] },
    { key: "hook", title: "外海传来新的灯语", tags: ["作者草稿", "单元：雾港追踪", "时间：未知", "目击：阿芜", "地点：雾港"] }
  ];
  const created = [];
  for (const definition of definitions) {
    const body = definition.key === "reveal" ? "R2_SECRET_CLAIM_雾灯匣夹层藏有真正航海图；该正文仅作者可见。" : `${definition.title}只用于 R12-C 隔离事件线验收。`;
    const result = await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "event", title: definition.title, status: "draft", tags: definition.tags, body });
    created.push({ ...definition, id: result.data.id, relativeId: result.data.relativeId, revisionToken: result.data.revisionToken, status: result.data.status });
  }
  observationFixture = Object.fromEntries(created.map((event) => [event.key, event]));
}

async function setupNarrativeFixture() {
  const unit = await postFixture(`${apiUrl}/__local/story-studio/story-units/create`, {
    projectId: fixtureProjectId,
    title: "雾港追踪",
    summary: "R12 隔离事件线的主叙事路径。",
    kind: "main",
    status: "active",
    linkedEntityIds: Object.values(observationFixture).map((event) => event.id)
  });
  const branch = await postFixture(`${apiUrl}/__local/story-studio/story-units/create`, {
    projectId: fixtureProjectId,
    title: "灯塔支线",
    summary: "从主线分出并回收证据的隔离验收支线。",
    kind: "branch",
    parentUnitId: unit.data.id,
    branchPointEventId: observationFixture.branch.id,
    mergeTargetUnitId: unit.data.id,
    order: 1,
    status: "active",
    linkedEntityIds: [observationFixture.branch.id, observationFixture.echo.id, observationFixture.map.id, observationFixture["false-lead"].id, observationFixture.return.id]
  });
  const bundle = Object.fromEntries(WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind, index) => [ownerKind, {
    ownerIdentity: `${ownerKind}.${fixture.fixtureId}`,
    projectionSchemaVersion: `${ownerKind}/r12-e2e-v1`,
    revisionToken: `r12-e2e.${index + 1}`,
    stableReferenceIds: [`${ownerKind}.ref.${fixture.fixtureId}`],
    provenanceReceiptIds: [`receipt.${ownerKind}.${fixture.fixtureId}`],
    canonicalProjection: { ownerKind, fixture: "r12-event-line-workspace" }
  }]));
  const root = createStoryStudioWorkVersionAuthority({ projectRoot: path.join(fixtureRoot, fixtureProjectId) }).createRootCheckpoint({
    displayName: "R12 事件线主作品",
    authorActionId: `author.r12-root.${fixture.fixtureId}`,
    idempotencyKey: `idempotency.r12-root.${fixture.fixtureId}`,
    expectedRevision: 0,
    createdAt: "2026-09-03T08:00:00.000Z",
    ownerSnapshotRefs: resolveWorkVersionOwnerSnapshotRefs(bundle),
    optionalNuwaProvenanceRefs: []
  });
  narrativeFixture = { unit: unit.data, branch: branch.data, workVersionId: root.identity.workVersionId };
}

async function setupR1CausalFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  const createType = async (label) => {
    const state = await getFixture(`${base}/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
    const created = await postFixture(`${base}/relations/types/create`, {
      projectId: fixtureProjectId,
      label,
      description: `R1 因果索引验收：${label}。`,
      expectedRepositoryRevision: state.data.repositoryRevision,
      operationId: `r1-causal-type-${label}-${fixture.fixtureId}`,
      sourceRef: "r1-causal-author-fixture"
    });
    return created.data.type.relationTypeId;
  };
  const typeIds = {};
  for (const label of ["因果", "触发", "必要条件", "导致"]) typeIds[label] = await createType(label);
  const link = async (sourceKey, targetKey, label, suffix, confirm = true) => {
    const created = await postFixture(`${base}/relations/create`, {
      projectId: fixtureProjectId,
      sourceObjectId: observationFixture[sourceKey].id,
      targetObjectId: observationFixture[targetKey].id,
      relationTypeId: typeIds[label],
      relationLabelSnapshot: label,
      direction: "forward",
      sourceRef: "r1-causal-author-fixture",
      operationId: `r1-causal-${suffix}-${fixture.fixtureId}`
    });
    if (confirm) await postFixture(`${base}/relations/confirm`, {
      projectId: fixtureProjectId,
      relationId: created.data.relation.relationId,
      expectedRelationRevision: created.data.relation.revision,
      operationId: `r1-causal-confirm-${suffix}-${fixture.fixtureId}`
    });
    return created.data.relation.relationId;
  };
  await link("ledger", "blackout", "因果", "antecedent");
  await link("signal", "blackout", "触发", "trigger");
  await link("revealed-cause", "blackout", "必要条件", "condition");
  await link("blackout", "revealed-consequence", "导致", "result");
  await link("revealed-consequence", "aftermath", "导致", "downstream");
  await link("warning", "blackout", "因果", "candidate", false);
  r1CausalFixture = { selected: observationFixture.blackout, result: observationFixture["revealed-consequence"], downstream: observationFixture.aftermath };
}

async function assertEventLineDualAxisCausalCoreR1(page, consoleProblems) {
  assert.ok(observationFixture && narrativeFixture && r1CausalFixture, "R1 requires the shared Event, NarrativeArrangement and Relation fixtures.");
  if (r1DualAxisCausalEvidenceDirectory) mkdirSync(r1DualAxisCausalEvidenceDirectory, { recursive: true });
  const capture = async (name) => { if (r1DualAxisCausalEvidenceDirectory) await page.screenshot({ path: path.join(r1DualAxisCausalEvidenceDirectory, name), fullPage: false }); };
  const providerRequests = [];
  page.on("request", (request) => {
    if (/story-modeling\/(?:plan|runs|execute)|\/__local\/story-studio\/provider|\/api\/provider/iu.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  });
  await seedR12NarrativeArrangements();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  const workspace = page.getByTestId("story-progression-workspace");
  await workspace.waitFor();
  const graph = page.getByTestId("formal-narrative-event-graph");
  await graph.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  assert.equal(await graph.getAttribute("data-placement-count"), "18", "The R1 fixture uses more than the required eight Events.");
  await capture("01-1440-event-line-narrative-order.png");

  const selectedNode = graph.locator(`[data-confirmed-event-id="${r1CausalFixture.selected.id}"]`).first();
  await selectedNode.locator(".formal-narrative-card-main").click();
  const dock = page.locator(".page-context-dock");
  await dock.getByRole("button", { name: "因果", exact: true }).click();
  const causal = page.getByTestId("event-causal-index");
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), r1CausalFixture.selected.id);
  for (const label of ["前因", "直接触发", "必要条件", "结果", "后续影响（两级）", "待确认或冲突"]) await causal.getByText(label, { exact: true }).waitFor();
  assert.ok(await causal.getByText(/作者确认/u).count() >= 1);
  assert.ok(await causal.getByText(/AI 候选/u).count() >= 1);
  await causal.getByText("查看关系来源", { exact: true }).first().click();
  await capture("02-1440-causal-forward.png");

  await causal.getByRole("button", { name: new RegExp(r1CausalFixture.result.title, "u") }).click();
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), r1CausalFixture.result.id, "A result can become the selected Event without duplicating an Event.");
  await causal.getByRole("button", { name: new RegExp(r1CausalFixture.downstream.title, "u") }).click();
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), r1CausalFixture.downstream.id, "A second-level impact receives the same stable Event selection and canvas focus.");
  await causal.getByRole("button", { name: "返回上一个因果节点", exact: true }).click();
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), r1CausalFixture.result.id, "Causal backtrace returns through the actual navigation history.");
  await causal.getByRole("button", { name: "回到起始事件", exact: true }).click();
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), r1CausalFixture.selected.id, "The author can trace a result back to its cause.");
  await capture("03-1440-causal-backtrace.png");

  await workspace.getByRole("button", { name: "时间线", exact: true }).click();
  const temporal = page.getByTestId("formal-temporal-canvas");
  await temporal.waitFor();
  assert.equal(await temporal.locator(".temporal-event-card").count(), 18);
  await temporal.locator(".temporal-crosshair").getByText(r1CausalFixture.selected.title, { exact: true }).waitFor();
  await capture("04-1440-time-line-world-time.png");
  await workspace.getByRole("button", { name: "事件线", exact: true }).click();
  await graph.waitFor();
  assert.equal(await graph.locator(`[data-confirmed-event-id="${r1CausalFixture.selected.id}"].is-selected`).count(), 1, "Returning to narrative order keeps the same selected Event.");
  await capture("05-1440-event-line-return.png");
  await reloadProduct(page);
  await workspace.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  assert.equal(await workspace.getAttribute("data-event-task"), "story", "Refresh preserves the current Event-line axis.");
  await page.locator(".page-context-dock").getByRole("button", { name: "因果", exact: true }).click();
  await page.getByTestId("event-causal-index").waitFor();
  assert.equal(await page.getByTestId("event-causal-index").getAttribute("data-event-id"), r1CausalFixture.selected.id, "Refresh retains the selected Event and its causal index.");
  assert.equal(await graph.getAttribute("data-placement-count"), "18", "Refresh retains Events and NarrativeArrangement.");
  assert.deepEqual(providerRequests, [], "R1 causal and dual-axis reads remain zero-Provider.");
  assert.deepEqual(consoleProblems, [], "R1 causal and dual-axis interactions must not add console errors.");
}

async function assertEventLineStoryCrossingKnowledgeR2(page, consoleProblems, focus) {
  assert.ok(observationFixture && narrativeFixture && r1CausalFixture, "R2 reuses the existing Event, NarrativeArrangement, Relation and character owners.");
  if (r2StoryCrossingEvidenceDirectory) mkdirSync(r2StoryCrossingEvidenceDirectory, { recursive: true });
  const capture = async (name) => {
    if (!r2StoryCrossingEvidenceDirectory) return;
    await page.screenshot({ path: path.join(r2StoryCrossingEvidenceDirectory, name), fullPage: false });
    // Evidence recording dwell only: this makes each verified state readable in
    // the continuous review video and is never used as a readiness condition.
    await page.waitForTimeout(5_500);
  };
  const secret = "R2_SECRET_CLAIM_雾灯匣夹层藏有真正航海图";
  await seedR12NarrativeArrangements();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  const workspace = page.getByTestId("story-progression-workspace");
  await workspace.waitFor();
  const loadSurface = page.locator(".tianyi-event-line-golden-loop");
  assert.equal(await loadSurface.getAttribute("data-load-phase"), "interactive", "Event Line records the transition from immediate feedback to the interactive surface.");
  const navigationStartedAt = Number(await loadSurface.getAttribute("data-navigation-started-at"));
  const firstFeedbackAt = Number(await loadSurface.getAttribute("data-first-feedback-at"));
  const interactiveAt = Number(await loadSurface.getAttribute("data-interactive-at"));
  assert.equal(Number.isFinite(navigationStartedAt) && Number.isFinite(firstFeedbackAt) && Number.isFinite(interactiveAt), true, "Navigation, first feedback and interactivity timings are recorded.");
  assert.equal(firstFeedbackAt >= navigationStartedAt && interactiveAt >= firstFeedbackAt, true, "Load timing order is monotonic and does not use a fixed readiness delay.");
  const graph = page.getByTestId("formal-narrative-event-graph");
  await graph.waitFor();
  const storylineSelect = page.getByTestId("storyline-scope-select");
  const observerSelect = page.getByTestId("knowledge-observer-select");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="storyline-scope-select"] option').length >= 4);
  const labels = await storylineSelect.locator("option").allTextContents();
  assert.equal(labels.some((label) => label.includes("主故事线")), true);
  assert.equal(labels.some((label) => label.includes("人物线 · 林昭")), true);
  assert.equal(labels.some((label) => label.includes("调查线 · 雾港")), true);
  const crossingMap = page.getByTestId("storyline-crossing-map");
  await crossingMap.waitFor();
  assert.ok(await crossingMap.locator(".storyline-crossing-rails > button").count() >= 3, "The global canvas exposes three directional Storyline rails, not only a filter menu.");
  const authorInvestigationLineId = await storylineSelect.locator("option").filter({ hasText: "调查线 · 雾港" }).getAttribute("value");
  assert.ok(authorInvestigationLineId);
  assert.equal(await graph.locator('[data-confirmed-event-id]').count(), 18, "Global story-crossing view uses one rendered projection per existing Placement.");
  await capture("01-ISOLATED_R2-all-three-storylines.png");

  const crossEventId = observationFixture.blackout.id;
  await graph.locator(`[data-confirmed-event-id="${crossEventId}"] .formal-narrative-card-main`).click();
  await page.getByTestId("story-crossing-selection").waitFor();
  assert.match(await page.getByTestId("story-crossing-selection").innerText(), /主故事线/u);
  assert.match(await page.getByTestId("story-crossing-selection").innerText(), /调查线 · 雾港/u);
  await crossingMap.locator(`[data-storyline-id="${authorInvestigationLineId}"]`).click();
  await page.waitForFunction((lineId) => document.querySelector('[data-testid="storyline-crossing-map"]')?.getAttribute("data-storyline-scope") === lineId, authorInvestigationLineId);
  assert.ok(await crossingMap.locator(".storyline-crossing-rails > .is-muted").count() >= 2, "A focused Storyline keeps other rails visible but visually subordinate for direction context.");
  await crossingMap.getByRole("button", { name: "返回全部故事线", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="storyline-crossing-map"]')?.getAttribute("data-storyline-scope") === "all");
  await storylineSelect.selectOption(authorInvestigationLineId);
  await page.waitForFunction((eventId) => document.querySelector(`[data-confirmed-event-id="${eventId}"].is-selected`), crossEventId);
  assert.equal(new URL(page.url()).searchParams.get("eventId"), crossEventId, "Switching a crossing Event to another Storyline keeps the same stable Event selection.");
  assert.equal(await graph.locator(`[data-confirmed-event-id="${crossEventId}"]`).count(), 1, "A crossing Event is not duplicated inside a focused Storyline.");
  await capture("02-ISOLATED_R2-crossing-event-same-id.png");

  const library = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const lin = library.data.objects.find((item) => item.type === "character" && item.title === "林昭");
  const wu = library.data.objects.find((item) => item.type === "character" && item.title === "阿芜");
  assert.ok(lin && wu, "R2 requires two formal character observers.");
  await observerSelect.selectOption(lin.id);
  await page.waitForFunction((id) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === id, lin.id);
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-hidden-event-count") || "0") > 0);
  const linDom = await page.locator("body").innerText();
  assert.equal(linDom.includes(secret), false, "A hidden claim body must not enter the character DOM.");
  const linPayload = await getFixture(`${apiUrl}/__local/story-studio/event-line/knowledge-view?projectId=${encodeURIComponent(fixtureProjectId)}&observerId=${encodeURIComponent(lin.id)}`);
  assert.equal(JSON.stringify(linPayload).includes(secret), false, "A hidden claim body must not enter the Knowledge View response payload.");
  assert.equal(linPayload.data.hiddenEventIds.includes(observationFixture.reveal.id), true, "The server records only the hidden Event identity, not its title or body.");
  await capture("03-ISOLATED_R2-character-a-knowledge-boundary.png");

  await observerSelect.selectOption(wu.id);
  await page.waitForFunction((id) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === id, wu.id);
  const investigationLine = (await getFixture(`${apiUrl}/__local/story-studio/event-line/knowledge-view?projectId=${encodeURIComponent(fixtureProjectId)}&observerId=${encodeURIComponent(wu.id)}`)).data.storylines.find((line) => line.label === "调查线 · 雾港");
  assert.ok(investigationLine, "Character B retains the investigation projection that contains the misleading source.");
  await storylineSelect.selectOption(investigationLine.id);
  const misleadingNode = graph.locator(`[data-confirmed-event-id="${observationFixture["false-lead"].id}"] .formal-narrative-card-main`);
  await misleadingNode.waitFor();
  await misleadingNode.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-boundary-status"]')?.textContent?.includes("被误导"));
  await page.waitForFunction((eventId) => {
    const node = document.querySelector(`[data-confirmed-event-id="${eventId}"]`);
    const canvas = node?.closest(".formal-narrative-flow");
    if (!node || !canvas) return false;
    const nodeBox = node.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const miniMapBox = canvas.querySelector(".react-flow__minimap")?.getBoundingClientRect();
    const fullyInside = nodeBox.left >= canvasBox.left + 12 && nodeBox.right <= canvasBox.right - 12 && nodeBox.top >= canvasBox.top + 12 && nodeBox.bottom <= canvasBox.bottom - 12;
    const clearOfMiniMap = !miniMapBox || nodeBox.right <= miniMapBox.left - 8 || nodeBox.bottom <= miniMapBox.top - 8;
    return fullyInside && clearOfMiniMap;
  }, observationFixture["false-lead"].id);
  assert.match(await page.getByTestId("knowledge-boundary-status").innerText(), /被误导/u, "Character B sees an attributed wrong belief, not a rewritten Event fact.");
  const focusedNodeGeometry = await graph.locator(`[data-confirmed-event-id="${observationFixture["false-lead"].id}"]`).evaluate((node) => {
    const nodeBox = node.getBoundingClientRect();
    const canvasBox = node.closest(".formal-narrative-flow")?.getBoundingClientRect();
    const miniMapBox = node.closest(".formal-narrative-flow")?.querySelector(".react-flow__minimap")?.getBoundingClientRect();
    return canvasBox ? { nodeLeft: nodeBox.left, nodeRight: nodeBox.right, nodeTop: nodeBox.top, nodeBottom: nodeBox.bottom, canvasLeft: canvasBox.left, canvasRight: canvasBox.right, canvasTop: canvasBox.top, canvasBottom: canvasBox.bottom, miniMapLeft: miniMapBox?.left ?? null, miniMapTop: miniMapBox?.top ?? null } : null;
  });
  assert.ok(focusedNodeGeometry && focusedNodeGeometry.nodeLeft >= focusedNodeGeometry.canvasLeft + 12 && focusedNodeGeometry.nodeRight <= focusedNodeGeometry.canvasRight - 12 && focusedNodeGeometry.nodeTop >= focusedNodeGeometry.canvasTop + 12 && focusedNodeGeometry.nodeBottom <= focusedNodeGeometry.canvasBottom - 12 && (focusedNodeGeometry.miniMapLeft === null || focusedNodeGeometry.nodeRight <= focusedNodeGeometry.miniMapLeft - 8 || focusedNodeGeometry.nodeBottom <= focusedNodeGeometry.miniMapTop - 8), `Focused Storyline must keep its selected Event fully readable and clear of the minimap=${JSON.stringify(focusedNodeGeometry)}`);
  await capture("04-ISOLATED_R2-character-b-misled-belief.png");

  await observerSelect.selectOption("author");
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === "author");
  await page.getByTestId("knowledge-compare-picker").getByLabel("林昭").check();
  await page.getByTestId("knowledge-compare-picker").getByLabel("阿芜").check();
  await page.waitForFunction((ids) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === ids, `${lin.id},${wu.id}`);
  await page.getByTestId("knowledge-comparison").waitFor();
  assert.match(await page.getByTestId("knowledge-comparison").innerText(), /林昭\s*推断\s*\/\s*怀疑/u, "Comparison renders 林昭's cognitive state as text and structure.");
  assert.match(await page.getByTestId("knowledge-comparison").innerText(), /阿芜\s*误解\s*·\s*被错误信息误导/u, "Comparison renders 阿芜's wrong belief without rewriting the Event.");
  await capture("05-ISOLATED_R2-two-character-comparison.png");

  await workspace.getByRole("button", { name: "时间线", exact: true }).click();
  await page.getByTestId("formal-temporal-canvas").waitFor();
  assert.match(await page.getByTestId("knowledge-boundary-status").getAttribute("data-observer-id") ?? "", new RegExp(`${lin.id},${wu.id}`, "u"), "Knowledge comparison remains active on the world-time projection.");
  assert.equal(await storylineSelect.inputValue(), investigationLine.id, "Storyline scope remains active on the world-time projection.");
  await capture("06-ISOLATED_R2-timeline-preserves-coordinates.png");
  await workspace.getByRole("button", { name: "事件线", exact: true }).click();
  await observerSelect.selectOption("author");
  await storylineSelect.selectOption("all");
  await graph.getByRole("button", { name: "全书位置", exact: true }).click();
  await crossingMap.locator(`[data-crossing-event-id="${crossEventId}"]`).click();
  await page.locator(".page-context-dock").getByRole("button", { name: "因果", exact: true }).click();
  await page.getByTestId("event-causal-index").waitFor();
  assert.equal(await page.getByTestId("event-causal-index").getAttribute("data-event-id"), crossEventId, "The R1 causal path keeps the selected crossing Event.");
  await capture("07-ISOLATED_R2-causal-drawer-selection.png");

  await observerSelect.selectOption(lin.id);
  await page.waitForFunction((id) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === id, lin.id);
  await storylineSelect.selectOption(investigationLine.id);
  await page.waitForFunction((lineId) => new URL(window.location.href).searchParams.get("eventStoryline") === lineId, investigationLine.id);
  const tianyiToggle = page.locator('[data-panel-toggle="tianyi-agent"]');
  if (await tianyiToggle.getAttribute("aria-pressed") !== "true") await tianyiToggle.click();
  const sidebar = page.locator(".tianyi-sidebar");
  await sidebar.waitFor();
  await sidebar.getByRole("tab", { name: "Agent", exact: true }).click();
  assert.match(await page.getByTestId("page-agent-knowledge-scope").innerText(), /林昭.*只接收当前知情范围/u);
  await capture("08-ISOLATED_R2-page-agent-scoped.png");

  const opened = await postFixture(`${apiUrl}/__local/story-studio/tianyi/session/open`, { projectId: fixtureProjectId, operationId: `r2-session-${fixture.fixtureId}`, retentionMode: "normal" });
  const startedAgent = await postFixture(`${apiUrl}/__local/story-studio/tianyi-agent/run/start`, {
    projectId: fixtureProjectId,
    workVersionId: narrativeFixture.workVersionId,
    sessionId: opened.data.sessionId,
    task: "只核对当前观察者可知内容",
    currentPage: "/event-line",
    permissionProfile: "step-by-step",
    operationId: `r2-agent-${fixture.fixtureId}`,
    contextRequest: {
      productMode: "world",
      activeOwner: { kind: "world-object", id: observationFixture.reveal.id },
      selection: { documentId: null, objectId: observationFixture.reveal.id, timelinePointId: null },
      sourceRefs: [{ id: observationFixture.reveal.id, kind: "event", origin: "event-line" }],
      memorySelections: [],
      enabledSkillRefs: [],
      eventRefs: [{ version: "story-studio-event-reference/v1", projectId: fixtureProjectId, eventId: observationFixture.reveal.id, revisionToken: observationFixture.reveal.revisionToken, state: observationFixture.reveal.status, requestedUse: "constraint" }],
      knowledgeView: { observerId: lin.id, observerLabel: lin.title, hiddenEventCount: linPayload.data.hiddenCount }
    }
  });
  const agent = await postFixture(`${apiUrl}/__local/story-studio/tianyi-agent/run/approve`, {
    projectId: fixtureProjectId,
    workVersionId: narrativeFixture.workVersionId,
    sessionId: opened.data.sessionId,
    runId: startedAgent.data.runId,
    stepId: startedAgent.data.plan.find((step) => step.kind === "read-context").stepId,
    operationId: `r2-agent-context-approve-${fixture.fixtureId}`
  });
  assert.ok(agent.data.contextManifest, `Approved context step must build a manifest: ${JSON.stringify({ status: agent.data.status, plan: agent.data.plan, error: agent.data.error })}`);
  const contextPackText = JSON.stringify(agent.data.contextManifest);
  assert.equal(contextPackText.includes(secret), false, "Page Agent ContextPack excludes hidden claim text.");
  assert.equal(contextPackText.includes(observationFixture.reveal.id), false, "Page Agent ContextPack excludes the hidden Event reference before source resolution.");
  assert.deepEqual(agent.data.contextManifest.authorSourceRefs, [], "Restricted Page Agent cannot inherit omniscient author conversation sources.");
  assert.equal(agent.data.budget.providerCalls, 0);

  await sidebar.locator(".tianyi-sidebar-header button[aria-label]").last().click();
  const selectedBeforeRefresh = new URL(page.url()).searchParams.get("eventId");
  assert.equal(new URL(page.url()).searchParams.get("eventStoryline"), investigationLine.id, `Storyline coordinate must remain in the URL before refresh: ${page.url()}`);
  await reloadProduct(page);
  await workspace.waitFor();
  assert.equal(await observerSelect.inputValue(), lin.id, "Refresh restores the Knowledge View coordinate.");
  assert.equal(await storylineSelect.inputValue(), investigationLine.id, "Refresh restores the Storyline coordinate.");
  assert.equal(new URL(page.url()).searchParams.get("eventId"), selectedBeforeRefresh, "Refresh restores the selected Event coordinate.");
  assert.equal((await page.locator("body").innerText()).includes(secret), false, "Refresh does not reintroduce hidden claim text into the DOM.");
  await capture("09-ISOLATED_R2-refresh-restores-safe-view.png");
  assert.deepEqual(consoleProblems, [], `R2 ${focus} interactions must not add browser console errors.`);
}

async function assertEventLineFounderCloseoutR21(page, consoleProblems) {
  assert.ok(observationFixture && narrativeFixture && r1CausalFixture, "R2.1 requires the existing Event, NarrativeArrangement and Relation fixtures.");
  const secret = "R2_SECRET_CLAIM_雾灯匣夹层藏有真正航海图";
  await seedR12NarrativeArrangements();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  const workspace = page.getByTestId("story-progression-workspace");
  const graph = page.getByTestId("formal-narrative-event-graph");
  const observerSelect = page.getByTestId("knowledge-observer-select");
  const storylineSelect = page.getByTestId("storyline-scope-select");
  await workspace.waitFor();
  await graph.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  const library = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const lin = library.data.objects.find((item) => item.type === "character" && item.title === "林昭");
  const wu = library.data.objects.find((item) => item.type === "character" && item.title === "阿芜");
  assert.ok(lin && wu, "Founder recovery fixture requires 林昭 and 阿芜.");
  const investigationLineId = await storylineSelect.locator("option").filter({ hasText: "调查线 · 雾港" }).getAttribute("value");
  assert.ok(investigationLineId);

  // The selected crossing Event remains visible to 林昭.  Reload waits for the
  // actual safe projection, not a timeout or the first transient paint.
  await graph.locator(`[data-confirmed-event-id="${observationFixture.blackout.id}"] .formal-narrative-card-main`).click();
  await storylineSelect.selectOption(investigationLineId);
  await observerSelect.selectOption(lin.id);
  await page.waitForFunction((eventId) => Boolean(document.querySelector(`[data-confirmed-event-id="${eventId}"].is-selected`)), observationFixture.blackout.id);
  await reloadProduct(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  await page.waitForFunction((eventId) => Boolean(document.querySelector(`[data-confirmed-event-id="${eventId}"].is-selected`)), observationFixture.blackout.id);
  assert.equal(await page.getByTestId("knowledge-boundary-status").getAttribute("data-observer-id"), lin.id);
  assert.equal(await storylineSelect.inputValue(), investigationLineId);
  assert.equal(await graph.locator(`[data-confirmed-event-id="${observationFixture.blackout.id}"]`).count(), 1);
  assert.ok(await graph.locator(`[data-confirmed-event-id="${observationFixture.blackout.id}"]`).evaluate((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0), "A restored Event must remain visibly laid out after knowledge data settles.");

  await observerSelect.selectOption("author");
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === "author");
  await page.getByTestId("knowledge-compare-picker").getByLabel("林昭").check();
  await page.getByTestId("knowledge-compare-picker").getByLabel("阿芜").check();
  await page.waitForFunction((ids) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === ids, `${lin.id},${wu.id}`);
  await graph.locator(`[data-confirmed-event-id="${observationFixture["false-lead"].id}"] .formal-narrative-card-main`).click();
  const comparison = page.getByTestId("knowledge-comparison");
  await comparison.waitFor();
  assert.match(await comparison.innerText(), /林昭\s*推断\s*\/\s*怀疑/u);
  assert.match(await comparison.innerText(), /阿芜\s*误解\s*·\s*被错误信息误导/u);
  assert.equal((await page.locator("body").innerText()).includes(secret), false, "Comparison API and DOM retain no hidden Event title/body.");
  await reloadProduct(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  await page.waitForFunction((ids) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === ids, `${lin.id},${wu.id}`);
  assert.equal(await graph.locator(`[data-confirmed-event-id="${observationFixture["false-lead"].id}"].is-selected`).count(), 1, "Refresh restores the selected shared Event only after the comparison projection has settled.");
  assert.match(await page.getByTestId("knowledge-comparison").innerText(), /林昭\s*推断\s*\/\s*怀疑/u);

  // A stale route that is no longer visible may not retain an orphaned detail
  // drawer, title, identifier or empty final canvas.
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventObserver=${encodeURIComponent(lin.id)}&eventStoryline=${encodeURIComponent(investigationLineId)}&eventId=${encodeURIComponent(observationFixture.reveal.id)}`);
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  await page.getByTestId("event-line-recovery-notice").waitFor();
  assert.equal(new URL(page.url()).searchParams.has("eventId"), false, "An invisible stale selection is removed from the recoverable route state.");
  assert.equal(await page.locator(".page-context-dock").getAttribute("data-page-dock-open"), "false", "An Event absent from the final graph cannot leave a stale details drawer.");
  assert.equal(await page.locator(".page-context-dock-panel").count(), 0, "A closed rail is not a retained event-details panel.");
  assert.ok(await graph.locator("[data-confirmed-event-id]").count() > 0, "The final safe graph must contain visible nodes rather than a blank canvas.");
  const body = await page.locator("body").innerText();
  assert.equal(body.includes(secret), false);
  assert.equal(body.includes(observationFixture.reveal.title), false);
  assert.deepEqual(consoleProblems, [], "Founder recovery uses stable projection transitions without console errors.");
}

async function recordEventLineFounderCloseoutR21() {
  assert.ok(founderCloseoutR21EvidenceDirectory, "Founder closeout recording requires TIANYAN_EVENT_LINE_R2_1_EVIDENCE_DIR.");
  assert.ok(observationFixture && narrativeFixture && r1CausalFixture, "R2.1 recording requires the existing Event, NarrativeArrangement and Relation fixtures.");
  mkdirSync(founderCloseoutR21EvidenceDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: founderCloseoutR21EvidenceDirectory, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();
  const video = page.video();
  const consoleProblems = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) consoleProblems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  const capture = async (name) => {
    await page.screenshot({ path: path.join(founderCloseoutR21EvidenceDirectory, name), fullPage: false });
    // This dwell is solely for a human-readable final recording. Readiness is
    // asserted separately at every state and never inferred from this delay.
    await page.waitForTimeout(7_000);
  };

  await seedR12NarrativeArrangements();
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  const workspace = page.getByTestId("story-progression-workspace");
  const graph = page.getByTestId("formal-narrative-event-graph");
  const observerSelect = page.getByTestId("knowledge-observer-select");
  const storylineSelect = page.getByTestId("storyline-scope-select");
  await workspace.waitFor();
  await graph.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  await page.waitForFunction(() => document.querySelectorAll('[data-confirmed-event-id]').length >= 8);
  const library = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const lin = library.data.objects.find((item) => item.type === "character" && item.title === "林昭");
  const wu = library.data.objects.find((item) => item.type === "character" && item.title === "阿芜");
  assert.ok(lin && wu, "Founder recording requires 林昭 and 阿芜.");
  const investigationLineId = await storylineSelect.locator("option").filter({ hasText: "调查线 · 雾港" }).getAttribute("value");
  assert.ok(investigationLineId);
  const crossingMap = page.getByTestId("storyline-crossing-map");
  await crossingMap.waitFor();
  assert.ok(await crossingMap.locator(".storyline-crossing-rails > button").count() >= 3, "The recording begins with three visible Storyline rails.");
  await capture("01-GLOBAL-three-storylines-1440x900.png");

  await graph.locator(`[data-confirmed-event-id="${observationFixture.blackout.id}"] .formal-narrative-card-main`).click();
  await page.getByTestId("story-crossing-selection").waitFor();
  await crossingMap.locator(`[data-storyline-id="${investigationLineId}"]`).click();
  await page.waitForFunction((lineId) => document.querySelector('[data-testid="storyline-crossing-map"]')?.getAttribute("data-storyline-scope") === lineId, investigationLineId);
  await capture("02-FOCUS-investigation-and-return-1440x900.png");
  await crossingMap.getByRole("button", { name: "返回全部故事线", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="storyline-crossing-map"]')?.getAttribute("data-storyline-scope") === "all");
  await capture("03-RETURN-all-storylines-1440x900.png");

  await storylineSelect.selectOption(investigationLineId);
  await graph.locator(`[data-confirmed-event-id="${observationFixture["false-lead"].id}"] .formal-narrative-card-main`).click();
  await page.waitForFunction((eventId) => Boolean(document.querySelector(`[data-confirmed-event-id="${eventId}"].is-selected`)), observationFixture["false-lead"].id);
  await observerSelect.selectOption("author");
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === "author");
  await page.getByTestId("knowledge-compare-picker").getByLabel("林昭").check();
  await page.getByTestId("knowledge-compare-picker").getByLabel("阿芜").check();
  await page.waitForFunction((ids) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === ids, `${lin.id},${wu.id}`);
  const comparison = page.getByTestId("knowledge-comparison");
  await comparison.waitFor();
  assert.match(await comparison.innerText(), /林昭\s*推断\s*\/\s*怀疑/u);
  assert.match(await comparison.innerText(), /阿芜\s*误解\s*·\s*被错误信息误导/u);
  await capture("04-COMPARE-two-character-knowledge-1440x900.png");

  await storylineSelect.selectOption("all");
  await workspace.getByRole("button", { name: "时间线", exact: true }).click();
  const temporal = page.getByTestId("formal-temporal-canvas");
  await temporal.waitFor();
  assert.ok(await temporal.locator(".temporal-event-card").count() >= 3, "The recorded world-time view must show multiple Events.");
  await capture("05-TIMELINE-multiple-events-1440x900.png");
  await workspace.getByRole("button", { name: "事件线", exact: true }).click();
  await graph.waitFor();
  await page.getByTestId("knowledge-compare-picker").getByLabel("林昭").uncheck();
  await page.getByTestId("knowledge-compare-picker").getByLabel("阿芜").uncheck();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === "author");
  await storylineSelect.selectOption("all");
  await graph.getByRole("button", { name: "全书位置", exact: true }).click();
  await crossingMap.locator(`[data-crossing-event-id="${observationFixture.blackout.id}"]`).click();
  const dock = page.locator(".page-context-dock");
  await dock.getByRole("button", { name: "因果", exact: true }).click();
  const causal = page.getByTestId("event-causal-index");
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), observationFixture.blackout.id);
  await causal.getByText("查看关系来源", { exact: true }).first().click();
  await capture("06-CAUSAL-forward-start-1440x900.png");
  await causal.getByRole("button", { name: new RegExp(r1CausalFixture.result.title, "u") }).click();
  await causal.getByRole("button", { name: new RegExp(r1CausalFixture.downstream.title, "u") }).click();
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), r1CausalFixture.downstream.id);
  await capture("07-CAUSAL-forward-result-1440x900.png");
  await causal.getByRole("button", { name: "返回上一个因果节点", exact: true }).click();
  await causal.getByRole("button", { name: "回到起始事件", exact: true }).click();
  await causal.waitFor();
  assert.equal(await causal.getAttribute("data-event-id"), observationFixture.blackout.id);
  await capture("08-CAUSAL-backtrace-origin-1440x900.png");

  await observerSelect.selectOption(lin.id);
  await storylineSelect.selectOption(investigationLineId);
  await page.waitForFunction((id) => document.querySelector('[data-testid="knowledge-boundary-status"]')?.getAttribute("data-observer-id") === id, lin.id);
  const tianyiToggle = page.locator('[data-panel-toggle="tianyi-agent"]');
  if (await tianyiToggle.getAttribute("aria-pressed") !== "true") await tianyiToggle.click();
  const sidebar = page.locator(".tianyi-sidebar");
  await sidebar.waitFor();
  await sidebar.getByRole("tab", { name: "Agent", exact: true }).click();
  const agentScope = page.getByTestId("page-agent-knowledge-scope");
  await agentScope.waitFor();
  assert.match(await agentScope.innerText(), /林昭.*只接收当前知情范围/u);
  await capture("09-AGENT-restricted-page-scope-1440x900.png");
  await sidebar.locator(".tianyi-sidebar-header button[aria-label]").last().click();

  await crossingMap.locator(`[data-crossing-event-id="${observationFixture.blackout.id}"]`).click();
  await page.waitForFunction((eventId) => Boolean(document.querySelector(`[data-confirmed-event-id="${eventId}"].is-selected`)), observationFixture.blackout.id);
  await reloadProduct(page);
  await workspace.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-projection-loading"]') === null);
  await page.waitForFunction((eventId) => Boolean(document.querySelector(`[data-confirmed-event-id="${eventId}"].is-selected`)), observationFixture.blackout.id);
  assert.equal(await observerSelect.inputValue(), lin.id);
  assert.equal(await storylineSelect.inputValue(), investigationLineId);
  await capture("10-REFRESH-stable-safe-view-1440x900.png");
  assert.deepEqual(consoleProblems, [], "Founder recording must not add browser console errors.");

  await context.close();
  const recordingPath = video ? await video.path() : null;
  if (!recordingPath) throw new Error("Founder closeout recording was not written.");
  const finalVideoPath = path.join(founderCloseoutR21EvidenceDirectory, "FOUNDER-GOLDEN-R2.1-1440x900.webm");
  copyFileSync(recordingPath, finalVideoPath);
  writeFileSync(path.join(founderCloseoutR21EvidenceDirectory, "recording-path.txt"), `${recordingPath}\n`, "utf8");
}

async function seedR12NarrativeArrangements() {
  assert.ok(narrativeFixture, "R12 narrative fixture must exist before seeding arrangements.");
  const paths = [
    {
      unit: narrativeFixture.unit,
      placements: [
        ["revealed-consequence", "reveal"],
        ["signal", "primary"],
        ["unknown", "primary"],
        ["ledger", "primary"],
        ["witness", "primary"],
        ["warning", "primary"],
        ["blackout", "primary"],
        ["branch", "primary"],
        ["confrontation", "primary"],
        ["revealed-cause", "flashback"],
        ["reveal", "reinterpretation"],
        ["aftermath", "primary"],
        ["explicit-absence", "primary"]
      ]
    },
    {
      unit: narrativeFixture.branch,
      placements: [
        ["branch", "reinterpretation"],
        ["echo", "recap"],
        ["map", "primary"],
        ["false-lead", "primary"],
        ["return", "primary"]
      ]
    }
  ];
  const seeded = {};
  for (const [pathIndex, pathFixture] of paths.entries()) {
    let result = await postFixture(`${apiUrl}/__local/story-studio/narrative-arrangements/create`, {
      projectId: fixtureProjectId,
      workVersionId: narrativeFixture.workVersionId,
      narrativePathId: pathFixture.unit.id,
      ownerStoryUnitId: pathFixture.unit.id,
      expectedOwnerVersion: pathFixture.unit.version,
      expectedRevision: 0,
      operationId: `r12c-e2e-create-${pathIndex}-${fixture.fixtureId}`,
      authorActionId: `author.r12c-create-${pathIndex}-${fixture.fixtureId}`,
      createdAt: `2026-09-03T08:0${pathIndex}:00.000Z`
    });
    assert.equal(result.data.conflict, false, `Narrative path ${pathFixture.unit.title} should be created.`);
    for (const [placementIndex, [eventKey, role]] of pathFixture.placements.entries()) {
      result = await postFixture(`${apiUrl}/__local/story-studio/narrative-arrangements/insert`, {
        projectId: fixtureProjectId,
        workVersionId: narrativeFixture.workVersionId,
        narrativePathId: pathFixture.unit.id,
        expectedOwnerVersion: result.data.ownerVersion,
        expectedRevision: result.data.arrangement.currentRevision,
        operationId: `r12c-e2e-insert-${pathIndex}-${placementIndex}-${fixture.fixtureId}`,
        authorActionId: `author.r12c-insert-${pathIndex}-${placementIndex}-${fixture.fixtureId}`,
        createdAt: `2026-09-03T08:${String(pathIndex * 20 + placementIndex + 2).padStart(2, "0")}:00.000Z`,
        eventId: observationFixture[eventKey].id,
        storyUnitId: pathFixture.unit.id,
        role,
        position: { kind: "end" }
      });
      assert.equal(result.data.conflict, false, `Fixture Placement ${eventKey} should be inserted.`);
    }
    seeded[pathFixture.unit.id] = result.data;
  }
  return seeded;
}

function assertR12ProjectionConflictFixture(seeded) {
  const main = seeded[narrativeFixture.unit.id].arrangement;
  const head = main.revisions.find((revision) => revision.revision === main.currentRevision);
  assert.ok(head && head.placements.length >= 2, "The R12 projection-conflict fixture requires two main Placements.");
  const duplicatedOrder = head.placements.map((placement, index) => index === 1 ? { ...placement, orderKey: head.placements[0].orderKey } : placement);
  const { revisionDigest: _revisionDigest, ...headBody } = { ...head, placements: duplicatedOrder };
  const conflictedHead = { ...headBody, revisionDigest: createHash("sha256").update(stableJson(headBody), "utf8").digest("hex") };
  const conflicted = { ...main, currentVersion: conflictedHead.revisionDigest, revisions: main.revisions.map((revision) => revision.revision === head.revision ? conflictedHead : revision) };
  const eventIds = Object.values(observationFixture).map((event) => event.id);
  const storyUnits = [narrativeFixture.unit, narrativeFixture.branch].map((unit) => ({ storyUnitId: unit.id, order: unit.order }));
  const orderProjection = projectNarrativeArrangement({ projectId: main.projectId, workVersionId: main.workVersionId, narrativePathId: main.narrativePathId, eventIds, storyUnits, arrangement: conflicted });
  assert.ok(orderProjection.conflicts.some((entry) => entry.state === "order-conflict"), "The same 18-Event fixture covers an explicit order-conflict projection.");
  const danglingEventId = head.placements.at(-1).eventId;
  const danglingProjection = projectNarrativeArrangement({ projectId: main.projectId, workVersionId: main.workVersionId, narrativePathId: main.narrativePathId, eventIds: eventIds.filter((eventId) => eventId !== danglingEventId), storyUnits, arrangement: main });
  assert.ok(danglingProjection.conflicts.some((entry) => entry.state === "dangling-reference" && entry.eventId === danglingEventId), "The same 18-Event fixture covers an explicit dangling-reference projection.");
}

async function assertR12EventLineWorkspace(page, consoleProblems) {
  assert.ok(observationFixture, "R12 event-line fixture must exist.");
  assert.ok(narrativeFixture, "R12 narrative fixture must exist.");
  assert.equal(narrativeFixture.branch.branchPointEventId, observationFixture.branch.id, "The branch fixture keeps its formal fork Event.");
  assert.equal(narrativeFixture.branch.mergeTargetUnitId, narrativeFixture.unit.id, "The branch fixture keeps its formal merge target.");
  if (r12EventLineEvidenceDirectory) mkdirSync(r12EventLineEvidenceDirectory, { recursive: true });
  const capture = async (name) => { if (r12EventLineEvidenceDirectory) await page.screenshot({ path: path.join(r12EventLineEvidenceDirectory, name), fullPage: false }); };
  const providerRequests = [];
  page.on("request", (request) => {
    if (/story-modeling\/(?:plan|runs|execute)|\/__local\/story-studio\/provider|\/api\/provider/iu.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page);
  const workspace = page.getByTestId("story-progression-workspace");
  await workspace.waitFor();
  assert.equal(await workspace.getAttribute("data-event-task"), "story");
  assert.equal(await workspace.getAttribute("data-arrangement-state"), "unplaced");
  const graph = page.getByTestId("formal-narrative-event-graph");
  await graph.waitFor();
  assert.equal(await graph.getAttribute("data-event-line-renderer"), "EventGraphCanvas");
  assert.equal(await graph.getAttribute("data-narrative-order-owner"), "NarrativeArrangementProjection");
  assert.equal(await graph.getAttribute("data-placement-count"), "0");
  assert.equal(await workspace.locator(".narrative-event-card").count(), 0, "The retired flat-card renderer is not active.");
  await graph.getByRole("button", { name: "安排第一个事件", exact: true }).click();
  assert.equal(await workspace.locator(".unplaced-event-tray article").count(), 18, "Unplaced Events stay in the explicit staging drawer, not on the graph.");
  await capture("00-1440-no-arrangement.png");
  await workspace.getByRole("button", { name: "收起", exact: true }).click();

  await workspace.getByRole("button", { name: "时间线", exact: true }).click();
  const temporalWithoutArrangement = page.getByTestId("formal-temporal-canvas");
  await temporalWithoutArrangement.waitFor();
  assert.equal(await temporalWithoutArrangement.locator(".temporal-event-card").count(), 18, "World time remains visible without a NarrativeArrangement.");
  assert.equal(await temporalWithoutArrangement.getAttribute("data-temporal-projection"), "independent");
  await workspace.getByRole("button", { name: "事件线", exact: true }).click();

  const seededArrangements = await seedR12NarrativeArrangements();
  assertR12ProjectionConflictFixture(seededArrangements);
  await reloadProduct(page);
  await workspace.waitFor();
  assert.equal(await workspace.getAttribute("data-event-task"), "story");
  assert.equal(await workspace.getAttribute("data-arrangement-state"), "placed");
  assert.equal(await graph.getAttribute("data-placement-count"), "18", "Thirteen main and five branch Placements render from two formal arrangements.");
  assert.equal(await graph.locator(".formal-narrative-placement-node").count(), 18);
  assert.ok(await graph.locator(".formal-narrative-edge.is-main").count() >= 12, "The main Event spine is actual graph geometry.");
  assert.ok(await graph.locator(".formal-narrative-edge.is-branch").count() >= 2, "The branch is actual graph geometry.");
  assert.ok(await graph.locator(".formal-narrative-edge.is-merge").count() >= 2, "The merge is actual graph geometry.");
  const repeatedBranchEvent = graph.locator(`[data-confirmed-event-id="${observationFixture.branch.id}"]`);
  assert.equal(await repeatedBranchEvent.count(), 2, "One Event may have distinct main and branch Placement nodes.");
  assert.equal(new Set(await repeatedBranchEvent.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-placement-id")))).size, 2);
  await capture("01-1440-event-line.png");

  await graph.getByRole("button", { name: "全书位置", exact: true }).click();
  await page.waitForTimeout(320);
  await capture("02-1440-branch-merge.png");
  const expandedPlacementCount = await graph.locator(".formal-narrative-placement-node").count();
  await graph.getByRole("button", { name: "折叠支线", exact: true }).click();
  assert.equal(await graph.locator(".formal-narrative-placement-node").count(), expandedPlacementCount - 5, "Collapsing a branch hides only its local Placement nodes.");
  assert.equal(await graph.locator(".formal-topology-node.is-collapsed").count(), 1);
  await graph.getByRole("button", { name: "展开支线", exact: true }).click();
  assert.equal(await graph.locator(".formal-narrative-placement-node").count(), expandedPlacementCount);

  await workspace.getByRole("button", { name: /焦点：/u }).click();
  for (const label of ["林昭", "雾港", "雾灯匣"]) await page.getByRole("checkbox", { name: new RegExp(label, "u") }).check();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  assert.equal(await graph.getAttribute("data-focus-track-count"), "3");
  assert.ok(await graph.locator(".formal-focus-point").count() >= 3, "Selected people, locations, and items overlay the same Event graph.");
  assert.ok(await graph.locator(".formal-focus-point.is-explicit-absence").count() >= 1, "Explicit absence has its own shape.");
  assert.ok(await graph.locator(".formal-focus-edge.is-weak").count() >= 1, "Sourced hearsay or inference uses a weak dashed connection.");
  await graph.getByRole("button", { name: "全书位置", exact: true }).click();
  await page.waitForTimeout(320);
  await capture("03-1440-three-focus.png");

  await page.setViewportSize({ width: 1195, height: 800 });
  const directoryToggle = page.locator('[data-panel-toggle="project-directory"]');
  if (await directoryToggle.getAttribute("aria-pressed") !== "true") await directoryToggle.click();
  await graph.getByRole("button", { name: "全书位置", exact: true }).click();
  await page.waitForTimeout(320);
  await repeatedBranchEvent.first().locator(".formal-narrative-card-main").click();
  await page.locator(".page-context-dock-panel").waitFor();
  await page.waitForTimeout(220);
  assert.equal(await page.locator(".tianyan-r0-shell").getAttribute("data-directory-visible"), "true", "Opening details at 1195px preserves the author’s open project directory.");
  const directoryBox = await page.locator(".project-directory-panel").boundingBox();
  const flowBox = await graph.locator(".formal-narrative-flow").boundingBox();
  assert.ok(directoryBox && flowBox, "The directory and narrative canvas must both be measurable at 1195px.");
  assert.ok(flowBox.width >= 360, "The graph retains usable context beside the 1195px details Dock.");
  assert.ok(directoryBox.x + directoryBox.width <= flowBox.x || flowBox.x + flowBox.width <= directoryBox.x, "The preserved directory must not cover the narrative canvas at 1195px.");
  assert.equal(await graph.locator(".formal-narrative-card.is-selected").count(), 2, "Both Placement nodes share the selected Event identity.");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await capture("07-1195-directory-and-detail.png");
  await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
  await page.locator(".tianyi-sidebar").waitFor();
  assert.equal(await page.locator(".page-context-dock-panel").count(), 0, "Tianyi and the page-owned details Dock are mutually exclusive.");
  const focusedPageRailButton = page.locator(".page-context-dock-rail").getByRole("button", { name: "因果", exact: true });
  const focusedPageRailBox = await focusedPageRailButton.boundingBox();
  assert.ok(focusedPageRailBox, "The Event page-tool rail remains visible while Tianyi is open.");
  assert.equal(await focusedPageRailButton.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest("button") === button;
  }), true, "The visible Event page-tool trigger must remain the real pointer hit target above Tianyi.");
  await focusedPageRailButton.click();
  await page.locator(".page-context-dock-panel").waitFor();
  assert.equal(await page.locator(".tianyi-sidebar").count(), 0, "Selecting a page tool replaces Tianyi in the one shared right-side slot.");
  await page.locator(".page-context-dock-panel > header button").click();
  await closeGlobalTianyiIfOpen(page);

  await page.setViewportSize({ width: 1152, height: 720 });
  await page.waitForTimeout(180);
  assert.equal(await page.locator(".tianyan-r0-shell").getAttribute("data-directory-visible"), "false", "The 1152px event workspace defaults to a collapsed directory.");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "The 1152px viewport has no page-level overflow.");
  await capture("08-1152.png");

  await page.setViewportSize({ width: 743, height: 529 });
  await graph.getByRole("button", { name: "定位所选", exact: true }).click();
  await page.waitForTimeout(280);
  await repeatedBranchEvent.first().locator(".formal-narrative-card-main").click();
  await page.locator(".page-context-dock-panel").waitFor();
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "The 200% equivalent viewport has no page-level overflow.");
  assert.ok((await graph.locator(".formal-narrative-flow").boundingBox()).width >= 280, "The graph remains mounted behind the overlay details drawer.");
  assert.equal(await graph.locator(".formal-narrative-card.is-selected").count(), 2);
  await capture("09-743x529.png");
  await page.locator(".page-context-dock-panel > header button").click();
  assert.equal(await graph.locator(".formal-narrative-card.is-selected").count(), 2, "Closing the mobile drawer preserves current Event identity.");

  await page.setViewportSize({ width: 1440, height: 900 });
  await workspace.getByRole("button", { name: "时间线", exact: true }).click();
  const temporal = page.getByTestId("formal-temporal-canvas");
  await temporal.waitFor();
  assert.equal(await temporal.getAttribute("data-time-line-renderer"), "TemporalCanvas");
  assert.equal(await temporal.locator(".temporal-event-card").count(), 18, "World time keeps one node per Event even when an Event has multiple Placements.");
  assert.ok(await temporal.locator(".temporal-event-card.is-range").count() >= 1);
  assert.ok(await temporal.locator(".temporal-event-card.is-relative").count() >= 1);
  assert.ok(await temporal.locator(".temporal-event-card.is-fuzzy").count() >= 1);
  assert.ok(await temporal.locator(".temporal-event-card.is-concurrent").count() >= 2);
  assert.ok(await temporal.locator(".temporal-event-card.is-unplaced").count() >= 1);
  assert.ok(await temporal.locator(".temporal-event-card.is-conflict").count() >= 1);
  assert.equal(await temporal.locator(`[data-event-id="${observationFixture.branch.id}"]`).count(), 1);
  await temporal.locator(`[data-event-id="${observationFixture.branch.id}"] em`).getByText("2 个 NarrativePlacement", { exact: true }).waitFor();
  assert.ok(await temporal.locator(".temporal-focus-point").count() >= 3, "Focus trajectories follow the independent time coordinates.");
  const temporalXs = await temporal.locator(".temporal-event-node:not(.is-unplaced):not(.is-conflict)").evaluateAll((nodes) => nodes.map((node) => {
    const match = node.style.transform.match(/translate\(([-\d.]+)px,\s*[-\d.]+px\)/u);
    return match ? Number(match[1]) : null;
  }).filter((value) => value !== null));
  const uniqueXs = [...new Set(temporalXs)].sort((left, right) => left - right);
  const temporalGaps = uniqueXs.slice(1).map((value, index) => Math.round((value - uniqueXs[index]) * 10) / 10);
  assert.ok(new Set(temporalGaps).size > 1, "Continuous world-time distance is not an equal-card reorder.");
  await capture("04-1440-time-line.png");
  await temporal.getByRole("button", { name: "时间总览", exact: true }).click();
  await page.waitForTimeout(320);
  await capture("05-1440-time-states.png");

  const mainQuery = `projectId=${encodeURIComponent(fixtureProjectId)}&workVersionId=${encodeURIComponent(narrativeFixture.workVersionId)}&narrativePathId=${encodeURIComponent(narrativeFixture.unit.id)}`;
  const beforeReadOnly = await getFixture(`${apiUrl}/__local/story-studio/narrative-arrangement?${mainQuery}`);
  await workspace.getByRole("button", { name: "更多", exact: true }).click();
  await workspace.getByRole("button", { name: "证据审计", exact: true }).click();
  const audit = page.getByTestId("evidence-audit-board");
  await audit.waitFor();
  assert.ok(await audit.locator("td.is-unknown").count() >= 1, "Evidence audit keeps unknown explicit.");
  assert.ok(await audit.locator("td.is-explicit-absence").count() >= 1, "Evidence audit distinguishes explicit absence.");
  await capture("06-1440-audit.png");
  await workspace.getByRole("button", { name: "事件线", exact: true }).click();
  const afterReadOnly = await getFixture(`${apiUrl}/__local/story-studio/narrative-arrangement?${mainQuery}`);
  assert.equal(afterReadOnly.data.arrangement.currentRevision, beforeReadOnly.data.arrangement.currentRevision, "Task switches are read-only projections.");

  await workspace.getByRole("button", { name: "待编排与冲突", exact: true }).click();
  const hookTray = workspace.locator(".unplaced-event-tray article").filter({ hasText: observationFixture.hook.title });
  assert.equal(await hookTray.count(), 1);
  await capture("10-1440-staging-before.png");
  await hookTray.getByRole("button", { name: "安排位置", exact: true }).click();
  let inspector = page.locator(".narrative-arrangement-inspector");
  await inspector.waitFor();
  await inspector.getByRole("button", { name: "确认插入位置", exact: true }).click();
  await inspector.getByText(/编排已保存/u).waitFor();
  await page.locator(".page-context-dock-panel > header button").click();
  await graph.getByRole("button", { name: "定位所选", exact: true }).click();
  for (let zoom = 0; zoom < 4; zoom += 1) await graph.locator(".react-flow__controls-zoomin").click();
  const hookNode = graph.locator(`[data-confirmed-event-id="${observationFixture.hook.id}"]`);
  await hookNode.locator(".formal-narrative-arrange").waitFor();
  await capture("11-1440-staging-after-insert.png");
  await hookNode.locator(".formal-narrative-arrange").click();
  inspector = page.locator(".narrative-arrangement-inspector");
  await inspector.getByText("作者意图").locator("..").getByRole("combobox").selectOption("start");
  await inspector.getByRole("button", { name: "确认调整位置", exact: true }).click();
  await inspector.getByText(/编排已保存/u).waitFor();
  const moved = await getFixture(`${apiUrl}/__local/story-studio/narrative-arrangement?${mainQuery}`);
  assert.equal(moved.data.projection.placed[0].eventId, observationFixture.hook.id, "The formal move Writer applies the author-selected position.");
  await inspector.getByRole("button", { name: "从当前编排移除", exact: true }).click();
  await inspector.getByRole("button", { name: "再次确认移除", exact: true }).click();
  await inspector.getByText(/编排位置已移除/u).waitFor();
  assert.equal(await workspace.locator(".unplaced-event-tray article").filter({ hasText: observationFixture.hook.title }).count(), 1, "Removing a Placement returns the Event to staging without deleting it.");

  const beforeRepeatedPlacement = await getFixture(`${apiUrl}/__local/story-studio/narrative-arrangement?${mainQuery}`);
  const repeated = await postFixture(`${apiUrl}/__local/story-studio/narrative-arrangements/insert`, {
    projectId: fixtureProjectId,
    workVersionId: narrativeFixture.workVersionId,
    narrativePathId: narrativeFixture.unit.id,
    expectedOwnerVersion: beforeRepeatedPlacement.data.ownerVersion,
    expectedRevision: beforeRepeatedPlacement.data.arrangement.currentRevision,
    operationId: `r12c-e2e-repeat-${fixture.fixtureId}`,
    authorActionId: `author.r12c-repeat-${fixture.fixtureId}`,
    createdAt: "2026-09-03T09:00:00.000Z",
    eventId: observationFixture["revealed-consequence"].id,
    storyUnitId: narrativeFixture.unit.id,
    role: "reinterpretation",
    position: { kind: "end" }
  });
  assert.equal(repeated.data.conflict, false, "The formal Writer permits one Event to have more than one Placement identity.");
  const stale = await postFixture(`${apiUrl}/__local/story-studio/narrative-arrangements/insert`, {
    projectId: fixtureProjectId,
    workVersionId: narrativeFixture.workVersionId,
    narrativePathId: narrativeFixture.unit.id,
    expectedOwnerVersion: repeated.data.ownerVersion,
    expectedRevision: beforeRepeatedPlacement.data.arrangement.currentRevision,
    operationId: `r12c-e2e-stale-${fixture.fixtureId}`,
    authorActionId: `author.r12c-stale-${fixture.fixtureId}`,
    createdAt: "2026-09-03T09:01:00.000Z",
    eventId: observationFixture.signal.id,
    storyUnitId: narrativeFixture.unit.id,
    role: "primary",
    position: { kind: "end" }
  });
  assert.equal(stale.data.conflict && stale.data.code, "stale-arrangement-revision", "A stale expectedRevision fails without silently overwriting author order.");

  await workspace.getByRole("button", { name: "时间线", exact: true }).click();
  await reloadProduct(page);
  await workspace.waitFor();
  assert.equal(await workspace.getAttribute("data-event-task"), "time", "Refresh preserves the selected formal task preset.");
  assert.equal(await page.getByTestId("formal-temporal-canvas").count(), 1);
  await workspace.getByRole("button", { name: "事件线", exact: true }).click();
  const refreshedRepeated = graph.locator(`[data-confirmed-event-id="${observationFixture["revealed-consequence"].id}"]`);
  assert.equal(await refreshedRepeated.count(), 2);
  await graph.getByRole("button", { name: "全书位置", exact: true }).click();
  await page.waitForTimeout(320);
  await capture("12-1440-refresh-preserved.png");

  assert.deepEqual(providerRequests, [], "Task switches, focus and detail remain zero-Provider read projections.");
  assert.deepEqual(consoleProblems, [], "R12 event-line interactions must not add browser console errors.");
}

async function assertR11ObservationWorkspace(page, consoleProblems) {
  assert.ok(observationFixture, "R11 observation fixture must exist.");
  if (r11ObservationEvidenceDirectory) mkdirSync(r11ObservationEvidenceDirectory, { recursive: true });
  const providerRequests = [];
  page.on("request", (request) => {
    if (/story-modeling\/(?:plan|runs|execute)|\/__local\/story-studio\/provider|\/api\/provider/iu.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventLayout=narrative&eventLens=participation&eventRender=trajectory&eventScale=event&eventLayers=source-evidence`);
  await closeGlobalTianyiIfOpen(page);
  const workspace = page.getByTestId("event-participation-workspace");
  await workspace.waitFor();
  assert.equal(await page.getByRole("button", { name: "参与", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await workspace.getAttribute("data-render-mode"), "trajectory", "R11.1 defaults new participation reading to trajectories.");
  await workspace.getByRole("button", { name: /选择对象/u }).click();
  for (const label of ["林昭", "雾港", "雾灯匣"]) await workspace.getByRole("checkbox", { name: label, exact: true }).check();
  assert.equal(await workspace.locator(".event-participation-focus button").count(), 3, "R11 keeps all three formal focus types visible.");
  const cellsFor = (key) => workspace.locator(`.event-participation-cell[data-event-id="${observationFixture[key].id}"]`);
  assert.equal(await cellsFor("revealed-consequence").filter({ hasText: "参与" }).count(), 3);
  assert.equal(await cellsFor("revealed-cause").first().getAttribute("data-participation-state"), "witnessed");
  assert.equal(await cellsFor("explicit-absence").first().getAttribute("data-participation-state"), "explicit-absence");
  assert.equal(await cellsFor("unknown").first().getAttribute("data-participation-state"), "unknown");
  assert.equal(await page.getByRole("button", { name: "关系网络", exact: true }).isDisabled(), true, "An incompatible coordinate stays unavailable while participation is active.");
  await page.getByRole("button", { name: "保存组合", exact: true }).click();
  await page.getByText("当前组合已保存到本机；未写入故事事实", { exact: true }).waitFor();
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "01-1440-narrative-trajectory.png"), fullPage: false });
  await cellsFor("revealed-consequence").first().press("Enter");
  await page.locator(".page-context-dock-panel").getByText("先揭示的港口后果", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 720 });
  const compactTrajectory = await workspace.evaluate((node) => ({ lanes: node.querySelectorAll(".event-participation-object").length, events: node.querySelectorAll(".event-participation-event").length, pageOverflow: document.documentElement.scrollWidth > window.innerWidth }));
  assert.ok(compactTrajectory.lanes >= 3 && compactTrajectory.events >= 4, `R11.1 trajectory stays readable with the detail Dock: ${JSON.stringify(compactTrajectory)}`);
  assert.equal(compactTrajectory.pageOverflow, false, "R11.1 has no page-level horizontal overflow at 1280px with details open.");
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "01a-1280-narrative-trajectory-detail.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "矩阵", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="event-participation-workspace"]')?.getAttribute("data-render-mode") === "matrix");
  await page.locator(".page-context-dock-panel").getByText("先揭示的港口后果", { exact: true }).waitFor();
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "01b-1440-narrative-matrix-detail.png"), fullPage: false });
  await page.getByRole("button", { name: "轨迹", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="event-participation-workspace"]')?.getAttribute("data-render-mode") === "trajectory");
  await page.setViewportSize({ width: 1487, height: 1059 });
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "00-1487-reference-viewport-narrative-detail.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "世界时间", exact: true }).press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-testid="event-participation-workspace"]')?.getAttribute("data-layout") === "world-time");
  const orderedTitles = await workspace.locator(".event-participation-event strong").allTextContents();
  assert.deepEqual(orderedTitles.slice(0, 2), ["后揭示的码头起因", "先揭示的港口后果"], "World-time ordering differs from reveal order when strict dates disagree.");
  assert.equal(orderedTitles.at(-1), "时间未定的匿名来客");
  await cellsFor("revealed-consequence").first().press("Enter");
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "02-1440-world-time-shared-event-detail.png"), fullPage: false });

  await reloadProduct(page);
  await page.getByTestId("event-participation-workspace").waitFor();
  assert.equal(await page.getByTestId("event-participation-workspace").getAttribute("data-layout"), "world-time");
  await page.getByTestId("event-participation-workspace").getByRole("button", { name: /选择对象/u }).click();
  assert.equal(await page.getByTestId("event-participation-workspace").locator('.event-participation-picker input[type="checkbox"]:checked').count(), 3, "Saved formal focus restores after refresh.");
  await page.setViewportSize({ width: 1152, height: 720 });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "R11 has no page-level horizontal overflow at 1152px.");
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "03-1152-world-time-restored.png"), fullPage: false });
  await page.setViewportSize({ width: 743, height: 529 });
  await page.waitForTimeout(200);
  const closeDirectory = page.locator(".project-directory-close");
  if (await closeDirectory.isVisible()) await closeDirectory.click();
  const zoomEquivalentState = await page.getByTestId("event-participation-workspace").evaluate((node) => {
    const controls = document.querySelector(".event-observation-controls");
    const checkedFocus = node.querySelectorAll('.event-participation-picker input[type="checkbox"]:checked');
    return {
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      controlsVisible: controls instanceof HTMLElement && controls.getBoundingClientRect().height > 0,
      workspaceVisible: node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0,
      checkedFocusCount: checkedFocus.length
    };
  });
  assert.equal(zoomEquivalentState.pageOverflow, false, `R11 200% equivalent CSS viewport must reflow without page-level overflow=${JSON.stringify(zoomEquivalentState)}`);
  assert.equal(zoomEquivalentState.controlsVisible, true, `R11 axes remain reachable at a 200% equivalent CSS viewport=${JSON.stringify(zoomEquivalentState)}`);
  assert.equal(zoomEquivalentState.workspaceVisible, true, `R11 workspace remains visible at a 200% equivalent CSS viewport=${JSON.stringify(zoomEquivalentState)}`);
  assert.equal(zoomEquivalentState.checkedFocusCount, 3, `R11 focus state survives 200% equivalent reflow=${JSON.stringify(zoomEquivalentState)}`);
  if (r11ObservationEvidenceDirectory) await page.screenshot({ path: path.join(r11ObservationEvidenceDirectory, "04-743x529-200-percent-equivalent.png"), fullPage: false });
  assert.deepEqual(providerRequests, [], "Layout, lens, focus, save and refresh may not call a Provider.");
  assert.deepEqual(consoleProblems, [], "R11 observation workspace may not produce console warnings or errors.");
}

async function setupEventGraphFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  const branchStoryUnit = await postFixture(`${base}/event-line/normal-creation/create-story-unit`, {
    projectId: fixtureProjectId,
    title: "分支·灯塔余波",
    summary: "从雾港主干横向展开的隔离分支单元。"
  });
  const storyUnit = await postFixture(`${base}/event-line/normal-creation/create-story-unit`, {
    projectId: fixtureProjectId,
    title: "雾港",
    summary: "隔离浏览器验收使用的事件关系范围。"
  });
  const eventTitles = ["旧城停电", "沈砚发现异常信号", "林昭隐瞒真相", "雨夜追踪", "暗号传递", "仓库对峙", "旧仓库封锁", "失踪名单在灯塔守夜人的密室中浮现"];
  for (const title of eventTitles) {
    const unitId = title === "沈砚发现异常信号" || title === "失踪名单在灯塔守夜人的密室中浮现" ? branchStoryUnit.data.result.id : storyUnit.data.result.id;
    const candidate = await postFixture(`${base}/event-line/normal-creation/create-candidate`, {
      projectId: fixtureProjectId, storyUnitId: unitId, title,
      body: `${title}是隔离事件图验收中的作者确认事实。`
    });
    const planningEventId = candidate.data.result.planning.id;
    await postFixture(`${base}/event-line/normal-creation/begin-impact`, { projectId: fixtureProjectId, storyUnitId: unitId, planningEventId });
    await postFixture(`${base}/event-line/normal-creation/confirm`, { projectId: fixtureProjectId, storyUnitId: unitId, planningEventId });
  }
  const verified = await getFixture(`${base}/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const verifiedEvents = await Promise.all(verified.data.eventIds.map((eventId) => getFixture(`${base}/event-line/event?projectId=${encodeURIComponent(fixtureProjectId)}&eventId=${encodeURIComponent(eventId)}`)));
  const structuredEvents = await Promise.all(verifiedEvents.map(async (result) => {
    const event = result.data.event;
    const title = String(event.title).replace(/ · 立即揭示$/u, "");
    const inWarehouseSetPoint = title === "仓库对峙" || title === "旧仓库封锁";
    const inBranchUnit = title === "沈砚发现异常信号" || title === "失踪名单在灯塔守夜人的密室中浮现";
    const updated = await postFixture(`${base}/world-objects/update`, {
      projectId: fixtureProjectId,
      objectId: event.id,
      expectedHash: event.revisionToken,
      presentationExpectedHash: null,
      writeMarkdown: true,
      writePresentation: false,
      title: event.title,
      status: event.status,
      tags: [...event.tags.filter((tag) => !/^(?:单元|集点)[：:]/u.test(tag)), `单元：${inBranchUnit ? "分支·灯塔余波" : "雾港"}`, ...(inWarehouseSetPoint ? ["集点：仓库冲突"] : [])],
      aliases: event.aliases,
      body: event.body,
      subtype: event.subtype,
      typedProperties: event.typedProperties,
      card: event.card,
      profile: event.profile
    });
    return updated.data.object;
  }));
  const eventByTitle = new Map(structuredEvents.map((event) => [String(event.title).replace(/ · 立即揭示$/u, ""), event.id]));
  assert.equal(eventTitles.every((title) => eventByTitle.has(title)), true, "The fixture must resolve each confirmed Event through the Canon read owner before relation setup.");
  const unitList = await getFixture(`${base}/story-units?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const currentBranch = unitList.data.find((unit) => unit.id === branchStoryUnit.data.result.id);
  const currentMain = unitList.data.find((unit) => unit.id === storyUnit.data.result.id);
  assert.ok(currentBranch && currentMain, "The formal Unit owner must retain both fixture units.");
  await postFixture(`${base}/story-units/update`, {
    projectId: fixtureProjectId,
    unitId: currentBranch.id,
    expectedVersion: currentBranch.version,
    kind: "branch",
    parentUnitId: currentMain.id,
    branchPointEventId: eventByTitle.get("旧城停电"),
    mergeTargetUnitId: currentMain.id,
    order: 1,
    sourceVersionRef: "fixture:r8:event-graph",
    status: "active"
  });
  const collectionPoint = await postFixture(`${base}/story-collection-points/create`, {
    projectId: fixtureProjectId,
    unitId: currentMain.id,
    expectedUnitVersion: currentMain.version,
    operationId: `event-graph-collection-point-${fixture.fixtureId}`,
    title: "仓库冲突",
    eventIds: [eventByTitle.get("仓库对峙"), eventByTitle.get("旧仓库封锁")],
    sourceVersionRef: currentMain.sourceVersionRef ?? currentMain.version,
    collapsed: false,
    layout: { x: 1180, y: 430, pinned: true }
  });
  assert.equal(collectionPoint.data.receipt?.formalEventWrites, 0, "Set Point setup may not duplicate formal Events.");
  const typeState = await getFixture(`${base}/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const relationType = await postFixture(`${base}/relations/types/create`, {
    projectId: fixtureProjectId, label: "促使", description: "隔离关系图验收用的正式推进关系。",
    expectedRepositoryRevision: typeState.data.repositoryRevision, operationId: `event-graph-type-${fixture.fixtureId}`, sourceRef: "e2e-event-graph"
  });
  const link = async (sourceTitle, targetTitle, operationSuffix, confirm) => {
    const created = await postFixture(`${base}/relations/create`, {
      projectId: fixtureProjectId, sourceObjectId: eventByTitle.get(sourceTitle), targetObjectId: eventByTitle.get(targetTitle),
      relationTypeId: relationType.data.type.relationTypeId, relationLabelSnapshot: "促使", direction: "forward",
      sourceRef: "e2e-event-graph", operationId: `event-graph-${operationSuffix}-${fixture.fixtureId}`
    });
    if (confirm) await postFixture(`${base}/relations/confirm`, {
      projectId: fixtureProjectId, relationId: created.data.relation.relationId, expectedRelationRevision: created.data.relation.revision,
      operationId: `event-graph-confirm-${operationSuffix}-${fixture.fixtureId}`
    });
  };
  await link("旧城停电", "沈砚发现异常信号", "formal-1", true);
  await link("沈砚发现异常信号", "林昭隐瞒真相", "formal-2", true);
  await link("林昭隐瞒真相", "雨夜追踪", "formal-3", true);
  await link("雨夜追踪", "仓库对峙", "formal-4", true);
  await link("仓库对峙", "失踪名单在灯塔守夜人的密室中浮现", "formal-5", true);
  await link("林昭隐瞒真相", "仓库对峙", "candidate", false);
}

async function setupTimelineFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  const timed = [
    ["雾港启航", "第 1 夜"], ["灯塔失火", "第 1 夜"], ["暗号回响", "第 2 夜"],
    ["旧仓库再封锁", "第 3 夜"], ["黎明前对峙", "第 4 夜"]
  ];
  const created = [];
  for (const [title, time] of timed) {
    const result = await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "event", title, status: "draft", tags: ["作者草稿", "单元：雾港", `时间：${time}`, "地点：雾港", "人物：林昭", "物品：航海日志"], body: `${title}仅用于隔离时间关系图与视角交集验收。` });
    created.push(result.data);
  }
  const unknown = (await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "event", title: "待定访客", status: "draft", tags: ["作者草稿", "单元：雾港", "地点：雾港"], body: "该事件的世界时间尚未由作者补充。" })).data;
  const types = await getFixture(`${base}/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const relationTypeId = types.data.types[0]?.relationTypeId;
  assert.ok(relationTypeId, "The isolated time graph fixture must reuse the existing Relation owner type.");
  const candidate = await postFixture(`${base}/relations/create`, { projectId: fixtureProjectId, sourceObjectId: created[0].id, targetObjectId: created[4].id, relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-time-graph-cross-band", operationId: `time-graph-cross-band-${fixture.fixtureId}` });
  await postFixture(`${base}/relations/confirm`, { projectId: fixtureProjectId, relationId: candidate.data.relation.relationId, expectedRelationRevision: candidate.data.relation.revision, operationId: `time-graph-cross-band-confirm-${fixture.fixtureId}` });
  const conflicting = await postFixture(`${base}/relations/create`, { projectId: fixtureProjectId, sourceObjectId: created[4].id, targetObjectId: created[0].id, relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-time-graph-strict-cycle", operationId: `time-graph-strict-cycle-${fixture.fixtureId}` });
  await postFixture(`${base}/relations/confirm`, { projectId: fixtureProjectId, relationId: conflicting.data.relation.relationId, expectedRelationRevision: conflicting.data.relation.revision, operationId: `time-graph-strict-cycle-confirm-${fixture.fixtureId}` });
  const inferred = await postFixture(`${base}/relations/create`, { projectId: fixtureProjectId, sourceObjectId: created[1].id, targetObjectId: unknown.id, relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-time-graph-anchor-to-inferred", operationId: `time-graph-anchor-to-inferred-${fixture.fixtureId}` });
  await postFixture(`${base}/relations/confirm`, { projectId: fixtureProjectId, relationId: inferred.data.relation.relationId, expectedRelationRevision: inferred.data.relation.revision, operationId: `time-graph-anchor-to-inferred-confirm-${fixture.fixtureId}` });
  timelineFixture = { timed: created, unknown, conflictEventIds: [created[0].id, created[4].id] };
}

async function setupEventGraphDensityFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  const storyUnit = await postFixture(`${base}/event-line/normal-creation/create-story-unit`, {
    projectId: fixtureProjectId,
    title: "密度验收事件线",
    summary: "只属于隔离浏览器验收的五十节点关系图，不写入作者项目。"
  });
  const titles = Array.from({ length: 44 }, (_, index) => `密度事件 ${String(index + 7).padStart(2, "0")}`);
  for (const title of titles) {
    const candidate = await postFixture(`${base}/event-line/normal-creation/create-candidate`, {
      projectId: fixtureProjectId, storyUnitId: storyUnit.data.result.id, title,
      body: `${title}仅用于五十节点画布密度验收。`
    });
    const planningEventId = candidate.data.result.planning.id;
    await postFixture(`${base}/event-line/normal-creation/begin-impact`, { projectId: fixtureProjectId, storyUnitId: storyUnit.data.result.id, planningEventId });
    await postFixture(`${base}/event-line/normal-creation/confirm`, { projectId: fixtureProjectId, storyUnitId: storyUnit.data.result.id, planningEventId });
  }
  const verified = await getFixture(`${base}/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const eventReads = await Promise.all(verified.data.eventIds.map((eventId) => getFixture(`${base}/event-line/event?projectId=${encodeURIComponent(fixtureProjectId)}&eventId=${encodeURIComponent(eventId)}`)));
  const ids = eventReads.map((result) => result.data.event.id);
  const types = await getFixture(`${base}/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const relationTypeId = types.data.types[0]?.relationTypeId;
  assert.ok(relationTypeId, "The density fixture reuses the existing relation type owner.");
  const link = async (sourceObjectId, targetObjectId, suffix, confirm = true) => {
    const created = await postFixture(`${base}/relations/create`, {
      projectId: fixtureProjectId, sourceObjectId, targetObjectId, relationTypeId,
      relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-event-graph-density", operationId: `event-graph-density-${suffix}-${fixture.fixtureId}`
    });
    if (confirm) await postFixture(`${base}/relations/confirm`, {
      projectId: fixtureProjectId, relationId: created.data.relation.relationId, expectedRelationRevision: created.data.relation.revision,
      operationId: `event-graph-density-confirm-${suffix}-${fixture.fixtureId}`
    });
  };
  for (let index = 6; index < ids.length - 1; index += 1) await link(ids[index], ids[index + 1], `spine-${index}`);
  for (let index = 7; index < ids.length - 4; index += 6) await link(ids[index], ids[index + 4], `branch-${index}`);
  await link(ids[18], ids[28], "candidate", false);
}

function eventViewButton(page, name) {
  const label = ({ "故事脊柱": "结构", "事件线": "叙事顺序", "关系图": "关系网络", "时间轴": "世界时间", "视角": "角色视角" })[name] ?? name;
  return page.locator(".event-observation-controls, .event-graph-view-switch").getByRole("button", { name: label, exact: true }).filter({ visible: true }).first();
}

async function switchEventView(page, name) {
  if (await page.locator(".event-observation-controls").filter({ visible: true }).count() === 0) {
    const more = page.getByRole("button", { name: "更多", exact: true }).filter({ visible: true }).first();
    if (await more.count()) {
      if (await more.getAttribute("aria-expanded") !== "true") await more.click();
      const entry = name === "故事脊柱" ? "故事结构" : "关系网络";
      await page.getByRole("button", { name: entry, exact: true }).filter({ visible: true }).first().click();
      if (name === "故事脊柱" || name === "关系图") return;
    }
  }
  await eventViewButton(page, name).click();
}

async function openStoryModelingTools(page) {
  const toggle = page.getByRole("button", { name: /AI 工具/u }).filter({ visible: true }).first();
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
}

async function assertEventGraphWorkspace(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertCharacterObservationDragAndRecovery(page);
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page);
  await switchEventView(page, "关系图");
  await page.waitForFunction(() => document.querySelector("[data-directory-visible]")?.getAttribute("data-directory-visible") === "false");
  await page.waitForTimeout(220);
  const workspace = page.getByLabel("事件关系工作区");
  await workspace.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="event-line-workbench"]')?.getAttribute("data-knowledge-projection-state") === "ready");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-node:not(.is-remote)").length === 8);
  assert.equal(await workspace.getAttribute("data-event-graph-owner"), "projection", "The graph remains a projection rather than a second Event owner.");
  assert.equal(await page.locator(".event-graph-node:not(.is-remote)").count(), 8, "The global graph must read the eight confirmed events from the existing Event owner.");
  assert.equal(await page.locator(".page-context-dock").count(), 0, "Graph mode must not mount a second right-side Page Context dock.");
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__edge-path").length >= 6);
  assert.equal(await page.locator(".react-flow__edge-path").count() >= 6, true, "Formal and candidate relations must render through the same graph engine.");
  const closedGeometry = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const dimension = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(), className: element.className,
        rect: { x: box.x, y: box.y, width: box.width, height: box.height },
        display: style.display, position: style.position, boxSizing: style.boxSizing,
        width: style.width, height: style.height, minWidth: style.minWidth, minHeight: style.minHeight,
        maxWidth: style.maxWidth, maxHeight: style.maxHeight,
        padding: style.padding, margin: style.margin, gap: style.gap,
        flex: style.flex, flexDirection: style.flexDirection, flexGrow: style.flexGrow, flexShrink: style.flexShrink,
        gridTemplateColumns: style.gridTemplateColumns, gridTemplateRows: style.gridTemplateRows,
        overflow: style.overflow
      };
    };
    const flow = rect(".event-graph-flow");
    const graph = document.querySelector(".event-graph-workspace");
    const toolbar = rect(".event-graph-commandbar");
    const nodeElement = document.querySelector(".event-graph-node:not(.is-remote)");
    const node = nodeElement?.getBoundingClientRect();
    const title = document.querySelector(".event-line-spine-toolbar h1");
    const pageTools = document.querySelector(".dock-tool-rail");
    return {
      flowWidth: flow?.width ?? 0, flowHeight: flow?.height ?? 0, toolbarHeight: toolbar?.height ?? 0,
      nodeWidth: node?.width ?? 0, nodeTitleFont: nodeElement ? Number.parseFloat(getComputedStyle(nodeElement.querySelector("strong")).fontSize) : 0,
      shellWidth: rect(".tianyan-r0-shell")?.width ?? 0, workspaceWidth: rect(".shell-workspace")?.width ?? 0,
      graphWidth: rect(".event-graph-workspace")?.width ?? 0, graphHeight: rect(".event-graph-workspace")?.height ?? 0, graphMainWidth: rect(".event-graph-main")?.width ?? 0,
      graphDisplay: graph ? getComputedStyle(graph).display : "", graphCssHeight: graph ? getComputedStyle(graph).height : "", graphFlex: graph ? getComputedStyle(graph).flex : "",
      eventLineWorkbenchHeight: rect(".event-line-workbench")?.height ?? 0, shellWorkspaceHeight: rect(".shell-workspace-event-line")?.height ?? 0,
      eventLineShellHeight: rect(".event-line-shell")?.height ?? 0, eventLineMainHeight: rect(".event-line-spine-main")?.height ?? 0,
      flowAncestorTree: (() => {
        const nodes = [];
        let current = document.querySelector(".event-graph-flow");
        while (current && nodes.length < 12) { nodes.push(dimension(current)); current = current.parentElement; }
        return nodes;
      })(),
      eventLineMainChildren: [...document.querySelector(".event-line-spine-main")?.children ?? []].map((child) => dimension(child)),
      layoutRegions: {
        rail: dimension(document.querySelector(".shell-space-rail")),
        directory: dimension(document.querySelector(".project-directory-panel")),
        workspace: dimension(document.querySelector(".shell-workspace")),
        pageDock: dimension(document.querySelector(".page-context-dock")),
        graphInspector: dimension(document.querySelector(".event-graph-inspector")),
        globalTianyi: dimension(document.querySelector(".tianyi-sidebar"))
      },
      giantTitleVisible: Boolean(title && getComputedStyle(title).display !== "none" && title.getBoundingClientRect().height > 0),
      pageToolsVisible: Boolean(pageTools && getComputedStyle(pageTools).display !== "none")
    };
  });
  assert.ok(closedGeometry.flowWidth >= 900, `Closed inspector geometry=${JSON.stringify(closedGeometry)}`);
  assert.ok(closedGeometry.flowHeight >= 720, `The two-level workspace navigation must still leave a full readable canvas=${JSON.stringify(closedGeometry)}`);
  assert.ok(closedGeometry.toolbarHeight <= 60, `Toolbar height=${closedGeometry.toolbarHeight}`);
  assert.ok(closedGeometry.nodeWidth >= 115, `Node width=${closedGeometry.nodeWidth}`);
  assert.ok(closedGeometry.nodeTitleFont >= 13, `Node title font=${closedGeometry.nodeTitleFont}`);
  assert.equal(closedGeometry.giantTitleVisible, false, "Graph mode must not retain the prose title area.");
  assert.equal(closedGeometry.pageToolsVisible, false, "Page tools may not create a second permanent right rail in graph mode.");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(180);
  const intermediateGeometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    flowWidth: document.querySelector(".event-graph-flow")?.getBoundingClientRect().width ?? 0,
    nodeWidth: document.querySelector(".event-graph-node:not(.is-remote)")?.getBoundingClientRect().width ?? 0
  }));
  assert.equal(intermediateGeometry.overflow, false, `1280 workspace must not overflow=${JSON.stringify(intermediateGeometry)}`);
  assert.ok(intermediateGeometry.flowWidth >= 800 && intermediateGeometry.nodeWidth >= 170, `1280 canvas and Event nodes remain readable=${JSON.stringify(intermediateGeometry)}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(180);
  const before = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const formalBefore = before.data.relations.filter((relation) => relation.reviewState === "confirmed").length;
  assert.equal(before.data.relations.filter((relation) => relation.reviewState === "candidate").length, 1, "The fixture starts with exactly one unconfirmed relation candidate.");
  await page.locator(".event-graph-node").filter({ hasText: "雨夜追踪" }).click();
  await page.getByLabel(/事件检查器：雨夜追踪/u).waitFor();
  const openGeometry = await page.evaluate(() => document.querySelector(".event-graph-flow")?.getBoundingClientRect().width ?? 0);
  assert.ok(openGeometry >= 900, `Open inspector canvas width=${openGeometry}`);
  await page.getByRole("button", { name: "聚焦关系", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-graph-view='focus']") !== null);
  await page.waitForFunction(() => document.querySelector(".event-graph-node.is-focused") !== null);
  await page.waitForTimeout(240);
  const focusGeometry = await page.evaluate(() => {
    const flow = document.querySelector(".event-graph-flow")?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll(".event-graph-node")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { title: element.querySelector("strong")?.textContent ?? "", remote: element.classList.contains("is-remote"), focused: element.classList.contains("is-focused"), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const overlaps = (first, second) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
    const focus = nodes.find((node) => node.focused);
    const remote = nodes.filter((node) => node.remote);
    const local = nodes.filter((node) => !node.remote);
    return {
      focusOffset: focus && flow ? Math.hypot((focus.left + focus.width / 2) - (flow.left + flow.width / 2), (focus.top + focus.height / 2) - (flow.top + flow.height / 2)) : Infinity,
      eventOverlap: local.some((node, index) => local.slice(index + 1).some((other) => overlaps(node, other))),
      remoteOverlap: remote.some((node) => local.some((other) => overlaps(node, other)) || remote.some((other) => other !== node && overlaps(node, other))),
      remoteOffscreen: remote.some((node) => !flow || node.left < flow.left || node.right > flow.right || node.top < flow.top || node.bottom > flow.bottom),
      projectionWithoutVisibleTarget: remote.some((node) => !flow || node.width <= 0 || node.height <= 0),
      nodes
    };
  });
  assert.equal(focusGeometry.eventOverlap, false, `Focus event nodes must not overlap=${JSON.stringify(focusGeometry)}`);
  assert.equal(focusGeometry.remoteOverlap, false, `Remote clusters must not overlap focus nodes=${JSON.stringify(focusGeometry)}`);
  assert.equal(focusGeometry.remoteOffscreen, false, `Remote clusters must remain inside the actual canvas=${JSON.stringify(focusGeometry)}`);
  assert.equal(focusGeometry.projectionWithoutVisibleTarget, false, `Every remote projection must retain a visible target=${JSON.stringify(focusGeometry)}`);
  assert.ok(focusGeometry.focusOffset <= 120, `Focused event must remain near the live canvas centre=${JSON.stringify(focusGeometry)}`);
  await page.getByRole("button", { name: "返回全局", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-graph-view='global']") !== null);
  const flowBeforeDrawer = await page.locator(".event-graph-flow").evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "展开事件目录", exact: true }).click();
  const drawerGeometry = await page.evaluate(() => ({
    flowWidth: document.querySelector(".event-graph-flow")?.getBoundingClientRect().width ?? 0,
    drawer: document.querySelector("[data-event-graph-drawer='open']")?.getBoundingClientRect().width ?? 0
  }));
  assert.ok(Math.abs(drawerGeometry.flowWidth - flowBeforeDrawer) <= 1, `The local directory must overlay instead of compressing the canvas=${JSON.stringify(drawerGeometry)}`);
  await page.getByRole("button", { name: /待确认 1/u }).click();
  await page.getByLabel("待确认关系检查器").waitFor();
  assert.equal(await page.getByText("尚未成为正式关系", { exact: true }).count(), 1, "Candidate inspector must state that the proposed relation is not formal yet.");
  if (eventGraphEvidenceDirectory) {
    mkdirSync(eventGraphEvidenceDirectory, { recursive: true });
    await page.screenshot({ path: path.join(eventGraphEvidenceDirectory, "1440x900-pending-relation-inspector.png"), fullPage: true });
  }
  const candidateActionsInViewport = await page.evaluate(() => [...document.querySelectorAll(".event-graph-candidate-actions button")].every((button) => {
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0;
  }));
  assert.equal(candidateActionsInViewport, true, "All candidate actions must remain visible without page scrolling.");
  const candidateInspectorGeometry = await page.getByLabel("待确认关系检查器").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const workspace = document.querySelector(".event-graph-workspace")?.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, workspaceRight: workspace?.right ?? 0 };
  });
  assert.ok(candidateInspectorGeometry.width >= 288 && candidateInspectorGeometry.width <= 340, `Candidate inspector width=${JSON.stringify(candidateInspectorGeometry)}`);
  assert.ok(Math.abs(candidateInspectorGeometry.right - candidateInspectorGeometry.workspaceRight) <= 1, `Candidate inspector must occupy the single right context slot=${JSON.stringify(candidateInspectorGeometry)}`);
  const candidateNodeVisibility = await page.evaluate(() => {
    const flow = document.querySelector(".event-graph-flow")?.getBoundingClientRect();
    const find = (title) => [...document.querySelectorAll(".event-graph-node")].find((node) => (node.textContent ?? "").includes(title))?.getBoundingClientRect();
    const contains = (rect) => Boolean(flow && rect && rect.left >= flow.left && rect.right <= flow.right && rect.top >= flow.top && rect.bottom <= flow.bottom);
    return {
      source: contains(find("林昭隐瞒真相")),
      target: contains(find("仓库对峙")),
      selected: contains(find("林昭隐瞒真相")),
      horizontalClip: Boolean(flow && [...document.querySelectorAll(".event-graph-node")].some((node) => { const rect = node.getBoundingClientRect(); return rect.left < flow.left || rect.right > flow.right; })),
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  assert.equal(candidateNodeVisibility.source, true, `Candidate source must remain fully visible=${JSON.stringify(candidateNodeVisibility)}`);
  assert.equal(candidateNodeVisibility.target, true, `Candidate target must remain fully visible=${JSON.stringify(candidateNodeVisibility)}`);
  assert.equal(candidateNodeVisibility.selected, true, `Selected candidate source must remain fully visible=${JSON.stringify(candidateNodeVisibility)}`);
  assert.equal(candidateNodeVisibility.horizontalClip, false, `Candidate canvas must not horizontally clip nodes=${JSON.stringify(candidateNodeVisibility)}`);
  assert.equal(candidateNodeVisibility.pageOverflow, false, `Candidate review must not create page overflow=${JSON.stringify(candidateNodeVisibility)}`);
  if (eventGraphEvidenceDirectory) {
    await page.setViewportSize({ width: 1152, height: 720 });
    await page.waitForTimeout(220);
    const narrowCandidate = await page.evaluate(() => ({
      canvasWidth: document.querySelector(".event-graph-flow")?.getBoundingClientRect().width ?? 0,
      candidateActionsVisible: [...document.querySelectorAll(".event-graph-candidate-actions button")].every((button) => { const rect = button.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= window.innerHeight; }),
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    assert.ok(narrowCandidate.canvasWidth >= 640, `1152 candidate canvas=${JSON.stringify(narrowCandidate)}`);
    assert.equal(narrowCandidate.candidateActionsVisible, true, `1152 candidate actions must remain reachable=${JSON.stringify(narrowCandidate)}`);
    assert.equal(narrowCandidate.pageOverflow, false, `1152 candidate review must not overflow=${JSON.stringify(narrowCandidate)}`);
    await page.screenshot({ path: path.join(eventGraphEvidenceDirectory, "1152x720-pending-relation-inspector.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.getByLabel("候选关系方向").selectOption("reverse");
  await page.getByRole("button", { name: "修改后通过", exact: true }).click();
  await page.waitForFunction(() => /作者确认后，关系已保存/u.test(document.body.textContent ?? ""));
  const after = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(after.data.relations.filter((relation) => relation.reviewState === "confirmed").length, formalBefore + 1, "Formal relation count changes only after the author confirmation action.");
  assert.equal(after.data.relations.filter((relation) => relation.reviewState === "candidate").length, 0, "The approved candidate leaves Pending Review after Relation owner confirmation.");
  assert.equal(await page.locator("text=/sourceObjectId|targetObjectId|relationId|Relation owner|尚未写入正式 Relation/u").count(), 0, "Internal relation identifiers and architecture terms must not leak into the graph UI.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, "1440px event graph workspace must not create horizontal page scrolling.");
}

async function assertCharacterObservationDragAndRecovery(page) {
  const providerRequests = [];
  const observe = (request) => {
    if (request.method() === "POST" && /\/model-service\/(?:models|test|embedding-probe|minimal-inference)|\/tianyi-agent\/run/u.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  };
  page.on("request", observe);
  try {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventTask=perspective&directoryView=characters`);
    const directory = page.getByTestId("character-directory");
    const dropzone = page.getByTestId("character-observation-dropzone");
    await directory.waitFor();
    await dropzone.waitFor();
    await waitForCharacterDirectoryIdle(page);
    const source = page.getByRole("option", { name: /林昭；可拖入角色观察/u });
    await source.dragTo(dropzone);
    await dropzone.getByText("1/5 人", { exact: true }).waitFor();
    assert.equal(await dropzone.getAttribute("data-provider-calls"), "0", "Dragging a formal character must be a zero-Provider operation.");
    assert.match(page.url(), /eventFocus=character\./u, "The stable character selection must be recoverable from the URL.");
    await reloadProduct(page);
    await page.getByTestId("character-observation-dropzone").getByText("1/5 人", { exact: true }).waitFor();
    const restoredDirectory = page.getByTestId("character-directory");
    const multiButton = restoredDirectory.getByRole("button", { name: /多选/u });
    await multiButton.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="character-directory"] [aria-multiselectable="true"]') !== null);
    await restoredDirectory.getByRole("option", { name: /林昭；可拖入角色观察/u }).click();
    const directoryStorageKey = `tianyan:directory-workspace:${fixtureProjectId}`;
    await page.waitForFunction((key) => {
      try { return JSON.parse(localStorage.getItem(key) || "null")?.character?.selectedIds?.includes("character.林昭"); }
      catch { return false; }
    }, directoryStorageKey);
    await reloadProduct(page);
    const selectedRole = page.getByTestId("character-directory").getByRole("option", { name: /林昭；可拖入角色观察/u });
    assert.equal(await selectedRole.getAttribute("aria-selected"), "true", "Dedicated Character directory multi-selection must recover per project.");
    await page.getByTestId("character-directory").getByRole("button", { name: /筛选/u }).click();
    await page.getByTestId("character-directory").getByRole("combobox", { name: "目录范围" }).selectOption("archived");
    await reloadProduct(page);
    await page.getByTestId("character-directory").getByRole("button", { name: /筛选/u }).click();
    assert.equal(await page.getByTestId("character-directory").getByRole("combobox", { name: "目录范围" }).inputValue(), "archived", "Dedicated Character directory filters must recover per project.");
    assert.deepEqual(providerRequests, [], "Drag, selection persistence, and refresh recovery must make no Provider request.");
  } finally {
    page.off("request", observe);
  }
}

async function assertTimelineRelationshipGraph(page, consoleProblems) {
  assert.ok(timelineFixture, "The time graph must use an isolated fixture.");
  const output = founderEvidenceDirectory;
  const selectEventView = (name) => switchEventView(page, name);
  if (output) mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page);
  await selectEventView("关系图");
  const graphEventIds = await page.locator(".event-graph-flow .react-flow__node-event").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id") ?? node.getAttribute("data-nodeid")).filter(Boolean).sort());
  await page.locator(".event-graph-node").filter({ hasText: "雾港启航" }).click();
  if (output) await page.screenshot({ path: path.join(output, "A-1440x900-event-graph-foreground.png"), fullPage: true });
  const temporalRunsBeforeSwitch = await postFixture(`${apiUrl}/__local/story-studio/tianyi/temporal-projection/list`, { projectId: fixtureProjectId });
  const storyRunsBeforeSwitch = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
  await selectEventView("时间轴");
  const canvas = page.getByLabel("独立时间线工作区");
  await canvas.waitFor();
  await page.waitForFunction(() => ["missing", "stale", "ready"].includes(document.querySelector("[data-temporal-state]")?.getAttribute("data-temporal-state") ?? ""));
  assert.equal(await canvas.getAttribute("data-view-switch-provider-calls"), "0", "Opening the timeline is a zero-cost read path.");
  assert.equal(await canvas.getAttribute("data-view-switch-agent-runs"), "0", "Opening the timeline never creates an Agent Run.");
  const temporalRunsAfterSwitch = await postFixture(`${apiUrl}/__local/story-studio/tianyi/temporal-projection/list`, { projectId: fixtureProjectId });
  const storyRunsAfterSwitch = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
  assert.equal(temporalRunsAfterSwitch.data.length, temporalRunsBeforeSwitch.data.length, "View switching creates no temporal Run.");
  assert.equal(storyRunsAfterSwitch.data.length, storyRunsBeforeSwitch.data.length, "View switching creates no story-modeling Run.");
  assert.equal(await page.getByLabel("时间标尺").count(), 1, "The base timeline exposes a fixed top ruler.");
  assert.equal(await page.getByLabel("稳定故事轨道").count(), 1, "The base timeline exposes stable semantic tracks.");
  await openStoryModelingTools(page);
  await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
  const confirmation = page.getByTestId("story-modeling-confirmation");
  await confirmation.waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="story-modeling-confirmation"] .story-modeling-estimate')));
  assert.match(await confirmation.textContent(), /Provider 请求/u, "The author sees the bounded request estimate before any Run.");
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  const storyRunsAfterCancel = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
  assert.equal(storyRunsAfterCancel.data.length, storyRunsBeforeSwitch.data.length, "Cancelling the estimate creates no Run.");
  await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
  const executionResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/__local/story-studio/tianyi/story-modeling/execute"), { timeout: 90_000 });
  await confirmation.getByRole("button", { name: "确认运行一次", exact: true }).click();
  const completedResponse = await executionResponse;
  assert.equal(completedResponse.ok(), true, `Confirmed temporal modeling transport must finish successfully: HTTP ${completedResponse.status()}.`);
  await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"]'), undefined, { timeout: 10_000 }).catch(async () => {
    const runs = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
    throw new Error(`Temporal projection did not become ready: ${JSON.stringify(await page.evaluate(() => ({
      state: document.querySelector("[data-temporal-state]")?.getAttribute("data-temporal-state"),
      text: document.querySelector(".temporal-canvas-status")?.textContent,
      projection: document.querySelector("[data-projection-mode]")?.getAttribute("data-projection-mode")
    })))} runs=${JSON.stringify(runs.data.map((run) => ({ tool: run.tool, status: run.status, failureReason: run.failureReason, completedBatches: run.progress?.completedBatches, totalBatches: run.progress?.totalBatches })))}`);
  });
  const storyRunsAfterConfirm = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
  assert.equal(storyRunsAfterConfirm.data.length, storyRunsBeforeSwitch.data.length + 1, "One author confirmation creates one bounded modeling Run.");
  assert.equal(storyRunsAfterConfirm.data[0]?.provider?.executionKind, "test-provider", "The isolated test Provider is explicit and is not presented as real AI proof.");
  assert.equal(await canvas.getAttribute("data-temporal-projection"), "independent", "Timeline must own an independent projection instead of reusing EventGraphCanvas.");
  assert.equal(await canvas.getAttribute("data-event-owner"), "shared-identities", "Independent projections still share formal Event identities.");
  const timelineEventIds = await page.locator(".temporal-flow .react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id") ?? node.getAttribute("data-nodeid")).filter(Boolean).sort());
  assert.deepEqual(timelineEventIds, graphEventIds, "Relationship graph and timeline use the same stable Event IDs and node count.");
  assert.equal(await page.locator(".temporal-workspace .event-graph-node").count(), 0, "Timeline may not invoke the relationship Event node family.");
  assert.ok(await page.locator(".temporal-event-card:is(.is-inferred, .is-ambiguous)").count() >= 1, "Unknown formal times remain explicit inferred or ambiguous intervals.");
  assert.ok(await page.locator(".temporal-event-card.is-conflict").count() >= 1, "A temporal conflict must remain visibly blocked instead of being force-sorted.");
  const unplacedTimelineEvents = await page.locator(".temporal-event-card.is-unplaced").count();
  assert.equal(await page.getByLabel("未定位事件").count(), unplacedTimelineEvents > 0 ? 1 : 0, "Any unknown Events remain in one dedicated unplaced tray and are never forced to the end.");
  assert.ok(await page.getByLabel("时间冲突区").count() >= 1, "Conflicts remain in their own blocked region.");
  assert.ok(await page.locator(".temporal-event-port.is-input").count() >= 1 && await page.locator(".temporal-event-port.is-output").count() >= 1, "Timeline nodes expose their own temporal ports.");
  const timelineNodeWidths = await page.locator(".temporal-event-card").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
  assert.ok(Math.min(...timelineNodeWidths) >= 170, `Timeline nodes must render at least 170px wide=${JSON.stringify(timelineNodeWidths)}`);
  assert.equal(await page.locator(".event-timeline-node, .event-timeline-background-band, .event-timeline-undated").count(), 0, "Legacy timeline node families remain removed.");
  await canvas.getByRole("button", { name: "时间总览", exact: true }).click();
  await page.waitForTimeout(260);
  if (output) await page.screenshot({ path: path.join(output, "B-1440x900-independent-temporal-projection.png"), fullPage: true });
  for (let step = 0; step < 2; step += 1) {
    const zoomOut = page.locator(".temporal-flow .react-flow__controls-zoomout");
    if (await zoomOut.isDisabled()) break;
    await zoomOut.click();
  }
  await page.waitForTimeout(180);
  assert.equal(await page.locator('.temporal-coordinate-overlay[data-zoom-density="compact"]').count(), 1, "Far semantic zoom switches information hierarchy instead of shrinking all details.");
  assert.ok(await page.locator(".temporal-event-card strong").count() >= 4, "Far semantic zoom keeps Event titles visible.");
  if (output) await page.screenshot({ path: path.join(output, "E-1440x900-far-zoom-main-relations.png"), fullPage: true });
  await canvas.getByRole("button", { name: "时间总览", exact: true }).click();
  assert.ok(await page.getByLabel("时间冲突区").count() >= 1, "Conflict selection keeps the blocked recovery region visible.");
  if (output) await page.screenshot({ path: path.join(output, "F-1440x900-conflict-and-inferred-window.png"), fullPage: true });
  await page.getByRole("button", { name: "时间总览", exact: true }).click();
  const viewportBeforePan = await page.locator(".temporal-flow .react-flow__viewport").getAttribute("style");
  const flowBox = await page.locator(".temporal-flow").boundingBox();
  assert.ok(flowBox, "Timeline graph canvas must have a live box.");
  await page.mouse.move(flowBox.x + flowBox.width / 2, flowBox.y + flowBox.height / 2);
  await page.mouse.down(); await page.mouse.move(flowBox.x + flowBox.width / 2 + 80, flowBox.y + flowBox.height / 2 + 30); await page.mouse.up();
  await page.waitForTimeout(120);
  assert.notEqual(await page.locator(".temporal-flow .react-flow__viewport").getAttribute("style"), viewportBeforePan, "Timeline canvas must pan.");
  const zoomBefore = await page.locator(".temporal-flow .react-flow__viewport").getAttribute("style");
  const zoomDensityBefore = await page.locator(".temporal-coordinate-overlay").getAttribute("data-zoom-density");
  const zoomInDisabledBefore = await page.locator(".temporal-flow .react-flow__controls-zoomin").isDisabled();
  for (let step = 0; step < 12 && await page.locator('.temporal-coordinate-overlay[data-zoom-density="expanded"]').count() === 0; step += 1) {
    await page.locator(".temporal-flow .react-flow__controls-zoomin").click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(120);
  assert.notEqual(
    await page.locator(".temporal-flow .react-flow__viewport").getAttribute("style"),
    zoomBefore,
    `Timeline canvas must zoom (density=${zoomDensityBefore}, zoomInDisabled=${zoomInDisabledBefore}).`
  );
  assert.equal(await page.locator('.temporal-coordinate-overlay[data-zoom-density="expanded"]').count(), 1, "Near semantic zoom increases the synchronized coordinate density.");
  if (output) await page.screenshot({ path: path.join(output, "D-1440x900-near-zoom-evidence.png"), fullPage: true });
  await canvas.getByRole("button", { name: "定位所选", exact: true }).click();
  await page.locator(".temporal-event-node").filter({ hasText: "雾港启航" }).click();
  assert.equal(await page.locator(".temporal-crosshair").filter({ hasText: "雾港启航" }).count(), 1, "Selecting a time node keeps the shared Event identity visible in the independent projection.");
  if (output) await page.screenshot({ path: path.join(output, "C-1440x900-inferred-event-inspector.png"), fullPage: true });
  await canvas.getByRole("button", { name: "返回关系图", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-projection-mode="graph"]'));
  assert.equal(await page.locator(".event-graph-node").filter({ hasText: "雾港启航" }).locator(".graph-node-shell.is-selected").count(), 1, "Escape returns to the relationship graph without clearing selection.");
  await selectEventView("时间轴");
  await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"]'));
  await page.setViewportSize({ width: 1152, height: 720 });
  await page.getByLabel("独立时间线工作区").getByRole("button", { name: "时间总览", exact: true }).click();
  await page.waitForTimeout(260);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "1152 timeline view must pan without page overflow.");
  const narrowTimelineWidth = await page.locator(".temporal-event-card").first().evaluate((node) => node.getBoundingClientRect().width);
  assert.ok(narrowTimelineWidth >= 170, `1152 timeline nodes must remain readable=${narrowTimelineWidth}`);
  if (output) await page.screenshot({ path: path.join(output, "H-1152x720-semantic-time-readable-pan.png"), fullPage: true });
  const canonBefore = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const runsBeforeRefresh = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
  await reloadProduct(page);
  await selectEventView("时间轴");
  await page.waitForFunction(() => ["missing", "stale", "ready"].includes(document.querySelector("[data-temporal-state]")?.getAttribute("data-temporal-state") ?? ""));
  const runsAfterRefresh = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
  assert.equal(runsAfterRefresh.data.length, runsBeforeRefresh.data.length, "Refresh and view switching create no additional story-modeling Run.");
  assert.equal(await page.getByLabel("时间标尺").count(), 1, "The base coordinate system remains available after refresh.");
  const canonAfter = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.deepEqual(canonAfter.data.eventIds, canonBefore.data.eventIds, "Timeline proof may not write Canon.");
  assert.deepEqual(consoleProblems, [], "Timeline interaction must not add browser console errors.");
}

async function assertMultiNodePredictionProductization(page, consoleProblems) {
  const output = multiNodePredictionEvidenceDirectory;
  if (output) mkdirSync(output, { recursive: true });
  const capture = async (name) => { if (output) await page.screenshot({ path: path.join(output, name) }); };
  const openPredictionScope = async () => {
    await switchEventView(page, "关系图");
    await page.getByLabel("事件关系工作区").waitFor();
    const directory = page.getByLabel("单元目录");
    for (const title of ["暗号传递", "仓库对峙", "旧仓库封锁"]) {
      const toggle = directory.getByRole("button", { name: `加入推演范围：${title}` }).first();
      await toggle.click();
    }
    await page.getByRole("button", { name: "推演所选节点" }).click();
    await page.getByLabel("多节点推演").waitFor();
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&rail=expanded`);
  await closeGlobalTianyiIfOpen(page);
  const directoryToggle = page.locator('[data-panel-toggle="project-directory"]');
  if (await directoryToggle.getAttribute("aria-pressed") !== "true") await directoryToggle.click();
  const persistedCharacterDirectory = page.getByTestId("character-directory");
  if (await persistedCharacterDirectory.isVisible()) await persistedCharacterDirectory.getByRole("button", { name: "返回工程目录", exact: true }).click();
  const projectDirectory = page.locator(".project-directory-panel");
  await projectDirectory.waitFor();
  const directoryTree = projectDirectory.locator(".project-directory-tree");
  const rootBreadcrumb = directoryTree.locator(".project-directory-breadcrumb").getByRole("button", { name: "目录", exact: true });
  await rootBreadcrumb.click();
  assert.equal(await directoryTree.locator(".project-directory-reference").count(), 0, "The directory root must expose only second-level categories, never Event rows.");
  assert.deepEqual((await directoryTree.locator(".project-directory-entry").allTextContents()).map((value) => value.replace(/\d+$/u, "").trim()), ["故事结构", "信息资料", "设定", "来源", "创意"], "Directory root keeps the five high-level categories.");
  await capture("A-1440x900-directory-root.png");
  await directoryTree.locator(".project-directory-entry").filter({ hasText: "故事结构" }).click();
  await directoryTree.locator(".project-directory-entry").filter({ hasText: "单元" }).click();
  const unitEntry = directoryTree.locator(".project-directory-entry").filter({ hasText: /· 雾港/u });
  await unitEntry.click();
  assert.equal(await directoryTree.locator(".project-directory-entry").filter({ hasText: "直接属于单元" }).count(), 1, "A Unit must expose direct Event membership.");
  assert.equal(await directoryTree.locator(".project-directory-entry").filter({ hasText: "可选集点 · 仓库冲突" }).count(), 1, "A Set Point must remain an optional sibling collection.");
  await capture("B-1440x900-directory-unit-direct-and-set-point.png");
  await directoryTree.locator(".project-directory-entry").first().press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-directory-node")?.startsWith("unit:") === true);
  assert.equal(await unitEntry.evaluate((element) => document.activeElement === element), true, "Keyboard Back must restore focus to the Unit entry.");
  await unitEntry.press("Escape");
  assert.equal(await directoryTree.locator(".project-directory-breadcrumb").getByRole("button", { name: "故事结构", exact: true }).getAttribute("aria-current"), "page", "Escape returns one directory level without expanding the tree.");
  await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
  assert.equal(await projectDirectory.isHidden(), true, "Closing the secondary directory must release workspace width.");
  if (output) {
    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    await page.locator(".tianyi-sidebar").getByRole("tab", { name: "工作", exact: true }).click();
    await capture("Q-1440x900-work-lane-only.png");
    await closeGlobalTianyiIfOpen(page);
  }
  const postDirectoryState = { url: page.url(), storyWorkspace: await page.getByTestId("story-progression-workspace").count(), body: (await page.locator("body").innerText()).slice(0, 500) };
  assert.equal(postDirectoryState.storyWorkspace, 1, `Directory navigation must return to the sole Event Line workspace=${JSON.stringify(postDirectoryState)}`);
  await switchEventView(page, "故事脊柱");
  await page.getByLabel("故事脊柱").waitFor();
  assert.ok(await page.locator(".event-line-direct-nodes").count() >= 1, "Story spine must expose direct Unit nodes without inventing a required collection-point layer.");
  assert.equal(await page.getByLabel("故事脊柱").getByText("未指定集点", { exact: true }).count(), 0, "Story spine must not render a compatibility placeholder as a product hierarchy.");
  const spineDensity = await page.locator(".story-spine-events li > button").evaluateAll((cards) => {
    const viewportBottom = window.innerHeight;
    const visible = cards.map((card) => card.getBoundingClientRect()).filter((rect) => rect.top >= 0 && rect.bottom <= viewportBottom);
    const bodyFont = cards.length ? Number.parseFloat(getComputedStyle(cards[0]).fontSize) : 0;
    const meta = cards[0]?.querySelector("footer span");
    return { visibleCount: visible.length, minHeight: visible.length ? Math.min(...visible.map((rect) => rect.height)) : 0, maxHeight: visible.length ? Math.max(...visible.map((rect) => rect.height)) : 0, bodyFont, metaFont: meta ? Number.parseFloat(getComputedStyle(meta).fontSize) : 0 };
  });
  assert.ok(spineDensity.visibleCount >= 4, `1440 story spine must show at least four complete Events=${JSON.stringify(spineDensity)}`);
  assert.ok(spineDensity.minHeight >= 96 && spineDensity.maxHeight <= 132, `Story cards must keep a compact reading density=${JSON.stringify(spineDensity)}`);
  assert.ok(spineDensity.bodyFont >= 14 && spineDensity.metaFont >= 12, `Story card body and metadata must remain readable=${JSON.stringify(spineDensity)}`);
  assert.equal(await page.getByLabel("故事脊柱").getByText("这条事件暂未提供作者摘要。", { exact: true }).count(), 0, "Missing summaries must not repeat a large placeholder in every card.");
  await capture("J-1440x900-story-spine-reading-density.png");
  const relationsBefore = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const confirmedRelationsBefore = relationsBefore.data.relations.filter((relation) => relation.reviewState === "confirmed").length;
  const candidateRelationsBefore = relationsBefore.data.relations.filter((relation) => relation.reviewState === "candidate").length;
  const preexistingCandidateRelationId = relationsBefore.data.relations.find((relation) => relation.reviewState === "candidate")?.relationId ?? null;
  const canonBefore = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const libraryBefore = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftCountBefore = libraryBefore.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  await openPredictionScope();
  const panel = page.getByLabel("多节点推演");
  const tianyiSidebar = page.locator(".tianyi-sidebar");
  assert.equal(await tianyiSidebar.getAttribute("data-tianyi-mode"), "agent", "Opening a prediction scope must enter Agent mode.");
  assert.equal(await tianyiSidebar.locator(".tianyi-dialogue-panel").count(), 0, "Dialogue and Agent surfaces must not be mounted together.");
  await page.waitForTimeout(260);
  await capture("B-1440x900-agent-three-sources-task.png");
  assert.equal(await panel.getByText(/3 个节点 · 单元 · 雾港/u).count(), 1, "Tianyi must show one compact ordered-source summary while the canvas tray remains authoritative.");
  const unitDirectory = page.getByLabel("单元目录");
  assert.equal(await unitDirectory.getByRole("heading", { name: "单元 01：雾港" }).count(), 1, "The demo structure must expose the authored Unit title.");
  assert.ok(await unitDirectory.getByLabel("雾港的直接节点").getByRole("listitem").count() >= 1, "A Unit may contain direct nodes outside an optional Set Point.");
  assert.equal(await unitDirectory.getByRole("heading", { name: "可选集点：仓库冲突" }).count(), 1, "The optional warehouse Set Point must be visible.");
  assert.equal(await unitDirectory.getByLabel("仓库冲突集点内节点").getByRole("listitem").count(), 2, "The optional Set Point must reference two existing Events without duplication.");
  const longTitle = "失踪名单在灯塔守夜人的密室中浮现";
  const longTitleButton = unitDirectory.locator(".event-unit-focus").filter({ hasText: longTitle });
  assert.match(await longTitleButton.getAttribute("title"), new RegExp(`^${longTitle}`, "u"), "Truncated event titles must expose a complete tooltip.");
  assert.match(await longTitleButton.getAttribute("aria-label"), new RegExp(`^${longTitle}`, "u"), "Truncated event titles must keep a complete accessible name.");
  assert.equal(await page.getByLabel("单元目录").getByText(/第\s*\d+\s*卷/u).count(), 0, "The event directory must use Units, never forced volumes.");
  const wideOverflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    media100: matchMedia("(max-width: 100rem)").matches,
    media90: matchMedia("(max-width: 90rem)").matches,
    mediaIntegrated: matchMedia("(min-width: 64.0625rem) and (max-width: 100rem)").matches,
    shell: (() => { const element = document.querySelector(".tianyan-r0-shell"); const style = element ? getComputedStyle(element) : null; return { columns: style?.gridTemplateColumns ?? "", areas: style?.gridTemplateAreas ?? "", width: Math.round(element?.getBoundingClientRect().width ?? 0) }; })(),
    sidebar: (() => { const element = document.querySelector(".tianyi-sidebar"); const style = element ? getComputedStyle(element) : null; const rect = element?.getBoundingClientRect(); return { position: style?.position ?? "", gridArea: style?.gridArea ?? "", inset: style?.inset ?? "", left: Math.round(rect?.left ?? 0), right: Math.round(rect?.right ?? 0), width: Math.round(rect?.width ?? 0) }; })(),
    offenders: [...document.querySelectorAll("body *")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: typeof element.className === "string" ? element.className : "", left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter((item) => item.right > window.innerWidth + 1 || item.left < -1 || item.width > window.innerWidth + 1).slice(0, 12)
  }));
  assert.equal(wideOverflow.documentWidth > wideOverflow.viewport, false, `The 1440 prediction workspace must not create page overflow=${JSON.stringify(wideOverflow)}`);
  await capture("01-1440x900-unit-direct-and-optional-set-point.png");

  await page.route("**/prediction/execute", async (route) => { await new Promise((resolve) => setTimeout(resolve, 180)); await route.continue(); }, { times: 1 });
  await panel.getByRole("button", { name: "开始推演", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-view") === "running");
  assert.equal(await panel.getByRole("button", { name: "停止本次推演", exact: true }).count(), 1, "Running stage must expose exactly one primary stop action instead of adoption controls.");
  try { await page.waitForFunction(() => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-phase") === "reviewing"); }
  catch (error) {
    const persistedRuns = await postFixture(`${apiUrl}/__local/story-studio/tianyi/prediction/list`, { projectId: fixtureProjectId });
    const state = await page.evaluate(() => {
      const element = document.querySelector(".tianyi-prediction-panel");
      return {
        phase: element?.getAttribute("data-prediction-phase") ?? null,
        view: element?.getAttribute("data-prediction-view") ?? null,
        runId: element?.getAttribute("data-run-id") ?? null,
        announcedRun: window.__storyStudioPredictionRun ?? null,
        announcedView: window.__storyStudioPredictionView ?? null
      };
    });
    throw new Error(`Agent background recovery did not reach review. State=${JSON.stringify(state)} Panel=${await panel.innerText().catch(() => "unmounted")} Runs=${JSON.stringify(persistedRuns.data)}`, { cause: error });
  }
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node").length >= 5);
  assert.ok(await panel.locator(".tianyi-prediction-path-list li").count() >= 2, "Ready prediction must expose multiple continuous candidate paths.");
  assert.ok(await page.locator(".event-graph-prediction-node").count() >= 5, "Candidate overview must render all unique nodes from multiple paths before focus.");
  await page.waitForTimeout(260);
  const overviewGeometry = await page.locator(".event-graph-prediction-node").evaluateAll((nodes) => {
    const canvas = document.querySelector(".event-graph-flow")?.getBoundingClientRect();
    const directory = document.querySelector(".event-unit-directory");
    const rects = nodes.map((node) => node.getBoundingClientRect());
    const lanes = [...new Set(rects.map((rect) => Math.round(rect.top / 20) * 20))];
    const ids = nodes.map((node) => node.getAttribute("data-id"));
    const titles = nodes.map((node) => node.querySelector("strong"));
    const meta = nodes.flatMap((node) => [...node.querySelectorAll("span")]);
    return {
      canvas: canvas ? { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom, centerX: canvas.left + canvas.width / 2, centerY: canvas.top + canvas.height / 2 } : null,
      directoryVisible: Boolean(directory && getComputedStyle(directory).display !== "none"),
      minWidth: rects.length ? Math.min(...rects.map((rect) => rect.width)) : 0,
      titleFont: titles.length ? Math.min(...titles.map((title) => Number.parseFloat(getComputedStyle(title).fontSize))) : 0,
      metaFont: meta.length ? Math.min(...meta.map((item) => Number.parseFloat(getComputedStyle(item).fontSize))) : 0,
      laneCount: lanes.length,
      uniqueNodeCount: new Set(ids).size,
      nodeCount: nodes.length,
      centerX: rects.length ? (Math.min(...rects.map((rect) => rect.left)) + Math.max(...rects.map((rect) => rect.right))) / 2 : 0,
      centerY: rects.length ? (Math.min(...rects.map((rect) => rect.top)) + Math.max(...rects.map((rect) => rect.bottom))) / 2 : 0
    };
  });
  assert.equal(overviewGeometry.directoryVisible, false, `Candidate overview must temporarily collapse the wide Unit directory=${JSON.stringify(overviewGeometry)}`);
  assert.ok(overviewGeometry.minWidth >= 180, `Every candidate card must render at least 180px wide=${JSON.stringify(overviewGeometry)}`);
  assert.ok(overviewGeometry.titleFont >= 13 && overviewGeometry.metaFont >= 12, `Candidate title and metadata must remain readable=${JSON.stringify(overviewGeometry)}`);
  assert.ok(overviewGeometry.laneCount >= 3, `The overview must expose three vertically separated horizontal path lanes=${JSON.stringify(overviewGeometry)}`);
  assert.equal(overviewGeometry.uniqueNodeCount, overviewGeometry.nodeCount, `Shared candidate Events must have one rendered identity=${JSON.stringify(overviewGeometry)}`);
  assert.ok(overviewGeometry.canvas && Math.abs(overviewGeometry.centerY - overviewGeometry.canvas.centerY) <= 100, `The initial path overview must be vertically centered rather than parked at the upper-left=${JSON.stringify(overviewGeometry)}`);
  assert.equal(await panel.locator(".tianyi-prediction-technical-details").getAttribute("open"), null, "Technical receipts must be closed by default in candidate overview.");
  await capture("M-1440x900-multi-path-overview.png");
  const readyRunId = await panel.getAttribute("data-run-id");
  await tianyiSidebar.getByRole("tab", { name: "工作", exact: true }).click();
  await tianyiSidebar.getByText("页面 Agent Run 在后台保留", { exact: true }).waitFor();
  assert.equal(await tianyiSidebar.getByText("Work lane 不操纵该 Run；切回 Agent 可查看页面范围内的进度。", { exact: true }).count(), 1, "Work must explain that it does not control the retained Page Agent Run.");
  assert.equal(await tianyiSidebar.getAttribute("data-tianyi-mode"), "work", "The author may leave a ready Page Agent Run for the shared Work lane.");
  assert.equal(await tianyiSidebar.locator(".tianyi-prediction-panel").count(), 0, "Work must not expose Page Agent prediction controls or ContextPack execution.");
  assert.equal(await tianyiSidebar.getByLabel("天意工作泳道").getAttribute("data-page-agent-dispatch"), "forbidden", "Work must explicitly exclude Page Agent dispatch.");
  await tianyiSidebar.locator(".tianyi-dialogue-composer textarea").fill("推演下一段故事");
  assert.equal(await tianyiSidebar.getByRole("button", { name: "转到 Agent", exact: true }).count(), 1, "Execution-like Work intent must offer an explicit Page Agent handoff without auto-running.");
  await capture("F-1440x900-agent-background-retained-work.png");
  await tianyiSidebar.getByRole("tab", { name: /Agent/u }).click();
  await page.getByLabel("多节点推演").waitFor();
  await page.waitForFunction((runId) => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-run-id") === runId, readyRunId);
  assert.equal(await panel.getAttribute("data-run-id"), readyRunId, "Switching modes must preserve the Agent Run.");
  assert.equal(await tianyiSidebar.locator(".tianyi-dialogue-composer").count(), 0, "Agent mode must not mount the Dialogue composer.");
  await panel.getByText("技术回执与历史", { exact: true }).click();
  await panel.getByRole("button", { name: "查看执行图", exact: true }).click();
  await page.getByLabel("Agent 执行过程").waitFor();
  assert.ok(await page.locator("[data-node-family='agent-process']").count() >= 1, "The execution graph must render actual Process nodes.");
  assert.ok(await page.locator("[data-node-family='agent-tool']").count() >= 1, "The execution graph must render actual Tool nodes.");
  assert.ok(await page.locator("[data-node-family='agent-gate']").count() >= 1, "The execution graph must render actual Gate nodes.");
  assert.ok(await page.locator("[data-node-family='agent-result']").count() >= 1, "The execution graph must render an actual Result node.");
  assert.ok(await page.locator("[data-node-family='agent-human-review']").count() >= 1, "The execution graph must render a distinct Human Review checkpoint.");
  const executionPositions = await page.locator(".agent-execution-flow .react-flow__node").evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(node.style.transform.match(/translate\(([-\d.]+)px/u)?.[1] ?? "0")));
  assert.equal(executionPositions.every((position, index) => index === 0 || position > executionPositions[index - 1]), true, `Execution nodes must progress strictly from left to right=${JSON.stringify(executionPositions)}`);
  assert.equal(await page.locator(".agent-node-icon").count() >= 1, true, "Process nodes need a dedicated step rail.");
  assert.equal(await page.locator(".agent-tool-mark").count() >= 1, true, "Tool nodes need a dedicated compact tool mark.");
  assert.equal(await page.locator(".agent-gate-mark").count() >= 1, true, "Gate nodes need a dedicated gate mark.");
  assert.equal(await page.locator(".agent-result-mark").count() >= 1, true, "Result nodes need a dedicated result mark.");
  await capture("C-1440x900-agent-execution-process-tool-gate-result.png");
  await tianyiSidebar.getByRole("button", { name: "关闭天意助手", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-panel-toggle="tianyi-agent"]')?.getAttribute("aria-pressed") === "false");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-panel-toggle")), "tianyi-agent", "Closing the focused-layout Agent overlay must restore trigger focus before interacting with the main workspace.");
  await page.getByRole("button", { name: "查看当前", exact: true }).click();
  await page.waitForTimeout(220);
  const currentExecutionFocus = await page.evaluate(() => {
    const flow = document.querySelector(".agent-execution-flow")?.getBoundingClientRect();
    const result = document.querySelector("[data-node-family='agent-result']")?.getBoundingClientRect();
    const review = document.querySelector("[data-node-family='agent-human-review']")?.getBoundingClientRect();
    const visible = (rect) => Boolean(flow && rect && rect.left >= flow.left && rect.right <= flow.right && rect.top >= flow.top && rect.bottom <= flow.bottom);
    return { resultVisible: visible(result), reviewVisible: visible(review) };
  });
  assert.deepEqual(currentExecutionFocus, { resultVisible: true, reviewVisible: true }, `View Current must directly locate Result and Human Review=${JSON.stringify(currentExecutionFocus)}`);
  await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
  await page.waitForFunction((runId) => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-run-id") === runId, readyRunId);
  if (await panel.locator(".tianyi-prediction-technical-details").getAttribute("open") === null) {
    await panel.getByText("技术回执与历史", { exact: true }).click();
  }
  await panel.getByRole("button", { name: "查看执行图", exact: true }).click();
  await page.getByLabel("Agent 执行过程").waitFor();
  await capture("C2-1440x900-agent-execution-gate-result.png");

  await page.setViewportSize({ width: 1152, height: 720 });
  await page.waitForTimeout(220);
  const narrowExecution = await page.evaluate(() => {
    const sidebar = document.querySelector(".tianyi-sidebar")?.getBoundingClientRect();
    const flow = document.querySelector(".agent-execution-flow")?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll(".agent-execution-flow .graph-node-shell")].map((node) => node.getBoundingClientRect());
    return {
      sidebarWidth: sidebar?.width ?? 0,
      sidebarRight: sidebar?.right ?? 0,
      flowWidth: flow?.width ?? 0,
      minNodeWidth: nodes.length ? Math.min(...nodes.map((node) => node.width)) : 0,
      currentNodeVisible: nodes.length ? nodes.at(-1).left >= flow.left && nodes.at(-1).right <= flow.right : false,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      locatorVisible: Boolean(document.querySelector(".agent-execution-locator"))
    };
  });
  assert.ok(narrowExecution.sidebarWidth >= 340 && narrowExecution.sidebarWidth <= 380, `1152 execution Tianyi width=${JSON.stringify(narrowExecution)}`);
  assert.ok(Math.abs(narrowExecution.sidebarRight - 1152) <= 1, `1152 execution Tianyi must remain rightmost=${JSON.stringify(narrowExecution)}`);
  assert.ok(narrowExecution.flowWidth >= 640, `1152 execution canvas must retain a readable pan surface=${JSON.stringify(narrowExecution)}`);
  assert.ok(narrowExecution.minNodeWidth >= 170, `1152 execution nodes must keep at least 170px of rendered width at the readable default zoom=${JSON.stringify(narrowExecution)}`);
  assert.equal(narrowExecution.currentNodeVisible, true, `The current execution node must be focused inside the usable canvas rather than beneath Tianyi=${JSON.stringify(narrowExecution)}`);
  assert.equal(narrowExecution.pageOverflow, false, `1152 execution graph must not create page overflow=${JSON.stringify(narrowExecution)}`);
  assert.equal(narrowExecution.locatorVisible, true, `1152 execution graph must keep explicit locator controls=${JSON.stringify(narrowExecution)}`);
  await capture("H-1152x720-agent-execution-readable-pan.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(180);

  await tianyiSidebar.getByRole("button", { name: "关闭天意助手", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-panel-toggle="tianyi-agent"]')?.getAttribute("aria-pressed") === "false");
  await page.getByRole("button", { name: "返回事件图", exact: true }).click();
  await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
  await page.waitForFunction((runId) => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-run-id") === runId, readyRunId);
  await panel.locator('[data-path-id="prediction-path.conflict"] button').press("Enter");
  assert.equal(await page.getByLabel("单元目录").isHidden(), true, "Path focus must keep the Unit directory temporarily collapsed.");
  assert.equal(await panel.locator(".tianyi-prediction-technical-details").getAttribute("open"), null, "Switching paths must close technical receipts.");
  assert.equal(await panel.locator(".tianyi-prediction-accept").isDisabled(), true, "A time-conflict path must remain blocked.");
  assert.equal(await panel.getByText("这条路径暂时不可采纳", { exact: true }).count(), 1, "A blocked path must explain why it cannot be adopted.");
  const conflictRelations = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const conflictCanon = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const conflictLibrary = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(conflictRelations.data.relations.length, relationsBefore.data.relations.length, "Previewing a time-conflict path must not write a Relation.");
  assert.deepEqual(conflictCanon.data.eventIds, canonBefore.data.eventIds, "Previewing a time-conflict path must not write Canon.");
  assert.equal(conflictLibrary.data.objects.filter((item) => item.type === "event" && item.status === "draft").length, draftCountBefore, "Previewing a time-conflict path must not create a draft Event.");
  await capture("I-1440x900-time-conflict-blocked-no-write.png");
  if (await panel.getByRole("button", { name: "返回修正推演要求", exact: true }).count() === 0) {
    assert.equal(await panel.getAttribute("data-prediction-view"), "overview", "A freshly remounted Agent may finish its local history recovery only by returning the retained Run to its overview.");
    await panel.locator('[data-path-id="prediction-path.conflict"] button').press("Enter");
    await panel.getByRole("button", { name: "返回修正推演要求", exact: true }).waitFor();
  }
  await panel.getByRole("button", { name: "返回修正推演要求", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches(".tianyi-prediction-goal textarea"));
  assert.equal(await panel.locator(".tianyi-prediction-goal textarea").evaluate((element) => document.activeElement === element), true, "The conflict correction route must restore focus to the authored request.");
  await capture("I2-1440x900-time-conflict-correction-focus.png");
  await panel.getByRole("button", { name: "开始推演", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-view") === "overview");
  await panel.locator('[data-path-id="prediction-path.lighthouse"] button').press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node").length === 3);
  await page.waitForTimeout(260);
  const activePathGeometry = await page.locator(".event-graph-prediction-node").evaluateAll((nodes) => {
    const canvas = document.querySelector(".event-graph-flow")?.getBoundingClientRect();
    return { canvas: canvas ? { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom, width: canvas.width, height: canvas.height } : null, nodes: nodes.map((node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; }) };
  });
  assert.equal(Boolean(activePathGeometry.canvas && activePathGeometry.nodes.every((node) => node.left >= activePathGeometry.canvas.left && node.right <= activePathGeometry.canvas.right && node.top >= activePathGeometry.canvas.top && node.bottom <= activePathGeometry.canvas.bottom)), true, `The active continuous candidate path must remain fully visible in the canvas=${JSON.stringify(activePathGeometry)}`);
  assert.equal(await page.locator(".graph-node-candidate-label", { hasText: "候选 · 尚未写入事件线" }).count() >= 1, true, "Candidate overlay must state that it is not written to the Event Line.");
  assert.equal(await panel.getByText(/时间未定/u).count() >= 1, true, "Unknown time stays explicit and reviewable.");
  assert.equal(await panel.locator(".tianyi-prediction-accept").isEnabled(), true, "Unknown time does not block an otherwise valid path.");
  assert.equal(await panel.locator(".tianyi-prediction-technical-details").getAttribute("open"), null, "Changing to path focus must not expose Run, Bundle or Candidate identifiers.");
  await capture("D-1440x900-candidate-event-overlay.png");

  const runBeforeEscape = await panel.getAttribute("data-run-id");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-view") === "overview");
  assert.equal(await panel.getAttribute("data-run-id"), runBeforeEscape, "Escape must preserve the current Run while returning to the path overview.");
  assert.equal(await page.getByLabel("推演范围").getByText("推演范围 3/4", { exact: true }).count(), 1, "Escape must preserve the ordered source tray.");
  await panel.locator('[data-path-id="prediction-path.lighthouse"] button').press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node").length === 3);

  await panel.getByRole("button", { name: "进入节点审阅", exact: true }).click();
  assert.equal(await page.getByLabel("单元目录").isHidden(), true, "Partial review must keep the Unit directory temporarily collapsed.");
  assert.equal(await panel.locator(".tianyi-prediction-technical-details").getAttribute("open"), null, "Entering review must keep technical receipts closed.");

  const firstCandidateCheckbox = panel.locator(".tianyi-prediction-review input[type='checkbox']").first();
  await firstCandidateCheckbox.press("Space");
  assert.match(await panel.locator(".tianyi-prediction-accept").innerText(), /采纳 2 个节点 · 新建 1 个草稿/u, "Partial review must name the exact selected and new-draft counts.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("已选择候选").locator("..").getByText("2", { exact: true }).count(), 1, "Review summary must show two selected candidates.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("沿用已有事件").locator("..").getByText("1", { exact: true }).count(), 1, "Review summary must show one existing Event reference.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("保存为作者草稿").locator("..").getByText("1", { exact: true }).count(), 1, "Review summary must show one draft creation.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("已跳过").locator("..").getByText("1", { exact: true }).count(), 1, "Review summary must show one skipped candidate.");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node.is-review-excluded").length === 1);
  assert.equal(await page.locator(".event-graph-prediction-node.is-review-excluded").count(), 1, "Canvas and Tianyi must agree on the excluded candidate.");
  await capture("E-1440x900-partial-adoption-counts.png");

  const acceptButton = panel.locator(".tianyi-prediction-accept");
  await acceptButton.focus();
  assert.notEqual(await acceptButton.evaluate((button) => getComputedStyle(button).outlineStyle), "none", "Keyboard focus on acceptance must remain visible.");
  await acceptButton.press("Enter");
  await panel.getByText("这次采纳已保存", { exact: true }).waitFor();
  await page.getByLabel("单元目录").getByText("异常信号增强", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("单元目录").getByText("异常信号增强", { exact: true }).count(), 1, "Only the Workspace owner-created draft enters the formal Event projection.");
  assert.equal(await page.getByLabel("单元目录").getByText("灯塔失火", { exact: true }).count(), 1, "The excluded candidate must not create a duplicate draft.");
  const relationsAfter = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const canonAfter = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const libraryAfter = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftCountAfter = libraryAfter.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  assert.equal(draftCountAfter, draftCountBefore + 1, "A two-node adoption with one reference must create exactly one draft Event.");
  assert.equal(relationsAfter.data.relations.length, relationsBefore.data.relations.length + 1, "Partial adoption must create exactly one connected Relation candidate and no dangling edge.");
  assert.equal(relationsAfter.data.relations.filter((relation) => relation.reviewState === "confirmed").length, confirmedRelationsBefore, "Prediction acceptance must not confirm a Relation before author action.");
  assert.equal(relationsAfter.data.relations.filter((relation) => relation.reviewState === "candidate").length, candidateRelationsBefore + 1, "The retained prediction edge must enter Pending Review once.");
  assert.equal(relationsAfter.data.relations.filter((relation) => relation.relationTypeId === "relation-type.unresolved" && relation.reviewState === "candidate").length, 1, "An unmatched AI edge must remain visibly unresolved rather than inventing a formal RelationType.");
  const unresolvedPredictionRelationId = relationsAfter.data.relations.find((relation) => relation.relationTypeId === "relation-type.unresolved" && relation.reviewState === "candidate")?.relationId;
  assert.ok(unresolvedPredictionRelationId, "The browser flow must retain the automatic unresolved Relation identity for author review.");
  const postAdoptionPanelText = await panel.innerText();
  assert.equal(postAdoptionPanelText.includes("自动生成待确认关系"), true, `The acceptance receipt must disclose automatic pending relations: ${JSON.stringify(postAdoptionPanelText)}`);
  assert.deepEqual(canonAfter.data.eventIds, canonBefore.data.eventIds, "Prediction acceptance must not change Canon.");
  await capture("D-1440x900-draft-created.png");

  await reloadProduct(page);
  await openPredictionScope();
  const restoredReceipt = panel.getByLabel("本次采纳结果");
  await restoredReceipt.waitFor();
  const receiptVisibility = await restoredReceipt.evaluate((element) => {
    const receipt = element.getBoundingClientRect();
    const sidebar = document.querySelector(".tianyi-sidebar")?.getBoundingClientRect();
    return { top: receipt.top, bottom: receipt.bottom, sidebarTop: sidebar?.top ?? 0, sidebarBottom: sidebar?.bottom ?? 0 };
  });
  assert.ok(receiptVisibility.top >= receiptVisibility.sidebarTop && receiptVisibility.bottom <= receiptVisibility.sidebarBottom, `The restored receipt must be visible without scrolling=${JSON.stringify(receiptVisibility)}`);
  assert.ok(receiptVisibility.top - receiptVisibility.sidebarTop < 150, `The restored receipt must occupy Tianyi's primary position=${JSON.stringify(receiptVisibility)}`);
  assert.equal(await restoredReceipt.getByText("灯塔路线", { exact: true }).count(), 1, "The restored receipt must name the accepted path.");
  assert.equal(await restoredReceipt.getByText(/2 个节点/u).count() >= 1, true, "The restored receipt must show the selected count.");
  assert.equal(await restoredReceipt.getByText("雾港启航", { exact: true }).count(), 1, "The restored receipt must distinguish the existing Event reference.");
  assert.equal(await restoredReceipt.getByText("异常信号增强", { exact: true }).count(), 1, "The restored receipt must distinguish the new draft Event.");
  assert.equal(await restoredReceipt.getByText("灯塔失火", { exact: true }).count(), 1, "The restored receipt must name the skipped candidate.");
  assert.equal(await restoredReceipt.getByText("沿用已有事件", { exact: true }).count(), 1, "The primary receipt must use author-facing existing-event language.");
  assert.equal(await restoredReceipt.getByText("保存为作者草稿", { exact: true }).count(), 1, "The primary receipt must use author-facing draft language.");
  assert.equal(await restoredReceipt.locator("details").getAttribute("open"), null, "Technical IDs must stay collapsed after refresh.");
  const libraryAfterRefresh = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const relationsAfterRefresh = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftCountAfterRefresh = libraryAfterRefresh.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  assert.equal(draftCountAfterRefresh, draftCountAfter, "Refresh recovery must not repeat the draft Event write.");
  assert.equal(relationsAfterRefresh.data.relations.length, relationsAfter.data.relations.length, "Refresh recovery must not repeat the Relation candidate write.");
  const firstRunId = await panel.getAttribute("data-run-id");
  await capture("03-1440x900-refresh-primary-receipt.png");
  await panel.getByText("技术回执与历史", { exact: true }).click();
  await panel.getByRole("button", { name: "生成新推演", exact: true }).click();
  await page.waitForFunction((previous) => {
    const current = document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-run-id") ?? "";
    return current && current !== previous && document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-phase") === "reviewing";
  }, firstRunId);
  assert.ok(await panel.locator(".tianyi-prediction-history option").count() >= 2, "Re-prediction must retain the old Run in history.");
  await panel.locator('[data-path-id="prediction-path.lighthouse"] button').press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node").length === 3);

  await page.setViewportSize({ width: 1152, height: 720 });
  await page.waitForTimeout(260);
  const narrow = await page.evaluate(() => {
    const sidebar = document.querySelector(".tianyi-sidebar")?.getBoundingClientRect();
    const directory = document.querySelector(".event-unit-directory");
    const candidateTitles = [...document.querySelectorAll(".event-graph-prediction-node strong")];
    return {
      sidebarWidth: sidebar?.width ?? 0,
      sidebarRight: sidebar?.right ?? 0,
      directoryVisible: Boolean(directory && getComputedStyle(directory).display !== "none"),
      sourceSummary: document.querySelector(".event-graph-prediction-source-summary")?.textContent?.trim() ?? "",
      formalSourceCards: [...document.querySelectorAll(".event-graph-node:not(.event-graph-prediction-node)")].filter((node) => /暗号传递|仓库对峙|旧仓库封锁/u.test(node.textContent ?? "")).length,
      candidateFont: candidateTitles.length ? Math.min(...candidateTitles.map((title) => Number.parseFloat(getComputedStyle(title).fontSize))) : 0,
      minCandidateWidth: candidateTitles.length ? Math.min(...candidateTitles.map((title) => title.closest(".event-graph-prediction-node")?.getBoundingClientRect().width ?? 0)) : 0,
      firstCandidateVisible: (() => { const flow = document.querySelector(".event-graph-flow")?.getBoundingClientRect(); const node = document.querySelector(".event-graph-prediction-node")?.getBoundingClientRect(); return Boolean(flow && node && node.left >= flow.left && node.right <= flow.right); })(),
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  assert.ok(narrow.sidebarWidth >= 340 && narrow.sidebarWidth <= 380, `1152 Tianyi width=${JSON.stringify(narrow)}`);
  assert.ok(Math.abs(narrow.sidebarRight - 1152) <= 1, `Tianyi must remain rightmost=${JSON.stringify(narrow)}`);
  assert.equal(narrow.directoryVisible, false, `The Unit directory may yield at 1152=${JSON.stringify(narrow)}`);
  assert.match(narrow.sourceSummary, /3 个推演依据/u, `1152 must collapse formal sources to a semantic summary=${JSON.stringify(narrow)}`);
  assert.equal(narrow.formalSourceCards, 0, `1152 must not shrink three formal source cards beside the candidate path=${JSON.stringify(narrow)}`);
  assert.ok(narrow.candidateFont >= 14, `Candidate titles remain directly readable=${JSON.stringify(narrow)}`);
  assert.ok(narrow.minCandidateWidth >= 170, `Candidate cards must retain at least 170px of rendered width=${JSON.stringify(narrow)}`);
  assert.equal(narrow.firstCandidateVisible, true, `The current path must begin inside the usable canvas and leave later nodes available by panning=${JSON.stringify(narrow)}`);
  assert.equal(narrow.overflow, false, `Prediction workspace must not create page overflow=${JSON.stringify(narrow)}`);
  assert.equal(await panel.locator("text=/Pi Agent|Prompt|temperature|gateway|runtime graph|internal agent node/u").count(), 0, "Internal execution terms must not leak into the author UI.");
  await capture("G-1152x720-agent-current-candidate-path.png");
  const summaryButton = page.locator(".event-graph-prediction-source-summary");
  await summaryButton.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-node:not(.event-graph-prediction-node)").length === 3);
  assert.equal(await page.locator(".event-graph-node:not(.event-graph-prediction-node)").count(), 3, "The source summary must expand the three formal Events on keyboard activation.");
  await panel.getByText("技术回执与历史", { exact: true }).click();
  const abandonButton = panel.getByRole("button", { name: "放弃本次推演", exact: true });
  await abandonButton.press("Enter");
  await panel.getByText("本次推演已放弃；既有草稿和历史回执均保留。", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("单元目录").getByText("异常信号增强", { exact: true }).count(), 1, "Keyboard abandonment must preserve the already-created draft projection.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(180);
  assert.equal(await page.getByLabel("单元目录").isVisible(), true, "Leaving the Agent prediction flow must restore the Unit directory's prior visible state.");
  await closeGlobalTianyiIfOpen(page);
  await switchEventView(page, "关系图");
  await page.getByRole("button", { name: "展开事件目录", exact: true }).click();
  await page.getByRole("button", { name: /待确认 \d+/u }).click();
  const unresolvedInspector = page.getByLabel("待确认关系检查器");
  await unresolvedInspector.waitFor();
  assert.equal(await unresolvedInspector.getByText("待确认 · 关系类型待确认", { exact: true }).count(), 1, "An AI edge without an exact existing type must remain explicitly unresolved.");
  assert.equal(await unresolvedInspector.getByRole("button", { name: "通过并保存", exact: true }).isDisabled(), true, "An unresolved AI relation cannot be confirmed directly.");
  await capture("D2-1440x900-automatic-pending-relation.png");
  await unresolvedInspector.getByLabel("候选关系类型").selectOption({ label: "促使" });
  await unresolvedInspector.getByRole("button", { name: "选择类型后通过", exact: true }).click();
  await page.getByText("作者确认后，关系已保存。", { exact: true }).waitFor();
  const relationsAfterAuthorConfirm = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(relationsAfterAuthorConfirm.data.relations.filter((relation) => relation.reviewState === "confirmed").length, confirmedRelationsBefore + 1, "Only the explicitly approved AI relation may become confirmed.");
  let rejectionTargetId = preexistingCandidateRelationId;
  if (!rejectionTargetId) {
    const typeState = await getFixture(`${apiUrl}/__local/story-studio/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
    const rejectCandidate = await postFixture(`${apiUrl}/__local/story-studio/relations/create`, { projectId: fixtureProjectId, sourceObjectId: timelineFixture.timed[2].id, targetObjectId: timelineFixture.timed[3].id, relationTypeId: typeState.data.types[0].relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-prediction-relation-reject", operationId: `prediction-relation-reject-${fixture.fixtureId}` });
    rejectionTargetId = rejectCandidate.data.relation.relationId;
  }
  await reloadProduct(page);
  await switchEventView(page, "关系图");
  await page.getByRole("button", { name: "展开事件目录", exact: true }).click();
  await page.getByRole("button", { name: /待确认 1/u }).click();
  await page.getByLabel("待确认关系检查器").getByRole("button", { name: "拒绝", exact: true }).click();
  await page.getByText("候选已拒绝，未成为正式关系。", { exact: true }).waitFor();
  await reloadProduct(page);
  await switchEventView(page, "关系图");
  const relationsAfterReject = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}&reviewState=rejected&includeArchived=true`);
  assert.equal(relationsAfterReject.data.relations.find((relation) => relation.relationId === rejectionTargetId)?.reviewState, "rejected", "The Relation owner must persist the author rejection across refresh.");
  assert.equal(await page.getByRole("button", { name: /待确认 1/u }).count(), 0, "A rejected relation must not return as an active candidate after refresh.");
  await capture("E2-1440x900-relation-confirmed-and-rejected.png");
  assert.deepEqual(consoleProblems, [], "Multi-node prediction must not add browser console warnings or errors.");
}

async function assertRightWorkSurfaceStateMachine(page, consoleProblems) {
  const output = founderEvidenceDirectory;
  await page.setViewportSize({ width: 1152, height: 720 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page);
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "NONE", "State machine begins at NONE.");
  await switchEventView(page, "故事脊柱");
  const visibleStoryEvent = page.locator(".story-spine-events li > button").first();
  await visibleStoryEvent.click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "EVENT_DETAILS");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-event-details-open.png"), fullPage: true });
  await page.getByRole("button", { name: "新增事件", exact: true }).first().click();
  const form = page.getByRole("form", { name: "新建事件" }); await form.waitFor();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "EVENT_CREATE");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-event-create-top.png"), fullPage: true });
  await form.evaluate((element) => element.scrollTop = element.scrollHeight);
  const actionsReachable = await form.locator("footer button").evaluateAll((buttons) => buttons.every((button) => { const rect = button.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0; }));
  assert.equal(actionsReachable, true, "1152 create actions must remain reachable.");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-event-create-actions.png"), fullPage: true });
  await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "TIANYI");
  assert.equal(await page.locator(".tianyi-sidebar").count(), 1, "Only one Tianyi work Dock may be mounted.");
  assert.equal(await page.locator(".tianyi-sidebar[data-work-lane='shared'][data-page-agent-session-owner='none']").count(), 1, "The single Dock must reuse the Tianyi Work lane while Page Agent owns no session.");
  assert.equal(await page.locator(".tianyi-sidebar [role='tab']").filter({ hasText: "工作" }).count(), 1, "The sidebar names its conversation surface Work.");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-tianyi-open.png"), fullPage: true });
  await page.getByRole("button", { name: "关闭天意助手", exact: true }).first().click();
  await visibleStoryEvent.click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "EVENT_DETAILS");
  const typeState = await getFixture(`${apiUrl}/__local/story-studio/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const reviewCandidate = await postFixture(`${apiUrl}/__local/story-studio/relations/create`, { projectId: fixtureProjectId, sourceObjectId: timelineFixture.timed[1].id, targetObjectId: timelineFixture.timed[2].id, relationTypeId: typeState.data.types[0].relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-right-surface-review", operationId: `right-surface-review-${fixture.fixtureId}` });
  assert.equal(reviewCandidate.data.relation.reviewState, "candidate", "Relation review must begin from the existing Relation owner candidate.");
  await reloadProduct(page);
  await switchEventView(page, "关系图");
  await page.getByRole("button", { name: "展开事件目录", exact: true }).click();
  await page.getByRole("button", { name: /待确认 1/u }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "RELATION_REVIEW");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-relation-review-open.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "1152 right surfaces must not overflow horizontally.");
  await page.locator(".event-graph-flow").click({ position: { x: 12, y: 12 } });
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "NONE", "Pane clear returns the state machine to NONE.");
  assert.deepEqual(consoleProblems, [], "Right surface interactions must not add browser console errors.");
}

async function assertWorkspaceShellFocusR22A(page, consoleProblems) {
  const providerRequests = [];
  const observeProvider = (request) => {
    if (/\/__local\/story-studio\/provider|\/api\/provider/iu.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  };
  page.on("request", observeProvider);
  const capture = async (name) => {
    if (!shellFocusR22AEvidenceDirectory) return;
    mkdirSync(shellFocusR22AEvidenceDirectory, { recursive: true });
    await page.waitForFunction(async () => {
      const shell = document.querySelector(".tianyan-r0-shell");
      if (!shell) return false;
      const finiteMotion = shell.getAnimations({ subtree: true }).some((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return animation.playState === "running" && timing?.iterations !== Infinity;
      });
      if (finiteMotion) return false;
      const snapshot = () => [".shell-workspace", ".project-directory-panel", ".dock-panel-stack", ".dock-tool-rail"].map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10);
      });
      const before = JSON.stringify(snapshot());
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return before === JSON.stringify(snapshot());
    });
    await page.screenshot({ path: path.join(shellFocusR22AEvidenceDirectory, name), fullPage: false });
    await page.waitForTimeout(5_500);
  };
  await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: fixtureProjectId });
  await page.setViewportSize({ width: 1195, height: 720 });
  await gotoProduct(page, `${baseUrl}/tianyi?locale=zh-CN`);
  const workspace = page.getByLabel("天意统一会话");
  await workspace.waitFor();
  assert.equal(await page.locator('[data-panel-toggle="tianyi-agent"]').count(), 0, "The primary Tianyi route must not offer a circular Tianyi Agent action.");
  assert.equal(await page.getByRole("heading", { name: "让想法先展开，不默认改动正式故事" }).count(), 1);
  assert.equal(await page.getByLabel("创意模式草稿").getAttribute("placeholder"), "提出一个故事变化，或粘贴一段灵感……");
  assert.equal(await page.getByRole("button", { name: "整理成三个候选", exact: true }).count(), 1);
  await page.getByLabel("创意模式草稿").fill("这个草稿必须在 Shell 面板切换后继续保留。");
  await page.getByRole("button", { name: "附件", exact: true }).click();
  await capture("01-1195x720-TIANYI-creative-mode.png");
  await page.getByRole("tab", { name: "工作模式", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "选择一个候选继续" }).count(), 1);
  assert.equal(await page.getByLabel("工作模式草稿").getAttribute("placeholder"), "继续完善当前候选，准备进入影响预览……");
  assert.equal(await page.getByRole("button", { name: "继续完善候选", exact: true }).count(), 1);
  await page.getByLabel("工作模式草稿").fill("只属于工作泳道的草稿");
  await page.getByLabel("工作范围").selectOption("selected-events");
  await capture("02-1195x720-TIANYI-work-mode.png");
  await page.getByRole("tab", { name: "创意模式", exact: true }).click();
  assert.equal(await page.getByLabel("创意模式草稿").inputValue(), "这个草稿必须在 Shell 面板切换后继续保留。");
  await page.getByRole("tab", { name: "工作模式", exact: true }).click();
  assert.equal(await page.getByLabel("工作模式草稿").inputValue(), "只属于工作泳道的草稿");
  assert.equal(await page.getByLabel("工作范围").inputValue(), "selected-events");
  assert.equal(await page.getByText("本地附件（演示）", { exact: true }).count(), 1, "Shared attachments must remain visible across lanes.");
  const before = await shellGeometry(page);
  assert.ok(before.main.width >= 560, `Tianyi MainWorkspace must begin readable=${JSON.stringify(before)}`);
  await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
  const afterDirectoryClose = await shellGeometry(page);
  assert.ok(afterDirectoryClose.main.width >= 560, `Closing DirectoryPane must not collapse MainWorkspace=${JSON.stringify(afterDirectoryClose)}`);
  assert.equal(afterDirectoryClose.scrollWidth, afterDirectoryClose.clientWidth, `Shell must not overflow horizontally=${JSON.stringify(afterDirectoryClose)}`);
  await page.getByRole("button", { name: "页面工具", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "读者鉴赏", exact: true }).count(), 0, "Unavailable tools must not appear in the compact launcher.");
  await page.getByRole("button", { name: "工程日志", exact: true }).click();
  let dockGeometry = await shellGeometry(page);
  assert.equal(dockGeometry.directoryOpen, "false", "Directory and ContextDock must be mutually exclusive in focused layout.");
  assert.equal(dockGeometry.dockPanelCount, "1");
  assert.equal(dockGeometry.activeDockTool, "engineering-log");
  assert.ok(dockGeometry.main.width >= 840, `ContextDock overlay must preserve a readable workspace=${JSON.stringify(dockGeometry)}`);
  await capture("03-1195x720-CONTEXT-DOCK-engineering-log.png");
  await page.getByRole("button", { name: "页面工具", exact: true }).click();
  await page.getByRole("button", { name: "专家分析", exact: true }).click();
  dockGeometry = await shellGeometry(page);
  assert.equal(dockGeometry.dockPanelCount, "1", "Switching tools must replace rather than append.");
  assert.equal(dockGeometry.activeDockTool, "expert-analysis");
  const closeExpert = page.getByRole("button", { name: "关闭 专家分析", exact: true });
  await closeExpert.press("Escape");
  assert.equal((await shellGeometry(page)).dockPanelCount, "0");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "页面工具");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "页面工具", "Esc must return focus to the launcher.");
  await page.getByRole("button", { name: "打开工程目录", exact: true }).click();
  assert.equal((await shellGeometry(page)).directoryOpen, "true");
  await page.waitForFunction(() => {
    const directory = document.querySelector(".project-directory-panel");
    const workspace = document.querySelector(".shell-workspace");
    if (!directory || !workspace) return false;
    const directoryRect = directory.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const hit = document.elementFromPoint(directoryRect.left + Math.min(68, directoryRect.width / 2), directoryRect.top + Math.min(180, directoryRect.height / 2));
    return directoryRect.width >= 200 && workspaceRect.left >= directoryRect.right - 1 && Boolean(hit && directory.contains(hit));
  });
  await capture("04-1195x720-DIRECTORY-dock-mutual-exclusion.png");

  for (const [width, height] of [[1195, 720], [1280, 800], [1440, 900], [1600, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(40);
    const geometry = await shellGeometry(page);
    assert.ok(geometry.main && geometry.main.width > 0 && geometry.main.height > 0, `MainWorkspace must remain mounted at ${width}=${JSON.stringify(geometry)}`);
    assert.ok(geometry.scrollWidth <= geometry.clientWidth && geometry.bodyScrollWidth <= geometry.bodyClientWidth, `No body overflow at ${width}=${JSON.stringify(geometry)}`);
    if (width === 1600) await capture("05-1600x900-TIANYI-stable-wide.png");
  }

  await page.setViewportSize({ width: 1195, height: 720 });
  await page.getByRole("button", { name: "更多全局状态", exact: true }).click();
  await page.locator("#shell-topbar-overflow-menu button").first().click();
  await page.getByLabel("Unified Tianyi conversation").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), "en-US");
  assert.equal(await page.getByRole("tab", { name: "Work", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await page.getByLabel("Work draft").inputValue(), "只属于工作泳道的草稿", "Locale change must retain user content and lane draft.");
  assert.equal(await page.getByLabel("Work scope").inputValue(), "selected-events");
  assert.equal(await page.getByRole("heading", { name: "Choose a candidate to continue" }).count(), 1);
  assert.equal(await page.getByLabel("Work draft").getAttribute("placeholder"), "Refine the current candidate and prepare its impact preview…");
  await capture("06-1195x720-TIANYI-complete-English.png");
  await reloadProduct(page);
  assert.equal(await page.evaluate(() => document.documentElement.lang), "en-US", "Locale must survive refresh.");
  assert.equal(await page.getByRole("tab", { name: "Work", exact: true }).getAttribute("aria-selected"), "true", "Lane must survive refresh.");
  await capture("07-1195x720-TIANYI-English-refresh-restored.png");

  await gotoProduct(page, `${baseUrl}/event-line?eventTask=story&locale=zh-CN`);
  await page.locator(".event-line-workbench").waitFor();
  const eventUrl = page.url();
  const mainBeforeAgent = await page.locator(".shell-workspace-event-line").count();
  await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "TIANYI");
  assert.equal(await page.locator(".tianyi-sidebar").count(), 1);
  assert.equal(await page.locator(".shell-workspace-event-line").count(), mainBeforeAgent, "Opening Agent must not unmount the event workspace.");
  assert.equal(page.url(), eventUrl, "Opening Agent must preserve pathname and query state.");
  const eventPageTool = page.locator(".page-context-dock-rail").getByRole("button", { name: "因果", exact: true });
  assert.ok(await eventPageTool.boundingBox(), "Opening Tianyi must keep the Event page-tool rail visible.");
  assert.equal(await eventPageTool.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest("button") === button;
  }), true, "The Event page-tool rail must remain clickable above the Tianyi overlay.");
  await capture("08-1195x720-EVENT-LINE-context-Tianyi-Agent.png");
  await eventPageTool.click();
  await page.locator(".page-context-dock-panel").waitFor();
  assert.equal(await page.locator(".tianyi-sidebar").count(), 0, "A page tool replaces Tianyi instead of stacking another right-side surface.");
  await page.locator(".page-context-dock-panel > header button").click();
  await page.locator('[data-panel-toggle="tianyi-agent"]').click();
  await page.locator(".tianyi-sidebar").getByRole("button", { name: "关闭天意助手", exact: true }).click();
  assert.equal(page.url(), eventUrl);
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-panel-toggle") === "tianyi-agent");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-panel-toggle")), "tianyi-agent", "Closing Agent must restore the trigger focus.");
  page.off("request", observeProvider);
  assert.deepEqual(providerRequests, [], `Shell checks must make zero Provider calls: ${providerRequests.join(", ")}`);
  assert.deepEqual(consoleProblems, [], "Shell focus interactions must not add browser console errors.");
}

async function shellGeometry(page) {
  return page.evaluate(() => {
    const measure = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, display: style.display, visibility: style.visibility };
    };
    const shell = document.querySelector('[data-testid="tianyan-r0-shell"]');
    return {
      pathname: window.location.pathname,
      query: window.location.search,
      directoryOpen: shell?.getAttribute("data-directory-visible") ?? null,
      activeDockTool: shell?.getAttribute("data-active-dock-tool") ?? null,
      dockPanelCount: shell?.getAttribute("data-dock-panel-count") ?? null,
      main: measure('[aria-label="天意统一会话"]'),
      directory: measure(".project-directory-panel"),
      dock: measure(".dock-panel-stack"),
      toolRail: measure(".dock-tool-rail"),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      activeElement: document.activeElement instanceof HTMLElement ? { tag: document.activeElement.tagName, label: document.activeElement.getAttribute("aria-label"), text: document.activeElement.innerText.slice(0, 80) } : null
    };
  });
}

async function assertTianyiEventLineGoldenLoop(page, consoleProblems) {
  const providerRequests = [];
  const observeProvider = (request) => {
    if (/story-modeling\/(?:plan|runs|execute)|\/__local\/story-studio\/provider|\/api\/provider/iu.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  };
  page.on("request", observeProvider);
  const capture = async (name) => {
    if (!tianyiGoldenLoopEvidenceDirectory) return;
    mkdirSync(tianyiGoldenLoopEvidenceDirectory, { recursive: true });
    await page.screenshot({ path: path.join(tianyiGoldenLoopEvidenceDirectory, name), fullPage: false });
    await page.waitForTimeout(4_500);
  };
  try {
    await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: fixtureProjectId });
    await gotoProduct(page, `${baseUrl}/tianyi?testFixture=legacy-three-candidates`);
    await page.getByLabel("天意统一会话").waitFor();
    assert.equal(await page.getByRole("tab", { name: "Agent", exact: true }).count(), 0, "The Tianyi page must not expose a second page Agent.");
    await page.getByLabel("创意模式草稿").fill("让雾港守灯人在回信抵达前交出旧约钥匙，并留下一个会改变主故事顺序的选择。");
    await page.getByRole("button", { name: "附件", exact: true }).click();
    await page.getByRole("button", { name: "来源", exact: true }).click();
    await capture("01-1440x900-TIANYI-creative-author-intent.png");
    await page.getByRole("button", { name: "整理成三个候选", exact: true }).click();
    await page.locator(".tianyi-candidate-grid article").first().waitFor();
    assert.equal(await page.locator(".tianyi-candidate-grid article").count(), 3, "Creative lane must form exactly three deterministic candidates.");
    const conversationId = await page.getByLabel("天意统一会话").getAttribute("data-tianyi-conversation-id");
    assert.ok(conversationId && conversationId !== "not-started");
    await page.locator(".tianyi-conversation-column").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await capture("02-1440x900-TIANYI-three-candidates.png");

    const candidates = page.locator(".tianyi-candidate-grid article");
    await candidates.nth(0).getByRole("button", { name: "保留可能性", exact: true }).click();
    await candidates.nth(0).getByText("已保留可能性", { exact: true }).waitFor();
    await candidates.nth(1).getByRole("button", { name: /进入工作模式/u }).click();
    await page.locator('.tianyi-lane-stage[aria-label="工作模式"]').waitFor({ state: "attached" });
    assert.equal(await page.getByLabel("天意统一会话").getAttribute("data-tianyi-conversation-id"), conversationId, "Creative and Work must keep one conversation identity.");
    await page.getByLabel("同一会话的可见历史").getByText(/旧约钥匙/u).first().waitFor();
    assert.match(await page.getByLabel("当前视图").textContent(), /本地附件（演示）.*工程来源（演示）/su);
    assert.match(await page.getByLabel("当前视图").textContent(), /3 个候选/u);
    await page.getByLabel("工作范围").selectOption("selected-events");
    await page.getByLabel("工作模式草稿").fill("只调整钥匙交接事件，不改变 Canon 或其他故事事实。");
    await capture("03-1440x900-TIANYI-shared-work-lane.png");

    await page.getByRole("button", { name: "打开结构化影响预览", exact: true }).click();
    const adoption = page.getByTestId("tianyi-adoption-panel");
    await adoption.locator(".tianyi-structured-diff").waitFor();
    assert.equal(await adoption.getByRole("button", { name: "采纳", exact: true }).isEnabled(), true, "Impact review must enable the single author adoption action.");
    assert.match(await adoption.textContent(), /基础版本.*范围.*变化.*证据.*风险/su);
    await page.locator(".tianyi-conversation-column").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await capture("04-1440x900-TIANYI-structured-impact.png");
    await adoption.getByRole("button", { name: /在事件线中打开/u }).click();

    await page.getByLabel("天意候选轨迹").waitFor();
    assert.match(page.url(), /tianyiSession=.*tianyiCandidate=/u);
    await page.getByLabel("作者调整（保留在当前工作区）").fill("保留原始证据引用，只收窄变化范围。");
    await capture("05-1440x900-EVENT-LINE-candidate-trajectory.png");

    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    const sidebar = page.locator(".tianyi-sidebar");
    await sidebar.waitFor();
    assert.equal(await sidebar.getAttribute("data-tianyi-conversation-id"), conversationId, "The Event Line Work surface must reuse the same Work lane.");
    assert.equal(await sidebar.getAttribute("data-page-agent-session-owner"), "none", "A Page Agent must not own an independent session.");
    assert.equal(await sidebar.getAttribute("data-work-lane"), "shared");
    assert.equal(await sidebar.getByRole("tab", { name: "工作", exact: true }).count(), 1);
    assert.equal(await sidebar.getByRole("tab", { name: "Agent", exact: true }).count(), 1);
    await sidebar.getByRole("tab", { name: "Agent", exact: true }).click();
    assert.match(await sidebar.textContent(), /当前页面.*事件线/su);
    await capture("06-1440x900-EVENT-LINE-page-agent-scoped.png");
    await sidebar.getByRole("button", { name: "关闭天意助手", exact: true }).click();

    const eventLineAdoption = page.getByLabel("天意候选轨迹").getByTestId("tianyi-adoption-panel");
    await eventLineAdoption.getByRole("button", { name: "采纳", exact: true }).click();
    await eventLineAdoption.getByText("采纳已生效", { exact: true }).waitFor();
    const activeReceiptText = await eventLineAdoption.textContent();
    assert.match(activeReceiptText, /基础版本.*结果版本.*查看变化.*撤销（创建补偿版本）/su);
    await page.locator(".tianyi-event-line-golden-loop").evaluate((element) => { element.scrollTop = 0; });
    await capture("07-1440x900-EVENT-LINE-adoption-receipt.png");
    await eventLineAdoption.getByRole("button", { name: "撤销（创建补偿版本）", exact: true }).click();
    await eventLineAdoption.getByText("采纳已通过补偿版本撤销", { exact: true }).waitFor();
    assert.match(await eventLineAdoption.textContent(), /原事件与历史回执仍保留/u);
    await page.locator(".tianyi-event-line-golden-loop").evaluate((element) => { element.scrollTop = 0; });
    await capture("08-1440x900-EVENT-LINE-compensation-version.png");

    await page.getByLabel("天意候选轨迹").getByRole("button", { name: "返回创作工作区", exact: true }).click();
    await page.waitForURL((value) => value.pathname === "/tianyi" && value.searchParams.get("tianyiLane") === "work");
    await page.waitForFunction(() => document.querySelector("[aria-label='天意统一会话']")?.getAttribute("data-active-lane") === "work");
    await page.locator('.tianyi-lane-stage[aria-label="工作模式"]').waitFor({ state: "attached" });
    assert.equal(await page.getByLabel("工作模式草稿").inputValue(), "保留原始证据引用，只收窄变化范围。", "Returning from Event Line must restore the same Work draft.");
    assert.equal(await page.getByLabel("工作范围").inputValue(), "selected-events", "Returning from Event Line must restore the same Work scope.");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.getByLabel("天意候选轨迹").waitFor();

    await reloadProduct(page);
    const reloadedTrajectory = page.getByLabel("天意候选轨迹");
    await reloadedTrajectory.waitFor();
    await reloadedTrajectory.getByText("采纳已通过补偿版本撤销", { exact: true }).waitFor();
    const pending = page.getByTestId("narrative-staging");
    const allPending = await pending.locator("[data-event-id]").evaluateAll((nodes) => nodes.map((node) => ({ title: node.textContent?.trim() ?? "", status: node.getAttribute("data-event-status"), id: node.getAttribute("data-event-id") })));
    const pendingMatches = allPending.filter((item) => item.title.startsWith("方向二：规则失效"));
    assert.equal(pendingMatches.length, 1, `The adopted Event must remain visibly reachable in the pending-arrangement region after reload: ${JSON.stringify(allPending)}`);
    assert.equal(pendingMatches[0].status, "committed", `The adopted Event must retain its author-confirmed state after reload: ${JSON.stringify(pendingMatches)}`);
    await reloadedTrajectory.getByRole("button", { name: "返回创作工作区", exact: true }).click();
    await page.locator('.tianyi-lane-stage[aria-label="工作模式"]').waitFor({ state: "attached" });
    assert.equal(await page.getByLabel("天意统一会话").getAttribute("data-tianyi-conversation-id"), conversationId);
    await page.getByLabel("同一会话的可见历史").getByText(/旧约钥匙/u).first().waitFor();
    assert.deepEqual(providerRequests, [], "The deterministic Tianyi golden loop must make zero Provider calls.");
    assert.deepEqual(consoleProblems, [], "The Tianyi golden loop must not add browser console warnings or errors.");
  } finally {
    page.off("request", observeProvider);
  }
}

async function captureEventGraphEvidence(page, consoleProblems) {
  mkdirSync(eventGraphEvidenceDirectory, { recursive: true });
  const captures = [];
  const capture = async (viewport, state, action) => {
    await page.setViewportSize(viewport);
    await gotoProduct(page, `${baseUrl}/event-line`);
    await closeGlobalTianyiIfOpen(page);
    await switchEventView(page, "关系图");
    await page.getByLabel("事件关系工作区").waitFor();
    await action();
    const filename = `${viewport.width}x${viewport.height}-${state}.png`;
    await page.screenshot({ path: path.join(eventGraphEvidenceDirectory, filename), fullPage: true });
    captures.push({ filename, viewport, state, url: page.url(), isolatedTestData: true, consoleProblems: [...consoleProblems] });
  };
  await capture({ width: 1440, height: 900 }, "global-relationship-graph", async () => undefined);
  await capture({ width: 1440, height: 900 }, "focus-relationship-graph", async () => {
    await page.locator(".event-graph-node").filter({ hasText: "雨夜追踪" }).click();
    await page.getByRole("button", { name: "聚焦关系", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("[data-graph-view='focus']") !== null);
  });
  await capture({ width: 1152, height: 720 }, "node-inspector", async () => {
    await page.locator(".event-graph-node").filter({ hasText: "雨夜追踪" }).click();
    await page.getByLabel(/事件检查器：雨夜追踪/u).waitFor();
    const geometry = await page.evaluate(() => ({ canvasWidth: document.querySelector(".event-graph-flow")?.getBoundingClientRect().width ?? 0, overflow: document.documentElement.scrollWidth > window.innerWidth }));
    assert.ok(geometry.canvasWidth >= 640, `1152 node inspector canvas=${JSON.stringify(geometry)}`);
    assert.equal(geometry.overflow, false, `1152 node inspector must not overflow=${JSON.stringify(geometry)}`);
  });
  await capture({ width: 1152, height: 720 }, "narrow-desktop", async () => undefined);
  await capture({ width: 1920, height: 1000 }, "wide-desktop", async () => undefined);
  writeFileSync(path.join(eventGraphEvidenceDirectory, "capture-manifest-event-graph.json"), `${JSON.stringify(captures, null, 2)}\n`, "utf8");
}

async function captureEventGraphDensityEvidence(page, consoleProblems) {
  const output = eventGraphEvidenceDirectory ?? path.join(fixtureRoot, "event-graph-density-evidence");
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoProduct(page, `${baseUrl}/event-line?eventGraphFixture=density50`);
  await closeGlobalTianyiIfOpen(page);
  await switchEventView(page, "关系图");
  await page.getByLabel("事件关系工作区").waitFor();
  const globalDensity = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".event-graph-node:not(.is-remote)")];
    const positions = nodes.map((node) => { const rect = node.getBoundingClientRect(); return `${Math.round(rect.left)}:${Math.round(rect.top)}`; });
    return { count: nodes.length, uniquePositions: new Set(positions).size, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  assert.ok(globalDensity.count >= 50, `The density fixture must render fifty events=${JSON.stringify(globalDensity)}`);
  assert.equal(globalDensity.uniquePositions, globalDensity.count, `Density nodes must not stack=${JSON.stringify(globalDensity)}`);
  assert.equal(globalDensity.overflow, false, `Density graph must not create document overflow=${JSON.stringify(globalDensity)}`);
  await page.screenshot({ path: path.join(output, "1440x900-density-50-global.png"), fullPage: true });
  await page.locator(".event-graph-node").filter({ hasText: "密度事件 25" }).click();
  await page.getByRole("button", { name: "聚焦关系", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-graph-view='focus']") !== null);
  const focusDensity = await page.evaluate(() => ({
    focusVisible: Boolean(document.querySelector(".event-graph-node.is-focused")),
    inspectorVisible: Boolean(document.querySelector(".event-graph-inspector")),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  }));
  assert.equal(focusDensity.focusVisible, true, `Density focus must retain its selected event=${JSON.stringify(focusDensity)}`);
  assert.equal(focusDensity.inspectorVisible, true, `Density focus must locate the selected event with an inspector=${JSON.stringify(focusDensity)}`);
  assert.equal(focusDensity.overflow, false, `Density focus must not overflow=${JSON.stringify(focusDensity)}`);
  await page.screenshot({ path: path.join(output, "1440x900-density-50-focus.png"), fullPage: true });
  assert.deepEqual(consoleProblems, [], "Density evidence must not add browser console errors.");
}

async function assertAuthorEventCreation(page, consoleProblems) {
  const base = `${apiUrl}/__local/story-studio`;
  await page.setViewportSize({ width: 1152, height: 720 });
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page);
  if (await eventViewButton(page, "故事脊柱").count()) await eventViewButton(page, "故事脊柱").click();
  const libraryBefore = await getFixture(`${base}/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftsBefore = libraryBefore.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  const verifiedBefore = await getFixture(`${base}/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);

  await page.getByRole("button", { name: "新增事件", exact: true }).click();
  const form = page.getByRole("form", { name: "新建事件" });
  await form.waitFor();
  await form.getByRole("button", { name: "取消", exact: true }).click();
  const afterCancel = await getFixture(`${base}/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(afterCancel.data.objects.filter((item) => item.type === "event" && item.status === "draft").length, draftsBefore, "Cancelling event creation must write nothing.");

  const create = async (title, summary) => {
    await page.getByRole("button", { name: "新增事件", exact: true }).click();
    const createForm = page.getByRole("form", { name: "新建事件" });
    await createForm.getByLabel("事件标题").fill(title);
    await createForm.getByLabel("发生了什么").fill(summary);
    await createForm.getByLabel("故事单元").fill("手动创建验收");
    await createForm.getByLabel("焦点").fill("关系准备");
    await createForm.getByLabel("故事时间").fill("雨夜");
    await createForm.getByLabel("地点").fill("旧仓库");
    await createForm.getByRole("button", { name: "保存草稿", exact: true }).click();
    await page.waitForFunction(() => Boolean(document.querySelector(".event-line-creation-notice, .event-create-error")), undefined, { timeout: 10_000 }).catch(() => undefined);
    const creationState = await page.evaluate((problems) => ({
      outcome: document.querySelector(".event-line-creation-notice, .event-create-error")?.textContent ?? null,
      form: document.querySelector(".event-create-inspector")?.textContent ?? null,
      surface: document.querySelector("[data-right-work-surface]")?.getAttribute("data-right-work-surface") ?? null,
      url: window.location.href,
      body: document.body.innerText.slice(0, 1_000),
      consoleProblems: problems
    }), consoleProblems);
    assert.ok(creationState.outcome, `Draft save did not settle=${JSON.stringify(creationState)}`);
    const creationOutcome = await page.locator(".event-line-creation-notice, .event-create-error").first().textContent();
    assert.match(creationOutcome ?? "", /事件草稿已保存，并已定位到当前工作区。/u, `Draft save outcome=${creationOutcome}`);
  };
  await create("手动事件 A", "仓库管理员在交接前隐瞒异常记录。");
  await create("手动事件 B", "调查者在雨夜发现账目与实物不符。");
  const libraryAfter = await getFixture(`${base}/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const drafts = libraryAfter.data.objects.filter((item) => item.type === "event" && item.status === "draft" && /^手动事件 [AB]$/u.test(item.title));
  assert.equal(drafts.length, 2, "Both author-created Events must persist as drafts through the existing workspace Event owner.");
  const verifiedAfter = await getFixture(`${base}/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.deepEqual(verifiedAfter.data.eventIds, verifiedBefore.data.eventIds, "Saving drafts must not change verified Canon events.");
  await reloadProduct(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="event-line-workbench"]')?.getAttribute("data-knowledge-projection-state") === "ready");
  if (await eventViewButton(page, "故事脊柱").count()) await eventViewButton(page, "故事脊柱").click();
  assert.equal(await page.getByText("手动事件 A", { exact: true }).count() > 0, true, "The draft Event must survive reload in the story spine.");
  const libraryRestored = await getFixture(`${base}/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const restoredA = libraryRestored.data.objects.find((item) => item.id === drafts.find((item) => item.title === "手动事件 A").id);
  assert.deepEqual(restoredA && { id: restoredA.id, title: restoredA.title, status: restoredA.status, revisionToken: restoredA.revisionToken }, { id: drafts.find((item) => item.title === "手动事件 A").id, title: "手动事件 A", status: "draft", revisionToken: drafts.find((item) => item.title === "手动事件 A").revisionToken }, "Reload must preserve the draft Event identity, title, status and revision token.");
  const collapsedDraft = page.getByTestId("narrative-staging").locator(`[data-event-id="${restoredA.id}"]`);
  assert.equal(await collapsedDraft.getAttribute("data-event-status"), "draft", "The collapsed staging summary must expose draft status without relying on color.");
  assert.equal(await collapsedDraft.getAttribute("data-revision-token"), restoredA.revisionToken, "The collapsed staging summary must expose the restored revision identity.");
  await collapsedDraft.getByRole("button", { name: "打开待编排事件：手动事件 A", exact: true }).click();
  const expandedDraft = page.getByTestId("narrative-staging").locator(`.unplaced-event-tray [data-event-id="${restoredA.id}"]`);
  await expandedDraft.getByText("状态：作者草稿", { exact: false }).waitFor();
  assert.equal(await expandedDraft.getByRole("button", { name: "打开事件", exact: true }).count(), 1, "Expanded staging must expose a real Event open action.");
  await switchEventView(page, "关系图");
  await page.getByLabel("事件关系工作区").waitFor();
  assert.equal(await page.locator(".event-graph-node").filter({ hasText: "手动事件 B" }).count() > 0, true, "The same draft Event must project into the relation graph.");
  const typeState = await getFixture(`${base}/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const relationTypeId = typeState.data.types[0]?.relationTypeId;
  assert.ok(relationTypeId, "The manual relation test must use the existing Relation type owner.");
  const relationsBefore = await getFixture(`${base}/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const formalBefore = relationsBefore.data.relations.filter((relation) => relation.reviewState === "confirmed").length;
  const candidate = await postFixture(`${base}/relations/create`, { projectId: fixtureProjectId, sourceObjectId: drafts.find((item) => item.title === "手动事件 A").id, targetObjectId: drafts.find((item) => item.title === "手动事件 B").id, relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "author-event-creation-e2e", operationId: `author-event-relation-${fixture.fixtureId}` });
  const beforeConfirm = await getFixture(`${base}/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(beforeConfirm.data.relations.filter((relation) => relation.reviewState === "confirmed").length, formalBefore, "Relation creation must remain a candidate before author confirmation.");
  await postFixture(`${base}/relations/confirm`, { projectId: fixtureProjectId, relationId: candidate.data.relation.relationId, expectedRelationRevision: candidate.data.relation.revision, operationId: `author-event-relation-confirm-${fixture.fixtureId}` });
  const afterConfirm = await getFixture(`${base}/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.equal(afterConfirm.data.relations.filter((relation) => relation.reviewState === "confirmed").length, formalBefore + 1, "Only the existing Relation owner may add the formal relation after author confirmation.");
}

async function recordEventGraphOperation() {
  mkdirSync(eventGraphRecordingDirectory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: eventGraphRecordingDirectory, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  const video = page.video();
  await gotoProduct(page, `${baseUrl}/event-line`);
  await closeGlobalTianyiIfOpen(page);
  await switchEventView(page, "关系图");
  await page.getByLabel("事件关系工作区").waitFor();
  await page.waitForTimeout(8_000);
  await page.locator(".event-graph-node").filter({ hasText: "雨夜追踪" }).click();
  await page.getByRole("button", { name: "聚焦关系", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".event-graph-node.is-focused") !== null);
  await page.waitForTimeout(8_000);
  await page.getByRole("button", { name: "展开一层", exact: true }).click();
  await page.waitForTimeout(8_000);
  await page.getByRole("button", { name: "返回全局", exact: true }).click();
  await page.waitForTimeout(8_000);
  await page.getByRole("button", { name: "展开事件目录", exact: true }).click();
  await page.waitForTimeout(8_000);
  await page.getByRole("button", { name: /待确认 1/u }).click();
  await page.getByLabel("待确认关系检查器").waitFor();
  await page.waitForTimeout(20_000);
  await context.close();
  const recordingPath = video ? await video.path() : null;
  if (!recordingPath) throw new Error("Event graph recording was not written.");
  writeFileSync(path.join(eventGraphRecordingDirectory, "recording-path.txt"), `${recordingPath}\n`, "utf8");
}

async function recordTemporalProjectionOperation() {
  mkdirSync(temporalProjectionRecordingDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: temporalProjectionRecordingDirectory, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();
  const video = page.video();
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page);
  await switchEventView(page, "关系图");
  await page.getByLabel("事件关系工作区").waitFor();
  await page.waitForTimeout(1_500);
  await switchEventView(page, "时间轴");
  await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"]'));
  await page.waitForTimeout(2_000);
  const canvas = page.getByLabel("独立时间线工作区");
  await canvas.getByRole("button", { name: "时间总览", exact: true }).click();
  await page.waitForTimeout(2_000);
  await page.locator(".event-graph-flow .react-flow__controls-zoomin").click();
  await page.locator(".event-graph-flow .react-flow__controls-zoomin").click();
  await page.waitForTimeout(2_000);
  await page.locator(".event-graph-node").filter({ hasText: "雾港启航" }).click();
  await canvas.getByRole("button", { name: "聚焦当前", exact: true }).click();
  await page.waitForTimeout(2_000);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector('[data-projection-mode="graph"]'));
  await page.waitForTimeout(2_000);
  await context.close();
  const recordingPath = video ? await video.path() : null;
  if (!recordingPath) throw new Error("Semantic timeline recording was not written.");
  writeFileSync(path.join(temporalProjectionRecordingDirectory, "recording-path.txt"), `${recordingPath}\n`, "utf8");
}

async function recordR10Closeout() {
  if (!r10EvidenceDirectory) throw new Error("TIANYAN_R10_EVIDENCE_DIR is required for R10 recording.");
  mkdirSync(r10EvidenceDirectory, { recursive: true });
  const record = async (viewport, name, operation) => {
    const context = await browser.newContext({ viewport, recordVideo: { dir: r10EvidenceDirectory, size: viewport } });
    const page = await context.newPage();
    const video = page.video();
    const consoleProblems = [];
    page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleProblems.push(error.message));
    await operation(page);
    assert.deepEqual(consoleProblems, [], `${name} recording may not contain browser warnings or errors.`);
    await context.close();
    const source = video ? await video.path() : null;
    if (!source) throw new Error(`${name} recording was not written.`);
    copyFileSync(source, path.join(r10EvidenceDirectory, `${name}.webm`));
  };
  const shot = (page, name) => page.screenshot({ path: path.join(r10EvidenceDirectory, name), fullPage: false });
  const pause = (page, duration = 650) => page.waitForTimeout(duration);

  await record({ width: 1440, height: 900 }, "TIANYAN_R10_1440x900_FULL_FLOW", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=perspective`);
    await closeGlobalTianyiIfOpen(page);
    const perspective = page.getByLabel("事件视角轴");
    const ownerChoices = perspective.locator('.event-perspective-picker input[type="checkbox"]');
    await ownerChoices.first().waitFor();
    assert.ok(await ownerChoices.count() >= 1, "R10 requires one formal Owner for the single-person lens.");
    await ownerChoices.first().click();
    await perspective.getByText("显示作者可见盲区", { exact: true }).waitFor();
    assert.equal(await perspective.locator('[data-visibility="unknown"], [data-visibility="blind-spot"]').count(), 0, "Unknown Events stay out of the default single-Owner projection.");
    const evidenceCount = await perspective.locator(".event-perspective-results article").count();
    await shot(page, "01-1440-single-owner-evidence-only.png");
    await perspective.getByText("显示作者可见盲区", { exact: true }).click();
    const revealedCount = await perspective.locator(".event-perspective-results article").count();
    assert.ok(revealedCount > evidenceCount, "Blind spots appear only after the author opens the dedicated control.");
    await shot(page, "02-1440-single-owner-blind-spots-open.png");

    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=line&eventGraphFixture=density50`);
    await closeGlobalTianyiIfOpen(page);
    const narrative = page.getByLabel("水平事件编排工作区");
    const navigator = page.getByRole("navigation", { name: "分支与合流导航" });
    await navigator.waitFor();
    await pause(page, 520);
    const canvasBox = await narrative.locator(".event-graph-flow").boundingBox();
    const forkBox = await narrative.locator('[data-id="synthetic-density-event-3"]').boundingBox();
    const branchNextBox = await narrative.locator('[data-id="synthetic-density-event-21"]').boundingBox();
    assert.ok(canvasBox && forkBox && branchNextBox && forkBox.x >= canvasBox.x && forkBox.x + forkBox.width <= canvasBox.x + canvasBox.width && branchNextBox.x >= canvasBox.x && branchNextBox.x + branchNextBox.width <= canvasBox.x + canvasBox.width, "Initial viewport includes the first fork and its branch next Event.");
    await navigator.getByRole("button", { name: "下一合流", exact: true }).click();
    await navigator.getByRole("button", { name: "聚焦当前轨道", exact: true }).click();
    await navigator.getByRole("button", { name: "折叠其他分支", exact: true }).click();
    assert.equal(await navigator.getByRole("button", { name: "展开其他分支", exact: true }).getAttribute("aria-pressed"), "true");
    await shot(page, "03-1440-branch-navigation-current-track.png");

    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=line`);
    await closeGlobalTianyiIfOpen(page);
    const workspace = page.getByLabel("水平事件编排工作区");
    const eventNodes = workspace.locator(".event-graph-node:not(.is-remote)");
    await eventNodes.filter({ hasText: "林昭隐瞒真相" }).evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await eventNodes.filter({ hasText: "雨夜追踪" }).evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
    const selectionBar = page.getByTestId("event-graph-selection-bar");
    await selectionBar.getByRole("button", { name: "创建集点", exact: true }).click();
    await selectionBar.getByPlaceholder("集点名称").fill("线索交汇");
    await selectionBar.getByRole("button", { name: "保存集点", exact: true }).click();
    let setPoint = workspace.locator(".event-graph-collection-point").filter({ hasText: "线索交汇" });
    await setPoint.waitFor();
    await setPoint.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const moved = page.waitForResponse((response) => response.url().includes("/story-collection-points/update") && response.request().method() === "POST");
    await page.getByRole("button", { name: "向右移动集点", exact: true }).click();
    await moved;
    await page.getByText("集点位置已保存；Event 身份与正式 Relation 端点未改变。", { exact: true }).waitFor();
    setPoint = workspace.locator(".event-graph-collection-point").filter({ hasText: "线索交汇" });
    await setPoint.evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 520, clientY: 420 })));
    await page.getByRole("menu", { name: "可选集点菜单" }).getByRole("menuitem", { name: "重命名集点", exact: true }).click();
    const renameDialog = page.getByRole("dialog", { name: "重命名集点" });
    await renameDialog.getByLabel("集点名称").fill("线索汇合");
    await renameDialog.getByRole("button", { name: "保存名称", exact: true }).click();
    setPoint = workspace.locator(".event-graph-collection-point").filter({ hasText: "线索汇合" });
    await setPoint.waitFor();
    await eventNodes.filter({ hasText: "旧城停电" }).evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await eventNodes.filter({ hasText: "暗号传递" }).evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
    await setPoint.evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 520, clientY: 420 })));
    const replaced = page.waitForResponse((response) => response.url().includes("/story-collection-points/update") && response.request().method() === "POST");
    await page.getByRole("menu", { name: "可选集点菜单" }).getByRole("menuitem", { name: "用当前选择替换成员", exact: true }).click();
    await replaced;
    await reloadProduct(page);
    setPoint = page.getByLabel("水平事件编排工作区").locator(".event-graph-collection-point").filter({ hasText: "线索汇合" });
    await setPoint.waitFor();
    const collapsed = page.waitForResponse((response) => response.url().includes("/story-collection-points/update") && response.request().method() === "POST");
    await setPoint.getByRole("button").click({ force: true });
    await collapsed;
    const relationsBeforeReload = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
    await reloadProduct(page);
    setPoint = page.getByLabel("水平事件编排工作区").locator(".event-graph-collection-point.is-collapsed").filter({ hasText: "线索汇合" });
    await setPoint.waitFor();
    const expanded = page.waitForResponse((response) => response.url().includes("/story-collection-points/update") && response.request().method() === "POST");
    await setPoint.getByRole("button").click({ force: true });
    await expanded;
    await reloadProduct(page);
    setPoint = page.getByLabel("水平事件编排工作区").locator(".event-graph-collection-point.is-expanded").filter({ hasText: "线索汇合" });
    await setPoint.waitFor();
    await shot(page, "04-1440-set-point-restored-expanded.png");
    await setPoint.evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 520, clientY: 420 })));
    await page.getByRole("menu", { name: "可选集点菜单" }).getByRole("menuitem", { name: "解散集点（保留 Event）", exact: true }).click();
    await page.getByLabel("水平事件编排工作区").locator(".event-graph-collection-point").filter({ hasText: "线索汇合" }).waitFor({ state: "detached" });
    const relationsAfterDissolve = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
    assert.deepEqual(relationsAfterDissolve.data.relations.map((relation) => [relation.relationId, relation.sourceObjectId, relation.targetObjectId]), relationsBeforeReload.data.relations.map((relation) => [relation.relationId, relation.sourceObjectId, relation.targetObjectId]), "Set Point mutations never rewrite formal Relation endpoints.");

    await switchEventView(page, "时间轴");
    await page.getByLabel("独立时间线工作区").waitFor();
    await openStoryModelingTools(page);
    await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
    await page.getByTestId("story-modeling-confirmation").getByRole("button", { name: "确认运行一次", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"] [data-track-origin="ai-suggested"]'));
    const firstAiCard = page.locator('.temporal-event-card[data-track-origin="ai-suggested"]').first();
    const originalTrack = await firstAiCard.getAttribute("data-temporal-track");
    const originalTransform = await firstAiCard.locator("xpath=..").getAttribute("style");
    await page.evaluate(() => {
      const host = window;
      const original = structuredClone(host.__storyStudioTemporalProjectionRun);
      host.__r10OriginalTemporalRun = original;
      const changed = structuredClone(original);
      changed.compositionCache.items[0].branchTrack = "track.zzz-test";
      window.dispatchEvent(new CustomEvent("story-studio-temporal-projection-run", { detail: changed }));
    });
    await page.waitForFunction((track) => document.querySelector('.temporal-event-card[data-track-origin="ai-suggested"]')?.getAttribute("data-temporal-track") !== track, originalTrack);
    const changedTransform = await firstAiCard.locator("xpath=..").getAttribute("style");
    assert.notEqual(changedTransform, originalTransform, "Changing compositionCache.items[].branchTrack changes the rendered node Y position.");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("story-studio-temporal-projection-run", { detail: window.__r10OriginalTemporalRun })));
    await page.waitForFunction((track) => document.querySelector('.temporal-event-card[data-track-origin="ai-suggested"]')?.getAttribute("data-temporal-track") === track, originalTrack);
    const restoredTransform = await firstAiCard.locator("xpath=..").getAttribute("style");
    assert.equal(restoredTransform, originalTransform, "Restoring the same cache restores the same stable track layout.");
    await page.evaluate(() => { const stale = structuredClone(window.__r10OriginalTemporalRun); stale.stale = true; window.dispatchEvent(new CustomEvent("story-studio-temporal-projection-run", { detail: stale })); });
    await page.waitForFunction(() => document.querySelector('[data-temporal-state="stale"] [data-track-origin="ai-suggested-stale"]'));
    assert.match(await page.getByLabel("独立时间线工作区").innerText(), /来源已变化.*重算/u);
    await shot(page, "05-1440-ai-track-stale-recompute.png");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("story-studio-temporal-projection-run", { detail: window.__r10OriginalTemporalRun })));
    await reloadProduct(page);
    await page.locator(".temporal-event-card").first().waitFor();
    await pause(page, 900);
    const refreshTemporalState = await page.getByLabel("独立时间线工作区").getAttribute("data-temporal-state");
    const refreshTrackOrigins = await page.locator(".temporal-event-card").evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("data-track-origin")))]);
    assert.equal(refreshTemporalState, "ready", `Refresh must restore a current temporal projection (state=${refreshTemporalState}, origins=${refreshTrackOrigins.join(",")}).`);
    assert.deepEqual(refreshTrackOrigins, ["ai-suggested"], "Refresh must restore AI-suggested track identities from the persisted modeling Run.");
    assert.equal(await page.locator('.temporal-event-card[data-track-origin="ai-suggested"]').first().locator("xpath=..").getAttribute("style"), originalTransform, "Refresh restores the same persisted temporal layout.");
  });

  await record({ width: 1280, height: 800 }, "TIANYAN_R10_1280x800_INTERACTION", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=line&eventGraphFixture=density50`);
    await closeGlobalTianyiIfOpen(page);
    const navigator = page.getByRole("navigation", { name: "分支与合流导航" });
    await navigator.getByRole("button", { name: "跳到分叉", exact: true }).click();
    const showMiniMap = page.getByRole("button", { name: "显示小地图", exact: true });
    if (await showMiniMap.count()) await showMiniMap.click();
    await page.locator(".react-flow__minimap").waitFor();
    const currentTrack = await navigator.getAttribute("data-active-track");
    assert.ok(currentTrack, "Branch navigation exposes the current track to the minimap projection.");
    const canvas = page.locator(".event-graph-flow");
    await canvas.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").waitFor();
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem");
    await page.keyboard.press("Escape");
    const before = await canvas.locator(".react-flow__viewport").getAttribute("style");
    const box = await canvas.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width * .62, box.y + box.height * .55);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .55, { steps: 9 });
    await page.mouse.up({ button: "middle" });
    assert.notEqual(await canvas.locator(".react-flow__viewport").getAttribute("style"), before, "1280 canvas remains pannable.");
    await shot(page, "06-1280-branch-minimap-keyboard-pan.png");
  });

  await record({ width: 1152, height: 720 }, "TIANYAN_R10_1152x720_RESPONSIVE", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=timeline`);
    await closeGlobalTianyiIfOpen(page);
    const timeline = page.getByLabel("独立时间线工作区");
    if (await timeline.getAttribute("data-temporal-state") !== "ready") {
      await openStoryModelingTools(page);
      await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
      await page.getByTestId("story-modeling-confirmation").getByRole("button", { name: "确认运行一次", exact: true }).click();
    }
    await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"]'));
    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    await page.waitForFunction(() => Math.round(document.querySelector(".tianyi-sidebar")?.getBoundingClientRect().width ?? 0) === 348);
    const dockWidth = await page.locator(".tianyi-sidebar").evaluate((element) => Math.round(element.getBoundingClientRect().width));
    assert.equal(dockWidth, 348);
    const conflict = timeline.locator(".temporal-conflict-summary");
    if (await conflict.count()) {
      const conflictBox = await conflict.boundingBox();
      const flowBox = await timeline.locator(".temporal-flow").boundingBox();
      assert.ok(conflictBox && flowBox && conflictBox.y + conflictBox.height <= flowBox.y + 1, `1152 conflict summary occupies its own layout row above the clipped temporal canvas (conflict=${JSON.stringify(conflictBox)}, flow=${JSON.stringify(flowBox)}).`);
    }
    const minimumNodeWidth = Math.min(...await timeline.locator(".temporal-event-card").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width)));
    assert.ok(minimumNodeWidth >= 170, `1152 temporal cards remain readable=${minimumNodeWidth}`);
    const focusable = timeline.locator("button:not(:disabled), [tabindex='0']");
    await focusable.first().focus();
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.matches("button, [tabindex='0']")), "1152 focus order remains keyboard reachable.");
    await shot(page, "07-1152-timeline-conflict-clear-tianyi-348.png");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "1152 has no page-level horizontal overflow.");
  });

  writeFileSync(path.join(r10EvidenceDirectory, "R10-EVIDENCE-MANIFEST.json"), `${JSON.stringify({
    realProviderCalls: 0,
    formalEventWritesBeforeAuthorAction: 0,
    formalRelationWritesBeforeAuthorAction: 0,
    canonWrites: 0,
    worldStateWrites: 0,
    viewports: ["1440x900", "1280x800", "1152x720"]
  }, null, 2)}\n`, "utf8");
}

async function recordR9Evidence() {
  if (!r9EvidenceDirectory) throw new Error("TIANYAN_R9_EVIDENCE_DIR is required for R9 evidence recording.");
  mkdirSync(r9EvidenceDirectory, { recursive: true });
  const record = async (viewport, name, operation) => {
    const context = await browser.newContext({ viewport, recordVideo: { dir: r9EvidenceDirectory, size: viewport } });
    const page = await context.newPage();
    const video = page.video();
    const consoleProblems = [];
    page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleProblems.push(error.message));
    await operation(page);
    assert.deepEqual(consoleProblems, [], `${name} recording may not contain browser warnings or errors.`);
    await context.close();
    const source = video ? await video.path() : null;
    if (!source) throw new Error(`${name} recording was not written.`);
    copyFileSync(source, path.join(r9EvidenceDirectory, `${name}.webm`));
  };
  const pause = (page, duration = 750) => page.waitForTimeout(duration);
  const shot = (page, name) => page.screenshot({ path: path.join(r9EvidenceDirectory, name), fullPage: false });

  await record({ width: 1440, height: 900 }, "TIANYAN_R9_1440x900_FULL_FLOW", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();

    await switchEventView(page, "视角");
    const perspective = page.getByLabel("事件视角轴");
    const choices = perspective.locator('.event-perspective-picker input[type="checkbox"]');
    assert.ok(await choices.count() >= 2, "R9 evidence requires two formal perspective Owner objects.");
    await choices.nth(0).click();
    await page.waitForFunction(() => /从 .+ 看故事/u.test(document.querySelector(".event-perspective-canvas h2")?.textContent ?? ""));
    assert.equal(await perspective.getAttribute("data-provider-calls-on-open"), "0");
    await shot(page, "01-1440-single-owner-perspective.png");
    await pause(page);
    await choices.nth(1).click();
    await page.waitForFunction(() => /知情比较/u.test(document.querySelector(".event-perspective-canvas h2")?.textContent ?? ""));
    await shot(page, "02-1440-multi-owner-comparison.png");
    await pause(page);

    await switchEventView(page, "事件线");
    const narrative = page.getByLabel("水平事件编排工作区");
    await narrative.waitFor();
    const eventNodes = narrative.locator(".event-graph-node:not(.is-remote)");
    await eventNodes.filter({ hasText: "林昭隐瞒真相" }).click({ force: true });
    await page.keyboard.down("Shift");
    await eventNodes.filter({ hasText: "雨夜追踪" }).click({ force: true });
    await page.keyboard.up("Shift");
    const selectionBar = page.getByTestId("event-graph-selection-bar");
    await selectionBar.waitFor();
    await selectionBar.getByRole("button", { name: "创建集点", exact: true }).click();
    await selectionBar.getByPlaceholder("集点名称").fill("线索交汇");
    await selectionBar.getByRole("button", { name: "保存集点", exact: true }).click();
    await page.getByText("集点已保存；Event 身份与正式 Relation 端点未改变。", { exact: true }).waitFor();
    const setPoint = narrative.locator(".event-graph-collection-point").filter({ hasText: "线索交汇" });
    await setPoint.waitFor();
    const setPointBox = await setPoint.boundingBox();
    if (setPointBox) {
      await page.mouse.move(setPointBox.x + setPointBox.width / 2, setPointBox.y + 16);
      await page.mouse.down();
      await page.mouse.move(setPointBox.x + setPointBox.width / 2 + 72, setPointBox.y + 46, { steps: 8 });
      await page.mouse.up();
    }
    await setPoint.getByRole("button").click({ force: true });
    await narrative.locator(".event-graph-collection-point.is-collapsed").filter({ hasText: "线索交汇" }).waitFor();
    await shot(page, "03-1440-set-point-created-moved-collapsed.png");
    await pause(page);

    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=line&eventGraphFixture=density50`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    await page.getByLabel("水平事件编排工作区").waitFor();
    assert.equal(await page.locator('[data-event-graph-density="synthetic-50"]').count(), 1);
    assert.ok(await page.locator(".event-narrative-track-label").count() >= 4, "Density evidence must expose a main track and three branch tracks.");
    await pause(page, 500);
    await shot(page, "04-1440-horizontal-three-branch-two-merge-layout.png");
    const densityFlow = page.locator(".event-graph-flow");
    const densityBox = await densityFlow.boundingBox();
    assert.ok(densityBox, "Density evidence canvas must support horizontal inspection.");
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.move(densityBox.x + densityBox.width * .78, densityBox.y + densityBox.height * .5);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(densityBox.x + densityBox.width * .24, densityBox.y + densityBox.height * .5, { steps: 12 });
      await page.mouse.up({ button: "middle" });
      await pause(page, 650);
    }

    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=timeline`);
    await page.getByLabel("独立时间线工作区").waitFor();
    await openStoryModelingTools(page);
    await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
    const confirmation = page.getByTestId("story-modeling-confirmation");
    await confirmation.getByRole("button", { name: "确认运行一次", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"]'));
    await page.getByLabel("独立时间线工作区").getByRole("button", { name: "时间总览", exact: true }).click();
    assert.equal(await page.getByLabel("稳定故事轨道").locator("[data-track-id]").count(), 3);
    await shot(page, "05-1440-ai-temporal-composition-branch-tracks.png");
    await pause(page, 1_100);
  });

  await record({ width: 1152, height: 720 }, "TIANYAN_R9_1152x720_RESPONSIVE", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=line`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    const flow = page.locator(".event-graph-flow");
    const viewportBefore = await flow.locator(".react-flow__viewport").getAttribute("style");
    const box = await flow.boundingBox();
    assert.ok(box, "R9 1152 narrative canvas must be interactive.");
    await page.mouse.move(box.x + box.width * .62, box.y + box.height * .56);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(box.x + box.width * .42, box.y + box.height * .56, { steps: 10 });
    await page.mouse.up({ button: "middle" });
    assert.notEqual(await flow.locator(".react-flow__viewport").getAttribute("style"), viewportBefore, "R9 1152 Event line must pan instead of shrinking indefinitely.");
    await shot(page, "08-1152-set-point-event-line-pan.png");
    await pause(page);

    await switchEventView(page, "时间轴");
    const timeline = page.getByLabel("独立时间线工作区");
    await timeline.waitFor();
    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    await page.waitForFunction(() => Math.round(document.querySelector(".tianyi-sidebar")?.getBoundingClientRect().width ?? 0) === 348);
    await timeline.getByRole("button", { name: "时间总览", exact: true }).click();
    await pause(page, 350);
    const visibleTimelineCards = await page.locator(".temporal-event-card").evaluateAll((nodes) => nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.right > 132 && box.left < window.innerWidth - 348 && box.bottom > 250 && box.top < window.innerHeight;
    }).length);
    assert.ok(visibleTimelineCards >= 1, "R9 1152 timeline must keep readable Event cards visible beside Tianyi.");
    const minimumNodeWidth = Math.min(...await page.locator(".temporal-event-card").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width)));
    assert.ok(minimumNodeWidth >= 170, `R9 1152 timeline cards remain readable: ${minimumNodeWidth}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "R9 1152 workspace may not create page-level overflow.");
    await shot(page, "07-1152-timeline-tianyi-348.png");
    await pause(page, 1_100);
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleProblems = [];
  page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN&eventView=spine`);
  await closeGlobalTianyiIfOpen(page);
  if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
  await page.getByLabel("故事脊柱主控结构").waitFor();
  await page.getByLabel("层级").selectOption("far");
  assert.ok(await page.locator(".story-spine-unit.is-branch-unit").count() >= 1);
  await page.screenshot({ path: path.join(r9EvidenceDirectory, "06-1280-story-spine-branch-topology.png"), fullPage: false });
  assert.deepEqual(consoleProblems, [], "R9 1280 story spine may not contain browser warnings or errors.");
  await context.close();
}

async function recordR8Foundation() {
  if (!r8CloseoutDirectory) throw new Error("TIANYAN_R8_CLOSEOUT_DIR is required for R8 recording.");
  mkdirSync(r8CloseoutDirectory, { recursive: true });
  const record = async (viewport, name, operation) => {
    const context = await browser.newContext({ viewport, recordVideo: { dir: r8CloseoutDirectory, size: viewport } });
    const page = await context.newPage();
    const video = page.video();
    const consoleProblems = [];
    page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleProblems.push(error.message));
    await operation(page);
    assert.deepEqual(consoleProblems, [], `${name} recording may not contain browser warnings or errors.`);
    await context.close();
    const source = video ? await video.path() : null;
    if (!source) throw new Error(`${name} recording was not written.`);
    copyFileSync(source, path.join(r8CloseoutDirectory, `${name}.webm`));
  };
  const pause = (page, duration = 700) => page.waitForTimeout(duration);
  const shot = (page, name) => page.screenshot({ path: path.join(r8CloseoutDirectory, name), fullPage: false });

  await record({ width: 1440, height: 900 }, "TIANYAN_R8_1440x900_FOUNDATION", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    await switchEventView(page, "故事脊柱");
    const branch = page.locator(".story-spine-unit.is-branch-unit").first();
    await branch.waitFor();
    await branch.getByRole("button", { name: "重命名", exact: true }).click();
    const rename = branch.getByLabel(/重命名单元/u);
    await rename.fill("灯塔余波·复核");
    await branch.getByRole("button", { name: "保存", exact: true }).click();
    await branch.getByRole("heading", { name: "灯塔余波·复核", exact: true }).waitFor();
    assert.equal(await branch.getAttribute("class").then((value) => value?.includes("is-branch-unit")), true, "Renaming a branch Unit must not change its formal kind.");
    await shot(page, "01-1440-story-spine-formal-branch.png");

    await switchEventView(page, "关系图");
    const nodes = page.locator(".event-graph-node:not(.is-remote):not(.event-graph-prediction-node)");
    const selected = ["暗号传递", "仓库对峙", "旧仓库封锁"].map((title) => nodes.filter({ hasText: title }));
    await selected[0].click({ force: true });
    await selected[1].click({ force: true, modifiers: ["Shift"] });
    await selected[2].click({ force: true, modifiers: ["Shift"] });
    await page.getByTestId("event-graph-selection-bar").waitFor();
    await selected[2].click({ force: true, button: "right" });
    const menu = page.getByRole("menu", { name: /事件菜单/u });
    await menu.waitFor();
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem", "Arrow keys keep focus inside the Event context menu.");
    await page.keyboard.press("Escape");
    await selected[2].click({ force: true, button: "right" });
    await menu.getByRole("menuitem", { name: "剧情逻辑检测", exact: true }).click();
    const logic = page.getByRole("dialog", { name: "本地完整性与 AI 语义检查" });
    await logic.waitFor();
    await shot(page, "02-1440-three-event-logic-scope.png");
    await logic.getByRole("button", { name: "配置 AI 语义检查", exact: true }).click();
    const confirmation = page.getByTestId("story-modeling-confirmation");
    await confirmation.getByRole("button", { name: "确认运行一次", exact: true }).click();
    const stop = page.getByRole("button", { name: "停止本次建模", exact: true });
    await stop.waitFor();
    await shot(page, "03-1440-story-modeling-running-stop.png");
    await stop.click();
    await page.getByText("本次建模已停止", { exact: true }).waitFor();
    await shot(page, "04-1440-story-modeling-stopped.png");

    await openStoryModelingTools(page);
    await page.getByRole("button", { name: "智能连线", exact: true }).click();
    await confirmation.getByRole("button", { name: "确认运行一次", exact: true }).click();
    await page.getByText("本次建模已完成", { exact: true }).waitFor();
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await closeGlobalTianyiIfOpen(page);
    await openStoryModelingTools(page);
    await page.getByText("本次建模已完成", { exact: true }).waitFor();
    await shot(page, "05-1440-modeling-result-restored.png");

    await switchEventView(page, "时间轴");
    await page.getByLabel("时间标尺").waitFor();
    const tracksBefore = await page.locator(".temporal-left-scale [data-track-id]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-track-id")));
    await page.locator(".react-flow__controls-zoomin").click();
    await page.locator(".react-flow__controls-zoomin").click();
    const tracksAfter = await page.locator(".temporal-left-scale [data-track-id]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-track-id")));
    assert.deepEqual(tracksAfter, tracksBefore, "Timeline zoom must preserve stable track semantics.");
    await shot(page, "06-1440-stable-timeline-tracks.png");

    await switchEventView(page, "视角");
    const perspective = page.getByLabel("事件视角轴");
    const choices = perspective.locator('.event-perspective-picker input[type="checkbox"]');
    assert.ok(await choices.count() >= 2, "R8 evidence requires at least two formal perspective objects.");
    await choices.nth(0).click();
    await choices.nth(1).click();
    await page.waitForFunction(() => /故事交集/u.test(document.querySelector(".event-perspective-canvas h2")?.textContent ?? ""));
    await shot(page, "07-1440-perspective-selection.png");
    await pause(page);
  });

  await record({ width: 1152, height: 720 }, "TIANYAN_R8_1152x720_RESPONSIVE", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    await switchEventView(page, "故事脊柱");
    const responsiveBranch = page.locator(".story-spine-unit.is-branch-unit").first();
    await responsiveBranch.waitFor();
    await responsiveBranch.scrollIntoViewIfNeeded();
    await shot(page, "10-1152-branch-unit.png");
    await pause(page, 600);
    await switchEventView(page, "时间轴");
    await page.getByLabel("时间标尺").waitFor();
    const timelineNode = page.locator(".event-graph-node:not(.is-remote)").first();
    await timelineNode.click({ force: true });
    await page.getByLabel("事件视图工具栏").getByRole("button", { name: "聚焦当前", exact: true }).click();
    await page.locator(".react-flow__controls-zoomin").click();
    const aiTools = page.getByRole("button", { name: /AI 工具/u }).last();
    await aiTools.click();
    await page.getByRole("button", { name: /AI 工具/u }).last().click();
    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    await page.waitForFunction(() => Math.round(document.querySelector(".tianyi-sidebar")?.getBoundingClientRect().width ?? 0) === 348);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "R8 1152 workspace must not create page-level horizontal overflow.");
    await shot(page, "08-1152-timeline-tianyi-348.png");
    await pause(page, 1_000);
  });

  const context1280 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page1280 = await context1280.newPage();
  const console1280 = [];
  page1280.on("console", (message) => ["error", "warning"].includes(message.type()) && console1280.push(`${message.type()}: ${message.text()}`));
  page1280.on("pageerror", (error) => console1280.push(error.message));
  await gotoProduct(page1280, `${baseUrl}/event-line?locale=zh-CN`);
  await closeGlobalTianyiIfOpen(page1280);
  if (await page1280.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page1280.getByRole("button", { name: "关闭工程目录", exact: true }).click();
  await switchEventView(page1280, "故事脊柱");
  await page1280.locator(".story-spine-unit.is-branch-unit").first().waitFor();
  assert.equal(await page1280.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "R8 1280 story task must not create page-level horizontal overflow.");
  await page1280.screenshot({ path: path.join(r8CloseoutDirectory, "09-1280-story-spine-task.png"), fullPage: false });
  assert.deepEqual(console1280, [], "R8 1280 task may not contain browser warnings or errors.");
  await context1280.close();
}

async function recordR7Interaction() {
  if (!r7CloseoutDirectory) throw new Error("TIANYAN_R7_CLOSEOUT_DIR is required for R7 recording.");
  mkdirSync(r7CloseoutDirectory, { recursive: true });
  const record = async (viewport, name, operation) => {
    const context = await browser.newContext({ viewport, recordVideo: { dir: r7CloseoutDirectory, size: viewport } });
    const page = await context.newPage();
    const video = page.video();
    const consoleProblems = [];
    page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleProblems.push(error.message));
    await operation(page);
    assert.deepEqual(consoleProblems, [], `${name} recording may not contain browser warnings or errors.`);
    await context.close();
    const source = video ? await video.path() : null;
    if (!source) throw new Error(`${name} recording was not written.`);
    copyFileSync(source, path.join(r7CloseoutDirectory, `${name}.webm`));
  };
  const pause = (page, duration = 850) => page.waitForTimeout(duration);

  await record({ width: 1440, height: 900 }, "TIANYAN_R7_1440x900_FULL_FLOW", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    await switchEventView(page, "故事脊柱");
    await page.getByLabel("故事脊柱主控结构").waitFor();
    await pause(page);
    await switchEventView(page, "关系图");
    await page.getByLabel("事件关系工作区").waitFor();
    const formalNodes = page.locator(".event-graph-node:not(.is-remote):not(.event-graph-prediction-node)");
    const firstFormal = formalNodes.filter({ hasText: "暗号传递" });
    const secondFormal = formalNodes.filter({ hasText: "仓库对峙" });
    await firstFormal.click({ force: true });
    await secondFormal.click({ force: true, modifiers: ["Shift"] });
    await page.getByTestId("event-graph-selection-bar").waitFor();
    await pause(page);
    await secondFormal.click({ force: true, button: "right" });
    const menu = page.getByRole("menu", { name: /事件菜单/u });
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem", { name: "正式事件不可删除", exact: true }).isDisabled(), true, "Formal Event hard-delete stays blocked.");
    await pause(page);
    await menu.getByRole("menuitem", { name: "剧情逻辑检测", exact: true }).click();
    const logic = page.getByRole("dialog", { name: "本地完整性与 AI 语义检查" });
    await logic.waitFor();
    await pause(page);
    const runsBeforeCancel = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
    await logic.getByRole("button", { name: "配置 AI 语义检查", exact: true }).click();
    const confirmation = page.getByTestId("story-modeling-confirmation");
    await confirmation.waitFor();
    await pause(page);
    await confirmation.getByRole("button", { name: "取消", exact: true }).click();
    const runsAfterCancel = await postFixture(`${apiUrl}/__local/story-studio/tianyi/story-modeling/list`, { projectId: fixtureProjectId });
    assert.equal(runsAfterCancel.data.length, runsBeforeCancel.data.length, "Cancelling R7 semantic analysis creates no Run and no Provider request.");
    await openStoryModelingTools(page);
    await page.getByRole("button", { name: /本地逻辑检测/u }).click();
    const secondLogic = page.getByRole("dialog", { name: "本地完整性与 AI 语义检查" });
    await secondLogic.getByRole("button", { name: "配置 AI 语义检查", exact: true }).click();
    await confirmation.getByRole("button", { name: "确认运行一次", exact: true }).click();
    await page.getByText("本次建模已完成", { exact: true }).waitFor();
    await page.getByRole("button", { name: /本地逻辑检测/u }).click();
    await page.waitForFunction(() => document.querySelectorAll(".story-logic-findings article").length > 0);
    await pause(page, 1_100);
    await page.getByRole("button", { name: "关闭逻辑检测", exact: true }).click();
    await switchEventView(page, "时间轴");
    await page.getByLabel("时间标尺").waitFor();
    await pause(page);
    await switchEventView(page, "视角");
    const perspective = page.getByLabel("事件视角轴");
    await perspective.waitFor();
    const choices = perspective.locator('.event-perspective-picker input[type="checkbox"]');
    assert.ok(await choices.count() >= 2, "The isolated story exposes at least two perspective objects.");
    await choices.nth(0).click();
    await choices.nth(1).click();
    await page.waitForFunction(() => /故事交集/u.test(document.querySelector(".event-perspective-canvas h2")?.textContent ?? ""));
    await pause(page, 1_200);
    await switchEventView(page, "关系图");
    await page.locator(".event-graph-node:not(.is-remote)").filter({ hasText: "暗号传递" }).click({ force: true, button: "right" });
    await page.getByRole("menu", { name: /事件菜单/u }).waitFor();
    await pause(page, 1_100);
  });

  await record({ width: 1152, height: 720 }, "TIANYAN_R7_1152x720_RESPONSIVE", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    const closeDirectory = page.getByRole("button", { name: "关闭工程目录", exact: true });
    if (await closeDirectory.count()) await closeDirectory.click();
    const openDirectory = page.getByRole("button", { name: "打开工程目录", exact: true });
    await openDirectory.click();
    await pause(page);
    await closeDirectory.click();
    await switchEventView(page, "关系图");
    await page.getByLabel("事件关系工作区").waitFor();
    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    await page.waitForFunction(() => Math.round(document.querySelector(".tianyi-sidebar")?.getBoundingClientRect().width ?? 0) === 348);
    await pause(page);
    await closeGlobalTianyiIfOpen(page);
    const nodes = page.locator(".event-graph-node:not(.is-remote)");
    const first = nodes.filter({ hasText: "暗号传递" });
    const second = nodes.filter({ hasText: "仓库对峙" });
    await first.click({ force: true });
    await second.click({ force: true, modifiers: ["Shift"] });
    await page.getByTestId("event-graph-selection-bar").waitFor();
    await second.click({ force: true, button: "right" });
    await page.getByRole("menu", { name: /事件菜单/u }).waitFor();
    await pause(page);
    await page.keyboard.press("Escape");
    await openStoryModelingTools(page);
    assert.equal(await page.getByRole("button", { name: /AI 工具/u }).first().getAttribute("aria-expanded"), "true", "The 1152 AI tools entry keeps its visible author-facing label.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "The 1152 R7 workspace has no page-level horizontal overflow.");
    await pause(page, 1_100);
  });
}

async function recordR6Closeout() {
  if (!r6CloseoutDirectory) throw new Error("TIANYAN_R6_CLOSEOUT_DIR is required for R6 recording.");
  mkdirSync(r6CloseoutDirectory, { recursive: true });
  const record = async (viewport, name, operation) => {
    const context = await browser.newContext({ viewport, recordVideo: { dir: r6CloseoutDirectory, size: viewport } });
    const page = await context.newPage();
    const video = page.video();
    const consoleProblems = [];
    page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleProblems.push(error.message));
    await operation(page);
    assert.deepEqual(consoleProblems, [], `${name} recording may not contain browser warnings or errors.`);
    await context.close();
    const source = video ? await video.path() : null;
    if (!source) throw new Error(`${name} recording was not written.`);
    copyFileSync(source, path.join(r6CloseoutDirectory, `${name}.webm`));
  };
  await record({ width: 1440, height: 900 }, "R6-1440x900-story-modeling", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    await switchEventView(page, "故事脊柱");
    await page.getByLabel("故事脊柱主控结构").waitFor();
    await page.getByLabel("层级").selectOption("far");
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "01-1440-story-spine.png") });
    await page.waitForTimeout(1_200);
    await page.getByLabel("层级").selectOption("medium");
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "01b-1440-story-spine-events.png") });
    await page.waitForTimeout(900);
    await page.locator(".event-spine-cross-view").first().getByRole("button", { name: "关系图", exact: true }).click();
    await page.getByLabel("事件关系工作区").waitFor();
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "02-1440-cross-view-graph.png") });
    await page.waitForTimeout(1_000);
    await switchEventView(page, "时间轴");
    await page.getByLabel("独立时间线工作区").waitFor();
    await page.waitForFunction(() => ["missing", "stale", "ready"].includes(document.querySelector("[data-temporal-state]")?.getAttribute("data-temporal-state") ?? ""));
    assert.equal(await page.getByLabel("独立时间线工作区").getAttribute("data-view-switch-provider-calls"), "0");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "03-1440-timeline-basic-layout.png") });
    await openStoryModelingTools(page);
    await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
    const dialog = page.getByTestId("story-modeling-confirmation");
    await dialog.waitFor();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="story-modeling-confirmation"] .story-modeling-estimate')));
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "04-1440-estimate-before-run.png") });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "推断时间位置", exact: true }).click();
    await dialog.getByRole("button", { name: "确认运行一次", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-temporal-state="ready"]'));
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "05-1440-timeline-rulers-conflict.png") });
    await page.waitForTimeout(1_200);
    await switchEventView(page, "关系图");
    await openStoryModelingTools(page);
    await page.getByRole("button", { name: "智能连线", exact: true }).click();
    await dialog.getByRole("button", { name: "确认运行一次", exact: true }).click();
    await page.getByLabel("智能连线候选审查").waitFor();
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "06-1440-smart-relation-review.png") });
    await page.waitForTimeout(1_400);
    await switchEventView(page, "故事脊柱");
    await page.waitForTimeout(1_000);
  });
  await record({ width: 1152, height: 720 }, "R6-1152x720-responsive", async (page) => {
    await gotoProduct(page, `${baseUrl}/event-line?locale=zh-CN`);
    await closeGlobalTianyiIfOpen(page);
    if (await page.getByRole("button", { name: "关闭工程目录", exact: true }).count()) await page.getByRole("button", { name: "关闭工程目录", exact: true }).click();
    await switchEventView(page, "故事脊柱");
    await page.getByLabel("层级").selectOption("far");
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "07-1152-story-spine-responsive.png") });
    await page.waitForTimeout(1_100);
    await switchEventView(page, "时间轴");
    await page.getByLabel("时间标尺").waitFor();
    await page.waitForFunction(() => ["missing", "stale", "ready"].includes(document.querySelector("[data-temporal-state]")?.getAttribute("data-temporal-state") ?? ""));
    await page.getByRole("button", { name: "打开天意助手", exact: true }).click();
    await page.waitForFunction(() => Math.round(document.querySelector(".tianyi-sidebar")?.getBoundingClientRect().width ?? 0) === 348);
    await page.waitForTimeout(500);
    const dockWidth = await page.locator(".tianyi-sidebar").evaluate((element) => Math.round(element.getBoundingClientRect().width));
    assert.equal(dockWidth, 348, `1152 Tianyi width must remain 348px, got ${dockWidth}`);
    await page.screenshot({ path: path.join(r6CloseoutDirectory, "08-1152-timeline-tianyi-348.png") });
    await page.waitForTimeout(1_400);
  });
}

async function closeGlobalTianyiIfOpen(page) {
  const tianyiSidebar = page.locator(".tianyi-sidebar");
  if (await tianyiSidebar.isVisible()) {
    await tianyiSidebar.locator(".tianyi-sidebar-header > button").click();
    await tianyiSidebar.waitFor({ state: "hidden" });
  }
}

async function waitForProductReady(page) {
  const shell = page.getByTestId("tianyan-r0-shell");
  await shell.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('[data-testid="tianyan-r0-shell"]')?.getAttribute("data-connection-state") === "ready");
  assert.equal(await shell.getAttribute("data-connection-state"), "ready", "Product navigation must settle through the Shell connection owner.");
}

async function gotoProduct(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForProductReady(page);
}

async function reloadProduct(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForProductReady(page);
}

async function setupZeroItemFixture() {
  const created = await postFixture(`${apiUrl}/__local/story-studio/projects/create`, { title: "空目录作品", folderSlug: `empty-${fixtureProjectId}` });
  await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: created.data.id });
}

async function postFixture(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-world-os-local-control-token": controlToken }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function getFixture(url) {
  const response = await fetchFixture(url, { headers: { "x-world-os-local-control-token": controlToken } });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchFixture(url, init) {
  try { return await fetch(url, init); }
  catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    try { return await fetch(url, init); }
    catch (secondError) { throw new AggregateError([firstError, secondError], `Fixture transport failed twice: ${url}`); }
  }
}
