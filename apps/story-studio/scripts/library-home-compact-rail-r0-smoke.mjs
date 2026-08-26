import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { createStoryStudioWorkspaceOperations } from "../../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const workspaceRoot = path.join(tmpdir(), `tianyan-library-home-r0-${process.pid}`);
const stateFilePath = path.join(tmpdir(), `tianyan-library-home-r0-${process.pid}.json`);
const projectId = "library-home-populated-r0";
const emptyProjectId = "library-home-empty-r0";
const port = 4396;
const baseUrl = `http://127.0.0.1:${port}`;
const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
const evidenceDir = path.resolve(process.env.TIANYAN_LIBRARY_EVIDENCE_DIR || path.join(homedir(), "Documents", "codex-workspace-evidence", `TIANYAN_LIBRARY_HOME_AND_COMPACT_RAIL_R0_${timestamp}`));
let server;
let browser;

mkdirSync(evidenceDir, { recursive: true });
const operations = createStoryStudioWorkspaceOperations({ rootPath: workspaceRoot, stateFilePath });
operations.createProject({ title: "岚川资料样本", folderSlug: projectId, genre: "mystery", ambience: "rain-lighthouse" });
operations.createProject({ title: "空资料样本", folderSlug: emptyProjectId, genre: "mystery", ambience: "quiet-room" });
operations.openProject({ projectId });
const character = operations.createWorldObject({ projectId, type: "character", title: "林远", tags: ["fixture"] });
operations.createWorldObject({ projectId, type: "location", title: "钟楼外侧", tags: ["fixture"] });
operations.createWorldObject({ projectId, type: "item", title: "旧钥匙", tags: ["fixture"] });
operations.createWorldObject({ projectId, type: "faction", title: "南岸商会", tags: ["fixture"] });
operations.createWorldObject({ projectId, type: "event", title: "夜雨来信", status: "planned", tags: ["fixture"] });
const folder = operations.createWorkspaceFolder({ projectId, title: "第一卷" }).folder;
operations.moveWorldObjectsToFolder({ projectId, objectIds: [character.id], folderId: folder.id });

if (process.env.STORY_STUDIO_SKIP_BUILD !== "1") execFileSync("npm", ["run", "build"], { stdio: "inherit" });

