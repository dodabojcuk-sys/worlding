import { createHash } from "node:crypto";

import { providerGatewayError } from "./providerGatewayErrors.mjs";
import { assertGoldenLoopReceiptSourceBinding } from "./goldenLoopSourceBinding.mjs";
import {
  assertNuwaAttentionContextCurrent,
  executeNuwaPlanWithBackend
} from "../../../../src/storyIntelligence/index.ts";
import {
  LIVE_PROVIDER_PILOT_VERSION,
  buildLivePilotAuthorView,
  runLiveProviderPilot
} from "./liveProviderPilot.mjs";

const MAXIMUM_RETRIES_PER_STAGE = 1;

export async function runGoldenLoopOperation({ gateway, profileId, modelId, maxOutputTokens = 2_400, contextReceiptId, contextReceipt, nuwaOwner, context, documentSource, authorIntent, signal, executionMode = "legacy", attentionContext = null, priceUsd = null }) {
  if (!nuwaOwner?.plan || !nuwaOwner?.snapshot) throw new Error("Golden Loop requires the canonical Nuwa run owner.");
  if (!contextReceipt || contextReceipt.id !== contextReceiptId) throw new Error("Golden Loop requires its bound Context Receipt.");
  if (attentionContext) assertNuwaAttentionContextCurrent(attentionContext, nuwaOwner.snapshot.snapshotHash);
  const contextPack = buildGoldenLoopContextPack({ context, documentSource, authorIntent, contextReceipt, snapshot: nuwaOwner.snapshot, plan: nuwaOwner.plan });
  if (executionMode === "live-pilot-r2") {
    return runLiveGoldenLoopOperation({
      gateway,
      profileId,
      modelId,
      maxOutputTokens,
      contextReceiptId,
      contextReceipt,
      nuwaOwner,
      context,
      documentSource,
      authorIntent,
      signal,
      contextPack,
      attentionContext,
      priceUsd
    });
  }
  const sourceIds = contextPack.sources.map((source) => source.id);
  const tianyiCall = await runStructuredStage({
    gateway,
    profileId,
    signal,
    stage: "tianyi",
    system: TIANYI_SYSTEM_PROMPT,
    input: { contextPack },
    validate: (value) => validateTianyiAlignment(value, sourceIds)
  });
  const nuwaCall = await runStructuredStage({
    gateway,
    profileId,
    signal,
    stage: "nuwa",
    system: NUWA_SYSTEM_PROMPT,
    input: { contextPack, tianyi: tianyiCall.value },
    validate: (value) => validateNuwaSimulation(value, sourceIds)
  });
  const outcome = await executeNuwaPlanWithBackend({
    plan: nuwaOwner.plan,
    snapshot: nuwaOwner.snapshot,
    profile: "quality",
    signal,
    backend: createProviderImportBackend({
      profileId,
      modelId,
      simulation: nuwaCall.value
    })
  });
  return Object.freeze({
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack,
    contextReceiptId,
    nuwaRunId: nuwaOwner.plan.runId,
    tianyi: tianyiCall.value,
    nuwa: nuwaCall.value,
    provider: Object.freeze({
      profileId,
      calls: Object.freeze([...tianyiCall.calls, ...nuwaCall.calls])
    }),
    outcome
  });
}

