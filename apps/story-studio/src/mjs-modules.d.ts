declare module "*.mjs" {
  export function listWorkspaceNotes(workspacePath: string): unknown[];
  export function getWorkspaceNoteGuard(workspacePath: string, relativePath: string): { guard: { linkedNotes: Array<{ relativePath: string }> } };
  export function getWorkspaceProjectSummary(workspacePath: string): { projectPath: string; currentScenePath: string | null; currentChapterPath: string | null };
  export function serializeStoryMarkdown(value: unknown): string;
}
