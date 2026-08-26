import { FolderPlus, X } from "lucide-react";

export function WorkspaceFolderDialog(props: {
  open: boolean;
  title: string;
  busy: boolean;
  error: string;
  onTitle(value: string): void;
  onClose(): void;
  onSubmit(): void;
}) {
  if (!props.open) return null;
  return <div className="dialog-backdrop" role="presentation">
    <section className="story-dialog workspace-folder-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title">
      <header><span><FolderPlus /><strong id="folder-dialog-title">新建文件夹</strong></span><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭"><X /></button></header>
      <label><span>文件夹名称</span><input autoFocus value={props.title} maxLength={80} onChange={(event) => props.onTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onSubmit(); }} placeholder="例如：主要角色" /></label>
      {props.error && <p className="dialog-error" role="alert">{props.error}</p>}
      <footer><button type="button" className="secondary-action" onClick={props.onClose}>取消</button><button type="button" className="primary-action" disabled={props.busy || !props.title.trim()} onClick={props.onSubmit}>{props.busy ? "正在创建" : "创建文件夹"}</button></footer>
    </section>
  </div>;
}
