import { Bot, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { AgentPermissionProfile, AgentPermissionState, ModelCatalogEntry, ModelCatalogSnapshot, ModelServiceStatus, ProviderPresetId } from "../../lib/localTransport";

export type ProviderProfileUpdate = {
  expectedRevision: number;
  provider: ProviderPresetId;
  displayName: string;
  baseUrl: string;
  llmModelId: string;
  embeddingModelId: string;
  enabled: boolean;
  /** Submitted once to the server credential owner; it is never rendered or retained in React state. */
  apiKey?: string;
};

export type ProviderProfileSaveResult = {
  discovery: "not-needed" | "loaded" | "failed";
  modelCount: number;
  discoveryError?: string;
};

export function AgentSettingsSection(props: {
  status: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  busy?: boolean;
  error?: string | null;
  onRefresh?(): void;
  onPermissionProfile?(profile: AgentPermissionProfile): Promise<void>;
  onSaveProviderProfile?(input: ProviderProfileUpdate): Promise<ProviderProfileSaveResult>;
  onDiscoverProviderModels?(): Promise<string[]>;
  onTestProviderConnection?(modelId?: string): Promise<{ modelId: string; availableModelCount: number }>;
  onProbeEmbedding?(modelId: string): Promise<{ modelId: string; dimensions: number; latencyMs: number }>;
  onDisableProviderProfile?(expectedRevision: number): Promise<void>;
}) {
  const providers = props.status?.providers ?? [];
  const selected = props.status?.profile.profile;
  const activeConfigured = providers.find((provider) => provider.id === selected?.provider)?.configured === true;
  const credential = props.status?.profile.credential;
  const agentRuntime = props.status?.agentRuntime;
  const credentialInput = useRef<HTMLInputElement>(null);
  const llmModelInput = useRef<HTMLInputElement>(null);
  const embeddingModelInput = useRef<HTMLInputElement>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerNotice, setProviderNotice] = useState("");
  const [showCredentialDraft, setShowCredentialDraft] = useState(false);
  const [providerId, setProviderId] = useState<ProviderPresetId>(selected?.provider ?? "siliconflow");
  const selectedProviderMatches = selected?.provider === providerId;
  const providerPreset = props.status?.profile.presets.find((preset) => preset.id === providerId) ?? props.status?.profile.presets[0];
  const providerInstance = props.status?.profile.providerInstances.find((instance) => instance.provider === providerId) ?? selected;
  const catalog = providerInstance?.catalog;
  const endpointEntries = catalog?.entries.filter((entry) => entry.source === "endpoint") ?? [];
  const manualEntries = catalog?.entries.filter((entry) => entry.source === "manual" || entry.source === "unverified") ?? [];
  const suggestedEntries = providerInstance?.suggestedModels ?? [];
  const visibleEntries = [...catalog?.entries ?? [], ...suggestedEntries.filter((suggestion) => !catalog?.entries.some((entry) => entry.id === suggestion.id))];
  const networkReady = selectedProviderMatches && (props.status?.profile.credentialRequired === false || credential?.configured === true);

  const permissionLabels: Record<AgentPermissionProfile, string> = { general: "逐步确认", "auto-review": "候选可自动整理", "full-access": "扩大授权范围" };
  const updatePermission = (profile: AgentPermissionProfile) => void props.onPermissionProfile?.(profile);
  const saveProvider = (event: FormEvent<HTMLFormElement>) => void (async () => {
    event.preventDefault();
    if (!props.onSaveProviderProfile) return;
    const fields = new FormData(event.currentTarget);
    const apiKey = credentialInput.current?.value.trim() ?? "";
    setProviderBusy(true);
    setProviderNotice("");
    try {
      await props.onSaveProviderProfile({
        expectedRevision: props.status?.profile.revision ?? 0,
        provider: providerId,
        displayName: String(fields.get("displayName") ?? "").trim(),
        baseUrl: String(fields.get("baseUrl") ?? "").trim(),
        llmModelId: String(fields.get("llmModelId") ?? "").trim(),
        embeddingModelId: String(fields.get("embeddingModelId") ?? "").trim(),
        enabled: fields.get("enabled") === "on",
        ...(apiKey ? { apiKey } : {})
      });
      if (credentialInput.current) credentialInput.current.value = "";
      setProviderNotice(`Provider 配置已安全保存。未发起外部请求；如需目录请单独点击“获取模型”。`);
    } catch (cause) {
      setProviderNotice(cause instanceof Error ? cause.message : "保存 Provider 配置失败。");
    } finally { setProviderBusy(false); }
  })();
  const discoverModels = () => void (async () => {
    if (!props.onDiscoverProviderModels) return;
    setProviderBusy(true);
    setProviderNotice("");
    try {
      const models = await props.onDiscoverProviderModels();
      setProviderNotice(`已获取 ${models.length} 个可用模型。请从列表选择，或手动填写模型 ID。`);
      window.requestAnimationFrame(() => llmModelInput.current?.focus());
    } catch (cause) {
      setProviderNotice(cause instanceof Error ? cause.message : "获取模型失败，可以手动填写模型 ID。");
    } finally { setProviderBusy(false); }
  })();
  const testConnection = () => void (async () => {
    if (!props.onTestProviderConnection) return;
    setProviderBusy(true); setProviderNotice("");
    try {
      const result = await props.onTestProviderConnection(llmModelInput.current?.value.trim() || undefined);
      setProviderNotice(`连接测试成功：${result.modelId}，目录 ${result.availableModelCount} 个模型。`);
    } catch (cause) { setProviderNotice(cause instanceof Error ? cause.message : "连接测试失败。"); }
    finally { setProviderBusy(false); }
  })();
  const probeEmbedding = () => void (async () => {
    const modelId = embeddingModelInput.current?.value.trim() || "";
    if (!props.onProbeEmbedding || !modelId) { setProviderNotice("请先填写 Embedding 模型 ID。"); return; }
    setProviderBusy(true); setProviderNotice("");
    try {
      const result = await props.onProbeEmbedding(modelId);
      setProviderNotice(`Embedding 验证成功：${result.modelId} · ${result.dimensions} 维 · ${result.latencyMs} ms。`);
    } catch (cause) { setProviderNotice(cause instanceof Error ? cause.message : "Embedding 验证失败。"); }
    finally { setProviderBusy(false); }
  })();
  const disableProvider = () => void (async () => {
    if (!props.onDisableProviderProfile) return;
    setProviderBusy(true);
    setProviderNotice("");
    try {
      await props.onDisableProviderProfile(props.status?.profile.revision ?? 0);
      setProviderNotice("Provider 已停用；天意不会以 fixture 代替真实响应。");
    } catch (cause) {
      setProviderNotice(cause instanceof Error ? cause.message : "停用 Provider 失败。");
    } finally { setProviderBusy(false); }
  })();

  return <section id="settings-agent-overview" className="settings-card agent-settings-section" aria-labelledby="agent-settings-title" data-agent-runtime="pi">
    <header>
      <Bot aria-hidden="true" />
      <div>
        <p>运行与授权</p><h2 id="agent-settings-title">模型、Provider 与 Pi Agent</h2>
        <p>Provider 凭据仍由私有凭据后端持有；这里仅显示可公开的连接状态。</p>
      </div>
      {props.onRefresh && <button type="button" disabled={props.busy} onClick={props.onRefresh}>刷新状态</button>}
    </header>
    <dl>
      <div><dt>Provider 实例</dt><dd>{selected?.displayName ?? "未配置"} {selected ? `· ${selected.providerInstanceId}` : ""}</dd></div>
      <div><dt>默认对话模型</dt><dd>{selected?.enabled && selected.modelId ? selected.modelId : "未选择"}</dd></div>
      <div><dt>默认 Embedding</dt><dd>{selected?.enabled && selected.embeddingModelId ? selected.embeddingModelId : "未选择"}</dd></div>
      <div><dt>流式运行</dt><dd>{props.status?.tianyiDialogue.ready ? "可用" : "不可用"}</dd></div>
      <div><dt>工具调用</dt><dd>{props.status?.tianyiDialogue.ready ? "经 Gateway 与作者审批" : "当前不可用"}</dd></div>
      <div><dt>Pi Agent</dt><dd>{props.status?.tianyiDialogue.ready ? "已接入 Provider Gateway" : "等待 Provider 配置"}</dd></div>
    </dl>
    {!activeConfigured && <p role="status">当前 Provider 尚未可用；Agent 不会用 fixture 冒充成功。</p>}
    <section id="settings-agent-runtime" className="agent-runtime-plugin-status" aria-labelledby="agent-runtime-plugin-title" data-agent-runtime-plugin={agentRuntime?.activePluginId ?? "unavailable"}>
      <div>
        <strong id="agent-runtime-plugin-title">Agent Runtime 插件</strong>
        <p>仅加载宿主白名单中的内置运行时；不会自动下载或执行第三方代码。</p>
      </div>
      <dl>
        <div><dt>运行时 ID</dt><dd>{agentRuntime?.activePluginId ?? "未启用"}</dd></div>
        <div><dt>插件版本</dt><dd>{agentRuntime?.manifest?.pluginVersion ?? "—"}</dd></div>
        <div><dt>上游 Pi 版本</dt><dd>{agentRuntime?.manifest?.upstreamVersion ?? "—"}</dd></div>
        <div><dt>Host API 兼容范围</dt><dd>{agentRuntime?.manifest?.hostApiRange ?? "—"}</dd></div>
        <div><dt>启用状态</dt><dd>{agentRuntime?.state ?? "正在读取"}</dd></div>
        <div><dt>健康状态</dt><dd>{agentRuntime?.health.status ?? "unknown"}</dd></div>
      </dl>
      {agentRuntime?.message && <p role="status">{agentRuntime.message}</p>}
      <div className="agent-runtime-plugin-actions"><button type="button" data-agent-runtime-update="check" disabled={props.busy || !props.onRefresh} onClick={props.onRefresh}>检查内置运行时状态</button><small>升级必须由产品更新流程显式提供并通过 ABI 兼容测试；此处不会拉取外部代码。</small></div>
    </section>
    <form id="settings-agent-provider" className="agent-provider-profile" onSubmit={saveProvider} key={`${props.status?.profile.revision ?? "initial"}:${providerId}`}>
      <div>
        <strong>Provider 配置</strong>
        <p>模型调用只经 Provider Gateway；密钥在提交后由服务器凭据 owner 持有，UI 仅显示掩码和连接状态。</p>
      </div>
      <dl>
        <div><dt>连接状态</dt><dd>{providerInstance?.connectionStatus ?? "unknown"}</dd></div>
        <div><dt>协议</dt><dd>{providerInstance?.protocolAdapter ?? "—"}</dd></div>
        <div><dt>凭据</dt><dd className="agent-provider-credential-status">{selectedProviderMatches && credential?.configured && <LockKeyhole aria-hidden="true" />}{providerPreset?.credentialRequired === false ? "本地运行时无需凭据" : selectedProviderMatches && credential?.configured ? "已锁定保存" : selectedProviderMatches ? "未配置" : "保存后读取该实例凭据状态"}</dd></div>
        <div><dt>配置范围</dt><dd>{props.status?.profile.storage.scope === "authoritative" ? "本机权威配置" : "隔离开发／测试配置"}</dd></div>
      </dl>
      {props.status?.profile.storage.compatibilityNotice && <p role="status">{props.status.profile.storage.compatibilityNotice}</p>}
      <label>Provider 预设<select name="provider" value={providerId} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onChange={(event) => setProviderId(event.target.value as ProviderPresetId)}>{props.status?.profile.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
      <label>显示名称<input name="displayName" required defaultValue={providerInstance?.displayName ?? providerPreset?.label ?? ""} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <label>服务地址<input name="baseUrl" type="url" required defaultValue={providerInstance?.baseUrl ?? providerPreset?.defaultBaseUrl ?? ""} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <div className="agent-provider-model-field">
        <label htmlFor="provider-llm-model-id">默认对话模型</label>
        <input id="provider-llm-model-id" ref={llmModelInput} name="llmModelId" list="provider-llm-model-options" defaultValue={providerInstance?.modelId ?? ""} placeholder="从目录选择或手工填写模型 ID" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />
        <datalist id="provider-llm-model-options">{visibleEntries.filter((entry) => entry.capabilityClaims.some((claim) => claim.capability === "llm") || entry.id === providerInstance?.modelId).map((entry) => <option key={`llm:${entry.id}`} value={entry.id}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</option>)}</datalist>
        <small>LLM 用于对话与结构化创作；能力未知的目录项不会自动归类。</small>
      </div>
      <div className="agent-provider-model-field">
        <label htmlFor="provider-embedding-model-id">默认 Embedding 模型</label>
        <input id="provider-embedding-model-id" ref={embeddingModelInput} name="embeddingModelId" list="provider-embedding-model-options" defaultValue={providerInstance?.embeddingModelId ?? ""} placeholder="手工声明后可用合成文本验证" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />
        <datalist id="provider-embedding-model-options">{visibleEntries.filter((entry) => entry.capabilityClaims.some((claim) => claim.capability === "embedding") || entry.id === providerInstance?.embeddingModelId).map((entry) => <option key={`embedding:${entry.id}`} value={entry.id}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</option>)}</datalist>
        <small>Embedding 验证只发送固定合成文本；不发送故事、人物、Canon 或知识库正文。</small>
      </div>
      <section className="agent-provider-catalog" aria-live="polite" data-catalog-state={catalog?.status ?? "never_fetched"}>
        <strong>模型目录 · {catalogStateLabel(catalog?.status ?? "never_fetched")}</strong>
        <p>{catalogSummary(catalog, endpointEntries.length)}</p>
        {catalog?.failure && <p role="alert">{catalog.failure.message}{catalog.failure.occurredAt ? ` · ${formatCatalogTime(catalog.failure.occurredAt)}` : ""}</p>}
        {endpointEntries.length > 0 && <details><summary>服务端目录 · {endpointEntries.length}</summary>{endpointEntries.map((entry) => <p key={`endpoint:${entry.id}`}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</p>)}</details>}
        {manualEntries.length > 0 && <details><summary>手工配置 / 旧记录 · {manualEntries.length}</summary>{manualEntries.map((entry) => <p key={`manual:${entry.id}`}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</p>)}</details>}
        {suggestedEntries.length > 0 && <details><summary>预设建议（未计入已获取） · {suggestedEntries.length}</summary>{suggestedEntries.map((entry) => <p key={`suggested:${entry.id}`}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</p>)}</details>}
      </section>
      <div className="agent-provider-secret-field">
        <label htmlFor="provider-api-key">新的 API Key（可选）</label>
        <div className="agent-provider-secret-control"><input id="provider-api-key" ref={credentialInput} name="apiKey" type={showCredentialDraft ? "text" : "password"} autoComplete="new-password" placeholder={credential?.configured ? "输入新 Key 以替换已锁定凭据" : "输入 API Key"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /><button type="button" aria-label={showCredentialDraft ? "隐藏本次输入的 API Key" : "显示本次输入的 API Key"} title={showCredentialDraft ? "隐藏本次输入" : "显示本次输入"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onClick={() => setShowCredentialDraft((current) => !current)}>{showCredentialDraft ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
        <small className="agent-provider-secret-note"><LockKeyhole aria-hidden="true" />{credential?.configured ? "已保存的 Key 保持锁定；输入新 Key 后保存即可替换。小眼睛只查看本次输入。" : "保存后由服务器凭据 owner 锁定持有，不会回传浏览器。"}</small>
      </div>
      <label className="agent-provider-enabled"><input name="enabled" type="checkbox" defaultChecked={providerInstance?.enabled ?? true} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />启用此 Provider</label>
      <div className="agent-provider-actions">
        <button type="submit" disabled={providerBusy || props.busy || !props.onSaveProviderProfile}>{providerBusy ? "正在保存…" : "保存 Provider 配置"}</button>
        <button type="button" className={networkReady && catalog?.status === "never_fetched" ? "settings-primary-action" : undefined} disabled={providerBusy || props.busy || !networkReady || !props.onDiscoverProviderModels} onClick={discoverModels}>{endpointEntries.length ? "重新获取模型" : "获取模型"}</button>
        <button type="button" disabled={providerBusy || props.busy || !networkReady || !props.onTestProviderConnection} onClick={testConnection}>测试连接</button>
        <button type="button" disabled={providerBusy || props.busy || !networkReady || !props.onProbeEmbedding} onClick={probeEmbedding}>验证 Embedding</button>
        <button type="reset" disabled={providerBusy || props.busy} onClick={() => { setProviderId(selected?.provider ?? "siliconflow"); setProviderNotice(""); }}>取消未保存更改</button>
        <button type="button" disabled={providerBusy || props.busy || !selected?.enabled || !props.onDisableProviderProfile} onClick={disableProvider}>停用 Provider</button>
      </div>
      <p className="agent-provider-index-gate" role="note"><strong>索引绑定门禁：</strong>更改“默认 Embedding”只影响未来新索引。已有数据集继续绑定原 index generation；配置不兼容时必须重建，不会静默迁移或混用向量。</p>
      {providerNotice && <p role={providerNotice.includes("失败") ? "alert" : "status"}>{providerNotice}</p>}
    </form>
    <fieldset id="settings-agent-permissions" className="agent-permission-settings" disabled={!props.permissionState || props.busy || !props.onPermissionProfile}>
      <legend><ShieldCheck aria-hidden="true" />默认权限</legend>
      <p>正式写入与高风险工具始终保留作者确认；这里设置日常读取和候选整理的默认范围。</p>
      {(Object.keys(permissionLabels) as AgentPermissionProfile[]).map((profile) => <label key={profile}>
        <input type="radio" name="agent-default-permission" value={profile} checked={props.permissionState?.profile === profile} onChange={() => updatePermission(profile)} />
        <span><strong>{permissionLabels[profile]}</strong><small>{profile === "general" ? "读取与草拟为主" : profile === "auto-review" ? "可生成待确认候选" : "仍不得绕过正式 owner"}</small></span>
      </label>)}
    </fieldset>
    {props.error && <p role="alert">{props.error}</p>}
  </section>;
}

function modelOptionLabel(entry: ModelCatalogEntry, providerInstanceId = "未知实例", catalog?: ModelCatalogSnapshot): string {
  const capabilities = entry.capabilityClaims.length
    ? entry.capabilityClaims.map((claim) => `${claim.capability} / ${claim.source}`).join("、")
    : "能力未知";
  const source = { endpoint: "服务端目录", manual: "手工配置", preset: "预设建议", unverified: "旧记录未验证" }[entry.source];
  const verified = entry.capabilityClaims.some((claim) => claim.source === "probed") ? "已验证" : entry.capabilityClaims.some((claim) => claim.source === "user-declared") ? "手工声明" : entry.capabilityClaims.some((claim) => claim.source === "preset-declared") ? "预设声明" : "能力未知";
  const fetched = entry.source === "endpoint" ? formatCatalogTime(catalog?.lastSuccessAt ?? null) : "无获取时间";
  const freshness = catalog?.status === "stale" ? "已过期" : catalog?.status === "failed" ? "获取失败" : verified;
  return `${entry.id} · ${providerInstanceId} · ${capabilities} · ${freshness} · ${source} · ${fetched}`;
}

function catalogStateLabel(status: ModelCatalogSnapshot["status"]): string {
  return {
    never_fetched: "尚未获取",
    loading: "正在获取",
    ready: "已获取",
    stale: "已过期，保留上次结果",
    failed: "获取失败",
    unsupported: "不支持自动目录"
  }[status];
}

function catalogSummary(catalog: ModelCatalogSnapshot | undefined, endpointCount: number): string {
  if (!catalog || catalog.status === "never_fetched") return "尚未获取目录。预设建议和手工记录不计入已获取数量。";
  if (catalog.status === "loading") return "只因作者本次显式操作而发起请求。";
  if (catalog.status === "ready") return `已获取 ${endpointCount} 个模型 · ${formatCatalogTime(catalog.lastSuccessAt)}`;
  if (catalog.status === "stale") return `保留上次成功的 ${endpointCount} 个模型 · ${formatCatalogTime(catalog.lastSuccessAt)}；它们不是本次新获取。`;
  if (catalog.status === "unsupported") return "请手工填写模型 ID，记录将标记为“手工配置”。";
  return `本次获取失败 · ${formatCatalogTime(catalog.lastAttemptAt)}`;
}

function formatCatalogTime(value: string | null): string { return value ? new Date(value).toLocaleString("zh-CN") : "时间未记录"; }
