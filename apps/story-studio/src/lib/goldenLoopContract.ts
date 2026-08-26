export type GoldenLoopCandidate = {
  id: string;
  title: string;
  change: string;
  after: string;
  causes: string[];
  evidence: string[];
  affectedObjects: string[];
  uncertainty: string;
  impact: string;
  risk: string;
  authorView?: {
    direction: string;
    keyAction: string;
    directResult: string;
    downstreamImpact: string;
    causalDifference: string;
    risks: string[];
    unknowns: string[];
    knowledgeBoundary: string;
  };
  live?: {
    schemaVersion: string;
    actorDecisions: Array<{ actorId: string; decision: string; rationale: string }>;
    eventSequence: Array<{ eventId: string; summary: string; causes: string[] }>;
    stateChanges: Array<{ targetId: string; before: string; after: string }>;
    proposedNextBeat: string;
    axis: string;
  };
};

export type GoldenLoopResult = {
  version: "tianyan-golden-loop-candidate/v1";
  status: "candidate";
  contextPack: {
    version: "tianyan-golden-loop-context-pack/v1";
    id: string;
    contextReceiptId: string;
    sourceBinding?: {
      version: "story-studio-document-selection-binding/v1";
      documentId: string;
      documentRevision: string;
      selection: { coordinate: "utf16-code-unit"; start: number; end: number };
      contentHash: string;
    };
    project: { id: string; title: string } | null;
    authorIntent: string;
    sources: Array<{ id: string; type: string; label: string; content: string }>;
    unknowns: string[];
    budgets: { maximumSources: number; maximumCharacters: number };
    excluded: Array<{ id: string; reason: string }>;
  };
  contextReceiptId: string;
  nuwaRunId: string;
  tianyi: {
    version: "tianyan-tianyi-alignment/v1";
    facts: Array<{ statement: string; evidence: string }>;
    inferences: string[];
    unknowns: string[];
    suggestions: string[];
    simulationTask: { goal: string; mustPreserve: string[]; questions: string[] };
  };
  nuwa: {
    version: "tianyan-nuwa-simulation/v1";
    knownFacts: string[];
    assumptions: string[];
    causalSteps: string[];
    actorResponses: Array<{ actor: string; response: string }>;
    conflicts: string[];
    unknowns: string[];
    candidates: GoldenLoopCandidate[];
  };
  provider: {
    profileId: string;
    calls: Array<{
      stage: "tianyi" | "nuwa";
      attempt: number;
      latencyMs: number;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
      traceId: string | null;
    }>;
    livePilot?: {
      version: string;
      mode: "live-pilot-r2";
      modelId: string;
      contextHash: string;
      candidateCount: number;
      maxCalls: number;
      maxCostUsd: number;
      priceStatus: "verified" | "unverified";
      seedSupport: "unsupported" | "supported";
      axes: string[];
      retryCount: number;
      divergence: { distinct: boolean; fingerprints: string[] };
      receipts: Array<{
        version: string;
        providerId: string;
        modelId: string | null;
        requestId: string;
        contextHash: string;
        schemaVersion: string;
        explorationAxis: string;
        seed: number | null;
        seedSupport: "unsupported" | "supported";
        requestHash: string;
        responseHash: string;
        startedAt: string;
        completedAt: string;
        latencyMs: number;
        usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
        costUsd: number | null;
        costStatus: "unknown" | "estimated" | "actual";
        validationStatus: string;
        retryCount: number;
        errorCategory: string | null;
        traceId: string | null;
      }>;
    };
  };
  review?: { id: string; status: "awaiting" | "rejected" | "accepted" | "abandoned" };
};

export type GoldenLoopCandidateReviewLifecycle = "awaiting" | "rejected" | "accepted" | "abandoned" | "superseded";

export type GoldenLoopCandidateReview = {
  version: "story-studio-candidate-review-product/v1";
  id: string;
  projectId: string;
  status: "awaiting" | "rejected" | "accepted" | "abandoned";
  result: GoldenLoopResult;
  candidates: Array<{
    id: string;
    title: string;
    summary: string;
    status: "awaiting" | "rejected" | "accepted";
    rejectionReason: string | null;
    confirmationReceipt: null | { planningEventId: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string };
  }>;
  sourceSummary: string[];
  contextPackId: string;
  createdAt: string;
  updatedAt: string;
};

export type GoldenLoopCandidateReviewHistoryEntry = GoldenLoopCandidateReview & {
  lifecycleStatus: GoldenLoopCandidateReviewLifecycle;
};
