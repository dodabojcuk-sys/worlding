import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createStoryStudioWorkspaceOperations } from "../../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createCreationPluginLifecycle } from "../../../src/storyCreation/creationPluginLifecycle.mjs";
import { DEFAULT_CURATED_CREATION_PLUGIN_CATALOG } from "../../../src/storyCreation/curatedCreationPluginCatalog.mjs";
import { createInstalledCreationPluginAdapter } from "../../../src/storyCreation/creationPluginHost.mjs";
import { createCreationAdapterRegistry } from "../../../src/storyCreation/creationAdapterService.ts";
import { createStoryStudioAuthorControl } from "../../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioCanonReadProjection } from "../../../src/storyControlSurface/storyStudioCanonReadProjection.ts";
import { createStoryStudioIntelligenceBridgeOperations } from "../../../src/storyControlSurface/storyStudioIntelligenceBridgeOperations.ts";
import { createStoryStudioTianyiOperations } from "../../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioAgentDraftProposal, createStoryStudioAgentProposalOperations } from "../../../src/storyControlSurface/storyStudioAgentProposalOperations.ts";
import { createStoryStudioRelationOperations } from "../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { createActionPermissionBroker } from "../../../src/storyControlSurface/actionPermissionBroker.ts";
import {
  createAgentRecognitionProposal,
  editAgentRecognitionProposal,
  ignoreAgentRecognitionProposal,
  listAgentRecognitionProposals
} from "../../../src/storyIntelligence/agentRecognitionProposalRepository.ts";
import {
  attachAuthorControlReviewR0,
  createSourceImportHandoffR0,
  decideSourceCandidateR0
} from "../../../src/storyControlSurface/sourceImportReviewR0.ts";
import {
  applyNuwaSceneIntervention,
  buildNuwaSceneCandidate,
  compareNuwaSceneSimulations,
  createNuwaSceneCheckpoint,
  createNuwaSceneSimulationRun,
  advanceNuwaLongformJobR1,
  createNuwaLongformJobR1,
  createNuwaTemporaryAgentR1,
  endNuwaTemporaryAgentR1,
  forkNuwaSceneSimulationFromCheckpoint,
  pauseNuwaSceneSimulation,
  readNuwaSceneSimulationReadModel,
  readNuwaSceneSimulationRun,
  replayNuwaSceneSimulation,
  runNuwaSceneSimulation,
  stopNuwaSceneSimulation,
  stepNuwaSceneSimulation,
  stableHash,
  writeNuwaSceneSimulationRun,
  createNuwaRunPack,
  readNuwaRunPack,
  readNuwaDirectorStateR1,
  setNuwaDirectorPermissionR1,
  setNuwaLongformJobStatusR1,
  writeNuwaDirectorStateR1,
  writeNuwaProviderPilotReceipt
} from "../../../src/storyIntelligence/index.ts";
import {
  CONTINUITY_ID_PATTERN,
  CONTINUITY_MAX_ID_LENGTH,
  CONTEXT_RECEIPT_V3_VERSION,
  allocateReceiptId,
  createReceipt,
  normalizeContextReceipt,
  readReceipt,
  tianyiObjectContextRefKey
} from "../../../src/storyContinuity/index.ts";
import { fileManagerCommand, revealLocalPath } from "./localFileManager.mjs";
import { createAiProviderGateway } from "./providerGateway/aiProviderGateway.mjs";
import { createSiliconFlowAdapter } from "./providerGateway/siliconFlowAdapter.mjs";
import { createSessionCredentialController } from "./providerGateway/sessionCredentialController.mjs";
import { createProviderCredentialBackend, defaultProviderAppDataRoot } from "./providerGateway/providerCredentialBackend.mjs";
import { createPersistentProviderProfileStore } from "./providerGateway/persistentProviderProfileStore.mjs";
import { createReplaySafeProviderReceiptEnvelopeStore } from "./providerGateway/replaySafeProviderReceiptEnvelope.mjs";
import {
  createProviderRequestBudgetLedger,
  HISTORICAL_PROVIDER_INCIDENT_R0,
  zeroProviderBudgetBaseline
} from "./providerGateway/providerRequestBudgetLedger.mjs";
import {
  projectValidatedRunPackCandidates,
  recoverGoldenLoopResultFromRunPack,
  runGoldenLoopOperation
} from "./providerGateway/goldenLoopOperation.mjs";
import { LIVE_PROVIDER_BUDGET_USD, LIVE_PROVIDER_CALLS_MAX, LIVE_CANDIDATE_COUNT, LIVE_PROVIDER_PILOT_VERSION } from "./providerGateway/liveProviderPilot.mjs";
import { assertGoldenLoopReceiptSourceBinding, revalidateGoldenLoopDocumentSource } from "./providerGateway/goldenLoopSourceBinding.mjs";
import { resolveGoldenLoopSourceAuthority } from "./providerGateway/goldenLoopSourceAuthority.mjs";
import {
  parseStoryObservationProposalPatch,
  storyObservationPatchToCandidateResult
} from "../../../src/storyContracts/storyObservationProposalPatch.ts";
import { createDeterministicStoryStudioAgentDraft } from "../../../src/storyContracts/storyStudioAgentDraft.ts";
import { createTianyiAgentRuntimePort, validateTianyiAgentToolCall } from "../../../src/storyAgent/tianyiAgentRuntimePort.ts";
import { createPiTextAgentAdapter } from "../../../src/storyAgent/piAgentAdapter.ts";
import { createCharacterStateImpactFixtureAdapter } from "./characterStateImpactFixture.mjs";
import { createNuwaBoundedScenarioFixtureAdapter } from "./nuwaBoundedScenarioFixture.mjs";
import { createMultiverseSingleDerivedFixtureAdapter } from "./multiverseSingleDerivedFixture.mjs";
import { createCreationSourceSelectionPort } from "./creationSourceSelectionPort.mjs";
import { createWorkVersionBoundCreationFixtureAdapter } from "./workVersionBoundCreationFixture.mjs";
import { createNormalEventCreationPort } from "./normalEventCreationPort.mjs";
import { createTianyiCreativeEventPort } from "./tianyiCreativeEventPort.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(appRoot, "dist");
const rootPath = path.resolve(process.env.WORLD_OS_STORY_STUDIO_ROOT || path.join(os.homedir(), "WorldOS"));
const stateFilePath = path.resolve(
  process.env.WORLD_OS_STORY_STUDIO_STATE_FILE || path.join(rootPath, ".story-studio", "state.json")
);
const pluginCatalogPath = process.env.TIANYAN_CREATION_PLUGIN_CATALOG_PATH ? path.resolve(process.env.TIANYAN_CREATION_PLUGIN_CATALOG_PATH) : null;
const pluginCatalogOverrideAllowed = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || process.env.TIANYAN_CREATION_PLUGIN_TEST_MODE === "1" || process.env.TIANYAN_CREATION_PLUGIN_DEV_MODE === "1";
if (pluginCatalogPath && !pluginCatalogOverrideAllowed) throw new Error("TIANYAN_CREATION_PLUGIN_CATALOG_PATH is available only in explicit test or development mode.");
const pluginCatalog = pluginCatalogPath
  ? JSON.parse(readFileSync(pluginCatalogPath, "utf8")).map((entry) => ({ ...entry, packagePath: entry.packagePath ? path.resolve(path.dirname(pluginCatalogPath), entry.packagePath) : null }))
  : DEFAULT_CURATED_CREATION_PLUGIN_CATALOG;
const creationPluginLifecycle = createCreationPluginLifecycle({
  pluginRoot: process.env.TIANYAN_CREATION_PLUGIN_ROOT || path.join(os.homedir(), ".tianyan", "creation-plugins"),
  catalog: pluginCatalog
});
let creationPluginAdapterRegistry = createCreationAdapterRegistry({ externalAdapters: [] });
async function refreshCreationPluginAdapterRegistry() {
  creationPluginAdapterRegistry = createCreationAdapterRegistry({ externalAdapters: (await creationPluginLifecycle.runtimeEntries()).map(createInstalledCreationPluginAdapter) });
}
const controlToken = process.env.WORLD_OS_LOCAL_CONTROL_TOKEN || "";
const localSessionSecret = randomBytes(32).toString("base64url");
const LOCAL_SESSION_COOKIE = "story_studio_local_session";
const tianyiAgentId = process.env.WORLD_OS_TIANYI_AGENT_ID || "agent.tianyi";
const port = Number(process.env.PORT || 4192);
const MAX_JSON_BODY_BYTES = 12 * 1024 * 1024;
const MAX_CONTINUITY_JSON_BODY_BYTES = 64 * 1024;
const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
const actionPermissionBroker = createActionPermissionBroker({
  resolveProjectPath: (projectId) => operations.resolveProjectWorkspacePath({ projectId })
});
const agentProposalOperations = createStoryStudioAgentProposalOperations({ rootPath, workspaceOperations: operations });
const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
const characterStateImpactFixture = createCharacterStateImpactFixtureAdapter({ operations, authorControl });
const nuwaBoundedScenarioFixture = createNuwaBoundedScenarioFixtureAdapter({ operations, authorControl });
const multiverseSingleDerivedFixture = createMultiverseSingleDerivedFixtureAdapter({ operations, authorControl });
const relationOperations = createStoryStudioRelationOperations({
  workspaceOperations: operations,
  verifyCanonEventRead: ({ projectId, eventId }) => authorControl.verifyCanonEventRead({ projectId, eventId })
});
const canonReadProjection = createStoryStudioCanonReadProjection({ workspace: operations, authorControl });
const creationSourceSelectionPort = createCreationSourceSelectionPort({
  operations,
  relationOperations,
  canonReadProjection,
  ...(process.env.TIANYAN_CREATION_SOURCE_PORT_E2E_R0 === "1"
    ? { projectionSalt: ({ projectId, sourceGeneration }) => `disposable-e2e-source:${projectId}:generation-${sourceGeneration}` }
    : {})
});
const normalEventCreationPort = createNormalEventCreationPort({ operations, authorControl });
const tianyiCreativeEventPort = createTianyiCreativeEventPort({ operations, authorControl });
const workVersionBoundCreationFixture = createWorkVersionBoundCreationFixtureAdapter({ operations });
const providerAppDataRoot = resolveProviderAppDataRoot();
const providerProfileStore = createPersistentProviderProfileStore({ appDataRoot: providerAppDataRoot });
let providerProfileState = providerProfileStore.read();
const providerCredentialBackend = createProviderCredentialBackend({ appDataRoot: providerAppDataRoot });
const providerCredential = createSessionCredentialController({
  backend: {
    kind: providerCredentialBackend.kind,
    read() {
      const active = providerProfileState.profiles.find((profile) => profile.id === providerProfileState.activeProfileId);
      return active?.enabled === false ? "" : providerCredentialBackend.read();
    },
    write(value) { providerCredentialBackend.write(value); },
    clear() { providerCredentialBackend.clear(); }
  }
});
const providerBudgetLedger = createProviderRequestBudgetLedger({
  appDataRoot: providerAppDataRoot,
  initialSnapshot: shouldInstallHistoricalProviderIncident() ? HISTORICAL_PROVIDER_INCIDENT_R0 : zeroProviderBudgetBaseline()
});
const replaySafeProviderReceiptEnvelopeStore = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: providerAppDataRoot });
const providerGateway = createAiProviderGateway({
  adapters: [createSiliconFlowAdapter({ apiKeyProvider: () => providerCredential.readForProvider(), baseUrlProvider: () => validatedProviderBaseUrl() })],
  budgetLedger: providerBudgetLedger,
  receiptEnvelopeStore: replaySafeProviderReceiptEnvelopeStore
});
syncProviderGatewayProfile();
const tianyi = createStoryStudioTianyiOperations({
  rootPath,
  stateFilePath,
  agentId: tianyiAgentId,
  localControlToken: controlToken,
  modelGateway: providerGateway,
  verifyCanonEventRead: ({ projectId, eventId }) => authorControl.verifyCanonEventRead({ projectId, eventId })
});
const intelligenceBridge = createStoryStudioIntelligenceBridgeOperations({ rootPath, stateFilePath, agentId: tianyiAgentId, localControlToken: controlToken, tianyiOperations: tianyi });
const agentDraftFixtureAllowed = process.env.NODE_ENV !== "production" || process.env.TIANYAN_AGENT_DRAFT_FIXTURE_MODE === "1";
const agentFakeProviderStreamAllowed = process.env.NODE_ENV !== "production" && process.env.TIANYAN_AGENT_FAKE_PROVIDER_STREAM === "1";
const piTextAgent = createPiTextAgentAdapter();
const tianyiAgentRuntime = createTianyiAgentRuntimePort({
  persistence: {
    appendEvent: (event) => tianyi.appendTianyiAgentRuntimeEvent({
      projectId: event.projection.projectId,
      workVersionId: event.projection.workVersionId,
      sessionId: event.projection.sessionId,
      runId: event.runId,
      operationId: event.operationId,
      kind: event.kind,
      streamEvent: event.streamEvent,
      projection: event.projection,
      recordedAt: event.recordedAt
    }),
    readEvents: (input) => tianyi.readTianyiAgentRuntimeEvents(input)
  },
  async buildContextManifest(input) {
    const rootVersion = creationSourceSelectionPort.resolveRootWorkVersion(input.projectId);
    const activeWorkVersionId = rootVersion?.identity.workVersionId ?? "work-version.unversioned";
    if (input.workVersionId !== activeWorkVersionId) throw new Error("Agent 请求的工作版本已不是当前激活版本；请刷新后重试。");
    const request = input.contextRequest && typeof input.contextRequest === "object"
      ? input.contextRequest
      : { productMode: "world", activeOwner: { kind: "project", id: input.projectId }, selection: { documentId: null, objectId: null, timelinePointId: null }, sourceRefs: [], memorySelections: [], enabledSkillRefs: [] };
    const projection = await tianyi.getTianyiContextProjection({ projectId: input.projectId, contextRequest: request });
    const archive = await tianyi.readTianyiSessionEvents({ projectId: input.projectId, sessionId: input.sessionId, startSequence: 1, limit: 200 });
    const sourceRefs = projection.sources.map((source) => ({ id: source.id, label: source.label, hash: source.hash, state: source.state === "current" ? "current" : source.state === "stale" ? "stale" : "excluded" }));
    const authorSourceRefs = (archive?.events || []).filter((event) => event.actor === "author" && event.visibleContent).map((event) => event.eventId).slice(-24);
    const excludedRefs = projection.sources.filter((source) => source.exclusionReason).map((source) => ({ id: source.id, reason: source.exclusionReason || "excluded" }));
    return {
      version: "tianyi-agent-context-manifest/v1",
      projectId: input.projectId,
      workVersionId: input.workVersionId,
      sessionId: input.sessionId,
      currentPage: input.currentPage,
      selectedObjectIds: [projection.selection.objectId].filter(Boolean),
      sourceRefs,
      authorSourceRefs,
      excludedRefs,
      unresolvedQuestions: projection.unresolvedThreadIds.slice(0, 24),
      estimatedTokens: Math.min(32_000, sourceRefs.reduce((sum, source) => sum + Math.ceil((source.label.length + source.id.length) / 4), 0) + authorSourceRefs.length * 24),
      compaction: { state: sourceRefs.length > 12 ? "available" : "none", summaryVersion: 0, preservedAnchors: authorSourceRefs, receiptId: null }
    };
  },
  async runProvider(input) {
    const metadata = providerGateway.metadata();
    const profile = agentFakeProviderStreamAllowed
      ? { id: "local-fake-agent-stream", providerId: "local-fake", modelId: "deterministic-text-fixture" }
      : metadata.profiles.find((candidate) => candidate.providerId === "siliconflow") || metadata.profiles[0];
    if (!agentFakeProviderStreamAllowed && (!profile || !metadata.providers.some((provider) => provider.id === "siliconflow" && provider.configured))) {
      const error = new Error("当前没有可用的真实 Provider；原话与 Agent 任务仍已保留，可以稍后重试。");
      error.name = "ProviderUnavailable";
      error.code = "provider-unavailable";
      error.retryable = false;
      throw error;
    }
    const contextPayload = {
      projectId: input.projectId,
      workVersionId: input.workVersionId,
      currentPage: input.contextManifest.currentPage,
      sources: input.contextManifest.sourceRefs.map((source) => ({ id: source.id, label: source.label, state: source.state })),
      unresolvedQuestions: input.contextManifest.unresolvedQuestions,
      steering: input.steering
    };
    const result = await piTextAgent.run({
      runId: input.runId,
      projectId: input.projectId,
      workVersionId: input.workVersionId,
      sessionId: input.sessionId,
      prompt: `任务：${input.task}\n已由作者批准的当前引用范围：${JSON.stringify(contextPayload)}\n请给出一份不超过 600 字的作者可读建议。`,
      systemPrompt: "你是天意的受控 Agent。只返回作者可读的简短分析建议；只能使用已声明且已审批的只读工具；不得声称写入任何资料。",
      providerId: profile.providerId,
      profileId: profile.id,
      modelId: profile.modelId,
      maxOutputTokens: Math.min(512, input.maxOutputTokens),
      retry: input.retry,
      signal: input.signal,
      tools: [{
        name: "read_context_manifest",
        label: "查看当前引用范围",
        description: "只读查看本次天意任务已经授权的引用范围。",
        async execute() { return contextPayload; }
      }],
      async authorizeTool(call) {
        try {
          const definition = validateTianyiAgentToolCall({ toolName: call.toolName, arguments: call.arguments });
          return definition.name === "read_context_manifest"
            ? { allowed: true }
            : { allowed: false, reason: "本次 Agent 运行只开放作者已批准的只读引用工具。" };
        } catch (error) {
          return { allowed: false, reason: error instanceof Error ? error.message : "未声明的天意工具已被拒绝。" };
        }
      },
      async openProviderStream(providerInput) {
        if (agentFakeProviderStreamAllowed) {
          const chunks = ["正在核对当前引用范围。", "角色知识边界保持只读。", "已形成等待作者确认的建议。"];
          return {
            traceId: `trace.local-fake.${input.runId}`,
            events: (async function* () {
              for (const [index, text] of chunks.entries()) {
                if (providerInput.signal?.aborted) { const error = new Error("Local fake provider stream aborted."); error.name = "AbortError"; throw error; }
                await new Promise((resolve) => setTimeout(resolve, 90));
                yield { type: "chunk", text, finishReason: index === chunks.length - 1 ? "stop" : null, usage: index === chunks.length - 1 ? { promptTokens: 12, completionTokens: 18, totalTokens: 30 } : null };
              }
            })()
          };
        }
        return providerGateway.openChatStream({
          profileId: profile.id,
          messages: providerInput.messages,
          maxOutputTokens: Math.min(512, input.maxOutputTokens),
          signal: providerInput.signal,
          idempotencyKey: `tianyi-agent.${input.projectId}.${input.workVersionId}.${input.runId}.${providerInput.providerCall}`,
          budgetScope: `tianyi-agent:${input.projectId}:${input.workVersionId}`,
          toolLoopTurn: true,
          retry: providerInput.retry
        });
      },
      onEvent: input.onEvent
    });
    return { providerId: profile.providerId, profileId: profile.id, modelId: profile.modelId, ...result, text: result.text.slice(0, 6_000) };
  },
  cancelProvider(input) { return piTextAgent.cancel(input); },
  ...(agentDraftFixtureAllowed ? { async fixtureResponse(input) {
    const sourceRefs = input.contextManifest.authorSourceRefs.length ? input.contextManifest.authorSourceRefs : input.contextManifest.sourceRefs.slice(0, 2).map((source) => source.id);
    const steeringHint = input.steering.at(-1) ? `；已按作者纠正“${input.steering.at(-1).slice(0, 80)}”` : "";
    const eventScoped = input.contextManifest.currentPage === "/event-line";
    return {
      text: eventScoped
        ? `已读取当前事件选择、叙事时间和开放问题，围绕“${input.task.slice(0, 120)}”形成一份只读工作摘要${steeringHint}。相邻节点不会被当作因果；任何后续候选都必须经过作者确认。`
        : `已读取当前引用范围，围绕“${input.task.slice(0, 120)}”形成一份待审建议${steeringHint}。${input.contextManifest.unresolvedQuestions.length ? "仍有开放问题需要作者决定。" : "当前没有可自动确认的正式事实。"}`,
      candidates: [
        { candidateId: `candidate.tianyi-agent.character.${stableHash(`${input.task}:character`).slice(0, 16)}`, kind: "character", title: "待确认的角色线索", summary: "从当前来源提取的角色方向，仅作为现有 Agent/Object 审核候选。", sourceRefs, uncertainties: ["身份与动机仍需作者确认。"], targetOwnerKind: "agent-recognition-proposal", state: "pending", ownerReceipt: null },
        { candidateId: `candidate.tianyi-agent.location.${stableHash(`${input.task}:location`).slice(0, 16)}`, kind: "location", title: "待确认的地点线索", summary: "从当前来源提取的地点方向，不会直接创建地点资料。", sourceRefs, uncertainties: ["是否建立正式地点仍需作者确认。"], targetOwnerKind: "agent-recognition-proposal", state: "pending", ownerReceipt: null },
        { candidateId: `candidate.tianyi-agent.unknown.${stableHash(`${input.task}:unknown`).slice(0, 16)}`, kind: "unknown", title: "开放问题与剧情可能", summary: "没有唯一安全 Owner 的想法继续保持候选状态。", sourceRefs, uncertainties: ["暂不映射到 Canon、Event、Relation 或 Memory。"], targetOwnerKind: "candidate-only", state: "pending", ownerReceipt: null }
      ]
    };
  } } : {}),
  async handoffCandidate(input) {
    const candidate = input.candidate;
    if (candidate.targetOwnerKind !== "agent-recognition-proposal" || !["character", "item", "location"].includes(candidate.kind)) throw new Error("该 Agent 候选没有安全的现有资料 Owner。");
    const project = requireProject(input.projectId);
    const sourceEventId = candidate.sourceRefs[0] || `agent-run-${input.runId}`;
    const proposalResult = await runAsyncProductOperation(() => createAgentRecognitionProposal({
      workspacePath: path.join(rootPath, project.id),
      proposal: {
        projectId: project.id,
        storyId: `story.${project.id}`,
        tianyiSessionId: input.sessionId,
        sourceEventId,
        sourceReceiptId: sourceEventId,
        sourceWorkspace: "tianyi-agent",
        objectKind: candidate.kind,
        suggestedName: candidate.title,
        suggestedFields: { summary: candidate.summary, targetOwnerKind: candidate.targetOwnerKind },
        evidence: [{ sourceRef: `${input.sessionId}:${sourceEventId}`, excerpt: candidate.summary.slice(0, 480) }],
        uncertainties: candidate.uncertainties,
        duplicateMatches: [],
        now: new Date().toISOString()
      }
    }));
    return { owner: "agent-recognition-proposal", id: proposalResult.proposal.proposalId, revision: proposalResult.proposal.revision };
  }
});

