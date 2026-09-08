import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'flowguard.sidebar';

/**
 * Whether the sidebar is folded to its rail, remembered per browser.
 *
 * Mirrors `useTheme`: state lives here, the class of consumer is one component,
 * and every storage access is guarded because `localStorage` throws outright
 * in a private window — a folded sidebar is not worth a blank screen.
 */
export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'open');
    } catch {
      // Preference simply will not persist. Not worth surfacing.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  return { collapsed, toggle };
}
