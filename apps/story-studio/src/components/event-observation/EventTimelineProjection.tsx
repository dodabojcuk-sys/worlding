import { Clock3, MapPin, UsersRound } from "lucide-react";

import { eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

export type EventTimelineItem = {
  event: EventLineEventSummary;
  timeLabel: string;
  timeKind: "exact" | "relative" | "range" | "unknown";
  sortKey: string;
  location: string;
  participants: readonly string[];
};

/**
 * A read-only ordering of the Event owner's existing world-time projection.
 * It deliberately never writes time, Canon, WorldState, or layout state.
 */
export function projectEventTimeline(events: readonly EventLineEventSummary[]): {
  dated: EventTimelineItem[];
  undated: EventTimelineItem[];
} {
  const items = events.map((event) => {
    const semantic = eventLineSemanticNode(event);
    const time = semantic.time;
    return {
      event,
      timeLabel: time.label,
      timeKind: time.kind,
      sortKey: timelineSortKey(time.start ?? time.end ?? time.label),
      location: semantic.locations[0] ?? "地点未提供",
      participants: semantic.participants
    } satisfies EventTimelineItem;
  });
  const dated = items.filter((item) => item.timeKind !== "unknown").sort((left, right) => left.sortKey.localeCompare(right.sortKey, "zh-CN") || left.event.title.localeCompare(right.event.title, "zh-CN"));
  return { dated, undated: items.filter((item) => item.timeKind === "unknown") };
}

export function EventTimelineProjection(props: {
  events: readonly EventLineEventSummary[];
  selectedEventId: string | null;
  onSelect(eventId: string): void;
}) {
  const timeline = projectEventTimeline(props.events);
  return <section className="event-timeline-projection" aria-label="事件时间轴" data-testid="event-timeline-projection">
    <header className="event-timeline-heading"><div><small>按故事世界时间</small><strong>时间轴</strong></div><span>{timeline.dated.length} 个已定时间事件</span></header>
    {timeline.dated.length ? <ol className="event-timeline-list" aria-label="已定时间事件">
      {timeline.dated.map((item) => <TimelineItem key={item.event.id} item={item} selected={item.event.id === props.selectedEventId} onSelect={props.onSelect} />)}
    </ol> : <p className="event-timeline-empty">当前没有已设定时间的事件；时间未知的事件仍保留在下方。</p>}
    <section className="event-timeline-undated" aria-label="时间未定事件"><header><Clock3 /><div><small>不推断、不丢失</small><strong>时间未定</strong></div><span>{timeline.undated.length}</span></header>
      {timeline.undated.length ? <ol>{timeline.undated.map((item) => <TimelineItem key={item.event.id} item={item} selected={item.event.id === props.selectedEventId} onSelect={props.onSelect} />)}</ol> : <p>所有当前事件都已有故事世界时间。</p>}
    </section>
  </section>;
}

function TimelineItem(props: { item: EventTimelineItem; selected: boolean; onSelect(eventId: string): void }) {
  const { item } = props;
  return <li className={props.selected ? "is-selected" : undefined}><button type="button" aria-pressed={props.selected} onClick={() => props.onSelect(item.event.id)}>
    <span className="event-timeline-marker" aria-hidden="true" /><time><Clock3 />{item.timeLabel}</time><strong>{item.event.title}</strong>
    <span><MapPin />{item.location}</span>{item.participants.length ? <span><UsersRound />{item.participants.join("、")}</span> : null}
  </button></li>;
}

function timelineSortKey(value: string): string {
  const trimmed = value.trim();
  const numeric = trimmed.match(/\d+/gu);
  if (!numeric?.length) return `z:${trimmed}`;
  return `a:${numeric.map((part) => part.padStart(12, "0")).join(":")}:${trimmed}`;
}
