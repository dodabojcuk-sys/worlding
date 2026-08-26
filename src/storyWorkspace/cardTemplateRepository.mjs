import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  cardTemplateFileSegment,
  normalizeCardTemplate
} from "../storyCardPresentation/cardTemplateSchema.ts";
import { openStoryWorkspace } from "./storyWorkspaceRepository.mjs";

const MAX_TEMPLATE_BYTES = 256 * 1024;

export function cardTemplateRelativePath(templateId) {
  return `documents/card-templates/${cardTemplateFileSegment(templateId)}.card-template.json`;
}

export function validateCardTemplate(document) {
  return clone(normalizeCardTemplate(document));
}

export function listCardTemplates(rootPath) {
  const root = prepareRoot(rootPath);
  const directory = safePath(root, "documents/card-templates", { allowMissing: true, allowDirectory: true });
  if (!existsSync(directory)) return [];
  assertDirectory(directory, "Card template directory");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isSymbolicLink()) throw new Error("Card template directory cannot contain symlinks.");
      return entry.isFile() && entry.name.endsWith(".card-template.json");
    })
    .map((entry) => {
      const segment = entry.name.slice(0, -".card-template.json".length);
      return readCardTemplate(root, { templateId: `card-template.${segment}` });
    })
    .filter((entry) => !entry.missing)
    .sort((left, right) => left.template.label.localeCompare(right.template.label, "zh-CN") || left.template.id.localeCompare(right.template.id));
}

export function readCardTemplate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const relativePath = cardTemplateRelativePath(input.templateId);
  const absolutePath = safePath(root, relativePath, { allowMissing: true });
  if (!existsSync(absolutePath)) return clone({ template: null, relativePath, contentHash: null, source: "template-json", missing: true });
  assertRegularFile(absolutePath, "Card template");
  if (statSync(absolutePath).size > MAX_TEMPLATE_BYTES) throw new Error("Card template is too large.");
  const source = readFileSync(absolutePath, "utf8");
  const template = normalizeCardTemplate(parseJson(source));
  if (template.id !== input.templateId) throw new Error("Card template identifier does not match its file.");
  return clone({ template, relativePath, contentHash: hash(source), source: "template-json", missing: false });
}

export function saveCardTemplate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const template = normalizeCardTemplate(input.document);
  if (template.id !== input.templateId) throw new Error("Card template identifier does not match the requested owner.");
  const relativePath = cardTemplateRelativePath(template.id);
  const absolutePath = safePath(root, relativePath, { allowMissing: true });
  const current = existsSync(absolutePath) ? readCardTemplate(root, { templateId: template.id }) : null;
  const expected = input.expectedContentHash == null ? null : requireHash(input.expectedContentHash);
  if ((current && expected !== current.contentHash) || (!current && expected !== null)) {
    return clone({ ok: false, conflict: true, template: current });
  }
  const source = serializeCardTemplate(template);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  assertNoSymlinkPath(root, absolutePath, true);
  writeAtomic(absolutePath, source);
  return clone({ ok: true, conflict: false, template: readCardTemplate(root, { templateId: template.id }) });
}

export function deleteCardTemplate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const current = readCardTemplate(root, { templateId: input.templateId });
  if (current.missing) return clone({ ok: true, conflict: false, deleted: false, template: current });
  if (requireHash(input.expectedContentHash) !== current.contentHash) return clone({ ok: false, conflict: true, deleted: false, template: current });
  const absolutePath = safePath(root, current.relativePath);
  assertRegularFile(absolutePath, "Card template");
  rmSync(absolutePath, { force: true });
  return clone({ ok: true, conflict: false, deleted: true, template: { ...current, template: null, contentHash: null, missing: true } });
}

export function restoreCardTemplateSource(rootPath, input) {
  const root = prepareRoot(rootPath);
  const current = readCardTemplate(root, { templateId: input.templateId });
  if (current.missing || requireHash(input.expectedContentHash) !== current.contentHash) {
    return clone({ ok: false, conflict: true, template: current });
  }
  if (typeof input.source !== "string" || Buffer.byteLength(input.source, "utf8") > MAX_TEMPLATE_BYTES) throw new Error("Card template restore source is invalid.");
  const template = normalizeCardTemplate(parseJson(input.source));
  if (template.id !== input.templateId) throw new Error("Restored card template identity does not match its owner.");
  return saveCardTemplate(root, { templateId: input.templateId, expectedContentHash: current.contentHash, document: template });
}

export function serializeCardTemplate(document) {
  const template = normalizeCardTemplate(document);
  const source = `${JSON.stringify(template, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAX_TEMPLATE_BYTES) throw new Error("Card template is too large.");
  return source;
}

function prepareRoot(rootPath) {
  const absolute = path.resolve(String(rootPath || ""));
  openStoryWorkspace(absolute);
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("Workspace root cannot be a symlink.");
  return realpathSync(absolute);
}

function safePath(root, relativePath, options = {}) {
  const normalized = normalizeRelativePath(relativePath, options.allowDirectory === true);
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Card template path escapes the project.");
  assertNoSymlinkPath(root, absolute, options.allowMissing === true);
  return absolute;
}

function normalizeRelativePath(value, allowDirectory = false) {
  const text = String(value || "").normalize("NFC");
  if (/^(?:[A-Za-z]:[\\/]|%2e|%2f|%5c)/iu.test(text)) throw new Error("Card template path is invalid.");
  const normalized = text.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Card template path must be project-relative.");
  if (!allowDirectory && !/^documents\/card-templates\/[a-z0-9][a-z0-9._-]{0,94}\.card-template\.json$/u.test(normalized)) throw new Error("Card template path is invalid.");
  return normalized;
}

function assertNoSymlinkPath(root, target, allowMissing) {
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) {
      if (allowMissing) return;
      continue;
    }
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("Card template paths cannot cross symlinks.");
  }
  const parent = nearestExistingParent(target);
  const real = realpathSync(parent);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new Error("Card template path escapes the project.");
}

function nearestExistingParent(target) {
  let cursor = target;
  while (!existsSync(cursor)) cursor = path.dirname(cursor);
  return cursor;
}

function writeAtomic(target, source) {
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, source, { encoding: "utf8", flag: "w", mode: 0o600 });
    renameSync(temporary, target);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function parseJson(source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Card template JSON is malformed.");
    throw error;
  }
}

function requireHash(value) {
  const text = String(value || "");
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error("Card template hash is invalid.");
  return text;
}

function assertRegularFile(target, label) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isFile()) throw new Error(`${label} is invalid.`);
}

function assertDirectory(target, label) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isDirectory()) throw new Error(`${label} is invalid.`);
}

function hash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}
