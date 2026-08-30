import type { StoryStudioShellDestination } from "../navigation/topLevelDestinationRegistry";
import { R0EventLineProjection } from "../../components/event-observation/R0EventLineProjection";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import { SettingsStorageRoute } from "../../settings/storage/SettingsStorageRoute";
import { AccountCenterWorkspace } from "./AccountCenterWorkspace";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import type { StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference.ts";
import { Sparkles } from "lucide-react";
import { useState } from "react";

export function ShellWorkspaceOutlet(props: {
  destination: StoryStudioShellDestination;
  shellLab: boolean;
  settingsOpen: boolean;
  accountOpen: boolean;
  runtime: TianyanShellRuntimeState;
  onOpenTianyi(reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[]): void;
  directoryObjectId: string | null;
}) {
  const { t } = useI18n();
  const label = props.shellLab ? t("shellLab.label") : t(props.destination.labelKey as TranslationKey);
  const summary = props.shellLab ? t("shellLab.description") : t(props.destination.summaryKey as TranslationKey);
  const note = props.shellLab ? t("workspace.boundary") : null;

  if (props.settingsOpen) return <SettingsStorageRoute presentation="workspace" />;
  if (props.accountOpen) return <AccountCenterWorkspace />;

  if (!props.shellLab && props.destination.id === "event-line") {
    return <main className="shell-workspace shell-workspace-event-line" aria-label={t(props.destination.labelKey as TranslationKey)}>
      <R0EventLineProjection runtime={props.runtime} onOpenTianyi={props.onOpenTianyi} selectedEventId={props.directoryObjectId} />
    </main>;
  }

  if (!props.shellLab && props.destination.id === "writing") {
    return <main className="shell-workspace shell-workspace-writing" aria-label={t(props.destination.labelKey as TranslationKey)}>
      <CreationSimulationEntry onOpenTianyi={props.onOpenTianyi} t={t} />
    </main>;
  }

  return <main className="shell-workspace" aria-labelledby="shell-workspace-title">
    <section className="shell-workspace-stage" data-shell-lab={props.shellLab || undefined}>
      <p className="shell-workspace-eyebrow">{t("workspace.eyebrow")}</p>
      <h1 id="shell-workspace-title">{label}</h1>
      <p className="shell-workspace-summary">{summary}</p>
      {props.directoryObjectId && <p className="shell-workspace-status" data-directory-focus={props.directoryObjectId}>{t("directory.focused")}: {props.directoryObjectId}</p>}
      {props.shellLab && <><div className="shell-workspace-rule" aria-hidden="true" />
        <p className="shell-workspace-status"><span aria-hidden="true" />{t("workspace.ready")}</p>
        <p className="shell-workspace-note">{note}</p></>}
    </section>
  </main>;
}

function CreationSimulationEntry(props: { onOpenTianyi(reference?: StoryStudioEventReference, initialDraft?: string): void; t(key: TranslationKey): string }) {
  const [draft, setDraft] = useState("");
  return <section className="shell-workspace-stage shell-workspace-simulation-entry">
    <p className="shell-workspace-eyebrow">{props.t("simulation.creation.eyebrow")}</p>
    <h1>{props.t("simulation.creation.title")}</h1>
    <p className="shell-workspace-summary">{props.t("simulation.creation.summary")}</p>
    <form onSubmit={(event) => { event.preventDefault(); props.onOpenTianyi(undefined, draft.trim()); setDraft(""); }}>
      <label><span>{props.t("simulation.creation.label")}</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} maxLength={6000} placeholder={props.t("simulation.creation.placeholder")} /></label>
      <button type="submit" className="primary-action" disabled={!draft.trim()}><Sparkles />{props.t("simulation.creation.submit")}</button>
    </form>
  </section>;
}
