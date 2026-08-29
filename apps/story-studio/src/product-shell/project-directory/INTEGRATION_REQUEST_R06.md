# R0.6 项目目录接线说明

本轮没有新增领域 owner、Provider 或存储设置。Shell 只需继续提供现有 `TianyanShellRuntimeState`：`project`、`workVersionId` 与受保护的 `withConnection`。项目目录据此读取既有目录投影及待确认投影。

- 顶栏“目录”开关仍是项目目录唯一开关；目录自身不再提供关闭按钮。
- `directoryReview=pending` 是同一目录槽的瞬时 URL 状态，不导航到数据空间。
- `directoryView=characters&directoryObject=<id>&directoryType=character&directoryEdit=character` 以稳定对象 ID 打开完整资料编辑覆盖层；保存只调用现有 `updateWorldObject`。
- `PendingReviewPanel` 只能调用既有来源导入、Agent Recognition 和 Candidate Review 端口。Golden Loop 必须继续进入既有影响审查，不能从目录直接写入事实。
