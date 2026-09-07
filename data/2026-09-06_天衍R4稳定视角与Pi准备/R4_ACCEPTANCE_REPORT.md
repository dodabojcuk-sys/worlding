# 天衍 R4 本地验收报告

日期：2026-09-06

当前产品入口：`http://127.0.0.1:4193/event-line?locale=zh-CN&eventTask=perspective`

隔离 R4 故事证据入口：`http://127.0.0.1:4195/event-line?locale=zh-CN&eventTask=perspective&eventView=spine&eventFocus=character.%E6%9E%97%E6%98%AD%2Ccharacter.%E9%98%BF%E8%8A%9C%2Ccharacter.%E9%A1%BE%E6%BE%9C&eventObservers=character.%E6%9E%97%E6%98%AD%2Ccharacter.%E9%98%BF%E8%8A%9C%2Ccharacter.%E9%A1%BE%E6%BE%9C&directoryView=characters`

## 结论

R4 在不更换 Owner、不扩建完整女娲、不迁移或清空原有数据的前提下，已完成目录/顶部稳定、1–5 位正式角色观察、同一故事多事件与分支显示、角色知情交接、刷新恢复和 Pi 零调用合同。仓库完整 gate 通过；真实 Pi 只证明连接和最小推理，尚未证明结构化工具往返或真实故事对话。

2026-09-07 收尾更新：远端的目录与完整页面断言已通过，红灯定位为假 Provider 流在“取消”后被晚到完成/恢复响应回填。修复后取消为持久化终态；同时用写入代次防止旧 GET 成为写后新快照。事件线低频操作已收入“更多”，仅保留角色观察区的唯一人物选择入口；1195×792 带详情检查器与 1440×900 实际路径均无横向溢出。

## 实现范围

- 顶部任务切换与左侧人物目录保持单一 Shell 组装；目录路径、筛选、多选、选中集和滚动位置按项目恢复。
- 角色可从目录真实拖入观察区，也可用“选择人物”管理 1–5 位观察者；刷新后保持稳定对象 ID。
- 角色视角按事件参与、显式知情证据和已审核 AI 匹配投影；任意关系不再被推断为“已知”，同名人物不再按标签串联。
- 单角色视角可交接一个稳定 `SubjectRef` 给天意依据问答；作者联合视图、读者视图不能偷渡为角色 ContextPack，角色/读者视图不运行作者 Agent 任务。
- Pi 模型目录诊断与 Embedding probe 已进入 setup 预留和总调用上限；正常工具循环不再误记为 retry。
- Nuwa 只完成 N1 交接合同与现有基础差距表，未新建女娲页面或第二事实仓。

## 缺陷复现与修补记录

| 复现步骤 | 预期 | 修复前实际 | 修复/证据 |
| --- | --- | --- | --- |
| 打开人物目录、进入多选、选中林昭，刷新页面 | 项目范围的目录路径和选中恢复 | 项目载入时的无项目状态会覆写已保存状态 | 增加 project-ready 门禁；R4 拖拽/刷新 E2E 通过 |
| 创建两个同名角色，只给其中一个知情主体引用 | 只有稳定 ID 相等的角色知情 | 标签名称也会被当作主体匹配 | `eventStoryCrossingKnowledgeR2` 同名回归通过 |
| 从“更多 → 故事结构 → 角色视角”进入旧高级视图，对照同名人物 | 高级视图复用 Owner 的稳定人物证据 | 首轮修复后名称串线已 fail-closed，但生产 Lens 尚未生成新稳定字段 | 接入 author `EventStoryCrossingKnowledgeProjection`→`PerspectiveEvent` adapter；24/24 定向回归和原浏览器路径通过，unknown 不再算共同知情或正式关系影响 |
| 给角色与事件之间增加任意已确认关系 | 未有显式知情证据时保持未知 | 关系被泛化推断为 informed/known | `eventPerspectiveProjection` 未知回归通过 |
| 单选林昭后打开天意，再切到作者联合/读者视图 | 角色只获得自己的 SubjectRef；其他视图不获得该上下文 | 角色 API/ContextPack 没有契约性连接 | `characterKnowledgeHandoffR4` 与浏览器 `data-context-access=character` 通过；可见秘钥泄漏为 0 |
| Pi 在正常工具回合继续第二轮 | 记为同一次 generation/tool-loop，只有显式重试记 retry | 第二轮被自动记为 retry | `piAgentTextAdapter` 断言 retry flags 为 `[false,false]` |
| R4 状态留在人物目录后进入旧目录根 E2E | 通过产品动作建立根目录前置 | 旧脚本假定页面永远从目录根开始 | 脚本点击“返回工程目录”，不删除持久状态；完整 E2E 通过 |
| 完整 Shell 先进入事件详情，再从待确认打开关系审阅 | 可见关系检查器与 Shell 唯一 Dock 状态均为 `RELATION_REVIEW` | 本地追踪图显示关系检查器已打开，但 Shell 仍标记 `EVENT_DETAILS` | 图形选择为关系时校正唯一 Dock 协调器；原 full-shell 路径通过 |
| PR #4 的 full-shell 在关系审阅阶段同时报两条 15 秒目录读取超时 | 写前/写中旧读不能进入新快照，写后新读只扫描一次并提交页面状态 | POST 开始和成功各做一次全局失效，结束信号会误清写后新读，远程两个独立作业均复现 | 改为单一写入边界：写中读可返回原调用方但不缓存，关闭边界不二次清除更新读；7 条竞态回归与原 full-shell 通过 |
| 同一 SHA 在两个独立 GitHub runner 上仍于精确 15 秒边界同时中断 World Library 与 Story Unit GET | 已接收的本地读取由真实响应或连接错误收敛，不用经过时间推断“作品服务未连接” | 固定浏览器超时将单线程本地 Owner 的排队/计算误报为断线；两个 GET 的错误时间与 15 秒看门狗一致 | 产品读改为响应驱动；fetch/进程失败仍返回连接错误，项目 Owner 显式失效仍会 abort；不增加等待、重试或弱化页面断言 |

