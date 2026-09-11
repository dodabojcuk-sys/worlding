import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Link2, MapPin, Plus, Save, Sparkles, UsersRound } from "lucide-react";

import { createWorldObject, getWorldLibrary, readWorldObject, updateWorldObject, type WorldObject, type WorldObjectSummary, type WorldObjectType } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

const editableTypes: Array<{ value: WorldObjectType; label: string }> = [
  { value: "rule", label: "世界设定" }, { value: "location", label: "地点" }, { value: "faction", label: "组织" }, { value: "character", label: "人物" }, { value: "item", label: "物品" }
];
const typeLabel = (type: WorldObjectType) => editableTypes.find((entry) => entry.value === type)?.label ?? type;

/** Author materials use the existing World Object writer; no parallel library is created here. */
export function MaterialsWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const requestedMaterialId = new URLSearchParams(window.location.search).get("materialId");
  const materialReturn = safeReturn(new URLSearchParams(window.location.search).get("materialReturn"));
  const [items, setItems] = useState<WorldObjectSummary[]>([]);
  const [selected, setSelected] = useState<WorldObject | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<WorldObjectType | "all">("all");
  const [draft, setDraft] = useState({ title: "", body: "", tags: "" });
  const [creating, setCreating] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => items.filter((item) => (type === "all" || item.type === type) && `${item.title} ${item.tags.join(" ")} ${item.aliases.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, query, type]);
  const linkable = useMemo(() => items.filter((item) => item.id !== selected?.id), [items, selected?.id]);
  const refresh = async () => { if (!projectId) return []; const library = await getWorldLibrary(projectId); const next = library.objects.filter((item) => item.status !== "archived"); setItems(next); return next; };
  const open = (summary: WorldObjectSummary) => { if (!projectId) return; setCreating(false); setBusy(true); void readWorldObject(projectId, summary.id).then((value) => { setSelected(value); setDraft({ title: value.title, body: value.body, tags: value.tags.join("、") }); setLinkTargetId(""); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "资料无法打开。")).finally(() => setBusy(false)); };
  useEffect(() => {
    setSelected(null); setCreating(false); setMessage("");
    void refresh().then((next) => { const requested = requestedMaterialId ? next.find((item) => item.id === requestedMaterialId) : null; if (requested) open(requested); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "资料读取失败。"));
  // The route is a deliberate source-return boundary, not a general browser history signal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, requestedMaterialId]);
  const create = () => { if (!projectId || !draft.title.trim()) return; setBusy(true); void props.runtime.withConnection((token) => createWorldObject({ projectId, type: type === "all" ? "rule" : type, title: draft.title.trim(), body: draft.body, tags: draft.tags.split(/[、,]/u).map((value) => value.trim()).filter(Boolean), status: "draft", token })).then(async (value) => { await refresh(); setCreating(false); open(value); setMessage("资料已建立；它仍是可编辑的作者资料，不会自动成为角色知识。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "资料保存失败，编辑内容仍保留。")).finally(() => setBusy(false)); };
  const save = () => { if (!projectId || !selected) return; setBusy(true); void props.runtime.withConnection((token) => updateWorldObject({ projectId, objectId: selected.id, expectedHash: selected.revisionToken, presentationExpectedHash: selected.card.revisionToken, writeMarkdown: true, writePresentation: false, title: draft.title.trim(), status: selected.status, tags: draft.tags.split(/[、,]/u).map((value) => value.trim()).filter(Boolean), aliases: selected.aliases, body: draft.body, subtype: selected.subtype, typedProperties: selected.typedProperties, profile: selected.profile, card: selected.card, token })).then(async (result) => { if (result.conflict || !result.object) throw new Error("资料已被其他修改更新，请重新打开后再试。"); setSelected(result.object); setDraft({ title: result.object.title, body: result.object.body, tags: result.object.tags.join("、") }); await refresh(); setMessage("资料已保存；旧引用继续指向旧版本，新选择会读取此版本。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "资料保存失败，编辑内容仍保留。")).finally(() => setBusy(false)); };
  const addLink = () => {
    const target = linkable.find((item) => item.id === linkTargetId);
    if (!target) return;
    const link = `[[${target.title}]]`;
    setDraft((current) => current.body.includes(link) ? current : { ...current, body: `${current.body.trimEnd()}${current.body.trim() ? "\n\n" : ""}关联对象：${link}\n` });
    setMessage(`已插入到正文：${link}。保存后会由既有链接解析建立来源往返。`);
  };
  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  return <main className="shell-workspace" aria-label="资料工作区"><section className="character-workspace"><header className="character-workspace-header"><div className="character-workspace-identity"><BookOpen aria-hidden="true" /><div><p>当前作品 · 世界资料</p><h1>资料工作区</h1><span>编写设定，连接地点、组织与人物</span></div></div><div>{materialReturn ? <button type="button" onClick={() => window.location.assign(materialReturn)}><ArrowLeft aria-hidden="true" />返回来源</button> : null}<button type="button" onClick={() => { setCreating(true); setSelected(null); setDraft({ title: "", body: "", tags: "" }); setLinkTargetId(""); }}><Plus aria-hidden="true" />新建资料</button></div></header><div className="character-workspace-grid"><aside className="character-workspace-sidebar"><label>搜索资料<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、标签或别名" /></label><label>类型<select value={type} onChange={(event) => setType(event.target.value as WorldObjectType | "all")}><option value="all">全部内容</option>{editableTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><div className="character-workspace-list">{filtered.map((item) => <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => open(item)}><strong>{item.title}</strong><span>{typeLabel(item.type)}</span></button>)}</div></aside><section className="character-workspace-main"><p role="status">{message}</p>{selected || creating ? <><label>资料类型<select value={type === "all" ? selected?.type ?? "rule" : type} disabled={Boolean(selected)} onChange={(event) => setType(event.target.value as WorldObjectType)}>{editableTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><label>标题<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>正文<textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} rows={16} placeholder="例如：雾港实行夜间宵禁……" /></label><label>标签<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="规则、雾港、守卫组织" /></label>{selected ? <><section aria-label="资料关联"><h2>关联与来源</h2><p>已关联：{selected.linkedObjects.length ? selected.linkedObjects.map((item) => <button type="button" key={item.id} onClick={() => open(item)}>{item.title}</button>) : "尚未建立"}</p>{selected.backlinks.length ? <p>反向引用：{selected.backlinks.map((item) => <button type="button" key={item.id} onClick={() => open(item)}>{item.title}</button>)}</p> : null}<label>插入关联<select value={linkTargetId} onChange={(event) => setLinkTargetId(event.target.value)}><option value="">选择地点、组织、人物或规则</option>{linkable.map((item) => <option key={item.id} value={item.id}>{typeLabel(item.type)} · {item.title}</option>)}</select></label><button type="button" onClick={addLink} disabled={!linkTargetId}><Link2 aria-hidden="true" />插入到正文</button></section><section aria-label="资料版本"><h2>可核对版本</h2><p>当前修订 <code>{selected.revisionToken}</code>。天意只会发送作者明确选择并在发送时重新校验的版本。</p></section><div><button type="button" onClick={save} disabled={busy || !draft.title.trim()}><Save aria-hidden="true" />保存资料</button>{selected.type === "location" ? <button type="button" onClick={() => window.location.assign(`/world?worldView=map&mapPlace=${encodeURIComponent(selected.id)}`)}><MapPin aria-hidden="true" />在地图打开</button> : null}<button type="button" onClick={() => window.location.assign(`/world?worldView=relations&relationCenter=${encodeURIComponent(selected.id)}&relationReturn=${encodeURIComponent(`/library?materialId=${selected.id}`)}`)}><UsersRound aria-hidden="true" />查看关系</button><button type="button" onClick={() => window.location.assign(`/tianyi?tianyiLane=work&materialRef=${encodeURIComponent(selected.id)}`)}><Sparkles aria-hidden="true" />在天意明确引用</button></div></> : <button type="button" onClick={create} disabled={busy || !draft.title.trim()}><Save aria-hidden="true" />建立资料</button>}</> : <p>选择一项资料开始阅读和编辑，或新建第一条世界设定。</p>}</section></div></section></main>;
}

function safeReturn(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}
