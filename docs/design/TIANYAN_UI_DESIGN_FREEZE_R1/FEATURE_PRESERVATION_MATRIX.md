# FEATURE_PRESERVATION_MATRIX — 天衍 UI 设计冻结 R1

约束：任何现有真实功能都不得因视觉重构而消失。允许重排、折叠、延迟显示，但必须记录入口。设计预留不是功能，必须明确标识且不可点击。本轮禁止用单一“映射率 100%”掩盖可发现性问题。

## 一、女娲作者工作面

| 功能名 | 当前生产入口 | 当前 Owner / 数据源 | R1 新位置 | 可见层级 | 真实可用 | 设计预留 | 可能遗漏 | 响应式位置 | 验收方法 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 选择出场角色（2–3 位正式角色） | `NuwaN1Workspace.tsx` 范围与运行设置里的 `bootstrap.participants` 复选框 | `NuwaN1Setup` / `localTransport` nuwa N1 API | 场景头右侧「出场角色」头像行 + 「＋」打开选择浮层 | 默认可见 | 是 | 否 | 低 | 1440 头像行常驻；1152 同浮层宽度受限 | N1 E2E / nuwa-n1 单测 |
| 逐角色本场目标 | 范围与运行设置内 participantGoals 输入行 | `NuwaN1Setup` | 角色选择浮层内逐角色输入行（选择后可见） | 一次点击 | 是 | 否 | 中 | 浮层内 | N1 E2E |
| 事件线 / 起止单元 / 推演范围 | 范围与运行设置 `details` 中的五个 select | `NuwaN1Setup` / work versions | Run 条左侧「范围」弹出面板 | 一次点击 | 是 | 否 | 高：选择器全部保留 | 面板适配宽度 | nuwaN1WorkspaceSource.test.ts |
| 作品版本（主版本/IF）选择 | 范围与运行设置首行 select | WorkVersion Owner | 范围面板首行 | 一次点击 | 是 | 否 | 高 | 面板内 | workVersion 相关测试 |
| 自动关系类型绑定 | 范围与运行设置 select | `NuwaN1Setup` | 范围面板行 | 一次点击 | 是 | 否 | 中 | 面板内 | N1 授权单测 |
| 局部目标输入 | 范围与运行设置 / composer goal input | `NuwaN1Setup` / `cueNuwaN1Run` | 范围面板 / composer 展开区 | 一次点击 | 是 | 否 | 低 | 面板或展开区 | cue 测试 |
| Run 状态机：连续运行、单步、暂停、恢复、停止、回放、新建排演 | Run 条状态按钮组 | `runNuwaN1Action`, `runNuwaN1Continuously`, `createNuwaN1Run` | Run 条：主行动「继续推演」+ 次级图标按钮；1152 次级进「更多」溢出菜单 | 默认可见 | 是 | 否 | 高：状态按钮是任务核心 | Run 条常驻 | N1 动作全单测 + E2E |
| Run 状态、步数与预算 | Run 条文本 / details | `NuwaN1RunReadModel` | Run 条状态点 + 紧凑预算文案 | 默认可见 | 是 | 否 | 中 | Run 条 | NuwaN1Runtime tests |
| 步骤阅读（意图/对白/行动/结果/听闻） | `NuwaUnifiedSceneWorkspace.tsx` | `NuwaBranchNode` / `NuwaN1Step` | 正文舞台节奏块（环境/叙述/动作/心理/对白） | 默认可见 | 是 | 否 | 高 | 舞台主列 | 步骤投影测试 |
| 步骤选择 → 送入待确认 | 步骤复选 + composer「送入待确认」 | `createNuwaN1Candidate` | 候选块勾选 + composer 展开区「待确认」主按钮 | 一次点击 | 是 | 否 | 高 | composer 展开区 | candidate 传递测试 |
| 高权限自动应用 / 固定稿 / 回溯 / 恢复回溯 | authorization banner + application tools | `autoApplyNuwaN1Result`, `freezeNuwaN1AutomaticDraft`, `rollbackNuwaN1AutomaticApplication` | Run 条授权盾形状态点 + composer 展开区「阶段版本 / 正式变化」 | 授权后可见 / 二次点击 | 是 | 否 | 高 | Run 条 + composer 展开区 | autoApply/rollback 测试 |
| 正式变化摘要（事件/关系/叙事位置/听闻） | `ApplicationSummary` | `automaticApplication` receipt | composer 展开区「正式变化」块 | 应用后 / 二次点击 | 是 | 否 | 中 | composer 展开区 | ApplicationSummary 测试 |
| 作者提示（cue）加入后续步骤 | composer 底部提示框 | `cueNuwaN1Run` | composer 紧凑单行输入；展开见队列 | 默认可见 | 是 | 否 | 高 | composer 底部 | cue 测试 |
| 上下文检查器：角色知情 / 步骤结果 / 运行记录 | 右侧 aside 三页签 | `run.contextInspector` / `CharacterMemoryQuery` | 右栏 320px（按作者问题组织）；1152 覆盖抽屉 | 按需 / 一次点击 | 是 | 否 | 中 | 右栏/抽屉 | ContextInspector 单测 |
| 角色知情详情（事实/信念/误解/听闻记忆来源） | 检查器“角色知情”页签 | `CharacterContextPack`, `CharacterMemoryQuery` | 检查器首屏：她知道什么 / 误解什么 / 想要什么 / 谁听见 / 当前冲突 | 按需 / 一次点击 | 是 | 否 | 高：记忆来源与预算易被当技术信息删除 | 右栏/抽屉 | characterMemoryQuery tests |
| 上下文预览（发送前） | 范围面板“查看上下文” | `setupNuwaN1` | 检查器「角色知情」预览态 | 一次点击 | 是 | 否 | 低 | 右栏/抽屉 | 预览测试 |
| 技术详情（Run ID/修订/Provider calls/token） | 页尾 `details` | `run.run` | 各处「来源与技术详情」折叠，`.tech-box` 样式 | 高级区 | 是 | 否 | 低 | 折叠保留 | — |
| 执行可用性状态（本地演练/未连接） | header runtime-state 卡 | `NuwaN1PiAdapter` status | 场景头小状态点 + tooltip/折叠 | 默认可见（点） | 是 | 否 | 低 | 场景头 | availability 测试 |
| 分支与版本：选分支、新建分支、保存阶段版本 | 范围与运行设置 `details` | `listNuwaBranches`, `createNuwaBranch`, `checkpointNuwaBranch` | Run 条「分支」下拉 / composer 展开区「阶段版本」 | 一次点击 | 是 | 否 | 高 | Run 条/展开区 | N1 分支单测 |
| 从角色档案预选 / runId 深链 / 旧 Run 回看 | URL/sessionStorage 逻辑 | `NuwaN1RunPack` | 保持不变（行为层） | — | 是 | 否 | 低 | 行为层 | 预选/深链 E2E |
| 角色访谈 / 角色接管 / 作者干预（未实现模式） | 无 | 无 | composer 意图 chips 中虚线「预留」标签，disabled | 不默认高亮 | 否 | 是 | 无 | composer chip 行 | 无（禁止假按钮） |