async function runLiveGoldenLoopOperation(input) {
  const allowedSourceIds = input.contextPack.sources.map((source) => source.id);
  const allowedActorIds = [...new Set([
    ...(input.attentionContext?.participatingActors || []),
    ...(input.attentionContext?.actorKnowledge || []).map((actor) => actor.actorId),
    ...input.nuwaOwner.snapshot.notes.filter((note) => note.type === "character").map((note) => note.id),
    ...(input.context?.focus?.objectId ? [input.context.focus.objectId] : [])
  ])];
  const pilot = await runLiveProviderPilot({
    gateway: input.gateway,
    profileId: input.profileId,
    modelId: input.modelId,
    maxOutputTokens: input.maxOutputTokens,
    contextPack: input.contextPack,
    attentionContext: input.attentionContext,
    authorIntent: input.authorIntent,
    signal: input.signal,
    priceUsd: input.priceUsd,
    allowedSourceIds,
    allowedActorIds
  });
  const outcome = await executeNuwaPlanWithBackend({
    plan: input.nuwaOwner.plan,
    snapshot: input.nuwaOwner.snapshot,
    profile: "quality",
    signal: input.signal,
    backend: createProviderImportBackend({
      profileId: input.profileId,
      modelId: input.modelId,
      simulation: pilot.simulation
    })
  });
  const tianyi = buildLocalTianyiAlignment({ contextPack: input.contextPack, authorIntent: input.authorIntent });
  const liveCandidates = pilot.candidates.map((candidate, index) => ({
    id: `route-${index + 1}`,
    title: candidate.candidateTitle,
    change: candidate.directionSummary,
    after: candidate.shortTermEffects.join("；"),
    causes: candidate.causalChain.slice(0, 8),
    evidence: candidate.knowledgeCitations,
    affectedObjects: candidate.stateChanges.map((change) => change.targetId).slice(0, 10),
    uncertainty: candidate.uncertainties.join("；"),
    impact: candidate.longTermRisks.join("；"),
    risk: candidate.longTermRisks.join("；"),
    authorView: buildLivePilotAuthorView(candidate),
    live: {
      schemaVersion: candidate.schemaVersion,
      actorDecisions: candidate.actorDecisions,
      eventSequence: candidate.eventSequence,
      stateChanges: candidate.stateChanges,
      proposedNextBeat: candidate.proposedNextBeat,
      axis: pilot.axes[index]
    }
  }));
  return Object.freeze({
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack: input.contextPack,
    contextReceiptId: input.contextReceiptId,
    nuwaRunId: input.nuwaOwner.plan.runId,
    tianyi,
    nuwa: {
      ...pilot.simulation,
      candidates: Object.freeze(liveCandidates)
    },
    provider: Object.freeze({
      profileId: input.profileId,
      calls: Object.freeze(pilot.receipts.map((receipt) => ({
        stage: "nuwa",
        attempt: receipt.retryCount + 1,
        latencyMs: receipt.latencyMs,
        usage: receipt.usage,
        traceId: receipt.traceId
      }))),
      livePilot: Object.freeze({
        version: LIVE_PROVIDER_PILOT_VERSION,
        mode: pilot.mode,
        modelId: input.modelId,
        contextHash: pilot.contextHash,
        candidateCount: pilot.candidates.length,
        maxCalls: pilot.budget.maxCalls,
        maxCostUsd: pilot.budget.maxBudgetUsd,
        priceStatus: pilot.budget.priceStatus,
        seedSupport: pilot.seedSupport,
        axes: pilot.axes,
        retryCount: pilot.retryCount,
        divergence: pilot.divergence,
        receipts: pilot.receipts
      })
    }),
    outcome
  });
}

function buildLocalTianyiAlignment({ contextPack, authorIntent }) {
  const facts = contextPack.sources.slice(0, 10).map((source) => ({ statement: String(source.content).slice(0, 240), evidence: source.id }));
  const unknowns = [...contextPack.unknowns];
  return Object.freeze({
    version: "tianyan-tianyi-alignment/v1",
    facts,
    inferences: [],
    unknowns,
    suggestions: ["让女娲沿三条探索轴比较候选未来。"],
    simulationTask: {
      goal: String(authorIntent || "").trim(),
      mustPreserve: ["只使用 Context Receipt 纳入的来源。", "候选在作者确认前不得写入 Canon。"],
      questions: unknowns.length ? unknowns.slice(0, 8) : ["作者希望采用哪一条候选？"]
    }
  });
}

