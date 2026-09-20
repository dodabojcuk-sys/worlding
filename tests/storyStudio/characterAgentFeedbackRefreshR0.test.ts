import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createEntityDockRefreshCoordinator,
  invalidationTouchesScope,
  STORY_STUDIO_PENDING_REVIEW_CHANGED
} from "../../apps/story-studio/src/components/entity-dock/entityDockProjectionRefresh.ts";

const dock = readFileSync("apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx", "utf8");
const characterDock = dock.slice(dock.indexOf("function CharacterEntityDock"), dock.indexOf("/** 只读展示知情投影已经跨界的内容"));
const pendingReviewPanel = readFileSync("apps/story-studio/src/product-shell/project-directory/PendingReviewPanel.tsx", "utf8");
const tianyiAdoptionPanel = readFileSync("apps/story-studio/src/components/tianyi/workspace/TianyiAdoptionPanel.tsx", "utf8");
const eventLineProjection = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const coordinatorModule = readFileSync("apps/story-studio/src/components/entity-dock/entityDockProjectionRefresh.ts", "utf8");
const completionBridge = readFileSync("apps/story-studio/src/lib/projectProjectionCompletionBridge.ts", "utf8");
const localTransport = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
const e2eScript = readFileSync("apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs", "utf8");

function manualScheduler() {
  const queue: Array<() => void> = [];
  return {
    queue,
    schedule(task: () => void): () => void {
      queue.push(task);
      return () => {
        const index = queue.indexOf(task);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    runQueued() {
      while (queue.length) {
        const task = queue.shift() as () => void;
        task();
      }
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/** Lets every pending coordinator microtask (round start and completion) settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const completion = (projectId = "project.a", workVersionId?: string) => ({ kind: "projection-change-completed" as const, projectId, operationPath: "/author-control/change-set/apply", ...(workVersionId ? { workVersionId } : {}) });
const currentProjectOnly = (detail?: { projectId?: string } | null) => detail?.projectId === "project.a";

test("the dock refresh trigger reuses the existing pending-review event name and introduces no third signal", () => {
  assert.equal(STORY_STUDIO_PENDING_REVIEW_CHANGED, "story-studio-pending-review-changed");
  for (const source of [pendingReviewPanel, tianyiAdoptionPanel, coordinatorModule]) {
    assert.doesNotMatch(source, /story-studio-[a-z-]*invalidat[a-z-]*|story-studio-projection-/u, "No new invalidation event name may appear.");
  }
});

test("invalidation scope check rejects unrelated projects and accepts the current project", () => {
  const scope = { projectId: "project.a", workVersionId: null };
  assert.equal(invalidationTouchesScope(scope, completion()), true);
  assert.equal(invalidationTouchesScope(scope, completion("project.b")), false, "T4: another project's invalidation must not refresh this dock.");
  assert.equal(invalidationTouchesScope(scope, null), false, "A bare legacy event must not refresh the Character Dock.");
  assert.equal(invalidationTouchesScope({ projectId: null, workVersionId: null }, completion()), false, "No open project scope means nothing to refresh.");
});

test("invalidation scope check honours workVersion narrowing without dropping project-wide signals", () => {
  const scoped = { projectId: "project.a", workVersionId: "wv.1" };
  assert.equal(invalidationTouchesScope(scoped, completion("project.a", "wv.1")), true);
  assert.equal(invalidationTouchesScope(scoped, completion("project.a", "wv.2")), false, "T5: another work version's invalidation must not refresh this dock.");
  assert.equal(invalidationTouchesScope(scoped, completion()), true, "An apply signal without a work version is project-wide.");
  assert.equal(invalidationTouchesScope({ projectId: "project.a", workVersionId: null }, completion("project.a", "wv.2")), false, "An authoritative work version cannot match an unversioned dock scope.");
});

test("duplicate author signals for one apply coalesce into a single refresh round", async () => {
  const scheduler = manualScheduler();
  let rounds = 0;
  const coordinator = createEntityDockRefreshCoordinator({ runRound: () => { rounds += 1; }, isRelevant: currentProjectOnly, schedule: scheduler.schedule });
  coordinator.notify({ projectId: "project.a" });
  coordinator.notify({ projectId: "project.a" });
  assert.equal(scheduler.queue.length, 1, "T8: notifications in the same tick must queue exactly one round.");
  scheduler.runQueued();
  await settle();
  assert.equal(rounds, 1);
  assert.equal(scheduler.queue.length, 0, "No second round may follow a coalesced apply.");
  coordinator.dispose();
});

test("burst notifications coalesce into one round with at most one trailing re-check", async () => {
  const scheduler = manualScheduler();
  let rounds = 0;
  const gate = deferred<void>();
  const coordinator = createEntityDockRefreshCoordinator({
    runRound: () => {
      rounds += 1;
      return rounds === 1 ? gate.promise : undefined;
    },
    isRelevant: currentProjectOnly,
    schedule: scheduler.schedule
  });
  for (let index = 0; index < 5; index += 1) coordinator.notify({ projectId: "project.a" });
  assert.equal(scheduler.queue.length, 1, "T9: five same-scope notifications must not queue five rounds.");
  scheduler.runQueued();
  await settle();
  assert.equal(rounds, 1, "The scheduled round ran exactly once for the burst.");
  gate.resolve();
  await settle();
  assert.equal(scheduler.queue.length, 0, "Quiet periods must not schedule speculative rounds.");
  coordinator.notify({ projectId: "project.a" });
  coordinator.notify({ projectId: "project.a" });
  scheduler.runQueued();
  await settle();
  assert.equal(rounds, 2);
  coordinator.dispose();
});

test("notifications arriving during a running round queue exactly one trailing round", async () => {
  const scheduler = manualScheduler();
  const gates = [deferred<void>(), deferred<void>()];
  let started = 0;
  const coordinator = createEntityDockRefreshCoordinator({
    runRound: () => {
      started += 1;
      return gates[Math.min(started - 1, gates.length - 1)].promise;
    },
    isRelevant: currentProjectOnly,
    schedule: scheduler.schedule
  });
  coordinator.notify({ projectId: "project.a" });
  scheduler.runQueued();
  await settle();
  assert.equal(started, 1);
  coordinator.notify({ projectId: "project.a" });
  coordinator.notify({ projectId: "project.a" });
  coordinator.notify({ projectId: "project.b" });
  assert.equal(scheduler.queue.length, 0, "No concurrent round may start while one is running.");
  gates[0].resolve();
  await settle();
  assert.equal(scheduler.queue.length, 1, "Notifications during a round queue exactly one trailing round.");
  scheduler.runQueued();
  await settle();
  assert.equal(started, 2, "T10: notifications during a round collapse into one trailing round.");
  gates[1].resolve();
  await settle();
  assert.equal(scheduler.queue.length, 0, "The trailing chain stops once notifications settle.");
  coordinator.dispose();
});

test("a disposed coordinator never starts reads, so a closed dock stays silent", async () => {
  const scheduler = manualScheduler();
  let rounds = 0;
  const coordinator = createEntityDockRefreshCoordinator({ runRound: () => { rounds += 1; }, isRelevant: currentProjectOnly, schedule: scheduler.schedule });
  coordinator.dispose();
  coordinator.notify({ projectId: "project.a" });
  scheduler.runQueued();
  await settle();
  assert.equal(rounds, 0, "T6: after dispose (dock closed) no refresh reads may start.");
  assert.equal(scheduler.queue.length, 0);
});

test("out-of-scope notifications never reach the coordinator queue", async () => {
  const scheduler = manualScheduler();
  let rounds = 0;
  const coordinator = createEntityDockRefreshCoordinator({ runRound: () => { rounds += 1; }, isRelevant: currentProjectOnly, schedule: scheduler.schedule });
  coordinator.notify({ projectId: "project.other" });
  coordinator.notify({ projectId: "project.other", workVersionId: "wv.9" });
  scheduler.runQueued();
  await settle();
  assert.equal(rounds, 0, "The scope check must filter before anything is scheduled.");
  assert.equal(scheduler.queue.length, 0);
  coordinator.dispose();
});

test("the character dock awaits a generation-guarded atomic snapshot and preserves it on refresh failure", () => {
  assert.match(characterDock, /useEntityDockProjectionRefresh\(/, "The dock must subscribe through the shared pure-UI coordinator.");
  assert.match(characterDock, /createCharacterDockSnapshotController/, "A generation guard must drop stale responses.");
  assert.match(characterDock, /loadCharacterDockSnapshot/, "Every round must await one complete snapshot loader.");
  assert.match(characterDock, /snapshotControllerRef\.current\?\.run\("refresh"\)\s*\?\?\s*Promise\.resolve\(\)/, "The coordinator callback must return the current effect-scoped refresh Promise.");
  assert.match(characterDock, /useEffect\(\(\) => \{[\s\S]*const snapshotController = createCharacterDockSnapshotController/u, "StrictMode cleanup must dispose only an effect-scoped controller, never a permanently memoized instance.");
  assert.doesNotMatch(characterDock, /setInterval|location\.reload|window\.location/u, "No polling, reload or URL forcing may enter the dock.");
  assert.match(characterDock, /refreshError/, "A failed refresh must be surfaced instead of being read as empty data.");
  assert.match(dock, /role="status"[^>]*>/u, "Refresh status must be announced politely for assistive tech.");
  assert.match(characterDock, /刷新失败，当前仍显示上一次完整快照/u, "Refresh failure must preserve and name the prior complete snapshot.");
});

test("the refresh path adds no writes, no provider use and no second context assembly", () => {
  assert.doesNotMatch(dock, /method:\s*"POST"/u, "T13: the dock must stay read-only.");
  assert.doesNotMatch(dock, /applyAuthorChangeSet|createConfirmedEvent|confirmTianyi|storyIntakeBatch/u, "T13: no story write path may enter the dock.");
  assert.doesNotMatch(coordinatorModule, /localTransport|fetch\(|providerGateway|storyContracts/u, "The coordinator is pure UI: no transport, no provider, no context reassembly.");
});

test("formal completion is emitted only by the centralized transport bridge, never by apply UI", () => {
  const goldenCard = pendingReviewPanel.slice(pendingReviewPanel.indexOf("function GoldenCandidateAdoptionCard"), pendingReviewPanel.indexOf("export function PendingReviewPanel"));
  assert.match(goldenCard, /applyAuthorChangeSet/, "The golden adoption card must be the apply site.");
  assert.doesNotMatch(goldenCard, /dispatchEvent|projection-change-completed/u, "Golden apply must not manually announce completion.");
  const adoptionRun = tianyiAdoptionPanel.slice(tianyiAdoptionPanel.indexOf("const run = async"), tianyiAdoptionPanel.indexOf("if (!review || !project"));
  assert.doesNotMatch(adoptionRun, /dispatchEvent|projection-change-completed/u, "Tianyi apply and undo must not manually announce completion.");
  assert.doesNotMatch(eventLineProjection, /projection-change-completed/u, "Event Line must not manufacture a formal completion detail.");
  assert.match(localTransport, /completeProjectProjectionTransport\(/, "localTransport must own the single completion bridge call.");
  assert.match(completionBridge, /emitStoryStudioProjectionChangeCompleted\(/, "Only the centralized bridge may emit typed completion.");
});

test("existing projection ownership and safe-context contracts stay untouched by the refresh wiring", () => {
  assert.match(dock, /prepareCharacterContextGateway\(/, "The safe preview must keep flowing through the shared gateway.");
  assert.match(dock, /projectCharacterContextExclusionCounts\(knowledge\)/);
  assert.match(coordinatorModule, /不保存领域事实|纯 UI/u, "The coordinator must document its no-owner boundary.");
});

test("the feature E2E remains explicit but is absent from the default serial sweep", () => {
  assert.match(e2eScript, /characterFeedbackOnly = process\.env\.TIANYAN_E2E_SCOPE === "character-agent-feedback-refresh"/u);
  const defaultSweep = e2eScript.slice(e2eScript.indexOf("if (!process.env.TIANYAN_E2E_SCOPE)"), e2eScript.indexOf("const require = createRequire"));
  assert.doesNotMatch(defaultSweep, /character-agent-feedback-refresh/u);
});
