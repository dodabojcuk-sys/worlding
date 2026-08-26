import { BookOpen, FileText, X } from "lucide-react";

export function WritingDocumentDialog(props: {
  type: "chapter" | "scene";
  title: string;
  busy: boolean;
  error: string;
  onTitle(title: string): void;
  onCreate(): void;
  onClose(): void;
}) {
  return <div className="dialog-backdrop" role="presentation">
    <section className="new-object-dialog writing-document-dialog" role="dialog" aria-modal="true" aria-label={`新建${props.type === "chapter" ? "章节" : "场景"}`}>
      <button className="quiet-close" type="button" onClick={props.onClose} aria-label="关闭"><X /></button>
      <p className="eyebrow">写作</p>
      <h2>{props.type === "chapter" ? "创建一个新章节" : "把新场景放进当前章节"}</h2>
      <div className="writing-dialog-icon">{props.type === "chapter" ? <BookOpen /> : <FileText />}</div>
      <label className="dialog-field"><span>{props.type === "chapter" ? "章节名称" : "场景名称"}</span><input autoFocus value={props.title} maxLength={100} placeholder={props.type === "chapter" ? "例如：第三章 · 地下室" : "例如：铁门前的迟疑"} onChange={(event) => props.onTitle(event.target.value)} /></label>
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      <button type="button" className="primary-action dialog-primary" disabled={!props.title.trim() || props.busy} onClick={props.onCreate}>{props.busy ? "正在创建" : `创建${props.type === "chapter" ? "章节" : "场景"}`}</button>
    </section>
  </div>;
}
