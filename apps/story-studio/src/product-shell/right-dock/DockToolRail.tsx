import { PAGE_TOOL_REGISTRY } from "../../components/page-tools/pageToolRegistry";
import { PanelRightClose, PanelRightOpen, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { DockToolId } from "./types";

export function DockToolRail(props: { compact: boolean; expanded: boolean; activeToolId: DockToolId | null; onToggle(toolId: DockToolId): void; onToggleExpanded(): void }) {
  const { t } = useI18n();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const previousActiveToolId = useRef<DockToolId | null>(props.activeToolId);
  useEffect(() => {
    if (!props.compact) setLauncherOpen(false);
  }, [props.compact]);
  useEffect(() => {
    if (!launcherOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setLauncherOpen(false);
      window.requestAnimationFrame(() => launcherRef.current?.focus());
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [launcherOpen]);
  useEffect(() => {
    const previous = previousActiveToolId.current;
    previousActiveToolId.current = props.activeToolId;
    if (!previous || props.activeToolId) return;
    window.requestAnimationFrame(() => {
      if (props.compact) launcherRef.current?.focus();
      else document.querySelector<HTMLButtonElement>(`.dock-tool-rail [data-tool-id="${previous}"]`)?.focus();
    });
  }, [props.activeToolId, props.compact]);
  const toggleLabel = t(props.expanded ? "dock.collapseTools" : "dock.expandTools");
  const ToggleIcon = props.expanded ? PanelRightClose : PanelRightOpen;
  const renderTool = (tool: typeof PAGE_TOOL_REGISTRY[number]) => {
    const Icon = tool.icon;
    const active = props.activeToolId === tool.id;
    const available = tool.availability === "available";
    return <button
      type="button"
      key={tool.id}
      aria-label={t(tool.labelKey)}
      title={`${t(tool.labelKey)} · ${t(tool.descriptionKey)}`}
      aria-pressed={active}
      data-tool-id={tool.id}
      data-availability={tool.availability}
      disabled={!available}
      onClick={() => { props.onToggle(tool.id); setLauncherOpen(false); }}
    >
      <Icon aria-hidden="true" />
      <span>{t(tool.labelKey)}</span>
    </button>;
  };
  return <aside className="dock-tool-rail" data-expanded={props.expanded} data-compact={props.compact} aria-label={t("dock.tools")}>
    {props.compact ? <>
      <button ref={launcherRef} className="dock-tool-launcher" type="button" aria-label={t("dock.tools")} aria-expanded={launcherOpen} aria-controls="dock-tool-launcher-menu" onClick={() => setLauncherOpen((open) => !open)}><Wrench aria-hidden="true" /><span>{t("dock.tools")}</span></button>
      {launcherOpen ? <section id="dock-tool-launcher-menu" className="dock-tool-launcher-menu" role="menu" aria-label={t("dock.tools")}>{PAGE_TOOL_REGISTRY.filter((tool) => tool.availability === "available").map(renderTool)}</section> : null}
    </> : <>
    <header className="dock-tool-rail-header">
      <strong>{t("dock.tools")}</strong>
      <button className="dock-tool-rail-toggle" type="button" aria-expanded={props.expanded} aria-label={toggleLabel} title={toggleLabel} onClick={props.onToggleExpanded}>
        <ToggleIcon aria-hidden="true" />
      </button>
    </header>
    <section className="dock-tool-rail-list">
      {PAGE_TOOL_REGISTRY.map(renderTool)}
    </section>
    </>}
  </aside>;
}