export function projectValidatedRunPackCandidates({ rawCandidates, runPack }) {
  const validatedBranches = runPack.results.flatMap((taskResult) => taskResult.proposedBranches);
  if (validatedBranches.length < 2) {
    throw new Error("Nuwa RunPack must retain at least two candidates for author comparison.");
  }
  return validatedBranches.map((branch, index) => {
    const raw = rawCandidates[index] || rawCandidates[0];
    if (!raw) throw new Error("Provider candidates are unavailable for the validated RunPack branch.");
    const affectedObjectIds = branch.affectedNoteRefs.flatMap((relativePath) => {
      const note = runPack.snapshot.notes.find((candidate) => candidate.relativePath === relativePath);
      return note ? [note.id] : [];
    });
    return {
      ...raw,
      id: branch.id,
      title: branch.title,
      change: branch.summary,
      after: branch.immediateConsequence,
      impact: branch.mediumTermConsequence,
      risk: branch.risks.map((risk) => risk.summary).join("；") || raw.risk,
      affectedObjects: affectedObjectIds.length > 0 ? affectedObjectIds : raw.affectedObjects
    };
  });
}

export function recoverGoldenLoopResultFromRunPack({ profileId, contextReceipt, runPack, context, documentSource, authorIntent }) {
  if (!runPack.bundle) throw new Error("Nuwa RunPack has no validated prediction bundle to recover.");
  const contextPack = buildGoldenLoopContextPack({
    context,
    documentSource,
    authorIntent,
    contextReceipt,
    snapshot: runPack.snapshot,
    plan: runPack.run.plan
  });
  const branches = runPack.results.flatMap((taskResult) => taskResult.proposedBranches);
  const rawCandidates = branches.map((branch) => ({
    id: branch.id,
    title: branch.title,
    change: branch.summary,
    after: branch.immediateConsequence,
    causes: branch.assumptions.slice(0, 8),
    evidence: branch.evidenceIds.slice(0, 8),
    affectedObjects: branch.affectedNoteRefs.slice(0, 10),
    uncertainty: branch.assumptions[0] || "该候选仍需作者确认。",
    impact: branch.mediumTermConsequence,
    risk: branch.risks.map((risk) => risk.summary).join("；") || branch.longTermPressure
  }));
  const candidates = projectValidatedRunPackCandidates({ rawCandidates, runPack });
  const evidence = runPack.bundle.sharedEvidence;
  const unknowns = runPack.bundle.unsupportedAssumptions.slice(0, 8);
  return Object.freeze({
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack,
    contextReceiptId: contextReceipt.id,
    nuwaRunId: runPack.run.runId,
    tianyi: {
      version: "tianyan-tianyi-alignment/v1",
      facts: evidence.slice(0, 10).map((item) => ({ statement: item.excerpt, evidence: item.evidenceId })),
      inferences: runPack.bundle.branches.map((branch) => branch.summary).slice(0, 8),
      unknowns,
      suggestions: candidates.map((candidate) => candidate.title).slice(0, 8),
      simulationTask: {
        goal: authorIntent,
        mustPreserve: ["只使用 Context Receipt 纳入的来源。", "候选在作者确认前不得写入 Canon。"],
        questions: unknowns.length > 0 ? unknowns : ["作者希望采用哪一条候选？"]
      }
    },
    nuwa: {
      version: "tianyan-nuwa-simulation/v1",
      knownFacts: evidence.map((item) => item.excerpt).slice(0, 12),
      assumptions: [...new Set(branches.flatMap((branch) => branch.assumptions))].slice(0, 10),
      causalSteps: branches.map((branch) => `${branch.summary} → ${branch.immediateConsequence}`).slice(0, 12),
      actorResponses: candidates.slice(0, 10).map((candidate) => ({ actor: context?.focus?.objectId || "当前故事角色", response: candidate.after })),
      conflicts: branches.flatMap((branch) => branch.risks.map((risk) => risk.summary)).slice(0, 8),
      unknowns,
      candidates
    },
    provider: {
      profileId,
      calls: [
        { stage: "tianyi", attempt: 1, latencyMs: 0, usage: null, traceId: null },
        { stage: "nuwa", attempt: 1, latencyMs: 0, usage: null, traceId: null }
      ]
    }
  });
}

