import { createHash, randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const CREATION_PLUGIN_PACKAGE_SCHEMA = "tianyan-creation-plugin-package/v1";
export const CREATION_PLUGIN_INSTALL_RECORD_SCHEMA = "tianyan-creation-plugin-install-record/v2";
export const CREATION_PLUGIN_STATE_SCHEMA = "tianyan-creation-plugin-state/v1";
export const CREATION_PLUGIN_TRANSACTION_SCHEMA = "tianyan-creation-plugin-transaction/v1";
export const CREATION_PLUGIN_TRANSACTION_STATES = Object.freeze(["prepared", "committed", "rolled_back", "failed"]);
export const CREATION_PLUGIN_RUNTIME_CLASS = Object.freeze({
  SAFE_TRANSFORM: "safe_transform",
  EXTERNAL_EXECUTABLE: "external_executable"
});

const MAX_PACKAGE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 24;
const SAFE_PLATFORM = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : process.platform === "win32" ? "win32" : process.platform;
const RESERVED_PACKAGE_PATHS = new Set(["manifest.json"]);

/**
 * Owns immutable installed packages, host receipts and active state. Executable
 * packages remain installable for provenance, but are never consumer-runnable.
 */
export function createCreationPluginLifecycle(options = {}) {
  const pluginRoot = path.resolve(options.pluginRoot || path.join(os.homedir(), ".tianyan", "creation-plugins"));
  const catalog = normalizeCatalog(options.catalog || []);
  const now = options.now || (() => new Date().toISOString());
  const platform = options.platform || SAFE_PLATFORM;
  // R0 has no approved capability runtime. Keep the option for fixture
  // compatibility, but never let it make a package runnable.
  const safeTransformRuntimeAvailable = false;
  const testHooks = options.testHooks || {};
  let recoveryPromise;

  async function discover() {
    await ensureRecovered();
    const installed = await readInstalled(pluginRoot);
    const result = [];
    for (const entry of catalog) {
      let current = installed.get(entry.manifest.pluginId) || null;
      if (current && !current.state.quarantined) {
        try {
          await verifyReceiptTree(pluginRoot, current.receipt);
        } catch (cause) {
          await quarantine(pluginRoot, current.state, messageOf(cause), now());
          current = await readCurrentInstallation(pluginRoot, entry.manifest.pluginId);
        }
      }
      result.push(publicEntry(entry, current, platform, safeTransformRuntimeAvailable));
    }
    return result;
  }

  async function inspect(pluginId) {
    findCatalog(catalog, pluginId);
    return (await discover()).find((entry) => entry.manifest.pluginId === pluginId);
  }

  async function install(pluginId) {
    await ensureRecovered();
    const entry = findCatalog(catalog, pluginId);
    const current = await verifiedCurrent(entry.manifest.pluginId);
    if (current && current.receipt.archiveDigest === entry.manifest.packageSha256 && current.state.enabled) {
      return publicEntry(entry, current, platform, safeTransformRuntimeAvailable);
    }
    if (current && current.receipt.archiveDigest === entry.manifest.packageSha256 && !current.state.enabled) {
      return setEnabled(pluginId, true);
    }
    return installEntry(entry, current, "install");
  }

  async function update(pluginId) {
    await ensureRecovered();
    const entry = findCatalog(catalog, pluginId);
    const current = await verifiedCurrent(entry.manifest.pluginId);
    if (!current) throw new Error("Plugin is not installed.");
    if (entry.manifest.releaseSequence <= current.receipt.releaseSequence) {
      throw new Error("Plugin update rejected by anti-downgrade release sequence policy.");
    }
    return installEntry(entry, current, "update");
  }

  async function setEnabled(pluginId, enabled) {
    await ensureRecovered();
    const current = await readCurrentInstallation(pluginRoot, pluginId);
    if (!current) throw new Error("Plugin is not installed.");
    if (enabled) {
      if (current.state.quarantined) throw new Error("Quarantined plugins cannot be enabled.");
      await verifyOrQuarantine(current);
    }
    const state = { ...current.state, enabled: Boolean(enabled), updatedAt: now() };
    await writeState(pluginRoot, state);
    return publicEntry(findCatalog(catalog, pluginId), { state, receipt: current.receipt }, platform, safeTransformRuntimeAvailable);
  }

  async function rollback(pluginId) {
    await ensureRecovered();
    const entry = findCatalog(catalog, pluginId);
    const current = await readCurrentInstallation(pluginRoot, pluginId);
    if (!current) throw new Error("Plugin is not installed.");
    const receipts = (await readReceipts(pluginRoot, pluginId))
      .filter((receipt) => receipt.receiptId !== current.receipt.receiptId && receipt.releaseSequence < current.receipt.releaseSequence)
      .sort((left, right) => right.releaseSequence - left.releaseSequence || right.installedAt.localeCompare(left.installedAt));
    let candidate = null;
    for (const receipt of receipts) {
      try {
        await verifyReceiptTree(pluginRoot, receipt);
        candidate = receipt;
        break;
      } catch { /* A rollback target must independently pass its retained receipt. */ }
    }
    if (!candidate) throw new Error("Plugin has no retained verified version to roll back to.");
    const transaction = {
      schemaVersion: CREATION_PLUGIN_TRANSACTION_SCHEMA,
      transactionId: `tx-${randomUUID()}`,
      pluginId,
      operation: "rollback",
      status: "prepared",
      createdAt: now(),
      stagingPath: `.staging-${pluginId}-${randomUUID()}`,
      finalPath: null,
      ownsFinalDirectory: false,
      receiptId: `receipt-${randomUUID()}`,
      previousState: structuredClone(current.state),
      previousReceiptId: current.receipt.receiptId
    };
    await writeTransaction(pluginRoot, transaction);
    const receipt = {
      ...candidate,
      receiptId: transaction.receiptId,
      installedAt: now(),
      operation: "rollback",
      rolledBackFromReceiptId: current.receipt.receiptId
    };
    try {
      await writeReceipt(pluginRoot, receipt);
      const state = {
        ...current.state,
        activeReceiptId: receipt.receiptId,
        highestReleaseSequence: Math.max(current.state.highestReleaseSequence, current.receipt.releaseSequence),
        enabled: true,
        quarantined: false,
        quarantineReason: null,
        quarantinedAt: null,
        updatedAt: now()
      };
      await writeState(pluginRoot, state);
      await verifyReceiptTree(pluginRoot, receipt);
      await writeTransaction(pluginRoot, { ...transaction, status: "committed", committedAt: now() });
      return publicEntry(entry, { state, receipt }, platform, safeTransformRuntimeAvailable);
    } catch (cause) {
      await ignoreCleanupError(() => restorePreviousActiveState(pluginRoot, transaction));
      await ignoreCleanupError(() => removeExactPath(receiptPath(pluginRoot, pluginId, receipt.receiptId)));
      await ignoreCleanupError(() => writeTransaction(pluginRoot, { ...transaction, status: "failed", failedAt: now(), error: sanitizeTransactionError(cause) }));
      throw cause;
    }
  }

  async function uninstall(pluginId) {
    await ensureRecovered();
    assertSafePluginId(pluginId);
    const current = await readCurrentInstallation(pluginRoot, pluginId);
    if (!current) throw new Error("Plugin is not installed.");
    await removeExactPath(path.join(packagesRoot(pluginRoot), pluginId));
    // Receipts are host audit records and remain readable after uninstall.
    await removeExactPath(statePath(pluginRoot, pluginId));
    return { pluginId, uninstalled: true, preserved: ["story-packages", "output-artifacts", "receipts"] };
  }

  async function health(pluginId) {
    await ensureRecovered();
    const current = await readCurrentInstallation(pluginRoot, pluginId);
    if (!current || !current.state.enabled) return { pluginId, health: "unavailable", detail: "Plugin is not installed or enabled." };
    if (current.state.quarantined) return { pluginId, health: "quarantined", detail: current.state.quarantineReason };
    try {
      await verifyOrQuarantine(current);
    } catch {
      const quarantined = await readCurrentInstallation(pluginRoot, pluginId);
      return { pluginId, health: "quarantined", detail: quarantined?.state.quarantineReason || "Installed package integrity verification failed." };
    }
    return executionState(current.receipt.runtimeClass, safeTransformRuntimeAvailable) === "runnable"
      ? { pluginId, health: "healthy", detail: "Safe transform runtime is available and package integrity is current." }
      : { pluginId, health: "unavailable", detail: "External executable consumer execution is disabled until an approved OS sandbox exists." };
  }

  async function runtimeEntries() {
    await ensureRecovered();
    const result = [];
    for (const entry of catalog) {
      const current = await readCurrentInstallation(pluginRoot, entry.manifest.pluginId);
      if (!current?.state.enabled || current.state.quarantined || !entry.manifest.supportedPlatforms.includes(platform)) continue;
      try {
        const verified = await verifyOrQuarantine(current);
        result.push({
          manifest: structuredClone(verified.manifest),
          entrypoint: verified.entrypoint,
          executionState: executionState(verified.manifest.runtimeClass, safeTransformRuntimeAvailable)
        });
      } catch { /* Quarantine is durable; an unverified package never enters the registry. */ }
    }
    return result;
  }

  return { pluginRoot, transactionRoot: transactionsRoot(pluginRoot), discover, inspect, install, update, rollback, uninstall, setEnabled, health, runtimeEntries };

  async function ensureRecovered() {
    if (!recoveryPromise) recoveryPromise = recoverTransactions(pluginRoot, now);
    return recoveryPromise;
  }

  async function verifiedCurrent(pluginId) {
    const current = await readCurrentInstallation(pluginRoot, pluginId);
    if (!current) return null;
    if (current.state.quarantined) throw new Error("Plugin is quarantined and cannot be installed or updated in place.");
    await verifyOrQuarantine(current);
    return current;
  }

  async function verifyOrQuarantine(current) {
    try {
      return await verifyReceiptTree(pluginRoot, current.receipt);
    } catch (cause) {
      await quarantine(pluginRoot, current.state, messageOf(cause), now());
      throw new Error("Installed plugin failed integrity verification and was quarantined.");
    }
  }

  async function installEntry(entry, previous, operation) {
    assertSupportedPlatform(entry.manifest, platform);
    const retainedReceipts = previous ? [] : await readReceipts(pluginRoot, entry.manifest.pluginId);
    const highestRetainedReleaseSequence = retainedReceipts.reduce((highest, receipt) => Math.max(highest, receipt.releaseSequence), 0);
    if (previous && entry.manifest.releaseSequence <= previous.receipt.releaseSequence) {
      throw new Error("Plugin install rejected by anti-downgrade release sequence policy.");
    }
    if (!previous && entry.manifest.releaseSequence < highestRetainedReleaseSequence) {
      throw new Error("Plugin install rejected by anti-downgrade release sequence policy.");
    }
    const packageBytes = await readPackageBytes(entry);
    const parsed = parsePackage(packageBytes);
    const archiveDigest = packagePayloadSha(parsed);
    if (archiveDigest !== entry.manifest.packageSha256) throw new Error("Plugin package checksum does not match the curated catalog.");
    const manifest = validatePackage(parsed, entry.manifest, archiveDigest, platform);
    await mkdir(pluginRoot, { recursive: true, mode: 0o700 });
    const transactionId = `tx-${randomUUID()}`;
    const stagingPath = `.staging-${manifest.pluginId}-${randomUUID()}`;
    const staging = resolveInside(pluginRoot, stagingPath);
    let transaction = {
      schemaVersion: CREATION_PLUGIN_TRANSACTION_SCHEMA,
      transactionId,
      pluginId: manifest.pluginId,
      operation,
      status: "prepared",
      createdAt: now(),
      stagingPath,
      finalPath: null,
      ownsFinalDirectory: false,
      receiptId: null,
      previousState: previous ? structuredClone(previous.state) : null,
      previousReceiptId: previous?.receipt.receiptId || null
    };
    await writeTransaction(pluginRoot, transaction);
    let ownedFinalDirectory = false;
    let receipt = null;
    try {
      await writePackage(staging, parsed.files, manifest);
      await invokeTestHook(testHooks.afterStage, { pluginId: manifest.pluginId, transactionId, staging });
      const packageDigest = await digestTree(staging);
      const manifestDigest = sha256(Buffer.from(canonicalJson(manifest), "utf8"));
      const entrypoint = resolveInside(staging, manifest.entrypoint);
      const entrypointDigest = sha256(await readFile(entrypoint));
      const packageDirectory = path.posix.join("packages", manifest.pluginId, `${manifest.releaseSequence}-${digestHex(packageDigest).slice(0, 24)}`);
      const finalDirectory = resolveInside(pluginRoot, packageDirectory);
      const receiptId = `receipt-${randomUUID()}`;
      transaction = { ...transaction, finalPath: packageDirectory, receiptId, treeDigest: packageDigest };
      await writeTransaction(pluginRoot, transaction);
      await mkdir(path.dirname(finalDirectory), { recursive: true, mode: 0o700 });
      if (existsSync(finalDirectory)) {
        if (await digestTree(finalDirectory) !== packageDigest) throw new Error("Retained package directory conflicts with the verified package digest.");
        await removeExactPath(staging);
      } else {
        await rename(staging, finalDirectory);
        await makeTreeReadOnly(finalDirectory);
        ownedFinalDirectory = true;
        transaction = { ...transaction, ownsFinalDirectory: true };
        await writeTransaction(pluginRoot, transaction);
      }
      receipt = {
        schemaVersion: CREATION_PLUGIN_INSTALL_RECORD_SCHEMA,
        receiptId,
        pluginId: manifest.pluginId,
        identity: {
          pluginId: manifest.pluginId,
          publisher: manifest.publisher,
          upstreamRepository: manifest.upstreamRepository,
          upstreamCommitOrRelease: manifest.upstreamCommitOrRelease
        },
        version: manifest.pluginVersion,
        releaseSequence: manifest.releaseSequence,
        treeDigest: packageDigest,
        packageDigest,
        archiveDigest,
        entrypointDigest,
        manifestDigest,
        installedAt: now(),
        sourceIdentity: {
          publisher: manifest.publisher,
          upstreamRepository: manifest.upstreamRepository,
          upstreamCommitOrRelease: manifest.upstreamCommitOrRelease
        },
        runtimeClass: manifest.runtimeClass,
        packageDirectory,
        operation
      };
      await writeReceipt(pluginRoot, receipt);
      const state = {
        schemaVersion: CREATION_PLUGIN_STATE_SCHEMA,
        pluginId: manifest.pluginId,
        activeReceiptId: receipt.receiptId,
        highestReleaseSequence: Math.max(previous?.state.highestReleaseSequence || 0, manifest.releaseSequence),
        enabled: true,
        quarantined: false,
        quarantineReason: null,
        quarantinedAt: null,
        updatedAt: now()
      };
      await writeState(pluginRoot, state);
      await verifyReceiptTree(pluginRoot, receipt);
      transaction = { ...transaction, status: "committed", committedAt: now() };
      await writeTransaction(pluginRoot, transaction);
      return publicEntry(entry, { state, receipt }, platform, safeTransformRuntimeAvailable);
    } catch (cause) {
      await ignoreCleanupError(() => restorePreviousActiveState(pluginRoot, transaction));
      if (receipt?.receiptId) await ignoreCleanupError(() => removeExactPath(receiptPath(pluginRoot, manifest.pluginId, receipt.receiptId)));
      await ignoreCleanupError(() => removeExactPath(staging));
      if (ownedFinalDirectory) await ignoreCleanupError(() => removeExactPath(resolveInside(pluginRoot, transaction.finalPath)));
      await invokeTestHookIgnoringFailure(testHooks.afterCleanup, { pluginId: manifest.pluginId, transactionId });
      transaction = { ...transaction, status: "failed", failedAt: now(), error: sanitizeTransactionError(cause) };
      await ignoreCleanupError(() => writeTransaction(pluginRoot, transaction));
      throw cause;
    }
  }
}

export function createTyPluginPackage({ manifest, files }) {
  const normalizedFiles = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => ({ path: filePath, type: "file", encoding: "base64", content: Buffer.from(content, "utf8").toString("base64") }));
  const normalizedManifest = { ...structuredClone(manifest), schemaVersion: CREATION_PLUGIN_PACKAGE_SCHEMA, packageSha256: "sha256:pending" };
  normalizedManifest.packageSha256 = packagePayloadSha({ schemaVersion: CREATION_PLUGIN_PACKAGE_SCHEMA, manifest: normalizedManifest, files: normalizedFiles });
  return Buffer.from(`${JSON.stringify({ schemaVersion: CREATION_PLUGIN_PACKAGE_SCHEMA, manifest: normalizedManifest, files: normalizedFiles })}\n`, "utf8");
}

