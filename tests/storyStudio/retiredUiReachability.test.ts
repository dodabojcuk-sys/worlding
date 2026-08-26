import assert from "node:assert/strict";
import test from "node:test";

import {
  clearRetiredTianyiUiPreferences,
  normalizeRetiredUiLocation,
  RETIRED_TIANYI_UI_PREFERENCE_KEYS
} from "../../apps/story-studio/src/lib/retiredUiReachability.ts";

test("only retired Tianyi view state is normalized; Founder workspace views remain untouched", () => {
  assert.deepEqual(normalizeRetiredUiLocation({ pathname: "/tianyi", search: "?view=invalid&project=demo" }), {
    pathname: "/tianyi",
    search: "?project=demo",
    hash: "",
    changed: true,
    retiredSurface: "tianyi-view"
  });
  assert.deepEqual(normalizeRetiredUiLocation({ pathname: "/multiverse", search: "?view=spine" }), {
    pathname: "/multiverse",
    search: "?view=spine",
    hash: "",
    changed: false,
    retiredSurface: null
  });
  assert.deepEqual(normalizeRetiredUiLocation({ pathname: "/library", search: "?view=source-review" }), {
    pathname: "/library",
    search: "?view=source-review",
    hash: "",
    changed: false,
    retiredSurface: null
  });
});

test("retired alias normalization preserves non-UI query and hash state", () => {
  assert.deepEqual(normalizeRetiredUiLocation({ pathname: "/tianyi-v2", search: "?project=demo&view=spine", hash: "#session" }), {
    pathname: "/tianyi",
    search: "?project=demo",
    hash: "#session",
    changed: true,
    retiredSurface: "tianyi-v2-alias"
  });
});

test("old Tianyi presentation preferences are removed by exact key only", () => {
  const values = new Map<string, string>([
    ...RETIRED_TIANYI_UI_PREFERENCE_KEYS.map((key) => [key, "retired"] as const),
    ["story-studio:ai-control-center:v1", "keep"],
    ["story-studio:multiverse:view", "spine"]
  ]);
  clearRetiredTianyiUiPreferences({ removeItem(key) { values.delete(key); } });
  assert.equal(RETIRED_TIANYI_UI_PREFERENCE_KEYS.every((key) => !values.has(key)), true);
  assert.equal(values.get("story-studio:ai-control-center:v1"), "keep");
  assert.equal(values.get("story-studio:multiverse:view"), "spine");
});
