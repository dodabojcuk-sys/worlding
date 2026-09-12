# 资料管理 M2 实施蓝图

## 目标与边界

本轮在既有“资料库／地图／关系”入口内完成普通文件管理、世界设定扩展和准确引用。普通文件拥有稳定文件身份与不可变内容修订，但不成为 WorldObject、Canon、Event 或 WorldState。旧 SourceImport、旧物品映射、图片路径和历史回答只读兼容，不按标题合并、不批量迁移。

测试仅使用隔离作品与确定性假 Provider，真实 Provider 调用为 0；不切换日常 4191/4192。视觉沿用现有组件，只补完成功能所需的入口、选择器、预览与状态。

## 唯一责任与数据

- `src/storyWorkspace/materialFileRepository.mjs`：作品内普通文件、不可变字节修订、归档、关联元数据及批次操作回执的唯一 Owner。
- 原件位于 `assets/material-files/<fileId>/<revisionId>.blob`；真实文件名与 MIME 只保存在受校验的目录元数据中。中性扩展名防止 Markdown 工作区扫描器把上传笔记误当产品文档；下载时恢复原名。目录、显示名、标签与关联是元数据，移动或改名不搬原件、不改变 `fileId`。
- `documents/workspace/material-files.json` 保存目录投影、文件索引和耐久操作回执。写入使用期望修订和原子替换；未知旧数据不重写。
- 既有 WorkspaceLayout 继续管理世界对象目录；普通文件目录由文件 Owner 管理，避免旧序列化器吞掉新增字段。
- TXT／Markdown 可预览、检索和建立来源修订；图片、浏览器支持的音视频和 PDF 提供安全同源阅读；Office／压缩包只保存下载。上传不等于可供模型读取。

## 检查点与验收

1. 文件身份：重复字节识别、同名不同内容、新版本、下载 hash、归档恢复、部分失败和同 operationId 重放。
2. 组织入口：嵌套文件夹、循环保护、重命名、移动、多选、搜索、类型和状态筛选；普通文件不自动建物品。
3. 世界资料与引用：自定义设定分类、对象／来源关联、原文选段、假 Provider 实际采用正文、旧回答返回旧修订。
4. 收敛：混合格式浏览器流程、旧作品副本、portable export/import、规模分页、typecheck/lint/build/verify。

回滚只撤销代码提交；已经写入的原件与修订保留。若旧版本不能理解新增索引，它仍不得删除 `assets/material-files` 或覆盖正式作品。
