import {
  TIAN_YAN_R0_DEFAULT_LAYOUT,
  type TianyanR0PanelId,
  type TianyanR0ShellLayoutState
} from "../../../../src/storyContracts/tianyanR0ShellContract.ts";

export type ShellLayoutAction =
  | { type: "toggle"; panel: TianyanR0PanelId }
  | { type: "show"; panel: TianyanR0PanelId }
  | { type: "hide"; panel: TianyanR0PanelId };

export function createInitialShellLayout(shellLab: boolean): TianyanR0ShellLayoutState {
  if (!shellLab) return structuredClone(TIAN_YAN_R0_DEFAULT_LAYOUT);
  return {
    ...structuredClone(TIAN_YAN_R0_DEFAULT_LAYOUT),
    "global-tianyi": { ...TIAN_YAN_R0_DEFAULT_LAYOUT["global-tianyi"], visible: true },
    "page-inspector": { ...TIAN_YAN_R0_DEFAULT_LAYOUT["page-inspector"], visible: true }
  };
}

/** R0 changes visibility only; dock, float, side, snap, and persistence remain protocol values. */
export function reduceShellLayout(state: TianyanR0ShellLayoutState, action: ShellLayoutAction): TianyanR0ShellLayoutState {
  const current = state[action.panel];
  const visible = action.type === "show" ? true : action.type === "hide" ? false : !current.visible;
  return { ...state, [action.panel]: { ...current, visible } };
}
