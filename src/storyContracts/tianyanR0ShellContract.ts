/**
 * R0 的产品外壳合同。
 *
 * 这里的目录是信息架构与引用入口，不是故事对象、会话或事实的存储。
 * 任何实际 Canon、Event、WorldState、来源、版本或作者确认仍必须由既有领域 owner 持有。
 */

export const TIAN_YAN_R0_SPACE_IDS = [
  "world",
  "tianyi",
  "event-line",
  "multiverse",
  "nuwa",
  "library",
  "creation",
  "data"
] as const;

export type TianyanR0SpaceId = typeof TIAN_YAN_R0_SPACE_IDS[number];

export type TianyanR0Space = {
  id: TianyanR0SpaceId;
  label: string;
  summary: string;
  route: string;
};

export const TIAN_YAN_R0_SPACES: readonly TianyanR0Space[] = [
  { id: "world", label: "世界", summary: "当前作品的总览与下一步", route: "/world" },
  { id: "tianyi", label: "天意", summary: "作者与 AI 的唯一主对话场", route: "/tianyi" },
  { id: "event-line", label: "事件线", summary: "剧情结构、观察与对照", route: "/event-line" },
  { id: "multiverse", label: "多元", summary: "可追溯的派生方向", route: "/multiverse" },
  { id: "nuwa", label: "女娲", summary: "受控的故事排演", route: "/nuwa" },
  { id: "library", label: "资料", summary: "对象、设定、来源与结构化知识", route: "/library" },
  { id: "creation", label: "创作", summary: "故事包、合册与外部交付", route: "/creation" },
  { id: "data", label: "数据", summary: "只读投影、日志与系统可见性", route: "/data" }
];

export type EngineeringDirectoryStatus = "confirmed" | "pending" | "extensible";

export type EngineeringDirectoryNode = {
  id: string;
  label: string;
  status: EngineeringDirectoryStatus;
  note?: string;
  children?: readonly EngineeringDirectoryNode[];
};

/** 全局唯一工程目录；状态只说明产品定义成熟度，并不代表存在任何数据。 */
export const TIAN_YAN_R0_ENGINEERING_DIRECTORY: readonly EngineeringDirectoryNode[] = [
  {
    id: "library",
    label: "资料",
    status: "confirmed",
    children: [
      { id: "characters", label: "角色", status: "confirmed" },
      { id: "items", label: "物品", status: "confirmed" },
      { id: "locations", label: "地点", status: "confirmed" },
      { id: "organizations", label: "组织", status: "confirmed" },
      { id: "relations", label: "关系", status: "confirmed" },
      { id: "custom-types", label: "自定义类型", status: "extensible", note: "作者定义字段与能力" },
      { id: "unclassified", label: "未归类", status: "pending" }
    ]
  },
  {
    id: "plot",
    label: "剧情",
    status: "confirmed",
    children: [
      { id: "units", label: "单元", status: "confirmed" },
      { id: "beats", label: "集点", status: "confirmed" },
      { id: "nodes", label: "节点", status: "confirmed" },
      { id: "story-lines", label: "主线 / 支线 / 暗线", status: "pending" },
      { id: "derived-lines", label: "副本与分支", status: "pending" }
    ]
  },
  {
    id: "setting",
    label: "设定",
    status: "confirmed",
    children: [
      { id: "time", label: "时间", status: "confirmed" },
      { id: "worldview", label: "世界观", status: "confirmed" },
      { id: "rules", label: "规则与设定", status: "confirmed" },
      { id: "background", label: "背景", status: "confirmed" }
    ]
  },
  {
    id: "writing",
    label: "写作",
    status: "confirmed",
    children: [
      { id: "style", label: "写作风格", status: "confirmed" },
      { id: "language", label: "语言与术语", status: "confirmed" },
      { id: "preferences", label: "叙事偏好", status: "pending" }
    ]
  },
  {
    id: "ideas",
    label: "创意",
    status: "confirmed",
    children: [
      { id: "plot-ideas", label: "剧情想法", status: "confirmed" },
      { id: "inspirations", label: "灵感", status: "confirmed" },
      { id: "creative-directions", label: "创意方向", status: "confirmed" }
    ]
  },
  {
    id: "sources",
    label: "来源",
    status: "pending",
    note: "最终是独立分组还是资料入口，待 Founder 确认",
    children: [
      { id: "source-documents", label: "文档与导入记录", status: "confirmed" },
      { id: "source-media", label: "图片与音频", status: "extensible" }
    ]
  },
  {
    id: "creation",
    label: "创作交付",
    status: "confirmed",
    children: [
      { id: "story-packages", label: "中立故事包", status: "pending" },
      { id: "collections", label: "合册", status: "confirmed", note: "属于创作，不是独立空间" },
      { id: "output-artifacts", label: "输出产物", status: "pending" }
    ]
  }
];

export const TIAN_YAN_R0_DIRECTORY_STATUS_LABEL: Record<EngineeringDirectoryStatus, string> = {
  confirmed: "已确定",
  pending: "待确定",
  extensible: "可扩展"
};
