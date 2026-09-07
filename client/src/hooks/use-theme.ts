import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'flowguard.theme';

/**
 * Light/dark, persisted per browser.
 *
 * The dark variant is `&:is(.dark *)`, so the class goes on `<html>` — putting
 * it on `<body>` would leave `<body>` itself unstyled.
 *
 * Light is the default, deliberately, rather than following
 * `prefers-color-scheme`: the whole product is drawn as a paper record and that
 * is the version every screen was composed against. Dark is a real second
 * palette — see graph.css, where it is not an inversion — but it is opt-in.
 *
 * Every storage access is guarded: private windows and blocked-site-data
 * settings make `localStorage` throw on read, not just return null, and a
 * theme preference is not worth a blank screen.
 */
export function useTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored === 'dark';
    } catch {
      // Storage unavailable — the preference simply will not persist.
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Preference simply will not persist. Not worth surfacing.
    }
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return { dark, toggle };
}
