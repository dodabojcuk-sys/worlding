import { I18nProvider } from "./product-shell/i18n/I18nProvider";
import { TianyanShellRuntime } from "./product-shell/runtime/TianyanShellRuntime";
import { SettingsStorageRoute } from "./settings/storage/SettingsStorageRoute";

/** Top-level dependency assembly only. */
export function App() {
  return <I18nProvider>{window.location.pathname === "/settings/storage" ? <SettingsStorageRoute /> : <TianyanShellRuntime />}</I18nProvider>;
}
