import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "http://localhost:9876";
const OUT = path.resolve(import.meta.dirname, "../../docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/evidence");
await mkdir(OUT, { recursive: true });

const shots = [
  // Nuwa
  { name: "r1-nuwa-1440-default", url: "/nuwa.html#s-default", w: 1440, h: 900 },
  { name: "r1-nuwa-1440-compact-bar", url: "/nuwa.html#s-default", w: 1440, h: 900, note: "compact direction bar default" },
  { name: "r1-nuwa-1440-directions", url: "/nuwa.html#s-candidates", w: 1440, h: 900 },
  { name: "r1-nuwa-1440-inspector", url: "/nuwa.html#s-inspector", w: 1440, h: 900 },
  { name: "r1-nuwa-1440-composer", url: "/nuwa.html#s-composer", w: 1440, h: 900 },
  { name: "r1-nuwa-1152-default", url: "/nuwa.html#s-default", w: 1152, h: 900 },
  { name: "r1-nuwa-1152-inspector", url: "/nuwa.html#s-inspector", w: 1152, h: 900 },
  // World
  { name: "r1-world-1440-default", url: "/world.html#s-overview", w: 1440, h: 900 },
  { name: "r1-world-1440-lens", url: "/world.html#s-overview", w: 1440, h: 900, note: "current story lens visible" },
  { name: "r1-world-1440-detail", url: "/world.html#s-detail", w: 1440, h: 900 },
  { name: "r1-world-1440-causal", url: "/world.html#s-causal", w: 1440, h: 900 },
  { name: "r1-world-1440-search", url: "/world.html#s-search", w: 1440, h: 900 },
  { name: "r1-world-1440-object", url: "/world.html#s-detail", w: 1440, h: 900, note: "object detail" },
  { name: "r1-world-1152-default", url: "/world.html#s-overview", w: 1152, h: 900 },
  { name: "r1-world-1152-context", url: "/world.html#s-overview", w: 1152, h: 900, post: async (page) => { await page.click("#rail-open"); await page.waitForTimeout(200); } },
];

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const browser = await chromium.launch({ headless: true });
const results = [];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.goto(`${BASE}${s.url}`, { waitUntil: "networkidle" });
  await wait(300);
  if (s.post) await s.post(page);
  const file = path.join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const hasHScroll = overflow > 0;
  results.push({ name: s.name, width: s.w, overflow, hasHScroll, file });
  await page.close();
}
await browser.close();

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.hasHScroll) ? 1 : 0);
