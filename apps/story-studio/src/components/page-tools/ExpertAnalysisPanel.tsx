import { useState } from "react";

import type { ExpertSuggestion } from "./pageToolTypes";
import { useI18n } from "../../product-shell/i18n/I18nProvider";

export function ExpertAnalysisPanel(props: {
  suggestions?: readonly ExpertSuggestion[];
  onAdoptSuggestion?(suggestionId: string): void;
  onIgnoreSuggestion?(suggestionId: string): void;
}) {
  const { t } = useI18n();
  const [decisions, setDecisions] = useState<Record<string, "adopted" | "ignored">>({});
  const suggestions = props.suggestions ?? [{ id: "suggestion-causality", suggestion: t("expert.suggestion"), rationale: t("expert.rationale") }];
  const decide = (suggestionId: string, decision: "adopted" | "ignored") => {
    setDecisions((current) => ({ ...current, [suggestionId]: decision }));
    if (decision === "adopted") props.onAdoptSuggestion?.(suggestionId);
    else props.onIgnoreSuggestion?.(suggestionId);
  };

  return <section className="expert-analysis-panel" aria-label={t("expert.label")} data-provider-calls="0">
    {suggestions.map((item) => <article key={item.id}>
      <p>{item.suggestion}</p>
      <small><strong>{t("expert.rationaleLabel")}</strong>{item.rationale}</small>
      {decisions[item.id]
        ? <output>{decisions[item.id] === "adopted" ? t("expert.adopted") : t("expert.ignored")}</output>
        : <footer>
          <button type="button" onClick={() => decide(item.id, "adopted")}>{t("expert.adopt")}</button>
          <button type="button" onClick={() => decide(item.id, "ignored")}>{t("expert.ignore")}</button>
        </footer>}
    </article>)}
  </section>;
}
