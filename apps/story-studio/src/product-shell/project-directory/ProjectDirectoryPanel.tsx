import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";

import { ProjectDirectoryTree } from "./ProjectDirectoryTree";
import { PendingReviewPanel } from "./PendingReviewPanel";
import { useProjectDirectoryProjection } from "./useProjectDirectoryProjection";
import { useI18n } from "../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type ProjectDirectoryMode = "classified" | "pending";

export function ProjectDirectoryPanel(props: { runtime: TianyanShellRuntimeState; project: Parameters<typeof useProjectDirectoryProjection>[0]; mode: ProjectDirectoryMode; onModeChange(mode: ProjectDirectoryMode): void; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void; selectedObjectId: string | null }) {
  const { t } = useI18n();
  const state = useProjectDirectoryProjection(props.project, t, props.runtime);
  return <aside className="project-directory-panel" aria-label={t("panel.projectDirectory")} data-story-fact-owner="false">
    <header>
      <h2>{t("directory.label")}</h2>
    </header>
    <div className="project-directory-tabs" role="tablist" aria-label={t("panel.projectDirectory")}>
      <button type="button" role="tab" aria-selected={props.mode === "classified"} onClick={() => props.onModeChange("classified")}><span>{t("directory.classified")}</span><strong>{state.projection?.classifiedCount ?? 0}</strong></button>
      <button type="button" role="tab" aria-selected={props.mode === "pending"} onClick={() => props.onModeChange("pending")}><span>{t("directory.pending")}</span><strong>{state.projection?.pendingCount ?? 0}</strong></button>
    </div>
    {props.mode === "classified" && <>
      {state.projection && <ProjectDirectoryTree groups={state.projection.groups} selectedObjectId={props.selectedObjectId} onNavigate={props.onNavigate} onOpenReference={props.onOpenReference} />}
      {state.projection?.groups.length === 0 && <p className="project-directory-empty">{t("directory.empty")}</p>}
    </>}
    {props.mode === "pending" && <PendingReviewPanel runtime={props.runtime} onOpenSource={props.onOpenReference} />}
    {state.error && <p className="project-directory-empty">{t("directory.unavailable")}</p>}
  </aside>;
}
