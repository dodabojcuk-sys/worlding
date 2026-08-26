import type { WritingBootstrap, WritingDocument } from "./localTransport";

type StartWriting = (projectId: string, token: string) => Promise<{
  chapter: WritingDocument;
  scene: WritingDocument;
  writing: WritingBootstrap;
}>;

/**
 * Creates the first authoring pair behind one product action.
 *
 * The local workspace operation owns the compensated two-file write. The
 * browser makes one request and never observes or persists a half-created pair.
 */
export async function createInitialWritingPair(input: {
  projectId: string;
  token: string;
  startWriting: StartWriting;
}): Promise<{ chapter: WritingDocument; scene: WritingDocument; writing: WritingBootstrap }> {
  return input.startWriting(input.projectId, input.token);
}
