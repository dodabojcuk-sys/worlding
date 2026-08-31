/** Browser-session hints only; the continuity owner remains authoritative. */
export function tianyiDialogueSessionStorageKey(projectId: string): string {
  return `tianyi-dialogue-session:${projectId}`;
}

export function tianyiAgentSessionStorageKey(projectId: string): string {
  return `tianyi-agent-session:${projectId}`;
}
