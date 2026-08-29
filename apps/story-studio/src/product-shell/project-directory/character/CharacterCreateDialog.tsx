import { useEffect, useRef, useState } from "react";

import type { TranslationKey } from "../../i18n/translations";
import { useI18n } from "../../i18n/I18nProvider";
import type { CharacterCreateInput, CharacterCreateResult } from "./useCharacterDirectory";

export type CharacterRoleLevel = "main" | "supporting" | "minor";

export function characterRoleLabel(value: string, t: (key: TranslationKey) => string) {
  if (value === "main" || value === "主要角色") return t("character.role.main");
  if (value === "supporting" || value === "配角") return t("character.role.supporting");
  if (value === "minor" || value === "次要角色") return t("character.role.minor");
  return value || t("character.levelUnknown");
}

type FormValues = {
  title: string;
  roleLevel: CharacterRoleLevel;
  aliases: string;
  summary: string;
  categoryId: string;
  tags: string;
};

const initialValues: FormValues = { title: "", roleLevel: "main", aliases: "", summary: "", categoryId: "", tags: "" };

export function CharacterCreateDialog(props: {
  onClose(): void;
  onCreate(input: CharacterCreateInput): Promise<CharacterCreateResult>;
  onRetryCategory(objectId: string, categoryId: string): Promise<void>;
  onCreated(result: CharacterCreateResult): void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(initialValues);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CharacterCreateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  const update = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) => setValues((current) => ({ ...current, [key]: value }));
  const input = (): CharacterCreateInput => ({
    title: values.title.trim(),
    subtype: values.roleLevel,
    aliases: splitList(values.aliases),
    tags: splitList(values.tags),
    summary: values.summary.trim(),
    categoryId: values.categoryId.trim() || null
  });

  const submit = async () => {
    if (submitInFlight.current || created) return;
    if (!values.title.trim()) { setFieldError(t("character.nameRequired")); return; }
    if (values.categoryId.trim() && !/^[A-Za-z0-9._:-]{1,180}$/u.test(values.categoryId.trim())) { setFieldError(t("character.categoryIdInvalid")); return; }
    submitInFlight.current = true;
    setSubmitting(true);
    setFieldError(null);
    setSubmitError(null);
    try {
      const result = await props.onCreate(input());
      props.onCreated(result);
      if (result.categoryError) {
        setCreated(result);
        setSubmitError(`${t("character.createdCategoryFailed")} ${result.categoryError}`);
        return;
      }
      props.onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("character.actionFailed"));
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  const retryCategory = async () => {
    if (!created || !values.categoryId.trim() || submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await props.onRetryCategory(created.objectId, values.categoryId.trim());
      props.onClose();
    } catch (error) {
      setSubmitError(`${t("character.createdCategoryFailed")} ${error instanceof Error ? error.message : t("character.actionFailed")}`);
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  return <div className="character-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !submitting) props.onClose(); }}>
    <section className="character-create-dialog" role="dialog" aria-modal="true" aria-labelledby="character-create-title" aria-describedby={fieldError || submitError ? "character-create-error" : undefined} onKeyDown={(event) => { if (event.key === "Escape" && !submitting) props.onClose(); }}>
      <header>
        <div><p>{t("character.createEyebrow")}</p><h2 id="character-create-title">{t("character.createTitle")}</h2></div>
        <button type="button" onClick={props.onClose} disabled={submitting} aria-label={t("common.close")}>×</button>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="character-create-field"><span>{t("character.name")} <b aria-hidden="true">*</b></span><input ref={titleRef} value={values.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "character-create-error" : undefined} maxLength={80} disabled={Boolean(created)} /></label>
        <label className="character-create-field"><span>{t("character.roleLevel")}</span><select value={values.roleLevel} onChange={(event) => update("roleLevel", event.target.value as CharacterRoleLevel)} disabled={Boolean(created)}><option value="main">{t("character.role.main")}</option><option value="supporting">{t("character.role.supporting")}</option><option value="minor">{t("character.role.minor")}</option></select></label>
        <label className="character-create-field"><span>{t("character.aliases")}</span><input value={values.aliases} onChange={(event) => update("aliases", event.target.value)} placeholder={t("character.listFieldHint")} disabled={Boolean(created)} /></label>
        <label className="character-create-field"><span>{t("character.summary")}</span><textarea value={values.summary} onChange={(event) => update("summary", event.target.value)} rows={3} maxLength={600} disabled={Boolean(created)} /></label>
        <div className="character-create-grid"><label className="character-create-field"><span>{t("character.category")}</span><input value={values.categoryId} onChange={(event) => update("categoryId", event.target.value)} placeholder={t("character.categoryIdHint")} disabled={Boolean(created)} /></label><label className="character-create-field"><span>{t("character.tag")}</span><input value={values.tags} onChange={(event) => update("tags", event.target.value)} placeholder={t("character.listFieldHint")} disabled={Boolean(created)} /></label></div>
        {(fieldError || submitError) && <p className="character-create-error" id="character-create-error" role="alert">{fieldError || submitError}</p>}
        <footer>{created ? <><button type="button" onClick={props.onClose} disabled={submitting}>{t("common.close")}</button><button type="button" onClick={() => void retryCategory()} disabled={submitting || !values.categoryId.trim()}>{submitting ? t("character.saving") : t("character.retryCategory")}</button></> : <><button type="button" onClick={props.onClose} disabled={submitting}>{t("character.cancel")}</button><button type="submit" disabled={submitting}>{submitting ? t("character.saving") : t("character.createSave")}</button></>}</footer>
      </form>
    </section>
  </div>;
}

function splitList(value: string) {
  return [...new Set(value.split(/[，,\n]/u).map((item) => item.trim()).filter(Boolean))];
}
