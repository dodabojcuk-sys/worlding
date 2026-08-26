export type CanvasSafeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type EffectiveCanvasSafeArea = {
  bounds: CanvasSafeRect;
  exclusions: CanvasSafeRect[];
};

export type CanvasViewportShift = { x: number; y: number };

const DEFAULT_PADDING = 12;

/**
 * The React Flow viewport may be smaller than its product shell, and its own
 * controls sit above the canvas. Keep that distinction explicit so timeline
 * and canvas projections share one safe-area contract.
 */
export function effectiveCanvasSafeRect(input: {
  canvasRect: CanvasSafeRect;
  overlayRects: readonly CanvasSafeRect[];
  padding?: number;
}): EffectiveCanvasSafeArea {
  const padding = input.padding ?? DEFAULT_PADDING;
  const bounds = insetRect(input.canvasRect, padding);
  const exclusions: CanvasSafeRect[] = [];

  for (const overlay of input.overlayRects) {
    const clipped = intersection(bounds, overlay);
    if (!clipped) continue;
    const spansHeight = clipped.top <= bounds.top && clipped.bottom >= bounds.bottom;
    const spansWidth = clipped.left <= bounds.left && clipped.right >= bounds.right;
    if (spansHeight && clipped.left > bounds.left) {
      bounds.right = Math.min(bounds.right, clipped.left - padding);
      continue;
    }
    if (spansHeight && clipped.right < bounds.right) {
      bounds.left = Math.max(bounds.left, clipped.right + padding);
      continue;
    }
    if (spansWidth && clipped.top > bounds.top) {
      bounds.bottom = Math.min(bounds.bottom, clipped.top - padding);
      continue;
    }
    if (spansWidth && clipped.bottom < bounds.bottom) {
      bounds.top = Math.max(bounds.top, clipped.bottom + padding);
      continue;
    }
    exclusions.push(clipped);
  }

  return { bounds, exclusions };
}

/**
 * Returns the smallest screen-space translation that makes a selected object
 * fully readable. This never changes zoom and does not choose a new focal
 * point; it only moves the existing viewport when an actual obstruction wins.
 */
export function minimumCanvasViewportShift(input: {
  selectedRect: CanvasSafeRect;
  safeArea: EffectiveCanvasSafeArea;
  padding?: number;
}): CanvasViewportShift {
  const padding = input.padding ?? DEFAULT_PADDING;
  let shift = shiftIntoBounds(input.selectedRect, input.safeArea.bounds);

  for (let pass = 0; pass < input.safeArea.exclusions.length; pass += 1) {
    const shifted = translateRect(input.selectedRect, shift);
    const blocking = input.safeArea.exclusions.find((exclusion) => rectsOverlap(shifted, exclusion));
    if (!blocking) return shift;

    const candidates = [
      { x: blocking.left - shifted.right - padding, y: 0 },
      { x: blocking.right - shifted.left + padding, y: 0 },
      { x: 0, y: blocking.top - shifted.bottom - padding },
      { x: 0, y: blocking.bottom - shifted.top + padding }
    ].map((candidate) => ({
      x: shift.x + candidate.x,
      y: shift.y + candidate.y
    })).filter((candidate) => rectWithin(translateRect(input.selectedRect, candidate), input.safeArea.bounds));

    if (candidates.length === 0) return shift;
    shift = candidates.reduce((closest, candidate) => magnitude(candidate) < magnitude(closest) ? candidate : closest);
  }

  return shift;
}

export function translateRect(rect: CanvasSafeRect, shift: CanvasViewportShift): CanvasSafeRect {
  return { left: rect.left + shift.x, top: rect.top + shift.y, right: rect.right + shift.x, bottom: rect.bottom + shift.y };
}

function insetRect(rect: CanvasSafeRect, amount: number): CanvasSafeRect {
  return { left: rect.left + amount, top: rect.top + amount, right: rect.right - amount, bottom: rect.bottom - amount };
}

function intersection(a: CanvasSafeRect, b: CanvasSafeRect): CanvasSafeRect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return left < right && top < bottom ? { left, top, right, bottom } : null;
}

function rectsOverlap(a: CanvasSafeRect, b: CanvasSafeRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectWithin(rect: CanvasSafeRect, bounds: CanvasSafeRect): boolean {
  return rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
}

function shiftIntoBounds(rect: CanvasSafeRect, bounds: CanvasSafeRect): CanvasViewportShift {
  const x = rect.left < bounds.left ? bounds.left - rect.left : rect.right > bounds.right ? bounds.right - rect.right : 0;
  const y = rect.top < bounds.top ? bounds.top - rect.top : rect.bottom > bounds.bottom ? bounds.bottom - rect.bottom : 0;
  return { x, y };
}

function magnitude(shift: CanvasViewportShift): number {
  return Math.hypot(shift.x, shift.y);
}
