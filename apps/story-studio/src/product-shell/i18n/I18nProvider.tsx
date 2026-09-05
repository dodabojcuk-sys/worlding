import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { translations, type Locale, type TranslationKey } from "./translations";

type I18nContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  toggleLocale(): void;
  t(key: TranslationKey): string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const requested = new URLSearchParams(window.location.search).get("locale");
    const retained = window.localStorage.getItem("tianyan.shell.locale");
    return requested === "en-US" || requested === "zh-CN" ? requested : retained === "en-US" ? "en-US" : "zh-CN";
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem("tianyan.shell.locale", locale);
    const url = new URL(window.location.href);
    url.searchParams.set("locale", locale);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale((current) => current === "zh-CN" ? "en-US" : "zh-CN"),
    t: (key) => translations[locale][key]
  }), [locale]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
