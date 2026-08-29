import { I18nProvider } from "./product-shell/i18n/I18nProvider";
import { TianyanShellRuntime } from "./product-shell/runtime/TianyanShellRuntime";

/** Top-level dependency assembly only. */
export function App() {
  return <I18nProvider><TianyanShellRuntime /></I18nProvider>;
}
