# 证据包 — TIANYAN_UI_DESIGN_FREEZE_R0

- Git HEAD：d16563b58a574433eb080f630ed5fda9a147b6ae（分支 codex/tianyan-ui-design-freeze-r0，stacked PR base=codex/world-workbench-r4）
- 生成时间：2026-09-18
- 设计源文件（可编辑、隔离）：`design-prototypes/tianyan-ui-freeze-r0/`（纯 HTML/CSS/少量原型导航 JS；本地打开 `index.html`，静态服务 `python3 -m http.server 4188`）
- 视口：1440×900 与 1152×720（同一响应式布局，非等比缩放；横向溢出实测均为 0）
- before 来源：生产 d16563b（http://127.0.0.1:4196 实拍，女娲 `/nuwa`、世界观 `/library?libraryView=reference`）
- 已实现功能 vs 设计预留的区别：见 `../FEATURE_PRESERVATION_MATRIX.md`；原型中「预留」一律虚线 + 文字标注，不可点击

## 文件清单
| 文件 | 说明 |
| --- | --- |
| before-女娲-1440/1152-默认态.png | 当前女娲生产 before（两档） |
| before-世界观-1440/1152-默认态.png | 当前世界观生产 before（两档，R4 现状仅作失败对照） |
| after-女娲-1440-默认态.png | 女娲 1440 默认：正文舞台主视觉 + 一个主行动 |
| after-女娲-1440-检查器打开.png | 角色知情检查器（作者问题组织） |
| after-女娲-1440-composer展开.png | composer 展开：引用/意图/队列/待确认/阶段版本 |
| after-女娲-1440-候选可见.png | 候选支线（虚线）+ 走向 A/B/C + 后续步骤队列 |
| after-女娲-1152-默认态.png / -覆盖抽屉.png | 1152 两态 |
| after-世界观-1440-总览.png | 脉搏 + 因果网络 + 演化轨迹 + 类型卡 |
| after-世界观-1440-搜索结果.png | 搜索第二状态 |
| after-世界观-1440-条目Peek.png / -条目Expanded.png | Dock 两态 |
| after-世界观-1152-默认态.png / -故事抽屉.png | 1152 两态 |
| after-原型总览-组件与token.png | 组件总览 + 设计 token 总览 |
| before-after-女娲-1440.png / before-after-世界观-1440.png | 并排对比 |

## 原型自检
- 原型可打开：4188 端口静态服务，全部状态可经 proto-bar 或 hash 打开
- 1440/1152 横向溢出：13 个状态实测 `scrollWidth - clientWidth = 0`
- 键盘焦点：`:focus-visible` 玉色 2px 描边全局生效
- 原型不被生产 build 引用：vite 仅构建 `apps/story-studio`；`design-prototypes/` 无任何生产 import（构建产物中无 proto.css/原型资源）
- 生产代码 tracked diff：0（本轮仅新增 `docs/design/TIANYAN_UI_DESIGN_FREEZE_R0/` 与 `design-prototypes/tianyan-ui-freeze-r0/`）

## 视觉验收状态
- 内部 judge 十二图：11 pass；1 项（候选可见态无差异）已修复并重截
- 创始人视觉验收：未做；本轮仅 READY_FOR_FOUNDER_REVIEW，不签发视觉 PASS
