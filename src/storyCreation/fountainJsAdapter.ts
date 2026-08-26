import {
  NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION,
  redactSensitiveText,
  type NeutralStoryPackageV1
} from "./neutralStoryPackage.ts";
import type {
  AdapterErrorReceiptV1,
  CreationAdapterExecutionInput,
  CreationAdapterExecutionResult,
  CreationAdapterPlugin
} from "./creationAdapterService.ts";

export const FOUNTAIN_JS_ADAPTER_ID = "fountain-js" as const;
export const FOUNTAIN_JS_REPOSITORY = "https://github.com/jonnygreenwald/fountain-js" as const;
export const FOUNTAIN_JS_COMMIT = "a0e57b77344c4fc333bd3ca2a653a58a9d62e0c1" as const;
export const FOUNTAIN_JS_LICENSE = "MIT" as const;
export const FOUNTAIN_JS_VERSION = "1.2.4" as const;

export type FountainJsParseInput = {
  fountainSource: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type FountainJsParseResult = {
  status: "succeeded" | "failed" | "timeout" | "cancelled";
  html?: string;
  tokenCount?: number;
  stdoutSummary?: string;
  stderrSummary?: string;
  errorReceipt?: AdapterErrorReceiptV1;
};

export type FountainJsParser = (input: FountainJsParseInput) => Promise<FountainJsParseResult>;

export function buildFountainScreenplayInput(packageValue: NeutralStoryPackageV1): string {
  const title = redactSensitiveText(packageValue.projectRef.title).replace(/[\r\n]+/gu, " ").trim() || "Story Package";
  const body = packageValue.storyMarkdown.trim();
  return [`Title: ${title}`, "", `INT. ${title.toUpperCase()} - DAY`, "", body, ""].join("\n");
}

export function createFountainJsAdapterPlugin(options: { parser?: FountainJsParser; adapterVersion?: string } = {}): CreationAdapterPlugin {
  const configured = typeof options.parser === "function";
  return {
    descriptor: {
      adapterId: FOUNTAIN_JS_ADAPTER_ID,
      displayName: "Fountain.js",
      adapterVersion: options.adapterVersion || FOUNTAIN_JS_VERSION,
      sourceRepository: FOUNTAIN_JS_REPOSITORY,
      sourceCommit: FOUNTAIN_JS_COMMIT,
      license: FOUNTAIN_JS_LICENSE,
      transport: "export_only",
      capabilities: ["screenplay"],
      acceptedStoryPackageVersions: [NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION],
      outputArtifactTypes: ["screenplay"],
      configurationSchema: {
        parserHost: { type: "string", required: true, secret: false, description: "外部 Fountain.js host；只接收故事包投影。" }
      },
      availability: configured ? "available" : "unavailable",
      health: configured ? "healthy" : "unknown",
      requirementSummary: configured
        ? "已连接外部 Fountain.js 解析器；只生成预览，不自动写入项目。"
        : "需要显式连接 Fountain.js 外部解析器；当前环境未连接。"
    },
    execute: configured ? async (input) => executeFountainJs(options.parser!, input) : undefined
  };
}

async function executeFountainJs(parser: FountainJsParser, input: CreationAdapterExecutionInput): Promise<CreationAdapterExecutionResult> {
  const result = await parser({
    fountainSource: buildFountainScreenplayInput(input.packageValue),
    timeoutMs: input.timeoutMs,
    signal: input.signal
  });
  if (result.status !== "succeeded") {
    return {
      status: result.status,
      stdoutSummary: result.stdoutSummary,
      stderrSummary: result.stderrSummary,
      errorReceipt: result.errorReceipt || {
        code: result.status === "timeout" ? "timeout" : result.status === "cancelled" ? "cancelled" : "failed",
        message: result.status === "timeout" ? "Fountain.js adapter timed out." : result.status === "cancelled" ? "Fountain.js adapter was cancelled." : "Fountain.js adapter failed.",
        retryable: result.status !== "cancelled"
      }
    };
  }
  if (!result.html?.trim()) {
    return {
      status: "failed",
      stdoutSummary: result.stdoutSummary,
      stderrSummary: result.stderrSummary,
      errorReceipt: { code: "failed", message: "Fountain.js returned an empty screenplay preview.", retryable: true }
    };
  }
  return {
    status: "succeeded",
    content: result.html,
    fileName: `${safeFileStem(input.packageValue.projectRef.title)}.screenplay.html`,
    mediaType: "text/html",
    stdoutSummary: result.stdoutSummary || `Fountain.js parsed ${result.tokenCount || 0} tokens.`,
    stderrSummary: result.stderrSummary || ""
  };
}

function safeFileStem(value: string): string {
  const stem = redactSensitiveText(value).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80);
  return stem || "story-package";
}
