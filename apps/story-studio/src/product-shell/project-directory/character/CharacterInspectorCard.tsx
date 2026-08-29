import { BookOpen, Link2, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { UNVERSIONED_CATALOG_SCOPE, type CharacterDirectoryRecord } from "./useCharacterDirectory";
import { useI18n } from "../../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import { getObjectCatalog, readWorldObject } from "../../../lib/localTransport";
import { characterRoleLabel } from "./CharacterCreateDialog";

export function CharacterInspectorLoader(props: { runtime: TianyanShellRuntimeState; objectId: string; onClose(): void }) {
  const [record, setRecord] = useState<CharacterDirectoryRecord | null>(null);
  useEffect(() => { let active = true; setRecord(null); if (!props.runtime.project) return; const workVersionId = props.runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE;
    void Promise.all([readWorldObject(props.runtime.project.id, props.objectId), getObjectCatalog(props.runtime.project.id, workVersionId)]).then(([object, catalog]) => {
      if (!active) return; if (object.type !== "character") { props.onClose(); return; } const metadata = catalog.records.find((item) => item.objectId === object.id && item.objectType === "character");
      const eventIds = new Set([...(object.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []), ...object.linkedObjects.filter((item) => item.type === "event").map((item) => item.id)]);
      setRecord({ object, categoryId: metadata?.categoryId ?? null, trashedAt: metadata?.trashedAt ?? null, trashedFrom: metadata?.trashedFrom ?? null, eventCount: eventIds.size });
    }).catch(() => { if (active) props.onClose(); }); return () => { active = false; };
  }, [props.objectId, props.runtime.project?.id, props.runtime.workVersionId]);
  return record ? <CharacterInspectorCard record={record} onClose={props.onClose} /> : null;
}

export function CharacterInspectorCard(props: { record: CharacterDirectoryRecord; onClose(): void }) {
  const { t } = useI18n(); const [tab, setTab] = useState<"basic" | "story" | "relations">("basic"); const [notice, setNotice] = useState(false);
  const object = props.record.object; const role = characterRoleLabel(object.subtype, t);
  const profileSummary = object.profile?.fields.summary?.value;
  const summary = (typeof profileSummary === "string" ? profileSummary : null) || summaryFromBody(object.body) || t("character.noSummary");
  const relations = object.worldProjection?.confirmedRelations ?? [];
  const events = object.worldProjection?.timelineParticipations ?? [];
  return <aside className="character-inspector" aria-label={t("character.inspector")} data-testid="character-inspector">
    <header><div className="character-avatar">{object.card.portrait ? <img src={object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</div><div className="character-inspector-identity"><h2>{object.title}</h2><div><span>{role}</span><b>{object.status === "archived" ? t("character.archived") : t("character.confirmed")}</b></div></div><button type="button" onClick={props.onClose} aria-label={t("common.close")}><X aria-hidden="true" /></button></header>
    <div className="character-inspector-tabs" role="tablist">{(["basic", "story", "relations"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{t(`character.tab.${value}`)}</button>)}</div>
    <section>
      {tab === "basic" && <><div className="character-inspector-summary"><p>{t("character.summary")}</p><h3>{summary}</h3></div><dl className="character-inspector-facts"><div><dt>{t("character.aliases")}</dt><dd>{object.aliases.join("、") || t("common.none")}</dd></div><div><dt>{t("character.category")}</dt><dd>{props.record.categoryId || t("character.uncategorized")}</dd></div><div><dt>{t("character.volumeState")}</dt><dd>{object.status === "archived" ? t("character.archived") : t("character.confirmed")}</dd></div></dl><div className="character-inspector-snapshot"><div><p>{t("character.eventCount")}</p><strong>{events.length}</strong><span>{events.length ? events.slice(0, 2).map((event) => event.eventId).join(" · ") : t("character.noEvents")}</span></div><div><p>{t("character.relationCount")}</p><strong>{relations.length}</strong><span>{relations.length ? relations.slice(0, 2).map((relation) => relation.otherObject.title).join(" · ") : t("character.noRelations")}</span></div></div></>}
      {tab === "story" && <><h3><BookOpen aria-hidden="true" />{t("character.participatingEvents")}</h3>{events.length ? <ul>{events.slice(0, 8).map((event) => <li key={event.eventId}>{event.eventId}</li>)}</ul> : <p>{t("character.noEvents")}</p>}</>}
      {tab === "relations" && <><h3><Link2 aria-hidden="true" />{t("character.relations")}</h3>{relations.length ? <ul>{relations.slice(0, 8).map((relation) => <li key={relation.id}>{relation.otherObject.title}</li>)}</ul> : <p>{t("character.noRelations")}</p>}</>}
    </section>
    <footer><button type="button" onClick={() => setNotice(true)}>{t("character.openFull")}</button>{notice && <p role="status">{t("character.fullUnavailable")}</p>}</footer>
  </aside>;
}

function summaryFromBody(body: string) {
  const match = body.match(/##\s+背景与出身\s*\n+([^#\n][\s\S]*?)(?:\n\s*##|$)/u);
  return match?.[1]?.trim().replace(/\s+/gu, " ") || "";
}
