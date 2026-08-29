/** Browser-session hint only; the continuity owner remains authoritative. */
export function tianyiShellSessionStorageKey(projectId: string): string {
  return `tianyi-shell-session:${projectId}`;
}
