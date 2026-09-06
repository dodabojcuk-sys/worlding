import { Archive, ArrowLeft, CheckSquare, ChevronDown, Filter, GripVertical, ListFilter, Plus, Search, SlidersHorizontal, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CHARACTER_OBSERVATION_MIME, createCharacterObservationDragPayload } from "../../../../../../src/storyContracts/characterObservationSelection.ts";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import type { DirectoryWorkspaceState } from "../directoryWorkspaceState";
import { getBrowserPreferenceStorage, readObjectDirectoryDensity, readObjectDirectorySort, saveObjectDirectoryDensity, saveObjectDirectorySort, type ObjectDirectoryDensity } from "../../../lib/controlCenterPreferences";
import { useI18n } from "../../i18n/I18nProvider";
import { CharacterCreateDialog, characterRoleLabel } from "./CharacterCreateDialog";
import { compareDirectoryCharacters, getCharacterDirectorySummary, type CharacterDirectorySort } from "./characterDirectoryPresentation";
import { useCharacterDirectory, type CharacterDirectoryRecord } from "./useCharacterDirectory";

type View = "active" | "archived" | "trash";

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
  directoryState: DirectoryWorkspaceState;
  onDirectoryState(state: DirectoryWorkspaceState): void;
}) {
  const { t } = useI18n();
  const directory = useCharacterDirectory(props.runtime);
  const preferenceStorage = getBrowserPreferenceStorage();
  const [view, setView] = useState<View>(props.directoryState.character.view);
  const [sort, setSort] = useState<CharacterDirectorySort>(() => readObjectDirectorySort(preferenceStorage, "local-user", "character"));
  const [multi, setMulti] = useState(props.directoryState.character.multi);
  const [selected, setSelected] = useState(() => new Set(props.directoryState.character.selectedIds));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState(props.directoryState.character.tagFilter);
  const [categoryFilter, setCategoryFilter] = useState(props.directoryState.character.categoryFilter);
  const [roleFilter, setRoleFilter] = useState(props.directoryState.character.roleFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false);
  const [density, setDensity] = useState<ObjectDirectoryDensity>(() => readObjectDirectoryDensity(preferenceStorage, "local-user", "character"));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    props.onDirectoryState({
      ...props.directoryState,
      path: ["characters"],
      selectedObjectId: props.selectedId ?? props.directoryState.selectedObjectId,
      character: { view, tagFilter, categoryFilter, roleFilter, multi, selectedIds: [...selected], scrollTop: listRef.current?.scrollTop ?? props.directoryState.character.scrollTop }
    });
  }, [categoryFilter, multi, props.selectedId, roleFilter, selected, tagFilter, view]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = props.directoryState.character.scrollTop;
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFilterOpen(false); setSortOpen(false); setViewOpen(false); setBatchCategoryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const roleLevels = useMemo(() => [...new Set(directory.records.map((record) => record.object.subtype).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN")), [directory.records]);
  const tags = useMemo(() => [...new Set(directory.records.flatMap((record) => record.object.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [directory.records]);
  const visible = useMemo(() => directory.records
    .filter((record) => view === "trash" ? Boolean(record.trashedAt) : !record.trashedAt && (view === "archived" ? record.object.status === "archived" : record.object.status !== "archived"))
    .filter((record) => !tagFilter || record.object.tags.includes(tagFilter))
    .filter((record) => categoryFilter === "all" || record.categoryId === categoryFilter)
    .filter((record) => roleFilter === "all" || record.object.subtype === roleFilter)
    .sort((left, right) => compareDirectoryCharacters(left, right, sort)), [categoryFilter, directory.records, roleFilter, sort, tagFilter, view]);
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
  const leaveMulti = () => { setMulti(false); setSelected(new Set()); setBatchCategoryOpen(false); };
  const clearFilters = () => { setView("active"); setTagFilter(""); setCategoryFilter("all"); setRoleFilter("all"); };
  const showCreated = (objectId: string) => {
    if (activeFilterCount > 0) { clearFilters(); setCreationNotice(t("character.filtersCleared")); }
    props.onSelect(objectId);
  };
  const requestScopedSearch = () => props.onRequestScopedSearch({
    source: "character-directory",
    scope: { projectId: props.runtime.project?.id ?? null, workVersionId: props.runtime.project ? props.runtime.workVersionId ?? "work-version.unversioned" : null, objectTypes: ["character"] }
  });
  const selectSort = (next: CharacterDirectorySort) => { setSort(saveObjectDirectorySort(preferenceStorage, "local-user", "character", next)); setSortOpen(false); };
  const selectDensity = (next: ObjectDirectoryDensity) => { setDensity(saveObjectDirectoryDensity(preferenceStorage, "local-user", "character", next)); setViewOpen(false); };
  const beginObservationDrag = (event: DragEvent<HTMLButtonElement>, record: CharacterDirectoryRecord) => {
    const projectId = props.runtime.project?.id;
    if (!projectId) { event.preventDefault(); return; }
    const ids = multi && selected.has(record.object.id) ? selected : new Set([record.object.id]);
    const references = visible.filter((item) => ids.has(item.object.id)).map((item) => ({
      objectId: item.object.id,
      version: item.object.revisionToken,
      sourceId: null,
      projectId,
      workVersionId: props.runtime.workVersionId ?? null,
      objectType: "character"
    }));
    const payload = createCharacterObservationDragPayload({ projectId, workVersionId: props.runtime.workVersionId ?? null, references });
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CHARACTER_OBSERVATION_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", references.map((reference) => reference.objectId).join(","));
  };

  return <><aside className="character-directory-panel" aria-label={t("character.directory")} data-density={density} data-testid="character-directory">
    <header>
      <button type="button" onClick={props.onBack} aria-label={t("character.back")}><ArrowLeft aria-hidden="true" /></button>
      <div className="character-directory-heading"><p>{t("character.directory")}</p><h2>{t("directory.characters")}</h2><span aria-label={t("character.count").replace("{count}", String(visible.length))}>{visible.length}</span></div>
      <div className="character-directory-header-actions">
        <button type="button" className="character-ghost-action" onClick={() => { if (multi) leaveMulti(); else setMulti(true); }} aria-pressed={multi}><CheckSquare aria-hidden="true" />{multi ? t("character.done") : t("character.multi")}</button>
        <button type="button" className="character-new-action" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />{t("character.new")}</button>
      </div>
    </header>
    <div className="character-directory-toolbar" role="toolbar" aria-label={t("character.controls")}>
      <button type="button" className="character-directory-search-trigger" onClick={requestScopedSearch}><Search aria-hidden="true" />{t("character.searchTrigger")}</button>
      <ToolbarMenu open={filterOpen} onOpenChange={setFilterOpen} trigger={<><Filter aria-hidden="true" />{t("character.filter")}{activeFilterCount > 0 && <span>{activeFilterCount}</span>}<ChevronDown aria-hidden="true" /></>} label={t("character.filter")} className="character-directory-filter-popover">
        <label><span>{t("character.view")}</span><select aria-label={t("character.view")} value={view} onChange={(event) => setView(event.target.value as View)}><option value="active">{t("character.active")}</option><option value="archived">{t("character.archive")}</option><option value="trash">{t("character.trash")}</option></select></label>
        <label><span>{t("character.filterCategory")}</span><select aria-label={t("character.filterCategory")} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">{t("character.allCategories")}</option>{directory.categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>
        <label><span>{t("character.filterRole")}</span><select aria-label={t("character.filterRole")} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">{t("character.allRoles")}</option>{roleLevels.map((level) => <option key={level} value={level}>{characterRoleLabel(level, t)}</option>)}</select></label>
        <label><span>{t("character.filterTag")}</span><select aria-label={t("character.filterTag")} value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">{t("character.allTags")}</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
      </ToolbarMenu>
      <ToolbarMenu open={sortOpen} onOpenChange={setSortOpen} trigger={<><SlidersHorizontal aria-hidden="true" />{sortLabel(sort, t)}<ChevronDown aria-hidden="true" /></>} label={t("character.sort")} className="character-directory-sort-popover">
        <SortOption value="manual" current={sort} label={t("character.sortManual")} onSelect={selectSort} />
        <SortOption value="name-asc" current={sort} label={t("character.sortNameAsc")} onSelect={selectSort} />
        <SortOption value="name-desc" current={sort} label={t("character.sortNameDesc")} onSelect={selectSort} />
        <SortOption value="recent" current={sort} label={t("character.sortRecent")} onSelect={selectSort} />
        <SortOption value="appearance-asc" current={sort} label={t("character.sortAppearanceAsc")} onSelect={selectSort} />
        <SortOption value="appearance-desc" current={sort} label={t("character.sortAppearanceDesc")} onSelect={selectSort} />
        <SortOption value="role-level" current={sort} label={t("character.sortRole")} onSelect={selectSort} />
        <p>{t("character.sortFirstUnavailable")}</p>
      </ToolbarMenu>
      <ToolbarMenu open={viewOpen} onOpenChange={setViewOpen} trigger={<><ListFilter aria-hidden="true" />{density === "compact" ? t("character.compact") : t("character.standard")}<ChevronDown aria-hidden="true" /></>} label={t("character.density")} className="character-directory-view-popover">
        <button type="button" role="menuitemradio" aria-checked={density === "compact"} onClick={() => selectDensity("compact")}>{t("character.compact")}</button>
        <button type="button" role="menuitemradio" aria-checked={density === "standard"} onClick={() => selectDensity("standard")}>{t("character.standard")}</button>
      </ToolbarMenu>
    </div>
    {activeFilterCount > 0 && <div className="character-directory-filter-chips" aria-label={t("character.activeFilters")}>
      {view !== "active" && <FilterChip label={view === "archived" ? t("character.archive") : t("character.trash")} onClear={() => setView("active")} />}
      {categoryFilter !== "all" && <FilterChip label={directory.categories.find((category) => category.id === categoryFilter)?.title || t("character.unknownCategory")} onClear={() => setCategoryFilter("all")} />}
      {roleFilter !== "all" && <FilterChip label={characterRoleLabel(roleFilter, t)} onClear={() => setRoleFilter("all")} />}
      {tagFilter && <FilterChip label={tagFilter} onClear={() => setTagFilter("")} />}
      <button type="button" className="character-directory-clear-filters" onClick={clearFilters}>{t("character.clearFilters")}</button>
    </div>}
    {(actionError || creationNotice) && <p className="character-directory-error" role="status">{actionError ? `${t("character.actionFailed")}: ${actionError}` : creationNotice}</p>}
    <div ref={listRef} className="character-directory-list" role="listbox" aria-multiselectable={multi || undefined} tabIndex={0} onScroll={(event) => props.onDirectoryState({ ...props.directoryState, path: ["characters"], character: { ...props.directoryState.character, view, tagFilter, categoryFilter, roleFilter, multi, selectedIds: [...selected], scrollTop: event.currentTarget.scrollTop } })} onKeyDown={(event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = Math.max(0, visible.findIndex((record) => record.object.id === props.selectedId));
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next && !multi) props.onSelect(next.object.id);
    }}>
      {directory.loading && <p>{t("common.loading")}</p>}{directory.error && <p role="alert">{directory.error}</p>}{!directory.loading && visible.length === 0 && <p>{t("directory.empty")}</p>}
      {visible.map((record) => <CharacterRow key={record.object.id} record={record} density={density} multi={multi} selected={selected.has(record.object.id)} current={props.selectedId === record.object.id} onDragStart={(event) => beginObservationDrag(event, record)} onSelect={() => multi ? toggleSelected(record.object.id) : props.onSelect(record.object.id)} />)}
    </div>
    {multi ? <footer className="character-selection-bar"><strong>{t("character.selectedCount").replace("{count}", String(selected.size))}</strong><div className="character-batch-category"><button type="button" disabled={!selected.size || busy} onClick={() => setBatchCategoryOpen((open) => !open)}>{t("character.category")}</button>{batchCategoryOpen && <select aria-label={t("character.category")} defaultValue="" onChange={(event) => { if (event.target.value) void run(() => directory.setCategory([...selected], event.target.value)); }}><option value="">{t("character.chooseCategory")}</option>{directory.categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select>}</div><button disabled={!selected.size || busy} onClick={() => { const tag = window.prompt(t("character.tagPrompt")); if (tag?.trim()) void run(() => directory.addTags([...selected], [tag.trim()])); }}>{t("character.tag")}</button><button disabled={!selected.size || busy} onClick={() => void run(() => directory.archive([...selected]))}>{t("character.archive")}</button><button disabled={!selected.size || busy} onClick={() => void run(() => directory.trash([...selected]))}>{t("character.moveTrash")}</button></footer> : <footer><button type="button" onClick={() => setView("archived")}><Archive aria-hidden="true" />{t("character.archive")}</button><button type="button" onClick={() => setView("trash")}><Trash2 aria-hidden="true" />{t("character.trash")}</button>{view === "trash" && selectedVisible && props.selectedId && <button type="button" onClick={() => void run(() => directory.restoreTrash(props.selectedId!))}>{t("character.restore")}</button>}{view === "archived" && selectedVisible && props.selectedId && <button type="button" onClick={() => void run(() => directory.unarchive([props.selectedId!]))}>{t("character.restore")}</button>}</footer>}
  </aside>{createOpen && <CharacterCreateDialog categories={directory.categories} roleLevels={roleLevels} onClose={() => setCreateOpen(false)} onCreate={directory.create} onCreateCategory={directory.createCategory} onRetryCategory={directory.retryCategory} onCreated={(result) => showCreated(result.objectId)} />}</>;
}

function ToolbarMenu(props: { open: boolean; onOpenChange(value: boolean): void; trigger: ReactNode; label: string; className: string; children: ReactNode }) {
  return <div className="character-directory-menu-anchor"><button type="button" className="character-directory-menu-trigger" aria-label={props.label} aria-expanded={props.open} onClick={() => props.onOpenChange(!props.open)}>{props.trigger}</button>{props.open && <section className={props.className} role="menu" aria-label={props.label}>{props.children}</section>}</div>;
}

function SortOption(props: { value: CharacterDirectorySort; current: CharacterDirectorySort; label: string; onSelect(value: CharacterDirectorySort): void }) {
  return <button type="button" role="menuitemradio" aria-checked={props.value === props.current} onClick={() => props.onSelect(props.value)}>{props.label}</button>;
}

function CharacterRow(props: { record: CharacterDirectoryRecord; density: ObjectDirectoryDensity; multi: boolean; selected: boolean; current: boolean; onDragStart(event: DragEvent<HTMLButtonElement>): void; onSelect(): void }) {
  const { t } = useI18n(); const { record } = props;
  const summary = getCharacterDirectorySummary(record.object, t("character.noAuxiliary"));
  return <button type="button" role="option" aria-selected={props.multi ? props.selected : props.current} aria-label={`${record.object.title}；可拖入角色观察`} data-current={props.current || undefined} draggable onDragStart={props.onDragStart} onClick={props.onSelect}>
    <GripVertical className="character-row-drag-handle" aria-hidden="true" />
    {props.multi && <input type="checkbox" tabIndex={-1} readOnly checked={props.selected} aria-label={record.object.title} />}
    {props.density === "standard" && <span className="character-row-avatar">{record.object.card.portrait ? <img src={record.object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</span>}
    <span className="character-row-copy"><strong>{record.object.title}</strong><span><em>{characterRoleLabel(record.object.subtype, t)}</em>{record.object.status === "archived" && <i>{t("character.archived")}</i>}</span>{props.density === "standard" && <small>{summary}</small>}{props.density === "standard" && (record.categoryName || record.object.tags[0]) && <small className="character-row-meta">{record.categoryName || record.object.tags[0]}</small>}</span>
  </button>;
}

function FilterChip(props: { label: string; onClear(): void }) { return <button type="button" onClick={props.onClear}>{props.label}<X aria-hidden="true" /></button>; }

function sortLabel(value: CharacterDirectorySort, t: ReturnType<typeof useI18n>["t"]) {
  return value === "name-asc" ? t("character.sortNameAsc") : value === "name-desc" ? t("character.sortNameDesc") : value === "recent" ? t("character.sortRecent") : value === "appearance-asc" ? t("character.sortAppearanceAsc") : value === "appearance-desc" ? t("character.sortAppearanceDesc") : value === "role-level" ? t("character.sortRole") : t("character.sortManual");
}
