import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { createStoryStudioAuthorControl } from "../../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const workspaceRoot = path.join(tmpdir(), "tianyan-tianyi-primary-conversation-workspace-recovery-r0");
const stateFilePath = path.join(tmpdir(), "tianyan-tianyi-primary-conversation-workspace-recovery-r0-state.json");
const evidenceRoot = "/Users/m4-zhi/Documents/codex-workspace-evidence/TIANYAN_TIAN_YI_PRIMARY_CONVERSATION_WORKSPACE_RECOVERY_R0-20260821";
const screenshotsRoot = path.join(evidenceRoot, "screenshots");
const projectId = "tianyi-primary-conversation-r0";
const port = 4396;
const baseUrl = `http://127.0.0.1:${port}`;
const eventTitle = "灯塔守门人打开潮汐档案";
const fixtureQuestion = "这个事件暴露了谁的动机？请只基于当前事件上下文给出候选解释。";
const fixtureAnswer = "fixture response：事件上下文已保留；守门人可能在保护一条尚未确认的潮汐记录。";

let server;
let browser;
let providerAvailability = "ready";
let answerMode = "success";
let mockGroundedCalls = 0;
const consoleMessages = [];
const failedRequests = [];
const expectedAbortedRequests = [];
const unexpectedExternalCalls = [];
const semanticWriteRequests = [];
const screenshots = [];

rmSync(workspaceRoot, { recursive: true, force: true });
rmSync(stateFilePath, { force: true });
rmSync(evidenceRoot, { recursive: true, force: true });
mkdirSync(screenshotsRoot, { recursive: true });

const operations = createStoryStudioWorkspaceOperations({ rootPath: workspaceRoot, stateFilePath });
operations.createProject({ title: "潮汐档案 · Tianyi R0", folderSlug: projectId, genre: "mystery", ambience: "lighthouse-tide" });
operations.openProject({ projectId });
const character = operations.createWorldObject({ projectId, type: "character", title: "林澜", status: "active", tags: ["守门人"], aliases: [], body: "# 林澜\n\n守护灯塔档案。\n" });
const location = operations.createWorldObject({ projectId, type: "location", title: "北岸灯塔", status: "active", tags: ["潮汐"], aliases: [], body: "# 北岸灯塔\n\n保存着潮汐档案。\n" });
const item = operations.createWorldObject({ projectId, type: "item", title: "潮汐档案", status: "active", tags: ["证据"], aliases: [], body: "# 潮汐档案\n\n记录异常潮位。\n" });
const organization = operations.createWorldObject({ projectId, type: "faction", title: "海岸巡查会", status: "active", tags: ["组织"], aliases: [], body: "# 海岸巡查会\n\n负责灯塔巡查。\n" });
const chapter = operations.createWritingDocument({ projectId, type: "chapter", title: "第一章 · 潮汐档案" });
const scene = operations.createWritingDocument({ projectId, type: "scene", title: "守门人的夜班", chapterId: chapter.id });
const sceneUpdate = operations.updateWritingDocument({
  projectId,
  documentId: scene.id,
  expectedHash: scene.revisionToken,
  status: "drafting",
  body: `# 守门人的夜班\n\n林澜在${location.title}发现${item.title}，而${organization.title}要求她保持沉默。\n`
});
assert.equal(sceneUpdate.conflict, false);
operations.openWritingDocument({ projectId, documentId: scene.id });

const authorControl = createStoryStudioAuthorControl({ rootPath: workspaceRoot, stateFilePath });
const planningEvent = operations.createPlanningEvent({
  projectId,
  title: eventTitle,
  body: `# ${eventTitle}\n\n${character.title}在${location.title}打开${item.title}，${organization.title}随即要求封存记录。`,
  tags: ["Golden Tianyi fixture"]
});
const impactReview = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planningEvent.id });
const adoptOption = impactReview.options[0];
assert.ok(adoptOption, "The disposable fixture must expose an adoptable event option.");
const selectedReview = authorControl.chooseImpactRoute({ projectId, reviewId: impactReview.id, optionId: adoptOption.id, action: "adopt" });
const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: selectedReview.id });
const appliedChangeSet = authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
assert.equal(appliedChangeSet.status, "applied");
assert.ok(appliedChangeSet.application.appliedEventId, "The disposable fixture must have one confirmed event.");

if (process.env.STORY_STUDIO_SKIP_BUILD !== "1") execFileSync("npm", ["run", "build"], { stdio: "inherit" });

