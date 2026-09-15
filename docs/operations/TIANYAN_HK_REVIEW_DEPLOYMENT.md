# 天衍香港审阅环境部署

本手册只用于受登录保护的合成数据审阅环境，不是日常服务切换。它不携带 Provider 凭据，也不读取正式作品。

## 安全边界

- 公网 Origin 只允许 `https://tianyan.worlding.world`；不接受通配符、HTTP、路径或查询参数。
- Story Studio 使用 `combined-static`，只监听 `127.0.0.1:4194`；公网流量由本机 Nginx 终止 TLS 后转发到 4194，旧的 `tianyan-review-proxy.socket/service`（4193 systemd-socket-proxyd）已退役。
- 登录保护 SPA、API、附件与 SSE；未登录不能领取写会话。HTTPS Origin 下两类 Cookie 均带 `Secure`。
- 审阅密码只存放在服务器 `root:tianyan-review 0640` 文件，不进 Git、systemd unit、Nginx 配置或日志。
- Provider API Key 存放在独立的生产凭据文件（见下），0600、服务用户所有、位于作品库之外；不进 Git、前端包、日志、截图或交接文件。
- 不信任 `X-Forwarded-*` 来决定 Origin 或访问权限。
- 不停止或修改未知的公网 `4192`，不改 `collision.omnihex.xyz` 或其他服务。

## 服务器前置核查

```bash
uname -a
cat /etc/os-release
free -h
swapon --show
df -hT /
ss -ltnp
systemctl --no-pager --type=service --state=running
nginx -T
```

确认 `4194` 未被占用、Nginx 站点与证书就绪后继续。先核对内存、磁盘和 swap，不预设需要改系统参数。

## 目录与运行环境

```text
/opt/tianyan-review/releases/<sha>/          # 每 SHA 一个 release，含同一 SHA 的 dist
/opt/tianyan-review/current                  # 当前 release 符号链接
/opt/tianyan-review/backups/previous         # 上一 release 符号链接（回滚点）
/srv/tianyan-review/library                  # 合成作品库
/srv/tianyan-review/backups
/etc/tianyan-review/review-password          # 审阅登录密码（root:tianyan-review 0640）
/etc/tianyan-review/runtime.env              # 运行环境（root:tianyan-review 0640）
/etc/tianyan-review/credentials/             # Provider 凭据目录（服务用户 0700）
/etc/tianyan-review/credentials/provider-credential   # Provider API Key（0600）
```

使用独立的无登录 shell 系统用户 `tianyan-review`。在目标服务器使用 Node 22/npm 10 执行 `npm ci` 与 `npm run build`，不上传开发机 `node_modules`。`dist`、源码和 release 目录必须对应同一 Git SHA。

`runtime.env` 由 `scripts/deploy-tianyan-review-server.sh` 生成，不含明文密码或密钥，只记录：

```dotenv
NODE_ENV=production
PORT=4194
WORLD_OS_STORY_STUDIO_ROOT=/srv/tianyan-review/library
WORLD_OS_STORY_STUDIO_STATE_FILE=/srv/tianyan-review/library/.story-studio/state.json
TIANYAN_PUBLIC_ORIGIN=https://tianyan.worlding.world
TIANYAN_REVIEW_USERNAME=reviewer
TIANYAN_REVIEW_PASSWORD_FILE=/etc/tianyan-review/review-password
TIANYAN_CREDENTIAL_BACKEND=PRODUCTION_FILE
TIANYAN_CREDENTIAL_FILE_PATH=/etc/tianyan-review/credentials/provider-credential
TIANYAN_REAL_PROVIDER_PRODUCT_PATH=1
TIANYAN_PROVIDER_AUTHORIZATION_RECEIPT_ID=review-deployment.product-path.r1
TIANYAN_PROVIDER_PRODUCT_GENERATION_BUDGET=40
TIANYAN_PROVIDER_PRODUCT_TOTAL_BUDGET=60
TIANYAN_NUWA_N1_PI_ADAPTER=1
```

## Provider 凭据与预算（本轮新增）

- **凭据后端**：`TIANYAN_CREDENTIAL_BACKEND=PRODUCTION_FILE` 启用生产文件后端。它把 API Key 存为部署时指定的独立 0600 文件，写入原子（临时文件 + fsync + rename），读取时校验文件不帯 group/world 位，目录不帯 group/world 写位；文件缺失视为“未配置”而不是错误。它不加密、也不宣称加密；保护来自权限隔离与作品库之外的独立位置（与 review-password 同级的管理约定）。
- **保存/更换/删除**：作者在产品“设置 → Provider 与模型”里完成。保存失败自动回滚不破坏旧值；“显示已保存密钥”只在当前管理会话短时可见（20 秒）；清除需要显式确认。重启后服务自动读取同一文件。
- **禁用模式**：`TIANYAN_CREDENTIAL_BACKEND=DISABLED` 时，设置页在输入框之前显示明确禁用提示，且 API Key 输入与保存/测试/目录按钮不可点击。
- **产品预算**：生产账本默认携带历史事故基线（fail-closed）。部署通过 `TIANYAN_PROVIDER_AUTHORIZATION_RECEIPT_ID` + `TIANYAN_PROVIDER_PRODUCT_*_BUDGET` 显式登记一份授权回执（首次启动写入持久账本，重启幂等复用）；未配置回执时产品路径保持阻断。设置页的目录/连接测试另有共享 4 次诊断预算，不受本回执影响。
- **女娲**：`TIANYAN_NUWA_N1_PI_ADAPTER=1` + 产品路径 + 凭据 + 已选模型四者齐备，女娲状态才变为可运行；任一缺失都会在状态里如实说明，不会发送请求。

## 部署步骤

```bash
node --version                      # 必须 v22.22.0
scripts/deploy-tianyan-review-server.sh <40-char-commit-sha>
```

脚本执行：克隆/校验 SHA → `npm ci` + `npm run build` → 建目录与权限 → 写 runtime.env → 生成/保留审阅密码 → 安装 systemd 单元（`ReadWritePaths=/srv/tianyan-review /etc/tianyan-review/credentials`）→ 启动 → 健康检查：

- 未登录 API 401；
- 登录 303 + 访问 Cookie；带 Cookie 会话 200；
- （HTTPS Origin 时）`--resolve` 走本机 Nginx 的公网健康检查返回 401。

## 部署后验证（人工）

按顺序在浏览器验证：

1. 登录、会话、退出后 API 恢复 401；
2. 设置 → Provider 与模型：凭据“已锁定保存”、连接状态 verified、模型目录可获取、连接测试成功；
3. 关系页选中关系 → 依据可读（来源事件正文与修订一致）；
4. 事件线/创作页：故事单元与已确认事件条件可满足，可建立固定创作稿；刷新重开保持；
5. 天意：发送问题获得真实模型回复；回答回执与依据一致。

## 回滚

部署前后记录 Git SHA、`dist` SHA-256、release 目录名和登录后 health 的 `codeRevision`。回滚时原子把 `current` 指回 `backups/previous` 并重启本服务。凭据文件与审阅密码不随回滚改动；如需更换密钥，在设置页“更换”或由运维直接改写凭据文件（保持 0600）。合成 library 先保留为独立备份，不用删数据代替代码回滚。
