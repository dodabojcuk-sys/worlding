/**
 * Browser-facing structural contracts for the Nuwa scene runtime transport.
 *
 * Keeping this type-only entrypoint outside the Story Studio client prevents
 * the browser bundle from depending on the runtime implementation module.
 * The server/runtime remains the sole executable owner of these contracts.
 */
export type {
  NuwaSceneCandidateR0,
  NuwaSceneComparisonR0,
  NuwaSceneReplayR0,
  NuwaSceneSimulationReadModelR0
} from "./storyIntelligence/nuwaSceneSimulationRuntime.ts";
