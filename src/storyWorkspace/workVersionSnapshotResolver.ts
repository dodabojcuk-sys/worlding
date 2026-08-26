import { createHash } from "node:crypto";

import {
  WORK_VERSION_REQUIRED_OWNER_KINDS,
  type OwnerSnapshotRef,
  type WorkVersionOwnerKind
} from "./workVersionAuthority.ts";

export type WorkVersionOwnerProjectionSlice = {
  ownerIdentity: string;
  projectionSchemaVersion: string;
  revisionToken: string;
  stableReferenceIds: string[];
  provenanceReceiptIds: string[];
  canonicalProjection: unknown;
};

export type WorkVersionOwnerProjectionBundle = Record<WorkVersionOwnerKind, WorkVersionOwnerProjectionSlice>;

const FORBIDDEN_PROJECTION_KEYS = new Set([
  "apikey",
  "credential",
  "cookie",
  "debugsecret",
  "filesystempath",
  "privatekey",
  "prompt",
  "providerrawresponse",
  "rawresponse",
  "runtimebody",
  "runtimestate",
  "sessionbody",
  "archivebody",
  "shellcommand"
]);

const MAX_CANONICAL_PROJECTION_BYTES = 2 * 1024 * 1024;

/**
 * Resolves a complete work snapshot into stable owner references and digests.
 * The canonical projections are hashed in memory and are never returned or
 * persisted by the WorkVersion authority.
 */
export function resolveWorkVersionOwnerSnapshotRefs(bundle: WorkVersionOwnerProjectionBundle): OwnerSnapshotRef[] {
  assertExactKeys(bundle, [...WORK_VERSION_REQUIRED_OWNER_KINDS], "Owner projection bundle");
  return WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind) => resolveSlice(ownerKind, bundle[ownerKind]));
}

function resolveSlice(ownerKind: WorkVersionOwnerKind, raw: WorkVersionOwnerProjectionSlice): OwnerSnapshotRef {
  assertExactKeys(raw, ["ownerIdentity", "projectionSchemaVersion", "revisionToken", "stableReferenceIds", "provenanceReceiptIds", "canonicalProjection"], `${ownerKind} projection slice`);
  const canonicalProjection = canonicalSafeProjection(raw.canonicalProjection, `${ownerKind} projection`);
  if (Buffer.byteLength(canonicalProjection, "utf8") > MAX_CANONICAL_PROJECTION_BYTES) {
    throw new Error(`${ownerKind} projection exceeds the snapshot digest limit.`);
  }
  return {
    ownerKind,
    ownerIdentity: requireText(raw.ownerIdentity, `${ownerKind} owner identity`, 180),
    projectionSchemaVersion: requireText(raw.projectionSchemaVersion, `${ownerKind} projection schema`, 120),
    revisionToken: requireText(raw.revisionToken, `${ownerKind} revision token`, 180),
    canonicalDigest: hash(canonicalProjection),
    stableReferenceIds: normalizeTextArray(raw.stableReferenceIds, `${ownerKind} stable reference`, 240, true),
    provenanceReceiptIds: normalizeTextArray(raw.provenanceReceiptIds, `${ownerKind} provenance receipt`, 240, false),
    completeness: "complete"
  };
}

function canonicalSafeProjection(value: unknown, label: string): string {
  const seen = new Set<object>();
  let scalarCount = 0;

  function visit(item: unknown, pointer: string): unknown {
    if (item === null || typeof item === "string" || typeof item === "boolean") {
      scalarCount += 1;
      return item;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new Error(`${label} contains a non-finite number at ${pointer}.`);
      scalarCount += 1;
      return item;
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new Error(`${label} contains a cycle at ${pointer}.`);
      seen.add(item);
      const projected = item.map((entry, index) => visit(entry, `${pointer}[${index}]`));
      seen.delete(item);
      return projected;
    }
    if (!item || typeof item !== "object" || Object.getPrototypeOf(item) !== Object.prototype) {
      throw new Error(`${label} contains an unsupported value at ${pointer}.`);
    }
    if (seen.has(item)) throw new Error(`${label} contains a cycle at ${pointer}.`);
    seen.add(item);
    const projected: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) {
      const normalizedKey = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
      if (FORBIDDEN_PROJECTION_KEYS.has(normalizedKey)) throw new Error(`${label} contains forbidden field ${key}.`);
      projected[key] = visit(entry, `${pointer}.${key}`);
    }
    seen.delete(item);
    return projected;
  }

  const projected = visit(value, "$root");
  if (scalarCount === 0) throw new Error(`${label} is empty and cannot prove completeness.`);
  return JSON.stringify(projected);
}

function assertExactKeys(value: unknown, allowed: string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value as object);
  const unknown = keys.filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field: ${unknown.join(", ")}.`);
  if (missing.length > 0) throw new Error(`${label} is missing required slice: ${missing.join(", ")}.`);
}

function normalizeTextArray(value: unknown, label: string, maxLength: number, requireOne: boolean): string[] {
  if (!Array.isArray(value) || value.length > 512 || (requireOne && value.length === 0)) throw new Error(`${label} list is invalid.`);
  return [...new Set(value.map((entry) => requireText(entry, label, maxLength)))].sort();
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
