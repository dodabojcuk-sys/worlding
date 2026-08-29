import { Archive, ArrowLeft, CheckSquare, ChevronDown, Filter, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import { getBrowserPreferenceStorage, readObjectDirectoryDensity, saveObjectDirectoryDensity, type ObjectDirectoryDensity } from "../../../lib/controlCenterPreferences";
import { useI18n } from "../../i18n/I18nProvider";
import { useCharacterDirectory, type CharacterDirectoryRecord } from "./useCharacterDirectory";
import { CharacterCreateDialog, characterRoleLabel } from "./CharacterCreateDialog";

type View = "active" | "archived" | "trash";
type Sort = "default" | "alphabetical" | "frequency" | "first-appearance" | "recent";
type CategoryFilter = "all" | "classified" | "unclassified";
type RoleFilter = "all" | "main" | "supporting" | "minor";

export type CharacterDirectoryScopedSearchRequest = {
  source: "character-directory";
  scope: { projectId: string | null; workVersionId: string | null; objectTypes: ["character"] };
};

export function CharacterDirectoryPanel(props: {
  runtime: TianyanShellRuntimeState;
  selectedId: string | null;
  onBack(): void;
  onSelect(objectId: string): void;
  onRequestScopedSearch(request: CharacterDirectoryScopedSearchRequest): void;
}) {
  const { t } = useI18n();
  const directory = useCharacterDirectory(props.runtime);
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState<Sort>("default");
  const [grouped, setGrouped] = useState(false);
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState(() => new Set<string>());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [density, setDensity] = useState<ObjectDirectoryDensity>(() => readObjectDirectoryDensity(getBrowserPreferenceStorage(), "local-user", "character"));

  useEffect(() => {
    if (!filterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFilterOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [filterOpen]);

  const visible = useMemo(() => {
    const filtered = directory.records
      .filter((record) => view === "trash" ? Boolean(record.trashedAt) : !record.trashedAt && (view === "archived" ? record.object.status === "archived" : record.object.status !== "archived"))
      .filter((record) => !tagFilter || record.object.tags.includes(tagFilter))
      .filter((record) => categoryFilter === "all" || (categoryFilter === "classified" ? Boolean(record.categoryId) : !record.categoryId))
      .filter((record) => roleFilter === "all" || normalizedRole(record.object.subtype) === roleFilter);
    return [...filtered].sort((left, right) => compareCharacter(left, right, sort));
  }, [categoryFilter, directory.records, roleFilter, sort, tagFilter, view]);
  const tags = useMemo(() => [...new Set(directory.records.flatMap((record) => record.object.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [directory.records]);
  const groups = useMemo<Array<[string, CharacterDirectoryRecord[]]>>(() => {
    if (!grouped) return [["", visible]];
    const result = new Map<string, CharacterDirectoryRecord[]>();
    for (const record of visible) {
      const key = characterRoleLabel(record.object.subtype, t);
      result.set(key, [...(result.get(key) ?? []), record]);
    }
    return [...result.entries()];
  }, [grouped, t, visible]);
  const selectedVisible = Boolean(props.selectedId && visible.some((record) => record.object.id === props.selectedId));
  const activeFilterCount = Number(view !== "active") + Number(tagFilter !== "") + Number(categoryFilter !== "all") + Number(roleFilter !== "all");
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await action(); setSelected(new Set()); }
    catch (error) { setActionError(error instanceof Error ? error.message : t("character.actionFailed")); }
    finally { setBusy(false); }
  };
  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const leaveMulti = () => { setMulti(false); setSelected(new Set()); };
  const clearFilters = () => { setView("active"); setTagFilter(""); setCategoryFilter("all"); setRoleFilter("all"); };
  const showCreated = (objectId: string) => {
    const filtersWereCleared = activeFilterCount > 0;
    if (filtersWereCleared) { clearFilters(); setCreationNotice(t("character.filtersCleared")); }
    props.onSelect(objectId);
  };
  const requestScopedSearch = () => props.onRequestScopedSearch({
    source: "character-directory",
    scope: { projectId: props.runtime.project?.id ?? null, workVersionId: props.runtime.workVersionId ?? null, objectTypes: ["character"] }
  });

  return <><aside className="character-directory-panel" aria-label={t("character.directory")} data-density={density} data-testid="character-directory">
    <header>
      <button type="button" onClick={props.onBack} aria-label={t("character.back")}><ArrowLeft aria-hidden="true" /></button>
      <div className="character-directory-heading"><p>{t("character.directory")}</p><h2>{t("directory.characters")}</h2><span aria-label={t("character.count").replace("{count}", String(visible.length))}>{visible.length}</span></div>
      <div className="character-directory-header-actions">
        <button type="button" onClick={() => { if (multi) leaveMulti(); else setMulti(true); }} aria-pressed={multi}><CheckSquare aria-hidden="true" />{multi ? t("character.done") : t("character.multi")}</button>
        <button type="button" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />{t("character.new")}</button>
      </div>
    </header>
    <div className="character-directory-toolbar" role="toolbar" aria-label={t("character.controls")}>
      <button type="button" className="character-directory-search-trigger" onClick={requestScopedSearch}><Search aria-hidden="true" />{t("character.searchTrigger")}</button>
      <div className="character-directory-filter-anchor">
        <button type="button" className="character-directory-filter-trigger" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-controls="character-directory-filter-popover"><Filter aria-hidden="true" />{t("character.filter")}{activeFilterCount > 0 && <span>{activeFilterCount}</span>}<ChevronDown aria-hidden="true" /></button>
        {filterOpen && <section id="character-directory-filter-popover" className="character-directory-filter-popover" aria-label={t("character.controls")} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setFilterOpen(false); } }}>
          <label><span>{t("character.view")}</span><select aria-label={t("character.view")} value={view} onChange={(event) => setView(event.target.value as View)}><option value="active">{t("character.active")}</option><option value="archived">{t("character.archive")}</option><option value="trash">{t("character.trash")}</option></select></label>
          <label><span>{t("character.filterCategory")}</span><select aria-label={t("character.filterCategory")} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}><option value="all">{t("character.allCategories")}</option><option value="classified">{t("character.classified")}</option><option value="unclassified">{t("character.uncategorized")}</option></select></label>
          <label><span>{t("character.filterRole")}</span><select aria-label={t("character.filterRole")} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}><option value="all">{t("character.allRoles")}</option><option value="main">{t("character.role.main")}</option><option value="supporting">{t("character.role.supporting")}</option><option value="minor">{t("character.role.minor")}</option></select></label>
          <label><span>{t("character.filterTag")}</span><select aria-label={t("character.filterTag")} value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">{t("character.allTags")}</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
          <label><span>{t("character.sort")}</span><select aria-label={t("character.sort")} value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="default">{t("character.sortDefault")}</option><option value="alphabetical">{t("character.sortAlphabetical")}</option><option value="frequency">{t("character.sortFrequency")}</option><option value="first-appearance" disabled>{t("character.sortFirstUnavailable")}</option><option value="recent">{t("character.sortRecent")}</option></select></label>
          <label className="character-directory-filter-toggle"><span>{t("character.group")}</span><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />{t("character.groupByRole")}</label>
          <label className="character-directory-filter-toggle"><span>{t("character.density")}</span><input type="checkbox" checked={density === "standard"} onChange={() => { const next = density === "standard" ? "compact" : "standard"; setDensity(saveObjectDirectoryDensity(getBrowserPreferenceStorage(), "local-user", "character", next)); }} />{density === "standard" ? t("character.standard") : t("character.compact")}</label>
        </section>}
      </div>
    </div>
    {activeFilterCount > 0 && <div className="character-directory-filter-chips" aria-label={t("character.activeFilters")}>
      {view !== "active" && <FilterChip label={view === "archived" ? t("character.archive") : t("character.trash")} onClear={() => setView("active")} />}
      {categoryFilter !== "all" && <FilterChip label={categoryFilter === "classified" ? t("character.classified") : t("character.uncategorized")} onClear={() => setCategoryFilter("all")} />}
      {roleFilter !== "all" && <FilterChip label={characterRoleLabel(roleFilter, t)} onClear={() => setRoleFilter("all")} />}
      {tagFilter && <FilterChip label={tagFilter} onClear={() => setTagFilter("")} />}
      <button type="button" className="character-directory-clear-filters" onClick={clearFilters}>{t("character.clearFilters")}</button>
    </div>}
    {(actionError || creationNotice) && <p className="character-directory-error" role="status">{actionError ? `${t("character.actionFailed")}: ${actionError}` : creationNotice}</p>}
    <div className="character-directory-list" role="listbox" aria-multiselectable={multi || undefined} tabIndex={0} onKeyDown={(event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = Math.max(0, visible.findIndex((record) => record.object.id === props.selectedId));
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next && !multi) props.onSelect(next.object.id);
    }}>
      {directory.loading && <p>{t("common.loading")}</p>}{directory.error && <p role="alert">{directory.error}</p>}{!directory.loading && visible.length === 0 && <p>{t("directory.empty")}</p>}
      {groups.map(([label, records]) => <section key={label || "all"}>{grouped && <h3><span>{label}</span><small>{records.length}</small></h3>}{records.map((record) => <button type="button" role="option" aria-selected={multi ? selected.has(record.object.id) : props.selectedId === record.object.id} key={record.object.id} data-current={props.selectedId === record.object.id || undefined} onClick={() => multi ? toggleSelected(record.object.id) : props.onSelect(record.object.id)}>
        {multi && <input type="checkbox" tabIndex={-1} readOnly checked={selected.has(record.object.id)} aria-label={record.object.title} />}
        {density === "standard" && <span className="character-row-avatar">{record.object.card.portrait ? <img src={record.object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</span>}
        <span className="character-row-copy"><strong>{record.object.title}</strong><span><em>{characterRoleLabel(record.object.subtype, t)}</em><small>{characterSubtitle(record, t)}</small></span></span>{record.object.status === "archived" && <i>{t("character.archived")}</i>}
      </button>)}</section>)}
    </div>
    {multi ? <footer className="character-selection-bar"><strong>{t("character.selectedCount").replace("{count}", String(selected.size))}</strong><button disabled={!selected.size || busy} onClick={() => { const category = window.prompt(t("character.categoryPrompt")); if (category !== null) void run(() => directory.setCategory([...selected], category || null)); }}>{t("character.category")}</button><button disabled={!selected.size || busy} onClick={() => { const tag = window.prompt(t("character.tagPrompt")); if (tag?.trim()) void run(() => directory.addTags([...selected], [tag.trim()])); }}>{t("character.tag")}</button><button disabled={!selected.size || busy} onClick={() => void run(() => directory.archive([...selected]))}>{t("character.archive")}</button><button disabled={!selected.size || busy} onClick={() => void run(() => directory.trash([...selected]))}>{t("character.moveTrash")}</button></footer> : <footer><button type="button" onClick={() => setView("archived")}><Archive aria-hidden="true" />{t("character.archive")}</button><button type="button" onClick={() => setView("trash")}><Trash2 aria-hidden="true" />{t("character.trash")}</button>{view === "trash" && selectedVisible && props.selectedId && <button type="button" onClick={() => void run(() => directory.restoreTrash(props.selectedId!))}>{t("character.restore")}</button>}{view === "archived" && selectedVisible && props.selectedId && <button type="button" onClick={() => void run(() => directory.unarchive([props.selectedId!]))}>{t("character.restore")}</button>}</footer>}
  </aside>{createOpen && <CharacterCreateDialog onClose={() => setCreateOpen(false)} onCreate={directory.create} onRetryCategory={directory.retryCategory} onCreated={(result) => showCreated(result.objectId)} />}</>;
}

function FilterChip(props: { label: string; onClear(): void }) {
  return <button type="button" onClick={props.onClear}>{props.label}<X aria-hidden="true" /></button>;
}

function normalizedRole(value: string): RoleFilter {
  if (value === "main" || value === "主要角色") return "main";
  if (value === "supporting" || value === "配角") return "supporting";
  if (value === "minor" || value === "次要角色") return "minor";
  return "all";
}

function characterSubtitle(record: CharacterDirectoryRecord, t: ReturnType<typeof useI18n>["t"]) {
  return record.object.aliases[0] || summaryFromBody(record.object.body) || (record.object.status === "archived" ? t("character.archived") : t("character.noAuxiliary"));
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
  return left.object.id.localeCompare(right.object.id);
}
