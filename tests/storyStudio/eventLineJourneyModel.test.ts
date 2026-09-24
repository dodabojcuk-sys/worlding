import test from "node:test";
import assert from "node:assert/strict";
import { eventLineJourneyLines, eventLineJourneyUrl, readEventLineJourneyLocation } from "../../apps/story-studio/src/components/event-observation/eventLineJourneyModel.ts";
import type { StoryUnit } from "../../apps/story-studio/src/lib/localTransport.ts";

test("three storylines keep same-name units and empty units scoped by stable identity", () => {
  const units = [
    ["main.1", "雨棚", ["event.shared", "event.a"]], ["main.2", "长名称单元：河岸上的一次复杂而未结束的等待", ["event.b"]],
    ["branch.1", "雨棚", ["event.shared", "event.c"]], ["branch.2", "后来", ["event.d"]],
    ["hidden.1", "雨棚", []], ["hidden.2", "另一处", ["event.e"]]
  ].map(([id, title, linkedEntityIds]) => ({ id, title, linkedEntityIds, kind: id.toString().startsWith("main") ? "main" : "branch", lifecycle: "active", status: "active" })) as StoryUnit[];
  const storylines = [
    { key: "primary", title: "主线", units: [{ id: "main.1", title: "雨棚", revision: "1" }, { id: "main.2", title: "长名称单元：河岸上的一次复杂而未结束的等待", revision: "1" }] },
    { key: "branch", title: "支线", units: [{ id: "branch.1", title: "雨棚", revision: "1" }, { id: "branch.2", title: "后来", revision: "1" }] },
    { key: "hidden", title: "暗线", units: [{ id: "hidden.1", title: "雨棚", revision: "1" }, { id: "hidden.2", title: "另一处", revision: "1" }] }
  ];
  const lines = eventLineJourneyLines(storylines, units);
  assert.equal(lines.length, 3);
  assert.equal(lines[0]?.units[0]?.id, "main.1");
  assert.equal(lines[1]?.units[0]?.id, "branch.1");
  assert.equal(lines[2]?.units[0]?.linkedEntityIds.length, 0);
  assert.equal(lines.filter((line) => line.units.some((unit) => unit.linkedEntityIds.includes("event.shared"))).length, 2);
  assert.equal(lines[0]?.units[1]?.title, "长名称单元：河岸上的一次复杂而未结束的等待");
});

test("journey URLs preserve line, unit, and event identity independently", () => {
  const url = eventLineJourneyUrl({ lineKey: "branch", unitId: "branch.1", eventId: "event.shared" });
  assert.deepEqual(readEventLineJourneyLocation(new URL(url, "http://localhost").search), { lineKey: "branch", unitId: "branch.1", eventId: "event.shared" });
  assert.equal(eventLineJourneyUrl({ lineKey: null, unitId: null, eventId: null }), "/event-line");
});
