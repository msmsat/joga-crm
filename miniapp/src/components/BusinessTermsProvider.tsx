import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getStudioCatalog, type StudioCatalog } from '../api/studio';
import type { Terminology } from '../api/hybrid.types';
import { BusinessTermsContext } from '../hooks/businessTermsContext';
import { getSession } from '../lib/session';

function subscribe(callback: () => void) {
  window.addEventListener('session-changed', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('session-changed', callback);
    window.removeEventListener('storage', callback);
  };
}
const snapshot = () => getSession()?.token ?? '';

export default function BusinessTermsProvider({ catalog, children }: { catalog: StudioCatalog | null; children: ReactNode }) {
  const { i18n } = useTranslation();
  const session = useSyncExternalStore(subscribe, snapshot);
  const studioId = catalog?.studio.id;
  const locale = i18n.language;
  const [loaded, setLoaded] = useState<{ studioId: number; locale: string; session: string; config: Terminology } | null>(null);
  useEffect(() => {
    if (!studioId) return;
    let alive = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        const data = await getStudioCatalog(locale);
        if (alive && request === sequence && snapshot() === session && data.studio.id === studioId) {
          setLoaded({ studioId, locale, session, config: data.terminology });
        }
      } catch { /* Keep the last verified configuration for this context. */ }
    };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = window.setInterval(visible, 60_000);
    window.addEventListener('focus', visible);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', visible); };
  }, [studioId, locale, session, catalog?.booking_capabilities.booking_config_version]);
  const valid = loaded?.studioId === studioId && loaded?.locale === locale && loaded?.session === session;
  return <BusinessTermsContext.Provider value={valid ? loaded!.config : null}>{children}</BusinessTermsContext.Provider>;
}
