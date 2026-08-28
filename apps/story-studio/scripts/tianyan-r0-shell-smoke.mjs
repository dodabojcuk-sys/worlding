import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

import { terminateChildProcess } from "./bounded-process-teardown.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const port = 4396;
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let browser;

try {
  server = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--config",
    "apps/story-studio/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort"
  ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  await waitForServer();
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1152, height: 720 } });
  const consoleProblems = [];
  page.on("console", (message) => ["error", "warning"].includes(message.type()) && consoleProblems.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => consoleProblems.push(error.message));

  await page.goto(`${baseUrl}/world`, { waitUntil: "networkidle" });
  await page.getByTestId("tianyan-r0-shell").waitFor();
  await assertCollapsedIconRail(page);

  await page.locator(".shell-rail-collapse").click();
  await page.waitForFunction(() => document.querySelector("[data-testid='tianyan-r0-shell']")?.getAttribute("data-rail-collapsed") === "false");
  await page.waitForTimeout(200);
  await assertExpandedLabels(page, "zh-CN");

  await page.goto(`${baseUrl}/world?locale=en-US&rail=expanded`, { waitUntil: "networkidle" });
  await assertExpandedLabels(page, "en-US");
  assert.deepEqual(consoleProblems, [], "R0 shell smoke must not produce console warnings or errors");
  console.log("tianyan R0 shell smoke PASS: 1152x720 uses a 56px icon rail automatically and expanded labels remain complete in zh-CN/en-US");
} finally {
  if (browser) await browser.close();
  if (server) await terminateChildProcess(server, { label: "Tianyan R0 shell smoke server" });
}

async function assertCollapsedIconRail(page) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='tianyan-r0-shell']");
    const rail = document.querySelector(".shell-space-rail");
    const labels = [...document.querySelectorAll(".shell-space-label")];
    const controls = [...document.querySelectorAll("[data-shell-destination], [data-shell-utility]")];
    return {
      collapsed: shell?.getAttribute("data-rail-collapsed"),
      railWidth: rail?.getBoundingClientRect().width ?? 0,
      visibleLabels: labels.filter((label) => getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0).map((label) => label.textContent),
      unnamedControls: controls.filter((control) => !control.getAttribute("aria-label") || !control.getAttribute("title")).length
    };
  });
  assert.equal(state.collapsed, "true");
  assert.equal(state.railWidth, 56);
  assert.deepEqual(state.visibleLabels, []);
  assert.equal(state.unnamedControls, 0);
}

async function assertExpandedLabels(page, locale) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='tianyan-r0-shell']");
    const rail = document.querySelector(".shell-space-rail");
    const labels = [...document.querySelectorAll(".shell-space-label")];
    return {
      collapsed: shell?.getAttribute("data-rail-collapsed"),
      railWidth: rail?.getBoundingClientRect().width ?? 0,
      clipped: labels.filter((label) => getComputedStyle(label).display !== "none" && label.scrollWidth > label.clientWidth + 0.5).map((label) => label.textContent),
      ellipsis: labels.filter((label) => getComputedStyle(label).display !== "none" && getComputedStyle(label).textOverflow === "ellipsis").map((label) => label.textContent)
    };
  });
  assert.equal(state.collapsed, "false", `${locale} manual expansion must override automatic collapse`);
  assert.ok(state.railWidth > 56, `${locale} expanded rail must be wider than the icon rail`);
  assert.deepEqual(state.clipped, [], `${locale} expanded labels must not clip`);
  assert.deepEqual(state.ellipsis, [], `${locale} expanded labels must not use ellipsis`);
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    chromium.executablePath()
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error("Chromium executable is unavailable; set PLAYWRIGHT_CHROMIUM_EXECUTABLE");
  return executable;
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Tianyan R0 shell smoke server exited with ${server.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Tianyan R0 shell smoke server did not become ready");
}
