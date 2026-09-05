/** Browser-session hint only; story-continuity remains the conversation owner. */
export function tianyiConversationStorageKey(projectId: string): string {
  return `tianyi-conversation:${projectId}`;
}

/** Browser-session pointer only; the persisted Tianyi Agent runtime remains the run owner. */
export function tianyiStoryIntakeRunStorageKey(projectId: string, workVersionId: string, sessionId: string): string {
  return `tianyi-story-intake-run:${projectId}:${workVersionId}:${sessionId}`;
}
