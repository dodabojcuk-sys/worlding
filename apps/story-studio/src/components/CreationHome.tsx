import { Archive, ArrowRight, BookOpenText, Check, CheckCircle2, Clapperboard, ExternalLink, FileCheck2, FolderKanban, Gamepad2, Images, Languages, Pencil, Play, Search, ShieldAlert, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createCreationAdapterRegistry,
  createFixtureAdapterRegistry,
  type CreationCapability,
  type CreationAdapterDescriptorV1,
  type CreationJobReceiptV1
} from "../../../../src/storyCreation/creationAdapterService";
import { createFountainJsAdapterPlugin } from "../../../../src/storyCreation/fountainJsAdapter";
import { buildNeutralStoryPackage, type NeutralStoryPackageV1 } from "../../../../src/storyCreation/neutralStoryPackage";
import type { OutputArtifact, OutputArtifactType, StoryUnit } from "../lib/localTransport";
import type { CreationRouteMode } from "../product-shell/authoringRouteState";

type CapabilityCard = { capability: CreationCapability; label: string; description: string; Icon: LucideIcon };

const capabilities: CapabilityCard[] = [
  { capability: "novel", label: "小说", description: "交给外部长篇工具继续组织章节与叙述。", Icon: BookOpenText },
  { capability: "screenplay", label: "剧本", description: "交给外部剧本工具整理场次、动作与对白。", Icon: Clapperboard },
  { capability: "comic", label: "漫画", description: "交给外部漫画工作流处理页面与画面资产。", Icon: Images },
  { capability: "motion_comic", label: "漫剧", description: "交给外部镜头或视频工作流继续制作。", Icon: Images },
  { capability: "interactive_story", label: "互动叙事", description: "交给 Ink、Twine 或其他分支叙事运行时。", Icon: Gamepad2 },
  { capability: "visual_novel", label: "视觉小说", description: "由外部互动视觉工具接手。", Icon: Gamepad2 },
  { capability: "translation_adaptation", label: "翻译 / 改编", description: "保留来源与审核边界后交给外部工具。", Icon: Languages },
  { capability: "document_export", label: "Markdown / 文档", description: "导出人可直接阅读的故事成果。", Icon: FileCheck2 }
];

const searchParams = typeof window === "undefined" ? null : new URL(window.location.href).searchParams;
const adapterFixture = searchParams?.get("adapter-fixture");
const demoMode = searchParams?.get("creation-demo") === "1" || ["failed", "timeout", "cancelled"].includes(adapterFixture || "");
const registry = adapterFixture === "failed" || adapterFixture === "timeout" || adapterFixture === "cancelled"
  ? createFixtureAdapterRegistry(adapterFixture)
  : demoMode
    ? createCreationAdapterRegistry({ includeFixtures: true })
    : createCreationAdapterRegistry({ externalAdapters: [createFountainJsAdapterPlugin()] });

export type SaveExternalCreationArtifactInput = {
  packageValue: NeutralStoryPackageV1;
  capability: CreationCapability;
  receipt: CreationJobReceiptV1;
  content: string;
};