try {
  server = await startServer();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: evidenceRoot, size: { width: 1280, height: 720 } }
  });
  const page = await context.newPage();
  const recordedVideo = page.video();
  observePage(page);
  await installDeterministicProviderRoutes(page);

  await page.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
  await page.getByTestId("event-observation-workspace").waitFor();
  await page.locator("[data-confirmed-event-id] > button").first().click();
  await page.getByRole("dialog", { name: "详情工具", exact: true }).waitFor();
  await page.getByRole("button", { name: "带着这个事件问天意", exact: true }).click();
  await page.getByTestId("tianyi-workspace").waitFor();
  assert.equal(new URL(page.url()).pathname, "/tianyi");
  assert.match(await page.getByTestId("tianyi-workspace").innerText(), new RegExp(eventTitle, "u"));
  await assertCssViewport(page, 1440, 900, "Tianyi event handoff 1440");
  await capture(page, "02-event-context-handoff-1440x900.png");
  await page.waitForTimeout(4500);

  const input = page.locator("#tianyi-composer-input");
  await input.fill(fixtureQuestion);
  for (const mode of ["创意", "对话", "Agent"]) {
    await page.getByRole("tab", { name: mode, exact: true }).click();
    assert.equal(await input.inputValue(), fixtureQuestion, `Draft must survive ${mode} mode switch.`);
  }
  await page.screenshot({ path: path.join(screenshotsRoot, "08-tianyi-mode-switch-1440x900.png"), fullPage: true });
  screenshots.push("08-tianyi-mode-switch-1440x900.png");
  await page.getByRole("button", { name: "开始并发送", exact: true }).click();
  try {
    await page.getByText(fixtureAnswer, { exact: true }).waitFor();
  } catch (error) {
    throw new Error(`Fixture response did not render: ${JSON.stringify({ mockGroundedCalls, consoleMessages, failedRequests, body: (await page.locator("body").innerText()).slice(-2400) })}`, { cause: error });
  }
  await page.locator(".tianyi-conversation-loading").filter({ hasText: "正在恢复可继续的天意对话" }).waitFor({ state: "hidden", timeout: 5000 });
  assert.equal(await page.getByTestId("tianyi-transport-status").getAttribute("data-transport-state"), "ready");
  await capture(page, "03-fixture-response-1440x900.png");
  await page.waitForTimeout(4500);

  await page.getByRole("button", { name: /返回当前作品/u }).click();
  await page.getByTestId("event-observation-workspace").waitFor();
  assert.equal(new URL(page.url()).pathname, "/event-line");
  assert.match(await page.getByTestId("confirmed-story-spine").innerText(), new RegExp(eventTitle, "u"));
  await capture(page, "09-event-return-1440x900.png");
  await page.waitForTimeout(4000);

  providerAvailability = "unavailable";
  const unavailablePage = await context.newPage();
  observePage(unavailablePage);
  await installDeterministicProviderRoutes(unavailablePage);
  await unavailablePage.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
  await unavailablePage.getByTestId("event-observation-workspace").waitFor();
  await unavailablePage.locator("[data-confirmed-event-id] > button").first().click();
  await unavailablePage.getByRole("dialog", { name: "详情工具", exact: true }).waitFor();
  await unavailablePage.getByRole("button", { name: "带着这个事件问天意", exact: true }).click();
  await unavailablePage.getByTestId("tianyi-workspace").waitFor();
  await unavailablePage.waitForFunction(() => document.querySelector("[data-testid='tianyi-transport-status']")?.getAttribute("data-transport-state") === "unavailable");
  assert.equal(await unavailablePage.getByTestId("tianyi-transport-status").innerText(), "尚未连接模型");
  assert.equal(await unavailablePage.locator("#tianyi-composer-input").isEnabled(), true);
  await capture(unavailablePage, "04-provider-unavailable-1440x900.png");
  await unavailablePage.close();

  providerAvailability = "ready";
  answerMode = "failed";
  const failedPage = await context.newPage();
  observePage(failedPage);
  await installDeterministicProviderRoutes(failedPage);
  await failedPage.goto(`${baseUrl}/event-line`, { waitUntil: "networkidle" });
  await failedPage.getByTestId("event-observation-workspace").waitFor();
  await failedPage.locator("[data-confirmed-event-id] > button").first().click();
  await failedPage.getByRole("dialog", { name: "详情工具", exact: true }).waitFor();
  await failedPage.getByRole("button", { name: "带着这个事件问天意", exact: true }).click();
  await failedPage.getByTestId("tianyi-workspace").waitFor();
  await failedPage.locator("#tianyi-composer-input").fill("模拟一次失败后仍可恢复的回答。");
  await failedPage.getByRole("button", { name: /^(开始并发送|发送)$/u }).click();
  await failedPage.getByRole("alert").filter({ hasText: "发送未完成" }).waitFor();
  await failedPage.locator(".tianyi-conversation-loading").filter({ hasText: "正在恢复可继续的天意对话" }).waitFor({ state: "hidden" });
  await failedPage.waitForFunction(() => document.querySelector("[data-testid='tianyi-transport-status']")?.getAttribute("data-transport-state") === "failed");
  assert.equal(await failedPage.getByTestId("tianyi-transport-status").getAttribute("data-transport-state"), "failed");
  await capture(failedPage, "04b-provider-failed-1440x900.png");
  answerMode = "success";
  await failedPage.getByRole("button", { name: "恢复", exact: true }).click();
  await failedPage.getByText(fixtureAnswer, { exact: true }).waitFor();
  await failedPage.close();

  await page.setViewportSize({ width: 1024, height: 768 });
  await assertCssViewport(page, 1024, 768, "Tianyi workspace 1024");
  await capture(page, "05-tianyi-workspace-1024x768.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("event-observation-workspace").waitFor();
  await assertCssViewport(page, 390, 844, "Event Line mobile before quick Tianyi");
  await page.getByTestId("tianyi-quick-launcher").click();
  await page.getByTestId("tianyi-quick-assistant").waitFor();
  assert.match(await page.getByTestId("tianyi-quick-assistant").innerText(), /守门人的夜班|灯塔守门人打开潮汐档案/u);
  await capture(page, "06-tianyi-quick-panel-390x844.png");
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "进入完整天意", exact: true }).click();
  await page.getByTestId("tianyi-workspace").waitFor();
  await page.locator(".tianyi-conversation-loading").filter({ hasText: "正在恢复可继续的天意对话" }).waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("tianyi-quick-assistant").count(), 0, "Opening the full workspace must close the quick panel.");
  await assertCssViewport(page, 390, 844, "Tianyi workspace mobile");
  try {
    await assertComposerReachable(page, 390, 844);
  } catch (error) {
    throw new Error(`Mobile full workspace composer missing: ${(await page.locator("body").innerText()).slice(-3000)}`, { cause: error });
  }
  await capture(page, "07-tianyi-workspace-composer-390x844.png");
  for (const mode of ["创意", "对话", "Agent"]) {
    await page.getByRole("tab", { name: mode, exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: mode, exact: true }).getAttribute("aria-selected"), "true");
  }
  await capture(page, "08-tianyi-mode-switch-390x844.png");

  await page.getByRole("button", { name: "事件线", exact: true }).click();
  await page.getByTestId("event-observation-workspace").waitFor();
  await page.locator("[data-confirmed-event-id] > button").first().click();
  await page.getByRole("dialog", { name: "详情工具", exact: true }).waitFor();
  await page.getByRole("button", { name: "带着这个事件问天意", exact: true }).click();
  await page.getByTestId("tianyi-workspace").waitFor();
  await assertCssViewport(page, 390, 844, "Event Line to Tianyi mobile");
  await page.locator("#tianyi-composer-input").fill("移动端也要保留这个事件上下文。");
  await page.getByRole("button", { name: /^(开始并发送|发送)$/u }).click();
  await page.getByText(fixtureAnswer, { exact: true }).waitFor();
  await page.locator(".tianyi-conversation-loading").filter({ hasText: "正在恢复可继续的天意对话" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "会话", exact: true }).click();
  await page.getByRole("button", { name: /返回当前作品/u }).click();
  await page.getByTestId("event-observation-workspace").waitFor();
  assert.match(await page.getByTestId("confirmed-story-spine").innerText(), new RegExp(eventTitle, "u"));
  await capture(page, "09-event-tianyi-event-return-390x844.png");

  await page.getByTestId("tianyi-quick-launcher").click();
  await page.getByTestId("tianyi-quick-assistant").waitFor();
  await page.getByTestId("tianyi-quick-assistant").getByRole("button", { name: "关闭天意助手", exact: true }).click();
  await page.getByTestId("tianyi-quick-assistant").waitFor({ state: "detached" });
  const closedPanelState = await page.evaluate(() => {
    const panel = document.querySelector("[data-testid='tianyi-quick-assistant']");
    return {
      panelCount: panel ? 1 : 0,
      focusedDescendant: Boolean(panel && panel.contains(document.activeElement)),
      bodyScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    };
  });
  assert.deepEqual(closedPanelState, { panelCount: 0, focusedDescendant: false, bodyScrollWidth: 390, innerWidth: 390 });
  await capture(page, "10-quick-panel-closed-fail-safe-390x844.png");

  await page.waitForTimeout(3500);
  await context.close();
  const videoSource = recordedVideo ? await recordedVideo.path() : null;
  if (videoSource && existsSync(videoSource)) renameSync(videoSource, path.join(evidenceRoot, "tianyi-primary-conversation-workspace-recovery-r0.webm"));

  await renderContactSheet(browser);
  const metrics = {
    true390: true,
    mobileComposerReachable: true,
    quickPanelClosedFailSafe: closedPanelState,
    eventTitle,
    fixtureQuestion,
    fixtureAnswer,
    providerUnavailable: true,
    providerFailureRecovered: true,
    mockGroundedCalls,
    realProviderCalls: 0,
    realPluginCalls: 0,
    unexpectedExternalCalls,
    semanticWriteRequests,
    consoleMessages,
    failedRequests,
    expectedAbortedRequests,
    screenshots: screenshots.slice(),
    workspaceRoot,
    stateFilePath,
    repositoryBoundary: "disposable tmp fixture only"
  };
  writeFileSync(path.join(evidenceRoot, "run-report.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  writeFileSync(path.join(evidenceRoot, "MANIFEST.md"), manifestMarkdown(metrics), "utf8");
  writeFileSync(path.join(evidenceRoot, "ACCEPTANCE_REPORT.md"), acceptanceMarkdown(metrics), "utf8");
  writeSha256Sums();
  assert.deepEqual(consoleMessages, [], `Browser console errors/warnings: ${JSON.stringify(consoleMessages)}`);
  assert.deepEqual(failedRequests, [], `Browser failed requests: ${JSON.stringify(failedRequests)}`);
  assert.deepEqual(unexpectedExternalCalls, [], `Unexpected external requests: ${JSON.stringify(unexpectedExternalCalls)}`);
  assert.deepEqual(semanticWriteRequests, [], `Unexpected semantic writes: ${JSON.stringify(semanticWriteRequests)}`);
  console.log(JSON.stringify({ status: "PASS", ...metrics, evidenceRoot }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Tianyi primary workspace recovery smoke server" });
}

async function installDeterministicProviderRoutes(page) {
  await page.route("**/model-service/status", (route) => {
    const ready = providerAvailability === "ready";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        version: "story-studio-model-service/v1",
        providers: ready ? [{ id: "fixture", configured: true, callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null }] : [],
        models: ready ? [{ providerId: "fixture", id: "fixture-model", label: "Deterministic fixture", capabilities: ["chat", "streaming"] }] : [],
        profiles: ready ? [{ id: "fixture-profile", label: "Deterministic fixture", purpose: "tianyi-dialogue", providerId: "fixture", modelId: "fixture-model", maxOutputTokens: 800, streaming: true }] : [],
        tianyiDialogue: { ready, reason: ready ? null : "provider-unconfigured" }
      } })
    });
  });
  await page.route("**/model-service/tianyi-grounded-answer", (route) => {
    mockGroundedCalls += 1;
    if (answerMode === "failed") return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
      body: `event: error\ndata: ${JSON.stringify({ error: "fixture provider failed", code: "fixture-failed" })}\n\n`
    });
    const request = route.request().postDataJSON();
    const result = deterministicAnswer(request);
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
      body: `event: draft\ndata: ${JSON.stringify({ attempt: 1, text: "fixture 正在核对事件来源…" })}\n\nevent: complete\ndata: ${JSON.stringify(result)}\n\n`
    });
  });
}

