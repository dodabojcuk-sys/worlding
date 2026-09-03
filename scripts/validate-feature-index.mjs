import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const indexPath = resolve(repositoryRoot, "docs/architecture/FEATURE_INDEX.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));

if (index.version !== "tianyan-feature-index/v1") fail("unsupported index version");
if (!Array.isArray(index.features) || index.features.length === 0) fail("features must be a non-empty array");

const ids = new Set();
for (const feature of index.features) {
  if (!feature.id || ids.has(feature.id)) fail(`duplicate or missing feature id: ${feature.id || "<empty>"}`);
  ids.add(feature.id);
  for (const field of ["entrypoints", "sourceFiles", "domainOwners", "stateOwners", "tests"]) {
    if (!Array.isArray(feature[field])) fail(`${feature.id}.${field} must be an array`);
    for (const relativePath of feature[field]) await requirePath(relativePath, `${feature.id}.${field}`);
  }
}

const canonWriters = index.boundaries?.canonWriters;
if (!Array.isArray(canonWriters) || canonWriters.length !== 1) fail("exactly one Canon Writer must be indexed");
await requirePath(canonWriters[0], "boundaries.canonWriters");
if (!Array.isArray(index.boundaries?.worldStateOwners) || index.boundaries.worldStateOwners.length !== 1) fail("exactly one WorldState owner must be indexed");
if (!Array.isArray(index.boundaries?.eventOwners) || index.boundaries.eventOwners.length !== 1) fail("exactly one Event owner must be indexed");
await requirePath(index.boundaries.worldStateOwners[0], "boundaries.worldStateOwners");
await requirePath(index.boundaries.eventOwners[0], "boundaries.eventOwners");
await requirePath(index.boundaries.providerBoundary, "boundaries.providerBoundary");
await requirePath(index.boundaries.candidateReviewOwner, "boundaries.candidateReviewOwner");
await requirePath(index.boundaries.narrativeArrangementOwner, "boundaries.narrativeArrangementOwner");

console.log(`Feature index OK: ${index.features.length} features, one Canon Writer, one WorldState owner, one Event owner, one NarrativeArrangement owner.`);

async function requirePath(relativePath, owner) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("..")) fail(`${owner} has an unsafe path`);
  try { await access(resolve(repositoryRoot, relativePath)); } catch { fail(`${owner} references a missing path: ${relativePath}`); }
}

function fail(message) {
  console.error(`Feature index invalid: ${message}`);
  process.exit(1);
}
