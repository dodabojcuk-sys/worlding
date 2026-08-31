# Tianyi Dialogue / Agent 与 Pi Runtime 边界 R0

状态：Founder 硬规则；实现与测试的精简 ADR。产品语义仍以根目录 `TIANYAN_PRODUCT_CORE.md` 为唯一核心。

## 1. 两个模式

右侧 Tianyi Dock 只有两个真正独立的模式：`dialogue` 与 `agent`。Dialogue 只拥有 `dialogueSessionId`、`dialogueComposerDraft` 和普通消息；Agent 只拥有 `agentSessionId`、`activeAgentRunId`、`agentTaskDraft`、版本化来源选择和候选审阅状态。切换模式保留各自状态，不能共享通用 `messages`、`composerDraft` 或 `sessionId`。

## 2. 三个图层

- `EVENT_GRAPH`：正式/草稿 Event、Relation、单元和可选集点。
- `CANDIDATE_EVENT_OVERLAY`：尚未写入的候选 Event 与候选边，只叠加预览。
- `AGENT_EXECUTION_GRAPH`：ContextPack、处理步骤、受控 Tool、Gate 和 Result，只能在中央工作区的“Agent 执行过程”视图出现。

执行节点永远不是 Event，候选节点永远不是正式 Event。完整执行图不得塞入 348px Dock。

## 3. 节点族

节点族固定为 `FORMAL_EVENT_NODE`、`CANDIDATE_EVENT_NODE`、`COLLECTION_POINT_NODE`、`AGENT_PROCESS_NODE`、`AGENT_TOOL_NODE`、`AGENT_GATE_NODE`、`AGENT_RESULT_NODE`。它们可共享 NodeShell、Port 与 StatusIndicator，但不得通过一个万能故事节点只换颜色表达全部语义。

## 4. Pi 选择

2026-08-31 核验官方 npm 与 GitHub：`@earendil-works/pi-agent-core` 当前版本为 `0.84.4`，MIT，Node `>=22.19.0`。本仓库选择服务端 in-process SDK，因为产品已经有稳定 Host ABI 与 Provider Gateway，且浏览器不需要导入 Pi 类型。`@earendil-works/pi-ai` 仅作为 SDK 运行所需的直接、精确版本依赖。RPC 保留为未来发生运行时隔离冲突时的备选；不引入 coding-agent CLI。

## 5. 权限与投影

Pi 只能调用产品注入的六个纯读/纯计算工具：`load_context_pack`、`resolve_versioned_event_refs`、`inspect_event_relations`、`inspect_time_constraints`、`evaluate_story_consistency`、`emit_candidate_subgraph`。禁止 shell、文件系统、任意网络、数据库写入以及 Event、Relation、Canon、WorldState 写入。

浏览器只接收 `TianyiAgent*` 投影事件，不接收 Pi 原始事件、Prompt、模型参数、Provider 原始响应、凭据或私有思维链。候选采纳继续由 AuthorControl 与 Workspace owner 完成。
