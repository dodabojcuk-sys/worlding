import { FileText, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

import type { TianyiReceiptRead } from "../../lib/localTransport";

export function TianyiSourceInspector(props: {
  receipt: TianyiReceiptRead | null;
  loading: boolean;
  sourceCount: number;
  sourceLabels: string[];
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    props.onClose();
    requestAnimationFrame(() => props.returnFocusRef.current?.focus());
  };
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose, props.returnFocusRef]);
  const receipt = props.receipt;
  return <div className="tianyi-source-inspector-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="tianyi-source-inspector" role="dialog" aria-modal="true" aria-labelledby="tianyi-source-inspector-title"><header><span><FileText />来源</span><button ref={closeRef} type="button" className="icon-action" onClick={close} aria-label="关闭来源详情"><X /></button></header>{props.loading ? <><h2 id="tianyi-source-inspector-title">正在读取来源详情</h2><p>只展示这次回答实际携带的来源范围。</p></> : receipt ? <ReceiptDetails receipt={receipt} fallbackLabels={props.sourceLabels} /> : props.sourceCount > 0 ? <><h2 id="tianyi-source-inspector-title">来源详情当前不可用</h2><p>{props.sourceLabels.join(" · ") || `已有 ${props.sourceCount} 项引用来源`}</p><small>当前无法安全读取这份回执；不会用推测文字替代来源内容。</small></> : <><h2 id="tianyi-source-inspector-title">来源详情当前不可用</h2><p>这段内容暂时没有可打开的来源引用。</p></>}</section></div>;
}

function ReceiptDetails(props: { receipt: TianyiReceiptRead; fallbackLabels: string[] }) {
  const sourceDetails = props.receipt.sourceDetails;
  return <><h2 id="tianyi-source-inspector-title">本次回答实际引用的来源</h2><p>{props.receipt.currentStatus === "stale" ? "来源内容已经变化；请重新检查后再把它用于简报或后续操作。" : "以下内容来自已保存的来源回执。"}</p>{sourceDetails.length ? <ul className="tianyi-source-inspector-list">{sourceDetails.map((source) => <li key={source.id}><strong>{source.label}</strong><small>{source.currentState === "current" ? "当前可读取" : "来源状态已变化"}</small></li>)}</ul> : <p>{props.fallbackLabels.join(" · ") || "这份回执没有可展示的来源标签。"}</p>}<small>生成时间：{formatTimestamp(props.receipt.receipt.generationTimestamp)}。未读取的正文不会在这里生成摘录。</small></>;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "当前不可用" : date.toLocaleString("zh-CN", { hour12: false });
}
