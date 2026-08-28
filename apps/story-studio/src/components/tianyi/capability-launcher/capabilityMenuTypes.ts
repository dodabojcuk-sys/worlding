import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";

export type CapabilityMenuSource = "built-in" | "skill" | "workflow";
export type CapabilityAvailability = "available" | "not-connected" | "management-only";
export type CapabilityRequiredMode = "dialogue" | "agent" | "either";
export type CapabilityPermissionIntent = "read-only" | "suggest" | "candidate" | "authorized-edit";
export type CapabilityMenuGroup = "smart-tasks" | "context-content" | "extensions";

export type CapabilityInvokeIntent = {
  capabilityId: string;
  workspace: TianyiContextualSpaceId;
  requestedPermission: CapabilityPermissionIntent;
};

export type CapabilityMenuItem = {
  id: string;
  labelKey: string;
  group: CapabilityMenuGroup;
  icon: "route" | "telescope" | "library" | "create" | "quote" | "skill" | "workflow";
  availability: CapabilityAvailability;
  requiredMode: CapabilityRequiredMode;
  requiredPermission: CapabilityPermissionIntent;
  source: CapabilityMenuSource;
  invokeIntent: CapabilityInvokeIntent;
  keywords: readonly string[];
  recommended?: boolean;
};
