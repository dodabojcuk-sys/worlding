import { Bot, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { AgentPermissionProfile, AgentPermissionState, ModelServiceStatus } from "../../lib/localTransport";

export type ProviderProfileUpdate = {
  expectedRevision: number;
  displayName: string;
  baseUrl: string;
  modelId: string;
  enabled: boolean;
  /** Submitted once to the server credential owner; it is never rendered or retained in React state. */
  apiKey?: string;
};

export function AgentSettingsSection(props: {
  status: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  busy?: boolean;
  error?: string | null;
  onRefresh?(): void;
  onPermissionProfile?(profile: AgentPermissionProfile): Promise<void>;
  onSaveProviderProfile?(input: ProviderProfileUpdate): Promise<void>;
  onDisableProviderProfile?(expectedRevision: number): Promise<void>;
}) {
  const providers = props.status?.providers ?? [];
  const configured = providers.filter((provider) => provider.configured);
  const selected = props.status?.profile.profile;
  const credential = props.status?.profile.credential;
  const credentialInput = useRef<HTMLInputElement>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerNotice, setProviderNotice] = useState("");

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
        displayName: String(fields.get("displayName") ?? "").trim(),
        baseUrl: String(fields.get("baseUrl") ?? "").trim(),
        modelId: String(fields.get("modelId") ?? "").trim(),
        enabled: fields.get("enabled") === "on",
        ...(apiKey ? { apiKey } : {})
      });
      if (credentialInput.current) credentialInput.current.value = "";
      setProviderNotice("配置已交给 Provider owner 保存；此页面不会显示密钥。");
    } catch (cause) {
      setProviderNotice(cause instanceof Error ? cause.message : "保存 Provider 配置失败。");
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

  return <section className="settings-card agent-settings-section" aria-labelledby="agent-settings-title" data-agent-runtime="pi">
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
      <div><dt>当前模型</dt><dd>{selected?.enabled ? props.status?.profiles.find((profile) => profile.modelId === selected.modelId)?.label ?? selected.modelId : "未选择"}</dd></div>
      <div><dt>流式运行</dt><dd>{props.status?.tianyiDialogue.ready ? "可用" : "不可用"}</dd></div>
      <div><dt>工具调用</dt><dd>{props.status?.models.some((model) => model.capabilities.includes("tool-calls")) ? "经 Gateway 与作者审批" : "当前模型未声明"}</dd></div>
      <div><dt>Pi Agent</dt><dd>{props.status?.tianyiDialogue.ready ? "已接入 Provider Gateway" : "等待 Provider 配置"}</dd></div>
    </dl>
    {!configured.length && <p role="status">尚未配置真实 Provider；Agent 不会用 fixture 冒充成功。</p>}
    <form className="agent-provider-profile" onSubmit={saveProvider} key={props.status?.profile.revision ?? "initial"}>
      <div>
        <strong>Provider 配置</strong>
        <p>模型调用只经 Provider Gateway；密钥在提交后由服务器凭据 owner 持有，UI 仅显示掩码和连接状态。</p>
      </div>
      <dl>
        <div><dt>连接状态</dt><dd>{selected?.connectionStatus ?? "unknown"}</dd></div>
        <div><dt>凭据</dt><dd>{credential?.configured ? `已配置${credential.suffix ? ` ····${credential.suffix}` : ""}` : "未配置"}</dd></div>
      </dl>
      <label>显示名称<input name="displayName" required defaultValue={selected?.displayName ?? "硅基流动"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <label>服务地址<input name="baseUrl" type="url" required defaultValue={selected?.baseUrl ?? "https://api.siliconflow.cn/v1"} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <label>模型 ID<input name="modelId" required defaultValue={selected?.modelId ?? ""} placeholder="选择或填写已授权模型" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <label>新的 API Key（可选）<input ref={credentialInput} name="apiKey" type="password" autoComplete="new-password" placeholder="仅在更换凭据时输入" disabled={providerBusy || props.busy || !props.onSaveProviderProfile} /></label>
      <label className="agent-provider-enabled"><input name="enabled" type="checkbox" defaultChecked={selected?.enabled ?? true} disabled={providerBusy || props.busy || !props.onSaveProviderProfile} />启用此 Provider</label>
      <div className="agent-provider-actions">
        <button type="submit" disabled={providerBusy || props.busy || !props.onSaveProviderProfile}>{providerBusy ? "正在保存…" : "保存 Provider 配置"}</button>
        <button type="button" disabled={providerBusy || props.busy || !selected?.enabled || !props.onDisableProviderProfile} onClick={disableProvider}>停用 Provider</button>
      </div>
      {providerNotice && <p role={providerNotice.includes("失败") ? "alert" : "status"}>{providerNotice}</p>}
    </form>
    <fieldset className="agent-permission-settings" disabled={!props.permissionState || props.busy || !props.onPermissionProfile}>
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
