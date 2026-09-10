import { Bot, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AgentPermissionProfile, AgentPermissionState, ModelCatalogEntry, ModelCatalogSnapshot, ModelServiceStatus, ProviderConnectionTestResult, ProviderInstanceProjection, ProviderPresetId } from "../../lib/localTransport";

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

type ProviderOperationState = { phase: "idle" | "running" | "succeeded" | "failed"; detail: string };
const idleProviderOperation: ProviderOperationState = { phase: "idle", detail: "尚未执行" };

export function AgentSettingsSection(props: {
  status: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  busy?: boolean;
  error?: string | null;
  onRefresh?(): void;
  onPermissionProfile?(profile: AgentPermissionProfile): Promise<void>;
  onSaveProviderProfile?(input: ProviderProfileUpdate): Promise<ProviderProfileSaveResult>;
  onDiscoverProviderModels?(): Promise<string[]>;
  onTestProviderConnection?(input: { modelId?: string; operationId: string }): Promise<ProviderConnectionTestResult>;
  onRevealProviderCredential?(providerInstanceId: string): Promise<{ providerInstanceId: string; apiKey: string }>;
  onProbeEmbedding?(modelId: string): Promise<{ modelId: string; dimensions: number; latencyMs: number }>;
  onDisableProviderProfile?(expectedRevision: number): Promise<void>;
}) {
  const providers = props.status?.providers ?? [];
  const selected = props.status?.profile.profile;
  const activeConfigured = providers.find((provider) => provider.id === selected?.provider)?.configured === true;
  const credential = props.status?.profile.credential;
  const agentRuntime = props.status?.agentRuntime;
  const nuwaN1 = props.status?.nuwaN1;
  const credentialInput = useRef<HTMLInputElement>(null);
  const providerForm = useRef<HTMLFormElement>(null);
  const revealTimer = useRef<number | null>(null);
  const llmModelInput = useRef<HTMLInputElement>(null);
  const embeddingModelInput = useRef<HTMLInputElement>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerAction, setProviderAction] = useState<"save" | "catalog" | "connection" | "embedding" | "reveal" | "disable" | null>(null);
  const [providerNotice, setProviderNotice] = useState("");
  const [catalogOperation, setCatalogOperation] = useState<ProviderOperationState>(idleProviderOperation);
  const [connectionOperation, setConnectionOperation] = useState<ProviderOperationState>(idleProviderOperation);
  const [recoverableConnectionOperation, setRecoverableConnectionOperation] = useState<{ operationId: string; modelId?: string } | null>(null);
  const [showCredentialDraft, setShowCredentialDraft] = useState(false);
  const [replaceCredential, setReplaceCredential] = useState(false);
  const [revealedCredential, setRevealedCredential] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<ProviderPresetId>(selected?.provider ?? "siliconflow");
  const selectedProviderMatches = selected?.provider === providerId;
  const providerPreset = props.status?.profile.presets.find((preset) => preset.id === providerId) ?? props.status?.profile.presets[0];
  const providerInstance = props.status?.profile.providerInstances.find((instance) => instance.provider === providerId) ?? selected;
  const [selectedModelDraft, setSelectedModelDraft] = useState(providerInstance?.modelId ?? "");
  const [embeddingModelDraft, setEmbeddingModelDraft] = useState(providerInstance?.embeddingModelId ?? "");
  const [modelQuery, setModelQuery] = useState("");
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const catalog = providerInstance?.catalog;
  const endpointEntries = catalog?.entries.filter((entry) => entry.source === "endpoint") ?? [];
  const manualEntries = catalog?.entries.filter((entry) => entry.source === "manual" || entry.source === "unverified") ?? [];
  const suggestedEntries = providerInstance?.suggestedModels ?? [];
  const visibleEntries = [...catalog?.entries ?? [], ...suggestedEntries.filter((suggestion) => !catalog?.entries.some((entry) => entry.id === suggestion.id))];
  const networkReady = selectedProviderMatches && (props.status?.profile.credentialRequired === false || credential?.configured === true);
  const clearRevealedCredential = () => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = null;
    setRevealedCredential(null);
  };

  useEffect(() => () => { if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); }, []);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("tianyan.provider.connection-test-operation");
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (typeof stored?.operationId === "string") setRecoverableConnectionOperation({ operationId: stored.operationId, ...(typeof stored.modelId === "string" ? { modelId: stored.modelId } : {}) });
    } catch { /* A malformed browser-only recovery marker is not a Provider request. */ }
  }, []);
  useEffect(() => {
    clearRevealedCredential();
    setReplaceCredential(false);
    setSelectedModelDraft(providerInstance?.modelId ?? "");
    setEmbeddingModelDraft(providerInstance?.embeddingModelId ?? "");
  }, [providerId, providerInstance?.configRevision]);

  const permissionLabels: Record<AgentPermissionProfile, string> = { general: "逐步确认", "auto-review": "候选可自动整理", "full-access": "女娲高权限自动执行" };
  const updatePermission = (profile: AgentPermissionProfile) => void props.onPermissionProfile?.(profile);
  const persistProvider = async () => {
    if (!props.onSaveProviderProfile || !providerForm.current) throw new Error("Provider 配置表单不可用。");
    const fields = new FormData(providerForm.current);
    const apiKey = credentialInput.current?.value.trim() ?? "";
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
    clearRevealedCredential();
    setReplaceCredential(false);
  };
  const saveProvider = (event: FormEvent<HTMLFormElement>) => void (async () => {
    event.preventDefault();
    setProviderBusy(true); setProviderAction("save"); setProviderNotice("");
    try {
      await persistProvider();
      setProviderNotice("Provider 配置已保存。凭据保持在服务器 owner；保存不会发起外部请求。");
    } catch (cause) { setProviderNotice(cause instanceof Error ? cause.message : "保存 Provider 配置失败。此前已保存配置保持不变。"); }
    finally { setProviderBusy(false); setProviderAction(null); }
  })();
  const discoverModels = () => void (async () => {
    if (!props.onDiscoverProviderModels) return;
    setProviderBusy(true); setProviderAction("catalog");
    setProviderNotice("");
    setCatalogOperation({ phase: "running", detail: "正在获取当前已保存实例的模型目录…" });
    try {
      const models = await props.onDiscoverProviderModels();
      setCatalogExpanded(true);
      const detail = `已获取 ${models.length} 个可用模型 · ${new Date().toLocaleString()}。`;
      setCatalogOperation({ phase: "succeeded", detail });
      setProviderNotice(`${detail} 请从列表选择，或手动填写模型 ID。`);
      window.requestAnimationFrame(() => llmModelInput.current?.focus());
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "获取模型失败，可以手动填写模型 ID。";
      setCatalogOperation({ phase: "failed", detail });
      setProviderNotice(detail);
    } finally { setProviderBusy(false); setProviderAction(null); }
  })();
  const rememberConnectionOperation = (operation: { operationId: string; modelId?: string } | null) => {
    setRecoverableConnectionOperation(operation);
    try {
      if (operation) window.sessionStorage.setItem("tianyan.provider.connection-test-operation", JSON.stringify(operation));
      else window.sessionStorage.removeItem("tianyan.provider.connection-test-operation");
    } catch { /* The operation remains recoverable for this mounted page. */ }
  };
  const runConnectionTest = async (operation: { operationId: string; modelId?: string }) => {
    if (!props.onTestProviderConnection) return;
    const result = await props.onTestProviderConnection(operation);
    const detail = result.outcome === "success"
      ? `${result.recovered ? "已恢复同一次测试" : "连接测试成功"}：${result.modelId} · ${new Date(result.testedAt).toLocaleString()} · ${result.latencyMs} ms。${result.sent ? "已发送一次合成聊天探测。" : "未发送 Provider 请求。"}${result.responsePreview ? ` 响应：${result.responsePreview}` : ""}`
      : `连接测试失败：${result.error || "上游未返回可用响应。"}`;
    setConnectionOperation({ phase: result.outcome === "success" ? "succeeded" : "failed", detail });
    setProviderNotice(detail);
    rememberConnectionOperation(null);
  };
  const testConnection = () => void (async () => {
    if (!props.onTestProviderConnection) return;
    if (hasUnsavedProviderChanges(providerForm.current, { providerId, selected, providerInstance, selectedModelDraft, embeddingModelDraft, hasCredentialDraft: Boolean(credentialInput.current?.value.trim()) })) {
      setProviderNotice("配置有未保存修改。请点击“保存并测试”，避免用旧地址、旧凭据或旧模型误判结果。");
      return;
    }
    setProviderBusy(true); setProviderAction("connection"); setProviderNotice("");
    setConnectionOperation({ phase: "running", detail: "正在用已保存的实例与当前聊天模型测试连接…" });
    const operation = { operationId: createConnectionTestOperationId(), ...(selectedModelDraft.trim() ? { modelId: selectedModelDraft.trim() } : {}) };
    rememberConnectionOperation(operation);
    try {
      await runConnectionTest(operation);
    } catch (cause) {
      const detail = `${cause instanceof Error ? cause.message : "连接测试失败。"} 可恢复本次操作，不会新发 Provider 请求。`;
      setConnectionOperation({ phase: "failed", detail }); setProviderNotice(detail);
    }
    finally { setProviderBusy(false); setProviderAction(null); }
  })();
  const saveAndTest = () => void (async () => {
    if (!props.onSaveProviderProfile || !props.onTestProviderConnection) return;
    setProviderBusy(true); setProviderAction("connection"); setProviderNotice("");
    setConnectionOperation({ phase: "running", detail: "正在保存并用新配置测试连接…" });
    try {
      const modelId = selectedModelDraft.trim() || undefined;
      await persistProvider();
      const operation = { operationId: createConnectionTestOperationId(), ...(modelId ? { modelId } : {}) };
      rememberConnectionOperation(operation);
      await runConnectionTest(operation);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "保存或连接测试失败。此前已保存配置未被清除。";
      setConnectionOperation({ phase: "failed", detail }); setProviderNotice(detail);
    }
    finally { setProviderBusy(false); setProviderAction(null); }
  })();
  const revealCredential = () => void (async () => {
    if (!props.onRevealProviderCredential || !providerInstance) return;
    if (revealedCredential) { clearRevealedCredential(); return; }
    setProviderBusy(true); setProviderAction("reveal"); setProviderNotice("");
    try {
      const result = await props.onRevealProviderCredential(providerInstance.id);
      setRevealedCredential(result.apiKey);
      revealTimer.current = window.setTimeout(clearRevealedCredential, 20_000);
      setProviderNotice("已在当前设置页暂时显示保存的密钥；20 秒后会自动隐藏，不会复制或持久化。 ");
    } catch (cause) { setProviderNotice(cause instanceof Error ? cause.message : "无法显示已保存密钥。"); }
    finally { setProviderBusy(false); setProviderAction(null); }
  })();
  const probeEmbedding = () => void (async () => {
    const modelId = embeddingModelInput.current?.value.trim() || "";
    if (!props.onProbeEmbedding || !modelId) { setProviderNotice("请先填写 Embedding 模型 ID。"); return; }
    setProviderBusy(true); setProviderAction("embedding"); setProviderNotice("");
    try {
      const result = await props.onProbeEmbedding(modelId);
      setProviderNotice(`Embedding 验证成功：${result.modelId} · ${result.dimensions} 维 · ${result.latencyMs} ms。`);
    } catch (cause) { setProviderNotice(cause instanceof Error ? cause.message : "Embedding 验证失败。"); }
    finally { setProviderBusy(false); setProviderAction(null); }
  })();
  const disableProvider = () => void (async () => {
    if (!props.onDisableProviderProfile) return;
    setProviderBusy(true); setProviderAction("disable");
    setProviderNotice("");
    try {
      await props.onDisableProviderProfile(props.status?.profile.revision ?? 0);
      setProviderNotice("Provider 已停用；天意不会以 fixture 代替真实响应。");
    } catch (cause) {
      setProviderNotice(cause instanceof Error ? cause.message : "停用 Provider 失败。");
    } finally { setProviderBusy(false); setProviderAction(null); }
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
      <div><dt>女娲运行</dt><dd>{nuwaN1?.ready ? `可运行 · ${nuwaN1.modelId}` : nuwaN1?.label ?? "等待 Provider 配置"}</dd></div>
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
    <form id="settings-agent-provider" ref={providerForm} className="agent-provider-profile" onSubmit={saveProvider} key={`${props.status?.profile.revision ?? "initial"}:${providerId}`}>
      <div>
        <strong>Provider 配置</strong>
        <p>模型调用只经 Provider Gateway；常规读取只显示掩码。只有当前管理会话中明确点击，才会短时显示已保存密钥。</p>
      </div>
      <dl>
        <div><dt>连接状态</dt><dd>{providerInstance?.connectionStatus ?? "unknown"}{providerInstance?.lastVerifiedAt ? ` · 最近验证 ${new Date(providerInstance.lastVerifiedAt).toLocaleString()}` : " · 尚未在当前配置下验证"}</dd></div>
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
        <input id="provider-llm-model-id" ref={llmModelInput} name="llmModelId" list="provider-llm-model-options" value={selectedModelDraft} onChange={(event) => setSelectedModelDraft(event.target.value)} placeholder="从目录选择或手工填写模型 ID" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />
        <datalist id="provider-llm-model-options">{visibleEntries.filter((entry) => entry.capabilityClaims.some((claim) => claim.capability === "llm") || entry.id === providerInstance?.modelId).map((entry) => <option key={`llm:${entry.id}`} value={entry.id}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</option>)}</datalist>
        <small>LLM 用于对话与结构化创作；能力未知的目录项不会自动归类。</small>
      </div>
      <div className="agent-provider-model-field">
        <label htmlFor="provider-embedding-model-id">默认 Embedding 模型</label>
        <input id="provider-embedding-model-id" ref={embeddingModelInput} name="embeddingModelId" list="provider-embedding-model-options" value={embeddingModelDraft} onChange={(event) => setEmbeddingModelDraft(event.target.value)} placeholder="手工声明后可用合成文本验证" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />
        <datalist id="provider-embedding-model-options">{visibleEntries.filter((entry) => entry.capabilityClaims.some((claim) => claim.capability === "embedding") || entry.id === providerInstance?.embeddingModelId).map((entry) => <option key={`embedding:${entry.id}`} value={entry.id}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</option>)}</datalist>
        <small>Embedding 验证只发送固定合成文本；不发送故事、人物、Canon 或知识库正文。</small>
      </div>
      <section className="agent-provider-catalog" aria-live="polite" data-catalog-state={catalog?.status ?? "never_fetched"}>
        <strong>模型目录 · {catalogStateLabel(catalog?.status ?? "never_fetched")}</strong>
        <p>{catalogSummary(catalog, endpointEntries.length)}</p>
        {catalog?.failure && <p role="alert">{catalog.failure.message}{catalog.failure.occurredAt ? ` · ${formatCatalogTime(catalog.failure.occurredAt)}` : ""}</p>}
        {visibleEntries.length > 0 && <><label>搜索模型<input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="按模型名或 ID 过滤" disabled={providerBusy || props.busy} /></label><button type="button" onClick={() => setCatalogExpanded((current) => !current)}>{catalogExpanded ? "收起模型列表" : `展开模型列表（${visibleEntries.length}）`}</button>{catalogExpanded && <div className="agent-provider-model-list">{visibleEntries.filter((entry) => entry.id.toLowerCase().includes(modelQuery.trim().toLowerCase())).map((entry) => <div key={`select:${entry.source}:${entry.id}`}><strong>{entry.label || entry.id}</strong><small>{entry.id} · {entry.source === "endpoint" ? "本次/上次服务端目录" : entry.source === "manual" ? "手工配置" : "预设建议"}</small><button type="button" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onClick={() => { setSelectedModelDraft(entry.id); setProviderNotice(`已选择 ${entry.id}；请保存后再测试或用于女娲。`); }}>选择用于对话</button></div>)}</div>}</>}
        {endpointEntries.length > 0 && <details><summary>服务端目录详情 · {endpointEntries.length}</summary>{endpointEntries.map((entry) => <p key={`endpoint:${entry.id}`}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</p>)}</details>}
        {manualEntries.length > 0 && <details><summary>手工配置 / 旧记录 · {manualEntries.length}</summary>{manualEntries.map((entry) => <p key={`manual:${entry.id}`}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</p>)}</details>}
        {suggestedEntries.length > 0 && <details><summary>预设建议（未计入已获取） · {suggestedEntries.length}</summary>{suggestedEntries.map((entry) => <p key={`suggested:${entry.id}`}>{modelOptionLabel(entry, providerInstance?.providerInstanceId, catalog)}</p>)}</details>}
      </section>
      <section className="agent-provider-validation" aria-live="polite">
        <strong>验证状态</strong>
        <p>聊天探测：{providerInstance?.lastVerifiedAt ? `${providerInstance.modelId} · ${formatCatalogTime(providerInstance.lastVerifiedAt)}` : providerInstance?.lastError || "尚未验证"}</p>
        <p>女娲：{nuwaN1?.ready ? `将使用 ${nuwaN1.providerInstanceId} / ${nuwaN1.modelId}` : nuwaN1?.label ?? "等待本地宿主配置"}</p>
        {!nuwaN1?.ready && nuwaN1?.hostGates && <p>当前宿主：Pi 适配器{nuwaN1.hostGates.piAdapterEnabled ? "已启用" : "未启用"}；真实 Provider 产品路径{nuwaN1.hostGates.realProviderProductPathEnabled ? "已启用" : "未启用"}。</p>}
      </section>
      <div className="agent-provider-secret-field">
        {selectedProviderMatches && credential?.configured && !replaceCredential ? <><label htmlFor="saved-provider-api-key">API Key</label><div className="agent-provider-secret-control">{revealedCredential ? <input id="saved-provider-api-key" value={revealedCredential} readOnly autoComplete="off" aria-label="已保存的 API Key（临时显示）" /> : <output id="saved-provider-api-key">已保存 · ••••••••</output>}<button type="button" disabled={providerBusy || props.busy || !props.onRevealProviderCredential} onClick={revealCredential}>{revealedCredential ? "隐藏已保存密钥" : "显示已保存密钥"}</button><button type="button" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onClick={() => { clearRevealedCredential(); setReplaceCredential(true); }}>更换</button></div><small className="agent-provider-secret-note"><LockKeyhole aria-hidden="true" />已保存。显示只保留在当前组件内，离开、切换实例、再次隐藏或 20 秒后清除。</small></> : <><label htmlFor="provider-api-key">{replaceCredential ? "新的 API Key（可选）" : "API Key"}</label><div className="agent-provider-secret-control"><input id="provider-api-key" ref={credentialInput} name="apiKey" type={showCredentialDraft ? "text" : "password"} autoComplete="new-password" placeholder={replaceCredential ? "输入新 Key 后保存以替换" : "输入 API Key"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /><button type="button" aria-label={showCredentialDraft ? "隐藏本次输入的 API Key" : "显示本次输入的 API Key"} title={showCredentialDraft ? "隐藏本次输入" : "显示本次输入"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onClick={() => setShowCredentialDraft((current) => !current)}>{showCredentialDraft ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>{replaceCredential && <button type="button" onClick={() => setReplaceCredential(false)}>取消更换</button>}</div><small className="agent-provider-secret-note"><LockKeyhole aria-hidden="true" />留空保存其他字段会保留原 Key；保存失败也不会清除已保存凭据。</small></>}
      </div>
      <label className="agent-provider-enabled"><input name="enabled" type="checkbox" defaultChecked={providerInstance?.enabled ?? true} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />启用此 Provider</label>
      <div className="agent-provider-actions">
        <button type="submit" disabled={providerBusy || props.busy || !props.onSaveProviderProfile}>{providerAction === "save" ? "正在保存…" : "保存 Provider 配置"}</button>
        <button type="button" className={networkReady && catalog?.status === "never_fetched" ? "settings-primary-action" : undefined} disabled={providerBusy || props.busy || !networkReady || !props.onDiscoverProviderModels} onClick={discoverModels}>{catalogOperation.phase === "running" ? "正在获取模型…" : endpointEntries.length ? "重新获取模型" : "获取模型"}</button>
        <button type="button" disabled={providerBusy || props.busy || !networkReady || !props.onTestProviderConnection} onClick={testConnection}>{connectionOperation.phase === "running" ? "正在测试连接…" : "测试连接"}</button>
        <button type="button" disabled={providerBusy || props.busy || !props.onSaveProviderProfile || !props.onTestProviderConnection} onClick={saveAndTest}>{providerAction === "connection" ? "正在保存并测试…" : "保存并测试"}</button>
        <button type="button" disabled={providerBusy || props.busy || !networkReady || !props.onProbeEmbedding} onClick={probeEmbedding}>验证 Embedding</button>
        <button type="reset" disabled={providerBusy || props.busy} onClick={() => { clearRevealedCredential(); setReplaceCredential(false); setProviderId(selected?.provider ?? "siliconflow"); setProviderNotice(""); }}>取消未保存更改</button>
        <button type="button" disabled={providerBusy || props.busy || !selected?.enabled || !props.onDisableProviderProfile} onClick={disableProvider}>停用 Provider</button>
      </div>
      <div className="agent-provider-operation-status" aria-live="polite">
        <p data-state={catalogOperation.phase}>模型目录：{catalogOperation.detail}</p>
        <p data-state={connectionOperation.phase}>连接测试：{connectionOperation.detail}</p>
        {recoverableConnectionOperation && <button type="button" disabled={providerBusy || props.busy || !props.onTestProviderConnection} onClick={() => void (async () => {
          setProviderBusy(true); setProviderAction("connection");
          setConnectionOperation({ phase: "running", detail: "正在恢复同一次连接测试回执；不会重新发送 Provider 请求…" });
          try { await runConnectionTest(recoverableConnectionOperation); }
          catch (cause) { const detail = cause instanceof Error ? cause.message : "无法恢复本次连接测试。"; setConnectionOperation({ phase: "failed", detail }); setProviderNotice(detail); }
          finally { setProviderBusy(false); setProviderAction(null); }
        })()}>恢复本次测试</button>}
        <details><summary>上次测试（只读，不发送请求）</summary>{(props.status?.profile.history ?? []).filter((entry) => entry.kind === "connection").slice(-5).reverse().map((entry) => <p key={entry.id}>{entry.status === "success" ? "成功" : "失败"} · {entry.modelId || "未记录模型"} · {new Date(entry.occurredAt).toLocaleString()} · {entry.latencyMs == null ? "耗时未记录" : `${entry.latencyMs} ms`}{entry.responsePreview ? ` · 响应：${entry.responsePreview}` : ""}{entry.error ? ` · ${entry.error}` : ""}</p>)}</details>
      </div>
      <p className="agent-provider-index-gate" role="note"><strong>索引绑定门禁：</strong>更改“默认 Embedding”只影响未来新索引。已有数据集继续绑定原 index generation；配置不兼容时必须重建，不会静默迁移或混用向量。</p>
      {providerNotice && <p role={providerNotice.includes("失败") ? "alert" : "status"}>{providerNotice}</p>}
      <p className="agent-provider-runtime-version">本服务启动版本：{props.status?.runtime?.codeRevision ?? "旧服务未记录"} · {props.status?.runtime?.startedAt ? new Date(props.status.runtime.startedAt).toLocaleString() : "启动时间未记录"}</p>
    </form>
    <fieldset id="settings-agent-permissions" className="agent-permission-settings" disabled={!props.permissionState || props.busy || !props.onPermissionProfile}>
      <legend><ShieldCheck aria-hidden="true" />默认权限</legend>
      <p>一般与自动整理仍按候选/确认路径工作。高权限仅在作者开始女娲 Run 时，为已验证的项目、故事单元和角色范围建立可撤销的自动执行授权；删除、发布、部署和跨项目读取仍受硬保护。</p>
      {(Object.keys(permissionLabels) as AgentPermissionProfile[]).map((profile) => <label key={profile}>
        <input type="radio" name="agent-default-permission" value={profile} checked={props.permissionState?.profile === profile} onChange={() => updatePermission(profile)} />
        <span><strong>{permissionLabels[profile]}</strong><small>{profile === "general" ? "读取与草拟为主" : profile === "auto-review" ? "可生成待确认候选" : "女娲在开始时取得范围授权后，可通过既有 Owner 自动写入并保留回溯"}</small></span>
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

function createConnectionTestOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `connection-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function hasUnsavedProviderChanges(form: HTMLFormElement | null, input: {
  providerId: ProviderPresetId;
  selected: ProviderInstanceProjection | null | undefined;
  providerInstance: ProviderInstanceProjection | null | undefined;
  selectedModelDraft: string;
  embeddingModelDraft: string;
  hasCredentialDraft: boolean;
}): boolean {
  if (!form || !input.providerInstance) return true;
  const fields = new FormData(form);
  return input.hasCredentialDraft
    || input.providerId !== input.selected?.provider
    || String(fields.get("displayName") ?? "").trim() !== input.providerInstance.displayName
    || String(fields.get("baseUrl") ?? "").trim() !== input.providerInstance.baseUrl
    || input.selectedModelDraft.trim() !== input.providerInstance.modelId
    || input.embeddingModelDraft.trim() !== input.providerInstance.embeddingModelId
    || (fields.get("enabled") === "on") !== input.providerInstance.enabled;
}
