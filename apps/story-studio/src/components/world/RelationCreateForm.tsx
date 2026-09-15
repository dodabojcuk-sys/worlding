import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

import {
  confirmRelationCandidate,
  createRelationCandidate,
  createRelationType,
  getRelationDuplicateSuggestions,
  getVerifiedCanonEventList,
  listRelationTypes,
  rejectRelationCandidate,
  type RelationTypeDefinition,
  type WorldObjectSummary
} from "../../lib/localTransport";
import { ensureRelationWriteAttempt, relationWriteFingerprint, type RelationWriteAttempt } from "./relationCreateAttempt";

type CreateDirection = "forward" | "both";
type EvidenceMode = "author-declaration" | "confirmed-event";
type CandidateRelation = Awaited<ReturnType<typeof createRelationCandidate>>["relation"];

/**
 * 人工人物关系表单：候选与确认继续经由唯一 Relation Owner。
 * 作者可直接声明设定，也可附加已确认事件作为来源依据。
 */
export function RelationCreateForm(props: {
  projectId: string;
  workVersionId: string;
  objects: readonly WorldObjectSummary[];
  withConnection<T>(fn: (token: string) => Promise<T>): Promise<T>;
  onClose(): void;
  onChanged(): void;
}) {
  const characters = useMemo(() => props.objects.filter((item) => item.type === "character" && item.status !== "archived"), [props.objects]);
  const committedEvents = useMemo(() => props.objects.filter((item) => item.type === "event" && item.status === "committed"), [props.objects]);
  const [types, setTypes] = useState<readonly RelationTypeDefinition[]>([]);
  const [verifiedIds, setVerifiedIds] = useState<ReadonlySet<string>>(new Set());
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [direction, setDirection] = useState<CreateDirection>("forward");
  const [typeChoice, setTypeChoice] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("author-declaration");
  const [evidenceEventId, setEvidenceEventId] = useState("");
  const [candidate, setCandidate] = useState<CandidateRelation | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const writeAttempt = useRef<RelationWriteAttempt | null>(null);
  const decisionOperations = useRef(new Map<string, { confirm: string; reject: string }>());

  useEffect(() => {
    let active = true;
    void Promise.all([listRelationTypes(props.projectId), getVerifiedCanonEventList(props.projectId, props.workVersionId)]).then(([types, verified]) => {
      if (!active) return;
      setTypes(types.types);
      setVerifiedIds(new Set(verified.status === "ready" ? verified.eventIds : []));
    }).catch(() => {
      if (active) setError("关系类型与已确认事件暂时读取失败；请关闭后重新打开本面板。");
    });
    return () => { active = false; };
  }, [props.projectId, props.workVersionId]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); props.onClose(); return; }
      if (event.key !== "Tab") return;
      const items = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])")].filter((item) => item.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const usableEvents = committedEvents.filter((event) => verifiedIds.has(event.id));
  const source = characters.find((item) => item.id === sourceId) ?? null;
  const target = characters.find((item) => item.id === targetId) ?? null;
  const chosenTypeLabel = typeChoice === "__new__" ? newTypeLabel.trim() : types.find((type) => type.relationTypeId === typeChoice)?.label ?? "";
  const evidenceEvent = usableEvents.find((event) => event.id === evidenceEventId) ?? null;
  const duplicateCharacterTitles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const character of characters) counts.set(character.title, (counts.get(character.title) ?? 0) + 1);
    return counts;
  }, [characters]);
  const characterOptionLabel = (item: WorldObjectSummary) => duplicateCharacterTitles.get(item.title)! > 1 ? `${item.title} · 身份 ${item.id.slice(-6)}` : item.title;

  const missing: string[] = [];
  if (!sourceId) missing.push("来源人物");
  if (!targetId) missing.push("目标人物");
  if (!chosenTypeLabel) missing.push("关系名称");
  if (evidenceMode === "confirmed-event" && !evidenceEventId) missing.push("依据事件");

  const currentWriteAttempt = () => {
    const fingerprint = relationWriteFingerprint({ sourceId, targetId, direction, typeChoice, newTypeLabel, evidenceMode, evidenceEventId });
    writeAttempt.current = ensureRelationWriteAttempt(writeAttempt.current, fingerprint, () => crypto.randomUUID());
    return writeAttempt.current;
  };
  const decisionOperation = (relationId: string, action: "confirm" | "reject") => {
    const current = decisionOperations.current.get(relationId) ?? {
      confirm: `relation-manual-confirm.${crypto.randomUUID()}`,
      reject: `relation-manual-reject.${crypto.randomUUID()}`
    };
    decisionOperations.current.set(relationId, current);
    return current[action];
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "关系操作没有完成；现有关系未被改写。");
    } finally { setBusy(false); }
  };

  const submitCandidate = () =>
    run(async () => {
      if (!sourceId || !targetId) { setError("请选择来源与目标人物。"); return; }
      if (sourceId === targetId) { setError("来源与目标是同一位人物；关系不能连接对象自身。"); return; }
      if (!chosenTypeLabel) { setError("请选择或输入关系名称。"); return; }
      if (evidenceMode === "confirmed-event" && !evidenceEvent) { setError("请选择当前版本的已确认事件；也可改为“作者直接设定”。"); return; }
      const attempt = currentWriteAttempt();
      const candidateRelation = await props.withConnection(async (token) => {
        let relationTypeId = attempt.createdTypeId ?? typeChoice;
        if (typeChoice === "__new__" && !attempt.createdTypeId) {
          const created = await createRelationType({ projectId: props.projectId, label: chosenTypeLabel, operationId: attempt.typeOperationId, token });
          relationTypeId = created.type.relationTypeId;
          attempt.createdTypeId = relationTypeId;
          setTypes((current) => current.some((item) => item.relationTypeId === created.type.relationTypeId) ? current : [...current, created.type]);
        }
        const duplicates = await getRelationDuplicateSuggestions({ projectId: props.projectId, sourceObjectId: sourceId, targetObjectId: targetId, relationTypeId, direction, relationLabelSnapshot: chosenTypeLabel });
        const created = await createRelationCandidate({
          projectId: props.projectId,
          workVersionId: props.workVersionId,
          sourceObjectId: sourceId,
          targetObjectId: targetId,
          relationTypeId,
          relationLabelSnapshot: chosenTypeLabel,
          direction,
          evidenceRefs: evidenceMode === "confirmed-event" && evidenceEvent ? [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: props.projectId, eventId: evidenceEvent.id, revisionToken: evidenceEvent.revisionToken, state: "committed", requestedUse: "constraint" } }] : [],
          operationId: attempt.candidateOperationId,
          token
        });
        return { created, duplicateCount: duplicates.suggestions.length };
      });
      setCandidate(candidateRelation.created.relation);
      setStatus(candidateRelation.duplicateCount ? `已建立候选；同一对人物已有 ${candidateRelation.duplicateCount} 条同类型关系，新关系不会覆盖它们。` : "");
    });

  const confirmCandidate = () =>
    run(async () => {
      if (!candidate) return;
      await props.withConnection((token) => confirmRelationCandidate({ projectId: props.projectId, workVersionId: props.workVersionId, relationId: candidate.relationId, expectedRelationRevision: candidate.revision, operationId: decisionOperation(candidate.relationId, "confirm"), token }));
      setStatus(`正式关系已建立：${source?.title ?? candidate.sourceObjectId} ${direction === "both" ? "与" : "指向"} ${target?.title ?? candidate.targetObjectId}（${candidate.relationLabelSnapshot}）。`);
      setCandidate(null);
      setSourceId(""); setTargetId(""); setEvidenceEventId("");
      writeAttempt.current = null;
      props.onChanged();
      props.onClose();
    });

  const rejectCandidate = () =>
    run(async () => {
      if (!candidate) return;
      await props.withConnection((token) => rejectRelationCandidate({ projectId: props.projectId, relationId: candidate.relationId, expectedRelationRevision: candidate.revision, operationId: decisionOperation(candidate.relationId, "reject"), token }));
      setStatus("候选已拒绝；没有写入正式关系。");
      setCandidate(null);
    });

  const directionText = () => {
    const s = source?.title ?? "来源";
    const t = target?.title ?? "目标";
    return direction === "both" ? `${s} 与 ${t} 互为双向` : `${s} 指向 ${t}`;
  };

  return <aside ref={panelRef} className="focused-relations-create" aria-label="人工建立关系" tabIndex={-1}>
    <header className="focused-relations-create-header"><div><small>人工建立</small><h2>建立人物关系</h2></div><button type="button" aria-label="关闭建立关系面板" onClick={props.onClose}><X /></button></header>
    <p className="focused-relations-create-intro">选择两位人物、他们的关系和这条关系的来源。确认前只会建立候选。</p>
    {candidate ? <div className="focused-relations-candidate" role="status">
      <p className="focused-relations-candidate-title"><CheckCircle2 /> 候选已建立（尚未成为正式关系）</p>
      <p className="focused-relations-candidate-line"><strong>{directionText()}</strong>｜{candidate.relationLabelSnapshot}</p>
      <p className="focused-relations-candidate-evidence">来源：{evidenceEvent ? `已确认事件“${evidenceEvent.title}”` : "作者直接设定"}</p>
      <div className="focused-relations-candidate-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => void confirmCandidate()}>确认建立正式关系</button>
        <button type="button" disabled={busy} onClick={() => void rejectCandidate()}>拒绝候选</button>
        <button type="button" disabled={busy} onClick={() => { setCandidate(null); setStatus("候选保留；可稍后在待确认中处理。"); }}>留作候选</button>
      </div>
    </div> : <>
      <div className="create-group">
        <p className="create-group-title">双方人物</p>
        <label className="create-field"><span>来源人物</span>
          <select aria-label="关系来源人物" value={sourceId} disabled={busy} onChange={(event) => setSourceId(event.target.value)}>
            <option value="">请选择</option>
            {characters.map((item) => <option key={item.id} value={item.id}>{characterOptionLabel(item)}</option>)}
          </select>
        </label>
        <label className="create-field"><span>目标人物</span>
          <select aria-label="关系目标人物" value={targetId} disabled={busy} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">请选择</option>
            {characters.map((item) => <option key={item.id} value={item.id}>{characterOptionLabel(item)}</option>)}
          </select>
        </label>
        {characters.length < 2 ? <p className="create-field-error" role="alert">当前作品还没有两位人物；请先到资料库建立。</p> : null}
      </div>
      <div className="create-group">
        <p className="create-group-title">关系内容</p>
        <label className="create-field"><span>关系名称</span>
          <select aria-label="关系类型" value={typeChoice} disabled={busy} onChange={(event) => setTypeChoice(event.target.value)}>
            <option value="">请选择</option>
            {types.map((type) => <option key={type.relationTypeId} value={type.relationTypeId}>{type.label}</option>)}
            <option value="__new__">新建关系名称…</option>
          </select>
        </label>
        {typeChoice === "__new__" ? <label className="create-field"><span>新关系名称</span><input value={newTypeLabel} maxLength={60} disabled={busy} onChange={(event) => setNewTypeLabel(event.target.value)} placeholder="例如：互相扶持" /></label> : null}
        <label className="create-field"><span>方向</span>
          <select aria-label="关系方向" value={direction} disabled={busy} onChange={(event) => setDirection(event.target.value as CreateDirection)}>
            <option value="forward">由来源指向目标</option>
            <option value="both">互为双向</option>
          </select>
        </label>
      </div>
      <div className="create-group">
        <p className="create-group-title">来源依据</p>
        <label className="create-field"><span>这条关系从哪里来</span>
          <select aria-label="关系来源" value={evidenceMode} disabled={busy} onChange={(event) => { setEvidenceMode(event.target.value as EvidenceMode); setEvidenceEventId(""); }}>
            <option value="author-declaration">作者直接设定</option>
            <option value="confirmed-event">已有事件支持</option>
          </select>
        </label>
        {evidenceMode === "confirmed-event" ? <label className="create-field"><span>选择已确认事件</span>
          <select aria-label="关系依据事件" value={evidenceEventId} disabled={busy} onChange={(event) => setEvidenceEventId(event.target.value)}>
            <option value="">{usableEvents.length ? "请选择已确认事件" : "当前版本还没有已确认事件"}</option>
            {usableEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label> : null}
        {evidenceMode === "confirmed-event" && !usableEvents.length ? <p className="create-field-error" role="alert">当前版本没有可用的已确认事件。可改为“作者直接设定”，或先到事件线确认事件。</p> : null}
      </div>
      {sourceId && targetId && chosenTypeLabel ? <div className="focused-relations-create-preview" role="status">
        <p className="focused-relations-create-preview-main">{source?.title} {direction === "both" ? "↔" : "→"} {target?.title}｜{chosenTypeLabel}</p>
        <p className="focused-relations-create-preview-direction">方向：{directionText()}{direction === "both" ? "" : "（单向）"}</p>
        <p className="focused-relations-create-preview-evidence">来源：{evidenceEvent ? `已确认事件“${evidenceEvent.title}”` : "作者直接设定"}</p>
        <details><summary>技术信息</summary><p>来源 ID：{sourceId}</p><p>目标 ID：{targetId}</p>{evidenceEvent ? <p>依据修订：{evidenceEvent.revisionToken}</p> : null}</details>
      </div> : missing.length ? <p className="focused-relations-create-missing" role="status">还缺：{missing.join("、")}。</p> : null}
      <button type="button" className="primary-action" disabled={busy || !sourceId || !targetId || sourceId === targetId || !chosenTypeLabel || (evidenceMode === "confirmed-event" && !evidenceEventId)} onClick={() => void submitCandidate()}>建立关系候选</button>
    </>}
    {status ? <p className="focused-relations-create-status" role="status">{status}</p> : null}
    {error ? <p className="focused-relations-create-error" role="alert">{error}</p> : null}
  </aside>;
}
