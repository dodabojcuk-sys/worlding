import { Check, Eye, GitMerge, Pause, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  decideSourceImportCandidate,
  decideGoldenLoopCandidateReview,
  createAuthorChangeSet,
  createPlanningEvent,
  createPlanningEventImpactReview,
  chooseImpactRoute,
  dryRunAuthorChangeSet,
  applyAuthorChangeSet,
  confirmRelationCandidate,
  editAgentRecognitionProposal,
  getGoldenLoopCandidateReview,
  getImpactReview,
  getAuthorChangeSet,
  getTianyiStoryIntakeRuns,
  ignoreAgentRecognitionProposal,
  listRelations,
  listStoryUnits,
  listAgentRecognitionProposals,
  listSourceImportReviews,
  rejectRelationCandidate,
  updateRelationCandidate,
  updateStoryUnit,
  confirmAgentRecognitionObject,
  type AgentRecognitionProposal,
  type StoryUnit
} from "../../lib/localTransport";
import type { GoldenLoopCandidate, GoldenLoopCandidateReview } from "../../lib/goldenLoopContract";
import type { ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { StoryIntakeReviewTarget } from "./pendingReviewAggregation";
import { useI18n } from "../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

type PendingItem = {
  id: string;
  kind: "source" | "golden" | "agent" | "relation" | "story-intake";
  title: string;
  summary: string;
  source: string;
  duplicateTargetId: string | null;
  sourceDocumentId?: string;
  candidateId?: string;
  reviewId?: string;
  goldenCandidate?: GoldenLoopCandidate;
  goldenReview?: GoldenLoopCandidateReview;
  goldenReviewCandidate?: GoldenLoopCandidateReview["candidates"][number];
  proposal?: AgentRecognitionProposal;
  relation?: RelationReadProjectionR0;
  storyIntakeTarget?: StoryIntakeReviewTarget;
};

function AgentProposalEditor(props: { proposal: AgentRecognitionProposal; busy: boolean; onSave(name: string, uncertainties: string[]): Promise<void> }) {
  const { t } = useI18n();
  const [name, setName] = useState(props.proposal.suggestedName);
  const [uncertainties, setUncertainties] = useState(props.proposal.uncertainties.join("\n"));
  useEffect(() => {
    setName(props.proposal.suggestedName);
    setUncertainties(props.proposal.uncertainties.join("\n"));
  }, [props.proposal.proposalId, props.proposal.revision, props.proposal.suggestedName, props.proposal.uncertainties]);
  return <details className="pending-agent-editor">
    <summary>{t("pending.edit")}</summary>
    <form onSubmit={(event) => {
      event.preventDefault();
      void props.onSave(name, uncertainties.split("\n").map((value) => value.trim()).filter(Boolean));
    }}>
      <label>{t("pending.editName")}<input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
      <label>{t("pending.editUncertainties")}<textarea value={uncertainties} maxLength={2_000} rows={3} onChange={(event) => setUncertainties(event.target.value)} /></label>
      <button type="submit" disabled={props.busy}>{t("pending.saveEdit")}</button>
    </form>
  </details>;
}

function RelationCandidateEditor(props: { relation: RelationReadProjectionR0; busy: boolean; onSave(direction: RelationReadProjectionR0["direction"]): Promise<void> }) {
  const [direction, setDirection] = useState<RelationReadProjectionR0["direction"]>(props.relation.direction);
  useEffect(() => setDirection(props.relation.direction), [props.relation.relationId, props.relation.revision, props.relation.direction]);
  return <details className="pending-agent-editor">
    <summary>编辑关系</summary>
    <form onSubmit={(event) => { event.preventDefault(); void props.onSave(direction); }}>
      <label>方向<select value={direction} onChange={(event) => setDirection(event.target.value as RelationReadProjectionR0["direction"])}><option value="forward">正向</option><option value="reverse">反向</option><option value="both">双向</option><option value="none">无方向</option></select></label>
      <button type="submit" disabled={props.busy}>保存编辑</button>
    </form>
  </details>;
}

/**
 * This is deliberately an orchestration view.  The Candidate Review, Impact
 * Review and Author Change Set remain their existing durable owners; the UI
 * only makes each author-confirmed transition visible and explicit.
 */
function GoldenCandidateAdoptionCard(props: {
  runtime: TianyanShellRuntimeState;
  review: GoldenLoopCandidateReview;
  candidate: GoldenLoopCandidate;
  reviewCandidate: GoldenLoopCandidateReview["candidates"][number];
  onChanged(): Promise<void>;
}) {
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof getImpactReview>>>(null);
  const [changeSet, setChangeSet] = useState<Awaited<ReturnType<typeof getAuthorChangeSet>>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storyUnits, setStoryUnits] = useState<readonly StoryUnit[]>([]);
  const [targetUnitId, setTargetUnitId] = useState("");
  const receipt = props.reviewCandidate.confirmationReceipt;
  const projectId = props.runtime.project?.id ?? null;
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;
  const refreshProgress = useCallback(async () => {
    if (!projectId || !receipt?.impactReviewId) { setImpact(null); setChangeSet(null); return; }
    const requestedProjectId = projectId;
    const [nextImpact, nextChangeSet] = await Promise.all([
      getImpactReview(requestedProjectId, receipt.impactReviewId),
      getAuthorChangeSet(requestedProjectId)
    ]);
    if (activeProjectId.current !== requestedProjectId) return;
    setImpact(nextImpact);
    setChangeSet(nextChangeSet?.reviewId === receipt.impactReviewId ? nextChangeSet : null);
  }, [projectId, receipt?.impactReviewId]);
  useEffect(() => {
    let active = true;
    setImpact(null); setChangeSet(null);
    void refreshProgress().catch(() => { if (active && activeProjectId.current === projectId) { setImpact(null); setChangeSet(null); } });
    return () => { active = false; };
  }, [projectId, refreshProgress]);
  useEffect(() => {
    if (!projectId) { setStoryUnits([]); setTargetUnitId(""); return; }
    let active = true;
    setStoryUnits([]); setTargetUnitId("");
    void listStoryUnits(projectId).then((items) => {
      if (!active || activeProjectId.current !== projectId) return;
      const activeUnits = items.filter((item) => item.lifecycle !== "archived");
      setStoryUnits(activeUnits);
      setTargetUnitId((current) => activeUnits.some((item) => item.id === current) ? current : activeUnits[0]?.id ?? "");
    }).catch(() => { if (active && activeProjectId.current === projectId) { setStoryUnits([]); setTargetUnitId(""); } });
    return () => { active = false; };
  }, [projectId]);
  const run = async (operation: (token: string) => Promise<void>) => {
    if (busy) return;
    const requestedProjectId = projectId;
    if (!requestedProjectId) return;
    setBusy(true); setError("");
    try {
      await props.runtime.withConnection(operation);
      if (activeProjectId.current !== requestedProjectId) return;
      await props.onChanged();
      if (activeProjectId.current !== requestedProjectId) return;
      await refreshProgress();
    } catch (cause) { if (activeProjectId.current === requestedProjectId) setError(cause instanceof Error ? cause.message : "候选采纳没有完成；正式故事未被静默改写。"); }
    finally { if (activeProjectId.current === requestedProjectId) setBusy(false); }
  };
  if (!projectId) return null;
  const selectedOption = impact?.options.find((option) => option.selected) ?? impact?.options[0] ?? null;
  const planningBody = `# ${props.candidate.title}\n\n${props.reviewCandidate.summary}\n\n${props.candidate.change}\n\n来源：女娲 Run ${props.review.result.nuwaRunId}；Candidate ${props.candidate.id}；Context receipt ${props.review.result.contextReceiptId}。`;
  const candidateAwaiting = props.reviewCandidate.status === "awaiting";
  const canChooseRoute = impact?.status === "pending" && Boolean(selectedOption);
  const canCreateChangeSet = impact?.status === "selected" && !changeSet;
  const canApply = changeSet?.status === "pending";
  const targetUnit = storyUnits.find((item) => item.id === targetUnitId) ?? null;
  const appliedEventId = changeSet?.application.appliedEventId ?? null;
  const canMapToUnit = changeSet?.status === "applied" && Boolean(appliedEventId && targetUnit && !targetUnit.linkedEntityIds.includes(appliedEventId));
  return <section className="pending-golden-adoption" data-testid="golden-candidate-adoption" data-candidate-id={props.candidate.id} data-applied-event-id={appliedEventId ?? ""}>
    <p>女娲来源：Run {props.review.result.nuwaRunId} · Candidate {props.candidate.id}。关系候选仍须由 Relation Owner 单独确认，不会从共同出场推断。</p>
    <ol aria-label="候选采纳进度"><li className="is-complete">候选审阅</li><li className={receipt ? "is-complete" : ""}>影响预览</li><li className={impact?.status === "selected" || changeSet ? "is-complete" : ""}>作者选择</li><li className={changeSet?.status === "applied" ? "is-complete" : ""}>正式 Event</li></ol>
    {candidateAwaiting ? <button type="button" disabled={busy} onClick={() => void run(async (token) => {
      const planning = await createPlanningEvent({ projectId, title: props.candidate.title, body: planningBody, tags: ["女娲候选", "待作者审查"], operationId: `nuwa-adoption:${props.review.id}:${props.candidate.id}`, token });
      const nextImpact = await createPlanningEventImpactReview(projectId, planning.id, token);
      await decideGoldenLoopCandidateReview({ projectId, reviewId: props.review.id, candidateId: props.candidate.id, decision: "accepted", confirmationReceipt: { planningEventId: planning.id, impactReviewId: nextImpact.id, contextReceiptId: props.review.result.contextReceiptId, nuwaRunId: props.review.result.nuwaRunId }, token });
    })}>确认候选并打开影响预览</button> : null}
    {impact ? <p className="pending-golden-impact">影响预览：{impact.status === "pending" ? "尚待作者选择路径" : impact.status === "selected" ? "已选择采纳路径" : impact.status}；{impact.options.length} 条可审阅路径。</p> : receipt ? <p className="pending-golden-impact" role="status">正在读取已保存的影响预览…</p> : null}
    {canChooseRoute ? <button type="button" disabled={busy} onClick={() => void run((token) => chooseImpactRoute({ projectId, reviewId: impact!.id, optionId: selectedOption!.id, action: "adopt", token }).then(() => undefined))}>选择采纳路径</button> : null}
    {canCreateChangeSet ? <button type="button" disabled={busy} onClick={() => void run(async (token) => {
      const next = await createAuthorChangeSet(projectId, impact!.id, token);
      await dryRunAuthorChangeSet(projectId, next.id, token);
    })}>生成作者变更集</button> : null}
    {canApply ? <button type="button" className="primary-action" disabled={busy} onClick={() => void run((token) => applyAuthorChangeSet(projectId, changeSet!.id, token).then(() => undefined))}>确认写入正式 Event</button> : null}
    {changeSet?.status === "applied" ? <label className="pending-golden-story-unit"><span>将这份正式 Event 纳入故事单元</span><select aria-label="纳入故事单元" value={targetUnitId} disabled={busy || !storyUnits.length} onChange={(event) => setTargetUnitId(event.target.value)}>{storyUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label> : null}
    {canMapToUnit ? <button type="button" disabled={busy} onClick={() => void run(async (token) => {
      const updated = await updateStoryUnit({ projectId, unitId: targetUnit!.id, expectedVersion: targetUnit!.version, linkedEntityIds: [...new Set([...targetUnit!.linkedEntityIds, appliedEventId!])], token });
      if (updated.conflict) throw new Error("故事单元已更新；请刷新后重新确认映射。");
    })}>确认故事单元映射</button> : null}
    {changeSet?.status === "applied" ? <p className="pending-golden-impact">已由 Author Change Set 写入正式 Event；女娲原始 Run、候选和影响回执均保留。</p> : null}
    {error ? <p className="pending-review-notice" role="alert">{error}</p> : null}
  </section>;
}

/**
 * A directory-local review projection. It orchestrates existing formal ports
 * but owns neither candidate state nor story facts.
 */
export function PendingReviewPanel(props: {
  runtime: TianyanShellRuntimeState;
  onOpenSource(reference: ProjectDirectoryStableReference): void;
  onOpenStoryIntakeReview(target: StoryIntakeReviewTarget): void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reloadSequence = useRef(0);
  const projectId = props.runtime.project?.id ?? null;
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;

  const reload = useCallback(async () => {
    const loadId = ++reloadSequence.current;
    if (!props.runtime.project) { setItems([]); setLoadedProjectId(null); setLoading(false); return; }
    const projectId = props.runtime.project.id;
    setLoading(true);
    try {
      const workVersionId = props.runtime.workVersionId;
      const [imports, golden, proposals, relations, storyIntakeRuns] = await Promise.all([
        listSourceImportReviews(projectId),
        getGoldenLoopCandidateReview(projectId),
        props.runtime.withConnection((token) => listAgentRecognitionProposals(projectId, token)),
        listRelations({ projectId, reviewState: "candidate" }),
        workVersionId ? props.runtime.withConnection((token) => getTianyiStoryIntakeRuns({ projectId, workVersionId, token })) : Promise.resolve([])
      ]);
      if (loadId !== reloadSequence.current || activeProjectId.current !== projectId) return;
      const sourceItems = imports.flatMap((document) => document.candidates
        .filter((candidate) => candidate.status === "pending")
        .map((candidate): PendingItem => ({
          id: `source:${document.sourceDocumentId}:${candidate.candidateId}`,
          kind: "source",
          title: candidate.displayName,
          summary: candidate.summary,
          source: document.title,
          duplicateTargetId: candidate.duplicateMatches[0]?.objectId ?? null,
          sourceDocumentId: document.sourceDocumentId,
          candidateId: candidate.candidateId
        })));
      const goldenItems = (golden?.candidates ?? []).filter((candidate) => candidate.status === "awaiting" || candidate.status === "accepted").map((candidate): PendingItem => ({
        id: `golden:${golden!.id}:${candidate.id}`,
        kind: "golden",
        title: candidate.title,
        summary: candidate.summary,
        source: t("pending.goldenSource"),
        duplicateTargetId: null,
        candidateId: candidate.id,
        reviewId: golden!.id,
        goldenCandidate: golden!.result.nuwa.candidates.find((item) => item.id === candidate.id),
        goldenReview: golden!,
        goldenReviewCandidate: candidate
      }));
      const hasAuthoritativeStoryIntake = storyIntakeRuns.some((run) => {
        const envelope = run.storyIntakeEnvelope;
        return Boolean(envelope)
          && run.projectId === projectId
          && run.workVersionId === workVersionId
          && envelope!.projectId === projectId
          && envelope!.baseVersion.workVersionId === workVersionId
          && envelope!.sessionId === run.sessionId
          && envelope!.runId === run.runId;
      });
      const agentItems = proposals
        .filter((proposal) => (proposal.status === "pending" || proposal.status === "edited") && !(hasAuthoritativeStoryIntake && proposal.sourceWorkspace === "tianyi-story-intake"))
        .map((proposal): PendingItem => {
        const base: PendingItem = {
          id: `agent:${proposal.proposalId}`,
          kind: "agent",
          title: proposal.suggestedName,
          summary: proposal.uncertainties[0] ?? t("pending.agentSummary"),
          source: proposal.sourceWorkspace,
          duplicateTargetId: proposal.duplicateMatches[0]?.objectId ?? null,
          proposal
        };
        return base;
      });
      const relationItems = relations.relations.map((relation): PendingItem => ({
        id: `relation:${relation.relationId}`,
        kind: "relation",
        title: relation.currentTypeLabel ?? relation.relationLabelSnapshot,
        summary: `${relation.sourceObjectId} → ${relation.targetObjectId}${relation.evidenceWarnings.length ? ` · ${relation.evidenceWarnings.length} 条证据需要核验` : ""}`,
        source: "事件关系候选",
        duplicateTargetId: null,
        relation
      }));
      const storyIntakeItems = storyIntakeRuns.flatMap((run) => {
        const envelope = run.storyIntakeEnvelope;
        if (!envelope || envelope.projectId !== projectId || envelope.baseVersion.workVersionId !== run.workVersionId || envelope.sessionId !== run.sessionId || envelope.runId !== run.runId) return [];
        return envelope.candidates
          .filter((candidate) => candidate.lifecycleStatus === "pending-review" || candidate.lifecycleStatus === "deferred" || candidate.lifecycleStatus === "pending-archive")
          .map((candidate): PendingItem => ({
            id: `story-intake:${envelope.envelopeId}:${candidate.candidateId}`,
            kind: "story-intake",
            title: candidate.proposedName ?? candidate.proposedTitle ?? "未命名故事候选",
            summary: candidate.summary,
            source: "天意 Story Intake",
            duplicateTargetId: null,
            storyIntakeTarget: { projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, runId: run.runId, envelopeId: envelope.envelopeId, candidateId: candidate.candidateId }
          }));
      });
      setItems([...storyIntakeItems, ...sourceItems, ...goldenItems, ...agentItems, ...relationItems]);
      setLoadedProjectId(projectId);
    } catch {
      if (loadId === reloadSequence.current && activeProjectId.current === projectId) setNotice(t("directory.unavailable"));
    } finally {
      if (loadId === reloadSequence.current && activeProjectId.current === projectId) setLoading(false);
    }
  }, [props.runtime, t]);

  useEffect(() => { reloadSequence.current += 1; setItems([]); setLoadedProjectId(null); setNotice(null); setBusy(null); }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const perform = async (id: string, action: () => Promise<void>) => {
    const requestedProjectId = activeProjectId.current;
    if (!requestedProjectId) return;
    setBusy(id); setNotice(null);
    try {
      await action();
      if (activeProjectId.current !== requestedProjectId) return;
      window.dispatchEvent(new Event("story-studio-pending-review-changed"));
      await reload();
    }
    catch (error) { if (activeProjectId.current === requestedProjectId) setNotice(error instanceof Error ? error.message : t("pending.actionFailed")); }
    finally { if (activeProjectId.current === requestedProjectId) setBusy(null); }
  };
  const openSource = (item: PendingItem) => {
    if (!props.runtime.project || !item.sourceDocumentId) return;
    props.onOpenSource({ objectId: item.sourceDocumentId, sourceId: item.sourceDocumentId, version: "current", projectId: props.runtime.project.id, workVersionId: props.runtime.workVersionId, objectType: "source-document" });
  };
  const approveAgent = async (item: PendingItem) => {
    if (!props.runtime.project || !item.proposal) return;
    const proposal = item.proposal;
    const objectType = proposal.objectKind === "character" || proposal.objectKind === "item" || proposal.objectKind === "location" ? proposal.objectKind : null;
    if (!objectType) throw new Error(t("pending.agentUnsupported"));
    const object = { objectType, title: proposal.suggestedName, status: "active", tags: [t("pending.agentTag")], aliases: [], body: `# ${proposal.suggestedName}\n\n${proposal.uncertainties.join("\n")}`, profile: null };
    await props.runtime.withConnection((token) => confirmAgentRecognitionObject({ projectId: props.runtime.project!.id, proposalId: proposal.proposalId, expectedProposalRevision: proposal.revision, operationId: `directory-confirm-${proposal.proposalId}-${proposal.revision}`, object, token }));
  };
  const approveRelation = async (item: PendingItem) => {
    if (!props.runtime.project || !item.relation) return;
    await props.runtime.withConnection((token) => confirmRelationCandidate({ projectId: props.runtime.project!.id, relationId: item.relation!.relationId, expectedRelationRevision: item.relation!.revision, operationId: `directory-confirm-relation-${item.relation!.relationId}-${item.relation!.revision}`, token }));
  };

  if (loading || loadedProjectId !== projectId) return <p className="project-directory-empty">{t("common.loading")}</p>;
  return <section className="pending-review-panel" aria-label={t("directory.pending")} data-story-fact-owner="false">
    {notice && <p className="pending-review-notice" role="status">{notice}</p>}
    {!items.length && <p className="project-directory-empty">{t("pending.empty")}</p>}
    {items.map((item) => <article key={item.id} data-pending-kind={item.kind} data-pending-category={item.kind === "source" ? "source" : item.kind === "golden" ? "decision" : "candidate"}>
      <header><strong>{item.title}</strong><small>{t("directory.pendingSourceBatch").replace("{batch}", item.source)}</small></header>
      <p>{item.summary}</p>
      {item.duplicateTargetId && <small className="pending-duplicate">{t("pending.duplicate")}</small>}
      {item.kind === "agent" && item.proposal && Array.isArray(item.proposal.suggestedFields.proposedCustomTypes) && item.proposal.suggestedFields.proposedCustomTypes.length ? <small>{t("pending.agentType")}: {item.proposal.suggestedFields.proposedCustomTypes.join("、")}</small> : null}
      {item.kind === "agent" && item.proposal && <AgentProposalEditor proposal={item.proposal} busy={busy === item.id} onSave={(suggestedName, uncertainties) => perform(item.id, async () => {
        const proposal = item.proposal!;
        await props.runtime.withConnection((token) => editAgentRecognitionProposal({ projectId: props.runtime.project!.id, proposalId: proposal.proposalId, expectedRevision: proposal.revision, suggestedName, suggestedFields: proposal.suggestedFields, uncertainties, duplicateMatches: proposal.duplicateMatches, token }));
      })} />}
      {item.kind === "relation" && item.relation && <RelationCandidateEditor relation={item.relation} busy={busy === item.id} onSave={(direction) => perform(item.id, async () => {
        const relation = item.relation!;
        await props.runtime.withConnection((token) => updateRelationCandidate({ projectId: props.runtime.project!.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, direction, operationId: `directory-edit-relation-${relation.relationId}-${relation.revision}`, token }));
      })} />}
      {item.kind === "golden" && item.goldenReview && item.goldenCandidate && item.goldenReviewCandidate ? <GoldenCandidateAdoptionCard runtime={props.runtime} review={item.goldenReview} candidate={item.goldenCandidate} reviewCandidate={item.goldenReviewCandidate} onChanged={reload} /> : null}
      <footer>
        {item.kind === "story-intake" && item.storyIntakeTarget && <button type="button" onClick={() => props.onOpenStoryIntakeReview(item.storyIntakeTarget!)}><Eye aria-hidden="true" />打开本批审阅</button>}
        {item.kind === "source" && <button type="button" onClick={() => openSource(item)}><Eye aria-hidden="true" />{t("pending.viewSource")}</button>}
        {item.kind === "source" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "accepted", token })); })}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "source" && item.duplicateTargetId && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "merged", targetObjectId: item.duplicateTargetId, token })); })}><GitMerge aria-hidden="true" />{t("pending.merge")}</button>}
        {item.kind === "source" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "rejected", token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "agent" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, () => approveAgent(item))}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "agent" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => ignoreAgentRecognitionProposal({ projectId: props.runtime.project!.id, proposalId: item.proposal!.proposalId, expectedRevision: item.proposal!.revision, token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "relation" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, () => approveRelation(item))}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "relation" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { const relation = item.relation!; await props.runtime.withConnection((token) => rejectRelationCandidate({ projectId: props.runtime.project!.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: `directory-reject-relation-${relation.relationId}-${relation.revision}`, token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "golden" && !item.goldenCandidate && <small>{t("pending.goldenNeedsReview")}</small>}
        {item.kind !== "story-intake" && <button type="button" disabled={busy === item.id} onClick={() => setNotice(t("pending.deferred"))}><Pause aria-hidden="true" />{t("pending.defer")}</button>}
      </footer>
    </article>)}
  </section>;
}

