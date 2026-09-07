# 天衍参考项目总台账

> 台账由本地保存的 `TIANYAN_REFERENCE_CATALOG_AND_G1_R2_BRIEF.md` 合并而来；R4 没有重新下载或重读所有外部仓库。C=该次研究读过相关源码，D=读过官方文档，H=历史已读但 R4 未复核，U=待调查，I=产品身份待确认，X=访问未成功。状态不能被“登记过”自动提升为“已分析”。

| ID | 项目与规范链接 | 关注 | 等级 | 已知用途/待验证问题 | 当前处理 |
| --- | --- | --- | --- | --- | --- |
| R01 | [AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant) | 重点 | C | 作者工作台、会话任务、阶段建议、审批续行 | 已抽查工作台视图模型、图执行链和许可证；只吸收从作品状态指向可执行下一步的机制 |
| R02 | [inkos](https://github.com/Narcooo/inkos) | 重点 | H | 预测、写作/演绎与状态检查 | 保留历史研究；开发对应模块前按固定提交复核 |
| R03 | [denova](https://github.com/alfredxw/denova) | 后续 | U | 用户指定同行；能力尚未核实 | 先登记，不猜测功能 |
| R04 | [webnovel-writer](https://github.com/lingfengQAQ/webnovel-writer) | 后续 | U | 章节与长期一致性能力待查 | 先登记 |
| R05 | [AI-automatically-generates-novels](https://github.com/wfcz10086/AI-automatically-generates-novels) | 后续 | U | 自动生成流程及阶段恢复是否可借鉴 | 先登记 |
| R06 | [MiroFish](https://github.com/666ghj/MiroFish) | 重点专题 | H | 多 Agent 社会仿真及预测呈现 | 仿真前复核；不是小说世界引擎替代品 |
| R07 | [silverfish](https://github.com/xumengke2025-sys/silverfish) | 图谱专题 | H | 关系证据与图谱表现 | 时间有效性能力未被证实 |
| R08 | [chinese-novelist-skill](https://github.com/PenglongHuang/chinese-novelist-skill) | 写作专题 | U | 中文写作工作方式与提示组织 | 登记；接入时限制作用范围 |
| R09 | [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | 验收工具 | H | 浏览器取证、交互及性能诊断 | 只作验收工具，不属于故事引擎 |
| R10 | [creator](https://github.com/Versus2017/creator) | 后续 | U | 用户指定功能参考，身份/模块待查 | 先登记 |
| R11 | [ReNovel-AI](https://github.com/BiranSama/ReNovel-AI) | 当前专题 | C | 原文重写、上下文与一致性约束 | 已抽查上下文构建及实际入口 |
| R12 | [coze-workflows](https://github.com/lihjdl/coze-workflows) | 输出专题 | D | 可导入 Coze 的多媒体工作流资料 | ZIP 内部未审计，不接入当前核心 |
| R13 | [DeterminFlow](https://github.com/alikon-art/DeterminFlow) | 最高关注 | C | 流程图、运行快照、分支执行、恢复 | 已读固定版本相关文件；不引入第二 Pi runtime |
| R14 | [agenttrail](https://github.com/sodiumsun/agenttrail) | 最高关注 | C | 语义缩放、声明/观察分层、运行覆盖层 | 已读核心 daemon、界面与缩放设计 |
| R15 | OpenWriter AI（用户原称） | 身份核实 | I | 同名产品较多，未取得准确链接 | 不用 R19 静默替代 |
| R16 | [novel-writer 教程](https://ai-zhangyouwei.com/projects/ai-writing/tutorials/) | 网页专题 | X | 用户指定教程与作者功能 | 读取未成功；不据此判断产品状态 |
| R17 | [vvd.world](https://vvd.world/) | 世界工具 | D | 世界资料、地图、图谱、时间线等多视图 | 只核对公开介绍，未进入账号实操 |
| R18 | WinkNovel（用户原称） | 身份核实 | I | 同名阅读/短剧产品较多 | 保留原名，不采用未经核实的能力描述 |
| R19 | [OpenWriter / travsteward](https://github.com/travsteward/openwriter) · [官网](https://openwriter.io/) | 新增重点 | C | MCP 协作文稿、候选修改、正文优先侧栏布局 | 源码与 MIT 许可证已读；独立于 R15 登记 |
| R20 | [pm-skills / outcome-roadmap](https://github.com/phuryn/pm-skills/blob/18468a95b427e70e258b51389796367c6f684e7d/pm-execution/skills/outcome-roadmap/SKILL.md) | 路线图方法 | D | 用作者结果、依赖和可观察验收表达阶段 | 固定版本资料；只用于项目路线图，不伪造工期或市场数据 |
| R21 | [pm-skills / test-scenarios](https://github.com/phuryn/pm-skills/blob/18468a95b427e70e258b51389796367c6f684e7d/pm-execution/skills/test-scenarios/SKILL.md) | 测试设计 | D | 自包含前置、动作、预期和实际证据 | 固定版本资料；不把模板膨胀成重复矩阵 |
| R22 | [awesome-design-md](https://github.com/VoltAgent/awesome-design-md/tree/8147538b4226ae41e2487a9179e3bcc1f68e8554) | 设计约束表达 | D | 层级、间距、边界、状态和 token 的文档形式 | 固定版本资料；不把营销页或第三方品牌规则直接覆盖到天衍 |
| R23 | Leaflet `1.9.4`（仓库已安装） | 地图 M1 候选引擎 | U | 非地理坐标、自定义底图、键盘/无障碍与离线使用仍待进入 M1 时核对 | 只登记本地依赖事实；R4 任务 A 不读取其源码、不新增地图实现 |
| R24 | React Flow `12.11.2`（仓库已安装） | 关系/拓扑候选投影 | U | 是否复用到人文关系层取决于画布密度与既有 Relation 投影 | 只登记本地依赖事实；不因已安装就默认采用 |

## 当前采用的机制

| 参考 | 固定版本 | R4 吸收 | 不直接照搬 |
| --- | --- | --- | --- |
| OpenWriter / R19 | `1497581aacd886a85d27c1898f15e16d0df6f7df` | 长驻目录意图与小空间临时覆盖层分离 | 复制其断点或文件式领域模型 |
| AgentTrail / R14 | `0d5d1510e022817427c24cf519a25e0f6b2b033e` | 稳定语义空间与瞬时活动覆盖层分离 | 用画布坐标取代 Event / Arrangement 身份 |
| DeterminFlow / R13 | `ceea31c932dea68b9fff73b39fb457a52f47a188` | 定义快照、执行尝试、暂停点和恢复分开 | 把流程分支合并等同于世界事实合并，或另起 Pi runtime |
| AI-Novel / R01 | `25db3223709dec7f892cfc7b0ba82742636644c6` | 从作品状态指向范围明确的下一步 | 用其角色/章节模型替代天衍 Agent / Event 语义 |
| PM / R20-R21 | `18468a95b427e70e258b51389796367c6f684e7d` | 结果—依赖—可观察验收、隔离场景与失败证据 | 将模板当作产品或测试框架替代品 |
| DESIGN.md / R22 | `8147538b4226ae41e2487a9179e3bcc1f68e8554` | 可验证地记录层级、间距、状态和 token | 套用 Linear/Notion 等第三方品牌或营销页数值 |

R4 任务 A 没有复制外部实现，也没有为目录恢复新增外部依赖；修复依据来自同一产品运行链的脱敏 trace。地图 M1 开始时再定向核对 R17、R23、R24 与 Relation Owner 的实际适配和许可，不把“已登记”写成“已采用”；进入女娲或预测专题时，再按需要复核 R02、R06、R07、R11、R12。
