const DEFAULT_GRACEFUL_TIMEOUT_MS = 5_000;
const DEFAULT_FORCE_TIMEOUT_MS = 2_000;

export function waitForChildExit(child, timeoutMs) {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve({ exited: true, exitCode: child.exitCode, signalCode: child.signalCode });
  }

  return new Promise((resolve) => {
    let timer = null;
    const onExit = (exitCode, signalCode) => {
      if (timer) clearTimeout(timer);
      resolve({ exited: true, exitCode, signalCode });
    };

    child.once("exit", onExit);
    timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve({ exited: false, exitCode: child.exitCode, signalCode: child.signalCode });
    }, timeoutMs);
    timer.unref?.();
  });
}

export async function terminateChildProcess(child, options = {}) {
  const {
    label = "child process",
    gracefulTimeoutMs = DEFAULT_GRACEFUL_TIMEOUT_MS,
    forceTimeoutMs = DEFAULT_FORCE_TIMEOUT_MS
  } = options;

  if (child.exitCode != null || child.signalCode != null) {
    return { stage: "already-exited", exitCode: child.exitCode, signalCode: child.signalCode };
  }

  child.kill("SIGTERM");
  const graceful = await waitForChildExit(child, gracefulTimeoutMs);
  if (graceful.exited) return { stage: "graceful", ...graceful };

  child.kill("SIGKILL");
  const forced = await waitForChildExit(child, forceTimeoutMs);
  if (forced.exited) return { stage: "forced", ...forced };

  throw new Error(`${label} did not exit after bounded SIGTERM and SIGKILL waits.`);
}

export async function waitForCleanup(promise, options = {}) {
  const { label = "cleanup", timeoutMs = DEFAULT_GRACEFUL_TIMEOUT_MS } = options;
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded its bounded teardown timeout.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
