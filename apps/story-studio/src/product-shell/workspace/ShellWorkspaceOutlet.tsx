import type { StoryStudioShellDestination } from "../navigation/topLevelDestinationRegistry";
import { R0EventLineProjection } from "../../components/event-observation/R0EventLineProjection";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";

export function ShellWorkspaceOutlet(props: {
  destination: StoryStudioShellDestination;
  shellLab: boolean;
  onOpenTianyi(): void;
}) {
  const { t } = useI18n();
  const label = props.shellLab ? t("shellLab.label") : t(props.destination.labelKey as TranslationKey);
  const summary = props.shellLab ? t("shellLab.description") : t(props.destination.summaryKey as TranslationKey);
  const note = props.shellLab ? t("workspace.boundary") : null;

  if (!props.shellLab && props.destination.id === "event-line") {
    return <main className="shell-workspace shell-workspace-event-line" aria-label={t(props.destination.labelKey as TranslationKey)}>
      <R0EventLineProjection onOpenTianyi={props.onOpenTianyi} />
    </main>;
  }

  return <main className="shell-workspace" aria-labelledby="shell-workspace-title">
    <section className="shell-workspace-stage" data-shell-lab={props.shellLab || undefined}>
      <p className="shell-workspace-eyebrow">{t("workspace.eyebrow")}</p>
      <h1 id="shell-workspace-title">{label}</h1>
      <p className="shell-workspace-summary">{summary}</p>
      {props.shellLab && <><div className="shell-workspace-rule" aria-hidden="true" />
        <p className="shell-workspace-status"><span aria-hidden="true" />{t("workspace.ready")}</p>
        <p className="shell-workspace-note">{note}</p></>}
    </section>
  </main>;
}
