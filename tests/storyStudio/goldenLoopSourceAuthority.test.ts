import assert from "node:assert/strict";
import test from "node:test";

import {
  GOLDEN_LOOP_DOCUMENT_SOURCE_BINDING_VERSION,
  GOLDEN_LOOP_SELECTION_COORDINATE,
  GoldenLoopSourceBindingError,
  assertGoldenLoopReceiptSourceBinding,
  revalidateGoldenLoopDocumentSource,
  resolveGoldenLoopDocumentSource
} from "../../apps/story-studio/server/providerGateway/goldenLoopSourceBinding.mjs";
import { resolveGoldenLoopSourceAuthority } from "../../apps/story-studio/server/providerGateway/goldenLoopSourceAuthority.mjs";
import {
  createStoryStudioEventReference,
  normalizeStoryStudioEventReference
} from "../../src/storyContracts/storyStudioEventReference.ts";

const REVISION_A = "a".repeat(64);
const REVISION_B = "b".repeat(64);
const REVISION_C = "c".repeat(64);
const PROJECT_ID = "mist-lighthouse";

function documentFixture(overrides: Partial<{ id: string; revisionToken: string; body: string }> = {}) {
  return {
    id: "scene.current",
    revisionToken: REVISION_A,
    body: "甲🙂e\u0301乙",
    ...overrides
  };
}

function requestFor(document: ReturnType<typeof documentFixture>, selection = { coordinate: "utf16-code-unit" as const, start: 1, end: 5 }) {
  return {
    documentId: document.id,
    documentRevision: document.revisionToken,
    selection
  };
}

function focusFor(document: ReturnType<typeof documentFixture>, eventRef: ReturnType<typeof createStoryStudioEventReference> | null = null) {
  return {
    mode: "nuwa",
    document: {
      id: document.id,
      revision: document.revisionToken,
      selection: { coordinate: "utf16-code-unit" as const, start: 1, end: 5 }
    },
    eventRef
  };
}

function sourceErrorCode(callback: () => unknown, code: string): void {
  assert.throws(callback, (error: unknown) => error instanceof GoldenLoopSourceBindingError && error.code === code);
}

test("server-derived document selection freezes JavaScript UTF-16 offsets for Chinese, emoji, and combining characters", () => {
  const document = documentFixture();
  const resolved = resolveGoldenLoopDocumentSource({ document, requested: requestFor(document) });

  assert.equal(GOLDEN_LOOP_SELECTION_COORDINATE, "utf16-code-unit");
  assert.equal(resolved.binding.version, GOLDEN_LOOP_DOCUMENT_SOURCE_BINDING_VERSION);
  assert.deepEqual(resolved.binding.selection, { coordinate: "utf16-code-unit", start: 1, end: 5 });
  assert.equal(resolved.content, "🙂e\u0301");
  assert.equal(resolved.binding.contentHash.length, 64);
});

test("document ID, revision, range, and surrogate boundaries fail closed", () => {
  const document = documentFixture();
  sourceErrorCode(() => resolveGoldenLoopDocumentSource({
    document,
    requested: { ...requestFor(document), documentId: "scene.other" }
  }), "DOCUMENT_MISMATCH");
  sourceErrorCode(() => resolveGoldenLoopDocumentSource({
    document,
    requested: { ...requestFor(document), documentRevision: REVISION_B }
  }), "DOCUMENT_STALE");
  sourceErrorCode(() => resolveGoldenLoopDocumentSource({
    document,
    requested: requestFor(document, { coordinate: "utf16-code-unit", start: 0, end: document.body.length + 1 })
  }), "SELECTION_OUT_OF_RANGE");
  sourceErrorCode(() => resolveGoldenLoopDocumentSource({
    document,
    requested: requestFor(document, { coordinate: "utf16-code-unit", start: 2, end: 5 })
  }), "SELECTION_SURROGATE_SPLIT");
});

test("Receipt binding rejects content-digest drift and a document changed after client selection", () => {
  const initial = documentFixture();
  const source = resolveGoldenLoopDocumentSource({ document: initial, requested: requestFor(initial) });
  const tamperedReceipt = { sourceBinding: { ...source.binding, contentHash: REVISION_C } };
  sourceErrorCode(() => assertGoldenLoopReceiptSourceBinding(tamperedReceipt, source), "RECEIPT_SOURCE_BINDING_MISMATCH");

  const changed = documentFixture({ revisionToken: REVISION_B, body: "甲🙂已经变化" });
  sourceErrorCode(() => resolveGoldenLoopDocumentSource({ document: changed, requested: requestFor(initial) }), "DOCUMENT_STALE");
  sourceErrorCode(() => revalidateGoldenLoopDocumentSource({ document: changed, documentSource: source }), "DOCUMENT_STALE");
});

