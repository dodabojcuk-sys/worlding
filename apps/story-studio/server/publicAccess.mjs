import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";

export const REVIEW_LOGIN_PATH = "/__review/login";
export const REVIEW_LOGOUT_PATH = "/__review/logout";
export const REVIEW_SESSION_PATH = "/__review/session";
const REVIEW_COOKIE = "tianyan_review_access";
const MAX_LOGIN_BODY_BYTES = 8 * 1024;

export function resolvePublicOrigin(
  source = process.env.TIANYAN_PUBLIC_ORIGIN || "",
  allowInsecureIp = process.env.TIANYAN_ALLOW_INSECURE_REVIEW_ORIGIN === "1"
) {
  const value = String(source).trim();
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("TIANYAN_PUBLIC_ORIGIN must be one exact public origin."); }
  const insecureIpOrigin = allowInsecureIp && parsed.protocol === "http:" && isIP(parsed.hostname) !== 0 && Boolean(parsed.port);
  if ((!insecureIpOrigin && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.hostname.includes("*") || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("TIANYAN_PUBLIC_ORIGIN must be one exact HTTPS origin; temporary HTTP access additionally requires an IP, explicit port, and TIANYAN_ALLOW_INSECURE_REVIEW_ORIGIN=1.");
  }
  return parsed.origin;
}

export function originIsAllowed(origin, { port, publicOrigin }) {
  const value = String(origin || "");
  if (!value) return true;
  if (publicOrigin && value === publicOrigin) return true;
  return value === `http://127.0.0.1:${port}` || /^http:\/\/127\.0\.0\.1:\d{2,5}$/u.test(value);
}

export function createReviewAccess({ username, passwordFile, publicOrigin, sessionSecret }) {
  const normalizedUsername = String(username || "").trim();
  const normalizedPasswordFile = String(passwordFile || "").trim();
  if (!normalizedUsername && !normalizedPasswordFile) return { enabled: false };
  if (!normalizedUsername || !normalizedPasswordFile) throw new Error("Review access requires both TIANYAN_REVIEW_USERNAME and TIANYAN_REVIEW_PASSWORD_FILE.");
  const expectedPassword = readFileSync(normalizedPasswordFile, "utf8").replace(/[\r\n]+$/u, "");
  if (expectedPassword.length < 16) throw new Error("Review access password must contain at least 16 characters.");
  const cookieSecure = Boolean(publicOrigin && new URL(publicOrigin).protocol === "https:");

  return {
    enabled: true,
    isAuthorized(request) { return secureEqual(readCookie(request, REVIEW_COOKIE), sessionSecret); },
    async handle(request, response, url) {
      if (request.method === "GET" && url.pathname === REVIEW_LOGIN_PATH) {
        if (this.isAuthorized(request)) { redirect(response, "/"); return true; }
        sendLoginPage(response, { failed: url.searchParams.get("failed") === "1" });
        return true;
      }
      if (request.method === "POST" && url.pathname === REVIEW_LOGIN_PATH) {
        const body = await readFormBody(request);
        if (secureEqual(body.get("username"), normalizedUsername) && secureEqual(body.get("password"), expectedPassword)) {
          response.writeHead(303, {
            location: "/",
            "cache-control": "no-store",
            "set-cookie": `${REVIEW_COOKIE}=${sessionSecret}; HttpOnly; SameSite=Strict; Path=/${cookieSecure ? "; Secure" : ""}`
          });
          response.end();
        } else redirect(response, `${REVIEW_LOGIN_PATH}?failed=1`, 303);
        return true;
      }
      if (request.method === "GET" && url.pathname === REVIEW_LOGOUT_PATH) {
        if (!this.isAuthorized(request)) { redirect(response, REVIEW_LOGIN_PATH); return true; }
        sendLogoutPage(response, normalizedUsername);
        return true;
      }
      if (request.method === "POST" && url.pathname === REVIEW_LOGOUT_PATH) {
        response.writeHead(303, {
          location: REVIEW_LOGIN_PATH,
          "cache-control": "no-store",
          "set-cookie": `${REVIEW_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecure ? "; Secure" : ""}`
        });
        response.end();
        return true;
      }
      if (request.method === "GET" && url.pathname === REVIEW_SESSION_PATH) {
        sendJson(response, this.isAuthorized(request) ? 200 : 401, { authenticated: this.isAuthorized(request), username: this.isAuthorized(request) ? normalizedUsername : null });
        return true;
      }
      return false;
    },
    reject(request, response) {
      const acceptsHtml = String(request.headers.accept || "").includes("text/html");
      if (request.method === "GET" && acceptsHtml) redirect(response, REVIEW_LOGIN_PATH, 302);
      else sendJson(response, 401, { error: "请先登录天衍审阅环境。" });
    }
  };
}

