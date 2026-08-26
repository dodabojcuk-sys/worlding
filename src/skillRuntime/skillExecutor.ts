import type { SkillPolicy } from "../skillControl/skillPolicy.ts";
import type { SkillRegistry } from "../skillControl/skillRegistry.ts";
import type { SkillToggle } from "../skillControl/skillToggle.ts";
import { loadSkillPlugin } from "./skillLoader.ts";
import { createSkillSandbox } from "./skillSandbox.ts";
import type {
  NormalizedSkillOutput,
  SkillExecutionResult,
  SkillExecutionTraceEntry,
  SkillPluginCatalog,
  SkillPluginRegistry,
  SkillRuntimeContext
} from "./skillRuntime.ts";

export type ExecuteSkillPluginInput = {
  pluginId: string;
  input: Record<string, unknown>;
  runtimeContext: SkillRuntimeContext;
  pluginRegistry: SkillPluginRegistry;
  catalog: SkillPluginCatalog;
  skillRegistry: SkillRegistry;
  policy: SkillPolicy;
  toggles?: SkillToggle[];
};

export async function executeSkillPlugin(input: ExecuteSkillPluginInput): Promise<SkillExecutionResult> {
  const loadResult = loadSkillPlugin(input);
  if (!loadResult.plugin) {
    const trace = createTrace(input.pluginId, input.runtimeContext.mode, input.input, loadResult.error, "blocked");
    return {
      ok: false,
      error: loadResult.error,
      trace: [trace]
    };
  }

  const sandbox = createSkillSandbox({
    pluginId: input.pluginId,
    mode: input.runtimeContext.mode,
    workspacePath: input.runtimeContext.workspacePath
  });

  try {
    const rawOutput = await loadResult.plugin.entry(structuredClone(input.input), sandbox);
    const output: NormalizedSkillOutput = {
      normalized: true,
      pluginId: input.pluginId,
      value: normalizeOutputValue(rawOutput)
    };
    return {
      ok: true,
      output,
      trace: [createTrace(input.pluginId, input.runtimeContext.mode, input.input, output, "success")]
    };
  } catch (error) {
    const normalizedError = {
      code: "plugin_error",
      message: String(error)
    };
    return {
      ok: false,
      error: normalizedError,
      trace: [createTrace(input.pluginId, input.runtimeContext.mode, input.input, normalizedError, "error")]
    };
  }
}

function createTrace(
  pluginId: string,
  mode: SkillRuntimeContext["mode"],
  input: unknown,
  output: unknown,
  status: SkillExecutionTraceEntry["status"]
): SkillExecutionTraceEntry {
  const errorCode = isErrorOutput(output) ? output.code : undefined;
  return {
    pluginId,
    status,
    mode,
    inputHash: stableHash(input),
    outputHash: stableHash(output),
    errorCode
  };
}

function normalizeOutputValue(value: unknown): unknown {
  if (value && typeof value === "object") {
    return sortJsonValue(value);
  }

  return value;
}

function stableHash(value: unknown): string {
  const source = JSON.stringify(sortJsonValue(value));
  let hash = 2166136261;
  for (const char of source) {
    hash ^= char.charCodeAt(0);
    hash = (hash * 16777619) >>> 0;
  }

  return `h${hash}`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== "function")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }

  return value;
}

function isErrorOutput(value: unknown): value is { code: string; message: string } {
  return Boolean(value && typeof value === "object" && "code" in value && "message" in value);
}
