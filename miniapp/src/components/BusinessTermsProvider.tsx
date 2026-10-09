import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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

/** Тот же словарь — значит, и тот же объект: новый перерисовал бы всех, кто его читает. */
const sameTerms = (a: Terminology | null | undefined, b: Terminology | null | undefined) =>
  a != null && b != null && JSON.stringify(a) === JSON.stringify(b);

export default function BusinessTermsProvider({ catalog, children }: { catalog: StudioCatalog | null; children: ReactNode }) {
  const { i18n } = useTranslation();
  const session = useSyncExternalStore(subscribe, snapshot);
  const studioId = catalog?.studio.id;
  const locale = i18n.language;
  // Каталог App уже несёт словарь — запрошен на том же языке. Он годится с
  // первого кадра: без него до ответа собственного запроса (ещё один круг до
  // сервера) все слова студии стояли «…» и потом подменялись — вторая
  // перерисовка всего, что их читает, и прыжок текста на глазах.
  const seed = catalog?.terminology?.locale === locale ? catalog.terminology : null;
  const seedRef = useRef(seed);
  useEffect(() => { seedRef.current = seed; }, [seed]);
  // `base` — словарь каталога, поверх которого получен ответ. Пришёл новый
  // каталог (покупка, вход) — его словарь свежее любой прошлой сверки.
  const [loaded, setLoaded] = useState<{
    studioId: number; locale: string; session: string; base: Terminology | null; config: Terminology;
  } | null>(null);
  useEffect(() => {
    if (!studioId) return;
    let alive = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        const data = await getStudioCatalog(locale);
        if (alive && request === sequence && snapshot() === session && data.studio.id === studioId) {
          // Сверка раз в минуту и на каждый возврат фокуса чаще всего
          // приносит тот же словарь. Новый объект с тем же содержимым
          // перерисовывал бы всё приложение — поэтому прежний остаётся.
          setLoaded((prev) => {
            const base = seedRef.current;
            const current = prev?.studioId === studioId && prev.locale === locale && prev.session === session
              && prev.base === base ? prev.config : base;
            if (sameTerms(current, data.terminology)) {
              return prev && prev.config === current ? prev : { studioId, locale, session, base, config: current! };
            }
            return { studioId, locale, session, base, config: data.terminology };
          });
        }
      } catch { /* Keep the last verified configuration for this context. */ }
    };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    // Свежий словарь из каталога — сверять сразу нечего: тот же ответ сервера
    // пришёл только что. Нет его (другой язык) — спрашиваем немедленно.
    if (!seedRef.current) void refresh();
    const timer = window.setInterval(visible, 60_000);
    window.addEventListener('focus', visible);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', visible); };
  }, [studioId, locale, session, catalog?.booking_capabilities.booking_config_version]);
  const valid = loaded?.studioId === studioId && loaded?.locale === locale && loaded?.session === session
    && loaded?.base === seed;
  return <BusinessTermsContext.Provider value={valid ? loaded!.config : seed}>{children}</BusinessTermsContext.Provider>;
}
