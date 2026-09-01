import type { ReactNode } from "react";

import type { StoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { MultiNodePredictionPanel } from "./MultiNodePredictionPanel";

export function TianyiAgentPanel(props: {
  runtime: TianyanShellRuntimeState;
  eventRefs: StoryStudioEventReference[];
  sourceLabels?: string[];
  sourceUnitSummary?: string;
  generalRun: ReactNode;
  composer: ReactNode;
  error: string;
}) {
  const predictionActive = props.eventRefs.length > 0;
  return <section className="tianyi-agent-panel" aria-label="天意 Agent" data-agent-run-preserved="true">
    {predictionActive ? <MultiNodePredictionPanel runtime={props.runtime} eventRefs={props.eventRefs} sourceLabels={props.sourceLabels} sourceUnitSummary={props.sourceUnitSummary} /> : props.generalRun}
    {props.error ? <p className="tianyi-error" role="alert">{props.error}</p> : null}
    {!predictionActive ? props.composer : null}
  </section>;
}
