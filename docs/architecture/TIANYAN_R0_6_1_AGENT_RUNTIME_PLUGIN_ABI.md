# Tianyan R0.6.1 Agent Runtime Plugin ABI

`src/storyAgent/agentRuntimePlugin.ts` is the stable product-layer ABI. The host owns the Provider Gateway, credentials, workspace path policy, author approval, Session/Archive and all story-domain writes. Runtime plugins only orchestrate turns, normalized stream/tool frames, cancellation and upstream adaptation.

## Built-in compatibility matrix

| Plugin ID | Plugin version | Upstream | Host API range | Capabilities | R0.6.1 status |
| --- | --- | --- | --- | --- | --- |
| `agent.builtin.pi` | `0.1.0` | `@earendil-works/pi-agent-core@0.84.2` | `^1.0.0` | text stream, native tool frames, cancel, resume, author approval | enabled by default |

The registry is closed: it receives reviewed modules at process startup and has no dynamic import, directory scan, download, install, or third-party code execution path. A requested missing, disabled, incompatible, or failed plugin is represented explicitly. An upgrade may only fall back to an explicitly selected previous built-in plugin; it never fetches an upstream version automatically.

## Compatibility and rollback rules

1. A plugin supplies `id`, `pluginVersion`, `upstreamVersion`, `hostApiRange`, `capabilities`, `createRuntime`, `dispose`, and `health`.
2. The host checks the declared API range before initialization.
3. Initialization failure leaves no partial runtime active; the registry either exposes the failure or records an explicit fallback.
4. `AgentRuntimeEngine` receives only a scoped request with the host-declared tool list and Provider Gateway stream callback. It receives no filesystem, path, shell, absolute-path, or credential capability.
5. All product tools remain host-owned. Candidate and artifact writes retain their existing approval and formal-owner paths.
