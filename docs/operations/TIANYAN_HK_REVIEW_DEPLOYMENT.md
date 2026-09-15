# 天衍香港审阅环境部署

本手册只用于受登录保护的合成数据审阅环境，不是日常服务切换。它不携带 Provider 凭据，也不读取正式作品。

## 安全边界

- 公网 Origin 只允许 `https://tianyan.omnihex.xyz`；不接受通配符、HTTP、路径或查询参数。
- Story Studio 使用 `combined-static`，只监听 `127.0.0.1:4193`。
- 登录保护 SPA、API、附件与 SSE；未登录不能领取写会话。
- 密码只存放在服务器 `0600` 文件，不进 Git、systemd unit、Nginx 配置或日志。
- 不信任 `X-Forwarded-*` 来决定 Origin 或访问权限。
- 不停止或修改未知的公网 `4192`，不改 `collision.omnihex.xyz`。

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

确认 `4193` 未占用，保存 `nginx -T`、现有站点文件和证书索引的时间戳备份。先核对内存、磁盘和 swap，不预设需要改系统参数。

## 目录与运行环境

```text
/opt/tianyan-review/releases/<sha>/
/opt/tianyan-review/current
/srv/tianyan-review/library
/srv/tianyan-review/backups
/etc/tianyan-review/review-password
/etc/tianyan-review/runtime.env
```

使用独立的无登录 shell 系统用户 `tianyan-review`。在目标服务器使用 Node 22/npm 10 执行 `npm ci --omit=dev`，不上传开发机 `node_modules`。`dist`、源码和 release 目录必须对应同一 Git SHA。

`runtime.env` 不含明文密码，只记录：

```dotenv
PORT=4193
NODE_ENV=production
TIANYAN_STORY_STUDIO_RUNTIME_MODE=combined-static
TIANYAN_PUBLIC_ORIGIN=https://tianyan.omnihex.xyz
TIANYAN_REVIEW_USERNAME=reviewer
TIANYAN_REVIEW_PASSWORD_FILE=/etc/tianyan-review/review-password
WORLD_OS_STORY_STUDIO_ROOT=/srv/tianyan-review/library
WORLD_OS_STORY_STUDIO_STATE_FILE=/srv/tianyan-review/library/.story-studio/state.json
TIANYAN_CREATION_PLUGIN_ROOT=/srv/tianyan-review/creation-plugins
```

仅限短期、非敏感的 IP 直连评审，可显式改为：

```dotenv
TIANYAN_PUBLIC_ORIGIN=http://198.44.179.34:4193
TIANYAN_ALLOW_INSECURE_REVIEW_ORIGIN=1
```

该开关只允许“HTTP + 明确 IP + 明确端口”，不接受 HTTP 域名或通配符。此模式的登录密码和会话经明文网络传输，不得用于公开、长期或含敏感作品的环境；切回 HTTPS 时必须删除该开关。

systemd 使用 `WorkingDirectory=/opt/tianyan-review/current`、`ExecStart=/usr/bin/node --experimental-strip-types apps/story-studio/server/server.mjs`，只允许写 `/srv/tianyan-review`。先在服务器回环地址验证登录、401、写会话和退出，再接 Nginx。

## Nginx 代理

新增独立 `server_name tianyan.omnihex.xyz`，不改现有站点。普通请求使用 30 秒超时；只对天意 SSE 关闭缓冲并使用 130 秒读取期限。

```nginx
server {
    listen 80;
    server_name tianyan.omnihex.xyz;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name tianyan.omnihex.xyz;
    # 证书路径由本机既有 certbot 方式管理
    client_max_body_size 768m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    location = /__local/story-studio/model-service/tianyi-grounded-answer {
        proxy_pass http://127.0.0.1:4193;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 130s;
        proxy_send_timeout 30s;
    }
    location / {
        proxy_pass http://127.0.0.1:4193;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
}
```

DNS A/AAAA 必须先精确指向目标主机，不覆盖已有记录。`nginx -t` 通过后才 reload，证书沿用已有 Nginx/certbot 管理方式。

## 合成作品与验收

```bash
node --experimental-strip-types scripts/prepare-tianyan-review-library.mjs /srv/tianyan-review/library
```

脚本只创建「北湾创作审阅样例（合成）」和「空白新手练习（合成）」，并记录 `providerCalls: 0`。验收覆盖：未登录页面/API/附件/SSE，错误与正确登录，写会话，保存与刷新，地图与关系主流程，退出后 API 恢复 401。

## 回滚

部署前后记录 Git SHA、`dist` SHA-256、release 目录名和登录后 health 的 `codeRevision`。回滚时原子把 `current` 指回上一 release并重启本服务。首次部署则只停用 `tianyan-review.service`、移除本次新增的 vhost enabled 链接并 reload Nginx；不删共享 Nginx，不动现有站点或 4192。合成 library 先保留为独立备份，不用删数据代替代码回滚。