function sourceCandidateToCandidateReviewResult(document, candidate) {
  const kindLabels = { actor: "人物", entity: "对象", fact: "事实", event: "事件", unit: "故事单元", beat: "节拍" };
  const label = kindLabels[candidate.kind] || "来源候选";
  return {
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    tianyi: { mode: "source-import-review-r0", authorQuestion: "作者审核来源候选", sourceDocumentId: document.sourceDocumentId, sourceRevisionHash: candidate.revisionHash },
    nuwa: {
      candidates: [{
        id: candidate.candidateId,
        title: `${label}：${candidate.displayName}`,
        change: candidate.summary,
        after: `候选${label}已由作者送入 Author Control；尚未进入正史。`
      }]
    },
    provider: { mode: "deterministic-source-extractor-r0", calls: 0 },
    contextPack: {
      id: `source-import:${document.sourceDocumentId}:${candidate.revisionHash}`,
      sources: [{ id: candidate.anchor.revisionId, type: "source-import", label: `${document.title} · ${candidate.displayName}` }],
      budgets: { maximumSources: 1, maximumCharacters: 480 }
    },
    contextReceiptId: undefined,
    nuwaRunId: undefined
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/__local/story-studio/")) {
      await handleProductRequest(request, response, url);
      return;
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, Number(error?.statusCode || 500), { error: sanitizeError(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const listeningPort = address && typeof address !== "string" ? address.port : port;
  console.log(`Story Studio listening on http://127.0.0.1:${listeningPort}`);
});

/** Browser writes are author-confirmed. The broker still records the exact
 * action envelope so a future autonomous caller cannot silently reuse this
 * route without an explicit confirmation boundary. */
function recordAuthorInitiatedAction(projectId, action, targetType, targets, actor = "author") {
  const receipt = actionPermissionBroker.record(projectId, { actor, action, targetType, targets, authorConfirmed: true, estimatedProviderCost: 0 });
  if (receipt.outcome !== "allowed") throw productError(receipt.reason, 403);
  return receipt;
}

async function handleProductRequest(request, response, url) {
  const pathname = url.pathname;
  if (request.method === "GET" && pathname === "/__local/story-studio/storage/session") {
    requireSameOrigin(request);
    sendJson(response, 200, {
      data: {
        providerId: "local-folder",
        kind: "local-folder",
        label: "本机故事位置",
        status: "ready",
        locationSelection: "managed"
      }
    }, {
      "set-cookie": `${LOCAL_SESSION_COOKIE}=${localSessionSecret}; HttpOnly; SameSite=Strict; Path=/__local/story-studio`
    });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/storage/status") {
    requireToken(request);
    const projectId = requireQueryValue(url, "projectId");
    const project = requireProject(projectId);
    const projectPath = path.join(rootPath, project.id);
    const reveal = fileManagerCommand(projectPath);
    sendJson(response, 200, {
      data: {
        version: "story-studio-storage-transparency/v1",
        providerId: "local-folder",
        kind: "local-folder",
        label: "本机故事位置",
        status: "ready",
        locationSelection: "managed",
        projectId: project.id,
        libraryPath: authorPath(rootPath),
        projectPath: authorPath(projectPath),
        persistenceState: existsSync(path.join(projectPath, "project.md")) ? "verified-local" : "unavailable",
        revealSupported: Boolean(reveal),
        revealLabel: reveal?.label || "打开故事文件夹",
        backupMode: "manual-folder-copy",
        fullExportState: "not-implemented"
      }
    });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-permissions") {
    const projectId = requireQueryValue(url, "projectId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => actionPermissionBroker.read(projectId)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-permissions/profile") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "profile"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: runProductOperation(() => actionPermissionBroker.setProfile(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-permissions/activity") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "actor", "action", "targets", "targetType", "checkpointId", "estimatedProviderCost", "authorConfirmed"]);
    requireProject(body.projectId);
    sendJson(response, 201, { data: runProductOperation(() => actionPermissionBroker.record(body.projectId, body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/storage/reveal") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId"]);
    const project = requireProject(body.projectId);
    await revealLocalPath(path.join(rootPath, project.id));
    sendJson(response, 200, { data: { revealed: true } });
    return;
  }
  if (pathname.startsWith("/__local/story-studio/intelligence-bridge/")) {
    await handleIntelligenceBridgeRequest(request, response, url);
    return;
  }
  if (pathname.startsWith("/__local/story-studio/tianyi-agent/")) {
    await handleTianyiAgentRuntimeRequest(request, response, url);
    return;
  }
  if (pathname.startsWith("/__local/story-studio/model-service/")) {
    await handleModelServiceRequest(request, response, url);
    return;
  }
  if (pathname.startsWith("/__local/story-studio/tianyi/")) {
    await handleTianyiRequest(request, response, url);
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/connection/verify") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, []);
    sendJson(response, 200, { data: { connected: true } });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/bootstrap") {
    sendJson(response, 200, { data: operations.getBootstrap() });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/projects") {
    sendJson(response, 200, { data: operations.listProjects() });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/projects/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["title", "folderSlug", "genre", "ambience"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createProject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/projects/open") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.openProject(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/world-library") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.getStoryStudioWorldLibraryBootstrap({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations") {
    const projectId = requireQueryValue(url, "projectId");
    requireProject(projectId);
    const reviewState = url.searchParams.get("reviewState") || undefined;
    const direction = url.searchParams.get("direction") || undefined;
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.listRelations({
      projectId,
      includeArchived: url.searchParams.get("includeArchived") === "true",
      ...(reviewState ? { reviewState } : {}),
      ...(url.searchParams.get("objectId") ? { objectId: url.searchParams.get("objectId") } : {}),
      ...(url.searchParams.get("relationTypeId") ? { relationTypeId: url.searchParams.get("relationTypeId") } : {}),
      ...(direction ? { direction } : {}),
      ...(url.searchParams.get("text") ? { text: url.searchParams.get("text") } : {})
    })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations/relation") {
    const projectId = requireQueryValue(url, "projectId");
    const relationId = requireQueryValue(url, "relationId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.readRelation({ projectId, relationId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations/types") {
    const projectId = requireQueryValue(url, "projectId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.listRelationTypes({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations/types/type") {
    const projectId = requireQueryValue(url, "projectId");
    const relationTypeId = requireQueryValue(url, "relationTypeId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.resolveRelationType({ projectId, relationTypeId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations/duplicates") {
    const projectId = requireQueryValue(url, "projectId");
    const sourceObjectId = requireQueryValue(url, "sourceObjectId");
    const targetObjectId = requireQueryValue(url, "targetObjectId");
    const relationTypeId = requireQueryValue(url, "relationTypeId");
    const direction = requireQueryValue(url, "direction");
    const relationLabelSnapshot = requireQueryValue(url, "relationLabelSnapshot");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.duplicateSuggestions({ projectId, sourceObjectId, targetObjectId, relationTypeId, direction, relationLabelSnapshot })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations/evidence") {
    const projectId = requireQueryValue(url, "projectId");
    const relationId = requireQueryValue(url, "relationId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.relationEvidence({ projectId, relationId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/relations/types/legacy-preview") {
    const projectId = requireQueryValue(url, "projectId");
    const relationTypeId = requireQueryValue(url, "relationTypeId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.previewLegacyRelationTypeAdoption({ projectId, relationTypeId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/types/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "label", "description", "expectedRepositoryRevision", "operationId", "sourceRef", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation-type", [body.label]);
    sendJson(response, 201, { data: runProductOperation(() => relationOperations.createRelationType({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/types/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationTypeId", "expectedTypeRevision", "expectedRepositoryRevision", "label", "description", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation-type", [body.relationTypeId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.updateRelationType({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/types/retire") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationTypeId", "expectedTypeRevision", "expectedRepositoryRevision", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation-type", [body.relationTypeId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.retireRelationType({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/types/adopt-legacy") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationTypeId", "previewHash", "expectedRepositoryRevision", "label", "description", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation-type", [body.relationTypeId]);
    sendJson(response, 201, { data: runProductOperation(() => relationOperations.adoptLegacyRelationType({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "sourceObjectId", "targetObjectId", "relationTypeId", "relationLabelSnapshot", "direction", "evidenceRefs", "sourceRevision", "sourceRef", "temporal", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.sourceObjectId, body.targetObjectId]);
    sendJson(response, 201, { data: runProductOperation(() => relationOperations.createRelationCandidate({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "expectedRelationRevision", "relationTypeId", "direction", "evidenceRefs", "temporal", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.relationId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.updateRelationCandidate({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/confirm") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "expectedRelationRevision", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.relationId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.confirmRelationCandidate({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/reject") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "expectedRelationRevision", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.relationId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.rejectRelationCandidate({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/archive") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "expectedRelationRevision", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.relationId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.archiveConfirmedRelation({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/evidence/append") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "expectedRelationRevision", "evidenceRefs", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.relationId]);
    sendJson(response, 200, { data: runProductOperation(() => relationOperations.appendRelationEvidence({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/relations/correction/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relationId", "supersedesRelationId", "correctionRelationId", "expectedRelationRevision", "sourceObjectId", "targetObjectId", "relationTypeId", "relationLabelSnapshot", "direction", "evidenceRefs", "sourceRevision", "sourceRef", "temporal", "operationId", "now"]);
    const project = requireProject(body.projectId);
    const action = recordAuthorInitiatedAction(project.id, "library-write", "relation", [body.relationId]);
    sendJson(response, 201, { data: runProductOperation(() => relationOperations.createRelationCorrectionCandidate({ ...body, projectId: project.id, authorActionReceiptId: action.id })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types") {
    const projectId = requireQueryValue(url, "projectId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => operations.listAgentTypes({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types/type") {
    const projectId = requireQueryValue(url, "projectId");
    const typeId = requireQueryValue(url, "typeId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => operations.getAgentType({ projectId, typeId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types/object") {
    const projectId = requireQueryValue(url, "projectId");
    const objectId = requireQueryValue(url, "objectId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => operations.resolveAgentTypeForWorldObject({ projectId, objectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types/objects") {
    const projectId = requireQueryValue(url, "projectId");
    const typeId = requireQueryValue(url, "typeId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => operations.listWorldObjectsByAgentType({ projectId, typeId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types/count") {
    const projectId = requireQueryValue(url, "projectId");
    const typeId = requireQueryValue(url, "typeId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => operations.countWorldObjectsByAgentType({ projectId, typeId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types/classified") {
    const projectId = requireQueryValue(url, "projectId");
    requireProject(projectId);
    sendJson(response, 200, { data: runProductOperation(() => operations.listClassifiedLibraryProjection({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-types/uncertain") {
    const projectId = requireQueryValue(url, "projectId");
    requireProject(projectId);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => operations.listUncertainLibraryProjection({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-types/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "label", "description", "baseCapability", "fieldDefinitions", "expectedCatalogRevision"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "agent-type-catalog", [body.label]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createAgentType({ ...body, status: "draft", provenance: { kind: "author", sourceRef: "library-agent-type-authoring" } })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-types/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "typeId", "expectedTypeRevision", "expectedCatalogRevision", "label", "description", "baseCapability", "fieldDefinitions"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "agent-type-catalog", [body.typeId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateAgentType(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-types/activate") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "typeId", "expectedTypeRevision", "expectedCatalogRevision"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "agent-type-catalog", [body.typeId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.activateAgentType(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-types/retire") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "typeId", "expectedTypeRevision", "expectedCatalogRevision"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "agent-type-catalog", [body.typeId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.retireAgentType(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-types/delete") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "typeId", "expectedTypeRevision", "expectedCatalogRevision"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "agent-type-catalog", [body.typeId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.deleteAgentType(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/agent-recognition/proposals") {
    requireToken(request);
    const projectId = requireQueryValue(url, "projectId");
    const project = requireProject(projectId);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => listAgentRecognitionProposals({ workspacePath: path.join(rootPath, project.id), projectId: project.id })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-recognition/drafts/create") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "operationId", "requestedObjectType", "mode", "authorIntent", "sourceScope", "sourceText", "existingObjectSummaries", "allowedFieldSchema", "noWritePolicy", "fixtureMode"]);
    if (body.noWritePolicy !== true) throw productError("Agent 起草必须声明 no-write policy。", 400);
    if (body.fixtureMode !== "deterministic" || !agentDraftFixtureAllowed) throw productError("尚未连接可用模型；当前只允许在明确的隔离开发/测试模式运行确定性起草 fixture。", 412);
    const project = requireProject(body.projectId);
    const draftRequest = { ...body, projectId: project.id };
    const output = createDeterministicStoryStudioAgentDraft(draftRequest);
    sendJson(response, 201, { data: await runAsyncProductOperation(() => createStoryStudioAgentDraftProposal({ workspacePath: path.join(rootPath, project.id), request: draftRequest, output, now: new Date().toISOString() })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-recognition/proposals/edit") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "proposalId", "expectedRevision", "suggestedName", "suggestedFields", "uncertainties", "duplicateMatches"]);
    const project = requireProject(body.projectId);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => editAgentRecognitionProposal({ ...body, projectId: project.id, workspacePath: path.join(rootPath, project.id), now: new Date().toISOString() })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/agent-recognition/proposals/ignore") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "proposalId", "expectedRevision"]);
    const project = requireProject(body.projectId);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => ignoreAgentRecognitionProposal({ ...body, projectId: project.id, workspacePath: path.join(rootPath, project.id), now: new Date().toISOString() })) });
    return;
  }
  if (request.method === "POST" && (pathname === "/__local/story-studio/agent-recognition/proposals/confirm" || pathname === "/__local/story-studio/agent-recognition/proposals/merge")) {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    const merge = pathname.endsWith("/merge");
    requireAllowedKeys(body, merge
      ? ["projectId", "proposalId", "expectedProposalRevision", "operationId", "targetObjectId", "expectedTargetRevision", "character"]
      : ["projectId", "proposalId", "expectedProposalRevision", "operationId", "character", "object"]);
    const project = requireProject(body.projectId);
    const command = { ...body, projectId: project.id, now: new Date().toISOString() };
    const genericObject = !merge && body.object && typeof body.object === "object" && ["character", "item", "location"].includes(body.object.objectType);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => merge ? agentProposalOperations.mergeCharacter(command) : genericObject ? agentProposalOperations.confirmObject(command) : agentProposalOperations.confirmCharacter(command)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/nuwa/temporary-characters/create") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "explorationId", "displayName", "goal", "disposition"]);
    const project = requireProject(body.projectId);
    recordAuthorInitiatedAction(project.id, "temporary-character", "nuwa-temporary-character", [body.displayName], "nuwa");
    const characters = operations.listWorldObjects({ projectId: project.id, type: "character" });
    const displayName = String(body.displayName || "").trim();
    const duplicateMatches = characters
      .filter((character) => [character.title, ...character.aliases].some((label) => label.normalize("NFC") === displayName.normalize("NFC")))
      .map((character) => ({ objectId: character.id, objectKind: "character", displayName: character.title, reason: "名称或别名与现有角色一致；请在候选审查中选择保存为新角色或合并。" }));
    const identity = stableHash({ projectId: project.id, explorationId: body.explorationId, displayName }).slice(0, 20);
    sendJson(response, 201, { data: await runAsyncProductOperation(() => createAgentRecognitionProposal({
      workspacePath: path.join(rootPath, project.id),
      proposal: {
        projectId: project.id,
        storyId: `story.${project.id}`,
        tianyiSessionId: `nuwa-${identity}`,
        sourceEventId: `nuwa-temp-${identity}`,
        sourceReceiptId: `receipt-${identity}`,
        sourceWorkspace: "nuwa",
        objectKind: "character",
        suggestedName: displayName,
        suggestedFields: { goal: String(body.goal || "").trim() || "本次排演的临时角色", disposition: String(body.disposition || "").trim() || "等待作者审查" },
        evidence: [{ sourceRef: `nuwa:${body.explorationId}`, excerpt: "由作者在独立女娲排演中保存为正式角色候选。" }],
        uncertainties: ["临时角色仅来自本次排演；保存或合并前需作者确认。"],
        duplicateMatches,
        now: new Date().toISOString()
      }
    })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/event-line/verified-events") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: canonReadProjection.listVerifiedCanonEvents({ projectId }) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/event-line/event") {
    const projectId = requireQueryValue(url, "projectId");
    const eventId = requireQueryValue(url, "eventId");
    sendJson(response, 200, { data: canonReadProjection.readVerifiedCanonEvent({ projectId, eventId }) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/event-line/normal-creation") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => normalEventCreationPort.state(projectId, {
      ...(url.searchParams.get("storyUnitId") ? { storyUnitId: url.searchParams.get("storyUnitId") } : {}),
      ...(url.searchParams.get("planningEventId") ? { planningEventId: url.searchParams.get("planningEventId") } : {})
    })) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/event-line/normal-creation/")) {
    requireToken(request);
    const action = pathname.slice("/__local/story-studio/event-line/normal-creation/".length);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "storyUnitId", "planningEventId", "title", "summary", "body"]);
    const input = {
      ...(body.storyUnitId ? { storyUnitId: body.storyUnitId } : {}),
      ...(body.planningEventId ? { planningEventId: body.planningEventId } : {}),
      ...(body.title ? { title: body.title } : {}),
      ...(body.summary ? { summary: body.summary } : {}),
      ...(body.body ? { body: body.body } : {})
    };
    const result = runProductOperation(() => {
      if (action === "create-story-unit") return normalEventCreationPort.createStoryUnit(body.projectId, input);
      if (action === "create-candidate") return normalEventCreationPort.createCandidate(body.projectId, input);
      if (action === "begin-impact") return normalEventCreationPort.beginImpact(body.projectId, input);
      if (action === "reject") return normalEventCreationPort.reject(body.projectId, input);
      if (action === "confirm") return normalEventCreationPort.confirm(body.projectId, input);
      throw productError("Normal Event Line action is unavailable.", 404);
    });
    recordAuthorInitiatedAction(body.projectId, action === "confirm" ? "confirmed-event" : "event-impact-review", `normal-event-line-${action}`, [String(body.projectId)]);
    sendJson(response, 200, { data: { result, state: normalEventCreationPort.state(body.projectId, input) } });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/workspace/folders/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "title", "parentId", "kind"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-category", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createWorkspaceFolder(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/workspace/folders/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "expectedContentHash", "folders"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-category", body.folders.map((folder) => folder.id));
    sendJson(response, 200, { data: runProductOperation(() => operations.updateWorkspaceFolders(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/document-history") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "ref"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.getDocumentRevisionHistory(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/document-history/preview") {
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "ref", "revisionId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.previewDocumentRevision(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/document-history/milestone") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "ref", "revisionId", "title"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", body.ref?.kind || "document", [body.ref?.id || body.revisionId]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createDocumentMilestone(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/document-history/restore") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "ref", "revisionId", "expectedHash"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", body.ref?.kind || "document", [body.ref?.id || body.revisionId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.restoreDocumentRevision(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/search") {
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "query", "type"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.searchWorldObjects(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "type", "title", "status", "tags", "aliases", "body", "agentTypeId", "agentTypeFieldValues", "profile"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", body.type, [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createGenericWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/agent-type") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "expectedHash", "agentTypeId", "agentTypeFieldValues"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-object", [body.objectId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateWorldObjectAgentType(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/card-templates") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.listCardTemplates({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/card-templates/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "template"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createCardTemplate(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/card-templates/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "templateId", "expectedHash", "template"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateCardTemplate(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/card-templates/from-character") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "templateId", "label", "expectedHash", "presentationExpectedHash"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createCardTemplateFromCharacter(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/card-templates/delete") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "templateId", "expectedHash"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.deleteCardTemplate(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/character-templates/preview") {
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "templateId", "templateExpectedHash", "markdownExpectedHash", "presentationExpectedHash"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.previewCharacterTemplateApply(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/character-templates/apply") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "templateId", "templateExpectedHash", "markdownExpectedHash", "presentationExpectedHash"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.applyCharacterTemplate(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/characters/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "title", "mode", "subtype", "status", "tags", "aliases", "background", "personality", "appearance", "properties", "portrait", "cover", "templateId", "templateExpectedHash", "agentTypeId", "agentTypeFieldValues", "profile"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "character", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createCharacterCard(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/world-object") {
    const projectId = requireQueryValue(url, "projectId");
    const objectId = requireQueryValue(url, "objectId");
    sendJson(response, 200, { data: runProductOperation(() => ({
      ...operations.readWorldObject({ projectId, objectId }),
      canonicalReadVerified: authorControl.verifyCanonEventRead({ projectId, eventId: objectId })
    })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/object-catalog") {
    const projectId = requireQueryValue(url, "projectId");
    const workVersionId = requireQueryValue(url, "workVersionId");
    sendJson(response, 200, { data: runProductOperation(() => operations.readObjectCatalog({ projectId, workVersionId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/object-catalog/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "workVersionId", "expectedRevision", "operation", "objectType", "objectIds", "categoryId", "trashedFrom"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "object-catalog", body.objectIds);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateObjectCatalog(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/open") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.openWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/close") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.closeWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "expectedHash", "presentationExpectedHash", "writeMarkdown", "writePresentation", "title", "status", "tags", "aliases", "body", "subtype", "typedProperties", "card", "profile"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-object", [body.objectId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/duplicate") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-object", [body.objectId]);
    sendJson(response, 201, { data: runProductOperation(() => operations.duplicateWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/archive") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "expectedHash"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-object", [body.objectId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.archiveWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/restore") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "expectedHash"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-object", [body.objectId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.restoreWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/bulk") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectIds", "operation", "tags"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-selection", body.objectIds);
    sendJson(response, 200, { data: runProductOperation(() => operations.bulkUpdateWorldObjects(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/move-to-folder") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectIds", "folderId"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "library-selection", body.objectIds);
    sendJson(response, 200, { data: runProductOperation(() => operations.moveWorldObjectsToFolder(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/library/import-text") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "filename", "title", "content", "folderId"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "import-candidate", [body.filename]);
    sendJson(response, 201, { data: runProductOperation(() => operations.stageTextImport(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/source-import/reviews") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.listSourceImportDocuments({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/source-import/review") {
    const projectId = requireQueryValue(url, "projectId");
    const sourceDocumentId = requireQueryValue(url, "sourceDocumentId");
    sendJson(response, 200, { data: runProductOperation(() => operations.readSourceImportDocument({ projectId, sourceDocumentId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/source-import/import") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "filename", "title", "content", "folderId", "mode"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "source-import", [body.filename]);
    sendJson(response, 201, { data: runProductOperation(() => operations.importSourceDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/source-import/extract") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "sourceDocumentId"]);
    recordAuthorInitiatedAction(body.projectId, "review-write", "source-candidates", [body.sourceDocumentId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.extractSourceImportCandidates(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/source-import/candidate/decide") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "sourceDocumentId", "candidateId", "decision", "targetObjectId"]);
    const project = requireProject(body.projectId);
    const document = operations.readSourceImportDocument({ projectId: project.id, sourceDocumentId: body.sourceDocumentId });
    if (!document) throw productError("来源文档不存在。", 404);
    const candidate = document.candidates.find((item) => item.candidateId === body.candidateId);
    if (!candidate) throw productError("来源候选不存在。", 404);
    const decision = body.decision;
    if (decision !== "accepted" && decision !== "rejected" && decision !== "merged") throw productError("来源候选审核动作无效。", 400);
    if (candidate.revisionHash !== document.currentRevisionHash) throw productError("来源候选已过期，拒绝写入。", 409);
    recordAuthorInitiatedAction(body.projectId, "review-write", "source-candidate", [candidate.candidateId]);
    if (candidate.status === decision && candidate.authorControlReviewId) {
      sendJson(response, 200, { data: { document } });
      return;
    }
    const projectPath = path.join(rootPath, project.id);
    const now = new Date().toISOString();
    if (decision === "rejected") {
      const next = decideSourceCandidateR0({ projectPath, projectId: project.id, sourceDocumentId: document.sourceDocumentId, candidateId: candidate.candidateId, decision, now });
      sendJson(response, 200, { data: { document: next } });
      return;
    }
    if (candidate.kind === "actor") {
      const identity = stableHash({ projectId: project.id, candidateId: candidate.candidateId, revision: candidate.revisionHash }).slice(0, 20);
      const proposalResult = await runAsyncProductOperation(() => createAgentRecognitionProposal({
        workspacePath: projectPath,
        proposal: {
          projectId: project.id,
          storyId: `story.${project.id}`,
          tianyiSessionId: `source-import-${identity}`,
          sourceEventId: candidate.candidateId,
          sourceReceiptId: candidate.anchor.revisionId,
          sourceWorkspace: "source-import",
          objectKind: "character",
          suggestedName: candidate.displayName,
          suggestedFields: { sourceDocumentId: document.sourceDocumentId, sourceRevisionHash: candidate.revisionHash },
          evidence: [{ sourceRef: `${document.sourceDocumentId}:${candidate.anchor.blockId || candidate.anchor.lineStart}`, excerpt: candidate.excerpt }],
          uncertainties: ["确定性 R0 只识别候选；性格、目标和别名仍需作者补充。"],
          duplicateMatches: candidate.duplicateMatches.map((match) => ({
            objectId: match.objectId,
            objectKind: match.objectType === "character" || match.objectType === "location" || match.objectType === "item" || match.objectType === "rule" ? match.objectType : "custom_object",
            displayName: match.displayName,
            reason: match.reason
          })),
          now
        }
      }));
      const proposal = proposalResult.proposal;
      if (decision === "merged") {
        const targetObjectId = String(body.targetObjectId || candidate.duplicateMatches[0]?.objectId || "").trim();
        if (!targetObjectId) throw productError("合并人物候选需要明确的既有人物。", 400);
        const target = operations.readWorldObject({ projectId: project.id, objectId: targetObjectId });
        const merged = await runAsyncProductOperation(() => agentProposalOperations.mergeCharacter({
          projectId: project.id,
          proposalId: proposal.proposalId,
          expectedProposalRevision: proposal.revision,
          operationId: `source-import-merge-${identity}`,
          targetObjectId: target.id,
          expectedTargetRevision: target.revisionToken,
          character: { title: target.title, status: target.status, tags: [...target.tags, "来源导入"], aliases: [...target.aliases, candidate.displayName], body: target.body },
          now
        }));
        const next = decideSourceCandidateR0({ projectPath, projectId: project.id, sourceDocumentId: document.sourceDocumentId, candidateId: candidate.candidateId, decision, targetObjectId: target.id, authorControlReviewId: merged.receipt.proposalId, now });
        sendJson(response, 200, { data: { document: next, authorControl: merged } });
        return;
      }
      const confirmed = await runAsyncProductOperation(() => agentProposalOperations.confirmCharacter({
        projectId: project.id,
        proposalId: proposal.proposalId,
        expectedProposalRevision: proposal.revision,
        operationId: `source-import-confirm-${identity}`,
        character: { title: candidate.displayName, status: "active", tags: ["来源导入"], aliases: [], body: `# ${candidate.displayName}\n\n来源：${document.title}\n\n${candidate.excerpt}\n` },
        now
      }));
      const next = decideSourceCandidateR0({ projectPath, projectId: project.id, sourceDocumentId: document.sourceDocumentId, candidateId: candidate.candidateId, decision, authorControlReviewId: confirmed.receipt.proposalId, now });
      sendJson(response, 200, { data: { document: next, authorControl: confirmed } });
      return;
    }
    const result = sourceCandidateToCandidateReviewResult(document, candidate);
    const review = authorControl.createCandidateReview({ projectId: project.id, result, minimumCandidates: 1, createdAt: now });
    const attached = attachAuthorControlReviewR0({ projectPath, projectId: project.id, sourceDocumentId: document.sourceDocumentId, candidateIds: [candidate.candidateId], reviewId: review.id, now });
    const next = decideSourceCandidateR0({ projectPath, projectId: project.id, sourceDocumentId: document.sourceDocumentId, candidateId: candidate.candidateId, decision, targetObjectId: decision === "merged" ? String(body.targetObjectId || "") : null, authorControlReviewId: review.id, now });
    sendJson(response, 200, { data: { document: next, authorControl: { reviewId: review.id, status: review.status }, attached } });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/source-import/handoff") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "sourceDocumentId", "unitCandidateId", "authorQuestion"]);
    const project = requireProject(body.projectId);
    const document = operations.readSourceImportDocument({ projectId: project.id, sourceDocumentId: body.sourceDocumentId });
    if (!document) throw productError("来源文档不存在。", 404);
    const candidate = document.candidates.find((item) => item.candidateId === body.unitCandidateId);
    if (!candidate || candidate.kind !== "unit" || (candidate.status !== "accepted" && candidate.status !== "merged")) throw productError("只有已审核 Unit 才能交给女娲。", 409);
    const writing = operations.getWritingBootstrap({ projectId: project.id });
    const scene = writing.activeDocument?.type === "scene" ? writing.activeDocument : writing.chapters.flatMap((chapter) => [chapter, ...chapter.scenes]).find((item) => item.type === "scene") || null;
    if (!scene) throw productError("当前项目没有可绑定的场景；来源交接已停止。", 409);
    const authorQuestion = String(body.authorQuestion || "比较这个 Unit 在有限信息下的可行走向。" ).trim();
    const operationId = `source-import-handoff-${stableHash({ projectId: project.id, sourceDocumentId: document.sourceDocumentId, unitCandidateId: candidate.candidateId, revision: candidate.revisionHash }).slice(0, 20)}`;
    const sourceSession = await runAsyncProductOperation(() => tianyi.openTianyiSession({ projectId: project.id, operationId: `${operationId}-session`, retentionMode: "normal" }));
    const brief = await intelligenceBridge.createExecutionBrief({
      projectId: project.id,
      authorGoal: authorQuestion,
      sourceQuestion: authorQuestion,
      currentContext: { mode: "writing", documentId: scene.id, objectIds: [candidate.candidateId], selectionRef: candidate.candidateId },
      selectedContextReceiptIds: [],
      selectedArchiveMessageRefs: [],
      approvedMemoryRefs: [],
      mustKeep: [`来源 revision ${candidate.revisionHash} 不得漂移。`],
      mustAvoid: ["不要将排演结果自动写入正史。"],
      unresolvedQuestions: [],
      expectedOutputKind: "candidate-routes",
      allowedAgents: ["nuwa.supervisor", "nuwa.evidence-critic"],
      allowedSkills: [],
      capabilityBudget: { maxAgentRuns: 1, maxSkillCalls: 0, maxTokens: 1200, timeoutSeconds: 30 },
      sensitivity: "project-private",
      operationId,
      originatingTianyiSessionId: sourceSession.sessionId,
      returnDestination: { mode: "writing", documentId: scene.id, selectionRef: candidate.candidateId },
      startingPoint: { beatId: candidate.candidateId, checkpoint: scene.id },
      participatingActorIds: [],
      observationCriteria: { success: ["所有候选都能追溯到导入来源。"], failure: ["来源 revision 不匹配。"] }
    });
    const handoff = createSourceImportHandoffR0({ projectPath: path.join(rootPath, project.id), projectId: project.id, sourceDocumentId: document.sourceDocumentId, unitCandidateId: candidate.candidateId, executionBriefId: brief.briefId, attentionContextHash: brief.attentionContext?.capsuleHash || "", authorQuestion, now: new Date().toISOString() });
    sendJson(response, 200, { data: { handoff, brief } });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/r9a-workflow") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.getR9AWorkflowState({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/r9a-workflow/tasks/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "title", "lane", "sourceRefs", "state"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "workflow-task", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createR9AWorkflowTask(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/r9a-workflow/tasks/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "taskId", "expectedHash", "state"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "workflow-task", [body.taskId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateR9AWorkflowTask(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/r9a-recovery/backups") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.listR9AProjectBackups({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/r9a-recovery/backups/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "title"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "project-backup", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createR9AProjectBackup(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/r9a-recovery/backups/restore") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "backupId", "confirmed"]);
    recordAuthorInitiatedAction(body.projectId, "external-action", "protected-project-recovery", [body.backupId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.restoreR9AProjectBackup(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/delete-preview") {
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.previewWorldObjectDelete(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/world-objects/delete") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "objectId", "expectedHash", "confirmed"]);
    recordAuthorInitiatedAction(body.projectId, "permanent-delete", "library-object", [body.objectId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.deleteWorldObject(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/planning-events/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "title", "body", "tags"]);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "event", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createPlanningEvent(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/planning-events/abandon") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "planningEventId", "expectedHash"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.abandonPlanningEvent(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/planning-events/pause") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "planningEventId", "expectedHash"]);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "event", [body.planningEventId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.pausePlanningEvent(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/planning-events/resume") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "planningEventId", "expectedHash"]);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "event", [body.planningEventId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.resumePlanningEvent(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/workspace/selection") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "selection"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.setWorkspaceSelection(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/world-objects/backlinks") {
    const projectId = requireQueryValue(url, "projectId");
    const objectId = requireQueryValue(url, "objectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.getWorldObjectBacklinks({ projectId, objectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/visual-workbench") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.getVisualWorkbenchBootstrap({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/writing") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.getWritingBootstrap({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/story-units") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.listStoryUnits({ projectId, includeArchived: url.searchParams.get("includeArchived") === "true" })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/story-unit") {
    const projectId = requireQueryValue(url, "projectId");
    const unitId = requireQueryValue(url, "unitId");
    sendJson(response, 200, { data: runProductOperation(() => operations.readStoryUnit({ projectId, unitId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/story-units/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "title", "summary", "sourceRefs", "items", "linkedEntityIds", "unresolvedQuestionIds", "generationConstraints"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "story-range", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createStoryUnit(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/story-units/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "unitId", "expectedVersion", "title", "summary", "lifecycle", "sourceRefs", "items", "linkedEntityIds", "unresolvedQuestionIds", "generationConstraints"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "story-range", [body.unitId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateStoryUnit(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/story-units/archive") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "unitId", "expectedVersion"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "story-range", [body.unitId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.archiveStoryUnit(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/output-artifacts") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.listOutputArtifacts({ projectId, includeArchived: url.searchParams.get("includeArchived") === "true" })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/output-artifact") {
    const projectId = requireQueryValue(url, "projectId");
    const artifactId = requireQueryValue(url, "artifactId");
    sendJson(response, 200, { data: runProductOperation(() => operations.readOutputArtifact({ projectId, artifactId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/output-artifacts/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "type", "title", "sourceUnits", "generationBrief", "content", "structure", "workVersionSource", "createdAt"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-output", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createOutputArtifact(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/output-artifacts/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "artifactId", "expectedVersion", "title", "sourceUnits", "generationBrief", "content", "structure", "lifecycle", "revisionOperationId"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-output", [body.artifactId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateOutputArtifact(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/output-artifacts/archive") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "artifactId", "expectedVersion"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-output", [body.artifactId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.archiveOutputArtifact(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/creation/plugins") {
    sendJson(response, 200, { data: await creationPluginLifecycle.discover() });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/creation/plugins/adapters") {
    await refreshCreationPluginAdapterRegistry();
    sendJson(response, 200, { data: creationPluginAdapterRegistry.discover().filter((adapter) => adapter.adapterId !== "markdown-export" && adapter.adapterId !== "mock-cli" && adapter.adapterId !== "mock-http") });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/creation/plugins/execute") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["adapterId", "packageValue", "capability", "authorConfirmation", "idempotencyKey", "beforeHash"]);
    await refreshCreationPluginAdapterRegistry();
    const adapter = creationPluginAdapterRegistry.discover().find((candidate) => candidate.adapterId === body.adapterId);
    if (!adapter || adapter.availability !== "available" || adapter.health !== "healthy") {
      throw productError("该插件已安装但不可执行；真实操作系统能力隔离尚未完成。", 409);
    }
    throw productError("插件执行在当前基线中保持关闭。", 409);
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/creation/plugins/health") {
    sendJson(response, 200, { data: await creationPluginLifecycle.health(requireQueryValue(url, "pluginId")) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/creation/plugins/")) {
    requireToken(request);
    const operation = pathname.slice("/__local/story-studio/creation/plugins/".length);
    if (!new Set(["install", "update", "rollback", "enable", "disable", "uninstall"]).has(operation)) throw productError("Unknown curated plugin operation.", 404);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["pluginId"]);
    const result = operation === "install" ? await creationPluginLifecycle.install(body.pluginId)
      : operation === "update" ? await creationPluginLifecycle.update(body.pluginId)
        : operation === "rollback" ? await creationPluginLifecycle.rollback(body.pluginId)
          : operation === "enable" ? await creationPluginLifecycle.setEnabled(body.pluginId, true)
            : operation === "disable" ? await creationPluginLifecycle.setEnabled(body.pluginId, false)
              : await creationPluginLifecycle.uninstall(body.pluginId);
    await refreshCreationPluginAdapterRegistry();
    sendJson(response, 200, { data: result });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/creation-media") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.getCreationMediaCatalog({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/creation-media/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "expectedCatalogHash", "asset"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-media", [body.asset?.fileName || "media"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createCreationMediaAsset(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/creation-media/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "assetId", "expectedCatalogHash", "patch"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-media", [body.assetId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateCreationMediaAsset(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/creation-media/delete") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "assetId", "expectedCatalogHash"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-media", [body.assetId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.deleteCreationMediaAsset(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/writing/continuity") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => operations.readWritingContinuity({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/writing/continuity") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "activeDestination", "returnDestination", "workspaceMode", "showWorldHome", "documentId", "revisionToken", "selection", "editorSelection", "scrollTop", "focus"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.saveWritingContinuity(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/impact-review") {
    const projectId = requireQueryValue(url, "projectId");
    const reviewId = String(url.searchParams.get("reviewId") || "").trim();
    sendJson(response, 200, { data: runProductOperation(() => authorControl.readImpactReview({ projectId, ...(reviewId ? { reviewId } : {}) })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/impact-review/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "sceneId", "authorGoal", "selectedObjectIds"]);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "scene", [body.sceneId]);
    sendJson(response, 201, { data: runProductOperation(() => authorControl.createImpactReview(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/impact-review/create-from-planning-event") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "planningEventId"]);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "event", [body.planningEventId]);
    sendJson(response, 201, { data: runProductOperation(() => authorControl.createPlanningEventImpactReview(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/impact-review/choose") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "reviewId", "optionId", "action", "authorContent"]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.chooseImpactRoute(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/change-set") {
    const projectId = requireQueryValue(url, "projectId");
    const changeSetId = String(url.searchParams.get("changeSetId") || "").trim();
    sendJson(response, 200, { data: runProductOperation(() => authorControl.readAuthorChangeSet({ projectId, ...(changeSetId ? { changeSetId } : {}) })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/change-set/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "reviewId"]);
    sendJson(response, 201, { data: runProductOperation(() => authorControl.createAuthorChangeSet(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/change-set/dry-run") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "changeSetId"]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.dryRunAuthorChangeSet(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/change-set/abandon") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "changeSetId"]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.abandonAuthorChangeSet(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/change-set/apply") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "changeSetId"]);
    recordAuthorInitiatedAction(body.projectId, "confirmed-event", "impact-confirmation", [body.changeSetId]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.applyAuthorChangeSet(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/exploration") {
    const projectId = requireQueryValue(url, "projectId");
    const explorationId = String(url.searchParams.get("explorationId") || "").trim();
    sendJson(response, 200, { data: runProductOperation(() => authorControl.readStoryExploration({ projectId, ...(explorationId ? { explorationId } : {}) })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "sceneId", "authorGoal"]);
    sendJson(response, 201, { data: runProductOperation(() => authorControl.createStoryExploration(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/create-standalone") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "story", "authorGoal", "characterNames", "preservedFacts", "boundaries", "depth"]);
    sendJson(response, 201, { data: runProductOperation(() => authorControl.createStandaloneStoryExploration(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/run") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "explorationId"]);
    recordAuthorInitiatedAction(body.projectId, "rehearsal-run", "story-possibility", [body.explorationId], "nuwa");
    sendJson(response, 200, { data: await authorControl.runStoryExploration(body) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/synthesize") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "explorationId"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "story-possibility", [body.explorationId], "nuwa");
    sendJson(response, 200, { data: runProductOperation(() => authorControl.synthesizeStoryExploration(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/submit-route") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "explorationId", "routeId"]);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "story-possibility", [body.explorationId, body.routeId], "nuwa");
    sendJson(response, 200, { data: await runAsyncProductOperation(() => intelligenceBridge.submitLegacyExplorationRouteToImpact(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/reject-route") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "explorationId", "routeId", "reason"]);
    recordAuthorInitiatedAction(body.projectId, "rehearsal-run", "story-possibility-rejection", [body.explorationId, body.routeId], "nuwa");
    sendJson(response, 200, { data: runProductOperation(() => authorControl.rejectStoryExplorationRoute(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/exploration/cancel") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "explorationId"]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.cancelStoryExploration(body)) });
    return;
  }
  if (pathname.startsWith("/__local/story-studio/author-control/exploration/scene-runtime")) {
    await handleNuwaSceneRuntimeRequest(request, response, url);
    return;
  }
  if (pathname.startsWith("/__local/story-studio/author-control/exploration/director-r1")) {
    await handleNuwaDirectorR1Request(request, response, url);
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/intelligence-overlay") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => authorControl.readIntelligenceOverlay({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/review-history") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => authorControl.readReviewHistory({ projectId })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/candidate-review") {
    const projectId = requireQueryValue(url, "projectId");
    const reviewId = String(url.searchParams.get("reviewId") || "").trim();
    sendJson(response, 200, { data: runProductOperation(() => authorControl.readCandidateReview({ projectId, ...(reviewId ? { reviewId } : {}) })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/character-state-fixture") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => characterStateImpactFixture.read(projectId)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/nuwa-bounded-fixture") {
    const projectId = requireQueryValue(url, "projectId");
    const missingSource = url.searchParams.get("case") === "missing-source";
    const stale = url.searchParams.get("case") === "stale";
    sendJson(response, 200, { data: runProductOperation(() => nuwaBoundedScenarioFixture.read(projectId, { missingSource, stale })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/multiverse-single-derived-fixture") {
    const projectId = requireQueryValue(url, "projectId");
    const ensureNuwa = url.searchParams.get("surface") === "nuwa";
    const missingSource = url.searchParams.get("case") === "missing-source";
    const staleSelection = url.searchParams.get("case") === "stale";
    sendJson(response, 200, { data: runProductOperation(() => multiverseSingleDerivedFixture.read(projectId, { ensureNuwa, missingSource, staleSelection })) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/creation/source") {
    const projectId = requireQueryValue(url, "projectId");
    const storyUnitId = String(url.searchParams.get("storyUnitId") || "").trim() || undefined;
    const eventIds = url.searchParams.getAll("eventId").map((value) => value.trim()).filter(Boolean);
    const workVersionId = String(url.searchParams.get("workVersionId") || "").trim() || undefined;
    sendJson(response, 200, { data: await runAsyncProductOperation(() => creationSourceSelectionPort.read(projectId, { storyUnitId, eventIds, workVersionId })) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/creation/source/")) {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "workVersionId", "storyUnitId", "eventIds", "title", "text", "selectedDifferenceIds", "expectedRootRevision"]);
    const action = pathname.slice("/__local/story-studio/creation/source/".length);
    const scope = { workVersionId: body.workVersionId, storyUnitId: body.storyUnitId, eventIds: body.eventIds };
    const operation = action === "create-root"
      ? () => creationSourceSelectionPort.createRoot(body.projectId)
      : action === "create-artifact"
        ? () => creationSourceSelectionPort.createArtifact(body.projectId, { ...scope, title: body.title })
        : action === "save-artifact"
          ? () => creationSourceSelectionPort.saveArtifact(body.projectId, body.text)
          : action === "reconcile-source"
            ? () => creationSourceSelectionPort.reconcileSource(body.projectId, {
              selectedDifferenceIds: body.selectedDifferenceIds,
              expectedRootRevision: body.expectedRootRevision
            })
            : action === "recover-source"
              ? () => creationSourceSelectionPort.recoverSourceReconciliation(body.projectId)
              : null;
    if (!operation) throw productError("Creation source action does not exist.", 404);
    recordAuthorInitiatedAction(body.projectId, "draft-write", `creation-source-${action}`, [String(body.projectId)], "author");
    await runAsyncProductOperation(operation);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => creationSourceSelectionPort.read(body.projectId, scope)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/creation/source-e2e/advance-root") {
    requireToken(request);
    if (process.env.TIANYAN_CREATION_SOURCE_PORT_E2E_R0 !== "1") throw productError("Creation source E2E control is disabled for this runtime.", 404);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId"]);
    const project = creationSourceSelectionPort.resolveActiveProject(body.projectId);
    if (!/(?:disposable|e2e|可丢弃|隔离)/iu.test(project.title)) throw productError("Creation source E2E control requires an explicitly disposable Project.", 403);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "creation-source-e2e-advance-root", [String(body.projectId)], "author");
    await runAsyncProductOperation(() => creationSourceSelectionPort.advanceRoot(body.projectId));
    sendJson(response, 200, { data: await runAsyncProductOperation(() => creationSourceSelectionPort.read(body.projectId)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/creation/work-version-source-fixture") {
    const projectId = requireQueryValue(url, "projectId");
    const fixtureCase = url.searchParams.get("case");
    sendJson(response, 200, { data: await runAsyncProductOperation(() => workVersionBoundCreationFixture.read(projectId, { fixtureCase })) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/creation/work-version-source-fixture/")) {
    requireToken(request);
    if (process.env.TIANYAN_WORK_VERSION_CREATION_FIXTURE_R0 !== "1") throw productError("WorkVersion Creation Fixture is disabled for this runtime.", 404);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "text", "selectedDifferenceIds", "expectedRootRevision"]);
    const action = pathname.slice("/__local/story-studio/creation/work-version-source-fixture/".length);
    const operation = action === "create-root"
      ? () => workVersionBoundCreationFixture.createRoot(body.projectId)
      : action === "create-artifact"
        ? () => workVersionBoundCreationFixture.createArtifact(body.projectId)
        : action === "save-artifact"
          ? () => workVersionBoundCreationFixture.saveArtifact(body.projectId, body.text)
          : action === "reconcile"
            ? () => workVersionBoundCreationFixture.reconcile(body.projectId)
            : action === "advance-root"
            ? () => workVersionBoundCreationFixture.advanceRoot(body.projectId)
            : action === "archive-root"
              ? () => workVersionBoundCreationFixture.archiveRoot(body.projectId)
              : action === "reconcile-source"
                ? () => workVersionBoundCreationFixture.reconcileSource(body.projectId, {
                  selectedDifferenceIds: body.selectedDifferenceIds,
                  expectedRootRevision: body.expectedRootRevision
                })
                : null;
    if (!operation) throw productError("WorkVersion Creation Fixture action does not exist.", 404);
    recordAuthorInitiatedAction(body.projectId, "draft-write", `work-version-creation-${action}`, [String(body.projectId)], "author");
    await runAsyncProductOperation(operation);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => workVersionBoundCreationFixture.read(body.projectId)) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/author-control/multiverse-single-derived-fixture/")) {
    requireToken(request);
    if (process.env.TIANYAN_MULTIVERSE_SINGLE_DERIVED_FIXTURE_R0 !== "1") throw productError("Multiverse single-derived Fixture is disabled for this runtime.", 404);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "versionName", "sourceRevision", "changeId", "selectedChangeIds"]);
    const action = pathname.slice("/__local/story-studio/author-control/multiverse-single-derived-fixture/".length);
    const operation = action === "create-root"
      ? () => multiverseSingleDerivedFixture.createRoot(body.projectId).view
      : action === "save-derived"
        ? () => multiverseSingleDerivedFixture.saveDerived(body.projectId, body).view
        : action === "prepare-review"
          ? () => multiverseSingleDerivedFixture.prepareReview(body.projectId, body.selectedChangeIds || [])
          : action === "prepare-impact"
            ? () => multiverseSingleDerivedFixture.prepareImpact(body.projectId)
            : action === "reject"
              ? () => multiverseSingleDerivedFixture.reject(body.projectId)
              : action === "confirm"
                ? () => multiverseSingleDerivedFixture.confirm(body.projectId, body.selectedChangeIds || undefined)
                : null;
    if (!operation) throw productError("Multiverse single-derived Fixture action does not exist.", 404);
    recordAuthorInitiatedAction(body.projectId, action === "confirm" || action.includes("review") || action === "prepare-impact" ? "event-impact-review" : "rehearsal-run", `multiverse-single-derived-${action}`, [String(body.changeId || body.selectedChangeIds?.[0] || "root")], "author");
    sendJson(response, 200, { data: runProductOperation(operation) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/author-control/nuwa-bounded-fixture/")) {
    requireToken(request);
    if (process.env.TIANYAN_NUWA_BOUNDED_FIXTURE_R0 !== "1") throw productError("Nuwa bounded scenario Fixture is disabled for this runtime.", 404);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "operationId", "sourceBranchId", "sequence", "instruction", "branchId", "activeTool", "view"]);
    const action = pathname.slice("/__local/story-studio/author-control/nuwa-bounded-fixture/".length);
    const reviewOperation = action === "prepare-review" ? nuwaBoundedScenarioFixture.prepareReview : action === "prepare-impact" ? nuwaBoundedScenarioFixture.prepareImpact : action === "reject" ? nuwaBoundedScenarioFixture.reject : action === "confirm" ? nuwaBoundedScenarioFixture.confirm : null;
    recordAuthorInitiatedAction(body.projectId, action.includes("review") || action === "confirm" ? "event-impact-review" : "rehearsal-run", `nuwa-bounded-${action}`, [String(body.branchId || body.sourceBranchId || "branch.original")], "author");
    sendJson(response, 200, { data: runProductOperation(() => reviewOperation ? reviewOperation(body.projectId) : nuwaBoundedScenarioFixture.operate(body.projectId, action, body)) });
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/__local/story-studio/author-control/character-state-fixture/")) {
    requireToken(request);
    if (process.env.TIANYAN_CHARACTER_STATE_FIXTURE_R0 !== "1") throw productError("Character State write fixture is disabled for this runtime.", 404);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId"]);
    const action = pathname.slice("/__local/story-studio/author-control/character-state-fixture/".length);
    const operation = action === "prepare" ? characterStateImpactFixture.prepare : action === "reject" ? characterStateImpactFixture.reject : action === "confirm" ? characterStateImpactFixture.confirm : null;
    if (!operation) throw productError("Character State Fixture action does not exist.", 404);
    recordAuthorInitiatedAction(body.projectId, "event-impact-review", "character-state-fixture", [action]);
    sendJson(response, 200, { data: runProductOperation(() => operation(body.projectId)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/candidate-review/from-story-observation") {
    requireToken(request);
    if (process.env.STORY_OBSERVATION_SUCCESSOR_R0 !== "1") {
      throw productError("Story Observation Canvas R0 review adapter is disabled for this runtime.", 404);
    }
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "patch"]);
    const patch = parseStoryObservationProposalPatch(body.patch);
    if (patch.projectId !== body.projectId) throw productError("Story Observation Proposal belongs to another project.", 409);
    const project = operations.listProjects().find((item) => item.id === patch.projectId);
    if (!project) throw productError("Story Observation Proposal project does not exist.", 404);
    const result = storyObservationPatchToCandidateResult(patch, project.title);
    const review = authorControl.createCandidateReview({ projectId: project.id, result, createdAt: new Date().toISOString() });
    sendJson(response, 201, { data: { result: { ...result, review: { id: review.id, status: review.status } }, review } });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/author-control/candidate-reviews") {
    const projectId = requireQueryValue(url, "projectId");
    sendJson(response, 200, { data: runProductOperation(() => authorControl.listCandidateReviews({ projectId })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/candidate-review/abandon") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "reviewId"]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.abandonCandidateReview({ ...body, abandonedAt: new Date().toISOString() })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/author-control/candidate-review/decide") {
    requireToken(request);
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "reviewId", "candidateId", "decision", "reason", "confirmationReceipt"]);
    sendJson(response, 200, { data: runProductOperation(() => authorControl.decideCandidateReview({ ...body, decidedAt: new Date().toISOString() })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/writing/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "type", "title", "chapterId"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createWritingDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/writing/start") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.startWriting(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/writing/open") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "documentId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.openWritingDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/writing/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "documentId", "expectedHash", "status", "body"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "writing-document", [body.documentId]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateWritingDocument(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/visual-document") {
    const projectId = requireQueryValue(url, "projectId");
    const relativePath = requireQueryValue(url, "relativePath");
    sendJson(response, 200, { data: runProductOperation(() => operations.readVisualDocument({ projectId, relativePath })) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-documents/create") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "type", "title"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "visual-document", [body.title]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createVisualDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-documents/open") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relativePath", "pane"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.openVisualDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-documents/close") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relativePath"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.closeVisualDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-documents/update") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relativePath", "expectedHash", "document"]);
    recordAuthorInitiatedAction(body.projectId, "draft-write", "visual-document", [body.relativePath]);
    sendJson(response, 200, { data: runProductOperation(() => operations.updateVisualDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/timeline/validate") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "relativePath", "expectedHash", "document"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.validateTimelineDocument(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/timeline/planning-event/create-and-add") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "timelineRelativePath", "timelineExpectedHash", "title", "body", "tags"]);
    sendJson(response, 201, { data: runProductOperation(() => operations.createPlanningEventAndAddToTimeline(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/timeline/planning-event/add-existing") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "timelineRelativePath", "timelineExpectedHash", "planningEventId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.addPlanningEventToTimeline(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-workbench/split") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "enabled"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.setVisualSplitView(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-workbench/swap") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.swapVisualPanes(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/workspace/surface") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "surface"]);
    sendJson(response, 200, { data: runProductOperation(() => operations.setStoryStudioSurface(body)) });
    return;
  }
  if (request.method === "POST" && pathname === "/__local/story-studio/visual-assets/import") {
    requireToken(request);
    const body = await readJsonBody(request);
    requireAllowedKeys(body, ["projectId", "category", "filename", "mimeType", "base64"]);
    recordAuthorInitiatedAction(body.projectId, "library-write", "local-asset", [body.filename]);
    sendJson(response, 201, { data: runProductOperation(() => operations.importVisualAsset(body)) });
    return;
  }
  if (request.method === "GET" && pathname === "/__local/story-studio/visual-asset") {
    const projectId = requireQueryValue(url, "projectId");
    const relativePath = requireQueryValue(url, "relativePath");
    const asset = runProductOperation(() => operations.resolveVisualAsset({ projectId, relativePath }));
    response.writeHead(200, {
      "content-type": asset.mimeType,
      "content-length": String(asset.size),
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'"
    });
    createReadStream(asset.absolutePath).pipe(response);
    return;
  }
  sendJson(response, 404, { error: "本地项目操作不存在。" });
}

async function handleModelServiceRequest(request, response, url) {
  requireToken(request);
  requireSameOrigin(request);
  const route = url.pathname.slice("/__local/story-studio/model-service/".length);
  if (request.method === "GET" && route === "profile") {
    sendJson(response, 200, { data: readProviderProfileProjection() });
    return;
  }
  if (request.method === "POST" && route === "profile/save") {
    const body = await readJsonBody(request, 8 * 1024);
    requireAllowedKeys(body, ["expectedRevision", "displayName", "baseUrl", "modelId", "enabled", "apiKey"]);
    assertSiliconFlowBaseUrl(body.baseUrl ?? readActiveProviderProfile()?.baseUrl);
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const current = providerProfileStore.assertRevision(body.expectedRevision);
    providerProfileState = current;
    const active = readActiveProviderProfile();
    const profileChanged = Boolean(apiKey)
      || ["displayName", "baseUrl", "modelId", "enabled"].some((key) => body[key] !== undefined && body[key] !== active?.[key]);
    const previousCredential = apiKey ? providerCredential.readForProvider() : "";
    if (body.apiKey !== undefined && apiKey) providerCredential.replace(body.apiKey);
    try {
      providerProfileState = providerProfileStore.save({
        expectedRevision: body.expectedRevision,
        displayName: body.displayName,
        baseUrl: body.baseUrl,
        modelId: body.modelId,
        enabled: body.enabled,
        ...(profileChanged ? { connectionStatus: "unknown", lastVerifiedAt: null, lastError: null } : {}),
        historyEntry: {
          id: randomUUID(),
          kind: "save",
          status: "success",
          occurredAt: new Date().toISOString(),
          modelId: body.modelId ?? active?.modelId ?? null
        }
      });
    } catch (error) {
      if (apiKey) restoreProviderCredential(previousCredential);
      throw error;
    }
    syncProviderGatewayProfile();
    sendJson(response, 200, { data: readProviderProfileProjection() });
    return;
  }
  if (request.method === "POST" && route === "profile/reload") {
    const body = await readJsonBody(request, 256);
    requireAllowedKeys(body, []);
    providerProfileState = providerProfileStore.reload();
    syncProviderGatewayProfile();
    sendJson(response, 200, { data: readProviderProfileProjection() });
    return;
  }
  if (request.method === "POST" && route === "profile/disable") {
    const body = await readJsonBody(request, 512);
    requireAllowedKeys(body, ["expectedRevision"]);
    providerProfileState = providerProfileStore.disable({ expectedRevision: body.expectedRevision });
    syncProviderGatewayProfile();
    sendJson(response, 200, { data: readProviderProfileProjection() });
    return;
  }
  if (request.method === "POST" && route === "profile/clear-credential") {
    const body = await readJsonBody(request, 512);
    requireAllowedKeys(body, ["confirmed"]);
    if (body.confirmed !== true) throw productError("清除凭据需要明确确认。", 400);
    providerProfileState = providerProfileStore.assertRevision(providerProfileState.revision);
    providerCredential.clear();
    providerGateway.clearDiscoveredModel();
    providerProfileState = providerProfileStore.markConnection({
      expectedRevision: providerProfileState.revision,
      connectionStatus: "unknown",
      lastVerifiedAt: null,
      lastError: null,
      historyEntry: {
        id: randomUUID(),
        kind: "credential",
        status: "success",
        occurredAt: new Date().toISOString()
      }
    });
    sendJson(response, 200, { data: readProviderProfileProjection() });
    return;
  }
  if (request.method === "POST" && route === "profile/reveal-credential") {
    const body = await readJsonBody(request, 512);
    requireAllowedKeys(body, ["confirmed"]);
    if (body.confirmed !== true) throw productError("显示凭据需要明确确认。", 400);
    if (!providerCredential.configured()) throw productError("当前还没有保存 Provider 凭据。", 412);
    sendJson(response, 200, {
      data: {
        credential: providerCredential.readForProvider(),
        expiresInMs: 12_000
      }
    });
    return;
  }
  if (request.method === "POST" && route === "models") {
    const body = await readJsonBody(request, 1 * 1024);
    requireAllowedKeys(body, []);
    const active = readActiveProviderProfile();
    if (!active?.enabled) throw productError("当前 Provider 已禁用，未获取模型。", 412);
    const startedAt = Date.now();
    try {
      const discovery = await providerGateway.discoverModels({ providerId: "siliconflow", timeoutMs: 15_000 });
      providerProfileState = providerProfileStore.markConnection({
        expectedRevision: providerProfileState.revision,
        availableModels: discovery.modelIds,
        lastModelDiscoveryAt: new Date().toISOString(),
        historyEntry: {
          id: randomUUID(),
          kind: "models",
          status: "success",
          occurredAt: new Date().toISOString(),
          modelCount: discovery.modelIds.length,
          latencyMs: Date.now() - startedAt
        }
      });
      sendJson(response, 200, {
        data: {
          providerId: "siliconflow",
          models: discovery.modelIds,
          profile: readProviderProfileProjection()
        }
      });
    } catch (error) {
      try {
        providerProfileState = providerProfileStore.markConnection({
          expectedRevision: providerProfileState.revision,
          lastError: safeProviderErrorSummary(error),
          historyEntry: {
            id: randomUUID(),
            kind: "models",
            status: "failed",
            occurredAt: new Date().toISOString(),
            latencyMs: Date.now() - startedAt,
            error: safeProviderErrorSummary(error)
          }
        });
      } catch { /* preserve the original model discovery error */ }
      throw error;
    }
    return;
  }
  if (request.method === "POST" && route === "test") {
    const body = await readJsonBody(request, 1 * 1024);
    requireAllowedKeys(body, ["modelId"]);
    const active = readActiveProviderProfile();
    if (!active?.enabled) throw productError("当前 Provider 已禁用，未发起连接测试。", 412);
    const startedAt = Date.now();
    try {
      const discovery = await providerGateway.discoverModels({ providerId: "siliconflow", timeoutMs: 15_000 });
      const requestedModelId = typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : active.modelId;
      const modelId = requestedModelId
        ? (discovery.modelIds.includes(requestedModelId) ? requestedModelId : (() => { throw productError("选中的模型 ID 当前不可用，请更新模型后重试。", 409); })())
        : providerGateway.selectDiscoveredModel(discovery.modelIds).modelId;
      providerProfileState = providerProfileStore.markConnection({
        expectedRevision: providerProfileState.revision,
        connectionStatus: "verified",
        lastVerifiedAt: new Date().toISOString(),
        lastError: null,
        availableModels: discovery.modelIds,
        lastModelDiscoveryAt: new Date().toISOString(),
        historyEntry: {
          id: randomUUID(),
          kind: "connection",
          status: "success",
          occurredAt: new Date().toISOString(),
          modelId,
          modelCount: discovery.modelIds.length,
          latencyMs: Date.now() - startedAt
        }
      });
      syncProviderGatewayProfile(modelId);
      sendJson(response, 200, {
        data: {
          gate: "connection",
          providerId: "siliconflow",
          modelId,
          availableModelCount: discovery.modelIds.length,
          models: discovery.modelIds,
          profile: readProviderProfileProjection()
        }
      });
    } catch (error) {
      try {
        providerProfileState = providerProfileStore.markConnection({
          expectedRevision: providerProfileState.revision,
          connectionStatus: "failed",
          lastVerifiedAt: null,
          lastError: safeProviderErrorSummary(error),
          historyEntry: {
            id: randomUUID(),
            kind: "connection",
            status: "failed",
            occurredAt: new Date().toISOString(),
            latencyMs: Date.now() - startedAt,
            error: safeProviderErrorSummary(error)
          }
        });
      } catch {
        // A connection error must never hide the original provider failure.
      }
      throw error;
    }
    return;
  }
  if (request.method === "POST" && route === "minimal-inference") {
    const body = await readJsonBody(request, 1 * 1024);
    requireAllowedKeys(body, []);
    const active = readActiveProviderProfile();
    if (!active?.enabled) throw productError("当前 Provider 已禁用，未发起最小推理。", 412);
    const profile = providerGateway.metadata().profiles[0];
    if (!profile) throw productError("没有可用的 Provider 模型档案。", 412);
    const result = await providerGateway.openChatCompletion({
      profileId: profile.id,
      messages: [{ role: "user", content: "Reply with OK." }],
      maxOutputTokens: 16,
      timeoutMs: 30_000
    });
    try {
      providerProfileState = providerProfileStore.markConnection({
        expectedRevision: providerProfileState.revision,
        historyEntry: {
          id: randomUUID(),
          kind: "inference",
          status: "success",
          occurredAt: new Date().toISOString(),
          modelId: result.modelId,
          latencyMs: providerGateway.metadata().providers.find((provider) => provider.id === "siliconflow")?.lastLatencyMs ?? null,
          traceId: result.traceId
        }
      });
    } catch { /* inference result remains valid even if the non-critical history write fails */ }
    sendJson(response, 200, {
      data: {
        gate: "minimal-inference",
        modelId: result.modelId,
        content: result.content.slice(0, 200),
        finishReason: result.finishReason,
        usage: result.usage,
        traceId: result.traceId,
        profile: readProviderProfileProjection()
      }
    });
    return;
  }
  if (request.method === "POST" && route === "session-key") {
    const body = await readJsonBody(request, 2 * 1024);
    requireAllowedKeys(body, ["apiKey"]);
    try {
      providerCredential.replace(body.apiKey);
      const discovery = await providerGateway.discoverModels({ providerId: "siliconflow", timeoutMs: 15_000 });
      const preferredProfile = providerGateway.selectDiscoveredModel(discovery.modelIds);
      providerProfileState = providerProfileStore.save({
        expectedRevision: providerProfileState.revision,
        modelId: preferredProfile.modelId,
        enabled: true,
        connectionStatus: "verified",
        lastVerifiedAt: new Date().toISOString(),
        lastError: null
      });
      sendJson(response, 200, {
        data: {
          version: "story-studio-provider-session/v1",
          connected: true,
          providerId: "siliconflow",
          modelId: preferredProfile.modelId,
          profileId: preferredProfile.id,
          availableModelCount: discovery.modelIds.length,
          profile: readProviderProfileProjection()
        }
      });
    } catch (error) { throw error; }
    return;
  }
  if (request.method === "POST" && route === "session-key/clear") {
    const body = await readJsonBody(request, 256);
    requireAllowedKeys(body, []);
    providerCredential.clear();
    providerGateway.clearDiscoveredModel();
    providerProfileState = providerProfileStore.markConnection({
      expectedRevision: providerProfileState.revision,
      connectionStatus: "unknown",
      lastVerifiedAt: null,
      lastError: null
    });
    sendJson(response, 200, { data: { cleared: true, profile: readProviderProfileProjection() } });
    return;
  }
  if (request.method === "POST" && route === "golden-loop/run") {
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "profileId", "authorIntent", "focus", "contextRefs", "executionMode"]);
    const executionMode = body.executionMode === "live-pilot-r2" ? "live-pilot-r2" : "legacy";
    const livePriceUsd = executionMode === "live-pilot-r2" ? readConfiguredLivePriceUsd() : null;
    if (executionMode === "live-pilot-r2" && !livePriceUsd) {
      throw productError("LIVE_SMOKE_BLOCKED_PRICE_UNVERIFIED：当前 SiliconFlow 价格没有以 USD 计价配置，未调用真实 Provider。", 412);
    }
    const project = requireProject(body.projectId);
    if (executionMode === "live-pilot-r2" && project.id !== readConfiguredLivePilotFixtureProjectId()) {
      throw productError("LIVE_SMOKE_BLOCKED_DEV_FIXTURE_ONLY：真实模型实验只允许显式配置的开发故事，未调用真实 Provider。", 412);
    }
    const library = operations.getStoryStudioWorldLibraryBootstrap({ projectId: project.id });
    const profile = providerGateway.metadata().profiles.find((item) => item.id === body.profileId);
    if (!profile) throw productError("真实推演模型档案不存在。", 400);
    const authorIntent = requireBoundedModelText(body.authorIntent, "作者意图", 2_000);
    let sourceAuthority;
    try {
      sourceAuthority = resolveGoldenLoopSourceAuthority({
        operations,
        authorControl,
        projectId: project.id,
        focus: body.focus,
        contextRefs: body.contextRefs
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "来源解析失败";
      throw productError(`受保护来源无法解析，未调用模型：${reason}`, 409);
    }
    let liveAttentionContext = null;
    if (executionMode === "live-pilot-r2") {
      const latestExecutionState = await intelligenceBridge.readLatestExecutionState({ projectId: project.id });
      const approvedBrief = latestExecutionState.brief;
      if (!approvedBrief || approvedBrief.authorApprovalState !== "approved" || !approvedBrief.attentionContext) {
        throw productError("LIVE_SMOKE_BLOCKED_ATTENTION_CONTEXT_UNAVAILABLE：当前项目没有匹配的已批准 Nuwa Attention Context，未调用真实 Provider。", 409);
      }
      if (approvedBrief.attentionContext.project.projectId !== project.id || approvedBrief.attentionContext.focus.sceneId !== sourceAuthority.documentSource.binding.documentId) {
        throw productError("LIVE_SMOKE_BLOCKED_ATTENTION_CONTEXT_MISMATCH：Attention Context 与当前写作文档不一致，未调用真实 Provider。", 409);
      }
      if (approvedBrief.attentionContext.authorQuestion !== authorIntent) {
        throw productError("LIVE_SMOKE_BLOCKED_ATTENTION_CONTEXT_QUESTION_MISMATCH：作者问题已改变，请回到天意重新确认执行简报。", 409);
      }
      liveAttentionContext = approvedBrief.attentionContext;
    }
    const sceneId = sourceAuthority.documentSource.binding.documentId;
    let exploration;
    try {
      exploration = authorControl.createStoryExploration({
        projectId: project.id,
        sceneId,
        authorGoal: authorIntent,
        planOptions: {
          allowedRoles: ["evidence-critic"],
          maxRoles: 1,
          // This identity has already been re-read and policy-checked above;
          // Author Control only turns it into a bounded snapshot selection.
          explicitNoteIds: sourceAuthority.eventSource ? [sourceAuthority.eventSource.event.id] : [],
          runKey: `provider-${stableHash({
            projectId: project.id,
            sceneId,
            authorIntent,
            sourceBinding: sourceAuthority.documentSource.binding,
            eventRef: sourceAuthority.eventSource?.reference || null,
            contextRefs: sourceAuthority.contextRefs.map((ref) => ({
              ownerType: ref.ownerType,
              ownerId: ref.ownerId,
              stableId: ref.stableId,
              contentHash: ref.contentHash
            }))
          }).slice(0, 16)}`,
          runner: "external",
          ...(liveAttentionContext ? { attentionContext: liveAttentionContext } : {})
        }
      });
    } catch (error) {
      if (executionMode === "live-pilot-r2" && error instanceof Error && /Nuwa Attention Context|snapshot/iu.test(error.message)) {
        throw productError("LIVE_SMOKE_BLOCKED_ATTENTION_CONTEXT_STALE：当前 Brief 与本次 Snapshot 不一致，请重新确认执行简报。", 409);
      }
      throw error;
    }
    const projectPath = operations.resolveProjectWorkspacePath({ projectId: project.id });
    let runOwner = authorControl.readStoryExplorationRunOwner({ projectId: project.id, explorationId: exploration.id });
    if (!runOwner.contextReceiptId) {
      const projectContext = { rootPath, agentId: tianyiAgentId, scope: "project", projectId: project.id };
      runOwner = authorControl.bindStoryExplorationContextReceipt({
        projectId: project.id,
        explorationId: exploration.id,
        contextReceiptId: await allocateReceiptId(projectContext)
      });
    }
    const nuwaOwner = readNuwaRunPack(projectPath, runOwner.runId);
    if (executionMode === "live-pilot-r2" && !nuwaOwner.attentionContext) {
      throw productError("LIVE_SMOKE_BLOCKED_ATTENTION_CONTEXT_UNAVAILABLE：本次 Run Pack 没有可验证的 Nuwa Attention Context，未调用真实 Provider。", 409);
    }
    let receipt;
    try {
      receipt = await createGoldenLoopReceipt({
        receiptId: runOwner.contextReceiptId,
        project,
        profile,
        focus: sourceAuthority.focus,
        documentSource: sourceAuthority.documentSource,
        contextRefs: sourceAuthority.contextRefs,
        eventSource: sourceAuthority.eventSource,
        library,
        snapshotHash: nuwaOwner.snapshot.snapshotHash
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知 Receipt 错误";
      throw productError(`Context Receipt 创建失败，未调用模型：${reason}`, 409);
    }
    let currentDocumentSource;
    try {
      currentDocumentSource = revalidateGoldenLoopDocumentSource({
        document: operations.readWritingDocument({ projectId: project.id, documentId: sourceAuthority.documentSource.binding.documentId }),
        documentSource: sourceAuthority.documentSource
      });
      assertGoldenLoopReceiptSourceBinding(receipt, currentDocumentSource);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "来源在执行前发生变化";
      throw productError(`受保护来源已变化，未调用模型：${reason}`, 409);
    }
    const providerContext = {
      project: { id: project.id, title: project.title },
      focus: sourceAuthority.focus,
      contextRefs: sourceAuthority.contextRefs.map((ref) => ({
        stableId: ref.stableId,
        objectType: ref.objectType,
        ownerId: ref.ownerId,
        contentHash: ref.contentHash
      }))
    };
    if (exploration.status === "ready-for-review" && nuwaOwner.bundle) {
      const recovered = recoverGoldenLoopResultFromRunPack({
        profileId: body.profileId,
        contextReceipt: receipt,
        runPack: nuwaOwner,
        context: providerContext,
        documentSource: currentDocumentSource,
        authorIntent
      });
      const review = authorControl.createCandidateReview({ projectId: project.id, result: recovered, createdAt: new Date().toISOString() });
      sendJson(response, 200, { data: { ...recovered, review: { id: review.id, status: review.status } } });
      return;
    }
    const controller = new AbortController();
    request.once("aborted", () => controller.abort());
    let providerResult;
    try {
      providerResult = await runGoldenLoopOperation({
        gateway: providerGateway,
        profileId: body.profileId,
        modelId: profile.modelId,
        maxOutputTokens: profile.maxOutputTokens,
        contextReceiptId: receipt.id,
        contextReceipt: receipt,
        nuwaOwner: { plan: nuwaOwner.run.plan, snapshot: nuwaOwner.snapshot },
        documentSource: currentDocumentSource,
        authorIntent,
        executionMode,
        attentionContext: nuwaOwner.attentionContext,
        priceUsd: livePriceUsd,
        context: providerContext,
        signal: controller.signal
      });
    } catch (error) {
      if (executionMode === "live-pilot-r2" && Array.isArray(error?.pilotReceipts) && error.pilotReceipts.length > 0) {
        writeNuwaProviderPilotReceipt({
          workspacePath: projectPath,
          runId: runOwner.runId,
          receipt: {
            version: LIVE_PROVIDER_PILOT_VERSION,
            mode: "live-pilot-r2",
            status: "failed",
            modelId: profile.modelId,
            contextHash: error.pilotContextHash || nuwaOwner.attentionContext?.capsuleHash || null,
            candidateCount: 0,
            maxCalls: LIVE_PROVIDER_CALLS_MAX,
            maxCostUsd: LIVE_PROVIDER_BUDGET_USD,
            priceStatus: livePriceUsd ? "verified" : "unverified",
            seedSupport: "unsupported",
            retryCount: Number.isInteger(error.pilotRetryCount) ? error.pilotRetryCount : 0,
            receipts: error.pilotReceipts,
            errorCategory: String(error.pilotErrorCategory || error.code || "provider-failure").slice(0, 80)
          }
        });
      }
      throw error;
    }
    if (executionMode === "live-pilot-r2" && providerResult.provider?.livePilot) {
      writeNuwaProviderPilotReceipt({
        workspacePath: projectPath,
        runId: runOwner.runId,
        receipt: providerResult.provider.livePilot
      });
    }
    try {
      authorControl.recordProviderStoryExploration({
        projectId: project.id,
        explorationId: exploration.id,
        outcome: providerResult.outcome
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知 RunPack 错误";
      throw productError(`Provider 结果未能进入女娲 RunPack：${reason}`, 409);
    }
    const { outcome: _outcome, ...transportResult } = providerResult;
    const validatedRunPack = readNuwaRunPack(projectPath, runOwner.runId);
    let candidates;
    try {
      candidates = projectValidatedRunPackCandidates({ rawCandidates: transportResult.nuwa.candidates, runPack: validatedRunPack });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知候选投影错误";
      throw productError(`女娲 RunPack 候选无法进入 Candidate Review：${reason}`, 409);
    }
    const result = {
      ...transportResult,
      nuwa: {
        ...transportResult.nuwa,
        candidates
      }
    };
    const review = authorControl.createCandidateReview({ projectId: project.id, result, createdAt: new Date().toISOString() });
    sendJson(response, 200, { data: { ...result, review: { id: review.id, status: review.status } } });
    return;
  }
  if (request.method === "GET" && route === "status") {
    const metadata = providerGateway.metadata();
    const configured = metadata.providers.some((provider) => provider.configured);
    const persistedModels = readActiveProviderProfile()?.availableModels || [];
    const models = persistedModels.length
      ? persistedModels.map((id) => ({ providerId: "siliconflow", id, label: id.split("/").at(-1) || id, capabilities: ["chat", "streaming"] }))
      : metadata.models;
    sendJson(response, 200, {
      data: {
        version: "story-studio-model-service/v1",
        providers: metadata.providers,
        budgetLedger: metadata.budgetLedger,
        models,
        profiles: metadata.profiles,
        profile: readProviderProfileProjection(),
        livePilot: {
          version: "tianyan-single-real-provider-pilot-r2/v1",
          candidateCount: LIVE_CANDIDATE_COUNT,
          maxCalls: LIVE_PROVIDER_CALLS_MAX,
          maxCostUsd: LIVE_PROVIDER_BUDGET_USD,
          priceStatus: readConfiguredLivePriceUsd() ? "verified" : "unverified",
          fixtureStatus: readConfiguredLivePilotFixtureProjectId() ? "configured" : "unconfigured",
          seedSupport: "unsupported"
        },
        tianyiDialogue: {
          ready: configured,
          reason: configured ? null : "provider-unconfigured"
        }
      }
    });
    return;
  }
  if (request.method === "POST" && route === "tianyi-grounded-answer") {
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["operationId", "submissionId", "explicitRetry", "profileId", "question", "contextRequest"]);
    if (typeof tianyi.runTianyiGroundedAnswer !== "function") throw productError("天意真实回答链不可用。", 503);
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    const controller = new AbortController();
    request.once("aborted", () => controller.abort());
    try {
      const result = await tianyi.runTianyiGroundedAnswer({
        ...body,
        signal: controller.signal,
        onDraftChunk(event) { sendSseEvent(response, "draft", event); }
      });
      sendSseEvent(response, "complete", result);
    } catch (error) {
      sendSseEvent(response, "error", { error: sanitizeModelStreamError(error), code: typeof error?.code === "string" ? error.code : "invalid-response" });
    } finally {
      response.end();
    }
    return;
  }
  if (request.method === "POST" && route === "tianyi-object-context/resolve") {
    const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
    requireAllowedKeys(body, ["projectId", "objectContextRefs"]);
    sendJson(response, 200, { data: await runAsyncProductOperation(() => tianyi.resolveTianyiObjectContextRefs(body)) });
    return;
  }
  throw productError("模型服务对话尚未开放。", 404);
}

function resolveProviderAppDataRoot() {
  const configured = process.env.TIANYAN_PROVIDER_APP_DATA_ROOT;
  const explicitAllowed = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || process.env.TIANYAN_PROVIDER_PROFILE_DEV_MODE === "1";
  if (configured && !explicitAllowed) throw new Error("TIANYAN_PROVIDER_APP_DATA_ROOT 仅可在显式开发或测试模式使用。");
  if (!configured && process.env.NODE_ENV === "test") {
    return path.join(os.tmpdir(), "tianyan-provider-profile-test", path.basename(rootPath));
  }
  return path.resolve(configured || defaultProviderAppDataRoot());
}

function shouldInstallHistoricalProviderIncident() {
  return process.env.NODE_ENV !== "test" && process.env.TIANYAN_PROVIDER_BUDGET_TEST_MODE !== "1";
}

function readActiveProviderProfile() {
  return providerProfileState.profiles.find((profile) => profile.id === providerProfileState.activeProfileId) || null;
}

function readProviderProfileProjection() {
  const configuredCredential = providerCredential.configured() ? providerCredential.readForProvider() : "";
  return providerProfileStore.publicState(providerProfileState, {
    configured: configuredCredential.length > 0,
    backend: providerCredential.backendKind(),
    suffix: configuredCredential ? configuredCredential.slice(-4) : null
  });
}

function syncProviderGatewayProfile(preferredModelId = null) {
  const active = readActiveProviderProfile();
  const modelId = preferredModelId || active?.modelId || "";
  if (!modelId) {
    providerGateway.clearDiscoveredModel();
    return;
  }
  try {
    providerGateway.selectDiscoveredModel([modelId]);
  } catch {
    // Keep the persisted model visible to Settings while the Gateway remains
    // on its safe built-in profile until a successful model test occurs.
    providerGateway.clearDiscoveredModel();
  }
}

function restoreProviderCredential(previousCredential) {
  try {
    if (previousCredential) providerCredential.replace(previousCredential);
    else providerCredential.clear();
  } catch {
    // The original save error remains the actionable result. A failed
    // rollback is still fail-closed because the credential is never returned.
  }
}

function validatedProviderBaseUrl() {
  const active = readActiveProviderProfile();
  assertSiliconFlowBaseUrl(active?.baseUrl);
  return active.baseUrl.trim().replace(/\/$/u, "");
}

function safeProviderErrorSummary(error) {
  const message = error?.name === "ProviderGatewayError" || error?.name === "ProviderCredentialBackendError" || error?.statusCode
    ? String(error.message || "Provider 操作失败。")
    : "Provider 连接失败。";
  return message.replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 240);
}

function assertSiliconFlowBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw productError("SiliconFlow Base URL 不能为空。", 400);
  let parsed;
  try { parsed = new URL(value.trim()); } catch { throw productError("SiliconFlow Base URL 无效。", 400); }
  const normalized = value.trim().replace(/\/$/u, "");
  const official = "https://api.siliconflow.cn/v1";
  const localFixtureAllowed = (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/.*)?$/u.test(normalized);
  if (parsed.protocol !== "https:" && !localFixtureAllowed) throw productError("生产 Provider 只允许 HTTPS Base URL。", 400);
  if (normalized !== official && !localFixtureAllowed) throw productError("本轮只支持 SiliconFlow 官方 Base URL。", 400);
}

async function createGoldenLoopReceipt(input) {
  const projectContext = { rootPath, agentId: tianyiAgentId, scope: "project", projectId: input.project.id };
  const receiptId = input.receiptId;
  const existing = await readReceipt(projectContext, receiptId);
  if (existing) {
    assertGoldenLoopReceiptSourceBinding(existing.value, input.documentSource);
    return existing.value;
  }
  const sources = [];
  const seen = new Set();
  const addSource = (ref) => {
    if (!ref || ref.projectId !== input.project.id || ref.state !== "current" || ref.inclusion !== "included") return;
    const sourceRef = tianyiObjectContextRefKey(ref);
    if (seen.has(sourceRef) || sources.length >= 5) return;
    seen.add(sourceRef);
    sources.push({ ...ref, sourceRef });
  };
  const binding = input.documentSource?.binding;
  if (!binding) throw new Error("Context Receipt 缺少服务端解析的文档选区绑定。");
  const document = operations.readWritingDocument({ projectId: input.project.id, documentId: binding.documentId });
  revalidateGoldenLoopDocumentSource({ document, documentSource: input.documentSource });
  addSource({
    version: "story-tianyi-object-context-ref/v1",
    ownerType: "markdown-writing",
    objectType: "selection",
    stableId: `selection.${binding.selection.start}.${binding.selection.end}`,
    projectId: input.project.id,
    ownerId: document.id,
    contentHash: document.revisionToken,
    state: "current",
    inclusion: "included",
      label: `${document.title} · 当前选区`
  });
  // A server-resolved event is the explicit task anchor. Reserve it before
  // optional context so the five-source Receipt cap cannot silently exclude
  // the selected event from the actual Nuwa plan.
  if (input.eventSource?.event?.revisionToken) {
    addSource({
      version: "story-tianyi-object-context-ref/v1",
      ownerType: "markdown-object",
      objectType: "event",
      stableId: input.eventSource.event.id,
      projectId: input.project.id,
      ownerId: input.eventSource.event.id,
      contentHash: input.eventSource.event.revisionToken,
      state: "current",
      inclusion: "included",
      label: `${input.eventSource.event.status === "committed" ? "已确认事件" : "规划事件"} · ${input.eventSource.event.title}`
    });
  }
  for (const ref of input.contextRefs) addSource(ref);
  const receipt = normalizeContextReceipt({
    version: CONTEXT_RECEIPT_V3_VERSION,
    id: receiptId,
    sessionId: "session.golden-loop",
    agentId: tianyiAgentId,
    personaRevision: 1,
    relationshipPolicyRevision: 1,
    runtime: { mode: "provider", providerId: "siliconflow", modelId: input.profile.modelId, profileId: input.profile.id },
    project: { id: input.project.id, surface: input.snapshotHash },
    selection: {
      documentId: binding.documentId,
      objectId: null,
      timelinePointId: receiptMachineSelectionId(input.eventSource?.reference?.eventId)
    },
    sources,
    sourceBinding: binding,
    approvedMemoryIds: [],
    enabledSkillRefs: [],
    excludedSources: input.library.objects
      .filter((object) => !sources.some((source) => source.ownerId === object.id))
      .slice(0, 32)
      .map((object) => ({ id: `object:${object.id}`, reason: "not-selected-for-this-task" })),
    generationTimestamp: new Date().toISOString(),
    stale: false,
    responseClassifications: ["candidate-suggestion", "inference"]
  });
  const write = await createReceipt(projectContext, receipt, {
    source: "immutable-create",
    recordedAt: receipt.generationTimestamp,
    operationId: `operation.golden-loop.${receiptId}`
  });
  if (!write.ok) throw productError("Context Receipt 创建冲突，未调用模型。", 409);
  return receipt;
}

function receiptMachineSelectionId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC");
  return normalized.length <= CONTINUITY_MAX_ID_LENGTH && CONTINUITY_ID_PATTERN.test(normalized)
    ? normalized
    : null;
}

async function handleNuwaDirectorR1Request(request, response, url) {
  const prefix = "/__local/story-studio/author-control/exploration/director-r1";
  requireSameOrigin(request);
  if (request.method === "GET" && pathnameMatches(url.pathname, prefix, "")) {
    const projectId = requireQueryValue(url, "projectId");
    const runId = requireQueryValue(url, "runId");
    requireProject(projectId);
    const projectPath = path.join(rootPath, projectId);
    sendJson(response, 200, { data: runProductOperation(() => readNuwaDirectorStateR1(projectPath, runId)) });
    return;
  }
  if (request.method !== "POST") throw productError("女娲导演权限只接受本地 GET/POST 请求。", 405);
  requireToken(request);
  const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
  requireAllowedKeys(body, ["projectId", "runId", "action", "kind", "granted", "reason", "displayName", "purpose", "agentId", "agentStatus", "title", "confirmCreativeBrief", "confirmAuthorCheckpoint", "createdAt"]);
  const project = requireProject(body.projectId);
  const projectPath = path.join(rootPath, project.id);
  const current = readNuwaDirectorStateR1(projectPath, body.runId);
  let next;
  if (body.action === "set-permission") {
    next = setNuwaDirectorPermissionR1(current, { kind: body.kind, granted: body.granted === true, reason: String(body.reason || "作者在导演面板更新权限。"), ...(body.createdAt ? { now: body.createdAt } : {}) });
  } else if (body.action === "create-temporary-agent") {
    next = createNuwaTemporaryAgentR1(current, { displayName: body.displayName, purpose: body.purpose, ...(body.createdAt ? { now: body.createdAt } : {}) });
  } else if (body.action === "end-temporary-agent") {
    next = endNuwaTemporaryAgentR1(current, { agentId: body.agentId, status: body.agentStatus === "completed" ? "completed" : "cancelled", ...(body.createdAt ? { now: body.createdAt } : {}) });
  } else if (body.action === "create-longform-job") {
    next = createNuwaLongformJobR1(current, { title: body.title, ...(body.createdAt ? { now: body.createdAt } : {}) });
  } else if (body.action === "advance-longform-job") {
    next = advanceNuwaLongformJobR1(current, { ...(body.confirmCreativeBrief === true ? { confirmCreativeBrief: true } : {}), ...(body.confirmAuthorCheckpoint === true ? { confirmAuthorCheckpoint: true } : {}), ...(body.createdAt ? { now: body.createdAt } : {}) });
  } else if (["pause-longform-job", "resume-longform-job", "cancel-longform-job"].includes(body.action)) {
    next = setNuwaLongformJobStatusR1(current, { action: body.action === "pause-longform-job" ? "pause" : body.action === "resume-longform-job" ? "resume" : "cancel", ...(body.createdAt ? { now: body.createdAt } : {}) });
  } else {
    throw productError("未知的女娲导演操作。", 404);
  }
  writeNuwaDirectorStateR1({ workspacePath: projectPath, runId: body.runId, state: next });
  recordAuthorInitiatedAction(project.id, "rehearsal-run", `nuwa-director-${body.action}`, [body.runId], "author");
  sendJson(response, 200, { data: next });
}

async function handleNuwaSceneRuntimeRequest(request, response, url) {
  const prefix = "/__local/story-studio/author-control/exploration/scene-runtime";
  requireSameOrigin(request);
  requireToken(request);
  const projectId = request.method === "GET" ? requireQueryValue(url, "projectId") : null;
  if (request.method === "GET" && pathnameMatches(url.pathname, prefix, "")) {
    const runId = requireQueryValue(url, "runId");
    requireProject(projectId);
    const projectPath = path.join(rootPath, projectId);
    sendJson(response, 200, { data: runProductOperation(() => readNuwaSceneSimulationReadModel(projectPath, runId)) });
    return;
  }
  if (request.method !== "POST") throw productError("场景排演运行时只接受本地 GET/POST 请求。", 405);
  const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
  const route = url.pathname.slice(`${prefix}/`.length);
  if (route === "create") {
    requireAllowedKeys(body, ["projectId", "explorationId", "runId", "createdAt"]);
    const project = requireProject(body.projectId);
    const owner = authorControl.readStoryExplorationRunOwner({ projectId: project.id, explorationId: body.explorationId });
    if (owner.runId !== body.runId) throw productError("场景排演必须绑定当前 Exploration 的主 Run Pack。", 409);
    const projectPath = path.join(rootPath, project.id);
    const existing = readNuwaSceneSimulationReadModel(projectPath, body.runId);
    if (existing) {
      sendJson(response, 200, { data: existing });
      return;
    }
    const pack = readNuwaRunPack(projectPath, body.runId);
    const runtime = createNuwaSceneSimulationRun({ runId: body.runId, snapshotHash: pack.snapshot.snapshotHash, canonicalRevision: pack.snapshot.snapshotHash, ...(body.createdAt ? { createdAt: body.createdAt } : {}) });
    recordAuthorInitiatedAction(project.id, "rehearsal-run", "nuwa-scene-run", [body.runId], "nuwa");
    writeNuwaSceneSimulationRun(projectPath, runtime);
    sendJson(response, 201, { data: readNuwaSceneSimulationReadModel(projectPath, body.runId) });
    return;
  }
  requireAllowedKeys(body, ["projectId", "runId", "parentRunId", "steps", "checkpointId", "instruction", "modifiedSoftGoal", "injectSecretTo", "childRunId", "currentCanonicalRevision", "createdAt"]);
  const project = requireProject(body.projectId);
  const projectPath = path.join(rootPath, project.id);
  const current = readNuwaSceneSimulationRun(projectPath, body.runId);
  if (!current) throw productError("场景排演尚未建立。", 404);
  if (route === "play" && body.steps !== undefined && (!Number.isInteger(body.steps) || body.steps < 0 || body.steps > 12)) {
    throw productError("场景排演步数必须是 0 到 12 之间的整数。", 400);
  }
  if (route === "intervene" && body.injectSecretTo !== undefined && (!Array.isArray(body.injectSecretTo) || body.injectSecretTo.some((actorId) => !["actor.linyuan", "actor.alan", "actor.gatekeeper"].includes(actorId)))) {
    throw productError("作者干预只能向当前场景中的角色传播信息。", 400);
  }
  let next = current;
  if (route === "step") {
    recordAuthorInitiatedAction(project.id, "rehearsal-run", "nuwa-scene-step", [current.runId], "author");
    next = stepNuwaSceneSimulation(current, body.createdAt);
    writeNuwaSceneSimulationRun(projectPath, next);
    sendJson(response, 200, { data: readNuwaSceneSimulationReadModel(projectPath, next.runId) });
    return;
  }
  if (route === "play") {
    recordAuthorInitiatedAction(project.id, "rehearsal-run", "nuwa-scene-play", [current.runId], "author");
    next = runNuwaSceneSimulation(current, { ...(body.steps === undefined ? {} : { steps: Number(body.steps) }), ...(body.createdAt ? { now: body.createdAt } : {}) });
    writeNuwaSceneSimulationRun(projectPath, next);
    sendJson(response, 200, { data: readNuwaSceneSimulationReadModel(projectPath, next.runId) });
    return;
  }
  if (route === "pause") {
    next = pauseNuwaSceneSimulation(current, body.createdAt);
    writeNuwaSceneSimulationRun(projectPath, next);
    sendJson(response, 200, { data: readNuwaSceneSimulationReadModel(projectPath, next.runId) });
    return;
  }
  if (route === "stop") {
    recordAuthorInitiatedAction(project.id, "rehearsal-run", "nuwa-scene-stop", [current.runId], "author");
    next = stopNuwaSceneSimulation(current, body.createdAt);
    writeNuwaSceneSimulationRun(projectPath, next);
    sendJson(response, 200, { data: readNuwaSceneSimulationReadModel(projectPath, next.runId) });
    return;
  }
  if (route === "checkpoint") {
    recordAuthorInitiatedAction(project.id, "rehearsal-run", "nuwa-scene-checkpoint", [current.runId], "author");
    next = createNuwaSceneCheckpoint(current, { ...(body.checkpointId ? { checkpointId: body.checkpointId } : {}), ...(body.createdAt ? { createdAt: body.createdAt } : {}) });
    writeNuwaSceneSimulationRun(projectPath, next);
    sendJson(response, 200, { data: readNuwaSceneSimulationReadModel(projectPath, next.runId) });
    return;
  }
  if (route === "intervene") {
    if (typeof body.instruction !== "string") throw productError("作者干预需要明确指令。", 400);
    recordAuthorInitiatedAction(project.id, "rehearsal-intervention", "nuwa-scene-intervention", [current.runId], "author");
    next = applyNuwaSceneIntervention(current, { checkpointId: body.checkpointId, instruction: body.instruction, ...(body.modifiedSoftGoal ? { modifiedSoftGoal: body.modifiedSoftGoal } : {}), ...(Array.isArray(body.injectSecretTo) ? { injectSecretTo: body.injectSecretTo } : {}), ...(body.createdAt ? { createdAt: body.createdAt } : {}) });
    writeNuwaSceneSimulationRun(projectPath, next);
    sendJson(response, 200, { data: readNuwaSceneSimulationReadModel(projectPath, next.runId) });
    return;
  }
  if (route === "fork") {
    const checkpointId = String(body.checkpointId || "");
    const checkpoint = current.checkpoints.find((candidate) => candidate.checkpointId === checkpointId);
    if (!checkpoint) throw productError("场景分支需要一个已有检查点。", 409);
    const childRunId = String(body.childRunId || `nuwa-scene-child-${stableHash({ runId: current.runId, checkpointId, stateHash: current.stateHash, interventionIds: current.interventions.map((intervention) => intervention.interventionId) }).slice(0, 12)}`);
    const existingChild = readNuwaSceneSimulationReadModel(projectPath, childRunId);
    if (existingChild) {
      sendJson(response, 200, { data: { parent: readNuwaSceneSimulationReadModel(projectPath, current.runId), child: existingChild } });
      return;
    }
    const parentPack = readNuwaRunPack(projectPath, current.runId);
    const childPlan = { ...structuredClone(parentPack.run.plan), runId: childRunId, authorGoal: `${parentPack.run.authorGoal} · 作者干预分支` };
    createNuwaRunPack({ workspacePath: projectPath, plan: childPlan, snapshot: parentPack.snapshot, updateLatest: false, ...(parentPack.attentionContext ? { attentionContext: parentPack.attentionContext } : {}) });
    recordAuthorInitiatedAction(project.id, "rehearsal-branch", "nuwa-scene-branch", [current.runId, childRunId], "author");
    const forked = forkNuwaSceneSimulationFromCheckpoint(current, { checkpointId, childRunId, ...(body.createdAt ? { createdAt: body.createdAt } : {}) });
    writeNuwaSceneSimulationRun(projectPath, forked.child);
    writeNuwaSceneSimulationRun(projectPath, forked.parent);
    sendJson(response, 201, { data: { parent: readNuwaSceneSimulationReadModel(projectPath, forked.parent.runId), child: readNuwaSceneSimulationReadModel(projectPath, forked.child.runId) } });
    return;
  }
  if (route === "compare") {
    requireAllowedKeys(body, ["projectId", "runId", "parentRunId", "childRunId"]);
    const parent = readNuwaSceneSimulationRun(projectPath, body.parentRunId || current.runId);
    const child = readNuwaSceneSimulationRun(projectPath, body.childRunId || body.runId);
    if (!parent || !child) throw productError("父子 Run 不完整，无法比较。", 404);
    sendJson(response, 200, { data: compareNuwaSceneSimulations(parent, child) });
    return;
  }
  if (route === "replay") {
    const replay = replayNuwaSceneSimulation(current);
    sendJson(response, 200, { data: replay });
    return;
  }
  if (route === "candidate") {
    const pack = readNuwaRunPack(projectPath, current.runId);
    const candidate = buildNuwaSceneCandidate(current, { currentCanonicalRevision: body.currentCanonicalRevision || pack.snapshot.snapshotHash });
    const result = sceneRuntimeCandidateResult(project, current, candidate);
    recordAuthorInitiatedAction(project.id, "candidate-review", "nuwa-scene-candidate", [current.runId, candidate.candidateId], "author");
    const review = authorControl.createCandidateReview({ projectId: project.id, result, minimumCandidates: 1, createdAt: body.createdAt || new Date().toISOString() });
    sendJson(response, 201, { data: { candidate, review } });
    return;
  }
  throw productError("场景排演运行时操作不存在。", 404);
}

function pathnameMatches(pathname, prefix, suffix) {
  return pathname === `${prefix}${suffix}`;
}

function sceneRuntimeCandidateResult(project, run, candidate) {
  const sourceRefs = candidate.sourceRevisions.map((ref) => ({ id: ref.id, type: "scene-source", label: ref.id }));
  const knownFacts = candidate.knowledgeCitations
    .map((knowledgeRef) => run.scenario.knowledge.find((item) => item.id === knowledgeRef)?.label)
    .filter(Boolean);
  const candidateView = {
    id: candidate.candidateId,
    title: `场景排演 · ${run.scenario.title}`,
    change: candidate.actorDecisions.at(-1) || "角色完成一次受约束行动。",
    after: candidate.stateDeltas.join("；") || "世界沙箱状态保持不变。",
    causes: candidate.causalChain,
    evidence: candidate.knowledgeCitations,
    affectedObjects: candidate.sourceRevisions.map((ref) => ref.id),
    uncertainty: candidate.uncertainty.join("；"),
    impact: "候选只属于本次排演，必须进入既有 Candidate Review。",
    risk: "当前 Run 仍不是故事事实。",
    authorView: {
      direction: "按角色认知推进",
      keyAction: candidate.actorDecisions.at(-1) || "角色完成一次受约束行动。",
      directResult: candidate.stateDeltas.at(-1) || "沙箱状态保持不变。",
      downstreamImpact: candidate.causalChain.at(-1) || "待作者检查后续因果。",
      causalDifference: "信息传播只沿 ObservationReceipt 发生。",
      risks: candidate.uncertainty,
      unknowns: ["守门人仍不知道地下室钥匙位置。"],
      knowledgeBoundary: "每个角色只读取自己的知识投影。"
    }
  };
  return {
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack: {
      version: "tianyan-golden-loop-context-pack/v1",
      id: `context-pack-${stableHash({ runId: run.runId, candidateId: candidate.candidateId }).slice(0, 16)}`,
      contextReceiptId: `scene-runtime-${run.runId}`,
      project: { id: project.id, title: project.title },
      authorIntent: `场景排演：${run.scenario.title}`,
      sources: sourceRefs.map((source) => ({ ...source, content: "仅保留来源标签，不复制正文。" })),
      unknowns: candidate.uncertainty,
      budgets: { maximumSources: 16, maximumCharacters: 16_000 },
      excluded: []
    },
    contextReceiptId: `scene-runtime-${run.runId}`,
    nuwaRunId: run.runId,
    tianyi: { version: "tianyan-tianyi-alignment/v1", facts: [], inferences: [], unknowns: candidate.uncertainty, suggestions: [], simulationTask: { goal: run.scenario.title, mustPreserve: run.director.hardConstraints, questions: candidate.unresolvedQuestions } },
    nuwa: { version: "tianyan-nuwa-simulation/v1", knownFacts, assumptions: [], causalSteps: candidate.causalChain, actorResponses: candidate.actorDecisions.map((decision) => ({ actor: "scene-runtime", response: decision })), conflicts: [], unknowns: candidate.uncertainty, candidates: [candidateView] },
    provider: { profileId: "deterministic-scene-simulation-r0", calls: [] }
  };
}

async function handleIntelligenceBridgeRequest(request, response, url) {
  requireToken(request);
  requireSameOrigin(request);
  if (request.method !== "POST") throw productError("天意与女娲桥接只接受受保护的本地 POST 请求。", 405);
  const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
  const route = url.pathname.slice("/__local/story-studio/intelligence-bridge/".length);
  const routes = {
    "brief/create": [["projectId", "authorGoal", "sourceQuestion", "startingPoint", "participatingActorIds", "observationCriteria", "createdAt", "provenance", "currentContext", "selectedContextReceiptIds", "selectedArchiveMessageRefs", "approvedMemoryRefs", "mustKeep", "mustAvoid", "unresolvedQuestions", "expectedOutputKind", "allowedAgents", "allowedSkills", "capabilityBudget", "sensitivity", "operationId", "originatingTianyiSessionId", "returnDestination", "requestedRunCount", "fixedSeeds"], () => intelligenceBridge.createExecutionBrief(body)],
    "resume": [["projectId"], () => intelligenceBridge.readLatestExecutionState(body)],
    "brief/read": [["projectId", "briefId", "revision"], () => intelligenceBridge.readExecutionBrief(body)],
    "brief/revise": [["projectId", "briefId", "expectedHash", "changes"], () => intelligenceBridge.reviseExecutionBrief(body)],
    "brief/approve": [["projectId", "briefId", "revision", "expectedHash", "expectedSourceSetHash"], () => intelligenceBridge.approveExecutionBrief(body)],
    "brief/start": [["projectId", "briefId", "revision"], () => intelligenceBridge.startExecutionBrief(body)],
    "brief/run": [["projectId", "briefId", "revision", "explorationId"], () => intelligenceBridge.runExecutionBrief(body)],
    "brief/synthesize": [["projectId", "briefId", "revision", "explorationId"], () => intelligenceBridge.synthesizeExecutionBrief(body)],
    "result/read": [["projectId", "briefId"], () => intelligenceBridge.readResultReceipt(body)],
    "result/submit": [["projectId", "briefId", "revision", "explorationId", "resultReceiptId", "routeId"], () => intelligenceBridge.submitExecutionBriefRouteToImpact(body)]
  };
  const definition = routes[route];
  if (!definition) throw productError("天意与女娲桥接操作不存在。", 404);
  requireAllowedKeys(body, definition[0]);
  sendJson(response, 200, { data: await runAsyncProductOperation(definition[1]) });
}

async function handleTianyiAgentRuntimeRequest(request, response, url) {
  requireSameOrigin(request);
  if (request.method === "GET") {
    requireToken(request);
    const projectId = requireQueryValue(url, "projectId");
    const workVersionId = requireQueryValue(url, "workVersionId");
    const sessionId = requireQueryValue(url, "sessionId");
    const runId = requireQueryValue(url, "runId");
    requireProject(projectId);
    if (url.pathname.endsWith("/projection")) {
      sendJson(response, 200, { data: await tianyiAgentRuntime.getRunProjection({ projectId, workVersionId, sessionId, runId }) });
      return;
    }
    if (url.pathname.endsWith("/events")) {
      sendJson(response, 200, { data: await tianyiAgentRuntime.readRunEvents({ projectId, workVersionId, sessionId, runId }) });
      return;
    }
    throw productError("Tianyi Agent 读取操作不存在。", 404);
  }
  if (request.method !== "POST") throw productError("Tianyi Agent 运行时只接受本地 GET/POST 请求。", 405);
  requireToken(request);
  const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
  const route = url.pathname.slice("/__local/story-studio/tianyi-agent/".length);
  if (route === "run/start") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "task", "currentPage", "contextRequest", "permissionProfile", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 201, { data: await tianyiAgentRuntime.startRun(body) });
    return;
  }
  if (route === "run/continue") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.continueRun(body) });
    return;
  }
  if (route === "run/stream") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "operationId"]);
    requireProject(body.projectId);
    const controller = new AbortController();
    const abortOnDisconnect = () => { if (!response.writableEnded) controller.abort(); };
    response.on("close", abortOnDisconnect);
    response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    try {
      const projection = await tianyiAgentRuntime.continueRun({ ...body, signal: controller.signal, async onEvent(event) { response.write(`${JSON.stringify({ type: "event", data: event })}\n`); } });
      response.write(`${JSON.stringify({ type: "projection", data: projection })}\n`);
    } catch (error) {
      response.write(`${JSON.stringify({ type: "error", error: publicErrorMessage(error) })}\n`);
    } finally {
      response.off("close", abortOnDisconnect);
      response.end();
    }
    return;
  }
  if (route === "run/approve") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "stepId", "operationId"]);
    const project = requireProject(body.projectId);
    recordAuthorInitiatedAction(project.id, "read-context", "tianyi-agent-step", [body.runId, body.stepId], "author");
    sendJson(response, 200, { data: await tianyiAgentRuntime.approveStep(body) });
    return;
  }
  if (route === "run/reject") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "stepId", "reason", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.rejectStep(body) });
    return;
  }
  if (route === "run/steer") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "instruction", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.steerRun(body) });
    return;
  }
  if (route === "run/pause") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.pauseRun(body) });
    return;
  }
  if (route === "run/resume") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.resumeRun(body) });
    return;
  }
  if (route === "run/cancel") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "reason", "operationId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.cancelRun(body) });
    return;
  }
  if (route === "run/recover") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId"]);
    requireProject(body.projectId);
    sendJson(response, 200, { data: await tianyiAgentRuntime.recoverRun(body) });
    return;
  }
  if (route === "candidate/handoff") {
    requireAllowedKeys(body, ["projectId", "workVersionId", "sessionId", "runId", "candidateId", "operationId"]);
    const project = requireProject(body.projectId);
    recordAuthorInitiatedAction(project.id, "library-write", "tianyi-agent-candidate", [body.candidateId], "author");
    try {
      sendJson(response, 200, { data: await tianyiAgentRuntime.handoffCandidate(body) });
    } catch (error) {
      if (error instanceof Error && error.message.includes("没有安全的现有资料 Owner")) {
        throw productError(error.message, 409);
      }
      throw error;
    }
    return;
  }
  throw productError("Tianyi Agent 运行操作不存在。", 404);
}

async function handleTianyiRequest(request, response, url) {
  requireToken(request);
  requireSameOrigin(request);
  if (request.method !== "POST") throw productError("天意连续性操作只接受受保护的本地 POST 请求。", 405);
  const body = await readJsonBody(request, MAX_CONTINUITY_JSON_BODY_BYTES);
  const route = url.pathname.slice("/__local/story-studio/tianyi/".length);
  const routes = {
    "identity": [["projectId"], () => tianyi.getTianyiIdentity(body)],
    "project-resume": [["projectId", "agentId"], () => tianyi.getTianyiProjectResume(body)],
    "context-projection": [["projectId", "contextRequest"], () => tianyi.getTianyiContextProjection(body)],
    "session/open": [["projectId", "operationId", "retentionMode"], () => tianyi.openTianyiSession(body)],
    "question": [["projectId", "sessionId", "operationId", "request", "contextRequest", "archiveMessageRefs"], () => tianyi.runTianyiQuestion(body)],
    "creative/capture": [["projectId", "sessionId", "operationId", "submissionId", "text", "collaborate"], () => tianyi.captureTianyiCreativeAuthorSource(body)],
    "creative/extract": [["projectId", "sessionId", "operationId", "source", "fixture"], () => tianyi.extractTianyiCreativeProjection(body)],
    "creative/projection": [["projectId", "sessionId"], () => tianyi.readTianyiCreativeProjection(body)],
    "creative/candidate/edit": [["projectId", "sessionId", "candidateId", "operationId", "expectedRevision", "title", "summary", "uncertainties"], () => tianyi.editTianyiCreativeCandidate(body)],
    "creative/candidate/decision": [["projectId", "sessionId", "candidateId", "operationId", "decision"], () => tianyi.decideTianyiCreativeCandidate(body)],
    "creative/candidate/handoff": [["projectId", "sessionId", "candidateId", "operationId"], () => handoffTianyiCreativeCandidate(body)],
    "creative/candidate/event-review": [["projectId", "sessionId", "candidateId"], () => readTianyiCreativeEventReview(body)],
    "creative/candidate/event-review/begin-impact": [["projectId", "sessionId", "candidateId"], () => beginTianyiCreativeEventImpact(body)],
    "creative/candidate/event-review/reject": [["projectId", "sessionId", "candidateId"], () => rejectTianyiCreativeEvent(body)],
    "creative/candidate/event-review/confirm": [["projectId", "sessionId", "candidateId", "optionId"], () => confirmTianyiCreativeEvent(body)],
    "creative/pause": [["projectId", "sessionId", "operationId"], () => tianyi.pauseTianyiCreativeSession(body)],
    "creative/provider-unavailable": [["projectId", "sessionId", "operationId", "stage", "message"], () => tianyi.markTianyiCreativeProviderUnavailable(body)],
    "creative/recover": [["projectId", "sessionId", "operationId"], () => tianyi.recoverTianyiCreativeSession(body)],
    "creative/complete": [["projectId", "sessionId", "operationId"], () => tianyi.completeTianyiCreativeSession(body)],
    "session/prepare-close": [["projectId", "sessionId", "operationId", "contextRequest"], () => tianyi.prepareTianyiSessionClose(body)],
    "memory-candidate/review": [["projectId", "sessionId", "candidateId", "contextRequest"], () => tianyi.reviewTianyiMemoryCandidate(body)],
    "memory-candidate/decide": [["projectId", "sessionId", "candidateId", "operationId", "decision", "edits", "secondConfirmation", "createProjectGrant", "contextRequest"], () => tianyi.decideTianyiMemoryCandidate(body)],
    "stopping-point/decide": [["projectId", "sessionId", "candidateId", "operationId", "decision", "contextRequest"], () => tianyi.decideTianyiStoppingPointCandidate(body)],
    "session/finalize-close": [["projectId", "sessionId", "operationId"], () => tianyi.finalizeTianyiSessionClose(body)],
    "session/metadata": [["projectId", "sessionId"], () => tianyi.readTianyiSessionMetadata(body)],
    "session/events": [["projectId", "sessionId", "startSequence", "limit"], () => tianyi.readTianyiSessionEvents(body)],
    "session/retain-temporary": [["projectId", "sessionId", "eventIds", "operationId"], () => tianyi.retainTemporarySessionMessages(body)],
    "session/rollover": [["projectId", "sessionId", "operationId"], () => tianyi.rolloverTianyiSession(body)],
    "source-return": [["projectId", "sessionId", "targetSessionId", "targetEventId", "targetContentHash", "operationId"], () => tianyi.recordTianyiSourceReturn(body)],
    "session/hard-delete": [["projectId", "sessionId", "expectedHash", "operationId"], () => tianyi.hardDeleteTianyiSession(body)],
    "archive-message/hard-delete": [["projectId", "sessionId", "eventId", "expectedHash", "operationId"], () => tianyi.hardDeleteTianyiArchiveMessage(body)],
    "archive-recall/rebuild": [["projectId"], () => tianyi.rebuildTianyiArchiveRecall(body)],
    "archive-recall/search": [["projectId", "authorizedProjectIds", "query", "filters", "limit"], () => tianyi.searchTianyiArchiveRecall(body)],
    "archive-recall/invalidate": [["projectId"], () => tianyi.invalidateTianyiArchiveRecall(body)],
    "receipt/read": [["projectId", "receiptId", "contextRequest"], () => tianyi.readTianyiReceipt(body)],
    "receipt/list": [["projectId"], () => tianyi.listTianyiReceipts(body)],
    "stopping-point/list": [["projectId"], () => tianyi.listTianyiStoppingPoints(body)],
    "stopping-point/revoke": [["projectId", "stoppingPointId", "expectedHash", "operationId"], () => tianyi.revokeTianyiStoppingPoint(body)],
    "stopping-point/restore": [["projectId", "stoppingPointId", "expectedHash", "revisionId", "operationId"], () => tianyi.restoreTianyiStoppingPoint(body)],
    "stopping-point/hard-delete": [["projectId", "stoppingPointId", "expectedHash", "operationId"], () => tianyi.hardDeleteTianyiStoppingPoint(body)],
    "stopping-point/revisions": [["projectId", "stoppingPointId"], () => tianyi.listTianyiStoppingPointRevisions(body)],
    "tombstone/list": [["projectId"], () => tianyi.listTianyiTombstones(body)],
    "memory/read": [["projectId", "scope", "memoryId"], () => tianyi.readTianyiMemory(body)],
    "memory/list": [["projectId", "scope"], () => tianyi.listTianyiMemories(body)],
    "memory/edit": [["projectId", "scope", "memoryId", "expectedHash", "operationId", "statement", "kind", "sensitivity"], () => tianyi.editTianyiMemory(body)],
    "memory/revoke": [["projectId", "scope", "memoryId", "expectedHash", "operationId"], () => tianyi.revokeTianyiMemory(body)],
    "memory/restore": [["projectId", "scope", "memoryId", "expectedHash", "revisionId", "operationId"], () => tianyi.restoreTianyiMemory(body)],
    "memory/hard-delete": [["projectId", "scope", "memoryId", "expectedHash", "operationId"], () => tianyi.hardDeleteTianyiMemory(body)],
    "memory/revisions": [["projectId", "scope", "memoryId"], () => tianyi.listTianyiMemoryRevisions(body)],
    "memory/revision/preview": [["projectId", "scope", "memoryId", "revisionId"], () => tianyi.previewTianyiMemoryRevision(body)],
    "global-memory-grant/read": [["projectId", "memoryId"], () => tianyi.readTianyiGlobalMemoryGrant(body)],
    "global-memory-grant/list": [["projectId"], () => tianyi.listTianyiGlobalMemoryGrants(body)],
    "global-memory-grant/create": [["projectId", "memoryId", "memoryContentHash", "operationId"], () => tianyi.createTianyiGlobalMemoryGrant(body)],
    "global-memory-grant/revoke": [["projectId", "memoryId", "expectedHash", "operationId"], () => tianyi.revokeTianyiGlobalMemoryGrant(body)],
    "global-memory-grant/restore": [["projectId", "memoryId", "expectedHash", "revisionId", "operationId"], () => tianyi.restoreTianyiGlobalMemoryGrant(body)],
    "global-memory-grant/hard-delete": [["projectId", "memoryId", "expectedHash", "operationId"], () => tianyi.hardDeleteTianyiGlobalMemoryGrant(body)],
    "global-memory-grant/revisions": [["projectId", "memoryId"], () => tianyi.listTianyiGlobalMemoryGrantRevisions(body)],
    "global-memory-grant/revision/preview": [["projectId", "memoryId", "revisionId"], () => tianyi.previewTianyiGlobalMemoryGrantRevision(body)],
    "pack/export": [["projectId", "packId", "ownerKinds", "includePersonal", "includeSensitive", "sensitiveSecondConfirmation"], () => tianyi.exportTianyiPack(body)],
    "pack/stage": [["projectId", "sourcePackId", "importId"], () => tianyi.stageTianyiPack(body)]
  };
  const definition = routes[route];
  if (!definition) throw productError("天意连续性操作不存在。", 404);
  requireAllowedKeys(body, definition[0]);
  sendJson(response, 200, { data: await runAsyncProductOperation(definition[1]) });
}

async function handoffTianyiCreativeCandidate(body) {
  const project = requireProject(body.projectId);
  const projection = await tianyi.readTianyiCreativeProjection({ projectId: project.id, sessionId: body.sessionId });
  const candidate = projection?.candidates.find((item) => item.candidateId === body.candidateId);
  if (!candidate) throw productError("创意候选不存在。", 404);
  if (candidate.targetOwnerKind === "candidate-review" && candidate.kind === "event") {
    const input = { sessionId: body.sessionId, candidateId: body.candidateId };
    const prepared = tianyiCreativeEventPort.createCandidate(project.id, input, projection);
    const handedOff = candidate.ownerReceipt
      ? projection
      : (await tianyi.decideTianyiCreativeCandidate({
          projectId: project.id,
          sessionId: body.sessionId,
          candidateId: body.candidateId,
          operationId: body.operationId,
          decision: "handed-off",
          ownerReceipt: { owner: "candidate-review", id: prepared.review.id, revision: null }
        })).projection;
    return {
      projection: handedOff,
      ownerReceipt: { owner: "candidate-review", id: prepared.review.id, revision: null },
      eventReview: tianyiCreativeEventPort.state(project.id, input, handedOff)
    };
  }
  if (candidate.targetOwnerKind !== "agent-recognition-proposal") throw productError("该候选没有可用的现有 Agent/Object Owner；它会继续保留为待处理候选。", 409);
  const source = candidate.sourceRefs[0];
  if (!source || source.sessionId !== body.sessionId) throw productError("创意候选来源不属于当前 Session。", 409);
  if (candidate.ownerReceipt) return { projection, ownerReceipt: candidate.ownerReceipt };
  recordAuthorInitiatedAction(project.id, "review-write", "tianyi-creative-agent-proposal", [candidate.candidateId]);
  const objectKind = candidate.kind === "custom-agent" || candidate.kind === "organization" ? "custom_object" : candidate.kind;
  const workspacePath = path.join(rootPath, project.id);
  const proposals = await listAgentRecognitionProposals({ workspacePath, projectId: project.id });
  // A single author source can yield several candidates of the same owner kind.
  // Include the current candidate identity so one handoff cannot accidentally
  // reuse another candidate's durable owner proposal.
  const existing = proposals.find((item) => item.tianyiSessionId === body.sessionId && item.sourceEventId === source.eventId && item.objectKind === objectKind && item.suggestedName === candidate.title);
  const proposalResult = existing
    ? { created: false, proposal: existing }
    : await runAsyncProductOperation(() => createAgentRecognitionProposal({
      workspacePath,
      proposal: {
        projectId: project.id,
        storyId: `story.${project.id}`,
        tianyiSessionId: body.sessionId,
        sourceEventId: source.eventId,
        sourceReceiptId: source.eventId,
        sourceWorkspace: "tianyi",
        objectKind,
        suggestedName: candidate.title,
        suggestedFields: { summary: candidate.summary, sourceContentHash: source.contentHash, targetOwnerKind: candidate.targetOwnerKind },
        evidence: [{ sourceRef: `${source.sessionId}:${source.eventId}:${source.contentHash}`, excerpt: candidate.sourceExcerpt }],
        uncertainties: candidate.uncertainties,
        duplicateMatches: [],
        now: new Date().toISOString()
      }
    }));
  const handedOff = await tianyi.decideTianyiCreativeCandidate({
    projectId: project.id,
    sessionId: body.sessionId,
    candidateId: body.candidateId,
    operationId: body.operationId,
    decision: "handed-off",
    ownerReceipt: { owner: "agent-recognition-proposal", id: proposalResult.proposal.proposalId, revision: proposalResult.proposal.revision }
  });
  return { projection: handedOff.projection, ownerReceipt: { owner: "agent-recognition-proposal", id: proposalResult.proposal.proposalId, revision: proposalResult.proposal.revision } };
}

async function readTianyiCreativeEventReview(body) {
  const project = requireProject(body.projectId);
  const projection = await tianyi.readTianyiCreativeProjection({ projectId: project.id, sessionId: body.sessionId });
  return tianyiCreativeEventPort.state(project.id, { sessionId: body.sessionId, candidateId: body.candidateId }, projection);
}

async function beginTianyiCreativeEventImpact(body) {
  const project = requireProject(body.projectId);
  const input = { sessionId: body.sessionId, candidateId: body.candidateId };
  const projection = await tianyi.readTianyiCreativeProjection({ projectId: project.id, sessionId: body.sessionId });
  tianyiCreativeEventPort.beginImpact(project.id, input, projection);
  return tianyiCreativeEventPort.state(project.id, input, projection);
}

async function rejectTianyiCreativeEvent(body) {
  const project = requireProject(body.projectId);
  const input = { sessionId: body.sessionId, candidateId: body.candidateId };
  const projection = await tianyi.readTianyiCreativeProjection({ projectId: project.id, sessionId: body.sessionId });
  return tianyiCreativeEventPort.reject(project.id, input, projection);
}

async function confirmTianyiCreativeEvent(body) {
  const project = requireProject(body.projectId);
  const input = { sessionId: body.sessionId, candidateId: body.candidateId };
  const projection = await tianyi.readTianyiCreativeProjection({ projectId: project.id, sessionId: body.sessionId });
  return tianyiCreativeEventPort.confirm(project.id, input, projection, body.optionId);
}

function requireToken(request) {
  const localSession = readCookie(request, LOCAL_SESSION_COOKIE);
  if (secureEqual(localSessionSecret, localSession)) {
    requireSameOrigin(request);
    return;
  }
  const received = String(request.headers["x-world-os-local-control-token"] || "");
  if (controlToken && secureEqual(controlToken, received)) return;
  throw productError("无法访问当前故事位置，请重新授权。", 403);
}

async function readJsonBody(request, maximumBytes = MAX_JSON_BODY_BYTES) {
  const contentType = String(request.headers["content-type"] || "");
  if (!contentType.startsWith("application/json")) throw productError("请求格式不受支持。", 415);
  let source = "";
  for await (const chunk of request) {
    source += chunk;
    if (Buffer.byteLength(source) > maximumBytes) throw productError("请求内容过大。", 413);
  }
  try {
    const value = JSON.parse(source || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value;
  } catch {
    throw productError("请求内容无法读取。", 400);
  }
}

function requireSameOrigin(request) {
  const origin = String(request.headers.origin || "");
  if (!origin) return;
  const isLoopbackPreview = /^http:\/\/127\.0\.0\.1:\d{2,5}$/u.test(origin);
  if (origin !== `http://127.0.0.1:${port}` && !isLoopbackPreview) throw productError("请求来源不受支持。", 403);
}

function readCookie(request, name) {
  const source = String(request.headers.cookie || "");
  for (const part of source.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function secureEqual(expected, received) {
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function requireQueryValue(url, key) {
  const value = String(url.searchParams.get(key) || "").trim();
  if (!value) throw productError("请求缺少必要信息。", 400);
  return value;
}

function requireProject(projectId) {
  const normalizedId = String(projectId || "").trim();
  const project = operations.listProjects().find((candidate) => candidate.id === normalizedId);
  if (!project) throw productError("找不到这个故事项目。", 404);
  const projectPath = path.resolve(rootPath, project.id);
  if (path.dirname(projectPath) !== rootPath) throw productError("故事位置不受支持。", 400);
  return project;
}

function authorPath(targetPath) {
  const homePath = path.resolve(os.homedir());
  const normalized = path.resolve(targetPath);
  if (normalized === homePath) return "~";
  return normalized.startsWith(`${homePath}${path.sep}`) ? `~${normalized.slice(homePath.length)}` : normalized;
}

function requireAllowedKeys(value, allowedKeys) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length) throw productError("请求包含不支持的项目字段。", 400);
}

function requireBoundedModelText(value, label, maximumCharacters) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximumCharacters || /\0/.test(value)) {
    throw productError(`${label}无效。`, 400);
  }
  return value.trim();
}

function runProductOperation(operation) {
  try {
    return operation();
  } catch (error) {
    throw productError(error instanceof Error ? error.message : "项目操作无法完成。", 400);
  }
}

async function runAsyncProductOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    throw productError(error instanceof Error ? error.message : "天意连续性操作无法完成。", 400);
  }
}

function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(distRoot, relativePath);
  if (path.dirname(candidate) !== distRoot && !candidate.startsWith(`${distRoot}${path.sep}`)) {
    sendJson(response, 404, { error: "页面不存在。" });
    return;
  }
  const target = existsSync(candidate) && statSync(candidate).isFile() ? candidate : path.join(distRoot, "index.html");
  const extension = path.extname(target);
  response.writeHead(200, {
    "content-type": contentType(extension),
    "cache-control": extension === ".html" ? "no-store" : "public, max-age=3600",
    "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
  });
  createReadStream(target).pipe(response);
}

function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  response.end(body);
}

function sendSseEvent(response, event, payload) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function sanitizeModelStreamError(error) {
  if (error?.name === "ProviderGatewayError" && typeof error.message === "string") return error.message;
  if (error instanceof Error && error.message.startsWith("Provider answer failed grounded validation:")) {
    return `模型回答未通过来源与格式校验，未写入本次对话。${formatProviderDiagnostic(error.diagnostic)}`;
  }
  return sanitizeError(error);
}

function sanitizeError(error) {
  const status = Number(error?.statusCode || 500);
  const message = error instanceof Error ? error.message : "本地项目操作失败。";
  const withoutRoot = message.replaceAll(rootPath, "[本地项目]");
  if (status >= 500 && error?.name === "ProviderGatewayError") {
    return `${withoutRoot}${formatProviderDiagnostic(error.diagnostic)}`;
  }
  return status >= 500 ? "本地项目暂时无法处理。" : controlToken ? withoutRoot.replaceAll(controlToken, "[本地授权]") : withoutRoot;
}

function formatProviderDiagnostic(value) {
  if (!value || typeof value !== "object") return "";
  const stage = String(value.stage || "validation").slice(0, 40);
  const fieldPath = String(value.fieldPath || "$").slice(0, 120);
  const actual = String(value.actual || value.detail || "invalid").slice(0, 160);
  return `（${stage} · ${fieldPath} · ${actual}）`;
}

function productError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readConfiguredLivePriceUsd() {
  const inputUsdPerMillion = Number(process.env.SILICONFLOW_PRICE_USD_PER_MILLION_INPUT);
  const outputUsdPerMillion = Number(process.env.SILICONFLOW_PRICE_USD_PER_MILLION_OUTPUT);
  if (!Number.isFinite(inputUsdPerMillion) || !Number.isFinite(outputUsdPerMillion) || inputUsdPerMillion < 0 || outputUsdPerMillion < 0) return null;
  return { inputUsdPerMillion, outputUsdPerMillion };
}

function readConfiguredLivePilotFixtureProjectId() {
  const projectId = String(process.env.TIANYAN_LIVE_PILOT_FIXTURE_PROJECT_ID || "").trim();
  return /^[a-zA-Z0-9._:-]{1,180}$/u.test(projectId) ? projectId : "";
}

function contentType(extension) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" })[extension] || "application/octet-stream";
}
