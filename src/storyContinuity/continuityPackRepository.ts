import { chmod, lstat, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  assertNoSymlinkSegments,
  atomicWriteSecure,
  ensureSecureDirectory,
  prepareAuthorGlobalRoot,
  readSecurePathUtf8,
  readSecureUtf8,
  removeSecureTree,
  resolveContinuityOwner,
  securePathExists,
  withContinuityLock,
  type ContinuityContext,
  type ResolvedContinuityOwner
} from "./continuityFilesystem.ts";
import type { OwnerCodec } from "./continuityOwnerRepository.ts";
import { readResolvedOwner } from "./continuityOwnerRepository.ts";
import { interactionArchiveCodec } from "./interactionArchiveRepository.ts";
import { globalMemoryGrantCodec, memoryCodec } from "./memoryGrantRepositories.ts";
import { personaCodec, relationshipPolicyCodec } from "./personaPolicyRepositories.ts";
import { contextReceiptCodec, stoppingPointCodec } from "./receiptStoppingRepositories.ts";
import {
  PACK_VERSION,
  type ContinuityOwnerKind,
  type ContinuityPackManifest,
  type ContinuityScope,
  type MemorySensitivity
} from "./continuityTypes.ts";
import {
  containsCredential,
  normalizePackManifest,
  normalizePackRelativePath,
  requireMachineId,
  requireProjectId,
  sha256,
  stableJson
} from "./continuityValidation.ts";

const MAX_PACK_FILES = 20_000;
const MAX_PACK_BYTES = 256 * 1024 * 1024;
let packTemporarySequence = 0;

export type ContinuityPackSelection = {
  kind: ContinuityOwnerKind;
  id: string;
  scope: ContinuityScope;
  projectId?: string;
};

export type ExportContinuityPackInput = {
  packId: string;
  createdAt: string;
  agentId: string;
  selections: ContinuityPackSelection[];
  includePersonal: boolean;
  includeSensitive: boolean;
  sensitiveSecondConfirmation: boolean;
};

export type StagedCandidate = {
  packPath: string;
  canonicalRelativePath: string;
  kind: ContinuityOwnerKind;
  id: string;
  agentId: string;
  scope: ContinuityScope;
  projectId: string | null;
  sensitivity: MemorySensitivity | null;
};

export type ContinuityStagingInventory = {
  version: "story-tianyi-continuity-staging/v1";
  importId: string;
  entries: StagedCandidate[];
  sensitivitySummary: Record<MemorySensitivity, number>;
  integrityStatus: "valid";
  validationErrors: string[];
};

