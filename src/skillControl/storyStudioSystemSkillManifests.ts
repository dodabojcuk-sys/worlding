import type { SkillManifest } from "./skillManifest.ts";

const readOnlyProjectPermissions = {
  readProject: true,
  writeProject: false,
  readMemory: false,
  writeMemory: false,
  useNetwork: false,
  useApiKey: false,
  executeLocalCommand: false
} as const;

/**
 * Product-facing descriptors for the first Story Studio system skills.
 *
 * These manifests intentionally expose no entrypoint. They extend the existing
 * Skill Control registry without creating an executable adapter or a second
 * Skill Runtime.
 */
export const STORY_STUDIO_SYSTEM_SKILL_MANIFESTS: SkillManifest[] = [
  {
    id: "story_character_consistency_check",
    name: "人物一致性检查",
    domain: "validation",
    providerType: "builtin",
    description: "核对人物动机、状态与已确认资料之间的一致性。",
    version: "1.0.0",
    adapterStatus: "descriptor_only",
    capabilities: ["reviewCharacterConsistency"],
    entrypoints: [],
    permissions: readOnlyProjectPermissions,
    defaultEnabled: false,
    userConfigurable: true
  },
  {
    id: "story_world_setting_check",
    name: "世界设定检查",
    domain: "worldbuilding",
    providerType: "builtin",
    description: "核对正文与世界规则、地点和已确认设定之间的冲突。",
    version: "1.0.0",
    adapterStatus: "descriptor_only",
    capabilities: ["reviewWorldSetting"],
    entrypoints: [],
    permissions: readOnlyProjectPermissions,
    defaultEnabled: false,
    userConfigurable: true
  },
  {
    id: "story_timeline_check",
    name: "时间线检查",
    domain: "validation",
    providerType: "builtin",
    description: "检查事件顺序、时间跨度与人物行动是否互相矛盾。",
    version: "1.0.0",
    adapterStatus: "descriptor_only",
    capabilities: ["reviewTimelineConsistency"],
    entrypoints: [],
    permissions: readOnlyProjectPermissions,
    defaultEnabled: false,
    userConfigurable: true
  },
  {
    id: "story_style_analysis",
    name: "文风分析",
    domain: "analysis",
    providerType: "builtin",
    description: "描述文本节奏、语气和表达特征，不自动改写正文。",
    version: "1.0.0",
    adapterStatus: "descriptor_only",
    capabilities: ["analyzeWritingStyle"],
    entrypoints: [],
    permissions: readOnlyProjectPermissions,
    defaultEnabled: false,
    userConfigurable: true
  },
  {
    id: "story_plot_analysis",
    name: "剧情分析",
    domain: "analysis",
    providerType: "builtin",
    description: "分析当前剧情结构、冲突与路线候选，不把建议写入故事事实。",
    version: "1.0.0",
    adapterStatus: "descriptor_only",
    capabilities: ["analyzePlot"],
    entrypoints: [],
    permissions: readOnlyProjectPermissions,
    defaultEnabled: false,
    userConfigurable: true
  }
];
