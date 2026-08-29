# 工程目录责任区

本目录负责全局项目目录的导航投影、已分类目录树和目录内待确认审查入口。可见标题为“目录”，但组件与合同责任仍为 `project-directory`。`useProjectDirectoryProjection.ts` 只读取既有 World Library、Story Unit、Creation Source、候选审核与 Agent 识别投影；它不复制这些 owner 的数据。

本目录不拥有 Canon、Event、WorldState、故事正文、操作日志或操作系统文件树。

主要入口是 `ProjectDirectoryPanel.tsx`；目录展示数据由 `projectDirectoryViewModel.ts` 组装，语义合同位于 `src/storyContracts/projectDirectoryContract.ts`。`PendingReviewPanel.tsx` 仅编排来源导入、Golden Loop Candidate Review、Agent Recognition Proposal 和 Agent Type Catalog 的既有作者流程：它不成为事实写入者，Golden Loop 也不会绕过影响审查。对象链接把项目、对象、版本和来源标识放进 URL，刷新与前进/后退可恢复焦点；状态 owner 是当前 Shell 的瞬时 UI 状态与既有领域 owner 提供的投影。

对应测试位于 `tests/storyContracts/projectDirectoryContract.test.ts` 与 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增目录分组、节点展示或搜索投影放在这里，不在 `App.tsx` 或 Shell 根组件中堆叠。

`character/` 是第一个真实对象目录实例：它复用同一浅色目录槽，读取 WorldObject、Card Presentation、ObjectCatalog 与 workspace layout 的只读投影，并通过稳定 URL 打开右侧检查器和完整资料编辑覆盖层。编辑仍调用 `updateWorldObject` 的既有 WorldObject/Card Presentation owner。目录密度与排序属于 `controlCenterPreferences.ts` 的浏览器 UI 偏好；分类定义来自 `workspaceLayoutRepository` 的 `custom-category`，分类与回收站分配元数据属于 `src/storyWorkspace/objectCatalog.ts`。归档状态仍只来自 WorldObject owner；角色层级仍是 WorldObject `subtype`，不建立 RoleLevelStore。
