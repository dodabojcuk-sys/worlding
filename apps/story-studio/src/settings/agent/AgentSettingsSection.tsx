import { Bot, ShieldCheck } from "lucide-react";
import type { AgentPermissionProfile, AgentPermissionState, ModelServiceStatus } from "../../lib/localTransport";

export function AgentSettingsSection(props: {
  status: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  busy?: boolean;
  error?: string | null;
  onRefresh?(): void;
  onPermissionProfile?(profile: AgentPermissionProfile): Promise<void>;
}) {
  const providers = props.status?.providers ?? [];
  const configured = providers.filter((provider) => provider.configured);
  const selected = props.status?.profile.profile;

  const permissionLabels: Record<AgentPermissionProfile, string> = { general: "逐步确认", "auto-review": "候选可自动整理", "full-access": "扩大授权范围" };
  const updatePermission = (profile: AgentPermissionProfile) => void props.onPermissionProfile?.(profile);

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
