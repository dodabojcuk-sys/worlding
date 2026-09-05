import { AppWindow, BookOpenText, Brain, Clock3, Languages, UsersRound } from "lucide-react";

import type { DockToolId } from "../../product-shell/right-dock/types.ts";
import type { PageToolDefinition } from "./pageToolTypes.ts";

export const PAGE_TOOL_REGISTRY: readonly PageToolDefinition[] = [
  { id: "engineering-log", labelKey: "tool.engineeringLog", descriptionKey: "tool.engineeringLogDescription", icon: BookOpenText, availability: "available" },
  { id: "expert-analysis", labelKey: "tool.expertAnalysis", descriptionKey: "tool.expertAnalysisDescription", icon: Brain, availability: "available" },
  { id: "reader-appreciation", labelKey: "tool.readerAppreciation", descriptionKey: "tool.readerAppreciationDescription", icon: UsersRound, availability: "not-connected" },
  { id: "language-check", labelKey: "tool.languageCheck", descriptionKey: "tool.languageCheckDescription", icon: Languages, availability: "not-connected" },
  { id: "history", labelKey: "tool.history", descriptionKey: "tool.historyDescription", icon: Clock3, availability: "not-connected" },
  { id: "extensions", labelKey: "tool.extensions", descriptionKey: "tool.extensionsDescription", icon: AppWindow, availability: "not-connected" }
] as const;

export function pageToolById(id: DockToolId): PageToolDefinition {
  const definition = PAGE_TOOL_REGISTRY.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown page tool: ${id}`);
  return definition;
}

export function pageToolAvailable(id: DockToolId): boolean {
  return pageToolById(id).availability === "available";
}
