import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  publishFileNoReplace,
  replaceFileAtomically
} from "../../src/storyControlSurface/atomicNoReplaceFile.ts";

test("same-directory publication creates complete bytes once and never replaces the winner", () => {
  const root = mkdtempSync(path.join(tmpdir(), "atomic-no-replace-"));
  try {
    const target = path.join(root, "world", "events", "event.md");
    const boundaries: string[] = [];
    assert.equal(publishFileNoReplace({
      rootPath: root,
      targetPath: target,
      content: "complete event\n",
      onBoundary: (boundary) => {
        boundaries.push(boundary);
        if (boundary === "temporary-durable") assert.equal(existsSync(target), false);
      }
    }), "created");
    assert.deepEqual(boundaries, ["temporary-durable", "final-published"]);
    assert.equal(publishFileNoReplace({
      rootPath: root,
      targetPath: target,
      content: "replacement\n"
    }), "exists");
    assert.equal(readFileSync(target, "utf8"), "complete event\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic replace uses complete staged bytes for mutable workflow records", () => {
  const root = mkdtempSync(path.join(tmpdir(), "atomic-replace-"));
  try {
    const target = path.join(root, "owner", "record.json");
    replaceFileAtomically({ rootPath: root, targetPath: target, content: "{\"state\":\"pending\"}\n" });
    replaceFileAtomically({ rootPath: root, targetPath: target, content: "{\"state\":\"applied\"}\n" });
    assert.equal(readFileSync(target, "utf8"), "{\"state\":\"applied\"}\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic publication rejects a symbolic-link final path", () => {
  const root = mkdtempSync(path.join(tmpdir(), "atomic-symlink-"));
  try {
    const outside = path.join(root, "outside");
    const target = path.join(root, "event.md");
    replaceFileAtomically({ rootPath: root, targetPath: outside, content: "outside\n" });
    symlinkSync(outside, target);
    assert.throws(
      () => publishFileNoReplace({ rootPath: root, targetPath: target, content: "event\n" }),
      /symbolic links/
    );
    assert.equal(readFileSync(outside, "utf8"), "outside\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic publication rejects a symbolic-link parent before creating outside directories", () => {
  const root = mkdtempSync(path.join(tmpdir(), "atomic-parent-symlink-root-"));
  const outside = mkdtempSync(path.join(tmpdir(), "atomic-parent-symlink-outside-"));
  try {
    mkdirSync(path.join(root, "events"));
    symlinkSync(outside, path.join(root, "events", "escape"));
    const target = path.join(root, "events", "escape", "created", "event.md");
    assert.throws(
      () => publishFileNoReplace({ rootPath: root, targetPath: target, content: "must not escape\n" }),
      /safe directory|symbolic links/u
    );
    assert.equal(existsSync(path.join(outside, "created")), false);
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
