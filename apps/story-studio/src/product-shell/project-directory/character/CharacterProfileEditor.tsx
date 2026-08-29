import { Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { readWorldObject, updateWorldObject, type WorldObject } from "../../../lib/localTransport";
import { useI18n } from "../../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";

/** Stable URL-driven editor that delegates every write to WorldObject/Card Presentation. */
export function CharacterProfileEditor(props: { runtime: TianyanShellRuntimeState; objectId: string; onClose(): void }) {
  const { t } = useI18n();
  const [object, setObject] = useState<WorldObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    if (!props.runtime.project) return;
    void readWorldObject(props.runtime.project.id, props.objectId).then((next) => {
      if (active && next.type === "character") setObject(next);
      else if (active) props.onClose();
    }).catch(() => { if (active) props.onClose(); });
    return () => { active = false; };
  }, [props.objectId, props.runtime.project?.id, props.onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); props.onClose(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!object || !props.runtime.project) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      const result = await props.runtime.withConnection((token) => updateWorldObject({
        projectId: props.runtime.project!.id,
        objectId: object.id,
        expectedHash: object.revisionToken,
        presentationExpectedHash: object.card.revisionToken,
        writeMarkdown: true,
        writePresentation: false,
        title: String(data.get("title") || "").trim(),
        status: String(data.get("status") || "active"),
        subtype: String(data.get("subtype") || "").trim() || undefined,
        tags: String(data.get("tags") || "").split(",").map((value) => value.trim()).filter(Boolean),
        aliases: String(data.get("aliases") || "").split(/[,，]/u).map((value) => value.trim()).filter(Boolean),
        body: String(data.get("body") || ""),
        typedProperties: object.typedProperties,
        profile: object.profile,
        card: object.card,
        token
      }));
      if (result.conflict) throw new Error(t("character.editConflict"));
      props.onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("character.actionFailed")); }
    finally { setSaving(false); }
  };

  if (!object) return null;
  return <div className="character-profile-editor-backdrop" role="presentation">
    <form className="character-profile-editor" aria-label={t("character.fullEditor")} onSubmit={save}>
      <header><div><p>{t("character.directory")}</p><h2>{t("character.fullEditor")}</h2></div><button ref={closeRef} type="button" aria-label={t("common.close")} onClick={props.onClose}><X aria-hidden="true" /></button></header>
      <label><span>{t("character.name")}</span><input name="title" required defaultValue={object.title} /></label>
      <div className="character-profile-editor-grid"><label><span>{t("character.roleLevel")}</span><input name="subtype" defaultValue={object.subtype ?? ""} /></label><label><span>{t("character.volumeState")}</span><select name="status" defaultValue={object.status}><option value="active">{t("character.confirmed")}</option><option value="archived">{t("character.archived")}</option></select></label></div>
      <label><span>{t("character.aliases")}</span><input name="aliases" defaultValue={object.aliases.join("，")} /></label>
      <label><span>{t("character.tag")}</span><input name="tags" defaultValue={object.tags.join(", ")} /></label>
      <label><span>{t("character.profileBody")}</span><textarea name="body" rows={14} defaultValue={object.body} /></label>
      {error && <p className="character-create-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={saving} onClick={props.onClose}>{t("character.cancel")}</button><button type="submit" disabled={saving}><Save aria-hidden="true" />{saving ? t("character.saving") : t("character.save")}</button></footer>
    </form>
  </div>;
}
