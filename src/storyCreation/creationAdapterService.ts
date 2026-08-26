import {
  NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION,
  redactSensitiveText,
  safeRelativePackagePath,
  sha256Text,
  type NeutralStoryPackageV1
} from "./neutralStoryPackage.ts";

export const CREATION_CAPABILITIES = [
  "novel",
  "screenplay",
  "comic",
  "motion_comic",
  "interactive_story",
  "visual_novel",
  "translation_adaptation",
  "document_export"
] as const;

export type CreationCapability = typeof CREATION_CAPABILITIES[number];
export type AdapterTransport = "export_only" | "local_cli" | "local_http" | "remote_http";
export type AdapterAvailability = "available" | "unavailable" | "misconfigured" | "disabled";
export type AdapterHealth = "unknown" | "healthy" | "unhealthy" | "timeout";
export type CreationJobStatus = "queued" | "running" | "succeeded" | "failed" | "timeout" | "cancelled";

export type CreationAdapterDescriptorV1 = {
  adapterId: string;
  displayName: string;
  adapterVersion: string;
  sourceRepository: string;
  sourceCommit?: string;
  license: string;
  transport: AdapterTransport;
  capabilities: CreationCapability[];
  acceptedStoryPackageVersions: [typeof NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION];
  outputArtifactTypes: CreationCapability[];
  configurationSchema: Record<string, unknown>;
  availability: AdapterAvailability;
  health: AdapterHealth;
  requirementSummary: string;
};

export type ExternalArtifactReceiptV1 = {
  artifactId: string;
  artifactType: CreationCapability;
  fileName: string;
  relativePath: string | null;
  contentHash: `sha256:${string}`;
  byteLength: number;
  mediaType: string;
  outputArtifactOwner: "story-studio-output-artifact" | "external-file-receipt";
};

export type AdapterErrorReceiptV1 = {
  code: "unavailable" | "misconfigured" | "validation" | "timeout" | "cancelled" | "failed" | "security";
  message: string;
  retryable: boolean;
  redactedDetail?: string;
};

export type CreationJobReceiptV1 = {
  schemaVersion: "tianyan-creation-job-receipt/v1";
  jobId: string;
  adapterId: string;
  adapterVersion: string;
  inputPackageHash: `sha256:${string}`;
  requestedCapability: CreationCapability;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  authorOperation: string;
  beforeHash: `sha256:${string}` | null;
  afterHash: `sha256:${string}` | null;
  status: CreationJobStatus;
  idempotencyKey: string;
  outputArtifacts: ExternalArtifactReceiptV1[];
  stdoutSummary: string;
  stderrSummary: string;
  errorReceipt: AdapterErrorReceiptV1 | null;
  provenance: {
    packageId: string;
    packageSchemaVersion: typeof NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION;
    sourceRevision: string;
    previewConfirmedAt: string;
  };
};

