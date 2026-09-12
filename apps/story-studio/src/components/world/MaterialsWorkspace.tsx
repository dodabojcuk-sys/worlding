import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  FileUp,
  Link2,
  MapPin,
  Plus,
  Quote,
  Save,
  Sparkles,
  UsersRound,
} from "lucide-react";

import {
  createWorldObject,
  getDocumentRevisionHistory,
  getWorldLibrary,
  importSourceDocument,
  listSourceImportReviews,
  previewDocumentRevision,
  readWorldObject,
  updateWorldObject,
  type WorldObject,
  type WorldObjectSummary,
  type WorldObjectType,
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
          `${item.title} ${item.tags.join(" ")} ${item.aliases.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      )
      .sort((left, right) => sort === "title"
        ? left.title.localeCompare(right.title, "zh-CN")
        : (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.title.localeCompare(right.title, "zh-CN")),
    [items, query, sort, sourceLibraryObjectIds, statusFilter, type]);
  const filteredSources = useMemo(() => sources
    .filter((source) => (type === "all" || type === "source") && `${source.title} ${source.filename} ${currentSourceRevision(source)?.content ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sort === "title" ? left.title.localeCompare(right.title, "zh-CN") : right.updatedAt.localeCompare(left.updatedAt)), [query, sort, sources, type]);
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
            <button
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
            </button>
            <button type="button" onClick={() => { setImporting(true); setCreating(false); setSelected(null); setSelectedSource(null); writeInternalRoute({ materialId: null, sourceDocumentId: null }); }}>
              <FileUp aria-hidden="true" />
              导入来源
            </button>
          </div>
        </header>
        <div className="materials-workspace-grid">
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
        </div>
      </section>
    </main>
  );
}

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

function writeMaterialRoute(input: Partial<{ materialId: string | null; sourceDocumentId: string | null; revision: string | null; query: string; type: WorldObjectType | "source" | "all"; status: MaterialStatusFilter; sort: MaterialSort }>): void {
  const params = new URLSearchParams(window.location.search);
  if (input.materialId !== undefined) setRouteValue(params, "materialId", input.materialId);
  if (input.sourceDocumentId !== undefined) { setRouteValue(params, "sourceDocumentId", input.sourceDocumentId); params.delete("directorySource"); }
  if (input.revision !== undefined) setRouteValue(params, "materialRevision", input.revision);
  if (input.query !== undefined) setRouteValue(params, "materialQuery", input.query || null);
  if (input.type !== undefined) setRouteValue(params, "materialType", input.type === "all" ? null : input.type);
  if (input.status !== undefined) setRouteValue(params, "materialStatus", input.status === "all" ? null : input.status);
  if (input.sort !== undefined) setRouteValue(params, "materialSort", input.sort === "recent" ? null : input.sort);
  window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
}

function setRouteValue(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}
