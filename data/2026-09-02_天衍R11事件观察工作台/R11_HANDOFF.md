# R11 本地交接

## 交付状态

R11 已形成可运行的本地候选：事件工作区从五个同级互斥页面重组为布局坐标 × 主观察镜头 × 信息叠层 × 焦点对象 × 语义尺度；“参与”是本轮完整生产闭环。

## 主要入口

- UI Owner：`apps/story-studio/src/components/EventLineWorkbench.tsx`
- 观察合同：`src/storyContracts/eventObservation.ts`
- 组合控制：`apps/story-studio/src/components/event-observation/EventObservationControls.tsx`
- 参与矩阵：`apps/story-studio/src/components/event-observation/ParticipationObservation.tsx`
- 视角边界：`src/storyContracts/eventPerspectiveProjection.ts`
- 产品/架构依据：本目录五份 `R11_*` 门禁文档、`调研报告.md`、`验证报告.md` 与仓库根 `design-qa.md`

## 不变量

- Event、Canon、WorldState、Relation、Story Unit 继续由既有唯一 Owner 持有。
- 观察状态仅在 project-scoped URL / localStorage 中保存白名单字段。
- 缺少参与证据为 unknown，不是明确缺席；冲突证据保持冲突。
- 角色心理视角只属于正式人物。
- 所有 AI 动作仍要求既有显式入口与确认；观察操作零 Provider。

## 已知后续范围

- 关系演变：等待版本化关系状态序列、区间/冲突/来源合同。
- 大型作品：超过 240 可见事件时需要按单元收窄；高频超大范围再考虑窗口化。
- 自定义命名视图、单位总览条与缩略导航：未纳入最小闭环。
- 创始人体验：必须由创始人独立验收，技术通过不代表产品签字。

## 本地验证

使用项目固定 Node 22 后执行 `npm run verify`。R11 专项证据由 `TIANYAN_E2E_SCOPE=r11-observation-workspace` 与 `TIANYAN_R11_OBSERVATION_EVIDENCE_DIR=<临时目录>` 生成；测试仅使用隔离 fixture。
