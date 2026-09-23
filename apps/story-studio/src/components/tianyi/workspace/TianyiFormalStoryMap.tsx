import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import { ArrowDown, GitBranch, Map as MapIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getCreationSourcePortState, getNarrativeArrangement, getVerifiedCanonEventList, getWorldLibrary, listStoryUnits, type NarrativeArrangementRead, type StoryUnit, type WorldObjectSummary } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { eventLineEventMetadata, type EventLineEventSummary, verifiedCanonEventSummaries } from "../../eventLineCommittedEvents";

type FormalMapState = { status: "loading" | "ready" | "error"; events: EventLineEventSummary[]; characters: WorldObjectSummary[]; units: StoryUnit[]; narratives: NarrativeArrangementRead[] };

export type TianyiFormalNarrativeContext = {
  projectTitle: string | null;
  unitTitle: string | null;
  nodeTitle: string | null;
  eventId: string | null;
  openQuestion: string | null;
  characters: readonly TianyiFormalCharacter[];
};

/** Existing Character records enrich a selected Canon Event; they do not decide Canon admission. */
export type TianyiFormalCharacter = { id: string | null; title: string; identity: string | null };

type FormalNode = {
  placement: NarrativeArrangementRead["projection"]["placed"][number];
  event: EventLineEventSummary;
  narrativePathId: string;
  workVersionId: string;
};

