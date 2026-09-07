import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("Nuwa N1 mounts a bounded author rehearsal surface at the real Nuwa workspace", () => {
  const outlet = source("apps/story-studio/src/product-shell/workspace/ShellWorkspaceOutlet.tsx");
  const workspace = source("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  const styles = source("apps/story-studio/src/styles/nuwa-n1.css");

  assert.match(outlet, /props\.destination\.id === "nuwa"/u);
  assert.match(outlet, /<NuwaN1Workspace runtime=\{props\.runtime\}/u);
  assert.match(workspace, /选择 2–3 位正式角色/u);
  assert.match(workspace, /本地工程演练 · 0 Provider/u);
  assert.match(workspace, /上下文检查器/u);
  assert.match(workspace, /送入待确认/u);
  assert.match(workspace, /加入后续步骤/u);
  assert.match(workspace, /开始第一步/u, "a newly-created ready Run has a reachable first transition");
  assert.match(workspace, /技术详情/u, "稳定 Run identity only appears in progressive disclosure");
  assert.match(workspace, /props\.runtime\.withConnection/u);
  assert.doesNotMatch(workspace, /fetch\(|Provider Gateway|apiKey|Authorization/u);
  assert.match(transport, /\/nuwa-n1\/bootstrap/u);
  assert.match(transport, /\/nuwa-n1\/latest/u);
  assert.match(transport, /\/nuwa-n1\/candidate/u);
  assert.match(transport, /operationId: string/u, "mutating Nuwa operations carry an idempotency identity");
  assert.match(transport, /selectedStepIds/u, "candidate handoff is limited to author-selected results");
  assert.match(transport, /providerCalls: 0/u);
  assert.match(styles, /\.nuwa-n1-composer \{ position: sticky/u);
  assert.match(styles, /@media \(max-width: 84rem\)/u);
});
