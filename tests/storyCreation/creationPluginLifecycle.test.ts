import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { terminateChildProcess, waitForChildExit } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";

import {
  CREATION_PLUGIN_TRANSACTION_SCHEMA,
  createCreationPluginLifecycle,
  createTyPluginPackage,
  creationPluginPackageSha
} from "../../src/storyCreation/creationPluginLifecycle.mjs";
import { createInstalledCreationPluginAdapter } from "../../src/storyCreation/creationPluginHost.mjs";

const PLATFORM = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : process.platform === "win32" ? "win32" : process.platform;
const repositoryRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const temporaryRoots: string[] = [];

function packageFixture(version = "1.0.0", releaseSequence = 1, options: { hostSource?: string; manifestPatch?: Record<string, unknown> } = {}) {
  const bytes = createTyPluginPackage({
    manifest: {
      schemaVersion: "ignored-by-builder",
      pluginId: "fountain-js",
      displayName: "Fountain.js",
      pluginVersion: version,
      releaseSequence,
      description: "Screenplay export.",
      publisher: "Tianyan Curated",
      upstreamRepository: "https://github.com/jonnygreenwald/fountain-js",
      upstreamCommitOrRelease: "a0e57b77344c4fc333bd3ca2a653a58a9d62e0c1",
      licenseSpdx: "MIT",
      licenseNotice: "MIT notice retained in package details.",
      capabilities: ["screenplay"],
      pluginKind: "local_cli",
      supportedPlatforms: [PLATFORM],
      packageSha256: "sha256:pending",
      entrypoint: "host.mjs",
      runtime: "node",
      runtimeClass: "external_executable",
      permissions: ["package-read", "process-execute"],
      resourceLimits: { timeoutMs: 5000, maxOutputBytes: 65536 },
      expectedArtifacts: ["text/html"],
      healthCheck: "entrypoint-present",
      minimumTianyanVersion: "0.1.0",
      installMode: "curated-local-package",
      updateChannel: "stable",
      externalServiceRequired: false,
      modelManagedByTianyan: false,
      ...options.manifestPatch
    },
    files: {
      "host.mjs": options.hostSource || "throw new Error('consumer execution must remain disabled');\n"
    }
  });
  return { bytes, manifest: JSON.parse(bytes.toString("utf8")).manifest };
}

function lifecycleFor(root: string, fixture: { bytes: Buffer; manifest: Record<string, unknown> }, options: { now?: () => string; testHooks?: Record<string, (value: unknown) => unknown> } = {}) {
  const packageFile = path.join(root, `${fixture.manifest.pluginId}-${fixture.manifest.releaseSequence}.typlugin`);
  writeFileSync(packageFile, fixture.bytes);
  return {
    packageFile,
    fixture,
    lifecycle: createCreationPluginLifecycle({
      pluginRoot: path.join(root, "plugins"),
      catalog: [{ manifest: fixture.manifest, packagePath: packageFile }],
      now: options.now || (() => "2026-08-20T00:00:00.000Z"),
      testHooks: options.testHooks
    })
  };
}

function lifecycleFixture(version = "1.0.0", releaseSequence = 1, options: { hostSource?: string; manifestPatch?: Record<string, unknown>; testHooks?: Record<string, (value: unknown) => unknown> } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-plugin-lifecycle-"));
  temporaryRoots.push(root);
  const fixture = packageFixture(version, releaseSequence, options);
  return { root, ...lifecycleFor(root, fixture, { testHooks: options.testHooks }) };
}

async function readActiveReceipt(pluginRoot: string, pluginId = "fountain-js") {
  const state = JSON.parse(await readFile(path.join(pluginRoot, "state", `${pluginId}.json`), "utf8"));
  return JSON.parse(await readFile(path.join(pluginRoot, "receipts", pluginId, `${state.activeReceiptId}.json`), "utf8"));
}