export function creationPluginPackageSha(value) {
  return packagePayloadSha(value);
}

function normalizeCatalog(entries) {
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object" || !entry.manifest) throw new Error("Curated plugin catalog entry is invalid.");
    validateManifest(entry.manifest);
    const packagePath = entry.packagePath ? path.resolve(entry.packagePath) : null;
    const packageSizeBytes = packagePath && existsSync(packagePath) && statSync(packagePath).isFile() ? statSync(packagePath).size : null;
    return { manifest: structuredClone(entry.manifest), packagePath, packageSizeBytes };
  }).sort((left, right) => left.manifest.pluginId.localeCompare(right.manifest.pluginId));
}

function findCatalog(catalog, pluginId) {
  const found = catalog.find((entry) => entry.manifest.pluginId === pluginId);
  if (!found) throw new Error("Plugin is not in the curated catalog.");
  return found;
}

async function readPackageBytes(entry) {
  if (!entry.packagePath) throw new Error("This curated plugin has not been published to the local catalog.");
  const info = await stat(entry.packagePath);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_PACKAGE_BYTES) throw new Error("Plugin package is unavailable or exceeds the package size limit.");
  return readFile(entry.packagePath);
}

function parsePackage(bytes) {
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!parsed || parsed.schemaVersion !== CREATION_PLUGIN_PACKAGE_SCHEMA || !parsed.manifest || !Array.isArray(parsed.files)) throw new Error("shape");
    return parsed;
  } catch {
    throw new Error("Plugin package is corrupted or uses an unsupported archive format.");
  }
}

