import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

import { terminateChildProcess } from "./bounded-process-teardown.mjs";
import { createTianyanE2eFixture, removeTianyanE2eFixture } from "../../../scripts/tianyan-e2e-fixture.mjs";
import { assertCanonicalRuntime } from "../../../scripts/canonical-runtime.mjs";

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
const fixtureProjectId = fixture.projectId;
const controlToken = "tianyan-r0-shell-smoke-token";
const visualEvidenceDirectory = process.env.TIANYAN_R05_EVIDENCE_DIR || null;
const visualEvidenceViewport = Number(process.env.TIANYAN_R05_EVIDENCE_VIEWPORT || "0");
const visualEvidenceState = process.env.TIANYAN_R05_EVIDENCE_STATE || null;
const r062VisualEvidenceDirectory = process.env.TIANYAN_R062_EVIDENCE_DIR || null;
const eventGraphEvidenceDirectory = process.env.TIANYAN_EVENT_GRAPH_EVIDENCE_DIR || null;
const eventGraphDensityEvidence = process.env.TIANYAN_EVENT_GRAPH_DENSITY_EVIDENCE === "1";
const eventGraphRecordingDirectory = process.env.TIANYAN_EVENT_GRAPH_RECORDING_DIR || null;
const founderEvidenceDirectory = process.env.TIANYAN_FOUNDER_EVIDENCE_DIR || null;
const multiNodePredictionEvidenceDirectory = process.env.TIANYAN_MULTI_NODE_PREDICTION_EVIDENCE_DIR || null;
const predictionOnly = process.env.TIANYAN_E2E_SCOPE === "multi-node-prediction";
let timelineFixture = null;
let server;
let apiServer;
let browser;
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
  apiServer = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(apiPort), WORLD_OS_STORY_STUDIO_ROOT: fixtureRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(fixtureRoot, ".story-studio", "state.json"), WORLD_OS_LOCAL_CONTROL_TOKEN: controlToken, PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY", REAL_PROVIDER_CREDENTIALS_USED: "0", TIANYAN_AGENT_FAKE_PROVIDER_STREAM: "1" }
  });
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
  await waitForServer();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1152, height: 720 } });
  const consoleProblems = [];
  page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("response", (response) => response.status() >= 400 && consoleProblems.push(`HTTP ${response.status()}: ${response.url()}`));

  await page.goto(`${baseUrl}/world`, { waitUntil: "networkidle" });
  await page.getByTestId("tianyan-r0-shell").waitFor();
  if (predictionOnly) {
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await setupTimelineFixture();
    await assertMultiNodePredictionProductization(page, consoleProblems);
  } else {
    await assertNoProjectDirectoryShell(page);
    if (r062VisualEvidenceDirectory) await captureR062EmptyDirectoryEvidence(page, consoleProblems);
    await setupZeroItemFixture();
    await page.reload({ waitUntil: "networkidle" });
    await assertZeroItemDirectoryShell(page);
    await setupCharacterFixture();
    await setupEventGraphFixture();
    await page.reload({ waitUntil: "networkidle" });
    await assertExpandedLabels(page, "zh-CN");
    await assertResponsiveHeader922(page);
    await page.setViewportSize({ width: 1152, height: 720 });
    await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
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
      await page.goto(`${baseUrl}/world?locale=en-US&rail=expanded`, { waitUntil: "networkidle" });
      await assertExpandedLabels(page, "en-US");
    }
    if (eventGraphRecordingDirectory) await recordEventGraphOperation();
    await assertEventGraphWorkspace(page);
    await setupTimelineFixture();
    await assertTimelineRelationshipGraph(page, consoleProblems);
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
  removeTianyanE2eFixture(fixture);
}

