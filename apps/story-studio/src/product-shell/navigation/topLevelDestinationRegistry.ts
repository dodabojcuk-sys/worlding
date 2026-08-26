export {
  STORY_STUDIO_WORKSPACE_REGISTRY as TOP_LEVEL_DESTINATION_REGISTRY,
  STORY_STUDIO_WORKSPACE_IDS as PRODUCT_WORKSPACE_MODES,
  isStoryStudioWorkspaceId,
  resolveStoryStudioWorkspaceId,
  resolveStoryStudioWorkspaceLocation,
  storyStudioWorkspaceById,
  storyStudioWorkspaceDisplayName,
  storyStudioWorkspaceRoute
} from "../../../../../src/storyContracts/storyStudioWorkspaceRegistry.ts";

export type {
  StoryStudioWorkspace as TopLevelDestination,
  StoryStudioWorkspaceId as ProductWorkspaceMode
} from "../../../../../src/storyContracts/storyStudioWorkspaceRegistry.ts";
