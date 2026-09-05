/**
 * Read-only inbox projection for the project directory.
 *
 * It deliberately derives its rows from existing source, candidate and review
 * ports.  It has no persistence, lifecycle transition or story-fact write.
 */
export type PendingReviewCategory = "source" | "candidate" | "decision" | "adoption" | "processed";

type ImportCandidate = { candidateId: string; displayName: string; summary: string; status: string };
type SourceImport = { sourceDocumentId: string; title: string; candidates: readonly ImportCandidate[] };
type GoldenCandidate = { id: string; title: string; summary: string; status: string };
type GoldenReview = { id: string; candidates: readonly GoldenCandidate[] } | null;
type Proposal = { proposalId: string; projectId?: string; suggestedName: string; sourceWorkspace: string; status: string; uncertainties: readonly string[]; duplicateMatches: readonly unknown[]; suggestedFields: { proposedCustomTypes?: readonly string[] } };
type Relation = { relationId: string; projectId?: string; workVersionId?: string; currentTypeLabel: string | null; relationLabelSnapshot: string; sourceObjectId: string; targetObjectId: string; evidenceWarnings: readonly unknown[]; reviewState: string };
export type StoryIntakeEnvelope = { envelopeId: string; projectId: string; sessionId: string; runId: string; baseVersion: { workVersionId: string }; candidates: readonly { candidateId: string; type: string; proposedName: string | null; proposedTitle: string | null; summary: string; lifecycleStatus: string }[] };
export type PersistedStoryIntakeRun = { projectId: string; workVersionId: string; sessionId: string; runId: string; updatedAt: string; storyIntakeEnvelope: StoryIntakeEnvelope | null };
export type StoryIntakeReviewTarget = { projectId: string; workVersionId: string; sessionId: string; runId: string; envelopeId: string; candidateId: string };

export type PendingReviewItem = {
  id: string;
  category: PendingReviewCategory;
  pending: boolean;
  title: string;
  summary: string;
  sourceBatch: { id: string; label: string };
  storyIntakeTarget?: StoryIntakeReviewTarget;
};

export type PendingReviewAggregation = {
  projectId: string;
  workVersionId: string | null;
  pendingCount: number;
  categoryCounts: Record<PendingReviewCategory, number>;
  items: readonly PendingReviewItem[];
  storyIntakeTargets: readonly StoryIntakeReviewTarget[];
};

