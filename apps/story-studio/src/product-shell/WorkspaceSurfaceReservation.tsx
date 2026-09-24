import { Clock3, X } from "lucide-react";

import { getWorkspaceSurfaceReservation, workspaceSurfaceManager, type WorkspaceSurfaceInstance } from "./WorkspaceDockCoordinator";

/** Shell-rendered empty state for registered, but not yet implemented, Surfaces. */
export function WorkspaceSurfaceReservation(props: { surface: WorkspaceSurfaceInstance }) {
  const reservation = getWorkspaceSurfaceReservation(props.surface.kind);
  if (!reservation || props.surface.placement === "hidden") return null;
  return <aside className={`workspace-surface-reservation is-${props.surface.placement}`} aria-label={reservation.title} data-surface-kind={reservation.kind}>
    <header><div><Clock3 aria-hidden="true" /><span><small>未来能力</small><strong>{reservation.title}</strong></span></div><button type="button" aria-label={`关闭${reservation.title}`} onClick={() => workspaceSurfaceManager.closeSurface(props.surface.id)}><X aria-hidden="true" /></button></header>
    <p>{reservation.unavailableMessage}</p>
    {reservation.kind === "future-projection-map" ? <small>Future ≠ Canon；不会进入正式故事 Spine。</small> : null}
    <small>此入口尚未读取、生成或写入任何故事数据。</small>
  </aside>;
}
