/** Browser-local hint only; story-continuity remains the conversation owner. */
export function tianyiConversationStorageKey(projectId: string): string {
  return `tianyi-conversation:${projectId}`;
}

/** Browser-local pointer only; the persisted Tianyi Agent runtime remains the run owner. */
export function tianyiStoryIntakeRunStorageKey(projectId: string, workVersionId: string, sessionId: string): string {
  return `tianyi-story-intake-run:${projectId}:${workVersionId}:${sessionId}`;
}

/** Project-scoped local draft only; it is never promoted to a story fact or sent without the author's action. */
export function tianyiComposerDraftStorageKey(projectId: string, lane: "creative" | "work", sessionId?: string | null): string {
  return `tianyi-composer-draft:${projectId}:${lane}${sessionId ? `:${sessionId}` : ""}`;
}

/** Project-scoped pointer to a saved reply being continued; the reply remains owned by the Tianyi session. */
export function tianyiContinuationSourceStorageKey(projectId: string, sessionId?: string | null): string {
  return `tianyi-continuation-source:${projectId}${sessionId ? `:${sessionId}` : ""}`;
}

/** Navigation hints only. RunPack remains the authoritative run store. */
export function nuwaConversationRunKey(projectId: string, sessionId: string): string {
  return `nuwa-conversation-runs:${projectId}:${sessionId}`;
}
export function readConversationRunIds(storage: Pick<Storage, "getItem">, projectId: string, sessionId: string): string[] {
  try { const value: unknown = JSON.parse(storage.getItem(nuwaConversationRunKey(projectId, sessionId)) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^nuwa-run-[a-zA-Z0-9._-]+$/u.test(id)) : []; } catch { return []; }
}
export function rememberConversationRun(storage: Pick<Storage, "getItem" | "setItem">, projectId: string, sessionId: string, runId: string): void {
  const ids = readConversationRunIds(storage, projectId, sessionId);
  storage.setItem(nuwaConversationRunKey(projectId, sessionId), JSON.stringify([...ids.filter((id) => id !== runId), runId]));
}

/** Persist the selected conversation in this browser; archives remain on the server.
 * Migrate the previous tab-only key once without reviving an explicitly cleared choice. */
export function readSelectedConversation(projectId: string): string | null {
  const key = tianyiConversationStorageKey(projectId);
  const retained = window.localStorage.getItem(key);
  if (retained !== null) return retained || null;
  const legacy = window.sessionStorage.getItem(key);
  if (legacy !== null) { window.localStorage.setItem(key, legacy); window.sessionStorage.removeItem(key); }
  return legacy;
}
export function retainSelectedConversation(projectId: string, sessionId: string | null): void {
  const key = tianyiConversationStorageKey(projectId);
  window.localStorage.setItem(key, sessionId ?? "");
  window.sessionStorage.removeItem(key);
}

export function readBrowserRecovery(key: string): string | null {
  const saved = window.localStorage.getItem(key);
  if (saved !== null) return saved;
  const legacy = window.sessionStorage.getItem(key);
  if (legacy !== null) { window.localStorage.setItem(key, legacy); window.sessionStorage.removeItem(key); }
  return legacy;
}
export function retainBrowserRecovery(key: string, value: string): void { window.localStorage.setItem(key, value); window.sessionStorage.removeItem(key); }
export function clearBrowserRecovery(key: string): void { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); }
