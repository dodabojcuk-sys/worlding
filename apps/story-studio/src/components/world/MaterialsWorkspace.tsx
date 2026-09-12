import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  BookOpen,
  Download,
  FolderPlus,
  FileText,
  FileUp,
  Link2,
  MapPin,
  Plus,
  Quote,
  Save,
  Sparkles,
  Upload,
  UsersRound,
} from "lucide-react";

import {
  createWorldObject,
  createWorkspaceFolder,
  createMaterialFileFolder,
  createMaterialNote,
  downloadMaterialFile,
  getDocumentRevisionHistory,
  getWorldLibrary,
  getVisualWorkbench,
  importVisualAsset,
  importSourceDocument,
  importMaterialFiles,
  listMaterialFiles,
  listSourceImportReviews,
  moveMaterialFiles,
  moveWorldObjectsToFolder,
  previewDocumentRevision,
  readMaterialFile,
  readMaterialOperationReceipt,
  readWorldObject,
  setMaterialFilesArchived,
  updateMaterialFile,
  updateMaterialFileFolder,
  updateWorkspaceFolders,
  updateVisualDocument,
  updateWorldObject,
  type MaterialFileList,
  type MaterialFileRecord,
  type MaterialFileType,
  type MaterialOperationReceipt,
  type MapBackground,
  type MapDocument,
  type WorldObject,
  type WorldObjectSummary,
  type WorldObjectType,
  type WorkspaceFolder,
  type WorkspacePlacement,
} from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { MaterialsSectionNavigation } from "./MaterialsSectionNavigation";

const editableTypes: Array<{ value: WorldObjectType; label: string }> = [
  { value: "rule", label: "世界设定" },
  { value: "location", label: "地点" },
  { value: "faction", label: "组织" },
  { value: "character", label: "人物" },
  { value: "item", label: "物品" },
];
const typeLabel = (type: WorldObjectType) =>
  editableTypes.find((entry) => entry.value === type)?.label ?? type;

type SourceDocument = Awaited<ReturnType<typeof listSourceImportReviews>>[number];
type MaterialStatusFilter = "all" | "draft" | "confirmed";
type MaterialSort = "recent" | "title";
type SourceSelection = { charStart: number; charEnd: number; lineStart: number; lineEnd: number; text: string };

type MaterialReadingProjection = {
  body: string;
  source: SourceDocument | null;
  sourceLocation: string | null;
  groupedMarkers: boolean;
};

/**
 * Build a reading-only view from links that are already resolved by the owners.
 * The stored body is never rewritten: older documents do not identify whether an
 * arbitrary paragraph was authored by a person or appended by the UI.
 */
function projectMaterialReading(
  body: string,
  linkedObjects: WorldObjectSummary[],
  sources: SourceDocument[],
): MaterialReadingProjection {
  let readable = body;
  let matchedSource: SourceDocument | null = null;
  let sourceLocation: string | null = null;
  let groupedMarkers = false;

  for (const source of sources) {
    const sourceObject = linkedObjects.find((item) => item.id === source.libraryObjectId);
    if (!sourceObject) continue;
    const prefix = `来源：[[${sourceObject.relativeId}|${source.title}]]\n来源位置：${source.title} · `;
    const prefixIndex = readable.indexOf(prefix);
    if (prefixIndex < 0) continue;
    const identityLine = `\n来源标识：${source.sourceDocumentId}`;
    const identityIndex = readable.indexOf(identityLine, prefixIndex + prefix.length);
    if (identityIndex < 0) continue;
    const locationAndRevision = readable.slice(prefixIndex + prefix.length, identityIndex);
    const revisionSuffix = ` · 修订 ${source.currentRevisionHash}`;
    if (!locationAndRevision.endsWith(revisionSuffix)) continue;
    sourceLocation = locationAndRevision.slice(0, -revisionSuffix.length);
    const blockEnd = identityIndex + identityLine.length;
    const blockStart = prefixIndex >= 2 && readable.slice(prefixIndex - 2, prefixIndex) === "\n\n"
      ? prefixIndex - 2
      : prefixIndex;
    readable = `${readable.slice(0, blockStart)}${readable.slice(blockEnd)}`;
    matchedSource = source;
    groupedMarkers = true;
    break;
  }

  for (const linked of linkedObjects) {
    const marker = `关联对象：[[${linked.relativeId}|${linked.title}]]`;
    if (!readable.includes(marker)) continue;
    readable = readable.split(marker).join("");
    groupedMarkers = true;
  }

  return {
    body: readable.trim(),
    source: matchedSource,
    sourceLocation,
    groupedMarkers,
  };
}

