import { Check, ChevronDown, FileText, Pencil, Pin, PinOff, SquareArrowOutUpRight } from "lucide-react";

import type { NuwaAttentionContext, TianyiNuwaExecutionBrief } from "../../lib/localTransport";
import type { TianyiThreadBriefDraft } from "./tianyiConversationBrief";

export function TianyiBriefReview(props: {
  draft: TianyiThreadBriefDraft;
  stage: "compose" | "inspect" | "handoff";
  brief: TianyiNuwaExecutionBrief | null;
  briefDirty: boolean;
  sourceLabels: string[];
  sourceReceiptIds: string[];
  sourceCount: number;
  devReceiptFixture?: boolean;
  attentionContextHash?: string | null;
  busy: boolean;
  onUpdate(patch: Partial<Omit<TianyiThreadBriefDraft, "omittedItems">>): void;
  onStageChange(stage: "compose" | "inspect" | "handoff"): void;
  onSave(): void;
  onApprove(): void;
  onStart(): void;
  onBack(): void;
}) {
  const isApproved = props.brief?.authorApprovalState === "approved";
  const isDraft = props.brief?.authorApprovalState === "draft";
  return <section className="tianyi-brief-review" aria-label="收束本次天意">
    <header className="tianyi-thread-heading"><div><small>当前线程的连续简报</small><h1>收束本次天意</h1></div><p>整理简报不会关闭当前对话，也不会直接改写故事事实。</p></header>
    <ol className="tianyi-brief-stages" aria-label="简报流程"><Stage step="1" label="整理简报" active={props.stage === "compose"} /><Stage step="2" label="检查" active={props.stage === "inspect"} /><Stage step="3" label="确认并交给女娲" active={props.stage === "handoff"} /></ol>
    <div className="tianyi-brief-sheet">
      <BriefField label="本次目标" value={props.draft.authorGoal} onChange={(authorGoal) => props.onUpdate({ authorGoal })} hint="用一句话说明这次要推进或验证什么。" />
      <BriefField label="必须保留" value={props.draft.mustKeep} onChange={(mustKeep) => props.onUpdate({ mustKeep })} hint="一行一项。" />
      <BriefField label="必须避免" value={props.draft.mustAvoid} onChange={(mustAvoid) => props.onUpdate({ mustAvoid })} hint="一行一项；不会自动改写正文或世界资料。" />
      <BriefField label="开放问题" value={props.draft.openQuestions} onChange={(openQuestions) => props.onUpdate({ openQuestions })} hint="一行一项。" />
      <BriefField label="交给女娲验证的问题" value={props.draft.nuwaQuestion} onChange={(nuwaQuestion) => props.onUpdate({ nuwaQuestion })} hint="用于后续排演，不等于正式故事事实。" />
      <section className="tianyi-brief-sources">
        <div><span><FileText />本次关注的资料</span><small>{props.sourceLabels.join(" · ") || "当前没有可授权来源"}</small></div>
        <label><input type="checkbox" checked={props.draft.includeCurrentSources} onChange={(event) => props.onUpdate({ includeCurrentSources: event.target.checked })} />纳入当前对话的 {props.sourceCount} 项引用来源</label>
        {props.sourceReceiptIds.length > 0 && <div className="tianyi-brief-source-list" aria-label="钉住的来源">
          {props.sourceReceiptIds.map((receiptId, index) => {
            const pinned = props.draft.pinnedSourceReceiptIds.includes(receiptId);
            const label = props.sourceLabels[index] || `来源 ${index + 1}`;
            return <button type="button" className={pinned ? "is-pinned" : ""} aria-pressed={pinned} key={receiptId} onClick={() => {
              const next = pinned
                ? props.draft.pinnedSourceReceiptIds.filter((current) => current !== receiptId)
                : [...props.draft.pinnedSourceReceiptIds, receiptId];
              props.onUpdate({ pinnedSourceReceiptIds: next, includeCurrentSources: next.length > 0 });
            }}><span>{pinned ? <Pin /> : <PinOff />} {label}</span><small>{pinned ? "已钉住" : "未钉住"}</small></button>;
          })}
        </div>}
      </section>
      {props.brief?.attentionContext && <AttentionSummary context={props.brief.attentionContext} attentionContextHash={props.attentionContextHash} devReceiptFixture={props.devReceiptFixture} />}
      <details className="tianyi-brief-omitted"><summary><ChevronDown />未纳入项</summary>{props.draft.omittedItems.length ? <ul>{props.draft.omittedItems.map((item) => <li key={`${item.category}-${item.content}`}><strong>{item.label}</strong><span>{item.content}</span></li>)}</ul> : <p>没有额外的未纳入项。这部分仅存在于当前页面，不会写入任何资料。</p>}</details>
    </div>
    <footer className="tianyi-brief-actions">
      <button type="button" className="secondary-action" onClick={props.onBack} disabled={props.busy}>返回线程</button>
      {props.stage !== "compose" && <button type="button" className="secondary-action" onClick={() => props.onStageChange("compose")} disabled={props.busy}><Pencil />修改简报</button>}
      <button type="button" className="primary-action" onClick={props.onSave} disabled={props.busy}><FileText />{props.brief ? "保存修改" : "整理简报"}</button>
      {isDraft && <button type="button" className="primary-action" onClick={props.onApprove} disabled={props.busy || props.briefDirty}><Check />确认简报</button>}
      {isApproved && <button type="button" className="primary-action" onClick={props.onStart} disabled={props.busy || props.briefDirty}><SquareArrowOutUpRight />交给女娲</button>}
    </footer>
    {props.brief && <p className="tianyi-brief-state" aria-live="polite">{props.briefDirty ? "简报有未保存修改；请先保存为新版本，再确认或交给女娲。" : `当前简报为第 ${props.brief.revision} 版 · ${isApproved ? "已批准，可交给女娲" : "待作者检查"}`}</p>}
  </section>;
}

