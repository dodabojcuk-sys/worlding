import type { ModelServiceStatus } from "../../lib/localTransport";

export function AgentSettingsSection(props: {
  status: ModelServiceStatus | null;
  busy?: boolean;
  error?: string | null;
  onRefresh?(): void;
}) {
  const providers = props.status?.providers ?? [];
  const configured = providers.filter((provider) => provider.configured);
  const selected = props.status?.profile.profile;

  return <section className="agent-settings-section" aria-labelledby="agent-settings-title">
    <header>
      <div>
        <h2 id="agent-settings-title">Agent 与模型</h2>
        <p>Provider 凭据仍由私有凭据后端持有；这里仅显示可公开的连接状态。</p>
      </div>
      {props.onRefresh && <button type="button" disabled={props.busy} onClick={props.onRefresh}>刷新状态</button>}
    </header>
    <dl>
      <div><dt>Provider</dt><dd>{configured.length ? configured.map((provider) => provider.id).join("、") : "未配置"}</dd></div>
      <div><dt>当前模型</dt><dd>{selected?.enabled ? props.status?.profiles.find((profile) => profile.modelId === selected.modelId)?.label ?? selected.modelId : "未选择"}</dd></div>
      <div><dt>流式运行</dt><dd>{props.status?.tianyiDialogue.ready ? "可用" : "不可用"}</dd></div>
      <div><dt>工具调用</dt><dd>{props.status?.models.some((model) => model.capabilities.includes("tool-calls")) ? "经 Gateway 与作者审批" : "当前模型未声明"}</dd></div>
    </dl>
    {!configured.length && <p role="status">尚未配置真实 Provider；Agent 不会用 fixture 冒充成功。</p>}
    {props.error && <p role="alert">{props.error}</p>}
  </section>;
}