async function assertPermissionProjection(page) {
  await page.getByRole("button", { name: "打开全局天意", exact: true }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "TIANYI", "The shared right work surface must explicitly own Tianyi while its composer is visible.");
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
  await page.getByRole("button", { name: "关闭全局天意", exact: true }).first().click();
  await page.getByRole("button", { name: "打开工程目录", exact: true }).click();
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
  await page.getByRole("button", { name: "多选", exact: true }).click();
  assert.ok(await page.locator(".character-directory-list input[type=checkbox]").count() > 0, "Multi-select exposes checkboxes only after activation");
  assert.equal(await page.getByRole("button", { name: /永久删除/u }).count(), 0, "Permanent delete is safely blocked from the directory UI");
  await page.getByTestId("character-inspector").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTestId("character-inspector").waitFor({ state: "hidden" });
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
  assert.doesNotMatch(await page.getByTestId("character-directory").textContent(), /main-characters/u, "Created category IDs must remain persistence-only values");
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
  // The author-event scenario ends in the graph workspace. Reset the unrelated
  // fake-provider regression to a stable shell surface before opening Tianyi.
  await page.goto(`${baseUrl}/world?locale=zh-CN`, { waitUntil: "networkidle" });
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
    const globalToggle = page.locator('[data-panel-toggle="global-tianyi"]');
    if (await globalToggle.isVisible()) {
      // A previous scenario can leave the responsive Dock's boolean state true
      // while its narrow-layout panel is not rendered. Normalize to closed,
      // then open through the same product control a user sees.
      if (await globalToggle.getAttribute("aria-pressed") === "true") {
        await globalToggle.click();
        await page.waitForFunction(() => document.querySelector('[data-panel-toggle="global-tianyi"]')?.getAttribute("aria-pressed") === "false");
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
      const toggle = page.locator('[data-panel-toggle="project-directory"]');
      if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
      await page.getByRole("tab", { name: /待确认/u }).click();
      await page.locator(".pending-review-panel").waitFor();
    }
    if (state === "character-directory") {
      const toggle = page.locator('[data-panel-toggle="project-directory"]');
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

async function assertNoProjectDirectoryShell(page) {
  const panel = page.locator(".project-directory-panel");
  await panel.waitFor();
  for (const label of ["故事结构", "节点", "单元", "故事线", "信息资料", "角色", "物品", "地点", "组织", "设定", "规则与设定", "来源", "来源文档", "创意", "剧情想法"]) {
    await panel.getByText(label, { exact: true }).waitFor();
  }
  assert.equal(await panel.locator(".project-directory-tree strong").allTextContents().then((counts) => counts.every((count) => count === "0")), true, "No-project classified view keeps every fixed category at zero.");
  await panel.getByText("尚未打开作品", { exact: false }).waitFor();
  await panel.getByRole("button", { name: "新建作品", exact: true }).waitFor();
  await panel.getByRole("button", { name: "导入 .tianyan", exact: true }).waitFor();
  await panel.getByRole("tab", { name: /待确认/u }).click();
  await panel.getByText("暂无待确认项。", { exact: true }).waitFor();
  await panel.getByRole("tab", { name: /已分类/u }).click();
}

async function assertZeroItemDirectoryShell(page) {
  const panel = page.locator(".project-directory-panel");
  await panel.waitFor();
  await panel.getByText("故事结构", { exact: true }).waitFor();
  assert.equal(await panel.locator(".project-directory-tree strong").allTextContents().then((counts) => counts.every((count) => count === "0")), true, "A project with zero records keeps the same classified shell.");
  assert.equal(await panel.locator("[data-directory-empty-shell-actions]").count(), 0, "An opened empty project must not be presented as an import-only state.");
}

async function assertResponsiveHeader922(page) {
  await page.setViewportSize({ width: 922, height: 720 });
  await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
  const topbar = page.locator(".shell-topbar");
  await topbar.waitFor();
  await page.getByRole("button", { name: "选择当前作品与版本", exact: true }).waitFor();
  const directory = page.locator('[data-panel-toggle="project-directory"]');
  const tianyi = page.locator('[data-panel-toggle="global-tianyi"]');
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
    await page.waitForFunction(() => document.querySelector('[data-panel-toggle="global-tianyi"]')?.getAttribute("aria-pressed") === "false");
  }
}

async function captureR062EmptyDirectoryEvidence(page, consoleProblems) {
  mkdirSync(r062VisualEvidenceDirectory, { recursive: true });
  for (const viewport of [{ width: 1152, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
    const filename = `${viewport.width}x${viewport.height}-empty-classified.png`;
    await page.screenshot({ path: path.join(r062VisualEvidenceDirectory, filename), fullPage: true });
    r062Captures.push({ filename, viewport, state: "no-open-work-classified", url: page.url(), consoleProblems: [...consoleProblems] });
  }
}

async function captureR062PopulatedDirectoryEvidence(page, consoleProblems) {
  mkdirSync(r062VisualEvidenceDirectory, { recursive: true });
  await page.setViewportSize({ width: 922, height: 720 });
  await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(r062VisualEvidenceDirectory, "922px-header.png"), fullPage: true });
  r062Captures.push({ filename: "922px-header.png", viewport: { width: 922, height: 720 }, state: "responsive-header", url: page.url(), consoleProblems: [...consoleProblems] });
  for (const viewport of [{ width: 1152, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/world?rail=expanded`, { waitUntil: "networkidle" });
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

async function setupEventGraphFixture() {
  const base = `${apiUrl}/__local/story-studio`;
  const storyUnit = await postFixture(`${base}/event-line/normal-creation/create-story-unit`, {
    projectId: fixtureProjectId,
    title: "雾港",
    summary: "隔离浏览器验收使用的事件关系范围。"
  });
  const eventTitles = ["旧城停电", "沈砚发现异常信号", "林昭隐瞒真相", "雨夜追踪", "暗号传递", "仓库对峙", "旧仓库封锁", "失踪名单在灯塔守夜人的密室中浮现"];
  for (const title of eventTitles) {
    const candidate = await postFixture(`${base}/event-line/normal-creation/create-candidate`, {
      projectId: fixtureProjectId, storyUnitId: storyUnit.data.result.id, title,
      body: `${title}是隔离事件图验收中的作者确认事实。`
    });
    const planningEventId = candidate.data.result.planning.id;
    await postFixture(`${base}/event-line/normal-creation/begin-impact`, { projectId: fixtureProjectId, storyUnitId: storyUnit.data.result.id, planningEventId });
    await postFixture(`${base}/event-line/normal-creation/confirm`, { projectId: fixtureProjectId, storyUnitId: storyUnit.data.result.id, planningEventId });
  }
  const verified = await getFixture(`${base}/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const verifiedEvents = await Promise.all(verified.data.eventIds.map((eventId) => getFixture(`${base}/event-line/event?projectId=${encodeURIComponent(fixtureProjectId)}&eventId=${encodeURIComponent(eventId)}`)));
  const structuredEvents = await Promise.all(verifiedEvents.map(async (result) => {
    const event = result.data.event;
    const title = String(event.title).replace(/ · 立即揭示$/u, "");
    const inWarehouseSetPoint = title === "仓库对峙" || title === "旧仓库封锁";
    const updated = await postFixture(`${base}/world-objects/update`, {
      projectId: fixtureProjectId,
      objectId: event.id,
      expectedHash: event.revisionToken,
      presentationExpectedHash: null,
      writeMarkdown: true,
      writePresentation: false,
      title: event.title,
      status: event.status,
      tags: [...event.tags.filter((tag) => !/^(?:单元|集点)[：:]/u.test(tag)), "单元：雾港", ...(inWarehouseSetPoint ? ["集点：仓库冲突"] : [])],
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
    const result = await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "event", title, status: "draft", tags: ["作者草稿", "单元：雾港", `时间：${time}`, "地点：雾港"], body: `${title}仅用于隔离时间关系图验收。` });
    created.push(result.data);
  }
  const unknown = (await postFixture(`${base}/world-objects/create`, { projectId: fixtureProjectId, type: "event", title: "待定访客", status: "draft", tags: ["作者草稿", "单元：雾港", "地点：雾港"], body: "该事件的世界时间尚未由作者补充。" })).data;
  const types = await getFixture(`${base}/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const relationTypeId = types.data.types[0]?.relationTypeId;
  assert.ok(relationTypeId, "The isolated time graph fixture must reuse the existing Relation owner type.");
  const candidate = await postFixture(`${base}/relations/create`, { projectId: fixtureProjectId, sourceObjectId: created[0].id, targetObjectId: created[4].id, relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-time-graph-cross-band", operationId: `time-graph-cross-band-${fixture.fixtureId}` });
  await postFixture(`${base}/relations/confirm`, { projectId: fixtureProjectId, relationId: candidate.data.relation.relationId, expectedRelationRevision: candidate.data.relation.revision, operationId: `time-graph-cross-band-confirm-${fixture.fixtureId}` });
  timelineFixture = { timed: created, unknown };
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

async function assertEventGraphWorkspace(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/event-line?locale=zh-CN`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-directory-visible]")?.getAttribute("data-directory-visible") === "false");
  await page.waitForTimeout(220);
  const workspace = page.getByLabel("事件关系工作区");
  await workspace.waitFor();
  assert.equal(await workspace.getAttribute("data-event-graph-owner"), "projection", "The graph remains a projection rather than a second Event owner.");
  assert.equal(await page.locator(".event-graph-node:not(.is-remote)").count(), 8, "The global graph must read the eight confirmed events from the existing Event owner.");
  assert.equal(await page.locator(".page-context-dock").count(), 0, "Graph mode must not mount a second right-side Page Context dock.");
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__edge-path").length >= 6);
  assert.equal(await page.locator(".react-flow__edge-path").count() >= 6, true, "Formal and candidate relations must render through the same graph engine.");
  const closedGeometry = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
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
      giantTitleVisible: Boolean(title && getComputedStyle(title).display !== "none" && title.getBoundingClientRect().height > 0),
      pageToolsVisible: Boolean(pageTools && getComputedStyle(pageTools).display !== "none")
    };
  });
  assert.ok(closedGeometry.flowWidth >= 900, `Closed inspector geometry=${JSON.stringify(closedGeometry)}`);
  assert.ok(closedGeometry.flowHeight >= 740, `Canvas height geometry=${JSON.stringify(closedGeometry)}`);
  assert.ok(closedGeometry.toolbarHeight <= 60, `Toolbar height=${closedGeometry.toolbarHeight}`);
  assert.ok(closedGeometry.nodeWidth >= 115, `Node width=${closedGeometry.nodeWidth}`);
  assert.ok(closedGeometry.nodeTitleFont >= 13, `Node title font=${closedGeometry.nodeTitleFont}`);
  assert.equal(closedGeometry.giantTitleVisible, false, "Graph mode must not retain the prose title area.");
  assert.equal(closedGeometry.pageToolsVisible, false, "Page tools may not create a second permanent right rail in graph mode.");
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

async function assertTimelineRelationshipGraph(page, consoleProblems) {
  assert.ok(timelineFixture, "The time graph must use an isolated fixture.");
  const output = founderEvidenceDirectory;
  if (output) mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/event-line?locale=zh-CN`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  const canvas = page.getByLabel("事件时间关系画布");
  await canvas.waitFor();
  assert.equal(await canvas.getAttribute("data-timeline-graph-engine"), "react-flow", "Timeline must reuse the graph engine.");
  assert.ok(await page.locator(".event-timeline-node").count() >= 12, "Fixture must show eight-plus Event-owner nodes.");
  assert.ok(await page.locator(".event-timeline-band-labels > div").count() >= 4, "Fixture must show four authored time bands.");
  assert.ok(await page.locator(".event-timeline-node.is-unknown").count() >= 2, "Unknown times must stay in their own lane.");
  assert.ok(await page.locator(".react-flow__edge-path").count() >= 6, "Fixture must show six-plus Relation-owner edges.");
  assert.ok(await page.locator(".timeline-cross-band-edge").count() >= 1, "A cross-band relation must remain identifiable.");
  if (output) await page.screenshot({ path: path.join(output, "1440x900-multi-time-band-global.png"), fullPage: true });
  const viewportBeforePan = await page.locator(".event-timeline-flow .react-flow__viewport").getAttribute("style");
  const flowBox = await page.locator(".event-timeline-flow").boundingBox();
  assert.ok(flowBox, "Timeline graph canvas must have a live box.");
  await page.mouse.move(flowBox.x + flowBox.width / 2, flowBox.y + flowBox.height / 2);
  await page.mouse.down(); await page.mouse.move(flowBox.x + flowBox.width / 2 + 80, flowBox.y + flowBox.height / 2 + 30); await page.mouse.up();
  await page.waitForTimeout(120);
  assert.notEqual(await page.locator(".event-timeline-flow .react-flow__viewport").getAttribute("style"), viewportBeforePan, "Timeline canvas must pan.");
  const zoomBefore = await page.locator(".event-timeline-flow .react-flow__viewport").getAttribute("style");
  await page.locator(".event-timeline-flow .react-flow__controls-zoomin").click();
  await page.waitForTimeout(120);
  assert.notEqual(await page.locator(".event-timeline-flow .react-flow__viewport").getAttribute("style"), zoomBefore, "Timeline canvas must zoom.");
  await page.getByRole("button", { name: "适应时间图视图" }).click();
  await page.locator(".event-timeline-node").filter({ hasText: "雾港启航" }).click();
  await page.getByRole("button", { name: "聚焦当前时间节点" }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "EVENT_DETAILS", "Selecting a time node must open the only details surface.");
  if (output) await page.screenshot({ path: path.join(output, "1440x900-selected-cross-band-relation.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "适应时间图视图" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "1280 timeline fit view must not overflow horizontally.");
  if (output) await page.screenshot({ path: path.join(output, "1280x720-time-graph-fit-view.png"), fullPage: true });
  const canonBefore = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const unknown = timelineFixture.unknown;
  const updated = await postFixture(`${apiUrl}/__local/story-studio/world-objects/update`, { projectId: fixtureProjectId, objectId: unknown.id, expectedHash: unknown.revisionToken, presentationExpectedHash: null, writeMarkdown: true, writePresentation: false, title: unknown.title, status: unknown.status, tags: [...unknown.tags, "时间：第 4 夜"], aliases: unknown.aliases, body: unknown.body, subtype: unknown.subtype, typedProperties: unknown.typedProperties, card: unknown.card, profile: unknown.profile });
  timelineFixture.unknown = updated.data.object;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  assert.equal(await page.locator(".event-timeline-node.is-unknown").filter({ hasText: "待定访客" }).count(), 0, "Adding authored time must move the same node out of the unknown lane.");
  assert.equal(await page.locator(".event-timeline-node").filter({ hasText: "待定访客" }).count(), 1, "Time supplementation must keep the stable Event node.");
  const canonAfter = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  assert.deepEqual(canonAfter.data.eventIds, canonBefore.data.eventIds, "Timeline proof may not write Canon.");
  assert.deepEqual(consoleProblems, [], "Timeline interaction must not add browser console errors.");
}

async function assertMultiNodePredictionProductization(page, consoleProblems) {
  const output = multiNodePredictionEvidenceDirectory;
  if (output) mkdirSync(output, { recursive: true });
  const capture = async (name) => { if (output) await page.screenshot({ path: path.join(output, name) }); };
  const openPredictionScope = async () => {
    await page.getByRole("button", { name: "关系图", exact: true }).click();
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
  await page.goto(`${baseUrl}/event-line?locale=zh-CN&rail=expanded`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  const relationsBefore = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const canonBefore = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const libraryBefore = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftCountBefore = libraryBefore.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  await openPredictionScope();
  const panel = page.getByLabel("多节点推演");
  await page.waitForTimeout(260);
  assert.equal(await panel.getByText("推演范围 · 3 个节点", { exact: true }).count(), 1, "The ordered three-source scope must be visible in Tianyi.");
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

  await panel.getByRole("button", { name: "开始推演", exact: true }).click();
  await page.waitForFunction(() => ["generating", "validating", "reviewing"].includes(document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-phase") ?? ""));
  const pendingAccept = panel.locator(".tianyi-prediction-accept");
  if (await pendingAccept.count()) assert.equal(await pendingAccept.isDisabled(), true, "Acceptance must remain disabled while generation or validation is incomplete.");
  await page.waitForFunction(() => document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-phase") === "reviewing");
  assert.ok(await panel.locator(".tianyi-prediction-paths article").count() >= 2, "Ready prediction must expose multiple continuous candidate paths.");

  await panel.locator('[data-path-id="prediction-path.conflict"] button').press("Enter");
  assert.equal(await panel.locator(".tianyi-prediction-accept").isDisabled(), true, "A time-conflict path must remain blocked.");
  await panel.locator('[data-path-id="prediction-path.lighthouse"] button').press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node").length === 3);
  await page.waitForTimeout(260);
  assert.equal(await page.locator(".event-graph-prediction-node").evaluateAll((nodes) => {
    const canvas = document.querySelector(".event-graph-flow")?.getBoundingClientRect();
    return Boolean(canvas && nodes.every((node) => { const rect = node.getBoundingClientRect(); return rect.left >= canvas.left && rect.right <= canvas.right && rect.top >= canvas.top && rect.bottom <= canvas.bottom; }));
  }), true, "The active continuous candidate path must remain fully visible in the canvas.");
  assert.equal(await page.getByText("候选 · 尚未写入事件线", { exact: true }).count() >= 1, true, "Candidate overlay must state that it is not written to the Event Line.");
  assert.equal(await panel.getByText(/时间未定（可继续审阅）/u).count(), 1, "Unknown time stays explicit and reviewable.");
  assert.equal(await panel.locator(".tianyi-prediction-accept").isEnabled(), true, "Unknown time does not block an otherwise valid path.");
  await capture("B-1440x900-candidate-path-overlay.png");

  const firstCandidateCheckbox = panel.locator(".tianyi-prediction-review input[type='checkbox']").first();
  await firstCandidateCheckbox.press("Space");
  assert.match(await panel.locator(".tianyi-prediction-accept").innerText(), /采纳 2 个节点 · 新建 1 个草稿/u, "Partial review must name the exact selected and new-draft counts.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("已选择候选").locator("..").getByText("2", { exact: true }).count(), 1, "Review summary must show two selected candidates.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("引用已有 Event").locator("..").getByText("1", { exact: true }).count(), 1, "Review summary must show one existing Event reference.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("新建 draft Event").locator("..").getByText("1", { exact: true }).count(), 1, "Review summary must show one draft creation.");
  assert.equal(await panel.locator(".tianyi-prediction-adoption-summary").getByText("跳过").locator("..").getByText("1", { exact: true }).count(), 1, "Review summary must show one skipped candidate.");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-prediction-node.is-review-excluded").length === 1);
  assert.equal(await page.locator(".event-graph-prediction-node.is-review-excluded").count(), 1, "Canvas and Tianyi must agree on the excluded candidate.");
  await capture("02-1440x900-truthful-partial-adoption-counts.png");

  const acceptButton = panel.locator(".tianyi-prediction-accept");
  await acceptButton.focus();
  assert.notEqual(await acceptButton.evaluate((button) => getComputedStyle(button).outlineStyle), "none", "Keyboard focus on acceptance must remain visible.");
  await acceptButton.press("Enter");
  await panel.getByText("本次采纳结果", { exact: true }).waitFor();
  await page.getByLabel("单元目录").getByText("异常信号增强", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("单元目录").getByText("异常信号增强", { exact: true }).count(), 1, "Only the Workspace owner-created draft enters the formal Event projection.");
  assert.equal(await page.getByLabel("单元目录").getByText("灯塔失火", { exact: true }).count(), 1, "The excluded candidate must not create a duplicate draft.");
  const relationsAfter = await getFixture(`${apiUrl}/__local/story-studio/relations?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const canonAfter = await getFixture(`${apiUrl}/__local/story-studio/event-line/verified-events?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const libraryAfter = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftCountAfter = libraryAfter.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  assert.equal(draftCountAfter, draftCountBefore + 1, "A two-node adoption with one reference must create exactly one draft Event.");
  assert.equal(relationsAfter.data.relations.length, relationsBefore.data.relations.length, "Prediction acceptance must not create a formal Relation.");
  assert.deepEqual(canonAfter.data.eventIds, canonBefore.data.eventIds, "Prediction acceptance must not change Canon.");
  await capture("D-1440x900-draft-created.png");

  await page.reload({ waitUntil: "networkidle" });
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
  assert.equal(await restoredReceipt.getByText("2", { exact: true }).count() >= 1, true, "The restored receipt must show the selected count.");
  assert.equal(await restoredReceipt.getByText("雾港启航", { exact: true }).count(), 1, "The restored receipt must distinguish the existing Event reference.");
  assert.equal(await restoredReceipt.getByText("异常信号增强", { exact: true }).count(), 1, "The restored receipt must distinguish the new draft Event.");
  assert.equal(await restoredReceipt.getByText("灯塔失火", { exact: true }).count(), 1, "The restored receipt must name the skipped candidate.");
  const libraryAfterRefresh = await getFixture(`${apiUrl}/__local/story-studio/world-library?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const draftCountAfterRefresh = libraryAfterRefresh.data.objects.filter((item) => item.type === "event" && item.status === "draft").length;
  assert.equal(draftCountAfterRefresh, draftCountAfter, "Refresh recovery must not repeat the draft Event write.");
  const firstRunId = await panel.locator(".tianyi-prediction-run-heading span").innerText();
  await capture("03-1440x900-refresh-primary-receipt.png");
  await panel.getByRole("button", { name: "重新推演", exact: true }).click();
  await page.waitForFunction((previous) => {
    const current = document.querySelector(".tianyi-prediction-run-heading span")?.textContent ?? "";
    return current && current !== previous && document.querySelector(".tianyi-prediction-panel")?.getAttribute("data-prediction-phase") === "reviewing";
  }, firstRunId);
  assert.equal(await panel.locator(".tianyi-prediction-history option").count(), 2, "Re-prediction must retain the old Run in history.");
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
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  assert.ok(narrow.sidebarWidth >= 340 && narrow.sidebarWidth <= 380, `1152 Tianyi width=${JSON.stringify(narrow)}`);
  assert.ok(Math.abs(narrow.sidebarRight - 1152) <= 1, `Tianyi must remain rightmost=${JSON.stringify(narrow)}`);
  assert.equal(narrow.directoryVisible, false, `The Unit directory may yield at 1152=${JSON.stringify(narrow)}`);
  assert.match(narrow.sourceSummary, /3 个推演依据/u, `1152 must collapse formal sources to a semantic summary=${JSON.stringify(narrow)}`);
  assert.equal(narrow.formalSourceCards, 0, `1152 must not shrink three formal source cards beside the candidate path=${JSON.stringify(narrow)}`);
  assert.ok(narrow.candidateFont >= 14, `Candidate titles remain directly readable=${JSON.stringify(narrow)}`);
  assert.equal(narrow.overflow, false, `Prediction workspace must not create page overflow=${JSON.stringify(narrow)}`);
  assert.equal(await panel.locator("text=/Pi Agent|Prompt|temperature|gateway|runtime graph|internal agent node/u").count(), 0, "Internal execution terms must not leak into the author UI.");
  await capture("04-1152x720-collapsed-sources-readable-path.png");
  const summaryButton = page.locator(".event-graph-prediction-source-summary");
  await summaryButton.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".event-graph-node:not(.event-graph-prediction-node)").length === 3);
  assert.equal(await page.locator(".event-graph-node:not(.event-graph-prediction-node)").count(), 3, "The source summary must expand the three formal Events on keyboard activation.");
  const abandonButton = panel.getByRole("button", { name: "放弃 Run", exact: true });
  await abandonButton.press("Enter");
  await panel.getByText("此 Run 已放弃；既有草稿和历史回执均保留。", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("单元目录").getByText("异常信号增强", { exact: true }).count(), 1, "Keyboard abandonment must preserve the already-created draft projection.");
  assert.deepEqual(consoleProblems, [], "Multi-node prediction must not add browser console warnings or errors.");
}

async function assertRightWorkSurfaceStateMachine(page, consoleProblems) {
  const output = founderEvidenceDirectory;
  await page.setViewportSize({ width: 1152, height: 720 });
  await page.goto(`${baseUrl}/event-line?locale=zh-CN`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "NONE", "State machine begins at NONE.");
  await page.getByRole("button", { name: "故事脊柱", exact: true }).click();
  await page.getByRole("button", { name: "查看正式事件：雨夜追踪" }).click();
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
  await page.getByRole("button", { name: "打开全局天意", exact: true }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "TIANYI");
  assert.equal(await page.locator("[data-shared-session-id]").count(), 1, "Only one Tianyi composer may be mounted.");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-tianyi-open.png"), fullPage: true });
  await page.getByRole("button", { name: "关闭全局天意", exact: true }).first().click();
  await page.getByRole("button", { name: "查看正式事件：雨夜追踪" }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "EVENT_DETAILS");
  const typeState = await getFixture(`${apiUrl}/__local/story-studio/relations/types?projectId=${encodeURIComponent(fixtureProjectId)}`);
  const reviewCandidate = await postFixture(`${apiUrl}/__local/story-studio/relations/create`, { projectId: fixtureProjectId, sourceObjectId: timelineFixture.timed[1].id, targetObjectId: timelineFixture.timed[2].id, relationTypeId: typeState.data.types[0].relationTypeId, relationLabelSnapshot: "促使", direction: "forward", sourceRef: "e2e-right-surface-review", operationId: `right-surface-review-${fixture.fixtureId}` });
  assert.equal(reviewCandidate.data.relation.reviewState, "candidate", "Relation review must begin from the existing Relation owner candidate.");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await page.getByRole("button", { name: "展开事件目录", exact: true }).click();
  await page.getByRole("button", { name: /待确认 1/u }).click();
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "RELATION_REVIEW");
  if (output) await page.screenshot({ path: path.join(output, "1152x720-relation-review-open.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "1152 right surfaces must not overflow horizontally.");
  await page.locator(".event-graph-flow").click({ position: { x: 12, y: 12 } });
  assert.equal(await page.getByTestId("tianyan-r0-shell").getAttribute("data-right-work-surface"), "NONE", "Pane clear returns the state machine to NONE.");
  assert.deepEqual(consoleProblems, [], "Right surface interactions must not add browser console errors.");
}

async function captureEventGraphEvidence(page, consoleProblems) {
  mkdirSync(eventGraphEvidenceDirectory, { recursive: true });
  const captures = [];
  const capture = async (viewport, state, action) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
    await closeGlobalTianyiIfOpen(page);
    await page.getByRole("button", { name: "关系图", exact: true }).click();
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
  await page.goto(`${baseUrl}/event-line?eventGraphFixture=density50`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  await page.getByRole("button", { name: "关系图", exact: true }).click();
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
  await page.goto(`${baseUrl}/event-line?locale=zh-CN`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  if (await page.getByRole("button", { name: "故事脊柱", exact: true }).count()) await page.getByRole("button", { name: "故事脊柱", exact: true }).click();
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
  await page.reload({ waitUntil: "networkidle" });
  if (await page.getByRole("button", { name: "故事脊柱", exact: true }).count()) await page.getByRole("button", { name: "故事脊柱", exact: true }).click();
  assert.equal(await page.getByText("手动事件 A", { exact: true }).count() > 0, true, "The draft Event must survive reload in the story spine.");
  await page.getByRole("button", { name: "关系图", exact: true }).click();
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
  await page.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
  await closeGlobalTianyiIfOpen(page);
  await page.getByRole("button", { name: "关系图", exact: true }).click();
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

async function closeGlobalTianyiIfOpen(page) {
  const tianyiSidebar = page.locator(".tianyi-sidebar");
  if (await tianyiSidebar.isVisible()) {
    await tianyiSidebar.locator(".tianyi-sidebar-header > button").click();
    await tianyiSidebar.waitFor({ state: "hidden" });
  }
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
  const response = await fetch(url, { headers: { "x-world-os-local-control-token": controlToken } });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
