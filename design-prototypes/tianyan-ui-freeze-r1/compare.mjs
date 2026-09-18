import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../../docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/evidence");
await mkdir(OUT, { recursive: true });

const R0 = "/tmp/r0-extract/docs/design/TIANYAN_UI_DESIGN_FREEZE_R0/evidence";
const R1 = OUT;
const TARGET = "/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-09-17_女娲作者工作面视觉重构R6/证据包/Target-Before-After.png";

const toFileUrl = (p) => `file://${encodeURI(p)}`;

function compareHtml(items, outWidth) {
  const cellW = Math.floor(outWidth / items.length) - 12;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin: 0; font-family: "Noto Sans SC", sans-serif; background: #fff; }
    .row { display: flex; gap: 8px; padding: 8px; }
    figure { margin: 0; }
    figcaption { font-size: 13px; color: #333; padding: 4px 2px 8px; }
    img { width: ${cellW}px; display: block; border: 1px solid #ddd; }
  </style></head><body><div class="row">
  ${items.map(([label, file]) => `<figure><figcaption>${label}</figcaption><img src="${toFileUrl(file)}"></figure>`).join("\n")}
  </div></body></html>`;
}

const compares = [
  { out: "compare-r0-r1-nuwa.png", width: 1440, items: [["R0 女娲 1440 默认态", `${R0}/after-女娲-1440-默认态.png`], ["R1 女娲 1440 默认态", `${R1}/r1-nuwa-1440-default.png`]] },
  { out: "compare-r0-r1-world.png", width: 1440, items: [["R0 世界观 1440 总览", `${R0}/after-世界观-1440-总览.png`], ["R1 世界观 1440 默认工作态", `${R1}/r1-world-1440-default.png`]] },
  { out: "compare-target-r0-r1-nuwa.png", width: 1920, items: [["目标参考（R6 证据包）", TARGET], ["R0 女娲 1440 默认态", `${R0}/after-女娲-1440-默认态.png`], ["R1 女娲 1440 默认态", `${R1}/r1-nuwa-1440-default.png`]] },
];

const browser = await chromium.launch({ headless: true });
for (const c of compares) {
  const html = compareHtml(c.items, c.width);
  const tmp = path.join("/tmp", c.out.replace(/\.png$/, ".html"));
  await writeFile(tmp, html, "utf8");
  const page = await browser.newPage({ viewport: { width: c.width, height: 600 } });
  await page.goto(`file://${encodeURI(tmp)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, c.out), fullPage: true });
  await page.close();
  console.log(`wrote ${c.out}`);
}
await browser.close();
