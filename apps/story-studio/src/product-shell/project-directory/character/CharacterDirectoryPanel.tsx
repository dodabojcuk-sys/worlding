import { Archive, ArrowLeft, CheckSquare, Filter, Plus, Search, Trash2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import { getBrowserPreferenceStorage, readObjectDirectoryDensity, saveObjectDirectoryDensity, type ObjectDirectoryDensity } from "../../../lib/controlCenterPreferences";
import { useI18n } from "../../i18n/I18nProvider";
import { useCharacterDirectory, type CharacterDirectoryRecord } from "./useCharacterDirectory";
import { CharacterCreateDialog, characterRoleLabel } from "./CharacterCreateDialog";

type View = "active" | "archived" | "trash";
type Sort = "default" | "alphabetical" | "frequency" | "first-appearance" | "recent";
export function CharacterDirectoryPanel(props: { runtime: TianyanShellRuntimeState; selectedId: string | null; onBack(): void; onSelect(objectId: string): void }) {
  const { t } = useI18n(); const directory = useCharacterDirectory(props.runtime);
  const [query, setQuery] = useState(""); const [view, setView] = useState<View>("active"); const [sort, setSort] = useState<Sort>("default"); const [grouped, setGrouped] = useState(true); const [multi, setMulti] = useState(false); const [selected, setSelected] = useState(() => new Set<string>()); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState<string | null>(null); const [createOpen, setCreateOpen] = useState(false); const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [density, setDensity] = useState<ObjectDirectoryDensity>(() => readObjectDirectoryDensity(getBrowserPreferenceStorage(), "local-user", "character"));
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = directory.records.filter((record) => view === "trash" ? Boolean(record.trashedAt) : !record.trashedAt && (view === "archived" ? record.object.status === "archived" : record.object.status !== "archived")).filter((record) => !tagFilter || record.object.tags.includes(tagFilter)).filter((record) => !normalized || [record.object.title, ...record.object.aliases, ...record.object.tags, record.categoryId ?? "", record.object.id].join(" ").toLocaleLowerCase().includes(normalized));
    return [...filtered].sort((left, right) => compareCharacter(left, right, sort));
  }, [directory.records, query, sort, tagFilter, view]);
  const tags = useMemo(() => [...new Set(directory.records.flatMap((record) => record.object.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [directory.records]);
  const groups = useMemo<Array<[string, CharacterDirectoryRecord[]]>>(() => {
    if (!grouped) return [[t("character.all"), visible]];
    const result = new Map<string, CharacterDirectoryRecord[]>();
    for (const record of visible) { const key = record.categoryId || characterRoleLabel(record.object.subtype, t) || t("character.uncategorized"); result.set(key, [...(result.get(key) ?? []), record]); }
    return [...result.entries()];
  }, [grouped, t, visible]);
  const selectedVisible = Boolean(props.selectedId && visible.some((record) => record.object.id === props.selectedId));
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setActionError(null); try { await action(); setSelected(new Set()); } catch (error) { setActionError(error instanceof Error ? error.message : t("character.actionFailed")); } finally { setBusy(false); } };
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const leaveMulti = () => { setMulti(false); setSelected(new Set()); };
  const showCreated = (objectId: string) => {
    const filtersWereCleared = view !== "active" || Boolean(query.trim()) || Boolean(tagFilter);
    if (filtersWereCleared) { setView("active"); setQuery(""); setTagFilter(""); setCreationNotice(t("character.filtersCleared")); }
    props.onSelect(objectId);
  };
  return <><aside className="character-directory-panel" aria-label={t("character.directory")} data-density={density} data-testid="character-directory">
    <header><button type="button" onClick={props.onBack} aria-label={t("character.back")}><ArrowLeft aria-hidden="true" /></button><div className="character-directory-heading"><p>{t("character.directory")}</p><h2>{t("directory.characters")}</h2><span>{visible.length}</span></div><div className="character-directory-header-actions"><button type="button" onClick={() => { if (multi) leaveMulti(); else setMulti(true); }} aria-pressed={multi}><CheckSquare aria-hidden="true" />{multi ? t("character.done") : t("character.multi")}</button><button type="button" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />{t("character.new")}</button></div></header>
    <label className="character-directory-search"><Search aria-hidden="true" /><span className="shell-visually-hidden">{t("directory.search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("character.search")} /></label>
    <div className="character-directory-controls" role="toolbar" aria-label={t("character.controls")}><select aria-label={t("character.view")} value={view} onChange={(event) => setView(event.target.value as View)}><option value="active">{t("character.active")}</option><option value="archived">{t("character.archive")}</option><option value="trash">{t("character.trash")}</option></select><select aria-label={t("character.filterTag")} value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">{t("character.allTags")}</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select><button type="button" aria-pressed={grouped} onClick={() => setGrouped((value) => !value)}><Filter aria-hidden="true" />{t("character.group")}</button><select aria-label={t("character.sort")} value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="default">{t("character.sortDefault")}</option><option value="alphabetical">{t("character.sortAlphabetical")}</option><option value="frequency">{t("character.sortFrequency")}</option><option value="first-appearance" disabled>{t("character.sortFirstUnavailable")}</option><option value="recent">{t("character.sortRecent")}</option></select></div>
    {(actionError || creationNotice) && <p className="character-directory-error" role="status">{actionError ? `${t("character.actionFailed")}: ${actionError}` : creationNotice}</p>}
    <div className="character-directory-list" role="listbox" aria-multiselectable={multi || undefined} tabIndex={0} onKeyDown={(event) => { if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return; event.preventDefault(); const index = Math.max(0, visible.findIndex((record) => record.object.id === props.selectedId)); const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]; if (next && !multi) props.onSelect(next.object.id); }}>{directory.loading && <p>{t("common.loading")}</p>}{directory.error && <p role="alert">{directory.error}</p>}{!directory.loading && visible.length === 0 && <p>{t("directory.empty")}</p>}{groups.map(([label, records]) => <section key={label}><h3><span>{label}</span><small>{records.length}</small></h3>{records.map((record) => <button type="button" role="option" aria-selected={multi ? selected.has(record.object.id) : props.selectedId === record.object.id} key={record.object.id} data-current={props.selectedId === record.object.id || undefined} onClick={() => multi ? toggleSelected(record.object.id) : props.onSelect(record.object.id)}>{multi && <input type="checkbox" tabIndex={-1} readOnly checked={selected.has(record.object.id)} aria-label={record.object.title} />}{density === "standard" && <span className="character-row-avatar">{record.object.card.portrait ? <img src={record.object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</span>}<span className="character-row-copy"><strong>{record.object.title}</strong><span><em>{characterRoleLabel(record.object.subtype, t)}</em>{density === "standard" && <small>{characterSubtitle(record, t)}</small>}</span></span>{record.object.status === "archived" && <i>{t("character.archived")}</i>}</button>)}</section>)}</div>
    {multi ? <footer className="character-selection-bar"><strong>{t("character.selectedCount").replace("{count}", String(selected.size))}</strong><button disabled={!selected.size || busy} onClick={() => { const category = window.prompt(t("character.categoryPrompt")); if (category !== null) void run(() => directory.setCategory([...selected], category || null)); }}>{t("character.category")}</button><button disabled={!selected.size || busy} onClick={() => { const tag = window.prompt(t("character.tagPrompt")); if (tag?.trim()) void run(() => directory.addTags([...selected], [tag.trim()])); }}>{t("character.tag")}</button><button disabled={!selected.size || busy} onClick={() => void run(() => directory.archive([...selected]))}>{t("character.archive")}</button><button disabled={!selected.size || busy} onClick={() => void run(() => directory.trash([...selected]))}>{t("character.moveTrash")}</button></footer> : <footer><button type="button" onClick={() => setView("archived")}><Archive aria-hidden="true" />{t("character.archive")}</button><button type="button" onClick={() => setView("trash")}><Trash2 aria-hidden="true" />{t("character.trash")}</button><button type="button" onClick={() => { const next = density === "standard" ? "compact" : "standard"; setDensity(saveObjectDirectoryDensity(getBrowserPreferenceStorage(), "local-user", "character", next)); }}>{density === "standard" ? t("character.compact") : t("character.standard")}</button>{view === "trash" && selectedVisible && props.selectedId && <button type="button" onClick={() => void run(() => directory.restoreTrash(props.selectedId!))}>{t("character.restore")}</button>}{view === "archived" && selectedVisible && props.selectedId && <button type="button" onClick={() => void run(() => directory.unarchive([props.selectedId!]))}>{t("character.restore")}</button>}</footer>}
  </aside>{createOpen && <CharacterCreateDialog onClose={() => setCreateOpen(false)} onCreate={directory.create} onRetryCategory={directory.retryCategory} onCreated={(result) => showCreated(result.objectId)} />}</>;
}

function characterSubtitle(record: CharacterDirectoryRecord, t: ReturnType<typeof useI18n>["t"]) {
  return record.object.aliases[0] || record.categoryId || summaryFromBody(record.object.body) || t("character.noAuxiliary");
}

function summaryFromBody(body: string) {
  const match = body.match(/##\s+背景与出身\s*\n+([^#\n][\s\S]*?)(?:\n\s*##|$)/u);
  return match?.[1]?.trim().replace(/\s+/gu, " ") || "";
}

function compareCharacter(left: CharacterDirectoryRecord, right: CharacterDirectoryRecord, sort: Sort): number {
  const stable = () => left.object.title.localeCompare(right.object.title, "zh-CN", { numeric: true }) || left.object.id.localeCompare(right.object.id);
  if (sort === "frequency") return right.eventCount - left.eventCount || stable();
  if (sort === "recent") return (right.object.updatedAt || "").localeCompare(left.object.updatedAt || "") || stable();
  if (sort === "alphabetical") return stable();
  return (left.object.id.localeCompare(right.object.id));
}