test("source authority resolves only stable IDs and versions, rejects forged background, and has no write path", () => {
  const document = documentFixture({ body: "甲🙂e\u0301乙：服务器只会读取这里。" });
  const event = {
    id: "event.current",
    type: "event",
    status: "committed",
    revisionToken: REVISION_B,
    title: "已确认的水源事件",
    body: "FORBIDDEN_EVENT_BODY"
  };
  const object = {
    id: "character.su",
    type: "character",
    status: "active",
    revisionToken: REVISION_C,
    title: "苏槿",
    body: "FORBIDDEN_OBJECT_BODY"
  };
  const eventRef = createStoryStudioEventReference({ projectId: PROJECT_ID, event, requestedUse: "constraint" });
  const reads = { writing: 0, object: 0 };
  const operations = {
    readWritingDocument(input: { projectId: string; documentId: string }) {
      assert.deepEqual(input, { projectId: PROJECT_ID, documentId: document.id });
      reads.writing += 1;
      return document;
    },
    readWorldObject(input: { projectId: string; objectId: string }) {
      assert.equal(input.projectId, PROJECT_ID);
      reads.object += 1;
      if (input.objectId === event.id) return event;
      if (input.objectId === object.id) return object;
      throw new Error("missing");
    }
  };
  const authorControl = { verifyCanonEventRead: ({ eventId }: { projectId: string; eventId: string }) => eventId === event.id };
  const contextRefs = [{
    version: "story-tianyi-object-context-ref/v1" as const,
    ownerType: "markdown-object" as const,
    objectType: "character" as const,
    stableId: object.id,
    projectId: PROJECT_ID,
    ownerId: object.id,
    contentHash: object.revisionToken,
    state: "current" as const,
    inclusion: "included" as const,
    label: "伪造但非权威的浏览器标签"
  }];
  const resolved = resolveGoldenLoopSourceAuthority({
    operations,
    authorControl,
    projectId: PROJECT_ID,
    focus: focusFor(document, eventRef),
    contextRefs
  });

  assert.deepEqual(resolved.focus, {
    mode: "nuwa",
    documentId: document.id,
    eventRef
  });
  assert.equal(resolved.documentSource.content, "🙂e\u0301");
  assert.equal(resolved.contextRefs[0].label, object.title);
  assert.equal(JSON.stringify({ focus: resolved.focus, refs: resolved.contextRefs }).includes("FORBIDDEN_"), false);
  assert.deepEqual(reads, { writing: 1, object: 2 });

  sourceErrorCode(() => resolveGoldenLoopSourceAuthority({
    operations,
    authorControl,
    projectId: PROJECT_ID,
    focus: { ...focusFor(document, eventRef), background: "FORGED_CLIENT_BACKGROUND" },
    contextRefs
  }), "REQUEST_SHAPE_INVALID");
  sourceErrorCode(() => resolveGoldenLoopSourceAuthority({
    operations,
    authorControl,
    projectId: PROJECT_ID,
    focus: focusFor(document, { ...eventRef, revisionToken: REVISION_C }),
    contextRefs
  }), "EVENT_STALE");
  sourceErrorCode(() => resolveGoldenLoopSourceAuthority({
    operations,
    authorControl,
    projectId: PROJECT_ID,
    focus: focusFor(document, eventRef),
    contextRefs: [{ ...contextRefs[0], contentHash: REVISION_A }]
  }), "CONTEXT_SOURCE_STALE");
  sourceErrorCode(() => resolveGoldenLoopSourceAuthority({
    operations,
    authorControl,
    projectId: PROJECT_ID,
    focus: focusFor(document, eventRef),
    contextRefs: [{
      ...contextRefs[0],
      objectType: "event",
      stableId: event.id,
      ownerId: event.id,
      contentHash: event.revisionToken
    }]
  }), "CONTEXT_EVENT_REFERENCE_REQUIRED");
});

test("stable event references contain no narrative authority and reject unknown fields", () => {
  const reference = createStoryStudioEventReference({
    projectId: PROJECT_ID,
    event: { id: "event.planned", type: "event", status: "planned", revisionToken: REVISION_A },
    requestedUse: "simulate-from"
  });
  assert.deepEqual(Object.keys(reference).sort(), ["eventId", "projectId", "requestedUse", "revisionToken", "state", "version"]);
  assert.equal(JSON.stringify(reference).includes("body"), false);
  assert.throws(() => normalizeStoryStudioEventReference({ ...reference, body: "cannot-cross-boundary" }), /fields/i);
});
