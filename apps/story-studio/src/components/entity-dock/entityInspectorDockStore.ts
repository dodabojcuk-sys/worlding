/**
 * 通用磁吸详情工作台（EntityInspectorDock）状态。
 * 模块级单例：peek/expanded/pinned 状态在路由与场景切换间保留（pinned），
 * 关闭后回到来源上下文。URL 只携带稳定 objectId，不携带正文。
 */

export type EntityDockKind = "character" | "world-reference";

export type EntityDockStatus = "closed" | "peek" | "expanded";

export interface EntityDockState {
  status: EntityDockStatus;
  pinned: boolean;
  kind: EntityDockKind;
  objectId: string | null;
  /** 磁吸上下文：来源页面标识与可选场景标题（用于 ContextPack 场景框） */
  openedFrom: string | null;
  sceneTitle: string | null;
}

let state: EntityDockState = { status: "closed", pinned: false, kind: "character", objectId: null, openedFrom: null, sceneTitle: null };

const listeners = new Set<() => void>();
let openerElement: HTMLElement | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function getEntityDockState(): EntityDockState {
  return state;
}

export function subscribeEntityDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openEntityDock(input: { kind: EntityDockKind; objectId: string; openedFrom?: string | null; sceneTitle?: string | null; pinned?: boolean }): void {
  openerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const keepPinned = input.pinned ?? (state.pinned && state.kind === input.kind && state.objectId === input.objectId);
  state = { status: "peek", pinned: keepPinned, kind: input.kind, objectId: input.objectId, openedFrom: input.openedFrom ?? null, sceneTitle: input.sceneTitle ?? null };
  emit();
}

export function setEntityDockStatus(status: Extract<EntityDockStatus, "peek" | "expanded">): void {
  if (!state.objectId || state.status === "closed") return;
  state = { ...state, status };
  emit();
}

export function setEntityDockPinned(pinned: boolean): void {
  if (state.status === "closed") return;
  state = { ...state, pinned };
  emit();
}

export function closeEntityDock(): void {
  const wasOpen = state.status !== "closed";
  state = { status: "closed", pinned: false, kind: state.kind, objectId: state.objectId, openedFrom: null, sceneTitle: null };
  emit();
  if (wasOpen && openerElement?.isConnected) openerElement.focus();
  openerElement = null;
}