export function CreationHome(props: {
  projectId: string;
  projectTitle: string;
  storyUnits: StoryUnit[];
  artifacts: OutputArtifact[];
  onOpen(artifact: OutputArtifact): void;
  onRename(artifact: OutputArtifact, title: string): void;
  onArchive(artifact: OutputArtifact): void;
  onOpenMedia(): void;
  onOpenPluginCenter(): void;
  listInstalledAdapters(): Promise<unknown[]>;
  onExecuteInstalledPlugin(input: { adapterId: string; packageValue: NeutralStoryPackageV1; capability: CreationCapability; authorConfirmation: { confirmed: boolean; confirmedAt: string; authorOperation: string }; idempotencyKey: string; beforeHash: string }): Promise<{ receipt: unknown; content: string }>;
  onRouteMode(mode: CreationRouteMode): void;
  routeMode: CreationRouteMode;
  onOpenMultiverse(): void;
  onOpenEventLine(): void;
  onOpenNuwa(): void;
  onOpenLibrary(): void;
  onSaveExternalArtifact?(input: SaveExternalCreationArtifactInput): Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedCapability, setSelectedCapability] = useState<CreationCapability | null>(null);
  const [selectedAdapterId, setSelectedAdapterId] = useState<string | null>(null);
  const [packageValue, setPackageValue] = useState<NeutralStoryPackageV1 | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [receipt, setReceipt] = useState<CreationJobReceiptV1 | null>(null);
  const [executing, setExecuting] = useState(false);
  const [confirmedPreviewHash, setConfirmedPreviewHash] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [installedAdapters, setInstalledAdapters] = useState<CreationAdapterDescriptorV1[]>([]);
  const [remoteReceiptContent, setRemoteReceiptContent] = useState("");
  const activeUnits = useMemo(() => props.storyUnits.filter((unit) => unit.lifecycle !== "archived"), [props.storyUnits]);
  const adapters = demoMode ? registry.discover() : installedAdapters;
  const route = routeDetails(props.routeMode);
  const artifacts = useMemo(() => props.artifacts.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).filter((artifact) => !query.trim() || `${artifact.title} ${labelFor(artifact.type)} ${sourceLabel(artifact)}`.toLowerCase().includes(query.trim().toLowerCase())), [props.artifacts, query]);
  const routeArtifacts = route.type ? artifacts.filter((artifact) => route.matches(artifact.type)) : artifacts;
  const selectedAdapter = selectedAdapterId ? adapters.find((adapter) => adapter.adapterId === selectedAdapterId) || null : null;
  const matchingAdapters = selectedCapability ? adapters.filter((adapter) => adapter.capabilities.includes(selectedCapability)) : [];
  const validation = packageValue && selectedCapability && selectedAdapter
    ? demoMode ? registry.validate({ adapterId: selectedAdapter.adapterId, packageValue, capability: selectedCapability }) : { valid: true, errors: [], warnings: packageValue.warnings }
    : null;
  const idempotencyKey = packageValue && selectedCapability && selectedAdapter ? `${packageValue.packageId}:${selectedAdapter.adapterId}:${selectedAdapter.adapterVersion}:${selectedCapability}` : null;
  const receiptContent = receipt && selectedAdapter ? demoMode ? readReceiptContent(selectedAdapter.adapterId, receipt) : remoteReceiptContent : "";

  useEffect(() => {
    if (selectedUnitId && !activeUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(null);
      invalidateSelection();
    }
  }, [activeUnits, selectedUnitId]);

  useEffect(() => {
    const selectedUnit = activeUnits.find((unit) => unit.id === selectedUnitId);
    if (!selectedUnit) {
      setPackageValue(null);
      setPackageBusy(false);
      return;
    }
    let cancelled = false;
    setPackageBusy(true);
    setPackageValue(null);
    setPackageError("");
    invalidateSelection();
    void buildNeutralStoryPackage({
      projectRef: { projectId: props.projectId, title: props.projectTitle },
      scope: { kind: "unit", unitIds: [selectedUnit.id], label: selectedUnit.title },
      sourceRevision: {
        revisionId: `${selectedUnit.id}:${selectedUnit.version}`,
        revisionHash: selectedUnit.version,
        capturedAt: selectedUnit.updatedAt,
        sourceOwners: Array.from(new Set(selectedUnit.sourceRefs.map((ref) => ref.sourceKind).concat(selectedUnit.items.flatMap((item) => item.sourceRefs.map((ref) => ref.sourceKind)))))
      },
      storyUnits: [selectedUnit]
    }).then((nextPackage) => {
      if (!cancelled) setPackageValue(nextPackage);
    }).catch((cause: unknown) => {
      if (!cancelled) setPackageError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setPackageBusy(false);
    });
    return () => { cancelled = true; };
  }, [activeUnits, props.projectId, props.projectTitle, selectedUnitId]);

  useEffect(() => { if (!demoMode) void props.listInstalledAdapters().then((value) => setInstalledAdapters(value as CreationAdapterDescriptorV1[])).catch(() => setInstalledAdapters([])); }, [props.listInstalledAdapters]);

  function invalidateSelection(): void {
    setReceipt(null);
    setRemoteReceiptContent("");
    setConfirmedPreviewHash(null);
    setConfirmedAt(null);
    setSelectedAdapterId(null);
  }

  function chooseCapability(capability: CreationCapability): void {
    setSelectedCapability(capability);
    invalidateSelection();
  }

  function chooseAdapter(adapterId: string): void {
    setSelectedAdapterId(adapterId);
    setReceipt(null);
    setConfirmedPreviewHash(null);
    setConfirmedAt(null);
    setPackageError("");
  }

  async function executeAdapter(): Promise<void> {
    if (!packageValue || !selectedCapability || !selectedAdapter || !validation?.valid || !confirmedAt || confirmedPreviewHash !== packageValue.contentHash || !idempotencyKey || executing) return;
    setExecuting(true);
    setPackageError("");
    try {
      const submit = {
        adapterId: selectedAdapter.adapterId,
        packageValue,
        capability: selectedCapability,
        authorConfirmation: {
          confirmed: true,
          confirmedAt,
          authorOperation: "author.creation.execute-external-adapter"
        },
        idempotencyKey,
        beforeHash: packageValue.contentHash
      };
      const remoteResult = demoMode ? null : await props.onExecuteInstalledPlugin(submit);
      const nextReceipt = (demoMode ? await registry.submit(submit) : remoteResult?.receipt) as CreationJobReceiptV1;
      setRemoteReceiptContent(remoteResult?.content || "");
      setReceipt(nextReceipt);
    } catch (cause) {
      setPackageError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExecuting(false);
    }
  }

  return <section className="workbench creation-home" data-testid="creation-home" data-creation-route={props.routeMode} data-creation-demo={demoMode ? "true" : "false"}>
    {demoMode ? <div className="creation-demo-banner" data-testid="creation-demo-banner"><span>演示数据</span><small>本次交接只使用内存夹具，不会写入真实项目。</small></div> : null}
    <header className="creation-home-header">
      <div><small>当前项目 · {props.projectTitle}</small><h1>{props.routeMode === "hub" ? "创作输出" : route.title}</h1><p>{props.routeMode === "hub" ? "从已经形成的故事成果继续。先选择故事成果，再选择输出方向和外部工具。" : route.description}</p></div>
      <div className="creation-home-primary-actions">{props.routeMode === "hub" ? <><button type="button" className="secondary-action" onClick={props.onOpenPluginCenter}><Wrench />外部工具</button><button type="button" className="secondary-action" onClick={props.onOpenMedia}><FolderKanban />媒体</button></> : <button type="button" className="secondary-action" onClick={() => props.onRouteMode("hub")}>返回创作输出</button>}</div>
    </header>

    {activeUnits.length ? <section className="neutral-creation-flow" data-testid="neutral-creation-flow" aria-label="故事成果外部交付流程">
      <header className="neutral-creation-flow-header"><div><small>故事包 V1</small><h2>把故事成果交给合适的外部工具</h2><p>天衍负责理解、整理和确认故事；最终格式在这里才选择。外部服务只接收你确认的故事包，不会直接读取项目数据库，也不会自动回写 Canon。</p></div><span className="neutral-creation-boundary"><ShieldAlert />只读交付边界</span></header>
      <div className="neutral-creation-steps" aria-label="交接步骤"><span className="is-current">1 · 选择故事成果</span><ArrowRight /><span className={packageValue ? "is-current" : ""}>2 · 选择输出方向</span><ArrowRight /><span className={selectedAdapter ? "is-current" : ""}>3 · 选择外部工具</span><ArrowRight /><span className={confirmedAt ? "is-current" : ""}>4 · 预览并明确执行</span></div>

      <section className="neutral-package-picker" aria-label="选择故事成果">
        <div className="neutral-section-heading"><div><small>STEP 1</small><strong>选择故事成果</strong></div><span>{activeUnits.length} 个可交付故事成果</span></div>
        {activeUnits.length ? <label className="neutral-package-select"><span>故事成果来源</span><select aria-label="选择故事成果" value={selectedUnitId || ""} onChange={(event) => { setSelectedUnitId(event.target.value || null); setPackageValue(null); setPackageError(""); }}>{<option value="" disabled>选择一份故事成果</option>}{activeUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.title} · {unit.version}</option>)}</select></label> : <div className="neutral-package-empty" data-testid="neutral-package-empty"><BookOpenText /><div><strong>尚未形成可交付故事成果</strong><p>先在写作、事件线或女娲排演中形成并确认 Story Unit；这里不会替你新建一套小说或剧本软件。</p></div></div>}
        {packageBusy ? <p className="neutral-package-status">正在准备只读故事包预览…</p> : packageError ? <p className="neutral-package-error" role="alert">{packageError}</p> : packageValue ? <div className="neutral-package-summary" data-testid="neutral-package-summary"><div><CheckCircle2 /><div><strong>{packageValue.scope.label}</strong><small>已准备故事成果，只读预览</small></div></div><dl><div><dt>内容指纹</dt><dd>{shortHash(packageValue.contentHash)}</dd></div><div><dt>范围</dt><dd>{packageValue.scope.label}</dd></div><div><dt>来源锚点</dt><dd>{packageValue.manifest.sourceAnchors.length} 个</dd></div></dl><details className="neutral-technical-details"><summary>技术详情</summary><dl><div><dt>Package ID</dt><dd>{packageValue.packageId}</dd></div><div><dt>完整内容指纹</dt><dd>{packageValue.contentHash}</dd></div><div><dt>来源版本</dt><dd>{packageValue.sourceRevision.revisionId}</dd></div><div><dt>协议版本</dt><dd>{packageValue.schemaVersion}</dd></div></dl><details><summary>预览将发送的内容</summary><pre>{packageValue.storyMarkdown}</pre></details></details>{packageValue.warnings.length ? <ul>{packageValue.warnings.map((warning) => <li key={warning}>来源已更新，请重新生成：{warning}</li>)}</ul> : <small>来源锚点已与当前版本一致。</small>}</div> : null}
      </section>

      <section className="neutral-capability-section" aria-label="选择输出方向">
        <div className="neutral-section-heading"><div><small>STEP 2</small><strong>选择输出方向</strong></div><span>{packageValue ? "格式现在才决定" : "先选择故事成果"}</span></div>
        {packageValue ? <div className="neutral-capability-list">{capabilities.map(({ capability, label, description, Icon }) => <button type="button" key={capability} className={selectedCapability === capability ? "is-selected" : ""} aria-pressed={selectedCapability === capability} onClick={() => chooseCapability(capability)}><Icon /><span><strong>{label}</strong><small>{description}</small></span>{selectedCapability === capability ? <Check aria-label="已选择" /> : <ArrowRight aria-label="选择" />}</button>)}</div> : <div className="neutral-step-locked"><FileCheck2 /><p>选择一份故事成果后，再决定它要交给小说、剧本、漫画、互动叙事或其他外部工具。</p></div>}
      </section>

      <section className="neutral-adapter-section" aria-label="选择外部工具">
        <div className="neutral-section-heading"><div><small>STEP 3</small><strong>选择外部工具</strong></div><span>{selectedCapability ? `${matchingAdapters.length} 个匹配` : "先选择输出方向"}</span></div>
        {!packageValue || !selectedCapability ? <div className="neutral-step-locked"><ExternalLink /><p>选定输出方向后，这里只显示匹配的已连接工具；未连接的工具会明确说明原因。</p></div> : matchingAdapters.length ? <div className="neutral-adapter-list">{matchingAdapters.map((adapter) => { const unavailable = adapter.availability !== "available" || adapter.health !== "healthy"; return <article className={`neutral-adapter-card ${selectedAdapterId === adapter.adapterId ? "is-selected " : ""}${unavailable ? "is-unavailable" : ""}`} key={adapter.adapterId}><button type="button" className="neutral-adapter-choice" disabled={unavailable} aria-disabled={unavailable} onClick={() => chooseAdapter(adapter.adapterId)}><span className={`adapter-health is-${adapter.health}`}><span />{adapter.availability === "available" && adapter.health === "healthy" ? "已连接" : adapter.availability === "unavailable" ? "未连接" : "暂不可用"}</span><span className="neutral-adapter-copy"><strong>{adapter.displayName}</strong><small>{unavailable ? adapter.requirementSummary : "可以接收当前故事包"}</small></span>{selectedAdapterId === adapter.adapterId ? <Check aria-label="已选择" /> : <ArrowRight aria-label="选择" />}</button><details className="neutral-technical-details"><summary>技术详情</summary><small>版本 {adapter.adapterVersion} · {adapter.license}</small><small>{adapter.sourceRepository}{adapter.sourceCommit ? ` · ${adapter.sourceCommit}` : ""}</small></details></article>; })}</div> : <div className="neutral-adapter-empty"><ExternalLink /><div><strong>尚未连接外部工具</strong><p>当前输出方向没有可用工具。请先安装经过审核的外部工具；这里不显示假的成功状态。</p><button type="button" className="secondary-action" onClick={props.onOpenPluginCenter}><Wrench />安装外部工具</button></div></div>}
      </section>

      <section className="neutral-execution-section" aria-label="预览并明确执行">
        <div className="neutral-section-heading"><div><small>STEP 4</small><strong>预览并明确执行</strong></div><span>不会自动执行</span></div>
        <div className="neutral-execution-card">{packageValue && selectedCapability && selectedAdapter ? <><dl><div><dt>将发送</dt><dd>{packageValue.scope.label}</dd></div><div><dt>输出方向</dt><dd>{capabilityLabel(selectedCapability)}</dd></div><div><dt>外部工具</dt><dd>{selectedAdapter.displayName}</dd></div></dl><details className="neutral-delivery-preview"><summary>查看交付清单</summary><ul><li>故事包版本：{packageValue.schemaVersion}</li><li>内容指纹：{packageValue.contentHash}</li><li>外部工具版本：{selectedAdapter.adapterVersion}</li><li>预期产物：{capabilityLabel(selectedCapability)}</li><li>只读边界：只发送当前故事包，不提供项目数据库路径。</li><li>本地写入范围：仅由外部工具返回产物回执；不会自动写入 Canon。</li></ul></details><label className="neutral-confirmation"><input type="checkbox" checked={confirmedPreviewHash === packageValue.contentHash && Boolean(confirmedAt)} onChange={(event) => { if (event.target.checked) { setConfirmedPreviewHash(packageValue.contentHash); setConfirmedAt(new Date().toISOString()); } else { setConfirmedPreviewHash(null); setConfirmedAt(null); } }} /> <span>我已检查交付范围和内容指纹，确认交给这个外部工具。</span></label><button type="button" className="primary-action" disabled={executing || !validation?.valid || confirmedPreviewHash !== packageValue.contentHash || !confirmedAt} onClick={() => void executeAdapter()}>{executing ? "正在等待外部工具…" : "开始交付"}<ArrowRight /></button>{validation && !validation.valid ? <p className="neutral-package-error" role="alert">{validation.errors.join(" ")}</p> : null}{receipt ? <div className={`neutral-receipt is-${receipt.status}`} data-testid="adapter-receipt"><strong>{receipt.status === "succeeded" ? "外部工具已返回产物回执" : `外部工具状态：${statusLabel(receipt.status)}`}</strong><small>任务回执 · {receipt.jobId} · 结果指纹 · {shortHash(receipt.afterHash)}</small><details className="neutral-technical-details"><summary>技术详情</summary><dl><div><dt>输入指纹</dt><dd>{receipt.inputPackageHash}</dd></div><div><dt>开始 / 完成</dt><dd>{receipt.startedAt} → {receipt.finishedAt}</dd></div><div><dt>标准输出摘要</dt><dd>{receipt.stdoutSummary || "—"}</dd></div><div><dt>错误输出摘要</dt><dd>{receipt.stderrSummary || "—"}</dd></div></dl></details>{receipt.status === "succeeded" && props.onSaveExternalArtifact && receiptContent ? <button type="button" className="secondary-action" onClick={() => void props.onSaveExternalArtifact?.({ packageValue, capability: selectedCapability, receipt, content: receiptContent })}>保存到输出产物</button> : null}</div> : <small>只有在你勾选确认后才会启动外部工具；默认不会自动执行。</small>}</> : <div className="neutral-execution-empty"><FileCheck2 /><p>{!packageValue ? "先选择故事成果，才能预览交付内容。" : !selectedCapability ? "先选择输出方向，才能查看匹配工具。" : "先选择一个外部工具，才能查看最终交付清单。"}</p></div>}</div>
      </section>
    </section> : <CreationEmptyState
      artifacts={artifacts}
      installedAdapterCount={installedAdapters.length}
      onOpenEventLine={props.onOpenEventLine}
      onOpenNuwa={props.onOpenNuwa}
      onOpenLibrary={props.onOpenLibrary}
      onOpenPluginCenter={props.onOpenPluginCenter}
      onOpen={props.onOpen}
    />}

    {props.routeMode === "translation-adaptation" ? <section className="creation-route-notice" aria-label="翻译改编交接"><Languages /><strong>来源与审核仍由多元负责</strong><p>先在多元完成来源与审核，再选择外部输出能力；这里不会模拟创建或写入任何产物。</p><button type="button" className="primary-action" onClick={props.onOpenMultiverse}>前往多元准备来源</button></section> : null}

    <section className="creation-project-list" aria-label="输出产物"><header><div><strong>{props.routeMode === "hub" ? "输出产物" : `${route.title.replace(/输出$/u, "")}输出产物`}</strong><span>{routeArtifacts.length}</span></div><label><Search /><input aria-label="搜索输出产物" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、类型或来源" /></label></header>{routeArtifacts.length ? <div className="creation-artifact-table" role="table"><div role="row" className="creation-artifact-table-head"><span>标题</span><span>类型</span><span>状态</span><span>来源</span><span>最近编辑</span><span>操作</span></div>{routeArtifacts.map((artifact) => <div role="row" key={artifact.id} className={artifact.lifecycle === "archived" ? "is-archived" : ""}><span>{renamingId === artifact.id ? <form onSubmit={(event) => { event.preventDefault(); if (renameValue.trim()) props.onRename(artifact, renameValue.trim()); setRenamingId(null); }}><input autoFocus aria-label={`重命名${artifact.title}`} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /><button type="submit">保存</button></form> : <button type="button" className="creation-artifact-title" onClick={() => props.onOpen(artifact)}><strong>{artifact.title}</strong><small>{artifact.relativeId}</small></button>}</span><span>{labelFor(artifact.type)}</span><span>{lifecycleLabel(artifact.lifecycle)}</span><span>{sourceLabel(artifact)}</span><span>{formatTime(artifact.updatedAt)}</span><span className="creation-artifact-actions"><button type="button" disabled={artifact.lifecycle === "archived"} onClick={() => props.onOpen(artifact)}><Play />继续</button><button type="button" onClick={() => { setRenamingId(artifact.id); setRenameValue(artifact.title); }}><Pencil />重命名</button><button type="button" disabled={artifact.lifecycle === "archived"} onClick={() => props.onArchive(artifact)}><Archive />归档</button></span></div>)}</div> : <div className="creation-project-empty"><BookOpenText /><strong>还没有匹配的输出产物</strong><p>保存外部工具返回的结果后，它会进入这里；不会自动成为 Canon。</p></div>}</section>
  </section>;
}