function validatePackage(value, expectedManifest, observedSha, platform) {
  validateManifest(value.manifest);
  if (canonicalJson(value.manifest) !== canonicalJson(expectedManifest)) throw new Error("Plugin package manifest does not match the curated catalog.");
  if (value.manifest.packageSha256 !== observedSha) throw new Error("Plugin manifest checksum does not match package bytes.");
  assertSupportedPlatform(value.manifest, platform);
  if (!value.files.length || value.files.length > MAX_FILES) throw new Error("Plugin package file count is invalid.");
  const seen = new Set();
  const paths = [];
  for (const entry of value.files) {
    if (!entry || typeof entry.path !== "string") throw new Error("Plugin package contains an unsupported or unsafe archive entry.");
    assertSafeRelativePath(entry.path);
    const folded = foldPath(entry.path);
    if (RESERVED_PACKAGE_PATHS.has(folded)) throw new Error("Plugin package attempts to overwrite a host-owned critical file.");
    if (seen.has(folded)) throw new Error("Plugin package contains a duplicate archive path.");
    if (entry.type !== "file" || entry.encoding !== "base64" || typeof entry.content !== "string" || !isCanonicalBase64(entry.content)) throw new Error("Plugin package contains an unsupported or unsafe archive entry.");
    const content = Buffer.from(entry.content, "base64");
    if (!content.length || content.length > MAX_FILE_BYTES) throw new Error("Plugin package file exceeds the per-file size limit.");
    seen.add(folded);
    paths.push(folded);
  }
  for (const candidate of paths) {
    if (paths.some((other) => other !== candidate && (candidate.startsWith(`${other}/`) || other.startsWith(`${candidate}/`)))) {
      throw new Error("Plugin package contains a file and directory path collision.");
    }
  }
  if (!seen.has(foldPath(value.manifest.entrypoint))) throw new Error("Plugin package entrypoint is missing.");
  return value.manifest;
}

