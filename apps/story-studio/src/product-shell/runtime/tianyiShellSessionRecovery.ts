/** Browser-session hint only; story-continuity remains the conversation owner. */
export function tianyiConversationStorageKey(projectId: string): string {
  return `tianyi-conversation:${projectId}`;
}