async function readFormBody(request) {
  if (!String(request.headers["content-type"] || "").startsWith("application/x-www-form-urlencoded")) throw Object.assign(new Error("登录请求格式不受支持。"), { statusCode: 415 });
  let source = "";
  for await (const chunk of request) {
    source += chunk;
    if (Buffer.byteLength(source) > MAX_LOGIN_BODY_BYTES) throw Object.assign(new Error("登录请求过大。"), { statusCode: 413 });
  }
  return new URLSearchParams(source);
}

function readCookie(request, name) {
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function secureEqual(received, expected) {
  const left = Buffer.from(String(received || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function redirect(response, location, status = 302) {
  response.writeHead(status, { location, "cache-control": "no-store" });
  response.end();
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function sendLoginPage(response, { failed }) {
  const message = failed ? '<p role="alert">用户名或密码不正确。</p>' : "";
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录天衍审阅环境</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5fa;color:#17233f;font:16px/1.5 system-ui,sans-serif}.card{width:min(88vw,360px);padding:32px;background:#fff;border:1px solid #dfe5ef;border-radius:16px;box-shadow:0 16px 45px #23304a18}h1{font-size:24px;margin:0 0 8px}p{color:#5c667a}label{display:grid;gap:6px;margin:16px 0}input{font:inherit;padding:11px 12px;border:1px solid #aeb8ca;border-radius:8px}button{width:100%;padding:11px;border:0;border-radius:8px;background:#155eef;color:#fff;font:600 16px system-ui;cursor:pointer}[role=alert]{color:#a61b1b}</style></head><body><main class="card"><h1>天衍审阅环境</h1><p>请使用审阅账号登录。</p>${message}<form method="post" action="${REVIEW_LOGIN_PATH}"><label>用户名<input name="username" autocomplete="username" required autofocus></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">登录</button></form></main></body></html>`;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "x-frame-options": "DENY" });
  response.end(html);
}

function sendLogoutPage(response, username) {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>退出天衍审阅环境</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5fa;color:#17233f;font:16px/1.5 system-ui,sans-serif}.card{width:min(88vw,360px);padding:32px;background:#fff;border:1px solid #dfe5ef;border-radius:16px;box-shadow:0 16px 45px #23304a18}h1{font-size:24px;margin:0 0 8px}p{color:#5c667a}button,a{display:block;box-sizing:border-box;width:100%;margin-top:12px;padding:11px;border:0;border-radius:8px;text-align:center;font:600 16px system-ui;text-decoration:none}button{background:#155eef;color:#fff;cursor:pointer}a{background:#edf2fb;color:#17233f}</style></head><body><main class="card"><h1>退出审阅环境</h1><p>当前审阅账号：${escapeHtml(username)}。退出不会删除合成作品。</p><form method="post" action="${REVIEW_LOGOUT_PATH}"><button type="submit">确认退出</button></form><a href="/">返回天衍</a></main></body></html>`;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "x-frame-options": "DENY" });
  response.end(html);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
