import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Brain, CheckCircle2, Clock3, Eye, GitBranch, History, KeyRound, Link2, MapPin, MessageSquareWarning, Scale, Sparkles, UserRound } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { createCharacterStateProjectionPort, type CharacterStateEvidence, type CharacterStateProjection, type KnowledgeBoundaryReceipt } from "../../../../../src/storyContracts/characterStateProjection";
import type { CharacterStateImpactFixture } from "../../lib/localTransport";
import { CHARACTER_STATE_FIXTURE_CHARACTERS, characterStateFixtureEventTitle, createCharacterStateFixtureProjection, type CharacterStateFixtureCase } from "./characterStateFixture";

const projectionPort = createCharacterStateProjectionPort();

export function CharacterStateWorkspace(props: {
  projectId: string;
  projectTitle: string;
  onBack(): void;
  onOpenFate(snapshot: CharacterStateReturnSnapshot): void;
  onOpenEvent(eventId: string, snapshot: CharacterStateReturnSnapshot): void;
  onOpenWorkDock(prompt: string): void;
  loadImpact(): Promise<CharacterStateImpactFixture>;
  runImpact(action: "prepare" | "reject" | "confirm"): Promise<CharacterStateImpactFixture>;
}) {
  const initial = readRoute();
  const [characterId, setCharacterId] = useState(initial.characterId);
  const [branchId, setBranchId] = useState(initial.branchId);
  const [narrativePosition, setNarrativePosition] = useState(initial.narrativePosition);
  const [fixtureCase, setFixtureCase] = useState(initial.fixtureCase);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
  const [impact, setImpact] = useState<CharacterStateImpactFixture | null>(null);
  const [impactBusy, setImpactBusy] = useState(false);
  const [impactError, setImpactError] = useState("");
  const [boundaryReceipt, setBoundaryReceipt] = useState<KnowledgeBoundaryReceipt | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const projection = useMemo(() => createCharacterStateFixtureProjection({ characterId, branchId, narrativePosition, fixtureCase, confirmedEventId: impact?.appliedEventId }), [branchId, characterId, fixtureCase, impact?.appliedEventId, narrativePosition]);
  const timeline = useMemo(() => projection ? allEvidence(projection) : [], [projection]);
  const selected = timeline.find((item) => item.claimId === selectedId) || timeline.find((item) => item.claimId === "claim.knowledge.letter-warning") || timeline[0] || null;

  useEffect(() => { void props.loadImpact().then(setImpact).catch(() => undefined); }, [props.projectId]);
  useEffect(() => { if (!selectedId && selected) setSelectedId(selected.claimId); }, [selected?.claimId, selectedId]);
  useEffect(() => writeRoute({ characterId, branchId, narrativePosition, fixtureCase, selectedId: selected?.claimId || null }), [branchId, characterId, fixtureCase, narrativePosition, selected?.claimId]);
  useLayoutEffect(() => {
    if (new URL(window.location.href).searchParams.get("returned") !== "1") return;
    const snapshot = window.history.state?.characterStateReturn as CharacterStateReturnSnapshot | undefined;
    const restore = () => {
      if (snapshot) rootRef.current?.scrollTo({ top: snapshot.scrollTop });
      const target = snapshot?.focusClaimId || selected?.claimId;
      if (target) document.querySelector<HTMLElement>(`[data-state-claim-id="${CSS.escape(target)}"]`)?.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(() => requestAnimationFrame(restore));
    const url = new URL(window.location.href); url.searchParams.delete("returned");
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "library" }, "", `${url.pathname}${url.search}${url.hash}`);
    return () => cancelAnimationFrame(frame);
  }, [selected?.claimId]);

  async function runImpact(action: "prepare" | "reject" | "confirm") {
    setImpactBusy(true); setImpactError("");
    try { setImpact(await props.runImpact(action)); }
    catch (cause) { setImpactError(cause instanceof Error ? cause.message : "无法恢复角色影响评审。"); }
    finally { setImpactBusy(false); }
  }

  function snapshot(): CharacterStateReturnSnapshot {
    return { characterId, branchId, narrativePosition, fixtureCase, selectedId: selected?.claimId || null, scrollTop: rootRef.current?.scrollTop || 0, focusClaimId: selected?.claimId || null };
  }

  function validateBoundary() {
    if (!projection) return;
    const claims = [
      { claimId: "check-letter", statement: "沈砚知道来信警告", sourceClaimId: "claim.knowledge.letter-warning", assertedAs: "character_knowledge" as const },
      { claimId: "check-sender", statement: "沈砚知道寄信人身份", sourceClaimId: "claim.unknown.sender", assertedAs: "character_knowledge" as const },
      { claimId: "check-belief", statement: "寄信人就是旧守塔人", sourceClaimId: "claim.belief.sender", assertedAs: "world_fact" as const },
      { claimId: "check-asymmetry", statement: "沈砚知道阿芜全部私密判断", sourceClaimId: "claim.asymmetry.key", assertedAs: "character_knowledge" as const }
    ].map((claim) => ({ ...claim, characterId: projection.characterId, branchId: projection.branchId, narrativePosition: projection.narrativePosition }));
    setBoundaryReceipt(projectionPort.validateKnowledgeBoundary(projection, claims));
  }

  return <main ref={rootRef} className="character-state-workspace" data-testid="character-state-workspace" data-owner-boundary="read-only-projection" data-impact-stage={impact?.stage || "initial"}>
    <header className="character-state-toolbar"><button type="button" className="icon-action" onClick={props.onBack} aria-label="返回角色资料"><ArrowLeft /></button><div><small>资料 · 当前状态</small><h1>{projection?.characterName || "角色"}的状态与知识边界</h1><p>只呈现当前范围有来源的状态；相信、怀疑、未知和世界事实不会混在一起。</p></div><button type="button" className="secondary-action" onClick={() => props.onOpenWorkDock("检查沈砚当前状态的角色知识边界、明确未知、来源冲突与关系认知差异；使用确定性 Fixture，不调用真实 Provider。") }><Sparkles />天意工作</button></header>

    <section className="character-state-scope" aria-label="当前角色状态范围">
      <label><UserRound />角色<select aria-label="当前角色" value={characterId} onChange={(event) => { setCharacterId(event.target.value); setSelectedId(null); }}>{CHARACTER_STATE_FIXTURE_CHARACTERS.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}</select></label>
      <label><GitBranch />分支<select aria-label="当前分支" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="branch.main">原始主线</option><option value="branch.if">IF 副本（无数据）</option></select></label>
      <label><Clock3 />叙事位置<select aria-label="叙事位置" value={narrativePosition} onChange={(event) => setNarrativePosition(Number(event.target.value))}><option value={1}>雾港来信之后</option><option value={2}>铜钥匙交接之后</option><option value={3}>潮桥决定之后</option></select></label>
      <label><Eye />验收状态<select aria-label="验收状态" value={fixtureCase} onChange={(event) => setFixtureCase(event.target.value as CharacterStateFixtureCase)}><option value="complete">完整状态</option><option value="asymmetry">知识不对称</option><option value="conflict">来源冲突</option><option value="stale">来源过期</option><option value="insufficient">证据不足</option></select></label>
    </section>

    {!projection || branchId !== "branch.main" ? <Empty title="当前分支没有角色状态" body="不会借用原始主线或其他角色的知识。请切换分支，或先建立具有来源的 Event。" /> : <>
      <section className="character-state-identity"><div><span className="character-state-avatar">沈</span><div><small>当前作品</small><h2>{props.projectTitle}</h2><p>雾港 · 铜钥匙交接之后 · 来源版本 fixture-sources-r3</p></div></div><dl><div><dt>所在位置</dt><dd>{projection.locationState.at(-1)?.value || "缺少地点证据"}</dd></div><div><dt>持有物</dt><dd>{projection.possessionState.at(-1)?.value || "缺少持有证据"}</dd></div><div><dt>当前目标</dt><dd>{projection.goalState.at(-1)?.value || "缺少目标证据"}</dd></div><div><dt>当前承诺</dt><dd>{projection.commitmentState.at(-1)?.value || "缺少承诺证据"}</dd></div></dl></section>

      {(projection.conflicts.length > 0 || projection.staleSources.length > 0) && <section className="character-state-alerts" aria-label="来源提醒">{projection.conflicts.length > 0 && <p role="alert"><Scale /><span><strong>存在来源冲突</strong><small>两份有效账册来源同时保留，需要作者判断；不会自动裁决。</small></span></p>}{projection.staleSources.length > 0 && <p role="alert"><History /><span><strong>存在过期来源</strong><small>钥匙来源 v1 已失效，不会作为当前知识。</small></span></p>}</section>}

      {fixtureCase === "insufficient" ? <Empty title="现有证据不足以形成完整角色状态" body="目前只有来信警告的来源；还缺少地点、持有物、目标、关系认知和后续事件锚点。" /> : <section className="character-state-grid" aria-label="角色状态分类">
        <StateGroup icon={<CheckCircle2 />} title="已确认知道" tone="confirmed" items={projection.knowledgeState} selectedId={selected?.claimId} onSelect={setSelectedId} />
        <StateGroup icon={<Brain />} title="相信、怀疑或误解" tone="belief" items={projection.beliefState} selectedId={selected?.claimId} onSelect={setSelectedId} />
        <StateGroup icon={<MessageSquareWarning />} title="明确未知或没有证据" tone="unknown" items={projection.openQuestions} selectedId={selected?.claimId} onSelect={setSelectedId} />
        <StateGroup icon={<Link2 />} title="角色视角下的关系" tone="relation" items={projection.perceivedRelationshipState} selectedId={selected?.claimId} onSelect={setSelectedId} />
      </section>}

      {selected && <section className="character-state-detail" data-testid="character-state-detail"><header><div><small>当前选中状态</small><h2>{selected.statement}</h2></div><span data-authority={selected.authority}>{authorityLabel(selected.authority)}</span></header><div><article><h3>当前内容</h3><p>{selected.value}</p><h3>角色边界</h3><p>{boundaryCopy(selected)}</p></article><dl><div><dt>形成事件</dt><dd>{characterStateFixtureEventTitle(selected.learnedAtEventId)}</dd></div><div><dt>叙事位置</dt><dd>#{selected.narrativePosition}</dd></div><div><dt>世界时间</dt><dd>{selected.worldTime.label}</dd></div><div><dt>来源</dt><dd>{selected.sourceAnchorIds.join("、") || "缺少来源"}</dd></div></dl></div><footer>{selected.learnedAtEventId && <button type="button" className="primary-action" onClick={() => props.onOpenEvent(selected.learnedAtEventId!, snapshot())}><BookOpen />打开相关事件</button>}<button type="button" className="secondary-action" onClick={validateBoundary}><KeyRound />检查知识边界</button></footer></section>}

      {boundaryReceipt && <section className="knowledge-boundary-results" data-testid="knowledge-boundary-results" aria-live="polite"><header><KeyRound /><div><small>确定性只读检查</small><h2>角色知识边界</h2></div><span>写入 0 · Provider 0</span></header><div>{boundaryReceipt.findings.map((finding) => <article data-outcome={finding.outcome} key={finding.claimId}><strong>{outcomeLabel(finding.outcome)}</strong><p>{finding.reason}</p><small>{finding.sourceAnchorIds.join("、") || "没有来源锚点"}</small></article>)}</div></section>}

      <ImpactReview impact={impact} busy={impactBusy} error={impactError} onPrepare={() => void runImpact("prepare")} onReject={() => void runImpact("reject")} onConfirm={() => void runImpact("confirm")} />

      <section className="character-state-timeline" aria-labelledby="character-state-timeline-title"><header><div><small>状态变化</small><h2 id="character-state-timeline-title">来源事件时间线</h2></div><span>叙事顺序与世界时间分开显示</span></header><ol>{timeline.map((item) => <li key={item.claimId} data-authority={item.authority}><button type="button" data-state-claim-id={item.claimId} aria-pressed={selected?.claimId === item.claimId} onClick={() => setSelectedId(item.claimId)}><span>#{item.narrativePosition}</span><strong>{characterStateFixtureEventTitle(item.learnedAtEventId)}</strong><small>{item.statement} · {item.worldTime.label}</small><em>{authorityLabel(item.authority)}</em></button></li>)}</ol></section>

      <section className="character-state-table" aria-labelledby="character-state-table-title"><header><div><small>时间线的等价表格</small><h2 id="character-state-table-title">状态与来源明细</h2></div><span>键盘可访问</span></header><div><table><thead><tr><th>顺序</th><th>类别</th><th>内容</th><th>权威状态</th><th>事件</th><th>世界时间</th><th>来源</th></tr></thead><tbody>{timeline.map((item) => <tr key={item.claimId}><td>#{item.narrativePosition}</td><td>{categoryLabel(item.category)}</td><td>{item.value}</td><td>{authorityLabel(item.authority)}</td><td>{characterStateFixtureEventTitle(item.learnedAtEventId)}</td><td>{item.worldTime.label}</td><td>{item.sourceAnchorIds.join("、") || "缺少来源"}</td></tr>)}</tbody></table></div></section>

      <footer className="character-state-actions"><button type="button" className="primary-action" onClick={() => props.onOpenFate(snapshot())}>打开角色命运<ArrowRight /></button><details><summary>技术详情</summary><dl><div><dt>Character ID</dt><dd>{projection.characterId}</dd></div><div><dt>投影版本</dt><dd>{projection.projectionRevision}</dd></div><div><dt>来源版本</dt><dd>{projection.sourceRevision}</dd></div><div><dt>边界</dt><dd>只读现有 Character / Event / World / Relation / Source owner</dd></div></dl></details></footer>
    </>}
  </main>;
}

export type CharacterStateReturnSnapshot = { characterId: string; branchId: string; narrativePosition: number; fixtureCase: CharacterStateFixtureCase; selectedId: string | null; scrollTop: number; focusClaimId: string | null };

function StateGroup(props: { icon: ReactNode; title: string; tone: string; items: CharacterStateEvidence[]; selectedId?: string; onSelect(id: string): void }) { return <section className={`character-state-group is-${props.tone}`}><header>{props.icon}<h2>{props.title}</h2></header>{props.items.length ? <ul>{props.items.map((item) => <li key={item.claimId}><button type="button" data-state-claim-id={item.claimId} aria-pressed={props.selectedId === item.claimId} onClick={() => props.onSelect(item.claimId)}><strong>{item.statement}</strong><span>{item.value}</span><small>{authorityLabel(item.authority)} · {item.sourceAnchorIds.length ? `${item.sourceAnchorIds.length} 个来源` : "缺少来源"}</small></button></li>)}</ul> : <p>当前范围没有这一类有来源状态。</p>}</section>; }

function ImpactReview(props: { impact: CharacterStateImpactFixture | null; busy: boolean; error: string; onPrepare(): void; onReject(): void; onConfirm(): void }) {
  const preview = props.impact?.preview;
  return <section className="character-impact-review" data-testid="character-impact-review" data-stage={props.impact?.stage || "initial"}><header><div><small>Candidate → Impact Review</small><h2>{preview?.title || "阿芜告诉沈砚，旧名曾出现在灯塔守夜记录中"}</h2><p>预览中的变化不等于已经发生；只有作者确认后才通过现有 Event owner 写入一次。</p></div><span>{stageLabel(props.impact?.stage || "initial")}</span></header>{preview && props.impact?.stage !== "initial" && <><div className="impact-before-after"><article><h3>变化前</h3><ul>{preview.before.map((item) => <li key={item}>{item}</li>)}</ul></article><ArrowRight /><article><h3>预览中的变化</h3><ul>{preview.after.map((item) => <li key={item}>{item}</li>)}</ul></article></div><div className="impact-review-grid"><InfoList title="新增知识" items={preview.newKnowledge} /><InfoList title="仍然未知" items={preview.remainsUnknown} /><InfoList title="信念变化" items={preview.beliefChanges} /><InfoList title="目标与承诺" items={preview.goalChanges} /><InfoList title="关系认知" items={preview.relationshipChanges} /><InfoList title="冲突与开放问题" items={[...preview.conflicts, ...preview.openQuestions]} /><InfoList title="受影响内容" items={[...preview.affectedEvents, ...preview.affectedFatePoints]} /><InfoList title="正式写入计划" items={preview.ownerWritePlan} /></div></>}{props.impact?.stage === "confirmed" && <p className="impact-confirmed"><CheckCircle2 />作者已确认；正式 Event {props.impact.appliedEventId} 已通过现有 owner 写入，角色状态与 Fate 由该 Event 重新投影。</p>}{props.impact?.stage === "rejected" && <p className="impact-rejected"><AlertTriangle />作者已拒绝；Character / Event / World State / Relation 正式写入均为 0。</p>}{props.error && <p className="inline-error" role="alert">{props.error}</p>}<footer>{!props.impact || props.impact.stage === "initial" ? <button type="button" className="primary-action" disabled={props.busy} onClick={props.onPrepare}>打开候选并进入影响评审</button> : props.impact.stage === "awaiting_author" ? <><button type="button" className="secondary-action" disabled={props.busy} onClick={props.onReject}>拒绝候选</button><button type="button" className="primary-action" disabled={props.busy} onClick={props.onConfirm}>作者确认并写入隔离 Fixture</button></> : null}<small>REAL_PROVIDER_CALLS=0 · Relation writes=0</small></footer></section>;
}

function InfoList(props: { title: string; items: string[] }) { return <article><h3>{props.title}</h3><ul>{props.items.map((item) => <li key={item}>{item}</li>)}</ul></article>; }
function Empty(props: { title: string; body: string }) { return <section className="character-state-empty" data-testid="character-state-empty"><MessageSquareWarning /><h2>{props.title}</h2><p>{props.body}</p></section>; }
function allEvidence(projection: CharacterStateProjection) { return [...projection.locationState, ...projection.possessionState, ...projection.knowledgeState, ...projection.beliefState, ...projection.goalState, ...projection.commitmentState, ...projection.perceivedRelationshipState, ...projection.openQuestions, ...projection.conflicts, ...projection.staleSources, ...projection.plannedState, ...projection.candidateState].sort((a, b) => a.narrativePosition - b.narrativePosition || a.claimId.localeCompare(b.claimId)); }
function authorityLabel(value: CharacterStateEvidence["authority"]) { return ({ world_fact: "世界事实", confirmed_knowledge: "已确认知道", belief: "相信", suspicion: "怀疑", misinformation: "错误信息", unknown: "未知", contradiction: "来源冲突", author_planned: "作者规划", candidate: "待确认候选" } as const)[value]; }
function categoryLabel(value: CharacterStateEvidence["category"]) { return ({ physical: "身体", location: "位置", possession: "持有物", knowledge: "知识", belief: "信念", goal: "目标", commitment: "承诺", perceived_relation: "关系认知" } as const)[value]; }
function boundaryCopy(item: CharacterStateEvidence) { return item.authority === "confirmed_knowledge" ? "角色通过明确事件和来源获得；只在当前分支与叙事位置有效。" : item.authority === "world_fact" ? "这是世界中已确认的状态，不代表所有角色都知道。" : item.authority === "belief" || item.authority === "suspicion" || item.authority === "misinformation" ? "这是角色的相信、怀疑或误解，不能冒充世界事实。" : item.authority === "unknown" ? "当前没有证据证明角色知道；保持未知。" : item.authority === "candidate" || item.authority === "author_planned" ? "尚未发生，不进入当前实际状态。" : "来源需要作者判断。"; }
function outcomeLabel(value: KnowledgeBoundaryReceipt["findings"][number]["outcome"]) { return ({ verified: "已验证", author_judgment: "需要作者判断", missing_evidence: "缺少证据", boundary_violation: "存在越界", source_conflict: "来源冲突", stale_source: "来源过期" } as const)[value]; }
function stageLabel(value: CharacterStateImpactFixture["stage"]) { return value === "initial" ? "尚未进入评审" : value === "candidate" ? "候选" : value === "awaiting_author" ? "等待作者确认" : value === "confirmed" ? "作者已确认" : "作者已拒绝"; }
function readRoute() { const params = new URL(window.location.href).searchParams; const value = params.get("stateCase"); return { characterId: params.get("character") || CHARACTER_STATE_FIXTURE_CHARACTERS[0].id, branchId: params.get("branch") || "branch.main", narrativePosition: Math.max(1, Math.min(3, Number(params.get("position") || 3))), fixtureCase: (["complete", "asymmetry", "conflict", "stale", "insufficient"].includes(value || "") ? value : "complete") as CharacterStateFixtureCase, selectedId: params.get("selected") }; }
function writeRoute(input: { characterId: string; branchId: string; narrativePosition: number; fixtureCase: CharacterStateFixtureCase; selectedId: string | null }) { const url = new URL(window.location.href); url.pathname = "/library"; url.searchParams.set("view", "character-state"); url.searchParams.set("fixture", "character-state"); url.searchParams.set("character", input.characterId); url.searchParams.set("branch", input.branchId); url.searchParams.set("position", String(input.narrativePosition)); url.searchParams.set("stateCase", input.fixtureCase); if (input.selectedId) url.searchParams.set("selected", input.selectedId); else url.searchParams.delete("selected"); window.history.replaceState({ ...(window.history.state ?? {}), workspace: "library" }, "", `${url.pathname}${url.search}${url.hash}`); }
