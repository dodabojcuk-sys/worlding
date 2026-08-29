import { RotateCcw, X } from "lucide-react";
import { useState } from "react";

import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";

import { ProjectDirectoryTree } from "./ProjectDirectoryTree";
import { PendingReviewPanel } from "./PendingReviewPanel";
import { useProjectDirectoryProjection } from "./useProjectDirectoryProjection";
import { useI18n } from "../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type ProjectDirectoryMode = "classified" | "pending";

export function ProjectDirectoryPanel(props: { runtime: TianyanShellRuntimeState; project: Parameters<typeof useProjectDirectoryProjection>[0]; mode: ProjectDirectoryMode; onClose(): void; onModeChange(mode: ProjectDirectoryMode): void; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void; selectedObjectId: string | null; onCreateProject(title: string): Promise<void> }) {
  const { t } = useI18n();
  const state = useProjectDirectoryProjection(props.project, t, props.runtime);
  const [emptyActionError, setEmptyActionError] = useState<string | null>(null);
  return <aside className="project-directory-panel" aria-label={t("panel.projectDirectory")} data-story-fact-owner="false">
    <header>
      <h2>{t("directory.label")}</h2>
      <button type="button" className="project-directory-close" aria-label={t("panel.closeProjectDirectory")} title={t("panel.closeProjectDirectory")} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <div className="project-directory-tabs" role="tablist" aria-label={t("panel.projectDirectory")}>
      <button type="button" role="tab" aria-selected={props.mode === "classified"} onClick={() => props.onModeChange("classified")}><span>{t("directory.classified")}</span><strong>{state.projection?.classifiedCount ?? 0}</strong></button>
      <button type="button" role="tab" aria-selected={props.mode === "pending"} onClick={() => props.onModeChange("pending")}><span>{t("directory.pending")}</span><strong>{state.projection?.pendingCount ?? 0}</strong></button>
    </div>
    {props.mode === "classified" && <>
      {state.projection && <ProjectDirectoryTree groups={state.projection.groups} selectedObjectId={props.selectedObjectId} onNavigate={props.onNavigate} onOpenReference={props.onOpenReference} />}
      {props.runtime.connectionState === "ready" && !props.project && <div className="project-directory-empty-state" data-directory-empty-shell-actions="true"><p>{t("directory.noProjectHint")}</p><div><button type="button" onClick={() => void props.onCreateProject(t("directory.untitledProject")).catch(() => setEmptyActionError(t("directory.newProjectFailed")))}>{t("directory.newProject")}</button><button type="button" onClick={() => window.location.assign("/settings/storage#transfer")}>{t("directory.openImport")}</button></div>{emptyActionError && <p role="alert">{emptyActionError}</p>}</div>}
      {props.project && state.projection?.groups.length === 0 && <p className="project-directory-empty">{t("directory.empty")}</p>}
    </>}
    {props.mode === "pending" && <PendingReviewPanel runtime={props.runtime} onOpenSource={props.onOpenReference} />}
    {(props.runtime.connectionState === "unavailable" || state.error) && <div className="project-directory-connection" role="alert"><strong>{t("directory.connectionUnavailable")}</strong><p>{t("directory.connectionHint")}</p><button type="button" onClick={props.runtime.retryConnection}><RotateCcw aria-hidden="true" />{t("directory.retryConnection")}</button></div>}
  </aside>;
}
