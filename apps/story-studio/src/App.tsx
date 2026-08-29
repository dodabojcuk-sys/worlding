import { I18nProvider } from "./product-shell/i18n/I18nProvider";
import { TianyanShellRuntime } from "./product-shell/runtime/TianyanShellRuntime";
import { SettingsStorageRoute } from "./settings/storage/SettingsStorageRoute";

/** Top-level dependency assembly only. */
export function App() {
  const utilityRoute = window.location.pathname === "/settings" || window.location.pathname.startsWith("/settings/");
  return <I18nProvider>{utilityRoute ? <SettingsStorageRoute /> : <TianyanShellRuntime />}</I18nProvider>;
}
