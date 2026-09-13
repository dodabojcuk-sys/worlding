import { Ban, Check, LoaderCircle, RotateCcw, Send, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { acceptMapEditProposal, compensateMapEditProposal, generateMapEditProposal, listMapEditProposals, readVisualDocument, rejectMapEditProposal, type MapDocument, type MapEditProposal } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";

export type TianyiMapEditContext = { mapId: string; relativePath: string; baseContentHash: string; editableObjectIds: string[]; activeLayerId: string };
type ReviewView = "before" | "after" | "compare";
type LocalOutcome = "cancelled" | "expired" | "undo-blocked" | "failed" | null;

export function MapAiCollaborationPanel(props: { runtime: TianyanShellRuntimeState; context: TianyiMapEditContext; ensureConversation(): Promise<string> }) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId ?? "work-version.unversioned";
  const [map, setMap] = useState<MapDocument | null>(null);
  const [mode, setMode] = useState<"selection" | "region">(props.context.editableObjectIds.length ? "selection" : "region");
  const [references, setReferences] = useState<string[]>([]);
  const [avoidAreaReferences, setAvoidAreaReferences] = useState<string[]>([]);
  const [layerId, setLayerId] = useState(props.context.activeLayerId);
  const [bounds, setBounds] = useState({ x: 55, y: 55, width: 25, height: 25 });
  const [proposal, setProposal] = useState<MapEditProposal | null>(null);
  const [summary, setSummary] = useState("");
  const [reviewView, setReviewView] = useState<ReviewView>("compare");
  const [focusNonce, setFocusNonce] = useState(0);
  const [busy, setBusy] = useState<"generate" | "accept" | "reject" | "compensate" | null>(null);
  const [outcome, setOutcome] = useState<LocalOutcome>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const contextKey = `${projectId ?? "none"}:${workVersionId}:${props.context.mapId}:${props.context.baseContentHash}`;
  const currentKey = useRef(contextKey);
  currentKey.current = contextKey;
  const profileId = useMemo(() => {
    const selectedModelId = props.runtime.modelStatus?.profile.profile?.modelId;
    return props.runtime.modelStatus?.profiles.find((item) => item.modelId === selectedModelId)?.id ?? null;
  }, [props.runtime.modelStatus]);
  const providerReady = props.runtime.modelStatus?.tianyiDialogue.ready === true && Boolean(profileId);

  const dispatchReview = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent("story-studio-map-ai-review", { detail: { mapId: props.context.mapId, ...detail } }));
  const publish = (next: MapEditProposal | null, options: { bounds?: typeof bounds | null; view?: ReviewView; command?: "focus" | "fit" | "restore"; nonce?: number } = {}) => dispatchReview({
    proposal: next,
    regionBounds: options.bounds === undefined ? mode === "region" ? bounds : null : options.bounds,
    referenceObjectIds: next?.referenceObjectIds ?? references,
    reviewView: options.view ?? reviewView,
    focusNonce: options.nonce ?? focusNonce,
    command: options.command ?? null
  });

  useEffect(() => {
    controller.current?.abort();
    setMap(null); setProposal(null); setSummary(""); setError(""); setOutcome(null); setReferences([]); setAvoidAreaReferences([]);
    if (!projectId) return;
    let active = true;
    void Promise.all([readVisualDocument(projectId, props.context.relativePath), listMapEditProposals(projectId, props.context.relativePath)]).then(([document, proposals]) => {
      if (!active || document.type !== "map" || document.id !== props.context.mapId) return;
      const latest = proposals.find((item) => item.status === "pending" || item.status === "accepted") ?? null;
      setMap(document); setProposal(latest); setReferences(latest?.referenceObjectIds ?? []); setAvoidAreaReferences(latest?.constraints?.avoidAreaObjectIds ?? []);
      dispatchReview({ proposal: latest, regionBounds: null, referenceObjectIds: latest?.referenceObjectIds ?? [], reviewView: latest?.status === "accepted" ? "after" : "compare", focusNonce: 0, command: null });
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "地图协作上下文读取失败。"); });
    return () => { active = false; controller.current?.abort(); dispatchReview({ proposal: null, regionBounds: null }); };
  }, [contextKey]);

  useEffect(() => { publish(proposal); }, [bounds.x, bounds.y, bounds.width, bounds.height, mode, reviewView, focusNonce]);

  const generate = () => void (async () => {
    const prompt = props.runtime.workComposerDraft.trim();
    if (!projectId || !map || !profileId || !prompt || busy) return;
    const requestKey = currentKey.current;
    const abort = new AbortController();
    controller.current = abort; setBusy("generate"); setError(""); setOutcome(null); setSummary("");
    try {
      const sessionId = await props.ensureConversation();
      const result = await props.runtime.withConnection((token) => generateMapEditProposal({
        projectId, workVersionId, sessionId, relativePath: map.relativePath, operationId: `operation.map-real-ai.${crypto.randomUUID()}`,
        baseContentHash: map.contentHash, profileId, prompt,
        scope: mode === "selection" ? { kind: "selection", mapId: map.id, objectIds: props.context.editableObjectIds, bounds: null } : { kind: "region", mapId: map.id, objectIds: [], bounds, layerId },
        referenceObjectIds: references, avoidAreaObjectIds: avoidAreaReferences, preserveLineEndpoints: true, token, signal: abort.signal
      }));
      if (currentKey.current !== requestKey) return;
      const nextNonce = focusNonce + 1;
      setProposal(result.proposal); setSummary(result.summary); setReviewView("compare"); setFocusNonce(nextNonce); props.runtime.setWorkComposerDraft("");
      publish(result.proposal, { bounds: null, view: "compare", command: "focus", nonce: nextNonce });
    } catch (cause) {
      if (currentKey.current !== requestKey) return;
      if ((cause instanceof DOMException || cause instanceof Error) && cause.name === "AbortError") { setOutcome("cancelled"); setError(""); }
      else { setOutcome("failed"); setError(cause instanceof Error ? cause.message : "真实模型未能生成地图提案。"); }
    } finally { if (currentKey.current === requestKey) setBusy(null); controller.current = null; }
  })();

  const decide = (action: "accept" | "reject" | "compensate") => void (async () => {
    if (!projectId || !proposal || busy) return;
    setBusy(action); setError(""); setOutcome(null);
    try {
      const next = await props.runtime.withConnection((token) => action === "accept" ? acceptMapEditProposal(projectId, proposal.operationId, token) : action === "reject" ? rejectMapEditProposal(projectId, proposal.operationId, token) : compensateMapEditProposal(projectId, proposal.operationId, token));
      setProposal(next);
      const current = await readVisualDocument(projectId, props.context.relativePath);
      if (current.type === "map") setMap(current);
      setReviewView(next.status === "accepted" ? "after" : "before");
      window.dispatchEvent(new CustomEvent("story-studio-map-ai-committed", { detail: { mapId: props.context.mapId, action, proposal: next } }));
      dispatchReview({ proposal: next.status === "rejected" || next.status === "compensated" ? null : next, regionBounds: null, referenceObjectIds: next.referenceObjectIds ?? [], reviewView: next.status === "accepted" ? "after" : "before", focusNonce, command: null });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "地图提案操作失败。";
      setOutcome(action === "compensate" && /后续|已有修改|补偿覆盖/u.test(message) ? "undo-blocked" : action === "accept" && /改变|旧 AI|修订/u.test(message) ? "expired" : "failed");
      setError(message);
    } finally { setBusy(null); }
  })();

  const startNewRequest = () => void (async () => {
    if (!projectId || busy) return;
    setBusy("generate"); setError(""); setOutcome(null);
    try {
      const current = await readVisualDocument(projectId, props.context.relativePath);
      if (current.type !== "map" || current.id !== props.context.mapId) throw new Error("当前地图已失效；无法建立新请求。");
      setMap(current); setProposal(null); setSummary(""); publish(null);
    } catch (cause) { setOutcome("failed"); setError(cause instanceof Error ? cause.message : "当前地图读取失败。"); }
    finally { setBusy(null); }
  })();

  const editable = map?.content.drawings.filter((item) => props.context.editableObjectIds.includes(item.id)) ?? [];
  const referenceChoices = map?.content.drawings.filter((item) => !props.context.editableObjectIds.includes(item.id)) ?? [];
  const writableLayers = map?.content.layers.filter((item) => !item.locked) ?? [];
  const changes = proposal?.preview.changes ?? [];
  const proposalReferences = map?.content.drawings.filter((item) => (proposal?.referenceObjectIds ?? references).includes(item.id)) ?? [];
  const canReviewGeometry = Boolean(proposal && proposal.status !== "rejected" && proposal.status !== "compensated");
  const statusTitle = busy === "generate" ? "生成中" : busy === "accept" ? "保存中" : outcome === "cancelled" ? "已取消" : outcome === "expired" ? "已过期" : outcome === "undo-blocked" ? "无法直接撤销" : outcome === "failed" ? "失败" : proposal?.status === "pending" ? "待作者审阅" : proposal?.status === "accepted" ? "已接受" : proposal?.status === "rejected" ? "已拒绝" : proposal?.status === "compensated" ? "已撤销" : null;

  const selectReviewView = (view: ReviewView) => { setReviewView(view); publish(proposal, { view }); };
  const commandReviewViewport = (command: "focus" | "fit" | "restore") => {
    if (command !== "focus") { publish(proposal, { command }); return; }
    const next = focusNonce + 1;
    setFocusNonce(next);
    publish(proposal, { command, nonce: next });
  };
  const toggleReference = (id: string) => setReferences((items) => {
    if (items.includes(id)) { setAvoidAreaReferences((avoids) => avoids.filter((item) => item !== id)); return items.filter((item) => item !== id); }
    return [...items, id];
  });

  return <section className="tianyi-map-collaboration" aria-label="天意地图协作">
    <div className="tianyi-map-review-scroll">
      <header><strong>{map?.title ?? "正在读取地图"}</strong><small>真实文本模型 · 结构化图形 · 当前修订 {map?.revision ?? "-"}</small></header>
      <p className="tianyi-map-boundary">模型只读取此地图的结构化坐标；没有看到底图图片。只读参考不会被修改，只有明确勾选的范围会接受确定性避让检查。</p>
      {!proposal || proposal.status === "rejected" || proposal.status === "compensated" ? <RequestEditor mode={mode} setMode={setMode} editable={editable} map={map} layerId={layerId} setLayerId={setLayerId} bounds={bounds} setBounds={setBounds} referenceChoices={referenceChoices} references={references} avoidAreaReferences={avoidAreaReferences} toggleReference={toggleReference} setAvoidAreaReferences={setAvoidAreaReferences} runtime={props.runtime} busy={busy} providerReady={providerReady} generate={generate} cancel={() => controller.current?.abort()} /> : null}
      {statusTitle ? <section className={`tianyi-map-status is-${outcome ?? proposal?.status ?? busy}`} role="status"><strong>{statusTitle}</strong><span>{busy === "generate" ? "可以取消；正式地图尚无写入。" : busy === "accept" ? "正在重验基准修订、图层、范围和空间约束；请勿重复提交。" : outcome === "cancelled" ? "生成已停止，没有创建或应用地图提案。" : outcome === "expired" ? "地图已变化，本次提案没有写入；请基于当前地图重新提出修改。" : outcome === "undo-blocked" ? "接受后的人工编辑受到保护；撤销已停止，当前地图没有因此改变。" : outcome === "failed" ? "操作没有确认成功；请按下方错误查看发生步骤与写入状态。" : proposal?.status === "pending" ? "修改仅为预览，正式地图尚未改变。" : proposal?.status === "accepted" ? `已保存到地图修订 ${proposal.resultRevision ?? "（按回执哈希记录）"}。` : proposal?.status === "rejected" ? "本次提案未应用，正式地图保持不变。" : "此次 AI 修改已通过新的地图修订撤销；历史与原接受回执仍保留。"}</span></section> : null}
      {busy === "generate" ? <p className="tianyi-map-progress"><LoaderCircle className="is-spinning"/>真实模型正在生成受约束提案…</p> : null}
      {proposal ? <ReviewBody proposal={proposal} summary={summary} reviewView={reviewView} canReviewGeometry={canReviewGeometry} proposalReferences={proposalReferences} changes={changes} onView={selectReviewView} onCommand={commandReviewViewport} /> : null}
      {error ? <p className="tianyi-map-error" role="alert"><Ban/>{error}<span>{outcome === "expired" ? "正式地图没有写入。" : outcome === "undo-blocked" ? "撤销没有写入，后续人工编辑保持不变。" : "请确认当前地图和 Provider 状态后重试。"}</span></p> : null}
    </div>
    {proposal?.status === "pending" ? <footer className="tianyi-map-review-decision"><button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => decide("accept")}><Check/>{busy === "accept" ? "保存中…" : "接受并保存"}</button><button type="button" disabled={Boolean(busy)} onClick={() => decide("reject")}><X/>{busy === "reject" ? "拒绝中…" : "拒绝"}</button></footer> : proposal?.status === "accepted" ? <footer className="tianyi-map-review-decision"><button type="button" disabled={Boolean(busy)} onClick={() => decide("compensate")}><RotateCcw/>{busy === "compensate" ? "撤销中…" : "撤销此次 AI 修改"}</button><button type="button" disabled={Boolean(busy)} onClick={startNewRequest}>基于当前地图新请求</button></footer> : null}
  </section>;
}

