import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "../../styles/global-search.css";

import { globalSearchResultId, moveGlobalSearchActiveIndex } from "./globalSearchKeyboard";
import type { GlobalSearchEngine } from "./globalSearchEngine";
import type { GlobalSearchContext, GlobalSearchLabels, GlobalSearchResult, GlobalSearchScope } from "./globalSearchTypes";

const scopes: readonly GlobalSearchScope[] = ["global", "directory", "characters"];

/**
 * Self-contained topbar control for the main Shell thread to mount. Search
 * ownership stays in the injected engine; navigation stays in the caller.
 */
export function GlobalSearchControl(props: {
  engine: GlobalSearchEngine;
  context: GlobalSearchContext;
  labels: GlobalSearchLabels;
  onNavigate(result: GlobalSearchResult): void;
  initialScope?: GlobalSearchScope;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="global-search-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={props.labels.trigger}
      title={props.labels.trigger}
      onClick={() => setOpen(true)}
    >
      <Search aria-hidden="true" />
      <span>{props.labels.trigger}</span>
      <kbd>⌘K</kbd>
    </button>
    {open && <GlobalSearchDialog {...props} initialScope={props.initialScope ?? "global"} onClose={close} />}
  </>;
}

function GlobalSearchDialog(props: {
  engine: GlobalSearchEngine;
  context: GlobalSearchContext;
  labels: GlobalSearchLabels;
  initialScope: GlobalSearchScope;
  onClose(): void;
  onNavigate(result: GlobalSearchResult): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<GlobalSearchScope>(props.initialScope);
  const [results, setResults] = useState<readonly GlobalSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const titleId = useId();

  useEffect(() => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void props.engine.search({ query, scope, context: props.context }).then((next) => {
      if (!current) return;
      setResults(next);
      setActiveIndex(next.length ? 0 : -1);
      setLoading(false);
    }).catch(() => {
      if (!current) return;
      setResults([]);
      setActiveIndex(-1);
      setLoading(false);
    });
    return () => { current = false; };
  }, [props.context, props.engine, query, scope]);

  const activeId = activeIndex >= 0 && results[activeIndex] ? globalSearchResultId(results[activeIndex].id) : undefined;
  const select = (result: GlobalSearchResult) => {
    props.onNavigate(result);
    props.onClose();
  };
  const scopeLabel = (candidate: GlobalSearchScope) => candidate === "global"
    ? props.labels.scopeGlobal
    : candidate === "directory" ? props.labels.scopeDirectory : props.labels.scopeCharacters;
  const countMessage = useMemo(() => loading ? "" : props.labels.resultCount(results.length), [loading, props.labels, results.length]);

  return createPortal(<div className="global-search-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && props.onClose()}>
    <section className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); props.onClose(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setActiveIndex(moveGlobalSearchActiveIndex({ activeIndex, resultCount: results.length }, event.key));
        return;
      }
      if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
        event.preventDefault();
        select(results[activeIndex]);
      }
    }}>
      <header className="global-search-header">
        <Search aria-hidden="true" />
        <label id={titleId} className="shell-visually-hidden" htmlFor="global-search-input">{props.labels.dialogLabel}</label>
        <input ref={inputRef} id="global-search-input" type="search" value={query} placeholder={props.labels.placeholder} aria-controls="global-search-results" aria-activedescendant={activeId} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="global-search-close" aria-label={props.labels.close} title={props.labels.close} onClick={props.onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="global-search-scopes" role="group" aria-label={props.labels.dialogLabel}>
        {scopes.map((candidate) => <button type="button" key={candidate} aria-pressed={scope === candidate} onClick={() => setScope(candidate)}>{scopeLabel(candidate)}</button>)}
      </div>
      <p className="global-search-status" aria-live="polite">{countMessage}</p>
      <div id="global-search-results" className="global-search-results" role="listbox" aria-label={props.labels.dialogLabel}>
        {results.map((result, index) => <button
          type="button"
          role="option"
          id={globalSearchResultId(result.id)}
          key={result.id}
          aria-selected={index === activeIndex}
          className={index === activeIndex ? "is-active" : undefined}
          onMouseMove={() => setActiveIndex(index)}
          onClick={() => select(result)}
        >
          <span className="global-search-result-copy"><strong>{result.title}</strong><small>{result.breadcrumb.join(" / ")}</small></span>
          <span className="global-search-result-meta"><em>{props.labels.resultType[result.type]}</em><small>{result.matchReason}</small></span>
        </button>)}
        {!loading && results.length === 0 && <p className="global-search-empty">{props.labels.noResults}</p>}
      </div>
    </section>
  </div>, document.body);
}
