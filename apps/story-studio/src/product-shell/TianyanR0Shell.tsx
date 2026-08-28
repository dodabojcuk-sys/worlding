import {
  Activity,
  Archive,
  BookOpen,
  Bot,
  Braces,
  ChevronRight,
  CircleDotDashed,
  Database,
  FileStack,
  GitBranch,
  Globe2,
  HeartPulse,
  MessageCircleMore,
  PanelRightClose,
  PanelRightOpen,
  ScrollText,
  Sparkles,
  WandSparkles,
  X,
  type LucideIcon
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  TIAN_YAN_R0_DIRECTORY_STATUS_LABEL,
  TIAN_YAN_R0_ENGINEERING_DIRECTORY,
  TIAN_YAN_R0_SPACES,
  type EngineeringDirectoryNode,
  type TianyanR0SpaceId
} from "../../../../src/storyContracts/tianyanR0ShellContract.ts";
import { R0_DEFAULT_PANEL_PLACEMENTS } from "./layoutProtocol";

const SPACE_ICONS: Record<TianyanR0SpaceId, LucideIcon> = {
  world: Globe2,
  tianyi: Sparkles,
  "event-line": GitBranch,
  multiverse: CircleDotDashed,
  nuwa: WandSparkles,
  library: BookOpen,
  creation: FileStack,
  data: Database
};

const PAGE_TOOLSETS: Record<TianyanR0SpaceId, readonly string[]> = {
  world: ["选择关注范围", "查看待处理", "打开世界摘要"],
  tianyi: ["添加引用", "上传来源", "管理会话上下文"],
  "event-line": ["聚焦剧情目录", "切换观察方式", "发起只读对照"],
  multiverse: ["选择来源版本", "查看派生边界", "比较状态"],
  nuwa: ["选择排演范围", "设置约束", "查看运行边界"],
  library: ["搜索目录", "定位类型", "查看来源范围"],
  creation: ["选择故事成果", "整理合册", "查看交付边界"],
  data: ["选择投影", "筛选页面日志", "查看 Owner 表"]
};

const PAGE_LOGS = [
  "R0 页面日志已开启：只记录当前 UI 操作，不读取故事数据。",
  "全局天意与页面工具可独立显示，当前可以并列。",
  "浮动、磁吸与换边已进入布局协议，尚未启用拖拽。"
];

