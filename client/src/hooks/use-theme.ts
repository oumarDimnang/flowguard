import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'flowguard.theme';

/**
 * Light/dark, persisted per browser.
 *
 * The `dark` class on `<html>` is the single source of truth. index.html sets
 * it from storage before the first paint; `setTheme` changes it and tells every
 * subscriber. So any number of components can read or toggle the theme and
 * stay in step, rather than each holding a copy that drifts.
 *
 * `setTheme` touches the DOM synchronously, which is what lets the animated
 * toggler run it inside a view transition: the browser snapshots the page on
 * either side of the callback, and a class applied later by an effect would
 * land after the second snapshot.
 *
 * Light is the default, deliberately, rather than following
 * `prefers-color-scheme`: the whole product is drawn as a paper record and that
 * is the version every screen was composed against. Dark is a real second
 * palette — see graph.css, where it is not an inversion — but it is opt-in.
 *
 * Every storage access is guarded: private windows and blocked-site-data
 * settings make `localStorage` throw, and a theme preference is not worth a
 * blank screen.
 */
const listeners = new Set<() => void>();

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // Preference simply will not persist. Not worth surfacing.
  }
  for (const listener of listeners) listener();
}

export function useTheme(): { dark: boolean; toggle: () => void } {
  const dark = useSyncExternalStore(subscribe, isDark);
  const toggle = useCallback(() => setTheme(!isDark()), []);
  return { dark, toggle };
}
