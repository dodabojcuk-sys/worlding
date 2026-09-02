import { Bot, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { AgentPermissionProfile, AgentPermissionState, ModelServiceStatus } from "../../lib/localTransport";

export type ProviderProfileUpdate = {
  expectedRevision: number;
  provider: "siliconflow" | "radeon-cloud";
  displayName: string;
  baseUrl: string;
  modelId: string;
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
  onDisableProviderProfile?(expectedRevision: number): Promise<void>;
}) {
  const providers = props.status?.providers ?? [];
  const configured = providers.filter((provider) => provider.configured);
  const selected = props.status?.profile.profile;
  const credential = props.status?.profile.credential;
  const agentRuntime = props.status?.agentRuntime;
  const availableModels = selected?.availableModels ?? [];
  const credentialInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const modelSelect = useRef<HTMLSelectElement>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerNotice, setProviderNotice] = useState("");
  const [showCredentialDraft, setShowCredentialDraft] = useState(false);
  const [manualModelEntry, setManualModelEntry] = useState(false);
  const [providerId, setProviderId] = useState<"siliconflow" | "radeon-cloud">(selected?.provider ?? "siliconflow");
  const selectedProviderMatches = selected?.provider === providerId;
  const providerPreset = providerId === "radeon-cloud"
    ? { displayName: "AMD Radeon Cloud", baseUrl: "https://developer.amd.com.cn/radeon/api/v1", modelId: "DeepSeek-V4-Flash-Vision-Exp", models: ["DeepSeek-V4-Flash-Vision-Exp"] }
    : { displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", modelId: "", models: [] as string[] };
  const visibleModels = selectedProviderMatches ? availableModels : providerPreset.models;
  const selectedModelNeedsManualEntry = Boolean((selectedProviderMatches ? selected?.modelId : providerPreset.modelId) && !visibleModels.includes(selectedProviderMatches ? selected?.modelId ?? "" : providerPreset.modelId));
  const useManualModelEntry = manualModelEntry || visibleModels.length === 0 || selectedModelNeedsManualEntry;

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
      const result = await props.onSaveProviderProfile({
        expectedRevision: props.status?.profile.revision ?? 0,
        provider: providerId,
        displayName: String(fields.get("displayName") ?? "").trim(),
        baseUrl: String(fields.get("baseUrl") ?? "").trim(),
        modelId: String(fields.get("modelId") ?? "").trim(),
        enabled: fields.get("enabled") === "on",
        ...(apiKey ? { apiKey } : {})
      });
      if (credentialInput.current) credentialInput.current.value = "";
      setProviderNotice(result.discovery === "loaded"
        ? `凭据已安全保存，已获取 ${result.modelCount} 个可用模型。请选择模型后再保存。`
        : result.discovery === "failed"
          ? `凭据已安全保存，但获取模型失败：${result.discoveryError ?? "请稍后重试或手动填写模型 ID。"}`
          : "Provider 配置已安全保存；此页面不会显示密钥。");
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
      window.requestAnimationFrame(() => (modelSelect.current ?? modelInput.current)?.focus());
    } catch (cause) {
      setProviderNotice(cause instanceof Error ? cause.message : "获取模型失败，可以手动填写模型 ID。");
    } finally { setProviderBusy(false); }
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
      <div><dt>Provider</dt><dd>{configured.length ? configured.map((provider) => provider.id).join("、") : "未配置"}</dd></div>
      <div><dt>当前模型</dt><dd>{selected?.enabled && selected.modelId ? props.status?.profiles.find((profile) => profile.modelId === selected.modelId)?.label ?? selected.modelId : "未选择"}</dd></div>
      <div><dt>流式运行</dt><dd>{props.status?.tianyiDialogue.ready ? "可用" : "不可用"}</dd></div>
      <div><dt>工具调用</dt><dd>{props.status?.models.some((model) => model.capabilities.includes("tool-calls")) ? "经 Gateway 与作者审批" : "当前模型未声明"}</dd></div>
      <div><dt>Pi Agent</dt><dd>{props.status?.tianyiDialogue.ready ? "已接入 Provider Gateway" : "等待 Provider 配置"}</dd></div>
    </dl>
    {!configured.length && <p role="status">尚未配置真实 Provider；Agent 不会用 fixture 冒充成功。</p>}
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
        <div><dt>连接状态</dt><dd>{selected?.connectionStatus ?? "unknown"}</dd></div>
        <div><dt>凭据</dt><dd className="agent-provider-credential-status">{credential?.configured && <LockKeyhole aria-hidden="true" />}{credential?.configured ? "已锁定保存" : "未配置"}</dd></div>
        <div><dt>配置范围</dt><dd>{props.status?.profile.storage.scope === "authoritative" ? "本机权威配置" : "隔离开发／测试配置"}</dd></div>
      </dl>
      {props.status?.profile.storage.compatibilityNotice && <p role="status">{props.status.profile.storage.compatibilityNotice}</p>}
      <label>Provider<select name="provider" value={providerId} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onChange={(event) => { setProviderId(event.target.value === "radeon-cloud" ? "radeon-cloud" : "siliconflow"); setManualModelEntry(false); }}><option value="siliconflow">硅基流动</option><option value="radeon-cloud">AMD Radeon Cloud</option></select></label>
      <label>显示名称<input name="displayName" required defaultValue={selectedProviderMatches ? selected?.displayName ?? providerPreset.displayName : providerPreset.displayName} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <label>服务地址<input name="baseUrl" type="url" required defaultValue={selectedProviderMatches ? selected?.baseUrl ?? providerPreset.baseUrl : providerPreset.baseUrl} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <div className="agent-provider-model-field">
        <label htmlFor="provider-model-id">模型</label>
        {useManualModelEntry
          ? <input id="provider-model-id" ref={modelInput} name="modelId" defaultValue={selectedProviderMatches ? selected?.modelId ?? providerPreset.modelId : providerPreset.modelId} placeholder="保存凭据后选择；也可手动填写模型 ID" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />
          : <select id="provider-model-id" ref={modelSelect} name="modelId" defaultValue={selectedProviderMatches ? selected?.modelId ?? providerPreset.modelId : providerPreset.modelId} disabled={providerBusy || props.busy || !props.onSaveProviderProfile}>
            <option value="">请选择可用模型</option>
            {visibleModels.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
          </select>}
        <div className="agent-provider-model-meta"><small>{visibleModels.length ? `已获取 ${visibleModels.length} 个可用模型。` : credential?.configured ? "凭据已保存，尚未获取模型。请点击“获取可用模型”。" : "首次保存不需要模型 ID；保存凭据后会自动获取模型。"}</small>{visibleModels.length > 0 && <button type="button" onClick={() => setManualModelEntry((current) => !current)}>{useManualModelEntry ? "从列表选择" : "手动填写模型 ID"}</button>}</div>
      </div>
      <div className="agent-provider-secret-field">
        <label htmlFor="provider-api-key">新的 API Key（可选）</label>
        <div className="agent-provider-secret-control"><input id="provider-api-key" ref={credentialInput} name="apiKey" type={showCredentialDraft ? "text" : "password"} autoComplete="new-password" placeholder={credential?.configured ? "输入新 Key 以替换已锁定凭据" : "输入 API Key"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /><button type="button" aria-label={showCredentialDraft ? "隐藏本次输入的 API Key" : "显示本次输入的 API Key"} title={showCredentialDraft ? "隐藏本次输入" : "显示本次输入"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} onClick={() => setShowCredentialDraft((current) => !current)}>{showCredentialDraft ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
        <small className="agent-provider-secret-note"><LockKeyhole aria-hidden="true" />{credential?.configured ? "已保存的 Key 保持锁定；输入新 Key 后保存即可替换。小眼睛只查看本次输入。" : "保存后由服务器凭据 owner 锁定持有，不会回传浏览器。"}</small>
      </div>
      <label className="agent-provider-enabled"><input name="enabled" type="checkbox" defaultChecked={selected?.enabled ?? true} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />启用此 Provider</label>
      <div className="agent-provider-actions">
        <button type="submit" disabled={providerBusy || props.busy || !props.onSaveProviderProfile}>{providerBusy ? "正在保存…" : selected?.modelId ? "保存 Provider 配置" : credential?.configured ? "保存配置并获取模型" : "保存凭据并获取模型"}</button>
        <button type="button" className={credential?.configured && availableModels.length === 0 ? "settings-primary-action" : undefined} disabled={providerBusy || props.busy || !credential?.configured || !props.onDiscoverProviderModels} onClick={discoverModels}>{availableModels.length ? "重新获取模型" : "获取可用模型"}</button>
        <button type="button" disabled={providerBusy || props.busy || !selected?.enabled || !props.onDisableProviderProfile} onClick={disableProvider}>停用 Provider</button>
      </div>
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