export async function exportContinuityPack(rootPath: string, input: ExportContinuityPackInput): Promise<{ relativePath: string; manifest: ContinuityPackManifest }> {
  const agentId = requireMachineId(input.agentId, "Continuity Pack Agent identifier");
  const packId = requirePackOrImportId(input.packId, "pack");
  if (!Array.isArray(input.selections) || input.selections.length > MAX_PACK_FILES) throw new Error("Continuity Pack selection is invalid.");
  const continuityRoot = await prepareAuthorGlobalRoot(rootPath);
  const configuredRoot = path.dirname(continuityRoot);
  const exportsRoot = path.join(continuityRoot, "packs", "exports");
  await ensureSecureDirectory(configuredRoot, exportsRoot);
  const finalDirectory = path.join(exportsRoot, packId);
  const temporaryDirectory = path.join(exportsRoot, `.${packId}.continuity-tmp-${process.pid}-${String(++packTemporarySequence).padStart(6, "0")}`);
  return withContinuityLock(configuredRoot, `pack-export:${packId}`, async () => {
    if (await securePathExists(configuredRoot, finalDirectory)) throw new Error("Continuity Pack already exists.");
    await removeSecureTree(configuredRoot, temporaryDirectory);
    await ensureSecureDirectory(configuredRoot, temporaryDirectory);
    try {
      const files: Array<{ path: string; sha256: string; bytes: number }> = [];
      const projectIds = new Set<string>();
      const includes = new Set<string>();
      let aggregateBytes = 0;
      const seenSelections = new Set<string>();
      for (const selection of input.selections) {
        const normalized = normalizeSelection(selection, agentId);
        const key = `${normalized.scope}:${normalized.projectId ?? "none"}:${normalized.kind}:${normalized.id}`;
        if (seenSelections.has(key)) throw new Error("Continuity Pack selection is duplicated.");
        seenSelections.add(key);
        const context: ContinuityContext = { rootPath, agentId, scope: normalized.scope, ...(normalized.projectId ? { projectId: normalized.projectId } : {}) };
        const codec = codecFor(normalized.kind);
        const location = await resolveContinuityOwner(context, normalized.kind, normalized.id);
        const current = await readResolvedOwner(location, codec);
        if (!current) throw new Error("Continuity Pack selection does not exist.");
        const value = current.value as Record<string, unknown>;
        if (value.state === "revoked") throw new Error("Revoked continuity owners are not exported by default.");
        const sensitivity = normalized.kind === "memory" ? String(value.sensitivity) as MemorySensitivity : null;
        assertExportSensitivity(sensitivity, input);
        const source = await readSecureUtf8(location, codec.maximumBytes);
        if (source === null || sha256(source) !== current.contentHash) throw new Error("Continuity Pack source changed during export.");
        if (containsCredential(source)) throw new Error("Continuity Pack source contains a credential-like secret.");
        const canonicalPath = `canonical/${location.relativePath}`;
        const packPath = normalizePackRelativePath(`files/${canonicalPath}`);
        const bytes = Buffer.byteLength(source, "utf8");
        aggregateBytes += bytes;
        if (aggregateBytes > MAX_PACK_BYTES) throw new Error("Continuity Pack is too large.");
        const target = resolvePackChild(temporaryDirectory, packPath);
        await atomicWriteSecure(configuredRoot, target, source, { replace: false });
        files.push({ path: packPath, sha256: current.contentHash, bytes });
        if (normalized.projectId) projectIds.add(normalized.projectId);
        includes.add(normalized.kind);
      }
      files.sort((left, right) => left.path.localeCompare(right.path));
      const manifest = normalizePackManifest({
        version: PACK_VERSION,
        packId,
        createdAt: input.createdAt,
        agentId,
        projectIds: [...projectIds].sort(),
        includes: [...includes].sort(),
        files
      });
      await atomicWriteSecure(configuredRoot, path.join(temporaryDirectory, "manifest.json"), stableJson(manifest), { replace: false });
      await assertNoSymlinkSegments(configuredRoot, temporaryDirectory, false);
      await rename(temporaryDirectory, finalDirectory);
      return { relativePath: path.relative(configuredRoot, finalDirectory).split(path.sep).join("/"), manifest };
    } catch (error) {
      await removeSecureTree(configuredRoot, temporaryDirectory);
      throw error;
    }
  });
}

