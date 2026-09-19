import { useEffect, useRef } from "react";
import {
  readStoryStudioProjectionChangeDetail,
  STORY_STUDIO_PENDING_REVIEW_CHANGED,
  type StoryStudioProjectionChangeCompletedDetail,
} from "../../lib/storyStudioProjectionChangeEvent.ts";

export { STORY_STUDIO_PENDING_REVIEW_CHANGED };

/**
 * 纯 UI 刷新协调器：只负责订阅、去重、scope 判断、触发读取与忽略过期响应。
 * 不保存领域事实、不是 Owner、不持久化、不引入第三个业务事件名——
 * 触发信号沿用既有 story-studio-pending-review-changed，
 * 数据新鲜度权威仍是 projectProjectionInvalidation 的写入围栏（transport 内部）。
 */

export type EntityDockInvalidationDetail = StoryStudioProjectionChangeCompletedDetail;

export type EntityDockRefreshScope = { projectId: string | null; workVersionId: string | null };

/**
 * Only a typed completion for this project touches the dock. If the completion
 * carries an authoritative workVersionId it must equal the dock scope. A
 * project-scoped completion intentionally omits that field and reloads the
 * work version already selected by the dock.
 */
export function invalidationTouchesScope(scope: EntityDockRefreshScope, detail?: EntityDockInvalidationDetail | null): boolean {
  if (!scope.projectId || !detail || detail.kind !== "projection-change-completed") return false;
  if (detail.projectId !== scope.projectId) return false;
  if (detail.workVersionId && detail.workVersionId !== scope.workVersionId) return false;
  return true;
}

export type EntityDockRefreshCoordinator = {
  notify(detail?: EntityDockInvalidationDetail | null): void;
  dispose(): void;
};

/**
 * Coalesces in-scope notifications into the minimum number of refresh rounds:
 * same-tick duplicates collapse into one scheduled round, and notifications
 * that arrive while a round is running collapse into exactly one trailing
 * re-check, so a late change is never lost without a second full scan.
 * Out-of-scope signals are dropped before they can schedule anything.
 * Rounds never run concurrently; the caller's own load guard stays
 * responsible for dropping stale responses.
 */
export function createEntityDockRefreshCoordinator(input: {
  runRound(): void | Promise<void>;
  isRelevant?(detail?: EntityDockInvalidationDetail | null): boolean;
  schedule?(task: () => void): () => void;
}): EntityDockRefreshCoordinator {
  const schedule = input.schedule ?? defaultSchedule;
  const isRelevant = input.isRelevant ?? (() => true);
  let disposed = false;
  let taskQueued = false;
  let cancelTask: (() => void) | null = null;
  let roundRunning = false;
  let notifiedDuringRound = false;

  const queueFlush = () => {
    if (taskQueued || disposed) return;
    taskQueued = true;
    cancelTask = schedule(flush);
  };
  const flush = () => {
    taskQueued = false;
    cancelTask = null;
    if (disposed || roundRunning) return;
    roundRunning = true;
    notifiedDuringRound = false;
    void Promise.resolve()
      .then(() => input.runRound())
      .catch(() => undefined)
      .then(() => {
        roundRunning = false;
        if (disposed) return;
        if (notifiedDuringRound) queueFlush();
      });
  };
  return {
    notify(detail?: EntityDockInvalidationDetail | null) {
      if (disposed) return;
      if (!isRelevant(detail ?? null)) return;
      if (roundRunning) {
        notifiedDuringRound = true;
        return;
      }
      queueFlush();
    },
    dispose() {
      disposed = true;
      cancelTask?.();
      cancelTask = null;
      taskQueued = false;
    }
  };
}

function defaultSchedule(task: () => void): () => void {
  const id = setTimeout(task, 0);
  return () => clearTimeout(id);
}

/**
 * Subscribes the mounted dock to author-change signals. The dock unmounts
 * when it closes, so a closed dock keeps neither a listener nor reads.
 * Scope and round callbacks are read through refs, so notifications always
 * judge against the project/work version currently on screen.
 */
export function useEntityDockProjectionRefresh(scope: EntityDockRefreshScope, onRefreshRound: () => void | Promise<void>): void {
  const roundRef = useRef(onRefreshRound);
  roundRef.current = onRefreshRound;
  useEffect(() => {
    const coordinator = createEntityDockRefreshCoordinator({
      runRound: () => roundRef.current(),
      isRelevant: (detail) => invalidationTouchesScope(scope, detail)
    });
    const onInvalidation = (event: Event) => {
      const detail = readStoryStudioProjectionChangeDetail(event);
      if (detail) coordinator.notify(detail);
    };
    window.addEventListener(STORY_STUDIO_PENDING_REVIEW_CHANGED, onInvalidation);
    return () => {
      window.removeEventListener(STORY_STUDIO_PENDING_REVIEW_CHANGED, onInvalidation);
      coordinator.dispose();
    };
  }, [scope.projectId, scope.workVersionId]);
}
