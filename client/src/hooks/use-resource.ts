import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface Resource<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True on the first load and on every reload. */
  loading: boolean;
  /** Refetch from the server. */
  reload: () => void;
  /**
   * Apply a local update without refetching.
   *
   * This is what lets a push event merge into fetched data. Without it every
   * consumer would copy `data` into its own state and sync the two in an
   * effect — two sources of truth for the same list, and a render cascade on
   * every fetch.
   */
  setData: (update: (previous: T | undefined) => T | undefined) => void;
}

/**
 * Fetch-on-mount with abort, error capture, manual reload and local merge.
 *
 * Stands in for a data-fetching library. If TanStack Query is added later this
 * is the seam to replace — every domain hook goes through it.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const [state, setState] = useState<Omit<Resource<T>, 'reload' | 'setData'>>({
    data: undefined,
    error: undefined,
    loading: true,
  });

  const [nonce, setNonce] = useState(0);

  // The loader is kept in a ref so call sites can pass an inline arrow without
  // triggering a refetch on every render. Refetching is driven by `deps` and
  // `nonce` alone, which makes the trigger explicit rather than incidental.
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Synchronising with an external system is exactly what this effect is for;
    // the loading flag has to move when the fetch starts, not before it.
    setState((prev) => (prev.loading ? prev : { ...prev, loading: true }));

    loadRef.current(controller.signal).then(
      (data) => {
        if (!cancelled) setState({ data, error: undefined, loading: false });
      },
      (error: Error) => {
        // An abort is a normal unmount, not a failure worth rendering.
        if (cancelled || controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error, loading: false }));
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
    // A variadic dependency list is the point of a generic resource hook, so
    // the spread cannot be lifted into a named variable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const setData = useCallback(
    (update: (previous: T | undefined) => T | undefined) =>
      setState((prev) => ({ ...prev, data: update(prev.data) })),
    [],
  );

  return { ...state, reload, setData };
}

/**
 * Stable empty array for `resource.data ?? EMPTY`.
 *
 * A fresh `[]` on every render would defeat every downstream useMemo that
 * depends on it.
 */
export const EMPTY: readonly never[] = [];