function createProviderImportBackend({ profileId, modelId, simulation }) {
  const descriptor = Object.freeze({
    id: "external-run-pack",
    label: "SiliconFlow 真实模型（女娲运行包）",
    availability: "available",
    optInRequired: true,
    remoteExecution: true,
    supportsExport: false,
    implementationVersion: "siliconflow-golden-loop-adapter-v1",
    modelIdentity: modelId
  });
  return {
    descriptor,
    async executeTask({ plan, snapshot, task, context }) {
      return {
        taskId: task.taskId,
        role: task.role,
        status: "result-produced",
        taskHash: context.taskHash,
        result: providerSimulationToNuwaAgentResult({ plan, snapshot, task, simulation }),
        attempts: 1,
        requirement: task.requirement,
        cacheHit: false,
        validationStatus: "pending",
        diagnostic: `Imported from ${profileId}.`
      };
    }
  };
}

function providerSimulationToNuwaAgentResult({ plan, snapshot, task, simulation }) {
  const allowedNotes = snapshot.notes.filter((note) => task.allowedNoteRefs.includes(note.relativePath));
  const evidenceById = new Map(allowedNotes.map((note) => [`snapshot-evidence-${note.id}`, note]));
  const usedEvidenceIds = [...new Set(simulation.candidates.flatMap((candidate) => candidate.evidence))]
    .filter((id) => evidenceById.has(id))
    .slice(0, task.maximumEvidenceExcerpts);
  const fallbackEvidenceId = evidenceById.keys().next().value;
  const evidenceIds = usedEvidenceIds.length > 0 ? usedEvidenceIds : fallbackEvidenceId ? [fallbackEvidenceId] : [];
  const evidence = evidenceIds.map((evidenceId) => {
    const note = evidenceById.get(evidenceId);
    return {
      evidenceId,
      noteId: note.id,
      relativePath: note.relativePath,
      title: note.title,
      excerpt: note.evidenceExcerpt,
      noteType: note.type
    };
  });
  const proposals = simulation.candidates.slice(0, task.maximumBranchProposals).map((candidate, index) => {
    const candidateEvidence = candidate.evidence.filter((id) => evidenceIds.includes(id));
    const affectedNoteRefs = candidate.affectedObjects.flatMap((reference) => {
      const note = snapshot.notes.find((item) => item.id === reference || item.relativePath === reference || item.title === reference);
      return note && task.allowedNoteRefs.includes(note.relativePath) ? [note.relativePath] : [];
    });
    return {
      id: `${task.taskId}-provider-branch-${index + 1}`,
      strategy: "custom",
      title: candidate.title,
      summary: candidate.change,
      immediateConsequence: candidate.after,
      mediumTermConsequence: candidate.impact,
      longTermPressure: candidate.risk,
      affectedNoteRefs: affectedNoteRefs.length > 0 ? [...new Set(affectedNoteRefs)] : task.allowedNoteRefs.slice(0, 1),
      preservedMysteries: simulation.unknowns.slice(0, 4),
      risks: [{ id: `${task.taskId}-risk-${index + 1}`, level: "medium", summary: candidate.risk, evidenceIds: candidateEvidence }],
      evidenceIds: candidateEvidence.length > 0 ? candidateEvidence : evidenceIds,
      assumptions: [...new Set([candidate.uncertainty, ...simulation.assumptions])].slice(0, 8),
      sourceRole: task.role
    };
  });
  return {
    version: "world-os-nuwa-agent-result-v1",
    runId: plan.runId,
    snapshotHash: snapshot.snapshotHash,
    taskId: task.taskId,
    role: task.role,
    findings: proposals.map((proposal, index) => ({
      id: `${task.taskId}-finding-${index + 1}`,
      category: task.role === "evidence-critic" ? "evidence" : task.role === "character-arc" ? "character" : task.role,
      summary: proposal.summary,
      affectedNoteRefs: proposal.affectedNoteRefs,
      evidenceIds: proposal.evidenceIds,
      support: proposal.evidenceIds.length > 0 ? "supported" : "unsupported"
    })),
    proposedBranches: proposals,
    risks: proposals.flatMap((proposal) => proposal.risks),
    evidence,
    unsupportedAssumptions: simulation.unknowns,
    confidence: evidence.length > 0 ? "medium" : "low",
    writeScope: "none"
  };
}

