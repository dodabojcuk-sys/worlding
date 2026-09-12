# 资料管理 M2 日常升级增量预检

## 现场核对

- 2026-09-12 23:32 +08:00 检查时，4191/4192 均无监听进程；因此本轮没有停止、重启或切换日常服务。
- 保留的日常工作树为 `/home/beelink/.codex/worktrees/tianyan-n2`，分支 `codex/map-m1-inspector`，代码提交 `2781405928bcf224c82ddef0b1122d6b80386e91`。其中既有未跟踪浏览器证据和 API 记录保持原样。
- M2 开发工作树为 `/home/beelink/.codex/worktrees/tianyan-materials-m2`，基线 `ef7aea526ffe38d5efba918d951fa84acaa8b774`；最终候选以本分支通过门禁并合入后的完整 SHA 为准。
- 磁盘可用空间约 694 GiB。未读取、输出或复制任何密钥。

## 数据兼容与切换边界

M2 只新增 `documents/workspace/material-files.json` 与 `assets/material-files/<fileId>/<revisionId>.blob`。旧 SourceImport、WorldObject、附件、地图和历史天意回执不迁移。portable export/import 已验证新增索引和字节修订逐字往返；旧作品没有目录时按空目录读取，不生成默认文件或世界事实。

沿用既有日常升级备份与回滚手册。实际切换前仍需：固定已合入 SHA、重新确认正式数据目录和进行中任务、取得一致性备份、用副本执行增量兼容冒烟，再集中请求一次日常切换确认。失败回滚保留 M2 新增数据，不能用旧备份直接覆盖正式目录。

当前结论：代码候选完成门禁后可进入既有切换预演；未获得切换确认，且现场服务当前未运行，所以本轮不启动 4191/4192。