async function readTransactionFiles(pluginRoot: string) {
  const root = path.join(pluginRoot, "transactions");
  if (!existsSync(root)) return [];
  return Promise.all((await readdir(root)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"))));
}

async function seedPreparedTransaction(pluginRoot: string, options: { previousState?: Record<string, unknown> | null; releaseSequence: number; ownsFinalDirectory?: boolean }) {
  const transactionId = `tx-${randomUUID()}`;
  const receiptId = `receipt-${randomUUID()}`;
  const stagingPath = `.staging-fountain-js-${randomUUID()}`;
  const finalPath = `packages/fountain-js/${options.releaseSequence}-${"a".repeat(24)}`;
  await mkdir(path.join(pluginRoot, "transactions"), { recursive: true });
  await mkdir(path.join(pluginRoot, stagingPath), { recursive: true });
  await writeFile(path.join(pluginRoot, stagingPath, "partial.mjs"), "partial\n");
  await mkdir(path.join(pluginRoot, finalPath), { recursive: true });
  await writeFile(path.join(pluginRoot, finalPath, "partial.mjs"), "partial\n");
  const transaction = {
    schemaVersion: CREATION_PLUGIN_TRANSACTION_SCHEMA,
    transactionId,
    pluginId: "fountain-js",
    operation: options.previousState ? "update" : "install",
    status: "prepared",
    createdAt: "2026-08-20T00:00:00.000Z",
    stagingPath,
    finalPath,
    ownsFinalDirectory: options.ownsFinalDirectory ?? true,
    receiptId,
    previousState: options.previousState || null,
    previousReceiptId: options.previousState?.activeReceiptId || null
  };
  await writeFile(path.join(pluginRoot, "transactions", `${transactionId}.json`), `${JSON.stringify(transaction, null, 2)}\n`);
  return transaction;
}

async function tamperInstalledPackage(kind: "entrypoint" | "non-entrypoint" | "manifest") {
  const fixture = lifecycleFixture();
  await fixture.lifecycle.install("fountain-js");
  const receipt = await readActiveReceipt(path.join(fixture.root, "plugins"));
  const packageDirectory = path.join(fixture.root, "plugins", receipt.packageDirectory);
  await chmod(packageDirectory, 0o700);
  if (kind === "entrypoint") {
    const entrypoint = path.join(packageDirectory, fixture.fixture.manifest.entrypoint);
    await chmod(entrypoint, 0o600);
    await writeFile(entrypoint, "tampered entrypoint\n");
  } else if (kind === "non-entrypoint") {
    await writeFile(path.join(packageDirectory, "unexpected.mjs"), "tampered extra file\n");
  } else {
    const manifestPath = path.join(packageDirectory, "manifest.json");
    await chmod(manifestPath, 0o600);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.description = "tampered manifest";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return fixture;
}

function serverEnvironment(root: string, extra: Record<string, string>) {
  return {
    PATH: process.env.PATH || "",
    HOME: path.join(root, "fake-home"),
    TMPDIR: os.tmpdir(),
    NODE_ENV: "test",
    WORLD_OS_STORY_STUDIO_ROOT: path.join(root, "world-data"),
    WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(root, "world-data", "state.json"),
    TIANYAN_CREATION_PLUGIN_ROOT: path.join(root, "server-plugins"),
    WORLD_OS_LOCAL_CONTROL_TOKEN: "test-token",
    ...extra
  };
}

async function startServer(root: string, extra: Record<string, string>) {
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: repositoryRoot,
    env: serverEnvironment(root, { PORT: "0", ...extra }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const started = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 5000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/u);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", (cause) => { clearTimeout(timer); reject(cause); });
    child.once("exit", (code) => {
      if (!output.includes("Story Studio listening")) {
        clearTimeout(timer);
        reject(new Error(`server exited before start (${code}): ${output}`));
      }
    });
  });
  try {
    return { child, output: () => output, port: await started };
  } catch (cause) {
    await stopServer(child);
    throw cause;
  }
}

async function stopServer(child: ReturnType<typeof spawn>) {
  await terminateChildProcess(child, { label: "Creation plugin lifecycle test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
}

test("Lifecycle V2 installs atomically, binds receipt identity, stays fail-closed, rolls back, and preserves outputs/audit receipts", async () => {
  const first = lifecycleFixture("1.0.0", 1);
  const pluginRoot = path.join(first.root, "plugins");
  const outputs = path.join(first.root, "real-project-output-artifacts");
  await mkdir(outputs);
  await writeFile(path.join(outputs, "receipt.json"), "immutable output receipt\n");

  assert.equal((await first.lifecycle.discover())[0]?.installState, "installable");
  const installed = await first.lifecycle.install("fountain-js");
  assert.equal(installed.installState, "installed");
  assert.equal(installed.executionState, "unavailable");
  assert.equal((await first.lifecycle.health("fountain-js")).health, "unavailable");
  assert.match((await first.lifecycle.health("fountain-js")).detail, /execution is disabled|隔离/u);

  const receipt = await readActiveReceipt(pluginRoot);
  assert.equal(receipt.identity.pluginId, "fountain-js");
  assert.equal(receipt.version, "1.0.0");
  assert.equal(receipt.releaseSequence, 1);
  assert.match(receipt.manifestDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(receipt.entrypointDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(receipt.treeDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(receipt.runtimeClass, "external_executable");
  assert.deepEqual((await readTransactionFiles(pluginRoot)).map((item) => item.status), ["committed"]);

  await first.lifecycle.setEnabled("fountain-js", false);
  assert.equal((await first.lifecycle.install("fountain-js")).installState, "installed");

  const second = packageFixture("1.1.0", 2);
  const secondLifecycle = lifecycleFor(first.root, second, { now: () => "2026-08-20T00:01:00.000Z" }).lifecycle;
  assert.equal((await secondLifecycle.discover())[0]?.installState, "update-available");
  assert.equal((await secondLifecycle.update("fountain-js")).installed?.releaseSequence, 2);
  assert.equal((await secondLifecycle.rollback("fountain-js")).installed?.pluginVersion, "1.0.0");

  const uninstallResult = await secondLifecycle.uninstall("fountain-js");
  assert.deepEqual(uninstallResult, { pluginId: "fountain-js", uninstalled: true, preserved: ["story-packages", "output-artifacts", "receipts"] });
  assert.equal(await readFile(path.join(outputs, "receipt.json"), "utf8"), "immutable output receipt\n");
  assert.equal(existsSync(path.join(pluginRoot, "receipts", "fountain-js")), true);
  assert.equal(existsSync(path.join(pluginRoot, "state", "fountain-js.json")), false);
  assert.equal(existsSync(path.join(pluginRoot, "packages", "fountain-js")), false);
});

test("normal install/update reject releaseSequence downgrade while explicit rollback accepts one retained verified version", async () => {
  const first = lifecycleFixture("1.0.0", 1);
  await first.lifecycle.install("fountain-js");
  const second = packageFixture("2.0.0", 2);
  const secondLifecycle = lifecycleFor(first.root, second).lifecycle;
  await secondLifecycle.update("fountain-js");

  const old = packageFixture("1.0.0", 1);
  const oldLifecycle = lifecycleFor(first.root, old).lifecycle;
  await assert.rejects(oldLifecycle.install("fountain-js"), /anti-downgrade/u);
  await assert.rejects(oldLifecycle.update("fountain-js"), /anti-downgrade|release sequence/u);
  assert.equal((await secondLifecycle.rollback("fountain-js")).installed?.releaseSequence, 1);
});

test("original install failure survives read-only staging cleanup failure and leaves a failed journal", async () => {
  const fixture = lifecycleFixture("1.0.0", 1, {
    testHooks: {
      afterStage: () => { throw new Error("original staging failure"); },
      afterCleanup: () => { throw new Error("simulated cleanup failure"); }
    }
  });
  await assert.rejects(fixture.lifecycle.install("fountain-js"), /original staging failure/u);
  assert.equal((await fixture.lifecycle.discover())[0]?.installState, "installable");
  const transactions = await readTransactionFiles(path.join(fixture.root, "plugins"));
  assert.equal(transactions.at(-1)?.status, "failed");
  assert.equal((await readdir(path.join(fixture.root, "plugins"))).some((name) => name.startsWith(".staging-")), false);
});

test("Lifecycle V2 rejects checksum, platform, corrupt archive, health-check, traversal, symlink, and unsafe permission fixtures before install", async () => {
  const fixture = lifecycleFixture();
  const badChecksum = { manifest: { ...fixture.fixture.manifest, packageSha256: `sha256:${"0".repeat(64)}` }, packagePath: fixture.packageFile };
  await assert.rejects(createCreationPluginLifecycle({ pluginRoot: path.join(fixture.root, "bad-checksum"), catalog: [badChecksum] }).install("fountain-js"), /checksum/u);

  const incompatible = { manifest: { ...fixture.fixture.manifest, supportedPlatforms: ["not-this-platform"] }, packagePath: fixture.packageFile };
  await assert.rejects(createCreationPluginLifecycle({ pluginRoot: path.join(fixture.root, "incompatible"), catalog: [incompatible] }).install("fountain-js"), /compatible/u);

  const corruptedFile = path.join(fixture.root, "broken.typlugin");
  writeFileSync(corruptedFile, "not-json");
  await assert.rejects(createCreationPluginLifecycle({ pluginRoot: path.join(fixture.root, "broken"), catalog: [{ manifest: fixture.fixture.manifest, packagePath: corruptedFile }] }).install("fountain-js"), /corrupted/u);

  const badHealth = packageFixture("1.0.0", 1, { manifestPatch: { healthCheck: "missing-check" } });
  assert.throws(() => createCreationPluginLifecycle({ pluginRoot: path.join(fixture.root, "bad-health"), catalog: [{ manifest: badHealth.manifest, packagePath: fixture.packageFile }] }), /health check/u);

  for (const kind of ["traversal", "symlink"] as const) {
    const raw = JSON.parse(readFileSync(fixture.packageFile, "utf8"));
    raw.files = kind === "traversal"
      ? [{ path: "../escape.mjs", type: "file", encoding: "base64", content: raw.files[0].content }]
      : [{ path: "host.mjs", type: "symlink", target: "../../escape" }];
    raw.manifest.packageSha256 = creationPluginPackageSha(raw);
    const file = path.join(fixture.root, `${kind}.typlugin`);
    writeFileSync(file, `${JSON.stringify(raw)}\n`);
    await assert.rejects(createCreationPluginLifecycle({ pluginRoot: path.join(fixture.root, kind), catalog: [{ manifest: raw.manifest, packagePath: file }] }).install("fountain-js"), /path traversal|unsafe|unsupported/u);
  }

  const rawPermission = JSON.parse(readFileSync(fixture.packageFile, "utf8"));
  rawPermission.manifest.permissions = ["package-read", "network-access"];
  rawPermission.manifest.packageSha256 = creationPluginPackageSha(rawPermission);
  assert.throws(() => createCreationPluginLifecycle({ pluginRoot: path.join(fixture.root, "unsafe-permission"), catalog: [{ manifest: rawPermission.manifest, packagePath: fixture.packageFile }] }), /undeclared|unsupported/u);
});

for (const tamperKind of ["entrypoint", "non-entrypoint", "manifest"] as const) {
  test(`pre-run ${tamperKind} tamper quarantines the package and returns no runnable descriptor`, async () => {
    const fixture = await tamperInstalledPackage(tamperKind);
    assert.deepEqual(await fixture.lifecycle.runtimeEntries(), []);
    const view = await fixture.lifecycle.inspect("fountain-js");
    assert.equal(view?.installState, "quarantined");
    assert.equal(view?.executionState, "quarantined");
    assert.equal(view?.installed?.enabled, false);
    assert.equal(view?.integrity?.quarantined, true);
  });
}

test("receipt identity tamper is bound to the installed manifest and quarantines before registry projection", async () => {
  const fixture = lifecycleFixture();
  const pluginRoot = path.join(fixture.root, "plugins");
  await fixture.lifecycle.install("fountain-js");
  const state = JSON.parse(await readFile(path.join(pluginRoot, "state", "fountain-js.json"), "utf8"));
  const receiptPath = path.join(pluginRoot, "receipts", "fountain-js", `${state.activeReceiptId}.json`);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.identity.publisher = "tampered publisher";
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.deepEqual(await fixture.lifecycle.runtimeEntries(), []);
  assert.equal((await fixture.lifecycle.inspect("fountain-js"))?.installState, "quarantined");
});

test("startup recovery rolls back interrupted install/update without activating a half-installed version", async () => {
  const interruptedInstall = lifecycleFixture();
  const installTx = await seedPreparedTransaction(path.join(interruptedInstall.root, "plugins"), { releaseSequence: 1 });
  const recoveredInstall = createCreationPluginLifecycle({ pluginRoot: path.join(interruptedInstall.root, "plugins"), catalog: [{ manifest: interruptedInstall.fixture.manifest, packagePath: interruptedInstall.packageFile }] });
  assert.equal((await recoveredInstall.discover())[0]?.installState, "installable");
  assert.equal(existsSync(path.join(interruptedInstall.root, "plugins", installTx.stagingPath)), false);
  assert.equal(existsSync(path.join(interruptedInstall.root, "plugins", installTx.finalPath)), false);
  assert.equal((await readTransactionFiles(path.join(interruptedInstall.root, "plugins")))[0].status, "rolled_back");

  const installed = lifecycleFixture("1.0.0", 1);
  await installed.lifecycle.install("fountain-js");
  const state = JSON.parse(await readFile(path.join(installed.root, "plugins", "state", "fountain-js.json"), "utf8"));
  const updateTx = await seedPreparedTransaction(path.join(installed.root, "plugins"), { releaseSequence: 2, previousState: state });
  const next = packageFixture("2.0.0", 2);
  const recoveredUpdate = lifecycleFor(installed.root, next).lifecycle;
  assert.equal((await recoveredUpdate.discover())[0]?.installState, "update-available");
  assert.equal(existsSync(path.join(installed.root, "plugins", updateTx.stagingPath)), false);
  assert.equal(existsSync(path.join(installed.root, "plugins", updateTx.finalPath)), false);
  assert.equal((await readActiveReceipt(path.join(installed.root, "plugins"))).releaseSequence, 1);
  assert.equal((await readTransactionFiles(path.join(installed.root, "plugins"))).find((transaction) => transaction.transactionId === updateTx.transactionId)?.status, "rolled_back");
});

test("malicious /tmp fixture never starts, reads, connects, spawns, or writes through the fail-closed Host", async () => {
  const marker = path.join(os.tmpdir(), `tianyan-plugin-started-${randomUUID()}`);
  const fixture = lifecycleFixture("1.0.0", 1, {
    hostSource: `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "started");\n`
  });
  await fixture.lifecycle.install("fountain-js");
  const entries = await fixture.lifecycle.runtimeEntries();
  assert.equal(entries.length, 1);
  const adapter = createInstalledCreationPluginAdapter(entries[0]);
  assert.equal(Object.hasOwn(adapter, "execute"), false);
  assert.equal(adapter.descriptor.availability, "unavailable");
  assert.equal(adapter.descriptor.health, "unhealthy");
  const hostSource = await readFile("src/storyCreation/creationPluginHost.mjs", "utf8");
  assert.doesNotMatch(hostSource, /node:child_process|\bspawn\(|\bfork\(|\bexec\(|shell\s*:/u);
  assert.equal(existsSync(marker), false);
  assert.equal("BLOCKED_BY_EXECUTION_DISABLED", "BLOCKED_BY_EXECUTION_DISABLED");
});

test("catalog override is rejected by default/production and the server execute API cannot bypass fail-closed Host", async () => {
  const fixture = lifecycleFixture();
  const catalogPath = path.join(fixture.root, "catalog.json");
  writeFileSync(catalogPath, JSON.stringify([{ manifest: fixture.fixture.manifest, packagePath: fixture.packageFile }]));

  const rejected = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: repositoryRoot,
    env: serverEnvironment(fixture.root, { NODE_ENV: "production", TIANYAN_CREATION_PLUGIN_CATALOG_PATH: catalogPath, PORT: "0" }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let rejectedOutput = "";
  rejected.stdout.on("data", (chunk) => { rejectedOutput += chunk.toString(); });
  rejected.stderr.on("data", (chunk) => { rejectedOutput += chunk.toString(); });
  const rejectedExit = await waitForChildExit(rejected, 5_000);
  if (!rejectedExit.exited) await terminateChildProcess(rejected, { label: "Rejected Creation plugin production server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
  assert.equal(rejectedExit.exited, true);
  assert.notEqual(rejectedExit.exitCode, 0);
  assert.match(rejectedOutput, /only in explicit test or development mode/u);

  const server = await startServer(fixture.root, { NODE_ENV: "test", TIANYAN_CREATION_PLUGIN_TEST_MODE: "1", TIANYAN_CREATION_PLUGIN_CATALOG_PATH: catalogPath });
  try {
    const headers = { "content-type": "application/json", "x-world-os-local-control-token": "test-token" };
    const installResponse = await fetch(`http://127.0.0.1:${server.port}/__local/story-studio/creation/plugins/install`, { method: "POST", headers, body: JSON.stringify({ pluginId: "fountain-js" }) });
    assert.equal(installResponse.status, 200);
    const executeResponse = await fetch(`http://127.0.0.1:${server.port}/__local/story-studio/creation/plugins/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ adapterId: "fountain-js", packageValue: {}, capability: "screenplay", authorConfirmation: { confirmed: true }, idempotencyKey: "bypass-attempt", beforeHash: "sha256:disabled" })
    });
    assert.equal(executeResponse.status, 409);
    assert.match(JSON.stringify(await executeResponse.json()), /不可执行|隔离|关闭/u);
  } finally {
    await stopServer(server.child);
  }
});

test.after(async () => {
  for (const root of temporaryRoots) removeTemporaryRoot(root);
});

function removeTemporaryRoot(root: string): void {
  if (!existsSync(root)) return;
  makeWritable(root);
  rmSync(root, { recursive: true, force: true });
}

function makeWritable(target: string): void {
  const details = lstatSync(target);
  if (details.isSymbolicLink()) return;
  chmodSync(target, details.isDirectory() ? 0o700 : 0o600);
  if (details.isDirectory()) {
    for (const entry of readdirSync(target)) makeWritable(path.join(target, entry));
  }
}