function validateManifest(manifest) {
  const required = ["schemaVersion", "pluginId", "displayName", "pluginVersion", "releaseSequence", "description", "publisher", "upstreamRepository", "upstreamCommitOrRelease", "licenseSpdx", "licenseNotice", "capabilities", "pluginKind", "supportedPlatforms", "packageSha256", "entrypoint", "runtime", "runtimeClass", "permissions", "resourceLimits", "expectedArtifacts", "healthCheck", "minimumTianyanVersion", "installMode", "updateChannel", "externalServiceRequired", "modelManagedByTianyan"];
  if (!manifest || typeof manifest !== "object" || required.some((key) => manifest[key] === undefined)) throw new Error("Plugin manifest is missing a required field.");
  if (manifest.schemaVersion !== CREATION_PLUGIN_PACKAGE_SCHEMA || !/^[a-z0-9][a-z0-9-]{1,62}$/u.test(manifest.pluginId) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(manifest.pluginVersion) || !Number.isSafeInteger(manifest.releaseSequence) || manifest.releaseSequence <= 0 || !/^sha256:[a-f0-9]{64}$/u.test(manifest.packageSha256)) throw new Error("Plugin manifest contains invalid identity fields.");
  if (!["displayName", "description", "publisher", "upstreamRepository", "upstreamCommitOrRelease", "licenseSpdx", "licenseNotice", "entrypoint"].every((key) => typeof manifest[key] === "string" && manifest[key].trim())) throw new Error("Plugin manifest must declare its source and license metadata.");
  if (typeof manifest.externalServiceRequired !== "boolean" || manifest.modelManagedByTianyan !== false) throw new Error("R0 plugin manifests must declare service needs and reject managed models.");
  if (!Array.isArray(manifest.capabilities) || !Array.isArray(manifest.supportedPlatforms) || !Array.isArray(manifest.permissions) || !Array.isArray(manifest.expectedArtifacts) || typeof manifest.resourceLimits !== "object") throw new Error("Plugin manifest contains invalid collection fields.");
  if (!["export_only", "local_cli", "local_http_connector", "remote_http_connector", "format_runtime"].includes(manifest.pluginKind)) throw new Error("Plugin manifest has an unsupported plugin kind.");
  if (manifest.healthCheck !== "entrypoint-present") throw new Error("Plugin manifest requests an unsupported health check.");
  if (!Object.values(CREATION_PLUGIN_RUNTIME_CLASS).includes(manifest.runtimeClass)) throw new Error("Plugin manifest has an unsupported runtime class.");
  if (manifest.installMode !== "curated-local-package") throw new Error("Plugin manifest requests an unsupported install mode.");
  assertSafeRelativePath(manifest.entrypoint);
  if (manifest.runtimeClass === CREATION_PLUGIN_RUNTIME_CLASS.EXTERNAL_EXECUTABLE) {
    if (manifest.runtime !== "node") throw new Error("External executable packages must declare their actual Node runtime.");
    const forbidden = manifest.permissions.filter((permission) => !["package-read", "process-execute"].includes(permission));
    if (forbidden.length || !manifest.permissions.includes("process-execute")) throw new Error("Plugin requests undeclared or unsupported permissions.");
  } else if (manifest.runtime !== "javascriptcore" || canonicalJson(manifest.permissions) !== canonicalJson(["confirmed-package-input"])) {
    throw new Error("Safe transforms require the approved JavaScriptCore capability runtime and confirmed package input only.");
  }
}

