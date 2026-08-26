import { CircleUserRound, FolderKey, X } from "lucide-react";

/**
 * The product rail owns author identity entry. This is intentionally a local
 * presentation panel: account, settings, and story characters remain distinct
 * concepts and no new account persistence is introduced in Shell R0.
 */
export function ProductShellProfilePanel(props: {
  open: boolean;
  authorLabel: string;
  projectTitle: string;
  onClose(): void;
}) {
  if (!props.open) return null;
  return <div className="product-shell-profile-backdrop" role="presentation">
    <section className="product-shell-profile-panel" role="dialog" aria-modal="true" aria-label="个人中心">
      <header><div><CircleUserRound /><span><small>作者身份</small><strong>{props.authorLabel}</strong></span></div><button type="button" onClick={props.onClose} aria-label="关闭个人中心"><X /></button></header>
      <div className="product-shell-profile-body">
        <section><FolderKey /><div><strong>当前作品归属</strong><span>{props.projectTitle}</span></div></section>
        <p>这里管理作者身份、作品归属与本地/同步状态；模型、外观和编辑偏好仍在独立的“设置”入口中。</p>
      </div>
    </section>
  </div>;
}
