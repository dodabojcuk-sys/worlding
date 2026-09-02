import type { StoryModelingSource } from "./storyModeling.ts";

export const STORY_MODELING_CHUNK_CHARACTERS = 9_000;

export type StoryModelingBatchPlanItem = {
  batchIndex: number;
  sourceId: string;
  chunkIndex: number;
  chunkCount: number;
  startCharacter: number;
  endCharacter: number;
};

/** The planner and server adapter share this exact deterministic call plan. */
export function createStoryModelingBatchPlan(sources: readonly Pick<StoryModelingSource, "sourceId" | "characterCount">[]): StoryModelingBatchPlanItem[] {
  const plan: StoryModelingBatchPlanItem[] = [];
  for (const source of sources) {
    if (!Number.isSafeInteger(source.characterCount) || source.characterCount < 0 || source.characterCount > 10_000_000) throw new Error("Story modeling source character count is invalid.");
    const chunkCount = Math.max(1, Math.ceil(source.characterCount / STORY_MODELING_CHUNK_CHARACTERS));
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      plan.push({
        batchIndex: plan.length,
        sourceId: source.sourceId,
        chunkIndex,
        chunkCount,
        startCharacter: chunkIndex * STORY_MODELING_CHUNK_CHARACTERS,
        endCharacter: Math.min(source.characterCount, (chunkIndex + 1) * STORY_MODELING_CHUNK_CHARACTERS)
      });
    }
  }
  if (!plan.length) throw new Error("Story modeling requires at least one planned source batch.");
  if (plan.length > 64) throw new Error("Story modeling source scope exceeds the 64-request safety limit.");
  return plan;
}