/** Central presentation only; decisions still flow through the original ports. */
export function PendingReviewWorkspace(props: { runtime: TianyanShellRuntimeState; onOpenSource(reference: ProjectDirectoryStableReference): void; onOpenStoryIntakeReview(target: StoryIntakeReviewTarget): void; onClose(): void }) {
  const { t } = useI18n();
  const projectLabel = props.runtime.project?.title ?? t("directory.pendingWorkspaceUnopened");
  const versionLabel = props.runtime.workVersionLabel ?? t("directory.pendingWorkspaceCurrentVersion");
  return <main className="shell-workspace pending-review-workspace" aria-labelledby="pending-review-workspace-title" data-story-fact-owner="false">
    <header className="pending-review-workspace-heading">
      <div><small>{t("directory.pendingWorkspaceEyebrow")}</small><h1 id="pending-review-workspace-title">{t("directory.pending")}</h1><p>{projectLabel} · {versionLabel}</p></div>
      <button type="button" onClick={props.onClose}>{t("directory.pendingWorkspaceBack")}</button>
    </header>
    <p className="pending-review-workspace-note">{t("directory.pendingWorkspaceNote")}</p>
    <PendingReviewPanel runtime={props.runtime} onOpenSource={props.onOpenSource} onOpenStoryIntakeReview={props.onOpenStoryIntakeReview} />
  </main>;
}
