import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { createReviewAccess, originIsAllowed, resolvePublicOrigin } from "../../apps/story-studio/server/publicAccess.mjs";

test("public origin is one exact HTTPS origin while local loopback remains compatible", () => {
  assert.equal(resolvePublicOrigin("https://tianyan.omnihex.xyz"), "https://tianyan.omnihex.xyz");
  assert.throws(() => resolvePublicOrigin("https://*.omnihex.xyz"), /exact HTTPS origin/u);
  assert.throws(() => resolvePublicOrigin("http://tianyan.omnihex.xyz"), /exact HTTPS origin/u);
  assert.throws(() => resolvePublicOrigin("https://tianyan.omnihex.xyz/path"), /exact HTTPS origin/u);
  assert.equal(originIsAllowed("https://tianyan.omnihex.xyz", { port: 4193, publicOrigin: "https://tianyan.omnihex.xyz" }), true);
  assert.equal(originIsAllowed("https://evil.example", { port: 4193, publicOrigin: "https://tianyan.omnihex.xyz" }), false);
  assert.equal(originIsAllowed("http://127.0.0.1:4191", { port: 4193, publicOrigin: "https://tianyan.omnihex.xyz" }), true);
});

test("review access is disabled by default and rejects partial configuration", () => {
  assert.equal(createReviewAccess({ username: "", passwordFile: "", publicOrigin: null, sessionSecret: "session" }).enabled, false);
  assert.throws(() => createReviewAccess({ username: "reviewer", passwordFile: "", publicOrigin: null, sessionSecret: "session" }), /requires both/u);
});

test("review access reads a dedicated password file and never accepts a wrong cookie", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-review-access-"));
  const passwordFile = path.join(root, "password");
  writeFileSync(passwordFile, "correct-horse-battery-staple\n", { mode: 0o600 });
  const access = createReviewAccess({ username: "reviewer", passwordFile, publicOrigin: "https://tianyan.omnihex.xyz", sessionSecret: "fixed-session-secret" });
  assert.equal(access.enabled, true);
  assert.equal(access.isAuthorized({ headers: { cookie: "tianyan_review_access=wrong" } }), false);
  assert.equal(access.isAuthorized({ headers: { cookie: "tianyan_review_access=fixed-session-secret" } }), true);
});

test("review login emits a Secure cookie for the HTTPS review origin and logout expires it", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-review-login-"));
  const passwordFile = path.join(root, "password");
  writeFileSync(passwordFile, "correct-horse-battery-staple\n", { mode: 0o600 });
  const access = createReviewAccess({ username: "reviewer", passwordFile, publicOrigin: "https://tianyan.omnihex.xyz", sessionSecret: "fixed-session-secret" });
  const login = request("username=reviewer&password=correct-horse-battery-staple", { "content-type": "application/x-www-form-urlencoded" });
  const loginResponse = response();
  assert.equal(await access.handle(login, loginResponse, new URL("https://tianyan.omnihex.xyz/__review/login")), true);
  assert.equal(loginResponse.status, 303);
  assert.match(String(loginResponse.headers["set-cookie"]), /HttpOnly; SameSite=Strict; Path=\/; Secure/u);
  const logoutResponse = response();
  assert.equal(await access.handle(request("", { cookie: "tianyan_review_access=fixed-session-secret" }), logoutResponse, new URL("https://tianyan.omnihex.xyz/__review/logout")), true);
  assert.match(String(logoutResponse.headers["set-cookie"]), /Max-Age=0; Secure/u);
});

function request(body: string, headers: Record<string, string>) {
  const stream = Readable.from([body]) as Readable & { method: string; headers: Record<string, string> };
  stream.method = body ? "POST" : "POST";
  stream.headers = headers;
  return stream;
}

function response() {
  return {
    status: 0,
    headers: {} as Record<string, unknown>,
    writeHead(status: number, headers: Record<string, unknown>) { this.status = status; this.headers = headers; },
    end() {}
  };
}
