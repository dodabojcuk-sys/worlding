import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { appendWorldStateN4Change, emptyWorldStateN4Store, normalizeWorldStateN4Store, type WorldStateN4Store } from "../storyContracts/worldStateN4.ts";

const STATE_PATH = path.join(".world-os", "world-state-n4", "state.json");

/** The file is private to the existing WorkspaceOperations WorldState owner. */
export function readWorldStateN4Repository(projectPath: string): WorldStateN4Store {
  const target = path.join(path.resolve(projectPath), STATE_PATH);
  if (!existsSync(target)) return emptyWorldStateN4Store();
  if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error("World state N4 store must be a regular file.");
  return normalizeWorldStateN4Store(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

export function appendWorldStateN4Repository(projectPath: string, input: Parameters<typeof appendWorldStateN4Change>[0]) {
  const root = path.resolve(projectPath);
  const current = readWorldStateN4Repository(root);
  const result = appendWorldStateN4Change({ ...input, store: current });
  if (!result.idempotent) {
    const target = path.join(root, STATE_PATH);
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(result.store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, target);
  }
  return result;
}
