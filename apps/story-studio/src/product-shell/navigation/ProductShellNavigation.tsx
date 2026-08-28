import {
  Archive,
  BookOpen,
  Database,
  Feather,
  GitBranch,
  Globe2,
  LibraryBig,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import {
  STORY_STUDIO_SHELL_NAVIGATION_REGISTRY,
  type StoryStudioShellDestination,
  type StoryStudioShellDestinationId
} from "./topLevelDestinationRegistry";

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

export function ProductShellNavigation(props: {
  active: StoryStudioShellDestinationId;
  collapsed: boolean;
  onSelect(destination: StoryStudioShellDestination): void;
  onToggleCollapsed(): void;
  onSettings(): void;
  onAccount(): void;
}) {
  const { t } = useI18n();
  const navRef = useRef<HTMLElement>(null);
  const primary = STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.filter((item) => item.kind === "workspace" && item.enabled);
  const derived = STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.filter((item) => item.kind === "derived" && item.enabled);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(navRef.current?.querySelectorAll<HTMLButtonElement>("[data-shell-destination]") ?? [])];
    const current = buttons.indexOf(event.currentTarget);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
    event.preventDefault();
  };

  const renderDestination = (destination: StoryStudioShellDestination) => {
    const Icon = destinationIcons[destination.icon];
    const label = t(destination.labelKey as TranslationKey);
    const active = props.active === destination.id;
    return <button
      type="button"
      className={`shell-space-link ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      data-shell-destination={destination.id}
      onClick={() => props.onSelect(destination)}
      onKeyDown={handleKeyDown}
      key={destination.id}
    >
      <span className="shell-space-icon" aria-hidden="true"><Icon /></span>
      <span className="shell-space-label">{label}</span>
    </button>;
  };

  return <nav ref={navRef} className="shell-space-rail" aria-label={t("nav.label")} data-collapsed={props.collapsed}>
    <button type="button" className="shell-brand" title={t("brand.name")} aria-label={t("brand.name")} onClick={() => props.onSelect(primary[0])}>
      <strong>{t("brand.name")}</strong>
      <span>{t("brand.romanized")}</span>
    </button>
    <div className="shell-space-section" aria-label={t("nav.primary")}>{primary.map(renderDestination)}</div>
    <div className="shell-space-divider" role="separator" />
    <div className="shell-space-section is-derived" aria-label={t("nav.derivative")}>{derived.map(renderDestination)}</div>
    <div className="shell-rail-spacer" />
    <div className="shell-rail-utility">
      <button type="button" className="shell-space-link" aria-label={t("nav.account")} title={t("nav.account")} onClick={props.onAccount}>
        <span className="shell-space-icon" aria-hidden="true"><UserRound /></span><span className="shell-space-label">{t("nav.account")}</span>
      </button>
      <button type="button" className="shell-space-link" aria-label={t("nav.settings")} title={t("nav.settings")} onClick={props.onSettings}>
        <span className="shell-space-icon" aria-hidden="true"><Settings /></span><span className="shell-space-label">{t("nav.settings")}</span>
      </button>
      <button type="button" className="shell-space-link shell-collapse-control" aria-label={t(props.collapsed ? "nav.expand" : "nav.collapse")} title={t(props.collapsed ? "nav.expand" : "nav.collapse")} onClick={props.onToggleCollapsed}>
        <span className="shell-space-icon" aria-hidden="true">{props.collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</span>
        <span className="shell-space-label">{t(props.collapsed ? "nav.expand" : "nav.collapse")}</span>
      </button>
    </div>
  </nav>;
}
