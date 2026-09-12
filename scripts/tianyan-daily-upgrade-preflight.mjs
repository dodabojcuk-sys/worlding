import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statfsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertCanonicalRuntime } from "./canonical-runtime.mjs";

assertCanonicalRuntime();

const expectedTargetSha = requiredEnvironment("TIANYAN_UPGRADE_TARGET_SHA");
const expectedCurrentSha = requiredEnvironment("TIANYAN_UPGRADE_CURRENT_SHA");
const dataRoot = existingDirectory(process.env.TIANYAN_UPGRADE_DATA_ROOT || path.join(os.homedir(), "WorldOS"), "作品数据根");
const providerRoot = existingDirectory(process.env.TIANYAN_UPGRADE_PROVIDER_ROOT || path.join(os.homedir(), "Library", "Application Support", "Tianyan"), "Provider 配置根");
const backupRoot = existingDirectory(requiredEnvironment("TIANYAN_UPGRADE_BACKUP_ROOT"), "升级备份根");
const apiUrl = new URL(process.env.TIANYAN_UPGRADE_API_URL || "http://127.0.0.1:4192/__local/story-studio/health");
const currentHead = git("rev-parse", "HEAD");
const failures = [];

if (currentHead !== expectedTargetSha) failures.push(`候选工作树 HEAD ${currentHead} 不等于固定目标 ${expectedTargetSha}。`);
if (isWithin(backupRoot, dataRoot) || isWithin(backupRoot, providerRoot)) failures.push("备份根必须位于作品根与 Provider 配置根之外。");

const statePath = path.join(dataRoot, ".story-studio", "state.json");
const state = readJson(statePath, "Story Studio 状态文件");
if (state.version !== "story-studio-state/v1") failures.push(`Story Studio 状态版本不受预检支持：${String(state.version || "missing")}。`);
const projectIds = Array.isArray(state.recentProjects) ? state.recentProjects.filter((value) => typeof value === "string") : [];
if (typeof state.activeProject === "string" && !projectIds.includes(state.activeProject)) failures.push("当前作品不在最近作品清单中。");
const missingProjects = projectIds.filter((projectId) => !existsSync(path.join(dataRoot, projectId, "project.md")));
if (missingProjects.length) failures.push(`有 ${missingProjects.length} 个登记作品缺少 project.md。`);

const dataFiles = walkFiles(dataRoot);
const providerFiles = walkFiles(providerRoot);
const locks = dataFiles.filter((file) => /(?:^|[/\\])[^/\\]*\.lock$/u.test(file));
const activeRecords = findActiveRuntimeRecords(dataFiles);
if (locks.length) failures.push(`发现 ${locks.length} 个锁文件；切换前必须确认其来源。`);
if (activeRecords.length) failures.push(`发现 ${activeRecords.length} 个进行中运行记录；切换前不得停止服务。`);

const recentCutoff = Date.now() - 120_000;
const recentWrites = dataFiles.filter((file) => statSync(file).mtimeMs >= recentCutoff);
if (recentWrites.length) failures.push(`作品根最近 120 秒有 ${recentWrites.length} 个文件变化；请等待任务静止后重跑。`);

const requiredBytes = Math.max(512 * 1024 * 1024, (treeBytes(dataFiles) + treeBytes(providerFiles)) * 3);
const filesystem = statfsSync(backupRoot);
const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
if (availableBytes < requiredBytes) failures.push(`备份盘可用空间不足：需要至少 ${requiredBytes} 字节。`);

let liveHealth = null;
try {
  const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  liveHealth = (await response.json())?.data ?? null;
  if (liveHealth?.status !== "healthy") failures.push("日常 API 未返回 healthy。");
  if (liveHealth?.codeRevision !== expectedCurrentSha) failures.push(`日常 API 版本 ${String(liveHealth?.codeRevision || "missing")} 不等于预期当前版本 ${expectedCurrentSha}。`);
} catch (error) {
  failures.push(`日常 API 健康检查失败：${error instanceof Error ? error.message : String(error)}。`);
}

const listeners = listenerSummary([4191, 4192]);
for (const port of [4191, 4192]) if (!listeners.some((item) => item.port === port)) failures.push(`端口 ${port} 当前没有监听进程。`);

const result = {
  version: "tianyan-daily-upgrade-preflight/v1",
  checkedAt: new Date().toISOString(),
  result: failures.length ? "blocked" : "ready-for-confirmed-cutover",
  target: { sha: currentHead, expectedSha: expectedTargetSha },
  live: { expectedSha: expectedCurrentSha, health: liveHealth, listeners },
  storage: {
    dataRoot,
    providerRoot,
    backupRoot,
    projectCount: projectIds.length,
    activeProjectRegistered: typeof state.activeProject === "string" && projectIds.includes(state.activeProject),
    dataFileCount: dataFiles.length,
    providerFileCount: providerFiles.length,
    recentWriteCount: recentWrites.length,
    lockCount: locks.length,
    activeRuntimeRecordCount: activeRecords.length,
    availableBytes,
    requiredBytes
  },
  runtime: { node: process.version },
  failures
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 2;

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function existingDirectory(value, label) {
  const resolved = realpathSync(path.resolve(value));
  if (!lstatSync(resolved).isDirectory()) throw new Error(`${label}不是目录。`);
  return resolved;
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`${label}无法读取：${error instanceof Error ? error.message : String(error)}`); }
}

function walkFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`受保护数据根中存在符号链接，预检拒绝跟随：${target}`);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files.sort();
}

function treeBytes(files) {
  return files.reduce((sum, file) => sum + statSync(file).size, 0);
}

function findActiveRuntimeRecords(files) {
  const activeValues = new Set(["running", "pending", "streaming", "executing", "in-progress"]);
  const matches = [];
  for (const file of files) {
    if (!file.endsWith(".json") || statSync(file).size > 2 * 1024 * 1024) continue;
    let value;
    try { value = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    if (containsActiveState(value, activeValues)) matches.push(file);
  }
  return matches;
}

function containsActiveState(value, activeValues) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsActiveState(item, activeValues));
  for (const [key, child] of Object.entries(value)) {
    if (["status", "state", "lifecycleStatus"].includes(key) && typeof child === "string" && activeValues.has(child.toLowerCase())) return true;
    if (containsActiveState(child, activeValues)) return true;
  }
  return false;
}

function listenerSummary(ports) {
  let output = "";
  try { output = execFileSync("ss", ["-ltnpH"], { encoding: "utf8" }); } catch { return []; }
  const rows = [];
  for (const line of output.split("\n")) {
    const address = line.trim().split(/\s+/u)[3] || "";
    const port = Number(address.match(/:(\d+)$/u)?.[1]);
    if (!ports.includes(port)) continue;
    const pid = Number(line.match(/pid=(\d+)/u)?.[1]);
    rows.push({ port, pid: Number.isInteger(pid) ? pid : null });
  }
  return rows;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
