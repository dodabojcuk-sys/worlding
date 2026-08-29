import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const TIANYAN_E2E_FIXTURE_PREFIX = "tianyan-r0-shell-smoke-";
const MARKER_NAME = ".tianyan-e2e-fixture.json";

export function createTianyanE2eFixture() {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), TIANYAN_E2E_FIXTURE_PREFIX));
  const fixtureId = randomUUID();
  const projectId = `r061-e2e-${fixtureId.replaceAll("-", "")}`;
  const marker = { fixtureId, projectId, createdBy: "tianyan-r0-shell-smoke" };
  writeFileSync(path.join(fixtureRoot, MARKER_NAME), `${JSON.stringify(marker)}\n`, "utf8");
  return { fixtureRoot, fixtureId, projectId };
}

export function removeTianyanE2eFixture(fixture) {
  const tmpRoot = path.resolve(os.tmpdir());
  const resolvedRoot = path.resolve(fixture.fixtureRoot);
  if (path.dirname(resolvedRoot) !== tmpRoot || !path.basename(resolvedRoot).startsWith(TIANYAN_E2E_FIXTURE_PREFIX)) {
    throw new Error("Refusing to remove an E2E fixture outside its exact temporary root.");
  }
  const markerPath = path.join(resolvedRoot, MARKER_NAME);
  if (!existsSync(markerPath)) throw new Error("Refusing to remove an E2E fixture without its ownership marker.");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.fixtureId !== fixture.fixtureId || marker.projectId !== fixture.projectId || marker.createdBy !== "tianyan-r0-shell-smoke") {
    throw new Error("Refusing to remove an E2E fixture whose ownership marker does not match.");
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}
