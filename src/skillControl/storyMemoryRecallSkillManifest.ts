import type { SkillManifest } from "./skillManifest.ts";

export const STORY_MEMORY_RECALL_SKILL_ID = "story-memory-recall";

export const STORY_MEMORY_RECALL_LIMITS = {
  maxQueries: 1,
  maxReferences: 5,
  maxExcerptChars: 240
} as const;

export const STORY_MEMORY_RECALL_SKILL_MANIFEST: SkillManifest = {
  id: STORY_MEMORY_RECALL_SKILL_ID,
  name: "Story Memory Recall",
  domain: "retrieval",
  providerType: "builtin",
  description: "Read-only deterministic recall over the evidence allowed by a Nuwa task.",
  version: "1.0.0",
  adapterStatus: "executable",
  capabilities: ["recallBoundedStoryEvidence"],
  entrypoints: ["createStoryMemoryRecallSkillPlugin"],
  permissions: {
    readProject: true,
    writeProject: false,
    readMemory: true,
    writeMemory: false,
    useNetwork: false,
    useApiKey: false,
    executeLocalCommand: false
  },
  defaultEnabled: true,
  userConfigurable: true
};
