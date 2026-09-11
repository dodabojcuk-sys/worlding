# 天衍 N2A—N2C 同故事跨场景连续交互证据

- 代码来源：`a6382f3d16b36a04a7c5a4360599b8b8ecf00398`。
- 隔离故事：`长夜将明`；第一场 `雾港追踪`，第二场 `灯塔支线`。
- 执行模式：Story Studio 临时 fixture 与显式本地 fake adapter；真实 Provider 调用 `0`。
- 运行时：Node `22.22.0`、npm `10`。
- 证据不包含真实作品正文、凭据或真实 Provider 请求。

## 同一次浏览器运行的操作链

1. 选择正式角色阿芜、林昭，分别输入本场目标；检查器显示各自作者确认的角色核心、底线、人物修订和完整输入预算，作者私密 Profile 字段不进入上下文。
2. 在 `雾港追踪` 执行两步：阿芜只把“我只把钟声的线索告诉你。”定向递送给林昭；林昭下一步能读取该说法。Story Continuity 的项目级、稳定接收者账本保存原话和 Run/step/场景/作品版本来源。
3. 暂停、刷新、恢复、再执行一步、停止、送入待确认并回放；没有重放发送，也没有创建正式 World 对象。
4. 新建第二个 Run，切换到 `灯塔支线`，仅选择林昭与未收到说法的陆衍。林昭的上下文显示同一条跨场景 `heard` 记忆、来源与有效性，并由“匹配角色目标”的注意力原因选入预算；陆衍没有该记忆。
5. 启动第二场第一步后，从产品 API 读取实际已提交步骤：其 `contextEvidenceRefs` 含这条 `heard` 记忆，场景稳定 ID 是 `灯塔支线`，模型发送仍为 `0`；随后停止。

## 自动断言

- N2A：不同人物的核心、底线、本场目标与人物修订进入各自冻结输入；`N2_PRIVATE_*` 不出现。
- N2B：入选来源、`匹配角色目标` 原因、已用/上限字节预算在检查器可见；实际工具输入复用同一来源。
- N2C：第一场账本记录存在且 active；第二场只向稳定接收者林昭召回，陆衍不知情；实际步骤的来源仍为 `heard`，没有升级为世界事实。
- 恢复与权限边界：暂停刷新保持暂停，候选交接不写正式 World，完整浏览器控制台无警告/错误，Provider 请求列表为空。

## 文件

- `01-1440-context-boundaries.png`：N2A 人物核心、底线、逐角色目标与 N2B 预算。
- `02-1440-two-role-steps.png`：第一场定向说法与后续角色读取。
- `03-1195-paused-refresh.png`：暂停后刷新恢复与 1195px 几何。
- `04-1195-stopped-candidate.png`：停止、候选交接与零 Provider 状态。
- `05-1440-n2-cross-scene-memory.png`：第二场林昭召回、陆衍隔离、注意力原因与来源版本。
- `page@6b3768a9e083835a06ead481dd5fc1d1.webm`：上述过程的 14.2 秒连续录屏。

## 复现命令与结果

```text
TIANYAN_E2E_SCOPE=nuwa-n1 \
TIANYAN_NUWA_N1_EVIDENCE_DIR=data/2026-09-09_天衍N2人物注意力跨场景连续证据 \
TIANYAN_NUWA_N1_EVIDENCE_DWELL_MS=1000 \
npm run test:e2e

tianyan R0 shell smoke PASS
```

首次全量运行暴露了一个可在本证据改动前 `584d843` 基线独立复现的 `full-shell` 断言问题：测试依赖 React Flow 私有包装属性，在关系图语义节点挂载前读取到空 ID 集合。关系图正式 Event 节点现显式暴露 `data-event-id`，测试等待关系图与时间线语义卡片 ready 后再比对同一组稳定 Event ID。修复后 `full-shell` 隔离 scope、默认六个 E2E scope 以及最终 `npm run verify` 全部通过；其中 unit `1144/1144`、integration `55/55`，typecheck、lint 与 build 均通过。

这是本地自动化技术与交互证据，不构成真实 Provider 验证，也不替代 Founder 独立人工体验验收。
