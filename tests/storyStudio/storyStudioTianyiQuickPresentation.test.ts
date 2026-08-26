import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TIANYI_PINNED_WIDTH_DEFAULT,
  clampTianyiPinnedWidth,
  preserveTianyiScrollAnchor,
  resolveTianyiResponsivePanelMode,
  resizeTianyiPinnedWidth,
  shouldShowTianyiSuggestions,
  summarizeTianyiContext
} from "../../apps/story-studio/src/components/tianyiShellPresentation.ts";

test("Pinned Tianyi remains in the shell-owned right dock at every desktop width", () => {
  const resolve = (shellWidth: number, productMode = "nuwa") => resolveTianyiResponsivePanelMode({
    placement: "pinned",
    productMode,
    shellWidth,
    navigationWidth: 320,
    pinnedWidth: 380
  });

  assert.equal(resolve(1440), "right-dock");
  assert.equal(resolve(1375), "right-dock");
  assert.equal(resolve(1280), "right-dock");
  assert.equal(resolve(1600), "right-dock");
  assert.equal(resolve(1440, "event-line"), "right-dock");
  assert.equal(resolve(1100, "event-line"), "right-dock");
  assert.equal(resolveTianyiResponsivePanelMode({
    placement: "pinned",
    productMode: "event-line",
    shellWidth: 1180,
    navigationWidth: 58,
    pinnedWidth: 320,
    pageDockWidth: 320
  }), "right-dock");
  assert.equal(resolveTianyiResponsivePanelMode({ placement: "floating", productMode: "nuwa", shellWidth: 1100, navigationWidth: 320, pinnedWidth: 380 }), "floating");
  assert.equal(resolveTianyiResponsivePanelMode({ placement: "pinned", productMode: "writing", shellWidth: 1100, navigationWidth: 320, pinnedWidth: 380 }), "right-dock");
});

test("Quick Tianyi placement constrains its author-controlled width", () => {
  assert.equal(clampTianyiPinnedWidth(359), 360);
  assert.equal(clampTianyiPinnedWidth(407.6), 408);
  assert.equal(clampTianyiPinnedWidth(461), 460);
  assert.equal(clampTianyiPinnedWidth(Number.NaN), TIANYI_PINNED_WIDTH_DEFAULT);
  assert.equal(resizeTianyiPinnedWidth(400, 600, 560), 440);
  assert.equal(resizeTianyiPinnedWidth(400, 600, 650), 360);
});

test("Quick Tianyi keeps the floating scroll anchor while a taller pinned rail clamps to zero", () => {
  assert.equal(preserveTianyiScrollAnchor({
    currentScrollTop: 327,
    scrollHeight: 900,
    clientHeight: 500,
    previousAnchor: 0
  }), 327);
  assert.equal(preserveTianyiScrollAnchor({
    currentScrollTop: 0,
    scrollHeight: 700,
    clientHeight: 840,
    previousAnchor: 327
  }), 327);
  assert.equal(preserveTianyiScrollAnchor({
    currentScrollTop: 136,
    scrollHeight: 876,
    clientHeight: 740,
    previousAnchor: 538
  }), 538);
});

test("Quick Tianyi presentation stays compact and derives only safe context labels", () => {
  assert.deepEqual(summarizeTianyiContext({
    mode: "writing",
    contextKind: "scene",
    contextLabel: "塔门前的雨",
    sourceLabels: ["写作", "当前场景"],
    canOpenSource: true
  }), { label: "塔门前的雨", sources: "写作 · 当前场景" });
  assert.equal(shouldShowTianyiSuggestions(""), true);
  assert.equal(shouldShowTianyiSuggestions("  "), true);
  assert.equal(shouldShowTianyiSuggestions("这个人物为什么犹豫？"), false);
});

test("Quick Tianyi keeps one surface and uses a modal only for the narrow Creation fixture", () => {
  const source = readFileSync("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");

  assert.match(source, /placement: TianyiQuickPlacement/);
  assert.match(source, /data-tianyi-placement=\{props\.placement\}/);
  assert.match(source, /aria-modal=\{isWorkVersionCreationFixture && window\.matchMedia\("\(max-width: 1120px\)"\)\.matches\}/);
  assert.match(source, /固定快速天意/);
  assert.match(source, /aria-label="进入完整天意"/);
  assert.match(source, /className="tianyi-quick-resize-handle"/);
  assert.match(source, /getTianyiContextualCapability\(props\.workspace\)/);
  assert.doesNotMatch(source, /openTianyiSession|runTianyiQuestion|streamTianyiGroundedAnswer|createTianyiGroundedContextRequest|localStorage|sessionStorage/);
  assert.match(source, /runGroundedQuestion\(input/);
  assert.equal((source.match(/data-tianyi-session-owner=/g) || []).length, 1);
  assert.equal((source.match(/data-tianyi-memory-owner=/g) || []).length, 1);
  assert.equal((source.match(/data-tianyi-archive-owner=/g) || []).length, 1);
  assert.equal((source.match(/data-tianyi-receipt-owner=/g) || []).length, 1);
  assert.doesNotMatch(source, /nextMode === "bottom-drawer"/);
});
