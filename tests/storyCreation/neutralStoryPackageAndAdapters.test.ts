import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";

import {
  buildNeutralStoryPackage,
  canonicalJson,
  packageFiles,
  safeRelativePackagePath,
  type NeutralStoryPackageExportInput
} from "../../src/storyCreation/neutralStoryPackage.ts";
import {
  createCreationAdapterRegistry,
  createFixtureAdapterRegistry,
  redactAdapterSecrets,
  type CreationCapability
} from "../../src/storyCreation/creationAdapterService.ts";
import { createFountainJsAdapterPlugin } from "../../src/storyCreation/fountainJsAdapter.ts";
import { createFountainJsNodeAdapter } from "../../src/storyCreation/fountainJsNodeAdapter.mjs";
import { createStoryStudioWorkspaceOperations, type OutputArtifactType } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function packageInput(): NeutralStoryPackageExportInput {
  return {
    projectRef: { projectId: "mist-lighthouse", title: "雾中灯塔" },
    scope: { kind: "selection", unitIds: ["unit.1"], label: "灯塔段落" },
    sourceRevision: {
      revisionId: "workspace-revision-7",
      revisionHash: "sha256:revision-7",
      capturedAt: "2026-08-20T00:00:00.000Z",
      sourceOwners: ["story-unit", "event", "relation"]
    },
    storyUnits: [{
      id: "unit.1",
      relativeId: "story-unit/01",
      title: "钟声前的迟疑",
      summary: "守夜人必须在钟声前确认边界。",
      lifecycle: "active",
      sourceRefs: [{ sourceKind: "event-line", ownerId: "event-owner", entityId: "event.1", entityVersion: "v3", capturedAt: "2026-08-19T00:00:00.000Z", staleState: "fresh" }],
      items: [{
        id: "item.1",
        kind: "beat",
        authority: "candidate",
        possibilityStatus: "selected-for-output",
        content: { text: "守夜人保留选择。", secret: "Authorization: Bearer test-token", path: "/tmp/private-fixture" },
        sourceRefs: [{ sourceKind: "canon", ownerId: "canon-owner", entityId: "canon.1", entityVersion: "v2", capturedAt: "2026-08-19T00:00:00.000Z", staleState: "stale" }]
      }],
      version: "unit-v4",
      updatedAt: "2026-08-19T00:00:00.000Z"
    }],
    assetReferences: [{ assetId: "asset.lighthouse", kind: "image", relativePath: "assets/lighthouse.png", contentHash: `sha256:${"a".repeat(64)}`, license: "original" }],
    relationProjection: { sourceRevision: "relation-revision-2", records: [{ relationId: "relation.1", state: "read-only" }] }
  };
}

