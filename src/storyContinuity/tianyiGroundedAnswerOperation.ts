import {
  appendSessionEvent,
  readSession
} from "./interactionArchiveRepository.ts";
import {
  allocateReceiptId,
  createReceipt,
  listReceiptMetadata,
  readReceipt
} from "./receiptStoppingRepositories.ts";
import {
  CONTEXT_RECEIPT_V5_VERSION,
  INTERACTION_EVENT_VERSION,
  type ContextReceiptV5,
  type InteractionEvent,
  type TianyiResponseClassification
} from "./continuityTypes.ts";
import {
  normalizeContextReceipt,
  normalizeTianyiIdentitySnapshot,
  sha256,
  stableJson
} from "./continuityValidation.ts";
import {
  normalizeTianyiGroundedContextRequest,
  serializeTianyiGroundedProviderSources,
  type TianyiCompiledGroundedContext,
  type TianyiGroundedContextRequest,
  type TianyiGroundedSourceManifest,
  type TianyiGroundedSourceManifestEntry
} from "./tianyiGroundedContextGate.ts";
import {
  describeTianyiGroundedValidationFailure,
  parseAndNormalizeTianyiGroundedAnswer,
  type TianyiGroundedAnswer,
  type TianyiGroundedValidationDiagnostic
} from "./tianyiGroundedAnswer.ts";
import {
  ensureTianyiIdentityReady,
  type TianyiIdentitySnapshot
} from "./tianyiIdentityReadiness.ts";
import { ContinuityError, type ContinuityReadResult } from "./continuityTypes.ts";
import type { ContinuityContext } from "./continuityFilesystem.ts";

const QUESTION_VERSION = "tianyi-grounded-question-operation/v3" as const;
const RESPONSE_VERSION = "tianyi-grounded-response-operation/v3" as const;
const ATTEMPT_STATE_VERSION = "tianyi-grounded-attempt-state/v1" as const;
const ATTEMPT_KEY_VERSION = "story-tianyi-question-attempt-key/v1" as const;
const INTENT_VERSION = "story-tianyi-request-intent/v1" as const;

export type TianyiGroundedModelStreamEvent = {
  type: "chunk" | "done";
  text?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
};

export type TianyiGroundedModelGateway = {
  metadata(): {
    profiles: Array<{ id: string; providerId: string; modelId: string }>;
    providers?: Array<{ id: string; configured?: boolean }>;
  };
  openChatStream(input: {
    profileId: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    responseFormat: "json-object";
    signal?: AbortSignal;
    idempotencyKey?: string;
    budgetScope?: string;
    toolLoopTurn?: boolean;
    retry?: boolean;
    authorizationReceiptId?: string | null;
  }): Promise<{ events: AsyncIterable<TianyiGroundedModelStreamEvent> }>;
};

export type TianyiGroundedAttemptState =
  | "PREPARED"
  | "PROVIDER_UNCERTAIN"
  | "RESULT_STAGED"
  | "RECEIPT_COMMITTED_UNACKNOWLEDGED"
  | "COMPLETED";

export type TianyiGroundedAnswerOperation = {
  status: "current" | "partial";
  partialState: TianyiGroundedAttemptState;
  retryRequired: boolean;
  sessionId: string;
  submissionId: string;
  questionAttemptKey: string;
  authorMessageId: string;
  responseMessageId: string | null;
  receiptId: string;
  answer: TianyiGroundedAnswer | null;
  sourceManifest: TianyiGroundedSourceManifest;
  includedSources: TianyiGroundedSourceManifestEntry[];
  excludedSources: TianyiGroundedSourceManifestEntry[];
  attemptCount: number;
  providerDispatchCount: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  alreadyCompleted: boolean;
};

export type TianyiGroundedFaultMilestone =
  | "after-identity-snapshot"
  | "before-receipt-reservation"
  | "after-receipt-reservation"
  | "before-author-append"
  | "after-author-prepared"
  | "before-provider-dispatch"
  | "after-provider-result"
  | "before-result-staged"
  | "after-result-staged"
  | "before-receipt-commit"
  | "after-receipt-committed"
  | "before-assistant-append"
  | "after-assistant-appended"
  | "after-completed-state";

type ArchivedQuestion = {
  version: typeof QUESTION_VERSION;
  request: { authorQuery: string };
  profileId: string;
  receiptId: string;
  contextRequest: TianyiGroundedContextRequest;
  manifestDigest: string;
  submissionId: string;
  questionAttemptKey: string;
  requestIntentHash: string;
  identitySnapshot: TianyiIdentitySnapshot;
  authorMessageId: string;
  responseMessageId: string;
  initialOperationId: string;
};

type AttemptStateRecord = {
  version: typeof ATTEMPT_STATE_VERSION;
  questionAttemptKey: string;
  state: TianyiGroundedAttemptState;
  providerDispatchCount: number;
  answer: TianyiGroundedAnswer | null;
  usage: TianyiGroundedAnswerOperation["usage"];
  resultDigest: string | null;
};

export class TianyiGroundedRecoveryError extends ContinuityError {
  constructor(code: "QUESTION_ATTEMPT_MISMATCH" | "PROVIDER_OUTCOME_UNKNOWN" | "ATTEMPT_CONFLICT", message: string) {
    super(code, message);
    this.name = "TianyiGroundedRecoveryError";
  }
}

/**
 * A retained grounded question uses one existing Session as its durable
 * recovery log. Provider delivery is intentionally at-least-once after an
 * explicit retry; local author/assistant/Receipt finalization is deduplicated.
 */
