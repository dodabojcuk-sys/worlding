export const PI_R4_VALIDATION_VERSION = "tianyan-pi-r4-validation/v1" as const;
export const PI_R4_PROVIDER_REQUEST_CAP = 6;

export type PiR4CapabilityId =
  | "character"
  | "alias-and-same-name"
  | "item"
  | "location"
  | "event"
  | "relation"
  | "story-unit"
  | "narrative-path-membership"
  | "world-rule"
  | "organization"
  | "relative-time"
  | "misconception"
  | "author-future-intent";

export type PiR4Support = "supported" | "partial" | "unresolved-only" | "not-supported";

export type PiR4Capability = {
  id: PiR4CapabilityId;
  candidate: PiR4Support;
  review: PiR4Support;
  writer: PiR4Support;
  observation: PiR4Support;
  note: string;
};

/**
 * Current product support, not a Provider quality claim.  The matrix is
 * intentionally explicit about gaps so a successful synthetic call cannot be
 * reported as support for a missing Owner adapter.
 */
export const PI_R4_SUPPORT_MATRIX: readonly PiR4Capability[] = Object.freeze([
  row("character", "supported", "supported", "supported", "supported", "Stable WorldObject ID; aliases and identity ambiguity still require separate evidence."),
  row("alias-and-same-name", "partial", "supported", "partial", "partial", "Existing-entity matching carries IDs, but alias fields and same-name author resolution are not a complete first-class contract."),
  row("item", "supported", "supported", "supported", "supported", "Items participate in action/state observation, not human belief semantics."),
  row("location", "supported", "supported", "supported", "supported", "Locations participate in action/state observation, not human belief semantics."),
  row("event", "supported", "supported", "supported", "supported", "Event Owner remains the only formal writer."),
  row("relation", "supported", "supported", "supported", "supported", "Only recognized Relation types may cross the Owner adapter."),
  row("story-unit", "supported", "supported", "supported", "supported", "Story Unit identity stays separate from Event identity."),
  row("narrative-path-membership", "supported", "supported", "supported", "supported", "Membership is written by NarrativeArrangement Owner; it is not a second Storyline store."),
  row("world-rule", "unresolved-only", "supported", "not-supported", "not-supported", "Story Intake v1 has no world-rule candidate or Writer adapter."),
  row("organization", "unresolved-only", "supported", "not-supported", "not-supported", "Story Intake v1 has no organization candidate or Writer adapter."),
  row("relative-time", "partial", "supported", "partial", "supported", "Event summaries preserve evidence, but formal relative-time adoption still needs the Event temporal contract."),
  row("misconception", "partial", "supported", "partial", "supported", "CharacterStateProjection distinguishes belief from fact; Intake does not yet expose a dedicated misconception candidate type."),
  row("author-future-intent", "unresolved-only", "supported", "not-supported", "not-supported", "Author plans must remain author-only constraints and cannot be injected into a role ContextPack."),
]);

export type PiR4ProviderBudget = {
  cap: number;
  countBoundary: "provider-dispatch";
  includes: readonly ["setup-diagnostic", "generation", "tool-loop-turn", "retry", "repair-verification"];
  automaticRetries: 0;
};

export const PI_R4_PROVIDER_BUDGET: PiR4ProviderBudget = Object.freeze({
  cap: PI_R4_PROVIDER_REQUEST_CAP,
  countBoundary: "provider-dispatch",
  includes: ["setup-diagnostic", "generation", "tool-loop-turn", "retry", "repair-verification"],
  automaticRetries: 0
});

export function remainingPiR4Requests(input: { priorProviderDispatches: number; cap?: number }): number {
  const cap = input.cap ?? PI_R4_PROVIDER_REQUEST_CAP;
  if (!Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(input.priorProviderDispatches) || input.priorProviderDispatches < 0) throw new TypeError("Pi R4 request count is invalid.");
  return Math.max(0, cap - input.priorProviderDispatches);
}

function row(id: PiR4CapabilityId, candidate: PiR4Support, review: PiR4Support, writer: PiR4Support, observation: PiR4Support, note: string): PiR4Capability {
  return Object.freeze({ id, candidate, review, writer, observation, note });
}
