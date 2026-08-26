import { chmod, readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";

import {
  atomicWriteSecure,
  purgeTemporaryFiles,
  readSecurePathUtf8,
  removeSecureFile,
  resolveContinuityOwner,
  securePathExists,
  withOwnerLock,
  type ContinuityContext,
  type ResolvedContinuityOwner
} from "./continuityFilesystem.ts";
import type { OwnerCodec } from "./continuityOwnerRepository.ts";
import { readResolvedOwner } from "./continuityOwnerRepository.ts";
import { latestContinuityRevisionSequence, purgeContinuityHistory } from "./continuityRevisionRepository.ts";
import {
  TOMBSTONE_VERSION,
  type ContinuityDeleteResult,
  type ContinuityTombstone
} from "./continuityTypes.ts";
import { normalizeTombstone, requireHash, stableJson } from "./continuityValidation.ts";

export type HardDeleteInput = {
  expectedContentHash: string;
  deletedAt: string;
  operationId: string;
};

export async function hardDeleteOwner<T>(context: ContinuityContext, ownerId: string, codec: OwnerCodec<T>, input: HardDeleteInput): Promise<ContinuityDeleteResult> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId, { createDirectories: true });
  const expected = requireHash(input.expectedContentHash);
  return withOwnerLock(location, async () => {
    const current = await readResolvedOwner(location, codec);
    if (!current || current.contentHash !== expected) return { ok: false, conflict: true, code: "continuity-conflict" };
    const deletedRevision = await latestContinuityRevisionSequence(location);
    await removeSecureFile(location);
    await purgeContinuityHistory(location);
    await purgeTemporaryFiles(location.configuredRoot, path.dirname(location.absolutePath), path.basename(location.absolutePath));
    await purgeDerivedIndexes(location);
    await purgeStagedOwnerCopies(location);
    const tombstone = normalizeTombstone({
      version: TOMBSTONE_VERSION,
      id: location.owner.id,
      agentId: location.owner.agentId,
      ownerScope: location.owner.scope,
      projectId: location.owner.projectId,
      state: "hard-deleted",
      deletedRevision,
      deletedAt: input.deletedAt,
      operationId: input.operationId
    });
    await atomicWriteSecure(location.configuredRoot, location.tombstonePath, stableJson(tombstone), { replace: false });
    return { ok: true, conflict: false, deleted: true, tombstone };
  });
}

export async function readOwnerTombstone(context: ContinuityContext, ownerId: string, codec: OwnerCodec<unknown>): Promise<ContinuityTombstone | null> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId);
  const source = await readSecurePathUtf8(location.configuredRoot, location.tombstonePath, 32 * 1024);
  return source === null ? null : normalizeTombstone(JSON.parse(source) as unknown);
}

export async function purgeDerivedIndexes(location: ResolvedContinuityOwner): Promise<void> {
  const indexRoot = path.join(location.configuredRoot, ".world-os", "continuity-indexes");
  if (!(await securePathExists(location.configuredRoot, indexRoot))) return;
  for (const entry of await readdir(indexRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Continuity derived indexes cannot contain symlinks.");
    if (entry.isFile()) await unlink(path.join(indexRoot, entry.name));
    if (entry.isDirectory()) await rm(path.join(indexRoot, entry.name), { recursive: true, force: true });
  }
}

export async function purgeStagedOwnerCopies(location: ResolvedContinuityOwner): Promise<void> {
  const stagingRoot = path.join(location.configuredRoot, "_continuity", "packs", "import-staging");
  if (!(await securePathExists(location.configuredRoot, stagingRoot))) return;
  for (const entry of await readdir(stagingRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Continuity import staging cannot contain symlinks.");
    if (!entry.isDirectory()) continue;
    const stagingDirectory = path.join(stagingRoot, entry.name);
    const inventoryPath = path.join(stagingDirectory, "candidate-inventory.json");
    const source = await readSecurePathUtf8(location.configuredRoot, inventoryPath, 4 * 1024 * 1024);
    if (source === null) continue;
    const inventory = parseInventory(source);
    const matches = inventory.entries.filter((item) => item.canonicalRelativePath === location.relativePath);
    if (matches.length > 0) {
      await makeTreeWritable(stagingDirectory);
      try {
        for (const match of matches) {
          const candidate = path.join(stagingDirectory, match.packPath);
          if (await securePathExists(location.configuredRoot, candidate)) await unlink(candidate);
        }
        const next = { ...inventory, entries: inventory.entries.filter((item) => item.canonicalRelativePath !== location.relativePath) };
        await atomicWriteSecure(location.configuredRoot, inventoryPath, stableJson(next));
      } finally {
        await makeTreeReadOnly(stagingDirectory);
      }
    }
  }
}

function parseInventory(source: string): { version: string; importId: string; entries: Array<Record<string, unknown> & { packPath: string; canonicalRelativePath: string }>; sensitivitySummary: Record<string, number>; integrityStatus: string; validationErrors: string[] } {
  const value = JSON.parse(source) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Continuity staging inventory is invalid.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.entries)) throw new Error("Continuity staging inventory is invalid.");
  const entries = input.entries.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Continuity staging entry is invalid.");
    const row = item as Record<string, unknown>;
    if (typeof row.packPath !== "string" || typeof row.canonicalRelativePath !== "string") throw new Error("Continuity staging entry is invalid.");
    return { ...row, packPath: row.packPath, canonicalRelativePath: row.canonicalRelativePath };
  });
  return {
    version: String(input.version || ""),
    importId: String(input.importId || ""),
    entries,
    sensitivitySummary: input.sensitivitySummary && typeof input.sensitivitySummary === "object" ? input.sensitivitySummary as Record<string, number> : {},
    integrityStatus: String(input.integrityStatus || ""),
    validationErrors: Array.isArray(input.validationErrors) ? input.validationErrors.map(String) : []
  };
}

async function makeTreeWritable(directory: string): Promise<void> {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Continuity import staging cannot contain symlinks.");
    if (entry.isDirectory()) await makeTreeWritable(target);
    if (entry.isFile()) await chmod(target, 0o600);
  }
}

async function makeTreeReadOnly(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Continuity import staging cannot contain symlinks.");
    if (entry.isDirectory()) await makeTreeReadOnly(target);
    if (entry.isFile()) await chmod(target, 0o400);
  }
  await chmod(directory, 0o500);
}
