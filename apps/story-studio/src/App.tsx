import { TianyanR0Shell } from "./product-shell/TianyanR0Shell";
import { I18nProvider } from "./product-shell/i18n/I18nProvider";

/**
 * R0 deliberately starts a new product shell. The former application is not
 * imported; a later Founder-authorized migration may selectively reconnect it.
 */
export function App() {
  return <I18nProvider><TianyanR0Shell /></I18nProvider>;
}
