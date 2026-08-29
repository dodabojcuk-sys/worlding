import assert from "node:assert/strict";
import test from "node:test";

import { TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY, getTianyiContextualCapability } from "../../src/storyAgent/contextualCapabilityRegistry.ts";

test("the contextual registry covers eight spaces without becoming a semantic owner", () => {
  assert.deepEqual(TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.map((item) => item.space), ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]);
  assert.equal(TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.every((item) => item.capabilities.length > 0), true);
  assert.equal(getTianyiContextualCapability("unknown").space, "tianyi");
  assert.equal(TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.some((item) => item.capabilities.some((capability) => /createWorldObject|CanonWriter|RelationRepository|MemoryWriter/u.test(JSON.stringify(capability)))), false);
});
