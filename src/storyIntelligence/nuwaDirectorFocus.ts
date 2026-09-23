/** Run-local guidance only. The same finite definitions drive the author card
 * and the actual Pi request; none supplies a character with new facts. */
export const NUWA_DIRECTOR_FOCUS_RULES = {
  "defer-reveal": "暂缓主动揭露：优先选择不直接揭示新结论的表达，不保证隐藏某条指定线索。",
  "prioritize-character-interaction": "优先角色互动：在已有可知范围与允许动作内优先对话或询问，不指定对象、台词或结果。",
  "preserve-uncertainty": "保留不确定性：对缺少依据的判断保持怀疑或未知，不把推测写成已知事实。",
  "advance-observation": "优先观察：在允许动作内先观察已有可感知内容，不创造线索或保证发现结果。"
} as const;
export const NUWA_DIRECTOR_SCOPE = "从下一安全步骤起，在当前场景后续步骤生效；场景或本次排演结束后失效，新采纳调整替换旧调整。仅调整推进提示，不保证剧情结果，不改写知识、记忆或正式故事。";
export function describeNuwaDirectorFocus(focus: readonly string[]): string {
  return focus.map((key) => {
    if (!Object.hasOwn(NUWA_DIRECTOR_FOCUS_RULES, key)) throw new Error("导演建议包含不支持的调整；未执行。");
    return NUWA_DIRECTOR_FOCUS_RULES[key as keyof typeof NUWA_DIRECTOR_FOCUS_RULES];
  }).join("\n");
}
