import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createAiProviderGateway } from "../../apps/story-studio/server/providerGateway/aiProviderGateway.mjs";
import { createImageObservationProviderAdapter } from "../../apps/story-studio/server/providerGateway/imageObservationProviderAdapter.mjs";
import { createOpenAiCompatibleAdapter } from "../../apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs";

const bytes = Buffer.from("89504e470d0a1a0a00000000", "hex");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const profile = { id: "profile.vision", label: "Vision fixture", purpose: "image-observation", providerId: "fixture", modelId: "fixture/vision", maxOutputTokens: 512, temperature: 0, timeoutMs: 1_000, enableThinking: false };

test("selected image bytes cross the existing Gateway and structured observation remains advisory", async () => {
  let requestBody: any = null;
  const adapter = createOpenAiCompatibleAdapter({
    id: "fixture", label: "Fixture", credentialRequired: false, baseUrlProvider: () => "http://fixture.invalid/v1",
    modelMetadata: [{ id: "fixture/vision", label: "Vision", capabilities: ["chat", "vlm"] }],
    fetchImpl: async (_url: unknown, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ model: "fixture/vision", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ objects: ["A城", "B城"], relativePositions: [{ subject: "A城", relation: "above", object: "B城" }], consistency: "conflict", explanation: "图片中 A 城位于 B 城上方，与所给文字相反。", uncertainty: "标签清晰，但图片没有地图北向。" }) } }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const gateway = createAiProviderGateway({ adapters: [adapter], profiles: [profile] });
  const result = await createImageObservationProviderAdapter({ gateway }).inspect({ projectId: "project.fixture", operationId: "operation.1", profileId: profile.id, fileId: "file.map", revisionId: "revision.1", mimeType: "image/png", bytes, sha256, prompt: "文字说 A 城在 B 城下方，检查图片是否一致。", directionBasis: "image-up" });
  assert.equal(requestBody.messages[1].content[1].type, "image_url");
  assert.equal(requestBody.messages[1].content[1].image_url.url, `data:image/png;base64,${bytes.toString("base64")}`);
  assert.equal(result.observation.consistency, "conflict");
  assert.equal(result.generation.kind, "real-provider");
  assert.equal(result.generation.providerDispatches, 1);
});

test("non-visual profiles and changed image revisions fail before transport", async () => {
  let fetchCount = 0;
  const adapter = createOpenAiCompatibleAdapter({ id: "fixture", label: "Fixture", credentialRequired: false, baseUrlProvider: () => "http://fixture.invalid/v1", modelMetadata: [{ id: "fixture/text", label: "Text", capabilities: ["chat"] }], fetchImpl: async () => { fetchCount += 1; throw new Error("must not dispatch"); } });
  const textProfile = { ...profile, id: "profile.text", modelId: "fixture/text" };
  const observation = createImageObservationProviderAdapter({ gateway: createAiProviderGateway({ adapters: [adapter], profiles: [textProfile] }) });
  await assert.rejects(() => observation.inspect({ projectId: "project.fixture", operationId: "operation.2", profileId: textProfile.id, fileId: "file.map", revisionId: "revision.1", mimeType: "image/png", bytes, sha256, prompt: "检查图片", directionBasis: "image-up" }), /请求内容无效/u);
  await assert.rejects(() => observation.inspect({ projectId: "project.fixture", operationId: "operation.3", profileId: textProfile.id, fileId: "file.map", revisionId: "revision.1", mimeType: "image/png", bytes, sha256: "0".repeat(64), prompt: "检查图片", directionBasis: "image-up" }), /修订已变化/u);
  assert.equal(fetchCount, 0);
});

test("image-up cannot be silently promoted to map north", async () => {
  const gateway = { openChatCompletion: async () => { throw new Error("must not dispatch"); } };
  await assert.rejects(() => createImageObservationProviderAdapter({ gateway }).inspect({ projectId: "project.fixture", operationId: "operation.4", profileId: profile.id, fileId: "file.map", revisionId: "revision.1", mimeType: "image/png", bytes, sha256, prompt: "判断南北", directionBasis: "map-north" }), /没有明确北向/u);
});
