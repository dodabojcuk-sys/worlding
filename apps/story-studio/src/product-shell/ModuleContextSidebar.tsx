import { BookOpen, CircleDot, Database, FileText, History, ListTree, ScanSearch, Sparkles, X } from "lucide-react";

import type { ProductWorkspaceMode } from "./navigation/topLevelDestinationRegistry";
import type { AuthorContextCounts, AuthorContextTarget } from "./AuthorLibraryHierarchy";
import { AuthorContextSelector } from "./AuthorContextSelector";

const MODULE_CONTEXT: Record<Exclude<ProductWorkspaceMode, "world" | "library">, { title: string; items: readonly string[]; icon: typeof BookOpen }> = {
  tianyi: { title: "天意", items: ["当前会话", "来源范围", "执行简报", "未决问题"], icon: Sparkles },
  "event-line": { title: "事件观测", items: ["当前故事", "观察镜头", "已确认事件", "时间范围"], icon: ListTree },
  nuwa: { title: "女娲", items: ["当前 Unit", "当前场景", "排演来源", "最近版本"], icon: CircleDot },
  multiverse: { title: "多元", items: ["来源成品", "派生范围", "非正史草稿", "历史版本"], icon: History },
  writing: { title: "创作", items: ["创作库", "当前文稿", "叙事单元", "修改建议"], icon: BookOpen },
  data: { title: "数据", items: ["作品概览", "结构与节奏", "资料质量", "来源范围"], icon: Database }
};

/** Context-only sidebars for workspaces that do not own a content navigator. */
export function ModuleContextSidebar(props: {
  mode: Exclude<ProductWorkspaceMode, "world" | "library">;
  projectTitle: string;
  counts: AuthorContextCounts;
  mobileOpen: boolean;
  onCloseMobile(): void;
  onSelect(target: AuthorContextTarget): void;
}) {
  const context = MODULE_CONTEXT[props.mode];
  const Icon = context.icon;
  return <aside className={`module-context-sidebar workspace-sidebar-slot ${props.mobileOpen ? "is-mobile-open" : ""}`} data-testid={`module-context-sidebar-${props.mode}`} data-mobile-open={props.mobileOpen ? "true" : "false"} data-state={props.mobileOpen ? "open" : "closed"} aria-label={`${props.projectTitle} ${context.title}上下文`} role={props.mobileOpen ? "dialog" : undefined} aria-modal={props.mobileOpen || undefined}>
    <header className="workspace-sidebar-header"><div><small>当前空间</small><strong>{context.title}</strong></div><Icon aria-hidden="true" /><button type="button" className="mobile-only icon-action" onClick={props.onCloseMobile} aria-label="关闭上下文"><X /></button></header>
    <div className="module-context-scroll"><section className="module-context-summary" aria-label={`${context.title}当前上下文`}>
      <small>当前任务</small>
      <ul>{context.items.map((item, index) => <li key={item}><span aria-hidden="true">{index === 0 ? <ScanSearch /> : index === 3 ? <History /> : <FileText />}</span>{item}</li>)}</ul>
    </section><AuthorContextSelector counts={props.counts} onSelect={props.onSelect} containedByMobileDrawer={props.mobileOpen} /></div>
  </aside>;
}