export function createTianyiGroundedAnswerOperations(dependencies: {
  rootPath: string;
  agentId: string;
  gateway: TianyiGroundedModelGateway;
  now?: () => string;
  compileGroundedContext(request: TianyiGroundedContextRequest): Promise<TianyiCompiledGroundedContext>;
  onFaultMilestone?(milestone: TianyiGroundedFaultMilestone, questionAttemptKey: string): void | Promise<void>;
}) {
  const now = dependencies.now ?? (() => new Date().toISOString());

  async function runTianyiGroundedAnswer(input: {
    operationId: string;
    submissionId: string;
    explicitRetry?: boolean;
    profileId: string;
    question: string;
    contextRequest: TianyiGroundedContextRequest;
    signal?: AbortSignal;
    onDraftChunk?(event: { attempt: number; text: string }): void;
  }): Promise<TianyiGroundedAnswerOperation> {
    const operationId = machineId(input.operationId, "Operation identifier");
    const submissionId = machineId(input.submissionId, "Submission identifier");
    const profileId = machineId(input.profileId, "Model profile identifier");
    const question = boundedText(input.question, "Author question", 4_000);
    const contextRequest = normalizeTianyiGroundedContextRequest(input.contextRequest);
    const profile = dependencies.gateway.metadata().profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("Selected model profile is unavailable.");

    // Context compilation is read-only and must fail before any Session or
    // Receipt material is allocated.
    const compiled = await dependencies.compileGroundedContext(contextRequest);
    if (stableJson(compiled.request) !== stableJson(contextRequest)) {
      throw new Error("Grounded Context Gate returned a different request.");
    }

    const projectContext = context(contextRequest.projectId);
    const sessionId = contextRequest.sessionId;
    const questionAttemptKey = deriveQuestionAttemptKey({
      projectId: contextRequest.projectId,
      agentId: dependencies.agentId,
      sessionId,
      submissionId
    });
    let session = await requireOpenSession(projectContext, sessionId);
    let archived = findArchivedQuestion(session.value, questionAttemptKey);
    let createdByThisInvocation = false;

    if (!archived) {
      const identitySnapshot = await ensureTianyiIdentityReady({
        rootPath: dependencies.rootPath,
        agentId: dependencies.agentId,
        projectId: contextRequest.projectId,
        recordedAt: timestamp(now())
      });
      await dependencies.onFaultMilestone?.("after-identity-snapshot", questionAttemptKey);
      const requestIntentHash = deriveRequestIntentHash({
        question,
        profileId,
        contextRequest,
        manifestDigest: compiled.manifest.digest,
        identitySnapshotDigest: identitySnapshot.digest
      });
      await dependencies.onFaultMilestone?.("before-receipt-reservation", questionAttemptKey);
      const receiptId = await allocateReceiptId(projectContext);
      await dependencies.onFaultMilestone?.("after-receipt-reservation", questionAttemptKey);
      const authorMessageId = stableEventId(questionAttemptKey, "author");
      const responseMessageId = stableEventId(questionAttemptKey, "assistant");
      const candidate: ArchivedQuestion = {
        version: QUESTION_VERSION,
        request: { authorQuery: question },
        profileId,
        receiptId,
        contextRequest,
        manifestDigest: compiled.manifest.digest,
        submissionId,
        questionAttemptKey,
        requestIntentHash,
        identitySnapshot,
        authorMessageId,
        responseMessageId,
        initialOperationId: operationId
      };
      const recordedAt = timestamp(now());
      const authorEvent = makeEvent({
        eventId: authorMessageId,
        sessionId,
        sequence: session.value.length + 1,
        type: "author-message",
        actor: "author",
        content: JSON.stringify(candidate),
        operationId,
        recordedAt
      });
      await dependencies.onFaultMilestone?.("before-author-append", questionAttemptKey);
      const appended = await appendSessionEvent(
        projectContext,
        sessionId,
        session.contentHash,
        authorEvent.sequence,
        authorEvent,
        { recordedAt, operationId }
      );
      if (appended.ok) {
        archived = candidate;
        session = appended.current;
        createdByThisInvocation = true;
        await dependencies.onFaultMilestone?.("after-author-prepared", questionAttemptKey);
        await appendAttemptState(projectContext, sessionId, operationId, {
          questionAttemptKey,
          state: "PREPARED",
          providerDispatchCount: 0,
          answer: null,
          usage: null,
          resultDigest: null
        }, timestamp(now()));
      } else {
        session = await requireOpenSession(projectContext, sessionId);
        archived = findArchivedQuestion(session.value, questionAttemptKey);
      }
    }

    if (!archived) throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Concurrent grounded attempt preparation did not converge.");
    assertSameQuestion(archived, {
      question,
      profileId,
      contextRequest,
      manifestDigest: compiled.manifest.digest,
      submissionId,
      questionAttemptKey
    });

    const expectedIntentHash = deriveRequestIntentHash({
      question,
      profileId,
      contextRequest,
      manifestDigest: compiled.manifest.digest,
      identitySnapshotDigest: archived.identitySnapshot.digest
    });
    if (archived.requestIntentHash !== expectedIntentHash) mismatch();

    session = await requireOpenSession(projectContext, sessionId);
    await assertUniqueAttemptArtifacts(projectContext, session.value, archived);
    const existingResponse = session.value.find((event) => event.eventId === archived.responseMessageId && event.type === "tianyi-response");
    if (existingResponse) {
      return completedResult(projectContext, archived, existingResponse, compiled.manifest, profile, true);
    }

    const staged = uniqueResultStaged(session.value, archived);
    if (staged) {
      return finalizeStagedResult(projectContext, archived, staged, compiled.manifest, profile, operationId);
    }

    if (!createdByThisInvocation && input.explicitRetry !== true) {
      throw new TianyiGroundedRecoveryError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "The prior Provider outcome is unknown. An explicit retry is required and may duplicate the upstream request."
      );
    }

    const currentIdentity = await ensureTianyiIdentityReady({
      rootPath: dependencies.rootPath,
      agentId: dependencies.agentId,
      projectId: contextRequest.projectId,
      recordedAt: timestamp(now())
    });
    if (currentIdentity.digest !== archived.identitySnapshot.digest) {
      throw new TianyiGroundedRecoveryError("QUESTION_ATTEMPT_MISMATCH", "Tianyi identity changed before Provider retry.");
    }

    const claimed = await claimProviderDispatch(
      projectContext,
      archived,
      operationId,
      createdByThisInvocation ? 1 : undefined
    );
    if (!claimed) {
      throw new TianyiGroundedRecoveryError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "Another invocation already claimed this Provider dispatch."
      );
    }

    const includedSourceRefs = compiled.manifest.included.map((entry) => entry.sourceKey);
    const excludedForAnswer = nonIncluded(compiled.manifest).map((entry) => ({
      sourceRef: entry.sourceKey,
      reason: entry.reasonCode as string
    }));
    const validationContext = { includedSourceRefs, excludedSources: excludedForAnswer };
    const messages = buildGroundedMessages(question, compiled);

    let answer: TianyiGroundedAnswer | null = null;
    let usage: TianyiGroundedAnswerOperation["usage"] = null;
    let validationError: unknown = null;
    let validationDiagnostic: TianyiGroundedValidationDiagnostic | null = null;
    let invocationAttempt = 0;
    let providerDispatchCount = claimed.providerDispatchCount;
    while (invocationAttempt < 2 && !answer) {
      invocationAttempt += 1;
      if (invocationAttempt === 2) {
        const repairClaim = await claimProviderDispatch(projectContext, archived, operationId, providerDispatchCount + 1);
        if (!repairClaim) {
          throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Grounded repair dispatch conflicted with another invocation.");
        }
        providerDispatchCount = repairClaim.providerDispatchCount;
      }
      const dispatchIdentity = await ensureTianyiIdentityReady({
        rootPath: dependencies.rootPath,
        agentId: dependencies.agentId,
        projectId: contextRequest.projectId,
        recordedAt: timestamp(now())
      });
      if (dispatchIdentity.digest !== archived.identitySnapshot.digest) {
        throw new TianyiGroundedRecoveryError("QUESTION_ATTEMPT_MISMATCH", "Tianyi identity changed before Provider dispatch.");
      }
      await dependencies.onFaultMilestone?.("before-provider-dispatch", questionAttemptKey);
      let raw = "";
      const attemptMessages = invocationAttempt === 1 ? messages : [
        ...messages,
        {
          role: "user" as const,
          content: [
            "The previous JSON was invalid. Return one corrected JSON object matching the schema and exact source sets. Do not add commentary.",
            `Sanitized validation diagnostic: ${JSON.stringify(validationDiagnostic)}`,
            `Allowed included source IDs: ${JSON.stringify(includedSourceRefs)}`,
            `Required excluded source entries: ${JSON.stringify(excludedForAnswer)}`
          ].join("\n")
        }
      ];
      const stream = await dependencies.gateway.openChatStream({
        profileId,
        messages: attemptMessages,
        responseFormat: "json-object",
        signal: input.signal,
        idempotencyKey: `tianyi-grounded.${questionAttemptKey}.${invocationAttempt}`,
        budgetScope: "tianyi-grounded-answer",
        retry: invocationAttempt > 1 || input.explicitRetry === true
      });
      for await (const event of stream.events) {
        if (event.type === "chunk" && event.text) {
          raw += event.text;
          input.onDraftChunk?.({ attempt: invocationAttempt, text: event.text });
        }
        if (event.usage) usage = event.usage;
      }
      await dependencies.onFaultMilestone?.("after-provider-result", questionAttemptKey);
      try {
        answer = parseAndNormalizeTianyiGroundedAnswer(raw, validationContext);
      } catch (error) {
        validationError = error;
        validationDiagnostic = describeTianyiGroundedValidationFailure(raw, validationContext, error);
      }
    }
    if (!answer) {
      const error = new Error(`Provider answer failed grounded validation: ${validationError instanceof Error ? validationError.message : "invalid response"}`);
      Object.assign(error, { diagnostic: validationDiagnostic });
      throw error;
    }

    await dependencies.onFaultMilestone?.("before-result-staged", questionAttemptKey);
    const stagedResult = await stageProviderResult(projectContext, archived, operationId, {
      answer,
      usage,
      providerDispatchCount
    });
    await dependencies.onFaultMilestone?.("after-result-staged", questionAttemptKey);
    return finalizeStagedResult(projectContext, archived, stagedResult, compiled.manifest, profile, operationId);
  }

  async function claimProviderDispatch(
    projectContext: ContinuityContext,
    archived: ArchivedQuestion,
    operationId: string,
    expectedNextDispatch?: number
  ): Promise<AttemptStateRecord | null> {
    for (let retry = 0; retry < 8; retry += 1) {
      const session = await requireOpenSession(projectContext, archived.contextRequest.sessionId);
      const states = attemptStates(session.value, archived.questionAttemptKey);
      const latest = states.at(-1) ?? preparedState(archived.questionAttemptKey);
      if (latest.state === "RESULT_STAGED" || latest.state === "RECEIPT_COMMITTED_UNACKNOWLEDGED" || latest.state === "COMPLETED") return null;
      const nextDispatch = latest.providerDispatchCount + 1;
      if (expectedNextDispatch !== undefined && nextDispatch !== expectedNextDispatch) return null;
      const next: AttemptStateRecord = {
        version: ATTEMPT_STATE_VERSION,
        questionAttemptKey: archived.questionAttemptKey,
        state: "PROVIDER_UNCERTAIN",
        providerDispatchCount: nextDispatch,
        answer: null,
        usage: null,
        resultDigest: null
      };
      const appended = await appendAttemptState(projectContext, archived.contextRequest.sessionId, operationId, next, timestamp(now()), session);
      if (appended) return next;
    }
    return null;
  }

  async function stageProviderResult(
    projectContext: ContinuityContext,
    archived: ArchivedQuestion,
    operationId: string,
    value: {
      answer: TianyiGroundedAnswer;
      usage: TianyiGroundedAnswerOperation["usage"];
      providerDispatchCount: number;
    }
  ): Promise<AttemptStateRecord> {
    const resultDigest = stagedResultDigest(value);
    for (let retry = 0; retry < 8; retry += 1) {
      const session = await requireOpenSession(projectContext, archived.contextRequest.sessionId);
      const prior = uniqueResultStaged(session.value, archived);
      if (prior) return prior;
      const next: AttemptStateRecord = {
        version: ATTEMPT_STATE_VERSION,
        questionAttemptKey: archived.questionAttemptKey,
        state: "RESULT_STAGED",
        providerDispatchCount: value.providerDispatchCount,
        answer: value.answer,
        usage: value.usage,
        resultDigest
      };
      const appended = await appendAttemptState(projectContext, archived.contextRequest.sessionId, operationId, next, timestamp(now()), session);
      if (appended) return next;
    }
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Validated Provider result could not be staged.");
  }

  async function finalizeStagedResult(
    projectContext: ContinuityContext,
    archived: ArchivedQuestion,
    staged: AttemptStateRecord,
    manifest: TianyiGroundedSourceManifest,
    profile: { id: string; providerId: string; modelId: string },
    operationId: string
  ): Promise<TianyiGroundedAnswerOperation> {
    assertValidStagedResult(staged, manifest);
    await assertUniqueAttemptArtifacts(
      projectContext,
      (await requireOpenSession(projectContext, archived.contextRequest.sessionId)).value,
      archived
    );
    const classifications = answerClassifications(staged.answer);
    const receipt = buildProviderReceipt({
      archived,
      profile,
      manifest,
      staged,
      generatedAt: timestamp(now()),
      classifications
    });
    const priorReceipt = await readReceipt(projectContext, archived.receiptId);
    if (!priorReceipt) {
      await dependencies.onFaultMilestone?.("before-receipt-commit", archived.questionAttemptKey);
      const receiptWrite = await createReceipt(projectContext, receipt, {
        source: "immutable-create",
        recordedAt: receipt.generationTimestamp,
        operationId: archived.initialOperationId
      });
      if (!receiptWrite.ok) {
        const raced = await readReceipt(projectContext, archived.receiptId);
        assertSameReceipt(raced, archived, staged, manifest, profile);
      }
    } else {
      assertSameReceipt(priorReceipt, archived, staged, manifest, profile);
    }
    await appendMonotonicState(projectContext, archived, operationId, {
      ...staged,
      state: "RECEIPT_COMMITTED_UNACKNOWLEDGED"
    }, timestamp(now()));
    await dependencies.onFaultMilestone?.("after-receipt-committed", archived.questionAttemptKey);

    for (let retry = 0; retry < 8; retry += 1) {
      const session = await requireOpenSession(projectContext, archived.contextRequest.sessionId);
      await assertUniqueAttemptArtifacts(projectContext, session.value, archived);
      const existing = session.value.find((event) => event.eventId === archived.responseMessageId && event.type === "tianyi-response");
      if (existing) return completedResult(projectContext, archived, existing, manifest, profile, true);
      const responseEvent = makeEvent({
        eventId: archived.responseMessageId,
        sessionId: archived.contextRequest.sessionId,
        sequence: session.value.length + 1,
        type: "tianyi-response",
        actor: "tianyi",
        content: JSON.stringify({
          version: RESPONSE_VERSION,
          visibleResponse: staged.answer.summary,
          answer: staged.answer,
          manifestDigest: manifest.digest,
          attemptCount: staged.providerDispatchCount,
          providerDispatchCount: staged.providerDispatchCount,
          usage: staged.usage,
          resultDigest: staged.resultDigest,
          questionAttemptKey: archived.questionAttemptKey
        }),
        responseClassifications: classifications,
        receiptId: archived.receiptId,
        operationId: archived.initialOperationId,
        recordedAt: timestamp(now())
      });
      await dependencies.onFaultMilestone?.("before-assistant-append", archived.questionAttemptKey);
      const responseWrite = await appendSessionEvent(
        projectContext,
        archived.contextRequest.sessionId,
        session.contentHash,
        responseEvent.sequence,
        responseEvent,
        { recordedAt: responseEvent.recordedAt, operationId: archived.initialOperationId }
      );
      if (!responseWrite.ok) continue;
      await dependencies.onFaultMilestone?.("after-assistant-appended", archived.questionAttemptKey);
      await appendMonotonicState(projectContext, archived, operationId, {
        ...staged,
        state: "COMPLETED"
      }, timestamp(now()));
      await dependencies.onFaultMilestone?.("after-completed-state", archived.questionAttemptKey);
      return asResult(archived, staged, manifest, responseEvent.eventId, false);
    }
    return asResult(archived, staged, manifest, null, false, "RECEIPT_COMMITTED_UNACKNOWLEDGED");
  }

  async function completedResult(
    projectContext: ContinuityContext,
    archived: ArchivedQuestion,
    response: InteractionEvent,
    manifest: TianyiGroundedSourceManifest,
    profile: { id: string; providerId: string; modelId: string },
    alreadyCompleted: boolean
  ): Promise<TianyiGroundedAnswerOperation> {
    const parsed = parseGroundedResponse(response.content);
    if (
      response.eventId !== archived.responseMessageId
      || response.sessionId !== archived.contextRequest.sessionId
      || response.receiptId !== archived.receiptId
      || response.operationId !== archived.initialOperationId
      || parsed.questionAttemptKey !== archived.questionAttemptKey
      || parsed.manifestDigest !== manifest.digest
      || parsed.visibleResponse !== parsed.answer.summary
    ) {
      throw new TianyiGroundedRecoveryError(
        "ATTEMPT_CONFLICT",
        "Existing assistant event does not match the grounded question attempt."
      );
    }
    const session = await requireOpenSession(projectContext, archived.contextRequest.sessionId);
    const staged = uniqueResultStaged(session.value, archived);
    if (!staged) {
      throw new TianyiGroundedRecoveryError(
        "ATTEMPT_CONFLICT",
        "Completed grounded response has no unique durable staged result."
      );
    }
    assertValidStagedResult(staged, manifest);
    const visibleResult = {
      answer: parsed.answer,
      usage: parsed.usage,
      providerDispatchCount: parsed.providerDispatchCount
    };
    assertValidResultPayload(visibleResult, manifest);
    const stagedPayload = stagedResultPayload(staged);
    const visibleDigest = stagedResultDigest(visibleResult);
    if (
      parsed.resultDigest !== visibleDigest
      || staged.resultDigest !== stagedResultDigest(stagedPayload)
      || visibleDigest !== staged.resultDigest
      || stableJson(visibleResult) !== stableJson(stagedPayload)
    ) {
      throw new TianyiGroundedRecoveryError(
        "ATTEMPT_CONFLICT",
        "Existing assistant result does not match the durable staged result."
      );
    }
    const receipt = await readReceipt(projectContext, archived.receiptId);
    assertSameReceipt(receipt, archived, staged, manifest, profile);
    return {
      ...asResult(archived, { ...staged, state: "COMPLETED" }, manifest, response.eventId, alreadyCompleted),
      alreadyCompleted
    };
  }

  function context(projectId: string): ContinuityContext {
    return { rootPath: dependencies.rootPath, agentId: dependencies.agentId, scope: "project", projectId };
  }

  return { runTianyiGroundedAnswer };
}

