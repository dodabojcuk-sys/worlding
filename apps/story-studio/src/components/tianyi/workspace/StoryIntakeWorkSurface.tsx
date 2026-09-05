import { ArrowLeft, ArrowRight, CheckCircle2, FileClock, LocateFixed, MessageSquareText, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  confirmTianyiStoryIntakeBatch,
  previewTianyiStoryIntakeBatch,
  undoTianyiStoryIntakeBatch,
  searchWorldObjects,
  type StoryIntakeBatchPreviewProjection,
  type StoryIntakeBatchReceiptProjection,
  type StoryIntakeCandidateProjection,
  type TianyiAgentRunProjection,
  type TianyiVisibleMessage,
  type WorldObjectSummary
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { candidateTypeLabel } from "./StoryIntakeReviewSurface";

type ProposedRelation = {
  key: string;
  source: StoryIntakeCandidateProjection;
  target: StoryIntakeCandidateProjection | null;
  relation: string;
  label: string | null;
};

type RelationBindingSelection = { relationKey: string; targetObjectId: string };
type EntityBindingSelection = { candidateId: string; targetObjectId: string };

export function StoryIntakeWorkSurface(props: {
  runtime: TianyanShellRuntimeState;
  run: TianyiAgentRunProjection;
  candidates: readonly StoryIntakeCandidateProjection[];
  activeCandidate: StoryIntakeCandidateProjection;
  conversationMessages: readonly TianyiVisibleMessage[];
  conversationBusy: boolean;
  conversationRuntimeLabel: string;
  onBackToReview(): void;
  onOpenEventLine(): void;
  onRunChanged(run: TianyiAgentRunProjection): void;
  onSendConversation(): void;
  onIncludeCandidate(candidateId: string): void;
  onLocateCandidate(candidateId: string): void;
}) {
  const project = props.runtime.project!;
  const [preview, setPreview] = useState<StoryIntakeBatchPreviewProjection | null>(null);
  const [receipt, setReceipt] = useState<StoryIntakeBatchReceiptProjection | null>(null);
  const [lastUndoneReceipt, setLastUndoneReceipt] = useState<StoryIntakeBatchReceiptProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<"start" | "end">("end");
  const [explorationId, setExplorationId] = useState("evidence");
  const [explorationSaved, setExplorationSaved] = useState(false);
  const [excludedRelationKeys, setExcludedRelationKeys] = useState<string[]>([]);
  const [relationBindings, setRelationBindings] = useState<RelationBindingSelection[]>([]);
  const [entityBindings, setEntityBindings] = useState<EntityBindingSelection[]>([]);
  const [bindingRelationKey, setBindingRelationKey] = useState<string | null>(null);
  const [bindingCandidateId, setBindingCandidateId] = useState<string | null>(null);
  const [bindingQuery, setBindingQuery] = useState("");
  const [bindingResults, setBindingResults] = useState<WorldObjectSummary[]>([]);
  const [bindingLoading, setBindingLoading] = useState(false);
  const candidateIds = props.candidates.map((candidate) => candidate.candidateId);
  const scopeKey = candidateIds.join("|");
  const narrativeCandidates = props.candidates.filter((candidate) => candidate.type === "event");
  const objectCandidates = props.candidates.filter((candidate) => ["character", "item", "location"].includes(candidate.type));
  const structureCandidates = props.candidates.filter((candidate) => ["story_unit", "narrative_path_membership"].includes(candidate.type));
  const preservedCandidates = props.candidates.filter((candidate) => candidate.type === "unresolved");
  const selectedCandidateIds = new Set(candidateIds);
  const allCandidates = props.run.storyIntakeEnvelope?.candidates ?? [];
  const relations = useMemo<ProposedRelation[]>(() => props.candidates.flatMap((source) => source.proposedRelations.map((relation, index) => {
    const targetCandidateId = typeof relation.targetCandidateId === "string" ? relation.targetCandidateId : "missing";
    return {
      key: `${source.candidateId}:${relation.relation}:${targetCandidateId}:${index}`,
      source,
      target: allCandidates.find((candidate) => candidate.candidateId === targetCandidateId) ?? null,
      relation: relation.relation,
      label: relation.label
    };
  })), [allCandidates, props.candidates]);
  const activeRelations = relations.filter((relation) => !excludedRelationKeys.includes(relation.key));
  const bindingScopeKey = relationBindings.map((binding) => `${binding.relationKey}:${binding.targetObjectId}`).sort().join("|");
  const entityBindingScopeKey = entityBindings.map((binding) => `${binding.candidateId}:${binding.targetObjectId}`).sort().join("|");
  const scopeLocked = receipt?.status === "active" || receipt?.status === "recovery-required";

  useEffect(() => {
    let active = true;
    setPreview(null); setReceipt(null); setError("");
    void props.runtime.withConnection((token) => previewTianyiStoryIntakeBatch({
      projectId: project.id,
      workVersionId: props.run.workVersionId,
      sessionId: props.run.sessionId,
      runId: props.run.runId,
      candidateIds,
      excludedRelationKeys,
      relationBindings,
      entityBindings,
      position,
      token
    })).then((next) => {
      if (!active) return;
      setPreview(next);
      setReceipt(next.activeReceipt);
      if (next.activeReceipt) {
        if (next.activeReceipt.position !== position) setPosition(next.activeReceipt.position);
        const restoredExcluded = next.activeReceipt.excludedRelationKeys ?? [];
        if (JSON.stringify(restoredExcluded) !== JSON.stringify(excludedRelationKeys)) setExcludedRelationKeys(restoredExcluded);
        const restoredBindings = (next.activeReceipt.relationBindings ?? []).map((binding) => ({ relationKey: binding.relationKey, targetObjectId: binding.targetObjectId }));
        if (JSON.stringify(restoredBindings) !== JSON.stringify(relationBindings)) setRelationBindings(restoredBindings);
        const restoredEntityBindings = (next.activeReceipt.entityBindings ?? []).map((binding) => ({ candidateId: binding.candidateId, targetObjectId: binding.targetObjectId }));
        if (JSON.stringify(restoredEntityBindings) !== JSON.stringify(entityBindings)) setEntityBindings(restoredEntityBindings);
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "影响预览失败。"); });
    return () => { active = false; };
  }, [bindingScopeKey, entityBindingScopeKey, excludedRelationKeys, position, project.id, props.run.revision, props.run.runId, props.run.sessionId, props.run.workVersionId, props.runtime, scopeKey]);

  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true); setError("");
    try {
      const result = await props.runtime.withConnection((token) => confirmTianyiStoryIntakeBatch({
        projectId: project.id,
        workVersionId: props.run.workVersionId,
        sessionId: props.run.sessionId,
        runId: props.run.runId,
        candidateIds,
        excludedRelationKeys,
        relationBindings,
        entityBindings,
        position,
        previewId: preview.previewId,
        expectedBaseRevision: preview.baseVersion.revision,
        operationId: `operation.story-intake.batch.${crypto.randomUUID()}`,
        token
      }));
      setReceipt(result.receipt);
      setLastUndoneReceipt(null);
      props.onRunChanged(result.run);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "批次确认失败；未静默写入其他候选。"); }
    finally { setBusy(false); }
  };

  const searchExistingObjects = async (query = bindingQuery) => {
    setBindingLoading(true);
    try { setBindingResults((await searchWorldObjects(project.id, query)).filter((object) => object.status !== "archived")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取当前作品中的已有对象。"); }
    finally { setBindingLoading(false); }
  };

  const openExistingBinding = (relation: ProposedRelation) => {
    const query = relation.target ? candidateTitle(relation.target) : "";
    setBindingRelationKey(relation.key);
    setBindingQuery(query);
    void searchExistingObjects(query);
  };

  const openEntityBinding = (candidate: StoryIntakeCandidateProjection) => {
    const query = candidateTitle(candidate);
    setBindingRelationKey(null);
    setBindingCandidateId(candidate.candidateId);
    setBindingQuery(query);
    void searchExistingObjects(query);
  };

  const bindExistingObject = (relationKey: string, objectId: string) => {
    setRelationBindings((current) => [...current.filter((binding) => binding.relationKey !== relationKey), { relationKey, targetObjectId: objectId }]);
    setExcludedRelationKeys((current) => current.filter((key) => key !== relationKey));
    setBindingRelationKey(null);
  };

  const bindExistingEntity = (candidateId: string, objectId: string) => {
    setEntityBindings((current) => [...current.filter((binding) => binding.candidateId !== candidateId), { candidateId, targetObjectId: objectId }]);
    setBindingCandidateId(null);
  };

  const explorationOptions = [
    { id: "evidence", title: `继续核对「${props.activeCandidate.proposedName ?? props.activeCandidate.proposedTitle ?? "当前候选"}」的来源`, detail: "把疑点带回创意长对话，不进入本次正式采纳范围。" },
    { id: "consequence", title: "推演一次最小后果链", detail: "只生成下一轮探索提示，不改变当前候选与事实。" }
  ];
  const saveExploration = () => {
    if (receipt?.status !== "active") return;
    const selected = explorationOptions.find((option) => option.id === explorationId)!;
    const formalTitles = receipt.items.filter((item) => item.owner !== "candidate-only").map((item) => item.title);
    props.runtime.setCreativeComposerDraft(`基于已采纳范围继续探索：${formalTitles.join("、") || "当前正式内容"}\n目标故事单元：${receipt.storyUnit.title}（${receipt.position === "start" ? "单元开头" : "当前内容之后"}）\n${selected.title}\n${selected.detail}`);
    setExplorationSaved(true);
  };

  const undo = async () => {
    if (!receipt || busy) return;
    setBusy(true); setError("");
    try {
      const result = await props.runtime.withConnection((token) => undoTianyiStoryIntakeBatch({
        projectId: project.id,
        workVersionId: props.run.workVersionId,
        sessionId: props.run.sessionId,
        runId: props.run.runId,
        receiptId: receipt.receiptId,
        operationId: `operation.story-intake.batch.undo.${crypto.randomUUID()}`,
        token
      }));
      setReceipt(result.receipt);
      setLastUndoneReceipt(result.receipt);
      props.onRunChanged(result.run);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "撤销失败，请按回执检查后重试。"); }
    finally { setBusy(false); }
  };

  return <section className="story-intake-work" data-testid="story-intake-work" data-run-id={props.run.runId}>
    <header className="story-intake-surface-heading">
      <div><h2>工作：编排候选，再决定是否采纳</h2><p>同一批次 · 已选 {props.candidates.length} 项 · 候选状态保持</p></div>
      <button type="button" onClick={props.onBackToReview}><ArrowLeft />返回审阅</button>
    </header>

    <div className="story-intake-work-grid">
      <section className="story-intake-arrangement" aria-label="候选故事编排">
        <header><div><small>目标故事单元</small><strong>{preview?.storyUnit.title ?? structureCandidates.find((candidate) => candidate.type === "story_unit")?.proposedTitle ?? "当前故事单元"}</strong></div><label>叙事位置<select value={position} disabled={scopeLocked} onChange={(event) => setPosition(event.currentTarget.value as "start" | "end")}><option value="end">接在当前内容之后</option><option value="start">放在单元开头</option></select></label></header>
        <article className="story-intake-current-unit"><small>{preview?.storyUnit.targetId ? "当前项目内容" : "待建立的故事单元"}</small><strong>{preview?.storyUnit.title ?? "正在读取故事单元"}</strong><p>{preview?.storyUnit.summary ?? "正在从 Story Unit Owner 读取当前内容……"}</p></article>
        <ol className="story-intake-story-sequence">
          {narrativeCandidates.map((candidate, index) => <li key={candidate.candidateId} data-candidate-preview="true" data-active={candidate.candidateId === props.activeCandidate.candidateId}><span>{index + 1}</span><div><small>候选事件，尚未采纳</small><strong>{candidate.proposedTitle ?? "未命名事件"}</strong><p>{candidate.summary}</p><small>来源保留 · {candidate.candidateId === props.activeCandidate.candidateId ? "当前焦点" : "同一选择范围"}</small></div></li>)}
        </ol>

        <section className="story-intake-change-groups" aria-label="按语义分组的本次变化">
          <section><strong>关联对象</strong>{objectCandidates.length ? <ul>{objectCandidates.map((candidate) => {
            const bound = preview?.entityBindings.find((binding) => binding.candidateId === candidate.candidateId) ?? receipt?.entityBindings?.find((binding) => binding.candidateId === candidate.candidateId) ?? null;
            return <li key={candidate.candidateId}><span>{candidateTypeLabel(candidate.type)}</span><b>{candidateTitle(candidate)}</b><small>{bound ? `已明确绑定：${bound.targetObjectTitle}` : candidate.summary}</small><div><button type="button" disabled={scopeLocked} onClick={() => openEntityBinding(candidate)}>{bound ? "更换已有对象" : "绑定已有对象"}</button>{bound ? <button type="button" disabled={scopeLocked} onClick={() => setEntityBindings((current) => current.filter((binding) => binding.candidateId !== candidate.candidateId))}>改为新建</button> : null}</div>{bindingCandidateId === candidate.candidateId ? <div className="story-intake-existing-binding"><label>在当前作品中查找同类型对象<input value={bindingQuery} onChange={(event) => setBindingQuery(event.currentTarget.value)} placeholder={candidateTitle(candidate)} /></label><button type="button" disabled={bindingLoading} onClick={() => void searchExistingObjects()}>{bindingLoading ? "查找中…" : "查找"}</button><button type="button" onClick={() => setBindingCandidateId(null)}>取消</button>{bindingResults.filter((object) => object.type === candidate.type).length ? <ul>{bindingResults.filter((object) => object.type === candidate.type).map((object) => <li key={object.id}><span>{object.title} · {candidateTypeLabel(candidate.type)}</span><button type="button" onClick={() => bindExistingEntity(candidate.candidateId, object.id)}>绑定此对象</button></li>)}</ul> : bindingLoading ? null : <small>没有找到可绑定的同类型对象。</small>}</div> : null}</li>;
          })}</ul> : <small>本次不新增资料对象</small>}</section>
          <ChangeGroup title="故事结构" candidates={structureCandidates} empty="沿用当前单元与路径" />
          <ChangeGroup title="保留语义" candidates={preservedCandidates} empty="没有未解内容" />
        </section>

        {relations.length ? <section className="story-intake-relation-recovery" aria-label="关系端点与范围">
          <header><div><strong>关系与端点</strong><small>先核对两端候选；未选内容不会被夹带提交</small></div><span>{activeRelations.length} 项纳入预览</span></header>
          {relations.map((relation) => {
            const excluded = excludedRelationKeys.includes(relation.key);
            const targetIncluded = Boolean(relation.target && selectedCandidateIds.has(relation.target.candidateId));
            const boundExisting = preview?.relationBindings.find((binding) => binding.relationKey === relation.key) ?? receipt?.relationBindings.find((binding) => binding.relationKey === relation.key) ?? null;
            return <article key={relation.key} data-excluded={excluded}>
              <div><strong>{candidateTitle(relation.source)} → {boundExisting ? boundExisting.targetObjectTitle : relation.target ? candidateTitle(relation.target) : "端点已丢失"}</strong><small>{relation.label ?? relation.relation}{excluded ? " · 已排除" : boundExisting ? ` · 已绑定已有${boundExisting.targetObjectType === "event" ? "事件" : "对象"}` : targetIncluded ? " · 端点已在范围" : " · 需要恢复端点"}</small></div>
              <div>{relation.target && !targetIncluded ? <button type="button" disabled={scopeLocked} onClick={() => props.onIncludeCandidate(relation.target!.candidateId)}>纳入所需候选</button> : null}{relation.target ? <button type="button" onClick={() => props.onLocateCandidate(relation.target!.candidateId)}><LocateFixed />定位端点</button> : null}{!targetIncluded ? <button type="button" disabled={scopeLocked} onClick={() => openExistingBinding(relation)}>{boundExisting ? "更换已有对象" : "绑定已有对象"}</button> : null}{boundExisting ? <button type="button" disabled={scopeLocked} onClick={() => setRelationBindings((current) => current.filter((binding) => binding.relationKey !== relation.key))}>清除绑定</button> : null}<button type="button" disabled={scopeLocked} onClick={() => setExcludedRelationKeys((current) => current.includes(relation.key) ? current.filter((key) => key !== relation.key) : [...current, relation.key])}>{excluded ? "恢复此关系" : "排除此关系"}</button></div>
              {bindingRelationKey === relation.key ? <div className="story-intake-existing-binding"><label>在当前作品中查找已有对象<input value={bindingQuery} onChange={(event) => setBindingQuery(event.currentTarget.value)} placeholder="名称、别名或标签" /></label><button type="button" disabled={bindingLoading} onClick={() => void searchExistingObjects()}>{bindingLoading ? "查找中…" : "查找"}</button><button type="button" onClick={() => setBindingRelationKey(null)}>取消</button>{bindingResults.length ? <ul>{bindingResults.map((object) => <li key={object.id}><span>{object.title} · {object.type === "event" ? "事件" : object.type}</span><button type="button" onClick={() => bindExistingObject(relation.key, object.id)}>绑定此对象</button></li>)}</ul> : bindingLoading ? null : <small>没有找到可绑定的已有对象。</small>}</div> : null}
            </article>;
          })}
        </section> : null}

        <section className="story-intake-work-conversation" aria-label="继续和天意讨论当前范围">
          <header><div><MessageSquareText /><div><strong>继续和天意讨论当前范围</strong><small>{props.conversationRuntimeLabel}</small></div></div><span>对话不会自动写入候选或事实</span></header>
          {props.conversationMessages.slice(-4).map((message) => <article key={message.eventId} data-actor={message.actor}><strong>{message.actor === "author" ? "你" : "天意"}</strong><p>{message.visibleContent}</p></article>)}
          <div><textarea rows={2} value={props.runtime.workComposerDraft} onChange={(event) => props.runtime.setWorkComposerDraft(event.currentTarget.value)} placeholder="例如：如果先发生守夜钟失踪，这一单元的压力会怎样变化？" aria-label="当前故事范围对话"/><button type="button" disabled={!props.runtime.workComposerDraft.trim() || props.conversationBusy} onClick={props.onSendConversation}><Send />{props.conversationBusy ? "回答中…" : "发送消息"}</button></div>
        </section>

        <section className="story-intake-exploration"><header><strong>有界后续探索</strong><small>{receipt?.status === "active" ? "只读已采纳范围，只保存到创意草稿" : "先采纳当前范围，再基于正式内容继续探索"}</small></header>{explorationOptions.map((option) => <label key={option.id}><input type="radio" name="story-intake-exploration" value={option.id} checked={explorationId === option.id} onChange={() => { setExplorationId(option.id); setExplorationSaved(false); }} /> <span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}<button type="button" onClick={saveExploration} disabled={receipt?.status !== "active"}>{explorationSaved ? "已保存到创意草稿" : receipt?.status === "active" ? "保留为下一轮创意草稿" : "采纳后可继续探索"}</button></section>
      </section>

      <aside className="story-intake-impact" aria-label="结构化影响预览">
        <header><ShieldCheck /><div><strong>影响预览</strong><small>只基于当前 {props.candidates.length} 项选择</small></div></header>
        {preview ? <dl><div><dt>事件</dt><dd>新建 {preview.impact.events} 项</dd></div><div><dt>故事单元</dt><dd>{preview.impact.storyUnits ? `新建或接入 ${preview.impact.storyUnits} 项` : "沿用当前单元"}</dd></div><div><dt>叙事编排</dt><dd>{preview.impact.narrativePlacements} 个位置</dd></div><div><dt>资料对象</dt><dd>{preview.impact.worldObjects} 项</dd></div><div><dt>关系</dt><dd>{activeRelations.length || preview.impact.relations} 项待审</dd></div><div><dt>未解内容</dt><dd>{preview.impact.unresolved} 项保留原文</dd></div><div><dt>冲突</dt><dd>{receipt?.status === "active" ? "采纳时 0" : preview.conflicts.length}</dd></div></dl> : <p>正在读取当前 Owner 状态并计算影响……</p>}
        {receipt?.status !== "active" && preview?.conflicts.length ? <ul className="story-intake-conflicts" role="alert">{preview.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul> : null}
        <p className="story-intake-world-boundary">World 事实：不会由候选工作面直接写入</p>
        <details><summary>来源与诊断</summary><dl><div><dt>批次</dt><dd>{props.run.storyIntakeEnvelope?.envelopeId}</dd></div><div><dt>基础版本</dt><dd>{props.run.workVersionId}@r{props.run.storyIntakeEnvelope?.baseVersion.revision}</dd></div><div><dt>明确范围</dt><dd>{candidateIds.join("、")}</dd></div><div><dt>排除关系</dt><dd>{excludedRelationKeys.length}</dd></div></dl></details>
      </aside>
    </div>

    {receipt ?? lastUndoneReceipt ? <BatchReceipt receipt={(receipt ?? lastUndoneReceipt)!} busy={busy} onUndo={undo} onContinue={props.onBackToReview} /> : null}
    {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}

    <footer className="story-intake-scope-bar">
      <div><strong>本次确认 {props.candidates.length} 项</strong><span>确认后提供逐 Owner 回执，可撤销</span></div>
      <button type="button" onClick={props.onOpenEventLine}>先看事件线<ArrowRight /></button>
      <button type="button" className="primary-action" disabled={!preview?.canConfirm || busy || scopeLocked} onClick={confirm}>{busy ? <FileClock /> : <CheckCircle2 />}{receipt?.status === "active" ? "已采纳" : receipt?.status === "recovery-required" ? "先完成恢复" : `确认采纳 ${props.candidates.length} 项`}</button>
    </footer>
  </section>;
}

function ChangeGroup(props: { title: string; candidates: readonly StoryIntakeCandidateProjection[]; empty: string }) {
  return <section><strong>{props.title}</strong>{props.candidates.length ? <ul>{props.candidates.map((candidate) => <li key={candidate.candidateId}><span>{candidateTypeLabel(candidate.type)}</span><b>{candidateTitle(candidate)}</b><small>{candidate.type === "narrative_path_membership" ? candidate.narrativePath?.label : candidate.summary}</small></li>)}</ul> : <small>{props.empty}</small>}</section>;
}

function candidateTitle(candidate: StoryIntakeCandidateProjection): string {
  return candidate.proposedName ?? candidate.proposedTitle ?? "未命名候选";
}

function BatchReceipt(props: { receipt: StoryIntakeBatchReceiptProjection; busy: boolean; onUndo(): void; onContinue(): void }) {
  const { receipt } = props;
  const recovering = receipt.status === "recovery-required";
  return <section className="story-intake-batch-receipt" role="status" data-status={receipt.status}>{recovering ? <FileClock /> : <CheckCircle2 />}<div><strong>{recovering ? "上次确认需要恢复" : receipt.status === "undone" ? "这次采纳已撤销，候选已按当前版本恢复" : "这次采纳已保存"}</strong><p>{recovering ? receipt.recoveryMessage : receipt.status === "undone" ? "可返回审阅继续处理任意原候选；再次确认会沿用同一 Envelope 与 Owner 身份。" : `${receipt.items.length} 项 Owner 回执 · 未选内容 ${receipt.omittedCandidateIds.length} 项未提交`}</p><details><summary>查看回执</summary><ul>{receipt.items.map((item) => <li key={item.candidateId}>{item.title} · {item.owner} · {item.receiptId}</li>)}</ul></details></div>{receipt.status === "active" || recovering ? <button type="button" onClick={props.onUndo} disabled={props.busy}><RotateCcw />{recovering ? "恢复并撤销" : "撤销这次采纳"}</button> : <button type="button" onClick={props.onContinue}>返回审阅继续处理<ArrowRight /></button>}</section>;
}
