import { Network, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";

import { ProjectDirectoryTree } from "./ProjectDirectoryTree";
import { PendingReviewEntry } from "./PendingReviewEntry";
import { useProjectDirectoryProjection } from "./useProjectDirectoryProjection";
import type { StoryIntakeReviewTarget } from "./pendingReviewAggregation";
import { useI18n } from "../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import type { DirectoryWorkspaceState } from "./directoryWorkspaceState";
import { recordDirectoryReadDiagnostic } from "../../lib/directoryReadDiagnostics";

export type ProjectDirectoryMode = "classified" | "pending";

export function ProjectDirectoryPanel(props: { runtime: TianyanShellRuntimeState; project: Parameters<typeof useProjectDirectoryProjection>[0]; mode: ProjectDirectoryMode; directoryState: DirectoryWorkspaceState; onDirectoryState(state: DirectoryWorkspaceState): void; onClose(): void; onModeChange(mode: ProjectDirectoryMode): void; onOpenPendingReview(target: StoryIntakeReviewTarget | null): void; onOpenRelationReview(): void; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void; selectedObjectId: string | null; onCreateProject(title: string): Promise<void> }) {
  const { t } = useI18n();
  const replace = (key: "directory.pendingBatchSummary" | "directory.pendingSourceBreakdown" | "directory.pendingOtherBreakdown" | "directory.pendingProcessedSummary", values: Record<string, number | string>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), t(key));
  const state = useProjectDirectoryProjection(props.project, t, props.runtime);
  const [emptyActionError, setEmptyActionError] = useState<string | null>(null);
  const storyIntakeBatches = Array.from(new Map((state.pending?.items ?? [])
    .filter((item) => item.storyIntakeTarget)
    .map((item) => [item.sourceBatch.id, { id: item.sourceBatch.id, label: item.sourceBatch.label, target: item.storyIntakeTarget!, pendingCount: 0, totalCount: 0 }])).values())
    .map((batch) => ({ ...batch, pendingCount: (state.pending?.items ?? []).filter((item) => item.pending && item.sourceBatch.id === batch.id).length, totalCount: (state.pending?.items ?? []).filter((item) => item.sourceBatch.id === batch.id).length }));
  const relationCandidateCount = (state.pending?.items ?? []).filter((item) => item.pending && item.sourceBatch.label === "\u4e8b\u4ef6\u5173\u7cfb\u5019\u9009").length;
  const pendingLoading = state.pendingStatus === "loading";
  const pendingFailed = state.pendingStatus === "failed";
  const pendingReady = state.pendingStatus === "ready";
  const pendingCount = state.pending?.pendingCount ?? 0;
  const storyIntakePendingCount = storyIntakeBatches.reduce((count, batch) => count + batch.pendingCount, 0);
  const otherPendingCount = Math.max(0, pendingCount - storyIntakePendingCount - relationCandidateCount);
  const renderedUnitCount = state.projection?.groups.find((group) => group.id === "directory.story")?.children?.find((item) => item.id === "directory.story.units")?.count ?? 0;
  useEffect(() => {
    recordDirectoryReadDiagnostic({ phase: "panel-render", projectId: props.project?.id ?? null, responseProjectId: state.projection?.projectId ?? null, unitCount: renderedUnitCount, classifiedCount: state.projection?.classifiedCount ?? 0, outcome: state.error ? "failed" : state.projectId ? "ready" : "empty", reason: state.pendingStatus });
  }, [props.project?.id, renderedUnitCount, state.error, state.pendingStatus, state.projectId, state.projection?.classifiedCount, state.projection?.projectId]);
  return <aside className="project-directory-panel" aria-label={t("panel.projectDirectory")} data-story-fact-owner="false">
    <header>
      <h2>{t("directory.label")}</h2>
      <button type="button" className="project-directory-close" aria-label={t("panel.closeProjectDirectory")} title={t("panel.closeProjectDirectory")} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <div className="project-directory-tabs" role="tablist" aria-label={t("panel.projectDirectory")}>
      <button type="button" role="tab" aria-selected={props.mode === "classified"} onClick={() => props.onModeChange("classified")}><span>{t("directory.classified")}</span><strong>{state.projection?.classifiedCount ?? 0}</strong></button>
      <button type="button" role="tab" aria-selected={props.mode === "pending"} onClick={() => props.onModeChange("pending")}><span>{t("directory.pending")}</span><strong>{pendingReady ? state.projection?.pendingCount ?? 0 : pendingLoading ? "…" : "—"}</strong></button>
    </div>
    {props.mode === "classified" && <>
      {state.projection && <ProjectDirectoryTree key={state.projection.projectId} groups={state.projection.groups} selectedObjectId={props.selectedObjectId} projectId={props.project?.id ?? null} workVersionId={props.runtime.workVersionId ?? null} initialState={props.directoryState} onStateChange={props.onDirectoryState} onNavigate={props.onNavigate} onOpenReference={props.onOpenReference} />}
      {props.runtime.connectionState === "ready" && !props.project && <div className="project-directory-empty-state" data-directory-empty-shell-actions="true"><p>{t("directory.noProjectHint")}</p><div><button type="button" onClick={() => void props.onCreateProject(t("directory.untitledProject")).catch(() => setEmptyActionError(t("directory.newProjectFailed")))}>{t("directory.newProject")}</button><button type="button" onClick={() => window.location.assign("/settings/storage#transfer")}>{t("directory.openImport")}</button></div>{emptyActionError && <p role="alert">{emptyActionError}</p>}</div>}
      {props.project && state.projection?.groups.length === 0 && <p className="project-directory-empty">{t("directory.empty")}</p>}
    </>}
    {props.mode === "pending" && <section className="pending-review-directory-summary" aria-label={t("directory.pendingLabel")} data-story-fact-owner="false" data-pending-status={state.pendingStatus}>
      {pendingLoading ? <p className="pending-review-loading" role="status">{t("directory.pendingLoading")}</p> : pendingFailed ? <p className="pending-review-loading" role="alert">{t("directory.pendingUnavailable")}</p> : <>
      <PendingReviewEntry count={pendingCount} batchCount={storyIntakeBatches.length} onOpen={() => props.onOpenPendingReview(state.pending?.storyIntakeTargets[0] ?? null)} />
      <p>{storyIntakeBatches.length ? replace("directory.pendingBatchSummary", { count: pendingCount, batches: storyIntakeBatches.length }) : t("directory.pendingEntryDescription")}</p>
      <section className="pending-review-breakdown" aria-label={t("directory.pendingCategoryLabel")}>
        <div><small>{t("directory.pendingSourceLabel")}</small><strong>{replace("directory.pendingSourceBreakdown", { storyIntake: storyIntakePendingCount, relations: relationCandidateCount, other: otherPendingCount ? replace("directory.pendingOtherBreakdown", { count: otherPendingCount }) : "" })}</strong></div>
        <div><small>{t("directory.pendingCategory.processed")}</small><strong>{replace("directory.pendingProcessedSummary", { count: state.pending?.categoryCounts.processed ?? 0 })}</strong><span>{t("directory.pendingProcessedExcluded")}</span></div>
      </section>
      {storyIntakeBatches.length > 0 && <ul className="pending-review-story-intake-batches" aria-label="Story Intake source batches">
        {storyIntakeBatches.map((batch) => <li key={batch.id} data-pending-story-intake-batch="true"><button type="button" onClick={() => props.onOpenPendingReview(batch.target)}><span>{batch.label}</span><strong>{t("directory.pendingBatchItemCount").replace("{pending}", String(batch.pendingCount)).replace("{total}", String(batch.totalCount))}</strong></button></li>)}
        {relationCandidateCount > 0 && <li className="is-relation"><button type="button" onClick={props.onOpenRelationReview}><span><Network aria-hidden="true" />{t("directory.pendingRelations")}</span><strong>{t("directory.pendingItemCount").replace("{count}", String(relationCandidateCount))}</strong></button></li>}
      </ul>}
      {props.project && <small>{t("directory.pendingScope").replace("{story}", props.project.title).replace("{version}", props.runtime.workVersionLabel ? ` · ${props.runtime.workVersionLabel}` : "")}</small>}
      </>}
    </section>}
    {(props.runtime.connectionState === "unavailable" || state.error) && <div className="project-directory-connection" role="alert"><strong>{t("directory.connectionUnavailable")}</strong><p>{t("directory.connectionHint")}</p><button type="button" onClick={props.runtime.retryConnection}><RotateCcw aria-hidden="true" />{t("directory.retryConnection")}</button></div>}
  </aside>;
}