/** A read-only Canon projection. Future material is never promoted into these nodes. */
export function TianyiFormalStoryMap(props: {
  runtime: TianyanShellRuntimeState;
  onOpenNuwa(input: { storyUnitId: string; eventId: string; narrativePathId: string; workVersionId: string | null }): void;
  onContextChange?(context: TianyiFormalNarrativeContext): void;
}) {
  const [state, setState] = useState<FormalMapState>({ status: "loading", events: [], characters: [], units: [], narratives: [] });
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { t } = useI18n();
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId ?? null;

  useEffect(() => {
    let active = true;
    setState({ status: "loading", events: [], characters: [], units: [], narratives: [] });
    setSelectedUnitId(null);
    setSelectedEventId(null);
    if (!projectId) return () => { active = false; };
    void Promise.all([getWorldLibrary(projectId), getVerifiedCanonEventList(projectId, workVersionId), listStoryUnits(projectId), getCreationSourcePortState({ projectId })]).then(async ([library, list, units, source]) => {
      if (list.status !== "ready") throw new Error("正式 Event 读取未通过认证。");
      const root = source.root;
      const paths = units.filter((unit) => unit.status !== "archived" && (unit.kind === "main" || unit.kind === "branch"));
      const narratives = root ? await Promise.all(paths.map((unit) => getNarrativeArrangement(projectId, root.id, unit.id))) : [];
      if (!active) return;
      // The certified id list is the admission result. Tags only enrich the
      // presentation below; they never decide whether an Event is Canon.
      setState({ status: "ready", events: verifiedCanonEventSummaries(library.objects, list.eventIds), characters: library.objects.filter((item) => item.type === "character"), units, narratives });
    }).catch(() => { if (active) setState({ status: "error", events: [], characters: [], units: [], narratives: [] }); });
    return () => { active = false; };
  }, [projectId, workVersionId]);

  const mainUnits = useMemo(() => state.units.filter((unit) => unit.kind === "main" && unit.status !== "archived").sort((left, right) => left.order - right.order), [state.units]);
  const activeUnit = mainUnits.find((unit) => unit.id === selectedUnitId) ?? mainUnits[0] ?? null;
  const activeIndex = activeUnit ? mainUnits.findIndex((unit) => unit.id === activeUnit.id) : -1;
  const eventById = useMemo(() => new Map(state.events.map((event) => [event.id, event])), [state.events]);
  const activeNarrative = activeUnit ? state.narratives.find((read) => read.projection.narrativePathId === activeUnit.id) ?? null : null;
  const nodes: FormalNode[] = activeNarrative?.projection.placed.map((placement) => ({ placement, event: eventById.get(placement.eventId), narrativePathId: activeNarrative.projection.narrativePathId, workVersionId: activeNarrative.projection.workVersionId })).filter((entry): entry is FormalNode => Boolean(entry.event)) ?? [];
  const selectedNode = nodes.find((node) => node.event.id === selectedEventId) ?? nodes.at(-1) ?? null;
  const selectedMetadata = selectedNode ? eventLineEventMetadata(selectedNode.event) : null;
  const charactersByTitle = useMemo(() => new Map(state.characters.map((character) => [character.title, character])), [state.characters]);
  const selectedCharacters = useMemo(() => (selectedMetadata?.characterLabels ?? []).map((title) => {
    const character = charactersByTitle.get(title);
    return {
      id: character?.id ?? null,
      title,
      identity: character ? character.tags.find((tag) => tag !== "人物" && tag !== "角色") ?? null : null
    };
  }), [charactersByTitle, selectedMetadata?.characterLabels]);
  const selectedCharacterKey = selectedCharacters.map((character) => `${character.id ?? ""}:${character.title}:${character.identity ?? ""}`).join("\u0000");
  const branchUnits = state.units.filter((unit) => unit.kind === "branch" && unit.status !== "archived");

  useEffect(() => {
    props.onContextChange?.({
      projectTitle: props.runtime.project?.title ?? null,
      unitTitle: activeUnit?.title ?? null,
      nodeTitle: selectedNode?.event.title ?? null,
      eventId: selectedNode?.event.id ?? null,
      openQuestion: selectedMetadata?.openQuestions?.[0] ?? null,
      characters: selectedCharacters
    });
  }, [activeUnit?.id, activeUnit?.title, props.onContextChange, props.runtime.project?.title, selectedCharacterKey, selectedCharacters, selectedNode?.event.id, selectedNode?.event.title]);

  if (!projectId) return null;
  return <section className="tianyi-formal-story-map" aria-label={t("storyMap.title")} data-read-authority="verified-canon">
    <header><div><small>{t("storyMap.formal")}</small><h2>{t("storyMap.title")}</h2></div><MapIcon aria-hidden="true" /></header>
    {state.status === "loading" ? <p className="tianyi-formal-map-state">{t("storyMap.loading")}</p> : null}
    {state.status === "error" ? <p className="tianyi-formal-map-state" role="alert">{t("storyMap.error")}</p> : null}
    {state.status === "ready" && !mainUnits.length ? <p className="tianyi-formal-map-state">{t("storyMap.empty")}</p> : null}
    {state.status === "ready" && mainUnits.length > 0 ? <>
      <dl className="tianyi-current-story-state"><div><dt>{t("storyMap.unit")}</dt><dd>{activeUnit?.title}</dd></div>{selectedNode ? <div><dt>{t("storyMap.node")}</dt><dd>{selectedNode.event.title}</dd></div> : null}{selectedMetadata?.openQuestions?.[0] ? <div><dt>{t("storyMap.question")}</dt><dd>{selectedMetadata.openQuestions[0]}</dd></div> : null}</dl>
      {mainUnits.length > 1 ? <nav className="tianyi-formal-unit-track" aria-label={t("storyMap.unit")}>
        <button type="button" disabled={activeIndex <= 0} onClick={() => setSelectedUnitId(mainUnits[activeIndex - 1]?.id ?? null)}>{t("storyMap.previous")}</button>
        <button type="button" className="is-current" onClick={() => activeUnit && setSelectedUnitId(activeUnit.id)}>{activeUnit?.title}</button>
        <button type="button" disabled={activeIndex < 0 || activeIndex >= mainUnits.length - 1} onClick={() => setSelectedUnitId(mainUnits[activeIndex + 1]?.id ?? null)}>{t("storyMap.next")}</button>
      </nav> : null}
      <section className="tianyi-formal-node-tree">
        {nodes.length ? <ol className="tianyi-formal-story-tree">{nodes.map((node, index) => {
          const { placement, event, narrativePathId, workVersionId: nodeWorkVersionId } = node;
          const nodeBranches = branchUnits.filter((unit) => unit.branchPointEventId === event.id);
          const isCurrent = event.id === selectedNode?.event.id;
          return <li key={placement.placementId} className={isCurrent ? "is-current" : ""}>
            <div className="tianyi-formal-node-card"><button type="button" className="tianyi-formal-node" aria-current={isCurrent ? "step" : undefined} onClick={() => setSelectedEventId(event.id)}><span>{index + 1}</span><div><small>{t(isCurrent ? "storyMap.node" : "storyMap.past")}</small><strong>{event.title}</strong></div></button>
            <button type="button" className="tianyi-open-nuwa" onClick={() => props.onOpenNuwa({ storyUnitId: placement.storyUnitId, eventId: event.id, narrativePathId, workVersionId: workVersionId ?? nodeWorkVersionId })}>{t("storyMap.nuwa")}</button></div>
            {isCurrent && nodeBranches.length ? <section className="tianyi-formal-future-path" aria-label={t("storyMap.future")}><div className="tianyi-formal-future-connector"><ArrowDown /></div><small>{t("storyMap.boundary")}</small><div className="tianyi-formal-future-directions">{nodeBranches.map((unit) => <div key={unit.id}><GitBranch /><strong>{unit.title}</strong></div>)}</div></section> : null}
          </li>;
        })}</ol> : <p>{t("storyMap.empty")}</p>}
      </section>
    </> : null}
  </section>;
}
