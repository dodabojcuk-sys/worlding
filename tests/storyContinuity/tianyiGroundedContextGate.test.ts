import assert from "node:assert/strict";
import test from "node:test";

import {
  compileTianyiGroundedContext,
  normalizeTianyiGroundedContextRequest,
  normalizeTianyiGroundedSourceManifest,
  serializeTianyiGroundedProviderSources,
  sha256,
  type TianyiGroundedContextRequest,
  type TianyiGroundedResolvedCandidate,
  type TianyiObjectContextRef
} from "../../src/storyContinuity/index.ts";
import { createStoryStudioEventReference } from "../../src/storyContracts/storyStudioEventReference.ts";

const projectId = "project-a";
const subjectRef = ref("character", "character.b");
const sceneRef = {
  ...ref("scene", "scene.opening"),
  ownerType: "markdown-writing" as const
};

test("grounded request validation is exact and never falls back to author access", () => {
  const request = characterRequest();
  assert.deepEqual(normalizeTianyiGroundedContextRequest(request), request);
  assert.throws(
    () => normalizeTianyiGroundedContextRequest({ ...request, subjectRef: null }),
    /requires an explicit character subject/u
  );
  assert.throws(
    () => normalizeTianyiGroundedContextRequest({ ...request, accessMode: "author" }),
    /must not carry a character subject/u
  );
  assert.throws(
    () => normalizeTianyiGroundedContextRequest({ ...request, fallback: "author" }),
    /fields are invalid/u
  );
});

test("grounded event sources require stable event references and bind them into the manifest", () => {
  const eventReference = createStoryStudioEventReference({
    projectId,
    event: { id: "event.planned", type: "event", status: "planned", revisionToken: sha256("event.planned") },
    requestedUse: "constraint"
  });
  const request: TianyiGroundedContextRequest = {
    ...characterRequest(),
    accessMode: "author",
    subjectRef: null,
    eventRefs: [eventReference]
  };
  const normalized = normalizeTianyiGroundedContextRequest(request);
  assert.deepEqual(normalized.eventRefs, [eventReference]);
  const compiled = compileTianyiGroundedContext({
    request,
    candidates: [{
      ...candidate("world-object", eventReference.eventId, "evidence", "SERVER_RESOLVED_EVENT_BODY", []),
      sourceKey: `${projectId}:event:${eventReference.eventId}:${eventReference.revisionToken}:${eventReference.requestedUse}`,
      requestedContentHash: eventReference.revisionToken,
      contentHash: eventReference.revisionToken
    }]
  });
  assert.deepEqual(compiled.manifest.request.eventRefs, [`${projectId}:event:${eventReference.eventId}:${eventReference.revisionToken}:${eventReference.requestedUse}`]);
  assert.equal(compiled.manifest.included[0]?.sourceKey, compiled.manifest.request.eventRefs?.[0]);
  const { eventRefs: _eventRefs, ...withoutEventRefs } = request;
  assert.throws(() => normalizeTianyiGroundedContextRequest({
    ...withoutEventRefs,
    explicitRefs: [{ ...ref("event", eventReference.eventId), contentHash: eventReference.revisionToken }]
  }), /explicit Story Studio event reference/u);
  assert.throws(() => normalizeTianyiGroundedContextRequest({
    ...request,
    eventRefs: [{ ...eventReference, title: "不能作为身份" }]
  }), /fields are invalid/u);
});