export type CreationAdapterValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type CreationAdapterRegistry = {
  discover(): CreationAdapterDescriptorV1[];
  health(adapterId: string): { adapterId: string; health: AdapterHealth; checkedAt: string; detail: string };
  validate(input: { adapterId: string; packageValue: NeutralStoryPackageV1; capability: CreationCapability }): CreationAdapterValidation;
  submit(input: {
    adapterId: string;
    packageValue: NeutralStoryPackageV1;
    capability: CreationCapability;
    authorConfirmation: { confirmed: boolean; confirmedAt: string; authorOperation: string };
    idempotencyKey: string;
    beforeHash: `sha256:${string}` | null;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<CreationJobReceiptV1>;
  status(adapterId: string, jobId: string): CreationJobReceiptV1;
  cancel(adapterId: string, jobId: string): CreationJobReceiptV1;
  artifacts(adapterId: string, jobId: string): ExternalArtifactReceiptV1[];
  readArtifactContent(adapterId: string, jobId: string, artifactId: string): string;
};

export type LocalHttpAdapterRequest = {
  adapterId: string;
  packageId: string;
  packageHash: `sha256:${string}`;
  capability: CreationCapability;
  storyMarkdown: string;
};

export type LocalHttpAdapterResponse = {
  status: "succeeded";
  content: string;
  fileName?: string;
  mediaType?: string;
};

type FixtureMode = "success" | "failed" | "timeout" | "cancelled";
export type CreationAdapterExecutionInput = {
  adapterId: string;
  packageValue: NeutralStoryPackageV1;
  capability: CreationCapability;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type CreationAdapterExecutionResult = {
  status: "succeeded" | "failed" | "timeout" | "cancelled";
  content?: string;
  fileName?: string;
  mediaType?: string;
  stdoutSummary?: string;
  stderrSummary?: string;
  errorReceipt?: AdapterErrorReceiptV1;
};

export type CreationAdapterPlugin = {
  descriptor: CreationAdapterDescriptorV1;
  execute?: (input: CreationAdapterExecutionInput) => Promise<CreationAdapterExecutionResult>;
};

type AdapterDefinition = CreationAdapterDescriptorV1 & { fixtureMode?: FixtureMode; execute?: CreationAdapterPlugin["execute"] };

export function createCreationAdapterRegistry(options: { now?: () => string; includeFixtures?: boolean; localHttpRequest?: (input: LocalHttpAdapterRequest) => Promise<LocalHttpAdapterResponse>; externalAdapters?: CreationAdapterPlugin[] } = {}): CreationAdapterRegistry {
  const now = options.now || (() => new Date().toISOString());
  const definitions = [
    ...defaultDefinitions(options.includeFixtures ?? false),
    ...(options.externalAdapters || []).map((adapter) => ({ ...adapter.descriptor, execute: adapter.execute }))
  ];
  const receipts = new Map<string, CreationJobReceiptV1>();
  const artifactContents = new Map<string, string>();

  function findDefinition(adapterId: string): AdapterDefinition {
    const definition = definitions.find((candidate) => candidate.adapterId === adapterId);
    if (!definition) throw new Error(`Creation adapter is not registered: ${adapterId}`);
    return definition;
  }

  function discover(): CreationAdapterDescriptorV1[] {
    return definitions.map(stripFixtureMode).sort((left, right) => left.adapterId.localeCompare(right.adapterId));
  }

  function health(adapterId: string) {
    const definition = findDefinition(adapterId);
    return {
      adapterId,
      health: definition.health,
      checkedAt: now(),
      detail: definition.availability === "available" ? "Fixture transport is available without a real external call." : `Adapter is ${definition.availability}.`
    };
  }

  function validate(input: { adapterId: string; packageValue: NeutralStoryPackageV1; capability: CreationCapability }): CreationAdapterValidation {
    const errors: string[] = [];
    const warnings = input.packageValue.warnings.slice();
    let definition: AdapterDefinition;
    try {
      definition = findDefinition(input.adapterId);
    } catch (cause) {
      return { valid: false, errors: [messageOf(cause)], warnings };
    }
    if (input.packageValue.schemaVersion !== NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION) errors.push("Story Package version is not accepted.");
    if (!definition.capabilities.includes(input.capability)) errors.push(`Adapter does not support capability: ${input.capability}`);
    if (definition.availability !== "available") errors.push(`Adapter is ${definition.availability}.`);
    if (definition.health !== "healthy") errors.push(`Adapter health is ${definition.health}.`);
    if (!/^sha256:[a-f0-9]{64}$/u.test(input.packageValue.contentHash)) errors.push("Story Package hash is invalid.");
    if (!input.packageValue.storyMarkdown.trim()) errors.push("Story Package story.md is empty.");
    return { valid: errors.length === 0, errors, warnings };
  }

  async function submit(input: Parameters<CreationAdapterRegistry["submit"]>[0]): Promise<CreationJobReceiptV1> {
    const definition = findDefinition(input.adapterId);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new Error("Idempotency key is required.");
    if (!input.authorConfirmation.confirmed) throw new Error("Author confirmation is required before adapter execution.");
    if (input.beforeHash !== input.packageValue.contentHash) throw new Error("Author preview hash does not match the Story Package.");
    const validation = validate({ adapterId: input.adapterId, packageValue: input.packageValue, capability: input.capability });
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const replayKey = [definition.adapterId, definition.adapterVersion, input.packageValue.contentHash, input.capability, idempotencyKey].join("|");
    const existing = receipts.get(replayKey);
    if (existing) return clone(existing);
    const jobId = `job-${(await sha256Text(replayKey)).slice("sha256:".length, "sha256:".length + 20)}`;
    const startedAt = now();
    const mode = definition.fixtureMode;
    let execution: CreationAdapterExecutionResult;
    if (mode) {
      const errorReceipt = mode === "failed" ? error("failed", "Fixture adapter returned a failure.", true) : mode === "timeout" ? error("timeout", "Fixture adapter timed out.", true) : mode === "cancelled" ? error("cancelled", "Fixture adapter was cancelled.", false) : undefined;
      execution = {
        status: mode === "success" ? "succeeded" : mode,
        content: mode === "success" ? input.packageValue.storyMarkdown : undefined,
        errorReceipt,
        stdoutSummary: mode === "success" ? "fixture output generated" : "",
        stderrSummary: ""
      };
      if (definition.adapterId === "mock-http" && options.localHttpRequest && mode === "success") {
        const httpResult = await options.localHttpRequest({ adapterId: definition.adapterId, packageId: input.packageValue.packageId, packageHash: input.packageValue.contentHash, capability: input.capability, storyMarkdown: input.packageValue.storyMarkdown });
        execution = { ...execution, content: httpResult.content, fileName: httpResult.fileName, mediaType: httpResult.mediaType, stdoutSummary: "local fake HTTP response" };
      }
    } else if (definition.execute) {
      try {
        execution = await definition.execute({ adapterId: definition.adapterId, packageValue: input.packageValue, capability: input.capability, timeoutMs: boundedTimeout(input.timeoutMs), signal: input.signal });
      } catch (cause) {
        execution = { status: "failed", errorReceipt: error("failed", messageOf(cause), true), stderrSummary: messageOf(cause) };
      }
    } else {
      execution = { status: "failed", errorReceipt: error("unavailable", "Adapter has no execution host.", true), stderrSummary: "Adapter has no execution host." };
    }
    const finishedAt = now();
    const outputContent = execution.content || "";
    const outputArtifacts = execution.status === "succeeded" ? await createFixtureArtifacts(jobId, input.packageValue, input.capability, outputContent, execution.fileName, execution.mediaType) : [];
    for (const artifact of outputArtifacts) artifactContents.set(`${jobId}|${artifact.artifactId}`, outputContent);
    const afterHash = outputArtifacts.length ? await sha256Text(outputArtifacts.map((artifact) => artifact.contentHash).join("\n")) : null;
    const receipt: CreationJobReceiptV1 = {
      schemaVersion: "tianyan-creation-job-receipt/v1",
      jobId,
      adapterId: definition.adapterId,
      adapterVersion: definition.adapterVersion,
      inputPackageHash: input.packageValue.contentHash,
      requestedCapability: input.capability,
      createdAt: startedAt,
      startedAt,
      finishedAt,
      authorOperation: redactSensitiveText(input.authorConfirmation.authorOperation),
      beforeHash: input.beforeHash,
      afterHash,
      status: execution.status,
      idempotencyKey,
      outputArtifacts,
      stdoutSummary: redactAdapterSummary(execution.stdoutSummary || ""),
      stderrSummary: redactAdapterSummary(execution.stderrSummary || ""),
      errorReceipt: execution.errorReceipt ? normalizeAdapterError(execution.errorReceipt) : null,
      provenance: {
        packageId: input.packageValue.packageId,
        packageSchemaVersion: NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION,
        sourceRevision: input.packageValue.sourceRevision.revisionId,
        previewConfirmedAt: input.authorConfirmation.confirmedAt
      }
    };
    receipts.set(replayKey, clone(receipt));
    receipts.set(`${definition.adapterId}|job|${jobId}`, clone(receipt));
    return clone(receipt);
  }

  function status(adapterId: string, jobId: string): CreationJobReceiptV1 {
    findDefinition(adapterId);
    const receipt = receipts.get(`${adapterId}|job|${jobId}`);
    if (!receipt) throw new Error(`Creation job is not found: ${jobId}`);
    return clone(receipt);
  }

  function cancel(adapterId: string, jobId: string): CreationJobReceiptV1 {
    const current = status(adapterId, jobId);
    if (current.status === "queued" || current.status === "running") {
      const cancelled = { ...current, status: "cancelled" as const, errorReceipt: error("cancelled", "Author cancelled the adapter job.", false) };
      receipts.set(`${adapterId}|job|${jobId}`, clone(cancelled));
      return cancelled;
    }
    return current;
  }

  function artifacts(adapterId: string, jobId: string): ExternalArtifactReceiptV1[] {
    return status(adapterId, jobId).outputArtifacts.map(clone);
  }

  function readArtifactContent(adapterId: string, jobId: string, artifactId: string): string {
    status(adapterId, jobId);
    const content = artifactContents.get(`${jobId}|${artifactId}`);
    if (content === undefined) throw new Error(`Creation artifact is not found: ${artifactId}`);
    return content;
  }

  return { discover, health, validate, submit, status, cancel, artifacts, readArtifactContent };
}

export function createFixtureAdapterRegistry(mode: Exclude<FixtureMode, "success">, now?: () => string): CreationAdapterRegistry {
  const registry = createCreationAdapterRegistry({ now, includeFixtures: true });
  return {
    ...registry,
    discover: () => registry.discover().filter((adapter) => adapter.adapterId === `mock-${mode}`),
    health: (adapterId) => registry.health(adapterId),
    validate: (input) => registry.validate(input),
    submit: (input) => registry.submit({ ...input, adapterId: `mock-${mode}` }),
    status: (adapterId, jobId) => registry.status(adapterId, jobId),
    cancel: (adapterId, jobId) => registry.cancel(adapterId, jobId),
    artifacts: (adapterId, jobId) => registry.artifacts(adapterId, jobId),
    readArtifactContent: (adapterId, jobId, artifactId) => registry.readArtifactContent(adapterId, jobId, artifactId)
  };
}

export function redactAdapterSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value).replace(/((?:token|secret|password|cookie|authorization|api[-_]?key))\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED_SECRET]");
  if (Array.isArray(value)) return value.map(redactAdapterSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [/token|secret|password|cookie|authorization|api[-_]?key/iu.test(key) ? key : key, /token|secret|password|cookie|authorization|api[-_]?key/iu.test(key) ? "[REDACTED_SECRET]" : redactAdapterSecrets(nested)]));
  }
  return value;
}

