import { Archive, CheckCircle2, FolderOpen, HardDrive, RefreshCw, ShieldCheck, X } from "lucide-react";

import type { StorageTransparency } from "../lib/localTransport";

export function StorageTransparencyPanel(props: {
  open: boolean;
  status: StorageTransparency | null;
  loading: boolean;
  revealBusy: boolean;
  error: string;
  onClose(): void;
  onRefresh(): void;
  onReveal(): void;
}) {
  if (!props.open) return null;
  const ready = props.status?.persistenceState === "verified-local";
  return <div className="dialog-backdrop storage-transparency-backdrop" role="presentation">
    <section className="storage-transparency-panel" role="dialog" aria-modal="true" aria-labelledby="storage-transparency-title" data-testid="storage-transparency-panel">
      <button type="button" className="quiet-close" onClick={props.onClose} aria-label="关闭存储设置"><X /></button>
      <div className="storage-panel-icon"><HardDrive /></div>
      <p className="eyebrow">本地故事位置</p>
      <h2 id="storage-transparency-title">你的故事保存在这里</h2>
      <p className="storage-panel-lede">当前版本直接读取本机项目文件，不使用浏览器缓存，也不会通过这个存储方式上传内容。</p>

      {props.status ? <>
        <div className={`storage-persistence-state ${ready ? "is-ready" : "is-unavailable"}`}>
          {ready ? <CheckCircle2 /> : <RefreshCw />}
          <span><strong>{ready ? "项目已保存到本地" : "暂时无法确认本地项目"}</strong><small>{ready ? "Story Studio 已从项目文件读取当前世界。" : "请重新检查故事位置。"}</small></span>
        </div>
        <dl className="storage-location-details">
          <div><dt>故事项目</dt><dd><code>{props.status.projectPath}</code></dd></div>
          <div><dt>故事库</dt><dd><code>{props.status.libraryPath}</code></dd></div>
          <div><dt>存储方式</dt><dd>本地 Markdown 与视觉 JSON</dd></div>
        </dl>
        <div className="storage-panel-actions">
          <button type="button" className="primary-action" disabled={props.loading || props.revealBusy || !props.status.revealSupported} onClick={props.onReveal}><FolderOpen />{props.revealBusy ? "正在打开" : props.status.revealLabel}</button>
          <button type="button" className="secondary-action" disabled={props.loading || props.revealBusy} onClick={props.onRefresh}><RefreshCw />{props.loading ? "正在检查" : "重新检查"}</button>
        </div>
      </> : <div className={`storage-panel-loading ${props.error ? "is-error" : ""}`}><RefreshCw className={props.loading ? "spin" : ""} /><span>{props.error ? "故事位置暂时不可用" : "正在确认故事位置…"}</span></div>}

      {props.error && <p className="form-error" role="alert">{props.error}</p>}

      <div className="storage-trust-grid">
        <article>
          <Archive />
          <span><strong>现在如何备份</strong><small>先确认文档显示“已保存”，再打开故事文件夹，把整个项目文件夹复制到另一块磁盘或备份目录。</small></span>
        </article>
        <article>
          <ShieldCheck />
          <span><strong>完整导出</strong><small>项目文件夹本身可整体复制；带校验清单的一键导出尚未提供，当前界面不会假装已经完成。</small></span>
        </article>
      </div>

      <div className="storage-managed-note">
        <strong>当前是 Founder Dogfood 存储方式</strong>
        <p>位置由本地服务管理。选择其他文件夹、云端、Git 和 NAS 尚未启用，也不会在这里显示不可用按钮。</p>
      </div>
    </section>
  </div>;
}
