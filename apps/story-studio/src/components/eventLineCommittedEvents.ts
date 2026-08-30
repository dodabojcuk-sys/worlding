import type {
  CanonReadFailure,
  CanonReadFailureKind,
  VerifiedCanonEventDetailRead,
  VerifiedCanonEventListRead,
  WorldObject,
  WorldObjectSummary
} from "../lib/localTransport";
import { buildEventSemanticNode, type EventSemanticNode } from "../../../../src/storyContracts/eventSemanticHierarchy.ts";

export type {
  CanonReadFailure,
  CanonReadFailureKind,
  VerifiedCanonEventDetailRead,
  VerifiedCanonEventListRead
};

export type EventLineEventSummary = WorldObjectSummary;
export type EventLineEventDetail = WorldObject;

export type EventLineEventMetadata = {
  unitLabel: string | null;
  setPointLabel?: string | null;
  sceneLabel: string | null;
  storyLineLabel?: string | null;
  storyLineKind?: EventSemanticNode["storyLine"]["kind"];
  characterLabels: readonly string[];
  locationLabels: readonly string[];
  narrativeTimeLabel?: string;
  narrativeTimeKind?: EventSemanticNode["time"]["kind"];
  openQuestions?: readonly string[];
  status?: EventSemanticNode["status"];
};

type EventRecord = Pick<WorldObjectSummary, "id" | "type" | "status" | "tags">;

/** Keeps Event Line subordinate to the Author Control verified-Canon read contract. */
export function isVerifiedCanonEvent(value: EventRecord, verifiedEventIds: ReadonlySet<string>): boolean {
  return value.type === "event" &&
    value.status === "committed" &&
    value.tags.includes("作者确认") &&
    verifiedEventIds.has(value.id);
}

export function verifiedCanonEventSummaries(objects: WorldObjectSummary[], verifiedEventIds: readonly string[]): WorldObjectSummary[] {
  const verifiedIds = new Set(verifiedEventIds);
  return objects.filter((event) => isVerifiedCanonEvent(event, verifiedIds));
}

/**
 * The unified workspace projects verified Canon events plus ordinary drafts
 * written directly by the author. Planning records remain in the existing
 * candidate and impact-review flow, so they cannot masquerade as drafts.
 */
export function isEventWorkspaceProjectionEvent(value: EventRecord, verifiedEventIds: ReadonlySet<string>): boolean {
  return isVerifiedCanonEvent(value, verifiedEventIds) || (
    value.type === "event" &&
    value.status === "draft" &&
    value.tags.includes("作者草稿")
  );
}

export function eventWorkspaceProjectionSummaries(objects: WorldObjectSummary[], verifiedEventIds: readonly string[]): WorldObjectSummary[] {
  const verifiedIds = new Set(verifiedEventIds);
  return objects.filter((event) => isEventWorkspaceProjectionEvent(event, verifiedIds));
}

export function isVerifiedCanonEventDetail(value: WorldObject): boolean {
  return value.type === "event" &&
    value.status === "committed" &&
    value.tags.includes("作者确认") &&
    value.canonicalReadVerified === true;
}

/**
 * Reads presentation metadata from existing tags without creating a Unit,
 * relation, or story fact. Unknown metadata stays unknown in the UI.
 */
export function eventLineEventMetadata(event: Pick<WorldObjectSummary, "tags">): EventLineEventMetadata {
  const node = buildEventSemanticNode({ id: "metadata", title: "metadata", tags: event.tags });
  const metadata: EventLineEventMetadata = {
    unitLabel: node.storyUnit.label === "未归入故事单元" ? null : node.storyUnit.label,
    sceneLabel: firstTaggedValue(event.tags, ["Scene", "场景"]),
    characterLabels: taggedValues(event.tags, ["Character", "Actor", "角色", "人物"]),
    locationLabels: taggedValues(event.tags, ["Location", "地点", "场所"])
  };
  const hasSemanticTags = event.tags.some((tag) => /^(?:Set Point|集点|Story Line|故事线|Line|Time|时间|World Time|世界时间|Open Question|开放问题|Question|状态|Status)[：:]/iu.test(tag));
  if (hasSemanticTags) {
    metadata.setPointLabel = node.setPoint.label === "未指定集点" ? null : node.setPoint.label;
    metadata.storyLineLabel = node.storyLine.label === "主线" ? null : node.storyLine.label;
    metadata.storyLineKind = node.storyLine.kind;
    metadata.narrativeTimeLabel = node.time.label;
    metadata.narrativeTimeKind = node.time.kind;
    metadata.openQuestions = node.openQuestions;
    metadata.status = node.status;
  }
  return metadata;
}

export function eventLineSemanticNode(event: EventLineEventSummary | EventLineEventDetail): EventSemanticNode {
  return buildEventSemanticNode({
    id: event.id,
    title: event.title,
    tags: event.tags,
    properties: "properties" in event ? event.properties : undefined,
    body: "body" in event ? event.body : undefined,
    revision: event.revisionToken,
    status: event.status
  });
}

export function confirmedEventRelationProjection(detail: EventLineEventDetail | null): {
  incoming: readonly WorldObjectSummary[];
  outgoing: readonly WorldObjectSummary[];
} {
  if (!detail) return { incoming: [], outgoing: [] };
  return {
    incoming: detail.backlinks.filter((item) => item.type === "event" && item.status === "committed"),
    outgoing: detail.linkedObjects.filter((item) => item.type === "event" && item.status === "committed")
  };
}

function firstTaggedValue(tags: readonly string[], prefixes: readonly string[]): string | null {
  return taggedValues(tags, prefixes)[0] ?? null;
}

function taggedValues(tags: readonly string[], prefixes: readonly string[]): string[] {
  const values: string[] = [];
  for (const tag of tags) {
    for (const prefix of prefixes) {
      const match = tag.match(new RegExp(`^${escapeRegExp(prefix)}[：:]\\s*(.+)$`, "iu"));
      const value = match?.[1]?.trim();
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
