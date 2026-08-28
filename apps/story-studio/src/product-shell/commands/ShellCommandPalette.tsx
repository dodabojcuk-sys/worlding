import { Archive, BookOpen, Database, Feather, GitBranch, Globe2, Languages, LibraryBig, MoonStar, Orbit, PanelLeftClose, PanelLeftOpen, Search, Sparkles, SunMedium, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TianyanR0PanelId } from "../../../../../src/storyContracts/tianyanR0ShellContract.ts";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import type { ShellTheme } from "../theme/theme";
import { STORY_STUDIO_SHELL_NAVIGATION_REGISTRY, type StoryStudioShellDestination } from "../navigation/topLevelDestinationRegistry";

const destinationIcons: Record<StoryStudioShellDestination["icon"], LucideIcon> = {
  world: Globe2,
  tianyi: Sparkles,
  "event-line": GitBranch,
  multiverse: Orbit,
  nuwa: Feather,
  library: LibraryBig,
  writing: BookOpen,
  data: Database,
  collections: Archive
};

type ShellCommand = {
  id: string;
  group: TranslationKey;
  label: string;
  icon: LucideIcon;
  run(): void;
};

export function ShellCommandPalette(props: {
  open: boolean;
  railCollapsed: boolean;
  panelVisibility: Record<TianyanR0PanelId, boolean>;
  theme: ShellTheme;
  onClose(): void;
  onNavigate(destination: StoryStudioShellDestination): void;
  onToggleRail(): void;
  onTogglePanel(panel: TianyanR0PanelId): void;
  onToggleLocale(): void;
  onToggleTheme(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) return;
    setQuery("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [props.open]);

  const commands = useMemo<ShellCommand[]>(() => {
    const navigate = STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.map((destination) => ({
      id: `destination:${destination.id}`,
      group: "command.groupSpaces" as const,
      label: t(destination.labelKey as TranslationKey),
      icon: destinationIcons[destination.icon],
      run: () => props.onNavigate(destination)
    }));
    const panelCommands: ShellCommand[] = (["project-directory", "global-tianyi"] as const).map((panel) => {
      const visible = props.panelVisibility[panel];
      const labelKey = panel === "project-directory"
        ? visible ? "panel.closeProjectDirectory" : "panel.openProjectDirectory"
        : visible ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi";
      return {
        id: `panel:${panel}`,
        group: "command.groupPanels",
        label: t(labelKey),
        icon: panel === "project-directory" ? PanelLeftOpen : Sparkles,
        run: () => props.onTogglePanel(panel)
      };
    });
    return [
      ...navigate,
      {
        id: "rail",
        group: "command.groupShell",
        label: t(props.railCollapsed ? "nav.expand" : "nav.collapse"),
        icon: props.railCollapsed ? PanelLeftOpen : PanelLeftClose,
        run: props.onToggleRail
      },
      ...panelCommands,
      {
        id: "locale",
        group: "command.groupShell",
        label: t("command.toggleLanguage"),
        icon: Languages,
        run: props.onToggleLocale
      },
      {
        id: "theme",
        group: "command.groupShell",
        label: t("command.toggleTheme"),
        icon: props.theme === "cloud-ink" ? MoonStar : SunMedium,
        run: props.onToggleTheme
      }
    ];
  }, [props, t]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = commands.filter((command) => command.label.toLocaleLowerCase().includes(normalizedQuery));
  const groups = [...new Set(matches.map((command) => command.group))];

  if (!props.open) return null;
  const execute = (command: ShellCommand) => {
    command.run();
    props.onClose();
  };

  return <div className="shell-command-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && props.onClose()}>
    <section className="shell-command-palette" role="dialog" aria-modal="true" aria-labelledby="shell-command-title" onKeyDown={(event) => event.key === "Escape" && props.onClose()}>
      <header className="shell-command-header">
        <Search aria-hidden="true" />
        <label id="shell-command-title" className="shell-visually-hidden" htmlFor="shell-command-input">{t("command.title")}</label>
        <input ref={inputRef} id="shell-command-input" type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("command.placeholder")} />
        <button type="button" className="shell-icon-button" aria-label={t("common.close")} title={t("common.close")} onClick={props.onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="shell-command-results" aria-live="polite">
        {groups.map((group) => <section key={group} className="shell-command-group" aria-label={t(group)}>
          <h2>{t(group)}</h2>
          {matches.filter((command) => command.group === group).map((command) => {
            const Icon = command.icon;
            return <button type="button" key={command.id} onClick={() => execute(command)}>
              <Icon aria-hidden="true" />
              <span>{command.label}</span>
            </button>;
          })}
        </section>)}
        {matches.length === 0 && <p className="shell-command-empty">{t("command.empty")}</p>}
      </div>
    </section>
  </div>;
}
