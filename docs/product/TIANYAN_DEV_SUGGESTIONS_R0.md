# 天衍开发建议三包（R0 简版，非开工承诺）

依据产品核心、FEATURE_INDEX 与现有实现整理；每包独立可施工，不做全仓迁移。

## A. 地图创作与分层浏览

- **入口/Owner**：资料→地图（`libraryView=map`）；VisualDocument owner + mapEditProposalRepository。
- **已实现**：图层、连续山林笔触、形状/文字、局部地图（多父 placement）、坐标校准、撤销重做、保存冲突恢复、提案审阅。
- **半实现/缺失**：画笔预设库、线形样式预设、图层锁定/隐藏的显式控件、命中优先级（地块遮挡山脉）、缩放语义密度。
- **最小可用行为**：预设笔刷一键选样式；被遮挡对象可穿透选中；缩放按密度显隐标注。
- **失败路径**：预设应用失败不影响已绘对象；撤销链完整。
- **涉及模块**：`components/world/MapM1Workspace.tsx`、`mapAuthoring.tsx`、`visualDocumentRepository.mjs`、`styles/`。
- **迁移**：无（VisualDocument 内演进）。
- **工作量/信心**：中/高。**验收**：正常画图→选中→改样式→撤销→刷新保持。**回滚**：纯前端样式与预设清单，git revert 即可。

## B. 关系/家谱/历史观察

- **入口/Owner**：资料→关系（FocusedRelationsWorkspace）+ Relation Owner；关键帧复用 Event/Relation/WorldState owner。
- **已实现**：确认链关系、方向/类型/依据、人物聚焦、双时点比较（relationTemporalComparison）。
- **缺失**：阵营范围投影（成员类型映射 Owner 扩展：per-project 成员 relation-type 设置）、代际/支系布局、关键帧锚点存储。
- **最小可用行为**：圈层/势力/宗族三种只读投影，共享同一 Relation owner；时间锚点只读取该时点有效关系。
- **失败路径**：无成员映射→投影暂停（已实现）；未知时间/失效引用显式显示不填默认。
- **涉及模块**：`components/world/factionScopes.ts`、`FocusedRelationsWorkspace.tsx`、`relationRepository.mjs`（最小扩展：项目级成员类型设置）、关键帧锚点建议新增投影存储（非事实 owner）。
- **迁移**：关系类型映射需一个小的项目设置扩展（建议 Owner：workspace 设置文件），不迁移既有数据。
- **工作量/信心**：阵营投影收尾=低/高；宗族布局=中/中；关键帧=高/中。**验收**：多阵营重叠可读、反例不误收、时点切换保持。**回滚**：投影暂停开关（空映射即关闭）。

## C. 记忆注意力/候选恢复/连续性检查

- **入口/Owner**：天意会话 Archive + 候选审阅 owner + storyIntakeEnvelope。
- **已实现**：作者原话捕获、信封工具帧归档（session jsonl 留痕）、候选审阅链、停止/恢复事件。
- **缺失**：信封→可操作候选的恢复消费（后续轮失败/预算拦截后按 runId 恢复）；"沿用刚才第二个方向"的会话引用装配。
- **最小可用行为**：run 失败后 UI 提供"恢复已形成候选"入口，读取归档工具帧重建信封，幂等不重复登记。
- **失败路径**：归档无合法信封→如实提示不伪造；重复恢复→幂等键拦截。
- **涉及模块**：`server.mjs` intake 装配、`tianyiAgentRuntimePort.ts`、`storyIntakeBatchPort.mjs`。
- **迁移**：无新存储（复用 Archive）。
- **工作量/信心**：中/中高。**验收**：伪 Provider 断流后恢复原候选、不重复确认。**回滚**：恢复入口独立可关。

## 记忆注意力/上下文（跨包约束）

作者前提（M2 已修）与角色知情边界共用装配出口；任何新上下文必须走 Grounded Context Gate，不得旁路。
