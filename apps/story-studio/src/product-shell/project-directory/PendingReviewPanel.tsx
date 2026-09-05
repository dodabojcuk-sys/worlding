import { Check, Eye, GitMerge, Pause, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  decideSourceImportCandidate,
  confirmRelationCandidate,
  editAgentRecognitionProposal,
  getGoldenLoopCandidateReview,
  ignoreAgentRecognitionProposal,
  listRelations,
  listAgentRecognitionProposals,
  listSourceImportReviews,
  rejectRelationCandidate,
  updateRelationCandidate,
  confirmAgentRecognitionObject,
  type AgentRecognitionProposal
} from "../../lib/localTransport";
import type { ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { useI18n } from "../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

type PendingItem = {
  id: string;
  kind: "source" | "golden" | "agent" | "relation";
  title: string;
  summary: string;
  source: string;
  duplicateTargetId: string | null;
  sourceDocumentId?: string;
  candidateId?: string;
  proposal?: AgentRecognitionProposal;
  relation?: RelationReadProjectionR0;
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
 * A directory-local review projection. It orchestrates existing formal ports
 * but owns neither candidate state nor story facts.
 */
export function PendingReviewPanel(props: {
  runtime: TianyanShellRuntimeState;
  onOpenSource(reference: ProjectDirectoryStableReference): void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!props.runtime.project) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const projectId = props.runtime.project.id;
      const [imports, golden, proposals, relations] = await Promise.all([
        listSourceImportReviews(projectId),
        getGoldenLoopCandidateReview(projectId),
        props.runtime.withConnection((token) => listAgentRecognitionProposals(projectId, token)),
        listRelations({ projectId, reviewState: "candidate" })
      ]);
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
      const goldenItems = (golden?.candidates ?? []).filter((candidate) => candidate.status === "awaiting").map((candidate): PendingItem => ({
        id: `golden:${golden!.id}:${candidate.id}`,
        kind: "golden",
        title: candidate.title,
        summary: candidate.summary,
        source: t("pending.goldenSource"),
        duplicateTargetId: null,
        candidateId: candidate.id
      }));
      const agentItems = proposals.filter((proposal) => proposal.status === "pending" || proposal.status === "edited").map((proposal): PendingItem => {
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
      setItems([...sourceItems, ...goldenItems, ...agentItems, ...relationItems]);
    } catch {
      setNotice(t("directory.unavailable"));
    } finally { setLoading(false); }
  }, [props.runtime, t]);

  useEffect(() => { void reload(); }, [reload]);
  const perform = async (id: string, action: () => Promise<void>) => {
    setBusy(id); setNotice(null);
    try { await action(); window.dispatchEvent(new Event("story-studio-pending-review-changed")); await reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : t("pending.actionFailed")); }
    finally { setBusy(null); }
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

  if (loading) return <p className="project-directory-empty">{t("common.loading")}</p>;
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
      <footer>
        {item.kind === "source" && <button type="button" onClick={() => openSource(item)}><Eye aria-hidden="true" />{t("pending.viewSource")}</button>}
        {item.kind === "source" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "accepted", token })); })}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "source" && item.duplicateTargetId && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "merged", targetObjectId: item.duplicateTargetId, token })); })}><GitMerge aria-hidden="true" />{t("pending.merge")}</button>}
        {item.kind === "source" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "rejected", token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "agent" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, () => approveAgent(item))}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "agent" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => ignoreAgentRecognitionProposal({ projectId: props.runtime.project!.id, proposalId: item.proposal!.proposalId, expectedRevision: item.proposal!.revision, token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "relation" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, () => approveRelation(item))}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "relation" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { const relation = item.relation!; await props.runtime.withConnection((token) => rejectRelationCandidate({ projectId: props.runtime.project!.id, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: `directory-reject-relation-${relation.relationId}-${relation.revision}`, token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "golden" && <small>{t("pending.goldenNeedsReview")}</small>}
        <button type="button" disabled={busy === item.id} onClick={() => setNotice(t("pending.deferred"))}><Pause aria-hidden="true" />{t("pending.defer")}</button>
      </footer>
    </article>)}
  </section>;
}

/** Central presentation only; decisions still flow through the original ports. */
export function PendingReviewWorkspace(props: { runtime: TianyanShellRuntimeState; onOpenSource(reference: ProjectDirectoryStableReference): void; onClose(): void }) {
  const { t } = useI18n();
  const projectLabel = props.runtime.project?.title ?? t("directory.pendingWorkspaceUnopened");
  const versionLabel = props.runtime.workVersionLabel ?? t("directory.pendingWorkspaceCurrentVersion");
  return <main className="shell-workspace pending-review-workspace" aria-labelledby="pending-review-workspace-title" data-story-fact-owner="false">
    <header className="pending-review-workspace-heading">
      <div><small>{t("directory.pendingWorkspaceEyebrow")}</small><h1 id="pending-review-workspace-title">{t("directory.pending")}</h1><p>{projectLabel} · {versionLabel}</p></div>
      <button type="button" onClick={props.onClose}>{t("directory.pendingWorkspaceBack")}</button>
    </header>
    <p className="pending-review-workspace-note">{t("directory.pendingWorkspaceNote")}</p>
    <PendingReviewPanel runtime={props.runtime} onOpenSource={props.onOpenSource} />
  </main>;
}
