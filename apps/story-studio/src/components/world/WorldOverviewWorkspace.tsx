import { ArrowRight, BookOpenText, GitBranch, Map as MapIcon, MapPin, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  getCreationSourcePortState,
  getVisualWorkbench,
  getWorldLibrary,
  listRelations,
  readWorldObject,
  type CreationSourcePortState,
  type VisualDocument,
  type WorldObject,
  type WorldObjectSummary
} from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

type OverviewData = {
  people: readonly WorldObject[];
  places: readonly WorldObject[];
  rules: readonly WorldObject[];
  maps: readonly VisualDocument[];
  pendingRelations: number;
  draftObjects: number;
  creation: CreationSourcePortState | null;
  partialErrors: readonly string[];
};

/** Read-only composition of existing owners; this page never becomes a World, Relation, Event, Map, or Creation owner. */
export function WorldOverviewWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    if (!projectId) return;
    void loadOverview(projectId, workVersionId).then((next) => { if (active) setData(next); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "世界内容暂时无法读取。");
    });
    return () => { active = false; };
  }, [projectId, workVersionId]);

  if (!projectId) return <main className="shell-workspace"><section className="world-overview-empty"><h1>先打开一个作品</h1><p>世界首页会呈现当前作品的人物、地点、设定与写作进度。</p></section></main>;
  if (error) return <main className="shell-workspace"><section className="world-overview-empty" role="alert"><h1>世界内容暂时无法读取</h1><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新读取</button></section></main>;
  if (!data) return <main className="shell-workspace"><section className="world-overview-empty" aria-busy="true"><p>正在整理当前作品的内容……</p></section></main>;

  const recentWriting = data.creation?.artifact ?? null;
  const storyUnit = data.creation?.storyUnit ?? null;
  const pendingCount = data.pendingRelations + data.draftObjects;
  return <main className="shell-workspace world-overview" aria-label="世界首页" data-testid="world-overview-workspace">
    <header className="world-overview-heading">
      <div><small>当前作品</small><h1>{props.runtime.project?.title ?? "未命名作品"}</h1><p>{props.runtime.workVersionLabel ? `${props.runtime.workVersionLabel} 的世界内容` : "尚未建立作品版本，仍可以先整理资料和地图。"}</p></div>
      <nav aria-label="世界常用入口"><button type="button" onClick={() => go("/library?libraryView=map")}><MapIcon aria-hidden="true" />查看地图</button><button type="button" onClick={() => go("/library?libraryView=relations")}><GitBranch aria-hidden="true" />查看关系</button></nav>
    </header>

    <section className="world-overview-writing" aria-labelledby="world-writing-title">
      <div><small>最近写到</small><h2 id="world-writing-title">{recentWriting?.title ?? storyUnit?.title ?? "还没有创作稿"}</h2><p>{recentWriting ? excerpt(recentWriting.content) : storyUnit?.summary || "从已整理的人物、地点或事件开始创作。"}</p></div>
      <button type="button" onClick={() => go("/writing")}><BookOpenText aria-hidden="true" />{recentWriting ? "继续写作" : "开始创作"}<ArrowRight aria-hidden="true" /></button>
    </section>

    <div className="world-overview-grid">
      <OverviewCollection title="主要人物" icon={<UserRound aria-hidden="true" />} items={data.people} empty="还没有人物资料。" onOpen={(item) => go(`/world?${new URLSearchParams({ worldView: "character", characterId: item.id, characterOrigin: "/world" }).toString()}`)} onAll={() => go("/library?materialType=character")} />
      <OverviewCollection title="重要地点" icon={<MapPin aria-hidden="true" />} items={data.places} empty="还没有地点资料。" onOpen={(item) => go(`/library?${new URLSearchParams({ materialType: "location", materialId: item.id }).toString()}`)} onAll={() => go("/library?materialType=location")} />
      <OverviewCollection title="世界设定" icon={<Sparkles aria-hidden="true" />} items={data.rules} empty="还没有已记录的世界设定。" onOpen={(item) => go(`/library?${new URLSearchParams({ materialType: "rule", materialId: item.id }).toString()}`)} onAll={() => go("/library?materialType=rule")} />
    </div>

    <section className="world-overview-progress" aria-label="世界进展">
      <div><h2>地图与地域</h2><p>{data.maps.length ? `已有 ${data.maps.length} 张可继续编辑的地图：${data.maps.slice(0, 3).map((item) => item.title).join("、")}${data.maps.length > 3 ? "……" : ""}` : "还没有地图，可从空白区域图开始。"}</p><button type="button" onClick={() => go("/library?libraryView=map")}>{data.maps.length ? "打开地图集" : "创建地图"}</button></div>
      <div><h2>待处理的变化</h2><p>{pendingCount ? `${data.draftObjects} 项草稿资料，${data.pendingRelations} 条待确认关系。` : "当前没有待确认的资料或关系变化。"}</p><button type="button" onClick={() => go(pendingCount ? "/tianyi?directoryMode=pending" : "/library")}>{pendingCount ? "查看待确认" : "查看资料"}</button></div>
    </section>
    {data.partialErrors.length ? <details className="world-overview-read-warning"><summary>有部分内容暂时未能读取</summary><ul>{data.partialErrors.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
  </main>;
}

function OverviewCollection(props: { title: string; icon: ReactNode; items: readonly WorldObject[]; empty: string; onOpen(item: WorldObject): void; onAll(): void }) {
  return <section className="world-overview-collection"><header><span>{props.icon}<h2>{props.title}</h2></span><button type="button" onClick={props.onAll}>查看全部</button></header>{props.items.length ? <ul>{props.items.map((item) => {
    const preview = excerpt(item.body);
    const readablePreview = preview && preview !== item.title ? preview : (item.tags.length ? item.tags.slice(0, 3).join("·") : "暂无简介");
    return <li key={item.id}><button type="button" onClick={() => props.onOpen(item)}><strong>{item.title}</strong><span>{readablePreview}</span></button></li>;
  })}</ul> : <p>{props.empty}</p>}</section>;
}

async function loadOverview(projectId: string, workVersionId: string | null): Promise<OverviewData> {
  const [libraryResult, visualResult, relationResult, creationResult] = await Promise.allSettled([
    getWorldLibrary(projectId),
    getVisualWorkbench(projectId),
    workVersionId ? listRelations({ projectId, workVersionId, reviewState: "candidate", includeArchived: false }) : Promise.resolve({ relations: [] }),
    getCreationSourcePortState({ projectId, ...(workVersionId ? { workVersionId } : {}) })
  ]);
  if (libraryResult.status === "rejected") throw libraryResult.reason;
  const active = libraryResult.value.objects.filter((item) => item.status !== "archived");
  const pick = (type: WorldObjectSummary["type"], limit: number) => active.filter((item) => item.type === type).sort(recentFirst).slice(0, limit);
  const selected = [...pick("character", 3), ...pick("location", 3), ...pick("rule", 3)];
  const details = await Promise.all(selected.map(async (item) => {
    try { return await readWorldObject(projectId, item.id); } catch { return null; }
  }));
  const byId = new Map(details.filter((item): item is WorldObject => Boolean(item)).map((item) => [item.id, item]));
  const resolve = (type: WorldObjectSummary["type"]) => selected.filter((item) => item.type === type).flatMap((item) => { const detail = byId.get(item.id); return detail ? [detail] : []; });
  const partialErrors: string[] = [];
  if (visualResult.status === "rejected") partialErrors.push("地图列表暂时无法读取。");
  if (relationResult.status === "rejected") partialErrors.push("待确认关系暂时无法读取。");
  if (creationResult.status === "rejected") partialErrors.push("最近写作位置暂时无法读取。");
  if (details.some((item) => !item)) partialErrors.push("部分资料详情暂时无法读取，未用缓存内容代替。");
  return {
    people: resolve("character"),
    places: resolve("location"),
    rules: resolve("rule"),
    maps: visualResult.status === "fulfilled" ? visualResult.value.documents.filter((item) => item.type === "map" && !item.content.lifecycle.archived) : [],
    pendingRelations: relationResult.status === "fulfilled" ? relationResult.value.relations.length : 0,
    draftObjects: active.filter((item) => item.status === "draft").length,
    creation: creationResult.status === "fulfilled" ? creationResult.value : null,
    partialErrors
  };
}

function recentFirst(left: WorldObjectSummary, right: WorldObjectSummary) { return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.title.localeCompare(right.title, "zh-CN"); }
function excerpt(value: string | null | undefined): string { return String(value ?? "").replace(/^---[\s\S]*?---\s*/u, "").replace(/[#>*_`\[\]]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 110); }
function go(target: string) { window.location.assign(target); }
