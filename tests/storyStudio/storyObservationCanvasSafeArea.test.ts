import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveCanvasSafeRect,
  minimumCanvasViewportShift,
  translateRect
} from "../../apps/story-studio/src/components/story-observation/effectiveCanvasSafeRect.ts";

test("effective canvas safe area keeps a selected timeline event out of the minimap and floating controls", () => {
  const safeArea = effectiveCanvasSafeRect({
    canvasRect: { left: 0, top: 0, right: 900, bottom: 620 },
    overlayRects: [
      { left: 690, top: 430, right: 900, bottom: 620 },
      { left: 320, top: 550, right: 590, bottom: 620 }
    ]
  });
  const shift = minimumCanvasViewportShift({
    selectedRect: { left: 710, top: 450, right: 870, bottom: 570 },
    safeArea
  });
  const selected = translateRect({ left: 710, top: 450, right: 870, bottom: 570 }, shift);

  assert.notDeepEqual(shift, { x: 0, y: 0 }, "an actual minimap collision receives a minimal pan");
  assert.ok(selected.left >= safeArea.bounds.left && selected.right <= safeArea.bounds.right);
  assert.ok(safeArea.exclusions.every((exclusion) => selected.right <= exclusion.left || selected.left >= exclusion.right || selected.bottom <= exclusion.top || selected.top >= exclusion.bottom));
});

test("effective canvas safe area uses only a minimal pan and never encodes a zoom change", () => {
  const safeArea = effectiveCanvasSafeRect({
    canvasRect: { left: 100, top: 80, right: 760, bottom: 620 },
    overlayRects: [{ left: 620, top: 80, right: 760, bottom: 620 }]
  });
  const shift = minimumCanvasViewportShift({
    selectedRect: { left: 590, top: 240, right: 710, bottom: 360 },
    safeArea
  });

  assert.deepEqual(shift, { x: -102, y: 0 });
  assert.equal("zoom" in shift, false);
});

test("already safe selections preserve the current world anchor exactly", () => {
  const safeArea = effectiveCanvasSafeRect({
    canvasRect: { left: 0, top: 0, right: 900, bottom: 620 },
    overlayRects: [{ left: 690, top: 430, right: 900, bottom: 620 }]
  });
  assert.deepEqual(minimumCanvasViewportShift({
    selectedRect: { left: 180, top: 180, right: 330, bottom: 300 },
    safeArea
  }), { x: 0, y: 0 });
});
