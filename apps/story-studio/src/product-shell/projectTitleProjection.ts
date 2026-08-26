const INVALID_PROJECT_LABELS = new Set(["0", "null", "undefined"]);

/**
 * Projects remain owned by the bootstrap selection; this helper only creates
 * the author-facing label used by shared shell projections.
 */
export function projectDisplayTitle(value: unknown, hasProject = true): string {
  if (!hasProject) return "选择作品";
  if (typeof value !== "string") return "未命名作品";

  const title = value.trim();
  if (!title || INVALID_PROJECT_LABELS.has(title.toLocaleLowerCase("zh-CN")) || /^\[object\s+\w+\]$/iu.test(title) || isSerializedObject(title)) {
    return "未命名作品";
  }
  return title;
}

function isSerializedObject(value: string): boolean {
  if (!/^[\[{]/u.test(value)) return false;
  try {
    return typeof JSON.parse(value) === "object";
  } catch {
    return false;
  }
}
