import { Check, Eye, GitMerge, Pause, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  decideSourceImportCandidate,
  getGoldenLoopCandidateReview,
  ignoreAgentRecognitionProposal,
  listAgentRecognitionProposals,
  listSourceImportReviews,
  confirmAgentRecognitionObject,
  type AgentRecognitionProposal
} from "../../lib/localTransport";
import type { ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { useI18n } from "../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

type PendingItem = {
  id: string;
  kind: "source" | "golden" | "agent" | "agent-type";
  title: string;
  summary: string;
  source: string;
  duplicateTargetId: string | null;
  sourceDocumentId?: string;
  candidateId?: string;
  proposal?: AgentRecognitionProposal;
};

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
      const [imports, golden, proposals] = await Promise.all([
        listSourceImportReviews(projectId),
        getGoldenLoopCandidateReview(projectId),
        props.runtime.withConnection((token) => listAgentRecognitionProposals(projectId, token))
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
      const agentItems = proposals.filter((proposal) => proposal.status === "pending" || proposal.status === "edited").flatMap((proposal): PendingItem[] => {
        const base: PendingItem = {
          id: `agent:${proposal.proposalId}`,
          kind: "agent",
          title: proposal.suggestedName,
          summary: proposal.uncertainties[0] ?? t("pending.agentSummary"),
          source: proposal.sourceWorkspace,
          duplicateTargetId: proposal.duplicateMatches[0]?.objectId ?? null,
          proposal
        };
        const typeProposal = Array.isArray(proposal.suggestedFields.proposedCustomTypes) && proposal.suggestedFields.proposedCustomTypes.length
          ? [{ ...base, id: `agent-type:${proposal.proposalId}`, kind: "agent-type" as const, title: `${proposal.suggestedName} · ${t("pending.agentType")}`, summary: t("pending.agentTypeReadOnly") }]
          : [];
        return [base, ...typeProposal];
      });
      setItems([...sourceItems, ...goldenItems, ...agentItems]);
    } catch {
      setNotice(t("directory.unavailable"));
    } finally { setLoading(false); }
  }, [props.runtime, t]);

  useEffect(() => { void reload(); }, [reload]);
  const perform = async (id: string, action: () => Promise<void>) => {
    setBusy(id); setNotice(null);
    try { await action(); await reload(); }
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

  if (loading) return <p className="project-directory-empty">{t("common.loading")}</p>;
  return <section className="pending-review-panel" aria-label={t("directory.pending")} data-story-fact-owner="false">
    {notice && <p className="pending-review-notice" role="status">{notice}</p>}
    {!items.length && <p className="project-directory-empty">{t("pending.empty")}</p>}
    {items.map((item) => <article key={item.id} data-pending-kind={item.kind}>
      <header><strong>{item.title}</strong><small>{item.source}</small></header>
      <p>{item.summary}</p>
      {item.duplicateTargetId && <small className="pending-duplicate">{t("pending.duplicate")}</small>}
      <footer>
        {item.kind === "source" && <button type="button" onClick={() => openSource(item)}><Eye aria-hidden="true" />{t("pending.viewSource")}</button>}
        {item.kind === "source" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "accepted", token })); })}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "source" && item.duplicateTargetId && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "merged", targetObjectId: item.duplicateTargetId, token })); })}><GitMerge aria-hidden="true" />{t("pending.merge")}</button>}
        {item.kind === "source" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => decideSourceImportCandidate({ projectId: props.runtime.project!.id, sourceDocumentId: item.sourceDocumentId!, candidateId: item.candidateId!, decision: "rejected", token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "agent" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, () => approveAgent(item))}><Check aria-hidden="true" />{t("pending.approveSave")}</button>}
        {item.kind === "agent" && <button type="button" disabled={busy === item.id} onClick={() => void perform(item.id, async () => { await props.runtime.withConnection((token) => ignoreAgentRecognitionProposal({ projectId: props.runtime.project!.id, proposalId: item.proposal!.proposalId, expectedRevision: item.proposal!.revision, token })); })}><X aria-hidden="true" />{t("pending.reject")}</button>}
        {item.kind === "golden" && <small>{t("pending.goldenNeedsReview")}</small>}
        {item.kind === "agent-type" && <small>{t("pending.agentTypeReadOnly")}</small>}
        <button type="button" disabled={busy === item.id} onClick={() => setNotice(t("pending.deferred"))}><Pause aria-hidden="true" />{t("pending.defer")}</button>
      </footer>
    </article>)}
  </section>;
}
