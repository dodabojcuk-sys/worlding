import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoldenLoopContextPack,
  projectValidatedRunPackCandidates,
  recoverGoldenLoopResultFromRunPack,
  runGoldenLoopOperation,
  validateNuwaSimulation,
  validateTianyiAlignment
} from "../../apps/story-studio/server/providerGateway/goldenLoopOperation.mjs";
import { resolveGoldenLoopDocumentSource } from "../../apps/story-studio/server/providerGateway/goldenLoopSourceBinding.mjs";
import { createNuwaPlan } from "../../src/storyIntelligence/index.ts";

const snapshot = {
  version: "world-os-story-snapshot-v1" as const,
  project: { id: "project", relativePath: "project.md", type: "project" as const, title: "测试世界", status: "active", links: [], evidenceExcerpt: "测试世界。" },
  currentChapter: null,
  currentScene: { id: "scene", relativePath: "writing/scene.md", type: "scene" as const, title: "当前场景", status: "draft", links: [], evidenceExcerpt: "水源被投毒。" },
  notes: [
    { id: "project", relativePath: "project.md", type: "project" as const, title: "测试世界", status: "active", links: [], evidenceExcerpt: "测试世界。" },
    { id: "scene", relativePath: "writing/scene.md", type: "scene" as const, title: "当前场景", status: "draft", links: [], evidenceExcerpt: "水源被投毒。" }
  ],
  selectedNoteRefs: ["writing/scene.md"],
  openThreads: [],
  lockedRules: [],
  recentAcceptedChanges: [],
  snapshotHash: "a".repeat(64),
  deterministic: true as const
};
const plan = createNuwaPlan({ snapshot, authorGoal: "核对证据并推演。", allowedRoles: ["evidence-critic"], budget: { maxRoles: 1 }, runner: "external" });
const writingSource = {
  id: "scene",
  revisionToken: "b".repeat(64),
  body: "服务器解析的正文：水源被投毒。"
};
const documentSource = resolveGoldenLoopDocumentSource({
  document: writingSource,
  requested: {
    documentId: writingSource.id,
    documentRevision: writingSource.revisionToken,
    selection: { coordinate: "utf16-code-unit", start: 0, end: writingSource.body.length }
  }
});
const ownerInput = {
  modelId: "Qwen/Qwen3.5-35B-A3B",
  contextReceiptId: "receipt.000001",
  contextReceipt: {
    id: "receipt.000001",
    sources: [{ ownerId: "scene" }],
    sourceBinding: documentSource.binding,
    excludedSources: [{ id: "object:unrelated", reason: "not-selected-for-this-task" }]
  },
  nuwaOwner: { plan, snapshot }
};

const tianyi = {
  version: "tianyan-tianyi-alignment/v1",
  facts: [{ statement: "苏槿发现水源被投毒。", evidence: "snapshot-evidence-scene" }],
  inferences: ["公开真相可能加速撤离。"],
  unknowns: ["商会是否知晓投毒者身份。"],
  suggestions: ["让女娲比较公开时机。"],
  simulationTask: { goal: "推演公开真相后的分支。", mustPreserve: ["不替角色决定。"], questions: ["顾沉如何反应？"] }
};

const nuwa = {
  version: "tianyan-nuwa-simulation/v1",
  knownFacts: ["水源被投毒。"],
  assumptions: ["苏槿有可展示的证据。"],
  causalSteps: ["苏槿公开证据。", "顾沉调整撤离顺序。"],
  actorResponses: [{ actor: "顾沉", response: "先保护取水点并要求复核证据。" }],
  conflicts: ["公开速度与秩序维护冲突。"],
  unknowns: ["镇民是否信任守备队。"],
  candidates: [
    { id: "route-1", title: "公开证据", change: "苏槿公开投毒证据。", after: "镇民要求立即封锁水源。", causes: ["证据可见。"], evidence: ["snapshot-evidence-scene"], affectedObjects: ["苏槿", "顾沉"], uncertainty: "证据完整性未知。", impact: "撤离与取水秩序改变。", risk: "可能引发恐慌。" },
    { id: "route-2", title: "先告知顾沉", change: "苏槿先向顾沉出示证据。", after: "守备队秘密控制水源。", causes: ["顾沉可调动守备。"], evidence: ["snapshot-evidence-scene"], affectedObjects: ["苏槿", "顾沉", "商会"], uncertainty: "商会是否察觉。", impact: "公开时间推迟。", risk: "商会可能销毁材料。" }
  ]
};

