import { ArrowLeft, ChevronRight, Folder, GripVertical } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { CHARACTER_OBSERVATION_MIME, createCharacterObservationDragPayload } from "../../../../../src/storyContracts/characterObservationSelection.ts";
import { useI18n } from "../i18n/I18nProvider";
import type { DirectoryWorkspaceState } from "./directoryWorkspaceState";

export function ProjectDirectoryTree(props: { groups: readonly ProjectDirectoryNode[]; selectedObjectId: string | null; projectId: string | null; workVersionId: string | null; initialState: DirectoryWorkspaceState; onStateChange(state: DirectoryWorkspaceState): void; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void }) {
  const { t } = useI18n();
  const [path, setPath] = useState<readonly string[]>(props.initialState.path);
  const [dragSelectionIds, setDragSelectionIds] = useState<string[]>([]);
  const restoreFocusId = useRef<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const trail = useMemo(() => resolveDirectoryTrail(props.groups, path), [path, props.groups]);
  const current = trail.at(-1) ?? null;
  const visible = current?.children ?? props.groups;
  useEffect(() => {
    if (trail.length !== path.length) setPath(trail.map((item) => item.id));
  }, [path, trail]);
  useEffect(() => {
    const focusId = restoreFocusId.current;
    if (!focusId) return;
    restoreFocusId.current = null;
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-directory-node="${CSS.escape(focusId)}"]`)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [path]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { if (pageRef.current) pageRef.current.scrollTop = props.initialState.scrollTop; });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    props.onStateChange({ ...props.initialState, path: [...path], query: "", selectedObjectId: props.selectedObjectId, scrollTop: pageRef.current?.scrollTop ?? props.initialState.scrollTop });
  }, [path, props.selectedObjectId]);
  const references = useMemo(() => collectDirectoryReferences(props.groups), [props.groups]);
  const toggleDragSelection = (node: ProjectDirectoryNode) => {
    if (!node.reference || node.reference.objectType !== "character") return;
    setDragSelectionIds((current) => current.includes(node.reference!.objectId) ? current.filter((id) => id !== node.reference!.objectId) : [...current, node.reference!.objectId]);
  };
  const beginDrag = (event: DragEvent<HTMLButtonElement>, node: ProjectDirectoryNode) => {
    if (!node.reference || node.reference.objectType !== "character") return;
    const ids = dragSelectionIds.includes(node.reference.objectId) ? dragSelectionIds : [node.reference.objectId];
    const selected = references.filter((reference) => ids.includes(reference.objectId));
    const payload = createCharacterObservationDragPayload({ projectId: props.projectId ?? node.reference.projectId, workVersionId: props.workVersionId, references: selected.length ? selected : [node.reference] });
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CHARACTER_OBSERVATION_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", selected.map((reference) => reference.objectId).join(","));
  };
  const enter = (node: ProjectDirectoryNode) => {
    if (node.reference) { props.onOpenReference(node.reference); return; }
    if (!node.children) return;
    setPath([...trail.map((item) => item.id), node.id]);
    props.onNavigate(node);
  };
  const goBack = () => {
    restoreFocusId.current = path.at(-1) ?? null;
    setPath(path.slice(0, -1));
  };
  return <nav className="project-directory-tree" aria-label={t("directory.tree")} onKeyDown={(event) => {
    if ((event.altKey && event.key === "ArrowLeft") || (event.key === "Escape" && path.length)) { event.preventDefault(); goBack(); }
  }}>
    <div className="project-directory-breadcrumb" aria-label={t("directory.breadcrumb")}>
      {path.length > 0 && <button type="button" className="project-directory-back" aria-label={t("directory.back")} onClick={goBack}><ArrowLeft aria-hidden="true" /></button>}
      <button type="button" onClick={() => setPath([])}>{t("directory.label")}</button>{trail.map((node, index) => <span key={node.id}><ChevronRight aria-hidden="true" /><button type="button" aria-current={index === trail.length - 1 ? "page" : undefined} onClick={() => setPath(trail.slice(0, index + 1).map((item) => item.id))}>{node.label}</button></span>)}
    </div>
    <div ref={pageRef} role="list" className="project-directory-page" data-directory-depth={path.length} onScroll={(event) => props.onStateChange({ ...props.initialState, path: [...path], query: "", selectedObjectId: props.selectedObjectId, scrollTop: event.currentTarget.scrollTop })}>
      {visible.map((node) => { const draggable = node.reference?.objectType === "character"; const dragSelected = Boolean(node.reference && dragSelectionIds.includes(node.reference.objectId)); return <button key={node.id} type="button" role="listitem" className={node.reference ? "project-directory-reference" : "project-directory-entry"} data-directory-node={node.id} data-selected={node.reference?.objectId === props.selectedObjectId || undefined} data-drag-selected={dragSelected || undefined} draggable={draggable} aria-pressed={draggable ? dragSelected : undefined} aria-current={node.reference?.objectId === props.selectedObjectId ? "page" : undefined} aria-label={`${node.label}${node.count === undefined ? "" : `，${node.count}`}${draggable ? "；可拖入角色观察" : ""}`} onDragStart={(event) => beginDrag(event, node)} onClick={(event) => { if (draggable && (event.metaKey || event.ctrlKey || event.shiftKey)) { toggleDragSelection(node); return; } enter(node); }}>{draggable && <GripVertical className="project-directory-drag-handle" aria-hidden="true" />} {!node.reference && <Folder aria-hidden="true" />}<span title={node.label}>{node.label}</span>{node.reference?.objectId === props.selectedObjectId ? <em>{t("directory.current")}</em> : node.count !== undefined ? <strong>{node.count}</strong> : null}{!node.reference && <ChevronRight aria-hidden="true" />}</button>; })}
    </div>
  </nav>;
}

function collectDirectoryReferences(nodes: readonly ProjectDirectoryNode[]): ProjectDirectoryStableReference[] {
  return nodes.flatMap((node) => [...(node.reference ? [node.reference] : []), ...collectDirectoryReferences(node.children ?? [])]);
}

function resolveDirectoryTrail(groups: readonly ProjectDirectoryNode[], path: readonly string[]): ProjectDirectoryNode[] {
  const trail: ProjectDirectoryNode[] = [];
  let nodes = groups;
  for (const id of path) {
    const node = nodes.find((item) => item.id === id);
    if (!node) break;
    trail.push(node);
    nodes = node.children ?? [];
  }
  return trail;
}
