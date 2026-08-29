import { UserRound } from "lucide-react";

/**
 * Presentation-only account home. Identity, billing and profile mutations stay
 * unavailable until their server-side owners and authentication boundary exist.
 */
export function AccountCenterWorkspace() {
  return <main className="account-center-workspace" aria-label="个人中心">
    <div className="account-center-layout">
      <aside className="account-center-nav" aria-label="个人中心目录">
        <p>个人中心</p>
        <nav><button type="button" aria-current="page"><UserRound aria-hidden="true" /><span>个人信息</span></button></nav>
      </aside>
      <section className="account-center-stage" aria-labelledby="account-center-title">
        <header><UserRound aria-hidden="true" /><div><p>个人信息</p><h1 id="account-center-title">个人中心</h1></div></header>
        <dl>
          <div><dt>用户名</dt><dd>待接入账户服务</dd></div>
          <div><dt>账户状态</dt><dd>本地作品模式</dd></div>
        </dl>
        <p>用户名修改、充值、订阅与账户安全需要服务端账户体系后才会开放；当前不会伪造这些操作。</p>
      </section>
    </div>
  </main>;
}
