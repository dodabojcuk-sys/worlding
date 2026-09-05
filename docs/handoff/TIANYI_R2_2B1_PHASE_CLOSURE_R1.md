# TIANYI R2.2B1 阶段收口 R1

## 当前真实架构

- `/tianyi` 继续使用一个 `TianyiConversation`，包含 Creative / Work 两条泳道；Story Intake 只是 Creative lane 中的显式 Run，不建立第二个会话 Owner。
- `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 均锁定 `0.84.4`。唯一 Pi SDK 导入点是 `src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts`。
- Pi Runtime 通过 `aiProviderGateway` 调用当前 Provider；`propose_story_intake` 是候选专用白名单工具。自由文本只作说明，不能生成正式候选。
- 正式 Story Writer、Event、Relation、StoryUnit、NarrativeArrangement、WorkVersion 与 Canon Owner 未改变。

## 基线 a401046 与未提交候选

`a401046fff83b4db09365cffbe02125b6164dff5` 已包含确定性 Story Intake 垂直切片。进入本轮时，工作树另有上一轮未提交候选：运行身份与响应模型记录、取消/失败投影耐久性、候选证据字段、逐项确认适配和最小 UI。其原始二进制 patch 已保存为 `/tmp/TIANYI_STORY_INTAKE_R0_pre_R1_a401046.patch`，SHA-256 为 `ecc0752208a03df4e2c02def077be4479cdc1904de825b86ee0861df22b74f60`。

本轮在该受保护候选上增加了命名工具选择、非流式工具调用解析、规范类型迁移及测试。全部本地门与真实 Gateway 工具探针已经独立证明这些修改成立，因此它们与本交接在同一个聚焦提交中收口。完整真实 Story Intake 仍被 Pi 路径超时阻断，不得把本地提交误报为真实实体识别已经通过。

## 真实 Pi 根因与协议证据

进入本轮前，Story Intake 请求虽然携带工具 Schema，但 Gateway 把 `tool_choice` 固定为 `auto`，模型可合法只返回自由文本；非流式 Gateway 还遗漏 `tools/tool_choice`，并且不会解析 `message.tool_calls`。这两个协议缺口已在候选 diff 中修正。

Founder 授权下使用当前安全配置做了 4 次新调用，均为合成数据：

1. Gateway 非流式、命名 `probe_tool`：HTTP 200，返回 `finish_reason=tool_calls`，Gateway 成功解析；请求到响应头约 15.5 秒，响应模型报告为 `self-dploy/DeepSeek-V4-Flash-Vision-Exp`。
2. Gateway 流式、命名 `probe_tool`：HTTP 200，原始流含 reasoning/content/tool_calls，Gateway 成功输出工具事件；请求到响应头约 44.7 秒，响应模型报告为 `DeepSeek-V4-Flash-Vision-Exp`。
3. Pi Runtime 最小工具：请求确认含工具、命名 `tool_choice`、流式和模型，但在收到响应头前达到 120 秒总超时。
4. Pi Runtime 完整 `propose_story_intake`：请求确认含完整 Schema（SHA-256 `3e532f3d6544dafb9aee2a7ea44dc56060724f2f624cbc8d6057a5527c6a2ce4`）与命名 `tool_choice`，同样在响应头前达到 120 秒总超时。

因此当前模型/端点的原生工具能力已由真实响应证明；Gateway 解析链也已证明。完整 Story Intake 没有在 120 秒内收到响应头，但根因归属尚未证明：可能涉及 Pi 的 `system+user` 请求形状、负载规模、端点排队、限流或其他路径差异，不能提前归因于 Provider。剩余两次额度未使用：任务只允许在当前模型不支持工具时进行备用模型对照，而该前提不成立。

## 阶段裁定

- `RESULT=PHASE_CLOSED_WITH_PI_PATH_TIMEOUT`
- `LOCAL_PROTOCOL_FIX=PASS`
- `GATEWAY_NATIVE_TOOL_CALL=PASS`
- `LIVE_PI_STORY_INTAKE=BLOCKED`
- `BLOCKER=PI_SYSTEM_USER_TOOL_REQUEST_TIMED_OUT_BEFORE_RESPONSE_HEADERS`
- `ROOT_CAUSE_ATTRIBUTION=NOT_YET_PROVEN`
- 本阶段正式故事写入与 Canon 写入均为 0；真实实体识别没有通过。

## Story Intake Envelope v1 唯一术语

新写入只允许：`character`、`item`、`location`、`event`、`relation`、`story_unit`、`narrative_path_membership`、`unresolved`。

- `story_unit`：叙事单元候选。
- `narrative_path_membership`：Event/StoryUnit 在同版本路径中的成员关系候选，不是故事线实体。
- `storyUnit`、`narrativePathMembership`、`storyline`：仅在读取边界迁移；新工具 Schema 与新持久化禁止写入。
- 全部结果仍为 Candidate；正式故事写入与 Canon 写入均为 0。

## 下一步唯一建议

不要重新扫描全仓、重写 Story Intake v1 合同或切换默认模型。下一阶段只需对比已经成功的 Gateway 请求与超时的 Pi 请求，逐项隔离消息角色、请求字节数、服务端排队、限流和路径差异。只有下一次获得真实 `propose_story_intake` 工具帧、通过 Schema，并确认正式故事写入为 0 后，才能宣布真实闭环通过。

明确尚未开始：故事脉络仓库、命运线、完整 Page Agent、女娲、事件线/时间线重构与 UI 重设计。当前 UI 只记录现状证据，尚未经过 Founder 体验验收。

## 当前候选验证

- Node `22.22.0` / npm `10`：typecheck、lint、unit（999/999）、integration（55/55）、build 全部通过。
- Story Intake、天意黄金闭环、R1 双轴因果、R2 故事交叉、R2 知识隔离专项 E2E 全部通过。
- 标准 E2E 两次独立复跑均通过；`git diff --check` 与差异密钥特征扫描通过。
- 以上只证明本地候选及回归门；不把 fixture 结果冒充真实 Provider Story Intake 成功。
