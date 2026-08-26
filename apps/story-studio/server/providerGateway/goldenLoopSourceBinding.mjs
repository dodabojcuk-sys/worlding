import { createHash } from "node:crypto";

export const GOLDEN_LOOP_DOCUMENT_SOURCE_BINDING_VERSION = "story-studio-document-selection-binding/v1";
export const GOLDEN_LOOP_SELECTION_COORDINATE = "utf16-code-unit";
export const GOLDEN_LOOP_MAX_SELECTION_UTF16_UNITS = 4_000;

export class GoldenLoopSourceBindingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GoldenLoopSourceBindingError";
    this.code = code;
  }
}

/**
 * Resolves exactly the source text that may enter a Golden Loop Provider pack.
 * The range is intentionally JavaScript UTF-16 code units because it is the
 * coordinate system emitted by textarea.selectionStart/selectionEnd. Content
 * is never normalized, trimmed, or reconstructed after slicing.
 */
export function resolveGoldenLoopDocumentSource({ document, requested }) {
  if (!document || typeof document !== "object" || typeof document.body !== "string") {
    throw sourceError("DOCUMENT_MISSING", "当前写作文档无法作为本轮受保护来源。");
  }
  const documentId = requireStableId(requested?.documentId, "DOCUMENT_ID_INVALID");
  const documentRevision = requireHash(requested?.documentRevision, "DOCUMENT_REVISION_INVALID");
  if (document.id !== documentId) throw sourceError("DOCUMENT_MISMATCH", "请求文档与当前受保护来源不一致。");
  if (document.revisionToken !== documentRevision) throw sourceError("DOCUMENT_STALE", "写作文档已经修订，请重新确认选区后再推演。");
  const selection = normalizeUtf16Selection(requested?.selection, document.body);
  const content = document.body.slice(selection.start, selection.end);
  if (!content.trim()) throw sourceError("SELECTION_EMPTY", "当前选区没有可用的故事内容。");
  if (content.length > GOLDEN_LOOP_MAX_SELECTION_UTF16_UNITS) {
    throw sourceError("SELECTION_TOO_LARGE", "当前选区超过本轮受保护推演的长度上限，请缩小选区。");
  }
  const binding = Object.freeze({
    version: GOLDEN_LOOP_DOCUMENT_SOURCE_BINDING_VERSION,
    documentId,
    documentRevision,
    selection,
    contentHash: contentHash(content)
  });
  return Object.freeze({ binding, content });
}

export function assertGoldenLoopReceiptSourceBinding(contextReceipt, documentSource) {
  const binding = contextReceipt?.sourceBinding;
  if (!binding || typeof binding !== "object") {
    throw sourceError("RECEIPT_SOURCE_BINDING_MISSING", "此 Context Receipt 未绑定可验证的文档选区，不能作为新的模型输入。");
  }
  const expected = documentSource?.binding;
  if (!expected || !sameBinding(binding, expected) || contentHash(documentSource.content) !== expected.contentHash) {
    throw sourceError("RECEIPT_SOURCE_BINDING_MISMATCH", "Context Receipt 与当前受保护来源不一致。");
  }
  return Object.freeze({ ...expected, selection: { ...expected.selection } });
}

/**
 * Re-read the writing owner immediately before Receipt reuse or Provider work.
 * A document changed after the browser captured its range cannot silently
 * continue with the prior in-memory text.
 */
export function revalidateGoldenLoopDocumentSource({ document, documentSource }) {
  const binding = documentSource?.binding;
  if (!binding || typeof binding !== "object") {
    throw sourceError("DOCUMENT_SOURCE_BINDING_MISSING", "当前受保护来源缺少可验证的文档选区绑定。");
  }
  const current = resolveGoldenLoopDocumentSource({
    document,
    requested: {
      documentId: binding.documentId,
      documentRevision: binding.documentRevision,
      selection: binding.selection
    }
  });
  if (!sameBinding(current.binding, binding) || current.content !== documentSource.content) {
    throw sourceError("DOCUMENT_SOURCE_CHANGED", "写作文档选区已经变化，请重新确认后再推演。");
  }
  return current;
}

export function normalizeUtf16Selection(value, documentBody) {
  if (!documentBody || typeof documentBody !== "string" || hasMalformedSurrogate(documentBody)) {
    throw sourceError("DOCUMENT_CONTENT_INVALID", "当前写作文档包含无法安全解析的内容。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw sourceError("SELECTION_INVALID", "当前选区无效。");
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys[0] !== "coordinate" || keys[1] !== "end" || keys[2] !== "start") {
    throw sourceError("SELECTION_INVALID", "当前选区无效。");
  }
  if (value.coordinate !== GOLDEN_LOOP_SELECTION_COORDINATE) {
    throw sourceError("SELECTION_COORDINATE_INVALID", "当前选区坐标类型不受支持。");
  }
  const start = value.start;
  const end = value.end;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > documentBody.length) {
    throw sourceError("SELECTION_OUT_OF_RANGE", "当前选区已超出文档范围。");
  }
  if (splitsSurrogatePair(documentBody, start) || splitsSurrogatePair(documentBody, end)) {
    throw sourceError("SELECTION_SURROGATE_SPLIT", "当前选区不能从 emoji 等字符的中间开始或结束。");
  }
  return Object.freeze({ coordinate: GOLDEN_LOOP_SELECTION_COORDINATE, start, end });
}

function sameBinding(left, right) {
  return left.version === GOLDEN_LOOP_DOCUMENT_SOURCE_BINDING_VERSION &&
    right.version === GOLDEN_LOOP_DOCUMENT_SOURCE_BINDING_VERSION &&
    left.documentId === right.documentId &&
    left.documentRevision === right.documentRevision &&
    left.contentHash === right.contentHash &&
    left.selection?.coordinate === GOLDEN_LOOP_SELECTION_COORDINATE &&
    right.selection?.coordinate === GOLDEN_LOOP_SELECTION_COORDINATE &&
    left.selection?.start === right.selection?.start &&
    left.selection?.end === right.selection?.end;
}

function requireStableId(value, code) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u.test(value)) {
    throw sourceError(code, "当前写作文档标识无效。");
  }
  return value;
}

function requireHash(value, code) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw sourceError(code, "当前写作文档版本无效。");
  }
  return value;
}

function contentHash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function splitsSurrogatePair(value, offset) {
  if (offset <= 0 || offset >= value.length) return false;
  const before = value.charCodeAt(offset - 1);
  const after = value.charCodeAt(offset);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF;
}

function hasMalformedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xDC00 || next > 0xDFFF) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

function sourceError(code, message) {
  return new GoldenLoopSourceBindingError(code, message);
}
