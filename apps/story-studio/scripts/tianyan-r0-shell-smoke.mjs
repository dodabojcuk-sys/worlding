import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { terminateChildProcess } from "./bounded-process-teardown.mjs";
import { createTianyanE2eFixture, removeTianyanE2eFixture } from "../../../scripts/tianyan-e2e-fixture.mjs";
import { assertCanonicalRuntime } from "../../../scripts/canonical-runtime.mjs";

assertCanonicalRuntime();
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const port = 4396;
const apiPort = 4397;
const baseUrl = `http://127.0.0.1:${port}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const fixture = createTianyanE2eFixture();
const fixtureRoot = fixture.fixtureRoot;
const fixtureProjectId = fixture.projectId;
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
    env: { ...process.env, PORT: String(apiPort), WORLD_OS_STORY_STUDIO_ROOT: fixtureRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(fixtureRoot, ".story-studio", "state.json"), WORLD_OS_LOCAL_CONTROL_TOKEN: controlToken, PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY", REAL_PROVIDER_CREDENTIALS_USED: "0", TIANYAN_AGENT_FAKE_PROVIDER_STREAM: "1" }
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
  await assertSingleGlobalSearch(page);
  await assertCharacterDirectoryAndInspector(page);
  await assertCharacterCreationDurability(page);
  await assertCharacterDirectoryFiltersAndLifecycle(page);
  await assertExactlyOneActiveDestination(page);
  if (visualEvidenceDirectory) await captureCharacterDirectoryEvidence(page, consoleProblems);

  if (!visualEvidenceState) {
    if (await page.getByTestId("tianyan-r0-shell").getAttribute("data-rail-collapsed") !== "false") await page.locator(".shell-rail-collapse").click();
    await page.waitForFunction(() => document.querySelector("[data-testid='tianyan-r0-shell']")?.getAttribute("data-rail-collapsed") === "false");
    await page.waitForTimeout(200);
    await assertExpandedLabels(page, "zh-CN");
    await page.goto(`${baseUrl}/world?locale=en-US&rail=expanded`, { waitUntil: "networkidle" });
    await assertExpandedLabels(page, "en-US");
  }
  await assertAgentFakeProviderStream(page);
  assert.deepEqual(consoleProblems, [], "R0 shell smoke must not produce console warnings or errors");
  console.log("tianyan R0 shell smoke PASS: responsive rail plus real character directory and read-only inspector");
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Tianyan R0 shell smoke server" });
  if (apiServer) await terminateChildProcess(apiServer, { label: "Tianyan R0 shell smoke API" });
  removeTianyanE2eFixture(fixture);
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
  assert.match(page.url(), /directoryReview=pending/u, "Pending review stays in the directory URL state rather than navigating to Data");
  assert.match(new URL(page.url()).pathname, /\/(world|event-line|library|tianyi|collections)/u, "Pending review must not force the Data route");
  await page.getByRole("tab", { name: /已分类/u }).click();
}

async function assertCharacterDirectoryAndInspector(page) {
  const workspaceBefore = await page.locator(".shell-workspace").evaluate((element) => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() }));
  await page.locator('[data-directory-node="directory.library.character"]').click();
  await page.getByTestId("character-directory").waitFor();
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
  assert.deepEqual(workspaceAfter, workspaceBefore, "Opening the inspector must not remount or resize the central workspace");
  assert.match(page.url(), /directoryObject=character\./u);
  assert.equal(await page.getByRole("button", { name: "打开完整资料" }).count(), 1);
  await page.getByRole("button", { name: "打开完整资料" }).click();
  await page.getByRole("form", { name: "完整角色资料" }).waitFor();
  assert.match(page.url(), /directoryEdit=character/u, "Full profile opens through the stable character URL");
  await page.getByRole("form", { name: "完整角色资料" }).getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "展开角色检查器" }).click();
  assert.equal(await page.getByTestId("character-inspector").getAttribute("aria-expanded"), "true", "The inspector expands as an overlay without moving the workspace");
  assert.deepEqual(await page.locator(".shell-workspace").evaluate((element) => element.getBoundingClientRect().toJSON()), workspaceBefore.rect, "Expanding the inspector must not resize the central workspace");
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
  const createdOption = page.locator(".character-directory-list [role='option']").filter({ hasText: "沈砚" });
  await waitForCharacterDirectoryIdle(page);
  await createdOption.waitFor();
  assert.equal(await createdOption.count(), 1, `A double submit must create only one durable character; directory=${await page.locator(".character-directory-list").textContent()}`);
  assert.match(await page.getByTestId("character-inspector").textContent(), /主要人物/u, "Created categories must render their user-facing names rather than persistence IDs");
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
  await postFixture(`${apiUrl}/__local/story-studio/projects/open`, { projectId: fixtureProjectId });
  await page.goto(`${baseUrl}/world?directoryView=characters`, { waitUntil: "networkidle" });
  await page.getByTestId("character-directory").waitFor();
  await waitForCharacterDirectoryIdle(page);
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByLabel("姓名").fill("自定义层级角色");
  await page.getByLabel("角色层级").fill("夜航人");
  await page.getByRole("button", { name: "创建角色", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid='character-inspector'] h2")?.textContent?.includes("自定义层级角色"));
  assert.match(await page.getByTestId("character-inspector").textContent(), /夜航人/u, "A custom role level must survive the create projection");
  await page.reload({ waitUntil: "networkidle" });
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
  await page.reload({ waitUntil: "networkidle" });
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
  await page.reload({ waitUntil: "networkidle" });
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
  if (await page.locator(".tianyi-sidebar").count() === 0) await page.getByRole("button", { name: "打开全局天意", exact: true }).click();
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
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
    await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.removeItem("story-studio:ai-control-center:v1"));
    await page.reload({ waitUntil: "networkidle" });
    if (state === "settings") {
      await page.goto(`${baseUrl}/settings/storage`, { waitUntil: "networkidle" });
      await page.locator(".settings-utility-route").waitFor();
    }
    if (state === "agent-flow") {
      await page.evaluate(() => window.sessionStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await startAgentFakeProviderStream(page, `R0.6 Agent 流视觉验收 ${viewport.width}`);
    }
    if (state === "pending-review") {
      const toggle = page.locator(".shell-topbar-panel-toggle");
      if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
      await page.getByRole("tab", { name: /待确认/u }).click();
      await page.locator(".pending-review-panel").waitFor();
    }
    if (state === "character-directory") {
      const toggle = page.locator(".shell-topbar-panel-toggle");
      if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
      await page.locator('[data-directory-node="directory.library.character"]').click();
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
      await page.locator('[data-directory-node="directory.library.character"]').click();
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
      if (state === "refreshed") await page.reload({ waitUntil: "networkidle" });
    }
    if (state === "world-active") {
      await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
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
      await page.reload({ waitUntil: "networkidle" });
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
  await postFixture(`${base}/projects/create`, { title: "长夜将明", folderSlug: fixtureProjectId });
  for (const character of [{ title: "林昭", subtype: "主要角色" }, { title: "阿芜", subtype: "配角" }, { title: "陆衍", subtype: "次要角色" }]) {
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

async function postFixture(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-world-os-local-control-token": controlToken }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
