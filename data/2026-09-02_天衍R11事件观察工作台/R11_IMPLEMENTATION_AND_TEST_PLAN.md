# R11 实现与测试计划

状态：`APPROVED`
前置门禁：`R11_ARCHITECTURE_GATE=PASSED`

## 受控变更

1. 在 `src/storyContracts/` 新增纯函数观察状态与参与投影合同：白名单解析、旧视图迁移、兼容性校正、对象缺失降级、参与四态、叙事/世界时间排序。
2. 在 `apps/story-studio/src/components/event-observation/` 新增组合控制条与参与泳道组件。
3. 在 `EventLineWorkbench.tsx` 只做现有投影与新组件的组合，不移动事实读写责任。
4. 在既有 event-line 样式表追加同设计系统样式与断点。
5. 增加合同单元测试、源码边界集成测试与 E2E 最小旅程；更新功能索引的来源与验证路径。
6. 不新增依赖，不改 schema，不改迁移，不调用真实 Provider。

## 验证案例

### 合同单元测试

- 叙事顺序与世界时间顺序相反时，两种坐标产生不同顺序。
- 未知世界时间稳定落入“时间未定”，不生成虚假日期。
- 人物、地点、物品均可得到直接参与；人物可得到见证。
- 明确缺席与未知严格分离；无标签不能变成缺席。
- 同一对象在同一事件出现冲突标签时，明确参与优先并保留冲突证据提示。
- 非正式对象与超过五个焦点不会进入有效状态。
- 角色视角自动剔除地点和物品。
- 旧 `eventView` 可迁移；损坏 localStorage、未知枚举与已删除对象均安全降级。
- 保存 / 恢复只含视图字段，不含事件正文、关系或 Canon 数据。

### 组件 / 集成测试

- `EventLineWorkbench` 不新增 Owner、数据库或 Provider 调用。
- 组合工具栏的禁用项有原因；切换只写本地视图状态。
- 参与单元点击复用 `selectedEventId` 和既有详情 Dock。
- AI 工具只保留现有显式确认入口，镜头切换不触发。
- EventGraphCanvas、TemporalCanvas、故事脊柱入口仍可达。

### E2E

- 本地伪服务器 fixture 建立正式人物、地点、物品与至少四个事件。
- 叙事坐标下选择三类对象，验证参与 / 见证 / 明确缺席 / 未知。
- 切换世界时间后验证列重排和未知时间区。
- 点击单元验证同一 Event 详情；切回其他布局验证 Event 选择不丢失。
- 刷新验证组合恢复；删除或隐藏 fixture 对象后验证安全降级（由合同测试覆盖不可变路径）。
- 记录 1440×900、1280×800、1152×720；键盘完成布局、镜头、对象和事件选择。
- 断言控制台无 error/warning、无 Provider 请求。

### 全量命令

- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run build`
- `npm run verify`

全部命令使用项目要求的 Node 22。性能检查记录事件/对象规模、投影耗时与 DOM 数量；R11 不引入新的动画或远程资源。

## 回滚

- 生产改动与证据文档归入单一、带北京时间的 R11 本地候选提交。
- 回滚方法是撤销该提交；不需要数据库回退、数据修复或依赖降级。
- 原工作区 `/home/beelink/Documents/Codex/worlding.world-天衍` 的未提交改动不参与本轮提交。

## 停止条件

发生以下任一情况即停止生产实现：发现需要第二 Event/Canon/WorldState Owner、必须做不可逆迁移、必须自动调用 Provider、无法区分未知与缺席、或不能保持共享 Event ID。
