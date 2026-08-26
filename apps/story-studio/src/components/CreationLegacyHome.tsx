/*
 * DEPRECATE_NO_DELETE compatibility surface.
 *
 * The neutral external-adapter hub is the default Creation entry. This
 * retained component keeps the former artifact-list/start-dialog surface
 * available to an explicit compatibility caller while its writer remains the
 * existing OutputArtifact owner. It is intentionally not mounted by the R0
 * hub and does not create a new semantic store.
 */
import { Archive, BookOpenText, Clapperboard, FilePlus2, FolderKanban, Gamepad2, Images, Languages, Pencil, Play, Search, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { OutputArtifact, OutputArtifactType } from "../lib/localTransport";
import type { CreationRouteMode } from "../product-shell/authoringRouteState";

type LegacyFormat = { type: OutputArtifactType; label: string; description: string; Icon: LucideIcon; planned?: boolean };
const legacyFormats: LegacyFormat[] = [
  { type: "novel", label: "小说", description: "从卷、章与场景开始书写", Icon: BookOpenText },
  { type: "screenplay", label: "剧本", description: "按场次、角色与对白展开", Icon: Clapperboard },
  { type: "comic", label: "漫画 / 漫剧", description: "Page、Panel、镜头与媒体引用", Icon: Images },
  { type: "novel", label: "翻译 / 改编", description: "从已有作品继续创作", Icon: Languages },
  { type: "interactive-drama", label: "互动叙事", description: "分支节点与交互剧本", Icon: Gamepad2, planned: true }
];

export function CreationLegacyHome(props: {
  projectTitle: string;
  artifacts: OutputArtifact[];
  onCreate(type: OutputArtifactType): void;
  onOpen(artifact: OutputArtifact): void;
  onRename(artifact: OutputArtifact, title: string): void;
  onArchive(artifact: OutputArtifact): void;
  onOpenMedia(): void;
  routeMode: CreationRouteMode;
  onRouteMode(mode: CreationRouteMode): void;
  onOpenMultiverse(): void;
}) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const route = legacyRouteDetails(props.routeMode);
  const artifacts = useMemo(() => props.artifacts.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).filter((artifact) => !query.trim() || `${artifact.title} ${legacyLabelFor(artifact.type)} ${legacySourceLabel(artifact)}`.toLowerCase().includes(query.trim().toLowerCase())), [props.artifacts, query]);
  const routeArtifacts = route.type ? artifacts.filter((artifact) => route.matches(artifact.type)) : artifacts;
  return <section className="workbench creation-home creation-legacy-home" data-testid="creation-legacy-home" data-creation-route={props.routeMode}>
    <header className="creation-home-header"><div><small>兼容入口 · {props.projectTitle}</small><h1>{route.title}</h1><p>保留的旧 OutputArtifact 结构入口，仅供显式兼容调用。</p></div><div className="creation-home-primary-actions">{props.routeMode === "hub" ? <><button type="button" className="primary-action" onClick={() => props.onCreate("novel")}><FilePlus2 />新建</button><button type="button" className="secondary-action" onClick={props.onOpenMedia}><FolderKanban />媒体</button></> : <button type="button" className="secondary-action" onClick={() => props.onRouteMode("hub")}>返回创作 Hub</button>}</div></header>
    {props.routeMode === "hub" ? <section className="creation-format-grid" aria-label="旧版产物类型">{legacyFormats.map(({ type, label, description, Icon, planned }) => <article key={label} className={planned ? "is-planned" : ""}><Icon /><strong>{label}</strong><small>{description}</small>{planned ? <span>规划中</span> : label === "翻译 / 改编" ? <button type="button" onClick={() => props.onRouteMode("translation-adaptation")}><Languages />进入准备</button> : <button type="button" onClick={() => props.onRouteMode(legacyRouteForType(type))}><FilePlus2 />进入</button>}</article>)}</section> : props.routeMode === "interactive" ? <section className="creation-route-notice"><Gamepad2 /><strong>旧互动叙事入口仍在规划中</strong><p>兼容入口不会模拟创建或写入新的内部生成器。</p></section> : props.routeMode === "translation-adaptation" ? <section className="creation-route-notice"><Languages /><strong>先在多元完成来源与审核</strong><p>旧入口保留导航，但不直接创建产物。</p><button type="button" className="primary-action" onClick={props.onOpenMultiverse}>前往多元准备来源</button></section> : <section className="creation-route-action"><button type="button" className="primary-action" onClick={() => props.onCreate(route.type!)}><FilePlus2 />新建{route.title}</button><button type="button" className="secondary-action" onClick={props.onOpenMedia}><FolderKanban />媒体</button></section>}
    {props.routeMode !== "interactive" && <section className="creation-project-list" aria-label="旧版创作项目"><header><div><strong>旧版项目</strong><span>{routeArtifacts.length}</span></div><label><Search /><input aria-label="搜索旧版创作项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、类型或来源" /></label></header>{routeArtifacts.length ? <div className="creation-artifact-table" role="table"><div role="row" className="creation-artifact-table-head"><span>标题</span><span>类型</span><span>状态</span><span>来源</span><span>最近编辑</span><span>操作</span></div>{routeArtifacts.map((artifact) => <div role="row" key={artifact.id} className={artifact.lifecycle === "archived" ? "is-archived" : ""}><span>{renamingId === artifact.id ? <form onSubmit={(event) => { event.preventDefault(); if (renameValue.trim()) props.onRename(artifact, renameValue.trim()); setRenamingId(null); }}><input autoFocus aria-label={`重命名${artifact.title}`} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /><button type="submit">保存</button></form> : <button type="button" className="creation-artifact-title" onClick={() => props.onOpen(artifact)}><strong>{artifact.title}</strong><small>{artifact.relativeId}</small></button>}</span><span>{legacyLabelFor(artifact.type)}</span><span>{legacyLifecycleLabel(artifact.lifecycle)}</span><span>{legacySourceLabel(artifact)}</span><span>{legacyFormatTime(artifact.updatedAt)}</span><span className="creation-artifact-actions"><button type="button" disabled={artifact.lifecycle === "archived"} onClick={() => props.onOpen(artifact)}><Play />继续</button><button type="button" onClick={() => { setRenamingId(artifact.id); setRenameValue(artifact.title); }}><Pencil />重命名</button><button type="button" disabled={artifact.lifecycle === "archived"} onClick={() => props.onArchive(artifact)}><Archive />归档</button></span></div>)}</div> : <div className="creation-project-empty"><BookOpenText /><strong>还没有匹配的旧版创作项目</strong><p>该组件仅保留旧入口，不改变 R0 的外部适配器主流程。</p></div>}</section>}
  </section>;
}

