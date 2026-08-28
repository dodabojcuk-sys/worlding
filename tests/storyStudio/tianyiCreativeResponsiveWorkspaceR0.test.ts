import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Creative workspace keeps canvas-first desktop, drawer-based mid-width, and mobile sheet boundaries", async () => {
  const component = await readFile("apps/story-studio/src/components/tianyi/TianyiCreativeWorkspace.tsx", "utf8");
  const styles = await readFile("apps/story-studio/src/styles/tianyi.css", "utf8");
  assert.match(component, /data-testid="tianyi-creative-workspace"/u);
  assert.match(component, /待审候选 \{projection\?\.pendingCount/u);
  assert.match(component, /tianyi-mobile-review-close/u);
  assert.match(component, /ReviewContextSummary/u);
  assert.match(component, /审查这个候选/u);
  assert.match(component, /确认并写入事件线/u);
  assert.match(component, /先保存原话；Provider 可用时/u);
  assert.match(component, /每个结果都先作为候选/u);
  assert.match(styles, /\.tianyi-creative-canvas \{ display: grid/u);
  assert.match(styles, /@media \(max-width: 1180px\)/u);
  assert.match(styles, /\.tianyi-conversation-rail\.is-open \{ display: block/u);
  assert.match(styles, /@media \(max-width: 820px\)/u);
  assert.match(styles, /\.tianyi-creative-review\.is-open \{ display: grid/u);
  assert.match(styles, /\.tianyi-creative-canvas\.is-review-open \.tianyi-creative-composer \{ display: none/u);
  assert.match(styles, /position: fixed; left: 14px; right: 14px; bottom: calc\(var\(--r1-mobile-nav-height/u);
  assert.doesNotMatch(styles, /\.tianyi-creative-canvas[^\n]*width:\s*\d{4}px/u);
});
