# COMPONENT_INVENTORY — 天衍 UI 设计冻结 R0

原型源：`design-prototypes/tianyan-ui-freeze-r0/`（`proto.css` 共享 + `nuwa.html` / `world.html` / `index.html`）。
每条组件都给出原型类名与实施时的生产映射目标；实施只做「逐组件映射」，不做二次设计。

## 共享组件（proto.css）
| 组件 | 原型类 | 生产映射目标 |
| --- | --- | --- |
| 区域标题（墨线下划） | `.region-title` | 各工作面 section 标题行（替代白卡套白卡） |
| 纸面板块 | `.plate` | `.wb-section` / 女娲分区容器 |
| 按钮五级（主/次/文字/危险/预留） | `.btn*` | 既有 `.primary-action` 体系扩展；`.is-reserved` 仅设计预留显示 |
| 状态 chip | `.chip*` | nature/状态徽标 |
| 语义对象徽标 | `.sem.*` | worldReference 类别徽标 |
| 状态点 | `.dot` / `.run-state-dot` | Provider/Run 状态缩略 |
| 技术诊断框 | `.tech` / `.tech-box` | 各 `details` 技术折叠 |

## 女娲工作面（nuwa.html）
| 组件 | 原型类 | 生产映射目标 |
| --- | --- | --- |
| 场景头（96–112px，标题主视觉） | `.scene-head` | 重排 `nuwa-n1-header` + controlbar 的场景信息 |
| 场景切换 / 命运轨迹线 | `.scene-switch` / `.scene-thread` | scope 单元序列的可视化（数据来自 run.scope.scenes） |
| 出场角色头像 | `.scene-cast` | `bootstrap.participants` 已选子集；＋=参与者选择浮层 |
| Run 条（一个主行动） | `.run-strip` | 重排 controlbar 按钮组：主行动唯一 |
| 正文舞台 | `.stage-plate` / `.stage` / `.block*` | 重排 `NuwaRunReader` + 已保存正文（同一阅读面） |
| 对白块（头像+姓名+正文） | `.block.is-dialogue` | step.speech（不做成聊天流） |
| 候选支线块 | `.block.is-candidate` / `.candidate-weave` | 未选中 run steps（候选态） |
| 候选走向卡 A/B/C | `.candidates` / `.candidate-card` | 候选结果列表的可视化（选择→送入待确认） |
| composer（四意图 + 展开） | `.composer*` / `.intent-chip` | 重排 `nuwa-n1-composer`；展开区=引用/待确认/阶段版本/正式变化 |
| 检查器（作者问题组织） | `.inspector` / `.insp-q` | 重排 ContextInspector/StepInspector/LogInspector 三页签内容 |
| 检查器抽屉（1152） | `@media` + `.insp-scrim` | 现状 1195 文档流改为覆盖抽屉（Shell 互斥规则不变） |

## 世界观工作面（world.html）
| 组件 | 原型类 | 生产映射目标 |
| --- | --- | --- |
| 世界页头 | `.world-head` | 现有 `wb-header` 重排（保持真实动作链接） |
| 世界脉搏横带 | `.pulse` / `.pulse-block` | `wb-world-pulse` 升级：主次+状态+「全部」入口，≤150px |
| 因果网络图 | `.network-plate` + SVG | 新增纯展示投影：由 relatedKeys/标签生成节点与连线（无证据不画线） |
| 演化轨迹（多态） | `.evo-track` | `wb-timeline` + Dock 演化时间升级：已确认/不确定/秘密/当前位置/诚实空态 |
| 未定位托盘 | `.tray` | 时间未知条目（不伪造顺序） |
| 故事上下文栏 / 抽屉 | `.story-rail` | 现有 `wb-aux`（1152 已是抽屉，样式并入新 token） |
| 类型 tabs + 五种结构卡 | `.type-tabs` / `.typed-card.*` | 现有五类 TypedCard 重排（结构差异保持并强化） |
| 搜索工作面 | `.search-head` / `.result-card` | 现有 SearchSurface 重排（分组/摘要/为什么命中/去重保持） |
| 检索高级 | `.adv-details` | 现有 `wb-search-advanced`（索引健康在折叠内） |
| 条目 Peek / Expanded Dock | `.world-dock` | EntityInspectorDock WorldEntityDock 重排（因果链节点链在 Dock 内） |

## 明确不做（本冻结轮）
- 不改 Shell 八空间导航结构（原型左栏仅为示意）。
- 不新增路由、不接入任何产品 API。
- 设计预留意图（角色访谈/角色接管/作者干预）不实现交互。