async function writePackage(staging, files, manifest) {
  await mkdir(staging, { recursive: true, mode: 0o700 });
  for (const entry of files) {
    const destination = resolveInside(staging, entry.path);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, Buffer.from(entry.content, "base64"), { mode: 0o600, flag: "wx" });
  }
  await writeFile(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

async function readInstalled(pluginRoot) {
  const result = new Map();
  if (!existsSync(statesRoot(pluginRoot))) return result;
  for (const name of await readdir(statesRoot(pluginRoot))) {
    if (!name.endsWith(".json")) continue;
    const pluginId = name.slice(0, -5);
    try {
      const current = await readCurrentInstallation(pluginRoot, pluginId);
      if (current) result.set(pluginId, current);
    } catch { /* Corrupt host metadata is never treated as an installed package. */ }
  }
  return result;
}

async function readCurrentInstallation(pluginRoot, pluginId) {
  assertSafePluginId(pluginId);
  try {
    const state = JSON.parse(await readFile(statePath(pluginRoot, pluginId), "utf8"));
    validateState(state, pluginId);
    const receipt = JSON.parse(await readFile(receiptPath(pluginRoot, pluginId, state.activeReceiptId), "utf8"));
    validateReceipt(receipt, pluginId);
    return { state, receipt };
  } catch (cause) {
    if (cause?.code === "ENOENT") return null;
    throw cause;
  }
}

async function readReceipts(pluginRoot, pluginId) {
  const directory = path.join(receiptsRoot(pluginRoot), pluginId);
  if (!existsSync(directory)) return [];
  const result = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue;
    try {
      const receipt = JSON.parse(await readFile(path.join(directory, name), "utf8"));
      validateReceipt(receipt, pluginId);
      result.push(receipt);
    } catch { /* Invalid receipts are ineligible for rollback. */ }
  }
  return result;
}

