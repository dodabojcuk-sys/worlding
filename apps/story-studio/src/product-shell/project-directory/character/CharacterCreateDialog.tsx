import { useEffect, useRef, useState } from "react";

import type { TranslationKey } from "../../i18n/translations";
import { useI18n } from "../../i18n/I18nProvider";
import { validateCustomRoleLevel } from "./characterDirectoryPresentation";
import type { CharacterCreateInput, CharacterCreateResult, CharacterDirectoryCategory } from "./useCharacterDirectory";

export function characterRoleLabel(value: string, t: (key: TranslationKey) => string) {
  if (value === "main" || value === "主要角色") return t("character.role.main");
  if (value === "supporting" || value === "配角") return t("character.role.supporting");
  if (value === "minor" || value === "次要角色") return t("character.role.minor");
  return value || t("character.levelUnknown");
}

type FormValues = {
  title: string;
  roleLevel: string;
  aliases: string;
  summary: string;
  categoryId: string;
  newCategory: string;
  tags: string;
};

const initialValues: FormValues = { title: "", roleLevel: "main", aliases: "", summary: "", categoryId: "", newCategory: "", tags: "" };

export function CharacterCreateDialog(props: {
  onClose(): void;
  onCreate(input: CharacterCreateInput): Promise<CharacterCreateResult>;
  onCreateCategory(title: string): Promise<CharacterDirectoryCategory>;
  onRetryCategory(objectId: string, categoryId: string): Promise<void>;
  onCreated(result: CharacterCreateResult): void;
  categories: CharacterDirectoryCategory[];
  roleLevels: readonly string[];
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(initialValues);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CharacterCreateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createdCategories, setCreatedCategories] = useState<CharacterDirectoryCategory[]>([]);
  const submitInFlight = useRef(false);
  const valuesRef = useRef<FormValues>(initialValues);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  const update = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) => {
    valuesRef.current = { ...valuesRef.current, [key]: value };
    setValues(valuesRef.current);
  };
  const categories = [...props.categories, ...createdCategories.filter((candidate) => !props.categories.some((category) => category.id === candidate.id))];
  const input = (): CharacterCreateInput => ({
    title: valuesRef.current.title.trim(),
    subtype: valuesRef.current.roleLevel,
    aliases: splitList(valuesRef.current.aliases),
    tags: splitList(valuesRef.current.tags),
    summary: valuesRef.current.summary.trim(),
    categoryId: valuesRef.current.categoryId.trim() || null
  });

  const submit = async () => {
    if (submitInFlight.current || created) return;
    if (!valuesRef.current.title.trim()) { setFieldError(t("character.nameRequired")); return; }
    const role = validateCustomRoleLevel(valuesRef.current.roleLevel, ["main", "supporting", "minor", "主要角色", "配角", "次要角色"]);
    if ("error" in role && role.error !== "duplicate") { setFieldError(t("character.roleLevelInvalid")); return; }
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

  const createCategory = async () => {
    if (!valuesRef.current.newCategory.trim() || creatingCategory || created) return;
    setCreatingCategory(true); setFieldError(null); setSubmitError(null);
    try {
      const category = await props.onCreateCategory(valuesRef.current.newCategory.trim());
      setCreatedCategories((current) => current.some((candidate) => candidate.id === category.id) ? current : [...current, category]);
      valuesRef.current = { ...valuesRef.current, categoryId: category.id, newCategory: "" };
      setValues(valuesRef.current);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("character.categoryCreateFailed"));
    } finally { setCreatingCategory(false); }
  };

  const retryCategory = async () => {
    if (!created || !valuesRef.current.categoryId.trim() || submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await props.onRetryCategory(created.objectId, valuesRef.current.categoryId.trim());
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
        <label className="character-create-field"><span>{t("character.roleLevel")}</span><input list="character-role-level-options" value={values.roleLevel} onChange={(event) => update("roleLevel", event.target.value)} disabled={Boolean(created)} /><datalist id="character-role-level-options"><option value="main">{t("character.role.main")}</option><option value="supporting">{t("character.role.supporting")}</option><option value="minor">{t("character.role.minor")}</option>{props.roleLevels.filter((level) => !["main", "supporting", "minor"].includes(level)).map((level) => <option key={level} value={level} />)}</datalist><small>{t("character.roleLevelHint")}</small></label>
        <label className="character-create-field"><span>{t("character.aliases")}</span><input value={values.aliases} onChange={(event) => update("aliases", event.target.value)} placeholder={t("character.listFieldHint")} disabled={Boolean(created)} /></label>
        <label className="character-create-field"><span>{t("character.summary")}</span><textarea value={values.summary} onChange={(event) => update("summary", event.target.value)} rows={3} maxLength={600} disabled={Boolean(created)} /></label>
        <details className="character-create-more"><summary>{t("character.moreSettings")}</summary><div className="character-create-grid"><div className="character-create-field"><span>{t("character.category")}</span><select value={values.categoryId} onChange={(event) => update("categoryId", event.target.value)} disabled={Boolean(created)}><option value="">{t("character.uncategorized")}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select><div className="character-create-inline"><input value={values.newCategory} onChange={(event) => update("newCategory", event.target.value)} placeholder={t("character.newCategoryPlaceholder")} disabled={Boolean(created) || creatingCategory} /><button type="button" onClick={() => void createCategory()} disabled={Boolean(created) || creatingCategory || !values.newCategory.trim()}>{creatingCategory ? t("character.saving") : t("character.newCategory")}</button></div></div><label className="character-create-field"><span>{t("character.tag")}</span><input value={values.tags} onChange={(event) => update("tags", event.target.value)} placeholder={t("character.listFieldHint")} disabled={Boolean(created)} /></label></div></details>
        {(fieldError || submitError) && <p className="character-create-error" id="character-create-error" role="alert">{fieldError || submitError}</p>}
        <footer>{created ? <><button type="button" onClick={props.onClose} disabled={submitting}>{t("common.close")}</button><button type="button" onClick={() => void retryCategory()} disabled={submitting || !values.categoryId.trim()}>{submitting ? t("character.saving") : t("character.retryCategory")}</button></> : <><button type="button" onClick={props.onClose} disabled={submitting}>{t("character.cancel")}</button><button type="submit" disabled={submitting}>{submitting ? t("character.saving") : t("character.createSave")}</button></>}</footer>
      </form>
    </section>
  </div>;
}

function splitList(value: string) {
  return [...new Set(value.split(/[，,\n]/u).map((item) => item.trim()).filter(Boolean))];
}