export function TianyanR0Shell() {
  // Small screens start on the workspace; each panel can be opened explicitly.
  const startsNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches;
  const [activeSpace, setActiveSpace] = useState<TianyanR0SpaceId>("tianyi");
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string>("characters");
  const [showPageTools, setShowPageTools] = useState(!startsNarrow);
  const [showGlobalTianyi, setShowGlobalTianyi] = useState(!startsNarrow);
  const [showPageLog, setShowPageLog] = useState(true);

  const activeDefinition = TIAN_YAN_R0_SPACES.find((space) => space.id === activeSpace) ?? TIAN_YAN_R0_SPACES[0];
  const selectedDirectory = useMemo(
    () => findDirectoryNode(TIAN_YAN_R0_ENGINEERING_DIRECTORY, selectedDirectoryId),
    [selectedDirectoryId]
  );

  return (
    <main className="tianyan-r0-shell" data-testid="tianyan-r0-shell">
      <aside className="tianyan-r0-global-nav" aria-label="八空间全局导航">
        <div className="tianyan-r0-mark" aria-label="天衍 R0">
          <span>衍</span>
          <small>R0</small>
        </div>
        <div className="tianyan-r0-space-list">
          {TIAN_YAN_R0_SPACES.map((space) => {
            const Icon = SPACE_ICONS[space.id];
            const selected = space.id === activeSpace;
            return (
              <button
                className={`tianyan-r0-space ${selected ? "is-active" : ""}`}
                key={space.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                aria-label={`前往${space.label}`}
                onClick={() => setActiveSpace(space.id)}
              >
                <Icon aria-hidden="true" />
                <span>{space.label}</span>
              </button>
            );
          })}
        </div>
        <div className="tianyan-r0-nav-bottom">
          <span>static shell</span>
          <span>no facts</span>
        </div>
      </aside>

      <aside className="tianyan-r0-directory" aria-label="跨页面工程目录">
        <header>
          <div>
            <p className="tianyan-r0-eyebrow">ENGINEERING DIRECTORY</p>
            <h2>工程目录</h2>
          </div>
          <button type="button" className="tianyan-r0-icon-button" title="目录只用于导航与引用" aria-label="目录说明">
            <Braces aria-hidden="true" />
          </button>
        </header>
        <div className="tianyan-r0-status-key" aria-label="目录状态说明">
          {Object.entries(TIAN_YAN_R0_DIRECTORY_STATUS_LABEL).map(([status, label]) => <span key={status} data-status={status}>{label}</span>)}
        </div>
        <div className="tianyan-r0-directory-tree">
          {TIAN_YAN_R0_ENGINEERING_DIRECTORY.map((section) => (
            <section key={section.id} className="tianyan-r0-directory-section">
              <button type="button" className="tianyan-r0-directory-root" onClick={() => setSelectedDirectoryId(section.id)}>
                <span>{section.label}</span>
                <span data-status={section.status}>{TIAN_YAN_R0_DIRECTORY_STATUS_LABEL[section.status]}</span>
              </button>
              {section.children?.map((node) => (
                <button
                  type="button"
                  className={`tianyan-r0-directory-node ${selectedDirectoryId === node.id ? "is-selected" : ""}`}
                  key={node.id}
                  onClick={() => setSelectedDirectoryId(node.id)}
                >
                  <ChevronRight aria-hidden="true" />
                  <span>{node.label}</span>
                  <i data-status={node.status} aria-label={TIAN_YAN_R0_DIRECTORY_STATUS_LABEL[node.status]} />
                </button>
              ))}
            </section>
          ))}
        </div>
        <footer>统一目录 · 不复制页面数据</footer>
      </aside>

      <section className="tianyan-r0-workspace" aria-label={`${activeDefinition.label}中央工作区`}>
        <header className="tianyan-r0-topbar">
          <div className="tianyan-r0-breadcrumb"><span>天衍</span><ChevronRight aria-hidden="true" /><strong>{activeDefinition.label}</strong></div>
          <div className="tianyan-r0-topbar-actions">
            <button type="button" className={showPageLog ? "is-on" : ""} onClick={() => setShowPageLog((shown) => !shown)}>
              <ScrollText aria-hidden="true" /> {showPageLog ? "日志开启" : "日志关闭"}
            </button>
            <button type="button" className={showPageTools ? "is-on" : ""} onClick={() => setShowPageTools((shown) => !shown)}>
              {showPageTools ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />} 页面工具
            </button>
            <button type="button" className={showGlobalTianyi ? "is-on" : ""} onClick={() => setShowGlobalTianyi((shown) => !shown)}>
              <Bot aria-hidden="true" /> 全局天意
            </button>
          </div>
        </header>

        <div className="tianyan-r0-page-tool-rail" aria-label="统一页面工具轨">
          <button type="button" onClick={() => setShowPageTools((shown) => !shown)} aria-pressed={showPageTools}><Activity aria-hidden="true" /><span>工具</span></button>
          <button type="button" onClick={() => setShowPageLog((shown) => !shown)} aria-pressed={showPageLog}><ScrollText aria-hidden="true" /><span>日志</span></button>
        </div>

        <div className="tianyan-r0-workspace-body">
          {activeSpace === "tianyi" ? (
            <TianyiConversationStage />
          ) : (
            <section className="tianyan-r0-page-stage">
              <p className="tianyan-r0-eyebrow">{activeDefinition.route.toUpperCase()}</p>
              <h1>{activeDefinition.label}</h1>
              <p>{activeDefinition.summary}</p>
              <div className="tianyan-r0-stage-rule" />
              <p className="tianyan-r0-stage-note">R0 在这里确认工作区边界与工具语法；尚未连接任何故事资料、事件、会话或运行结果。</p>
            </section>
          )}

          <section className="tianyan-r0-directory-detail" aria-live="polite">
            <div>
              <p className="tianyan-r0-eyebrow">SELECTED DIRECTORY ITEM</p>
              <h2>{selectedDirectory?.label ?? "工程目录"}</h2>
            </div>
            <span data-status={selectedDirectory?.status ?? "pending"}>{TIAN_YAN_R0_DIRECTORY_STATUS_LABEL[selectedDirectory?.status ?? "pending"]}</span>
            {selectedDirectory?.note && <p>{selectedDirectory.note}</p>}
          </section>

          {showPageLog && (
            <section className="tianyan-r0-page-log" aria-label="页面日志">
              <div><p className="tianyan-r0-eyebrow">PAGE LOG</p><h2>页面日志</h2></div>
              <button type="button" className="tianyan-r0-icon-button" aria-label="关闭页面日志" onClick={() => setShowPageLog(false)}><X aria-hidden="true" /></button>
              <ol>{PAGE_LOGS.map((entry, index) => <li key={entry}><span>0{index + 1}</span>{entry}</li>)}</ol>
            </section>
          )}
        </div>
      </section>

      {(showPageTools || showGlobalTianyi) && (
        <aside className="tianyan-r0-panels" aria-label="独立面板">
          {showPageTools && (
            <section className="tianyan-r0-side-panel tianyan-r0-page-tools">
              <header><div><p className="tianyan-r0-eyebrow">PAGE TOOLS</p><h2>{activeDefinition.label}工具</h2></div><button type="button" className="tianyan-r0-icon-button" aria-label="关闭页面工具" onClick={() => setShowPageTools(false)}><X aria-hidden="true" /></button></header>
              <p>仅提供当前页面的操作入口；不创建第二份会话或事实状态。</p>
              <div className="tianyan-r0-tool-list">{PAGE_TOOLSETS[activeSpace].map((tool) => <button type="button" key={tool}>{tool}<ChevronRight aria-hidden="true" /></button>)}</div>
            </section>
          )}
          {showGlobalTianyi && (
            <section className="tianyan-r0-side-panel tianyan-r0-global-tianyi">
              <header><div><p className="tianyan-r0-eyebrow">GLOBAL TIAN YI</p><h2>全局天意</h2></div><button type="button" className="tianyan-r0-icon-button" aria-label="关闭全局天意" onClick={() => setShowGlobalTianyi(false)}><X aria-hidden="true" /></button></header>
              <div className="tianyan-r0-agent-orbit"><Bot aria-hidden="true" /><span>Agent Runtime</span></div>
              <p>与页面工具独立并列。R0 只展示 Pi Adapter 边界，不拥有任何故事事实、会话事实或作者确认权。</p>
              <dl>
                <div><dt>输入</dt><dd>授权上下文引用</dd></div>
                <div><dt>输出</dt><dd>候选与运行回执</dd></div>
                <div><dt>所有者</dt><dd>领域层</dd></div>
              </dl>
            </section>
          )}
          <footer className="tianyan-r0-layout-contract">布局协议 · {R0_DEFAULT_PANEL_PLACEMENTS.map((placement) => `${placement.panel}:${placement.mode}`).join(" · ")}</footer>
        </aside>
      )}
    </main>
  );
}

function TianyiConversationStage() {
  return <section className="tianyan-r0-tianyi-stage">
    <p className="tianyan-r0-eyebrow">PRIMARY CONVERSATION SPACE</p>
    <h1>天意</h1>
    <p className="tianyan-r0-tianyi-intro">所有创意、整理与执行将从一段可追溯的对话开始。R0 只确认主场，不创建会话。</p>
    <div className="tianyan-r0-dialogue-empty">
      <MessageCircleMore aria-hidden="true" />
      <strong>从一个还没整理好的想法开始</strong>
      <span>后续阶段接入来源、上下文、候选与作者审查。</span>
    </div>
    <div className="tianyan-r0-composer" aria-label="静态对话输入">
      <span>在 Founder 确认外壳后开始对话…</span>
      <button type="button" aria-label="发送（R0 未接入）"><Sparkles aria-hidden="true" /></button>
    </div>
  </section>;
}

function findDirectoryNode(nodes: readonly EngineeringDirectoryNode[], id: string): EngineeringDirectoryNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = node.children ? findDirectoryNode(node.children, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}