async function verifyReceiptTree(pluginRoot, receipt) {
  validateReceipt(receipt, receipt.pluginId);
  const packageDirectory = resolveInside(pluginRoot, receipt.packageDirectory);
  const treeDigest = receipt.treeDigest || receipt.packageDigest;
  if (await digestTree(packageDirectory) !== treeDigest) throw new Error("Installed package tree digest mismatch.");
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, "manifest.json"), "utf8"));
  validateManifest(manifest);
  if (sha256(Buffer.from(canonicalJson(manifest), "utf8")) !== receipt.manifestDigest) throw new Error("Installed package manifest digest mismatch.");
  if (manifest.pluginId !== receipt.pluginId || manifest.pluginVersion !== receipt.version || manifest.releaseSequence !== receipt.releaseSequence || manifest.runtimeClass !== receipt.runtimeClass || manifest.packageSha256 !== receipt.archiveDigest || receipt.identity.pluginId !== manifest.pluginId || receipt.identity.publisher !== manifest.publisher || receipt.identity.upstreamRepository !== manifest.upstreamRepository || receipt.identity.upstreamCommitOrRelease !== manifest.upstreamCommitOrRelease || receipt.sourceIdentity.publisher !== manifest.publisher || receipt.sourceIdentity.upstreamRepository !== manifest.upstreamRepository || receipt.sourceIdentity.upstreamCommitOrRelease !== manifest.upstreamCommitOrRelease) throw new Error("Installed package manifest identity mismatch.");
  const entrypoint = resolveInside(packageDirectory, manifest.entrypoint);
  const info = await lstat(entrypoint);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Installed package entrypoint is not a regular file.");
  if (sha256(await readFile(entrypoint)) !== receipt.entrypointDigest) throw new Error("Installed package entrypoint digest mismatch.");
  return { manifest, entrypoint };
}

async function digestTree(root) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Installed package root is not a regular directory.");
  const entries = [];
  let totalBytes = 0;
  async function visit(directory, prefix = "") {
    const names = (await readdir(directory)).sort((left, right) => left.localeCompare(right));
    for (const name of names) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      assertSafeRelativePath(relative);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error("Installed package contains a symbolic link.");
      if (info.isDirectory()) await visit(absolute, relative);
      else if (info.isFile()) {
        const bytes = await readFile(absolute);
        totalBytes += bytes.length;
        if (bytes.length > MAX_FILE_BYTES || totalBytes > MAX_PACKAGE_BYTES || entries.length >= MAX_FILES + 1) throw new Error("Installed package tree exceeds integrity limits.");
        entries.push({ path: relative, bytes: bytes.length, digest: sha256(bytes) });
      } else throw new Error("Installed package contains a non-regular filesystem entry.");
    }
  }
  await visit(root);
  return sha256(Buffer.from(canonicalJson(entries), "utf8"));
}

async function makeTreeReadOnly(root) {
  for (const name of await readdir(root)) {
    const absolute = path.join(root, name);
    const info = await lstat(absolute);
    if (info.isDirectory()) {
      await makeTreeReadOnly(absolute);
      await chmod(absolute, 0o500);
    } else await chmod(absolute, 0o400);
  }
  await chmod(root, 0o500);
}

async function quarantine(pluginRoot, state, reason, timestamp) {
  const next = {
    ...state,
    enabled: false,
    quarantined: true,
    quarantineReason: sanitizeIntegrityReason(reason),
    quarantinedAt: timestamp,
    updatedAt: timestamp
  };
  await writeState(pluginRoot, next);
}

async function writeReceipt(pluginRoot, receipt) {
  validateReceipt(receipt, receipt.pluginId);
  await writeJsonAtomic(receiptPath(pluginRoot, receipt.pluginId, receipt.receiptId), receipt);
}

async function writeState(pluginRoot, state) {
  validateState(state, state.pluginId);
  await writeJsonAtomic(statePath(pluginRoot, state.pluginId), state);
}

async function writeJsonAtomic(target, value) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function recoverTransactions(pluginRoot, now) {
  const root = transactionsRoot(pluginRoot);
  if (!existsSync(root)) return;
  const names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
  for (const name of names) {
    const transaction = JSON.parse(await readFile(path.join(root, name), "utf8"));
    validateTransaction(transaction);
    if (transaction.status === "committed") {
      await ignoreCleanupError(() => removeExactPath(resolveInside(pluginRoot, transaction.stagingPath)));
      continue;
    }
    if (transaction.status === "failed" || transaction.status === "rolled_back") {
      await ignoreCleanupError(() => removeTransactionArtifacts(pluginRoot, transaction));
      continue;
    }

    const currentState = await readStateSnapshot(pluginRoot, transaction.pluginId);
    if (currentState?.activeReceiptId === transaction.receiptId && transaction.receiptId) {
      try {
        const receipt = JSON.parse(await readFile(receiptPath(pluginRoot, transaction.pluginId, transaction.receiptId), "utf8"));
        validateReceipt(receipt, transaction.pluginId);
        await verifyReceiptTree(pluginRoot, receipt);
        await ignoreCleanupError(() => removeExactPath(resolveInside(pluginRoot, transaction.stagingPath)));
        await writeTransaction(pluginRoot, { ...transaction, status: "committed", committedAt: now(), recoveredAt: now() });
        continue;
      } catch { /* A prepared transaction is committed only after full receipt verification. */ }
    }

    await restorePreviousActiveState(pluginRoot, transaction);
    if (transaction.receiptId) await ignoreCleanupError(() => removeExactPath(receiptPath(pluginRoot, transaction.pluginId, transaction.receiptId)));
    let cleanupError = null;
    try {
      await removeTransactionArtifacts(pluginRoot, transaction);
    } catch (cause) {
      cleanupError = cause;
    }
    const next = { ...transaction, status: cleanupError ? "failed" : "rolled_back", recoveredAt: now() };
    if (cleanupError) next.error = sanitizeTransactionError(cleanupError);
    await writeTransaction(pluginRoot, next);
    if (cleanupError) throw new Error("Plugin transaction recovery failed; the incomplete package remains unavailable.");
  }
}

