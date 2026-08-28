import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

test("Tianyi Event review context keeps author-readable identity and safety visible without route inference", async () => {
  const [component, workspace, port] = await Promise.all([
    source("apps/story-studio/src/components/tianyi/ReviewContextSummary.tsx"),
    source("apps/story-studio/src/components/tianyi/TianyiCreativeWorkspace.tsx"),
    source("apps/story-studio/server/tianyiCreativeEventPort.mjs")
  ]);
  for (const label of ["当前作品", "故事来源", "来源版本", "确认后写入", "技术信息"]) assert.match(component, new RegExp(label, "u"));
  assert.doesNotMatch(component, /window\.location|useLocation|story\./u, "The display component must not derive a route or write target.");
  assert.match(port, /displayName: project\.title/u);
  assert.match(port, /displayName: "当前作品 · 事件线"/u);
  assert.match(port, /safety: "候选，不会自动写入故事事实"/u);
  assert.match(workspace, /审查已阻断：/u);
  assert.match(workspace, /确认并写入事件线/u);
  assert.match(workspace, /打开事件线/u);
  assert.doesNotMatch(workspace, /送入事件候选审查|后续归属|event · 待作者审查/u);
});
