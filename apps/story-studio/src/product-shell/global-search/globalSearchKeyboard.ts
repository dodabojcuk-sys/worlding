export type GlobalSearchKeyboardState = { activeIndex: number; resultCount: number };

/** Pure interaction owner used by the palette and unit tests. */
export function moveGlobalSearchActiveIndex(state: GlobalSearchKeyboardState, key: "ArrowDown" | "ArrowUp" | "Home" | "End"): number {
  if (state.resultCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return state.resultCount - 1;
  if (state.activeIndex < 0) return key === "ArrowDown" ? 0 : state.resultCount - 1;
  return key === "ArrowDown"
    ? (state.activeIndex + 1) % state.resultCount
    : (state.activeIndex - 1 + state.resultCount) % state.resultCount;
}

export function globalSearchResultId(resultId: string): string {
  return `global-search-result-${resultId.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}
