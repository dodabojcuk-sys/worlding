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
export type {
  NuwaN1Actor,
  NuwaN1ActorResult,
  NuwaN1Belief,
  NuwaN1CandidateHandoff,
  NuwaN1Context,
  NuwaN1ExecutionAdapter,
  NuwaN1KnownFact,
  NuwaN1Lifecycle,
  NuwaN1Receipt,
  NuwaN1Run,
  NuwaN1Scene,
  NuwaN1StableRef,
  NuwaN1Step,
  NuwaN1ToolRequest,
  NuwaN1ToolResult
} from "./storyIntelligence/nuwaN1Runtime.ts";
