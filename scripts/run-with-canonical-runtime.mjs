import { spawnSync } from "node:child_process";

import { assertCanonicalRuntime } from "./canonical-runtime.mjs";

assertCanonicalRuntime();

const args = process.argv.slice(2);
if (args.length === 0) throw new Error("A Node script or Node argument is required after run-with-canonical-runtime.mjs.");

const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? (result.signal ? 1 : 0);
