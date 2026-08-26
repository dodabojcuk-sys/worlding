#!/usr/bin/env node

/**
 * Explicit, bounded real-Provider gate for the Tianyi Pi adapter.
 *
 * This script never accepts a credential argument and never prints a
 * credential. It only uses the already persisted Provider credential owned by
 * the local Tianyan server. Ordinary tests and fixture runs do not invoke it.
 * When the credential projection is unavailable, every live gate is reported
 * as pending rather than being converted into a false pass.
 */

const baseUrl = normalizeBaseUrl(process.env.TIANYAN_PROVIDER_GATE_BASE_URL || "http://127.0.0.1:4192");
const explicitlyConfirmed = process.argv.includes("--confirm-real-provider");

const sessionResponse = await fetch(`${baseUrl}/__local/story-studio/storage/session`, { headers: { origin: baseUrl } });
if (!sessionResponse.ok) throw new Error(`本地服务未就绪（HTTP ${sessionResponse.status}）。`);
const cookie = sessionResponse.headers.get("set-cookie") || "";
const headers = { cookie, origin: baseUrl, "content-type": "application/json" };
const status = await requestJson("GET", "model-service/status", headers);
const profile = status.data?.profile || null;
const common = {
  provider: "siliconflow",
  configured: profile?.credential?.configured === true,
  profileRevision: profile?.revision ?? null,
  realProviderCalls: 0,
  realProviderRetries: 0
};

if (!explicitlyConfirmed) {
  printResult({
    verdict: "REAL_PI_AGENT_GATE_NOT_STARTED_CONFIRMATION_REQUIRED",
    ...common,
    gates: pendingGates("需要显式确认；本次没有发起真实调用。"),
    next: "在确认可能产生费用后，以 --confirm-real-provider 重新运行；不要把 API Key 传给命令。"
  });
  process.exit(0);
}

if (!common.configured) {
  printResult({
    verdict: "REAL_PI_AGENT_GATE_BLOCKED_LOCAL_CREDENTIAL_UNAVAILABLE",
    ...common,
    gates: pendingGates("现有 Provider 凭据投影不可用；原话、夹具和 UI 不受影响。"),
    next: "请先在设置 → AI / Provider 手动保存凭据，然后重新运行本门禁。"
  });
  process.exit(0);
}

let calls = 0;
let connection = null;
let inference = null;
try {
  calls += 1;
  connection = await requestJson("POST", "model-service/test", headers);
} catch (error) {
  printResult({
    verdict: "REAL_PI_AGENT_GATE_A_FAIL",
    ...common,
    realProviderCalls: calls,
    gates: { A: "FAIL", B: "NOT_RUN", C: "NOT_RUN", D: "NOT_RUN", E: "NOT_RUN" },
    error: safeError(error)
  });
  process.exit(1);
}

try {
  calls += 1;
  inference = await requestJson("POST", "model-service/minimal-inference", headers);
} catch (error) {
  printResult({
    verdict: "REAL_PI_AGENT_GATE_B_FAIL",
    ...common,
    realProviderCalls: calls,
    gates: { A: "PASS", B: "FAIL", C: "NOT_RUN", D: "NOT_RUN", E: "NOT_RUN" },
    connection: summarizeConnection(connection.data),
    error: safeError(error)
  });
  process.exit(1);
}

printResult({
  verdict: "REAL_PI_AGENT_GATE_A_B_PASS_C_D_E_MANUAL_REQUIRED",
  ...common,
  realProviderCalls: calls,
  gates: { A: "PASS", B: "PASS", C: "MANUAL_REQUIRED", D: "MANUAL_REQUIRED", E: "MANUAL_REQUIRED" },
  connection: summarizeConnection(connection.data),
  minimalInference: summarizeInference(inference.data),
  note: "C/D/E 必须在隔离 fixture Session 上由作者确认后执行；本脚本不会把真实项目或候选写入默认目录。"
});

function pendingGates(reason) {
  return { A: `NOT_RUN_PENDING_CREDENTIAL:${reason}`, B: `NOT_RUN_PENDING_CREDENTIAL:${reason}`, C: `NOT_RUN_PENDING_CREDENTIAL:${reason}`, D: `NOT_RUN_PENDING_CREDENTIAL:${reason}`, E: `NOT_RUN_PENDING_CREDENTIAL:${reason}` };
}

function normalizeBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/$/u, "");
  let parsed;
  try { parsed = new URL(normalized); } catch { throw new Error("本地服务 URL 无效。"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("本地服务 URL 必须使用 HTTP(S)。");
  return normalized;
}

async function requestJson(method, route, requestHeaders) {
  const response = await fetch(`${baseUrl}/__local/story-studio/${route}`, {
    method,
    headers: requestHeaders,
    body: method === "POST" ? "{}" : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `本地服务请求失败（HTTP ${response.status}）。`);
  return payload;
}

function summarizeConnection(data) {
  return { gate: data?.gate || null, providerId: data?.providerId || null, modelId: data?.modelId || null, availableModelCount: Number.isInteger(data?.availableModelCount) ? data.availableModelCount : null };
}

function summarizeInference(data) {
  return { gate: data?.gate || null, modelId: data?.modelId || null, finishReason: data?.finishReason || null, usage: data?.usage || null, traceIdPresent: typeof data?.traceId === "string" && data.traceId.length > 0, contentLength: typeof data?.content === "string" ? data.content.length : 0 };
}

function safeError(error) { return error instanceof Error ? error.message.replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 240) : "Provider 门禁失败。"; }
function printResult(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
