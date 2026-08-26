import { ArrowLeft, FileAudio, FileImage, FileVideo, FilePlus2, Link2, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { CreationMediaAsset, CreationMediaCatalog } from "../lib/localTransport";

export type CreationMediaDraft = Omit<CreationMediaAsset, "id" | "createdAt" | "updatedAt" | "backlinks">;

const emptyDraft: CreationMediaDraft = { fileName: "", kind: "image", mimeType: "image/png", size: 0, width: null, height: null, durationMs: null, source: "author", license: "", generatedBy: "", tags: [], relativePath: "" };

export function CreationMediaManager(props: {
  catalog: CreationMediaCatalog;
  busy: boolean;
  error: string;
  onBack(): void;
  onCreate(asset: CreationMediaDraft): Promise<void>;
  onReplace(asset: CreationMediaAsset, patch: Partial<CreationMediaDraft>): Promise<void>;
  onDelete(asset: CreationMediaAsset): Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CreationMediaAsset | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const assets = useMemo(() => props.catalog.assets.filter((asset) => !query.trim() || `${asset.fileName} ${asset.kind} ${asset.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [props.catalog.assets, query]);
  return <section className="workbench creation-media-manager" data-testid="creation-media-manager">
    <header><button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />返回创作</button><div><small>创作中心</small><h1>媒体</h1><p>管理图像、音频、视频和参考资料的元数据与使用位置。</p></div><button type="button" className="primary-action" onClick={() => setAdding(true)}><FilePlus2 />添加媒体</button></header>
    <div className="creation-media-toolbar"><label><Search /><input aria-label="搜索媒体" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或标签" /></label><span>{assets.length} 项 · {props.catalog.assets.filter((asset) => !asset.backlinks.length).length} 项未使用</span></div>
    {props.error ? <p role="alert" className="output-artifact-error">{props.error}</p> : null}
    <div className="creation-media-grid">{assets.map((asset) => <article key={asset.id}>
      <div className="creation-media-icon">{asset.kind === "image" ? <FileImage /> : asset.kind === "audio" ? <FileAudio /> : <FileVideo />}</div>
      <div><strong>{asset.fileName}</strong><small>{asset.mimeType || asset.kind} · {formatSize(asset.size)}</small><small>{asset.source || "来源待补充"}{asset.license ? ` · ${asset.license}` : ""}</small><div>{asset.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      <footer><span><Link2 />{asset.backlinks.length ? `${asset.backlinks.length} 处使用` : "未使用"}</span><button type="button" disabled={props.busy} onClick={() => { setEditing(asset); setDraft({ fileName: asset.fileName, kind: asset.kind, mimeType: asset.mimeType, size: asset.size, width: asset.width, height: asset.height, durationMs: asset.durationMs, source: asset.source, license: asset.license, generatedBy: asset.generatedBy, tags: asset.tags, relativePath: asset.relativePath }); }}>编辑 / 替换</button><button type="button" disabled={props.busy || asset.backlinks.length > 0} title={asset.backlinks.length ? "先从使用位置移除引用" : "删除元数据"} onClick={() => void props.onDelete(asset)}><Trash2 />删除</button></footer>
      {asset.backlinks.length ? <details><summary>使用位置</summary>{asset.backlinks.map((backlink) => <p key={`${backlink.artifactId}:${backlink.structurePath}`}>{backlink.artifactTitle} · {backlink.structurePath}</p>)}</details> : null}
    </article>)}</div>
    {adding || editing ? <div className="creation-media-form-backdrop"><form onSubmit={(event) => { event.preventDefault(); if (!draft.fileName.trim()) return; const save = editing ? props.onReplace(editing, draft) : props.onCreate(draft); void save.then(() => { setDraft(emptyDraft); setAdding(false); setEditing(null); }); }}><header><strong>{editing ? "编辑 / 替换媒体记录" : "添加媒体记录"}</strong><button type="button" onClick={() => { setAdding(false); setEditing(null); setDraft(emptyDraft); }}>取消</button></header><label>文件名<input required value={draft.fileName} onChange={(event) => setDraft({ ...draft, fileName: event.target.value })} /></label><label>类型<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CreationMediaDraft["kind"] })}><option value="image">图片</option><option value="audio">音频</option><option value="video">视频</option><option value="reference">参考资料</option></select></label><label>MIME<input value={draft.mimeType} onChange={(event) => setDraft({ ...draft, mimeType: event.target.value })} /></label><label>相对路径<input value={draft.relativePath} onChange={(event) => setDraft({ ...draft, relativePath: event.target.value })} /></label><label>来源<input value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} /></label><label>许可证 / 生成来源<input value={draft.license} onChange={(event) => setDraft({ ...draft, license: event.target.value })} /></label><label>标签<input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(/[,，]/u).map((tag) => tag.trim()).filter(Boolean) })} /></label><button type="submit" className="primary-action" disabled={props.busy}>保存记录</button></form></div> : null}
  </section>;
}

function formatSize(value: number): string { if (!value) return "尺寸待补充"; if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
