export const STORY_STUDIO_EVENT_REFERENCE_VERSION = "story-studio-event-reference/v1" as const;

export type StoryStudioEventReference = {
  version: typeof STORY_STUDIO_EVENT_REFERENCE_VERSION;
  projectId: string;
  eventId: string;
  revisionToken: string;
  /**
   * A version-bound expectation from the client, never an authorization grant.
   * The server re-reads the event and evaluates the actual state against its
   * consumer policy before any source bytes may be used.
   */
  state: "draft" | "planned" | "committed";
  requestedUse: "simulate-from" | "compare-with" | "constraint";
};

export type StoryStudioEventReferenceConsumer =
  | "nuwa-simulation"
  | "tianyi-grounded"
  | "canon-material";

type EventReferenceSource = {
  id: string;
  type: string;
  status: string;
  revisionToken: string;
};

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const STABLE_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

const CONSUMER_POLICIES: Record<StoryStudioEventReferenceConsumer, {
  states: readonly StoryStudioEventReference["state"][];
  requestedUses: readonly StoryStudioEventReference["requestedUse"][];
}> = {
  "nuwa-simulation": {
    states: ["planned", "committed"],
    requestedUses: ["simulate-from", "compare-with", "constraint"]
  },
  "tianyi-grounded": {
    states: ["draft", "planned", "committed"],
    requestedUses: ["constraint"]
  },
  "canon-material": {
    states: ["committed"],
    requestedUses: ["constraint"]
  }
};

/**
 * A cross-workspace event handoff is an identity/version reference only. It
 * deliberately carries no title, event body, Candidate output, or Canon data.
 */
export function createStoryStudioEventReference(input: {
  projectId: string;
  event: EventReferenceSource;
  requestedUse?: StoryStudioEventReference["requestedUse"];
}): StoryStudioEventReference {
  if (input.event.type !== "event" || (input.event.status !== "draft" && input.event.status !== "planned" && input.event.status !== "committed")) {
    throw new Error("Story Studio event reference requires a draft, planned, or committed event.");
  }
  return normalizeStoryStudioEventReference({
    version: STORY_STUDIO_EVENT_REFERENCE_VERSION,
    projectId: input.projectId,
    eventId: input.event.id,
    revisionToken: input.event.revisionToken,
    state: input.event.status,
    requestedUse: input.requestedUse ?? "simulate-from"
  });
}

export function normalizeStoryStudioEventReference(value: unknown): StoryStudioEventReference {
  const input = plainObject(value, "Story Studio event reference");
  exact(input, ["version", "projectId", "eventId", "revisionToken", "state", "requestedUse"], "Story Studio event reference");
  if (input.version !== STORY_STUDIO_EVENT_REFERENCE_VERSION) throw new Error("Story Studio event reference version is invalid.");
  const state = oneOf(input.state, ["draft", "planned", "committed"] as const, "Story Studio event reference state");
  return {
    version: STORY_STUDIO_EVENT_REFERENCE_VERSION,
    projectId: projectId(input.projectId),
    eventId: stableId(input.eventId, "Story Studio event identifier"),
    revisionToken: hash(input.revisionToken, "Story Studio event revision"),
    state,
    requestedUse: oneOf(input.requestedUse, ["simulate-from", "compare-with", "constraint"] as const, "Story Studio event requested use")
  };
}

/**
 * Applies the consumer policy to the event read by the server. A client-side
 * `state` assertion can only make a request stale; it cannot widen access.
 */
export function assertStoryStudioEventReferenceEligibility(input: {
  reference: StoryStudioEventReference;
  event: EventReferenceSource;
  consumer: StoryStudioEventReferenceConsumer;
  canonVerified: boolean;
}): void {
  const policy = CONSUMER_POLICIES[input.consumer];
  if (input.event.id !== input.reference.eventId || input.event.type !== "event") {
    throw new Error("Story Studio event reference no longer resolves to an event.");
  }
  if (input.event.revisionToken !== input.reference.revisionToken || input.event.status !== input.reference.state) {
    throw new Error("Story Studio event reference is stale.");
  }
  if (input.event.status !== "draft" && input.event.status !== "planned" && input.event.status !== "committed") {
    throw new Error("Story Studio event reference state is unavailable to this consumer.");
  }
  if (!policy.states.includes(input.event.status) || !policy.requestedUses.includes(input.reference.requestedUse)) {
    throw new Error("Story Studio event reference is not eligible for this consumer.");
  }
  if (input.event.status === "committed" && !input.canonVerified) {
    throw new Error("Story Studio committed event reference is not Canon verified.");
  }
}

export function storyStudioEventReferenceKey(reference: Pick<StoryStudioEventReference, "projectId" | "eventId" | "revisionToken" | "requestedUse">): string {
  return `${reference.projectId}:event:${reference.eventId}:${reference.revisionToken}:${reference.requestedUse}`;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function projectId(value: unknown): string {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) throw new Error("Story Studio project identifier is invalid.");
  return value;
}

function stableId(value: unknown, label: string): string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}
