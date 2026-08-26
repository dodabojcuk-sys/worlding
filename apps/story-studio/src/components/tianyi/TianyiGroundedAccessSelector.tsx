import type {
  TianyiGroundedAccessSelection,
  TianyiObjectContextRef
} from "../../lib/localTransport";

function refKey(ref: TianyiObjectContextRef): string {
  return `${ref.projectId}:${ref.ownerType}:${ref.ownerId}:${ref.objectType}:${ref.stableId}`;
}

export function TianyiGroundedAccessSelector(props: {
  value: TianyiGroundedAccessSelection;
  subjects: TianyiObjectContextRef[];
  onChange(value: TianyiGroundedAccessSelection): void;
}) {
  const selected = props.value.accessMode === "author" ? "author" : refKey(props.value.subjectRef);
  return <label className="tianyi-grounded-access">
    <span>回答视角</span>
    <select
      aria-label="天意回答视角"
      value={selected}
      onChange={(event) => {
        if (event.target.value === "author") {
          props.onChange({ accessMode: "author", subjectRef: null });
          return;
        }
        const subjectRef = props.subjects.find((ref) => refKey(ref) === event.target.value);
        if (subjectRef) props.onChange({ accessMode: "character", subjectRef });
      }}
    >
      <option value="author">作者视野（完整来源）</option>
      {props.subjects.map((subject) => <option value={refKey(subject)} key={refKey(subject)}>角色：{subject.label}</option>)}
    </select>
    <small>{props.value.accessMode === "author" ? "可读取本次授权的完整当前内容" : "只发送该角色已获知的投影"}</small>
  </label>;
}
