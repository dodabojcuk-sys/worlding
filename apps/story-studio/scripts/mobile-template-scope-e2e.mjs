import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";

import { createCreationSourceSelectionPort } from "../server/creationSourceSelectionPort.mjs";
import { createStoryStudioWorkspaceOperations } from "../../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createStoryStudioTianyiOperations } from "../../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioAuthorControl } from "../../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const evidence = process.env.TIANYAN_MOBILE_TEMPLATE_EVIDENCE_DIR || null;
const fixture = await mkdtemp(path.join(os.tmpdir(), "tianyan-mobile-template-e2e-"));
process.once("exit", () => rmSync(fixture, { recursive: true, force: true }));
const rootPath = path.join(fixture, "projects");
const stateFilePath = path.join(fixture, "state.json");
const projectId = "mobile-scope-fixture";
const token = "mobile-scope-e2e-token";
const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
operations.createProject({ title: "另一本同名故事", folderSlug: "foreign-project" });
operations.createProject({ title: "三线同名隔离故事", folderSlug: projectId });
const creation = createCreationSourceSelectionPort({ operations });
const workVersionId = creation.createRoot(projectId).identity.workVersionId;
const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
const confirmed = (title, body) => {
  const planning = operations.createWorldObject({ projectId, type: "event", title, body, status: "planned", tags: ["作者规划"] });
  const review = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
  authorControl.chooseImpactRoute({ projectId, reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
  const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: review.id });
  authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
  return operations.listWorldObjects({ projectId, type: "event" }).map((event) => operations.readWorldObject({ projectId, objectId: event.id })).find((event) => event.properties.source_change_set_id === changeSet.id);
};
const origin = confirmed("共同起点", "三条线从港口分别展开。");
const mainEvent = confirmed("主线节点", "主线独有的夜航记录。");
const branchEvent = confirmed("支线一节点", "支线一独有的灯塔记录。");
const thirdEvent = confirmed("支线二节点", "支线二独有的钟楼记录。");
assert.ok(origin && mainEvent && branchEvent && thirdEvent);
operations.createWorldObject({ projectId, type: "character", title: "主线节点", body: "同名人物不等于事件。" });
operations.createWorldObject({ projectId: "foreign-project", type: "event", title: "主线节点", body: "外部项目独有内容。" });
const main = operations.createStoryUnit({ projectId, title: "雨棚", kind: "main", linkedEntityIds: [mainEvent.id, origin.id] });
const empty = operations.createStoryUnit({ projectId, title: "空单元", kind: "main", linkedEntityIds: [] });
const branch = operations.createStoryUnit({ projectId, title: "支线一雨棚", kind: "branch", parentUnitId: main.id, branchPointEventId: origin.id, linkedEntityIds: [branchEvent.id] });
const third = operations.createStoryUnit({ projectId, title: "支线二雨棚", kind: "branch", parentUnitId: main.id, branchPointEventId: origin.id, linkedEntityIds: [thirdEvent.id] });
assert.ok(empty && third);
const tianyi = createStoryStudioTianyiOperations({ rootPath, stateFilePath });
const old = await tianyi.openTianyiSession({ projectId, operationId: "mobile-e2e.old" });
await tianyi.runTianyiQuestion({ projectId, sessionId: old.sessionId, operationId: "mobile-e2e.old-message", request: { boundedAction: "fixture.current" }, contextRequest: { productMode: "world", activeOwner: { kind: "project", id: projectId }, selection: { documentId: null, objectId: null, timelinePointId: null }, sourceRefs: [], memorySelections: [], enabledSkillRefs: [] } });
const bound = await tianyi.openTianyiSession({ projectId, operationId: "mobile-e2e.bound", scope: { kind: "event-line", storylineKey: `branch.${branch.id}` } });
const port = await new Promise((resolve, reject) => {
  const server = createNetServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token, TIANYAN_STORY_STUDIO_RUNTIME_MODE: "combined-static", PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
let browser;
const actions = [];
try {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Synthetic mobile server exited early.");
    try { if ((await fetch(`${base}/__local/story-studio/bootstrap`)).ok) break; } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (attempt === 199) throw new Error("Synthetic mobile server did not start.");
  }
  if (evidence) await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("tianyan-mobile-template").waitFor();
  await page.getByRole("button", { name: "☰ 功能中心" }).click();
  await page.getByRole("button", { name: /天意 对话/u }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".mobile-tree-session").length === 2);
  assert.equal(await page.locator(".mobile-tree-session").count(), 2, "real Tianyi history remains below Tianyi");
  actions.push("手机目录：天意下显示旧 Session 与已绑定 Session");
  if (evidence) await page.screenshot({ path: path.join(evidence, "最终实现-目录-390x844.png") });
  await page.locator(".mobile-tree-session").filter({ hasText: "待选范围" }).click();
  await page.getByLabel("天意对话范围").waitFor();
  assert.equal(await page.getByLabel("天意对话范围").inputValue(), "", "old Session remains unbound");
  await page.getByText(/Bounded action/u).waitFor();
  const draft = "长文本草稿：".repeat(35);
  await page.getByRole("textbox", { name: "和天意对话" }).fill(draft);
  await page.getByRole("textbox", { name: "和天意对话" }).press("Shift+Enter");
  assert.match(await page.getByRole("textbox", { name: "和天意对话" }).inputValue(), /\n/u, "phone composer supports multiline keyboard entry");
  await page.getByRole("textbox", { name: "和天意对话" }).fill(draft);
  await page.reload();
  await page.waitForFunction((expected) => document.querySelector('textarea[aria-label="和天意对话"]')?.value === expected, draft);
  await page.getByText(/Bounded action/u).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "和天意对话" }).inputValue(), draft, "unsent draft survives refresh");
  actions.push("旧 Session 保留历史，未绑定范围；长草稿刷新后恢复");
  await page.getByRole("button", { name: "＋ 技能" }).click();
  await page.locator(".mobile-chat-skills").waitFor();
  await page.getByRole("button", { name: "＋ 技能" }).click();
  actions.push("手机技能浮层可开合；Shift+Enter 可输入长文本");
  if (evidence) await page.screenshot({ path: path.join(evidence, "最终实现-对话-390x844.png") });
  await page.getByRole("button", { name: "更多创作入口" }).click();
  await page.locator(".tianyi-workspace[data-tianyi-conversation-id]").waitFor();
  assert.equal(await page.locator(".tianyi-workspace").getAttribute("data-tianyi-conversation-id"), old.sessionId, "advanced author work keeps the same Session");
  if (evidence) await page.screenshot({ path: path.join(evidence, "最终实现-天意工作面-390x844.png") });
  await page.getByRole("button", { name: /返回/u }).click();
  assert.equal(await page.getByRole("textbox", { name: "和天意对话" }).inputValue(), draft, "advanced work return keeps draft");
  actions.push("高级创作工作面沿用同一 Session，返回仍保留对话草稿");
  await page.goto(`${base}/event-line`);
  const journey = page.getByTestId("event-line-journey");
  await journey.waitFor();
  assert.equal(await journey.locator(".event-journey-list > button").count(), 3, "three event lines visible");
  await journey.getByLabel("搜索事件线").fill("主线");
  await journey.getByRole("button", { name: /主线.*2 个单元/u }).click();
  assert.equal(await journey.getAttribute("data-level"), "line");
  actions.push("事件线管理 → 主线");
  await journey.getByRole("button", { name: /雨棚.*2 个关联节点/u }).click();
  assert.equal(await journey.getAttribute("data-level"), "unit");
  if (evidence) await page.screenshot({ path: path.join(evidence, "最终实现-单元-390x844.png") });
  actions.push("主线 → 雨棚单元");
  await journey.getByRole("button", { name: /主线节点/u }).click();
  assert.equal(await journey.getAttribute("data-level"), "node");
  await journey.getByText(/已有事件“主线节点”/u).waitFor();
  actions.push("雨棚 → 主线节点 → 正式详情（当前线正式事件正文）");
  if (evidence) await page.screenshot({ path: path.join(evidence, "最终实现-节点详情-390x844.png") });
  for (const level of ["unit", "line", "lines"]) {
    await page.getByRole("button", { name: /返回/u }).click();
    assert.equal(await journey.getAttribute("data-level"), level);
    actions.push(`逐层返回 → ${level}`);
  }
  assert.equal(await journey.getByLabel("搜索事件线").inputValue(), "主线", "return restores parent search");
  await journey.getByLabel("搜索事件线").fill("");
  await journey.getByRole("button", { name: /支线/u }).first().click();
  await journey.getByRole("button", { name: /雨棚/u }).click();
  await journey.getByRole("button", { name: /支线一节点/u }).click();
  await journey.getByText(/已有事件“支线一节点”/u).waitFor();
  assert.equal(await journey.getByText(/已有事件“主线节点”/u).count(), 0, "main event did not leak into branch line");
  actions.push("切到支线一节点：只显示支线一正文");
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "☰ 功能中心" }).click();
  await page.locator(".mobile-tree-session").filter({ hasText: "事件线" }).click();
  await page.waitForFunction((expected) => document.querySelector('select[aria-label="天意对话范围"]')?.value === expected, `branch.${branch.id}`);
  assert.equal(await page.getByLabel("天意对话范围").inputValue(), `branch.${branch.id}`, "bound Session scope survived navigation");
  await page.reload();
  await page.waitForFunction((expected) => document.querySelector('select[aria-label="天意对话范围"]')?.value === expected, `branch.${branch.id}`);
  assert.equal(await page.getByLabel("天意对话范围").inputValue(), `branch.${branch.id}`, "bound Session scope survived refresh");
  actions.push("已绑定 Session 的事件线范围在切页与刷新后不变");
  await page.goto(`${base}/settings`);
  await page.getByRole("button", { name: /Provider 与模型/u }).click();
  await page.getByText("Provider 配置", { exact: true }).waitFor();
  if (evidence) await page.screenshot({ path: path.join(evidence, "最终实现-设置-390x844.png") });
  actions.push("手机设置目录可打开既有 Provider 配置");
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${base}/event-line`);
  const desktopJourney = desktop.getByTestId("event-line-journey");
  await desktopJourney.waitFor();
  assert.equal(await desktopJourney.getAttribute("data-level"), "lines");
  if (evidence) await desktop.screenshot({ path: path.join(evidence, "最终实现-桌面事件线-1440x900.png") });
  await desktopJourney.getByRole("button", { name: /主线.*2 个单元/u }).click();
  await desktopJourney.getByRole("button", { name: /雨棚.*2 个关联节点/u }).click();
  await desktopJourney.getByRole("button", { name: /主线节点/u }).click();
  await desktopJourney.getByText(/已有事件“主线节点”/u).waitFor();
  if (evidence) await desktop.screenshot({ path: path.join(evidence, "最终实现-桌面节点详情-1440x900.png") });
  for (const level of ["unit", "line", "lines"]) { await desktop.goBack(); assert.equal(await desktopJourney.getAttribute("data-level"), level); }
  actions.push("桌面 1440×900：事件线→单元→正式详情与三级返回均可用");
  if (evidence) await writeFile(path.join(evidence, "操作记录.json"), JSON.stringify({ projectId, oldSessionId: old.sessionId, boundSessionId: bound.sessionId, workVersionId, actions }, null, 2));
  console.log(`mobile template scope E2E PASS: ${actions.length} recorded operations, three lines, two Sessions`);
} finally {
  await browser?.close();
  await terminateChildProcess(child, { label: "Synthetic mobile server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 }).catch(() => undefined);
  await rm(fixture, { recursive: true, force: true });
}
