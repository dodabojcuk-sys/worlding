export type MapCoordinatePoint = { x: number; y: number };
export type MapCoordinateBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type MapSimilarityTransform = { translateX: number; translateY: number; rotation: number; scale: number };
export type MapCalibrationControlPoints = { sourcePoints: [MapCoordinatePoint, MapCoordinatePoint]; targetPoints: [MapCoordinatePoint, MapCoordinatePoint] };

const MIN_SEGMENT_LENGTH = 1e-6;

/**
 * Solve the orientation-preserving similarity transform from child-map
 * coordinates into parent-map coordinates. Both maps use x-right/y-down.
 */
export function solveMapSimilarityTransform(calibration: MapCalibrationControlPoints): MapSimilarityTransform {
  const [sourceA, sourceB] = calibration.sourcePoints;
  const [targetA, targetB] = calibration.targetPoints;
  if (![sourceA.x, sourceA.y, sourceB.x, sourceB.y, targetA.x, targetA.y, targetB.x, targetB.y].every(Number.isFinite)) throw new Error("校准点必须是有效数字。");
  const sourceVector = { x: sourceB.x - sourceA.x, y: sourceB.y - sourceA.y };
  const targetVector = { x: targetB.x - targetA.x, y: targetB.y - targetA.y };
  const sourceLength = Math.hypot(sourceVector.x, sourceVector.y);
  const targetLength = Math.hypot(targetVector.x, targetVector.y);
  if (sourceLength < MIN_SEGMENT_LENGTH) throw new Error("子图的两个校准点不能重合。");
  if (targetLength < MIN_SEGMENT_LENGTH) throw new Error("父图的两个对应点不能重合。");
  const scale = targetLength / sourceLength;
  if (scale < .0001 || scale > 10000) throw new Error("校准得到的缩放比例超出地图支持范围。");
  const radians = Math.atan2(targetVector.y, targetVector.x) - Math.atan2(sourceVector.y, sourceVector.x);
  const rotation = normalizeDegrees(radians * 180 / Math.PI);
  const rotatedA = rotateAndScale(sourceA, radians, scale);
  return { translateX: targetA.x - rotatedA.x, translateY: targetA.y - rotatedA.y, rotation, scale };
}

export function applyMapSimilarityTransform(point: MapCoordinatePoint, transform: MapSimilarityTransform): MapCoordinatePoint {
  const rotated = rotateAndScale(point, transform.rotation * Math.PI / 180, transform.scale);
  return { x: rotated.x + transform.translateX, y: rotated.y + transform.translateY };
}

export function mapCanvasPointToCoordinate(point: MapCoordinatePoint, bounds: MapCoordinateBounds): MapCoordinatePoint {
  return { x: bounds.minX + point.x / 100 * (bounds.maxX - bounds.minX), y: bounds.minY + point.y / 100 * (bounds.maxY - bounds.minY) };
}

export function mapCoordinatePointToCanvas(point: MapCoordinatePoint, bounds: MapCoordinateBounds): MapCoordinatePoint {
  return { x: (point.x - bounds.minX) / (bounds.maxX - bounds.minX) * 100, y: (point.y - bounds.minY) / (bounds.maxY - bounds.minY) * 100 };
}

export function projectChildCanvasPointToParentCanvas(input: { point: MapCoordinatePoint; childBounds: MapCoordinateBounds; parentBounds: MapCoordinateBounds; transform: MapSimilarityTransform }): MapCoordinatePoint {
  const childCoordinate = mapCanvasPointToCoordinate(input.point, input.childBounds);
  return mapCoordinatePointToCanvas(applyMapSimilarityTransform(childCoordinate, input.transform), input.parentBounds);
}

export function calibratedPlacementBounds(input: { childBounds: MapCoordinateBounds; parentBounds: MapCoordinateBounds; transform: MapSimilarityTransform }): MapCoordinatePoint[] {
  return [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }].map((point) => projectChildCanvasPointToParentCanvas({ ...input, point }));
}

export function transformsApproximatelyEqual(left: MapSimilarityTransform, right: MapSimilarityTransform, tolerance = 1e-7): boolean {
  return Math.abs(left.translateX - right.translateX) <= tolerance && Math.abs(left.translateY - right.translateY) <= tolerance && Math.abs(left.rotation - right.rotation) <= tolerance && Math.abs(left.scale - right.scale) <= tolerance;
}

function rotateAndScale(point: MapCoordinatePoint, radians: number, scale: number): MapCoordinatePoint {
  const cosine = Math.cos(radians); const sine = Math.sin(radians);
  return { x: scale * (cosine * point.x - sine * point.y), y: scale * (sine * point.x + cosine * point.y) };
}

function normalizeDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}
