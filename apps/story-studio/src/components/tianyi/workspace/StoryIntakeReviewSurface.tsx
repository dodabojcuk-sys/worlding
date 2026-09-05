import { ArrowRight, Check, FileText, MessageSquareText } from "lucide-react";

import type { StoryIntakeCandidateProjection, StoryIntakeLifecycleStatusProjection, TianyiAgentRunProjection } from "../../../lib/localTransport";

export function StoryIntakeReviewSurface(props: {
  run: TianyiAgentRunProjection;
  selectedCandidateIds: readonly string[];
  focusedCandidateId: string | null;
  busy: boolean;
  onToggle(candidateId: string): void;
  onFocus(candidateId: string): void;
  onEnterWork(candidateIds: readonly string[]): void;
  onDecision(candidateId: string, lifecycleStatus: StoryIntakeLifecycleStatusProjection): void;
  onBackToConversation(): void;
}) {
  const envelope = props.run.storyIntakeEnvelope!;
  const candidates = envelope.candidates;
  const availableCandidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  const selected = new Set(props.selectedCandidateIds.filter((candidateId) => availableCandidateIds.has(candidateId)));
  const focused = candidates.find((candidate) => candidate.candidateId === props.focusedCandidateId) ?? candidates[0] ?? null;
  const handled = candidates.filter((candidate) => ["confirmed", "rejected", "pending-archive"].includes(candidate.lifecycleStatus)).length;
  const pending = candidates.length - handled;
  const scope = selected.size ? [...selected] : focused ? [focused.candidateId] : [];

  return <section className="story-intake-review" data-testid="story-intake-review" data-envelope-id={envelope.envelopeId}>
    <header className="story-intake-surface-heading">
      <div><h2>候选审阅</h2><p>把对话里提炼的内容整理进故事</p></div>
      <button type="button" onClick={props.onBackToConversation}><MessageSquareText />回到对话</button>
    </header>

    <div className="story-intake-batch-bar">
      <strong>当前批次 · {candidates.length} 项候选</strong>
      <span>待决定 {pending} · 已处理 {handled}</span>
      <progress max={Math.max(1, candidates.length)} value={handled} aria-label={`已处理 ${handled} 项，共 ${candidates.length} 项`} />
    </div>

    {focused ? <details className="story-intake-evidence-compact"><summary>当前候选原文与来源</summary><blockquote>{focused.sourceSpan.excerpt}</blockquote><span>对话记录 · 字符 {focused.sourceSpan.start}–{focused.sourceSpan.end} · 基础版本 r{focused.baseVersion.revision}</span></details> : null}

    <div className="story-intake-review-layout">
      <div className="story-intake-ledger" role="list" aria-label="本批故事候选">
        <div className="story-intake-ledger-head" aria-hidden="true"><span>选择</span><span>候选条目</span><span>类型</span><span>摘要</span><span>状态</span></div>
        {candidates.map((candidate, index) => <StoryIntakeCandidateRow
          key={candidate.candidateId}
          candidate={candidate}
          index={index}
          selected={selected.has(candidate.candidateId)}
          focused={focused?.candidateId === candidate.candidateId}
          busy={props.busy}
          onToggle={props.onToggle}
          onFocus={props.onFocus}
          onEnterWork={() => props.onEnterWork([candidate.candidateId])}
          onDecision={props.onDecision}
        />)}
      </div>

      <aside className="story-intake-evidence" aria-label="当前候选原文与影响">
        <nav aria-label="候选辅助信息"><button type="button" aria-selected="true">原文</button><button type="button" aria-selected="false">影响</button></nav>
        {focused ? <>
          <div><small>原文摘录</small><blockquote>{focused.sourceSpan.excerpt}</blockquote><p>对话记录 · 字符 {focused.sourceSpan.start}–{focused.sourceSpan.end}</p></div>
          <div><small>候选位置</small><p>{focused.narrativePath ? `同版本路径 · ${focused.narrativePath.label}` : "待在工作面安排"}</p></div>
          <details><summary>来源与诊断</summary><dl><div><dt>候选类型</dt><dd>{candidateTypeLabel(focused.type)}</dd></div><div><dt>基础版本</dt><dd>r{focused.baseVersion.revision}</dd></div><div><dt>候选 ID</dt><dd>{focused.candidateId}</dd></div><div><dt>Run</dt><dd>{props.run.runId}</dd></div></dl></details>
        </> : <p>当前批次没有可审阅候选。</p>}
      </aside>
    </div>

    <footer className="story-intake-scope-bar">
      <div><strong>已选 {selected.size} 项</strong>{selected.size ? <button type="button" onClick={() => selected.forEach((candidateId) => props.onToggle(candidateId))}>清空选择</button> : <span>未选择时将进入当前候选</span>}</div>
      <button type="button" disabled={scope.length === 0 || props.busy} onClick={() => props.onEnterWork(scope)}><FileText />查看 {scope.length} 项影响<ArrowRight /></button>
    </footer>
  </section>;
}

export function StoryIntakeCandidateRow(props: {
  candidate: StoryIntakeCandidateProjection;
  index: number;
  selected: boolean;
  focused: boolean;
  busy: boolean;
  onToggle(candidateId: string): void;
  onFocus(candidateId: string): void;
  onEnterWork(): void;
  onDecision(candidateId: string, lifecycleStatus: StoryIntakeLifecycleStatusProjection): void;
}) {
  const candidate = props.candidate;
  const title = candidate.proposedName ?? candidate.proposedTitle ?? "未命名候选";
  const selectable = !["confirmed", "rejected"].includes(candidate.lifecycleStatus);
  return <article
    className="story-intake-ledger-row"
    role="listitem"
    data-selected={props.selected}
    data-focused={props.focused}
    data-candidate-id={candidate.candidateId}
    tabIndex={0}
    onFocus={() => props.onFocus(candidate.candidateId)}
  >
    <label><span className="sr-only">选择 {title}</span><input type="checkbox" checked={props.selected} disabled={!selectable || props.busy} onChange={() => props.onToggle(candidate.candidateId)} /></label>
    <button type="button" className="story-intake-row-title" onClick={() => props.onFocus(candidate.candidateId)}><span>{props.index + 1}</span><strong>{title}</strong></button>
    <span className="story-intake-type">{candidateTypeLabel(candidate.type)}</span>
    <p>{candidate.summary}</p>
    <div className="story-intake-row-status">
      <span>{lifecycleLabel(candidate.lifecycleStatus)}</span>
      {selectable ? <button type="button" onClick={props.onEnterWork}>进入工作<ArrowRight /></button> : candidate.lifecycleStatus === "confirmed" ? <span><Check />已有回执</span> : null}
      <details><summary>处理</summary><button type="button" onClick={() => props.onDecision(candidate.candidateId, "deferred")}>暂时保留</button><button type="button" onClick={() => props.onDecision(candidate.candidateId, "pending-archive")}>移到待归档</button><button type="button" onClick={() => props.onDecision(candidate.candidateId, "rejected")}>拒绝</button></details>
    </div>
  </article>;
}

export function candidateTypeLabel(type: StoryIntakeCandidateProjection["type"]): string {
  return ({ character: "角色", item: "物件", location: "地点", event: "事件", relation: "关系", story_unit: "故事单元", narrative_path_membership: "叙事路径", unresolved: "待明确" })[type];
}

function lifecycleLabel(status: StoryIntakeLifecycleStatusProjection): string {
  return ({ "pending-review": "待决定", deferred: "暂时保留", "pending-archive": "待归档", rejected: "已拒绝", confirmed: "已采纳" })[status];
}
