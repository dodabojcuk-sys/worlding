import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

const studioRoot = "apps/story-studio";
test("legacy Story Product Prototype is absent from the product tree", () => {
  assert.equal(existsSync("apps/story-product-prototype"), false);
});

test("Story Studio never imports archived prototype UI implementation", () => {
  if (!existsSync(studioRoot)) return;

  const forbidden = [
    "storyProductPrototypeRenderer",
    "story-product-prototype/src/client.js",
    "story-product-prototype/src/styles.css"
  ];

  for (const path of walkSourceFiles(studioRoot)) {
    const source = readFileSync(path, "utf8");
    for (const token of forbidden) {
      assert.equal(
        source.includes(token),
        false,
        `${relative(studioRoot, path)} imports archived UI token ${token}`
      );
    }
  }
});

test("Story Studio local transport translates empty proxy failures into a product error", () => {
  const source = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  assert.match(source, /await response\.text\(\)/);
  assert.match(source, /本地服务暂时不可用，请确认 Story Studio 已完整启动。/);
  assert.doesNotMatch(source, /const payload = await response\.json\(\)/);
});

function walkSourceFiles(root: string): string[] {
  const result: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") result.push(...walkSourceFiles(path));
      continue;
    }

    if ([".ts", ".tsx", ".js", ".mjs", ".css", ".html"].includes(extname(entry.name))) {
      result.push(path);
    }
  }

  return result;
}
