import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "http://localhost:9876";
const OUT = path.resolve(import.meta.dirname, "../../docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/evidence");

const targets = {
  nuwa: {
    url: "/nuwa.html#s-default",
    selects: {
      sceneHead: ".scene-head",
      runStrip: ".run-strip",
      stagePlate: ".stage-plate",
      directionBar: "#direction-bar",
      composer: "#composer",
    },
  },
  world: {
    url: "/world.html#s-overview",
    selects: {
      worldHead: ".world-head",
      storyLens: ".story-lens",
      taskArea: ".task-area",
      contextRail: "#context-rail",
    },
  },
};

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const browser = await chromium.launch({ headless: true });
const result = {};
for (const [name, cfg] of Object.entries(targets)) {
  result[name] = {};
  for (const width of [1440, 1152]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${BASE}${cfg.url}`, { waitUntil: "networkidle" });
    await wait(250);
    const boxes = await page.evaluate((selectors) => {
      const out = {};
      for (const [key, sel] of Object.entries(selectors)) {
        const el = document.querySelector(sel);
        if (!el) { out[key] = null; continue; }
        const r = el.getBoundingClientRect();
        out[key] = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      }
      out.horizontalOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return out;
    }, cfg.selects);
    result[name][String(width)] = boxes;
    await page.close();
  }
}
await browser.close();
await writeFile(path.join(OUT, "geometry.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