async function removeTransactionArtifacts(pluginRoot, transaction) {
  await removeExactPath(resolveInside(pluginRoot, transaction.stagingPath));
  if (transaction.finalPath && transaction.ownsFinalDirectory) {
    await removeExactPath(resolveInside(pluginRoot, transaction.finalPath));
  }
}

async function writeTransaction(pluginRoot, transaction) {
  validateTransaction(transaction);
  await writeJsonAtomic(transactionPath(pluginRoot, transaction.transactionId), transaction);
}

function validateTransaction(transaction) {
  if (!transaction || transaction.schemaVersion !== CREATION_PLUGIN_TRANSACTION_SCHEMA || !/^tx-[a-f0-9-]{36}$/u.test(transaction.transactionId) || !/^[a-z0-9][a-z0-9-]{1,62}$/u.test(transaction.pluginId) || !CREATION_PLUGIN_TRANSACTION_STATES.includes(transaction.status)) {
    throw new Error("Plugin transaction journal is invalid.");
  }
  if (!transaction.stagingPath || !transaction.stagingPath.startsWith(`.staging-${transaction.pluginId}-`)) throw new Error("Plugin transaction staging path is invalid.");
  assertStagingTransactionPath(transaction.stagingPath, transaction.pluginId);
  if (transaction.finalPath !== null && transaction.finalPath !== undefined) assertFinalTransactionPath(transaction.finalPath, transaction.pluginId);
  if (transaction.receiptId !== null && transaction.receiptId !== undefined && !/^receipt-[a-f0-9-]{36}$/u.test(transaction.receiptId)) throw new Error("Plugin transaction receipt id is invalid.");
}

async function readStateSnapshot(pluginRoot, pluginId) {
  try {
    const state = JSON.parse(await readFile(statePath(pluginRoot, pluginId), "utf8"));
    validateState(state, pluginId);
    return state;
  } catch (cause) {
    if (cause?.code === "ENOENT") return null;
    return null;
  }
}

async function restorePreviousActiveState(pluginRoot, transaction) {
  const current = await readStateSnapshot(pluginRoot, transaction.pluginId);
  if (current?.activeReceiptId !== transaction.receiptId) return;
  if (transaction.previousState) await writeState(pluginRoot, transaction.previousState);
  else await removeExactPath(statePath(pluginRoot, transaction.pluginId));
}

async function restoreTreePermissions(target) {
  let info;
  try {
    info = await lstat(target);
  } catch (cause) {
    if (cause?.code === "ENOENT") return;
    throw cause;
  }
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    await chmod(target, 0o700);
    for (const name of await readdir(target)) await restoreTreePermissions(path.join(target, name));
  } else if (info.isFile()) {
    await chmod(target, 0o600);
  }
}

async function removeExactPath(target) {
  await restoreTreePermissions(target);
  await rm(target, { recursive: true, force: true });
}

async function ignoreCleanupError(operation) {
  try {
    await operation();
  } catch { /* Cleanup is best effort when preserving the original transaction error. */ }
}

async function invokeTestHook(hook, value) {
  if (typeof hook === "function") await hook(value);
}

async function invokeTestHookIgnoringFailure(hook, value) {
  try {
    await invokeTestHook(hook, value);
  } catch { /* Test-only cleanup fault injection must not mask the original error. */ }
}

function sanitizeTransactionError(cause) {
  return (cause instanceof Error ? cause.message : String(cause)).replaceAll(/[\r\n]/gu, " ").slice(0, 240);
}

function validateReceipt(receipt, pluginId) {
  if (!receipt || receipt.schemaVersion !== CREATION_PLUGIN_INSTALL_RECORD_SCHEMA || receipt.pluginId !== pluginId || !/^receipt-[a-f0-9-]{36}$/u.test(receipt.receiptId) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(receipt.version) || !Number.isSafeInteger(receipt.releaseSequence) || receipt.releaseSequence <= 0) throw new Error("Plugin install receipt is invalid.");
  for (const field of ["packageDigest", "archiveDigest", "entrypointDigest", "manifestDigest"]) if (!/^sha256:[a-f0-9]{64}$/u.test(receipt[field])) throw new Error("Plugin install receipt digest is invalid.");
  if (receipt.treeDigest !== undefined && !/^sha256:[a-f0-9]{64}$/u.test(receipt.treeDigest)) throw new Error("Plugin install receipt tree digest is invalid.");
  if (!receipt.treeDigest && !receipt.packageDigest) throw new Error("Plugin install receipt tree digest is missing.");
  if (receipt.treeDigest && receipt.packageDigest && receipt.treeDigest !== receipt.packageDigest) throw new Error("Plugin install receipt tree digests do not agree.");
  if (!Object.values(CREATION_PLUGIN_RUNTIME_CLASS).includes(receipt.runtimeClass) || !receipt.identity || receipt.identity.pluginId !== pluginId || !["publisher", "upstreamRepository", "upstreamCommitOrRelease"].every((key) => typeof receipt.identity[key] === "string" && receipt.identity[key])) throw new Error("Plugin install receipt identity is invalid.");
  if (!receipt.sourceIdentity || !["publisher", "upstreamRepository", "upstreamCommitOrRelease"].every((key) => typeof receipt.sourceIdentity[key] === "string" && receipt.sourceIdentity[key])) throw new Error("Plugin install receipt source identity is invalid.");
  assertSafeRelativePath(receipt.packageDirectory);
}

