import { ArrowRight, BookOpen, FilePlus2, History, Link2, LoaderCircle, Paperclip, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  captureTianyiCreativeAuthorSource,
  decideTianyiCreativeCandidate,
  extractTianyiCreativeProjection,
  getTianyiCreativeProjection,
  getTianyiSessionMetadata,
  handoffTianyiCreativeCandidate,
  openTianyiSession,
  type TianyiCreativeProjection,
  type TianyiSessionMetadata
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";

type Lane = "creative" | "work";

export function TianyiConversationWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const { runtime } = props;
  const { t } = useI18n();
  const project = runtime.project;
  const [lane, setLane] = useState<Lane>(() => new URLSearchParams(window.location.search).get("tianyiLane") === "work" ? "work" : "creative");
  const [projection, setProjection] = useState<TianyiCreativeProjection | null>(null);
  const [metadata, setMetadata] = useState<TianyiSessionMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const restoreRequestedLane = () => {
      if (window.location.pathname === "/tianyi" && new URLSearchParams(window.location.search).get("tianyiLane") === "work") setLane("work");
    };
    restoreRequestedLane();
    window.addEventListener("popstate", restoreRequestedLane);
    return () => window.removeEventListener("popstate", restoreRequestedLane);
  }, []);

  const operationId = (label: string) => `operation.tianyi-golden-loop.${label}.${crypto.randomUUID()}`;
  const changeLane = (nextLane: Lane) => {
    setLane(nextLane);
    const url = new URL(window.location.href);
    url.searchParams.set("tianyiLane", nextLane);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const ensureConversation = useCallback(async () => {
    if (!project) throw new Error(t("tianyi.workspace.noProject"));
    if (runtime.tianyiConversationId) return runtime.tianyiConversationId;
    const opened = await runtime.withConnection((token) => openTianyiSession(project.id, operationId("open"), token));
    runtime.setTianyiConversationId(opened.sessionId);
    return opened.sessionId;
  }, [project, runtime, t]);

  const refresh = useCallback(async (sessionId: string, candidateId = runtime.activeTianyiCandidateId) => {
    if (!project) return;
    const [nextProjection, nextMetadata] = await runtime.withConnection((token) => Promise.all([
      getTianyiCreativeProjection(project.id, sessionId, token),
      getTianyiSessionMetadata(project.id, sessionId, token)
    ]));
    setProjection(nextProjection);
    setMetadata(Array.isArray(nextMetadata) ? nextMetadata.find((item) => item.id === sessionId) ?? null : nextMetadata);
    const activeCandidate = candidateId ?? nextProjection?.candidates.find((item) => item.state === "handed-off")?.candidateId ?? null;
    if (activeCandidate) runtime.setActiveTianyiCandidateId(activeCandidate);
  }, [project, runtime]);

  useEffect(() => {
    if (!runtime.tianyiConversationId || !project) return;
    void refresh(runtime.tianyiConversationId).catch(() => undefined);
  }, [project, refresh, runtime.tianyiConversationId]);

  const submitCreative = async () => {
    const text = runtime.creativeComposerDraft.trim();
    if (!text || !project || busy) return;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureConversation();
      const captureOperationId = operationId("capture");
      const captured = await runtime.withConnection((token) => captureTianyiCreativeAuthorSource({
        projectId: project.id,
        sessionId,
        operationId: captureOperationId,
        submissionId: operationId("submission"),
        text,
        collaborate: false,
        token
      }));
      const extracted = await runtime.withConnection((token) => extractTianyiCreativeProjection({
        projectId: project.id,
        sessionId,
        operationId: operationId("extract"),
        source: captured.source,
        fixture: deterministicThreeCandidates(text, t),
        token
      }));
      setProjection(extracted.projection);
      runtime.setCreativeComposerDraft("");
      await refresh(sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.workspace.prepareFailed")); }
    finally { setBusy(false); }
  };

  const preserveCandidate = async (candidateId: string) => {
    if (!project || !runtime.tianyiConversationId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await runtime.withConnection((token) => decideTianyiCreativeCandidate({ projectId: project.id, sessionId: runtime.tianyiConversationId!, candidateId, operationId: operationId("preserve"), decision: "deferred", token }));
      setProjection(result.projection);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.workspace.preserveFailed")); }
    finally { setBusy(false); }
  };

  const moveCandidateToWork = async (candidateId: string) => {
    if (!project || !runtime.tianyiConversationId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await runtime.withConnection((token) => handoffTianyiCreativeCandidate({ projectId: project.id, sessionId: runtime.tianyiConversationId!, candidateId, operationId: operationId("handoff"), token }));
      runtime.setActiveTianyiCandidateId(candidateId);
      setProjection(result.projection);
      changeLane("work");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.workspace.handoffFailed")); }
    finally { setBusy(false); }
  };

  const openEventLine = () => {
    if (!runtime.tianyiConversationId || !runtime.activeTianyiCandidateId) return;
    const params = new URLSearchParams({ tianyiSession: runtime.tianyiConversationId, tianyiCandidate: runtime.activeTianyiCandidateId });
    window.history.pushState({}, "", `/event-line?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeCandidate = useMemo(() => projection?.candidates.find((item) => item.candidateId === runtime.activeTianyiCandidateId) ?? null, [projection, runtime.activeTianyiCandidateId]);
  const draft = lane === "creative" ? runtime.creativeComposerDraft : runtime.workComposerDraft;
  const setDraft = lane === "creative" ? runtime.setCreativeComposerDraft : runtime.setWorkComposerDraft;

  if (!project) return <main className="shell-workspace tianyi-workspace"><section className="tianyi-workspace-empty"><Sparkles /><h1>{t("space.tianyi")}</h1><p>{t("tianyi.workspace.noProject")}</p></section></main>;

  return <main className="shell-workspace tianyi-workspace" aria-label={t("tianyi.workspaceLabel")} data-tianyi-conversation-id={runtime.tianyiConversationId ?? "not-started"} data-active-lane={lane}>
    <header className="tianyi-workspace-header">
      <div><small>TIANYI CONVERSATION</small><h1>{t("space.tianyi")}</h1></div>
      <div className="tianyi-lane-switch" role="tablist" aria-label={t("tianyi.workspace.modeLabel")}>
        <button type="button" role="tab" aria-selected={lane === "creative"} onClick={() => changeLane("creative")}>{t("tianyi.workspace.creativeMode")}</button>
        <button type="button" role="tab" aria-selected={lane === "work"} onClick={() => changeLane("work")}>{t("tianyi.workspace.workMode")}</button>
      </div>
      <p><History />{t("tianyi.workspace.continuity")}</p>
    </header>

    <div className="tianyi-workspace-body">
      <section className="tianyi-conversation-column">
        <section className="tianyi-visible-history" aria-label={t("tianyi.workspace.historyLabel")}>
          {metadata?.visibleMessages.length ? metadata.visibleMessages.map((message) => <article key={message.eventId} className={`is-${message.actor}`}><span>{message.actor === "author" ? t("tianyi.author") : t("space.tianyi")}</span><p>{message.visibleContent}</p></article>) : <div className="tianyi-conversation-welcome"><Sparkles /><h2>{t("tianyi.workspace.welcomeTitle")}</h2><p>{t("tianyi.workspace.welcomeBody")}</p><small>{t("tianyi.workspace.localOnly")}</small></div>}
        </section>

        {lane === "creative" ? <section className="tianyi-lane-stage" aria-label={t("tianyi.workspace.creativeMode")}>
          <div className="tianyi-stage-heading"><div><small>CREATIVE LANE</small><h2>{t("tianyi.workspace.creativeTitle")}</h2></div><span>{t("tianyi.workspace.creativeGuide")}</span></div>
          {projection?.summary ? <article className="tianyi-summary-card"><strong>{t("tianyi.workspace.summary")}</strong><p>{projection.summary}</p><small>{t("tianyi.workspace.source")}: {projection.summarySourceRefs[0]?.eventId.slice(0, 12)} · {t(projection.summaryState === "current" ? "tianyi.workspace.currentVersion" : "tianyi.workspace.refreshSummary")}</small></article> : null}
          {projection?.candidates.length ? <div className="tianyi-candidate-grid" aria-label={t("tianyi.workspace.candidateRegistry")}>{projection.candidates.map((candidate, index) => <article key={candidate.candidateId} data-candidate-state={candidate.state}><header><span>{t("tianyi.workspace.direction")} {index + 1}</span><small>{t(candidate.state === "deferred" ? "tianyi.workspace.preserved" : candidate.state === "handed-off" ? "tianyi.workspace.handedOff" : "tianyi.workspace.candidate")}</small></header><h3>{candidate.title}</h3><p>{candidate.summary}</p><small>{candidate.uncertainties.join(" · ")}</small><footer>{candidate.state === "pending" ? <><button type="button" onClick={() => preserveCandidate(candidate.candidateId)}>{t("tianyi.workspace.preserve")}</button><button type="button" className="primary-action" onClick={() => moveCandidateToWork(candidate.candidateId)}>{t("tianyi.workspace.enterWork")}<ArrowRight /></button></> : candidate.state === "handed-off" ? <button type="button" onClick={() => { runtime.setActiveTianyiCandidateId(candidate.candidateId); changeLane("work"); }}>{t("tianyi.workspace.continueWork")}</button> : <span>{t("tianyi.workspace.restoreHint")}</span>}</footer></article>)}</div> : null}
        </section> : <section className="tianyi-lane-stage" aria-label={t("tianyi.workspace.workMode")}>
          <div className="tianyi-stage-heading"><div><small>WORK LANE</small><h2>{activeCandidate?.title ?? t("tianyi.workspace.chooseCandidate")}</h2></div><span>{t("tianyi.workspace.workGuide")}</span></div>
          <div className="tianyi-work-contract">
            <dl><div><dt>{t("tianyi.workspace.workTarget")}</dt><dd>{activeCandidate?.summary ?? t("tianyi.workspace.chooseFromRegistry")}</dd></div><div><dt>{t("tianyi.workspace.targetStory")}</dt><dd>{project.title}</dd></div><div><dt>{t("tianyi.workspace.baseVersion")}</dt><dd>{runtime.workVersionLabel ?? t("tianyi.workspace.currentMainline")}</dd></div><div><dt>ContextPack</dt><dd>{runtime.sharedTianyiReferences.length ? t("tianyi.workspace.referenceCount").replace("{count}", String(runtime.sharedTianyiReferences.length)) : t("tianyi.workspace.authorScope")}</dd></div></dl>
            <label>{t("tianyi.workspace.workScope")}<select value={runtime.workScope} onChange={(event) => runtime.setWorkScope(event.target.value as TianyanShellRuntimeState["workScope"])}><option value="current-story">{t("tianyi.workspace.scope.story")}</option><option value="current-unit">{t("tianyi.workspace.scope.unit")}</option><option value="selected-events">{t("tianyi.workspace.scope.events")}</option></select></label>
          </div>
          {activeCandidate ? <TianyiAdoptionPanel runtime={runtime} onOpenEventLine={openEventLine} /> : <p className="tianyi-work-empty">{t("tianyi.workspace.workEmpty")}</p>}
        </section>}

        {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
        <section className="tianyi-workspace-composer">
          <textarea aria-label={t(lane === "creative" ? "tianyi.workspace.creativeDraft" : "tianyi.workspace.workDraft")} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder={t(lane === "creative" ? "tianyi.workspace.creativePlaceholder" : "tianyi.workspace.workPlaceholder")} />
          <div><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `attachment:${crypto.randomUUID()}`, label: t("tianyi.workspace.demoAttachment"), kind: "attachment" })}><Paperclip />{t("tianyi.workspace.attachment")}</button><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `source:${crypto.randomUUID()}`, label: t("tianyi.workspace.demoSource"), kind: "source" })}><Link2 />{t("tianyi.workspace.sourceAction")}</button>{lane === "creative" ? <button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}{t("tianyi.workspace.createCandidates")}</button> : <button type="button" className="tianyi-send" disabled={!draft.trim()} onClick={() => runtime.setWorkComposerDraft(draft)}><Send />{t("tianyi.workspace.refineCandidate")}</button>}</div>
        </section>
      </section>

      <aside className="tianyi-current-context" aria-label={t("tianyi.workspace.currentView")}>
        <header><strong>{t("tianyi.workspace.currentView")}</strong><small>{t("tianyi.workspace.readOnly")}</small></header>
        <section><BookOpen /><div><strong>{t("tianyi.workspace.context")}</strong><p>{project.title}</p><small>{runtime.workVersionLabel ?? t("tianyi.workspace.currentStory")}</small></div></section>
        <section><FilePlus2 /><div><strong>{t("tianyi.workspace.sharedReferences")}</strong>{runtime.sharedTianyiReferences.length ? runtime.sharedTianyiReferences.map((item) => <p key={item.id}>{item.label}</p>) : <p>{t("tianyi.workspace.noReferences")}</p>}</div></section>
        <section><Sparkles /><div><strong>{t("tianyi.workspace.candidateRegistry")}</strong><p>{t("tianyi.workspace.candidateCount").replace("{count}", String(projection?.candidates.length ?? 0))}</p><small>{t("tianyi.workspace.sharedVisibility")}</small></div></section>
      </aside>
    </div>
  </main>;
}

function deterministicThreeCandidates(text: string, t: (key: TranslationKey) => string) {
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 180);
  return {
    reply: t("tianyi.workspace.reply"),
    summary: t("tianyi.workspace.generatedSummary").replace("{excerpt}", excerpt),
    themes: [t("tianyi.workspace.theme.motive"), t("tianyi.workspace.theme.rule"), t("tianyi.workspace.theme.time")],
    openQuestions: [t("tianyi.workspace.question")],
    candidates: [
      { kind: "event", title: t("tianyi.workspace.candidate1Title"), summary: t("tianyi.workspace.candidate1Summary").replace("{excerpt}", excerpt), uncertainties: [t("tianyi.workspace.candidate1Uncertainty")] },
      { kind: "event", title: t("tianyi.workspace.candidate2Title"), summary: t("tianyi.workspace.candidate2Summary").replace("{excerpt}", excerpt), uncertainties: [t("tianyi.workspace.candidate2Uncertainty")] },
      { kind: "event", title: t("tianyi.workspace.candidate3Title"), summary: t("tianyi.workspace.candidate3Summary").replace("{excerpt}", excerpt), uncertainties: [t("tianyi.workspace.candidate3Uncertainty")] }
    ]
  };
}
