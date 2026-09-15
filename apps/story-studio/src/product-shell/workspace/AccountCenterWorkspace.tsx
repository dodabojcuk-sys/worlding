import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";

/**
 * Presentation-only account home. Identity, billing and profile mutations stay
 * unavailable until their server-side owners and authentication boundary exist.
 */
export function AccountCenterWorkspace() {
  const [reviewIdentity, setReviewIdentity] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/__review/session", { credentials: "same-origin", headers: { accept: "application/json" } }).then(async (response) => {
      if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("application/json")) return;
      const body = await response.json() as { authenticated?: boolean; username?: string | null };
      if (active && body.authenticated && body.username) setReviewIdentity(body.username);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const logoutReview = () => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/__review/logout";
    document.body.append(form);
    form.submit();
  };
  return <main className="settings-utility-route settings-workspace-route account-center-workspace" aria-label="个人中心">
    <div className="settings-utility-content">
      <div className="settings-workspace-layout">
      <aside className="settings-workspace-nav" aria-label="个人中心目录">
        <p>个人中心</p>
        <nav><button type="button" aria-current="page"><small>个人</small><span>个人信息</span></button></nav>
      </aside>
      <div className="settings-workspace-sections"><section className="settings-card account-center-card" aria-labelledby="account-center-title">
        <header><UserRound aria-hidden="true" /><div><p>个人信息</p><h1 id="account-center-title">个人中心</h1></div></header>
        <dl>
          <div><dt>用户名</dt><dd>{reviewIdentity ?? "待接入账户服务"}</dd></div>
          <div><dt>账户状态</dt><dd>{reviewIdentity ? "公网审阅会话" : "本地作品模式"}</dd></div>
        </dl>
        <p>{reviewIdentity ? "退出只结束当前浏览器的审阅会话，不删除合成测试作品。" : "用户名修改、充值、订阅与账户安全需要服务端账户体系后才会开放；当前不会伪造这些操作。"}</p>
        {reviewIdentity ? <button type="button" className="secondary-action" onClick={logoutReview}><LogOut aria-hidden="true" />退出审阅环境</button> : null}
      </section></div>
      </div>
    </div>
  </main>;
}
