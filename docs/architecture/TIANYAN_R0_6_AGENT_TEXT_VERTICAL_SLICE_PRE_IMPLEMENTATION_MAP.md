# TIANYAN R0.6 Agent Text Vertical Slice — Pre-implementation Map

Recorded from detached worktree `../worlding-r06-agent` at
`e481b68765cfff9bca7f213c76091f026adead34` before implementation.

```text
PI_PACKAGE_VERSION=@earendil-works/pi-agent-core@0.84.2 (package.json and package-lock.json pinned)
PI_PACKAGE_UPSTREAM_AND_LICENSE=https://github.com/earendil-works/pi.git, packages/agent; MIT according to package metadata and lock metadata (the published package does not bundle a LICENSE file)
PI_PACKAGE_EXPORTS=.; ./node; ./session/testing; ./package.json. Root exports Agent, agent loop/events, tools, sessions, harness, compaction, proxy/search/types, telemetry, UUID and setDefaultStreamFn.
PI_PACKAGE_CURRENT_CALL_SITES=apps/story-studio/server/server.mjs dynamically imports Agent and directly bridges to pi-ai OpenAI completions; tests/storyAgent/piAgentCoreFixture.test.ts exercises a deterministic Pi tool loop. src/storyAgent/tianyiAgentRuntimePort.ts has a misleadingly named factory but does not import Pi.
CURRENT_AGENT_RUNTIME_OWNER=src/storyAgent/tianyiAgentRuntimePort.ts owns the product run projection, plan, approval transitions and persistence port; apps/story-studio/server/server.mjs assembles it.
CURRENT_MODEL_BROKER_OWNER=apps/story-studio/server/providerGateway/aiProviderGateway.mjs
CURRENT_PROVIDER_CONFIG_OWNER=apps/story-studio/server/providerGateway/persistentProviderProfileStore.mjs plus the existing model-settings server routes
CURRENT_SESSION_OWNER=src/storyContinuity plus src/storyControlSurface/storyStudioTianyiOperations.ts Session/Archive composition
CURRENT_STREAM_EVENT_OWNER=Provider Gateway owns normalized live Provider chunks. There is no durable Agent text-stream projection yet; the existing Tianyi Session Archive is the intended durable sink and must not be duplicated.
CURRENT_TOOL_APPROVAL_OWNER=src/storyAgent/tianyiAgentRuntimePort.ts owns per-run approval records and the protected server author-action boundary; Canon/Event/World writes remain with their existing formal owners.
CURRENT_SECRET_OWNER=apps/story-studio/server/providerGateway/providerCredentialBackend.mjs and sessionCredentialController.mjs (OS keychain or private app-data backend; never project files, browser storage or logs)
FILES_TO_MODIFY=src/storyAgent/tianyiAgentRuntimePort.ts; src/storyAgent/piAgentAdapter.ts; src/storyControlSurface/storyStudioTianyiOperations.ts; apps/story-studio/server/server.mjs; apps/story-studio/server/providerGateway/aiProviderGateway.mjs; apps/story-studio/src/lib/localTransport.ts; apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx; relevant Agent/transport tests; 项目目录导航.md; docs/architecture/FEATURE_INDEX.json
FILES_TO_CREATE=docs/architecture/TIANYAN_R0_6_AGENT_TEXT_VERTICAL_SLICE_PRE_IMPLEMENTATION_MAP.md; tests/storyAgent/piAgentTextAdapter.test.ts
OWNERS_NOT_TO_DUPLICATE=Agent run projection/plan; Model Gateway and Provider profiles; Tianyi Session/Archive; tool approval; credentials; Canon; Event; WorldState; Memory; Candidate Review
```

## Reachability conclusion

Pi is installed and partially called, but the existing production path bypasses
the Provider Gateway for dispatch and budget/receipt ownership. The product
runtime also lacks durable text-delta events, explicit work-version scope and a
runtime cancellation hook. R0.6 closes those seams by keeping the product-owned
`AgentRuntimePort`, moving Pi mechanics into the replaceable infrastructure
adapter, and routing every real model stream through the existing Provider
Gateway and Session Archive.
