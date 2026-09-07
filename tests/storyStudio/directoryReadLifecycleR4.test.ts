import assert from "node:assert/strict";
import test from "node:test";

import { InFlightReadRegistry, InFlightReadTimeoutError } from "../../apps/story-studio/src/lib/inFlightReadRegistry.ts";
import { decideDirectoryCoreDisposition } from "../../apps/story-studio/src/product-shell/project-directory/directoryProjectionLifecycle.ts";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

test("R4 directory coalesces concurrent project reads and releases the entry after completion", async () => {
  const reads = new InFlightReadRegistry(100);
  let starts = 0;
  let resolve!: (value: number) => void;
  const first = reads.read("project.a/world-library", () => {
    starts += 1;
    return new Promise<number>((done) => { resolve = done; });
  });
  const second = reads.read("project.a/world-library", () => {
    starts += 1;
    return Promise.resolve(2);
  });

  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.promise, second.promise);
  assert.equal(starts, 1);
  resolve(30);
  assert.deepEqual(await Promise.all([first.promise, second.promise]), [30, 30]);
  assert.equal(reads.has("project.a/world-library"), false);

  const fresh = reads.read("project.a/world-library", () => Promise.resolve(31));
  assert.equal(fresh.reused, false, "settled reads are not cached across owner invalidations");
  assert.equal(await fresh.promise, 31);
});

test("R4 directory times out a hung shared read, aborts it, and permits recovery", async () => {
  const reads = new InFlightReadRegistry(10);
  let aborted = false;
  const hung = reads.read("project.a/story-units", (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("aborted", "AbortError"));
    });
  }));

  await assert.rejects(hung.promise, (error) => error instanceof InFlightReadTimeoutError && error.timeoutMs === 10);
  assert.equal(aborted, true);
  assert.equal(reads.has("project.a/story-units"), false);
  assert.equal(await reads.read("project.a/story-units", () => Promise.resolve(["recovered"])).promise.then((items) => items[0]), "recovered");
});

test("R4 response-driven reads do not turn a busy local owner into a false timeout", async () => {
  const reads = new InFlightReadRegistry(null, 20);
  let aborted = false;
  const pending = reads.read("project.a/world-library", (signal) => new Promise<number>((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("aborted", "AbortError"));
    });
  }));

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(reads.has("project.a/world-library"), true, "elapsed time alone must not convert a live local read into a transport failure");
  assert.equal(aborted, false);
  reads.invalidateAll();
  await assert.rejects(pending.promise, (error) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(aborted, true, "an explicit owner invalidation still aborts the obsolete read");
});

test("R4 directory reuses only a bounded fresh snapshot and invalidates it on writes", async () => {
  const reads = new InFlightReadRegistry(100, 20);
  let starts = 0;
  const start = () => {
    starts += 1;
    return Promise.resolve(starts);
  };

  assert.equal(await reads.read("project.a/story-units", start).promise, 1);
  const fresh = reads.read("project.a/story-units", start);
  assert.equal(fresh.reused, true);
  assert.equal(fresh.fresh, true);
  assert.equal(await fresh.promise, 1);
  assert.equal(starts, 1);

  reads.invalidateSettled();
  assert.equal(await reads.read("project.a/story-units", start).promise, 2, "a business write must force a new owner read");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(await reads.read("project.a/story-units", start).promise, 3, "the freshness window must expire without a write");

  let resolveInFlight!: (value: number) => void;
  const inFlight = reads.read("project.a/world-library", () => new Promise<number>((resolve) => { resolveInFlight = resolve; }));
  reads.invalidateSettled();
  assert.equal(reads.has("project.a/world-library"), true, "an unrelated write must not abort a valid in-flight owner read");
  resolveInFlight(30);
  assert.equal(await inFlight.promise, 30);
});

test("R4 directory does not refill a fresh snapshot from a read that began before a write", async () => {
  const reads = new InFlightReadRegistry(100, 5_000);
  const oldRead = deferred<number>();
  let starts = 0;

  const pendingOld = reads.read("project.a/story-units", () => oldRead.promise);
  reads.invalidateSettled(); // POST begins: retain the in-flight GET but invalidate its cache generation.
  oldRead.resolve(1);
  assert.equal(await pendingOld.promise, 1, "the original caller may still receive its own old response");

  // The write has now committed. Its pre-write read must already have been
  // barred from refilling the freshness window, even though it completed late.
  const afterWrite = reads.read("project.a/story-units", () => Promise.resolve(++starts + 1));
  assert.equal(afterWrite.reused, false, "a late pre-write GET must not become a fresh snapshot");
  assert.equal(await afterWrite.promise, 2);
});

test("R4 directory does not retain a read that started while a write was still pending", async () => {
  const reads = new InFlightReadRegistry(100, 5_000);
  const duringWrite = deferred<number>();
  let starts = 0;

  const finishWrite = reads.beginInvalidationBoundary(); // POST begins.
  const pendingDuringWrite = reads.read("project.a/world-library", () => duringWrite.promise);
  duringWrite.resolve(7); // The endpoint may still return the old revision before POST commits.
  assert.equal(await pendingDuringWrite.promise, 7);

  finishWrite(); // POST succeeds without evicting a newer post-write read.
  const afterWrite = reads.read("project.a/world-library", () => Promise.resolve(++starts + 7));
  assert.equal(afterWrite.reused, false, "a GET started during POST cannot refill the post-write cache");
  assert.equal(await afterWrite.promise, 8);
});

test("R4 directory closing a write boundary preserves a read that began after the write", async () => {
  const reads = new InFlightReadRegistry(100, 5_000);
  const finishWrite = reads.beginInvalidationBoundary();
  finishWrite();

  let starts = 0;
  const first = reads.read("project.a/world-library", () => Promise.resolve(++starts));
  assert.equal(await first.promise, 1);
  const reused = reads.read("project.a/world-library", () => Promise.resolve(++starts));
  assert.equal(reused.reused, true, "write completion must not invalidate a newer projection read twice");
  assert.equal(await reused.promise, 1);
  assert.equal(starts, 1);
});

test("R4 directory distinguishes legitimate empty, project mismatch, cleanup, and ready data", () => {
  assert.deepEqual(decideDirectoryCoreDisposition({ requestedProjectId: "project.a", responseProjectId: "project.a", cancelled: false, objectCount: 0, unitCount: 0 }), { kind: "commit", outcome: "empty" });
  assert.deepEqual(decideDirectoryCoreDisposition({ requestedProjectId: "project.a", responseProjectId: "project.a", cancelled: false, objectCount: 30, unitCount: 2 }), { kind: "commit", outcome: "ready" });
  assert.deepEqual(decideDirectoryCoreDisposition({ requestedProjectId: "project.a", responseProjectId: "project.b", cancelled: false, objectCount: 30, unitCount: 2 }), { kind: "discard", reason: "project-mismatch" });
  assert.deepEqual(decideDirectoryCoreDisposition({ requestedProjectId: "project.a", responseProjectId: "project.a", cancelled: true, objectCount: 30, unitCount: 2 }), { kind: "discard", reason: "effect-cleanup" });
});
