import { normalizeTianyiObjectContextRefs } from "../../../../src/storyContinuity/index.ts";
import {
  assertStoryStudioEventReferenceEligibility,
  normalizeStoryStudioEventReference
} from "../../../../src/storyContracts/storyStudioEventReference.ts";

import { GoldenLoopSourceBindingError, resolveGoldenLoopDocumentSource } from "./goldenLoopSourceBinding.mjs";

/**
 * This adapter turns browser-provided identifiers into server-resolved source
 * descriptions. It owns no Receipt, Event, Canon, WorldState, or RunPack data.
 */
export function resolveGoldenLoopSourceAuthority({ operations, authorControl, projectId, focus, contextRefs }) {
  const normalizedFocus = normalizeGoldenLoopFocus(focus);
  const document = readWritingDocument(operations, projectId, normalizedFocus.document.id);
  const documentSource = resolveGoldenLoopDocumentSource({
    document,
    requested: {
      documentId: normalizedFocus.document.id,
      documentRevision: normalizedFocus.document.revision,
      selection: normalizedFocus.document.selection
    }
  });
  const eventSource = normalizedFocus.eventRef
    ? resolveEventReference({ operations, authorControl, projectId, reference: normalizedFocus.eventRef })
    : null;
  const resolvedContextRefs = resolveContextRefs({
    operations,
    authorControl,
    projectId,
    refs: contextRefs,
    documentSource
  });
  return Object.freeze({
    focus: Object.freeze({
      mode: normalizedFocus.mode,
      documentId: documentSource.binding.documentId,
      eventRef: eventSource?.reference ?? null
    }),
    documentSource,
    eventSource,
    contextRefs: Object.freeze(resolvedContextRefs)
  });
}

function normalizeGoldenLoopFocus(value) {
  const input = plainObject(value, "Golden Loop focus");
  exact(input, ["mode", "document", "eventRef"], "Golden Loop focus");
  if (typeof input.mode !== "string" || !input.mode.trim() || input.mode.length > 80 || /[\u0000-\u001f\u007f]/u.test(input.mode)) {
    throw authorityError("FOCUS_MODE_INVALID", "本轮上下文位置无效。");
  }
  const document = plainObject(input.document, "Golden Loop document reference");
  exact(document, ["id", "revision", "selection"], "Golden Loop document reference");
  return {
    mode: input.mode.trim(),
    document: { id: document.id, revision: document.revision, selection: document.selection },
    eventRef: input.eventRef === null ? null : normalizeStoryStudioEventReference(input.eventRef)
  };
}

function resolveEventReference({ operations, authorControl, projectId, reference }) {
  if (reference.projectId !== projectId) throw authorityError("EVENT_PROJECT_MISMATCH", "事件引用不属于当前故事项目。");
  let event;
  try {
    event = operations.readWorldObject({ projectId, objectId: reference.eventId });
  } catch {
    throw authorityError("EVENT_MISSING", "引用的事件当前不可用。");
  }
  try {
    assertStoryStudioEventReferenceEligibility({
      reference,
      event,
      consumer: "nuwa-simulation",
      canonVerified: event.status !== "committed" || authorControl.verifyCanonEventRead({ projectId, eventId: event.id })
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "";
    if (/Canon verified/u.test(reason)) {
      throw authorityError("EVENT_UNVERIFIED", "引用的已确认事件没有通过完整作者确认链验证。");
    }
    if (/eligible/u.test(reason)) {
      throw authorityError("EVENT_STATE_INELIGIBLE", "该事件状态不能作为本轮女娲推演来源。");
    }
    throw authorityError("EVENT_STALE", "引用的事件已经变化，请重新选择后再推演。");
  }
  return Object.freeze({ reference, event });
}

function resolveContextRefs({ operations, authorControl, projectId, refs, documentSource }) {
  let requested;
  try {
    requested = normalizeTianyiObjectContextRefs(refs ?? []);
  } catch {
    throw authorityError("CONTEXT_REFERENCE_INVALID", "本轮上下文引用无效。");
  }
  const resolved = [];
  for (const ref of requested) {
    if (ref.projectId !== projectId || ref.state !== "current" || ref.inclusion !== "included") {
      throw authorityError("CONTEXT_REFERENCE_UNAVAILABLE", "本轮上下文引用不是当前可用来源。");
    }
    if (ref.ownerType === "markdown-writing" && ref.objectType === "selection") {
      const expectedStableId = `selection.${documentSource.binding.selection.start}.${documentSource.binding.selection.end}`;
      if (
        ref.ownerId !== documentSource.binding.documentId ||
        ref.contentHash !== documentSource.binding.documentRevision ||
        ref.stableId !== expectedStableId
      ) {
        throw authorityError("CONTEXT_SELECTION_UNBOUND", "额外文档选区没有受保护的服务端绑定。");
      }
      continue;
    }
    if (ref.ownerType !== "markdown-object") {
      throw authorityError("CONTEXT_OWNER_UNSUPPORTED", "此上下文来源尚不能由服务端安全解析。");
    }
    if (ref.objectType === "event") {
      throw authorityError("CONTEXT_EVENT_REFERENCE_REQUIRED", "事件必须通过稳定事件引用进入女娲，不能作为通用对象上下文传入。");
    }
    let object;
    try {
      object = operations.readWorldObject({ projectId, objectId: ref.ownerId });
    } catch {
      throw authorityError("CONTEXT_SOURCE_MISSING", "引用的上下文来源当前不可用。");
    }
    if (
      ref.stableId !== object.id ||
      ref.objectType !== object.type ||
      ref.contentHash !== object.revisionToken
    ) {
      throw authorityError("CONTEXT_SOURCE_STALE", "引用的上下文来源已经变化，请重新选择后再推演。");
    }
    if (object.type === "event" && object.status === "committed" && !authorControl.verifyCanonEventRead({ projectId, eventId: object.id })) {
      throw authorityError("CONTEXT_EVENT_UNVERIFIED", "引用的已确认事件没有通过完整作者确认链验证。");
    }
    resolved.push(Object.freeze({ ...ref, label: object.title }));
  }
  return resolved;
}

function readWritingDocument(operations, projectId, documentId) {
  try {
    return operations.readWritingDocument({ projectId, documentId });
  } catch {
    throw authorityError("DOCUMENT_MISSING", "当前写作文档不可用，请重新打开后再推演。");
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw authorityError("REQUEST_SHAPE_INVALID", `${label} 无效。`);
  }
  return value;
}

function exact(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw authorityError("REQUEST_SHAPE_INVALID", `${label} 无效。`);
  }
}

function authorityError(code, message) {
  return new GoldenLoopSourceBindingError(code, message);
}
