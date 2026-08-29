import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const port = 4396;
const apiPort = 4397;
const baseUrl = `http://127.0.0.1:${port}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "tianyan-r0-shell-smoke-"));
const controlToken = "tianyan-r0-shell-smoke-token";
const visualEvidenceDirectory = process.env.TIANYAN_R05_EVIDENCE_DIR || null;
const visualEvidenceViewport = Number(process.env.TIANYAN_R05_EVIDENCE_VIEWPORT || "0");
const visualEvidenceState = process.env.TIANYAN_R05_EVIDENCE_STATE || null;
let server;
let apiServer;
let browser;

try {
  apiServer = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(apiPort), WORLD_OS_STORY_STUDIO_ROOT: fixtureRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(fixtureRoot, ".story-studio", "state.json"), WORLD_OS_LOCAL_CONTROL_TOKEN: controlToken, PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY", REAL_PROVIDER_CREDENTIALS_USED: "0" }
  });
  await waitForApiServer();
  await setupCharacterFixture();
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
  await waitForServer();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1152, height: 720 } });
  const consoleProblems = [];
  page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("response", (response) => response.status() >= 400 && consoleProblems.push(`HTTP ${response.status()}: ${response.url()}`));

  await page.goto(`${baseUrl}/world`, { waitUntil: "networkidle" });
  await page.getByTestId("tianyan-r0-shell").waitFor();
  await assertCollapsedIconRail(page);
  await assertPermissionProjection(page);
  await assertCharacterDirectoryAndInspector(page);
  await assertCharacterCreationDurability(page);
  await assertExactlyOneActiveDestination(page);
  if (visualEvidenceDirectory) await captureCharacterDirectoryEvidence(page, consoleProblems);

  if (!visualEvidenceState) {
    await page.locator(".shell-rail-collapse").click();
    await page.waitForFunction(() => document.querySelector("[data-testid='tianyan-r0-shell']")?.getAttribute("data-rail-collapsed") === "false");
    await page.waitForTimeout(200);
    await assertExpandedLabels(page, "zh-CN");
    await page.goto(`${baseUrl}/world?locale=en-US&rail=expanded`, { waitUntil: "networkidle" });
    await assertExpandedLabels(page, "en-US");
  }
  assert.deepEqual(consoleProblems, [], "R0 shell smoke must not produce console warnings or errors");
  console.log("tianyan R0 shell smoke PASS: responsive rail plus real character directory and read-only inspector");
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Tianyan R0 shell smoke server" });
  if (apiServer) await terminateChildProcess(apiServer, { label: "Tianyan R0 shell smoke API" });
  rmSync(fixtureRoot, { recursive: true, force: true });
}

async function assertPermissionProjection(page) {
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
}

async function assertCharacterDirectoryAndInspector(page) {
  const workspaceBefore = await page.locator(".shell-workspace").evaluate((element) => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() }));
  await page.locator('[data-directory-node="directory.library.character"]').click();
  await page.getByTestId("character-directory").waitFor();
  assert.equal(await page.locator(".character-directory-list input[type=checkbox]").count(), 0, "Default directory has no selection checkboxes");
  await page.getByRole("option", { name: /林昭/u }).click();
  await page.getByTestId("character-inspector").waitFor();
  const workspaceAfter = await page.locator(".shell-workspace").evaluate((element) => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() }));
  assert.deepEqual(workspaceAfter, workspaceBefore, "Opening the inspector must not remount or resize the central workspace");
  assert.match(page.url(), /directoryObject=character\./u);
  assert.equal(await page.getByRole("button", { name: "打开完整资料" }).count(), 1);
  await page.getByRole("button", { name: "多选", exact: true }).click();
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
  await page.getByLabel("角色层级").selectOption("main");
  await page.getByLabel("别名").fill("阿砚, 小砚");
  await page.getByLabel("人物摘要").fill("负责追查旧港失踪案的调查者。");
  await page.getByLabel("分类").fill("main-characters");
  await page.getByRole("textbox", { name: "标签", exact: true }).fill("调查, 主线");
  await page.getByRole("button", { name: "创建角色", exact: true }).dblclick();
  await page.getByTestId("character-inspector").waitFor();
  await page.waitForFunction(() => document.querySelector("[data-testid='character-inspector'] h2")?.textContent?.includes("沈砚"));
  assert.match(page.url(), /directoryObject=character\./u, "The created object must be selected through its stable object ID in the URL");
  const createdOption = page.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" });
  await waitForCharacterDirectoryIdle(page);
  await createdOption.waitFor();
  assert.equal(await createdOption.count(), 1, `A double submit must create only one durable character; directory=${await page.locator(".character-directory-list").textContent()}`);
  assert.match(await page.getByTestId("character-inspector").textContent(), /负责追查旧港失踪案/u, "The saved summary must be rendered from the durable character card");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("character-directory").waitFor();
  await waitForCharacterDirectoryIdle(page);
  assert.equal(await page.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" }).count(), 1, "The character must survive a browser refresh");
  const freshContext = await browser.newContext({ viewport: { width: 1152, height: 720 } });
  const freshSession = await freshContext.newPage();
  try {
    await freshSession.goto(`${baseUrl}/world?directoryView=characters`, { waitUntil: "networkidle" });
    await freshSession.getByTestId("character-directory").waitFor();
    await waitForCharacterDirectoryIdle(freshSession);
    assert.equal(await freshSession.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" }).count(), 1, "The character must survive a new Shell session");
  } finally {
    await freshContext.close();
  }
  await assertCreatedCharacterIsProjectIsolated();
}

async function assertCreatedCharacterIsProjectIsolated() {
  const projectId = "r05-character-directory-isolated";
  const base = `${apiUrl}/__local/story-studio`;
  await postFixture(`${base}/projects/create`, { title: "隔离项目", folderSlug: projectId });
  const response = await fetch(`${base}/world-library?projectId=${encodeURIComponent(projectId)}`);
  if (!response.ok) throw new Error(`Isolated project read failed: ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.data.objects.some((object) => object.title === "沈砚"), false, "A created character must not appear in another project");
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

