import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("configured Tianyi Creative collaboration uses the selected Provider profile after source capture", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-creative-provider-r2-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "creative-provider-fixture";
  const providerJson = JSON.stringify({
    reply: "我先保留这段原话，再把人物、地点与规则拆成待审候选。",
    summary: "一名守夜人在潮湿井边藏起钥匙，规则仍待确认。",
    themes: ["秘密", "守望"],
    openQuestions: ["钥匙会打开什么？"],
    candidates: [
      { kind: "character", title: "守夜人", summary: "可能掌握钥匙。", uncertainties: ["动机未确认"] },
      { kind: "location", title: "潮湿井边", summary: "可能是关键地点。", uncertainties: ["空间关系未确认"] }
    ]
  });
  let providerCalls = 0;
  const gateway = {
    metadata() {
      return { providers: [{ id: "siliconflow", configured: true }], profiles: [{ id: "siliconflow-selected", providerId: "siliconflow", modelId: "fixture/model" }] };
    },
    async openChatStream() {
      providerCalls += 1;
      return { events: (async function* () { yield { type: "chunk" as const, text: providerJson }; yield { type: "done" as const, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } }; })() };
    }
  };
  try {
    createStoryStudioWorkspaceOperations({ rootPath, stateFilePath }).createProject({ title: "Provider 创意夹具", folderSlug: projectId });
    const operations = createStoryStudioTianyiOperations({ rootPath, stateFilePath, modelGateway: gateway, now: () => "2026-08-22T02:00:00.000Z" });
    const opened = await operations.openTianyiSession({ projectId, operationId: "provider-loop-open" });
    const sourceText = "守夜人把一枚钥匙藏在潮湿的井边，村里规定任何人都不能在月落前靠近。";
    const captured = await operations.captureTianyiCreativeAuthorSource({ projectId, sessionId: opened.sessionId, operationId: "provider-loop-capture", submissionId: "provider-loop-submission", text: sourceText, collaborate: true });
    const before = await operations.readTianyiCreativeProjection({ projectId, sessionId: opened.sessionId });
    assert.equal(before?.originals[0]?.text, sourceText);
    const extracted = await operations.extractTianyiCreativeProjection({ projectId, sessionId: opened.sessionId, operationId: "provider-loop-extract", source: captured.source });
    assert.equal(providerCalls, 1);
    assert.equal(extracted.projection.responses[0]?.runtime, "provider");
    assert.equal(extracted.projection.candidates.every((candidate) => candidate.state === "pending"), true);
    assert.equal(extracted.projection.candidates.every((candidate) => candidate.ownerReceipt === null), true);
    assert.equal(extracted.projection.originals[0]?.text, sourceText);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
