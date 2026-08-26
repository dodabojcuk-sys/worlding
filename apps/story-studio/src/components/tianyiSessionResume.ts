import type { TianyiSessionMetadata } from "../lib/localTransport";

/** Selects only a persisted, open normal Session for author-facing resume. */
export function selectResumableTianyiSession(
  value: TianyiSessionMetadata | TianyiSessionMetadata[] | null
): TianyiSessionMetadata | null {
  const sessions = Array.isArray(value) ? value : value ? [value] : [];
  return sessions
    .filter((session) => session.retentionMode === "normal" && session.recoverable && !session.closed)
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt) || right.id.localeCompare(left.id))[0] ?? null;
}

/**
 * Resolves an explicitly shared in-page Session, including a completed or
 * archived read-only projection selected from the Session rail. Closed
 * Sessions are never chosen implicitly by resume and remain non-writable in
 * the controller's send path.
 */
export function selectSharedTianyiSession(
  value: TianyiSessionMetadata | TianyiSessionMetadata[] | null,
  requestedSessionId: string | null
): TianyiSessionMetadata | null {
  if (!requestedSessionId) return selectResumableTianyiSession(value);
  const sessions = Array.isArray(value) ? value : value ? [value] : [];
  return sessions.find((session) => session.id === requestedSessionId) ?? null;
}
