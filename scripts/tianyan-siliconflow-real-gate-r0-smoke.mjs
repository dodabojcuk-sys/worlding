#!/usr/bin/env node

/**
 * Explicit, manual real-Provider smoke gate.
 *
 * This command never accepts a credential argument or reads a credential from
 * the shell. The author must save the key in Settings → AI / Provider first.
 * Without --confirm-real-provider it performs only a non-sensitive preflight.
 */

const baseUrl = normalizeBaseUrl(process.env.TIANYAN_PROVIDER_GATE_BASE_URL || "http://127.0.0.1:4192");
const explicitlyConfirmed = process.argv.includes("--confirm-real-provider");

const session = await fetch(`${baseUrl}/__local/story-studio/storage/session`, {
  headers: { origin: baseUrl }
});
if (!session.ok) throw new Error(`本地服务未就绪（HTTP ${session.status}）。`);
const cookie = session.headers.get("set-cookie") || "";
const headers = { cookie, origin: baseUrl, "content-type": "application/json" };
const status = await requestJson("GET", "model-service/status", headers);
const profile = status.data?.profile || null;

if (!explicitlyConfirmed) {
  printResult({
    verdict: "REAL_GATE_NOT_STARTED_CONFIRMATION_REQUIRED",
    provider: "siliconflow",
    configured: profile?.credential?.configured === true,
    profileRevision: profile?.revision ?? null,
    realProviderCalls: 0,
    next: "在确认可能产生费用后，以 --confirm-real-provider 重新运行；不要把 API Key 传给命令。"
  });
  process.exit(0);
}

if (profile?.credential?.configured !== true) {
  printResult({
    verdict: "TECHNICALLY_PASS_REAL_SILICONFLOW_GATE_PENDING_USER_CREDENTIAL",
    provider: "siliconflow",
    configured: false,
    realProviderCalls: 0,
    next: "请先在设置 → AI / Provider 手动保存 API Key；本命令不会读取或接收 Key。"
  });
  process.exit(0);
}
if (profile.profile?.enabled === false) {
  printResult({ verdict: "REAL_GATE_BLOCKED_PROVIDER_DISABLED", provider: "siliconflow", realProviderCalls: 0 });
  process.exit(1);
}

let connection;
try {
  connection = await requestJson("POST", "model-service/test", headers);
} catch (error) {
  printResult({ verdict: "REAL_GATE_A_FAIL", provider: "siliconflow", realProviderCalls: 1, error: safeError(error) });
  process.exit(1);
}

let inference;
try {
  inference = await requestJson("POST", "model-service/minimal-inference", headers);
} catch (error) {
  printResult({
    verdict: "REAL_GATE_B_FAIL",
    provider: "siliconflow",
    connection: summarizeConnection(connection.data),
    realProviderCalls: 2,
    error: safeError(error)
  });
  process.exit(1);
}

printResult({
  verdict: "REAL_GATE_A_B_PASS_CREATIVE_GATE_C_MANUAL_REQUIRED",
  provider: "siliconflow",
  connection: summarizeConnection(connection.data),
  minimalInference: summarizeInference(inference.data),
  realProviderCalls: 2,
  creativeGate: "manual Creative fixture session required; this command does not write a project or bypass author review"
});

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
  return {
    gate: data?.gate || null,
    providerId: data?.providerId || null,
    modelId: data?.modelId || null,
    availableModelCount: Number.isInteger(data?.availableModelCount) ? data.availableModelCount : null
  };
}

function summarizeInference(data) {
  return {
    gate: data?.gate || null,
    modelId: data?.modelId || null,
    finishReason: data?.finishReason || null,
    usage: data?.usage || null,
    traceIdPresent: typeof data?.traceId === "string" && data.traceId.length > 0,
    contentLength: typeof data?.content === "string" ? data.content.length : 0
  };
}

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 240) : "Provider 门禁失败。";
}

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