export async function stageContinuityPack(rootPath: string, input: { sourcePackId: string; importId: string }): Promise<{ relativePath: string; inventory: ContinuityStagingInventory }> {
  const sourcePackId = requirePackOrImportId(input.sourcePackId, "pack");
  const importId = requirePackOrImportId(input.importId, "import");
  const continuityRoot = await prepareAuthorGlobalRoot(rootPath);
  const configuredRoot = path.dirname(continuityRoot);
  const sourceDirectory = path.join(continuityRoot, "packs", "exports", sourcePackId);
  if (!(await securePathExists(configuredRoot, sourceDirectory))) throw new Error("Continuity Pack source does not exist.");
  const sourceDetails = await lstat(sourceDirectory);
  if (sourceDetails.isSymbolicLink() || !sourceDetails.isDirectory()) throw new Error("Continuity Pack source is invalid.");
  const stagingRoot = path.join(continuityRoot, "packs", "import-staging");
  await ensureSecureDirectory(configuredRoot, stagingRoot);
  const finalDirectory = path.join(stagingRoot, importId);
  const temporaryDirectory = path.join(stagingRoot, `.${importId}.continuity-tmp-${process.pid}-${String(++packTemporarySequence).padStart(6, "0")}`);
  return withContinuityLock(configuredRoot, `pack-import:${importId}`, async () => {
    if (await securePathExists(configuredRoot, finalDirectory)) throw new Error("Continuity import staging already exists.");
    await removeSecureTree(configuredRoot, temporaryDirectory);
    await ensureSecureDirectory(configuredRoot, temporaryDirectory);
    try {
      const manifestSource = await readPackFile(configuredRoot, path.join(sourceDirectory, "manifest.json"), 4 * 1024 * 1024);
      const manifest = normalizePackManifest(JSON.parse(manifestSource) as unknown);
      if (manifest.packId !== sourcePackId) throw new Error("Continuity Pack identifier does not match its directory.");
      const actualFiles = await listPackFiles(configuredRoot, sourceDirectory);
      const declaredFiles = ["manifest.json", ...manifest.files.map((file) => file.path)].sort((left, right) => left.localeCompare(right));
      if (actualFiles.length !== declaredFiles.length || actualFiles.some((file, index) => file !== declaredFiles[index])) throw new Error("Continuity Pack contains unlisted or missing files.");
      const entries: StagedCandidate[] = [];
      const sensitivitySummary: Record<MemorySensitivity, number> = { ordinary: 0, personal: 0, sensitive: 0, restricted: 0 };
      let aggregateBytes = 0;
      const seenCaseFolded = new Set<string>();
      for (const file of manifest.files) {
        const packPath = normalizePackRelativePath(file.path);
        const folded = packPath.toLocaleLowerCase("en-US");
        if (seenCaseFolded.has(folded)) throw new Error("Continuity Pack contains a normalized path collision.");
        seenCaseFolded.add(folded);
        if (!packPath.startsWith("files/canonical/")) throw new Error("Continuity Pack contains an unknown file location.");
        const sourcePath = resolvePackChild(sourceDirectory, packPath);
        const source = await readPackFile(configuredRoot, sourcePath, Math.min(file.bytes + 1, MAX_PACK_BYTES));
        const details = await stat(sourcePath);
        if (details.nlink > 1) throw new Error("Continuity Pack hardlinks are not allowed.");
        if (details.size !== file.bytes || sha256(source) !== file.sha256) throw new Error("Continuity Pack file failed integrity validation.");
        aggregateBytes += file.bytes;
        if (aggregateBytes > MAX_PACK_BYTES) throw new Error("Continuity Pack is too large.");
        if (containsCredential(source)) throw new Error("Continuity Pack contains a credential-like secret.");
        if (/"(?:permissions|executeLocalCommand|writeProject|writeMemory|useNetwork|useApiKey)"\s*:/u.test(source)) throw new Error("Imported content cannot grant Skill or runtime authority.");
        const canonicalRelativePath = packPath.slice("files/canonical/".length);
        const parsed = parseCanonicalOwnerPath(canonicalRelativePath);
        if (parsed.agentId !== manifest.agentId) throw new Error("Continuity Pack Agent owner mismatch.");
        const context: ContinuityContext = { rootPath, agentId: parsed.agentId, scope: parsed.scope, ...(parsed.projectId ? { projectId: parsed.projectId } : {}) };
        const location = await resolveContinuityOwner(context, parsed.kind, parsed.id);
        const codec = codecFor(parsed.kind);
        const normalized = codec.normalizeSource(source, location);
        const sensitivity = parsed.kind === "memory" ? String((normalized.value as Record<string, unknown>).sensitivity) as MemorySensitivity : null;
        if (sensitivity === "restricted") throw new Error("Restricted Memory cannot enter import staging.");
        if (sensitivity) sensitivitySummary[sensitivity] += 1;
        const target = resolvePackChild(temporaryDirectory, packPath);
        await atomicWriteSecure(configuredRoot, target, source, { replace: false });
        entries.push({ packPath, canonicalRelativePath, ...parsed, sensitivity });
      }
      const inventory: ContinuityStagingInventory = {
        version: "story-tianyi-continuity-staging/v1",
        importId,
        entries,
        sensitivitySummary,
        integrityStatus: "valid",
        validationErrors: []
      };
      await atomicWriteSecure(configuredRoot, path.join(temporaryDirectory, "candidate-inventory.json"), stableJson(inventory), { replace: false });
      await rename(temporaryDirectory, finalDirectory);
      await makeReadOnly(finalDirectory);
      return { relativePath: path.relative(configuredRoot, finalDirectory).split(path.sep).join("/"), inventory };
    } catch (error) {
      await removeSecureTree(configuredRoot, temporaryDirectory);
      throw error;
    }
  });
}

export async function readStagingInventory(rootPath: string, importId: string): Promise<ContinuityStagingInventory> {
  const continuityRoot = await prepareAuthorGlobalRoot(rootPath);
  const configuredRoot = path.dirname(continuityRoot);
  const target = path.join(continuityRoot, "packs", "import-staging", requirePackOrImportId(importId, "import"), "candidate-inventory.json");
  const source = await readSecurePathUtf8(configuredRoot, target, 4 * 1024 * 1024);
  if (source === null) throw new Error("Continuity staging inventory does not exist.");
  return normalizeStagingInventory(JSON.parse(source) as unknown, requirePackOrImportId(importId, "import"));
}