function buildGroundedMessages(question: string, compiled: TianyiCompiledGroundedContext) {
  const packetSources = serializeTianyiGroundedProviderSources(compiled);
  const excluded = nonIncluded(compiled.manifest);
  const schema = '{"summary":"string","claims":[{"statement":"string","status":"fact|candidate|inference|unknown","sourceRefs":["source-ref"],"uncertaintyReason":"string|null"}],"status":"fact|candidate|inference|unknown","sourceRefs":["source-ref"],"uncertaintyReason":"string|null","includedSources":["source-ref"],"excludedSources":[{"sourceRef":"source-ref","reason":"string"}]}';
  return [
    {
      role: "system" as const,
      content: [
        "You are Tianyi, Story Studio's grounded story-world interface.",
        "Answer in Chinese. Treat only the included source packet as evidence.",
        "Never invent missing evidence. A fact must cite at least one included source.",
        "Candidate and inference claims must state uncertainty. If necessary evidence is absent, answer unknown.",
        "Preserve explicit constraints and negations. Do not turn a conditional conclusion into an unconditional claim.",
        `Context manifest digest: ${compiled.manifest.digest}`,
        `Return exactly one JSON object with this schema: ${schema}`,
        "Every sourceRefs entry must copy one identifier exactly from the allowed included source IDs below. Do not paraphrase source IDs.",
        `includedSources must equal exactly: ${JSON.stringify(compiled.manifest.included.map((entry) => entry.sourceKey))}`,
        `excludedSources must equal exactly: ${JSON.stringify(excluded.map((entry) => ({ sourceRef: entry.sourceKey, reason: entry.reasonCode })))}`
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `作者问题：${question}`,
        "已授权证据：",
        ...packetSources.map(({ manifest, content }) => `--- SOURCE ${manifest.sourceKey} | ${manifest.sourceType} ---\n${content}`)
      ].join("\n\n")
    }
  ];
}

