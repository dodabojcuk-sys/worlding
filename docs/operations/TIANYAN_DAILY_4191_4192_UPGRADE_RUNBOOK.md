# 天衍日常 4191/4192 升级与回滚

本手册只负责日常本地服务的代码版本切换。作品、历史、回执、Provider 配置和凭据仍由原有 owner 与数据根管理；切换脚本不得迁移、重写或删除这些数据。所有命令先固定完整 SHA，禁止在切换过程中跟随 `main` 漂移。

## 当前固定候选

- 当前日常代码：`2781405928bcf224c82ddef0b1122d6b80386e91`
- 本轮预演基线：`7eaf70f1a6d342edcfda8ba851e39d2bab0599fc`
- 最终候选：以本轮兼容修复合入 `main` 后的完整 SHA 为准，并写入交接报告。
- 作品根：`/home/beelink/WorldOS`
- Provider 配置根：`/home/beelink/Library/Application Support/Tianyan`
- 备份父目录：`/home/beelink/Documents/Codex/tianyan-upgrade-backups`

## 切换前只读预检

从最终候选工作树执行：

```bash
export PATH=/home/beelink/.cache/tianyan-runtime/node-v22.22.0-linux-x64/bin:$PATH
TIANYAN_UPGRADE_TARGET_SHA=<最终候选完整 SHA> \
TIANYAN_UPGRADE_CURRENT_SHA=2781405928bcf224c82ddef0b1122d6b80386e91 \
TIANYAN_UPGRADE_BACKUP_ROOT=/home/beelink/Documents/Codex/tianyan-upgrade-backups \
npm exec -- node scripts/run-with-canonical-runtime.mjs scripts/tianyan-daily-upgrade-preflight.mjs
```

预检固定候选 SHA、日常健康回执、4191/4192 监听、作品登记、进行中运行、锁文件、最近 120 秒写入和备份空间。结果不是切换授权；只有 `ready-for-confirmed-cutover` 才能展示给用户请求集中确认。

## 获得确认后的切换顺序

1. 再次运行只读预检，记录输出；用 `ss -ltnp` 与 `/proc/<pid>/cwd` 核对 4191/4192 仍属于预期旧工作树。不得按历史 PID 盲停。
2. 停止拥有这两个监听器的同一旧服务组，等待端口释放；若两端口不属于同一已核对启动组，停止并调查，不继续切换。
3. 在停服窗口内创建新的时间戳目录，先后复制 `WorldOS` 与 Provider 配置根，并生成源、副本 SHA-256 清单。服务已停止才可把它称为“最终一致性备份”。备份目录权限保持 `0700`，清单不得包含凭据正文。
4. 从固定候选工作树使用仓库运行时启动同一组开发服务：

```bash
export PATH=/home/beelink/.cache/tianyan-runtime/node-v22.22.0-linux-x64/bin:$PATH
export WORLD_OS_STORY_STUDIO_ROOT=/home/beelink/WorldOS
export PORT=4192
export STORY_STUDIO_VITE_PORT=4191
npm run dev
```

   不设置 `TIANYAN_PROVIDER_APP_DATA_ROOT`，因此继续使用既有权威 Provider 配置；不改密钥，不自动测试连接。
5. 检查 `4192/__local/story-studio/health` 的 `codeRevision` 等于固定候选；检查 4191 返回 200，并在浏览器硬刷新后打开原活动作品。核对目录、角色、事件线、资料、地图、关系及一条历史来源。该冒烟检查不调用真实 Provider。

预计中断为停止旧进程、复制约 3 MB 作品库与 112 KB Provider 配置、启动和健康核对所需时间；现场目标为 2–5 分钟。若端口、SHA、备份清单或作品读取任一失败，立即进入回滚，不继续试写。

## 回滚

默认回滚只切换代码，不把旧备份覆盖回正式数据：

1. 停止并保留失败候选的日志、运行目录和当前数据根。
2. 从旧工作树 `2781405928bcf224c82ddef0b1122d6b80386e91` 用相同 `WORLD_OS_STORY_STUDIO_ROOT`、4191/4192 与 `npm run dev` 恢复服务。
3. 核对旧版本健康回执和原活动作品。预演已证明旧版本可以读取经新版本增加资料修订与回答回执后的项目核心；旧界面不显示的新资料文件仍保留，不应在回滚窗口继续编辑它们。
4. 如果怀疑正式数据损坏，不覆盖 `/home/beelink/WorldOS`。将最终一致性备份复制到新的恢复目录，令旧服务临时指向该目录；失败现场与切换后新增数据原样保留，另行比较后再决定恢复。

旧代码、旧启动命令、最终一致性备份和候选日志均保留，完成一段稳定观察期后再单独清理。
