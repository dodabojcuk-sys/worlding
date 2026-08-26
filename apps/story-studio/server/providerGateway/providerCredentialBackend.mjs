import { accessSync, chmodSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, openSync, fsyncSync, closeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
    configured() { return this.read().length > 0; },
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
  const filePath = path.resolve(options.filePath || path.join(defaultProviderAppDataRoot(), "credentials", "siliconflow.default.credential"));

  function ensureParent() {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    try { fsImpl.chmodSync(path.dirname(filePath), 0o700); } catch { /* best effort on test filesystems */ }
  }

  return Object.freeze({
    kind: "local-file-development-only",
    filePath,
    configured() { return this.read().length > 0; },
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

export function createProviderCredentialBackend(options = {}) {
  const environment = options.environment || process.env;
  const nodeEnvironment = environment.NODE_ENV || "development";
  const explicit = environment.TIANYAN_CREDENTIAL_BACKEND || "";
  const appDataRoot = options.appDataRoot || defaultProviderAppDataRoot();
  const fallback = () => createLocalFileDevelopmentCredentialBackend({
    fsImpl: options.fsImpl,
    filePath: path.join(appDataRoot, "credentials", "siliconflow.default.credential")
  });

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
      account: options.account,
      spawnSyncImpl: options.spawnSyncImpl,
      promptRunImpl: options.promptRunImpl
    });
  }
  if (nodeEnvironment !== "production") return fallback();
  throw credentialBackendError("production-keychain-required");
}

export function defaultProviderAppDataRoot() {
  return path.join(os.homedir(), "Library", "Application Support", "Tianyan");
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
  error.statusCode = code === "production-keychain-required" || code === "production-local-file-rejected" ? 503 : 400;
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
    "credential-backend-unsupported": "凭据后端配置不受支持。",
    "credential-invalid": "Provider 凭据格式无效。"
  };
  return messages[code] || "本机凭据操作失败。";
}