function CreationEmptyState(props: {
  artifacts: OutputArtifact[];
  installedAdapterCount: number;
  onOpenEventLine(): void;
  onOpenNuwa(): void;
  onOpenLibrary(): void;
  onOpenPluginCenter(): void;
  onOpen(artifact: OutputArtifact): void;
}) {
  return <section className="creation-empty-state" data-testid="creation-empty-state" aria-label="开始创作输出">
    <div className="creation-empty-hero">
      <div><small>当前还没有可交付 Story Package</small><h2>先把故事整理成中性成果</h2><p>天衍负责理解、整理和确认故事；当已有 Story Unit 后，你再决定它是小说、剧本、漫画、漫剧还是互动叙事。</p></div>
      <div className="creation-empty-actions"><button type="button" className="primary-action" onClick={props.onOpenEventLine}><ArrowRight />去事件线整理</button><button type="button" className="secondary-action" onClick={props.onOpenNuwa}><Sparkles />去女娲排演</button><button type="button" className="secondary-action" onClick={props.onOpenLibrary}><BookOpenText />查看资料库</button></div>
    </div>
    <section className="creation-empty-capabilities" aria-labelledby="creation-capabilities-title"><header><div><small>准备好成果后</small><h2 id="creation-capabilities-title">可交给外部工具的方向</h2></div><span>{props.installedAdapterCount} 个外部工具已连接</span></header><div className="creation-empty-capability-grid">{capabilities.map(({ capability, label, description, Icon }) => <div key={capability}><Icon /><span><strong>{label}</strong><small>{description}</small></span></div>)}</div></section>
    <section className="creation-empty-recent" aria-labelledby="creation-recent-title"><header><div><small>不自动执行</small><h2 id="creation-recent-title">最近输出</h2></div><button type="button" className="secondary-action" onClick={props.onOpenPluginCenter}><Wrench />管理外部工具</button></header>{props.artifacts.length ? <div className="creation-empty-artifact-list">{props.artifacts.slice(0, 4).map((artifact) => <button type="button" key={artifact.id} onClick={() => props.onOpen(artifact)}><span><strong>{artifact.title}</strong><small>{labelFor(artifact.type)} · {lifecycleLabel(artifact.lifecycle)}</small></span><ArrowRight /></button>)}</div> : <p className="creation-empty-recent-note">外部工具返回并由你保存的产物会出现在这里；不会自动写入 Canon。</p>}</section>
  </section>;
}

