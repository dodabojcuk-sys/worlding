import type { ContextReceiptSource } from "./continuityTypes.ts";
import type { TianyiContextProjection, TianyiProjectionSource } from "./tianyiContextProjection.ts";

export const TIANYI_MAX_ACTUAL_SOURCES = 8;
export const TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES = 240;
export const TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES = 960;
export const TIANYI_MAX_SOURCE_LINES = 20;
export const TIANYI_MAX_RECEIPT_BYTES = 128 * 1024;

export type TianyiRawSourceMaterial = {
  id: string;
  kind: string;
  hash: string;
  content: string;
  classification: "ordinary" | "personal-sensitive" | "secret" | "restricted" | "credential";
  range?: { startLine: number; endLine: number };
};

export type TianyiBoundedSourceBundle = {
  adapterSources: ContextReceiptSource[];
  excludedSources: Array<{ id: string; reason: string }>;
};

const ABSOLUTE_PATH_PATTERNS = [
  /\/(?:Users|home|private|var|tmp)\/(?:[^\s/]+\/)*[^\s]+/gu,
  /\b[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s]+/gu
] as const;
const API_KEY_PATTERN = /\b(?:sk|api|key)_[A-Za-z0-9_-]{16,}\b|\bsk-[A-Za-z0-9_-]{16,}\b/gu;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const SECRET_SECTION_MARKER = /<!--\s*world-os:section\b([^>]*)-->/giu;

export function buildTianyiBoundedSourceMaterial(input: {
  projection: TianyiContextProjection;
  sources: TianyiRawSourceMaterial[];
  localControlToken?: string;
  credentialCanaries?: string[];
}): TianyiBoundedSourceBundle {
  if (!Array.isArray(input.sources) || input.sources.length > 64) throw new Error("Tianyi source material input is invalid.");
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const adapterSources: ContextReceiptSource[] = [];
  const excludedSources: Array<{ id: string; reason: string }> = [];
  let remainingTotal = TIANYI_MAX_TOTAL_EXCERPT_GRAPHEMES;

  for (const projected of input.projection.sources) {
    if (adapterSources.length >= TIANYI_MAX_ACTUAL_SOURCES) {
      excludedSources.push({ id: projected.id, reason: "source-count-limit" });
      continue;
    }
    if (projected.state !== "current" || projected.exclusionReason) {
      excludedSources.push({ id: projected.id, reason: projected.exclusionReason ?? `source-${projected.state}` });
      continue;
    }
    const raw = sourceById.get(projected.id);
    if (!raw) {
      excludedSources.push({ id: projected.id, reason: "source-material-unavailable" });
      continue;
    }
    assertSourceMatchesProjection(raw, projected);
    if (raw.classification !== "ordinary") {
      excludedSources.push({ id: projected.id, reason: `${raw.classification}-raw-excerpt-denied` });
      continue;
    }
    if (remainingTotal <= 0) {
      excludedSources.push({ id: projected.id, reason: "total-excerpt-limit" });
      continue;
    }

    const lines = normalizeNewlines(toWellFormed(raw.content)).split("\n");
    const range = normalizeRange(raw.range, lines.length);
    const selected = lines.slice(range.startLine - 1, range.endLine).join("\n");
    const secretSafe = redactStructuredSecretSections(selected);
    const redacted = redactBoundedText(secretSafe.value, {
      localControlToken: input.localControlToken,
      credentialCanaries: input.credentialCanaries
    });
    const maximum = Math.min(TIANYI_MAX_SOURCE_EXCERPT_GRAPHEMES, remainingTotal);
    const excerpt = takeGraphemesWithinCodePointBudget(redacted.value, maximum).trim();
    const redactions = [...new Set([...secretSafe.redactions, ...redacted.redactions])].sort();
    if (!excerpt) {
      excludedSources.push({ id: projected.id, reason: "empty-after-redaction" });
      continue;
    }
    remainingTotal -= [...excerpt].length;
    adapterSources.push({
      id: projected.id,
      kind: raw.kind,
      hash: raw.hash,
      range,
      excerpt,
      transfer: "local-only",
      redactions
    });
  }

  return {
    adapterSources,
    excludedSources: dedupeExclusions(excludedSources)
  };
}

