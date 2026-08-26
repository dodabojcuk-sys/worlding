import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { getAgentPermissionState, setAgentPermissionProfile, type AgentPermissionProfile, type AgentPermissionState } from "../lib/localTransport";

const labels: Record<AgentPermissionProfile, string> = {
  general: "仅建议",
  "auto-review": "执行前确认",
  "full-access": "授权范围内执行"
};

/** Shared Tianyi/Nuwa permission surface. It deliberately does not grant Canon writes. */
export function AgentPermissionStatus(props: { projectId: string; withConnection<T>(action: (token: string) => Promise<T>): Promise<T> }) {
  const [state, setState] = useState<AgentPermissionState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getAgentPermissionState(props.projectId).then((value) => { if (active) setState(value); }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [props.projectId]);

  const change = (profile: AgentPermissionProfile) => {
    setBusy(true);
    void props.withConnection((token) => setAgentPermissionProfile({ projectId: props.projectId, profile, token }))
      .then(setState)
      .finally(() => setBusy(false));
  };

  return <details className="agent-permission-status" data-agent-permission-profile={state?.profile || "loading"}>
    <summary><ShieldCheck />{state ? labels[state.profile] : "权限"}</summary>
    <section aria-label="天意与女娲权限">
      <strong>天意与女娲共享权限</strong>
      <p>授权范围内执行仍不能确认正史、永久删除、发布部署、安装 Skill 或执行未授权外部动作。</p>
      <div>{(["general", "auto-review", "full-access"] as AgentPermissionProfile[]).map((profile) => <button type="button" key={profile} className={state?.profile === profile ? "is-active" : ""} disabled={busy || state?.profile === profile} onClick={() => change(profile)}>{labels[profile]}</button>)}</div>
      {state?.receipts[0] ? <small>最近活动：{state.receipts[0].reason}</small> : <small>尚无自动活动；作者手动操作不被伪装为 Agent 行为。</small>}
    </section>
  </details>;
}
