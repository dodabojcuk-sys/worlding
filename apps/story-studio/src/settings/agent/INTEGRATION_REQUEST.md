# Agent 设置与 WorkspacePathPolicy 集成请求

## 最终集成者操作

1. 在现有设置 owner 的合适页面挂载 `AgentSettingsSection`，传入 `TianyanShellRuntime.modelStatus` 和现有刷新动作。本提交没有修改设置路由或 Shell。
2. 并行存储任务完成后，由 Workspace owner 提供 `WorkspacePathPolicy` 实现，并在 `createOutputArtifact` 返回后校验逻辑 `relativeId`。实现必须留在 `src/storyWorkspace`，不得移入 Pi adapter 或 AgentRuntimePort。
3. `WorkspacePathPolicy` 只接收 `projectId`、`artifactId` 和逻辑相对标识；不得向 Pi、Provider prompt、流事件或日志暴露项目根绝对路径。

## 已完成边界

- Pi 只接收声明式 JSON Schema 工具，没有 `fs`、`path`、Shell、项目根或任意文件写入能力。
- `create_artifact` 先验证 AgentRuntimePort 的作者审批回执，再调用现有 `StoryStudioWorkspaceOperations.createOutputArtifact`。路径仍由 Workspace repository 选择，产物 provenance 记录 project、workVersion、run 和 source receipt，且不成为 Canon。
- `propose_entity_candidate` 只调用现有 Agent Recognition Proposal owner，初始状态保持 `pending`；模型不能确认自己的候选。
- Provider 状态来自现有 Model Service/Gateway，未配置时不会回退到视觉 fixture。