## 验收状态

| 类别 | 状态 | 证据 |
| --- | --- | --- |
| 技术 | PASS | Node `22.22.0` / npm `10`；`npm run verify`：unit 190 文件、1035/1035，integration 12 文件、55/55，完整 Shell E2E PASS，Vite build PASS；独立审阅修补后再跑相关 24/24、typecheck、lint、build 均 PASS |
| 浏览器 | PASS（除字面 200% 见限制） | 隔离同一故事在 1195×900 和 1440×900 均无页面横向溢出；真实拖拽、3 角联合观察、12 事件、支线/合流缺口、刷新恢复、角色天意交接已实际走通；高级角色视角原路径显示 12 项 Owner 证据结果，无横向溢出 |
| 独立审阅 | PASS | 未参与核心修改的 Sol High 审阅者两次 HOLD 均有复现证据；修复后复查 Owner adapter、同名隔离、unknown 语义和 1195 实图，最终 PASS，未发现仍可复现的阻断 |
| 真实 Pi | PARTIAL | A 连接验证 1 次、B 最小推理 1 次均 HTTP 200；B 为 10 tokens/`finishReason=stop`。已有 6 次授权用尽，C/D/E 未执行 |
| Founder 体验 | PENDING | 自动化和独立审阅不代替 Founder 视觉与体验验收 |

## 截图清单

- 旧页对照：`browser/baseline/event-perspective-1195.jpg`。
- 新页 1195：`browser/final/r4-perspective-3-role-1195.jpg`。
- 新页 1440：`browser/final/r4-perspective-3-role-1440.jpg`。
- 真实拖入后角色目录：`browser/final/r4-character-directory-drag-1195.jpg`。
- 角色定界天意：`browser/final/r4-role-context-tianyi-1195.jpg`。
- Owner 接线后的高级角色视角：`browser/final/r4-advanced-perspective-owner-1195.jpg`。
- CSS 视口等价压缩：`browser/final/r4-perspective-css-598x450-equivalent.jpg`；不表述为字面 200% 通过。

全部截图是应用内浏览器直接捕获的 JPEG，扩展名与实际字节已统一；不是 Mermaid、手工重绘或文字占位。

## 真实 Pi 调用口径与一次预算建议

- 唯一计数边界是真实 Provider dispatch。连接/模型诊断、generation、Pi 工具回合、显式 retry、修复后复验均计入总数；失败也占额度，自动重试为 0。
- A/B 证据在 `technical/real-pi-a-gate.json` 和 `technical/real-pi-b-gate.json`，不保存凭据、token 或完整 trace ID。
- 如需继续 C/D/E，建议一次性授权最多 **4 次新的真实 dispatch**：1 次结构化工具往返、2 次产品样本、1 次仅供修复后验证。相对当前账本将 generation 上限由 17 调整为 21，total 由 20 调整为 24；旧实现未记账的 A 不得当作可用余量。
- 当前本地配置没有可信的 Provider 价格快照，因此不虚构金额上限；授权时应附实际报价。

## 已知限制

1. 应用内浏览器的 `Ctrl + +` 在当前自动化会话中没有改变字面缩放；598×450 只是 CSS 视口等价压缩，不能冒充字面 200% 证据。
2. 真实 Pi C 结构化工具往返、D 产品样本、E 故障/重启路径尚未运行；本地假服务测试不替代这些结论。
3. 角色参与与知情证据已接入投影，但真实故事中仍需继续补全相对时间、误解和作者未来意图的正式 Owner 证据。
4. Nuwa N1 只有合同与差距表，没有真实 Pi 多角色回合，本轮也未扩建完整女娲。
5. 本地构建警告主 JS chunk 约 1.06 MB（gzip 约 306 KB）；不影响本轮功能验收，但是后续性能分包项。

## 约 5 分钟作者验收路线

1. 打开隔离 R4 入口，确认顶部作品、目录按钮和任务标题稳定，不再出现老版空态覆盖。
2. 在左侧人物目录开启“多选”，选林昭、阿芜、顾澜，把任一选中角色拖入“角色观察”区，确认显示 `3/5 人`。
3. 沿故事脊柱查看 12 个正式编排位置、灯塔支线和合流缺口；确认人物行动轨迹没有冒充心理状态。
4. 刷新页面，确认人物目录、多选集和观察者仍恢复；再只保留林昭，打开“天意助手”。
5. 确认右侧明示“角色上下文已按稳定身份过滤”和已排除的未知事实数；不配置 Provider 时不会误发请求。

## 回滚与数据边界

本轮未 push、未部署、未迁移或清空正式项目数据。R4 浏览器证据使用 `/tmp` 隔离数据根；`4193` 仅服务当前本地构建。正式事件、关系、Story Unit、NarrativeArrangement 和人物状态仍由现有 Owner 维护。