try {
  server = await startServer();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleMessages = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => consoleMessages.push({ type: "pageerror", text: error.message }));
  page.on("requestfailed", (request) => failedRequests.push({ type: "requestfailed", url: request.url(), error: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push({ type: "http", status: response.status(), url: response.url() });
  });

  await page.goto(`${baseUrl}/library`, { waitUntil: "networkidle" });
  await page.getByTestId("library-home-workbench").waitFor();
  await assertLibraryHome(page, 1440);
  await capture(page, "01-library-home-1440x900.png");
  const structureDisclosure = page.getByRole("button", { name: /^资料结构/u });
  assert.equal(await structureDisclosure.getAttribute("aria-expanded"), "false");
  await structureDisclosure.click();
  assert.equal(await structureDisclosure.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator("#library-home-structure-actions > button").count(), 3);
  await capture(page, "02-library-home-structure-expanded-1440x900.png");
  await structureDisclosure.press("Escape");
  assert.equal(await structureDisclosure.getAttribute("aria-expanded"), "false");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "library-home-structure-title");

  await page.setViewportSize({ width: 1024, height: 768 });
  await assertLibraryHome(page, 1024);
  await capture(page, "03-library-home-1024x768.png");

  await page.setViewportSize({ width: 1600, height: 900 });
  await assertLibraryHome(page, 1600);
  await capture(page, "04-library-home-1600x900.png");

  await page.getByRole("button", { name: /全部资料 5 项资料/ }).click();
  await page.getByRole("heading", { name: "全部资料", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("libraryDirectory"), "all");
  await capture(page, "05-library-all-directory-1600x900.png");

  await page.goto(`${baseUrl}/library`, { waitUntil: "networkidle" });
  await page.getByTestId("library-home-workbench").waitFor();
  const search = page.getByRole("textbox", { name: "搜索资料" });
  await search.fill("不存在的资料");
  await page.getByRole("heading", { name: "搜索结果", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("libraryDirectory"), "all");
  assert.equal(await page.getByText("换一个搜索词", { exact: true }).count(), 0);
  await capture(page, "06-library-search-no-result-1440x900.png");
  await page.getByRole("button", { name: "清空搜索" }).click();
  await page.getByTestId("library-home-workbench").waitFor();

  await page.getByRole("tab", { name: "待确定", exact: true }).click();
  await page.getByRole("heading", { name: "待确定", exact: true }).waitFor();
  assert.equal(await page.locator(".library-directory-info-note").count(), 1);
  assert.equal(await page.locator(".world-library .library-directory-info-note").count(), 0);
  await capture(page, "07-library-pending-1440x900.png");

  await page.getByRole("button", { name: "资料库首页", exact: true }).click();
  await page.getByTestId("library-home-workbench").waitFor();
  await page.getByTestId("library-home-organize").getByRole("button", { name: /^导入与审核/u }).click();
  await page.getByRole("main", { name: "资料导入审核", exact: true }).waitFor();
  await capture(page, "08-library-import-1440x900.png");
  await page.getByRole("button", { name: "返回资料库", exact: true }).click();
  await page.getByTestId("library-home-workbench").waitFor();
  const desktopRail = page.locator(".world-library");
  assert.equal(await desktopRail.getByRole("button", { name: /^最近更新/u }).count(), 0);
  assert.equal(await desktopRail.getByRole("button", { name: /^未归档/u }).count(), 0);
  await page.getByTestId("library-home-organize").getByRole("button", { name: /^未归档/u }).click();
  await page.getByRole("heading", { name: "未归档", exact: true }).waitFor();
  assert.match(await page.locator(".library-directory-workbench").innerText(), /4 项未归档/u);
  await capture(page, "09-library-unfiled-1440x900.png");

  await page.goto(`${baseUrl}/library`, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("library-home-workbench").waitFor();
  await page.waitForFunction(() => {
    const element = document.querySelector(".world-library");
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.right < 0 && !element.getAnimations({ subtree: true }).some((animation) => ["running", "pending"].includes(animation.playState));
  });
  assert.equal(await horizontalOverflow(page), 0);
  await capture(page, "10-library-home-mobile-390x844.png", false);
  const mobileTrigger = page.getByRole("button", { name: "打开项目导航", exact: true });
  await mobileTrigger.click();
  const rail = page.locator(".world-library");
  await rail.locator('button[aria-label="关闭资料库目录"]').waitFor();
  await page.waitForFunction(() => document.querySelector(".world-library")?.getAttribute("data-mobile-open") === "true");
  await page.waitForFunction(() => {
    const element = document.querySelector(".world-library");
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.x >= -1 && rect.right <= innerWidth + 1 && !element.getAnimations({ subtree: true }).some((animation) => ["running", "pending"].includes(animation.playState));
  });
  const drawerBox = await rail.boundingBox();
  assert.ok(drawerBox && drawerBox.x >= -1 && drawerBox.x + drawerBox.width <= 391 && drawerBox.width >= 250 && drawerBox.width <= 321, `Mobile Library drawer is not contained: ${JSON.stringify(drawerBox)}`);
  assert.equal(await horizontalOverflow(page), 0);
  await capture(page, "11-library-drawer-mobile-390x844.png", false);
  await rail.locator('button[aria-label="关闭资料库目录"]').click();
  await page.waitForFunction(() => document.querySelector(".world-library")?.getAttribute("data-mobile-open") === "false");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "打开项目导航");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "打开项目导航");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "切换当前作品" }).click();
  await page.getByRole("dialog", { name: "作品切换器" }).getByRole("button", { name: /^空资料样本/u }).click();
  await page.locator('.global-project-title-trigger strong[title="空资料样本"]').waitFor();
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page.getByTestId("library-home-workbench").waitFor();
  await page.getByText("这个作品还没有资料", { exact: true }).waitFor();
  await assertLibraryHome(page, 1440, { empty: true });
  await capture(page, "12-library-home-empty-1440x900.png");

  assert.deepEqual(consoleMessages, [], `Browser console errors/warnings: ${JSON.stringify(consoleMessages)}`);
  assert.deepEqual(failedRequests, [], `Browser network failures: ${JSON.stringify(failedRequests)}`);
  console.log(JSON.stringify({
    status: "PASS",
    evidenceDir,
    screenshots: 12,
    desktopRailWidthPx: 224,
    mobileDrawerWidthPx: drawerBox?.width || null,
    horizontalOverflow: 0,
    consoleErrors: 0,
    consoleWarnings: 0,
    failedRequests: 0,
    providerCalls: 0,
    domainWrites: 0
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Library Home smoke server" });
}

async function assertLibraryHome(page, viewportWidth, options = {}) {
  const home = page.getByTestId("library-home-workbench");
  await home.waitFor();
  const heading = page.getByRole("heading", { name: "资料库", exact: true });
  assert.equal(await heading.count(), 1);
  assert.equal(await page.locator('input[aria-label="搜索资料"]:visible').count(), 1);
  assert.equal(await home.locator("button.primary-action:visible").count(), 1);
  const rail = page.locator(".world-library");
  const railBox = await rail.boundingBox();
  assert.ok(railBox, `Library rail is missing at ${viewportWidth}px.`);
  assert.ok(Math.abs(railBox.width - 224) <= 1, `Library rail is ${railBox.width}px at ${viewportWidth}px.`);
  assert.equal(await horizontalOverflow(page), 0);
  if (options.empty) {
    assert.equal(await page.getByText("新建第一份资料，或从“导入与审核”开始整理。", { exact: true }).count(), 1);
    assert.equal(await page.getByTestId("library-home-recent").count(), 0);
  } else {
    assert.equal(await page.getByRole("heading", { name: "最近更新", exact: true }).count(), 1);
  }
}

async function capture(page, filename, fullPage = true) {
  await page.screenshot({ path: path.join(evidenceDir, filename), fullPage });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}

function startServer() {
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: workspaceRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  return waitForServer(child);
}

async function waitForServer(child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Story Studio server exited with ${child.exitCode}.`);
    try { if ((await fetch(`${baseUrl}/__local/story-studio/bootstrap`)).ok) return child; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill("SIGTERM");
  throw new Error("Timed out waiting for Story Studio server.");
}

function loadPlaywright() {
  try { return require("playwright"); } catch {
    const bundledPath = path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
    if (existsSync(bundledPath)) return require(bundledPath);
    throw new Error("Playwright is unavailable in this environment.");
  }
}

function resolveBrowserExecutable() {
  const executable = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    .filter(Boolean)
    .find((candidate) => existsSync(candidate));
  assert.ok(executable, "No supported Chromium executable was found.");
  return executable;
}