function buildProviderReceipt(input: {
  archived: ArchivedQuestion;
  profile: { id: string; providerId: string; modelId: string };
  manifest: TianyiGroundedSourceManifest;
  staged: AttemptStateRecord;
  generatedAt: string;
  classifications: TianyiResponseClassification[];
}): ContextReceiptV5 {
  return normalizeContextReceipt({
    version: CONTEXT_RECEIPT_V5_VERSION,
    id: input.archived.receiptId,
    sessionId: input.archived.contextRequest.sessionId,
    agentId: input.archived.identitySnapshot.agentId,
    personaRevision: input.archived.identitySnapshot.persona.declaredRevision,
    relationshipPolicyRevision: input.archived.identitySnapshot.relationshipPolicy.declaredRevision,
    runtime: {
      mode: "provider",
      providerId: input.profile.providerId,
      modelId: input.profile.modelId,
      profileId: input.profile.id
    },
    project: { id: input.manifest.request.projectId, surface: input.manifest.digest },
    selection: { documentId: null, objectId: null, timelinePointId: null },
    sources: input.manifest.included,
    sourceManifest: input.manifest,
    identitySnapshot: input.archived.identitySnapshot,
    questionAttempt: {
      version: "story-tianyi-question-attempt-ref/v1",
      submissionId: input.archived.submissionId,
      questionAttemptKey: input.archived.questionAttemptKey,
      requestIntentHash: input.archived.requestIntentHash,
      authorMessageId: input.archived.authorMessageId,
      responseMessageId: input.archived.responseMessageId,
      manifestDigest: input.manifest.digest,
      resultDigest: input.staged.resultDigest
    },
    approvedMemoryIds: input.manifest.included.filter((entry) => entry.sourceType === "memory").map((entry) => entry.sourceId),
    enabledSkillRefs: [],
    excludedSources: nonIncluded(input.manifest).map((entry) => ({ id: entry.sourceKey, reason: entry.reasonCode })),
    generationTimestamp: input.generatedAt,
    stale: false,
    responseClassifications: input.classifications
  }) as ContextReceiptV5;
}