function validateState(state, pluginId) {
  if (!state || state.schemaVersion !== CREATION_PLUGIN_STATE_SCHEMA || state.pluginId !== pluginId || !/^receipt-[a-f0-9-]{36}$/u.test(state.activeReceiptId) || !Number.isSafeInteger(state.highestReleaseSequence) || state.highestReleaseSequence <= 0 || typeof state.enabled !== "boolean" || typeof state.quarantined !== "boolean") throw new Error("Plugin active state is invalid.");
}

function packagesRoot(root) { return path.join(root, "packages"); }
function receiptsRoot(root) { return path.join(root, "receipts"); }
function statesRoot(root) { return path.join(root, "state"); }
function transactionsRoot(root) { return path.join(root, "transactions"); }
function statePath(root, pluginId) { assertSafePluginId(pluginId); return path.join(statesRoot(root), `${pluginId}.json`); }
function receiptPath(root, pluginId, receiptId) { assertSafePluginId(pluginId); if (!/^receipt-[a-f0-9-]{36}$/u.test(receiptId)) throw new Error("Unsafe receipt id."); return path.join(receiptsRoot(root), pluginId, `${receiptId}.json`); }
function transactionPath(root, transactionId) { if (!/^tx-[a-f0-9-]{36}$/u.test(transactionId)) throw new Error("Unsafe transaction id."); return path.join(transactionsRoot(root), `${transactionId}.json`); }
function assertSafePluginId(value) { if (!/^[a-z0-9][a-z0-9-]{1,62}$/u.test(value)) throw new Error("Unsafe plugin id."); }
function assertSafeRelativePath(value) { if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/u.test(value) || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Plugin package contains a path traversal, absolute path, or unsupported archive path."); }
function assertStagingTransactionPath(value, pluginId) { assertSafeRelativePath(value); if (value.includes("/") || !value.startsWith(`.staging-${pluginId}-`) || !/^\.staging-[a-z0-9][a-z0-9-]{1,62}-[a-f0-9-]{36}$/u.test(value)) throw new Error("Plugin transaction staging path is unsafe."); }
function assertFinalTransactionPath(value, pluginId) { assertSafeRelativePath(value); const pattern = new RegExp(`^packages/${pluginId}/[1-9]\\d*-[a-f0-9]{24}$`, "u"); if (!pattern.test(value)) throw new Error("Plugin transaction final path is unsafe."); }
function assertSupportedPlatform(manifest, platform) { if (!manifest.supportedPlatforms.includes(platform)) throw new Error("Plugin is not compatible with this platform."); }
function resolveInside(root, relativePath) { assertSafeRelativePath(relativePath); const resolved = path.resolve(root, relativePath); const relative = path.relative(root, resolved); if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Plugin package path escapes its host-owned root."); return resolved; }
function foldPath(value) { return value.normalize("NFC").toLocaleLowerCase("en-US"); }
function isCanonicalBase64(value) { if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return false; return Buffer.from(value, "base64").toString("base64") === value; }
function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function digestHex(value) { return value.slice("sha256:".length); }
function packagePayloadSha(value) { return sha256(Buffer.from(canonicalJson({ ...value, manifest: { ...value.manifest, packageSha256: "sha256:pending" } }), "utf8")); }
function canonicalJson(value) { return JSON.stringify(sort(value)); }
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sort(nested)])); return value; }
function messageOf(cause) { return cause instanceof Error ? cause.message : String(cause); }
function sanitizeIntegrityReason(reason) { const known = ["tree digest", "manifest digest", "manifest identity", "entrypoint digest", "symbolic link", "non-regular", "integrity limits", "regular directory", "regular file"]; const found = known.find((value) => reason.toLowerCase().includes(value)); return found ? `Installed package integrity failed: ${found}.` : "Installed package integrity verification failed."; }
function executionState(_runtimeClass, _safeTransformRuntimeAvailable) { return "unavailable"; }
function publicEntry(entry, installed, platform, safeTransformRuntimeAvailable) {
  const compatible = entry.manifest.supportedPlatforms.includes(platform);
  const updateAvailable = Boolean(installed && entry.manifest.releaseSequence > installed.receipt.releaseSequence);
  const installState = !compatible ? "incompatible" : !installed ? entry.packagePath ? "installable" : "unavailable" : installed.state.quarantined ? "quarantined" : !installed.state.enabled ? "disabled" : updateAvailable ? "update-available" : "installed";
  return {
    manifest: structuredClone(entry.manifest),
    installState,
    executionState: installed?.state.quarantined ? "quarantined" : executionState(entry.manifest.runtimeClass, safeTransformRuntimeAvailable),
    installed: installed ? { pluginVersion: installed.receipt.version, releaseSequence: installed.receipt.releaseSequence, enabled: installed.state.enabled, packageSha256: installed.receipt.archiveDigest, runtimeClass: installed.receipt.runtimeClass } : null,
    packageAvailable: Boolean(entry.packagePath),
    packageSizeBytes: entry.packageSizeBytes,
    compatible,
    integrity: installed ? { quarantined: installed.state.quarantined, reason: installed.state.quarantineReason } : null
  };
}
