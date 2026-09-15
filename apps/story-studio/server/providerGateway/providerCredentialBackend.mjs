import { accessSync, chmodSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, openSync, fsyncSync, closeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { defaultProviderAppDataRoot } from "./providerAppDataRoot.mjs";

export { defaultProviderAppDataRoot } from "./providerAppDataRoot.mjs";

const MAXIMUM_CREDENTIAL_CHARACTERS = 512;
const DEFAULT_KEYCHAIN_SERVICE = "com.tianyan.story-studio.provider";
const DEFAULT_KEYCHAIN_ACCOUNT = "siliconflow.default";

/**
 * Credential storage is deliberately kept behind a synchronous, server-only
 * interface because the existing Provider adapter reads credentials during a
 * request without changing its model-call ownership.
 */
export function createSessionMemoryCredentialBackend() {
  let value = "";
  return Object.freeze({
    kind: "process-memory",
    configured() { return value.length > 0; },
    read() { return value; },
    write(next) { value = validateCredential(next); },
    clear() { value = ""; }
  });
}

export function createDisabledCredentialBackend() {
  const unavailable = () => { throw credentialBackendError("provider-disabled"); };
  return Object.freeze({
    kind: "disabled",
    configured() { return false; },
    read() { return ""; },
    write: unavailable,
    clear: unavailable
  });
}

export function createMacKeychainCredentialBackend(options = {}) {
  const commandPath = options.commandPath || "/usr/bin/security";
  const promptCommandPath = options.promptCommandPath || "/usr/bin/expect";
  const service = options.service || DEFAULT_KEYCHAIN_SERVICE;
  const account = options.account || DEFAULT_KEYCHAIN_ACCOUNT;
  const run = options.spawnSyncImpl || spawnSync;
  const promptRun = options.promptRunImpl || run;

  function invoke(args, input = undefined) {
    const result = run(commandPath, args, {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (result?.error) throw credentialBackendError("keychain-unavailable");
    return result || { status: 1, stdout: "", stderr: "" };
  }

  function writeWithPrompt(credential) {
    // `security -w` only prompts reliably from a TTY. A plain pipe exits
    // successfully while storing an empty password, so use expect to provide
    // a pseudo-terminal. The credential is sent only on stdin to expect and
    // never appears in argv, the environment, or logs.
    const result = promptRun(promptCommandPath, ["-c", buildKeychainPromptScript({ commandPath, account, service })], {
      input: `${credential}\n`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (result?.error || result?.status !== 0) throw credentialBackendError("keychain-write-failed");
  }

  return Object.freeze({
    kind: "macos-keychain",
    configured() { return invoke(["find-generic-password", "-a", account, "-s", service]).status === 0; },
    read() {
      const result = invoke(["find-generic-password", "-a", account, "-s", service, "-w"]);
      if (result.status !== 0) return "";
      return validateStoredCredential(result.stdout || "", { allowEmpty: true });
    },
    write(value) {
      const credential = validateCredential(value);
      writeWithPrompt(credential);
    },
    clear() {
      const result = invoke(["delete-generic-password", "-a", account, "-s", service]);
      if (result.status !== 0 && !/could not be found|SecKeychainSearchCopyNext/iu.test(String(result.stderr || ""))) {
        throw credentialBackendError("keychain-clear-failed");
      }
    }
  });
}

function buildKeychainPromptScript({ commandPath, account, service }) {
  const tclQuote = (value) => `"${String(value)
    .replace(/\\/gu, "\\\\")
    .replace(/\$/gu, "\\$")
    .replace(/"/gu, "\\\"")
    .replace(/\[/gu, "\\[")
    .replace(/\]/gu, "\\]")
    .replace(/\r/gu, "\\r")
    .replace(/\n/gu, "\\n")}"`;
  return [
    "log_user 0",
    "set timeout 15",
    `spawn ${tclQuote(commandPath)} add-generic-password -a ${tclQuote(account)} -s ${tclQuote(service)} -U -w`,
    "expect -re {password data for new item:}",
    "if {[gets stdin password] < 0} { exit 126 }",
    "send -- \"$password\\r\"",
    "expect -re {retype password for new item:}",
    "send -- \"$password\\r\"",
    "expect eof",
    "catch wait result",
    "exit [lindex $result 3]"
  ].join("\n");
}

export function createLocalFileDevelopmentCredentialBackend(options = {}) {
  const fsImpl = options.fsImpl || {
    existsSync,
    mkdirSync,
    chmodSync,
    readFileSync,
    writeFileSync,
    renameSync,
    unlinkSync,
    openSync,
    fsyncSync,
    closeSync
  };
  const credentialRef = safeCredentialRef(options.credentialRef || DEFAULT_KEYCHAIN_ACCOUNT);
  const filePath = path.resolve(options.filePath || path.join(options.appDataRoot || defaultProviderAppDataRoot(), "credentials", `${credentialRef}.credential`));

  function ensureParent() {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    try { fsImpl.chmodSync(path.dirname(filePath), 0o700); } catch { /* best effort on test filesystems */ }
  }

  return Object.freeze({
    kind: "local-file-development-only",
    filePath,
    configured() { return fsImpl.existsSync(filePath); },
    read() {
      if (!fsImpl.existsSync(filePath)) return "";
      let source;
      try { source = fsImpl.readFileSync(filePath, "utf8"); } catch { throw credentialBackendError("credential-read-failed"); }
      return validateStoredCredential(source, { allowEmpty: true });
    },
    write(value) {
      const credential = validateCredential(value);
      ensureParent();
      const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        fsImpl.writeFileSync(temporaryPath, `${credential}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        try { fsImpl.chmodSync(temporaryPath, 0o600); } catch { /* best effort on test filesystems */ }
        const descriptor = fsImpl.openSync(temporaryPath, "r");
        try { fsImpl.fsyncSync(descriptor); } finally { fsImpl.closeSync(descriptor); }
        fsImpl.renameSync(temporaryPath, filePath);
        try { fsImpl.chmodSync(filePath, 0o600); } catch { /* best effort on test filesystems */ }
      } catch (error) {
        try { fsImpl.unlinkSync(temporaryPath); } catch { /* leave no secret-bearing temp file when possible */ }
        if (error?.code === "EACCES" || error?.code === "EPERM") throw credentialBackendError("credential-write-permission");
        throw credentialBackendError("credential-write-failed");
      }
    },
    clear() {
      try { fsImpl.unlinkSync(filePath); } catch (error) {
        if (error?.code !== "ENOENT") throw credentialBackendError("credential-clear-failed");
      }
    }
  });
}

export function createProductionFileCredentialBackend(options = {}) {
  // Single-instance Linux production storage: one permission-isolated file at
  // an operator-chosen absolute path outside the story library.  This backend
  // does not claim encryption; its protection is strict file permissions plus
  // living outside the review application data, mirroring how the deployment
  // already stores the review password.  The credential is never written with
  // group/world bits, and a stored file whose permissions were loosened is
  // refused on read instead of being served.
  const fsImpl = options.fsImpl || {
    existsSync,
    mkdirSync,
    chmodSync,
    statSync,
    readFileSync,
    writeFileSync,
    renameSync,
    unlinkSync,
    openSync,
    fsyncSync,
    closeSync
  };
  const rawPath = typeof options.filePath === "string" ? options.filePath.trim() : "";
  if (!rawPath) throw credentialBackendError("credential-file-path-required");
  const filePath = path.resolve(rawPath);
  if (!path.isAbsolute(filePath) || filePath === path.parse(filePath).root) throw credentialBackendError("credential-file-path-invalid");

  function assertParentSafe() {
    const parent = path.dirname(filePath);
    let stats;
    try { stats = fsImpl.statSync(parent); } catch {
      try { fsImpl.mkdirSync(parent, { recursive: true, mode: 0o700 }); } catch { throw credentialBackendError("credential-write-permission"); }
      try { fsImpl.chmodSync(parent, 0o700); } catch { /* best effort on test filesystems */ }
      stats = fsImpl.statSync(parent);
    }
    if (!stats.isDirectory()) throw credentialBackendError("credential-file-path-invalid");
    if (stats.mode & 0o022) throw credentialBackendError("credential-file-dir-permissions");
  }

  return Object.freeze({
    kind: "production-file",
    filePath,
    configured() {
      assertParentSafe();
      return fsImpl.existsSync(filePath);
    },
    read() {
      let stats;
      try { stats = fsImpl.statSync(filePath); } catch (error) {
        // A missing stored file is the not-yet-configured state, matching the
        // development backend contract; any other stat failure fails closed.
        if (error?.code === "ENOENT") return "";
        throw credentialBackendError("credential-read-failed");
      }
      if (!stats.isFile()) throw credentialBackendError("credential-file-path-invalid");
      if (stats.mode & 0o077) throw credentialBackendError("credential-file-permissions");
      let source;
      try { source = fsImpl.readFileSync(filePath, "utf8"); } catch { throw credentialBackendError("credential-read-failed"); }
      return validateStoredCredential(source, { allowEmpty: true });
    },
    write(value) {
      const credential = validateCredential(value);
      assertParentSafe();
      const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        fsImpl.writeFileSync(temporaryPath, `${credential}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        try { fsImpl.chmodSync(temporaryPath, 0o600); } catch { /* best effort on test filesystems */ }
        const descriptor = fsImpl.openSync(temporaryPath, "r");
        try { fsImpl.fsyncSync(descriptor); } finally { fsImpl.closeSync(descriptor); }
        fsImpl.renameSync(temporaryPath, filePath);
        try { fsImpl.chmodSync(filePath, 0o600); } catch { /* best effort on test filesystems */ }
      } catch (error) {
        try { fsImpl.unlinkSync(temporaryPath); } catch { /* leave no secret-bearing temp file when possible */ }
        if (error?.code === "EACCES" || error?.code === "EPERM") throw credentialBackendError("credential-write-permission");
        throw credentialBackendError("credential-write-failed");
      }
    },
    clear() {
      assertParentSafe();
      try { fsImpl.unlinkSync(filePath); } catch (error) {
        if (error?.code !== "ENOENT") throw credentialBackendError("credential-clear-failed");
      }
    }
  });
}

export function createProviderCredentialBackend(options = {}) {
  const environment = options.environment || process.env;
  const nodeEnvironment = environment.NODE_ENV || "development";
  const explicit = environment.TIANYAN_CREDENTIAL_BACKEND || "";
  const appDataRoot = options.appDataRoot || defaultProviderAppDataRoot();
  const credentialRef = safeCredentialRef(options.credentialRef || DEFAULT_KEYCHAIN_ACCOUNT);
  const fallback = () => createLocalFileDevelopmentCredentialBackend({
    fsImpl: options.fsImpl,
    filePath: path.join(appDataRoot, "credentials", `${credentialRef}.credential`)
  });

  if (explicit === "DISABLED") return createDisabledCredentialBackend();
  if (explicit === "PRODUCTION_FILE") {
    return createProductionFileCredentialBackend({
      fsImpl: options.fsImpl,
      filePath: environment.TIANYAN_CREDENTIAL_FILE_PATH || options.filePath || ""
    });
  }
  if (explicit === "LOCAL_FILE_DEVELOPMENT_ONLY") {
    if (nodeEnvironment === "production") throw credentialBackendError("production-local-file-rejected");
    return fallback();
  }
  if (explicit && explicit !== "MACOS_KEYCHAIN") throw credentialBackendError("credential-backend-unsupported");

  const commandPath = options.commandPath || "/usr/bin/security";
  const keychainAvailable = process.platform === "darwin" && commandIsAvailable(commandPath, options.accessSyncImpl);
  if (keychainAvailable) {
    return createMacKeychainCredentialBackend({
      commandPath,
      promptCommandPath: options.promptCommandPath,
      service: options.service,
      account: options.account || credentialRef,
      spawnSyncImpl: options.spawnSyncImpl,
      promptRunImpl: options.promptRunImpl
    });
  }
  if (nodeEnvironment !== "production") return fallback();
  throw credentialBackendError("production-keychain-required");
}

function safeCredentialRef(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(normalized)) throw credentialBackendError("credential-backend-unsupported");
  return normalized;
}

export function validateCredential(value) {
  if (typeof value !== "string") throw credentialBackendError("credential-invalid");
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > MAXIMUM_CREDENTIAL_CHARACTERS || /[\r\n\0]/u.test(normalized)) {
    throw credentialBackendError("credential-invalid");
  }
  return normalized;
}

function validateStoredCredential(value, options = {}) {
  const normalized = String(value || "").trim();
  if (!normalized && options.allowEmpty) return "";
  return validateCredential(normalized);
}

function commandIsAvailable(commandPath, accessSyncImpl = accessSync) {
  try {
    accessSyncImpl(commandPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function credentialBackendError(code) {
  const error = new Error(credentialMessage(code));
  error.name = "ProviderCredentialBackendError";
  error.code = code;
  error.statusCode = code === "production-keychain-required" || code === "production-local-file-rejected" || code === "credential-file-path-required" || code === "credential-file-path-invalid" || code === "credential-file-permissions" || code === "credential-file-dir-permissions" ? 503 : 400;
  return error;
}

function credentialMessage(code) {
  const messages = {
    "keychain-unavailable": "系统钥匙串当前不可用，请稍后重试。",
    "keychain-write-failed": "无法把凭据保存到系统钥匙串。",
    "keychain-clear-failed": "无法从系统钥匙串清除凭据。",
    "credential-read-failed": "无法读取本机凭据状态。",
    "credential-write-permission": "本机凭据目录不可写，凭据未保存。",
    "credential-write-failed": "本机凭据保存失败，凭据未确认写入。",
    "credential-clear-failed": "本机凭据清除失败。",
    "production-local-file-rejected": "生产模式拒绝使用开发级本地凭据文件。",
    "production-keychain-required": "生产模式需要系统钥匙串凭据后端。",
    "credential-file-path-required": "生产凭据文件路径未配置（TIANYAN_CREDENTIAL_FILE_PATH），凭据后端未启用。",
    "credential-file-path-invalid": "生产凭据文件路径无效，凭据后端未启用。",
    "credential-file-permissions": "凭据文件权限过宽，已拒绝读取；请让运维把文件权限收紧为 0600。",
    "credential-file-dir-permissions": "凭据目录权限过宽，已拒绝写入；请让运维把目录权限收紧为 0700。",
    "credential-backend-unsupported": "凭据后端配置不受支持。",
    "provider-disabled": "当前审阅环境未启用 Provider 凭据。",
    "credential-invalid": "Provider 凭据格式无效。"
  };
  return messages[code] || "本机凭据操作失败。";
}
