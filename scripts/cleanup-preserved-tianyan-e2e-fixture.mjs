import { inspectTianyanE2eFixture, removeTianyanE2eFixture } from "./tianyan-e2e-fixture.mjs";

const target = process.argv[2];
if (!target) throw new Error("Usage: node scripts/cleanup-preserved-tianyan-e2e-fixture.mjs /tmp/tianyan-r0-shell-smoke-XXXXXX");
const fixture = inspectTianyanE2eFixture(target);
removeTianyanE2eFixture(fixture);
console.log(`Removed preserved Tianyan E2E fixture: ${fixture.fixtureRoot}`);
