import { Ban, Check, LoaderCircle, RotateCcw, Send, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  acceptMapEditProposal,
  compensateMapEditProposal,
  generateMapEditProposal,
  listMapEditProposals,
  readVisualDocument,
  rejectMapEditProposal,
  type MapDocument,
  type MapEditProposal
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";

export type TianyiMapEditContext = {
  mapId: string;
  relativePath: string;
  baseContentHash: string;
  editableObjectIds: string[];
  activeLayerId: string;
};

export function MapAiCollaborationPanel(props: {
  runtime: TianyanShellRuntimeState;
  context: TianyiMapEditContext;
  ensureConversation(): Promise<string>;
}) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId ?? "work-version.unversioned";
  const [map, setMap] = useState<MapDocument | null>(null);
  const [mode, setMode] = useState<"selection" | "region">(props.context.editableObjectIds.length ? "selection" : "region");
  const [references, setReferences] = useState<string[]>([]);
  const [layerId, setLayerId] = useState(props.context.activeLayerId);
  const [bounds, setBounds] = useState({ x: 55, y: 55, width: 25, height: 25 });
  const [proposal, setProposal] = useState<MapEditProposal | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState<"generate" | "accept" | "reject" | "compensate" | null>(null);
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

  const publish = (next: MapEditProposal | null, nextBounds = mode === "region" ? bounds : null) => {
    window.dispatchEvent(new CustomEvent("story-studio-map-ai-review", { detail: { mapId: props.context.mapId, proposal: next, regionBounds: nextBounds } }));
  };

  useEffect(() => {
    controller.current?.abort();
    setMap(null); setProposal(null); setSummary(""); setError(""); setReferences([]);
    if (!projectId) return;
    let active = true;
    void Promise.all([readVisualDocument(projectId, props.context.relativePath), listMapEditProposals(projectId, props.context.relativePath)]).then(([document, proposals]) => {
      if (!active || document.type !== "map" || document.id !== props.context.mapId) return;
      setMap(document);
      const latest = proposals.find((item) => item.status === "pending" || item.status === "accepted") ?? null;
      setProposal(latest);
      publish(latest, null);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "地图协作上下文读取失败。"); });
    return () => { active = false; controller.current?.abort(); publish(null, null); };
  }, [contextKey]);

  useEffect(() => { if (mode === "region") publish(proposal, bounds); else publish(proposal, null); }, [bounds.x, bounds.y, bounds.width, bounds.height, mode]);

  const generate = () => void (async () => {
    const prompt = props.runtime.workComposerDraft.trim();
    if (!projectId || !map || !profileId || !prompt || busy) return;
    const requestKey = currentKey.current;
    const abort = new AbortController();
    controller.current = abort; setBusy("generate"); setError(""); setSummary("");
    try {
      const sessionId = await props.ensureConversation();
      const result = await props.runtime.withConnection((token) => generateMapEditProposal({
        projectId, workVersionId, sessionId, relativePath: map.relativePath,
        operationId: `operation.map-real-ai.${crypto.randomUUID()}`,
        baseContentHash: map.contentHash, profileId, prompt,
        scope: mode === "selection"
          ? { kind: "selection", mapId: map.id, objectIds: props.context.editableObjectIds, bounds: null }
          : { kind: "region", mapId: map.id, objectIds: [], bounds, layerId },
        referenceObjectIds: references,
        preserveLineEndpoints: true,
        token, signal: abort.signal
      }));
      if (currentKey.current !== requestKey) return;
      setProposal(result.proposal); setSummary(result.summary); props.runtime.setWorkComposerDraft(""); publish(result.proposal);
    } catch (cause) {
      if (currentKey.current === requestKey) setError(cause instanceof Error ? cause.message : "真实模型未能生成地图提案。");
    } finally { if (currentKey.current === requestKey) setBusy(null); controller.current = null; }
  })();

  const decide = (action: "accept" | "reject" | "compensate") => void (async () => {
    if (!projectId || !proposal || busy) return;
    setBusy(action); setError("");
    try {
      const next = await props.runtime.withConnection((token) => action === "accept" ? acceptMapEditProposal(projectId, proposal.operationId, token) : action === "reject" ? rejectMapEditProposal(projectId, proposal.operationId, token) : compensateMapEditProposal(projectId, proposal.operationId, token));
      setProposal(next); publish(next.status === "pending" ? next : null, null);
      window.dispatchEvent(new CustomEvent("story-studio-map-ai-committed", { detail: { mapId: props.context.mapId, action, proposal: next } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "地图提案操作失败；正式地图没有改变。"); }
    finally { setBusy(null); }
  })();

  const startNewRequest = () => void (async () => {
    if (!projectId || busy) return;
    setBusy("generate"); setError("");
    try {
      const current = await readVisualDocument(projectId, props.context.relativePath);
      if (current.type !== "map" || current.id !== props.context.mapId) throw new Error("当前地图已失效；无法建立新请求。");
      setMap(current); setProposal(null); setSummary(""); publish(null, mode === "region" ? bounds : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "当前地图读取失败。"); }
    finally { setBusy(null); }
  })();

  const editable = map?.content.drawings.filter((item) => props.context.editableObjectIds.includes(item.id)) ?? [];
  const referenceChoices = map?.content.drawings.filter((item) => !props.context.editableObjectIds.includes(item.id)) ?? [];
  const writableLayers = map?.content.layers.filter((item) => !item.locked) ?? [];
  const changes = proposal?.preview.changes ?? [];

  return <section className="tianyi-map-collaboration" aria-label="天意地图协作">
    <header><strong>{map?.title ?? "正在读取地图"}</strong><small>真实文本模型 · 结构化图形 · 修订 {map?.revision ?? "-"}</small></header>
    <p className="tianyi-map-boundary">模型只读取此地图的结构化坐标；没有看到底图图片，也不能修改地点、关系、道路通行或父子图校准。</p>
    <div role="tablist" aria-label="地图协作范围" className="tianyi-map-scope-tabs">
      <button type="button" role="tab" aria-selected={mode === "selection"} disabled={!editable.length || Boolean(proposal?.status === "pending")} onClick={() => setMode("selection")}>修改所选 {editable.length ? `(${editable.length})` : ""}</button>
      <button type="button" role="tab" aria-selected={mode === "region"} disabled={Boolean(proposal?.status === "pending")} onClick={() => setMode("region")}>区域内新增</button>
    </div>
    {mode === "selection" ? <>
      <section className="tianyi-map-scope-card"><b>可修改</b>{editable.length ? editable.map((item) => <span key={item.id}>{item.label ?? item.subtype}</span>) : <p>地图页面没有选择可编辑图形；不会扩大为整张地图。</p>}</section>
      <small>线条端点默认受保护；模型若改变首尾点，整个结果会被拒绝。</small>
    </> : <section className="tianyi-map-region-controls">
      <label>可编辑图层<select value={layerId} onChange={(event) => setLayerId(event.target.value)}>{writableLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.title}</option>)}</select></label>
      <fieldset><legend>明确区域（地图坐标）</legend>{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key === "x" ? "左" : key === "y" ? "上" : key === "width" ? "宽" : "高"}<input type="number" min="0" max="100" value={bounds[key]} onChange={(event) => setBounds((value) => ({ ...value, [key]: Number(event.target.value) }))}/></label>)}</fieldset>
      <small>虚线框是本次唯一可新增范围；既有对象全部只读。</small>
    </section>}
    <details><summary>选择模型可读取的参考（{references.length}）</summary><div className="tianyi-map-reference-list">{referenceChoices.map((item) => <label key={item.id}><input type="checkbox" checked={references.includes(item.id)} onChange={() => setReferences((items) => items.includes(item.id) ? items.filter((id) => id !== item.id) : [...items, item.id])}/><span>{item.label ?? item.subtype}</span><small>只读</small></label>)}</div></details>
    {!proposal || proposal.status === "rejected" || proposal.status === "compensated" ? <form className="tianyi-map-request" onSubmit={(event) => { event.preventDefault(); generate(); }}>
      <label>告诉天意要怎样改<textarea rows={5} value={props.runtime.workComposerDraft} onChange={(event) => props.runtime.setWorkComposerDraft(event.target.value)} placeholder={mode === "selection" ? "例如：让道路绕开只读森林，并保持两个端点不变。" : "例如：在框内新增两个入口标记，保留所有既有内容。"}/></label>
      {busy === "generate" ? <button type="button" className="is-stop" onClick={() => controller.current?.abort()}><Square/>取消生成</button> : <button type="submit" className="primary-action" disabled={!providerReady || !map || !props.runtime.workComposerDraft.trim() || (mode === "selection" ? !editable.length : !layerId)}><Send/>请求真实模型</button>}
      {!providerReady ? <small>当前没有可用的真实文本 Provider；不会回退为假服务。</small> : <small>一次请求最多产生 8 个待审操作；生成不会直接写地图。</small>}
    </form> : null}
    {busy === "generate" ? <p className="tianyi-map-progress" role="status"><LoaderCircle className="is-spinning"/>真实模型正在生成受约束提案…</p> : null}
    {proposal ? <section className={`tianyi-map-review is-${proposal.status}`}>
      <header><strong>{proposal.status === "pending" ? "待作者审阅" : proposal.status === "accepted" ? "已接受" : proposal.status === "rejected" ? "已拒绝" : "已补偿"}</strong>{proposal.generation?.kind === "real-provider" ? <span>{proposal.generation.providerId} · {proposal.generation.modelId}</span> : null}</header>
      {summary ? <p>{summary}</p> : null}
      <ul>{changes.map((change) => { const operationIndex = proposal.operations.findIndex((operation) => ("targetId" in operation ? operation.targetId : "value" in operation ? operation.value.id : null) === change.drawingId); return <li key={`${change.kind}:${change.drawingId}`}><b>{change.kind === "added" ? "新增" : change.kind === "modified" ? "修改" : "删除"}</b><span>{change.after?.label ?? change.before?.label ?? change.after?.subtype ?? change.before?.subtype ?? change.drawingId}</span><small>{proposal.operationExplanations?.find((item) => item.operationIndex === operationIndex)?.reason ?? "结构化差异"}</small></li>; })}</ul>
      <p>地图上红色虚线为修改前，绿色实线为提案后；正式地图尚未改变。</p>
      {proposal.status === "pending" ? <div><button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => decide("accept")}><Check/>接受并保存</button><button type="button" disabled={Boolean(busy)} onClick={() => decide("reject")}><X/>拒绝</button></div> : proposal.status === "accepted" ? <div><button type="button" disabled={Boolean(busy)} onClick={() => decide("compensate")}><RotateCcw/>补偿这次接受</button><button type="button" disabled={Boolean(busy)} onClick={startNewRequest}>基于当前地图新请求</button></div> : null}
    </section> : null}
    {error ? <p className="tianyi-map-error" role="alert"><Ban/>{error}</p> : null}
  </section>;
}
