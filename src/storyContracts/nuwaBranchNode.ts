import { createHash } from "node:crypto";

import { stableJson } from "../storyContinuity/continuityValidation.ts";

export const NUWA_BRANCH_NODE_SCHEMA = "tianyan-nuwa-branch-node/v1" as const;

/** A node is one natural narrative fragment; individual lines never become
 * Events.  Identity is minted once; provenance is append-only history. */
export type NuwaBranchNodeBlock =
  | { kind: "narration"; text: string }
  | { kind: "description"; text: string }
  | { kind: "action"; characterId: string | null; text: string }
  | { kind: "dialogue"; speakerId: string | "unknown:pending-bind"; text: string; heardBy: string[]; delivery: "spoken" | "aside" }
  | { kind: "psychology"; characterId: string | null; text: string };

export type NuwaBranchWorldTime =
  | { kind: "explicit"; label: string; sortKey: string }
  | { kind: "relative"; label: string }
  | { kind: "range"; label: string }
  | { kind: "parallel"; label: string }
  | { kind: "unknown" };

export type NuwaBranchNodeProvenance =
  | { kind: "nuwa-run"; runId: string; stepIds: string[]; handoffId: string | null }
  | { kind: "author-edit"; authorActionId: string; at: string };

/** Only draft / branch-adopted persist on a node.  staleness comes from
 * WorkVersionStaleness at read time and merging is projected from future
 * merge receipts; neither is ever stored here. */
export type NuwaBranchNodeReviewState = "draft" | "branch-adopted";

export type NuwaBranchNode = {
  schemaVersion: typeof NUWA_BRANCH_NODE_SCHEMA;
  nodeId: string;
  eventId: string;
  branchWorkVersionId: string;
  unitId: string;
  narrativePathId: string;
  sceneKey: string;
  title: string;
  blocks: NuwaBranchNodeBlock[];
  worldTime: NuwaBranchWorldTime;
  characterRefs: string[];
  provenance: NuwaBranchNodeProvenance[];
  reviewState: NuwaBranchNodeReviewState;
  contentRevision: number;
  creationOperationId: string;
  createdAt: string;
  updatedAt: string;
};

export type NuwaBranchScene = {
  sceneKey: string;
  unitId: string;
  title: string;
  creationOperationId: string;
  createdAt: string;
};

const HASH_PATTERN = /^[a-f0-9]{16,64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MAX_BLOCKS = 64;
const MAX_TEXT = 4_000;
const MAX_REFS = 16;

/** Identity is minted once from the branch identity plus the creation
 * operation; source steps, edits and regenerations never enter it. */
export function mintNuwaNodeId(branchWorkVersionId: string, creationOperationId: string): string {
  return `nuwa-node.${stableToken([requireId(branchWorkVersionId, "branch WorkVersion"), requireOperation(creationOperationId)].join("|"))}`;
}

export function mintNuwaSceneKey(branchWorkVersionId: string, sceneCreationOperationId: string): string {
  return `nuwa-scene.${stableToken([requireId(branchWorkVersionId, "branch WorkVersion"), requireOperation(sceneCreationOperationId)].join("|"))}`;
}

export function nuwaBranchEventId(nodeId: string): string {
  return `event.${stableToken(`nuwa-branch:${nodeId}`)}`;
}

export function normalizeNuwaBranchNode(raw: unknown): NuwaBranchNode {
  const value = plainObject(raw, "Nuwa branch node");
  exactFields(value, ["schemaVersion", "nodeId", "eventId", "branchWorkVersionId", "unitId", "narrativePathId", "sceneKey", "title", "blocks", "worldTime", "characterRefs", "provenance", "reviewState", "contentRevision", "creationOperationId", "createdAt", "updatedAt"], "Nuwa branch node");
  if (value.schemaVersion !== NUWA_BRANCH_NODE_SCHEMA) throw new TypeError("Unknown Nuwa branch node schema.");
  const nodeId = requireId(value.nodeId, "node id");
  if (!nodeId.startsWith("nuwa-node.")) throw new TypeError("Nuwa branch node identity must be minted.");
  const node: NuwaBranchNode = {
    schemaVersion: NUWA_BRANCH_NODE_SCHEMA,
    nodeId,
    eventId: requireId(value.eventId, "node event id"),
    branchWorkVersionId: requireId(value.branchWorkVersionId, "branch WorkVersion"),
    unitId: requireId(value.unitId, "Story Unit"),
    narrativePathId: requireId(value.narrativePathId, "narrative path"),
    sceneKey: requireSceneKey(value.sceneKey),
    title: requiredText(value.title, 160, "node title"),
    blocks: normalizeBlocks(value.blocks),
    worldTime: normalizeWorldTime(value.worldTime),
    characterRefs: idList(value.characterRefs, MAX_REFS, "character refs"),
    provenance: normalizeProvenance(value.provenance),
    reviewState: value.reviewState === "branch-adopted" ? "branch-adopted" : value.reviewState === "draft" ? "draft" : fail("Nuwa branch node review state is invalid."),
    contentRevision: positiveInteger(value.contentRevision, "content revision"),
    creationOperationId: requireOperation(value.creationOperationId),
    createdAt: timestamp(value.createdAt, "node createdAt"),
    updatedAt: timestamp(value.updatedAt, "node updatedAt")
  };
  return node;
}

export function normalizeBlocks(raw: unknown): NuwaBranchNodeBlock[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_BLOCKS) throw new TypeError("Nuwa branch node blocks are invalid.");
  return raw.map((entry, index) => {
    const block = plainObject(entry, `Nuwa branch block ${index}`);
    const at = (field: string): string => requiredText(block[field], MAX_TEXT, `block ${index} ${field}`);
    switch (block.kind) {
      case "narration":
      case "description":
        return { kind: block.kind, text: at("text") };
      case "action":
      case "psychology":
        return { kind: block.kind, characterId: block.characterId == null ? null : requireId(block.characterId, `block ${index} characterId`), text: at("text") };
      case "dialogue": {
        const speakerRaw = block.speakerId;
        const speakerId = typeof speakerRaw === "string" && speakerRaw.startsWith("unknown:") ? speakerRaw : requireId(speakerRaw, `block ${index} speakerId`);
        const heardBy = idList(block.heardBy, MAX_REFS, `block ${index} heardBy`);
        if (typeof speakerRaw === "string" && speakerRaw.startsWith("unknown:") && heardBy.length) throw new TypeError("An unbound speaker cannot deliver a heard statement.");
        if (block.delivery !== "spoken" && block.delivery !== "aside") throw new TypeError(`block ${index} delivery is invalid.`);
        return { kind: "dialogue", speakerId, text: at("text"), heardBy, delivery: block.delivery };
      }
      default:
        return fail(`Nuwa branch block ${index} kind is invalid.`);
    }
  });
}

