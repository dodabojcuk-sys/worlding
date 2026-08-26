export const NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION = "tianyan-neutral-story-package/v1" as const;
export const NEUTRAL_STORY_PACKAGE_PROVENANCE_VERSION = "tianyan-neutral-story-package-provenance/v1" as const;
export const NEUTRAL_STORY_PACKAGE_EXPORTER_VERSION = "1.0.0";

export type NeutralStorySourceRef = {
  sourceKind: string;
  ownerId: string;
  entityId: string;
  entityVersion?: string;
  capturedAt: string;
  staleState?: "fresh" | "stale" | "missing";
};

export type NeutralStoryItemInput = {
  id: string;
  kind: string;
  authority: string;
  possibilityStatus?: string;
  content: Record<string, unknown>;
  sourceRefs: NeutralStorySourceRef[];
};

export type NeutralStoryUnitInput = {
  id: string;
  relativeId: string;
  title: string;
  summary: string;
  lifecycle: string;
  sourceRefs: NeutralStorySourceRef[];
  items: NeutralStoryItemInput[];
  version: string;
  updatedAt: string;
};

export type NeutralAssetReferenceInput = {
  assetId: string;
  kind: "image" | "audio" | "video" | "reference";
  relativePath?: string | null;
  contentHash?: `sha256:${string}` | null;
  license?: string | null;
};

export type NeutralSourceAnchorV1 = {
  anchorId: string;
  sourceKind: string;
  ownerId: string;
  entityId: string;
  entityVersion: string | null;
  capturedAt: string;
  staleState: "fresh" | "stale" | "missing";
};

export type NeutralAssetReferenceV1 = {
  assetId: string;
  kind: NeutralAssetReferenceInput["kind"];
  relativePath: string | null;
  contentHash: `sha256:${string}` | null;
  license: string | null;
};

export type NeutralSourceRevisionV1 = {
  revisionId: string;
  revisionHash: string;
  capturedAt: string;
  sourceOwners: string[];
  workVersion?: {
    projectId: string;
    workVersionId: string;
    kind: "root";
    pinnedRevision: number;
    manifestId: string;
    manifestDigest: string;
  };
};

export type NeutralStoryPackageManifestV1 = {
  schemaVersion: typeof NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  projectRef: { projectId: string; title: string };
  scope: { kind: "project" | "unit" | "selection"; unitIds: string[]; label: string };
  sourceRevision: NeutralSourceRevisionV1;
  createdAt: string;
  contentHash: `sha256:${string}`;
  files: {
    storyMarkdown: "story.md";
    manifest: "manifest.json";
    provenance: "provenance.json";
    projections: string[];
    assetReferences: string[];
  };
  sourceAnchors: NeutralSourceAnchorV1[];
  assetReferences: NeutralAssetReferenceV1[];
};

export type NeutralProjectionReceiptV1 = {
  projectionId: string;
  sourceRef: string;
  sourceRevision: string;
  generatedAt: string;
  contentHash: `sha256:${string}`;
};

export type NeutralStoryPackageProvenanceV1 = {
  schemaVersion: typeof NEUTRAL_STORY_PACKAGE_PROVENANCE_VERSION;
  packageId: string;
  generatedBy: {
    product: "tianyan";
    exporter: "neutral-story-package-exporter";
    exporterVersion: string;
  };
  sourceRefs: NeutralSourceAnchorV1[];
  sourceRevision: NeutralSourceRevisionV1;
  projectionReceipts: NeutralProjectionReceiptV1[];
  warnings: string[];
};

export type NeutralStoryPackageV1 = {
  schemaVersion: typeof NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  projectRef: { projectId: string; title: string };
  scope: NeutralStoryPackageManifestV1["scope"];
  sourceRevision: NeutralSourceRevisionV1;
  createdAt: string;
  contentHash: `sha256:${string}`;
  storyMarkdown: string;
  manifest: NeutralStoryPackageManifestV1;
  provenance: NeutralStoryPackageProvenanceV1;
  projections: Record<string, string>;
  warnings: string[];
};

