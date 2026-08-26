import {
  buildTianyiBoundedSourceMaterial,
  TIANYI_MAX_RECEIPT_BYTES,
  type TianyiRawSourceMaterial
} from "./boundedSourceMaterial.ts";
import { CONTEXT_RECEIPT_V2_VERSION, CONTEXT_RECEIPT_VERSION, type ContextReceipt } from "./continuityTypes.ts";
import { normalizeContextReceipt, stableJson } from "./continuityValidation.ts";
import {
  TIANYI_FIXTURE_ADAPTER_ID,
  TIANYI_FIXTURE_ADAPTER_VERSION,
  assertRelationshipSafeCopy,
  normalizeTianyiRuntimeOutput,
  tianyiFixtureAdapter,
  type TianyiRuntimeAdapter,
  type TianyiRuntimeInput,
  type TianyiRuntimeOutput
} from "./tianyiFixtureAdapter.ts";
import type { TianyiContextProjection } from "./tianyiContextProjection.ts";

export type TianyiQuestionResult = {
  status: "current" | "stale" | "blocked";
  projectionFingerprint: string;
  currentProjectionFingerprint: string;
  currentVisibleResponse: string | null;
  visibleResponse: string;
  classifications: TianyiRuntimeOutput["classifications"];
  memoryCandidates: TianyiRuntimeOutput["memoryCandidates"];
  failure: TianyiRuntimeOutput["failure"];
  receipt: ContextReceipt;
};

export async function runTianyiDeterministicQuestion(input: {
  agentId: string;
  sessionId: string;
  receiptId: string;
  generationTimestamp: string;
  request: TianyiRuntimeInput["request"];
  buildProjection(): Promise<TianyiContextProjection>;
  readSourceMaterial(projection: TianyiContextProjection): Promise<TianyiRawSourceMaterial[]>;
  archiveMessages?: TianyiRuntimeInput["archiveMessages"];
  recheckArchiveMessages?(): Promise<TianyiRuntimeInput["archiveMessages"]>;
  localControlToken?: string;
  credentialCanaries?: string[];
  outputBudget?: TianyiRuntimeInput["outputBudget"];
  adapter?: TianyiRuntimeAdapter;
}): Promise<TianyiQuestionResult> {
  const projection = await input.buildProjection();
  const rawSources = await input.readSourceMaterial(projection);
  const sourceBundle = buildTianyiBoundedSourceMaterial({
    projection,
    sources: rawSources,
    localControlToken: input.localControlToken,
    credentialCanaries: input.credentialCanaries
  });
  const runtimeInput: TianyiRuntimeInput = {
    agent: {
      id: input.agentId,
      personaRevision: projection.persona.revision,
      relationshipPolicyRevision: projection.relationshipPolicy.revision
    },
    context: projection,
    sourceMaterials: sourceBundle.adapterSources,
    archiveMessages: structuredClone(input.archiveMessages ?? []),
    request: structuredClone(input.request),
    approvedMemoryRefs: projection.approvedMemoryRefs.map((memory) => ({ id: memory.id, contentHash: memory.contentHash })),
    enabledSkillRefs: structuredClone(projection.enabledSkillRefs),
    providerTransferDecision: "deny",
    outputBudget: input.outputBudget ?? { maxVisibleChars: 2_000, maxMemoryCandidates: 4 }
  };
  const adapter = input.adapter ?? tianyiFixtureAdapter;
  const output = normalizeTianyiRuntimeOutput(await adapter.run(runtimeInput), runtimeInput.outputBudget);
  validateRuntimeUse(output, runtimeInput);
  validateClassificationSemantics(output);
  assertRelationshipSafeCopy(output.visibleResponse);

  const currentProjection = await input.buildProjection();
  const currentArchiveMessages = input.recheckArchiveMessages ? await input.recheckArchiveMessages() : (input.archiveMessages ?? []);
  const changedDuringRun = projection.fingerprint !== currentProjection.fingerprint
    || stableJson(currentArchiveMessages) !== stableJson(input.archiveMessages ?? []);
  const stale = changedDuringRun || output.failure === "stale-context";
  const receipt = buildContextReceipt({
    receiptId: input.receiptId,
    sessionId: input.sessionId,
    agentId: input.agentId,
    generationTimestamp: input.generationTimestamp,
    projection,
    sourceBundle,
    output,
    archiveMessages: input.archiveMessages ?? [],
    stale
  });
  const status = stale ? "stale" : output.failure ? "blocked" : "current";
  return {
    status,
    projectionFingerprint: projection.fingerprint,
    currentProjectionFingerprint: currentProjection.fingerprint,
    currentVisibleResponse: status === "current" ? output.visibleResponse : null,
    visibleResponse: output.visibleResponse,
    classifications: structuredClone(output.classifications),
    memoryCandidates: structuredClone(output.memoryCandidates),
    failure: output.failure,
    receipt
  };
}

