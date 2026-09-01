import assert from "node:assert/strict";
import test from "node:test";

import { createProjectDirectoryViewModel, flattenDirectoryReferences } from "../../apps/story-studio/src/product-shell/project-directory/projectDirectoryViewModel.ts";
import { zhCN } from "../../apps/story-studio/src/product-shell/i18n/translations.ts";
import type { StoryUnit, WorldLibraryBootstrap } from "../../apps/story-studio/src/lib/localTransport.ts";

const revision = "a".repeat(64);
const projectId = "directory-r4";
const event = (id: string, title: string, tags: string[]) => ({ id, relativeId: `world/events/${id}.md`, title, type: "event" as const, status: "committed", tags, aliases: [], revisionToken: revision, source: "markdown" as const });

function fixture() {
  const events = [
    event("event.signal", "暗号传递", ["作者确认", "单元：雾港"]),
    event("event.standoff", "仓库对峙", ["作者确认", "单元：雾港", "集点：仓库冲突"]),
    event("event.lockdown", "旧仓库封锁", ["作者确认", "单元：雾港", "集点：仓库冲突"]),
    event("event.departure", "雾港启航", ["作者确认", "单元：雾港"])
  ];
  const library = { project: { id: projectId, title: "长夜将明" }, objects: events, visualDocuments: [], folders: [], placements: [], folderRevision: revision, counts: { character: 0, location: 0, event: 4, item: 0, faction: 0, rule: 0, thread: 0 }, tabs: [], activeObject: null, selection: {}, source: "markdown" } as unknown as WorldLibraryBootstrap;
  const unit = { id: "unit.fog", relativeId: "story-units/fog.md", title: "雾港", summary: "", lifecycle: "active", sourceRefs: [], items: [], linkedEntityIds: events.map((item) => item.id), unresolvedQuestionIds: [], generationConstraints: {}, version: revision, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), source: "markdown" } satisfies StoryUnit;
  return createProjectDirectoryViewModel((key) => zhCN[key], { library, units: [unit], sources: [], workVersionId: "work-r4", pendingCount: 0, verifiedEventIds: events.map((event) => event.id) });
}

test("DIRECTORY_R4_ROOT exposes only high-level categories and counts", () => {
  const projection = fixture();
  const story = projection.groups.find((group) => group.id === "directory.story");
  assert.ok(story);
  assert.deepEqual(story.children?.map((child) => child.id), ["directory.story.units", "directory.story.lines"]);
  assert.equal(story.children?.some((child) => child.children?.some((node) => node.reference?.objectType === "event")), false);
  assert.equal(story.count, 1);
});

test("DIRECTORY_R4 excludes planning projections and unaccepted candidates from Event identity", () => {
  const canonical = event("event.signal", "暗号传递", ["作者确认", "单元：雾港"]);
  const planning = event("event.signal-plan", "暗号传递 · 规划依据 · 立即揭示", ["单元：雾港"]);
  const candidate = { ...event("event.candidate", "候选火花", ["单元：雾港"]), status: "draft" as const };
  const authorDraft = { ...event("event.draft", "作者草稿", ["作者草稿", "单元：雾港"]), status: "draft" as const };
  const objects = [canonical, planning, candidate, authorDraft];
  const library = { project: { id: projectId, title: "长夜将明" }, objects, visualDocuments: [], folders: [], placements: [], folderRevision: revision, counts: { character: 0, location: 0, event: 4, item: 0, faction: 0, rule: 0, thread: 0 }, tabs: [], activeObject: null, selection: {}, source: "markdown" } as unknown as WorldLibraryBootstrap;
  const projection = createProjectDirectoryViewModel((key) => zhCN[key], { library, units: [], sources: [], workVersionId: "work-r4", pendingCount: 0, verifiedEventIds: [canonical.id] });
  const references = flattenDirectoryReferences(projection.groups).filter((item) => item.node.reference?.objectType === "event");
  assert.deepEqual(references.map((item) => item.node.reference?.objectId).sort(), ["event.draft", "event.signal"]);
});

test("DIRECTORY_R4_UNIT keeps direct nodes and an optional collection point without duplicating Event identity", () => {
  const projection = fixture();
  const unit = projection.groups[0]?.children?.[0]?.children?.[0];
  assert.equal(unit?.label, "单元 01 · 雾港");
  assert.deepEqual(unit?.children?.map((child) => [child.label, child.count]), [["直接属于单元", 2], ["可选集点 · 仓库冲突", 2]]);
  const results = flattenDirectoryReferences(projection.groups).filter((item) => item.node.reference?.objectType === "event");
  assert.equal(results.length, 4);
  assert.equal(new Set(results.map((item) => item.node.reference?.objectId)).size, 4);
  assert.ok(results.every((item) => item.path.map((part) => part.label).join(" / ").includes("单元 01 · 雾港")));
  assert.equal(results.filter((item) => item.node.label === "仓库对峙")[0]?.path.at(-2)?.label, "可选集点 · 仓库冲突");
});