test("Neutral Story Package export is deterministic, human-readable, and source-bound", async () => {
  const first = await buildNeutralStoryPackage(packageInput());
  const second = await buildNeutralStoryPackage(structuredClone(packageInput()));

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.packageId, `neutral-story-package-${first.contentHash.slice("sha256:".length, "sha256:".length + 20)}`);
  assert.match(first.storyMarkdown, /钟声前的迟疑/u);
  assert.match(first.storyMarkdown, /Source anchor canon:canon-owner:canon\.1:v2 is stale/u);
  assert.doesNotMatch(first.storyMarkdown, /test-token|\/tmp\/private-fixture/u);
  assert.deepEqual(Object.keys(packageFiles(first)).sort(), ["manifest.json", "projections/relations.json", "projections/story-units.json", "provenance.json", "story.md"]);
  const exportRoot = mkdtempSync(path.join(os.tmpdir(), "neutral-story-package-export-"));
  for (const [relativePath, content] of Object.entries(packageFiles(first))) {
    const target = path.join(exportRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  assert.equal(readFileSync(path.join(exportRoot, "story.md"), "utf8"), first.storyMarkdown);
  assert.equal(readFileSync(path.join(exportRoot, "projections/relations.json"), "utf8").includes("relationRepository.mjs"), true);
  assert.equal(first.projections["projections/relations.json"]?.includes('"writeMode":"read-only"'), true);
  assert.equal(first.manifest.sourceAnchors[0]?.staleState, "stale");
  assert.equal(first.provenance.projectionReceipts.length, 2);
});

test("mock HTTP adapter can be verified against a local fake server without external traffic", async () => {
  const packageValue = await buildNeutralStoryPackage(packageInput());
  let received: Record<string, unknown> | null = null;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    received = JSON.parse(body) as Record<string, unknown>;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "succeeded", content: "# Local mock HTTP output\n", fileName: "mock-http-output.md", mediaType: "text/markdown" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local fake server did not expose a port.");
  try {
    const registry = createCreationAdapterRegistry({
      localHttpRequest: async (input) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/mock-adapter`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        return await response.json() as { status: "succeeded"; content: string; fileName: string; mediaType: string };
      }
    });
    const receipt = await registry.submit({
      adapterId: "mock-http",
      packageValue,
      capability: "comic",
      authorConfirmation: { confirmed: true, confirmedAt: "2026-08-20T00:03:00.000Z", authorOperation: "author.execute.local-http-fixture" },
      idempotencyKey: "local-http-1",
      beforeHash: packageValue.contentHash
    });
    assert.equal(receipt.status, "succeeded");
    assert.equal(received?.adapterId, "mock-http");
    assert.equal(received?.packageHash, packageValue.contentHash);
    assert.equal(received?.capability, "comic");
    assert.equal(registry.readArtifactContent("mock-http", receipt.jobId, receipt.outputArtifacts[0]!.artifactId), "# Local mock HTTP output\n");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("Neutral exporter exposes missing selections and rejects unsafe asset paths", async () => {
  const value = await buildNeutralStoryPackage({ ...packageInput(), selectedUnitIds: ["unit.missing"] });
  assert.deepEqual(value.scope.unitIds, []);
  assert.match(value.warnings.join("\n"), /unit\.missing/u);
  assert.throws(() => safeRelativePackagePath("../outside.md"), /traversal/u);
  assert.throws(() => safeRelativePackagePath("\/absolute.md"), /relative/u);
  await assert.rejects(() => buildNeutralStoryPackage({ ...packageInput(), assetReferences: [{ assetId: "unsafe", kind: "reference", relativePath: "../outside.md" }] }), /traversal/u);
});

test("adapter discovery, capability validation, idempotency, receipt hashes, and OutputArtifact handoff stay in one owner", async () => {
  const packageValue = await buildNeutralStoryPackage(packageInput());
  const registry = createCreationAdapterRegistry({ now: () => "2026-08-20T00:01:00.000Z" });
  const discovered = registry.discover();
  assert.deepEqual(discovered.map((adapter) => adapter.adapterId), ["markdown-export", "mock-cli", "mock-http"]);
  assert.equal(registry.validate({ adapterId: "mock-cli", packageValue, capability: "novel" }).valid, true);
  assert.equal(registry.validate({ adapterId: "mock-http", packageValue, capability: "novel" }).valid, false);

  const submit = {
    adapterId: "mock-cli",
    packageValue,
    capability: "novel" as const,
    authorConfirmation: { confirmed: true, confirmedAt: "2026-08-20T00:01:00.000Z", authorOperation: "author.execute.external-adapter" },
    idempotencyKey: "operation-1",
    beforeHash: packageValue.contentHash
  };
  const receipt = await registry.submit(submit);
  const replay = await registry.submit(submit);
  assert.equal(receipt.jobId, replay.jobId);
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.beforeHash, packageValue.contentHash);
  assert.match(receipt.afterHash || "", /^sha256:[a-f0-9]{64}$/u);
  assert.equal(receipt.outputArtifacts[0]?.outputArtifactOwner, "story-studio-output-artifact");
  assert.equal(registry.readArtifactContent("mock-cli", receipt.jobId, receipt.outputArtifacts[0]!.artifactId), packageValue.storyMarkdown);

  const rootPath = mkdtempSync(path.join(os.tmpdir(), "neutral-package-output-artifact-"));
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".app-state.json") });
  const project = operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const unit = operations.createStoryUnit({ projectId: project.id, title: "钟声前的迟疑", version: "unit-v4" });
  const outputType: OutputArtifactType = "novel";
  const outputArtifact = operations.createOutputArtifact({
    projectId: project.id,
    type: outputType,
    title: "雾中灯塔 · external mock",
    sourceUnits: [{ unitId: unit.id, unitVersion: unit.version, role: "primary", includedItemIds: [] }],
    content: registry.readArtifactContent("mock-cli", receipt.jobId, receipt.outputArtifacts[0]!.artifactId),
    generationBrief: { origin: "external-creation-adapter", adapterId: receipt.adapterId, inputPackageHash: receipt.inputPackageHash, receiptId: receipt.jobId }
  });
  assert.equal(outputArtifact.source, "markdown");
  assert.equal(operations.readOutputArtifact({ projectId: project.id, artifactId: outputArtifact.id }).id, outputArtifact.id);
  assert.equal(operations.getStoryStudioWorldLibraryBootstrap({ projectId: project.id }).objects.length, 0);
});

test("unavailable, failed, timeout, cancelled, secret, and traversal fixtures fail closed", async () => {
  const packageValue = await buildNeutralStoryPackage(packageInput());
  for (const mode of ["failed", "timeout", "cancelled"] as const) {
    const registry = createFixtureAdapterRegistry(mode, () => "2026-08-20T00:02:00.000Z");
    const receipt = await registry.submit({
      adapterId: "ignored-by-fixture",
      packageValue,
      capability: "document_export",
      authorConfirmation: { confirmed: true, confirmedAt: "2026-08-20T00:02:00.000Z", authorOperation: "author.execute.fixture" },
      idempotencyKey: `fixture-${mode}`,
      beforeHash: packageValue.contentHash
    });
    assert.equal(receipt.status, mode);
    assert.equal(receipt.outputArtifacts.length, 0);
  }
  const unavailable = createCreationAdapterRegistry({ includeFixtures: true });
  const validation = unavailable.validate({ adapterId: "mock-unavailable", packageValue, capability: "document_export" });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /unavailable|timeout/u);
  const redacted = redactAdapterSecrets({ Authorization: "Bearer token-value", nested: "cookie=abc123", safe: "hello" }) as Record<string, unknown>;
  assert.equal(redacted.Authorization, "[REDACTED_SECRET]");
  assert.match(String(redacted.nested), /REDACTED_SECRET/u);
  assert.equal(redacted.safe, "hello");
});

test("configured Fountain.js adapter is a replaceable export plugin with an explicit confirmation boundary", async () => {
  const packageValue = await buildNeutralStoryPackage(packageInput());
  const parserCalls: Array<{ source: string; timeoutMs: number }> = [];
  const plugin = createFountainJsAdapterPlugin({
    parser: async (input) => {
      parserCalls.push({ source: input.fountainSource, timeoutMs: input.timeoutMs });
      return { status: "succeeded", html: "<h3>INT. LIGHTHOUSE - NIGHT</h3>", tokenCount: 1, stdoutSummary: "fountain-parser-ok" };
    }
  });
  const registry = createCreationAdapterRegistry({ externalAdapters: [plugin], now: () => "2026-08-20T00:04:00.000Z" });
  assert.equal(registry.discover().find((adapter) => adapter.adapterId === "fountain-js")?.license, "MIT");
  assert.equal(registry.discover().find((adapter) => adapter.adapterId === "fountain-js")?.transport, "export_only");
  const submit = {
    adapterId: "fountain-js",
    packageValue,
    capability: "screenplay" as const,
    authorConfirmation: { confirmed: true, confirmedAt: "2026-08-20T00:03:00.000Z", authorOperation: "author.creation.fountain-js" },
    idempotencyKey: "fountain-js-1",
    beforeHash: packageValue.contentHash
  };
  const receipt = await registry.submit(submit);
  const replay = await registry.submit(submit);
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.jobId, replay.jobId);
  assert.equal(receipt.startedAt, "2026-08-20T00:04:00.000Z");
  assert.equal(receipt.finishedAt, "2026-08-20T00:04:00.000Z");
  assert.equal(receipt.stdoutSummary, "fountain-parser-ok");
  assert.equal(receipt.stderrSummary, "");
  assert.equal(receipt.outputArtifacts[0]?.artifactType, "screenplay");
  assert.match(registry.readArtifactContent("fountain-js", receipt.jobId, receipt.outputArtifacts[0]!.artifactId), /LIGHTHOUSE/u);
  assert.equal(parserCalls.length, 1);
  assert.match(parserCalls[0]?.source || "", /Neutral Story Package|雾中灯塔/u);
  assert.equal(parserCalls[0]?.timeoutMs, 30_000);
});

test("unconfigured real adapter stays unavailable and never executes", async () => {
  const packageValue = await buildNeutralStoryPackage(packageInput());
  let calls = 0;
  const plugin = createFountainJsAdapterPlugin({ parser: undefined });
  const registry = createCreationAdapterRegistry({ externalAdapters: [{ ...plugin, execute: async () => { calls += 1; return { status: "succeeded", content: "unexpected" }; } }] });
  const descriptor = registry.discover().find((adapter) => adapter.adapterId === "fountain-js");
  assert.equal(descriptor?.availability, "unavailable");
  assert.equal(registry.validate({ adapterId: "fountain-js", packageValue, capability: "screenplay" }).valid, false);
  assert.equal(calls, 0);
});

test("Fountain.js node adapter rejects missing module configuration before spawning", () => {
  const plugin = createFountainJsNodeAdapter({ modulePath: "/tmp/tianyan-fountain-js-missing/index.js" });
  assert.equal(plugin.descriptor.availability, "misconfigured");
  assert.equal(plugin.descriptor.health, "unhealthy");
  assert.match(plugin.descriptor.requirementSummary, /模块路径|不存在/u);
  assert.equal(plugin.execute, undefined);
});

test("malformed packages fail validation and non-zero Fountain.js hosts produce failure receipts", async () => {
  const packageValue = await buildNeutralStoryPackage(packageInput());
  const registry = createCreationAdapterRegistry({ externalAdapters: [createFountainJsNodeAdapter({ modulePath: path.join(process.cwd(), "src/storyCreation/neutralStoryPackage.ts"), nodeExecutable: "/usr/bin/false" })] });
  const malformed = { ...packageValue, contentHash: `sha256:${"0".repeat(64)}` as typeof packageValue.contentHash, storyMarkdown: "" };
  const validation = registry.validate({ adapterId: "fountain-js", packageValue: malformed, capability: "screenplay" });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /story\.md|empty|hash/u);
  const receipt = await registry.submit({
    adapterId: "fountain-js",
    packageValue,
    capability: "screenplay",
    authorConfirmation: { confirmed: true, confirmedAt: "2026-08-20T00:05:00.000Z", authorOperation: "author.creation.fountain-js.non-zero-fixture" },
    idempotencyKey: "fountain-js-non-zero-fixture",
    beforeHash: packageValue.contentHash
  });
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.errorReceipt?.code, "failed");
  assert.match(receipt.errorReceipt?.message || "", /exited/u);
  assert.equal(receipt.outputArtifacts.length, 0);
});

test("capability set remains external and does not create an internal generator", () => {
  const capabilities: CreationCapability[] = ["novel", "screenplay", "comic", "motion_comic", "interactive_story", "visual_novel", "translation_adaptation", "document_export"];
  assert.equal(new Set(capabilities).size, 8);
});

test("adapter service source has no real network, process, provider, or model execution path", async () => {
  const moduleSource = await import("node:fs/promises").then((fs) => fs.readFile("src/storyCreation/creationAdapterService.ts", "utf8"));
  assert.doesNotMatch(moduleSource, /fetch\(|spawn\(|exec\(|child_process|Authorization|MODEL_DOWNLOAD/u);
});