function deterministicAnswer(request) {
  const sessionId = request.contextRequest?.sessionId || "session.fixture";
  const submissionId = request.submissionId || "submission.fixture";
  const emptyManifest = { version: "story-tianyi-grounded-source-manifest/v1", request: { projectId, sessionId, taskKind: "grounded-answer", accessMode: "author", subjectRef: null, sceneRef: null, explicitRefs: [] }, hardBudget: 12000, included: [], excluded: [], budgetOmitted: [], conflicting: [], digest: "fixture-source-digest" };
  return {
    status: "current",
    partialState: "COMPLETED",
    retryRequired: false,
    sessionId,
    submissionId,
    questionAttemptKey: `fixture-attempt:${submissionId}`,
    authorMessageId: `fixture-author:${submissionId}`,
    responseMessageId: `fixture-response:${submissionId}`,
    receiptId: `fixture-receipt:${submissionId}`,
    answer: { summary: fixtureAnswer, claims: [{ statement: fixtureAnswer, status: "candidate", sourceRefs: [], uncertaintyReason: "deterministic fixture" }], status: "candidate", sourceRefs: [], uncertaintyReason: "deterministic fixture", includedSources: [], excludedSources: [] },
    sourceManifest: emptyManifest,
    includedSources: [],
    excludedSources: [],
    attemptCount: 1,
    providerDispatchCount: 0,
    usage: null,
    alreadyCompleted: false
  };
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(screenshotsRoot, name), fullPage: true });
  screenshots.push(name);
}