export type NeutralStoryPackageExportInput = {
  projectRef: { projectId: string; title: string };
  scope?: { kind?: "project" | "unit" | "selection"; unitIds?: string[]; label?: string };
  sourceRevision: NeutralSourceRevisionV1;
  storyUnits: NeutralStoryUnitInput[];
  selectedUnitIds?: string[];
  assetReferences?: NeutralAssetReferenceInput[];
  relationProjection?: {
    sourceRevision: string;
    records: unknown[];
  };
  createdAt?: string;
  exporterVersion?: string;
};

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(normalizeForCanonicalJson(value))}\n`;
}

export async function sha256Text(value: string): Promise<`sha256:${string}`> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable.");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export function safeRelativePackagePath(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(candidate) || candidate.includes("\\")) {
    throw new Error("Package path must be a non-empty relative POSIX path.");
  }
  if (candidate.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("Package path traversal is not allowed.");
  }
  return candidate;
}

export async function buildNeutralStoryPackage(input: NeutralStoryPackageExportInput): Promise<NeutralStoryPackageV1> {
  const projectRef = {
    projectId: redactSensitiveText(input.projectRef.projectId.trim()),
    title: redactSensitiveText(input.projectRef.title.trim())
  };
  if (!projectRef.projectId || !projectRef.title) throw new Error("Neutral Story Package requires a project reference.");

  const selectedIds = input.selectedUnitIds?.length ? input.selectedUnitIds : input.storyUnits.filter((unit) => unit.lifecycle !== "archived").map((unit) => unit.id);
  const unitsById = new Map(input.storyUnits.map((unit) => [unit.id, unit]));
  const missingUnitWarnings = selectedIds.filter((unitId) => !unitsById.has(unitId)).map((unitId) => `Selected Story Unit is missing: ${unitId}`);
  const selectedUnits = selectedIds.flatMap((unitId) => {
    const unit = unitsById.get(unitId);
    return unit ? [normalizeUnit(unit)] : [];
  });
  const normalizedUnits = input.selectedUnitIds?.length ? selectedUnits : selectedUnits.slice().sort((left, right) => left.relativeId.localeCompare(right.relativeId));
  const scope = {
    kind: input.scope?.kind || (normalizedUnits.length === 1 ? "unit" : "project"),
    unitIds: normalizedUnits.map((unit) => unit.id),
    label: redactSensitiveText(input.scope?.label?.trim() || (normalizedUnits.length === 1 ? normalizedUnits[0]!.title : projectRef.title))
  } as NeutralStoryPackageManifestV1["scope"];
  const sourceRevision = normalizeSourceRevision(input.sourceRevision);
  const createdAt = input.createdAt || sourceRevision.capturedAt;
  const sourceAnchors = collectSourceAnchors(normalizedUnits);
  const assetReferences = (input.assetReferences || []).map(normalizeAssetReference).sort((left, right) => left.assetId.localeCompare(right.assetId));
  const warnings = [...missingUnitWarnings, ...sourceAnchors.filter((anchor) => anchor.staleState !== "fresh").map((anchor) => `Source anchor ${anchor.anchorId} is ${anchor.staleState}.`)].sort();
  const storyMarkdown = renderStoryMarkdown(projectRef.title, scope, normalizedUnits, warnings);
  const projections: Record<string, string> = {};
  const storyUnitsProjection = {
    schemaVersion: "tianyan-neutral-story-package-projection/v1",
    projectionId: "story-units",
    sourceRevision,
    sourceRefs: sourceAnchors,
    units: normalizedUnits
  };
  projections["projections/story-units.json"] = canonicalJson(storyUnitsProjection);
  if (input.relationProjection) {
    const relationProjection = {
      schemaVersion: "tianyan-neutral-story-package-projection/v1",
      projectionId: "relations-read-only",
      sourceRevision: input.relationProjection.sourceRevision,
      sourceOwner: "relationRepository.mjs",
      writeMode: "read-only",
      records: normalizeForCanonicalJson(input.relationProjection.records)
    };
    projections["projections/relations.json"] = canonicalJson(relationProjection);
  }

  const contentPayload = {
    schemaVersion: NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION,
    projectRef,
    scope,
    sourceRevision,
    createdAt,
    storyMarkdown,
    projections,
    sourceAnchors,
    assetReferences
  };
  const contentHash = await sha256Text(canonicalJson(contentPayload));
  const packageId = `neutral-story-package-${contentHash.slice("sha256:".length, "sha256:".length + 20)}`;
  const projectionReceipts = await Promise.all(Object.entries(projections).map(async ([projectionId, content]) => ({
    projectionId,
    sourceRef: projectionId === "projections/relations.json" ? "relationRepository.mjs" : "story-unit",
    sourceRevision: projectionId === "projections/relations.json" && input.relationProjection ? input.relationProjection.sourceRevision : sourceRevision.revisionId,
    generatedAt: createdAt,
    contentHash: await sha256Text(content)
  })));
  const manifest: NeutralStoryPackageManifestV1 = {
    schemaVersion: NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION,
    packageId,
    projectRef,
    scope,
    sourceRevision,
    createdAt,
    contentHash,
    files: {
      storyMarkdown: "story.md",
      manifest: "manifest.json",
      provenance: "provenance.json",
      projections: Object.keys(projections).sort(),
      assetReferences: assetReferences.map((asset) => asset.relativePath).filter((path): path is string => Boolean(path))
    },
    sourceAnchors,
    assetReferences
  };
  const provenance: NeutralStoryPackageProvenanceV1 = {
    schemaVersion: NEUTRAL_STORY_PACKAGE_PROVENANCE_VERSION,
    packageId,
    generatedBy: {
      product: "tianyan",
      exporter: "neutral-story-package-exporter",
      exporterVersion: input.exporterVersion || NEUTRAL_STORY_PACKAGE_EXPORTER_VERSION
    },
    sourceRefs: sourceAnchors,
    sourceRevision,
    projectionReceipts,
    warnings
  };
  return {
    schemaVersion: NEUTRAL_STORY_PACKAGE_SCHEMA_VERSION,
    packageId,
    projectRef,
    scope,
    sourceRevision,
    createdAt,
    contentHash,
    storyMarkdown,
    manifest,
    provenance,
    projections,
    warnings
  };
}

export function packageFiles(packageValue: NeutralStoryPackageV1): Record<string, string> {
  return {
    "story.md": packageValue.storyMarkdown,
    "manifest.json": canonicalJson(packageValue.manifest),
    "provenance.json": canonicalJson(packageValue.provenance),
    ...packageValue.projections
  };
}

function normalizeUnit(unit: NeutralStoryUnitInput): NeutralStoryUnitInput {
  return {
    id: redactSensitiveText(unit.id),
    relativeId: redactSensitiveText(unit.relativeId),
    title: redactSensitiveText(unit.title),
    summary: redactSensitiveText(unit.summary),
    lifecycle: redactSensitiveText(unit.lifecycle),
    sourceRefs: unit.sourceRefs.map(normalizeSourceRef),
    items: unit.items.map((item) => ({
      id: redactSensitiveText(item.id),
      kind: redactSensitiveText(item.kind),
      authority: redactSensitiveText(item.authority),
      ...(item.possibilityStatus ? { possibilityStatus: redactSensitiveText(item.possibilityStatus) } : {}),
      content: normalizeForCanonicalJson(item.content) as Record<string, unknown>,
      sourceRefs: item.sourceRefs.map(normalizeSourceRef)
    })),
    version: redactSensitiveText(unit.version),
    updatedAt: redactSensitiveText(unit.updatedAt)
  };
}

function normalizeSourceRef(ref: NeutralStorySourceRef): NeutralStorySourceRef {
  return {
    sourceKind: redactSensitiveText(ref.sourceKind),
    ownerId: redactSensitiveText(ref.ownerId),
    entityId: redactSensitiveText(ref.entityId),
    ...(ref.entityVersion ? { entityVersion: redactSensitiveText(ref.entityVersion) } : {}),
    capturedAt: redactSensitiveText(ref.capturedAt),
    staleState: ref.staleState || "fresh"
  };
}

function normalizeSourceRevision(value: NeutralSourceRevisionV1): NeutralSourceRevisionV1 {
  const workVersion = value.workVersion ? {
    projectId: redactSensitiveText(value.workVersion.projectId),
    workVersionId: redactSensitiveText(value.workVersion.workVersionId),
    kind: value.workVersion.kind,
    pinnedRevision: value.workVersion.pinnedRevision,
    manifestId: redactSensitiveText(value.workVersion.manifestId),
    manifestDigest: redactSensitiveText(value.workVersion.manifestDigest)
  } : undefined;
  if (workVersion && (workVersion.kind !== "root" || !Number.isInteger(workVersion.pinnedRevision) || workVersion.pinnedRevision < 1 || !/^[a-f0-9]{64}$/u.test(workVersion.manifestDigest))) {
    throw new Error("Neutral Story Package WorkVersion source is invalid.");
  }
  return {
    revisionId: redactSensitiveText(value.revisionId),
    revisionHash: redactSensitiveText(value.revisionHash),
    capturedAt: redactSensitiveText(value.capturedAt),
    sourceOwners: Array.from(new Set(value.sourceOwners.map((owner) => redactSensitiveText(owner)))).sort(),
    ...(workVersion ? { workVersion } : {})
  };
}

function normalizeAssetReference(asset: NeutralAssetReferenceInput): NeutralAssetReferenceV1 {
  const relativePath = asset.relativePath ? safeRelativePackagePath(asset.relativePath) : null;
  if (asset.contentHash && !/^sha256:[a-f0-9]{64}$/u.test(asset.contentHash)) throw new Error(`Asset hash is invalid: ${asset.assetId}`);
  return {
    assetId: redactSensitiveText(asset.assetId),
    kind: asset.kind,
    relativePath,
    contentHash: asset.contentHash || null,
    license: asset.license ? redactSensitiveText(asset.license) : null
  };
}

function collectSourceAnchors(units: NeutralStoryUnitInput[]): NeutralSourceAnchorV1[] {
  const refs = units.flatMap((unit) => [
    ...unit.sourceRefs,
    ...unit.items.flatMap((item) => item.sourceRefs)
  ]);
  const anchors = new Map<string, NeutralSourceAnchorV1>();
  for (const ref of refs) {
    const normalized = normalizeSourceRef(ref);
    const anchorId = [normalized.sourceKind, normalized.ownerId, normalized.entityId, normalized.entityVersion || "current"].join(":");
    anchors.set(anchorId, {
      anchorId,
      sourceKind: normalized.sourceKind,
      ownerId: normalized.ownerId,
      entityId: normalized.entityId,
      entityVersion: normalized.entityVersion || null,
      capturedAt: normalized.capturedAt,
      staleState: normalized.staleState || "fresh"
    });
  }
  return Array.from(anchors.values()).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
}

function renderStoryMarkdown(projectTitle: string, scope: NeutralStoryPackageManifestV1["scope"], units: NeutralStoryUnitInput[], warnings: string[]): string {
  const lines = [
    `# ${projectTitle}`,
    "",
    "> Neutral Story Package V1 · source-bound read-only projection",
    `> Scope: ${scope.label}`,
    "",
    "## Delivery notes",
    "",
    "This document is a neutral story result. Output format is intentionally selected after this package is reviewed.",
    ...(warnings.length ? ["", "### Source warnings", "", ...warnings.map((warning) => `- ${warning}`)] : []),
    "",
    "## Story Units",
    ""
  ];
  if (!units.length) lines.push("No Story Unit is currently selected.", "");
  units.forEach((unit, index) => {
    lines.push(`### ${index + 1}. ${unit.title}`, "", unit.summary || "No summary provided.", "");
    if (unit.items.length) {
      lines.push("#### Narrative material", "");
      for (const item of unit.items) {
        const status = item.possibilityStatus ? ` · ${item.possibilityStatus}` : "";
        lines.push(`- **${item.authority} · ${item.kind}${status}**: ${readableValue(item.content)}`);
      }
      lines.push("");
    }
  });
  return `${lines.join("\n").replace(/\n{3,}/gu, "\n\n").trim()}\n`;
}

function readableValue(value: unknown): string {
  if (typeof value === "string") return redactSensitiveText(value).replace(/\s+/gu, " ").trim();
  if (value === null || typeof value === "number" || typeof value === "boolean") return String(value);
  return redactSensitiveText(canonicalJson(value)).trim();
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeForCanonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, normalizeForCanonicalJson((value as Record<string, unknown>)[key])]));
  }
  return value ?? null;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/authorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/giu, "authorization: [REDACTED_SECRET]")
    .replace(/\b(?:sk-|ghp_|xoxb-|xoxp-)[A-Za-z0-9._-]+\b/gu, "[REDACTED_SECRET]")
    .replace(/(?:\/Users\/|\/private\/tmp\/|\/tmp\/|\/var\/folders\/|[A-Za-z]:[\\/])[^\s"'`]+/gu, "[REDACTED_PATH]");
}
