# Story Studio 工程规则

- 涉及产品、功能、体验、信息架构或故事语义的任务，开始前必须完整阅读根目录的 `TIANYAN_PRODUCT_CORE.md`；它是唯一产品核心。
- 涉及 Author、Future、Character、Agent、Cross Device、Canon 准入或同步权威时，在产品核心之后按顺序完整阅读 `docs/product/TIANYAN_PRODUCT_SEMANTIC_CORE_R1.md`、`docs/product/TIANYAN_BOUNDARY_MODEL_R1.md`；进入工程设计、实现或准入审查前，再完整阅读 `docs/handoff/TIANYAN_ENGINEERING_GOVERNANCE_ALIGNMENT_R1.md`。三份 R1 文档是冻结语义与准入对照，不取代 `TIANYAN_PRODUCT_CORE.md`，也不得由实现便利反向改写。
- 新增、移动、拆分或定位代码前，必须阅读根目录的 `项目目录导航.md`；责任区、入口、所有者或验证路径改变时必须同步更新导航。
- 新增 Shell 功能前必须先定位唯一责任目录；`App.tsx` 只做顶层组装，`TianyanR0Shell.tsx` 只做区域组合，禁止继续向两者堆菜单、Dock 状态、业务数据或执行逻辑。
- 产品入口是 `apps/story-studio`。
- 使用 `package.json` 定义的十个脚本：`dev`、`build`、`serve`、`typecheck`、`lint`、`test`、`test:unit`、`test:integration`、`test:e2e`、`verify`。
- 保持唯一的 Canon 写入者、World 事实所有者与 Event 投影所有者。
- `bin/world-os-story.mjs` 是隔离的兼容 CLI，不得作为第二产品入口、Canon 写入者、WorldState 所有者或持久化根。
- 已退役的 World OS 运行路径和一次性 Story Studio 证据脚本必须保持不存在；`npm run lint` 会检查禁止路径与功能索引。
- 测试只能使用 Mock 或本地伪服务器，禁止调用真实 Provider。
- 用户正文、项目数据、数据库、迁移、环境文件和密钥属于受保护数据，禁止纳入破坏性清理。
- 创始人体验验收必须由人工独立完成；技术测试通过不代表创始人体验已验收。
