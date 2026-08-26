import { WifiOff, X } from "lucide-react";

export function StatusToastLayer(props: { error: string; onDismiss(): void }) {
  if (!props.error) return null;
  const offline = /本地服务暂时未连接|网络不可用|连接本地/iu.test(props.error);
  return <div className={`status-toast-layer ${offline ? "is-offline" : "is-error"}`} role={offline ? "status" : "alert"} data-testid="status-toast-layer">
    {offline ? <WifiOff /> : null}
    <span>{props.error}</span>
    <button type="button" onClick={props.onDismiss} aria-label="关闭状态"><X /></button>
  </div>;
}
