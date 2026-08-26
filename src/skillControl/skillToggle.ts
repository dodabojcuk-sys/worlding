export type SkillToggleState = "off" | "observe" | "active";

export type SkillMode = "product" | "compiler";

export type SkillModeVisibility = "all" | SkillMode;

export type SkillToggle = {
  skillId: string;
  state: SkillToggleState;
  priority: number;
  fallbackSkillIds: string[];
  modeVisibility: SkillModeVisibility;
};

export function isSkillVisibleInMode(toggle: SkillToggle, mode: SkillMode): boolean {
  return toggle.modeVisibility === "all" || toggle.modeVisibility === mode;
}
