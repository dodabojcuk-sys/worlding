import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { eventDraftPayload } from "../../apps/story-studio/src/components/event-observation/eventDraftPayload.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("the Event editor projection persists stable participant subjects beside legacy display labels", () => {
  const payload = eventDraftPayload({
    title: "双人进入灯塔",
    summary: "两名同名人物需要稳定身份。",
    storyUnit: "灯塔夜",
    focus: "入口",
    storyTime: "夜间",
    location: "灯塔",
    participants: ["临时访客"],
    participantSubjects: [{ id: "character.guard", label: "林昭" }, { id: "character.cartographer", label: "林昭" }],
    tags: [],
    note: ""
  });
  assert.deepEqual(payload.knowledgeSubjects, ["character.guard", "character.cartographer"]);
  assert.equal(payload.tags.filter((tag) => tag === "人物：林昭").length, 1, "display labels remain presentation metadata only");
  assert.equal(payload.tags.includes("知情：character.guard=已亲历"), true);
  assert.equal(payload.tags.includes("知情：character.cartographer=已亲历"), true);

  const root = mkdtempSync(path.join(tmpdir(), "event-knowledge-subject-write-"));
  try {
    const operations = createStoryStudioWorkspaceOperations({ rootPath: path.join(root, "projects"), stateFilePath: path.join(root, "state.json") });
    const project = operations.createProject({ title: "稳定人物身份", folderSlug: "stable-participants" });
    const event = operations.createGenericWorldObject({ projectId: project.id, type: "event", title: "双人进入灯塔", status: "draft", tags: payload.tags, body: payload.body, knowledgeSubjects: payload.knowledgeSubjects });
    assert.deepEqual(event.knowledgeSubjects, payload.knowledgeSubjects);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
