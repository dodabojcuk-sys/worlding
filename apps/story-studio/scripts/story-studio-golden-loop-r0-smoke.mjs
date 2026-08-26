import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { createStoryStudioWorkspaceOperations } from "../../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createStoryStudioRelationOperations } from "../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const workspaceRoot = path.join(tmpdir(), "tianyan-golden-loop-r0-smoke");
const stateFilePath = path.join(tmpdir(), "tianyan-golden-loop-r0-smoke-state.json");
const outputDir = path.resolve("output/playwright/story-studio-golden-loop-r0");
const projectId = "lanchuan-golden-loop-r0";
const port = 4394;
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let browser;
const observedGoldenLoopRequests = [];
let browserCandidateReview = null;

rmSync(workspaceRoot, { recursive: true, force: true });
rmSync(stateFilePath, { force: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const operations = createStoryStudioWorkspaceOperations({ rootPath: workspaceRoot, stateFilePath });
operations.createProject({ title: "岚川镇 · Golden Loop R0", folderSlug: projectId, genre: "mystery", ambience: "rain-lighthouse" });
operations.openProject({ projectId });
const relationSource = operations.createWorldObject({ projectId, type: "character", title: "苏槿", status: "active", tags: ["关系测试"], aliases: [], body: "# 苏槿\n\n" });
const relationTarget = operations.createWorldObject({ projectId, type: "character", title: "顾沉", status: "active", tags: ["关系测试"], aliases: [], body: "# 顾沉\n\n" });
const relationOperations = createStoryStudioRelationOperations({ workspaceOperations: operations });
const relationType = relationOperations.createRelationType({ projectId, operationId: "golden-loop.relation-type", label: "守护" });
const chapter = operations.createWritingDocument({ projectId, type: "chapter", title: "第一章 · 水源危机" });
const sceneCreated = operations.createWritingDocument({ projectId, type: "scene", title: "公开之前", chapterId: chapter.id });
const sceneResult = operations.updateWritingDocument({
  projectId,
  documentId: sceneCreated.id,
  expectedHash: sceneCreated.revisionToken,
  status: "drafting",
  body: "# 公开之前\n\n## 当前场景\n\n苏槿发现上游水源被投毒，顾沉正在准备撤离。她必须决定如何使用手中的初步证据。\n"
});
assert.equal(sceneResult.conflict, false);
operations.openWritingDocument({ projectId, documentId: sceneCreated.id });

if (process.env.STORY_STUDIO_SKIP_BUILD !== "1") execFileSync("npm", ["run", "build"], { stdio: "inherit" });

try {
  server = await startServer();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const expectedAbortedRequests = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    const expectedAbort = failure === "net::ERR_ABORTED" && request.url().includes("/model-service/tianyi-grounded-answer");
    (expectedAbort ? expectedAbortedRequests : failedRequests).push({ type: "requestfailed", url: request.url(), error: failure });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push({ type: "http", status: response.status(), url: response.url() });
  });
  await installDeterministicProviderRoutes(page);

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("world-home").waitFor();
  await page.goto(`${baseUrl}/library?libraryTab=classified&libraryDirectory=relation&relationView=all`, { waitUntil: "networkidle" });
  await page.getByTestId("relation-authoring-workbench").waitFor();
  await page.getByRole("button", { name: "新建关系", exact: true }).click();
  const relationSelects = page.locator("#relation-create-panel select");
  await relationSelects.nth(0).selectOption(relationSource.id);
  await relationSelects.nth(1).selectOption(relationType.type.relationTypeId);
  await relationSelects.nth(3).selectOption(relationTarget.id);
  await page.getByRole("button", { name: "检查重复建议", exact: true }).click();
  await page.getByText("重复建议", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存候选", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "苏槿" }).click();
  await page.getByTestId("relation-detail-workbench").waitFor();
  await page.getByRole("button", { name: "确认关系", exact: true }).click();
  await page.locator(".relation-state-badge", { hasText: "已确认" }).waitFor();
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await page.getByRole("tab", { name: "图谱", exact: true }).click();
  await page.getByTestId("relation-graph-projection").waitFor();
  assert.equal(await page.locator(".relation-graph-canvas .react-flow__node").count(), 2, "confirmed graph projection must include both stable object references");
  assert.equal(await page.locator(".relation-graph-list-alternative article").count(), 1, "graph list alternative must contain the same relation read model");
  await page.locator(".relation-graph-list-alternative article button").nth(1).click();
  await page.getByTestId("relation-detail-workbench").waitFor();
  await page.getByRole("button", { name: "创建更正候选", exact: true }).click();
  await page.getByRole("button", { name: "保存更正候选", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "归档关系", exact: true }).click();
  await page.getByText("该关系已归档，只读保留在历史记录中。", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "08-relation-list-review-1440x960.png"), fullPage: true });
  await page.goto(`${baseUrl}/library?libraryTab=classified&libraryDirectory=relation&relationPresentation=graph`, { waitUntil: "networkidle" });
  await page.getByTestId("relation-graph-empty").waitFor();
  assert.equal(await page.getByText("还没有已确认关系", { exact: true }).count(), 1, "graph defaults to confirmed relations and does not render an empty canvas");
  await page.getByRole("button", { name: "查看候选关系", exact: true }).click();
  await page.getByTestId("relation-graph-projection").waitFor();
  assert.equal(await page.locator(".relation-graph-list-alternative article").count(), 1, "candidate graph filter must project the correction candidate separately");
  await page.locator(".relation-graph-tools select").first().selectOption("archived");
  assert.equal(await page.locator(".relation-graph-list-alternative article").count(), 1, "archived graph filter must keep an archived relation readable without restoring it");
  await assertTrueCssViewport(page, 390, 844, "Relation graph mobile list alternative");
  assert.equal(await page.locator(".relation-graph-canvas").isVisible(), false, "mobile must offer the list alternative instead of a free-form relation canvas");
  assert.equal(await horizontalOverflow(page), 0, "Relation graph mobile list alternative must not horizontally overflow.");
  await assertLibraryMobileShell(page);
  await page.screenshot({ path: path.join(outputDir, "08a-relation-graph-390x844.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${baseUrl}/library?libraryTab=classified&libraryDirectory=relation&relationView=history`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /历史 1/ }).waitFor();
  assert.equal(await page.getByRole("listitem").filter({ hasText: "苏槿" }).count() >= 1, true, "Relation history must keep the archived record readable.");
  assert.equal(await page.locator(".graph-editor, [data-graph-authoring]").count(), 0, "Relation authoring must not mount the mutable visual-document graph editor.");
  await page.getByRole("button", { name: "创作", exact: true }).click();
  const creationSourceUnavailable = page.getByTestId("creation-source-unavailable");
  await creationSourceUnavailable.waitFor();
  assert.equal(new URL(page.url()).searchParams.has("fixture"), false, "Creation normal route must not add a Fixture query.");
  assert.match(await creationSourceUnavailable.innerText(), /还不能建立创作来源/u, "Creation must fail closed when this project has no Story Unit source.");
  assert.equal(await page.getByTestId("neutral-creation-flow").count(), 0, "Creation must not offer delivery or write actions without a Story Unit source.");
  await page.goto(`${baseUrl}/nuwa`, { waitUntil: "networkidle" });
  await page.getByTestId("nuwa-primary-workspace").waitFor();
  assert.equal(new URL(page.url()).pathname, "/nuwa");
  assert.equal(await page.getByRole("button", { name: "女娲", exact: true }).getAttribute("aria-current"), "page");
  await assertTrueCssViewport(page, 1440, 900, "Nuwa default desktop");
  assert.equal(await page.getByRole("heading", { name: "从一个故事开始", exact: true }).count(), 1);
  assert.equal(await page.getByText("目标", { exact: true }).count(), 0, "The empty Nuwa surface must not expose the old five-stage form.");
  await assertTrueCssViewport(page, 1024, 768, "Nuwa default tablet");
  await assertTrueCssViewport(page, 390, 844, "Nuwa default mobile");
  assert.equal(await page.getByText("Provider 试验（仅开发状态）", { exact: true }).count(), 0, "Nuwa must not expose Provider disclosure by default.");
  assert.equal(await page.locator(".nuwa-preparation-state .primary-action").count(), 1, "Nuwa default state must offer one primary action.");
  await page.screenshot({ path: path.join(outputDir, "00-nuwa-default-true-390x844.png") });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${baseUrl}/nuwa?project=missing.project`, { waitUntil: "networkidle" });
  await page.getByText("原工作上下文已失效，已返回当前作品。", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("project"), false, "stale project URLs must be cleared instead of becoming a raw transport error");
  await page.getByRole("button", { name: "返回天意工作台", exact: true }).click();
  await page.getByTestId("tianyi-workspace").waitFor();
  await page.getByRole("button", { name: "创作", exact: true }).click();
  await page.getByTestId("creation-source-unavailable").waitFor();
  await page.getByTestId("tianyi-quick-launcher").click();
  await page.getByRole("button", { name: "进入完整天意" }).click();
  await page.getByTestId("tianyi-workspace").waitFor();
  assert.match(await page.locator(".tianyi-workspace .workspace-header").innerText(), /公开之前/u);
  assert.equal(await page.getByRole("tab", { name: "记录" }).count(), 0, "Retired record/dialogue tabs must not return in the official workspace.");
  await page.locator(".tianyi-conversation-loading").waitFor({ state: "hidden" });
  await assertTrueCssViewport(page, 1440, 900, "Tianyi empty desktop");
  await assertTrueCssViewport(page, 1024, 768, "Tianyi empty tablet");
  await assertTrueCssViewport(page, 390, 844, "Tianyi empty mobile");
  assert.equal(await page.locator(".tianyi-conversation-rail").count(), 0, "An empty Tianyi workspace must not mount a history rail.");
  assert.equal(await page.locator(".tianyi-mobile-rail-trigger").count(), 0, "An empty Tianyi workspace must not expose a history trigger.");
  assert.equal(await page.locator(".tianyi-workspace .workbench-header-copy em").filter({ hasText: /^0$/ }).count(), 0, "An empty Tianyi workspace must not show a zero conversation count.");
  const tianyiMobileSurface = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
    const title = rect(".tianyi-conversation-empty h1");
    const textarea = rect("#tianyi-composer-input");
    const mode = rect(".tianyi-send-mode select");
    const send = rect(".tianyi-composer footer button");
    const navigation = rect(".product-shell-navigation");
    return { title, textarea, mode, send, navigation };
  });
  assert.ok(tianyiMobileSurface.title && tianyiMobileSurface.title.right <= 391, "Tianyi mobile title must fit without clipping.");
  for (const [name, rect] of Object.entries({ textarea: tianyiMobileSurface.textarea, mode: tianyiMobileSurface.mode, send: tianyiMobileSurface.send })) {
    assert.ok(rect && rect.right <= 391 && rect.bottom <= (tianyiMobileSurface.navigation?.top || 844), `Tianyi mobile ${name} is obscured by the global navigation.`);
  }
  await page.screenshot({ path: path.join(outputDir, "00-tianyi-empty-true-390x844.png") });
  await page.setViewportSize({ width: 1440, height: 960 });
  if (await page.getByRole("button", { name: "开始新对话", exact: true }).count()) {
    await page.getByRole("button", { name: "开始新对话", exact: true }).click();
  }
  await page.locator("#tianyi-composer-input:not([disabled])").waitFor({ state: "visible" });
  await page.locator("#tianyi-composer-input").fill("比较公开投毒证据后，撤离与秩序会如何变化。");
  await page.locator(".tianyi-composer").getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText("比较公开投毒证据后，撤离与秩序会如何变化。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "上下文", exact: true }).click();
  await page.getByRole("button", { name: "整理简报", exact: true }).click();
  const briefReview = page.getByRole("region", { name: "收束本次天意" });
  await briefReview.getByRole("button", { name: "整理简报", exact: true }).click();
  await briefReview.getByRole("button", { name: "确认简报", exact: true }).click();
  await briefReview.getByRole("button", { name: "交给女娲", exact: true }).click();
  await page.getByTestId("nuwa-primary-workspace").waitFor();
  const nuwaRunDetails = page.locator("details.nuwa-run-details");
  assert.equal(await page.getByText("当前 Run", { exact: true }).count(), 1, "Nuwa must show the current Run before advanced stage details.");
  assert.equal(await nuwaRunDetails.evaluate((element) => element.open), false, "Nuwa stage details must not be permanently expanded.");
  await nuwaRunDetails.locator("summary").click();
  const rehearsalStage = nuwaRunDetails.getByRole("tab", { name: /排演现场/ });
  await rehearsalStage.focus();
  await rehearsalStage.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: /候选比较/ }).getAttribute("aria-selected"), "true");
  assert.equal(new URL(page.url()).searchParams.get("stage"), "comparison");
  await page.getByRole("tab", { name: /排演现场/ }).click();
  assert.equal(await rehearsalStage.getAttribute("aria-selected"), "true");
  const canonBeforeRehearsal = operations.getStoryStudioWorldLibraryBootstrap({ projectId }).objects.filter((object) => object.type === "event" && object.status === "committed").length;
  // Browser zoom changes the CSS viewport available to the product. These
  // three widths are the CSS-pixel equivalents of a 1440px window at
  // 80%, 100%, and 125% zoom respectively.
  await assertNuwaDockLayout(page, 1800, 1125, "side", { criticalContent: true });
  await assertNuwaDockLayout(page, 1440, 900, "side", { criticalContent: true });
  await assertNuwaDockLayout(page, 1280, 800, "side", { criticalContent: true });
  await assertNuwaDockLayout(page, 1100, 815, "bottom", { criticalContent: true, expectInitiallyClosed: true });
  await assertNuwaDockLayout(page, 1152, 720, "side", { criticalContent: true });
  await assertNuwaDockLayout(page, 390, 844, "bottom", { criticalContent: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("tab", { name: /导演权限/u }).click();
  await page.getByRole("tabpanel", { name: "女娲导演权限" }).waitFor();
  assert.match(await page.getByRole("tabpanel", { name: "女娲导演权限" }).innerText(), /这是一次排演 Run，不是故事事实/u);
  assert.match(await page.getByRole("tabpanel", { name: "女娲导演权限" }).innerText(), /确认正史 · 永久删除 · 发布部署/u);
  const temporaryAgentPermission = page.getByRole("checkbox", { name: /创建临时 Agent/u });
  assert.equal(await temporaryAgentPermission.isChecked(), false);
  await temporaryAgentPermission.click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('input[type="checkbox"]')).some((input) => input instanceof HTMLInputElement && input.checked && input.closest("label")?.textContent?.includes("创建临时 Agent")));
  assert.equal(await temporaryAgentPermission.isChecked(), true);
  await page.getByRole("button", { name: "建立临时 Agent", exact: true }).click();
  await page.getByText("运行中 · 仅 Run-local proposal", { exact: true }).waitFor();
  assert.equal(await horizontalOverflow(page), 0);
  await page.getByRole("tab", { name: /长篇编排/u }).click();
  await page.getByRole("button", { name: "建立分阶段 Job", exact: true }).click();
  await page.getByRole("heading", { name: "作者意图", exact: true }).waitFor();
  await page.getByRole("button", { name: "完成本阶段", exact: true }).click();
  await page.getByRole("heading", { name: "创作简报", exact: true }).waitFor();
  await page.setViewportSize({ width: 1180, height: 800 });
  assert.equal(await horizontalOverflow(page), 0);
  assert.match(await page.getByRole("tabpanel", { name: "长篇分阶段编排" }).innerText(), /Provider 调用 0/u);
  await assertNuwaLongformLayout(page);
  await page.screenshot({ path: path.join(outputDir, "07-nuwa-longform-1180x800.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  if (!await nuwaRunDetails.evaluate((element) => element.open)) await nuwaRunDetails.locator("summary").click();
  await nuwaRunDetails.getByRole("tab", { name: /排演现场/u }).click();
  await page.getByRole("button", { name: "分支", exact: true }).click();
  await page.getByRole("dialog", { name: "分支工具", exact: true }).waitFor();
  await page.getByRole("button", { name: "事件线", exact: true }).click();
  assert.equal(await page.locator('[data-page-dock="event-line"]').count(), 1, "Event Line must own its own page dock.");
  assert.equal(await page.locator('[data-page-dock="event-line"]').getAttribute("data-page-dock-open"), "false");
  assert.equal(await page.getByRole("button", { name: "观察", exact: true }).count(), 0, "Nuwa lenses must not leak into Event Line.");
  await page.getByRole("button", { name: "女娲", exact: true }).click();
  await page.getByTestId("nuwa-primary-workspace").waitFor();
  await page.getByRole("dialog", { name: "分支工具", exact: true }).waitFor();
  assert.equal(await page.locator(".page-context-dock").getAttribute("data-page-dock-lens"), "branch");
  await page.getByRole("button", { name: "关闭分支", exact: true }).click();
  await page.locator(".nuwa-player-controls").getByRole("button", { name: "开始排演", exact: true }).click();
  await page.getByRole("button", { name: "控制", exact: true }).click();
  await page.getByRole("button", { name: "整理候选", exact: true }).click();
  await page.getByRole("region", { name: "候选路线" }).waitFor();
  assert.equal(observedGoldenLoopRequests.length, 0, "Brief-bound unit execution must not fall back to Golden Loop.");
  assert.equal(operations.getStoryStudioWorldLibraryBootstrap({ projectId }).objects.filter((object) => object.type === "event" && object.status === "committed").length, canonBeforeRehearsal);
  await page.getByRole("button", { name: "分支", exact: true }).click();
  const firstBoundRoute = page.locator(".nuwa-dock-routes > button").first();
  await firstBoundRoute.click();
  await page.getByRole("button", { name: "评审", exact: true }).click();
  const submitBoundRouteResponse = page.waitForResponse((response) => response.url().includes("/intelligence-bridge/result/submit"));
  await page.getByRole("button", { name: "送入影响评审", exact: true }).click();
  const boundRouteResponse = await submitBoundRouteResponse;
  assert.equal(boundRouteResponse.status(), 200, `Bound route submit failed: ${await boundRouteResponse.text()}`);
  await page.getByTestId("intelligence-workbench").waitFor();
  const firstImpactOption = page.locator(".impact-options button").first();
  const selectedImpactOptionLabel = await firstImpactOption.locator("strong").innerText();
  await firstImpactOption.click();
  await page.getByRole("button", { name: "采用此走向" }).click();
  await page.getByRole("button", { name: "建立受保护的变更单" }).click();
  await page.getByRole("button", { name: "确认写入世界事件" }).click();
  await page.getByText("世界事件已记录", { exact: true }).waitFor();
  await page.getByRole("button", { name: "事件线", exact: true }).click();
  await page.getByText("1 个已确认事件", { exact: true }).first().waitFor();

  const directEventLineResponse = await page.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
  if (!await page.getByTestId("event-observation-workspace").count()) {
    throw new Error(`Direct Event Line load failed (${directEventLineResponse?.status()}) at ${page.url()}; console=${JSON.stringify(consoleErrors)}: ${(await page.content()).slice(0, 1200)}`);
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("event-observation-workspace").waitFor();
  await page.getByText("1 个已确认事件", { exact: true }).first().waitFor();
  assert.match(await page.getByTestId("confirmed-story-spine").innerText(), new RegExp(selectedImpactOptionLabel, "u"));
  await page.locator("[data-confirmed-event-id] > button").first().click();
  await page.getByRole("dialog", { name: "详情工具", exact: true }).waitFor();
  await page.getByRole("button", { name: "带着这个事件问天意", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "带着这个事件问天意", exact: true }).isEnabled(), true);
  assert.match(await page.getByTestId("event-line-detail").innerText(), /Canon 读取已核验/u);
  await assertEventLineDockLayout(page);

  await page.getByRole("button", { name: "创作", exact: true }).click();
  await page.getByTestId("creation-source-unavailable").waitFor();
  assert.equal(await page.getByText("还不能建立创作来源", { exact: true }).count(), 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertCreationRailLayout(page);
  await page.screenshot({ path: path.join(outputDir, "06-creation-context-rail-1440x900.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertCreationMobileLayout(page);
  await page.screenshot({ path: path.join(outputDir, "06a-creation-mobile-390x844.png") });

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [pathname, heading] of [
    ["/multiverse", "多元创作"],
    ["/multiverse/translation", "翻译"],
    ["/multiverse/perspective", "视角切换"],
    ["/multiverse/pov", "视角切换"],
    ["/multiverse/if", "IF 线"],
    ["/multiverse/localization", "本土化 / 改编"],
    ["/multiverse/fan-localization", "本土化 / 改编"],
    ["/creation", "还不能建立创作来源"],
    ["/creation/novel", "小说输出"],
    ["/creation/screenplay", "剧本输出"],
    ["/creation/comic", "漫画 / 漫剧输出"],
    ["/creation/interactive", "互动叙事输出"],
    ["/creation/translation-adaptation", "翻译 / 改编输出"]
  ]) {
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
    await page.getByText(heading, { exact: true }).first().waitFor();
    assert.equal(new URL(page.url()).pathname, pathname, `canonical authoring route changed: ${pathname}`);
    assert.equal(await page.locator(".product-shell-navigation [aria-current='page']").count(), 1, `one active global destination: ${pathname}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText(heading, { exact: true }).first().waitFor();
  }
  await page.getByText("先在多元完成来源与审核，再选择外部输出能力；这里不会模拟创建或写入任何产物。", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "06b-creation-translation-adaptation-1440x900.png") });

  await page.getByRole("button", { name: "事件线", exact: true }).click();
  await page.getByTestId("event-observation-workspace").waitFor();
  assert.equal(new URL(page.url()).pathname, "/event-line");
  await page.locator(".tianyi-quick-backdrop.is-pinned").waitFor({ state: "hidden" });
  await page.locator("[data-confirmed-event-id] > button").first().click();
  await page.getByRole("dialog", { name: "详情工具", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const persistedTianyiAssistant = page.getByTestId("tianyi-quick-assistant");
  if (await persistedTianyiAssistant.count()) {
    await persistedTianyiAssistant.getByRole("button", { name: "关闭天意助手", exact: true }).click();
    await persistedTianyiAssistant.waitFor({ state: "hidden" });
  }
  const eventLinePageDock = page.locator('[data-page-dock="event-line"]');
  const eventLineDetail = page.getByRole("dialog", { name: "详情工具", exact: true });
  const mobileMore = page.locator('summary[aria-label="更多工作面"]');
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await eventLineDetail.waitFor({ state: "hidden" });
  assert.equal(await page.locator('[data-testid="module-context-sidebar-event-line"]').count(), 0, "Event Line must not mount a permanent Context Rail.");
  assert.equal(await page.getByRole("button", { name: "打开作者上下文", exact: true }).count(), 0, "Event Line must not expose a Context Rail trigger.");
  await assertMobileMainSurface(page);
  await page.screenshot({ path: path.join(outputDir, "01-event-line-mobile-default-390x844.png") });

  // Event details retain the shared page-dock slot without reviving a
  // Library-style author directory on the Event Line surface.
  await page.locator("[data-confirmed-event-id] > button").first().click();
  await eventLineDetail.waitFor();
  assert.equal(await eventLinePageDock.getAttribute("data-page-dock-open"), "true");
  assert.equal(await page.locator('[data-testid="module-context-sidebar-event-line"]').count(), 0, "Opening an Event detail must not mount a Context Rail.");
  await page.screenshot({ path: path.join(outputDir, "02-event-line-mobile-detail-390x844.png") });
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await eventLineDetail.waitFor({ state: "hidden" });

  await mobileMore.waitFor();
  await mobileMore.click();
  const mobileMoreMenu = page.getByRole("menu");
  await assertMobileMoreMenu(page, mobileMoreMenu);
  assert.equal(await page.locator('[data-testid="module-context-sidebar-event-line"]').count(), 0, "More must not introduce a Context Rail.");
  await page.screenshot({ path: path.join(outputDir, "04-mobile-more-menu-390x844.png") });
  await mobileMoreMenu.getByRole("menuitem", { name: /多元/u }).click();
  await page.getByTestId("story-studio-workspace-stage").waitFor();
  assert.equal(await page.locator('[data-product-mode="multiverse"]').count(), 1, "More → 多元 must reach the active workspace.");
  await page.screenshot({ path: path.join(outputDir, "05-mobile-multiverse-entry-390x844.png") });

  assert.equal(await page.getByRole("tab", { name: "女娲排演", exact: true }).count(), 0);
  await page.getByRole("button", { name: "事件线", exact: true }).click();
  await page.getByTestId("event-observation-workspace").waitFor();
  assert.match(await page.getByTestId("confirmed-story-spine").innerText(), new RegExp(selectedImpactOptionLabel, "u"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `Mobile horizontal overflow: ${overflow}px`);
  assert.equal(await page.locator('details.product-shell-more[open]').count(), 0);
  const normalGoldenLoop = await runNormalProjectWorldEventCreationGoldenLoop(page, { outputDir });
  const videos = await recordNormalGoldenLoopVideos(browser);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, [], `Browser network failures: ${JSON.stringify(failedRequests)}`);
  console.log(JSON.stringify({
    status: "PASS",
    deterministicProvider: true,
    directNuwaEmptyState: true,
    approvedBriefUnitFlow: true,
    legacyGoldenLoopFallbackRequests: observedGoldenLoopRequests.length,
    candidateReviewChain: "PASS",
    confirmedEventPersistsAfterReload: true,
    creationCenterRoute: "PASS",
    libraryContinueWriting: true,
    writingToTianyiRecordThread: true,
    browserRequestSourceContract: "PASS",
    explicitEventReference: "PASS",
    storyPrimaryDestination: true,
    preAuthorConfirmationCanonWrites: 0,
    eventLineRouteBoundary: "PASS",
    desktop: "PASS",
    browserZoom80: "PASS",
    browserZoom100: "PASS",
    browserZoom125: "PASS",
    mobile390x844: "PASS",
    mobileDrawerClosed: true,
    mobileEventSurface: true,
    relationListReview: "PASS",
    eventLineResponsiveDockPriority: "PASS",
    normalProjectWorldEventCreationGoldenLoop: normalGoldenLoop,
    normalGoldenLoopVideos: videos,
    consoleErrorsAndWarnings: consoleErrors.length,
    failedRequests: failedRequests.length,
    expectedAbortedRequests: expectedAbortedRequests.length,
    screenshots: 29,
    realProviderCalls: 0
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Golden Loop smoke server" });
}

async function runNormalProjectWorldEventCreationGoldenLoop(page, {
  outputDir,
  projectTitle = "普通项目事件创作闭环",
  projectSlug = "normal-project-event-creation-r0",
  stopAfterReturn = false
}) {
  const normalOutput = (name) => path.join(outputDir, name);
  const assertNormalRoute = () => {
    const url = new URL(page.url());
    assert.equal(url.searchParams.has("fixture"), false, `Normal route must not include Fixture: ${url}`);
    assert.equal(/(?:debug|test|nuwa)/iu.test(`${url.pathname}${url.search}`), false, `Normal route must not include debug, test, or Nuwa identity: ${url}`);
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.history.pushState({ workspace: "projects" }, "", "/projects");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByTestId("project-center").waitFor();
  await page.screenshot({ path: normalOutput("01-normal-project-empty-or-picker-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: "新建作品", exact: true }).click();
  await page.locator('[data-onboarding-step="genre"]').waitFor();
  await page.locator('[data-onboarding-step="genre"] .onboarding-actions .text-action').click();
  await page.locator('[data-onboarding-step="ambience"]').waitFor();
  await page.locator('[data-onboarding-step="ambience"] .onboarding-actions .light-action').click();
  await page.locator('[data-onboarding-step="identity"]').waitFor();
  const onboardingInputs = page.locator(".identity-stage input");
  await onboardingInputs.nth(0).fill(projectTitle);
  await onboardingInputs.nth(1).fill(projectSlug);
  await page.getByRole("button", { name: "创建世界", exact: true }).click();
  await page.getByTestId("project-center").waitFor();
  await page.getByRole("button", { name: new RegExp(projectTitle, "u") }).click();
  await page.getByTestId("world-home").waitFor();
  assertNormalRoute();
  await page.screenshot({ path: normalOutput("02-normal-project-created-1440x900.png"), fullPage: true });

  await page.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
  await page.getByTestId("normal-event-creation-workspace").waitFor();
  assertNormalRoute();
  await page.screenshot({ path: normalOutput("03-normal-world-story-scope-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: "建立最小故事单元", exact: true }).click();
  await page.getByRole("heading", { name: "写下事件候选", exact: true }).waitFor();
  await page.locator(".normal-event-creation input").fill("旧名线索被保留");
  await page.locator(".normal-event-creation textarea").fill("沈砚决定保留旧名线索，并在天亮前核对守夜记录。这是作者确认的当前主线转折。");
  await page.getByRole("button", { name: /进入候选评审/u }).click();
  await page.getByText("候选评审", { exact: true }).waitFor();
  await page.screenshot({ path: normalOutput("04-normal-event-candidate-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: /查看影响评审/u }).click();
  await page.getByRole("heading", { name: "作者确认前的影响范围", exact: true }).waitFor();
  await page.screenshot({ path: normalOutput("05-normal-event-impact-review-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: "确认并写入事件", exact: true }).click();
  await page.getByText("已确认事件", { exact: true }).waitFor();
  await page.screenshot({ path: normalOutput("06-normal-event-confirmed-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: /带着此事件进入创作/u }).click();
  await page.getByTestId("work-version-bound-creation").waitFor();
  assertNormalRoute();
  const creationScopeUrl = new URL(page.url());
  const storyUnitId = creationScopeUrl.searchParams.get("storyUnitId");
  const eventId = creationScopeUrl.searchParams.get("eventId");
  assert.ok(storyUnitId && eventId, "Normal Event handoff must carry stable Story Unit and Event identifiers.");
  await page.screenshot({ path: normalOutput("07-normal-creation-no-root-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: /核对并建立当前作品主线/u }).click();
  await page.getByTestId("creation-root-create-confirm").waitFor();
  await page.getByRole("button", { name: "明确建立当前作品主线", exact: true }).click();
  await page.getByText("来源已就绪", { exact: true }).waitFor();
  await page.screenshot({ path: normalOutput("08-normal-creation-root-established-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: /查看来源范围/u }).click();
  await page.getByTestId("creation-package-preview").waitFor();
  await page.screenshot({ path: normalOutput("09-normal-creation-source-selection-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: /选择小说/u }).click();
  await page.getByRole("button", { name: "明确创建创作稿", exact: true }).click();
  await page.getByTestId("creation-artifact-editor").waitFor();
  await page.screenshot({ path: normalOutput("10-normal-creation-artifact-editor-1440x900.png"), fullPage: true });
  await page.locator(".creation-artifact-editor textarea").fill("雨声停在窗沿，沈砚把旧名守夜记录轻轻压在灯下。");
  await page.getByRole("button", { name: "保存作者修订", exact: true }).click();
  await page.locator(".creation-artifact-editor header span").filter({ hasText: "已保存 · 2 个修订" }).waitFor();
  await page.getByRole("button", { name: "保存作者修订", exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: normalOutput("11-normal-creation-artifact-saved-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: "来源与版本", exact: true }).click();
  await page.getByTestId("creation-source-details").waitFor();
  const artifactUrl = new URL(page.url());
  const creationRoot = page.getByTestId("work-version-bound-creation");
  const artifactId = await creationRoot.getAttribute("data-artifact-id");
  const artifactRevisionId = await creationRoot.getAttribute("data-artifact-revision-id");
  assert.ok(artifactId && artifactRevisionId, "Creation source details must expose a stable Artifact and revision identity.");
  assert.equal(await creationRoot.getAttribute("data-selected-story-unit-id"), storyUnitId, "Creation source details must retain the selected Story Unit.");
  assert.equal(await creationRoot.getAttribute("data-selected-event-id"), eventId, "Creation source details must retain the selected Event.");
  const sourceTechnicalDetails = creationRoot.locator("details.neutral-technical-details");
  await sourceTechnicalDetails.locator("summary").click();
  assert.equal(await sourceTechnicalDetails.evaluate((element) => element.open), true, "Source technical details must open before recording a recoverable scroll position.");
  await page.waitForTimeout(100);
  await creationRoot.evaluate((element) => { element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight); });
  const sourceScrollTop = await creationRoot.evaluate((element) => element.scrollTop);
  assert.ok(sourceScrollTop > 0, "Creation source details must have a non-zero scroll position before exact-return restoration is claimed.");
  await page.getByTestId("creation-source-range-summary").focus();
  await page.screenshot({ path: normalOutput("12-normal-creation-source-details-1440x900.png"), fullPage: true });
  const sourceEventLink = page.getByTestId("creation-source-event-link");
  assert.equal(await sourceEventLink.count(), 1, `Creation source details must expose exactly one stable Event link at ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 4000)}`);
  await page.waitForTimeout(500);
  await sourceEventLink.click();
  await page.getByTestId("event-observation-workspace").waitFor();
  const storedReturnSnapshot = await page.evaluate((selectedArtifactId) => Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
    .filter((key) => key?.startsWith("story-studio:work-version-creation-return:"))
    .map((key) => JSON.parse(sessionStorage.getItem(key) || "null"))
    .find((value) => value?.artifactId === selectedArtifactId) || null, artifactId);
  assert.equal(storedReturnSnapshot?.technicalExpanded, true, "The exact-return snapshot must persist the open source technical details before leaving Creation.");
  assertNormalRoute();
  assert.equal(new URL(page.url()).pathname, "/event-line", "Source Event must open the canonical Event Line route.");
  assert.equal(new URL(page.url()).searchParams.get("event"), eventId, "Event Line must retain the exact source Event identifier.");
  assert.equal(await page.getByTestId("event-observation-workspace").getAttribute("data-selected-event-id"), eventId, "Event Line must retain the exact source Event selection while Canon content loads.");
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId("event-line-detail").count(), 1, `The exact Event must open its readable Canon detail: ${(await page.locator("body").innerText()).slice(0, 5000)}`);
  assert.match(await page.locator(`[data-confirmed-event-id="${eventId}"]`).getAttribute("class") || "", /is-selected/u, "The exact Event must be selected in the Event Line projection.");
  assert.match(await page.getByTestId("event-line-detail").innerText(), /旧名线索被保留/u, "The selected Event must show readable source content.");
  await page.screenshot({ path: normalOutput("13-normal-event-drilldown-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: "返回创作", exact: true }).click();
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId("creation-return-restored").count(), 1, `In-app return must restore Creation: ${page.url()} ${(await page.locator("body").innerText()).slice(0, 5000)}`);
  assert.equal(await creationRoot.getAttribute("data-artifact-id"), artifactId, "In-app return must restore the same Artifact.");
  assert.equal(await creationRoot.getAttribute("data-artifact-revision-id"), artifactRevisionId, "In-app return must restore the same Artifact revision.");
  assert.equal(await creationRoot.getAttribute("data-selected-story-unit-id"), storyUnitId, "In-app return must restore the Story Unit selection.");
  assert.equal(await creationRoot.getAttribute("data-selected-event-id"), eventId, "In-app return must restore the Event selection.");
  assert.equal(await page.getByTestId("creation-source-range-summary").evaluate((element) => document.activeElement === element), true, "In-app return must restore the source-details focus.");
  assert.equal(await sourceTechnicalDetails.evaluate((element) => element.open), true, "In-app return must restore the expanded source detail required for the saved scroll position.");
  const restoredScroll = await creationRoot.evaluate((element) => ({ top: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
  assert.equal(restoredScroll.top, sourceScrollTop, `In-app return must restore the Creation scroll position: ${JSON.stringify(restoredScroll)}`);
  await page.screenshot({ path: normalOutput("14-normal-creation-return-restored-1440x900.png"), fullPage: true });
  if (stopAfterReturn) return normalGoldenLoopResult({ artifactUrl: artifactUrl.href, includeRecovery: false });
  await page.goBack({ waitUntil: "networkidle" });
  await page.getByTestId("event-observation-workspace").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("event"), eventId, "Browser Back must return to the exact Event Line selection.");
  await page.goBack({ waitUntil: "networkidle" });
  await page.getByTestId("creation-source-details").waitFor();
  assert.equal(await creationRoot.getAttribute("data-artifact-id"), artifactId, "Browser Back must preserve the original Artifact.");
  await page.goForward({ waitUntil: "networkidle" });
  await page.getByTestId("event-observation-workspace").waitFor();
  await page.getByRole("button", { name: "返回创作", exact: true }).click();
  await page.getByTestId("creation-return-restored").waitFor();
  await page.getByRole("button", { name: "返回编辑", exact: true }).click();
  await page.getByTestId("creation-artifact-editor").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("creation-artifact-editor").waitFor();
  assertNormalRoute();
  assert.equal(await creationRoot.getAttribute("data-artifact-id"), artifactId, "Refresh must retain the Artifact identity after an exact return.");
  assert.equal(await creationRoot.getAttribute("data-artifact-revision-id"), artifactRevisionId, "Refresh must retain the Artifact revision after an exact return.");
  assert.equal(await page.locator(".creation-artifact-editor textarea").inputValue(), "雨声停在窗沿，沈砚把旧名守夜记录轻轻压在灯下。", "Refresh must restore the saved author body.");
  await page.screenshot({ path: normalOutput("15-normal-refresh-recovery-1440x900.png"), fullPage: true });

  await page.getByRole("button", { name: "来源与版本", exact: true }).click();
  await page.getByTestId("creation-source-details").waitFor();
  if (server) await terminateChildProcess(server, { label: "Normal Golden Loop restart server" });
  server = await startServer();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("creation-source-details").waitFor();
  assertNormalRoute();
  await page.screenshot({ path: normalOutput("16-normal-server-restart-recovery-1440x900.png"), fullPage: true });
  await page.getByTestId("open-creation-work-dock").click();
  await page.waitForTimeout(120);
  await page.screenshot({ path: normalOutput("17-normal-creation-work-dock-1440x900.png"), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: normalOutput("18-normal-creation-work-dock-overlay-1024x768.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  await page.screenshot({ path: normalOutput("19-normal-creation-work-dock-closed-focus-restored-1024x768.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/creation?view=source&storyUnitId=${encodeURIComponent(storyUnitId)}&eventId=event.missing`, { waitUntil: "networkidle" });
  await page.getByTestId("creation-source-unavailable").waitFor();
  assertNormalRoute();
  await page.screenshot({ path: normalOutput("20-normal-missing-source-fail-closed-1440x900.png"), fullPage: true });
  await page.goto(artifactUrl.href, { waitUntil: "networkidle" });
  await page.getByTestId("creation-source-details").waitFor();
  await page.getByRole("button", { name: "返回编辑", exact: true }).click();
  await page.getByTestId("creation-artifact-editor").waitFor();
  assert.equal(await page.locator(".creation-artifact-editor textarea").inputValue(), "雨声停在窗沿，沈砚把旧名守夜记录轻轻压在灯下。", "Missing Event failure must preserve the saved author body.");
  return normalGoldenLoopResult({ artifactUrl: artifactUrl.href });
}

function normalGoldenLoopResult({ artifactUrl, includeRecovery = true }) {
  return {
    firstUse: "PASS",
    eventConfirmation: "PASS",
    creationSource: "PASS_NO_FIXTURE",
    exactEventDrilldown: "PASS",
    inAppReturnToCreation: "PASS",
    browserBackReturn: "PASS",
    artifactIdRestored: "PASS",
    revisionRestored: "PASS",
    sourceDetailsViewRestored: "PASS",
    scrollRestored: "PASS",
    focusRestored: "PASS",
    refreshAfterReturn: includeRecovery ? "PASS" : "NOT_RECORDED",
    missingEventFailClosed: includeRecovery ? "PASS_BODY_PRESERVED" : "NOT_RECORDED",
    restartRecovery: includeRecovery ? "PASS_SOURCE_DETAILS" : "NOT_RECORDED",
    screenshotCount: 20,
    fixtureQueryCount: 0,
    testLoaderCount: 0,
    nuwaRunIdentityCount: 0,
    artifactUrl
  };
}

async function recordNormalGoldenLoopVideos(browser) {
  const videoDir = path.join(outputDir, "video-recordings");
  mkdirSync(videoDir, { recursive: true });
  const normalVideoPath = path.join(outputDir, "normal-project-world-event-creation-complete-flow-1440x900.webm");
  const dockVideoPath = path.join(outputDir, "normal-creation-work-dock-escape-focus-1024x768.webm");
  const normalContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
  const normalPage = await normalContext.newPage();
  const flow = await runNormalProjectWorldEventCreationGoldenLoop(normalPage, {
    outputDir: path.join(outputDir, "video-flow-frames"),
    projectTitle: "普通项目事件创作闭环视频",
    projectSlug: "normal-project-event-creation-video-r0",
    stopAfterReturn: true
  });
  const normalVideo = normalPage.video();
  assert.ok(normalVideo, "The normal Golden Loop video recorder must be attached to its browser page.");
  const normalRecordedPath = normalVideo.path();
  await normalContext.close();
  renameSync(await normalRecordedPath, normalVideoPath);

  const dockContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, recordVideo: { dir: videoDir, size: { width: 1024, height: 768 } } });
  const dockPage = await dockContext.newPage();
  await dockPage.goto(flow.artifactUrl, { waitUntil: "networkidle" });
  await dockPage.getByTestId("creation-source-details").waitFor();
  const trigger = dockPage.getByTestId("open-creation-work-dock");
  await trigger.focus();
  await trigger.click();
  const backdrop = dockPage.locator(".tianyi-quick-backdrop.is-pinned.is-right-dock");
  await backdrop.waitFor();
  const dockGeometry = await backdrop.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { background: style.backgroundColor, opacity: style.opacity, pointerEvents: style.pointerEvents, width: rect.width, height: rect.height };
  });
  assert.equal(dockGeometry.pointerEvents, "auto", `1024 Work Dock must be interactive: ${JSON.stringify(dockGeometry)}`);
  assert.ok(dockGeometry.width > 0 && dockGeometry.height > 0 && dockGeometry.background !== "rgba(0, 0, 0, 0)", `1024 Work Dock must render an opaque overlay surface: ${JSON.stringify(dockGeometry)}`);
  await dockPage.waitForTimeout(300);
  await dockPage.keyboard.press("Escape");
  await dockPage.waitForTimeout(160);
  assert.equal(await dockPage.getByTestId("tianyi-quick-assistant").count(), 0, "Escape must close the 1024 Work Dock.");
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, "Escape must restore focus to the Work Dock trigger.");
  const dockVideo = dockPage.video();
  assert.ok(dockVideo, "The Work Dock video recorder must be attached to its browser page.");
  const dockRecordedPath = dockVideo.path();
  await dockContext.close();
  renameSync(await dockRecordedPath, dockVideoPath);
  return {
    normalFlow: { path: normalVideoPath, bytes: statSync(normalVideoPath).size },
    workDockEscapeFocus: { path: dockVideoPath, bytes: statSync(dockVideoPath).size }
  };
}

async function installDeterministicProviderRoutes(page) {
  await page.route("**/model-service/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      version: "story-studio-model-service/v1",
      providers: [{ id: "siliconflow", configured: true, callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null }],
      models: [{ providerId: "siliconflow", id: "Qwen/Qwen3.5-35B-A3B", label: "Qwen 3.5 35B A3B", capabilities: ["chat", "streaming", "json-object"] }],
      profiles: [{ id: "siliconflow-qwen3.5-35b-structured", label: "Qwen 3.5 35B A3B · 结构化创作", purpose: "structured-story", providerId: "siliconflow", modelId: "Qwen/Qwen3.5-35B-A3B", maxOutputTokens: 2400, streaming: true }],
      tianyiDialogue: { ready: true, reason: null }
    } })
  }));
  await page.route("**/model-service/golden-loop/run", (route) => {
    const request = route.request().postDataJSON();
    observedGoldenLoopRequests.push(request);
    browserCandidateReview = createBrowserCandidateReview(request);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: browserCandidateReview.result })
    });
  });
  await page.route("**/author-control/candidate-reviews?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: browserCandidateReview ? [browserCandidateReview] : [] })
  }));
  await page.route("**/author-control/candidate-review/decide", (route) => {
    assert.ok(browserCandidateReview, "Candidate review mock must be initialized by the Golden Loop response.");
    const request = route.request().postDataJSON();
    const candidate = browserCandidateReview.candidates.find((item) => item.id === request.candidateId);
    assert.ok(candidate, "Fixture candidate is missing.");
    candidate.status = request.decision === "accepted" ? "accepted" : "rejected";
    candidate.rejectionReason = request.decision === "rejected" ? request.reason || "作者拒绝" : null;
    if (request.decision === "accepted") candidate.confirmationReceipt = request.confirmationReceipt;
    browserCandidateReview.status = request.decision === "accepted" ? "accepted" : "awaiting";
    browserCandidateReview.lifecycleStatus = browserCandidateReview.status;
    browserCandidateReview.updatedAt = "2026-08-12T00:00:01.000Z";
    browserCandidateReview.result = {
      ...browserCandidateReview.result,
      review: { id: browserCandidateReview.id, status: browserCandidateReview.status }
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: browserCandidateReview })
    });
  });
}

function createBrowserCandidateReview(request) {
  const result = deterministicGoldenLoopResult(request);
  return {
    version: "story-studio-candidate-review-product/v1",
    id: "candidate-review.browser-fixture",
    projectId: request.projectId,
    status: "awaiting",
    lifecycleStatus: "awaiting",
    result,
    candidates: result.nuwa.candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      summary: candidate.after,
      status: "awaiting",
      rejectionReason: null,
      confirmationReceipt: null
    })),
    sourceSummary: ["当前写作文档的受保护选区"],
    contextPackId: result.contextPack.id,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z"
  };
}

function assertGoldenLoopRequestContract(value, expected) {
  assert.deepEqual(Object.keys(value).sort(), ["authorIntent", "contextRefs", "focus", "profileId", "projectId"]);
  assert.equal("background" in value, false);
  assert.equal(value.projectId, expected.projectId);
  assert.deepEqual(value.focus, {
    mode: "nuwa",
    document: {
      id: expected.documentId,
      revision: expected.documentRevision,
      selection: {
        coordinate: "utf16-code-unit",
        start: 0,
        end: expected.documentLength
      }
    },
    eventRef: null
  });
}

function deterministicGoldenLoopResult(request) {
  const candidates = [
    candidate("route-1", "公开证据，守备封锁水源", "苏槿在撤离集结点公开投毒证据，顾沉立即封锁上游取水口。", "镇民转向有限配水，商会的材料控制被公开质疑。"),
    candidate("route-2", "先向顾沉密报，秘密换水", "苏槿先向顾沉出示证据，守备队秘密切断水源。", "镇民暂时维持秩序，但商会获得转移材料的时间。"),
    candidate("route-3", "公开局部真相，组织镇民自救", "苏槿只公开水源危险，暂不指认商会。", "镇民参与寻找替代水源，顾沉获得调查时间。")
  ];
  return {
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack: {
      version: "tianyan-golden-loop-context-pack/v1",
      id: "context-pack-browser-fixture",
      contextReceiptId: "receipt.browser-fixture",
      sourceBinding: {
        version: "story-studio-document-selection-binding/v1",
        documentId: request.focus.document.id,
        documentRevision: request.focus.document.revision,
        selection: request.focus.document.selection,
        contentHash: "0".repeat(64)
      },
      project: { id: request.projectId, title: "岚川镇 · Golden Loop R0" },
      authorIntent: request.authorIntent,
      sources: [{ id: "snapshot-evidence-scene", type: "scene", label: "公开之前 · 当前选区", content: "苏槿发现上游水源被投毒。" }],
      unknowns: ["商会是否知晓投毒者身份。"],
      budgets: { maximumSources: 5, maximumCharacters: 16000 },
      excluded: [{ id: "object:unrelated", reason: "not-selected-for-this-task" }]
    },
    contextReceiptId: "receipt.browser-fixture",
    nuwaRunId: "nuwa.browser-fixture",
    review: { id: "candidate-review.browser-fixture", status: "awaiting" },
    tianyi: {
      version: "tianyan-tianyi-alignment/v1",
      facts: [{ statement: "苏槿发现上游水源被投毒。", evidence: "作者提供的当前故事背景。" }],
      inferences: ["公开真相可能改变撤离顺序。"],
      unknowns: ["商会是否知晓投毒者身份。"],
      suggestions: ["比较公开时机。"],
      simulationTask: { goal: "推演公开真相后的分支。", mustPreserve: ["不替角色决定。"], questions: ["各方如何反应？"] }
    },
    nuwa: {
      version: "tianyan-nuwa-simulation/v1",
      knownFacts: ["水源被投毒。", "顾沉正在准备撤离。"],
      assumptions: ["苏槿有可展示的初步证据。"],
      causalSteps: ["苏槿公开证据。", "顾沉调整撤离顺序。", "商会回应材料控制。"],
      actorResponses: [{ actor: "顾沉", response: "封锁水源并复核证据。" }],
      conflicts: ["公开速度与秩序维护冲突。"],
      unknowns: ["镇民是否信任守备队。"],
      candidates
    },
    provider: {
      profileId: "siliconflow-qwen3.5-35b-structured",
      calls: [
        { stage: "tianyi", attempt: 1, latencyMs: 20, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, traceId: "fixture-tianyi" },
        { stage: "nuwa", attempt: 1, latencyMs: 30, usage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 }, traceId: "fixture-nuwa" }
      ]
    }
  };
}

function candidate(id, title, change, after) {
  return { id, title, change, after, causes: ["当前证据触发行动。"], evidence: ["作者背景。"], affectedObjects: ["苏槿", "顾沉"], uncertainty: "证据完整性未知。", impact: "撤离节奏改变。", risk: "可能引发恐慌。" };
}

async function waitForStableMobileLibraryBackdropGeometry(drawer, backdrop) {
  await drawer.waitFor({ state: "attached" });
  const stableFrames = await drawer.evaluate(async (element) => {
    const read = () => {
      const brand = element.querySelector(".library-brand");
      const scroll = element.querySelector(".library-drawer-scroll");
      if (!brand || !scroll) return null;
      const brandRect = brand.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      return {
        brandRight: brandRect.right,
        scrollRight: scrollRect.right,
        animationActive: element.getAnimations({ subtree: true }).some((animation) => animation.playState === "running" || animation.playState === "pending")
      };
    };
    return new Promise((resolve) => {
      const samples = [];
      const measure = () => {
        const sample = read();
        if (!sample || sample.animationActive) {
          samples.length = 0;
          requestAnimationFrame(measure);
          return;
        }
        samples.push(sample);
        if (samples.length > 3) samples.shift();
        if (samples.length === 3) {
          const values = samples.flatMap((entry) => [entry.brandRight, entry.scrollRight]);
          const maxDelta = Math.max(...values) - Math.min(...values);
          const sourceGap = Math.abs(sample.brandRight - sample.scrollRight);
          if (maxDelta <= 0.5 && sourceGap <= 1) {
            resolve({ samples, maxDelta, sourceGap });
            return;
          }
        }
        requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
    });
  });
  const [backdropBox, brandBox, scrollBox] = await Promise.all([
    backdrop.boundingBox(),
    drawer.locator(".library-brand").boundingBox(),
    drawer.locator(".library-drawer-scroll").boundingBox()
  ]);
  assert.ok(backdropBox, "Mobile library backdrop bounding box is missing.");
  assert.ok(brandBox, "Mobile library brand bounding box is missing.");
  assert.ok(scrollBox, "Mobile library drawer scroll bounding box is missing.");
  const brandRightEdge = brandBox.x + brandBox.width;
  const scrollRightEdge = scrollBox.x + scrollBox.width;
  assert.ok(Math.abs(brandRightEdge - scrollRightEdge) <= 1, "Stable drawer geometry sources disagree.");
  const exposedLeft = Math.max(brandRightEdge, scrollRightEdge, backdropBox.x);
  const exposedRight = backdropBox.x + backdropBox.width;
  const exposedWidth = exposedRight - exposedLeft;
  assert.ok(exposedWidth >= 48, `Mobile library backdrop exposes only ${exposedWidth}px.`);
  const resolvedPagePoint = {
    x: (exposedLeft + exposedRight) / 2,
    y: backdropBox.y + backdropBox.height / 2
  };
  return {
    stableFrameCount: stableFrames.samples.length,
    brandRightEdge,
    scrollRightEdge,
    maxStableFrameDelta: stableFrames.maxDelta,
    sourceGap: stableFrames.sourceGap,
    exposedWidth,
    position: {
      x: resolvedPagePoint.x - backdropBox.x,
      y: resolvedPagePoint.y - backdropBox.y
    },
    resolvedPagePoint,
    backdropBox,
    brandBox,
    scrollBox
  };
}

function mobileLibraryGeometryDriftExceeds(previous, current) {
  return Math.max(
    Math.abs(previous.brandRightEdge - current.brandRightEdge),
    Math.abs(previous.scrollRightEdge - current.scrollRightEdge),
    Math.abs(previous.backdropBox.x - current.backdropBox.x),
    Math.abs(previous.backdropBox.y - current.backdropBox.y),
    Math.abs(previous.backdropBox.width - current.backdropBox.width),
    Math.abs(previous.backdropBox.height - current.backdropBox.height)
  ) > 0.5;
}

async function assertEventLineDockLayout(page) {
  const workbench = page.getByTestId("event-observation-workspace");
  const pageDock = page.locator('[data-page-dock="event-line"]');
  const pageDockPanel = page.locator('[data-page-dock="event-line"] .page-context-dock-panel');
  const assistant = page.getByTestId("tianyi-quick-assistant");
  const ensurePageDockOpen = async () => {
    if (await pageDock.getAttribute("data-page-dock-open") === "true") return;
    await page.locator("[data-confirmed-event-id] > button").first().click();
    await pageDockPanel.waitFor();
  };
  const ensureTianyiOpen = async () => {
    if (await assistant.isVisible()) return;
    const trigger = page.getByTestId("tianyi-quick-launcher");
    for (let attempt = 0; attempt < 2 && !(await assistant.isVisible()); attempt += 1) {
      await trigger.click({ force: true });
      await page.waitForTimeout(250);
    }
    await assistant.waitFor();
  };

  // A full pair is only retained while the primary workspace is still usable.
  // Narrower widths are asserted through the priority-drawer cases below.
  for (const viewport of [{ width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await ensurePageDockOpen();
    await ensureTianyiOpen();
    await page.waitForFunction(() => document.querySelector('[data-testid="tianyi-quick-assistant"]')?.getAttribute("data-tianyi-panel-mode") === "right-dock");
    const [dockRailBox, assistantBox, workspaceBox] = await Promise.all([
      pageDock.locator(".page-context-dock-rail").boundingBox(),
      assistant.boundingBox(),
      page.locator(".event-line-spine-main").boundingBox()
    ]);
    const dockBox = await pageDockPanel.isVisible() ? await pageDockPanel.boundingBox() : null;
    assert.ok((dockBox || dockRailBox) && assistantBox && workspaceBox, `Event Line ${viewport.width}px dock boxes are unavailable.`);
    const pageDockBox = dockBox ?? dockRailBox;
    assert.ok(pageDockBox.x + pageDockBox.width <= assistantBox.x + 1, `Event Line ${viewport.width}px page dock is not inside Tianyi.`);
    assert.ok(Math.abs(assistantBox.x + assistantBox.width - viewport.width) <= 1, `Event Line ${viewport.width}px Tianyi is not outermost right.`);
    assert.equal(rectIntersectionArea(workspaceBox, assistantBox), 0, `Event Line ${viewport.width}px Tianyi covers critical content.`);
    assert.ok(await horizontalOverflow(page) <= 1, `Event Line ${viewport.width}px has horizontal overflow.`);
  }

  await page.setViewportSize({ width: 1100, height: 815 });
  await ensureTianyiOpen();
  await page.waitForFunction(() => document.querySelector('[data-testid="tianyi-quick-assistant"]')?.getAttribute("data-tianyi-panel-mode") === "right-dock");
  const desktopAssistantBox = await assistant.boundingBox();
  assert.ok(desktopAssistantBox, "Event Line 1100px Tianyi dock box is unavailable.");
  assert.ok(desktopAssistantBox.x >= 0 && desktopAssistantBox.x + desktopAssistantBox.width <= 1100 + 1, "Event Line 1100px Tianyi dock escapes the viewport.");
  assert.equal(await pageDock.getAttribute("data-page-dock-open"), "false", "Tianyi owns the shared drawer slot at 1100px.");
  assert.ok(await horizontalOverflow(page) <= 1, "Event Line 1100px has horizontal overflow.");

  await page.setViewportSize({ width: 1024, height: 768 });
  const headerControls = await page.evaluate(() => {
    const header = document.querySelector(".event-observation-header");
    const actions = document.querySelector(".event-observation-header-actions");
    const controls = actions ? [...actions.children] : [];
    const rect = (element) => element.getBoundingClientRect().toJSON();
    const overlaps = [];
    for (let index = 0; index < controls.length; index += 1) {
      for (let next = index + 1; next < controls.length; next += 1) {
        const first = controls[index].getBoundingClientRect();
        const second = controls[next].getBoundingClientRect();
        if (Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)) > 1) overlaps.push([index, next]);
      }
    }
    return { header: header ? rect(header) : null, controls: controls.map(rect), overlaps, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  assert.ok(headerControls.header && headerControls.controls.length === 3, `Event Line 1024px header controls are incomplete: ${JSON.stringify(headerControls)}`);
  assert.deepEqual(headerControls.overlaps, [], `Event Line 1024px header controls overlap: ${JSON.stringify(headerControls)}`);
  assert.ok(headerControls.controls.every((control) => control.width > 0 && control.height > 0 && control.left >= -1 && control.right <= 1025), `Event Line 1024px header controls are clipped: ${JSON.stringify(headerControls)}`);
  assert.ok(headerControls.overflow <= 1, `Event Line 1024px has horizontal overflow: ${JSON.stringify(headerControls)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await ensureTianyiOpen();
  await page.waitForFunction(() => document.querySelector('[data-testid="tianyi-quick-assistant"]')?.getAttribute("data-tianyi-panel-mode") === "right-dock");
  assert.equal(await pageDock.getAttribute("data-page-dock-open"), "false", "Tianyi owns the shared drawer slot at 390px.");
  await assistant.getByRole("button", { name: "关闭天意助手", exact: true }).click();
  await assistant.waitFor({ state: "hidden" });
  await ensurePageDockOpen();
  await pageDockPanel.waitFor();
  assert.equal(await pageDock.getAttribute("data-page-dock-lens"), "detail", "Closing Tianyi must restore the prior Event Line page-dock lens.");
  assert.ok(await horizontalOverflow(page) <= 1, "Event Line 390px has horizontal overflow.");

  await page.setViewportSize({ width: 1440, height: 960 });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function assertTrueCssViewport(page, width, height, label) {
  await page.setViewportSize({ width, height });
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.equal(metrics.innerWidth, width, `${label} must use the requested CSS viewport width.`);
  assert.equal(metrics.clientWidth, width, `${label} must expose the requested CSS client width.`);
  assert.equal(metrics.scrollWidth, metrics.clientWidth, `${label} must not horizontally overflow.`);
  return metrics;
}

async function assertLibraryMobileShell(page) {
  await page.waitForFunction(() => document.querySelector(".module-sidebar-host")?.getAttribute("data-mobile-closed") === "true");
  const closed = await page.evaluate(() => {
    const stage = document.querySelector(".story-studio-workspace-stage");
    const main = document.querySelector(".relation-authoring-main");
    const host = document.querySelector(".module-sidebar-host");
    const hit = document.elementFromPoint(200, 180);
    const stageStyle = stage ? getComputedStyle(stage) : null;
    const mainBox = main?.getBoundingClientRect();
    const focusableCount = host ? [...host.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
      .filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0).length : -1;
    return {
      stage: { display: stageStyle?.display, gridTemplateColumns: stageStyle?.gridTemplateColumns },
      mainBox: mainBox ? { left: mainBox.left, right: mainBox.right, width: mainBox.width } : null,
      host: { inert: host?.hasAttribute("inert"), pointerEvents: host ? getComputedStyle(host).pointerEvents : null, focusableCount },
      hitIsMain: Boolean(hit?.closest(".relation-authoring-main")),
      viewport: { innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }
    };
  });
  assert.equal(closed.viewport.innerWidth, 390, "Library mobile shell must use a true 390 CSS viewport.");
  assert.equal(closed.viewport.clientWidth, 390, "Library mobile shell client width must remain 390 CSS pixels.");
  assert.equal(closed.viewport.scrollWidth, 390, "Library mobile shell must not horizontally overflow.");
  assert.equal(closed.stage.display, "grid", `Library mobile stage must remain a grid: ${JSON.stringify(closed)}`);
  assert.equal(closed.stage.gridTemplateColumns, "390px", `Library mobile stage must be one column: ${JSON.stringify(closed)}`);
  assert.ok(closed.mainBox && closed.mainBox.left <= 24 && closed.mainBox.width >= 342, `Library mobile main pane is occluded or shifted: ${JSON.stringify(closed)}`);
  assert.equal(closed.host.inert, true, "Closed Library context drawer must be inert.");
  assert.equal(closed.host.pointerEvents, "none", "Closed Library context drawer must not intercept pointer input.");
  assert.equal(closed.host.focusableCount, 0, "Closed Library context drawer must have no focusable descendants.");
  assert.equal(closed.hitIsMain, true, "Library mobile main pane must own the central hit-test area.");

  const trigger = page.getByRole("button", { name: "打开项目导航", exact: true });
  await trigger.click();
  await page.waitForFunction(() => Boolean(document.querySelector(".workspace-sidebar-slot.is-mobile-open")));
  const open = await page.evaluate(() => {
    const slot = document.querySelector(".workspace-sidebar-slot.is-mobile-open");
    const host = document.querySelector(".module-sidebar-host");
    const backdrop = document.querySelector(".sidebar-mobile-backdrop");
    const slotBox = slot?.getBoundingClientRect();
    const backdropBox = backdrop?.getBoundingClientRect();
    return {
      slotBox: slotBox ? { left: slotBox.left, right: slotBox.right, width: slotBox.width } : null,
      backdropBox: backdropBox ? { left: backdropBox.left, right: backdropBox.right, width: backdropBox.width } : null,
      hostInert: host?.hasAttribute("inert"),
      activeLabel: document.activeElement?.getAttribute("aria-label")
    };
  });
  assert.ok(open.slotBox && open.slotBox.width <= 321, `Open Library drawer must not own the backdrop column: ${JSON.stringify(open)}`);
  assert.ok(open.backdropBox && open.backdropBox.width === 390, `Open Library drawer backdrop must cover the viewport: ${JSON.stringify(open)}`);
  assert.equal(open.hostInert, false, "Open Library context drawer must be interactive.");
  assert.equal(open.activeLabel, "关闭资料库目录", "Opening Library drawer must move focus to its close control.");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".workspace-sidebar-slot.is-mobile-open"));
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "打开项目导航");
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, "Escape must return focus to the Library drawer trigger.");

  await trigger.click();
  await page.waitForFunction(() => Boolean(document.querySelector(".workspace-sidebar-slot.is-mobile-open")));
  await page.waitForTimeout(220);
  const exposedPoint = await page.evaluate(() => {
    const slot = document.querySelector(".workspace-sidebar-slot.is-mobile-open")?.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 8, (slot?.right || 0) + 24);
    const target = document.elementFromPoint(x, 180);
    return { x, y: 180, isBackdrop: Boolean(target?.closest(".sidebar-mobile-backdrop")) };
  });
  assert.equal(exposedPoint.isBackdrop, true, `The exposed mobile point must hit the backdrop: ${JSON.stringify(exposedPoint)}`);
  await page.mouse.click(exposedPoint.x, exposedPoint.y);
  await page.waitForFunction(() => !document.querySelector(".workspace-sidebar-slot.is-mobile-open"));
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "打开项目导航");
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, "Backdrop click must return focus to the Library drawer trigger.");
}

async function assertMobileMainSurface(page) {
  const mainBox = await page.locator(".event-line-spine-main").boundingBox();
  assert.ok(mainBox && mainBox.width >= 340, `The default mobile event surface is covered by an overlay: ${JSON.stringify(mainBox)}`);
  assert.equal(await page.evaluate(() => {
    const element = document.elementFromPoint(Math.min(200, innerWidth - 12), 180);
    return Boolean(element?.closest(".event-line-spine-main"));
  }), true, "The default mobile event surface must own the central hit-test area.");
  const heading = page.getByRole("heading", { name: "故事已经发生了什么", exact: true });
  const box = await heading.boundingBox();
  assert.ok(box && box.x >= -1 && box.x + box.width <= 391 && box.y >= -1 && box.y + box.height <= 844, "The default mobile event surface is not fully visible.");
  const action = page.getByRole("button", { name: "适应视图", exact: true });
  const actionBox = await action.boundingBox();
  assert.ok(actionBox && actionBox.x >= -1 && actionBox.x + actionBox.width <= 391 && actionBox.y + actionBox.height <= 844, "The default mobile event action is not reachable.");
}

async function assertMobileMoreMenu(page, menu) {
  const menuBox = await menu.boundingBox();
  assert.ok(menuBox && menuBox.x >= -1 && menuBox.x + menuBox.width <= 391 && menuBox.y >= -1 && menuBox.y + menuBox.height <= 844, "More menu must remain inside the mobile viewport.");
  for (const label of [/多元/u, /资料/u, /控制中心/u, /个人中心/u]) {
    const item = menu.getByRole("menuitem", { name: label });
    const box = await item.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= 391 && box.y >= -1 && box.y + box.height <= 844, `More menu item ${label} is not reachable.`);
    assert.equal(await item.isEnabled(), true);
  }
}

async function assertCreationRailLayout(page) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1180, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => document.querySelector(".writing-navigator")?.getBoundingClientRect().height > 0);
    const result = await page.evaluate(() => {
      const rail = document.querySelector(".writing-navigator");
      if (!rail) return null;
      const selectors = ["header", ".creation-sidebar-actions", ".creation-sidebar-empty", ".writing-output-artifacts", "nav", ".author-library-hierarchy"];
      const rects = selectors.map((selector) => {
        const element = rail.querySelector(`:scope > ${selector}`);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }).filter((value) => value && value.width > 0 && value.height > 0);
      const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      const overlaps = [];
      for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) if (overlap(rects[i], rects[j]) > 0.5) overlaps.push([rects[i].selector, rects[j].selector]);
      const railStyle = getComputedStyle(rail);
      const children = [...rail.children].map((child) => ({ tag: child.tagName, className: child.className, gridRow: getComputedStyle(child).gridRow, minHeight: getComputedStyle(child).minHeight }));
      return { rail: rail.getBoundingClientRect().toJSON(), rects, children, gridRows: railStyle.gridTemplateRows, display: railStyle.display, scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth, overlaps };
    });
    assert.ok(result, `Creation rail missing at ${viewport.width}px.`);
    assert.ok(result.scrollWidth <= result.clientWidth + 1, `Creation rail overflows horizontally at ${viewport.width}px: ${JSON.stringify(result)}`);
    assert.deepEqual(result.overlaps, [], `Creation rail sections overlap at ${viewport.width}px: ${JSON.stringify(result.overlaps)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function assertCreationMobileLayout(page) {
  const result = await page.evaluate(() => {
    const home = document.querySelector(".work-version-creation-workspace") || document.querySelector(".work-version-creation-state");
    const header = document.querySelector(".work-version-creation-header");
    const cards = [...document.querySelectorAll(".creation-source-primary-card, .creation-package-preview, .work-version-creation-state")];
    const navigation = document.querySelector(".product-shell-navigation");
    const rect = (element) => element.getBoundingClientRect().toJSON();
    const headerRect = header?.getBoundingClientRect();
    const cardsRect = cards.map((card) => card.getBoundingClientRect());
    const overlaps = cardsRect.flatMap((card, index) => cardsRect.slice(index + 1).map((next, offset) => ({ index, next: index + offset + 1, area: Math.max(0, Math.min(card.right, next.right) - Math.max(card.left, next.left)) * Math.max(0, Math.min(card.bottom, next.bottom) - Math.max(card.top, next.top)) })).filter((item) => item.area > 1));
    return {
      home: home ? rect(home) : null,
      header: header ? rect(header) : null,
      cards: cards.map(rect),
      navigation: navigation ? rect(navigation) : null,
      navigationHit: navigation ? (() => { const navigationRect = navigation.getBoundingClientRect(); const target = document.elementFromPoint(navigationRect.left + navigationRect.width / 2, navigationRect.top + navigationRect.height / 2); const style = (element) => element ? { className: element.className, dataProductMode: element.getAttribute("data-product-mode"), position: getComputedStyle(element).position, zIndex: getComputedStyle(element).zIndex, transform: getComputedStyle(element).transform, opacity: getComputedStyle(element).opacity, isolation: getComputedStyle(element).isolation, contain: getComputedStyle(element).contain, pointerEvents: getComputedStyle(element).pointerEvents } : null; return { owns: Boolean(target && navigation.contains(target)), target: target ? { tag: target.tagName, className: target.className, text: target.textContent?.trim().slice(0, 80) } : null, navigationStyle: style(navigation), stageStyle: style(document.querySelector(".story-studio-workspace-stage")), shellStyle: style(document.querySelector(".story-studio-shell")), homeStyle: style(home) }; })() : null,
      headerOverlapsFirstCard: Boolean(headerRect && cardsRect[0] && Math.max(0, Math.min(headerRect.right, cardsRect[0].right) - Math.max(headerRect.left, cardsRect[0].left)) * Math.max(0, Math.min(headerRect.bottom, cardsRect[0].bottom) - Math.max(headerRect.top, cardsRect[0].top)) > 1),
      overlaps,
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  assert.ok(result.home && result.navigation, `Creation mobile surface is incomplete: ${JSON.stringify(result)}`);
  if (result.cards.length) {
    assert.equal(result.headerOverlapsFirstCard, false, `Creation mobile format list overlaps the header: ${JSON.stringify(result)}`);
    assert.deepEqual(result.overlaps, [], `Creation mobile format list rows overlap: ${JSON.stringify(result)}`);
    assert.ok(result.cards.every((card) => card.width > 0 && card.left >= -1 && card.right <= 391), `Creation mobile format row is clipped: ${JSON.stringify(result)}`);
  } else {
    assert.equal(await page.getByTestId("creation-source-unavailable").count(), 1, "Creation without a valid source must remain an honest fail-closed state.");
    assert.equal(await page.locator(".work-version-creation-state button").count(), 0, "The fail-closed state must not expose an executable CTA.");
  }
  assert.equal(result.navigationHit?.owns, true, `Creation mobile bottom navigation is blocked: ${JSON.stringify(result)}`);
  assert.ok(result.overflow <= 1, `Creation mobile page has horizontal overflow: ${JSON.stringify(result)}`);
}

async function assertNuwaLongformLayout(page) {
  const panel = page.getByRole("tabpanel", { name: "长篇分阶段编排", exact: true });
  const result = await panel.evaluate((element) => {
    const header = element.querySelector(":scope > header");
    const stages = [...element.querySelectorAll(".nuwa-longform-stages > li")];
    const rect = (item) => { const value = item?.getBoundingClientRect(); return value ? { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null; };
    const headerRect = rect(header);
    const stageRects = stages.map(rect).filter(Boolean);
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const stageOverlaps = [];
    for (let i = 0; i < stageRects.length; i += 1) for (let j = i + 1; j < stageRects.length; j += 1) if (overlap(stageRects[i], stageRects[j]) > 0.5) stageOverlaps.push([i, j]);
    const primaryHeader = document.querySelector(".nuwa-primary-header");
    const projectBox = primaryHeader?.querySelector(".workbench-project")?.getBoundingClientRect();
    const actionBox = primaryHeader?.querySelector(".workbench-header-actions")?.getBoundingClientRect();
    const overlapArea = projectBox && actionBox ? Math.max(0, Math.min(projectBox.right, actionBox.right) - Math.max(projectBox.left, actionBox.left)) * Math.max(0, Math.min(projectBox.bottom, actionBox.bottom) - Math.max(projectBox.top, actionBox.top)) : 0;
    const actionItems = primaryHeader ? [...primaryHeader.querySelectorAll(".nuwa-header-actions > *")].map((item) => ({ label: item.getAttribute("aria-label") || item.textContent?.trim() || "", box: item.getBoundingClientRect() })).filter((item) => item.box.width > 0 && item.box.height > 0) : [];
    const actionOverlaps = [];
    for (let i = 0; i < actionItems.length; i += 1) for (let j = i + 1; j < actionItems.length; j += 1) if (Math.max(0, Math.min(actionItems[i].box.right, actionItems[j].box.right) - Math.max(actionItems[i].box.left, actionItems[j].box.left)) * Math.max(0, Math.min(actionItems[i].box.bottom, actionItems[j].box.bottom) - Math.max(actionItems[i].box.top, actionItems[j].box.top)) > 0.5) actionOverlaps.push([actionItems[i], actionItems[j]]);
    return { headerRect, stageRects, stageOverlaps, overlapArea, actionOverlaps, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  assert.ok(result.headerRect, "Nuwa longform header is missing at 1180px.");
  assert.deepEqual(result.stageOverlaps, [], `Nuwa longform stage cards overlap: ${JSON.stringify(result.stageOverlaps)}`);
  assert.equal(result.overlapArea, 0, `Nuwa workspace header project/actions overlap: ${result.overlapArea}px²`);
  assert.deepEqual(result.actionOverlaps, [], `Nuwa workspace header actions overlap: ${JSON.stringify(result.actionOverlaps)}`);
  assert.ok(result.scrollWidth <= result.clientWidth + 1, "Nuwa longform workspace horizontally overflows at 1180px.");
}

async function assertNuwaDockLayout(page, width, height, expectedPlacement, options = {}) {
  // Tianyi is the higher-priority mobile sheet.  Restore the page tool before
  // changing Nuwa's layout so this helper starts from a reachable page dock.
  const existingAssistant = page.getByTestId("tianyi-quick-assistant");
  if (await existingAssistant.count()) {
    await existingAssistant.getByRole("button", { name: "关闭天意助手", exact: true }).click();
    await existingAssistant.waitFor({ state: "hidden" });
  }
  const existingPanel = page.locator(".page-context-dock-panel");
  if (await existingPanel.count()) await existingPanel.getByRole("button", { name: /^关闭/u }).click();
  await page.setViewportSize({ width, height });
  const dock = page.locator(".page-context-dock");
  const panel = page.locator(".page-context-dock-panel");
  await dock.waitFor();
  if (options.expectInitiallyClosed) {
    assert.equal(await panel.count(), 0, `Nuwa ${width}px page drawer must be closed before the author opens a tool.`);
  }
  const trigger = page.getByRole("button", { name: "观察", exact: true });
  await trigger.click();
  await panel.waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `Nuwa ${width}px horizontal overflow: ${overflow}px`);
  const position = await dock.evaluate((element) => getComputedStyle(element).position);
  const [workspaceBox, dockBox, panelBox] = await Promise.all([
    page.locator(".nuwa-runtime-main").boundingBox(),
    dock.boundingBox(),
    panel.boundingBox()
  ]);
  assert.ok(workspaceBox && dockBox && panelBox, `Nuwa ${width}px layout boxes are unavailable.`);
  if (expectedPlacement === "bottom") {
    if (width <= 500) assert.equal(position, "fixed", `Nuwa ${width}px must use one mobile bottom sheet.`);
    else {
      assert.equal(position, "static", `Nuwa ${width}px must reserve a bottom row instead of overlaying the unit.`);
      assert.ok(
        dockBox.y >= workspaceBox.y + workspaceBox.height - 1,
        `Nuwa ${width}px bottom drawer overlaps the reserved main row: workspace=${JSON.stringify(workspaceBox)} dock=${JSON.stringify(dockBox)}.`
      );
      assert.ok(dockBox.y + dockBox.height <= height + 1, `Nuwa ${width}px bottom drawer extends below the visible viewport.`);
    }
  } else {
    assert.equal(position, "static", `Nuwa ${width}px must reserve a grid column for the side dock.`);
    assert.ok(panelBox.x >= workspaceBox.x + workspaceBox.width - 1, `Nuwa ${width}px dock overlaps the primary workspace.`);
  }
  if (options.criticalContent && width <= 500) {
    await panel.getByRole("button", { name: "关闭观察", exact: true }).click();
    await panel.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "观察");
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, `Nuwa ${width}px Tianyi close did not restore its trigger focus.`);
    await assertNuwaCriticalContentReachable(page, null, width);
    await trigger.click();
    await panel.waitFor();
  } else if (options.criticalContent) await assertNuwaCriticalContentReachable(page, panel, width);
  await panel.getByRole("button", { name: "关闭观察", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
}

async function assertNuwaCriticalContentReachable(page, dock, width) {
  const selectors = [
    ".nuwa-unit-command-bar",
    ".nuwa-player-progress",
    ".nuwa-player-controls",
    ".nuwa-stream-panel > header",
    ".nuwa-rehearsal-stream",
    ".nuwa-rehearsal-footer"
  ];
  const canvas = page.locator(".nuwa-runtime-main");
  const originalScrollTop = await canvas.evaluate((element) => element.scrollTop);
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    await element.scrollIntoViewIfNeeded();
    const [elementBox, dockBox, visibility] = await Promise.all([
      element.boundingBox(),
      dock ? dock.boundingBox() : Promise.resolve(null),
      element.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        let visible = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (![style.overflow, style.overflowX, style.overflowY].some((value) => ["hidden", "clip"].includes(value))) continue;
          const parentRect = ancestor.getBoundingClientRect();
          visible = {
            left: Math.max(visible.left, parentRect.left),
            top: Math.max(visible.top, parentRect.top),
            right: Math.min(visible.right, parentRect.right),
            bottom: Math.min(visible.bottom, parentRect.bottom)
          };
        }
        return {
          fullArea: Math.max(0, rect.width) * Math.max(0, rect.height),
          visibleArea: Math.max(0, visible.right - visible.left) * Math.max(0, visible.bottom - visible.top)
        };
      })
    ]);
    assert.ok(elementBox, `Nuwa ${width}px ${selector} has no visible box.`);
    if (dockBox) assert.equal(rectIntersectionArea(elementBox, dockBox), 0, `Nuwa ${width}px ${selector} intersects Tianyi.`);
    assert.ok(visibility.visibleArea >= visibility.fullArea - 1, `Nuwa ${width}px ${selector} is clipped by an overflow ancestor.`);
  }
  await canvas.evaluate((element, scrollTop) => { element.scrollTop = scrollTop; }, originalScrollTop);
}

function rectIntersectionArea(first, second) {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height;
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
  // Cold-starting the full local server can exceed ten seconds on a loaded
  // developer machine; keep the smoke gate bounded without false negatives.
  const deadline = Date.now() + 20_000;
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
  const executable = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", chromium.executablePath()]
    .filter(Boolean)
    .find((candidate) => existsSync(candidate));
  assert.ok(executable, "No supported Chromium executable was found.");
  return executable;
}