export function redactBoundedText(value: string, options: { localControlToken?: string; credentialCanaries?: string[] } = {}): { value: string; redactions: string[] } {
  let result = toWellFormed(value).normalize("NFC");
  const redactions: string[] = [];
  result = replaceAndRecord(result, CONTROL_CHARACTER_PATTERN, " ", "control-character", redactions);
  for (const pattern of ABSOLUTE_PATH_PATTERNS) result = replaceAndRecord(result, pattern, "[local path]", "absolute-path", redactions);
  result = replaceAndRecord(result, PRIVATE_KEY_PATTERN, "[redacted credential]", "private-key", redactions);
  result = replaceAndRecord(result, API_KEY_PATTERN, "[redacted credential]", "api-key", redactions);
  const explicitCanaries = [options.localControlToken, ...(options.credentialCanaries ?? [])]
    .filter((item): item is string => typeof item === "string" && item.length >= 8)
    .sort((left, right) => right.length - left.length);
  for (const canary of explicitCanaries) {
    if (!result.includes(canary)) continue;
    result = result.split(canary).join("[redacted credential]");
    redactions.push(canary === options.localControlToken ? "local-control-token" : "credential-canary");
  }
  return { value: result, redactions: [...new Set(redactions)].sort() };
}

export function graphemeCount(value: string): number {
  return [...segmentGraphemes(value)].length;
}

export function takeGraphemes(value: string, maximum: number): string {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error("Grapheme limit is invalid.");
  return [...segmentGraphemes(value)].slice(0, maximum).join("");
}

function takeGraphemesWithinCodePointBudget(value: string, maximum: number): string {
  let used = 0;
  let result = "";
  for (const segment of segmentGraphemes(value)) {
    const size = [...segment].length;
    if (used + size > maximum) break;
    result += segment;
    used += size;
  }
  return result;
}

function assertSourceMatchesProjection(source: TianyiRawSourceMaterial, projected: TianyiProjectionSource): void {
  if (source.id !== projected.id || source.hash !== projected.hash) throw new Error("Tianyi source material does not match its projection.");
  if (typeof source.kind !== "string" || !source.kind.trim() || [...source.kind].length > 80) throw new Error("Tianyi source material kind is invalid.");
  if (typeof source.content !== "string" || Buffer.byteLength(source.content, "utf8") > 2 * 1024 * 1024) throw new Error("Tianyi source material is invalid.");
}

function normalizeRange(value: TianyiRawSourceMaterial["range"], lineCount: number): { startLine: number; endLine: number } {
  const startLine = value?.startLine ?? 1;
  const requestedEnd = value?.endLine ?? Math.min(Math.max(lineCount, 1), TIANYI_MAX_SOURCE_LINES);
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(requestedEnd) || startLine < 1 || requestedEnd < startLine) throw new Error("Tianyi source range is invalid.");
  const endLine = Math.min(requestedEnd, startLine + TIANYI_MAX_SOURCE_LINES - 1, Math.max(lineCount, 1));
  if (startLine > Math.max(lineCount, 1)) throw new Error("Tianyi source range exceeds the source.");
  return { startLine, endLine };
}

function redactStructuredSecretSections(value: string): { value: string; redactions: string[] } {
  const markers = [...value.matchAll(SECRET_SECTION_MARKER)];
  if (markers.length === 0) return { value, redactions: [] };
  let result = value.slice(0, markers[0].index);
  let redacted = false;
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const start = Number(marker.index);
    const end = index + 1 < markers.length ? Number(markers[index + 1].index) : value.length;
    const segment = value.slice(start, end);
    if (/\bkind\s*=\s*["']secret["']/iu.test(marker[1] ?? "")) {
      result += "\n[secret section excluded]\n";
      redacted = true;
    } else {
      result += segment;
    }
  }
  return { value: result, redactions: redacted ? ["secret-section"] : [] };
}

function replaceAndRecord(value: string, pattern: RegExp, replacement: string, label: string, redactions: string[]): string {
  pattern.lastIndex = 0;
  if (!pattern.test(value)) return value;
  pattern.lastIndex = 0;
  redactions.push(label);
  return value.replace(pattern, replacement);
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function toWellFormed(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\uFFFD";
      }
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      result += "\uFFFD";
    } else {
      result += value[index];
    }
  }
  return result;
}

function segmentGraphemes(value: string): Iterable<string> {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)].map((item) => item.segment);
  }
  return Array.from(value);
}

function dedupeExclusions(values: Array<{ id: string; reason: string }>): Array<{ id: string; reason: string }> {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.id}:${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
