import { Download, PackageOpen, Upload } from "lucide-react";
import { useState } from "react";

type Receipt = { exportedAt?: string; importedAt?: string; packageName?: string; projectId?: string; fileCount?: number };

export function SettingsTransferSection(props: { hasProject: boolean; onExport(): Promise<Receipt>; onImport(): Promise<Receipt> }) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const run = async (kind: "export" | "import", action: () => Promise<Receipt>) => {
    setBusy(kind); setError(null);
    try { setReceipt(await action()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "传输未完成；现有作品未被修改。"); }
    finally { setBusy(null); }
  };
  return <section className="settings-card settings-transfer-section" aria-labelledby="settings-transfer-title">
    <header><PackageOpen aria-hidden="true" /><div><p>.tianyan</p><h2 id="settings-transfer-title">导入与导出</h2></div></header>
    <p>包内只包含可移植的作者数据与耐久回执；凭据、缓存、锁和绝对路径不会进入工程包。</p>
    {error && <p role="alert">{error}</p>}
    {receipt && <p role="status">操作完成：{receipt.packageName ?? receipt.projectId} · {receipt.fileCount ?? 0} 个文件</p>}
    <div className="settings-transfer-actions">
      <button type="button" disabled={!props.hasProject || busy !== null} onClick={() => void run("export", props.onExport)}><Download aria-hidden="true" />{busy === "export" ? "正在导出" : "导出当前项目"}</button>
      <button type="button" className="settings-primary-action" disabled={busy !== null} onClick={() => void run("import", props.onImport)}><Upload aria-hidden="true" />{busy === "import" ? "正在导入" : "导入到作品库"}</button>
    </div>
  </section>;
}