function normalizeStagingInventory(value: unknown, expectedImportId: string): ContinuityStagingInventory {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Continuity staging inventory is invalid.");
  const input = value as Record<string, unknown>;
  const fields = ["version", "importId", "entries", "sensitivitySummary", "integrityStatus", "validationErrors"];
  if (Object.keys(input).some((key) => !fields.includes(key)) || fields.some((key) => !Object.hasOwn(input, key))) throw new Error("Continuity staging inventory fields are invalid.");
  if (input.version !== "story-tianyi-continuity-staging/v1" || input.importId !== expectedImportId || input.integrityStatus !== "valid") throw new Error("Continuity staging inventory identity is invalid.");
  if (!Array.isArray(input.entries) || input.entries.length > MAX_PACK_FILES || !Array.isArray(input.validationErrors) || input.validationErrors.length > 1_000) throw new Error("Continuity staging inventory is invalid.");
  const summary = input.sensitivitySummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) throw new Error("Continuity staging sensitivity summary is invalid.");
  const summaryRecord = summary as Record<string, unknown>;
  if (["ordinary", "personal", "sensitive", "restricted"].some((key) => typeof summaryRecord[key] !== "number" || !Number.isSafeInteger(summaryRecord[key]) || Number(summaryRecord[key]) < 0)) throw new Error("Continuity staging sensitivity summary is invalid.");
  const entries = input.entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.getPrototypeOf(entry) !== Object.prototype) throw new Error("Continuity staging candidate is invalid.");
    const row = entry as Record<string, unknown>;
    const keys = ["packPath", "canonicalRelativePath", "kind", "id", "agentId", "scope", "projectId", "sensitivity"];
    if (Object.keys(row).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(row, key))) throw new Error("Continuity staging candidate fields are invalid.");
    const parsed = parseCanonicalOwnerPath(String(row.canonicalRelativePath));
    if (row.kind !== parsed.kind || row.id !== parsed.id || row.agentId !== parsed.agentId || row.scope !== parsed.scope || row.projectId !== parsed.projectId) throw new Error("Continuity staging candidate owner mismatch.");
    const packPath = normalizePackRelativePath(row.packPath);
    if (packPath !== `files/canonical/${row.canonicalRelativePath}`) throw new Error("Continuity staging candidate path mismatch.");
    const sensitivity = row.sensitivity === null ? null : oneOfSensitivity(row.sensitivity);
    return { packPath, canonicalRelativePath: String(row.canonicalRelativePath), ...parsed, sensitivity };
  });
  return {
    version: "story-tianyi-continuity-staging/v1",
    importId: expectedImportId,
    entries,
    sensitivitySummary: {
      ordinary: Number(summaryRecord.ordinary),
      personal: Number(summaryRecord.personal),
      sensitive: Number(summaryRecord.sensitive),
      restricted: Number(summaryRecord.restricted)
    },
    integrityStatus: "valid",
    validationErrors: input.validationErrors.map((item) => String(item).slice(0, 240))
  };
}

function normalizeSelection(value: ContinuityPackSelection, agentId: string): ContinuityPackSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Continuity Pack selection is invalid.");
  const kind = value.kind;
  codecFor(kind);
  const scope = value.scope;
  if (scope !== "author-global" && scope !== "project") throw new Error("Continuity Pack scope is invalid.");
  const id = requireMachineId(value.id, "Continuity Pack owner identifier");
  const projectId = scope === "project" ? requireProjectId(value.projectId) : undefined;
  if ((kind === "persona" || kind === "relationship-policy") && id !== agentId) throw new Error("Continuity Pack Agent owner mismatch.");
  return { kind, id, scope, ...(projectId ? { projectId } : {}) };
}

function codecFor(kind: ContinuityOwnerKind): OwnerCodec<Record<string, unknown> | unknown[]> {
  const codecs: Record<ContinuityOwnerKind, OwnerCodec<unknown>> = {
    persona: personaCodec,
    "relationship-policy": relationshipPolicyCodec,
    memory: memoryCodec,
    "global-memory-grant": globalMemoryGrantCodec,
    session: interactionArchiveCodec,
    "context-receipt": contextReceiptCodec,
    "stopping-point": stoppingPointCodec
  };
  const codec = codecs[kind];
  if (!codec) throw new Error("Continuity Pack owner kind is unsupported.");
  return codec as OwnerCodec<Record<string, unknown> | unknown[]>;
}

