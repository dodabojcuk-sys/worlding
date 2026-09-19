# IMPLEMENTATION_MAPPING — 天衍 UI 设计冻结 R1

> 本轮仅交付设计资产。以下映射描述“设计稿通过后将如何进入生产”，不表示生产代码已修改。

## 女娲作者工作面

| 设计区域 | 原型元素 | 生产落地文件（未来） | 所需状态/数据 |
| --- | --- | --- | --- |
| 场景头 ≤96px | `scene-head` | `NuwaSceneOverview.tsx` | `bootstrap.scene`, `workVersion`, `participants` |
| 命运织线 | `.scene-thread` | 新增视觉组件 | `branchScenes` 顺序 |
| Run 控制条 | `.run-strip` | `NuwaN1Workspace.tsx` run bar | `run.status`, `run.budget` |
| 正文舞台 | `.stage-plate` + `.block` | `NuwaUnifiedSceneWorkspace.tsx` | `branchNodes` (confirmed/candidate) |
| 候选支线提示 | `.candidate-weave` | `NuwaDirectionCandidates.tsx` | candidate node metadata |
| 紧凑走向栏 | `.direction-bar` | 新增 `DirectionCompactBar.tsx` | `run.nextDirection`, `run.candidates` |
| 展开方向比较 | `.direction-compare` | 新增 `DirectionComparePanel.tsx` | same as above |
| Composer | `.composer` | `NuwaN1Workspace.tsx` composer | `run.cue`, `pendingReview`, `checkpoint` |
| 检查器 | `.inspector` | `NuwaN1Workspace.tsx` sidebar inspector | `CharacterContextPack`, `CharacterMemoryQuery` |
| 1152 抽屉 | `.inspector` overlay | 复用 Shell drawer 逻辑 | layout mode from `useShellLayout()` |

## 世界观工作台

| 设计区域 | 原型元素 | 生产落地文件（未来） | 所需状态/数据 |
| --- | --- | --- | --- |
| 页头 | `.world-head` | `WorldReferenceWorkspace.tsx` header | `project`, `workVersion`, world time tag |
| 当前故事镜头 | `.story-lens` | 新增 `StoryLensPanel.tsx` | current scene tags + related objects |
| 世界任务区 | `.task-area` | 新增 `WorldTaskPanel.tsx` | active rules, pressures, open questions, recent changes |
| 对象详情抽屉 | `.object-detail` / `story-rail` | `EntityInspectorDock.tsx` | `worldReferenceProjection` + `worldCausalEvolution` |
| 搜索工作面 | `.search-surface` | `WorldReferenceWorkspace.tsx` search state | `hybridRetrieval` results |
| 因果视图 | `.causal-view` | 新增 `CausalNetworkProjection.tsx` | relation evidence + object tags |
| 演化轨迹 | `.evolution-track` | `EntityInspectorDock.tsx` 演化时间页签 | `attachTimeFrames` |
| 类型化浏览 | `.type-list` | `WorldReferenceWorkspace.tsx` browse state | `worldReferenceProjection` by category |

## 设计 token 落地

- 新 token 进入 `apps/story-studio/src/product-shell/theme/tokens.css`（追加）。
- 女娲样式进入 `apps/story-studio/src/styles/nuwa-n1.css` 或新增 `nuwa-authoring-r1.css`。
- 世界观样式进入 `apps/story-studio/src/styles/world-reference-r1.css`。
- 不得覆盖现有语义 token，必须兼容 FEATURE_INDEX 中的 `tianyan-r0-static-shell`。
