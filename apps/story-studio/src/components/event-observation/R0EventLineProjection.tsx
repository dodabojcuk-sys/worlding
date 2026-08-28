import { useMemo } from "react";

import { EventLineWorkbench } from "../EventLineWorkbench";
import { createEventLineFixture, readEventLineFixture } from "./eventLineFixture";

/**
 * R0.2's central event-line surface is a read-only projection over the
 * existing workbench and its isolated local fixture. It has no transport,
 * persistence, Canon, Event, or provider ownership.
 */
export function R0EventLineProjection(props: { onOpenTianyi(): void }) {
  const fixture = useMemo(() => createEventLineFixture("r0-2-event-line-projection"), []);

  return <EventLineWorkbench
    embedded
    projectId="r0-2-event-line-projection"
    projectTitle={fixture.projectTitle}
    events={fixture.events}
    listState={fixture.listState}
    onReadEvent={async (eventId) => readEventLineFixture(fixture, eventId)}
    onRetry={() => undefined}
    goldenLoop={null}
    rejectedCandidateIds={[]}
    acceptedCandidateIds={[]}
    currentFocusLabel={fixture.projectTitle}
    currentUnitLabel={fixture.storyUnits[0]?.title ?? null}
    onOpenTianyi={props.onOpenTianyi}
    onContinueReview={() => undefined}
  />;
}
