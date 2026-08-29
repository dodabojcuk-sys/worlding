# 工程目录责任区

本目录负责全局工程目录的导航投影、元数据搜索、已分类目录树和小型待确认入口。`useProjectDirectoryProjection.ts` 只读取既有 World Library、Story Unit、Creation Source 与候选审核投影；它不复制或写入这些 owner 的数据。

本目录不拥有 Canon、Event、WorldState、故事正文、操作日志或操作系统文件树。

主要入口是 `ProjectDirectoryPanel.tsx`；目录展示数据由 `projectDirectoryViewModel.ts` 组装，语义合同位于 `src/storyContracts/projectDirectoryContract.ts`。对象链接把项目、对象、版本和来源标识放进 URL，刷新与前进/后退可恢复焦点；状态 owner 是当前 Shell 的瞬时 UI 状态与既有领域 owner 提供的只读投影。

对应测试位于 `tests/storyContracts/projectDirectoryContract.test.ts` 与 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增目录分组、节点展示或搜索投影放在这里，不在 `App.tsx` 或 Shell 根组件中堆叠。

`character/` 是第一个真实对象目录实例：它复用同一浅色目录槽，读取 WorldObject、Card Presentation、ObjectCatalog 与 workspace layout 的只读投影，并通过 URL 打开右侧只读检查器。目录密度与排序属于 `controlCenterPreferences.ts` 的浏览器 UI 偏好；分类定义来自 `workspaceLayoutRepository` 的 `custom-category`，分类与回收站分配元数据属于 `src/storyWorkspace/objectCatalog.ts`。归档状态仍只来自 WorldObject owner；角色层级仍是 WorldObject `subtype`，不建立 RoleLevelStore。