## 二、世界观工作台

| 功能名 | 当前生产入口 | 当前 Owner / 数据源 | R1 新位置 | 可见层级 | 真实可用 | 设计预留 | 可能遗漏 | 响应式位置 | 验收方法 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 资料区二级导航（资料库 / 世界参考 / 地图 / 关系） | `MaterialsSectionNavigation.tsx` | Route/URL | 页头紧下方二级导航 | 默认可见 | 是 | 否 | 低 | 页头下方 | world-materials-m1 E2E |
| 反查上下文（URL `?related=`） | `WorldReferenceWorkspace.tsx` related banner | `worldReferencesRelatedTo` | 当前故事镜头顶部「相关对象」横幅 | 深链时可见 | 是 | 否 | 中 | 页头下方/抽屉顶 | related 投影测试 |
| 信息性质筛选（confirmed / pending / rumor / author-note） | filter popover | `worldReferenceProjection` | 对象浏览区「筛选」按钮弹层 | 一次点击 | 是 | 否 | 中 | 弹层 | nature 筛选测试 |
| 持久索引消费 + 回退 | semantic-index fetch | `semanticIndexService.mjs` / `semanticChunking` / `indexEligibility` | 搜索工作面「检索高级」折叠; 索引状态诚实显示 | 二次点击 | 是 | 否 | 高：索引状态易被当 debug 删除 | 搜索工作面高级区 | semanticIndex 集成测试 |
| 混合/关键词检索 + 去重 + 为什么命中 | `WorldReferenceWorkspace.tsx` search results | `hybridRetrieval.ts` | 搜索工作面分组结果卡 | 搜索后出现 | 是 | 否 | 高 | 主列 | hybridRetrieval 测试 |
| 权限与边界排除汇总 | toolbar excluded span | `hybridRetrieval.ts` exclusion list | 搜索工作面「权限与边界排除」折叠 | 搜索后一次点击 | 是 | 否 | 高 | 搜索工作面 | characterAllowedReferences tests |
| 因果—演化卡字段（定义、机制、代价、例外、范围、维度） | Dock world-causal-card | `worldCausalEvolution.ts` | 对象详情「概览」页签 + 类型化卡 | 一次点击 | 是 | 否 | 高 | 详情抽屉 | worldCausalEvolution tests |
| 因果链（起源→机制→当前→可能变化） | Dock 因果链页签 | `worldCausalEvolution.ts` | 对象详情「因果链」页签 / 按需展开的「因果视图」 | 二次点击 | 是 | 否 | 高 | 详情抽屉 / 弹层 | 同上 |
| 演化时间（confirmed + planned/candidate 空态） | Dock 演化时间页签 | `attachTimeFrames` + `worldCausalEvolution.ts` | 对象详情「演化时间」页签；默认工作面仅显示当前故事位置 | 二次点击 | 是 | 否 | 中 | 详情抽屉 | attachTimeFrames tests |
| 关联线索 / 标签引用计数 | Dock 关系与影响 | `worldCausalEvolution.ts` + related clues | 对象详情「关系与影响」页签 / 当前故事镜头 | 一次点击 | 是 | 否 | 中 | 详情抽屉 | — |
| 事件线深链（frame.eventId → /event-line） | 回事件线链接 | Relation/Event Owner | 演化时间节点 / 对象详情中的「回事件线」保留 | 对象上 | 是 | 否 | 中 | 详情抽屉 | 深链 E2E |
| 来源与证据 | Dock 来源页签 | `readWorldObject` body | 对象详情「来源与证据」折叠 | 二次点击 | 是 | 否 | 中 | 详情抽屉 | — |
| 作者秘密/知识边界展示 | nature 徽标 + excluded 摘要 | `worldReferenceProjection` / `hybridRetrieval.ts` | 徽标暗金虚线 + 搜索高级「权限与边界排除」 | 默认/一次点击 | 是 | 否 | 高 | 卡/搜索高级 | characterAllowedReferences 测试 |
| 类型化浏览（category tabs + 结构化卡） | `WorldReferenceWorkspace.tsx` category chips + `WorldReferenceCard` | `worldReferenceProjection` | 世界任务区「浏览」入口；对象列表以行/卡混合呈现，不同类别结构不同 | 一次点击 | 是 | 否 | 高 | 主列/抽屉 | 投影测试 |
| 地图 / 关系 / 事件线 / 资料库入口 | 页头 action + 辅助区链接 | URL/routes | 当前故事镜头快捷链接 + 世界任务区动作列表 | 默认/一次点击 | 是 | 否 | 高 | 页头/右栏/抽屉 | world-materials-m1 E2E |
| 新建资料 | 无直接入口（通过资料库） | `storyStudioWorkspaceOperations.ts` | 世界任务区首屏「新建资料」真实动作 | 一次点击 | 是 | 否 | 高 | 任务区 | 未来接入 |
| 编辑资料 | 打开详情后编辑 | `storyStudioWorkspaceOperations.ts` | 对象详情头部「编辑」按钮 | 一次点击 | 是 | 否 | 中 | 详情抽屉 | 未来接入 |
| 关联当前场景或事件 | 标签 / 相关反查 | `worldReferenceProjection` | 当前故事镜头「关联到当前场景」入口 | 一次点击 | 是 | 否 | 中 | 故事镜头 | 投影测试 |
| 标记待确认 | 无直接入口 | Candidate Review Owner | 对象详情「标记待确认」动作 | 一次点击 | 是 | 否 | 中 | 详情抽屉 | 未来接入 |
| 当前故事上下文（单元分组对象） | `WorldReferenceWorkspace.tsx` 右栏 wb-aux | `worldReferenceProjection` | 右栏 300px「当前故事镜头」；1152 覆盖抽屉 | 默认可见 | 是 | 否 | 高 | 右栏/抽屉 | 单元分组投影测试 |
| 世界因果网络图 | SVG 示意（R0） | 关系/标签证据 | 设计预留：从规则/制度/系统对象详情按需展开，无证据不画线 | 二次点击 | 否 | 是（设计原型阶段） | 无 | 弹层/全屏 | 新增纯函数投影测试 |

## 三、统计与声明

- 女娲现有真实功能数：21 项（含行为层）。全部在 R1 中登记了位置；其中 4 项为高级区/折叠保留，已在矩阵中明确标注。
- 世界观现有真实功能数：23 项（含真实动作入口）。全部登记位置；其中 5 项为高级区/折叠保留，已明确标注。
- 设计预留（不可点击）：女娲 3 项意图模式；世界观因果网络图为设计阶段预留，实施时需补充证据驱动投影。
- 本轮不签发 EXISTING_FUNCTIONS_MAPPED=100_PERCENT；以逐项位置与可发现性为准。