test("golden loop validates Tianyi and Nuwa boundaries and emits candidate-only output", async () => {
  const outputs = [JSON.stringify(tianyi), JSON.stringify(nuwa)];
  const gateway = {
    async openChatStream() {
      const output = outputs.shift();
      return { events: (async function* () {
        yield { type: "chunk", text: output, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } };
        yield { type: "done" };
      })() };
    }
  };
  const result = await runGoldenLoopOperation({ gateway, profileId: "profile", ...ownerInput, context: {}, documentSource, authorIntent: "意图" });
  assert.equal(result.status, "candidate");
  assert.equal(result.contextPack.sources[0].id, "snapshot-evidence-scene");
  assert.equal(result.contextPack.sources[0].content, writingSource.body);
  assert.match(result.contextPack.id, /^context-pack-[a-f0-9]{16}$/);
  assert.equal(result.nuwa.candidates.length, 2);
  assert.equal(result.provider.calls.length, 2);
  assert.equal(result.outcome.executions[0].status, "result-produced");
  assert.equal(result.contextReceiptId, "receipt.000001");
  assert.equal(result.nuwaRunId, plan.runId);
  assert.deepEqual(result.provider.calls.map((call) => call.traceId), [null, null]);
  assert.equal(JSON.stringify(result).includes("Canon"), false);
});

test("golden loop gives both stages one bounded source pack and accepts a fenced provider object", async () => {
  const outputs = [`\`\`\`json\n${JSON.stringify(tianyi)}\n\`\`\``, JSON.stringify(nuwa)];
  const inputs = [];
  const gateway = {
    async openChatStream(input) {
      inputs.push(JSON.parse(input.messages[1].content));
      const output = outputs.shift();
      return { events: (async function* () { yield { type: "chunk", text: output }; yield { type: "done" }; })() };
    }
  };
  const result = await runGoldenLoopOperation({ gateway, profileId: "profile", ...ownerInput, context: {}, documentSource, authorIntent: "意图" });
  assert.equal(inputs[0].contextPack.id, inputs[1].contextPack.id);
  assert.equal(result.contextPack.sources.length, 1);
  assert.equal(result.contextPack.contextReceiptId, "receipt.000001");
  assert.deepEqual(result.contextPack.excluded, [{ id: "object:unrelated", reason: "not-selected-for-this-task" }]);
});

test("Golden Loop context pack ignores a forged client background and only accepts the server-derived selection", () => {
  const contextPack = buildGoldenLoopContextPack({
    context: { project: { id: "project", title: "测试世界" } },
    documentSource,
    authorIntent: "意图",
    contextReceipt: ownerInput.contextReceipt,
    snapshot,
    plan,
    background: "FORGED_CLIENT_BACKGROUND_MUST_NOT_REACH_PROVIDER"
  });
  assert.equal(contextPack.sources.find((source) => source.id === "snapshot-evidence-scene")?.content, writingSource.body);
  assert.equal(JSON.stringify(contextPack).includes("FORGED_CLIENT_BACKGROUND_MUST_NOT_REACH_PROVIDER"), false);
});

test("structured validators reject unknown fields and fewer than two candidate futures", () => {
  assert.throws(() => validateTianyiAlignment({ ...tianyi, directCanonWrite: true }), /fields/);
  assert.throws(() => validateNuwaSimulation({ ...nuwa, candidates: [nuwa.candidates[0]] }), /2\.\.4/);
});

test("Candidate Review projection keeps distinct validated RunPack branches", () => {
  const branch = (id: string, title: string, relativePath: string) => ({
    id,
    title,
    summary: `${title} change`,
    immediateConsequence: `${title} immediate`,
    mediumTermConsequence: `${title} medium`,
    longTermPressure: `${title} pressure`,
    risks: [{ summary: `${title} risk` }],
    affectedNoteRefs: [relativePath],
    assumptions: [`${title} assumption`],
    evidenceIds: ["snapshot-evidence-scene"]
  });
  const branches = [
    branch("validated-branch-1", "第一路线", "writing/scene.md"),
    branch("validated-branch-2", "第二路线", "writing/scene.md")
  ];
  const runPack = {
    run: { runId: plan.runId, plan },
    snapshot,
    results: [{ proposedBranches: branches }],
    bundle: {
      sharedEvidence: [{ evidenceId: "snapshot-evidence-scene", excerpt: "水源被投毒。" }],
      unsupportedAssumptions: ["商会是否知情。"],
      branches
    }
  };
  const projected = projectValidatedRunPackCandidates({
    rawCandidates: nuwa.candidates,
    runPack
  });
  assert.deepEqual(projected.map((candidate) => candidate.id), ["validated-branch-1", "validated-branch-2"]);
  assert.deepEqual(projected.map((candidate) => candidate.affectedObjects), [["scene"], ["scene"]]);
  const recovered = recoverGoldenLoopResultFromRunPack({
    profileId: "profile",
    contextReceipt: ownerInput.contextReceipt,
    runPack,
    context: { project: { id: "project", title: "测试世界" }, focus: { objectId: "scene" } },
    documentSource,
    authorIntent: "意图"
  });
  assert.equal(recovered.nuwa.candidates.length, 2);
  assert.equal(recovered.provider.calls.length, 2);
  assert.equal(recovered.contextReceiptId, "receipt.000001");
});
