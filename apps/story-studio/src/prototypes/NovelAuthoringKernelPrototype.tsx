import { useState } from "react";

import { NovelDocumentEditorR1, type NovelEditorReference } from "../components/NovelDocumentEditorR1";
import { createNovelDocumentModelR1Fixture, type NovelDocumentModelR1 } from "../../../../src/storyCreation/novelDocumentModelR1.ts";

/**
 * Development-only route retained as a fixture harness. It deliberately uses
 * the production editor component so the Founder review surface cannot drift
 * into a second authoring implementation.
 */
export function NovelAuthoringKernelPrototype() {
  const [model, setModel] = useState<NovelDocumentModelR1>(() => createNovelDocumentModelR1Fixture());
  const references: NovelEditorReference[] = [
    { id: "character.lin-hai", type: "character", label: "林海", revision: "fixture-v1" },
    { id: "location.linwu-city", type: "location", label: "临武城", revision: "fixture-v1" },
    { id: "event.bell-three", type: "event", label: "钟楼三响", revision: "fixture-v1" }
  ];
  return <NovelDocumentEditorR1 model={model} references={references} onChange={setModel} />;
}
