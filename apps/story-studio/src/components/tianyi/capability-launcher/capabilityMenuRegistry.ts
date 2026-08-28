import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";

import type { CapabilityMenuItem } from "./capabilityMenuTypes.ts";

export type CapabilityMenuContribution = Omit<CapabilityMenuItem, "invokeIntent"> & { invokeIntent?: CapabilityMenuItem["invokeIntent"] };

export function createCapabilityMenuRegistry(input: {
  workspace: TianyiContextualSpaceId;
  skills?: readonly CapabilityMenuContribution[];
  workflows?: readonly CapabilityMenuContribution[];
}): readonly CapabilityMenuItem[] {
  const builtIns: CapabilityMenuItem[] = [
    item("reason-forward", "capability.reasonForward", "smart-tasks", "route", "agent", "suggest", input.workspace, ["推演", "reason", "future"], true),
    item("forward-planning", "capability.forwardPlanning", "smart-tasks", "telescope", "agent", "suggest", input.workspace, ["规划", "plan", "long term"], true),
    item("attach-library", "capability.library", "context-content", "library", "either", "read-only", input.workspace, ["资料", "library", "context"], true),
    item("create-content", "capability.create", "context-content", "create", "either", "candidate", input.workspace, ["创建", "create", "candidate"], true),
    item("add-reference", "capability.reference", "context-content", "quote", "either", "read-only", input.workspace, ["引用", "reference", "source"]),
    item("skills", "capability.skills", "extensions", "skill", "agent", "suggest", input.workspace, ["skill", "技能"], false, "skill", "management-only"),
    item("workflows", "capability.workflows", "extensions", "workflow", "agent", "suggest", input.workspace, ["workflow", "工作流"], false, "workflow", "management-only")
  ];
  const adapt = (contribution: CapabilityMenuContribution): CapabilityMenuItem => ({
    ...contribution,
    invokeIntent: contribution.invokeIntent ?? {
      capabilityId: contribution.id,
      workspace: input.workspace,
      requestedPermission: contribution.requiredPermission
    }
  });
  return [...builtIns, ...(input.skills ?? []).map(adapt), ...(input.workflows ?? []).map(adapt)];
}

function item(
  id: string,
  labelKey: string,
  group: CapabilityMenuItem["group"],
  icon: CapabilityMenuItem["icon"],
  requiredMode: CapabilityMenuItem["requiredMode"],
  requiredPermission: CapabilityMenuItem["requiredPermission"],
  workspace: TianyiContextualSpaceId,
  keywords: readonly string[],
  recommended = false,
  source: CapabilityMenuItem["source"] = "built-in",
  availability: CapabilityMenuItem["availability"] = "available"
): CapabilityMenuItem {
  return {
    id, labelKey, group, icon, availability, requiredMode, requiredPermission, source, keywords, recommended,
    invokeIntent: { capabilityId: id, workspace, requestedPermission: requiredPermission }
  };
}