function legacyRouteForType(type: OutputArtifactType): CreationRouteMode { return ({ novel: "novel", screenplay: "screenplay", comic: "comic", "motion-comic": "comic", storyboard: "comic", "interactive-drama": "interactive" } as Record<OutputArtifactType, CreationRouteMode>)[type]; }
function legacyRouteDetails(mode: CreationRouteMode): { title: string; type: OutputArtifactType | null; matches(type: OutputArtifactType): boolean } {
  const routes: Record<CreationRouteMode, { title: string; type: OutputArtifactType | null; matches(type: OutputArtifactType): boolean }> = {
    hub: { title: "兼容创作 Hub", type: null, matches: () => true },
    novel: { title: "小说", type: "novel", matches: (type) => type === "novel" },
    screenplay: { title: "剧本", type: "screenplay", matches: (type) => type === "screenplay" },
    comic: { title: "漫画 / 漫剧", type: "comic", matches: (type) => type === "comic" || type === "motion-comic" || type === "storyboard" },
    interactive: { title: "互动叙事", type: null, matches: (type) => type === "interactive-drama" },
    "translation-adaptation": { title: "翻译 / 改编", type: null, matches: () => false },
    plugins: { title: "插件中心", type: null, matches: () => false }
  };
  return routes[mode];
}
function legacyLabelFor(type: OutputArtifactType): string { return ({ novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动叙事" } as Record<OutputArtifactType, string>)[type]; }
function legacyLifecycleLabel(value: OutputArtifact["lifecycle"]): string { return ({ draft: "草稿", queued: "排队中", generating: "生成中", review: "待审核", approved: "已定稿", archived: "已归档" } as const)[value]; }
function legacySourceLabel(artifact: OutputArtifact): string { return artifact.sourceUnits.length ? `参考了 ${artifact.sourceUnits.length} 份素材` : "从空白开始"; }
function legacyFormatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
