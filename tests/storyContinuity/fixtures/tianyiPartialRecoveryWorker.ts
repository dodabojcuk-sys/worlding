import { appendFile } from "node:fs/promises";

import { createTianyiGroundedAnswerOperations } from "../../../src/storyContinuity/tianyiGroundedAnswerOperation.ts";
import { compileTianyiGroundedContext, type TianyiGroundedContextRequest } from "../../../src/storyContinuity/tianyiGroundedContextGate.ts";

const [
  mode,
  rootPath,
  projectId,
  sessionId,
  milestone,
  providerLogPath,
  explicitRetrySource,
  processLogPath
] = process.argv.slice(2);
if (!mode || !rootPath || !projectId || !sessionId || !milestone || !providerLogPath || !processLogPath) {
  throw new Error("Partial-recovery worker arguments are incomplete.");
}
await appendFile(processLogPath, `${JSON.stringify({ mode, milestone, pid: process.pid })}\n`, "utf8");

const answer = JSON.stringify({
  summary: "现有证据不足。",
  claims: [{
    statement: "无法确认。",
    status: "unknown",
    sourceRefs: [],
    uncertaintyReason: "没有已授权来源。"
  }],
  status: "unknown",
  sourceRefs: [],
  uncertaintyReason: "没有已授权来源。",
  includedSources: [],
  excludedSources: []
});

const request: TianyiGroundedContextRequest = {
  version: "story-tianyi-grounded-context-request/v1",
  projectId,
  sessionId,
  taskKind: "grounded-answer",
  accessMode: "author",
  subjectRef: null,
  sceneRef: null,
  explicitRefs: []
};

let killed = false;
const operation = createTianyiGroundedAnswerOperations({
  rootPath,
  agentId: "agent.tianyi",
  now: () => "2026-07-31T00:00:00.000Z",
  compileGroundedContext: async (value) => compileTianyiGroundedContext({ request: value, candidates: [] }),
  gateway: {
    metadata() {
      return { profiles: [{ id: "loopback", providerId: "loopback", modelId: "loopback/model" }] };
    },
    async openChatStream() {
      await appendFile(providerLogPath, `${mode}\n`, "utf8");
      return {
        events: (async function* () {
          yield { type: "chunk" as const, text: answer };
          yield { type: "done" as const, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
        })()
      };
    }
  },
  onFaultMilestone(current) {
    if (mode === "start" && !killed && current === milestone) {
      killed = true;
      process.kill(process.pid, "SIGKILL");
    }
  }
});

const result = await operation.runTianyiGroundedAnswer({
  operationId: mode === "start" ? "operation.child.start" : "operation.child.recover",
  submissionId: "submission.child.crash",
  explicitRetry: explicitRetrySource === "true",
  profileId: "loopback",
  question: "子进程崩溃恢复",
  contextRequest: request
});
process.stdout.write(`${JSON.stringify(result)}\n`);
