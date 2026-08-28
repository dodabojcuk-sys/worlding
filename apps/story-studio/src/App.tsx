import { TianyanR0Shell } from "./product-shell/TianyanR0Shell";

/**
 * R0 deliberately starts a new product shell. The former application is not
 * imported; a later Founder-authorized migration may selectively reconnect it.
 */
export function App() {
  return <TianyanR0Shell />;
}