export function buildPendingReviewAggregation(input: {
  projectId: string;
  workVersionId: string | null;
  imports: readonly SourceImport[];
  golden: GoldenReview;
  proposals: readonly Proposal[];
  relations: readonly Relation[];
  /** Persisted Session Archive snapshots; browser storage is never a discovery source. */
  storyIntakeRuns?: readonly PersistedStoryIntakeRun[];
}): PendingReviewAggregation {
  const items: PendingReviewItem[] = [];
  const hasAuthoritativeStoryIntake = (input.storyIntakeRuns ?? []).some((run) => {
    const envelope = run.storyIntakeEnvelope;
    return Boolean(envelope)
      && run.projectId === input.projectId
      && run.workVersionId === input.workVersionId
      && envelope!.projectId === input.projectId
      && envelope!.baseVersion.workVersionId === input.workVersionId
      && envelope!.sessionId === run.sessionId
      && envelope!.runId === run.runId;
  });
  for (const source of input.imports) for (const candidate of source.candidates) {
    const pending = candidate.status === "pending";
    items.push({
      id: `source:${source.sourceDocumentId}:${candidate.candidateId}`,
      category: pending ? "source" : "processed",
      pending,
      title: candidate.displayName,
      summary: candidate.summary,
      sourceBatch: { id: source.sourceDocumentId, label: source.title }
    });
  }
  for (const candidate of input.golden?.candidates ?? []) {
    const pending = candidate.status === "awaiting";
    items.push({
      id: `decision:${input.golden!.id}:${candidate.id}`,
      category: pending ? "decision" : "processed",
      pending,
      title: candidate.title,
      summary: candidate.summary,
      sourceBatch: { id: input.golden!.id, label: "Golden Loop 候选批次" }
    });
  }
  for (const proposal of input.proposals) {
    if (proposal.projectId && proposal.projectId !== input.projectId) continue;
    // The pre-Envelope Tianyi recognition projection is only a compatibility
    // read model. Once the persisted Story Intake batch exists, counting both
    // would present the same author decision as two candidate repositories.
    if (hasAuthoritativeStoryIntake && proposal.sourceWorkspace === "tianyi-story-intake") continue;
    const pending = proposal.status === "pending" || proposal.status === "edited";
    items.push({
      id: `candidate:${proposal.proposalId}`,
      category: pending ? "candidate" : "processed",
      pending,
      title: proposal.suggestedName,
      summary: proposal.uncertainties[0] ?? "等待作者确认的识别候选。",
      sourceBatch: { id: proposal.proposalId, label: proposal.sourceWorkspace }
    });
  }
  for (const relation of input.relations) {
    if (relation.projectId && relation.projectId !== input.projectId) continue;
    if (relation.workVersionId && relation.workVersionId !== input.workVersionId) continue;
    const pending = relation.reviewState === "candidate";
    items.push({
      id: `candidate:${relation.relationId}`,
      category: pending ? "candidate" : "processed",
      pending,
      title: relation.currentTypeLabel ?? relation.relationLabelSnapshot,
      summary: `${relation.sourceObjectId} → ${relation.targetObjectId}`,
      sourceBatch: { id: relation.relationId, label: "事件关系候选" }
    });
  }
  const storyIntakeTargets: StoryIntakeReviewTarget[] = [];
  const storyIntakeItemKeys = new Set<string>();
  for (const run of [...(input.storyIntakeRuns ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const storyIntake = run.storyIntakeEnvelope;
    if (!storyIntake || run.projectId !== input.projectId || run.workVersionId !== input.workVersionId || storyIntake.projectId !== input.projectId || storyIntake.baseVersion.workVersionId !== input.workVersionId || storyIntake.sessionId !== run.sessionId || storyIntake.runId !== run.runId) continue;
    for (const candidate of storyIntake.candidates) {
      const pending = candidate.lifecycleStatus === "pending-review" || candidate.lifecycleStatus === "deferred" || candidate.lifecycleStatus === "pending-archive";
      const target = { projectId: input.projectId, workVersionId: input.workVersionId ?? run.workVersionId, sessionId: run.sessionId, runId: run.runId, envelopeId: storyIntake.envelopeId, candidateId: candidate.candidateId };
      const itemKey = `${target.sessionId}:${target.runId}:${target.envelopeId}:${target.candidateId}`;
      if (storyIntakeItemKeys.has(itemKey)) continue;
      storyIntakeItemKeys.add(itemKey);
      if (pending) storyIntakeTargets.push(target);
      items.push({
        id: `story-intake:${storyIntake.envelopeId}:${candidate.candidateId}`,
        category: pending ? "candidate" : "processed",
        pending,
        title: candidate.proposedName ?? candidate.proposedTitle ?? "未命名故事候选",
        summary: candidate.summary,
        sourceBatch: { id: `${storyIntake.envelopeId}:${run.sessionId}:${run.runId}`, label: `天意 Story Intake · 会话 ${run.sessionId} · 运行 ${run.runId}` },
        storyIntakeTarget: target
      });
    }
  }
  const categoryCounts: Record<PendingReviewCategory, number> = { source: 0, candidate: 0, decision: 0, adoption: 0, processed: 0 };
  for (const item of items) categoryCounts[item.category] += 1;
  return { projectId: input.projectId, workVersionId: input.workVersionId, pendingCount: items.filter((item) => item.pending).length, categoryCounts, items, storyIntakeTargets };
}

/**
 * Selects one already-persisted batch for the compact directory entry.  This
 * only forwards identity to Tianyi's existing Review/Work surface; it does
 * not copy candidates or own their lifecycle.
 */
export function selectStoryIntakeReviewTarget(input: { projectId: string; workVersionId: string; runs: readonly PersistedStoryIntakeRun[] }): StoryIntakeReviewTarget | null {
  const matching = input.runs
    .filter((run) => run.projectId === input.projectId && run.workVersionId === input.workVersionId && run.storyIntakeEnvelope?.projectId === input.projectId && run.storyIntakeEnvelope?.baseVersion.workVersionId === input.workVersionId && run.storyIntakeEnvelope.sessionId === run.sessionId && run.storyIntakeEnvelope.runId === run.runId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  for (const run of matching) {
    const envelope = run.storyIntakeEnvelope!;
    const candidate = envelope.candidates.find((item) => item.lifecycleStatus === "pending-review" || item.lifecycleStatus === "deferred" || item.lifecycleStatus === "pending-archive");
    if (candidate) return { projectId: input.projectId, workVersionId: input.workVersionId, sessionId: run.sessionId, runId: run.runId, envelopeId: envelope.envelopeId, candidateId: candidate.candidateId };
  }
  return null;
}
