export type TianyiTransportState =
  | "idle"
  | "connecting"
  | "ready"
  | "streaming"
  | "stopped"
  | "unavailable"
  | "disconnected"
  | "failed"
  | "retrying";

export const TIANYI_TRANSPORT_LABELS: Record<TianyiTransportState, string> = {
  idle: "等待输入",
  connecting: "正在连接天意",
  ready: "已准备",
  streaming: "天意正在回应",
  stopped: "已停止",
  unavailable: "尚未连接模型",
  disconnected: "连接已断开",
  failed: "回答未完成",
  retrying: "正在重试"
};

export const TIANYI_TRANSPORT_DESCRIPTIONS: Record<TianyiTransportState, string> = {
  idle: "输入会保留在当前作品上下文中。",
  connecting: "正在读取现有会话和本地连接状态。",
  ready: "可以基于已授权来源提问；不会自动发送请求。",
  streaming: "正在等待当前回答；可以随时停止。",
  stopped: "本次请求已停止，输入仍保留。",
  unavailable: "没有可用模型连接；可以准备问题，但不会伪造成功。",
  disconnected: "暂时无法读取连接状态；输入和已有会话仍保留。",
  failed: "本次回答未完成；明确重试前不会再次发送。",
  retrying: "只重试当前未完成的回答，不会创建第二条会话。"
};

export function resolveTianyiTransportState(input: {
  loading: boolean;
  busy: boolean;
  providerReady: boolean | null;
  error?: string;
  recoveryKind?: string | null;
  stopped?: boolean;
  retrying?: boolean;
}): TianyiTransportState {
  if (input.stopped) return "stopped";
  if (input.retrying) return "retrying";
  if (input.loading) return "connecting";
  if (input.busy) return "streaming";
  if (input.error || input.recoveryKind === "send-failed") return "failed";
  if (input.providerReady === true) return "ready";
  if (input.providerReady === false) return "unavailable";
  return "disconnected";
}
