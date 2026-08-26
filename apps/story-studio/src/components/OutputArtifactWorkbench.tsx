import { ArrowLeft, Check, Clock3, Download, FilePlus2, FileUp, GripVertical, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { migrateCreationStructure, NOVEL_DOCUMENT_AUTHORITY_KEY, NOVEL_DOCUMENT_MODEL_KEY, NOVEL_EVENT_PROPOSAL_KEY, NOVEL_MIGRATION_RECEIPT_KEY, readNovelDocumentModel, structuredList } from "../../../../src/storyCreation/creationArtifactModel";
import { migrateMarkdownToNovelDocumentModelR1, serializeNovelDocumentModelToMarkdown, withRevision, type NovelDocumentModelR1 } from "../../../../src/storyCreation/novelDocumentModelR1";
import { acceptNovelEventProposal, rejectNovelEventProposal, validateNovelEventProposal } from "../../../../src/storyCreation/novelEventProposal";
import { parseFountain } from "../../../../src/storyCreation/screenplayFormatAdapter";
import type { CreationMediaAsset, OutputArtifact } from "../lib/localTransport";
import type { NovelEditorReference } from "./NovelDocumentEditorR1";

const MarkdownEditorAdapter = lazy(() => import("./MarkdownEditorAdapter").then((module) => ({ default: module.MarkdownEditorAdapter })));
const NovelDocumentEditorR1 = lazy(() => import("./NovelDocumentEditorR1").then((module) => ({ default: module.NovelDocumentEditorR1 })));
const labels: Record<OutputArtifact["type"], string> = { novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动剧" };
type SaveInput = { title: string; content: string; structure: Record<string, unknown> };
type MigrationPreview = { model: NovelDocumentModelR1; projectedContent: string; sourceContentHash: string; warning: string | null };

export function OutputArtifactWorkbench(props: { artifact: OutputArtifact; mediaAssets?: CreationMediaAsset[]; references?: NovelEditorReference[]; busy?: boolean; onSave(input: SaveInput): Promise<void>; onBack(): void; onRevisionHistory(): void; onOpenTianyi?(): void; onOpenDerivedSource?(): void }) {
  const [title, setTitle] = useState(props.artifact.title);
  const [content, setContent] = useState(props.artifact.content);
  const [structure, setStructure] = useState<Record<string, unknown>>(() => migrateCreationStructure(props.artifact.type, props.artifact.structure, props.artifact.content));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [lastSavedAt, setLastSavedAt] = useState(props.artifact.updatedAt);
  const [saveError, setSaveError] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<MigrationPreview | null>(null);
  const [migrationError, setMigrationError] = useState("");
  const timer = useRef<number | null>(null);
  const latest = useRef({ title, content, structure });
  latest.current = { title, content, structure };
  const recoveryKey = `story-studio:creation-recovery:${props.artifact.id}`;

  useEffect(() => {
    const recovered = sessionStorage.getItem(recoveryKey);
    let next = { title: props.artifact.title, content: props.artifact.content, structure: migrateCreationStructure(props.artifact.type, props.artifact.structure, props.artifact.content) as Record<string, unknown> };
    if (recovered) { try { const parsed = JSON.parse(recovered) as typeof next & { version?: string }; if (parsed.version === props.artifact.version) next = parsed; } catch { sessionStorage.removeItem(recoveryKey); } }
    setTitle(next.title); setContent(next.content); setStructure(next.structure); latest.current = next; setSaveState("saved"); setSaveError("");
  }, [props.artifact.id, props.artifact.version]);

  const save = async (input = latest.current) => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    setSaveState("saving"); setSaveError("");
    try { await props.onSave({ title: input.title.trim() || props.artifact.title, content: input.content, structure: input.structure }); setSaveState("saved"); setLastSavedAt(new Date().toISOString()); sessionStorage.removeItem(recoveryKey); }
    catch (cause) { setSaveState("failed"); setSaveError(cause instanceof Error ? cause.message : "暂时没有保存成功，请重试。"); }
  };
  useEffect(() => () => { if (timer.current !== null) { window.clearTimeout(timer.current); void save(latest.current); } }, []);
  const schedule = (next: Partial<SaveInput>) => { const input = { ...latest.current, ...next }; latest.current = input; sessionStorage.setItem(recoveryKey, JSON.stringify({ ...input, version: props.artifact.version })); if (timer.current !== null) window.clearTimeout(timer.current); setSaveState("saving"); timer.current = window.setTimeout(() => void save(input), 700); };
  const changeContent = (value: string) => { setContent(value); schedule({ content: value }); };
  const changeStructure = (value: Record<string, unknown>) => { setStructure(value); schedule({ structure: value }); };
  const novelModel = props.artifact.type === "novel" ? readNovelDocumentModel(structure) : null;
  const changeNovelModel = (model: NovelDocumentModelR1) => {
    const nextStructure = { ...latest.current.structure, [NOVEL_DOCUMENT_AUTHORITY_KEY]: "document-model-r1", [NOVEL_DOCUMENT_MODEL_KEY]: model };
    const nextContent = serializeNovelDocumentModelToMarkdown(model);
    setContent(nextContent); setStructure(nextStructure); schedule({ content: nextContent, structure: nextStructure });
  };
  const eventProposal = (() => {
    if (!novelModel) return null;
    try { return structure[NOVEL_EVENT_PROPOSAL_KEY] ? validateNovelEventProposal(structure[NOVEL_EVENT_PROPOSAL_KEY]) : null; }
    catch { return null; }
  })();
  const decideEventProposal = (decision: "accept" | "reject") => {
    if (!novelModel || !eventProposal) return;
    try {
      const decidedAt = new Date().toISOString();
      if (decision === "accept") {
        const accepted = acceptNovelEventProposal(novelModel, eventProposal, decidedAt);
        const nextStructure = { ...latest.current.structure, [NOVEL_DOCUMENT_AUTHORITY_KEY]: "document-model-r1", [NOVEL_DOCUMENT_MODEL_KEY]: accepted.model, [NOVEL_EVENT_PROPOSAL_KEY]: accepted.proposal };
        const nextContent = serializeNovelDocumentModelToMarkdown(accepted.model);
        setContent(nextContent); setStructure(nextStructure); latest.current = { ...latest.current, content: nextContent, structure: nextStructure }; schedule({ content: nextContent, structure: nextStructure });
      } else {
        const rejected = rejectNovelEventProposal(eventProposal, decidedAt);
        const nextStructure = { ...latest.current.structure, [NOVEL_EVENT_PROPOSAL_KEY]: rejected };
        setStructure(nextStructure); schedule({ structure: nextStructure });
      }
    } catch (cause) {
      setSaveState("failed");
      setSaveError(cause instanceof Error ? cause.message : "这条建议已过期，请重新生成。");
    }
  };
  const previewMigration = async () => {
    setMigrationError("");
    try {
      const references = new Map((props.references || []).map((reference) => [reference.id, { type: reference.type, label: reference.label, revision: reference.revision }]));
      const sourceContentHash = await hashText(content);
      const model = migrateMarkdownToNovelDocumentModelR1(content, { documentId: props.artifact.id, title, createdAt: new Date().toISOString(), sourceArtifactId: props.artifact.id, sourceArtifactVersion: props.artifact.version, sourceContentHash, references });
      setMigrationPreview({ model, projectedContent: serializeNovelDocumentModelToMarkdown(model), sourceContentHash, warning: content === serializeNovelDocumentModelToMarkdown(model) ? null : "导出会加入稳定块身份标记；原始 Markdown 会保留在迁移回执中。" });
    } catch (cause) { setMigrationError(cause instanceof Error ? cause.message : "无法解析这份 Markdown，请保留兼容模式。"); }
  };
  const confirmMigration = async () => {
    if (!migrationPreview) return;
    const migratedModel = withRevision(migrationPreview.model, "migration", new Date().toISOString());
    const nextStructure = { ...latest.current.structure, [NOVEL_DOCUMENT_AUTHORITY_KEY]: "document-model-r1", [NOVEL_DOCUMENT_MODEL_KEY]: migratedModel, [NOVEL_MIGRATION_RECEIPT_KEY]: { version: "tianyan-novel-migration/r1", sourceArtifactVersion: props.artifact.version, sourceContentHash: migrationPreview.sourceContentHash, parserVersion: migratedModel.version, confirmedAt: new Date().toISOString(), originalContentPreserved: true } };
    const nextContent = serializeNovelDocumentModelToMarkdown(migratedModel);
    setMigrationPreview(null); setMigrationError(""); setContent(nextContent); setStructure(nextStructure); latest.current = { title, content: nextContent, structure: nextStructure };
    await save({ title, content: nextContent, structure: nextStructure });
  };
  const exportArtifact = () => download(content, `${safeFileName(title)}.${props.artifact.type === "screenplay" ? "fountain" : "md"}`, props.artifact.type === "screenplay" ? "text/plain" : "text/markdown");
  return <section className="workbench output-artifact-workbench author-creation-workbench" data-testid="output-artifact-workbench" data-output-artifact-type={props.artifact.type}>
    <header className="author-creation-header"><button type="button" className="secondary-action" onClick={() => { void save(); props.onBack(); }}><ArrowLeft />返回创作</button><div><small>{labels[props.artifact.type]}</small><strong>{props.artifact.sourceUnits.length ? `参考了 ${props.artifact.sourceUnits.length} 份素材` : "从空白开始"}</strong></div>{Boolean(props.artifact.generationBrief?.derivedEventLine) && <button type="button" className="secondary-action" onClick={props.onOpenDerivedSource}>返回派生事件线</button>}<span className={`creation-save-state is-${saveState}`} role="status">{saveState === "saved" ? <><Check />已保存 · {formatTime(lastSavedAt)}</> : saveState === "saving" ? <><RefreshCw />保存中</> : <><Clock3 />保存失败</>}</span></header>
    <div className="author-creation-title-row"><input aria-label="作品标题" value={title} onChange={(event) => { setTitle(event.target.value); schedule({ title: event.target.value }); }} maxLength={100} /><button type="button" className="secondary-action" disabled={props.busy || saveState === "saving"} onClick={() => void save()}><Save />立即保存</button><button type="button" className="secondary-action" onClick={props.onRevisionHistory}><Clock3 />历史</button><button type="button" className="secondary-action" onClick={exportArtifact}><Download />导出</button>{props.artifact.type === "novel" && !novelModel ? <button type="button" className="secondary-action" onClick={previewMigration}><Sparkles />升级为自然编辑</button> : null}</div>
    {props.artifact.type === "novel" && novelModel ? <Suspense fallback={<div className="creation-editor-loading">正在打开自然写作页……</div>}><NovelDocumentEditorR1 model={novelModel} references={props.references || []} eventProposal={eventProposal} onEventProposalDecision={decideEventProposal} onChange={changeNovelModel} onFlush={() => void save()} onOpenTianyi={() => props.onOpenTianyi?.()} /></Suspense> : null}
    {props.artifact.type === "novel" && !novelModel ? <Suspense fallback={<div className="creation-editor-loading">正在打开兼容写作页……</div>}><MarkdownEditorAdapter value={content} onChange={changeContent} onFlush={() => void save()} onTianyi={() => props.onOpenTianyi?.()} /></Suspense> : null}
    {migrationError ? <p className="output-artifact-error" role="alert">{migrationError}</p> : null}
    {migrationPreview ? <section className="novel-migration-review" data-testid="novel-migration-preview" aria-label="小说迁移预览"><header><strong>迁移预览</strong><button type="button" className="secondary-action" onClick={() => setMigrationPreview(null)}>取消</button></header><p>将把当前 Markdown 解析为卷、章、场景和稳定正文块；当前内容不会在确认前写入。</p><div><span>{Object.values(migrationPreview.model.blocks).length} 个稳定块</span><span>{migrationPreview.model.revision.sequence} 个版本</span>{migrationPreview.warning ? <small>{migrationPreview.warning}</small> : null}</div><footer><button type="button" className="secondary-action" onClick={() => setMigrationPreview(null)}>保留原文</button><button type="button" className="primary-action" onClick={() => void confirmMigration()}>确认迁移并保存</button></footer></section> : null}
    {props.artifact.type === "screenplay" ? <ScreenplayEditor content={content} onContent={changeContent} onFlush={() => void save()} onTianyi={props.onOpenTianyi} /> : null}
    {props.artifact.type === "storyboard" || props.artifact.type === "comic" || props.artifact.type === "motion-comic" ? <ComicEditor type={props.artifact.type} structure={structure} assets={props.mediaAssets || []} onStructure={changeStructure} /> : null}
    {props.artifact.type === "interactive-drama" ? <section className="creation-planned-surface"><strong>互动叙事正在准备中</strong><p>先把故事写扎实，互动版本会在这里继续生长。</p></section> : null}
    {saveState === "failed" ? <p className="output-artifact-error" role="alert">{saveError}<button type="button" onClick={() => void save()}>重试保存</button></p> : null}
  </section>;
}

function ScreenplayEditor(props: { content: string; onContent(value: string): void; onFlush(): void; onTianyi?(): void }) {
  const parsed = parseFountain(props.content);
  const editor = useRef<HTMLTextAreaElement | null>(null);
  return <main className="creation-surface screenplay-fountain-surface" data-creation-surface="screenplay" data-screenplay-format="fountain-r0"><aside><header><strong>场景大纲</strong><span>{parsed.scenes.length}</span></header><label className="markdown-file-action"><FileUp />导入 .fountain<input type="file" accept=".fountain,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(props.onContent); }} /></label>{parsed.scenes.map((scene) => <button type="button" key={scene.id} onClick={() => { editor.current?.focus(); editor.current?.setSelectionRange(scene.start, scene.start); }}><span>{scene.title}</span><small>{scene.sceneNumber ? `#${scene.sceneNumber}` : "未编号"}</small></button>)}{parsed.unsupported.length ? <p>部分格式会按原样保留。</p> : null}</aside><article className="fountain-editor-pane"><textarea ref={editor} aria-label="剧本正文" value={props.content} onChange={(event) => props.onContent(event.target.value)} onBlur={props.onFlush} placeholder={"INT. 灯塔 - 夜 #1#\n\n林海\n我们到了。"} /><section className="fountain-live-preview" aria-label="剧本即时预览">{parsed.tokens.map((token, index) => token.type === "blank" ? <br key={index} /> : <p key={index} className={`is-${token.type}`}><span>{token.text}</span>{token.sceneNumber ? <small>#{token.sceneNumber}</small> : null}</p>)}</section><footer><span>场景、角色、对白与转场会在这里展开。</span><button type="button" onClick={props.onTianyi}><Sparkles />请天意建议</button></footer></article></main>;
}

function ComicEditor(props: { type: "storyboard" | "comic" | "motion-comic"; structure: Record<string, unknown>; assets: CreationMediaAsset[]; onStructure(value: Record<string, unknown>): void }) {
  const pages = structuredList(props.structure.pages);
  const updatePages = (next: Record<string, unknown>[]) => props.onStructure({ ...props.structure, pages: next });
  return <main className="comic-storyboard-surface" data-creation-surface={props.type}><header><div><small>{props.type === "comic" ? "漫画" : props.type === "motion-comic" ? "漫剧" : "分镜"}</small><strong>Page / Sequence 与 Panel</strong></div><button type="button" className="primary-action" onClick={() => updatePages([...pages, { id: `page.${Date.now()}`, title: `第 ${pages.length + 1} 页`, layoutTemplate: "single", panels: [] }])}><FilePlus2 />新增页</button></header><div className="storyboard-page-list">{pages.map((page, pageIndex) => { const panels = structuredList(page.panels); return <article key={String(page.id)} className={`storyboard-page is-${String(page.layoutTemplate || "single")}`}><header><GripVertical /><input aria-label={`第 ${pageIndex + 1} 页标题`} value={text(page.title, `第 ${pageIndex + 1} 页`)} onChange={(event) => updatePages(pages.map((candidate, index) => index === pageIndex ? { ...candidate, title: event.target.value } : candidate))} /><select aria-label="Panel 布局" value={text(page.layoutTemplate, "single")} onChange={(event) => updatePages(pages.map((candidate, index) => index === pageIndex ? { ...candidate, layoutTemplate: event.target.value } : candidate))}><option value="single">单格</option><option value="two-column">两列</option><option value="three-strip">三条</option><option value="hero-two">主画面 + 两格</option></select><button type="button" onClick={() => updatePages(pages.filter((_, index) => index !== pageIndex))}><Trash2 /></button></header><div className="storyboard-panel-grid">{panels.map((panel, panelIndex) => <section key={String(panel.id)} draggable onDragStart={(event) => event.dataTransfer.setData("text/panel-index", String(panelIndex))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const from = Number(event.dataTransfer.getData("text/panel-index")); if (!Number.isInteger(from) || from === panelIndex) return; const next = panels.slice(); const [moved] = next.splice(from, 1); next.splice(panelIndex, 0, moved); updatePages(pages.map((candidate, index) => index === pageIndex ? { ...candidate, panels: next } : candidate)); }}><header><strong>Panel {panelIndex + 1}</strong><button type="button" onClick={() => updatePages(pages.map((candidate, index) => index === pageIndex ? { ...candidate, panels: panels.filter((_, candidateIndex) => candidateIndex !== panelIndex) } : candidate))}><Trash2 /></button></header>{[["assetId", "媒体 assetId"], ["shotSize", "景别 / 镜头"], ["characters", "角色"], ["locationId", "地点引用"], ["dialogue", "台词"], ["caption", "旁白"], ["prompt", "提示词 / 画面"], ["continuityNotes", "连贯性备注"], ["sourceEventId", "来源 Event / Beat"]].map(([key, label]) => <label key={key}><span>{label}</span>{key === "assetId" && props.assets.length ? <select value={text(panel[key])} onChange={(event) => updatePanel(pages, pageIndex, panels, panelIndex, key, event.target.value, updatePages)}><option value="">不引用媒体</option>{props.assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.fileName}</option>)}</select> : <textarea value={key === "characters" && Array.isArray(panel[key]) ? panel[key].join("、") : text(panel[key])} onChange={(event) => updatePanel(pages, pageIndex, panels, panelIndex, key, key === "characters" ? event.target.value.split(/[,，、]/u).filter(Boolean) : event.target.value, updatePages)} />}</label>)}</section>)}</div><button type="button" className="secondary-action" onClick={() => updatePages(pages.map((candidate, index) => index === pageIndex ? { ...candidate, panels: [...panels, { id: `panel.${Date.now()}`, assetId: "", shotSize: "中景", characters: [], locationId: "", dialogue: "", caption: "", prompt: "", continuityNotes: "", sourceRefs: [] }] } : candidate))}><Plus />新增 Panel</button></article>; })}</div></main>;
}

function updatePanel(pages: Record<string, unknown>[], pageIndex: number, panels: Record<string, unknown>[], panelIndex: number, key: string, value: unknown, updatePages: (pages: Record<string, unknown>[]) => void) { updatePages(pages.map((page, index) => index === pageIndex ? { ...page, panels: panels.map((panel, candidateIndex) => candidateIndex === panelIndex ? { ...panel, [key]: value } : panel) } : page)); }
function text(value: unknown, fallback = ""): string { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function safeFileName(value: string): string { return value.replace(/[\\/:*?"<>|]/gu, "-").slice(0, 80) || "creation"; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }
function download(content: string, fileName: string, type: string) { const blob = new Blob([content], { type: `${type};charset=utf-8` }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = fileName; anchor.click(); URL.revokeObjectURL(anchor.href); }
async function hashText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("")}`;
}