async function runStructuredStage(input) {
  const calls = [];
  let previousFailure = "";
  for (let attempt = 1; attempt <= MAXIMUM_RETRIES_PER_STAGE + 1; attempt += 1) {
    const startedAt = Date.now();
    const stream = await input.gateway.openChatStream({
      profileId: input.profileId,
      responseFormat: "json-object",
      signal: input.signal,
      idempotencyKey: `golden-loop.${input.input?.contextPack?.id || "context"}.${input.stage}.${attempt}`,
      budgetScope: `golden-loop:${input.stage}`,
      retry: attempt > 1,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: JSON.stringify(input.input) },
        ...(previousFailure ? [{ role: "user", content: `上次输出未通过校验：${previousFailure}。只返回修正后的完整 JSON。` }] : [])
      ]
    });
    let text = "";
    let usage = null;
    for await (const event of stream.events) {
      if (event.type !== "chunk") continue;
      text += event.text;
      if (event.usage) usage = event.usage;
    }
    const call = Object.freeze({ stage: input.stage, attempt, latencyMs: Date.now() - startedAt, usage, traceId: stream.traceId || null });
    calls.push(call);
    try {
      const parsed = JSON.parse(extractProviderJsonObject(text));
      return Object.freeze({ value: input.validate(parsed), calls: Object.freeze(calls) });
    } catch (error) {
      previousFailure = safeValidationMessage(error);
      if (attempt > MAXIMUM_RETRIES_PER_STAGE) {
        const failure = providerGatewayError("invalid-response");
        failure.diagnostic = Object.freeze({ stage: input.stage, attempt, detail: previousFailure });
        throw failure;
      }
    }
  }
  throw providerGatewayError("invalid-response");
}

export function validateTianyiAlignment(value, allowedSourceIds = null) {
  const record = exactObject(value, ["version", "facts", "inferences", "unknowns", "suggestions", "simulationTask"], "Tianyi alignment");
  literal(record.version, "tianyan-tianyi-alignment/v1", "Tianyi version");
  const result = {
    version: record.version,
    facts: boundedArray(record.facts, 1, 10, "facts").map((item) => {
      const fact = exactObject(item, ["statement", "evidence"], "fact");
      const evidence = text(fact.evidence, 240, "fact evidence");
      if (allowedSourceIds && !allowedSourceIds.includes(evidence)) throw new TypeError(`fact.evidence source id is unavailable: ${evidence}`);
      return Object.freeze({ statement: text(fact.statement, 240, "fact statement"), evidence });
    }),
    inferences: stringArray(record.inferences, 0, 8, 240, "inferences"),
    unknowns: stringArray(record.unknowns, 0, 8, 240, "unknowns"),
    suggestions: stringArray(record.suggestions, 1, 8, 240, "suggestions"),
    simulationTask: validateSimulationTask(record.simulationTask)
  };
  return deepFreeze(result);
}