/** Author materials use the existing World Object writer; no parallel library is created here. */
export function MaterialsWorkspace(props: {
  runtime: TianyanShellRuntimeState;
}) {
  const projectId = props.runtime.project?.id ?? null;
  const requestedMaterialId = new URLSearchParams(window.location.search).get(
    "materialId",
  );
  const requestedRevision = new URLSearchParams(window.location.search).get(
    "materialRevision",
  );
  const requestedSourceId = new URLSearchParams(window.location.search).get("sourceDocumentId")
    ?? new URLSearchParams(window.location.search).get("directorySource");
  const materialReturn = safeReturn(
    new URLSearchParams(window.location.search).get("materialReturn"),
  );
  const [items, setItems] = useState<WorldObjectSummary[]>([]);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [selected, setSelected] = useState<WorldObject | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceDocument | null>(null);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("materialQuery") ?? "");
  const [type, setType] = useState<WorldObjectType | "source" | "all">(() => (new URLSearchParams(window.location.search).get("materialType") as WorldObjectType | "source" | "all" | null) ?? "all");
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>(() => (new URLSearchParams(window.location.search).get("materialStatus") as MaterialStatusFilter | null) ?? "all");
  const [sort, setSort] = useState<MaterialSort>(() => (new URLSearchParams(window.location.search).get("materialSort") as MaterialSort | null) ?? "recent");
  const [draft, setDraft] = useState({ title: "", body: "", tags: "" });
  const [statusDraft, setStatusDraft] = useState("draft");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sourceDraft, setSourceDraft] = useState({ title: "", filename: "", content: "" });
  const [sourceSelection, setSourceSelection] = useState<SourceSelection | null>(null);
  const [historicalPreview, setHistoricalPreview] = useState<{ body: string; revisionId: string } | null>(null);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileMode, setFileMode] = useState(() => new URLSearchParams(window.location.search).get("materialMode") === "files");
  const [categories, setCategories] = useState<WorkspaceFolder[]>([]);
  const [placements, setPlacements] = useState<WorkspacePlacement[]>([]);
  const [folderRevision, setFolderRevision] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("materialCategory"));
  const fileInput = useRef<HTMLInputElement | null>(null);
  const internalRouteChange = useRef(false);
  const writeInternalRoute = (input: Parameters<typeof writeMaterialRoute>[0]) => { internalRouteChange.current = true; writeMaterialRoute(input); };
  const sourceLibraryObjectIds = useMemo(() => new Set(sources.map((source) => source.libraryObjectId).filter(Boolean)), [sources]);
  const filtered = useMemo(() => items
      .filter(
        (item) =>
          !sourceLibraryObjectIds.has(item.id) &&
          (type === "all" || item.type === type) &&
          (statusFilter === "all" || (statusFilter === "draft" ? item.status === "draft" : item.status !== "draft")) &&
          (!categoryId || placements.some((placement) => placement.documentId === item.id && placement.folderId === categoryId)) &&
          `${item.title} ${item.tags.join(" ")} ${item.aliases.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      )
      .sort((left, right) => sort === "title"
        ? left.title.localeCompare(right.title, "zh-CN")
        : (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.title.localeCompare(right.title, "zh-CN")),
    [categoryId, items, placements, query, sort, sourceLibraryObjectIds, statusFilter, type]);
  const filteredSources = useMemo(() => sources
    .filter((source) => !categoryId && (type === "all" || type === "source") && `${source.title} ${source.filename} ${currentSourceRevision(source)?.content ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sort === "title" ? left.title.localeCompare(right.title, "zh-CN") : right.updatedAt.localeCompare(left.updatedAt)), [categoryId, query, sort, sources, type]);
  const linkable = useMemo(
    () => items.filter((item) => item.id !== selected?.id),
    [items, selected?.id],
  );
  const sourceRevisionChanged = Boolean(
    requestedRevision && selected && requestedRevision !== selected.revisionToken,
  );
  const hasUnsavedChanges = creating
    ? Boolean(draft.title || draft.body || draft.tags)
    : importing
      ? Boolean(sourceDraft.title || sourceDraft.filename || sourceDraft.content)
      : Boolean(selected && (draft.title !== selected.title || draft.body !== selected.body || draft.tags !== selected.tags.join("、") || statusDraft !== selected.status));
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasUnsavedChanges]);
  const unresolvedLinks = useMemo(() => selected ? materialLinkTargets(selected.body).filter((target) => !selected.linkedObjects.some((item) => item.relativeId === target || item.title === target)) : [], [selected]);
  const readingProjection = useMemo(
    () => selected ? projectMaterialReading(draft.body, selected.linkedObjects, sources) : null,
    [draft.body, selected, sources],
  );
  const refresh = async () => {
    if (!projectId) return [];
    const [library, sourceDocuments] = await Promise.all([getWorldLibrary(projectId), listSourceImportReviews(projectId)]);
    const next = library.objects.filter((item) => item.status !== "archived");
    setItems(next);
    setSources(sourceDocuments);
    setCategories(library.folders.filter((folder) => folder.kind === "custom-category"));
    setPlacements(library.placements);
    setFolderRevision(library.folderRevision);
    return next;
  };
  const open = (summary: WorldObjectSummary) => {
    if (!projectId) return;
    setCreating(false);
    setImporting(false);
    setSelectedSource(null);
    setHistoricalPreview(null);
    setBusy(true);
    void readWorldObject(projectId, summary.id)
      .then((value) => {
        setSelected(value);
        setDraft({
          title: value.title,
          body: value.body,
          tags: value.tags.join("、"),
        });
        setStatusDraft(value.status);
        setLinkTargetId("");
        writeInternalRoute({ materialId: value.id, sourceDocumentId: null, revision: value.id === requestedMaterialId ? undefined : null });
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "资料无法打开。"),
      )
      .finally(() => setBusy(false));
  };
  const openSource = (source: SourceDocument) => {
    setCreating(false); setImporting(false); setSelected(null); setSelectedSource(source); setSourceSelection(null); setHistoricalPreview(null);
    writeInternalRoute({ materialId: null, sourceDocumentId: source.sourceDocumentId });
  };
  const openLinked = (summary: WorldObjectSummary) => {
    const source = sources.find((document) => document.libraryObjectId === summary.id);
    if (source) openSource(source); else open(summary);
  };
  useEffect(() => {
    if (internalRouteChange.current) { internalRouteChange.current = false; return; }
    setSelected(null);
    setSelectedSource(null);
    setCreating(false);
    setImporting(false);
    setMessage("");
    void refresh()
      .then((next) => {
        const requested = requestedMaterialId
          ? next.find((item) => item.id === requestedMaterialId)
          : null;
        if (requested) open(requested);
        else if (requestedSourceId) {
          void listSourceImportReviews(projectId!).then((documents) => {
            const source = documents.find((item) => item.sourceDocumentId === requestedSourceId);
            if (source) openSource(source);
            else setMessage("来源已不存在或不属于当前作品；没有打开同名材料替代。");
          });
        }
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "资料读取失败。"),
      );
    // The route is a deliberate source-return boundary, not a general browser history signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, requestedMaterialId, requestedSourceId]);
  useEffect(() => {
    const requestedScroll = Number(new URLSearchParams(window.location.search).get("materialScroll") ?? 0);
    if (!Number.isFinite(requestedScroll) || requestedScroll <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".materials-shell")?.scrollTo({ top: requestedScroll });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedMaterialId, requestedSourceId]);
  useEffect(() => {
    setHistoricalPreview(null);
    if (!projectId || !selected || !requestedRevision || requestedRevision === selected.revisionToken) return;
    let active = true;
    void props.runtime.withConnection((token) => getDocumentRevisionHistory(projectId, { kind: "object", id: selected.id }, token))
      .then((history) => {
        const revision = history.revisions.find((entry) => entry.contentHash === requestedRevision);
        if (!revision) throw new Error("该来源修订没有可读取的历史快照。");
        return previewDocumentRevision(projectId, { kind: "object", id: selected.id }, revision.id);
      })
      .then((preview) => { if (active) setHistoricalPreview({ body: markdownBody(preview.preview), revisionId: preview.revision.id }); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "历史来源正文无法读取。"); });
    return () => { active = false; };
  }, [projectId, props.runtime, requestedRevision, selected]);
  useEffect(() => {
    writeMaterialRoute({ query, type, status: statusFilter, sort });
  }, [query, sort, statusFilter, type]);
  const create = () => {
    if (!projectId || !draft.title.trim()) return;
    setBusy(true);
    void props.runtime
      .withConnection((token) =>
        createWorldObject({
          projectId,
          type: type === "all" || type === "source" ? "rule" : type,
          title: draft.title.trim(),
          body: draft.body,
          tags: draft.tags
            .split(/[、,]/u)
            .map((value) => value.trim())
            .filter(Boolean),
          status: statusDraft,
          token,
        }),
      )
      .then(async (value) => {
        await refresh();
        setCreating(false);
        open(value);
        setMessage(
          "资料已建立；它仍是可编辑的作者资料，不会自动成为角色知识。",
        );
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "资料保存失败，编辑内容仍保留。",
        ),
      )
      .finally(() => setBusy(false));
  };
  const importSource = () => {
    if (!projectId || !sourceDraft.content.trim()) return;
    const title = sourceDraft.title.trim() || sourceDraft.filename.replace(/\.(?:md|markdown|txt)$/iu, "") || "未命名来源";
    const filename = normalizeSourceFilename(sourceDraft.filename, title);
    setBusy(true);
    void props.runtime.withConnection((token) => importSourceDocument({ projectId, filename, title, content: sourceDraft.content, mode: "reference-only", token }))
      .then(async (document) => {
        await refresh(); openSource(document); setSourceDraft({ title: "", filename: "", content: "" });
        setMessage("原始材料已逐字保留为未确认来源；导入没有制造正式事件或角色知识。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "来源导入失败，粘贴内容仍保留。"))
      .finally(() => setBusy(false));
  };
  const prepareRuleFromSelection = () => {
    if (!projectId || !selectedSource || !sourceSelection?.text.trim()) return;
    const source = selectedSource;
    const selection = sourceSelection;
    if (!source.libraryObjectId) {
      setMessage("该来源没有可定位的资料对象；未建立无法往返的设定草稿。");
      return;
    }
    setBusy(true);
    void readWorldObject(projectId, source.libraryObjectId)
      .then((sourceObject) => {
        const sourceLink = `[[${sourceObject.relativeId}|${source.title}]]`;
        setSelected(null); setSelectedSource(null); setCreating(true); setImporting(false); setType("rule");
        setDraft({
          title: `来自“${source.title}”的世界设定`,
          body: `${selection.text.trim()}\n\n来源：${sourceLink}\n来源位置：${source.title} · 第 ${selection.lineStart}–${selection.lineEnd} 行 · 修订 ${source.currentRevisionHash}\n来源标识：${source.sourceDocumentId}\n`,
          tags: "世界设定、待确认",
        });
        setStatusDraft("draft");
        writeInternalRoute({ materialId: null, sourceDocumentId: null });
        setMessage("已把所选原文带入设定草稿；请整理并保存。来源位置与原始修订会保留在正文中。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "来源资料无法读取；未建立设定草稿。"))
      .finally(() => setBusy(false));
  };
  const save = () => {
    if (!projectId || !selected) return;
    setBusy(true);
    void props.runtime
      .withConnection((token) =>
        updateWorldObject({
          projectId,
          objectId: selected.id,
          expectedHash: selected.revisionToken,
          presentationExpectedHash: selected.card.revisionToken,
          writeMarkdown: true,
          writePresentation: false,
          title: draft.title.trim(),
          status: selected.type === "rule" ? statusDraft : selected.status,
          tags: draft.tags
            .split(/[、,]/u)
            .map((value) => value.trim())
            .filter(Boolean),
          aliases: selected.aliases,
          body: draft.body,
          subtype: selected.subtype,
          typedProperties: selected.typedProperties,
          profile: selected.profile,
          card: selected.card,
          token,
        }),
      )
      .then(async (result) => {
        if (result.conflict || !result.object)
          throw new Error("资料已被其他修改更新，请重新打开后再试。");
        setSelected(result.object);
        setDraft({
          title: result.object.title,
          body: result.object.body,
          tags: result.object.tags.join("、"),
        });
        setStatusDraft(result.object.status);
        await refresh();
        setMessage("资料已保存；新选择会使用这一修订，既有回答回执仍标明自己的来源修订。");
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "资料保存失败，编辑内容仍保留。",
        ),
      )
      .finally(() => setBusy(false));
  };
  const addLink = () => {
    const target = linkable.find((item) => item.id === linkTargetId);
    if (!target) return;
    const link = `[[${target.relativeId}|${target.title}]]`;
    setDraft((current) =>
      current.body.includes(link)
        ? current
        : {
            ...current,
            body: `${current.body.trimEnd()}${current.body.trim() ? "\n\n" : ""}关联对象：${link}\n`,
          },
    );
    setMessage(`已插入到正文：${link}。保存后会由既有链接解析建立来源往返。`);
  };
  const createCategory = async () => {
    if (!projectId) return;
    const title = window.prompt("分类名称");
    if (!title?.trim()) return;
    setBusy(true);
    try { const result = await props.runtime.withConnection((token) => createWorkspaceFolder({ projectId, title: title.trim(), kind: "custom-category", token })); await refresh(); setCategoryId(result.folder.id); setMessage("世界设定分类已建立；它不会改变对象的正式事实。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "分类建立失败。"); }
    finally { setBusy(false); }
  };
  const renameCategory = async () => {
    if (!projectId || !categoryId || !folderRevision) return;
    const current = categories.find((folder) => folder.id === categoryId);
    if (!current) return;
    const title = window.prompt("分类名称", current.title);
    if (!title?.trim() || title.trim() === current.title) return;
    setBusy(true);
    try { const result = await props.runtime.withConnection((token) => updateWorkspaceFolders({ projectId, expectedContentHash: folderRevision, folders: categories.map((folder) => folder.id === categoryId ? { ...folder, title: title.trim() } : folder), token })); if (result.conflict) throw new Error("分类已被其他窗口修改，请刷新后重试。"); await refresh(); setMessage("分类已重命名；对象和引用身份不变。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "分类重命名失败。"); }
    finally { setBusy(false); }
  };
  const assignSelectedCategory = async (nextCategoryId: string | null) => {
    if (!projectId || !selected) return;
    setBusy(true);
    try { const result = await props.runtime.withConnection((token) => moveWorldObjectsToFolder({ projectId, objectIds: [selected.id], folderId: nextCategoryId, token })); if (result.conflict) throw new Error("分类放置发生冲突，请刷新后重试。"); await refresh(); setMessage(nextCategoryId ? "资料已加入所选分类；正文和对象身份未改变。" : "资料已移出分类；正文和对象身份未改变。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "资料分类失败。"); }
    finally { setBusy(false); }
  };
  if (!projectId)
    return (
      <main className="shell-workspace">
        <section className="shell-workspace-stage">
          <h1>先打开一个作品</h1>
        </section>
      </main>
    );
  return (
    <main className="shell-workspace materials-shell" aria-label="资料工作区">
      <section className="materials-workspace">
        <MaterialsSectionNavigation current="materials" hasUnsavedChanges={hasUnsavedChanges} />
        <header className="materials-workspace-header">
          <div className="materials-workspace-identity">
            <BookOpen aria-hidden="true" />
            <div>
              <p>当前作品 · 世界资料</p>
              <h1>资料工作区</h1>
              <span>编写设定，连接地点、组织与人物</span>
            </div>
          </div>
          <div className="materials-workspace-actions">
            {materialReturn ? (
              <button
                type="button"
                onClick={() => window.location.assign(materialReturn)}
              >
                <ArrowLeft aria-hidden="true" />
                返回来源
              </button>
            ) : null}
            <button type="button" aria-pressed={fileMode} onClick={() => { setFileMode((value) => !value); const params = new URLSearchParams(window.location.search); if (!fileMode) params.set("materialMode", "files"); else params.delete("materialMode"); window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`); }}>
              <FileText aria-hidden="true" />{fileMode ? "世界资料" : "文件管理"}
            </button>
            {!fileMode ? <button
              type="button"
              onClick={() => {
                setCreating(true);
                setImporting(false);
                setSelected(null);
                setSelectedSource(null);
                setDraft({ title: "", body: "", tags: "" });
                setStatusDraft("draft");
                setLinkTargetId("");
                writeInternalRoute({ materialId: null, sourceDocumentId: null });
              }}
            >
              <Plus aria-hidden="true" />
              新建资料
            </button> : null}
            {!fileMode ? <button type="button" onClick={() => { setImporting(true); setCreating(false); setSelected(null); setSelectedSource(null); writeInternalRoute({ materialId: null, sourceDocumentId: null }); }}>
              <FileUp aria-hidden="true" />
              导入来源
            </button> : null}
          </div>
        </header>
        {fileMode ? <MaterialFilesWorkspace projectId={projectId} runtime={props.runtime} worldObjects={items} onMessage={setMessage} message={message} /> : <div className="materials-workspace-grid">
          <aside className="materials-workspace-sidebar" aria-label="资料检索">
            <label>
              搜索资料
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="名称、标签或别名"
              />
            </label>
            <label>
              类型
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as WorldObjectType | "all")
                }
              >
                <option value="all">全部内容</option>
                <option value="source">原始来源</option>
                {editableTypes.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="materials-filter-row">
              <label>状态<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as MaterialStatusFilter)}><option value="all">全部状态</option><option value="draft">草稿</option><option value="confirmed">已确认内容</option></select></label>
              <label>排序<select value={sort} onChange={(event) => setSort(event.target.value as MaterialSort)}><option value="recent">最近编辑</option><option value="title">按名称</option></select></label>
            </div>
            <label>世界设定分类<select value={categoryId ?? ""} onChange={(event) => { const value = event.target.value || null; setCategoryId(value); writeMaterialRoute({ categoryId: value }); }}><option value="">全部分类</option>{categories.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label>
            <div className="materials-category-actions"><button type="button" onClick={() => void createCategory()} disabled={busy}>新建分类</button>{categoryId ? <button type="button" onClick={() => void renameCategory()} disabled={busy}>重命名分类</button> : null}</div>
            <div className="materials-workspace-list">
              {filteredSources.map((source) => (
                <button key={source.sourceDocumentId} type="button" aria-pressed={selectedSource?.sourceDocumentId === source.sourceDocumentId} onClick={() => openSource(source)}>
                  <strong>{source.title}</strong>
                  <span>原始来源 · 关联资料身份 · {source.filename} · {formatRecentTime(source.updatedAt)}</span>
                </button>
              ))}
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => open(item)}
                >
                  <strong>{item.title}</strong>
                  <span>{typeLabel(item.type)} · {item.tags.slice(0, 2).join("、") || "未加标签"}{item.updatedAt ? ` · ${formatRecentTime(item.updatedAt)}` : ""}</span>
                </button>
              ))}
              {!filtered.length && !filteredSources.length ? <p>没有符合当前筛选的资料。</p> : null}
            </div>
          </aside>
          <section className="materials-workspace-main">
            {message ? <p className="materials-workspace-message" role="status">{message}</p> : null}
            {sourceRevisionChanged ? <section className="materials-source-revision-warning" role="alert"><strong>正在查看旧回答采用的来源</strong><p>回答修订 {requestedRevision?.slice(0, 12)}；当前资料 {selected?.revisionToken.slice(0, 12)}。{historicalPreview ? `已从既有文档历史读取 ${historicalPreview.revisionId}，没有用当前正文替代。` : "正在核对历史快照。"}</p>{historicalPreview ? <details open><summary>旧依据正文</summary><pre>{historicalPreview.body}</pre></details> : null}</section> : null}
            {selectedSource ? <SourceReader source={selectedSource} selection={sourceSelection} onSelection={setSourceSelection} onPrepareRule={prepareRuleFromSelection} onOpenLibraryObject={() => { const sourceObject = items.find((item) => item.id === selectedSource.libraryObjectId); if (sourceObject) open(sourceObject); }} onUseInTianyi={() => { if (selectedSource.libraryObjectId) window.location.assign(`/tianyi?tianyiLane=work&materialRef=${encodeURIComponent(selectedSource.libraryObjectId)}&materialReturn=${encodeURIComponent(currentMaterialRoute())}`); }} /> : selected || creating ? (
              <section className="materials-editor" aria-label={creating ? "新建资料" : "编辑资料"}>
                {selected ? <div className="materials-editor-heading"><div><span>{typeLabel(selected.type)}</span><h2>{selected.title}</h2></div><small>当前版本 · 已保存</small></div> : <div className="materials-editor-heading"><div><span>新资料</span><h2>编写资料</h2></div></div>}
                <label>
                  资料类型
                  <select
                    value={type === "all" ? (selected?.type ?? "rule") : type}
                    disabled={Boolean(selected)}
                    onChange={(event) =>
                      setType(event.target.value as WorldObjectType)
                    }
                  >
                    {editableTypes.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  标题
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                {selected && readingProjection ? (
                  <>
                    <section className="materials-reading-view" aria-label="正文阅读">
                      <div className="materials-reading-heading"><span>正文阅读</span><small>保存版本的可读视图</small></div>
                      <div className="materials-reading-body">{readingProjection.body || "这份资料还没有正文。"}</div>
                      {readingProjection.source ? (
                        <div className="materials-reading-source">
                          <div><strong>整理自 {readingProjection.source.title}</strong><span>{readingProjection.sourceLocation ?? "原始来源中的选定段落"}</span></div>
                          <button type="button" onClick={() => openSource(readingProjection.source!)}>查看原始来源</button>
                        </div>
                      ) : null}
                      {readingProjection.groupedMarkers ? <p>来源与关联已按名称整理在下方；完整内联标识仍保留在原始存储中。</p> : null}
                    </section>
                    <details className="materials-raw-body-editor">
                      <summary>编辑正文与查看原始存储</summary>
                      <label>
                        正文
                        <span className="materials-body-preservation-note">现有正文无法逐段可靠区分作者文字与系统附加内容，因此不会自动删改。</span>
                        <textarea
                          value={draft.body}
                          onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                          rows={16}
                        />
                      </label>
                    </details>
                  </>
                ) : (
                  <label>
                    正文
                    <textarea
                      value={draft.body}
                      onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                      rows={16}
                      placeholder="例如：雾港实行夜间宵禁……"
                    />
                  </label>
                )}
                {(selected?.type ?? (type === "all" || type === "source" ? "rule" : type)) === "rule" ? <div className="materials-writing-prompts" aria-label="可选写作提示"><span>可选提示</span>{["规则内容", "适用范围", "例外"].map((prompt) => <button key={prompt} type="button" onClick={() => setDraft((current) => current.body.includes(`${prompt}：`) ? current : { ...current, body: `${current.body.trimEnd()}${current.body.trim() ? "\n\n" : ""}${prompt}：` })}>{prompt}</button>)}</div> : null}
                <label>
                  标签
                  <input
                    value={draft.tags}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        tags: event.target.value,
                      }))
                    }
                    placeholder="规则、雾港、守卫组织"
                  />
                </label>
                {(selected?.type ?? (type === "all" || type === "source" ? "rule" : type)) === "rule" ? <label>内容状态<select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}><option value="draft">草稿设定</option><option value="locked">作者已确认</option></select></label> : null}
                {selected ? (
                  <>
                    <section aria-label="资料关联">
                      <h2>关联与来源</h2>
                      <p>
                        已关联：
                        {selected.linkedObjects.length
                          ? selected.linkedObjects.map((item) => (
                              <span className="materials-linked-object" key={item.id}><button type="button" onClick={() => openLinked(item)}>{item.title}</button>{item.type === "location" ? <button type="button" onClick={() => window.location.assign(`/library?libraryView=map&mapPlace=${encodeURIComponent(item.id)}&materialReturn=${encodeURIComponent(currentMaterialRoute())}`)}><MapPin aria-hidden="true" />地图</button> : null}{item.type === "character" || item.type === "location" ? <button type="button" onClick={() => window.location.assign(`/library?libraryView=relations&relationCenter=${encodeURIComponent(item.id)}&relationReturn=${encodeURIComponent(currentMaterialRoute())}`)}><UsersRound aria-hidden="true" />关系</button> : null}</span>
                            ))
                          : "尚未建立"}
                      </p>
                      {selected.backlinks.length ? (
                        <p>
                          反向引用：
                          {selected.backlinks.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => openLinked(item)}
                            >
                              {item.title}
                            </button>
                          ))}
                        </p>
                      ) : null}
                      {unresolvedLinks.length ? <p className="materials-broken-links" role="alert">失效关联：{unresolvedLinks.join("、")}。没有自动改连到同名或其他对象。</p> : null}
                      <label>
                        插入关联
                        <select
                          value={linkTargetId}
                          onChange={(event) =>
                            setLinkTargetId(event.target.value)
                          }
                        >
                          <option value="">选择地点、组织、人物或规则</option>
                          {linkable.map((item) => (
                            <option key={item.id} value={item.id}>
                              {typeLabel(item.type)} · {item.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={addLink}
                        disabled={!linkTargetId}
                      >
                        <Link2 aria-hidden="true" />
                        插入到正文
                      </button>
                      <label>
                        世界设定分类
                        <select value={placements.find((placement) => placement.documentId === selected.id)?.folderId ?? ""} onChange={(event) => void assignSelectedCategory(event.target.value || null)}>
                          <option value="">不放入分类</option>
                          {categories.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
                        </select>
                      </label>
                    </section>
                    <section aria-label="资料版本">
                      <h2>可核对版本</h2>
                      <p>
                        天意只会发送作者明确选择并在发送时重新校验的版本。
                      </p>
                      <details><summary>技术详情</summary><p>当前存储尚未为正文中的每一段区分“作者输入”与“系统插入”。为保护历史原文，本页只依据既有解析结果展示关联，不会批量清理正文标识。</p><code>对象 {selected.id}</code><code>修订 {selected.revisionToken}</code><code>正文路径 {selected.relativeId}</code></details>
                    </section>
                    <div className="materials-editor-actions">
                      <button
                        type="button"
                        onClick={save}
                        disabled={busy || !draft.title.trim()}
                      >
                        <Save aria-hidden="true" />
                        保存资料
                      </button>
                      {selected.type === "location" ? (
                        <button
                          type="button"
                          onClick={() =>
                            window.location.assign(
                              `/library?libraryView=map&mapPlace=${encodeURIComponent(selected.id)}&materialReturn=${encodeURIComponent(currentMaterialRoute())}`,
                            )
                          }
                        >
                          <MapPin aria-hidden="true" />
                          在地图打开
                        </button>
                      ) : null}
                      {selected.type === "character" || selected.type === "location" ? <button
                        type="button"
                        onClick={() =>
                          window.location.assign(
                            `/library?libraryView=relations&relationCenter=${encodeURIComponent(selected.id)}&relationReturn=${encodeURIComponent(currentMaterialRoute())}`,
                          )
                        }
                      >
                        <UsersRound aria-hidden="true" />
                        查看关系
                      </button> : null}
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign(
                            `/tianyi?tianyiLane=work&materialRef=${encodeURIComponent(selected.id)}&materialReturn=${encodeURIComponent(currentMaterialRoute())}`,
                          )
                        }
                      >
                        <Sparkles aria-hidden="true" />
                        在天意明确引用
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={create}
                    disabled={busy || !draft.title.trim()}
                  >
                    <Save aria-hidden="true" />
                    建立资料
                  </button>
                )}
              </section>
            ) : importing ? (
              <section className="materials-import" aria-label="导入来源">
                <div><FileUp aria-hidden="true" /><div><small>原始材料</small><h2>粘贴或导入 Markdown／TXT</h2><p>保留原文、文件名与每次导入修订；导入内容保持未确认。</p></div></div>
                <input ref={fileInput} hidden type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (!/\.(?:md|markdown|txt)$/iu.test(file.name)) { setMessage("只支持 Markdown 与 TXT。未读取该文件。"); return; } void file.text().then((content) => setSourceDraft({ title: file.name.replace(/\.(?:md|markdown|txt)$/iu, ""), filename: file.name, content })); }} />
                <button type="button" onClick={() => fileInput.current?.click()}><FileText aria-hidden="true" />选择本地文件</button>
                <label>来源名称<input value={sourceDraft.title} onChange={(event) => setSourceDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：雾港设定笔记" /></label>
                <label>文件名／出处<input value={sourceDraft.filename} onChange={(event) => setSourceDraft((current) => ({ ...current, filename: event.target.value }))} placeholder="雾港设定笔记.md" /></label>
                <label>原文<textarea rows={18} value={sourceDraft.content} onChange={(event) => setSourceDraft((current) => ({ ...current, content: event.target.value }))} placeholder="在这里粘贴原始笔记；保存后不会自动确认其中内容。" /></label>
                <button type="button" disabled={busy || !sourceDraft.content.trim()} onClick={importSource}><Save aria-hidden="true" />保存为原始来源</button>
              </section>
            ) : (
              <p>选择一项资料开始阅读和编辑，或新建第一条世界设定。</p>
            )}
          </section>
        </div>}
      </section>
    </main>
  );
}

function MaterialFilesWorkspace(props: { projectId: string; runtime: TianyanShellRuntimeState; worldObjects: WorldObjectSummary[]; message: string; onMessage(value: string): void }) {
  const [snapshot, setSnapshot] = useState<MaterialFileList | null>(null);
  const [selected, setSelected] = useState<(MaterialFileRecord & { revision: MaterialFileRecord["revisions"][number]; contentHash: string }) | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MaterialFileType | "">("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [folderParentTargetId, setFolderParentTargetId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [fileSort, setFileSort] = useState<"recent" | "name" | "size" | "type">("recent");
  const [offset, setOffset] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<MaterialOperationReceipt | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [fileSelection, setFileSelection] = useState<SourceSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [maps, setMaps] = useState<MapDocument[]>([]);
  const [targetMapId, setTargetMapId] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const refresh = async () => {
    const value = await listMaterialFiles({ projectId: props.projectId, query, type, archived, folderId, sort: fileSort, offset, limit: 50 });
    setSnapshot(value);
    return value;
  };
  useEffect(() => { void refresh().catch((error: unknown) => props.onMessage(error instanceof Error ? error.message : "文件读取失败。")); }, [archived, fileSort, folderId, offset, props.projectId, query, type]);
  useEffect(() => { void getVisualWorkbench(props.projectId).then((value) => { const next = value.documents.filter((document): document is MapDocument => document.type === "map"); setMaps(next); setTargetMapId((current) => current && next.some((map) => map.id === current) ? current : next[0]?.id ?? ""); }).catch(() => setMaps([])); }, [props.projectId]);
  useEffect(() => { const operationId = window.sessionStorage.getItem(`tianyan.material-files.last-operation.${props.projectId}`); if (operationId) void readMaterialOperationReceipt(props.projectId, operationId).then(setLastReceipt).catch(() => setLastReceipt(null)); }, [props.projectId]);
  useEffect(() => { setOffset(0); }, [archived, fileSort, folderId, props.projectId, query, type]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (editingText == null || editingText === selected?.revision.textContent) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [editingText, selected?.revision.textContent]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fileId = params.get("materialFileId");
    const revisionId = params.get("materialFileRevision");
    const rangeStart = Number(params.get("materialFileStart"));
    const rangeEnd = Number(params.get("materialFileEnd"));
    if (!fileId) return;
    void readMaterialFile(props.projectId, fileId, revisionId).then(async (value) => {
      if (!value) { props.onMessage("指定文件或历史修订不存在；没有打开同名文件替代。"); return; }
      setSelected(value); setEditingText(null);
      const body = value.revision.textContent ?? "";
      if (Number.isSafeInteger(rangeStart) && Number.isSafeInteger(rangeEnd) && rangeStart >= 0 && rangeEnd > rangeStart && rangeEnd <= body.length) setFileSelection({ charStart: rangeStart, charEnd: rangeEnd, lineStart: body.slice(0, rangeStart).split("\n").length, lineEnd: body.slice(0, rangeEnd).split("\n").length, text: body.slice(rangeStart, rangeEnd) });
      if (["image", "pdf", "audio", "video"].includes(value.type)) {
        const downloaded = await props.runtime.withConnection((token) => downloadMaterialFile(props.projectId, value.id, token, revisionId));
        setPreviewUrl(URL.createObjectURL(downloaded.blob));
      }
    }).catch(() => props.onMessage("指定文件无法读取；没有回退到当前版本。"));
  }, [props.projectId]);
  const open = async (file: MaterialFileRecord) => {
    if (editingText != null && editingText !== selected?.revision.textContent && !window.confirm("当前普通笔记有未保存修改。确定离开并放弃这些修改吗？")) return;
    setBusy(true);
    try {
      const value = await readMaterialFile(props.projectId, file.id);
      setSelected(value);
      setEditingText(null);
      setFileSelection(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (value && ["image", "pdf", "audio", "video"].includes(value.type)) {
        const downloaded = await props.runtime.withConnection((token) => downloadMaterialFile(props.projectId, value.id, token));
        setPreviewUrl(URL.createObjectURL(downloaded.blob));
      }
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "文件无法打开。"); }
    finally { setBusy(false); }
  };
  const importFiles = async (files: FileList | File[]) => {
    const chosen = Array.from(files).slice(0, 20);
    if (!chosen.length) return;
    setBusy(true);
    try {
      const payload = await Promise.all(chosen.map(async (file) => ({ name: file.name, mimeType: file.type || undefined, base64: await fileBase64(file) })));
      const operationId = `materials.import.${crypto.randomUUID()}`;
      const receipt = await props.runtime.withConnection((token) => importMaterialFiles({ projectId: props.projectId, operationId, folderId, files: payload, token }));
      setLastReceipt(receipt); window.sessionStorage.setItem(`tianyan.material-files.last-operation.${props.projectId}`, operationId);
      await refresh();
      const failed = receipt.results.filter((entry) => entry.status === "failed");
      const duplicates = receipt.results.filter((entry) => entry.status === "duplicate");
      props.onMessage(`导入完成：${receipt.results.length - failed.length - duplicates.length} 个新记录，${duplicates.length} 个重复，${failed.length} 个失败。成功项已保存，失败项可重新选择重试。`);
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "导入失败；未完成的文件可安全重试。"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const mutateSelected = async (kind: "move" | "archive" | "restore") => {
    if (!snapshot || !selectedIds.length) return;
    setBusy(true);
    try {
      if (kind === "move") await props.runtime.withConnection((token) => moveMaterialFiles({ projectId: props.projectId, operationId: `materials.move.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileIds: selectedIds, folderId: moveTargetId, token }));
      else await props.runtime.withConnection((token) => setMaterialFilesArchived({ projectId: props.projectId, operationId: `materials.${kind}.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileIds: selectedIds, archived: kind === "archive", token }));
      setSelectedIds([]); setSelected(null); await refresh(); props.onMessage(kind === "move" ? "所选文件已移动；稳定文件身份和历史修订不变。" : kind === "archive" ? "所选文件已归档，可在归档中恢复。" : "所选文件已恢复。 ");
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "批量操作失败；请刷新后重试。"); }
    finally { setBusy(false); }
  };
  const createFolder = async () => {
    if (!snapshot) return;
    const title = window.prompt("文件夹名称");
    if (!title?.trim()) return;
    setBusy(true);
    try { await props.runtime.withConnection((token) => createMaterialFileFolder({ projectId: props.projectId, title: title.trim(), parentId: folderId, expectedRevision: snapshot.catalogRevision, token })); await refresh(); props.onMessage("文件夹已建立。"); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "文件夹建立失败。"); }
    finally { setBusy(false); }
  };
  const renameFolder = async () => {
    if (!snapshot || !folderId) return;
    const current = snapshot.folders.find((folder) => folder.id === folderId);
    if (!current) return;
    const title = window.prompt("文件夹名称", current.title);
    if (!title?.trim() || title.trim() === current.title) return;
    setBusy(true);
    try { await props.runtime.withConnection((token) => updateMaterialFileFolder({ projectId: props.projectId, folderId, title: title.trim(), expectedRevision: snapshot.catalogRevision, token })); await refresh(); props.onMessage("文件夹已重命名；文件与引用身份不变。"); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "文件夹重命名失败。"); }
    finally { setBusy(false); }
  };
  const moveFolder = async () => {
    if (!snapshot || !folderId) return;
    setBusy(true);
    try { await props.runtime.withConnection((token) => updateMaterialFileFolder({ projectId: props.projectId, folderId, parentId: folderParentTargetId, expectedRevision: snapshot.catalogRevision, token })); setFolderId(null); setFolderParentTargetId(null); await refresh(); props.onMessage("文件夹层级已更新；循环包含会被服务端拒绝。"); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "文件夹移动失败。"); }
    finally { setBusy(false); }
  };
  const pasteText = async () => {
    setBusy(true);
    try {
      const content = await navigator.clipboard.readText();
      if (!content.trim()) throw new Error("剪贴板没有可保存的文本。");
      const timestamp = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/[/:]/gu, "-");
      await props.runtime.withConnection((token) => createMaterialNote({ projectId: props.projectId, operationId: `materials.paste.${crypto.randomUUID()}`, name: `随手笔记-${timestamp}.md`, displayName: `随手笔记 ${timestamp}`, content, folderId, token }));
      await refresh(); props.onMessage("剪贴板文本已作为普通笔记保存；没有自动建立正式对象。");
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "无法读取剪贴板；可改用新建笔记或选择文件。"); }
    finally { setBusy(false); }
  };
  const createNote = async () => {
    if (!snapshot) return;
    const title = window.prompt("笔记名称", "新建笔记");
    if (!title?.trim()) return;
    setBusy(true);
    try { await props.runtime.withConnection((token) => createMaterialNote({ projectId: props.projectId, operationId: `materials.note.${crypto.randomUUID()}`, name: `${title.trim()}.md`, displayName: title.trim(), content: "", folderId, token })); await refresh(); props.onMessage("普通笔记已建立；它不是物品或正式设定。"); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "笔记建立失败。"); }
    finally { setBusy(false); }
  };
  const renameSelected = async () => {
    if (!snapshot || !selected) return;
    const name = window.prompt("显示名称", selected.displayName);
    if (!name?.trim()) return;
    setBusy(true);
    try { await props.runtime.withConnection((token) => updateMaterialFile({ projectId: props.projectId, operationId: `materials.rename.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileId: selected.id, displayName: name.trim(), token })); const next = await refresh(); const updated = next.files.find((file) => file.id === selected.id); if (updated) await open(updated); props.onMessage("名称已更新；引用身份没有改变。"); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "重命名失败。"); }
    finally { setBusy(false); }
  };
  const editSelectedTags = async () => {
    if (!snapshot || !selected) return;
    const value = window.prompt("标签（用逗号或顿号分隔）", selected.tags.join("、"));
    if (value == null) return;
    const tags = value.split(/[、,]/u).map((entry) => entry.trim()).filter(Boolean);
    setBusy(true);
    try { await props.runtime.withConnection((token) => updateMaterialFile({ projectId: props.projectId, operationId: `materials.tags.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileId: selected.id, tags, token })); const next = await refresh(); const updated = next.files.find((file) => file.id === selected.id); if (updated) await open(updated); props.onMessage("标签已更新；确认状态和世界事实未改变。"); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "标签保存失败。"); }
    finally { setBusy(false); }
  };
  const download = async () => {
    if (!selected) return;
    try { const value = await props.runtime.withConnection((token) => downloadMaterialFile(props.projectId, selected.id, token)); const link = document.createElement("a"); link.href = URL.createObjectURL(value.blob); link.download = value.filename; link.click(); URL.revokeObjectURL(link.href); props.onMessage(`已下载原件；SHA-256 ${value.sha256 ?? "未返回"}。`); }
    catch (error) { props.onMessage(error instanceof Error ? error.message : "下载失败。"); }
  };
  const saveTextRevision = async () => {
    if (!selected || editingText == null) return;
    setBusy(true);
    try {
      const receipt = await props.runtime.withConnection((token) => importMaterialFiles({ projectId: props.projectId, operationId: `materials.edit.${crypto.randomUUID()}`, files: [{ name: selected.originalName, displayName: selected.displayName, mimeType: selected.mimeType, base64: textBase64(editingText), replaceFileId: selected.id }], token }));
      const revisionId = receipt.results[0]?.revisionId;
      await refresh();
      const updated = await readMaterialFile(props.projectId, selected.id, revisionId);
      if (updated) setSelected(updated);
      setEditingText(null);
      props.onMessage("笔记已保存为新修订；旧回答仍可按原 SHA-256 打开旧正文。");
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "笔记保存失败，编辑内容仍保留。"); }
    finally { setBusy(false); }
  };
  const replaceSelectedBytes = async (file: File) => {
    if (!selected) return;
    setBusy(true);
    try {
      const base64 = await fileBase64(file);
      const receipt = await props.runtime.withConnection((token) => importMaterialFiles({ projectId: props.projectId, operationId: `materials.replace.${crypto.randomUUID()}`, files: [{ name: file.name, displayName: selected.displayName, mimeType: file.type || undefined, base64, replaceFileId: selected.id }], token }));
      const result = receipt.results[0];
      if (result?.status === "failed") throw new Error(result.error || "替换文件未保存。");
      const updated = await readMaterialFile(props.projectId, selected.id, result?.revisionId);
      if (updated) setSelected(updated);
      await refresh(); props.onMessage(result?.status === "duplicate" ? "所选内容与该文件已有修订完全相同，没有重复建立版本。" : "已明确追加文件修订；旧修订和既有回答保持可定位。");
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "替换文件失败；当前修订未改变。"); }
    finally { setBusy(false); if (replaceInput.current) replaceInput.current.value = ""; }
  };
  const createRuleFromFileSelection = async () => {
    if (!selected || !fileSelection?.text.trim() || !snapshot) return;
    setBusy(true);
    try {
      const object = await props.runtime.withConnection((token) => createWorldObject({ projectId: props.projectId, type: "rule", title: `来自“${selected.displayName}”的世界设定`, body: `${fileSelection.text.trim()}\n\n来源文件：${selected.displayName}\n来源位置：第 ${fileSelection.lineStart}–${fileSelection.lineEnd} 行\n来源修订：${selected.revision.sha256}\n来源文件标识：${selected.id}\n`, tags: ["世界设定", "待确认"], status: "draft", token }));
      await props.runtime.withConnection((token) => updateMaterialFile({ projectId: props.projectId, operationId: `materials.link-rule.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileId: selected.id, links: [...selected.links, { kind: "world-object", id: object.id, label: object.title }], token }));
      const returnTarget = currentMaterialRoute();
      window.location.assign(`/library?materialId=${encodeURIComponent(object.id)}&materialReturn=${encodeURIComponent(returnTarget)}`);
    } catch (error) { props.onMessage(error instanceof Error ? error.message : "设定草稿建立失败；原文件和选段没有改变。"); }
    finally { setBusy(false); }
  };
  const useImageAsMapBackground = async () => {
    if (!selected || selected.type !== "image" || !snapshot || !targetMapId) return;
    const target = maps.find((map) => map.id === targetMapId);
    if (!target) return;
    setBusy(true);
    let mapRevisionSaved = false;
    try {
      const downloaded = await props.runtime.withConnection((token) => downloadMaterialFile(props.projectId, selected.id, token, selected.revision.id));
      const dimensions = await imageDimensions(downloaded.blob);
      const base64 = await blobBase64(downloaded.blob);
      const asset = await props.runtime.withConnection((token) => importVisualAsset({ projectId: props.projectId, category: "maps", filename: selected.originalName, mimeType: selected.mimeType, base64, token }));
      const background: MapBackground = { id: `background.${crypto.randomUUID()}`, title: selected.displayName, assetPath: asset.relativePath, mimeType: asset.mimeType, width: dimensions.width, height: dimensions.height, opacity: 1, visible: true, transform: { x: 0, y: 0, scale: 1, rotation: 0 } };
      const document: MapDocument = { ...target, content: { ...target.content, backgrounds: [...target.content.backgrounds, background], activeBackgroundId: background.id, baseImage: { assetPath: background.assetPath, mimeType: background.mimeType, width: background.width, height: background.height } } };
      const written = await props.runtime.withConnection((token) => updateVisualDocument({ projectId: props.projectId, relativePath: target.relativePath, expectedHash: target.contentHash, document, token }));
      mapRevisionSaved = true;
      setMaps((current) => current.map((map) => map.id === target.id ? written.document as MapDocument : map));
      await props.runtime.withConnection((token) => updateMaterialFile({ projectId: props.projectId, operationId: `materials.link-map.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileId: selected.id, links: [...selected.links.filter((link) => !(link.kind === "visual-document" && link.id === target.id)), { kind: "visual-document", id: target.id, label: target.title }], token }));
      await refresh(); props.onMessage("图片已显式复制为所选地图的底图修订；原始文件身份保留，并已记录地图关联。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      props.onMessage(mapRevisionSaved
        ? `地图底图修订已保存，但文件关联回写失败：${detail}。请刷新文件后重新建立关联；不会重复覆盖原始文件。`
        : `底图建立失败：${detail}。原始文件未改变。`);
    }
    finally { setBusy(false); }
  };
  const capability = selected ? formatCapabilities(selected) : [];
  return <section className="material-files-workspace" aria-label="普通文件管理" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(event.dataTransfer.files); }}>
    {props.message ? <p className="materials-workspace-message" role="status">{props.message}</p> : null}
    <div className="material-files-toolbar">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或标签" aria-label="搜索普通文件" />
      <select value={type} onChange={(event) => setType(event.target.value as MaterialFileType | "")} aria-label="文件类型"><option value="">全部格式</option>{["text", "image", "pdf", "audio", "video", "office", "archive", "attachment"].map((value) => <option key={value} value={value}>{fileTypeLabel(value as MaterialFileType)}</option>)}</select>
      <select value={folderId ?? ""} onChange={(event) => setFolderId(event.target.value || null)} aria-label="当前文件夹"><option value="">未分类／全部根目录</option>{snapshot?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select>
      <select value={fileSort} onChange={(event) => setFileSort(event.target.value as typeof fileSort)} aria-label="文件排序"><option value="recent">最近修改</option><option value="name">按名称</option><option value="size">按大小</option><option value="type">按类型</option></select>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}><Upload aria-hidden="true" />选择文件</button>
      <input ref={input} hidden type="file" multiple onChange={(event) => { if (event.target.files) void importFiles(event.target.files); }} />
      <button type="button" onClick={createNote} disabled={busy}>新建笔记</button>
      <button type="button" onClick={() => void pasteText()} disabled={busy}>粘贴为笔记</button>
      <button type="button" onClick={createFolder} disabled={busy}><FolderPlus aria-hidden="true" />新建文件夹</button>
      {folderId ? <><button type="button" onClick={() => void renameFolder()} disabled={busy}>重命名文件夹</button><label>文件夹移至<select value={folderParentTargetId ?? ""} onChange={(event) => setFolderParentTargetId(event.target.value || null)}><option value="">根目录</option>{snapshot?.folders.filter((folder) => folder.id !== folderId).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label><button type="button" onClick={() => void moveFolder()} disabled={busy}>移动文件夹</button></> : null}
      <button type="button" aria-pressed={archived} onClick={() => { setArchived((value) => !value); setSelectedIds([]); setSelected(null); }}><Archive aria-hidden="true" />{archived ? "返回文件" : "归档"}</button>
    </div>
    {selectedIds.length ? <div className="material-files-bulk" role="toolbar" aria-label="批量操作"><strong>已选 {selectedIds.length} 项</strong><label>目标文件夹<select value={moveTargetId ?? ""} onChange={(event) => setMoveTargetId(event.target.value || null)}><option value="">未分类</option>{snapshot?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label><button type="button" onClick={() => void mutateSelected("move")}>移动</button><button type="button" onClick={() => void mutateSelected(archived ? "restore" : "archive")}>{archived ? "恢复" : "归档"}</button></div> : null}
    {lastReceipt?.kind === "import" ? <details className="material-files-receipt" open={lastReceipt.state === "partial"}><summary>最近导入：{lastReceipt.state === "partial" ? "部分完成" : "已完成"} · {lastReceipt.results.length} 项</summary><ul>{lastReceipt.results.map((result, index) => <li key={`${result.index ?? index}:${result.name ?? "file"}`} data-status={result.status}><strong>{result.name ?? `第 ${index + 1} 项`}</strong><span>{result.status === "created" ? "已保存" : result.status === "duplicate" ? "内容重复，未新建" : result.status === "failed" ? `失败：${result.error ?? "未知错误"}` : result.status}</span></li>)}</ul>{lastReceipt.state === "partial" ? <p>成功项已持久化；失败文件的字节没有留存。刷新后仍可查看此回执，请重新选择失败文件安全重试。</p> : null}</details> : null}
    <div className={selected ? "material-files-layout has-preview" : "material-files-layout"}>
      <div className="material-files-list" aria-label="文件列表">
        <p>拖入文件也可保存。当前 {snapshot?.total ?? 0} 项；列表按需加载，不读取全部正文或媒体。</p>
        {snapshot?.files.map((file) => <div key={file.id} className="material-file-row">
          <input type="checkbox" aria-label={`选择 ${file.displayName}`} checked={selectedIds.includes(file.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, file.id] : ids.filter((id) => id !== file.id))} />
          <button type="button" onClick={() => void open(file)} aria-pressed={selected?.id === file.id}><strong>{file.displayName}</strong><span>{fileTypeLabel(file.type)} · {formatBytes(file.size)} · {file.revisions.length} 个版本</span></button>
        </div>)}
        {!snapshot?.files.length ? <p>这个范围还没有文件。可直接选择、拖入或新建普通笔记。</p> : null}
        {snapshot && snapshot.total > snapshot.limit ? <nav className="material-files-pagination" aria-label="文件翻页"><button type="button" disabled={snapshot.offset === 0} onClick={() => setOffset(Math.max(0, snapshot.offset - snapshot.limit))}>上一页</button><span>{snapshot.offset + 1}–{Math.min(snapshot.offset + snapshot.files.length, snapshot.total)} / {snapshot.total}</span><button type="button" disabled={snapshot.offset + snapshot.limit >= snapshot.total} onClick={() => setOffset(snapshot.offset + snapshot.limit)}>下一页</button></nav> : null}
      </div>
      {selected ? <article className="material-file-preview" aria-label="文件预览">
        <header><div><small>{fileTypeLabel(selected.type)} · {selected.originalName}</small><h2>{selected.displayName}</h2></div><button type="button" onClick={() => { setSelected(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>关闭</button></header>
        <div className="material-file-capabilities">{capability.map((entry) => <span key={entry.label} data-ready={entry.ready}>{entry.label}：{entry.ready ? "是" : "否"}</span>)}</div>
        {selected.type === "text" ? editingText == null ? <textarea className="material-file-text-reader" aria-label="普通文本文件正文" readOnly value={selected.revision.textContent ?? ""} rows={20} onSelect={(event) => setFileSelection(textareaSelection(event.currentTarget))} onMouseUp={(event) => setFileSelection(textareaSelection(event.currentTarget))} onKeyUp={(event) => setFileSelection(textareaSelection(event.currentTarget))} /> : <textarea className="material-file-text-editor" aria-label="编辑普通笔记" value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={20} /> : selected.type === "image" && previewUrl ? <img src={previewUrl} alt={selected.displayName} /> : selected.type === "audio" && previewUrl ? <audio controls src={previewUrl}>当前浏览器不能播放该编码，请下载原件。</audio> : selected.type === "video" && previewUrl ? <video controls src={previewUrl}>当前浏览器不能播放该编码，请下载原件。</video> : selected.type === "pdf" && previewUrl ? <iframe title={`${selected.displayName} PDF 阅读`} sandbox="" src={previewUrl} /> : <p>原件已安全保存；此格式本轮不解析或编辑，可下载后使用原生应用打开。</p>}
        {fileSelection ? <aside className="material-file-selection"><strong>已选择第 {fileSelection.lineStart}–{fileSelection.lineEnd} 行</strong><p>{fileSelection.text}</p></aside> : null}
        <div className="materials-editor-actions"><button type="button" onClick={download}><Download aria-hidden="true" />下载原件</button><button type="button" onClick={renameSelected}>重命名</button><button type="button" onClick={() => void editSelectedTags()}>编辑标签</button><button type="button" onClick={() => replaceInput.current?.click()}>替换内容并建立新版本</button><input ref={replaceInput} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSelectedBytes(file); }} />{selected.type === "text" ? editingText == null ? <><button type="button" onClick={() => setEditingText(selected.revision.textContent ?? "")}>编辑笔记</button><button type="button" disabled={!fileSelection?.text.trim()} onClick={() => void createRuleFromFileSelection()}><Plus aria-hidden="true" />从选段建立设定</button></> : <><button type="button" onClick={() => void saveTextRevision()}>保存新修订</button><button type="button" onClick={() => setEditingText(null)}>取消编辑</button></> : null}{selected.type === "text" ? <button type="button" onClick={() => { const params = new URLSearchParams({ tianyiLane: "work", materialFileId: selected.id, materialFileRevision: selected.revision.sha256, materialReturn: currentMaterialRoute() }); if (fileSelection) { params.set("materialFileStart", String(fileSelection.charStart)); params.set("materialFileEnd", String(fileSelection.charEnd)); } window.location.assign(`/tianyi?${params.toString()}`); }}><Sparkles aria-hidden="true" />{fileSelection ? "在天意引用选段" : "在天意明确引用"}</button> : null}</div>
        {selected.type === "image" ? <section className="material-file-map-use"><label>作为底图加入<select value={targetMapId} onChange={(event) => setTargetMapId(event.target.value)}><option value="">选择现有地图</option>{maps.map((map) => <option key={map.id} value={map.id}>{map.title}</option>)}</select></label><button type="button" disabled={!targetMapId || busy} onClick={() => void useImageAsMapBackground()}><MapPin aria-hidden="true" />建立地图底图修订</button><small>这是作者明确的兼容转换：原图片仍是普通文件，地图 Owner 保存自己的底图资源与修订。</small></section> : null}
        <label>关联已有对象<select defaultValue="" onChange={(event) => { const target = props.worldObjects.find((item) => item.id === event.target.value); if (!target || !snapshot) return; void props.runtime.withConnection((token) => updateMaterialFile({ projectId: props.projectId, operationId: `materials.link.${crypto.randomUUID()}`, expectedRevision: snapshot.catalogRevision, fileId: selected.id, links: [...selected.links.filter((link) => !(link.kind === "world-object" && link.id === target.id)), { kind: "world-object", id: target.id, label: target.title }], token })).then(() => refresh()).then(() => props.onMessage(`已关联 ${target.title}。`)); }}><option value="">选择人物、地点、组织或设定</option>{props.worldObjects.map((item) => <option key={item.id} value={item.id}>{typeLabel(item.type)} · {item.title}</option>)}</select></label>
        {selected.links.length ? <p>关联：{selected.links.map((link) => link.kind === "world-object" ? <button key={`${link.kind}:${link.id}`} type="button" onClick={() => window.location.assign(`/library?materialId=${encodeURIComponent(link.id)}&materialReturn=${encodeURIComponent(currentMaterialRoute())}`)}>{link.label}</button> : <span key={`${link.kind}:${link.id}`}>{link.label}</span>)}</p> : null}
        <details><summary>技术详情</summary><code>文件 {selected.id}</code><code>修订 {selected.revision.id}</code><code>SHA-256 {selected.revision.sha256}</code></details>
      </article> : null}
    </div>
  </section>;
}

function fileBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error || new Error("文件读取失败。")); reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || ""); reader.readAsDataURL(file); }); }
function textBase64(value: string) { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return window.btoa(binary); }
function blobBase64(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error || new Error("文件读取失败。")); reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || ""); reader.readAsDataURL(blob); }); }
function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> { return new Promise((resolve, reject) => { const url = URL.createObjectURL(blob); const image = new Image(); image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片无法读取；没有建立地图底图。")); }; image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); }; image.src = url; }); }
function textareaSelection(element: HTMLTextAreaElement): SourceSelection | null { const charStart = element.selectionStart; const charEnd = element.selectionEnd; if (charEnd <= charStart) return null; return { charStart, charEnd, lineStart: element.value.slice(0, charStart).split("\n").length, lineEnd: element.value.slice(0, charEnd).split("\n").length, text: element.value.slice(charStart, charEnd) }; }
function fileTypeLabel(type: MaterialFileType) { return ({ text: "文本", image: "图片", pdf: "PDF", audio: "音频", video: "视频", office: "Office", archive: "压缩包", attachment: "附件" })[type]; }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`; }
function formatCapabilities(file: MaterialFileRecord) { return [
  { label: "已保存", ready: true },
  { label: "可预览", ready: ["text", "image", "pdf", "audio", "video"].includes(file.type) },
  { label: "可提取", ready: file.type === "text" },
  { label: "可编辑", ready: file.type === "text" },
  { label: "可供天意使用", ready: file.type === "text" }
]; }

function safeReturn(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

function SourceReader(props: {
  source: SourceDocument;
  selection: SourceSelection | null;
  onSelection(value: SourceSelection | null): void;
  onPrepareRule(): void;
  onOpenLibraryObject(): void;
  onUseInTianyi(): void;
}) {
  const revision = currentSourceRevision(props.source);
  const select = (element: HTMLTextAreaElement) => {
    const charStart = element.selectionStart;
    const charEnd = element.selectionEnd;
    if (charEnd <= charStart) { props.onSelection(null); return; }
    const before = element.value.slice(0, charStart);
    const through = element.value.slice(0, charEnd);
    props.onSelection({ charStart, charEnd, lineStart: before.split("\n").length, lineEnd: through.split("\n").length, text: element.value.slice(charStart, charEnd) });
  };
  return <section className="materials-source-reader" aria-label="原始来源阅读">
    <header><div><span>原始来源 · 未确认</span><h2>{props.source.title}</h2><p>{props.source.filename} · {formatRecentTime(props.source.updatedAt)}</p></div><FileText aria-hidden="true" /></header>
    <p>原文逐字保存在来源修订中。选择一段后可建立设定草稿；这一步不会自动确认内容。</p>
    <details className="materials-source-technical"><summary>来源技术详情</summary><code>来源 {props.source.sourceDocumentId}</code><code>修订 {props.source.currentRevisionHash}</code><code>关联资料 {props.source.libraryObjectId ?? "尚未建立"}</code></details>
    <textarea aria-label="来源原文" readOnly value={revision?.content ?? ""} rows={22} onSelect={(event) => select(event.currentTarget)} onMouseUp={(event) => select(event.currentTarget)} onKeyUp={(event) => select(event.currentTarget)} />
    {props.selection ? <aside aria-label="已选择来源段落"><Quote aria-hidden="true" /><div><strong>第 {props.selection.lineStart}–{props.selection.lineEnd} 行</strong><p>{props.selection.text}</p></div></aside> : <p className="materials-source-selection-hint">在上方原文中拖选一段，建立带准确来源位置的世界设定。</p>}
    <div className="materials-editor-actions"><button type="button" disabled={!props.selection?.text.trim()} onClick={props.onPrepareRule}><Plus aria-hidden="true" />从选中段落建立设定</button>{props.source.libraryObjectId ? <button type="button" onClick={props.onOpenLibraryObject}>打开可关联资料</button> : null}{props.source.libraryObjectId ? <button type="button" onClick={props.onUseInTianyi}><Sparkles aria-hidden="true" />在天意明确引用原文</button> : null}</div>
  </section>;
}

function currentSourceRevision(source: SourceDocument) {
  return source.revisions.find((revision) => revision.revisionHash === source.currentRevisionHash) ?? null;
}

function normalizeSourceFilename(filename: string, title: string): string {
  const trimmed = filename.trim();
  if (/\.(?:md|markdown|txt)$/iu.test(trimmed)) return trimmed;
  const safe = (trimmed || title).replace(/[\\/\0]/gu, "-").trim() || "未命名来源";
  return `${safe}.md`;
}

function formatRecentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function markdownBody(source: string): string {
  if (!source.startsWith("---\n")) return source;
  const end = source.indexOf("\n---\n", 4);
  return end < 0 ? source : source.slice(end + 5);
}

function materialLinkTargets(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu)].map((match) => match[1]!.trim()).filter(Boolean);
}

function currentMaterialRoute(): string {
  const target = new URL(window.location.href);
  const scrollTop = document.querySelector<HTMLElement>(".materials-shell")?.scrollTop ?? 0;
  if (scrollTop > 0) target.searchParams.set("materialScroll", String(Math.round(scrollTop)));
  else target.searchParams.delete("materialScroll");
  return `${target.pathname}${target.search}`;
}

function writeMaterialRoute(input: Partial<{ materialId: string | null; sourceDocumentId: string | null; revision: string | null; query: string; type: WorldObjectType | "source" | "all"; status: MaterialStatusFilter; sort: MaterialSort; categoryId: string | null }>): void {
  const params = new URLSearchParams(window.location.search);
  if (input.materialId !== undefined) setRouteValue(params, "materialId", input.materialId);
  if (input.sourceDocumentId !== undefined) { setRouteValue(params, "sourceDocumentId", input.sourceDocumentId); params.delete("directorySource"); }
  if (input.revision !== undefined) setRouteValue(params, "materialRevision", input.revision);
  if (input.query !== undefined) setRouteValue(params, "materialQuery", input.query || null);
  if (input.type !== undefined) setRouteValue(params, "materialType", input.type === "all" ? null : input.type);
  if (input.status !== undefined) setRouteValue(params, "materialStatus", input.status === "all" ? null : input.status);
  if (input.sort !== undefined) setRouteValue(params, "materialSort", input.sort === "recent" ? null : input.sort);
  if (input.categoryId !== undefined) setRouteValue(params, "materialCategory", input.categoryId);
  window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
}

function setRouteValue(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}