function readReceiptContent(adapterId: string, receipt: CreationJobReceiptV1): string {
  const artifact = receipt.outputArtifacts[0];
  if (!artifact) return "";
  try { return registry.readArtifactContent(adapterId, receipt.jobId, artifact.artifactId); } catch { return ""; }
}

function routeDetails(mode: CreationRouteMode): { title: string; description: string; type: OutputArtifactType | null; matches(type: OutputArtifactType): boolean } {
  const routes: Record<CreationRouteMode, { title: string; description: string; type: OutputArtifactType | null; matches(type: OutputArtifactType): boolean }> = {
    hub: { title: "创作输出", description: "从已经形成的故事成果继续，格式在外部交接时选择。", type: null, matches: () => true },
    novel: { title: "小说输出", description: "选择故事成果，再交给外部长篇工具。", type: "novel", matches: (type) => type === "novel" },
    screenplay: { title: "剧本输出", description: "选择故事成果，再交给外部剧本工具。", type: "screenplay", matches: (type) => type === "screenplay" },
    comic: { title: "漫画 / 漫剧输出", description: "选择故事成果，再交给外部画面或镜头工具。", type: "comic", matches: (type) => type === "comic" || type === "motion-comic" || type === "storyboard" },
    interactive: { title: "互动叙事输出", description: "选择故事成果，再交给外部互动叙事运行时。", type: null, matches: (type) => type === "interactive-drama" },
    "translation-adaptation": { title: "翻译 / 改编输出", description: "保留来源与审核边界，再交给外部工具。", type: null, matches: () => false },
    plugins: { title: "插件中心", description: "精选外部工具的安装与管理。", type: null, matches: () => false }
  };
  return routes[mode];
}