export function validateNuwaSimulation(value, allowedSourceIds = null) {
  const record = exactObject(value, ["version", "knownFacts", "assumptions", "causalSteps", "actorResponses", "conflicts", "unknowns", "candidates"], "Nuwa simulation");
  literal(record.version, "tianyan-nuwa-simulation/v1", "Nuwa version");
  const candidates = boundedArray(record.candidates, 2, 4, "candidates").map((item) => {
    const candidate = exactObject(item, ["id", "title", "change", "after", "causes", "evidence", "affectedObjects", "uncertainty", "impact", "risk"], "candidate");
    const id = text(candidate.id, 48, "candidate id");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new TypeError("candidate id must use lowercase letters, digits, and hyphens");
    return Object.freeze({
      id,
      title: text(candidate.title, 100, "candidate title"),
      change: text(candidate.change, 600, "candidate change"),
      after: text(candidate.after, 600, "candidate after"),
      causes: stringArray(candidate.causes, 1, 8, 240, "candidate causes"),
      evidence: sourceIdArray(candidate.evidence, allowedSourceIds, "candidate evidence"),
      affectedObjects: stringArray(candidate.affectedObjects, 1, 10, 100, "affected objects"),
      uncertainty: text(candidate.uncertainty, 240, "candidate uncertainty"),
      impact: text(candidate.impact, 400, "candidate impact"),
      risk: text(candidate.risk, 400, "candidate risk")
    });
  });
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) throw new TypeError("candidate ids must be unique");
  return deepFreeze({
    version: record.version,
    knownFacts: stringArray(record.knownFacts, 1, 12, 240, "known facts"),
    assumptions: stringArray(record.assumptions, 1, 10, 240, "assumptions"),
    causalSteps: stringArray(record.causalSteps, 2, 12, 300, "causal steps"),
    actorResponses: boundedArray(record.actorResponses, 1, 10, "actor responses").map((item) => {
      const response = exactObject(item, ["actor", "response"], "actor response");
      return Object.freeze({ actor: text(response.actor, 100, "actor"), response: text(response.response, 320, "actor response") });
    }),
    conflicts: stringArray(record.conflicts, 0, 8, 240, "conflicts"),
    unknowns: stringArray(record.unknowns, 0, 8, 240, "unknowns"),
    candidates
  });
}

