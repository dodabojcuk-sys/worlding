#!/usr/bin/env node

/**
 * Explicit, independently runnable Nuwa API exercise.
 *
 * It intentionally talks only to the Story Studio host.  The host owns the
 * local session, Pi adapter, Provider credentials, budget reservations and
 * durable Nuwa receipts; this script never reads or writes a credential and
 * never sends a raw chat request to a Provider.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const startedAt = new Date().toISOString();
const taskId = `nuwa-api-test.${randomUUID()}`;
const baseUrl = String(process.env.TIANYAN_NUWA_API_TEST_BASE_URL || "http://127.0.0.1:4192/__local/story-studio").replace(/\/$/u, "");
let projectId = String(process.env.TIANYAN_NUWA_API_TEST_PROJECT_ID || "").trim();
const createIsolatedFixture = process.env.TIANYAN_NUWA_API_TEST_CREATE_ISOLATED_FIXTURE === "1";
const outputPath = path.resolve(process.env.TIANYAN_NUWA_API_TEST_OUTPUT || path.join("data", "api-test-runs", `${taskId}.json`));
const confirmed = process.argv.includes("--confirm-real-provider");
const noProgressTimeoutMs = positiveInteger(process.env.TIANYAN_NUWA_API_TEST_NO_PROGRESS_TIMEOUT_MS, 90_000, "TIANYAN_NUWA_API_TEST_NO_PROGRESS_TIMEOUT_MS");
const maxDispatches = boundedInteger(process.env.TIANYAN_NUWA_API_TEST_MAX_PROVIDER_DISPATCHES, 12, 1, 12, "TIANYAN_NUWA_API_TEST_MAX_PROVIDER_DISPATCHES");

const result = {
  version: "tianyan-nuwa-real-api-runner-r0/v1",
  taskId,
  codeSha: await currentCodeSha(),
  startedAt,
  finishedAt: null,
  host: baseUrl,
  isolation: { projectId: projectId || null, required: true, createdByThisScript: false },
  stage: "starting",
  latestProgress: "尚未向本地宿主发起请求。",
  status: "unknown",
  exitCode: 1,
  provider: { profileId: null, providerId: null, modelId: null },
  budget: { maxProviderDispatches: maxDispatches, providerDispatches: 0, usage: null },
  run: { runId: null, status: null, receiptIds: [] },
  artifacts: { resultPath: outputPath, hostReceiptPaths: [] },
  firstFailure: null
};

try {
  if (!confirmed) {
    finish("not-started-confirmation-required", 0, "需要显式 --confirm-real-provider；未访问本地宿主，也没有发送模型请求。");
  } else if (!projectId && !createIsolatedFixture) {
    finish("external-condition-missing", 0, "缺少 TIANYAN_NUWA_API_TEST_PROJECT_ID；请指定专用于这次测试的隔离作品。", "missing-isolated-project-id");
  } else {
    result.stage = "checking-host";
    result.latestProgress = "检查本地 Story Studio API 健康状态。";
    const health = await getJson("/health");
    if (health?.status !== "healthy") throw new Error("本地 Story Studio API 健康响应无效。");

    const session = await openLocalSession();
    if (createIsolatedFixture) {
      if (projectId) throw new Error("自动建立隔离样例时不能同时指定既有项目；避免误写作者作品。");
      projectId = await createIsolatedStoryFixture(session);
      result.isolation.projectId = projectId;
      result.isolation.createdByThisScript = true;
      result.latestProgress = "已通过正式宿主入口建立隔离作品、角色与故事单元。";
    }
    const modelStatus = await getJson("/model-service/status", session);
    result.provider = providerIdentityFromStatus(modelStatus);
    result.stage = "checking-nuwa-availability";
    result.latestProgress = "已读取当前非秘密 Provider 实例与模型，继续检查女娲运行能力。";
    const bootstrap = await getJson(`/nuwa-n1/bootstrap?projectId=${encodeURIComponent(projectId)}`);
    const availability = bootstrap?.availability || null;
    if (!availability || availability.kind === "unavailable" || availability.kind === "local-fake") {
      finish("external-condition-missing", 0, availability?.label || "女娲真实 Provider/Pi 链路未配置。", "nuwa-provider-or-pi-unavailable");
    } else if (!Array.isArray(bootstrap.participants) || bootstrap.participants.length < 2 || !Array.isArray(bootstrap.storyUnits) || bootstrap.storyUnits.length === 0) {
      finish("external-condition-missing", 0, "隔离作品缺少至少两位正式角色或一个 Story Unit；没有建立 Run。", "isolated-story-fixture-incomplete");
    } else {
      // The host derives the selected Provider identity and enforces its own
      // lower budget.  The script never attempts a second run or retry.
      result.stage = "creating-run";
      result.latestProgress = "通过女娲宿主创建一次有界 Run。";
      const operationId = `api-test.${taskId}`;
      const created = await postJson("/nuwa-n1/create", {
        projectId,
        participants: bootstrap.participants.slice(0, 3),
        storyUnit: bootstrap.storyUnits[0],
        goal: "在已授权、可追溯的事实上排演北闸与铜钥匙的下一步；不向未获知角色泄露私下信息。",
        operationId
      }, session);
      const run = created?.run || created;
      if (!run?.runId) throw new Error("女娲创建响应缺少 Run 身份。");
      result.run.runId = run.runId;
      result.run.status = run.status || run.lifecycle || null;

      result.stage = "running";
      result.latestProgress = "执行一次连续女娲 Run；无进展将由请求超时终止并保存现场。";
      const completed = await postJson("/nuwa-n1/continuous", {
        projectId,
        runId: run.runId,
        expectedRevision: Number(run.revision),
        operationId: `${operationId}.continuous`
      }, session);
      const finalRun = completed?.run || completed;
      const dispatches = Number(finalRun?.providerDispatches ?? 0);
      if (!Number.isInteger(dispatches) || dispatches < 0 || dispatches > maxDispatches) throw new Error(`Provider dispatch budget violation: ${String(finalRun?.providerDispatches)} > ${maxDispatches}.`);
      result.budget.providerDispatches = dispatches;
      result.budget.usage = finalRun?.usage ?? null;
      result.run.status = finalRun?.status || finalRun?.lifecycle || result.run.status;
      result.run.receiptIds = Array.isArray(finalRun?.dispatches)
        ? finalRun.dispatches.map((item) => item?.receiptEnvelopeId).filter((item) => typeof item === "string")
        : [];
      result.provider = providerIdentity(finalRun);
      if (dispatches === 0 || result.run.status === "blocked") {
        finish("external-condition-missing", 0, "女娲 Run 在真实 Provider 发送前被阻断；已保存隔离样例与宿主状态。", "nuwa-run-blocked-before-provider-dispatch");
      } else {
        finish("completed", 0, "女娲 API Run 已结束；结果仅来自宿主返回的回执投影。" );
      }
    }
  }
} catch (error) {
  finish("failed", 1, "测试入口已保存首个失败信息。", safeError(error));
} finally {
  result.finishedAt = new Date().toISOString();
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ taskId: result.taskId, status: result.status, stage: result.stage, providerDispatches: result.budget.providerDispatches, resultPath: outputPath, exitCode: result.exitCode }, null, 2)}\n`);
  process.exitCode = result.exitCode;
}

function finish(status, exitCode, progress, failure = null) {
  result.status = status;
  result.exitCode = exitCode;
  result.stage = status === "completed" ? "finished" : result.stage;
  result.latestProgress = progress;
  result.firstFailure = failure;
}

async function getJson(endpoint, cookie = "") {
  const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, { headers: { accept: "application/json", origin: originFor(baseUrl), ...(cookie ? { cookie } : {}) } });
  return readResponse(response);
}

async function openLocalSession() {
  const response = await fetchWithTimeout(`${baseUrl}/storage/session`, { headers: { accept: "application/json", origin: originFor(baseUrl) } });
  await readResponse(response);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] || "";
  if (!cookie.startsWith("story_studio_local_session=")) throw new Error("本地宿主没有建立受控会话；未创建 Run。");
  return cookie;
}

async function postJson(endpoint, body, cookie) {
  const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", origin: originFor(baseUrl), cookie },
    body: JSON.stringify(body)
  });
  return readResponse(response);
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("no-progress-timeout")), noProgressTimeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function readResponse(response) {
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* The details are intentionally not persisted. */ }
  if (!response.ok) throw new Error(`host-http-${response.status}: ${safeError(payload?.error || payload?.message || "本地宿主拒绝请求")}`);
  return payload?.data ?? payload;
}

