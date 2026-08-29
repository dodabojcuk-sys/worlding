import { BookOpen, ChevronLeft, ChevronRight, Link2, Pencil, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getObjectCatalog, getWorldLibrary, readWorldObject } from "../../../lib/localTransport";
import { useI18n } from "../../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import { characterRoleLabel } from "./CharacterCreateDialog";
import { getCharacterDetailSections, getCharacterDirectorySummary } from "./characterDirectoryPresentation";
import { UNVERSIONED_CATALOG_SCOPE, type CharacterDirectoryRecord } from "./useCharacterDirectory";

export function CharacterInspectorLoader(props: { runtime: TianyanShellRuntimeState; objectId: string; onClose(): void; onOpenFull(): void }) {
  const [record, setRecord] = useState<CharacterDirectoryRecord | null>(null);
  useEffect(() => {
    let active = true; setRecord(null); if (!props.runtime.project) return;
    const workVersionId = props.runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE;
    void Promise.all([readWorldObject(props.runtime.project.id, props.objectId), getObjectCatalog(props.runtime.project.id, workVersionId), getWorldLibrary(props.runtime.project.id)]).then(([object, catalog, library]) => {
      if (!active) return;
      if (object.type !== "character") { props.onClose(); return; }
      const metadata = catalog.records.find((item) => item.objectId === object.id && item.objectType === "character");
      const categories = new Map(library.folders.filter((folder) => folder.kind === "custom-category").map((folder) => [folder.id, folder.title]));
      const eventIds = new Set([...(object.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []), ...object.linkedObjects.filter((item) => item.type === "event").map((item) => item.id)]);
      setRecord({ object, categoryId: metadata?.categoryId ?? null, categoryName: metadata?.categoryId ? categories.get(metadata.categoryId) ?? null : null, trashedAt: metadata?.trashedAt ?? null, trashedFrom: metadata?.trashedFrom ?? null, eventCount: eventIds.size, manualOrder: metadata?.displayOrder ?? null });
    }).catch(() => { if (active) props.onClose(); });
    return () => { active = false; };
  }, [props.objectId, props.runtime.project?.id, props.runtime.workVersionId]);
  return record ? <CharacterInspectorCard record={record} onClose={props.onClose} onOpenFull={props.onOpenFull} /> : null;
}

export function CharacterInspectorCard(props: { record: CharacterDirectoryRecord; onClose(): void; onOpenFull(): void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"basic" | "story" | "relations">("basic");
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const object = props.record.object;
  const role = characterRoleLabel(object.subtype, t);
  const summary = getCharacterDirectorySummary(object, t("character.noSummary"));
  const details = getCharacterDetailSections(object.body);
  const relations = object.worldProjection?.confirmedRelations ?? [];
  const events = object.worldProjection?.timelineParticipations ?? [];
  const edit = (label: string) => <button type="button" className="character-inspector-edit" onClick={props.onOpenFull} aria-label={`${t("character.edit")}${label}`} title={`${t("character.edit")}${label}`}><Pencil aria-hidden="true" /></button>;

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); props.onClose(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); trigger?.focus(); };
  }, [props.onClose]);

  return <aside className="character-inspector" aria-label={t("character.inspector")} aria-expanded={expanded} data-expanded={expanded} data-testid="character-inspector">
    <header><div className="character-avatar">{object.card.portrait ? <img src={object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</div><div className="character-inspector-identity"><h2><span>{object.title}</span>{edit(t("character.name"))}</h2><div><span>{role}</span><b>{object.status === "archived" ? t("character.archived") : t("character.confirmed")}</b></div></div><div className="character-inspector-header-actions"><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? t("character.collapseInspector") : t("character.expandInspector")} aria-expanded={expanded} title={expanded ? t("character.collapseInspector") : t("character.expandInspector")}>{expanded ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}</button><button ref={closeRef} type="button" onClick={props.onClose} aria-label={t("common.close")} title={t("common.close")}><X aria-hidden="true" /></button></div></header>
    <div className="character-inspector-tabs" role="tablist">{(["basic", "story", "relations"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{t(`character.tab.${value}`)}</button>)}</div>
    <section>
      {tab === "basic" && <><div className="character-inspector-summary"><div><p>{t("character.summary")}</p>{edit(t("character.profileBody"))}</div><h3>{summary}</h3></div><dl className="character-inspector-facts"><div><dt>{t("character.aliases")}</dt><dd><span>{object.aliases.join("、") || t("common.none")}</span>{edit(t("character.aliases"))}</dd></div><div><dt>{t("character.category")}</dt><dd>{props.record.categoryId ? props.record.categoryName || t("character.unknownCategory") : t("character.uncategorized")}</dd></div><div><dt>{t("character.tag")}</dt><dd><span>{object.tags.join("、") || t("common.none")}</span>{edit(t("character.tag"))}</dd></div><div><dt>{t("character.volumeState")}</dt><dd><span>{object.status === "archived" ? t("character.archived") : t("character.confirmed")}</span>{edit(t("character.volumeState"))}</dd></div></dl><div className="character-inspector-snapshot"><div><p>{t("character.eventCount")}</p><strong>{events.length}</strong><span>{events.length ? events.slice(0, 2).map((event) => event.eventId).join(" · ") : t("character.noEvents")}</span></div><div><p>{t("character.relationCount")}</p><strong>{relations.length}</strong><span>{relations.length ? relations.slice(0, 2).map((relation) => relation.otherObject.title).join(" · ") : t("character.noRelations")}</span></div></div>{expanded && <div className="character-inspector-details"><h3>{t("character.readOnlyDetails")}</h3>{details.length ? details.map((detail) => <article key={detail.heading}><h4>{detail.heading}</h4><p>{detail.content}</p></article>) : <p>{t("character.noAdditionalDetails")}</p>}</div>}</>}
      {tab === "story" && <><h3><BookOpen aria-hidden="true" />{t("character.participatingEvents")}</h3>{events.length ? <ul>{events.map((event) => <li key={event.eventId}>{event.eventId}</li>)}</ul> : <p>{t("character.noEvents")}</p>}</>}
      {tab === "relations" && <><h3><Link2 aria-hidden="true" />{t("character.relations")}</h3>{relations.length ? <ul>{relations.map((relation) => <li key={relation.id}>{relation.otherObject.title}</li>)}</ul> : <p>{t("character.noRelations")}</p>}</>}
    </section>
    <footer><button type="button" onClick={props.onOpenFull}><Pencil aria-hidden="true" />{t("character.openFull")}</button></footer>
  </aside>;
}