function validateSimulationTask(value) {
  const task = exactObject(value, ["goal", "mustPreserve", "questions"], "simulation task");
  return Object.freeze({
    goal: text(task.goal, 500, "simulation goal"),
    mustPreserve: stringArray(task.mustPreserve, 1, 10, 240, "must preserve"),
    questions: stringArray(task.questions, 1, 8, 240, "simulation questions")
  });
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} fields are invalid`);
  return value;
}

function boundedArray(value, minimum, maximum, label) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new TypeError(`${label} must contain ${minimum}..${maximum} items`);
  return value;
}

function stringArray(value, minimum, maximum, maximumCharacters, label) {
  const items = boundedArray(value, minimum, maximum, label).map((item) => text(item, maximumCharacters, label));
  if (new Set(items).size !== items.length) throw new TypeError(`${label} must not contain duplicates`);
  return Object.freeze(items);
}

function sourceIdArray(value, allowedSourceIds, label) {
  const items = stringArray(value, 1, 8, 240, label);
  if (allowedSourceIds) {
    const unavailable = items.filter((item) => !allowedSourceIds.includes(item));
    if (unavailable.length) throw new TypeError(`${label} source ids are unavailable: ${unavailable.join(", ")}`);
  }
  return items;
}

function text(value, maximumCharacters, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximumCharacters) throw new TypeError(`${label} is invalid`);
  return value.trim();
}

function literal(value, expected, label) {
  if (value !== expected) throw new TypeError(`${label} is invalid`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function safeValidationMessage(error) {
  return error instanceof Error ? error.message.slice(0, 180) : "结构无效";
}

function extractProviderJsonObject(source) {
  const trimmed = String(source || "").trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1]?.trim();
  if (fenced?.startsWith("{")) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export function buildGoldenLoopContextPack({ context, documentSource, authorIntent, contextReceipt, snapshot, plan }) {
  const sourceBinding = assertGoldenLoopReceiptSourceBinding(contextReceipt, documentSource);
  const allowedPaths = new Set(plan.tasks.flatMap((task) => task.allowedNoteRefs));
  const receiptOwnerIds = new Set(contextReceipt.sources.map((source) => source.ownerId));
  const sourceCandidates = snapshot.notes
    .filter((note) => allowedPaths.has(note.relativePath) && receiptOwnerIds.has(note.id))
    .map((note) => ({
      id: `snapshot-evidence-${note.id}`,
      type: note.type,
      label: note.title,
      content: note.id === sourceBinding.documentId
        ? documentSource.content
        : note.evidenceExcerpt
    }));
  const seen = new Set();
  const sources = sourceCandidates.filter((source) => {
    if (!source.content || seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  }).slice(0, 12);
  if (!sources.some((source) => source.id === `snapshot-evidence-${sourceBinding.documentId}` && source.content === documentSource.content)) {
    throw new Error("Golden Loop Receipt-bound document source is unavailable from the canonical RunPack snapshot.");
  }
  const budgets = Object.freeze({ maximumSources: 12, maximumCharacters: 8_000 });
  const material = JSON.stringify({ projectId: context?.project?.id || "project", sourceBinding, sources, authorIntent: String(authorIntent || "").trim(), budgets });
  return deepFreeze({
    version: "tianyan-golden-loop-context-pack/v1",
    id: `context-pack-${createHash("sha256").update(material).digest("hex").slice(0, 16)}`,
    contextReceiptId: contextReceipt.id,
    sourceBinding,
    project: context?.project || null,
    authorIntent: String(authorIntent || "").trim().slice(0, 2_000),
    sources,
    unknowns: ["未包含在本 Context Pack 中的世界信息不得被当作事实。"],
    budgets,
    excluded: [
      ...contextReceipt.excludedSources,
      ...sourceCandidates.slice(12).map((source) => ({ id: source.id, reason: "source-budget" }))
    ].slice(0, 32)
  });
}

function stableSegment(value) {
  const normalized = String(value || "unknown").normalize("NFC").replace(/[^\p{L}\p{N}._:-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 100);
  return normalized || "unknown";
}

const TIANYI_SYSTEM_PROMPT = `你是天衍产品中的天意。你只做作者意图理解和证据对齐，不做世界决定，不写 Canon。输入只有一个有界 contextPack；facts[].evidence 必须逐字使用 contextPack.sources[].id 中的一个 ID。只返回 JSON：
{"version":"tianyan-tianyi-alignment/v1","facts":[{"statement":"...","evidence":"..."}],"inferences":["..."],"unknowns":["..."],"suggestions":["..."],"simulationTask":{"goal":"...","mustPreserve":["..."],"questions":["..."]}}
事实必须能指向输入证据；推测必须放在 inferences；缺失信息必须放在 unknowns。不要把 evidence 写成解释文字。`;

const NUWA_SYSTEM_PROMPT = `你是天衍产品中的女娲，是有边界的世界模拟器，不是聊天助手。你不能替作者决定，也不能写 Canon。输入只有天意对齐结果和同一个有界 contextPack；candidates[].evidence 的每个值必须逐字使用 contextPack.sources[].id。只返回 JSON：
{"version":"tianyan-nuwa-simulation/v1","knownFacts":["..."],"assumptions":["..."],"causalSteps":["...","..."],"actorResponses":[{"actor":"...","response":"..."}],"conflicts":["..."],"unknowns":["..."],"candidates":[{"id":"route-1","title":"...","change":"...","after":"...","causes":["..."],"evidence":["..."],"affectedObjects":["..."],"uncertainty":"...","impact":"...","risk":"..."}]}
返回 2 到 4 条真正不同的候选未来。每条都必须有因果、证据、影响对象、不确定性、影响和风险。`;