async function appendAttemptState(
  projectContext: ContinuityContext,
  sessionId: string,
  operationId: string,
  state: AttemptStateRecord,
  recordedAt: string,
  knownSession?: Awaited<ReturnType<typeof requireOpenSession>>
): Promise<boolean> {
  const session = knownSession ?? await requireOpenSession(projectContext, sessionId);
  const event = makeEvent({
    eventId: stableEventId(state.questionAttemptKey, `${state.state.toLowerCase()}.${state.providerDispatchCount}`),
    sessionId,
    sequence: session.value.length + 1,
    type: "grounded-attempt",
    actor: "system",
    content: JSON.stringify({ version: ATTEMPT_STATE_VERSION, ...state }),
    operationId,
    recordedAt
  });
  const appended = await appendSessionEvent(projectContext, sessionId, session.contentHash, event.sequence, event, {
    recordedAt: event.recordedAt,
    operationId
  });
  return appended.ok;
}

async function appendMonotonicState(
  projectContext: ContinuityContext,
  archived: ArchivedQuestion,
  operationId: string,
  state: AttemptStateRecord,
  recordedAt: string
): Promise<void> {
  for (let retry = 0; retry < 8; retry += 1) {
    const session = await requireOpenSession(projectContext, archived.contextRequest.sessionId);
    const prior = latestAttemptState(session.value, archived.questionAttemptKey, state.state);
    if (prior) return;
    if (await appendAttemptState(projectContext, archived.contextRequest.sessionId, operationId, state, recordedAt, session)) return;
  }
  throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", `Grounded attempt state ${state.state} could not be recorded.`);
}

