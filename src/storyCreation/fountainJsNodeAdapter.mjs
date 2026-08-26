import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createFountainJsAdapterPlugin } from "./fountainJsAdapter.ts";

const FOUNTAIN_HOST_SCRIPT = [
  "const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));",
  "const loaded = require(input.modulePath);",
  "const Fountain = loaded.Fountain || loaded.default?.Fountain;",
  "if (typeof Fountain !== 'function') throw new Error('Fountain.js Fountain export is unavailable.');",
  "const parsed = new Fountain().parse(input.source, true);",
  "process.stdout.write(JSON.stringify({ html: parsed?.html?.script || '', tokenCount: Array.isArray(parsed?.tokens) ? parsed.tokens.length : 0 }));"
].join("\n");

export function createFountainJsNodeAdapter(options = {}) {
  const modulePath = String(options.modulePath || process.env.TIANYAN_FOUNTAIN_JS_MODULE || "").trim();
  const nodeExecutable = String(options.nodeExecutable || process.execPath).trim();
  const moduleConfigured = Boolean(modulePath);
  const moduleAvailable = path.isAbsolute(modulePath) && existsSync(modulePath);
  const executableAvailable = path.isAbsolute(nodeExecutable) && existsSync(nodeExecutable);
  const parser = moduleAvailable && executableAvailable ? createFountainJsParser({ modulePath, nodeExecutable, maxOutputBytes: options.maxOutputBytes }) : undefined;
  const plugin = createFountainJsAdapterPlugin({ parser, adapterVersion: options.adapterVersion });
  if (!moduleConfigured) return plugin;
  if (moduleAvailable && executableAvailable) return plugin;
  return {
    ...plugin,
    descriptor: {
      ...plugin.descriptor,
      availability: "misconfigured",
      health: "unhealthy",
      requirementSummary: !moduleAvailable
        ? "需要可读取的绝对 Fountain.js 模块路径；当前配置不存在。"
        : "需要可执行的 Node.js 绝对路径；当前配置不可用。"
    },
    execute: undefined
  };
}

function createFountainJsParser(options) {
  return async function parseWithExternalFountainJs(input) {
    if (!path.isAbsolute(options.modulePath) || !existsSync(options.modulePath)) {
      return { status: "failed", stderrSummary: "Fountain.js module path is unavailable.", errorReceipt: { code: "unavailable", message: "Fountain.js module path is unavailable.", retryable: false } };
    }
    if (!path.isAbsolute(options.nodeExecutable) || !existsSync(options.nodeExecutable)) {
      return { status: "failed", stderrSummary: "Node executable is unavailable.", errorReceipt: { code: "unavailable", message: "Node executable is unavailable.", retryable: false } };
    }
    const stagingDir = mkdtempSync(path.join(os.tmpdir(), "tianyan-fountain-adapter-"));
    const timeoutMs = Math.min(300_000, Math.max(250, Math.floor(Number(input.timeoutMs) || 30_000)));
    const maxOutputBytes = Math.min(4 * 1024 * 1024, Math.max(16 * 1024, options.maxOutputBytes || 512 * 1024));
    const child = spawn(options.nodeExecutable, ["--input-type=commonjs", "-e", FOUNTAIN_HOST_SCRIPT], {
      cwd: stagingDir,
      shell: false,
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        HOME: stagingDir,
        NODE_ENV: "production"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let outputLimitExceeded = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (input.signal) input.signal.removeEventListener("abort", abort);
      try { rmSync(stagingDir, { recursive: true, force: true }); } catch { /* isolated temp cleanup is best effort */ }
      result.stdoutSummary = result.stdoutSummary || (stdout ? `Fountain.js host returned ${Buffer.byteLength(stdout, "utf8")} bytes.` : "");
      result.stderrSummary = result.stderrSummary || stderr.slice(0, 2_000);
      return result;
    };
    const abort = () => {
      cancelled = true;
      child.kill("SIGTERM");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    if (input.signal) {
      if (input.signal.aborted) abort();
      else input.signal.addEventListener("abort", abort, { once: true });
    }
    const append = (target, chunk) => {
      if (outputLimitExceeded) return target;
      const next = target + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill("SIGTERM");
        return next.slice(0, maxOutputBytes);
      }
      return next;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const result = await new Promise((resolve) => {
      child.once("error", (error) => resolve(finish({ status: "failed", errorReceipt: { code: error.code === "ENOENT" ? "unavailable" : "failed", message: error.code === "ENOENT" ? "Fountain.js host executable is unavailable." : "Fountain.js host process failed.", retryable: error.code !== "ENOENT" } })));
      child.once("close", (code, signal) => {
        if (cancelled) return resolve(finish({ status: "cancelled", errorReceipt: { code: "cancelled", message: "Fountain.js adapter was cancelled.", retryable: false } }));
        if (timedOut) return resolve(finish({ status: "timeout", errorReceipt: { code: "timeout", message: "Fountain.js adapter timed out.", retryable: true } }));
        if (outputLimitExceeded) return resolve(finish({ status: "failed", errorReceipt: { code: "security", message: "Fountain.js output exceeded the configured limit.", retryable: false } }));
        if (code !== 0) return resolve(finish({ status: "failed", errorReceipt: { code: "failed", message: `Fountain.js host exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}.`, retryable: true } }));
        try {
          const parsed = JSON.parse(stdout);
          resolve(finish({ status: "succeeded", html: typeof parsed.html === "string" ? parsed.html : "", tokenCount: Number.isFinite(parsed.tokenCount) ? parsed.tokenCount : 0 }));
        } catch {
          resolve(finish({ status: "failed", errorReceipt: { code: "failed", message: "Fountain.js host returned malformed JSON.", retryable: true } }));
        }
      });
      // A bounded external process may exit before the request reaches stdin.
      // Swallow that transport-level EPIPE so the host exit receipt remains the
      // authoritative failure instead of leaking an uncaught stream error.
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ modulePath: options.modulePath, source: input.fountainSource }));
    });
    return result;
  };
}
