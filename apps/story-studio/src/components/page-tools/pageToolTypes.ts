import type { LucideIcon } from "lucide-react";

import type { DockToolId } from "../../product-shell/right-dock/types.ts";
import type { TranslationKey } from "../../product-shell/i18n/translations.ts";

export type PageToolDefinition = {
  id: DockToolId;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
  availability: "available" | "not-connected";
};

export type EngineeringLogEntry = {
  id: string;
  time: string;
  action: string;
  object: string;
  status: "complete" | "hint" | "pending";
};

export type ExpertSuggestion = {
  id: string;
  suggestion: string;
  rationale: string;
};
