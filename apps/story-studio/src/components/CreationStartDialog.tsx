import { BookOpen, FilePlus2, Sparkles, X } from "lucide-react";

import type { OutputArtifactType } from "../lib/localTransport";
import { creationTypeLabel } from "./WritingNavigator";

export function CreationStartDialog(props: { type: OutputArtifactType; projectTitle: string; currentSourceLabel: string; sources: Array<{ id: string; title: string; summary: string }>; onSource(id: string): void; onFullBook(): void; onCurrentStory(): void; onBlank(): void; onClose(): void }) {
  const label = creationTypeLabel(props.type);
  return <div className="creation-start-backdrop" role="presentation"><section className="creation-start-dialog" role="dialog" aria-modal="true" aria-label={`新建${label}`}><header><div><small>新建{label}</small><strong>从哪里开始？</strong></div><button type="button" className="icon-action" aria-label="关闭新建创作" onClick={props.onClose}><X /></button></header><p>选一份素材作为起点，或者从空白处开始。</p><div className="creation-source-options"><button type="button" className="primary-action" onClick={props.onBlank}><FilePlus2 />从空白开始</button><button type="button" className="secondary-action" onClick={props.onFullBook}><BookOpen />从全书《{props.projectTitle}》开始</button><button type="button" className="secondary-action" onClick={props.onCurrentStory}><Sparkles />从当前上下文“{props.currentSourceLabel}”开始</button>{props.sources.slice(0, 8).map((source) => <button type="button" className="secondary-action" key={source.id} onClick={() => props.onSource(source.id)}><BookOpen />{source.title}<small>{source.summary}</small></button>)}</div><small className="creation-start-note">你可以从任何一份素材继续写作。</small></section></div>;
}

export function CreationEmptyWorkbench(props: { type: OutputArtifactType; onCreate(): void; onOpenTypeMenu(): void }) {
  const label = creationTypeLabel(props.type);
  return <section className="workbench creation-empty-workbench" data-testid="creation-empty-workbench" data-creation-type={props.type}><div><BookOpen /><small>{label}</small><h1>开始一份{label}</h1><p>从当前故事继续，或先写下一个新的想法。</p><button type="button" className="primary-action" onClick={props.onCreate}><FilePlus2 />新建{label}</button><button type="button" className="secondary-action" onClick={props.onOpenTypeMenu}>切换创作类型</button></div></section>;
}