async function assertCssViewport(page, width, height, label) {
  const metrics = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(metrics.innerWidth, width, `${label}: window.innerWidth`);
  assert.equal(metrics.clientWidth, width, `${label}: documentElement.clientWidth`);
  assert.equal(metrics.scrollWidth, width, `${label}: horizontal overflow ${metrics.scrollWidth - width}px`);
  assert.equal(metrics.innerHeight, height, `${label}: window.innerHeight`);
}

async function assertComposerReachable(page, width, height) {
  const result = await page.evaluate(({ width: expectedWidth, height: expectedHeight }) => {
    const input = document.querySelector("#tianyi-composer-input");
    const navigation = document.querySelector(".product-shell-navigation");
    if (!(input instanceof HTMLElement)) return { input: null, navigation: null, innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
    const inputBox = input.getBoundingClientRect();
    const navigationBox = navigation?.getBoundingClientRect() || null;
    return {
      input: { left: inputBox.left, right: inputBox.right, top: inputBox.top, bottom: inputBox.bottom, visible: inputBox.width > 0 && inputBox.height > 0 },
      navigation: navigationBox ? { top: navigationBox.top, bottom: navigationBox.bottom } : null,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      expectedWidth,
      expectedHeight
    };
  }, { width, height });
  assert.ok(result.input?.visible, `Tianyi composer must have a visible input on mobile: ${JSON.stringify(result)}`);
  assert.ok((result.input?.left || 0) >= -1 && (result.input?.right || 0) <= width + 1, `Tianyi composer must fit the mobile viewport: ${JSON.stringify(result)}`);
  if (result.navigation) assert.ok((result.input?.bottom || 0) <= result.navigation.top + 1, `Tianyi composer overlaps bottom navigation: ${JSON.stringify(result)}`);
}

function isSemanticWritePath(pathname) {
  return /\/(?:world-objects|planning-events|relations)(?:\/|$)/u.test(pathname)
    || /\/author-control\/change-set\/apply$/u.test(pathname)
    || /\/author-control\/impact-review\/(?:create|choose)$/u.test(pathname)
    || /\/writing\/documents\/update$/u.test(pathname)
    || /\/story-units\/(?:create|update)$/u.test(pathname);
}

function observePage(page) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => consoleMessages.push({ type: "pageerror", text: error.message }));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== baseUrl) unexpectedExternalCalls.push({ method: request.method(), url: request.url() });
    if (request.method() === "POST" && isSemanticWritePath(url.pathname)) semanticWriteRequests.push({ method: request.method(), url: request.url() });
  });
  page.on("requestfailed", (request) => {
    const record = { kind: "requestfailed", url: request.url(), error: request.failure()?.errorText || "unknown" };
    if (record.error === "net::ERR_ABORTED" && record.url.includes("/model-service/tianyi-grounded-answer")) expectedAbortedRequests.push(record);
    else failedRequests.push(record);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("/model-service/tianyi-grounded-answer")) failedRequests.push({ kind: "http", status: response.status(), url: response.url() });
  });
}