export function buildContextReceipt(input: {
  receiptId: string;
  sessionId: string;
  agentId: string;
  generationTimestamp: string;
  projection: TianyiContextProjection;
  sourceBundle: ReturnType<typeof buildTianyiBoundedSourceMaterial>;
  output: TianyiRuntimeOutput;
  archiveMessages: TianyiRuntimeInput["archiveMessages"];
  stale: boolean;
}): ContextReceipt {
  const sourceById = new Map(input.sourceBundle.adapterSources.map((source) => [source.id, source]));
  const sources = input.output.contextReceiptDraft.usedSourceIds.map((id) => {
    const source = sourceById.get(id);
    if (!source) throw new Error("Context Receipt references a source that the runtime did not receive.");
    return structuredClone(source);
  });
  const projectionExclusions = input.projection.sources
    .filter((source) => source.state !== "current" || source.exclusionReason)
    .map((source) => ({ id: source.id, reason: source.exclusionReason ?? `source-${source.state}` }));
  const excludedSources = dedupeExclusions([...input.sourceBundle.excludedSources, ...projectionExclusions]).slice(0, 64);
  const base = {
    id: input.receiptId,
    sessionId: input.sessionId,
    agentId: input.agentId,
    personaRevision: input.projection.persona.revision,
    relationshipPolicyRevision: input.projection.relationshipPolicy.revision,
    runtime: { mode: "deterministic", adapterId: TIANYI_FIXTURE_ADAPTER_ID, adapterVersion: TIANYI_FIXTURE_ADAPTER_VERSION },
    project: { id: input.projection.projectId, surface: input.projection.fingerprint },
    selection: structuredClone(input.projection.selection),
    sources,
    approvedMemoryIds: input.output.contextReceiptDraft.usedMemoryIds,
    enabledSkillRefs: input.projection.enabledSkillRefs.filter((ref) => input.output.contextReceiptDraft.usedSkillRefs.includes(`${ref.id}@${ref.version}`)),
    excludedSources,
    generationTimestamp: input.generationTimestamp,
    stale: input.stale,
    responseClassifications: input.output.classifications
  };
  const receipt = normalizeContextReceipt(input.archiveMessages.length > 0 ? {
    version: CONTEXT_RECEIPT_V2_VERSION,
    ...base,
    archiveMessageRefs: input.archiveMessages.map(({ excerpt: _excerpt, ...ref }) => ref)
  } : {
    version: CONTEXT_RECEIPT_VERSION,
    ...base
  });
  if (Buffer.byteLength(stableJson(receipt), "utf8") > TIANYI_MAX_RECEIPT_BYTES) throw new Error("Context Receipt exceeds its size limit.");
  return receipt;
}

export function deriveReceiptCurrentStatus(receipt: ContextReceipt, currentProjection: TianyiContextProjection): "current" | "stale" {
  if (receipt.stale) return "stale";
  return receipt.project.id === currentProjection.projectId && receipt.project.surface === currentProjection.fingerprint
    ? "current"
    : "stale";
}

function validateRuntimeUse(output: TianyiRuntimeOutput, input: TianyiRuntimeInput): void {
  const actualSources = input.sourceMaterials.map((source) => source.id);
  if (!sameArray(output.contextReceiptDraft.usedSourceIds, actualSources)) throw new Error("Runtime source use does not match the bounded source material.");
  const actualMemories = input.approvedMemoryRefs.map((memory) => memory.id);
  if (!sameArray(output.contextReceiptDraft.usedMemoryIds, actualMemories)) throw new Error("Runtime Memory use does not match approved Memory.");
  const actualSkills = input.enabledSkillRefs.map((skill) => `${skill.id}@${skill.version}`);
  if (!sameArray(output.contextReceiptDraft.usedSkillRefs, actualSkills)) throw new Error("Runtime Skill use does not match enabled Skills.");
  const actualArchiveMessages = input.archiveMessages.map((message) => message.eventId);
  if (!sameArray(output.contextReceiptDraft.usedArchiveMessageRefs, actualArchiveMessages)) throw new Error("Runtime Archive message use does not match selected Recall Results.");
  const allowedSourceIds = new Set([...actualSources, ...actualArchiveMessages]);
  for (const candidate of output.memoryCandidates) {
    if (candidate.sourceRefs.some((id) => !allowedSourceIds.has(id))) throw new Error("Memory candidate references an unused source.");
  }
}

function validateClassificationSemantics(output: TianyiRuntimeOutput): void {
  if (output.failure && !output.classifications.includes("unavailable-evidence")) throw new Error("Failed Tianyi responses require unavailable-evidence classification.");
  if (output.memoryCandidates.length > 0 && !output.classifications.includes("candidate-suggestion")) throw new Error("Memory candidates require candidate-suggestion classification.");
  if (output.failure && output.classifications.includes("confirmed-fact")) throw new Error("Unavailable evidence cannot be classified as confirmed fact.");
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function dedupeExclusions(values: Array<{ id: string; reason: string }>): Array<{ id: string; reason: string }> {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.id}:${value.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
