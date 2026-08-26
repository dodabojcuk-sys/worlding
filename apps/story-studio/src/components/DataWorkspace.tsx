import { ArrowRight, BarChart3, Database, ScanSearch, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import type { OutputArtifact, StoryUnit, WorldObjectSummary } from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { eventLineEventMetadata } from "./eventLineCommittedEvents";
import { CharacterFateWorkspace } from "./character-fate/CharacterFateWorkspace";
import { ReplayEnvelopeDiagnosticsView } from "./ReplayEnvelopeDiagnosticsView";

type DataView = "overview" | "character-fate" | "receipt-envelope";

function readDataView(): DataView {
  const value = new URL(window.location.href).searchParams.get("view");
  return value === "character-fate" || value === "receipt-envelope" ? value : "overview";
}

function honestCount(value: number, noun: string): string {
  return value > 0 ? `${value} ${noun}` : "尚未分析";
}

export function DataWorkspace(props: {
  projectTitle: string;
  objects: WorldObjectSummary[];
  eventCount: number;
  relationCount: number;
  storyUnits: StoryUnit[];
  outputArtifacts: OutputArtifact[];
  sourceCount: number;
  providerConfigured: boolean;
  eventProjection: WorldObjectSummary[];
  eventFixture: boolean;
  onOpenWorkDock(prompt?: string): void;
  onOpenTianyi(): void;
  onOpenEventLine(eventId?: string, returnToCharacterFate?: true): void;
  onReturnCharacterState?(): void;
}) {
  const [view, setView] = useState<DataView>(() => readDataView());
  useEffect(() => {
    const sync = () => setView(readDataView());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const openView = (next: DataView) => {
    const url = new URL(window.location.href);
    if (next === "overview") {
      ["view", "fixture", "character", "trajectory", "axis", "selected", "case", "branch", "returned", "envelopeCase"].forEach((key) => url.searchParams.delete(key));
    } else {
      url.searchParams.set("view", next);
      url.searchParams.set("fixture", next === "character-fate" ? "character-fate" : "receipt-envelope");
      if (next === "receipt-envelope") url.searchParams.set("envelopeCase", "complete");
    }
    window.history.pushState({ ...(window.history.state ?? {}), workspace: "data", dataView: next }, "", `${url.pathname}${url.search}${url.hash}`);
    setView(next);
  };
  if (view === "character-fate") return <section className="workbench data-workspace is-character-fate" data-testid="data-workspace"><CharacterFateWorkspace projectTitle="潮痕来信 · 隔离演示" onBack={() => openView("overview")} onReturnCharacterState={props.onReturnCharacterState} onOpenEventLine={(eventId) => props.onOpenEventLine(eventId, true)} onOpenWorkDock={(prompt) => props.onOpenWorkDock(prompt)} /></section>;
  if (view === "receipt-envelope") return <section className="workbench data-workspace is-replay-envelope" data-testid="data-workspace"><ReplayEnvelopeDiagnosticsView missingReference={new URL(window.location.href).searchParams.get("envelopeCase") === "missing"} onBack={() => openView("overview")} /></section>;
  const metrics = [
    ["世界对象", honestCount(props.objects.length, "项")],
    ["已确认事件", honestCount(props.eventCount, "项")],
    ["关系记录", honestCount(props.relationCount, "项")],
    ["叙事单元", honestCount(props.storyUnits.length, "项")],
    ["输出产物", honestCount(props.outputArtifacts.length, "项")],
    ["来源范围", honestCount(props.sourceCount, "项")]
  ];
  const hasProjection = props.objects.length > 0 || props.eventCount > 0 || props.relationCount > 0 || props.storyUnits.length > 0 || props.outputArtifacts.length > 0 || props.sourceCount > 0;
  return <section className="workbench data-workspace" data-testid="data-workspace" data-event-projection={props.eventProjection.length ? "ready" : "empty"}>
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="数据" title="数据" context="当前作品分析" prototype="workbench" icon={<Database />} actions={<><button type="button" className="secondary-action" onClick={props.onOpenTianyi}><Sparkles />打开天意</button><button type="button" className="primary-action" onClick={() => props.onOpenWorkDock()}><ScanSearch />分析当前作品</button></>} />
    <main className="data-workspace-main">
      <header className="data-workspace-hero"><div><small>当前作品 · 只读投影</small><h1>看见作品正在发生什么</h1><p>这里汇总现有资料、事件、关系、叙事单元和产物。数据空间不会另建一套资料库，也不会因为查看分析而改写作品。</p></div><span className={`data-workspace-status ${hasProjection ? "is-ready" : "is-empty"}`}><BarChart3 />{hasProjection ? "已有基础投影" : "尚未分析"}</span></header>
      <section className="data-workspace-metrics" aria-label="作品概览">{metrics.map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{value === "尚未分析" ? "缺少可用数据" : "来自现有 owner 的只读投影"}</span></article>)}</section>
      <section className="data-workspace-columns"><article className="data-workspace-card"><header><div><small>结构与覆盖</small><h2>作品骨架</h2></div><Database /></header>{props.storyUnits.length ? <ul>{props.storyUnits.slice(0, 5).map((unit) => <li key={unit.id}><strong>{unit.title}</strong><span>{unit.lifecycle} · {unit.items.length} 个内容项</span></li>)}</ul> : <p className="data-workspace-unknown">尚未分析：当前没有可用于结构观察的叙事单元。</p>}</article><article className="data-workspace-card"><header><div><small>质量与时间范围</small><h2>需要作者判断的地方</h2></div><ScanSearch /></header><ul className="data-workspace-checks"><li><strong>来源完整度</strong><span>{props.sourceCount > 0 ? "已有来源，可继续检查" : "缺少数据"}</span></li><li><strong>重复与冲突</strong><span>{props.objects.length > 0 ? "等待分析" : "尚未分析"}</span></li><li><strong>模型分析</strong><span>{props.providerConfigured ? "可在工作 Dock 中请求" : "未连接模型，仍可查看现有投影"}</span></li></ul></article></section>
      <section className="data-character-fate-entry" aria-label="角色命运 K 线入口"><div><UserRound /><span><small>角色轨迹 · 有来源</small><h2>对照角色的实际、规划与候选</h2><p>复用 Event ID，分开叙事顺序与世界时间，不制造单一命运分数。</p></span></div><button type="button" className="primary-action" onClick={() => openView("character-fate")}>查看沈砚命运线<ArrowRight /></button></section>
      <details className="data-workspace-details"><summary>Replay-safe receipt 诊断</summary><p>诊断工具只显示隔离 Fixture 的稳定身份、完整性与安全导出边界。</p><button type="button" className="secondary-action" onClick={() => openView("receipt-envelope")}>打开 Receipt Envelope 诊断</button></details>
      <section className="data-event-projection" aria-label="事件线只读投影"><header><div><small>Event Line · 只读投影</small><h2>事件语义层级</h2><p>{props.eventFixture ? "隔离演示作品；事件与故事单元均为只读展示，不会写入当前作品。" : "读取现有 Event owner；数据空间不建立第二套事件表。"}</p></div><button type="button" className="secondary-action" onClick={() => props.onOpenEventLine()}><ArrowRight />打开事件线</button></header>{props.eventProjection.length ? <div>{props.eventProjection.slice(0, 5).map((event) => { const metadata = eventLineEventMetadata(event); return <button type="button" key={event.id} onClick={() => props.onOpenEventLine(event.id)}><span>{metadata.unitLabel ?? "未指定故事单元"} · {metadata.setPointLabel ?? "未指定集点"}</span><strong>{event.title}</strong><small>{metadata.narrativeTimeLabel} · {metadata.storyLineLabel ?? "主线"}</small><ArrowRight /></button>; })}</div> : <p className="data-workspace-unknown">尚无可读事件投影；事件需要先通过作者确认链。</p>}</section>
      <details className="data-workspace-details"><summary>来源与时间范围</summary><p>数据空间只读取既有世界对象、事件、关系、叙事单元、输出和来源投影。分析任务会先在天意工作 Dock 中显示范围，并等待作者确认；不会自动调用模型。</p></details>
    </main>
  </section>;
}
