import { useEffect, useState } from "react";
import { getNuwaN1Bootstrap, type NuwaN1Storyline, type TianyiSessionScope } from "../../lib/localTransport";

export function TianyiSessionScopeChoice(props: { projectId: string | null; value: TianyiSessionScope | null; onChange(scope: TianyiSessionScope | null): void; disabled?: boolean }) {
  const [lines, setLines] = useState<NuwaN1Storyline[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!props.projectId) { setLines([]); return; }
    let active = true;
    setFailed(false);
    void getNuwaN1Bootstrap(props.projectId).then((result) => { if (active) setLines(result.storylines); }).catch(() => { if (active) { setLines([]); setFailed(true); } });
    return () => { active = false; };
  }, [props.projectId]);
  const selected = props.value?.kind === "project" ? "project" : props.value?.storylineKey ?? "";
  return <label className="tianyi-session-scope-choice">对话范围
    <select aria-label="天意对话范围" value={selected} disabled={props.disabled || !props.projectId} onChange={(event) => props.onChange(event.target.value === "project" ? { kind: "project" } : event.target.value ? { kind: "event-line", storylineKey: event.target.value } : null)}>
      <option value="">请选择项目讨论或事件线</option>
      <option value="project">项目讨论（不指定事件线）</option>
      {lines.map((line) => <option value={line.key} key={line.key}>{line.title}</option>)}
    </select>
    {failed ? <small role="alert">事件线暂时无法读取；可明确选择项目讨论，或刷新后选线。</small> : null}
  </label>;
}
