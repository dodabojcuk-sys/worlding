# G1-R2 参考台账

> 仅记录本轮已核对的机制与许可边界；不将外部项目的领域模型引入天衍。

| 顺序 | 参考 | 固定版本 | 采用机制 | 本地适配 | 许可结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | OpenWriter | `1497581aacd886a85d27c1898f15e16d0df6f7df` | 将长驻侧栏意图与小空间临时抽屉分开；视图切换不改内容身份 | 沿用天衍 `wide / focused / narrow` 单一布局 owner；不复制其断点数值 | MIT，本轮仅采用机制 |
| 2 | AI-Novel | `25db3223709dec7f892cfc7b0ba82742636644c6` | 把当前状态收敛成一个作者可理解的下一步 | 三 Tab 共用任务头，把内部身份收进诊断 | AGPL/商用授权双路径，不复制代码 |
| 3 | AgentTrail | `0d5d1510e022817427c24cf519a25e0f6b2b033e` | 稳定语义空间与瞬时运行覆盖层分离；概览/近距阅读的离散层级 | EventLine 显式提供“全书概览 / 阅读所选”，不改 Event 和 Placement 身份 | MIT，本轮仅采用机制 |
| 4 | DeterminFlow | `ceea31c932dea68b9fff73b39fb457a52f47a188` | 定义、执行快照、尝试史与错误分层 | 继续由 Session Archive 发现 Story Intake Run，候选与正式 Owner 不合并 | AGPL-3.0-only，不引入代码 |

本轮没有复制外部实现。GitHub 读取仅用于固定提交的机制核对。
