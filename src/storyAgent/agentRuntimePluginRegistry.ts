import {
  AGENT_RUNTIME_HOST_API_VERSION,
  type AgentRuntimeEngine,
  type AgentRuntimePlugin,
  type AgentRuntimePluginManifest
} from "./agentRuntimePlugin.ts";

export type AgentRuntimePluginState = "active" | "disabled" | "missing" | "incompatible" | "initialization-failed" | "fallback";
export type AgentRuntimePluginResolution = {
  state: AgentRuntimePluginState;
  requestedPluginId: string | null;
  activePluginId: string | null;
  fallbackFromPluginId: string | null;
  message: string | null;
  manifest: AgentRuntimePluginManifest | null;
  runtime: AgentRuntimeEngine | null;
};

/**
 * A closed registry: every executable runtime is supplied by the host at
 * startup. It intentionally has no filesystem/network installer or dynamic
 * module loader; R0.6.1 accepts built-in, reviewed plugins only.
 */
export function createAgentRuntimePluginRegistry(input: { plugins: readonly AgentRuntimePlugin[]; hostApiVersion?: string; defaultPluginId: string }) {
  const hostApiVersion = input.hostApiVersion ?? AGENT_RUNTIME_HOST_API_VERSION;
  const plugins = new Map<string, AgentRuntimePlugin>();
  for (const plugin of input.plugins) {
    validateManifest(plugin.manifest);
    if (plugins.has(plugin.manifest.id)) throw new Error(`Agent Runtime 插件 ID 重复：${plugin.manifest.id}。`);
    plugins.set(plugin.manifest.id, plugin);
  }
  if (!plugins.has(input.defaultPluginId)) throw new Error("默认 Agent Runtime 插件不在内置白名单中。");
  let current: AgentRuntimePluginResolution = noRuntime("disabled", null, "Agent Runtime 尚未启用。");

  function activate(selection: { pluginId?: string | null; enabled?: boolean; fallbackPluginId?: string | null } = {}): AgentRuntimePluginResolution {
    if (current.runtime) void disposeCurrent();
    const requestedPluginId = selection.pluginId ?? input.defaultPluginId;
    if (selection.enabled === false) return current = noRuntime("disabled", requestedPluginId, "Agent Runtime 已由作者或管理员停用。");
    const requested = attempt(requestedPluginId);
    if (requested.runtime) return current = requested;
    const fallbackPluginId = selection.fallbackPluginId ?? (requestedPluginId === input.defaultPluginId ? null : input.defaultPluginId);
    if (!fallbackPluginId || fallbackPluginId === requestedPluginId) return current = requested;
    const fallback = attempt(fallbackPluginId);
    if (!fallback.runtime) return current = requested;
    return current = {
      ...fallback,
      state: "fallback",
      requestedPluginId,
      fallbackFromPluginId: requestedPluginId,
      message: `请求的 Agent Runtime 不可用，已明确回退到 ${fallbackPluginId}。`
    };
  }

  function attempt(pluginId: string): AgentRuntimePluginResolution {
    const plugin = plugins.get(pluginId);
    if (!plugin) return noRuntime("missing", pluginId, "请求的 Agent Runtime 不在内置白名单中。");
    if (!isHostApiCompatible(hostApiVersion, plugin.manifest.hostApiRange)) return noRuntime("incompatible", pluginId, `插件要求 Host API ${plugin.manifest.hostApiRange}，当前为 ${hostApiVersion}。`, plugin.manifest);
    try {
      const runtime = plugin.createRuntime({ version: AGENT_RUNTIME_HOST_API_VERSION });
      if (!runtime || typeof runtime.run !== "function" || typeof runtime.cancel !== "function") throw new Error("插件没有返回完整运行时。");
      return { state: "active", requestedPluginId: pluginId, activePluginId: pluginId, fallbackFromPluginId: null, message: null, manifest: plugin.manifest, runtime };
    } catch (error) {
      return noRuntime("initialization-failed", pluginId, error instanceof Error ? error.message : "插件初始化失败。", plugin.manifest);
    }
  }

  async function disposeCurrent(): Promise<void> {
    const runtime = current.runtime;
    const plugin = current.activePluginId ? plugins.get(current.activePluginId) : null;
    if (!runtime) return;
    if (plugin?.dispose) await plugin.dispose(runtime);
    else await runtime.dispose?.();
  }

  async function health() {
    const plugin = current.activePluginId ? plugins.get(current.activePluginId) : null;
    if (!plugin || !current.runtime) return { status: "unavailable" as const, message: current.message };
    return plugin.health();
  }

  return Object.freeze({ activate, current: () => current, health, disposeCurrent });
}

export type AgentRuntimePluginStatusProjection = Omit<AgentRuntimePluginResolution, "runtime">;
export function agentRuntimePluginStatusProjection(resolution: AgentRuntimePluginResolution): AgentRuntimePluginStatusProjection {
  const { runtime: _runtime, manifest, ...rest } = resolution;
  return { ...rest, manifest: manifest ? { ...manifest, capabilities: [...manifest.capabilities] } : null };
}

function noRuntime(state: Exclude<AgentRuntimePluginState, "active" | "fallback">, requestedPluginId: string | null, message: string, manifest: AgentRuntimePluginManifest | null = null): AgentRuntimePluginResolution {
  return { state, requestedPluginId, activePluginId: null, fallbackFromPluginId: null, message, manifest, runtime: null };
}

function validateManifest(manifest: AgentRuntimePluginManifest): void {
  if (!/^agent\.[a-z0-9][a-z0-9.-]*$/u.test(manifest.id)) throw new Error("Agent Runtime 插件 ID 必须是稳定的 agent.* 标识。");
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/iu.test(manifest.pluginVersion)) throw new Error("Agent Runtime 插件版本必须是 SemVer。");
  if (!/^\^?\d+\.\d+\.\d+$/u.test(manifest.hostApiRange)) throw new Error("Agent Runtime Host API 兼容范围必须是明确的 SemVer 范围。");
  if (!manifest.capabilities.length) throw new Error("Agent Runtime 插件必须声明能力。");
}

export function isHostApiCompatible(hostVersion: string, range: string): boolean {
  const host = parseVersion(hostVersion);
  const required = parseVersion(range.replace(/^\^/u, ""));
  if (!host || !required) return false;
  if (range.startsWith("^")) return host.major === required.major && compare(host, required) >= 0;
  return compare(host, required) === 0;
}

function parseVersion(value: string): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}
function compare(left: { major: number; minor: number; patch: number }, right: { major: number; minor: number; patch: number }): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}