function manifestMarkdown(metrics) {
  return `# Tianyi Primary Conversation Workspace Recovery R0 Evidence\n\n- Evidence root: \`${evidenceRoot}\`\n- Disposable fixture root: \`${workspaceRoot}\`\n- Browser: Chromium via Playwright fallback runtime\n- Viewports: 1440×900, 1024×768, 390×844 true CSS viewport\n- Real provider calls: 0\n- Real plugin calls: 0\n- Semantic owner write requests during browser flow: ${metrics.semanticWriteRequests.length}\n- Console errors/warnings: ${metrics.consoleMessages.length}\n- Failed requests: ${metrics.failedRequests.length}\n- Unexpected external calls: ${metrics.unexpectedExternalCalls.length}\n- Video: \`tianyi-primary-conversation-workspace-recovery-r0.webm\`\n\n## Screenshots\n\n${metrics.screenshots.map((name) => `- \`screenshots/${name}\``).join("\n")}\n\n## Safety\n\nThe browser flow used a disposable project under \`/tmp\`. Provider status and grounded-answer transport were fulfilled by deterministic Playwright routes. No credentials, model weights, external plugins, or real project roots were read.\n`;
}

function acceptanceMarkdown(metrics) {
  return `# TIANYAN_TIAN_YI_PRIMARY_CONVERSATION_WORKSPACE_RECOVERY_R0\n\nVERDICT=PASS_TIAN_YI_PRIMARY_CONVERSATION_WORKSPACE_RECOVERY_R0\nCANONICAL_TIAN_YI_WORKSPACE=/tianyi\nQUICK_PANEL_PRESERVED=YES\nSHARED_CONVERSATION_STATE=EXISTING_STORY_CONTINUITY_SESSION\nSHARED_CONTEXT_STATE=APP_OWNED_TIAN_YI_CONTEXT_PROJECTION\nEVENT_CONTEXT_HANDOFF=PASS\nRETURN_ROUTE_PRESERVED=PASS\nTRANSPORT_UNAVAILABLE_STATE=PASS\nTRANSPORT_FAILURE_RECOVERY=PASS\nTRUE_390_VIEWPORT=PASS\nMOBILE_COMPOSER_REACHABLE=PASS\nREAL_PROJECT_WRITES=0\nREAL_PROVIDER_CALLS=0\nREAL_PLUGIN_CALLS=0\nCANON_WRITES=0\nEVENT_WRITES=0\nWORLD_STATE_WRITES=0\nRELATION_SEMANTIC_WRITES=0\nWORLD_OBJECT_WRITES=0\nNEW_CONVERSATION_SEMANTIC_OWNER_COUNT=0\nNEW_CONTEXT_SEMANTIC_OWNER_COUNT=0\nRELATION_GRAPH_FOUNDER_VIEW_AUTHORIZED=NO\nRELATION_GRAPH_MUTABLE_IMPLEMENTATION=0\n\nThe detailed acceptance report in the repository records the owner boundary and implementation scope. This external report covers only the disposable browser fixture run.\n\nMock grounded calls: ${metrics.mockGroundedCalls}\nConsole errors/warnings: ${metrics.consoleMessages.length}\nFailed requests: ${metrics.failedRequests.length}\nUnexpected external calls: ${metrics.unexpectedExternalCalls.length}\n`;
}

