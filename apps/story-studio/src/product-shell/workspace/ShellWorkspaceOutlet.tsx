import type { StoryStudioShellDestination } from "../navigation/topLevelDestinationRegistry";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";

export function ShellWorkspaceOutlet(props: {
  destination: StoryStudioShellDestination;
  shellLab: boolean;
}) {
  const { t } = useI18n();
  const label = props.shellLab ? t("shellLab.label") : t(props.destination.labelKey as TranslationKey);
  const summary = props.shellLab ? t("shellLab.description") : t(props.destination.summaryKey as TranslationKey);
  const note = props.shellLab
    ? t("workspace.boundary")
    : props.destination.id === "tianyi"
    ? t("workspace.tianyiNote")
    : props.destination.id === "collections"
      ? t("workspace.collectionsNote")
      : t("workspace.boundary");

  return <main className="shell-workspace" aria-labelledby="shell-workspace-title">
    <section className="shell-workspace-stage" data-shell-lab={props.shellLab || undefined}>
      <p className="shell-workspace-eyebrow">{t("workspace.eyebrow")}</p>
      <h1 id="shell-workspace-title">{label}</h1>
      <p className="shell-workspace-summary">{summary}</p>
      <div className="shell-workspace-rule" aria-hidden="true" />
      <p className="shell-workspace-status"><span aria-hidden="true" />{t("workspace.ready")}</p>
      <p className="shell-workspace-note">{note}</p>
    </section>
  </main>;
}
