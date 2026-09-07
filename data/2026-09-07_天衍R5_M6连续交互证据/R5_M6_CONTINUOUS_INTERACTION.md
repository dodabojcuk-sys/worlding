# 天衍 R5 M6 同故事连续交互证据

- 执行模式：隔离 Story Studio fixture、本地 N1 fake 与内存假 Pi 适配器测试
- Provider：`0`；`REAL_PROVIDER_NOT_RUN_NOT_AUTHORIZED`
- 运行时：Node `22.22.0`、npm `10`
- 证据不包含正式作品正文、密钥或真实 Provider 请求。

## 连续作者链

1. 打开“林昭”的角色档案“知情”页：可见依据和已排除计数来自既有知情投影；作者专有 `R2_SECRET_CLAIM` 未进入面板。
2. 点击“加入女娲”，验证稳定角色 ID 被一次性带入 N1；随后由作者选择“林昭”和“阿芜”。
3. 在同一项目内完成 N1 上下文核对、两角色工具往返、暂停、刷新恢复、停止、候选交接与回放；正式 World 对象计数不变。
4. 回到“关系变化”，核验 Relation Owner 的正式/候选筛选、类型、方向、故事有效时间未知语义、证据和回执历史。
5. 作者确认一个同故事 Event 后，在创作页建立当前主版本、选择 Story Unit 与已确认 Event，建立版本绑定的 OutputArtifact，并下载 `tianyan-story-package.md`。
6. 打开工程日志，筛选 N1 排演回执、查看安全详情；向另一隔离项目写入一个独有目标后，在当前项目检索该目标得到空结果。

## 文件

- `00-1440-character-knowledge.png`
- `01-1440-context-boundaries.png`
- `02-1440-two-role-steps.png`
- `03-1195-paused-refresh.png`
- `04-1195-stopped-candidate.png`
- `05-1440-relation-reader-r1.png`
- `06-1440-creation-scope-package.png`
- `07-1440-operation-log-receipt.png`
- `08-1440-operation-log-isolation.png`
- `page@111cfcb647097f0977c29f48bf5d908a.webm`

## 验证

```text
TIANYAN_E2E_SCOPE=r5-continuous … tianyan-r0-shell-smoke.mjs  PASS
```

这组证据是本地技术和交互检查点；不替代创始人独立体验验收，也不授权真实 Provider 调用。
