import { ChevronDown, Cloud, MoonStar, Search, SunMedium } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useI18n } from "../i18n/I18nProvider";
import type { ShellTheme } from "../theme/theme";

export function GlobalStatusBar(props: {
  theme: ShellTheme;
  onToggleTheme(): void;
}) {
  const { locale, t, toggleLocale } = useI18n();
  const [searchFeedback, setSearchFeedback] = useState("");

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchFeedback(t("topbar.searchUnavailable"));
  };

  return <header className="shell-topbar" aria-label={t("topbar.status")}>
    <div className="shell-topbar-context">
      <button type="button" className="shell-context-control" title={t("topbar.project")}>
        <span><small>{t("topbar.project")}</small><strong>{t("topbar.projectName")}</strong></span>
        <ChevronDown aria-hidden="true" />
      </button>
      <span className="shell-topbar-separator" aria-hidden="true" />
      <button type="button" className="shell-context-control is-version" title={t("topbar.version")}>
        <span><small>{t("topbar.version")}</small><strong>{t("topbar.versionName")}</strong></span>
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
    <form className="shell-global-search" role="search" onSubmit={submitSearch}>
      <Search aria-hidden="true" />
      <label className="shell-visually-hidden" htmlFor="shell-global-search">{t("topbar.search")}</label>
      <input id="shell-global-search" type="search" placeholder={t("topbar.searchPlaceholder")} aria-describedby="shell-search-feedback" />
      <span id="shell-search-feedback" className="shell-visually-hidden" role="status">{searchFeedback}</span>
    </form>
    <div className="shell-topbar-actions">
      <div className="shell-runtime-status" title={t("topbar.status")}><Cloud aria-hidden="true" /><span>{t("topbar.localShell")}</span></div>
      <button type="button" className="shell-topbar-button is-language" aria-label={t("topbar.language")} title={t("topbar.language")} onClick={toggleLocale} data-locale={locale}>
        {t("topbar.languageValue")}
      </button>
      <button type="button" className="shell-topbar-button" aria-label={t("topbar.theme")} title={t("topbar.theme")} onClick={props.onToggleTheme}>
        {props.theme === "cloud-ink" ? <SunMedium aria-hidden="true" /> : <MoonStar aria-hidden="true" />}
        <span>{t(props.theme === "cloud-ink" ? "topbar.themeCloud" : "topbar.themeNight")}</span>
      </button>
    </div>
  </header>;
}