export function assertSafeAdapterPath(value: string): string {
  return safeRelativePackagePath(value);
}

function defaultDefinitions(includeFixtures: boolean): AdapterDefinition[] {
  const commonVersion: [typeof NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION] = [NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION];
  const definitions: AdapterDefinition[] = [
    {
      adapterId: "markdown-export",
      displayName: "Markdown 导出",
      adapterVersion: "1.0.0",
      sourceRepository: "internal://tianyan/neutral-story-package",
      license: "internal",
      transport: "export_only",
      capabilities: ["document_export"],
      acceptedStoryPackageVersions: commonVersion,
      outputArtifactTypes: ["document_export"],
      configurationSchema: {},
      availability: "available",
      health: "healthy",
      requirementSummary: "无需连接外部服务；仅生成已确认 Story Package 的 Markdown 文件。",
      fixtureMode: "success"
    },
    {
      adapterId: "mock-cli",
      displayName: "Mock CLI Adapter",
      adapterVersion: "1.0.0",
      sourceRepository: "internal://tianyan/mock-cli",
      license: "test-fixture",
      transport: "local_cli",
      capabilities: ["novel", "screenplay", "document_export"],
      acceptedStoryPackageVersions: commonVersion,
      outputArtifactTypes: ["novel", "screenplay", "document_export"],
      configurationSchema: { executable: { type: "string", required: false } },
      availability: "available",
      health: "healthy",
      requirementSummary: "R0 mock only；不启动进程，不读取本机凭据。",
      fixtureMode: "success"
    },
    {
      adapterId: "mock-http",
      displayName: "Mock HTTP Adapter",
      adapterVersion: "1.0.0",
      sourceRepository: "internal://tianyan/mock-http",
      license: "test-fixture",
      transport: "local_http",
      capabilities: ["comic", "motion_comic", "interactive_story", "visual_novel"],
      acceptedStoryPackageVersions: commonVersion,
      outputArtifactTypes: ["comic", "motion_comic", "interactive_story", "visual_novel"],
      configurationSchema: { baseUrl: { type: "string", required: false } },
      availability: "available",
      health: "healthy",
      requirementSummary: "R0 mock only；不会请求真实本地或远程 HTTP 服务。",
      fixtureMode: "success"
    }
  ];
  if (includeFixtures) {
    for (const mode of ["failed", "timeout", "cancelled"] as const) {
      definitions.push({
        adapterId: `mock-${mode}`,
        displayName: `Mock ${mode}`,
        adapterVersion: "1.0.0",
        sourceRepository: `internal://tianyan/mock-${mode}`,
        license: "test-fixture",
        transport: "local_http",
        capabilities: ["document_export"],
        acceptedStoryPackageVersions: commonVersion,
        outputArtifactTypes: ["document_export"],
        configurationSchema: {},
        availability: "available",
        health: "healthy",
        requirementSummary: "测试夹具；不执行真实外部调用。",
        fixtureMode: mode
      });
    }
    definitions.push({
      adapterId: "mock-unavailable",
      displayName: "Mock Unavailable",
      adapterVersion: "1.0.0",
      sourceRepository: "internal://tianyan/mock-unavailable",
      license: "test-fixture",
      transport: "remote_http",
      capabilities: ["document_export"],
      acceptedStoryPackageVersions: commonVersion,
      outputArtifactTypes: ["document_export"],
      configurationSchema: { baseUrl: { type: "string", required: true } },
      availability: "unavailable",
      health: "timeout",
      requirementSummary: "测试夹具；模拟未连接外部工具。",
      fixtureMode: "failed"
    });
  }
  return definitions;
}