test("one deterministic manifest covers included, excluded, budget-omitted and conflicting sources", () => {
  const candidates: TianyiGroundedResolvedCandidate[] = [
    candidate("scene", "scene.opening", "scene", "Scene projection", ["character.b"]),
    candidate("world-object", "character.b", "subject", "Subject B", ["character.b"]),
    candidate("world-object", "character.a", "evidence", "Private A", ["character.a"]),
    candidate("rule", "rule.active", "constraint", "Active rule", ["character.b"]),
    candidate("memory", "memory.1", "memory", "Safe memory", ["character.b"]),
    candidate("memory", "memory.unrelated", "memory", null, ["character.b"], "TASK_IRRELEVANT"),
    candidate("world-object", "event.conflict", "evidence", "Conflict", ["character.b"], null, "a".repeat(64)),
    candidate("world-object", "event.conflict", "evidence", "Conflict", ["character.b"], null, "b".repeat(64)),
    candidate("rule", "rule.large", "constraint", "x".repeat(200), ["character.b"])
  ];
  const left = compileTianyiGroundedContext({ request: characterRequest(), candidates, hardBudget: 100 });
  const right = compileTianyiGroundedContext({ request: characterRequest(), candidates: [...candidates].reverse(), hardBudget: 100 });
  assert.deepEqual(left.manifest, right.manifest);
  assert.equal(Object.isFrozen(left.manifest), true);
  assert.equal(Object.isFrozen(left.manifest.included), true);
  assert.equal(left.manifest.excluded.some((entry) => entry.reasonCode === "SUBJECT_KNOWLEDGE_UNPROVEN"), true);
  assert.equal(left.manifest.excluded.some((entry) => entry.reasonCode === "TASK_IRRELEVANT"), true);
  assert.equal(left.manifest.budgetOmitted.some((entry) => entry.reasonCode === "BUDGET_OMITTED"), true);
  assert.equal(left.manifest.conflicting.some((entry) => entry.reasonCode === "SOURCE_CONFLICT"), true);
  assert.deepEqual(normalizeTianyiGroundedSourceManifest(left.manifest), left.manifest);
  assert.throws(
    () => normalizeTianyiGroundedSourceManifest({ ...left.manifest, digest: "0".repeat(64) }),
    /digest is invalid/u
  );
  assert.deepEqual(
    serializeTianyiGroundedProviderSources(left).map((item) => item.manifest),
    left.manifest.included
  );
});

test("author access may include current explicit content while character access requires subject knowledge", () => {
  const source = candidate("world-object", "location.private", "evidence", "Full current source", []);
  const character = compileTianyiGroundedContext({ request: characterRequest(), candidates: [source] });
  assert.equal(character.manifest.included.length, 0);
  assert.equal(character.manifest.excluded[0]?.reasonCode, "SUBJECT_KNOWLEDGE_UNPROVEN");
  const authorRequest: TianyiGroundedContextRequest = {
    ...characterRequest(),
    accessMode: "author",
    subjectRef: null
  };
  const author = compileTianyiGroundedContext({ request: authorRequest, candidates: [source] });
  assert.equal(author.manifest.included.length, 1);
});

function characterRequest(): TianyiGroundedContextRequest {
  return {
    version: "story-tianyi-grounded-context-request/v1",
    projectId,
    sessionId: "session.000001",
    taskKind: "grounded-answer",
    accessMode: "character",
    subjectRef,
    sceneRef,
    explicitRefs: []
  };
}

function ref(objectType: TianyiObjectContextRef["objectType"], stableId: string): TianyiObjectContextRef {
  return {
    version: "story-tianyi-object-context-ref/v1",
    ownerType: "markdown-object",
    objectType,
    stableId,
    projectId,
    ownerId: stableId,
    contentHash: sha256(stableId),
    state: "current",
    inclusion: "included",
    label: stableId
  };
}

function candidate(
  sourceType: TianyiGroundedResolvedCandidate["sourceType"],
  sourceId: string,
  lane: TianyiGroundedResolvedCandidate["lane"],
  wireContent: string | null,
  knowledgeSubjectRefs: string[],
  preAuthorizationReason: TianyiGroundedResolvedCandidate["preAuthorizationReason"] = null,
  requestedContentHash?: string
): TianyiGroundedResolvedCandidate {
  const contentHash = sha256(sourceId);
  return {
    sourceType,
    projectId,
    sourceId,
    sourceKey: `${projectId}:${sourceType}:${sourceId}`,
    contentHash,
    requestedContentHash: requestedContentHash ?? contentHash,
    lane,
    wireContent,
    knowledgeSubjectRefs,
    preAuthorizationReason
  };
}