function AttentionSummary(props: { context: NuwaAttentionContext; attentionContextHash?: string | null; devReceiptFixture?: boolean }) {
  const { context } = props;
  return <section className="tianyi-brief-attention" aria-label="本次关注">
    <header><span>本次关注</span><small>{props.devReceiptFixture ? "开发回执夹具 · 不写入故事资料" : "这次执行简报的只读上下文快照"}</small></header>
    <dl>
      <div><dt>问题</dt><dd>{context.authorQuestion || "未填写"}</dd></div>
      <div><dt>场景</dt><dd>{context.focus.sceneTitle}</dd></div>
      <div><dt>角色</dt><dd>{context.actorKnowledge.map((actor) => actor.label).join("、") || "未指定"}</dd></div>
      <div><dt>已确认事实</dt><dd>{context.confirmedFacts.join("；") || "暂无"}</dd></div>
      <div><dt>未解决线索</dt><dd>{context.unresolvedClues.join("；") || "暂无"}</dd></div>
    </dl>{props.attentionContextHash && <p className="tianyi-dev-fixture-hash" data-testid="attention-context-hash">上下文 hash：{props.attentionContextHash}</p>}
    <details><summary>纳入与排除原因</summary>
      <div className="tianyi-brief-attention-sources">
        <div><strong>纳入</strong>{context.includedSources.map((source) => <span key={source.sourceId}>{source.label} · {source.reason}</span>)}</div>
        <div><strong>排除</strong>{context.excludedSources.map((source) => <span key={source.sourceId}>{source.label} · {source.reason}</span>)}</div>
      </div>
    </details>
  </section>;
}

function Stage(props: { step: string; label: string; active: boolean }) {
  return <li className={props.active ? "is-active" : ""} aria-current={props.active ? "step" : undefined}><span>{props.step}</span>{props.label}</li>;
}

function BriefField(props: { label: string; value: string; hint: string; onChange(value: string): void }) {
  return <label className="tianyi-brief-field"><span>{props.label}</span><textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} rows={props.label === "本次目标" ? 2 : 3} /><small>{props.hint}</small></label>;
}