async function createFixtureArtifacts(jobId: string, packageValue: NeutralStoryPackageV1, capability: CreationCapability, content: string, requestedFileName?: string, requestedMediaType?: string): Promise<ExternalArtifactReceiptV1[]> {
  const extension = capability === "document_export" ? "md" : "txt";
  const fileName = requestedFileName ? safeFileName(requestedFileName) : `${safeFileStem(packageValue.projectRef.title)}-${capability}.${extension}`;
  const contentHash = await sha256Text(content);
  return [{
    artifactId: `${jobId}.artifact.1`,
    artifactType: capability,
    fileName,
    relativePath: `artifacts/${fileName}`,
    contentHash,
    byteLength: new TextEncoder().encode(content).byteLength,
    mediaType: requestedMediaType || (extension === "md" ? "text/markdown" : "text/plain"),
    outputArtifactOwner: capability === "document_export" ? "external-file-receipt" : "story-studio-output-artifact"
  }];
}

function safeFileName(value: string): string {
  const fileName = value.trim();
  if (!fileName || fileName === "." || fileName === ".." || fileName.includes("/") || fileName.includes("\\") || /^[A-Za-z]:/u.test(fileName)) throw new Error("Adapter returned an unsafe artifact filename.");
  return fileName.slice(0, 120);
}

function safeFileStem(value: string): string {
  const stem = redactSensitiveText(value).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80);
  return stem || "story-package";
}

function stripFixtureMode(definition: AdapterDefinition): CreationAdapterDescriptorV1 {
  const { fixtureMode: _fixtureMode, execute: _execute, ...descriptor } = definition;
  return descriptor;
}

function error(code: AdapterErrorReceiptV1["code"], message: string, retryable: boolean): AdapterErrorReceiptV1 {
  return { code, message: redactSensitiveText(message), retryable };
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30_000;
  return Math.min(300_000, Math.max(250, Math.floor(value as number)));
}

function redactAdapterSummary(value: string): string {
  return redactSensitiveText(value)
    .replace(/(?:token|secret|password|cookie|authorization|api[-_]?key)\s*[:=]\s*[^\s,;]+/giu, "[REDACTED_SECRET]")
    .slice(0, 2_000);
}

function normalizeAdapterError(value: AdapterErrorReceiptV1): AdapterErrorReceiptV1 {
  return {
    ...value,
    message: redactSensitiveText(value.message).slice(0, 500),
    ...(value.redactedDetail ? { redactedDetail: redactAdapterSummary(value.redactedDetail) } : {})
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