function normalizeWorldTime(raw: unknown): NuwaBranchWorldTime {
  const value = plainObject(raw, "Nuwa branch world time");
  switch (value.kind) {
    case "explicit":
      return { kind: "explicit", label: requiredText(value.label, 120, "world time label"), sortKey: requiredText(value.sortKey, 120, "world time sortKey") };
    case "relative":
    case "range":
    case "parallel":
      return { kind: value.kind, label: requiredText(value.label, 120, "world time label") };
    case "unknown":
      return { kind: "unknown" };
    default:
      return fail("Nuwa branch world time kind is invalid.");
  }
}

function normalizeProvenance(raw: unknown): NuwaBranchNodeProvenance[] {
  if (!Array.isArray(raw) || raw.length > 64) throw new TypeError("Nuwa branch node provenance is invalid.");
  return raw.map((entry) => {
    const item = plainObject(entry, "Nuwa branch provenance entry");
    if (item.kind === "nuwa-run") {
      return { kind: "nuwa-run", runId: requireId(item.runId, "provenance Run"), stepIds: idList(item.stepIds, 64, "provenance steps"), handoffId: item.handoffId == null ? null : requireId(item.handoffId, "provenance handoff") };
    }
    if (item.kind === "author-edit") {
      return { kind: "author-edit", authorActionId: requireOperation(item.authorActionId), at: timestamp(item.at, "provenance edit time") };
    }
    return fail("Nuwa branch provenance kind is invalid.");
  });
}

/** Deterministic human-readable projection of the blocks.  The structured
 * blocks remain the single content authority; this rendering is write-only. */
export function renderNuwaBranchNodeBody(node: Pick<NuwaBranchNode, "title" | "blocks">): string {
  const lines = [`# ${node.title}`, ""];
  for (const block of node.blocks) {
    if (block.kind === "narration" || block.kind === "description") lines.push(block.text, "");
    else if (block.kind === "dialogue") lines.push(`${block.speakerId}${block.delivery === "aside" ? "（旁白式）" : ""}：“${block.text}”`, "");
    else if (block.kind === "psychology") lines.push(`【心理】${block.text}`, "");
    else lines.push(`【行动】${block.text}`, "");
  }
  return lines.join("\n");
}

export function nuwaBranchNodeDigest(node: NuwaBranchNode): string {
  return stableToken(stableJson({ nodeId: node.nodeId, contentRevision: node.contentRevision, blocks: node.blocks, reviewState: node.reviewState }));
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, fields: string[], label: string): void {
  const allowed = new Set(fields);
  if (Object.keys(value).some((key) => !allowed.has(key)) || fields.some((key) => !Object.hasOwn(value, key))) throw new TypeError(`${label} fields are invalid.`);
}

function idList(raw: unknown, maximum: number, label: string): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > maximum) throw new TypeError(`${label} are invalid.`);
  return [...new Set(raw.map((item) => requireId(item, label)))];
}

function requireSceneKey(raw: unknown): string {
  const value = requireId(raw, "scene key");
  if (!value.startsWith("nuwa-scene.")) throw new TypeError("Nuwa branch scene identity must be minted.");
  return value;
}

function requireOperation(raw: unknown): string {
  const value = requiredText(raw, 180, "operation id");
  if (!/^[a-z0-9][a-z0-9._:-]{0,179}$/iu.test(value)) throw new TypeError("Nuwa branch operation id is invalid.");
  return value;
}

function requireId(raw: unknown, label: string): string {
  const value = requiredText(raw, 240, label);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:@/-]*$/u.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function requiredText(raw: unknown, maximum: number, label: string): string {
  if (typeof raw !== "string") throw new TypeError(`${label} must be a string.`);
  const value = raw.normalize("NFC").trim();
  if (!value || value.length > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}

function positiveInteger(raw: unknown, label: string): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 1) throw new TypeError(`${label} is invalid.`);
  return raw as number;
}

function timestamp(raw: unknown, label: string): string {
  const value = requiredText(raw, 48, label);
  if (!TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} is invalid.`);
  return value;
}

function stableToken(value: string): string {
  if (!HASH_PATTERN.test(stableHash(value))) throw new TypeError("Nuwa branch token is invalid.");
  return stableHash(value);
}

function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

function fail(message: string): never {
  throw new TypeError(message);
}