function asResult(
  archived: ArchivedQuestion,
  staged: AttemptStateRecord,
  manifest: TianyiGroundedSourceManifest,
  responseMessageId: string | null,
  alreadyCompleted: boolean,
  partialState: TianyiGroundedAttemptState = responseMessageId ? "COMPLETED" : staged.state
): TianyiGroundedAnswerOperation {
  return {
    status: responseMessageId ? "current" : "partial",
    partialState,
    retryRequired: partialState === "PREPARED" || partialState === "PROVIDER_UNCERTAIN",
    sessionId: archived.contextRequest.sessionId,
    submissionId: archived.submissionId,
    questionAttemptKey: archived.questionAttemptKey,
    authorMessageId: archived.authorMessageId,
    responseMessageId,
    receiptId: archived.receiptId,
    answer: staged.answer,
    sourceManifest: manifest,
    includedSources: manifest.included,
    excludedSources: nonIncluded(manifest),
    attemptCount: staged.providerDispatchCount,
    providerDispatchCount: staged.providerDispatchCount,
    usage: staged.usage,
    alreadyCompleted
  };
}

function attemptStates(events: InteractionEvent[], questionAttemptKey: string): AttemptStateRecord[] {
  return events.flatMap((event) => {
    if (event.type !== "grounded-attempt") return [];
    const value = parseAttemptState(event.content);
    return value.questionAttemptKey === questionAttemptKey ? [value] : [];
  });
}

async function assertUniqueAttemptArtifacts(
  projectContext: ContinuityContext,
  events: InteractionEvent[],
  archived: ArchivedQuestion
): Promise<void> {
  const responses = events.filter((event) => {
    if (event.type !== "tianyi-response") return false;
    if (event.eventId === archived.responseMessageId || event.receiptId === archived.receiptId) return true;
    try {
      const value = JSON.parse(event.content) as { questionAttemptKey?: unknown };
      return value.questionAttemptKey === archived.questionAttemptKey;
    } catch {
      return false;
    }
  });
  if (
    responses.length > 1
    || responses.some((event) => event.eventId !== archived.responseMessageId || event.receiptId !== archived.receiptId)
  ) {
    throw new TianyiGroundedRecoveryError(
      "ATTEMPT_CONFLICT",
      "Grounded question attempt has conflicting assistant artifacts."
    );
  }

  const receiptIds = new Set<string>();
  for (const metadata of await listReceiptMetadata(projectContext)) {
    const receipt = await readReceipt(projectContext, metadata.id);
    if (
      receipt?.value.version === CONTEXT_RECEIPT_V5_VERSION
      && receipt.value.questionAttempt.questionAttemptKey === archived.questionAttemptKey
    ) {
      receiptIds.add(metadata.id);
    }
  }
  if (receiptIds.size > 1 || [...receiptIds].some((id) => id !== archived.receiptId)) {
    throw new TianyiGroundedRecoveryError(
      "ATTEMPT_CONFLICT",
      "Grounded question attempt has conflicting Receipt artifacts."
    );
  }
}

function latestAttemptState(
  events: InteractionEvent[],
  questionAttemptKey: string,
  state?: TianyiGroundedAttemptState
): AttemptStateRecord | null {
  const values = attemptStates(events, questionAttemptKey).filter((item) => !state || item.state === state);
  return values.at(-1) ?? null;
}

function uniqueResultStaged(events: InteractionEvent[], archived: ArchivedQuestion): AttemptStateRecord | null {
  const matches: AttemptStateRecord[] = [];
  for (const event of events) {
    if (event.type !== "grounded-attempt") continue;
    let state: AttemptStateRecord;
    try {
      state = parseAttemptState(event.content);
    } catch {
      throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Grounded attempt state is malformed.");
    }
    if (state.questionAttemptKey !== archived.questionAttemptKey || state.state !== "RESULT_STAGED") continue;
    if (
      event.sessionId !== archived.contextRequest.sessionId
      || event.actor !== "system"
      || event.operationId !== archived.initialOperationId
    ) {
      throw new TianyiGroundedRecoveryError(
        "ATTEMPT_CONFLICT",
        "Durable staged result does not match the grounded operation identity."
      );
    }
    matches.push(state);
  }
  if (matches.length > 1) {
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Grounded question attempt has multiple staged results.");
  }
  return matches[0] ?? null;
}

