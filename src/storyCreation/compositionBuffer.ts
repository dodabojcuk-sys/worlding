export type CompositionState = { active: boolean; value: string };
export type CompositionEvent = { type: "start" } | { type: "change"; value: string } | { type: "end"; value: string };

/** Prevents partial Chinese IME composition text from crossing the autosave boundary. */
export function applyCompositionEvent(state: CompositionState, event: CompositionEvent): { state: CompositionState; commit: string | null } {
  if (event.type === "start") return { state: { ...state, active: true }, commit: null };
  if (event.type === "change") return { state: { active: state.active, value: event.value }, commit: state.active ? null : event.value };
  return { state: { active: false, value: event.value }, commit: event.value };
}
