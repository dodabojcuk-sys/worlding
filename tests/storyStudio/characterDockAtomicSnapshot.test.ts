import assert from "node:assert/strict";
import test from "node:test";

import {
  createCharacterDockSnapshotController,
  loadCharacterDockSnapshot,
} from "../../apps/story-studio/src/components/entity-dock/characterDockSnapshot.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

const scope = { projectId: "project.a", objectId: "character.a", workVersionId: "wv.1" };

test("a dock snapshot reads all five required sources once and resolves only when all are complete", async () => {
  const gates = {
    character: deferred<any>(), world: deferred<any>(), knowledge: deferred<any>(), relations: deferred<any>(), memories: deferred<any>(),
  };
  const counts = { character: 0, world: 0, knowledge: 0, relations: 0, memories: 0 };
  const promise = loadCharacterDockSnapshot(scope, {
    readCharacter: () => { counts.character += 1; return gates.character.promise; },
    readWorldLibrary: () => { counts.world += 1; return gates.world.promise; },
    readKnowledge: () => { counts.knowledge += 1; return gates.knowledge.promise; },
    readRelations: () => { counts.relations += 1; return gates.relations.promise; },
    readMemories: () => { counts.memories += 1; return gates.memories.promise; },
  });
  let settled = false;
  void promise.then(() => { settled = true; });
  gates.character.resolve({ id: "character.a", type: "character", title: "A", revisionToken: "rev.1", status: "active", card: {}, profile: null, worldProjection: null });
  gates.world.resolve({ objects: [] });
  gates.knowledge.resolve({ observer: { id: "character.a" }, characterStateProjectionRevision: "projection.1" });
  gates.relations.resolve({ relations: [] });
  await Promise.resolve();
  assert.equal(settled, false, "No partial snapshot may resolve before memory completes.");
  gates.memories.resolve({ records: [] });
  const snapshot = await promise;
  assert.deepEqual(counts, { character: 1, world: 1, knowledge: 1, relations: 1, memories: 1 });
  assert.equal(snapshot.read.revisionToken, "rev.1");
  assert.equal(snapshot.knowledge.characterStateProjectionRevision, "projection.1");
});

test("a refresh failure commits no partial fields and preserves the previous complete snapshot", async () => {
  const committed: Array<{ revision: string; digest: string }> = [{ revision: "old", digest: "old-digest" }];
  const failures: string[] = [];
  const controller = createCharacterDockSnapshotController({
    load: async () => { throw new Error("memory failed"); },
    commit: (snapshot: { revision: string; digest: string }) => committed.push(snapshot),
    onInitialFailure: () => failures.push("initial"),
    onRefreshFailure: () => failures.push("刷新失败，当前仍显示上一次完整快照。"),
  });
  await controller.run("refresh");
  assert.deepEqual(committed, [{ revision: "old", digest: "old-digest" }]);
  assert.deepEqual(failures, ["刷新失败，当前仍显示上一次完整快照。"]) ;
});

test("generation guards drop stale success, stale error, and every result after dispose", async () => {
  const staleSuccess = deferred<number>();
  const currentSuccess = deferred<number>();
  const reads = [staleSuccess, currentSuccess];
  const commits: number[] = [];
  const failures: string[] = [];
  const controller = createCharacterDockSnapshotController({
    load: () => reads.shift()!.promise,
    commit: (value) => commits.push(value),
    onInitialFailure: () => failures.push("initial"),
    onRefreshFailure: () => failures.push("refresh"),
  });
  const oldSuccess = controller.run("refresh");
  const newSuccess = controller.run("refresh");
  currentSuccess.resolve(2);
  await newSuccess;
  staleSuccess.resolve(1);
  await Promise.all([oldSuccess, newSuccess]);
  assert.deepEqual(commits, [2], "An older success cannot overwrite the newer complete snapshot.");
  assert.deepEqual(failures, []);

  const unmountGate = deferred<number>();
  const unmountCommits: number[] = [];
  const unmountFailures: string[] = [];
  const unmountController = createCharacterDockSnapshotController({
    load: () => unmountGate.promise,
    commit: (value) => unmountCommits.push(value),
    onInitialFailure: () => unmountFailures.push("initial"),
    onRefreshFailure: () => unmountFailures.push("refresh"),
  });
  const lateSuccess = unmountController.run("refresh");
  unmountController.dispose();
  unmountGate.resolve(3);
  await lateSuccess;
  assert.deepEqual(unmountCommits, [], "Unmount/dispose prevents late success commits.");
  assert.deepEqual(unmountFailures, [], "Unmount/dispose prevents late errors from surfacing.");
});

test("a newer failed generation keeps the old complete snapshot and blocks an older late success", async () => {
  const first = deferred<{ revision: string }>();
  const second = deferred<{ revision: string }>();
  const queue = [first, second];
  const commits: string[] = ["old"];
  const failures: string[] = [];
  const controller = createCharacterDockSnapshotController({
    load: () => queue.shift()!.promise,
    commit: (value) => commits.push(value.revision),
    onInitialFailure: () => failures.push("initial"),
    onRefreshFailure: () => failures.push("refresh"),
  });
  const oldRun = controller.run("refresh");
  const newRun = controller.run("refresh");
  second.reject(new Error("new failure"));
  await newRun;
  first.resolve({ revision: "stale-success" });
  await oldRun;
  assert.deepEqual(commits, ["old"]);
  assert.deepEqual(failures, ["refresh"]);
});

test("an older late failure cannot replace a newer successful generation", async () => {
  const first = deferred<{ revision: string }>();
  const second = deferred<{ revision: string }>();
  const queue = [first, second];
  const commits: string[] = [];
  const failures: string[] = [];
  const controller = createCharacterDockSnapshotController({
    load: () => queue.shift()!.promise,
    commit: (value) => commits.push(value.revision),
    onInitialFailure: () => failures.push("initial"),
    onRefreshFailure: () => failures.push("refresh"),
  });
  const oldRun = controller.run("refresh");
  const newRun = controller.run("refresh");
  second.resolve({ revision: "new" });
  await newRun;
  first.reject(new Error("stale failure"));
  await oldRun;
  assert.deepEqual(commits, ["new"]);
  assert.deepEqual(failures, []);
});

test("an initial failure commits no incomplete snapshot", async () => {
  const commits: unknown[] = [];
  const failures: string[] = [];
  const controller = createCharacterDockSnapshotController({
    load: async () => { throw new Error("knowledge unavailable"); },
    commit: (value) => commits.push(value),
    onInitialFailure: () => failures.push("initial"),
    onRefreshFailure: () => failures.push("refresh"),
  });
  await controller.run("initial");
  assert.deepEqual(commits, []);
  assert.deepEqual(failures, ["initial"]);
});