/** Optional external evidence only; this is never a production screenshot fixture. */
async function captureCharacterDirectoryEvidence(page, consoleProblems) {
  mkdirSync(visualEvidenceDirectory, { recursive: true });
  const captures = [];
  const capture = async (viewport, state) => {
    const characterName = viewport.width === 1920 ? "林昭" : viewport.width === 1440 ? "阿芜" : "陆衍";
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.removeItem("story-studio:ai-control-center:v1"));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-directory-node="directory.library.character"]').click();
    await page.getByTestId("character-directory").waitFor();
    await waitForCharacterDirectoryIdle(page);
    const currentCharacter = page.getByRole("option", { name: new RegExp(characterName, "u") });
    await currentCharacter.waitFor();
    if (state === "form" || state === "required" || state === "created" || state === "refreshed") {
      await page.getByRole("button", { name: "新建", exact: true }).click();
      await page.getByRole("dialog", { name: "新建角色" }).waitFor();
    }
    if (state === "required") await page.getByRole("button", { name: "创建角色", exact: true }).click();
    if (state === "created" || state === "refreshed") {
      await page.getByLabel("姓名").fill(`新建角色${viewport.width}`);
      await page.getByLabel("人物摘要").fill("用于浏览器视觉验收的本地隔离角色。");
      await page.getByLabel("分类").fill("visual-check");
      await page.getByRole("button", { name: "创建角色", exact: true }).click();
      await page.getByTestId("character-inspector").waitFor();
      if (state === "refreshed") await page.reload({ waitUntil: "networkidle" });
    }
    if (state === "world-active") {
      await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
    }
    if (state === "inspector" || state === "compact" || state === "multi" || state === "archive") await currentCharacter.click();
    if (state === "compact") await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "缩略版", exact: true }).click();
    if (state === "multi" || state === "archive") await page.getByRole("button", { name: "多选", exact: true }).click();
    if (state === "archive") {
      await currentCharacter.click();
      await page.locator(".character-selection-bar").getByRole("button", { name: "归档", exact: true }).click();
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: "完成", exact: true }).click();
      await page.getByTestId("character-directory").locator("footer").getByRole("button", { name: "归档", exact: true }).click();
    }
    const filename = `${viewport.width}x${viewport.height}-${state}.png`;
    await page.screenshot({ path: path.join(visualEvidenceDirectory, filename), fullPage: true });
    captures.push({ filename, viewport, state, projectId: "r05-character-directory", workVersionId: null, url: page.url(), isolatedTestData: true, consoleProblems: [...consoleProblems] });
  };
  const viewports = [{ width: 1920, height: 1000 }, { width: 1440, height: 900 }, { width: 1152, height: 720 }].filter((viewport) => !visualEvidenceViewport || viewport.width === visualEvidenceViewport);
  const states = ["standard", "form", "required", "created", "refreshed", "inspector", "compact", "multi", "archive", "world-active"].filter((state) => !visualEvidenceState || state === visualEvidenceState);
  for (const viewport of viewports) {
    for (const state of states) await capture(viewport, state);
  }
  const suffix = visualEvidenceViewport && visualEvidenceState ? `${visualEvidenceViewport}-${visualEvidenceState}` : "all";
  writeFileSync(path.join(visualEvidenceDirectory, `capture-manifest-${suffix}.json`), `${JSON.stringify(captures, null, 2)}\n`, "utf8");
}

async function assertCollapsedIconRail(page) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='tianyan-r0-shell']");
    const rail = document.querySelector(".shell-space-rail");
    const labels = [...document.querySelectorAll(".shell-space-label")];
    const controls = [...document.querySelectorAll("[data-shell-destination], [data-shell-utility]")];
    return {
      collapsed: shell?.getAttribute("data-rail-collapsed"),
      railWidth: rail?.getBoundingClientRect().width ?? 0,
      visibleLabels: labels.filter((label) => getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0).map((label) => label.textContent),
      unnamedControls: controls.filter((control) => !control.getAttribute("aria-label") || !control.getAttribute("title")).length
    };
  });
  assert.equal(state.collapsed, "true");
  assert.equal(state.railWidth, 56);
  assert.deepEqual(state.visibleLabels, []);
  assert.equal(state.unnamedControls, 0);
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

async function setupCharacterFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  await postFixture(`${base}/projects/create`, { title: "长夜将明", folderSlug: "r05-character-directory" });
  for (const character of [{ title: "林昭", subtype: "主要角色" }, { title: "阿芜", subtype: "配角" }, { title: "陆衍", subtype: "次要角色" }]) {
    await postFixture(`${base}/characters/create`, { projectId: "r05-character-directory", title: character.title, mode: "freeform", subtype: character.subtype });
  }
}

async function postFixture(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-world-os-local-control-token": controlToken }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
