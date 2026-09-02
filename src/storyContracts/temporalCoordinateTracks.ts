export type TemporalTrackId = "primary" | "parallel" | "aftermath";
export type TemporalTrack = { id: TemporalTrackId; label: string; coordinateY: number };

export const TEMPORAL_COORDINATE_TRACKS: readonly TemporalTrack[] = Object.freeze([
  Object.freeze({ id: "primary", label: "主序轨道", coordinateY: 150 }),
  Object.freeze({ id: "parallel", label: "并行事件轨道", coordinateY: 340 }),
  Object.freeze({ id: "aftermath", label: "余波轨道", coordinateY: 530 })
]);

/** Zoom changes rendered detail only; it never changes track identity or order. */
export function temporalTrackProjection(zoom: "far" | "medium" | "near"): Array<TemporalTrack & { detail: "compact" | "standard" | "expanded" }> {
  const detail = zoom === "far" ? "compact" : zoom === "near" ? "expanded" : "standard";
  return TEMPORAL_COORDINATE_TRACKS.map((track) => ({ ...track, detail }));
}
