export const STORY_STUDIO_RUNTIME_MODE_ENV = "TIANYAN_STORY_STUDIO_RUNTIME_MODE";

const MODES = Object.freeze({
  "api-only": Object.freeze({ mode: "api-only", staticSiteEnabled: false }),
  "combined-static": Object.freeze({ mode: "combined-static", staticSiteEnabled: true })
});

export function resolveStoryStudioRuntimeMode(environment = process.env) {
  const requested = String(environment[STORY_STUDIO_RUNTIME_MODE_ENV] || "").trim();
  if (!requested) return MODES["api-only"];
  const resolved = MODES[requested];
  if (!resolved) throw new Error(`${STORY_STUDIO_RUNTIME_MODE_ENV} must be api-only or combined-static.`);
  return resolved;
}
