import { BookOpenText, Clock3, Ellipsis, X } from "lucide-react";

export function DocumentHeaderActions(props: {
  title: string;
  typeLabel: string;
  saveLabel: string;
  saveState: "saved" | "unsaved" | "saving" | "conflict";
  tutorial: string;
  onRevisionHistory(): void;
  onClose(): void;
  onOpenLibrary(): void;
}) {
  return <header className="shared-document-header">
    <div className="shared-document-title"><span><strong>{props.title}</strong><small>{props.typeLabel}</small></span><em className={`save-state is-${props.saveState}`}>{props.saveLabel}</em></div>
    <div className="shared-document-actions">
      <details className="header-popover"><summary title="教程"><BookOpenText /></summary><div><strong>当前文档</strong><p>{props.tutorial}</p></div></details>
      <details className="header-popover"><summary title="更多"><Ellipsis /></summary><div><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); props.onOpenLibrary(); }}>在资料库中查看</button></div></details>
      <button type="button" className="icon-action" onClick={props.onRevisionHistory} title="修订历史" aria-label="修订历史"><Clock3 /></button>
      <button type="button" className="icon-action" onClick={props.onClose} title="关闭文档" aria-label="关闭文档"><X /></button>
    </div>
  </header>;
}
