import { readdir } from "node:fs/promises";
import path from "node:path";

import { readSession } from "../../../src/storyContinuity/interactionArchiveRepository.ts";
import { listReceiptMetadata, readReceipt } from "../../../src/storyContinuity/receiptStoppingRepositories.ts";

const [rootPath, projectId, sessionId] = process.argv.slice(2);
if (!rootPath || !projectId || !sessionId) {
  throw new Error("Partial-recovery inspector arguments are incomplete.");
}

const context = {
  rootPath,
  agentId: "agent.tianyi",
  scope: "project" as const,
  projectId
};
const session = await readSession(context, sessionId);
const receiptMetadata = await listReceiptMetadata(context);
const receipts = await Promise.all(receiptMetadata.map((item) => readReceipt(context, item.id)));
const reservations = await listFiles(path.join(rootPath, ".world-os", "continuity-id-reservations"));

process.stdout.write(`${JSON.stringify({
  sessionContentHash: session?.contentHash ?? null,
  authorMessages: session?.value.filter((event) => event.type === "author-message").length ?? 0,
  assistantMessages: session?.value.filter((event) => event.type === "tianyi-response").length ?? 0,
  attemptStates: session?.value.filter((event) => event.type === "grounded-attempt").map((event) => {
    const value = JSON.parse(event.content) as { state?: unknown; providerDispatchCount?: unknown };
    return { state: value.state, providerDispatchCount: value.providerDispatchCount };
  }) ?? [],
  receiptIds: receipts.flatMap((receipt) => receipt ? [receipt.value.id] : []),
  receiptHashes: receipts.flatMap((receipt) => receipt ? [receipt.contentHash] : []),
  reservationCount: reservations.length
})}\n`);

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else result.push(path.relative(root, target));
    }
  }
  await walk(root);
  return result.sort();
}
