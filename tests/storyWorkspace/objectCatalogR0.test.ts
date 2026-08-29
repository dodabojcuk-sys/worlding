import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createObjectCatalog } from "../../src/storyWorkspace/objectCatalog.ts";

test("object catalog defaults old projects to empty non-trash metadata and isolates work versions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-catalog-")); const catalog = createObjectCatalog(root);
  assert.deepEqual(catalog.read("project.demo", "work.root"), { schemaVersion: "tianyan-object-catalog/v1", projectId: "project.demo", workVersionId: "work.root", revision: 0, records: [] });
  assert.equal(catalog.read("project.demo", "work.other").records.length, 0);
});

test("trash preserves its source lifecycle and restore removes only catalog trash metadata", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-catalog-")); const catalog = createObjectCatalog(root);
  const trashed = catalog.moveToTrash({ projectId: "project.demo", workVersionId: "work.root", expectedRevision: 0, objectType: "character", objectIds: ["character.lin"], trashedFrom: "archived" });
  assert.equal(trashed.records[0]?.trashedFrom, "archived"); assert.ok(trashed.records[0]?.trashedAt);
  const restored = catalog.restoreFromTrash({ projectId: "project.demo", workVersionId: "work.root", expectedRevision: 1, objectType: "character", objectIds: ["character.lin"] });
  assert.equal(restored.records[0]?.trashedAt, null); assert.equal(restored.records[0]?.trashedFrom, null);
});

test("catalog persists directory metadata only and rejects stale revisions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-catalog-")); const catalog = createObjectCatalog(root);
  catalog.setCategory({ projectId: "project.demo", workVersionId: "work.root", expectedRevision: 0, objectType: "character", objectIds: ["character.lin"], categoryId: "cast.primary" });
  assert.throws(() => catalog.moveToTrash({ projectId: "project.demo", workVersionId: "work.root", expectedRevision: 0, objectType: "character", objectIds: ["character.lin"], trashedFrom: "active" }), /changed/u);
  const stored = readFileSync(path.join(root, ".world-os", "object-catalog", "work.root.json"), "utf8");
  assert.doesNotMatch(stored, /"title"|"summary"|"tags"|"relations"|"events"|"canon"|"image"/iu);
});

test("catalog accepts durable Unicode WorldObject identifiers without storing character fields", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-catalog-")); const catalog = createObjectCatalog(root);
  const saved = catalog.setCategory({ projectId: "project.demo", workVersionId: "work.root", expectedRevision: 0, objectType: "character", objectIds: ["character.沈砚"], categoryId: "main-characters" });
  assert.deepEqual(saved.records.map((record) => ({ objectId: record.objectId, categoryId: record.categoryId })), [{ objectId: "character.沈砚", categoryId: "main-characters" }]);
});