function RequestEditor(props: any) {
  const writableLayers = props.map?.content.layers.filter((item: any) => !item.locked) ?? [];
  return <>
    <div role="tablist" aria-label="地图协作范围" className="tianyi-map-scope-tabs"><button type="button" role="tab" aria-selected={props.mode === "selection"} disabled={!props.editable.length} onClick={() => props.setMode("selection")}>修改所选 {props.editable.length ? `(${props.editable.length})` : ""}</button><button type="button" role="tab" aria-selected={props.mode === "region"} onClick={() => props.setMode("region")}>区域内新增</button></div>
    {props.mode === "selection" ? <><section className="tianyi-map-scope-card"><b>可修改</b>{props.editable.length ? props.editable.map((item: any) => <span key={item.id}>{item.label ?? item.subtype}</span>) : <p>地图页面没有选择可编辑图形；不会扩大为整张地图。</p>}</section><small>线条端点默认受保护；模型若改变首尾点，整个结果会被拒绝。</small></> : <section className="tianyi-map-region-controls"><label>可编辑图层<select value={props.layerId} onChange={(event) => props.setLayerId(event.target.value)}>{writableLayers.map((layer: any) => <option key={layer.id} value={layer.id}>{layer.title}</option>)}</select></label><fieldset><legend>明确区域（地图坐标）</legend>{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key === "x" ? "左" : key === "y" ? "上" : key === "width" ? "宽" : "高"}<input type="number" min="0" max="100" value={props.bounds[key]} onChange={(event) => props.setBounds((value: any) => ({ ...value, [key]: Number(event.target.value) }))}/></label>)}</fieldset><small>虚线框是本次唯一可新增范围；既有对象全部只读。</small></section>}
    <details><summary>选择模型可读取的参考（{props.references.length}）</summary><div className="tianyi-map-reference-list">{props.referenceChoices.map((item: any) => <div key={item.id}><label><input type="checkbox" checked={props.references.includes(item.id)} onChange={() => props.toggleReference(item.id)}/><span>{item.label ?? item.subtype}</span><small>只读</small></label>{item.kind === "area" ? <label className="tianyi-map-avoidance"><input aria-label={`将${item.label ?? item.subtype}作为不可穿越范围`} type="checkbox" disabled={!props.references.includes(item.id)} checked={props.avoidAreaReferences.includes(item.id)} onChange={() => props.setAvoidAreaReferences((items: string[]) => items.includes(item.id) ? items.filter((id) => id !== item.id) : [...items, item.id])}/><span>作为不可穿越范围检查</span></label> : <small>这是图示路径或散点，不会被当作完整占地区域。</small>}</div>)}</div></details>
    <form className="tianyi-map-request" onSubmit={(event) => { event.preventDefault(); props.generate(); }}><label>告诉天意要怎样改<textarea rows={5} value={props.runtime.workComposerDraft} onChange={(event) => props.runtime.setWorkComposerDraft(event.target.value)} placeholder={props.mode === "selection" ? "例如：让道路绕开已勾选的只读范围，并保持两个端点不变。" : "例如：在框内新增两个入口标记，保留所有既有内容。"}/></label>{props.busy === "generate" ? <button type="button" className="is-stop" onClick={props.cancel}><Square/>取消生成</button> : <button type="submit" className="primary-action" disabled={!props.providerReady || !props.map || !props.runtime.workComposerDraft.trim() || (props.mode === "selection" ? !props.editable.length : !props.layerId)}><Send/>请求真实模型</button>}{!props.providerReady ? <small>当前没有可用的真实文本 Provider；不会回退为假服务。</small> : <small>一次请求最多产生 8 个待审操作；生成不会直接写地图。</small>}</form>
  </>;
}

