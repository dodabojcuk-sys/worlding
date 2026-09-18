# COMPONENT_INVENTORY — 天衍 UI 设计冻结 R1

| 原型组件 | 所在原型文件 | 用途 | 生产实现映射（仅示意，本轮不改生产） |
| --- | --- | --- | --- |
| `proto-shell` | `proto.css` 共享 | 八空间轨道 + 工作区容器；仅原型展示用 | `TianyanR0Shell.tsx` + `ProductShellNavigation.tsx` |
| `proto-rail` | `proto.css` 共享 | 左栏空间导航示意 | `apps/story-studio/src/product-shell/navigation/` |
| `proto-bar` | `proto.css` 共享 | 原型状态切换栏；交付时整块移除 | 无 |
| `scene-head` | `nuwa.html` | 场景头：标题、切换、元信息、命运织线、出场角色 | `NuwaSceneOverview.tsx` + `NuwaN1Workspace.tsx` 头部 |
| `run-strip` | `nuwa.html` | Run 控制条：主行动 + 预算 + 次级动作 | `NuwaN1Workspace.tsx` run bar |
| `stage-plate` | `nuwa.html` | 正文舞台：环境/叙述/动作/对白/心理节奏块 | `NuwaUnifiedSceneWorkspace.tsx` |
| `candidate-weave` | `nuwa.html` | 候选支线虚线提示 | `NuwaDirectionCandidates.tsx` |
| `direction-bar` | `nuwa.html` | 紧凑走向栏（R1 新增） | 新增组件：DirectionCompactBar |
| `direction-compare` | `nuwa.html` | 展开方向比较区（R1 新增） | 新增组件：DirectionComparePanel |
| `composer` | `nuwa.html` | 作者输入区：意图 chips、提示框、后续步骤队列、待确认、阶段版本 | `NuwaN1Workspace.tsx` composer |
| `inspector` | `nuwa.html` | 角色知情检查器：按作者问题组织 | `NuwaN1Workspace.tsx` context inspector + `EntityInspectorDock.tsx` |
| `world-head` | `world.html` | 世界观页头：作品/锚点/世界时间 + 真实动作 | `WorldReferenceWorkspace.tsx` header |
| `story-lens` | `world.html` | 当前故事镜头（R1 新增） | `WorldReferenceWorkspace.tsx` 主区首屏 |
| `task-area` | `world.html` | 世界任务区：下一步动作 + 当前状态（R1 新增） | `WorldReferenceWorkspace.tsx` world task section |
| `object-detail` | `world.html` | 对象详情 / 上下文抽屉 | `EntityInspectorDock.tsx` WorldEntityDock |
| `search-surface` | `world.html` | 搜索第二状态 | `WorldReferenceWorkspace.tsx` search state |
| `causal-view` | `world.html` | 按需展开的因果网络 | 新增组件：CausalNetworkProjection（无证据不画线） |
| `evolution-track` | `world.html` | 演化时间轨迹 | `worldCausalEvolution.ts` + `EntityInspectorDock.tsx` 演化时间页签 |

说明：
- 所有原型组件都是纯 HTML/CSS，不 import 生产代码、不调用 API、不读取 Provider Key。
- 生产实现映射仅供 R1 后正式开发参考；本轮不创建生产组件。
