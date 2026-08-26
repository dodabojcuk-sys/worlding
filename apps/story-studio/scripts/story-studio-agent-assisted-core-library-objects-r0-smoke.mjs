import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { profileFromTextFields } from "../../../src/storyContracts/storyStudioObjectProfile.ts";
import { createStoryStudioRelationOperations } from "../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const workspaceRoot = path.join(tmpdir(), `tianyan-agent-core-library-${process.pid}-${Date.now()}`);
const stateFilePath = path.join(tmpdir(), `tianyan-agent-core-library-state-${process.pid}-${Date.now()}.json`);
const outputDir = path.resolve("output/playwright/tianyan-agent-assisted-core-library-objects-r0");
const projectId = "agent-core-library-r0";
const serverPort = 4492;
const vitePort = 4491;
const baseUrl = `http://127.0.0.1:${vitePort}`;
const serverUrl = `http://127.0.0.1:${serverPort}`;
const token = "agent-core-library-fixture-token";
let server;
let vite;
let browser;
let page;

rmSync(workspaceRoot, { recursive: true, force: true });
rmSync(stateFilePath, { force: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const operations = createStoryStudioWorkspaceOperations({ rootPath: workspaceRoot, stateFilePath });
operations.createProject({ title: "天衍核心资料隔离夹具", folderSlug: projectId, genre: "mystery", ambience: "rain-lighthouse" });
operations.openProject({ projectId });
const keeper = operations.createWorldObject({ projectId, type: "character", title: "守灯人", status: "active", tags: ["fixture"], aliases: [], body: "# 守灯人\n\n只用于隔离浏览器取证。\n" });
const oldLighthouse = operations.createWorldObject({ projectId, type: "location", title: "旧灯塔", status: "active", tags: ["fixture"], aliases: [], body: "# 旧灯塔\n\n" , profile: profileFromTextFields("location", { region: "北岸", description: "临海旧灯塔。" }) });
const harbor = operations.createWorldObject({ projectId, type: "location", title: "北岸港口", status: "active", tags: ["fixture"], aliases: [], body: "# 北岸港口\n\n" });
const key = operations.createWorldObject({ projectId, type: "item", title: "旧钥匙", status: "active", tags: ["fixture"], aliases: [], body: "# 旧钥匙\n\n" });
const relationOperations = createStoryStudioRelationOperations({ workspaceOperations: operations });
const adjacencyType = relationOperations.createRelationType({ projectId, operationId: "fixture.relation-type.adjacency", label: "相邻" });
const holderType = relationOperations.createRelationType({ projectId, operationId: "fixture.relation-type.holder", label: "持有" });
const adjacencyCandidate = relationOperations.createRelationCandidate({ projectId, operationId: "fixture.relation.adjacency.create", sourceObjectId: oldLighthouse.id, targetObjectId: harbor.id, relationTypeId: adjacencyType.type.relationTypeId, direction: "forward" });
relationOperations.confirmRelationCandidate({ projectId, relationId: adjacencyCandidate.relation.relationId, expectedRelationRevision: adjacencyCandidate.relation.revision, operationId: "fixture.relation.adjacency.confirm" });
const holderCandidate = relationOperations.createRelationCandidate({ projectId, operationId: "fixture.relation.holder.create", sourceObjectId: keeper.id, targetObjectId: key.id, relationTypeId: holderType.type.relationTypeId, direction: "forward", temporal: { version: "story-relation-temporal/v1", validFrom: "2026-01-01", validTo: null, confidence: "high", sourceAnchors: ["fixture:holder"] } });
relationOperations.confirmRelationCandidate({ projectId, relationId: holderCandidate.relation.relationId, expectedRelationRevision: holderCandidate.relation.revision, operationId: "fixture.relation.holder.confirm" });

if (process.env.STORY_STUDIO_SKIP_BUILD !== "1") execFileSync("npm", ["run", "build"], { stdio: "inherit" });

const consoleMessages = [];
const failedRequests = [];
const unexpectedExternalCalls = [];
const screenshots = [];

try {
  server = await startChildServer();
  vite = startVite();
  await waitForUrl(`${baseUrl}/`);
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await page.route("**/__local/story-studio/**", async (route) => {
    const next = new URL(route.request().url());
    next.port = String(serverPort);
    await route.continue({ url: next.toString(), headers: { ...route.request().headers(), "x-world-os-local-control-token": token } });
  });
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || "unknown" }));
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    const localPath = requestUrl.pathname;
    const isLocalModelStatus = localPath === "/__local/story-studio/model-service/status";
    const isLocalExecutionAttempt = /\/__local\/story-studio\/(?:model-service\/|curated-creation-plugins\/execute|plugins\/execute)/u.test(localPath) && !isLocalModelStatus;
    const allowedOrigins = new Set([new URL(baseUrl).origin, new URL(serverUrl).origin]);
    const isUnexpectedOrigin = !allowedOrigins.has(requestUrl.origin);
    if (isLocalExecutionAttempt || isUnexpectedOrigin) unexpectedExternalCalls.push(request.url());
  });
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().includes("/favicon")) failedRequests.push({ url: response.url(), status: response.status() }); });

  await openDirectory(page, "character");
  await page.getByRole("button", { name: "新建角色", exact: true }).click();
  await page.getByTestId("new-object-dialog").waitFor();
  assert.equal(await page.getByTestId("object-path-agent").count(), 1);
  assert.equal(await page.getByTestId("object-path-extract").count(), 1);
  assert.equal(await page.getByTestId("object-path-manual").count(), 1);
  await page.getByTestId("object-path-extract").click();
  await page.getByTestId("agent-draft-intent").fill("守灯人知道旧钥匙的去处");
  await page.getByTestId("agent-draft-source").fill("守灯人守在旧灯塔，旧钥匙从未离开北岸。");
  await page.getByTestId("agent-draft-scope").fill("fixture:character-scene");
  await page.getByTestId("agent-draft-submit").click();
  await page.getByTestId("agent-draft-review").waitFor();
  assert.match(await page.getByTestId("agent-draft-review").innerText(), /确定性隔离 fixture/u);
  assert.match(await page.getByTestId("agent-draft-review").innerText(), /来源锚点/u);
  await page.getByTestId("agent-draft-title").fill("林远");
  await page.getByTestId("agent-draft-profile").locator('[data-profile-key="summary"] textarea').fill("守灯人，知道旧钥匙的去处。");
  await page.getByRole("button", { name: "保存草稿修改", exact: true }).click();
  await page.getByRole("button", { name: "确认保存为资料", exact: true }).click();
  await page.getByTestId("card-editor").waitFor();
  assert.equal(await page.locator('[data-testid="object-profile-editor"]').count(), 1);
  assert.equal(await page.locator('[data-profile-key="summary"] textarea').inputValue(), "守灯人，知道旧钥匙的去处。");
  await capture(page, "01-character-profile-1440x900.png");

  await page.setViewportSize({ width: 1024, height: 768 });
  await assertTrueCssViewport(page, 1024, 768, "character profile 1024");
  await capture(page, "02-character-profile-1024x768.png");

  await openDirectory(page, "item");
  await page.getByRole("button", { name: "新建物品", exact: true }).click();
  await page.getByTestId("object-path-manual").click();
  await page.getByTestId("new-object-title-input").fill("测试纸条");
  await page.getByTestId("manual-object-profile").locator('[data-profile-key="category"] input').fill("隔离道具");
  await page.getByTestId("manual-object-profile").locator('[data-profile-key="purpose"] textarea').fill("只用于验证作者手动创建路径。");
  await page.getByRole("button", { name: "新建资料", exact: true }).last().click();
  await page.getByTestId("card-editor").waitFor();
  assert.equal(await page.locator('[data-testid="object-profile-editor"]').count(), 1);
  assert.match(await page.locator('[data-testid="object-profile-editor"]').innerText(), /作者已确认/u);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertTrueCssViewport(page, 390, 844, "item holder 390");
  await assertMobileDrawerClosed(page, "item holder 390");
  assert.equal(await page.getByTestId("item-holder-projection").count(), 1);
  await capture(page, "03-item-profile-390x844.png");

  await openDirectory(page, "item");
  await page.getByRole("listitem").filter({ hasText: "旧钥匙" }).first().click();
  await page.getByTestId("card-editor").waitFor();
  await assertTrueCssViewport(page, 390, 844, "seeded item holder 390");
  await assertMobileDrawerClosed(page, "seeded item holder 390");
  assert.match(await page.getByTestId("item-holder-projection").innerText(), /守灯人/u);
  assert.match(await page.getByTestId("item-holder-projection").innerText(), /2026-01-01/u);
  assert.match(await page.getByTestId("item-holder-projection").innerText(), /高置信/u);
  await capture(page, "03b-item-holder-390x844.png");

  await openDirectory(page, "location");
  await page.getByRole("listitem").filter({ hasText: "旧灯塔" }).first().click();
  await page.getByTestId("card-editor").waitFor();
  await assertTrueCssViewport(page, 390, 844, "location topology 390");
  await assertMobileDrawerClosed(page, "location topology 390");
  assert.equal(await page.getByTestId("location-topology-projection").count(), 1);
  assert.match(await page.getByTestId("location-topology-projection").innerText(), /北岸港口/u);
  assert.match(await page.getByTestId("location-topology-projection").innerText(), /相邻/u);
  await capture(page, "04-location-topology-390x844.png");

  await openDirectory(page, "location");
  await page.getByRole("button", { name: "新建地点", exact: true }).click();
  await page.getByTestId("object-path-agent").click();
  await page.getByTestId("agent-draft-intent").fill("一座尚未命名的山口");
  await page.getByTestId("agent-draft-submit").click();
  await page.getByTestId("agent-draft-review").waitFor();
  assert.equal(await page.getByTestId("agent-draft-confirm").isVisible(), true);
  await capture(page, "05-agent-location-review-390x844.png");
  await page.getByRole("button", { name: "暂不保存", exact: true }).click();

  assert.deepEqual(unexpectedExternalCalls, [], "core Library object authoring must not call a real provider or plugin");
  assert.equal(failedRequests.length, 0, `browser requests failed: ${JSON.stringify(failedRequests)}`);
  assert.equal(consoleMessages.length, 0, `browser console errors/warnings: ${JSON.stringify(consoleMessages)}`);
  writeFileSync(path.join(outputDir, "run-report.json"), JSON.stringify({ projectId, viewportGate: "390x844", screenshots, consoleMessages, failedRequests, unexpectedExternalCalls, realProviderCalls: 0, realPluginCalls: 0 }, null, 2));
  console.log(JSON.stringify({ projectId, screenshots, consoleMessages, failedRequests, unexpectedExternalCalls, realProviderCalls: 0, realPluginCalls: 0 }));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(outputDir, "failure-current-state.png"), fullPage: true }).catch(() => undefined);
    writeFileSync(path.join(outputDir, "failure-report.json"), JSON.stringify({ url: page.url(), bodyText: await page.locator("body").innerText().catch(() => ""), consoleMessages, failedRequests, unexpectedExternalCalls }, null, 2));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (vite) await terminateChildProcess(vite, { label: "Agent core Library Vite", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
  if (server) await terminateChildProcess(server, { label: "Agent core Library server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
  rmSync(workspaceRoot, { recursive: true, force: true });
  rmSync(stateFilePath, { force: true });
}

async function openDirectory(page, directory) {
  await page.goto(`${baseUrl}/library?skipIntro=1&libraryTab=classified&libraryDirectory=${directory}`, { waitUntil: "networkidle" });
  await page.getByTestId("library-directory-workbench").waitFor();
  await page.getByTestId("library-directory-heading").waitFor();
}

async function capture(page, name) {
  screenshots.push(name);
  await page.screenshot({ path: path.join(outputDir, name), fullPage: true });
}

async function assertTrueCssViewport(page, width, height, label) {
  const metrics = await page.evaluate(() => ({ innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(metrics.innerWidth, width, `${label} innerWidth`);
  assert.equal(metrics.clientWidth, width, `${label} clientWidth`);
  assert.equal(metrics.scrollWidth, width, `${label} scrollWidth`);
}

async function assertMobileDrawerClosed(page, label) {
  await page.waitForFunction(() => document.querySelector("[data-module-sidebar-host]")?.getAttribute("data-mobile-closed") === "true", undefined, { timeout: 2_000 });
  await page.waitForFunction(() => {
    const slot = document.querySelector("[data-module-sidebar-host] .workspace-sidebar-slot");
    if (!slot) return false;
    const rect = slot.getBoundingClientRect();
    return rect.left + rect.width <= 1;
  }, undefined, { timeout: 2_000 });
  const state = await page.evaluate(() => {
    const host = document.querySelector("[data-module-sidebar-host]");
    const slot = host?.querySelector(".workspace-sidebar-slot");
    const aside = document.querySelector("aside.world-library");
    return {
      hostFound: Boolean(host),
      hostOpen: host?.getAttribute("data-mobile-open") || null,
      hostClosed: host?.getAttribute("data-mobile-closed") || null,
      hostInert: host?.hasAttribute("inert") || false,
      hostPointerEvents: host ? getComputedStyle(host).pointerEvents : null,
      hostFocusableCount: host ? [...host.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]')].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0).length : null,
      slotClass: slot?.className || null,
      slotTransform: slot ? getComputedStyle(slot).transform : null,
      slotRect: slot ? { left: slot.getBoundingClientRect().left, width: slot.getBoundingClientRect().width } : null,
      asideClass: aside?.className || null,
      asideOpen: aside?.getAttribute("data-mobile-open") || null
    };
  });
  assert.equal(state.hostFound, true, `${label} closed drawer state: ${JSON.stringify(state)}`);
  assert.deepEqual({ open: state.hostOpen, closed: state.hostClosed, inert: state.hostInert, pointerEvents: state.hostPointerEvents, focusableCount: state.hostFocusableCount }, { open: "false", closed: "true", inert: true, pointerEvents: "none", focusableCount: 0 }, `${label} closed drawer state: ${JSON.stringify(state)}`);
  assert.ok(state.slotTransform && state.slotTransform !== "none", `${label} closed drawer must be translated off-canvas: ${JSON.stringify(state)}`);
  assert.ok(state.slotRect && state.slotRect.left + state.slotRect.width <= 1, `${label} closed drawer must not occupy the viewport: ${JSON.stringify(state)}`);
}

async function startChildServer() {
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development", PORT: String(serverPort), WORLD_OS_STORY_STUDIO_ROOT: workspaceRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token, TIANYAN_AGENT_DRAFT_FIXTURE_MODE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForUrl(`${serverUrl}/__local/story-studio/bootstrap`, child);
  return child;
}

function startVite() {
  return spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "apps/story-studio/vite.config.ts", "--host", "127.0.0.1", "--port", String(vitePort)], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
}

async function waitForUrl(url, child = null) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child?.exitCode != null) throw new Error(`Child exited with ${child.exitCode} while waiting for ${url}.`);
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

function loadPlaywright() {
  try { return require("playwright"); } catch {
    const bundledPath = path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
    if (existsSync(bundledPath)) return require(bundledPath);
    throw new Error("Playwright is unavailable in this environment.");
  }
}

function resolveBrowserExecutable() {
  const executable = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"].filter(Boolean).find((candidate) => existsSync(candidate));
  assert.ok(executable, "No supported Chromium executable was found.");
  return executable;
}
