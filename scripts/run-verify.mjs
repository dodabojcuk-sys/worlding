import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is missing; run verification through npm 10.");

const scripts = process.argv.slice(2);
const selectedScripts = scripts.length > 0 ? scripts : ["typecheck", "lint", "test", "test:e2e", "build"];

for (const script of selectedScripts) {
  const result = spawnSync(process.execPath, [npmCli, "run", script], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