function providerIdentity(run) {
  const profile = run?.providerDispatchEvidence?.find?.((item) => item?.provider)?.provider || run?.dispatches?.find?.((item) => item?.provider)?.provider || null;
  return { profileId: profile?.profileId || null, providerId: profile?.providerId || null, modelId: profile?.modelId || null };
}

function providerIdentityFromStatus(status) {
  const profile = status?.profile?.profile || null;
  return { profileId: profile?.id || profile?.providerInstanceId || null, providerId: profile?.provider || null, modelId: profile?.modelId || null };
}

async function createIsolatedStoryFixture(cookie) {
  const suffix = taskId.slice(-12).replace(/[^a-z0-9]/giu, "").toLowerCase();
  const project = await postJson("/projects/create", { title: `API 隔离样例 · 北闸铜钥匙 ${suffix}`, folderSlug: `api-nuwa-${suffix}` }, cookie);
  const fixtureProjectId = String(project?.id || "").trim();
  if (!fixtureProjectId) throw new Error("隔离项目创建响应缺少项目身份。");
  const characters = await Promise.all([
    ["阿芜", "守住北闸的秘密，只向林昭说明封闸。"],
    ["林昭", "根据已获知的消息寻找替代路线。"],
    ["陆衍", "只按仓库职责行动，不知道私下说法。"]
  ].map(async ([title, body]) => postJson("/world-objects/create", { projectId: fixtureProjectId, type: "character", title, body, status: "active", tags: ["API 隔离样例"] }, cookie)));
  await postJson("/story-units/create", {
    projectId: fixtureProjectId,
    title: "北闸与铜钥匙",
    summary: "阿芜仅向林昭传递北闸已封的消息；铜钥匙的去向需要在正式动作中决定。",
    linkedEntityIds: characters.map((character) => character.id),
    items: [], sourceRefs: [], unresolvedQuestionIds: ["key-holder"]
  }, cookie);
  return fixtureProjectId;
}

function originFor(url) { return new URL(url).origin; }
function positiveInteger(raw, fallback, name) { const value = raw === undefined ? fallback : Number(raw); if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) throw new Error(`${name} must be an integer between 1 and 300000.`); return value; }
function boundedInteger(raw, fallback, min, max, name) { const value = raw === undefined ? fallback : Number(raw); if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`); return value; }
function safeError(value) { return String(value instanceof Error ? value.message : value || "unknown-error").replace(/Bearer\s+[^\s]+/giu, "Bearer [redacted]").replace(/[A-Za-z0-9_-]{32,}/gu, "[redacted]").slice(0, 280); }
async function currentCodeSha() { try { const output = await (await import("node:child_process")).execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }); return output.trim(); } catch { return createHash("sha256").update(process.cwd()).digest("hex"); } }
