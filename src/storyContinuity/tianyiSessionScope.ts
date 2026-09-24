import type { InteractionEvent } from "./continuityTypes.ts";

export type TianyiSessionScope = { kind: "project" } | { kind: "event-line"; storylineKey: string };

export function normalizeTianyiSessionScope(value: unknown): TianyiSessionScope {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("请选择天意对话的项目或事件线范围。");
  const input = value as Record<string, unknown>;
  if (input.kind === "project" && Object.keys(input).length === 1) return { kind: "project" };
  if (input.kind === "event-line" && Object.keys(input).length === 2 && typeof input.storylineKey === "string" && /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u.test(input.storylineKey)) return { kind: "event-line", storylineKey: input.storylineKey };
  throw new Error("天意对话范围无效，请重新选择项目或事件线。");
}

export function tianyiSessionScopeFromEvents(events: readonly InteractionEvent[]): TianyiSessionScope | null {
  const event = [...events].reverse().find((item) => item.type === "session-scope-selected" || item.type === "session-opened");
  if (!event) return null;
  try {
    const content = JSON.parse(event.content) as { scope?: unknown };
    return content.scope === undefined ? null : normalizeTianyiSessionScope(content.scope);
  } catch { return null; }
}
