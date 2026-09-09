# 天衍 R5 M2—M4 连续交互证据

- 来源修订：`210d8a440dd049e0b24811388e118949f785e367` 之后的本地未提交检查点
- 项目：长夜将明（本地 E2E fixture）
- Provider：`0`；只使用本地 Story Studio 服务与既有 Owner 读取接口
- 运行时：Node `22.22.0`、npm `10`

## 同一故事链

1. 从稳定角色 ID 打开“林昭”的角色档案，并切换到“知情”。
2. 核验安全投影仅保留可见依据计数与事件标签；作者专有 `R2_SECRET_CLAIM` 未出现。
3. 点击“加入女娲”，在 N1 工作面核验同一稳定 ID 被一次性带入参与者选择，且没有发起 Provider 调用。
4. 回到事件线的“关系变化”，查看 Relation Owner 的只读列表、候选筛选、正式筛选与详情。
5. 详情显示关系类型、方向、故事有效时间的未知语义、来源依据、决策回执，并异步读取 Relation Owner 回执历史；没有由关系相邻、人物共现或记录时间反推事实。

## 已检查文件

- `00-1440-character-knowledge.png`：角色知情边界与“加入女娲”入口。
- `01-1440-relation-reader-r1.png`：关系 R1 筛选、只读详情和回执历史区域。

## 自动化验证

```text
npm run typecheck                                      PASS
npm run lint                                           PASS
TIANYAN_E2E_SCOPE=relation-reader-r1 … smoke.mjs       PASS
```

该证据是本地技术与交互检查点，不替代创始人体验验收；也不表示真实 Provider 已获授权或已调用。
