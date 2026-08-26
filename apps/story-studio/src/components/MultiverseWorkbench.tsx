import { ArrowRight, Check, CircleAlert, FileOutput, GitCompareArrows, GitFork, Globe2, Languages, RefreshCcw, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";

import { projectDerivedLineStalenessR1, readDerivedEventLineR1, type DerivedEventLineR1, type DerivedTransformKindR1 } from "../../../../src/storyCreation/derivedEventLineR1.ts";
import type { OutputArtifact, OutputArtifactType, StoryUnit } from "../lib/localTransport";
import type { MultiverseRouteMode } from "../product-shell/authoringRouteState";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";

const modes: Array<{ id: DerivedTransformKindR1; label: string; description: string; Icon: typeof Languages; maturity: string }> = [
  { id: "translation", label: "翻译", description: "逐事件对齐、专名锁定与来源版本审核。", Icon: Languages, maturity: "L3 结构闭环" },
  { id: "pov", label: "视角切换", description: "评分后按可见、听闻、推断、未知和误解重建。", Icon: UserRound, maturity: "L3 确定性闭环" },
  { id: "if", label: "IF 线", description: "作者显式改变分岔点前提；不是女娲预测。", Icon: GitFork, maturity: "L2 合同骨架" },
  { id: "adaptation", label: "本土化 / 改编", description: "通过保留合同与改变合同创建独立派生线。", Icon: Globe2, maturity: "L2 合同骨架" }
];

type LineView = { unit: StoryUnit; model: DerivedEventLineR1; currentSource: StoryUnit | null };

export function MultiverseWorkbench(props: {
  projectTitle: string;
  units: StoryUnit[];
  artifacts: OutputArtifact[];
  onCreateLine(input: { kind: DerivedTransformKindR1; source: StoryUnit; title: string; targetLanguage: string; notes: string; actorLabel: string; threshold: number }): Promise<void>;
  onReviewAlignment(unit: StoryUnit, alignmentId: string, decision: "accept" | "return"): Promise<void>;
  onMarkReady(unit: StoryUnit): Promise<void>;
  onHandoff(unit: StoryUnit, outputType: OutputArtifactType): Promise<void>;
  onOpenArtifact(artifact: OutputArtifact): void;
  routeMode: MultiverseRouteMode;
  onRouteMode(mode: MultiverseRouteMode): void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [actorLabel, setActorLabel] = useState("阿岚");
  const [threshold, setThreshold] = useState(90);
  const [outputType, setOutputType] = useState<OutputArtifactType>("novel");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const sourceUnits = useMemo(() => props.units.filter((unit) => !readLineSafely(unit) && unit.lifecycle !== "archived"), [props.units]);
  const lines = useMemo<LineView[]>(() => props.units.flatMap((unit) => {
    const model = readLineSafely(unit);
    if (!model) return [];
    const currentSource = props.units.find((candidate) => candidate.id === model.sourceLineId) || null;
    return [{ unit, model: currentSource ? projectDerivedLineStalenessR1(unit, currentSource.version) : { ...model, staleSourceState: "stale" }, currentSource }];
  }), [props.units]);
  const active = lines.find((line) => line.unit.id === selectedLineId) || lines[0] || null;
  const source = sourceUnits.find((unit) => unit.id === sourceId) || sourceUnits[0] || null;

  async function run(action: () => Promise<void>): Promise<void> {
    setCreating(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败。"); } finally { setCreating(false); }
  }

  async function createLine(): Promise<void> {
    const kind = props.routeMode;
    if (!source || !title.trim() || !kind) return;
    await run(async () => {
      await props.onCreateLine({ kind, source, title: title.trim(), targetLanguage: targetLanguage.trim(), notes: notes.trim(), actorLabel: actorLabel.trim(), threshold });
      setTitle(""); setNotes("");
    });
  }

  if (!props.routeMode) return <section className="workbench multiverse-workbench multiverse-route-hub" data-testid="multiverse-workbench" data-multiverse-route="hub">
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="多元" title="多元创作" context="选择一种来源明确、可审核的变换方法" status={`已有 ${lines.length} 条派生线`} prototype="hub" icon={<GitFork />} />
    <main className="multiverse-route-hub-content">
      <section aria-label="选择多元创作方法"><h2>选择方法</h2><div className="derived-mode-grid">{modes.map((item) => { const Icon = item.Icon; return <button type="button" key={item.id} onClick={() => props.onRouteMode(item.id)}><Icon /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>; })}</div></section>
      <section aria-label="派生线历史"><h2>派生线历史</h2>{lines.length ? <ul>{lines.slice(0, 6).map((line) => <li key={line.unit.id}><strong>{line.unit.title}</strong><span>{transformLabel(line.model.transformKind)} · {reviewLabel(line.model.reviewState)}</span></li>)}</ul> : <p>尚无派生线。先选择一种方法并明确来源。</p>}</section>
    </main>
  </section>;
  const mode = modes.find((item) => item.id === props.routeMode)!;

  return <section className="workbench multiverse-workbench derived-line-workbench" data-testid="multiverse-workbench" data-multiverse-model="derived-event-line-r1" data-multiverse-method={props.routeMode}>
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="多元" title={mode.label} context="来源不变 · 逐事件对齐 · 作者审核后才可交给创作" status="Provider 0 次" prototype="workbench" icon={<GitFork />} actions={<button type="button" className="secondary-action" onClick={() => props.onRouteMode(null)}>返回多元首页</button>} />
    <main className="derived-line-layout">
      <aside className="derived-line-list" aria-label="来源与派生线">
        <header><strong>派生线</strong><small>{lines.length} 条·非正史</small></header>
        {lines.map((line) => <button type="button" key={line.unit.id} className={active?.unit.id === line.unit.id ? "is-active" : ""} onClick={() => setSelectedLineId(line.unit.id)}><GitFork /><span><strong>{line.unit.title}</strong><small>{transformLabel(line.model.transformKind)} · {reviewLabel(line.model.reviewState)}</small></span>{line.model.staleSourceState === "stale" && <CircleAlert aria-label="来源已过期" />}</button>)}
        {!lines.length && <p>还没有派生事件线。先选择一条已有 Unit 建立变换合同。</p>}
        <details className="derived-line-new" open={!lines.length}><summary>新建{mode.label}派生线</summary>
          <label><span>来源事件线／Unit</span><select value={source?.id || ""} onChange={(event) => setSourceId(event.target.value)}>{sourceUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.title}</option>)}</select></label>
          {props.routeMode === "translation" && <label><span>目标语言</span><input value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} /></label>}
          {props.routeMode === "pov" && <><label><span>新视角角色</span><input value={actorLabel} onChange={(event) => setActorLabel(event.target.value)} /></label><label><span>进入重建阈值：{threshold}</span><input type="range" min="80" max="100" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label></>}
          <label><span>{props.routeMode === "if" ? "分岔点与反事实前提" : props.routeMode === "adaptation" ? "保留／改变合同" : "术语、语气与变换范围"}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={mode.description} /></label>
          <label><span>派生线名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={source ? `${source.title}·${mode.label}` : mode.label} /></label>
          <button type="button" className="primary-action" disabled={!source || !title.trim() || creating} onClick={() => void createLine()}><GitFork />建立独立派生线</button>
        </details>
      </aside>

      <section className="derived-line-spine" aria-label="事件对齐与审核">
        {active ? <>
          <header><div><p className="eyebrow">{transformLabel(active.model.transformKind)} · {active.model.alignment.length} 个对齐节点</p><h1>{active.unit.title}</h1><p>来源「{active.model.sourceTitle}」；评审不会修改来源。</p></div><span className={`derived-review-state is-${active.model.reviewState}`}>{reviewLabel(active.model.reviewState)}</span></header>
          {active.model.staleSourceState === "stale" && <div className="derived-stale-warning" role="alert"><CircleAlert />来源 revision 已变化，已禁止审核和交给创作。请新建对齐版本。</div>}
          {active.model.povEligibility && <section className="pov-score-card" aria-label="视角可行性评分"><header><strong>{active.model.povEligibility.actorLabel} · {active.model.povEligibility.score}/100</strong><span>阈值 {active.model.povEligibility.threshold}</span></header><div>{active.model.povEligibility.explanation.map((item) => <span key={item}>{item}</span>)}</div><p>{active.model.povEligibility.eligible ? "已达到作者阈值，可进入知识重建审核。" : "未达到作者阈值，不能自动批准。"}</p></section>}
          <ol className="derived-alignment-list">{active.model.alignment.map((item, index) => <li key={item.alignmentId} data-alignment-id={item.alignmentId}>
            <div className="derived-node-index">{index + 1}</div>
            <section><header><strong>{kindLabel(item.sourceKind)}</strong>{item.knowledgeState && <span>{knowledgeLabel(item.knowledgeState)}</span>}<em className={`is-${item.review}`}>{alignmentReviewLabel(item.review)}</em></header><div className="derived-node-compare"><article><small>来源</small><p>{item.sourceText}</p></article><ArrowRight /><article><small>派生</small><p>{item.derivedText}</p></article></div>{item.gapProposal && <aside><strong>缺口补缀提案</strong><p>{item.gapProposal.text}</p></aside>}<footer><button type="button" className="secondary-action" disabled={creating || active.model.staleSourceState === "stale"} onClick={() => void run(() => props.onReviewAlignment(active.unit, item.alignmentId, "return"))}><X />退回</button><button type="button" className="primary-action" disabled={creating || active.model.staleSourceState === "stale"} onClick={() => void run(() => props.onReviewAlignment(active.unit, item.alignmentId, "accept"))}><Check />接受此事件</button></footer></section>
          </li>)}</ol>
        </> : <div className="derived-line-empty"><GitCompareArrows /><h1>从来源事件线开始</h1><p>多元不再直接生成派生文稿。先建立可审核的 Unit／Beat／Node 对齐。</p></div>}
      </section>

      <aside className="derived-line-inspector" aria-label="派生线检查器">
        {active ? <><header><strong>变换合同</strong><small>来源 revision 精确绑定</small></header><dl><div><dt>来源</dt><dd>{active.model.sourceTitle}</dd></div><div><dt>当前状态</dt><dd>{reviewLabel(active.model.reviewState)}</dd></div><div><dt>来源状态</dt><dd>{active.model.staleSourceState === "fresh" ? "当前" : "已过期"}</dd></div></dl><section><strong>必须保留</strong>{active.model.preservationContract.map((item) => <span key={item}><Check />{item}</span>)}</section><section><strong>允许改变</strong>{active.model.changeContract.map((item) => <span key={item}><RefreshCcw />{item}</span>)}</section>{active.model.transformKind === "if" && <section className="if-contract"><strong>IF 反事实前提</strong><p>{active.model.branchPoint}</p><small>持久派生线，不是运行次数或预测概率。</small></section>}<button type="button" className="primary-action" disabled={creating || active.model.staleSourceState === "stale" || active.model.alignment.some((item) => item.review !== "accepted") || active.model.reviewState === "ready-for-creation"} onClick={() => void run(() => props.onMarkReady(active.unit))}><Check />批准为可用于创作</button><hr /><label><span>创作类型</span><select value={outputType} onChange={(event) => setOutputType(event.target.value as OutputArtifactType)}><option value="novel">小说</option><option value="screenplay">剧本</option><option value="comic">漫画</option><option value="motion-comic">漫剧</option><option value="storyboard">分镜</option></select></label><button type="button" className="primary-action" disabled={creating || active.model.reviewState !== "ready-for-creation" || active.model.staleSourceState !== "fresh"} onClick={() => void run(() => props.onHandoff(active.unit, outputType))}><FileOutput />交给创作</button>{active.model.creationHandoffs.length > 0 && <section><strong>输出历史</strong>{active.model.creationHandoffs.map((receipt) => { const artifact = props.artifacts.find((item) => item.id === receipt.artifactId); return <button type="button" key={receipt.artifactId} disabled={!artifact} onClick={() => artifact && props.onOpenArtifact(artifact)}><FileOutput />{artifact?.title || receipt.artifactId}</button>; })}</section>}<details><summary>来源与技术详情</summary><code>{active.model.sourceLineId}</code><code>{active.model.sourceRevision}</code><code>{active.model.derivedLineId}</code></details></> : <p>选择一条派生线后查看审核与输出边界。</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </aside>
    </main>
  </section>;
}

function readLineSafely(unit: StoryUnit): DerivedEventLineR1 | null { try { return readDerivedEventLineR1(unit); } catch { return null; } }
function transformLabel(kind: DerivedTransformKindR1): string { return ({ translation: "翻译", pov: "视角切换", if: "IF 线", adaptation: "本土化 / 改编" } as const)[kind]; }
function reviewLabel(state: DerivedEventLineR1["reviewState"]): string { return ({ draft: "草稿", generated: "已生成", review: "审核中", "ready-for-creation": "可用于创作", archived: "已归档" } as const)[state]; }
function alignmentReviewLabel(state: "pending" | "accepted" | "returned"): string { return ({ pending: "待审核", accepted: "已接受", returned: "已退回" } as const)[state]; }
function knowledgeLabel(state: NonNullable<DerivedEventLineR1["alignment"][number]["knowledgeState"]>): string { return ({ visible: "可见", heard: "听闻", inferred: "推断", unknown: "未知", misunderstood: "误解" } as const)[state]; }
function kindLabel(kind: string): string { return ({ node: "节点 Node", beat: "情节点 Beat", event: "事件 Event", unit: "单元 Unit" } as Record<string, string>)[kind] || kind; }