function capabilityLabel(capability: CreationCapability): string { return capabilities.find((candidate) => candidate.capability === capability)?.label || capability; }
function statusLabel(status: CreationJobReceiptV1["status"]): string { return ({ queued: "排队中", running: "运行中", succeeded: "已完成", failed: "失败", timeout: "超时", cancelled: "已取消" } as const)[status]; }
function labelFor(type: OutputArtifactType): string { return ({ novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动叙事" } as Record<OutputArtifactType, string>)[type]; }
function lifecycleLabel(value: OutputArtifact["lifecycle"]): string { return ({ draft: "草稿", queued: "排队中", generating: "生成中", review: "待审核", approved: "已定稿", archived: "已归档" } as const)[value]; }
function sourceLabel(artifact: OutputArtifact): string {
  const derivation = typeof artifact.generationBrief?.derivation === "string" ? artifact.generationBrief.derivation : "";
  if (derivation) return ({ translation: "翻译", pov: "视角转换", branch: "历史分支稿", adaptation: "改编" } as Record<string, string>)[derivation] || "派生产物";
  return artifact.sourceUnits.length ? `参考了 ${artifact.sourceUnits.length} 份素材` : "外部工具或手动草稿";
}
function shortHash(value: string | null | undefined): string { return value ? `${value.slice(0, 19)}…` : "—"; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