function stagedResultPayload(input: {
  answer: TianyiGroundedAnswer | null;
  usage: TianyiGroundedAnswerOperation["usage"];
  providerDispatchCount: number;
}): {
  answer: TianyiGroundedAnswer;
  usage: TianyiGroundedAnswerOperation["usage"];
  providerDispatchCount: number;
} {
  if (!input.answer) {
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Durable staged result is incomplete.");
  }
  return {
    answer: input.answer,
    usage: input.usage,
    providerDispatchCount: input.providerDispatchCount
  };
}

function stagedResultDigest(input: {
  answer: TianyiGroundedAnswer | null;
  usage: TianyiGroundedAnswerOperation["usage"];
  providerDispatchCount: number;
}): string {
  return sha256(stableJson(stagedResultPayload(input)));
}

function assertValidStagedResult(staged: AttemptStateRecord, manifest: TianyiGroundedSourceManifest): void {
  if (
    staged.state !== "RESULT_STAGED"
    || !staged.resultDigest
    || staged.providerDispatchCount < 1
    || staged.resultDigest !== stagedResultDigest(staged)
  ) {
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Durable staged result integrity is invalid.");
  }
  assertValidResultPayload(stagedResultPayload(staged), manifest);
}

function assertValidResultPayload(
  payload: {
    answer: TianyiGroundedAnswer;
    usage: TianyiGroundedAnswerOperation["usage"];
    providerDispatchCount: number;
  },
  manifest: TianyiGroundedSourceManifest
): void {
  const normalizedAnswer = parseAndNormalizeTianyiGroundedAnswer(JSON.stringify(payload.answer), {
    includedSourceRefs: manifest.included.map((entry) => entry.sourceKey),
    excludedSources: nonIncluded(manifest).map((entry) => ({
      sourceRef: entry.sourceKey,
      reason: entry.reasonCode as string
    }))
  });
  if (
    stableJson(normalizedAnswer) !== stableJson(payload.answer)
    || !Number.isSafeInteger(payload.providerDispatchCount)
    || payload.providerDispatchCount < 1
  ) {
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Grounded result payload is invalid.");
  }
  if (payload.usage === null) return;
  const usage = payload.usage as Record<string, unknown>;
  if (
    !usage
    || typeof usage !== "object"
    || Array.isArray(usage)
    || Object.keys(usage).length !== 3
    || ["promptTokens", "completionTokens", "totalTokens"].some((key) => !Object.hasOwn(usage, key))
    || ["promptTokens", "completionTokens", "totalTokens"].some((key) => !Number.isSafeInteger(usage[key]) || (usage[key] as number) < 0)
    || (usage.promptTokens as number) + (usage.completionTokens as number) !== usage.totalTokens
  ) {
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Grounded result usage is invalid.");
  }
}

function parseAttemptState(content: string): AttemptStateRecord {
  const value = JSON.parse(content) as AttemptStateRecord;
  if (value.version !== ATTEMPT_STATE_VERSION || !isAttemptState(value.state)) throw new Error("Archived grounded attempt state is invalid.");
  machineId(value.questionAttemptKey, "Archived question attempt key");
  if (!Number.isSafeInteger(value.providerDispatchCount) || value.providerDispatchCount < 0) throw new Error("Archived Provider dispatch count is invalid.");
  if (value.resultDigest !== null) hash(value.resultDigest, "Archived result digest");
  return value;
}

function preparedState(questionAttemptKey: string): AttemptStateRecord {
  return {
    version: ATTEMPT_STATE_VERSION,
    questionAttemptKey,
    state: "PREPARED",
    providerDispatchCount: 0,
    answer: null,
    usage: null,
    resultDigest: null
  };
}

function isAttemptState(value: unknown): value is TianyiGroundedAttemptState {
  return [
    "PREPARED",
    "PROVIDER_UNCERTAIN",
    "RESULT_STAGED",
    "RECEIPT_COMMITTED_UNACKNOWLEDGED",
    "COMPLETED"
  ].includes(String(value));
}

function findArchivedQuestion(events: InteractionEvent[], questionAttemptKey: string): ArchivedQuestion | null {
  for (const event of events) {
    if (event.type !== "author-message") continue;
    try {
      const value = parseGroundedQuestion(event.content);
      if (value.questionAttemptKey === questionAttemptKey) return value;
    } catch {
      // Other author-message schemas remain valid Session material.
    }
  }
  return null;
}

function parseGroundedQuestion(content: string): ArchivedQuestion {
  const value = JSON.parse(content) as Partial<ArchivedQuestion>;
  if (value.version !== QUESTION_VERSION || !value.request) throw new Error("Archived grounded question is invalid.");
  const contextRequest = normalizeTianyiGroundedContextRequest(value.contextRequest);
  const identitySnapshot = normalizeTianyiIdentitySnapshot(value.identitySnapshot, {
    projectId: contextRequest.projectId
  });
  return {
    version: QUESTION_VERSION,
    request: { authorQuery: boundedText(value.request.authorQuery, "Archived author question", 4_000) },
    profileId: machineId(value.profileId, "Archived profile identifier"),
    receiptId: machineId(value.receiptId, "Archived Receipt identifier"),
    contextRequest,
    manifestDigest: hash(value.manifestDigest, "Archived manifest digest"),
    submissionId: machineId(value.submissionId, "Archived submission identifier"),
    questionAttemptKey: machineId(value.questionAttemptKey, "Archived question attempt key"),
    requestIntentHash: hash(value.requestIntentHash, "Archived request intent hash"),
    identitySnapshot,
    authorMessageId: machineId(value.authorMessageId, "Archived author message identifier"),
    responseMessageId: machineId(value.responseMessageId, "Archived response message identifier"),
    initialOperationId: machineId(value.initialOperationId, "Archived initial operation identifier")
  };
}

