import { CloudOff, ListTodo, Pin, Sparkles } from "lucide-react";

/** Shell status projection. Local persistence and cloud connectivity remain distinct. */
export function WorkspaceStatusFooter(props: {
  connectionState: string;
  currentRunId: string | null;
  tianyiOpen: boolean;
  tianyiPinned: boolean;
  onTasks(): void;
  onTianyi(): void;
  onPinTianyi(): void;
}) {
  return <footer className="shell-workspace-status" aria-label="工作区状态">
    <span title="项目数据保存在本机；不表示已经云端同步">本机存储 <CloudOff aria-hidden="true" /> 未连接云同步</span>
    {props.connectionState === "unavailable" ? <strong role="alert">本机作品服务暂不可用，请查看相关操作提示。</strong> : null}
    <button type="button" onClick={props.onTasks}><ListTodo aria-hidden="true" />{props.currentRunId ? `当前排演 · ${props.currentRunId.slice(-6)}` : "任务与运行"}</button>
    <div className="shell-status-assistant"><button type="button" data-panel-toggle="tianyi-agent" onClick={props.onTianyi} aria-pressed={props.tianyiOpen}><Sparkles aria-hidden="true" />{props.tianyiOpen ? "关闭天意" : "召唤天意"}</button>{props.tianyiOpen ? <button type="button" className="shell-status-pin" onClick={props.onPinTianyi} aria-pressed={props.tianyiPinned} title={props.tianyiPinned ? "取消固定右侧天意" : "固定到右侧"}><Pin aria-hidden="true" /><span>{props.tianyiPinned ? "已固定" : "固定"}</span></button> : null}</div>
  </footer>;
}
