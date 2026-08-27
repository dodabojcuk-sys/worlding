# Story Studio 工程规则

- 涉及产品、功能、体验、信息架构或故事语义的任务，开始前必须完整阅读根目录的 `TIANYAN_PRODUCT_CORE.md`；它是唯一产品核心。
- 新增、移动、拆分或定位代码前，必须阅读根目录的 `项目目录导航.md`；责任区、入口、所有者或验证路径改变时必须同步更新导航。
- 产品入口是 `apps/story-studio`。
- 使用 `package.json` 定义的十个脚本：`dev`、`build`、`serve`、`typecheck`、`lint`、`test`、`test:unit`、`test:integration`、`test:e2e`、`verify`。
- 保持唯一的 Canon 写入者、World 事实所有者与 Event 投影所有者。
- `bin/world-os-story.mjs` 是隔离的兼容 CLI，不得作为第二产品入口、Canon 写入者、WorldState 所有者或持久化根。
- 已退役的 World OS 运行路径和一次性 Story Studio 证据脚本必须保持不存在；`npm run lint` 会检查禁止路径与功能索引。
- 测试只能使用 Mock 或本地伪服务器，禁止调用真实 Provider。
- 用户正文、项目数据、数据库、迁移、环境文件和密钥属于受保护数据，禁止纳入破坏性清理。
- 创始人体验验收必须由人工独立完成；技术测试通过不代表创始人体验已验收。