function parseCanonicalOwnerPath(relativePath: string): Omit<StagedCandidate, "packPath" | "canonicalRelativePath" | "sensitivity"> {
  const normalized = normalizePackRelativePath(relativePath);
  const global = normalized.match(/^_continuity\/agents\/([^/]+)\/(persona\.md|relationship-policy\.json|memories\/([^/]+)\.md)$/u);
  if (global) {
    const agentId = requireMachineId(global[1], "Imported Agent identifier");
    if (global[2] === "persona.md") return { kind: "persona", id: agentId, agentId, scope: "author-global", projectId: null };
    if (global[2] === "relationship-policy.json") return { kind: "relationship-policy", id: agentId, agentId, scope: "author-global", projectId: null };
    return { kind: "memory", id: requireMachineId(global[3], "Imported Memory identifier"), agentId, scope: "author-global", projectId: null };
  }
  const project = normalized.match(/^([^/]+)\/continuity\/agents\/([^/]+)\/(memories\/([^/]+)\.md|global-memory-grants\/([^/]+)\.grant\.json|sessions\/([^/]+)\.jsonl|receipts\/([^/]+)\.context-receipt\.json|stopping-points\/([^/]+)\.md)$/u);
  if (!project) throw new Error("Continuity Pack owner path is unknown.");
  const projectId = requireProjectId(project[1]);
  const agentId = requireMachineId(project[2], "Imported Agent identifier");
  if (project[4]) return { kind: "memory", id: requireMachineId(project[4], "Imported Memory identifier"), agentId, scope: "project", projectId };
  if (project[5]) return { kind: "global-memory-grant", id: requireMachineId(project[5], "Imported grant Memory identifier"), agentId, scope: "project", projectId };
  if (project[6]) return { kind: "session", id: requireMachineId(project[6], "Imported session identifier"), agentId, scope: "project", projectId };
  if (project[7]) return { kind: "context-receipt", id: requireMachineId(project[7], "Imported Receipt identifier"), agentId, scope: "project", projectId };
  return { kind: "stopping-point", id: requireMachineId(project[8], "Imported stopping-point identifier"), agentId, scope: "project", projectId };
}

function assertExportSensitivity(sensitivity: MemorySensitivity | null, input: ExportContinuityPackInput): void {
  if (sensitivity === "restricted") throw new Error("Restricted Memory cannot be exported.");
  if (sensitivity === "personal" && !input.includePersonal) throw new Error("Personal Memory export requires explicit opt-in.");
  if (sensitivity === "sensitive" && (!input.includeSensitive || !input.sensitiveSecondConfirmation)) throw new Error("Sensitive Memory export requires opt-in and second confirmation.");
}

async function readPackFile(root: string, target: string, maximumBytes: number): Promise<string> {
  await assertNoSymlinkSegments(root, target, false);
  const details = await lstat(target);
  if (details.isSymbolicLink() || !details.isFile()) throw new Error("Continuity Pack contains a non-regular file.");
  if (details.nlink > 1) throw new Error("Continuity Pack hardlinks are not allowed.");
  if (details.size > maximumBytes) throw new Error("Continuity Pack file is too large.");
  return readFile(target, "utf8");
}

async function listPackFiles(root: string, directory: string, relativeDirectory = ""): Promise<string[]> {
  await assertNoSymlinkSegments(root, directory, false);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Continuity Pack symlinks are not allowed.");
    const relative = normalizePackRelativePath(relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listPackFiles(root, target, relative));
    else if (entry.isFile()) {
      const details = await stat(target);
      if (details.nlink > 1) throw new Error("Continuity Pack hardlinks are not allowed.");
      files.push(relative);
    } else {
      throw new Error("Continuity Pack contains a device or non-regular entry.");
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function resolvePackChild(directory: string, relativePath: string): string {
  const normalized = normalizePackRelativePath(relativePath);
  const target = path.resolve(directory, ...normalized.split("/"));
  const relative = path.relative(directory, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Continuity Pack path escapes its directory.");
  return target;
}

async function makeReadOnly(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Continuity staging cannot contain symlinks.");
    if (entry.isDirectory()) await makeReadOnly(target);
    if (entry.isFile()) await chmod(target, 0o400);
  }
  await chmod(directory, 0o500);
}

function requirePackOrImportId(value: unknown, prefix: "pack" | "import"): string {
  const id = requireMachineId(value, `Continuity ${prefix} identifier`);
  if (!new RegExp(`^${prefix}\\.\\d{6}$`, "u").test(id)) throw new Error(`Continuity ${prefix} identifier is invalid.`);
  return id;
}

function oneOfSensitivity(value: unknown): MemorySensitivity {
  if (value !== "ordinary" && value !== "personal" && value !== "sensitive" && value !== "restricted") throw new Error("Continuity staging sensitivity is invalid.");
  return value;
}