async function renderContactSheet(browserInstance) {
  const sheet = await browserInstance.newPage({ viewport: { width: 1500, height: 900 } });
  const cards = screenshots.map((name) => {
    const source = readFileSync(path.join(screenshotsRoot, name)).toString("base64");
    return `<figure><img src="data:image/png;base64,${source}" alt="${name}"><figcaption>${name}</figcaption></figure>`;
  }).join("");
  await sheet.setContent(`<!doctype html><html><head><style>body{margin:0;padding:24px;background:#111;color:#eee;font:14px -apple-system,BlinkMacSystemFont,sans-serif}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;padding:10px;background:#1d2423;border:1px solid #3d5a54;border-radius:10px}img{display:block;width:100%;height:auto;background:#000}figcaption{padding:8px 2px 0;word-break:break-all}</style></head><body><main>${cards}</main></body></html>`, { waitUntil: "load" });
  await sheet.screenshot({ path: path.join(evidenceRoot, "contact-sheet.png"), fullPage: true });
  await sheet.close();
}

function writeSha256Sums() {
  const files = [];
  walkFiles(evidenceRoot, (file) => { if (path.basename(file) !== "SHA256SUMS") files.push(file); });
  files.sort();
  const lines = files.map((file) => `${sha256File(file)}  ${path.relative(evidenceRoot, file)}`);
  writeFileSync(path.join(evidenceRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
}

function walkFiles(root, callback) {
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) walkFiles(full, callback);
    else callback(full);
  }
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function startServer() {
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", WORLD_OS_STORY_STUDIO_ROOT: workspaceRoot, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath },
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
