import { BookOpenText, CircleUserRound, Compass, Database, GitFork, Globe2, Library, Milestone, MoreHorizontal, Settings2, SlidersHorizontal, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  TOP_LEVEL_DESTINATION_REGISTRY,
  type ProductWorkspaceMode,
  type TopLevelDestination
} from "./topLevelDestinationRegistry";

const destinationIcons: Record<TopLevelDestination["icon"], LucideIcon> = {
  world: Globe2,
  tianyi: Compass,
  "event-line": Milestone,
  nuwa: Sparkles,
  multiverse: GitFork,
  library: Library,
  writing: BookOpenText,
  data: Database
};

const controlCenter = {
  label: "控制中心",
  icon: SlidersHorizontal,
  detail: "连接、显示与本地设置"
} as const;

/** The rail is navigation only. Project selection now belongs to the centered header. */
export function ProductShellNavigation(props: {
  mode: ProductWorkspaceMode;
  collapsed: boolean;
  settingsOpen?: boolean;
  onMode(mode: ProductWorkspaceMode): void;
  onOpenControlCenter(): void;
  onOpenProfile?(): void;
  onBeforeMoreOpen?(): void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);
  const [mobileNavigation, setMobileNavigation] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const authorGlobalDestinations = TOP_LEVEL_DESTINATION_REGISTRY.filter((destination) => destination.enabled && destination.authorNavigation === "global");
  const mobileMoreDestinations = authorGlobalDestinations.filter((destination) => destination.visibility.mobile === "more");
  const moreActive = !props.settingsOpen && mobileMoreDestinations.some((destination) => destination.id === props.mode);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const sync = () => setMobileNavigation(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const choose = (destination: TopLevelDestination) => {
    moreRef.current?.removeAttribute("open");
    props.onMode(destination.id);
  };

  return <nav className="product-shell-navigation" aria-label="全局目的地" data-testid="product-shell-navigation" data-destination-registry="topLevelDestinationRegistry">
    <div className="product-shell-rail-top" data-global-product-rail="true">
      <button type="button" className="product-shell-mark" aria-label="打开天衍 Story Studio 首页" title="天衍 Story Studio" onClick={() => props.onMode("world")}><span aria-hidden="true">衍</span><small aria-hidden="true">天衍</small></button>
    </div>
    <div className="product-shell-destination-list" aria-label="工作空间">
      {authorGlobalDestinations.map((destination) => {
        const Icon = destinationIcons[destination.icon];
        const active = !props.settingsOpen && destination.id === props.mode;
        const railCurrent = active && (!mobileNavigation || destination.visibility.mobile === "primary");
        const mobileClass = destination.visibility.mobile === "more" ? "is-mobile-overflow" : destination.visibility.mobile === "hidden" ? "is-mobile-hidden" : "is-mobile-primary";
        return <button type="button" className={`product-shell-destination is-workspace ${mobileClass} ${active ? "is-active" : ""}`} aria-label={destination.displayName} aria-current={railCurrent ? "page" : undefined} title={destination.displayName} data-destination-id={destination.id} data-destination-group={destination.group} data-destination-order={destination.order} onClick={() => choose(destination)} key={destination.id}><span className="product-shell-destination-icon"><Icon /></span><span>{destination.displayName}</span></button>;
      })}
    </div>
    <details className={`product-shell-more ${moreActive ? "is-active" : ""}`} ref={moreRef}>
      <summary aria-label="更多工作面" onClick={() => props.onBeforeMoreOpen?.()}><span className="product-shell-destination-icon"><MoreHorizontal /></span><span>更多</span></summary>
      <div className="product-shell-more-menu" role="menu">
        {mobileMoreDestinations.map((destination) => {
          const Icon = destinationIcons[destination.icon];
          const active = !props.settingsOpen && destination.id === props.mode;
          return <button type="button" role="menuitem" className={active ? "is-active" : ""} aria-current={mobileNavigation && active ? "page" : undefined} onClick={() => choose(destination)} key={`more:${destination.id}`}><Icon /><span><strong>{destination.displayName}</strong><small>作者工作面</small></span></button>;
        })}
        <button type="button" role="menuitem" onClick={() => { moreRef.current?.removeAttribute("open"); props.onOpenControlCenter(); }} data-destination-id="control-center"><SlidersHorizontal /><span><strong>{controlCenter.label}</strong><small>{controlCenter.detail}</small></span></button>
        <button type="button" role="menuitem" onClick={() => { moreRef.current?.removeAttribute("open"); props.onOpenProfile?.(); }} data-destination-id="profile"><CircleUserRound /><span><strong>个人中心</strong><small>作者身份与作品归属</small></span></button>
      </div>
    </details>
    <footer className="product-shell-account-footer" aria-label="作者与设置">
      <button type="button" aria-label="打开个人中心" title="个人中心：作者身份与作品归属" data-global-account-action="personal-center" onClick={() => props.onOpenProfile?.()}><CircleUserRound /><span>个人</span></button>
      <button type="button" aria-label="打开设置" title="设置：模型、外观与编辑偏好" data-global-account-action="settings" onClick={props.onOpenControlCenter}><Settings2 /><span>设置</span></button>
    </footer>
  </nav>;
}
