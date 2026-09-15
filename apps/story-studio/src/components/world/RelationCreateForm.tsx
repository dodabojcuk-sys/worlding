import { useEffect, useMemo, useState } from "react";
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

type CreateDirection = "forward" | "both";
type CandidateRelation = Awaited<ReturnType<typeof createRelationCandidate>>["relation"];

/**
 * 人工人物关系表单：双方实体按稳定 ID 选择（同名以 ID 尾号区分），
 * 关系名称复用既有 RelationType（可为当前作品新建类型），
 * 依据必须是当前版本内经作者确认链验证的正式事件；
 * 建立后先成为候选，作者再显式确认写入正式关系。
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
  const [evidenceEventId, setEvidenceEventId] = useState("");
  const [candidate, setCandidate] = useState<CandidateRelation | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([listRelationTypes(props.projectId), getVerifiedCanonEventList(props.projectId, props.workVersionId)]).then(([types, verified]) => {
      if (!active) return;
      setTypes(types.types);
      setVerifiedIds(new Set(verified.status === "ready" ? verified.eventIds : []));
    }).catch(() => {
      if (active) setError("关系类型与已确认事件暂时读取失败；请关闭后重新打开本表单。");
    });
    return () => { active = false; };
  }, [props.projectId, props.workVersionId]);

  const usableEvents = committedEvents.filter((event) => verifiedIds.has(event.id));
  const endpointLabel = (id: string) => {
    const object = props.objects.find((item) => item.id === id);
    return object ? `${object.title}（${id.slice(-6)}）` : id;
  };
  const chosenTypeLabel = typeChoice === "__new__" ? newTypeLabel.trim() : types.find((type) => type.relationTypeId === typeChoice)?.label ?? "";
  const evidenceEvent = usableEvents.find((event) => event.id === evidenceEventId) ?? null;
  const preview = sourceId && targetId && chosenTypeLabel
    ? `${endpointLabel(sourceId)} ${direction === "both" ? "↔" : "→"} ${endpointLabel(targetId)} · ${chosenTypeLabel}${evidenceEvent ? ` · 依据：${evidenceEvent.title}` : ""}`
    : "";

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
      if (!evidenceEvent) { setError("请选择一条依据事件；人物关系需要已确认事件作为可追溯依据。当前版本还没有可用的已确认事件时，请先到事件线用“常规创作”确认。"); return; }
      const duplicates = typeChoice === "__new__" ? { suggestions: [] as never[] } : await props.withConnection((token) => getRelationDuplicateSuggestions({ projectId: props.projectId, sourceObjectId: sourceId, targetObjectId: targetId, relationTypeId: typeChoice, direction, relationLabelSnapshot: chosenTypeLabel }));
      const candidateRelation = await props.withConnection(async (token) => {
        let relationTypeId = typeChoice;
        if (typeChoice === "__new__") {
          const created = await createRelationType({ projectId: props.projectId, label: chosenTypeLabel, operationId: `relation-type-create.${crypto.randomUUID()}`, token });
          relationTypeId = created.type.relationTypeId;
          setTypes((current) => [...current, created.type]);
        }
        const created = await createRelationCandidate({
          projectId: props.projectId,
          workVersionId: props.workVersionId,
          sourceObjectId: sourceId,
          targetObjectId: targetId,
          relationTypeId,
          relationLabelSnapshot: chosenTypeLabel,
          direction,
          evidenceRefs: [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: props.projectId, eventId: evidenceEvent.id, revisionToken: evidenceEvent.revisionToken, state: "committed", requestedUse: "constraint" } }],
          operationId: `relation-manual-create.${crypto.randomUUID()}`,
          token
        });
        return created;
      });
      setCandidate(candidateRelation.relation);
      setStatus(duplicates.suggestions.length ? `已建立候选；注意：同一对人物已有 ${duplicates.suggestions.length} 条同类型关系，新关系是额外一条，不会覆盖它们。` : "关系候选已建立；请核对后确认写入正式关系。");
    });

  const confirmCandidate = () =>
    run(async () => {
      if (!candidate) return;
      await props.withConnection((token) => confirmRelationCandidate({ projectId: props.projectId, workVersionId: props.workVersionId, relationId: candidate.relationId, expectedRelationRevision: candidate.revision, operationId: `relation-manual-confirm.${crypto.randomUUID()}`, token }));
      setStatus(`正式关系已建立：${candidate.relationLabelSnapshot}。`);
      setCandidate(null);
      props.onChanged();
    });

  const rejectCandidate = () =>
    run(async () => {
      if (!candidate) return;
      await props.withConnection((token) => rejectRelationCandidate({ projectId: props.projectId, relationId: candidate.relationId, expectedRelationRevision: candidate.revision, operationId: `relation-manual-reject.${crypto.randomUUID()}`, token }));
      setStatus("候选已拒绝；没有写入正式关系。");
      setCandidate(null);
    });

  return <section className="focused-relations-create" aria-label="人工建立关系">
    <header><div><small>人工建立</small><h2>建立人物关系</h2></div><button type="button" aria-label="关闭建立关系表单" onClick={props.onClose}><X /></button></header>
    <p>双方按稳定 ID 绑定（同名以 ID 尾号区分）；依据必须是本版本内经作者确认链验证的正式事件。</p>
    {candidate ? <div className="focused-relations-candidate" role="status">
      <p><CheckCircle2 /> 候选已建立（尚未成为正式关系）：</p>
      <p><strong>{endpointLabel(candidate.sourceObjectId)} {candidate.direction === "both" ? "↔" : "→"} {endpointLabel(candidate.targetObjectId)}</strong> · {candidate.relationLabelSnapshot}</p>
      <p>依据事件：{(candidate.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference as { eventId?: string } | undefined)?.eventId ?? "未记录"}</p>
      <button type="button" className="primary-action" disabled={busy} onClick={() => void confirmCandidate()}>确认建立正式关系</button>
      <button type="button" disabled={busy} onClick={() => void rejectCandidate()}>拒绝候选</button>
      <button type="button" disabled={busy} onClick={() => { setCandidate(null); setStatus("候选保留；可稍后在待确认中处理。"); }}>留作候选</button>
    </div> : <div className="focused-relations-create-fields">
      <label><span>来源人物</span><select aria-label="关系来源人物" value={sourceId} disabled={busy} onChange={(event) => setSourceId(event.target.value)}><option value="">请选择</option>{characters.map((item) => <option key={item.id} value={item.id}>{endpointLabel(item.id)}</option>)}</select></label>
      <label><span>方向</span><select aria-label="关系方向" value={direction} disabled={busy} onChange={(event) => setDirection(event.target.value as "forward" | "both")}><option value="forward">来源指向目标</option><option value="both">互相</option></select></label>
      <label><span>目标人物</span><select aria-label="关系目标人物" value={targetId} disabled={busy} onChange={(event) => setTargetId(event.target.value)}><option value="">请选择</option>{characters.map((item) => <option key={item.id} value={item.id}>{endpointLabel(item.id)}</option>)}</select></label>
      <label><span>关系名称</span><select aria-label="关系类型" value={typeChoice} disabled={busy} onChange={(event) => setTypeChoice(event.target.value)}><option value="">请选择</option>{types.map((type) => <option key={type.relationTypeId} value={type.relationTypeId}>{type.label}</option>)}<option value="__new__">新建关系名称…</option></select></label>
      {typeChoice === "__new__" ? <label><span>新关系名称</span><input value={newTypeLabel} maxLength={60} disabled={busy} onChange={(event) => setNewTypeLabel(event.target.value)} placeholder="例如：互相扶持" /></label> : null}
      <label><span>依据事件（必选）</span><select aria-label="关系依据事件" value={evidenceEventId} disabled={busy} onChange={(event) => setEvidenceEventId(event.target.value)}><option value="">{usableEvents.length ? "请选择已确认事件" : "当前版本还没有已确认事件"}</option>{usableEvents.map((event) => <option key={event.id} value={event.id}>{event.title}（修订 {event.revisionToken.slice(0, 8)}）</option>)}</select></label>
      {preview ? <p className="focused-relations-create-preview" role="status">将建立：{preview}</p> : <p className="focused-relations-create-preview">选择双方、名称与依据后，这里会先显示将建立的关系。</p>}
      <button type="button" className="primary-action" disabled={busy || !sourceId || !targetId || sourceId === targetId || !chosenTypeLabel || !evidenceEventId} onClick={() => void submitCandidate()}>建立关系候选</button>
    </div>}
    {status ? <p role="status">{status}</p> : null}
    {error ? <p className="is-error" role="alert">{error}</p> : null}
  </section>;
}
