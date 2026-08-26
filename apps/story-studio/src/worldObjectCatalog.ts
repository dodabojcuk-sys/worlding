import { Box, Flag, MapPin, ScrollText, Sparkles, UserRound, Waypoints, type LucideIcon } from "lucide-react";

import type { AgentTypeDefinition, WorldObjectType } from "./lib/localTransport";

export const WORLD_OBJECT_TYPES: ReadonlyArray<{ value: WorldObjectType; label: string; icon: LucideIcon }> = [
  { value: "character", label: "角色", icon: UserRound },
  { value: "location", label: "地点", icon: MapPin },
  { value: "event", label: "事件", icon: Sparkles },
  { value: "item", label: "物品", icon: Box },
  { value: "faction", label: "组织", icon: Flag },
  { value: "rule", label: "规则", icon: ScrollText },
  { value: "thread", label: "线索", icon: Waypoints }
];

export function objectTypeLabel(value: WorldObjectType): string {
  return WORLD_OBJECT_TYPES.find((item) => item.value === value)?.label || value;
}

export function agentTypeFieldValueKey(fieldId: string): string {
  return `agent_field_${fieldId.normalize("NFC").trim().toLocaleLowerCase("en-US").replaceAll(".", "_")}`;
}

export function authorFacingObjectTypeLabel(input: {
  sourceType: WorldObjectType;
  agentTypeId?: string | null;
  agentTypes?: AgentTypeDefinition[];
}): { label: string; retired: boolean; technicalTypeId: string | null } {
  const explicit = input.agentTypeId ? input.agentTypes?.find((type) => type.typeId === input.agentTypeId) : null;
  if (explicit && !explicit.builtin) return { label: explicit.label, retired: explicit.status === "retired", technicalTypeId: explicit.typeId };
  return { label: objectTypeLabel(input.sourceType), retired: false, technicalTypeId: input.agentTypeId || null };
}

export function authorFacingObjectTags(tags: string[]): string[] {
  return tags.filter((tag) => tag.trim().toLocaleLowerCase("en-US") !== "fixture");
}