function ReviewBody(props: any) {
  const proposal: MapEditProposal = props.proposal;
  return <section className={`tianyi-map-review is-${proposal.status}`}>
    {props.canReviewGeometry ? <><div className="tianyi-map-review-views" role="tablist" aria-label="提案对比视图"><button type="button" role="tab" aria-selected={props.reviewView === "before"} onClick={() => props.onView("before")}>修改前</button><button type="button" role="tab" aria-selected={props.reviewView === "after"} onClick={() => props.onView("after")}>修改后 · {proposal.status === "pending" ? "未保存" : "已保存"}</button><button type="button" role="tab" aria-selected={props.reviewView === "compare"} onClick={() => props.onView("compare")}>叠加对比</button></div><div className="tianyi-map-review-viewport-actions"><button type="button" onClick={() => props.onCommand("focus")}>聚焦本次变化</button><button type="button" onClick={() => props.onCommand("fit")}>查看整张地图</button><button type="button" onClick={() => props.onCommand("restore")}>返回原视口</button></div></> : null}
    <section className="tianyi-map-review-brief"><h3>你的要求</h3><p>{proposal.prompt}</p><h3>准备修改</h3><ul>{props.changes.map((change: any) => { const operationIndex = proposal.operations.findIndex((operation) => ("targetId" in operation ? operation.targetId : "value" in operation ? operation.value.id : null) === change.drawingId); return <li key={`${change.kind}:${change.drawingId}`}><b>{change.kind === "added" ? "新增" : change.kind === "modified" ? "修改" : "删除"}</b><span>{change.after?.label ?? change.before?.label ?? change.after?.subtype ?? change.before?.subtype ?? change.drawingId}</span><small>{proposal.operationExplanations?.find((item) => item.operationIndex === operationIndex)?.reason ?? "结构化差异"}</small></li>; })}</ul><h3>保持不动的参考</h3><p>{props.proposalReferences.length ? props.proposalReferences.map((item: any) => item.label ?? item.subtype).join("、") : "没有选择只读参考。"}</p></section>
    <section className="tianyi-map-review-checks"><h3>系统已经检查</h3><ul>{proposal.spatialChecks?.map((check) => <li key={check.kind}><Check aria-hidden="true"/>{check.kind === "line-endpoints-preserved" ? "道路起点和终点与修改前完全一致" : "建议道路未接触或进入作者明确选择的范围多边形"}</li>)}<li><Check aria-hidden="true"/>修改对象、图层、坐标和操作数量均在授权范围内</li></ul><h3>仍需作者判断</h3><p>路线是否符合地标、叙事意图和视觉质量；模型理由只是建议，不是系统检查结果。</p></section>
    {props.summary ? <details><summary>查看 AI 的建议摘要</summary><p>{props.summary}</p></details> : null}
    {proposal.generation?.kind === "real-provider" ? <details><summary>技术来源</summary><p>{proposal.generation.providerId} · {proposal.generation.modelId} · 基于修订 {proposal.baseRevision}</p></details> : null}
  </section>;
}
