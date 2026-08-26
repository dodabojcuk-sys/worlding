import { useCallback, useRef, useState } from "react";

export function useDocumentHistory<T>(initialValue: T) {
  const [present, setPresent] = useState(initialValue);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);
  const presentRef = useRef(present);
  presentRef.current = present;

  const commit = useCallback((next: T) => {
    if (JSON.stringify(next) === JSON.stringify(presentRef.current)) return;
    setPast((current) => [...current, presentRef.current].slice(-50));
    setPresent(next);
    setFuture([]);
  }, []);

  const reset = useCallback((next: T) => {
    setPresent(next);
    setPast([]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((current) => {
      const previous = current.at(-1);
      if (previous === undefined) return current;
      setFuture((items) => [presentRef.current, ...items].slice(0, 50));
      setPresent(previous);
      return current.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((current) => {
      const next = current[0];
      if (next === undefined) return current;
      setPast((items) => [...items, presentRef.current].slice(-50));
      setPresent(next);
      return current.slice(1);
    });
  }, []);

  return { present, commit, reset, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