function parseGroundedResponse(content: string): {
  answer: TianyiGroundedAnswer;
  providerDispatchCount: number;
  usage: TianyiGroundedAnswerOperation["usage"];
  resultDigest: string;
  visibleResponse: string;
  manifestDigest: string;
  questionAttemptKey: string;
} {
  const value = JSON.parse(content) as {
    version?: unknown;
    answer?: TianyiGroundedAnswer;
    providerDispatchCount?: unknown;
    usage?: TianyiGroundedAnswerOperation["usage"];
    resultDigest?: unknown;
    visibleResponse?: unknown;
    manifestDigest?: unknown;
    questionAttemptKey?: unknown;
  };
  if (
    value.version !== RESPONSE_VERSION
    || !value.answer
    || !Number.isSafeInteger(value.providerDispatchCount)
  ) {
    throw new Error("Archived grounded response is invalid.");
  }
  return {
    answer: value.answer,
    providerDispatchCount: value.providerDispatchCount as number,
    usage: value.usage ?? null,
    resultDigest: hash(value.resultDigest, "Archived result digest"),
    visibleResponse: boundedText(value.visibleResponse, "Archived visible response", 4_000),
    manifestDigest: hash(value.manifestDigest, "Archived manifest digest"),
    questionAttemptKey: machineId(value.questionAttemptKey, "Archived question attempt key")
  };
}

function assertSameQuestion(
  archived: ArchivedQuestion,
  current: {
    question: string;
    profileId: string;
    contextRequest: TianyiGroundedContextRequest;
    manifestDigest: string;
    submissionId: string;
    questionAttemptKey: string;
  }
): void {
  if (
    archived.request.authorQuery !== current.question
    || archived.profileId !== current.profileId
    || stableJson(archived.contextRequest) !== stableJson(current.contextRequest)
    || archived.manifestDigest !== current.manifestDigest
    || archived.submissionId !== current.submissionId
    || archived.questionAttemptKey !== current.questionAttemptKey
  ) {
    mismatch();
  }
}

function assertSameReceipt(
  receipt: ContinuityReadResult<import("./continuityTypes.ts").ContextReceipt> | null,
  archived: ArchivedQuestion,
  staged: AttemptStateRecord,
  manifest: TianyiGroundedSourceManifest,
  profile: { id: string; providerId: string; modelId: string }
): asserts receipt is ContinuityReadResult<ContextReceiptV5> {
  if (
    !receipt
    || receipt.value.version !== CONTEXT_RECEIPT_V5_VERSION
    || !staged.answer
    || !staged.resultDigest
  ) {
    throw new TianyiGroundedRecoveryError("ATTEMPT_CONFLICT", "Existing Receipt does not match the grounded question attempt.");
  }
  const expected = buildProviderReceipt({
    archived,
    profile,
    manifest,
    staged,
    generatedAt: receipt.value.generationTimestamp,
    classifications: answerClassifications(staged.answer)
  });
  if (stableJson(receipt.value) !== stableJson(expected)) {
    throw new TianyiGroundedRecoveryError(
      "ATTEMPT_CONFLICT",
      "Existing Receipt envelope does not match the grounded question attempt."
    );
  }
}

function deriveQuestionAttemptKey(input: {
  projectId: string;
  agentId: string;
  sessionId: string;
  submissionId: string;
}): string {
  return `attempt.${sha256(stableJson({ version: ATTEMPT_KEY_VERSION, ...input })).slice(0, 48)}`;
}

function deriveRequestIntentHash(input: {
  question: string;
  profileId: string;
  contextRequest: TianyiGroundedContextRequest;
  manifestDigest: string;
  identitySnapshotDigest: string;
}): string {
  return sha256(stableJson({ version: INTENT_VERSION, ...input }));
}

function stableEventId(questionAttemptKey: string, role: string): string {
  return `event.${sha256(`${questionAttemptKey}\u0000${role}`).slice(0, 24)}`;
}

function nonIncluded(manifest: TianyiGroundedSourceManifest): TianyiGroundedSourceManifestEntry[] {
  return [...manifest.excluded, ...manifest.budgetOmitted, ...manifest.conflicting]
    .sort((left, right) => left.deterministicOrder - right.deterministicOrder);
}

function answerClassifications(answer: TianyiGroundedAnswer): TianyiResponseClassification[] {
  const values = new Set<TianyiResponseClassification>();
  for (const claim of answer.claims) {
    if (claim.status === "fact") values.add("confirmed-fact");
    if (claim.status === "inference") values.add("inference");
    if (claim.status === "candidate") values.add("candidate-suggestion");
    if (claim.status === "unknown") values.add("unavailable-evidence");
  }
  if (values.size === 0) values.add("unavailable-evidence");
  return [...values];
}

async function requireOpenSession(context: ContinuityContext, sessionId: string) {
  const session = await readSession(context, sessionId);
  if (!session) throw new Error("Tianyi session does not exist.");
  if (session.value.some((event) => event.type === "session-closed")) throw new Error("Tianyi session is closed.");
  return session;
}

function makeEvent(input: {
  eventId: string;
  sessionId: string;
  sequence: number;
  type: "author-message" | "grounded-attempt" | "tianyi-response";
  actor: "author" | "system" | "tianyi";
  content: string;
  operationId: string;
  recordedAt: string;
  responseClassifications?: TianyiResponseClassification[];
  receiptId?: string;
}): InteractionEvent {
  return {
    version: INTERACTION_EVENT_VERSION,
    eventId: input.eventId,
    sessionId: input.sessionId,
    sequence: input.sequence,
    type: input.type,
    recordedAt: input.recordedAt,
    actor: input.actor,
    content: input.content,
    responseClassifications: input.responseClassifications ?? [],
    memoryCandidateIds: [],
    receiptId: input.receiptId ?? null,
    operationId: input.operationId
  };
}

function mismatch(): never {
  throw new TianyiGroundedRecoveryError(
    "QUESTION_ATTEMPT_MISMATCH",
    "Submission identifier was reused for a different grounded question intent."
  );
}

function machineId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 96 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function timestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Operation timestamp is invalid.");
  }
  return value;
}
