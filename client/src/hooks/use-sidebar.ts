import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'flowguard.sidebar';
const MOBILE_QUERY = '(max-width: 767px)';

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * Whether the sidebar is folded to its rail, remembered per browser.
 *
 * Mirrors `useTheme`: state lives here, the class of consumer is one component,
 * and every storage access is guarded because `localStorage` throws outright
 * in a private window — a folded sidebar is not worth a blank screen.
 */
export function useSidebarCollapsed(): {
  collapsed: boolean;
  toggle: () => void;
  closeMobile: () => void;
} {
  const mobile = useSyncExternalStore(subscribeToViewport, isMobileViewport, () => false);
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
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

  const toggle = useCallback(() => {
    if (mobile) setMobileCollapsed((c) => !c);
    else setCollapsed((c) => !c);
  }, [mobile]);
  const closeMobile = useCallback(() => setMobileCollapsed(true), []);

  // Mobile navigation starts folded without overwriting the desktop preference.
  return { collapsed: mobile ? mobileCollapsed : collapsed, toggle, closeMobile };
}
