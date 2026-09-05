import { ArrowRight, CheckCircle2, FileClock, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { beginTianyiCreativeEventImpact, confirmTianyiCreativeEvent, getTianyiCreativeEventReview, undoTianyiCreativeEvent, type TianyiCreativeEventReview } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";

export function TianyiAdoptionPanel(props: {
  runtime: TianyanShellRuntimeState;
  compact?: boolean;
  onOpenEventLine?(): void;
  onChanged?(review: TianyiCreativeEventReview): void;
}) {
  const { t } = useI18n();
  const project = props.runtime.project;
  const sessionId = props.runtime.tianyiConversationId;
  const candidateId = props.runtime.activeTianyiCandidateId;
  const [review, setReview] = useState<TianyiCreativeEventReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!project || !sessionId || !candidateId) { setReview(null); return; }
    const next = await props.runtime.withConnection((token) => getTianyiCreativeEventReview({ projectId: project.id, sessionId, candidateId, token }));
    setReview(next);
  }, [candidateId, project, props.runtime, sessionId]);
  useEffect(() => { void load().catch(() => setReview(null)); }, [load]);
  const run = async (action: (token: string) => Promise<TianyiCreativeEventReview>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { const next = await props.runtime.withConnection(action); setReview(next); props.onChanged?.(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.adoption.failed")); }
    finally { setBusy(false); }
  };
  if (!review || !project || !sessionId || !candidateId) return <section className="tianyi-adoption-panel is-empty"><ShieldCheck /><p>{t("tianyi.adoption.empty")}</p></section>;
  const receipt = review.adoptionReceipt;
  const impactReady = Boolean(review.impact);
  const option = review.impact?.options[0] ?? null;
  return <section className={`tianyi-adoption-panel ${props.compact ? "is-compact" : ""}`} data-testid="tianyi-adoption-panel" data-impact-ready={impactReady} data-adoption-status={receipt?.status ?? "candidate"}>
    <header><div><small>{t("tianyi.adoption.trajectory")}</small><h2>{review.proposal.title}</h2></div><span>{t(receipt ? receipt.status === "undone" ? "tianyi.adoption.statusUndone" : "tianyi.adoption.statusAdopted" : impactReady ? "tianyi.adoption.statusReviewed" : "tianyi.adoption.statusWaiting")}</span></header>
    <p>{review.proposal.summary}</p>
    <div className="tianyi-adoption-progress" aria-label={t("tianyi.adoption.progress")}><span className="is-complete"><CheckCircle2 />{t("tianyi.adoption.candidate")}</span><span className={impactReady ? "is-complete" : ""}><ShieldCheck />{t("tianyi.adoption.impactReview")}</span><span className={receipt ? "is-complete" : ""}><FileClock />{t("tianyi.adoption.authorAdoption")}</span></div>
    {!receipt ? <>
      {impactReady ? <section className="tianyi-structured-diff" aria-label={t("tianyi.adoption.diff")}><strong>{t("tianyi.adoption.diff")}</strong><dl><div><dt>{t("tianyi.workspace.baseVersion")}</dt><dd>{authorVersionLabel(project.title, review.proposal.writeTarget.version, t)}</dd></div><div><dt>{t("tianyi.adoption.scope")}</dt><dd>{t(props.runtime.workScope === "current-story" ? "tianyi.workspace.scope.story" : props.runtime.workScope === "selected-events" ? "tianyi.workspace.scope.events" : "tianyi.workspace.scope.unit")}</dd></div><div><dt>{t("tianyi.adoption.change")}</dt><dd>{authorImpactLabel(review, t)}</dd></div><div><dt>{t("tianyi.adoption.evidence")}</dt><dd>{review.impact?.impact?.evidenceCoverage ?? t("tianyi.adoption.evidenceReady")}</dd></div><div><dt>{t("tianyi.adoption.risk")}</dt><dd>{review.impact?.impact?.risks.join(" · ") || option?.summary || t("tianyi.adoption.noBlockingRisk")}</dd></div></dl><details><summary>{t("tianyi.adoption.technicalDetails")}</summary><p>{t("tianyi.adoption.traceHint")}</p></details></section> : null}
      <div className="tianyi-adoption-actions">
        {!impactReady ? <button type="button" className="primary-action" disabled={busy} onClick={() => void run((token) => beginTianyiCreativeEventImpact({ projectId: project.id, sessionId, candidateId, token }))}>{t("tianyi.adoption.openImpact")}</button> : null}
        {impactReady && props.onOpenEventLine ? <button type="button" onClick={props.onOpenEventLine}>{t("tianyi.adoption.openEventLine")}<ArrowRight /></button> : null}
        {impactReady ? <button type="button" className="primary-action tianyi-adopt-action" disabled={busy || !option} onClick={() => option && void run((token) => confirmTianyiCreativeEvent({ projectId: project.id, sessionId, candidateId, optionId: option.id, token }))}>{t("tianyi.adoption.adopt")}</button> : null}
      </div>
      <small>{t("tianyi.adoption.once")}</small>
    </> : <section className="tianyi-adoption-receipt" aria-label={t("tianyi.adoption.receipt")}>
      <header><CheckCircle2 /><div><strong>{t(receipt.status === "undone" ? "tianyi.adoption.undone" : "tianyi.adoption.active")}</strong><small>{t("tianyi.adoption.receiptHint")}</small></div></header>
      <dl><div><dt>{t("tianyi.workspace.baseVersion")}</dt><dd>{authorVersionLabel(project.title, receipt.baseVersion.label, t)}</dd></div><div><dt>{t("tianyi.adoption.resultVersion")}</dt><dd>{authorVersionLabel(project.title, receipt.status === "undone" ? receipt.compensation?.resultVersion.label : receipt.resultVersion.label, t)}</dd></div><div><dt>{t("tianyi.adoption.impact")}</dt><dd>{receipt.structuredDiff.length ? t("tianyi.adoption.impactCount").replace("{count}", String(receipt.structuredDiff.length)) : t("tianyi.adoption.newVersion")}</dd></div><div><dt>{t("tianyi.workspace.source")}</dt><dd>{receipt.sourceRefs.length ? t("tianyi.adoption.sourceCount").replace("{count}", String(receipt.sourceRefs.length)) : t("tianyi.adoption.sourceRetained")}</dd></div></dl>
      <details><summary>{t("tianyi.adoption.viewChanges")}</summary><ul>{receipt.structuredDiff.map((item) => <li key={item.id}>{item.summary}</li>)}</ul></details>
      <details><summary>{t("tianyi.adoption.technicalDetails")}</summary><dl><div><dt>{t("tianyi.adoption.receiptId")}</dt><dd>{receipt.receiptId}</dd></div><div><dt>{t("tianyi.adoption.targetId")}</dt><dd>{receipt.targetStoryId}</dd></div><div><dt>{t("tianyi.adoption.eventId")}</dt><dd>{receipt.appliedEventId}</dd></div></dl></details>
      {receipt.status === "active" ? <button type="button" disabled={busy} onClick={() => void run((token) => undoTianyiCreativeEvent({ projectId: project.id, sessionId, candidateId, token }))}><RotateCcw />{t("tianyi.adoption.undo")}</button> : <p><RotateCcw />{t("tianyi.adoption.compensation").replace("{id}", receipt.compensation?.eventId ?? "-")}</p>}
    </section>}
    {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
  </section>;
}

function authorVersionLabel(storyTitle: string, value: string | undefined, t: (key: TranslationKey) => string): string {
  const match = /(?:^|\D)(\d+)(?:\D|$)/u.exec(value ?? "");
  return t("tianyi.adoption.version").replace("{title}", storyTitle).replace("{version}", String(Math.max(1, Number(match?.[1] ?? 1))));
}

function authorImpactLabel(review: TianyiCreativeEventReview, t: (key: TranslationKey) => string): string {
  const changes = review.impact?.impact?.events.length ?? review.impact?.preview?.change.length ?? 0;
  const relations = review.impact?.impact?.relationships.length ?? 0;
  return changes || relations
    ? t("tianyi.adoption.eventImpact").replace("{events}", String(changes || 1)).replace("{relations}", relations ? t("tianyi.adoption.relationImpact").replace("{count}", String(relations)) : "")
    : t("tianyi.adoption.impactChecked");
}
