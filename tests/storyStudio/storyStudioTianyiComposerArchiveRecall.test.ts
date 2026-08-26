import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(process.cwd(), "apps", "story-studio", "src", "components", "tianyi", "TianyiWorkspace.tsx");
const workspace = readFileSync(workspacePath, "utf8");
const composer = readFileSync(path.join(process.cwd(), "apps", "story-studio", "src", "components", "tianyi", "TianyiComposer.tsx"), "utf8");
const transport = readFileSync(path.join(process.cwd(), "apps", "story-studio", "src", "lib", "localTransport.ts"), "utf8");

test("conversation-first Tianyi exposes one bounded Composer without reviving the retired companion UI", () => {
  assert.match(workspace, /<TianyiComposer/u);
  assert.match(workspace, /<TianyiConversationThread/u);
  assert.match(composer, /data-ime-composing/u);
  assert.match(composer, /Provider 状态见工作台顶部/u);
  assert.doesNotMatch(workspace, /新建普通对话|新建临时对话|data-tianyi-temporary-disclosure/u);
  assert.equal(existsSync(path.join(process.cwd(), "apps", "story-studio", "src", "components", "tianyi", "TianyiCompanionPanel.tsx")), false);
  assert.doesNotMatch(workspace, /system prompt|hidden chain of thought|provider secret/iu);
});

test("Archive, temporary-session, and source-return capabilities remain in the existing transport owner", () => {
  assert.match(transport, /export async function retainTemporaryTianyiMessages/u);
  assert.match(transport, /export async function searchTianyiArchiveRecall/u);
  assert.match(transport, /export async function recordTianyiSourceReturn/u);
  assert.match(transport, /export async function rebuildTianyiArchiveRecall/u);
  assert.match(transport, /authorizedProjectIds: \[projectId\]/u);
  assert.doesNotMatch(transport, /archive-recall\/file|readArchiveFile|filesystemPath/iu);
});

test("durable memory and destructive archive operations remain explicit transport operations", () => {
  assert.match(transport, /decideTianyiMemoryCandidate/u);
  assert.match(transport, /secondConfirmation: boolean/u);
  assert.match(transport, /hardDeleteTianyiArchiveMessage/u);
  assert.match(transport, /hardDeleteTianyiArchiveSession/u);
  assert.match(transport, /rebuildTianyiArchiveRecall/u);
});
